#!/usr/bin/env python3
"""Build the Roll Corn site.

Reads feeds.json, pulls headlines from each feed, joins them with the headlines the site already
holds, sorts them by sport, and writes every page into public/: the front page, a page for each sport,
the lines, the merch page, the game's page, and the small files a site needs (the list of headlines,
a sitemap, a not-found page). Standard library only.

Run:  python3 build.py

To work on the look without pulling the feeds every time, name a file in ROLLCORN_SNAPSHOT. The first
run saves the headlines there; later runs read them back, with the clock set to when they were saved.
"""
import datetime as dt
import email.utils
import gzip
import hashlib
import html
import http.client
import json
import math
import os
import pathlib
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zlib
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo

import merch

ROOT = pathlib.Path(__file__).resolve().parent
CFG = json.loads((ROOT / "feeds.json").read_text(encoding="utf-8"))
PUBLIC = ROOT / "public"
SITE = CFG["site"]
UA = "RollCornBot/1.0 (+%s)" % SITE["url"]
UTC = dt.timezone.utc
CENTRAL = ZoneInfo("America/Chicago")
NOW = dt.datetime.now(UTC)
OTHER = CFG["other_sport"]["id"]


# ---------- fetching and parsing ----------

def tls_context():
    """Normal certificate checking. Some Mac Python installs ship without a
    certificate list, so fall back to the one macOS keeps on disk."""
    ctx = ssl.create_default_context()
    mac_list = "/etc/ssl/cert.pem"
    if ctx.cert_store_stats()["x509_ca"] == 0 and os.path.exists(mac_list):
        ctx.load_verify_locations(mac_list)
    return ctx


TLS = tls_context()


class QuietConnection(http.client.HTTPSConnection):
    """urllib adds "Connection: close" to every request, and some servers and proxies answer that by
    cutting the page short (seen with three of these feeds from this Mac). Leaving the header off is
    harmless everywhere else."""
    def putheader(self, header, *values):
        if header.lower() != "connection":
            super().putheader(header, *values)


class QuietHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(QuietConnection, req, context=TLS)


OPENER = urllib.request.build_opener(QuietHandler)


def fetch(url, tries=3, limit=60):
    """The bytes at an address. A dropped, slow or cut-off download, or a server having a bad moment, is
    tried again; an answer that says no (404, 403) is final. No download may take more than a minute."""
    headers = {
        "User-Agent": UA,
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "Accept-Encoding": "gzip",
    }
    for attempt in range(tries):
        try:
            started, chunks = time.monotonic(), []
            with OPENER.open(urllib.request.Request(url, headers=headers), timeout=25) as resp:
                while True:
                    if time.monotonic() - started > limit:
                        raise TimeoutError("more than %d seconds" % limit)
                    chunk = resp.read1(65536)            # what has arrived so far, so the clock is looked at often
                    if not chunk:
                        break
                    chunks.append(chunk)
                if getattr(resp, "length", None):        # the server promised more than it sent
                    raise http.client.IncompleteRead(b"".join(chunks), resp.length)
            data = b"".join(chunks)
            return gzip.decompress(data) if data[:2] == b"\x1f\x8b" else data
        except urllib.error.HTTPError as exc:
            if (exc.code < 500 and exc.code != 429) or attempt == tries - 1:
                raise
        except (http.client.HTTPException, OSError, EOFError, zlib.error):   # timeouts, resets, short reads, a cut-off gzip, DNS and TLS trouble
            if attempt == tries - 1:
                raise
        time.sleep(1 + attempt)


def local(tag):
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def child_text(node, name):
    for c in node:
        if local(c.tag) == name and c.text:
            return c.text.strip()
    return ""


def clean(text):
    text = html.unescape(re.sub(r"</?[a-zA-Z][^<>]*>", "", text or ""))
    return re.sub(r"\s+", " ", text).strip()


def parse_date(text):
    if not text:
        return None
    try:
        d = email.utils.parsedate_to_datetime(text)
    except (TypeError, ValueError):
        try:
            d = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=UTC)
    return d.astimezone(UTC)


def parse_feed(data):
    """Yield dicts with title, link, date, categories, source for RSS or Atom."""
    root = ET.fromstring(data.lstrip(b"\xef\xbb\xbf").lstrip())     # a blank line before the XML is no reason to lose a feed
    for node in root.iter():
        kind = local(node.tag)
        if kind not in ("item", "entry"):
            continue
        link = ""
        cats = []
        source = ""
        for c in node:
            name = local(c.tag)
            if name == "link":
                href = c.get("href")
                if href and c.get("rel", "alternate") == "alternate":
                    link = href.strip()
                elif not href and c.text:
                    link = c.text.strip()
            elif name in ("category", "sports"):        # "sports" is what Iowa Athletics' own feed calls it
                cats.append(clean(c.get("term") or c.text or ""))
            elif name == "source":
                source = clean(c.text or "")
        date = (child_text(node, "pubdate") or child_text(node, "published")
                or child_text(node, "updated") or child_text(node, "date"))
        yield {
            "title": clean(child_text(node, "title")),
            "link": link,
            "date": parse_date(date),
            "cats": cats,
            "source": source,
        }


# ---------- sorting into sports ----------

def norm(text):
    return text.lower().replace("’", "'").replace("‘", "'")


def holds(hay, key):
    """A keyword matches where a word starts with it: "wrestl" finds wrestling and wrestler, "brands"
    does not find rebrands, and "men's basketball" is not found inside "women's basketball".
    "women + basketball" needs both words, in either order."""
    return all(re.search(r"(?<![a-z0-9])" + re.escape(part.strip()), hay) for part in key.split("+"))


def pick_sport(title, cats, fallback, link=""):
    """Which sport a headline belongs to. In order: a sport named in the headline ("keywords"); one named
    in the story's own address; the sport the feed files it under; a telling name in the headline, such
    as a coach ("hints"); a sport's bare name ("plain": "basketball"), unless the search the story came
    from was for a sport of that name; the sport that was searched for; and last a word that only
    suggests a sport ("loose": the arena). A sport can list words that rule it out ("not_if")."""
    hay_title, hay_cats = norm(title), norm(" | ".join(cats))
    try:
        path = urllib.parse.urlsplit(link).path
    except ValueError:                               # an address this badly formed tells nothing; the story is still sorted
        path = ""
    hay_link = re.sub(r"[-_/]+", " ", path.lower())
    searched = next((s for s in CFG["sports"] if s["id"] == fallback), {})

    def find(hay, field, other_name=False):
        for sport in CFG["sports"]:
            if any(holds(hay_title, k) for k in sport.get("not_if", [])):
                continue
            for k in sport.get(field, []):
                # "Iowa basketball lands a guard", found by the football search, is basketball; found by
                # the women's basketball search it is left to that search
                if holds(hay, k) and not (other_name and any(k in own for own in searched.get("keywords", []))):
                    return sport["id"]
        return None

    return (find(hay_title, "keywords") or find(hay_link, "keywords") or find(hay_cats, "keywords")
            or find(hay_title, "hints") or find(hay_title, "plain", other_name=True) or fallback
            or find(hay_title, "loose") or find(hay_cats, "plain") or find(hay_cats, "loose") or OTHER)


def about_another_school(title):
    """True when a headline names Iowa State or another school and, with that
    name removed, says nothing about Iowa. A rivalry story such as
    "Iowa vs. Iowa State" still mentions Iowa on its own, so it stays."""
    text = title.replace("\u2019", "'")
    # as a name is written, or in capitals: "Iowa State", not "an Iowa state champion"
    others = [form for o in CFG.get("other_schools", []) for form in (o, o.upper())]
    if not any(o in text for o in others):
        return False
    for o in sorted(others, key=len, reverse=True):
        text = text.replace(o, " ")
    return not says_iowa(text)


ABOUT_IOWA = re.compile(r"\b(?:%s)" % "|".join(re.escape(w) for w in CFG.get("iowa_words", ["iowa", "hawkeye"])))
# Letters no newsroom sets a headline in: the mathematical alphabets and the full-width forms that
# live-stream spam is written in to get past filters.
ODD_LETTERS = re.compile("[\U0001D400-\U0001D7FF\uFF01-\uFF5E]")


def says_iowa(title):
    return bool(ABOUT_IOWA.search(norm(title)))


def belongs(feed, title, link):
    """Whether a story from this feed is the site's to carry. A feed marked "all_iowa" is taken whole.
    Any other has to show the story is about Iowa: in the headline, or by an address under the path the
    feed names in "iowa_link"; and it must not be about another school alone. Spam is never carried."""
    if ODD_LETTERS.search(title):
        return False
    if feed.get("all_iowa"):
        return True
    if not (says_iowa(title) or (feed.get("iowa_link") and feed["iowa_link"] in link)):
        return False
    return not about_another_school(title)


def feed_key(feed):
    return feed.get("name") or "search: " + feed["google_news"]


def story_key(title):
    """What makes two headlines the same story when they arrive by two routes."""
    return re.sub(r"[^a-z0-9]", "", norm(title))[:60]


def on_topic(it):
    """Fit for the front page: it came from a feed that carries nothing but Iowa, or its headline says
    it is about Iowa."""
    return it["ours"] or says_iowa(it["title"])


def load(feed):
    """One feed's stories, or None when it could not be read. Searches of Google News turn up plenty that
    only mention Iowa in passing, so everything goes through belongs()."""
    if "google_news" in feed:
        def address(days):
            q = urllib.parse.quote_plus(feed["google_news"] + " when:%dd" % days)
            return "https://news.google.com/rss/search?q=%s&hl=en-US&gl=US&ceid=US:en" % q
        url, label = address(CFG["days_to_keep"]), "Google News: " + feed["google_news"]
    else:
        url, label = feed["url"], feed["name"]
    try:
        raw = list(parse_feed(fetch(url)))
        if "google_news" in feed and len(raw) >= 100:
            # Google sends at most a hundred, and not the newest first, so a busy sport's latest can be
            # missing. Ask again for the past two days alone; the same story twice is sorted out later.
            try:
                raw += list(parse_feed(fetch(address(2))))
            except Exception as exc:
                print("  %s, past two days: %s" % (label, exc), file=sys.stderr)
    except Exception as exc:  # one bad feed must not stop the build
        print("  skipped %-45s %s" % (label, exc), file=sys.stderr)
        print("::warning title=Feed skipped::%s: %s" % (label, exc))       # shows on the run's page on GitHub
        return None
    items = []
    for it in raw:
        if not (it["title"] and re.match(r"https?://", it["link"]) and it["date"]):
            continue
        source = feed.get("name") or it["source"]
        if not source:
            continue
        # Google News appends " - Source name" to every title
        if "google_news" in feed and it["title"].endswith(" - " + source):
            it["title"] = it["title"][: -len(" - " + source)].strip()
        if not it["title"] or source in CFG.get("skip_sources", []):
            continue
        if not belongs(feed, it["title"], it["link"]):
            continue
        items.append({
            "title": it["title"],
            "link": it["link"],
            "date": it["date"],
            "source": source,
            "sport": pick_sport(it["title"], it["cats"], feed.get("sport"), "" if "google_news" in feed else it["link"]),
            "direct": "google_news" not in feed,
            "ours": bool(feed.get("all_iowa")),
            "feed": feed_key(feed),
        })
    print("  %3d  %s" % (len(items), label), file=sys.stderr)
    return items


def gather():
    """Every feed's stories, newest first, each story once. Also how many feeds could not be read."""
    with ThreadPoolExecutor(max_workers=6) as pool:
        batches = list(pool.map(load, CFG["feeds"]))
    missing = sum(1 for batch in batches if batch is None)
    items = [it for batch in batches if batch for it in batch]
    cutoff = NOW - dt.timedelta(days=CFG["days_to_keep"])
    items = [it for it in items if cutoff <= it["date"] <= NOW + dt.timedelta(hours=1)]
    # direct feeds win over Google News copies of the same story
    items.sort(key=lambda it: (not it["direct"], -it["date"].timestamp()))
    seen, unique = set(), []
    for it in items:
        key = story_key(it["title"]) or it["link"]
        if key in seen:
            continue
        seen.add(key)
        unique.append(it)
    unique.sort(key=lambda it: it["date"], reverse=True)
    return unique, missing, len(batches)


# ---------- what the site already holds ----------
#
# A feed lists only its newest stories (one of them, nine hours' worth), and a search of Google News
# returns a different hundred each time. So the build does not start from nothing: it reads back the
# list of headlines the site published last time (public/headlines.json, which is also what the search
# box reads) and joins it with the fresh pull. A story stays for its full fourteen days, a feed that
# fails keeps the stories it had, and each story carries the time this site first held it, which is
# what "new since your last visit" is counted from.

MEMORY = PUBLIC / "headlines.json"


def recall():
    """The rows of the last published list, and how the reading went: "ok", "none" (no list exists yet:
    the first build) or "lost" (there may be one, but it could not be read)."""
    state = "none"
    for read in (lambda: fetch(SITE["url"] + "/headlines.json"), lambda: MEMORY.read_bytes()):
        try:
            rows = json.loads(read())
            if isinstance(rows, list):
                return rows, "ok"
            state = "lost"
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                state = "lost"
        except FileNotFoundError:
            pass
        except Exception:
            state = "lost"
    return [], state


def remember(fresh, rows, state):
    """The fresh stories joined with the held ones that are still wanted: inside the fourteen days, from
    a feed that is still listed, and passing the rules as they stand today. Every story gets "seen", the
    moment this site first held it."""
    cutoff, soon = NOW - dt.timedelta(days=CFG["days_to_keep"]), NOW + dt.timedelta(hours=1)
    feeds = {feed_key(f): f for f in CFG["feeds"]}
    held = {}
    for row in rows:
        if not (isinstance(row, list) and len(row) >= 9 and all(isinstance(v, str) for v in row[:6] + row[8:9])):
            continue                                 # a row from an older shape of the file, or a damaged one
        title, link, source, _, when, sport, seen, _, key = row[:9]
        date = parse_date(when)
        if not (title and re.match(r"https?://", link) and date and isinstance(seen, (int, float)) and math.isfinite(seen)):
            continue
        held.setdefault(story_key(title) or link, {"title": title, "link": link, "source": source, "date": date,
                                                   "sport": sport if sport in SPORT_NAMES else OTHER, "seen": int(seen), "feed": key})
    now = int(NOW.timestamp())
    by_link = {it["link"]: it for it in held.values()}
    out, keys, links = [], set(), set()
    for it in fresh:
        key = story_key(it["title"]) or it["link"]
        before = held.get(key) or by_link.get(it["link"])          # the same story, even if its headline was rewritten
        # Never seen before: it is new now, if the old list could be read. If it could not, nobody can
        # say what is new, and calling everything new would be wrong, so the story's own date stands in.
        it["seen"] = min(now, before["seen"] if before else now if state == "ok" else int(it["date"].timestamp()))
        out.append(it)
        keys.add(key)
        links.add(it["link"])
    for key, it in held.items():
        feed = feeds.get(it["feed"])
        if key in keys or it["link"] in links or not feed or not (cutoff <= it["date"] <= soon):
            continue
        if it["source"] in CFG.get("skip_sources", []) or not belongs(feed, it["title"], it["link"]):
            continue
        it["direct"], it["ours"] = "google_news" not in feed, bool(feed.get("all_iowa"))
        it["seen"] = min(now, it["seen"])
        out.append(it)
    out.sort(key=lambda it: it["date"], reverse=True)
    return out


def memory_rows(items):
    """The list as it is written: one row a story. The search box reads the first five and the seventh."""
    return [[it["title"], it["link"], it["source"], SPORT_NAMES.get(it["sport"], ""), iso(it["date"]), it["sport"], it["seen"],
             (1 if it["direct"] else 0) + (2 if it["ours"] else 0), it["feed"]] for it in items]


def snapshot():
    """Every headline for this build: pulled fresh and joined with what the site already held, or read
    from the file named in ROLLCORN_SNAPSHOT (see the top of this file)."""
    global NOW
    name = os.environ.get("ROLLCORN_SNAPSHOT", "").strip()
    path = pathlib.Path(name) if name else None
    if path and path.exists():
        saved = json.loads(path.read_text(encoding="utf-8"))
        NOW = dt.datetime.fromisoformat(saved["now"])
        print("Using the headlines saved in %s." % path, file=sys.stderr)
        return [dict(it, date=dt.datetime.fromisoformat(it["date"])) for it in saved["items"]]
    print("Pulling feeds\u2026", file=sys.stderr)
    fresh, missing, feeds = gather()
    rows, state = recall()
    items = remember(fresh, rows, state)
    print("  %d fresh, %d held from before, %d in all" % (len(fresh), len(items) - len(fresh), len(items)), file=sys.stderr)
    if len(items) < 5:
        # keep the last good site rather than publish an empty one
        sys.exit("Only %d headlines found; leaving the existing site alone." % len(items))
    if missing * 3 > feeds and state != "ok":
        # with this much missing and nothing held to fill in, a sport in season would read as quiet
        sys.exit("%d of %d feeds could not be read, and there is no earlier list to fill in from; leaving the existing site alone." % (missing, feeds))
    if path:
        path.write_text(json.dumps({"now": NOW.isoformat(), "items": [dict(it, date=it["date"].isoformat()) for it in items]}),
                        encoding="utf-8")
    return items


# ---------- the top story: what several outlets are writing about at once ----------

COMMON = set("""a an and are as at be but by for from has have he her his how in into is it its of on or that the their them they
this to was were what when where which who why will with after before over out up about amid ahead than then more most new says
say said can could vs not you your we our us one two three first week game games team season year day today tonight news latest
report reports watch video photos live update updates preview recap notes here iowa hawkeye hawk football basketball volleyball
wrestling baseball softball women men womens mens college big ten ncaa sport sports talk""".split())


def terms(title):
    """The words of a headline that say what it is about, and each pair of neighbours among them."""
    seq = []
    for w in re.findall(r"[a-z0-9]+(?:'[a-z]+)?", norm(title).replace("college football playoff", "cfp")):
        w = re.sub(r"'s$", "", w).replace("'", "")
        if w.isdigit() or len(w) < 3:
            continue
        if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        if w not in COMMON:
            seq.append(w)
    return set(seq) | {a + " " + b for a, b in zip(seq, seq[1:])}


REGULARS = set()                       # the outlets most of the site's headlines come from; render() fills it


def trusted(it):
    """Fit to speak for a story at the top of a page: an outlet's own feed, or an outlet the site carries
    often. A one-off source turned up by a search can be listed, but it does not lead."""
    return it["direct"] or it["source"] in REGULARS


def story_groups(items, hours=48, half=18.0, need=10.0):
    """Headlines from the past two days gathered into stories. Two headlines match when the words they
    share are rare enough, taken together, to be no accident. A story is one headline and the headlines
    that match it; its score is the number of different outlets among them, with newer coverage counting
    for more."""
    recent = [it for it in items if (NOW - it["date"]).total_seconds() <= hours * 3600]
    words, seen = {}, {}
    for it in recent:
        words[id(it)] = terms(it["title"])
        for w in words[id(it)]:
            seen[w] = seen.get(w, 0) + 1
    weight = {w: math.log(1 + len(recent) / n) for w, n in seen.items()}

    def match(a, b):
        return sum(weight[w] for w in words[id(a)] & words[id(b)]) >= need

    # First the loose bundles: a headline joins the bundle that holds its best match.
    bundles = []
    for it in sorted(recent, key=lambda it: it["date"]):
        best, home = 0.0, None
        for b in bundles:
            for other in b:
                strength = sum(weight[w] for w in words[id(it)] & words[id(other)])
                if strength >= need and strength > best:
                    best, home = strength, b
        if home is None:
            bundles.append([it])
        else:
            home.append(it)
    # A bundle can chain two stories together through a shared name (a coach's two press conferences).
    # So each is split around the headline the most outlets match directly; whatever does not match that
    # one is a story of its own.
    stories = []
    for bundle in bundles:
        left = sorted(bundle, key=lambda it: it["date"], reverse=True)
        while left:
            near = {id(c): [m for m in left if m is c or match(c, m)] for c in left}
            reach = {id(c): len({m["source"] for m in near[id(c)]}) for c in left}
            most = max(reach.values())
            best = [c for c in left if reach[id(c)] == most]                 # still newest first
            # the newest of them speaks for the story, unless an outlet's own feed has one nearly as new
            face = (next((c for c in best if c["direct"] and (best[0]["date"] - c["date"]).total_seconds() <= 6 * 3600), None)
                    or next((c for c in best if trusted(c)), best[0]))
            core, by_source = near[id(face)], {}
            for it in core:
                age = (NOW - it["date"]).total_seconds() / 3600
                by_source[it["source"]] = max(by_source.get(it["source"], 0.0), math.exp(-age / half))
            stories.append({"face": face, "items": core, "sources": len(by_source), "score": sum(by_source.values())})
            taken = {id(it) for it in core}
            left = [it for it in left if id(it) not in taken]
    return sorted(stories, key=lambda g: g["score"], reverse=True)


def front(items, runners=3):
    """The story to lead with, the other outlets on it, the next few stories, and everything used up.
    The lead is the story the most outlets are on right now; when no story has more than one outlet,
    it is simply the newest headline."""
    pool = [it for it in items if on_topic(it)] or list(items)
    groups = story_groups(pool)
    big = (next((g for g in groups if g["sources"] >= 3 and g["score"] >= 1), None)
           or next((g for g in groups if g["sources"] >= 2 and g["score"] >= 1), None))
    used, also = set(), []
    if big:
        lead, named = big["face"], {big["face"]["source"]}
        for it in big["items"]:
            if it["source"] not in named:
                named.add(it["source"])
                also.append(it)
        used.update(id(it) for it in big["items"])
    else:
        lead = next((it for it in pool if trusted(it)), pool[0])
        used.add(id(lead))
    picks = []
    for g in groups:                                         # then the stories two or more outlets share
        if len(picks) >= runners:
            break
        if g["sources"] >= 2 and g["score"] >= 0.5 and not any(id(it) in used for it in g["items"]):
            picks.append(g["face"])
            used.update(id(it) for it in g["items"])
    for it in pool:                                          # then simply the newest
        if len(picks) >= runners:
            break
        if id(it) not in used:
            picks.append(it)
            used.add(id(it))
    return {"lead": lead, "also": also, "covered": bool(big), "runners": picks, "used": used}


# ---------- pieces of a page ----------

def esc(text):
    return html.escape(str(text), quote=True)


def iso(d):
    return d.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def stamp(d, short=False, seen=None):
    """A <time> tag. The page's script rewrites the text as "3 hours ago" (or "3h" when short); the text
    here is what shows without scripts. `seen` is when the site first held the story, which is what makes
    a story new to a reader; it is written in whenever it is not the story's own time."""
    local_d = d.astimezone(CENTRAL)
    late = ' data-seen="%d"' % seen if seen and int(seen) != int(d.timestamp()) else ""
    if short:
        same_day = local_d.date() == NOW.astimezone(CENTRAL).date()
        text = local_d.strftime("%-I:%M %p" if same_day else "%b %-d")
        return '<time class="when" data-short datetime="%s"%s>%s</time>' % (iso(d), late, text)
    text = local_d.strftime("%b %-d, %-I:%M %p CT")           # says its zone: this is all a reader without scripts gets
    return '<time datetime="%s"%s>%s</time>' % (iso(d), late, text)


def site_sports():
    """Every sport with a page, in a fan's order rather than keyword-matching order."""
    order = ["football", "mens-basketball", "womens-basketball", "wrestling", "volleyball", "baseball", "softball", OTHER]
    sports = CFG["sports"] + [CFG["other_sport"]]
    return sorted(sports, key=lambda s: order.index(s["id"]) if s["id"] in order else len(order))


SPORT_NAMES = {s["id"]: s["name"] for s in CFG["sports"] + [CFG["other_sport"]]}
# Each sport's own field, as a line drawing (the symbols are in template.html).
TURF = {"football": "football", "mens-basketball": "basketball", "womens-basketball": "basketball", "wrestling": "wrestling",
        "volleyball": "volleyball", "baseball": "diamond", "softball": "diamond", OTHER: "track", "game": "uprights"}


def turf(key):
    name = TURF.get(key)
    return '<svg class="turf" aria-hidden="true" focusable="false"><use href="#turf-%s"/></svg>' % name if name else ""


def story(it, tag="li", cls="story", kicker=False):
    return (
        '<{t} class="{cls}">{kick}<a href="{href}" rel="noopener">{title}</a>'
        '<p class="from"><span class="source">{src}</span> {when}</p></{t}>'
    ).format(t=tag, cls=cls, href=esc(it["link"]), title=esc(it["title"]),
             kick='<p class="kicker">%s</p>' % esc(SPORT_NAMES.get(it["sport"], "Iowa")) if kicker else "",
             src=esc(it["source"]), when=stamp(it["date"], seen=it.get("seen")))


def lead_story(it, also=(), covered=False, kicker=True):
    """The story on the black card. When several outlets are on it, the others are named under it."""
    others = ""
    if also:
        others = '<p class="also">Also on this story: %s</p>' % ", ".join(
            '<a href="%s" rel="noopener" title="%s">%s</a>' % (esc(o["link"]), esc(o["title"]), esc(o["source"])) for o in also[:4])
    return (
        '<article class="story lead">{art}<p class="kicker"><span class="tag">{tag}</span>{sport}</p>'
        '<a href="{href}" rel="noopener">{title}</a>'
        '<p class="from"><span class="source">{src}</span> {when}</p>{others}</article>'
    ).format(art=turf(it["sport"]), tag="Top story" if covered else "Latest",
             sport=" " + esc(SPORT_NAMES.get(it["sport"], "Iowa")) if kicker else "",
             href=esc(it["link"]), title=esc(it["title"]), src=esc(it["source"]), when=stamp(it["date"], seen=it.get("seen")), others=others)


def brief(it, hidden=False):
    """One line of the Latest column: how long ago, then the headline."""
    return (
        '<li class="brief" data-sport="{sport}"{hidden}>{when}<div><a href="{href}" rel="noopener">{title}</a>'
        '<p class="from"><span class="source">{src}</span></p></div></li>'
    ).format(href=esc(it["link"]), title=esc(it["title"]), sport=esc(it["sport"]), hidden=" hidden" if hidden else "",
             src=esc(it["source"]), when=stamp(it["date"], short=True, seen=it.get("seen")))


def plural(n, one, many):
    return "%d %s" % (n, one if n == 1 else many)


# ---------- the lines: betting odds for the next games ----------
#
# Lines come from The Odds API (the-odds-api.com). The key is read from the ODDS_API_KEY environment
# variable, which the GitHub workflow fills from a repository secret; it is never written to the page.
# The free plan allows 500 credits a month and a request for three markets costs three, so the lines
# are fetched at most every fourteen hours and kept in public/odds.json between builds. Each build
# starts from the copy of that file on the live site.

IOWA = "Iowa Hawkeyes"
ODDS_API = "https://api.the-odds-api.com/v4/sports/"
ODDS_SPORTS = [("Football", "americanfootball_ncaaf"),
               ("Men's basketball", "basketball_ncaab"),
               ("Women's basketball", "basketball_wncaab"),
               ("Baseball", "baseball_ncaa")]
ODDS_IDS = {"Football": "football", "Men's basketball": "mens-basketball", "Women's basketball": "womens-basketball", "Baseball": "baseball"}
STARTS = {"Football": "Kickoff", "Men's basketball": "Tip-off", "Women's basketball": "Tip-off", "Baseball": "First pitch"}
ODDS_VERSION = 4                       # raise this when the saved shape changes, so the next build fetches afresh
ODDS_BOOKS = ["draftkings", "fanduel", "betmgm", "williamhill_us", "espnbet"]     # first one with a line wins
ODDS_EVERY = dt.timedelta(hours=14)
ODDS_RETRY = dt.timedelta(hours=3)     # how soon to try again when part of a fetch failed
ODDS_FILE = PUBLIC / "odds.json"
UNDERWAY = dt.timedelta(hours=4)       # how long a game stays on the strip after it starts


def signed(n, digits=False):
    """+260, -325, +8.5, or PK for a game with no favorite."""
    if n is None:
        return "–"
    n = float(n)
    if digits and n == 0:
        return "PK"
    return ("%+.1f" % n).replace(".0", "") if digits else "%+d" % round(n)


def odds_get(path, key, tries=2, **params):
    params["apiKey"] = key
    try:
        return json.loads(fetch(ODDS_API + path + "?" + urllib.parse.urlencode(params), tries=tries))
    except Exception as exc:
        # never let the address, which carries the key, reach the build log
        raise RuntimeError("%s: %s" % (path.split("/")[0], type(exc).__name__ + " " + str(getattr(exc, "code", "")))) from None


def upcoming(label, sport, key, before=()):
    """Iowa's next games in one sport. Each carries the line of the first sportsbook to post a spread, or
    no numbers at all when no book has one yet: college basketball lines often appear only the day before.
    `before` is what was saved last time: if the lines cannot be fetched now, a game keeps the line it had.
    Returns the games, and whether everything that was asked for came back."""
    until = NOW + dt.timedelta(days=14)
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    events = odds_get(sport + "/events", key, commenceTimeFrom=NOW.strftime(fmt), commenceTimeTo=until.strftime(fmt))   # free
    if not isinstance(events, list):
        raise RuntimeError("%s: the service did not send a list of games" % sport)
    mine = sorted((e for e in events if IOWA in (e.get("home_team"), e.get("away_team"))), key=lambda e: e["commence_time"])[:3]
    # say in the build log what the service had, so an empty board can be explained
    near = sorted({t for e in events for t in (e.get("home_team") or "", e.get("away_team") or "") if "Iowa" in t})
    print("  odds: %s: %d games listed in the next two weeks, %d for %s; teams with Iowa in the name: %s" % (
        label, len(events), len(mine), IOWA, ", ".join(near) or "none"), file=sys.stderr)
    if not mine:
        return [], True
    priced, kept = {}, None
    try:
        data = odds_get(sport + "/odds", key, tries=1, regions="us", markets="h2h,spreads,totals", oddsFormat="american",
                        eventIds=",".join(e["id"] for e in mine))            # three credits, so asked once: a slow answer may still be charged
        priced = {e["id"]: e for e in data}
    except Exception as exc:                         # the schedule is still worth showing, with the lines it last had
        print("  odds: %s lines: %s" % (label, exc), file=sys.stderr)
        kept = {game_key(g): g for g in before}
    games = []
    for ev in mine:
        books = {bk["key"]: bk for bk in priced.get(ev["id"], {}).get("bookmakers", [])}
        listed = [books[k] for k in ODDS_BOOKS if k in books] + [bk for k, bk in books.items() if k not in ODDS_BOOKS]
        has = lambda bk, market: any(m["key"] == market and m.get("outcomes") for m in bk.get("markets", []))
        book = (next((bk for bk in listed if has(bk, "spreads")), None)
                or next((bk for bk in listed if bk.get("markets")), None) or {"markets": []})
        markets = {m["key"]: {o["name"]: o for o in m["outcomes"]} for m in book["markets"]}
        rows = []
        for side, team in (("away", ev["away_team"]), ("home", ev["home_team"])):
            spread = markets.get("spreads", {}).get(team, {})
            total = markets.get("totals", {}).get("Over" if side == "away" else "Under", {})
            rows.append({
                "name": "Iowa" if team == IOWA else team, "iowa": team == IOWA,
                "spread": spread.get("point"), "spread_price": spread.get("price"),
                "money": markets.get("h2h", {}).get(team, {}).get("price"),
                "total": ("O " if side == "away" else "U ") + "%g" % total["point"] if total.get("point") is not None else None,
                "total_price": total.get("price"),
            })
        game = {"sport": label, "when": ev["commence_time"], "rows": rows, "book": book.get("title", "")}
        games.append(kept.get(game_key(game), game) if kept is not None else game)
    return games, kept is None


def game_key(g):
    return (g["sport"], g["when"], g["rows"][0]["name"], g["rows"][1]["name"])


def iowa_line(g):
    """Iowa's spread and the game's total as they stand, or None when nothing is posted."""
    iowa = next((r for r in g["rows"] if r["iowa"]), None)
    total = (g["rows"][0]["total"] or "")[2:]
    if not iowa or (iowa["spread"] is None and not total):
        return None
    return {"spread": iowa["spread"], "total": total}


def remember_open(games, old):
    """Keep the first line this site saw for each game, so the board can say which way it has moved."""
    was = {game_key(g): g for g in old}
    for g in games:
        before = was.get(game_key(g), {})
        g["open"] = before.get("open") or iowa_line(before) if before else None
        if not g["open"]:
            g["open"] = iowa_line(g)


def load_odds():
    """The games to show, when their lines were checked, and whether the saved lines were there but
    could not be read. The lines are fresh from the service if the saved copy is old, else the saved
    copy. Games that have just started stay for a few hours, marked as underway."""
    saved, checked, lost = None, None, False
    for read in (lambda: fetch(SITE["url"] + "/odds.json"), lambda: ODDS_FILE.read_bytes()):
        try:
            got = json.loads(read())
            if not isinstance(got.get("games"), list):
                raise ValueError("no games")
            at = dt.datetime.fromisoformat(got["at"])
            saved, checked = got, at if at.tzinfo else at.replace(tzinfo=UTC)
            break
        except urllib.error.HTTPError as exc:
            lost = lost or exc.code != 404           # "not there" is an answer; anything else is no answer at all
        except FileNotFoundError:
            pass
        except Exception:
            lost = True
    key = os.environ.get("ODDS_API_KEY", "").strip()
    try:                                             # after a fetch that partly failed, the time to try again
        again = dt.datetime.fromisoformat(saved["retry"])
        again = again if again.tzinfo else again.replace(tzinfo=UTC)
    except (KeyError, TypeError, ValueError):
        again = None
    # When a fetch partly failed, the time it set for the next try decides; otherwise the fourteen hours do.
    due = not saved or saved.get("v") != ODDS_VERSION or (NOW >= again if again else NOW - checked >= ODDS_EVERY)
    if key and not saved and lost:
        # The saved copy could not be read, which is not the same as there being none. Buying fresh
        # lines on every build until it can be read would use up the month's credits in a day.
        print("  odds: the saved lines could not be read; not fetching new ones this time.", file=sys.stderr)
    elif key and due:
        old = [g for g in (saved or {}).get("games", []) if isinstance(g, dict) and len(g.get("rows", [])) == 2]
        games, failed, stale = [], 0, False
        for label, sport in ODDS_SPORTS:
            mine = [g for g in old if g.get("sport") == label]
            try:
                got, complete = upcoming(label, sport, key, mine)
                games += got
                stale = stale or not complete        # its lines could not be fetched: the games kept the numbers they had
            except Exception as exc:                 # one sport failing should not cost the others, or its own saved games
                failed += 1
                games += mine
                stale = stale or bool(mine)
                print("  odds: %s" % exc, file=sys.stderr)
        if failed < len(ODDS_SPORTS):                # all failing means no credits or no service: keep what we had
            remember_open(games, old)
            listed = {game_key(g) for g in games}
            fmt = "%Y-%m-%dT%H:%M:%SZ"               # the service drops a game at kickoff; keep it while it is being played
            games += [g for g in old if (NOW - UNDERWAY).strftime(fmt) < g.get("when", "") <= NOW.strftime(fmt) and game_key(g) not in listed]
            if not stale:                            # every number on the board is from this fetch
                checked = NOW
            checked = checked or NOW                 # otherwise the board goes on saying when it was last checked in full
            saved = {"v": ODDS_VERSION, "at": checked.isoformat(), "games": games}
            if failed or stale:
                # Something failed. It gets one early second try; if that fails too, the usual wait comes
                # back, so a sport that goes on failing does not buy every other sport's lines again
                # every few hours.
                saved["retry"] = (NOW + (ODDS_EVERY if again else ODDS_RETRY)).isoformat()
    elif not key and not saved:
        print("  odds: no ODDS_API_KEY set and no saved lines; the board will be empty.", file=sys.stderr)
    if saved:
        ODDS_FILE.write_text(json.dumps(saved), encoding="utf-8")
    games = []
    for g in (saved or {}).get("games", []):
        try:
            when = dt.datetime.fromisoformat(g["when"].replace("Z", "+00:00"))
            if len(g["rows"]) == 2 and when > NOW - UNDERWAY:
                games.append(dict(g, when=when))
        except (KeyError, TypeError, ValueError, AttributeError):
            continue                                 # a saved game this code cannot read is left out, not fatal
    return sorted(games, key=lambda g: g["when"]), checked, lost and not saved


def implied(money):
    """The chance a moneyline implies, before the sportsbook's cut is taken out."""
    money = float(money)
    return -money / (-money + 100) if money < 0 else 100 / (money + 100)


def kick_text(when, brief=False):
    """A game's start as the page says it before the script puts it in the reader's own time zone. A tile
    on the strip has room for the day and the hour only; the date is given once the game is a week off."""
    at = when.astimezone(CENTRAL)
    hour = at.strftime("%I:%M %p").lstrip("0")
    if brief:
        return "%s, %s CT" % (at.strftime("%a") if when - NOW < dt.timedelta(days=6) else "%s %d" % (at.strftime("%b"), at.day), hour)
    return "%s %d, %s CT" % (at.strftime("%a, %b"), at.day, hour)


def game_read(g):
    """One plain sentence for a game: who is favored and by how much, and whether the line has moved."""
    away, home = g["rows"]
    priced = any(r["spread"] is not None or r["money"] is not None for r in g["rows"])
    spreads = [r for r in g["rows"] if r["spread"] is not None]
    total = (away["total"] or "")[2:]
    if not priced and not total:
        return "No line posted yet. Sportsbooks usually put college lines up a day or two before the game.", priced, total
    if not spreads:
        text = "No spread posted yet."
    else:
        fav = min(spreads, key=lambda r: r["spread"])
        dog = home if fav is away else away
        if fav["spread"] == 0:
            text = "A pick’em: no favorite."
        else:
            text = "%s favored by %g over %s." % (fav["name"], abs(fav["spread"]), dog["name"])
            first, iowa = g.get("open") or {}, next((r for r in g["rows"] if r["iowa"]), None)
            if iowa and iowa["spread"] is not None and first.get("spread") not in (None, iowa["spread"]):
                was = first["spread"]
                text += " Iowa was %s when this line was first seen here." % (signed(was, True) if was else "a pick’em")
    if total:
        text += " Total %s expected: %s." % ("runs" if g["sport"] == "Baseball" else "points", total)
    return text, priced, total


def price(n):
    """The price of a bet, under its number. The word is there for a screen reader; the eye has the layout."""
    return '<span class="visually-hidden">price </span>%s' % signed(n) if n is not None else ""


def team(row):
    """A team's name. Iowa is picked out by a small gold mark, never by dressing the name itself in gold."""
    return '<span class="is-iowa">%s</span>' % esc(row["name"]) if row["iowa"] else "<span>%s</span>" % esc(row["name"])


def short_read(g):
    """The line in a few words, for a tile: "Iowa by 8.5"."""
    spreads = [r for r in g["rows"] if r["spread"] is not None]
    if not spreads:                                  # a moneyline or a total can be up before any spread is
        return "Line posted" if any(r["money"] is not None or r["total"] for r in g["rows"]) else "No line yet"
    fav = min(spreads, key=lambda r: r["spread"])
    return "Pick’em" if fav["spread"] == 0 else "%s by %g" % (fav["name"], abs(fav["spread"]))


def odds_parts(games, checked, sport=None, limit=None, more=False, lost=False):
    """The Lines card and the Next up strip. `sport` keeps one sport's games (and returns nothing if it
    has none), `limit` keeps the first few, and `more` adds a link through to the full board. `lost`
    says the saved lines could not be read this time, which is not the same as there being none."""
    if sport:
        games = [g for g in games if ODDS_IDS.get(g["sport"]) == sport]
        if not games:
            return "", ""
    ahead = [g for g in games if g["when"] > NOW]            # the board is for games still to come
    if limit:
        ahead = ahead[:limit]
    if sport and not ahead:
        return "", ""
    cards, scores = [], []
    for g in games:
        away, home = g["rows"]
        read, priced, total = game_read(g)
        kick = kick_text(g["when"])
        # the game as one tile on the strip: who, when, the line in words, and a clock running down to it
        scores.append(
            '<a class="score" href="odds.html"><span class="score-top"><b>%s</b><span data-kick="%s" data-brief>%s</span></span>'
            '<span class="score-teams">%s <i>at</i> %s</span>'
            '<span class="score-foot"><span>%s</span><span class="score-clock">%s <b data-count="%s"></b></span></span></a>' % (
                esc(g["sport"]), iso(g["when"]), esc(kick_text(g["when"], brief=True)), team(away), team(home),
                esc(short_read(g)), esc(STARTS.get(g["sport"], "Starts")), iso(g["when"])))
        if g not in ahead:
            continue
        prob = ""
        if away["money"] is not None and home["money"] is not None:
            a, h = implied(away["money"]), implied(home["money"])
            pa = min(99, max(1, round(100 * a / (a + h))))
            prob = ('<div class="prob" role="img" aria-label="{an} {pa}%, {hn} {ph}% to win, as the moneyline implies">'
                    '<span class="prob-a{ai}" style="width:{pa}%">{pa}%</span><span class="prob-h{hi}">{ph}%</span></div>'
                    '<p class="prob-key"><span>{an}</span><span>Chance to win, by the moneyline</span><span>{hn}</span></p>').format(
                        an=esc(away["name"]), hn=esc(home["name"]), pa=pa, ph=100 - pa,
                        ai=" is-iowa" if away["iowa"] else "", hi=" is-iowa" if home["iowa"] else "")
        body = "".join(
            '<tr{cls}><th scope="row">{name}</th>'
            '<td><b>{spread}</b><small>{sp}</small></td><td><b>{total}</b><small>{tp}</small></td><td><b>{money}</b></td></tr>'.format(
                cls=' class="is-iowa"' if r["iowa"] else "", name=esc(r["name"]),
                spread=signed(r["spread"], True), sp=price(r["spread_price"]),
                total=esc(r["total"] or "–"), tp=price(r["total_price"]),
                money=signed(r["money"]))
            for r in g["rows"])
        cards.append(
            '<article class="game" data-start="%s"><p class="game-meta"><b>%s</b><span data-kick="%s">%s</span></p>'
            '<h3 class="matchup">%s <i>at</i> %s</h3><div class="game-inner"><div><p class="read">%s</p>%s</div>%s</div></article>' % (
                iso(g["when"]), esc(g["sport"]), iso(g["when"]), esc(kick), team(away), team(home),
                esc(read), prob,
                ('<div class="lines-wrap"><table class="lines"><thead><tr><th scope="col">Team</th><th scope="col">Spread</th><th scope="col">Total</th><th scope="col">Money</th></tr></thead>'
                 '<tbody>%s</tbody></table></div>' % body) if priced else ""))
    books = []
    for g in ahead:
        if g["book"] and g["book"] not in books:
            books.append(g["book"])
    source = ("Lines from %s, by way of The Odds API. " % esc(" and ".join(books))) if books else ""
    none = '<p class="odds-none"%s>No Iowa games have a line right now. Lines show up here a few days before each game.</p>'
    if lost and not cards:
        none = '<p class="odds-none"%s>The lines could not be loaded this time. They will be back with the next update.</p>'
    inner = ('<div class="games">%s</div>%s' % ("".join(cards), none % " hidden")) if cards else none % ""
    helper = ('<details class="odds-help"><summary>How to read the lines</summary>'
              '<dl><dt>Spread</dt><dd>The favorite has to win by more than this number; the underdog can lose by less, or win. Iowa -8.5 means Iowa must win by 9 or more.</dd>'
              '<dt>Total</dt><dd>Both teams\' points (runs, in baseball) added together. O is over that number, U is under.</dd>'
              '<dt>Money</dt><dd>A bet on who wins, nothing else. -325 means risking $325 to win $100; +260 means $100 wins $260.</dd>'
              '<dt>The small number</dt><dd>The price of that bet, read the same way as the moneyline.</dd></dl></details>') if cards else ""
    section = ('<section class="odds" id="odds" aria-labelledby="h-odds">'
               '<header class="odds-head"><h2 class="sign" id="h-odds">The lines</h2>%s</header>%s%s%s'
               '<p class="odds-note">%sOdds move; check a sportsbook for the current number. %s takes no bets, is here for information only, '
               'and is not affiliated with the University of Iowa, the Big Ten Conference, the NCAA or any sportsbook. '
               'Betting is for adults 21 and over where it is legal. Gambling problem? In Iowa call 1-800-BETS OFF or visit yourlifeiowa.org; '
               'elsewhere call 1-800-GAMBLER.</p></section>'
               % ('<p class="odds-src">Checked %s</p>' % stamp(checked) if checked else "", inner,
                  '<a class="more-link" href="odds.html">All the lines</a>' if more else "",
                  helper if not more else "", source, esc(SITE["name"])))
    strip = ('<nav class="scores" aria-label="Lines for the next games"><span class="scores-tag">Lines</span>'
             '<div class="scores-row">%s</div></nav>' % "".join(scores[:4])) if scores else ""     # the next four; the board has them all
    return section, strip


SEARCH = ('<form class="search" role="search" action="./"><label class="search-label" for="q">Search every headline</label>'
          '<input id="q" type="search" placeholder="Search %d headlines" autocomplete="off" enterkeyhint="search"></form>')

DISCLAIMER = ("<p>%s is an independent fan site. It is not affiliated with, licensed by, endorsed by or sponsored by "
              "the University of Iowa, its athletics department, the Big Ten Conference, the NCAA or any sportsbook. "
              "Team names belong to their owners and are used only to say who is playing. Headlines belong to their publishers.</p>"
              "<p>Keep it one tap away: in your phone’s browser, choose Share, then Add to Home Screen.</p>" % esc(SITE["name"]))


def page_name(sport_id):
    return sport_id + ".html"


def render(items, sports):
    """Every page of the site but the game and the merch: the home page, one page per sport, and the lines."""
    recent = NOW - dt.timedelta(days=3)
    week = NOW - dt.timedelta(days=7)

    def heat(s):
        if s["id"] == OTHER:
            return -1
        return sum(1 for it in items if it["sport"] == s["id"] and it["date"] >= recent)

    # On the home page the busiest sport of the past three days comes first, so whatever is in
    # season rises without anyone editing a list. The bar keeps the fan's order on every page.
    by_heat = sorted(sports, key=heat, reverse=True)   # stable: ties keep the fan's order

    try:
        games, checked, lost = load_odds()
    except Exception as exc:                         # whatever goes wrong with the lines, the headlines still go out
        print("  odds: left off this build: %s %s" % (type(exc).__name__, exc), file=sys.stderr)
        games, checked, lost = [], None, True
    tally = {}
    for it in items:
        tally[it["source"]] = tally.get(it["source"], 0) + 1
    regulars = sorted((name for name, n in tally.items() if n >= 3), key=str.lower)      # the outlets most of it comes from
    REGULARS.clear()
    REGULARS.update(regulars)
    others = len(tally) - len(regulars)
    footer = ("      <p>%s links to %s from %s%s. Every headline leads to the publisher’s own story; some go by way of Google News.</p>\n      %s" % (
        esc(SITE["name"]), plural(len(items), "recent story", "recent stories"), ", ".join(esc(name) for name in regulars),
        " and %s" % plural(others, "other outlet", "other outlets") if others else "", DISCLAIMER))
    updated = '<p class="updated"><span class="updated-word">Updated </span>%s</p>' % stamp(NOW)
    common = {"aside": updated, "footer": footer, "search": SEARCH % len(items), "data": site_data(items, sports)}
    since = '<div class="since" id="since" hidden></div>'
    pages = {}

    # ---- home: the next games, the top story, the newest headlines, and a few from each sport
    top = front(items, runners=3)
    used = top["used"]
    pool = [it for it in items if on_topic(it)] or items
    latest = [it for it in pool if id(it) not in used][:60]      # six showing; the rest are there for "More" and the sport filter
    shown = 6
    in_list = {it["sport"] for it in latest}
    chips = ('<button class="chip is-on" type="button" data-sport="" aria-pressed="true">All</button>'
             '<button class="chip" type="button" data-sport="new" aria-pressed="false" hidden>New</button>') + "".join(
        '<button class="chip" type="button" data-sport="%s" aria-pressed="false">%s</button>' % (esc(sp["id"]), esc(sp["name"]))
        for sp in sports if sp["id"] in in_list)
    _, nextup = odds_parts(games, checked)

    sections = []
    for s in by_heat:
        every = [it for it in items if it["sport"] == s["id"]]
        mine = [it for it in every if id(it) not in used and on_topic(it)] or [it for it in every if id(it) not in used]
        this_week = sum(1 for it in every if it["date"] >= week)
        if not mine or not this_week:
            continue                    # a sport with nothing new to say stays off the front page; its own page still has it
        wide = not sections
        show = mine[: 7 if wide else 3]
        sections.append(
            '<section class="plot{wide}" id="{id}" aria-labelledby="h-{id}">'
            '<header class="plot-head"><h2 class="sign" id="h-{id}"><a href="{href}">{name}</a></h2>'
            '<p class="plot-meta">{meta}</p></header>'
            '<div class="plot-body">{top}<ul class="stories">{rows}</ul>'
            '<a class="more-link" href="{href}">All {lower} headlines</a></div></section>'.format(
                wide=" plot-wide" if wide else "", id=s["id"], href=page_name(s["id"]), name=esc(s["name"]),
                lower=esc(s["name"][0].lower() + s["name"][1:]) if s["id"] != OTHER else "other",
                meta=week_text(this_week),
                top=story(show[0], "article", "story story-top"), rows="".join(story(it) for it in show[1:])))

    main_html = fill((ROOT / "pages" / "home.html").read_text(encoding="utf-8"), {
        "nextup": nextup, "since": since, "chips": chips,
        "lead": lead_story(top["lead"], top["also"], top["covered"]),
        "runners": "".join(story(it, kicker=True) for it in top["runners"]),
        "latest": "".join(brief(it, n >= shown) for n, it in enumerate(latest)),
        "sections": "\n".join(sections)})
    pages["index.html"] = shell(
        sports, title="%s: Iowa sports headlines" % SITE["name"],
        description=SITE["tagline"] + " Football, basketball, wrestling and more, updated through the day.",
        path="", home="#top", home_label="Back to top", brand_tag="h1",
        skip_href="#latest", skip_text="Skip to headlines", main=main_html, **common)

    # ---- a page for each sport: its top story, its next game, and everything else in one list
    for s in sports:
        every = [it for it in items if it["sport"] == s["id"]]
        this_week = sum(1 for it in every if it["date"] >= week)
        board, _ = odds_parts(games, checked, sport=s["id"])
        if every:
            top = front(every, runners=0)
            rows = [it for it in every if it is not top["lead"]]
            first = 30
            listing = "".join(story(it) if n < first else story(it).replace('<li class="story"', '<li class="story" hidden data-more', 1)
                              for n, it in enumerate(rows))
            button = ('<button class="more-btn" type="button" data-reveal>Show %d more</button>' % (len(rows) - first)) if len(rows) > first else ""
            body = since + lead_story(top["lead"], top["also"], top["covered"], kicker=False) + board
            if rows:
                body += ('<section class="plot" id="headlines" aria-labelledby="h-headlines">'
                         '<header class="plot-head"><h2 class="sign" id="h-headlines">Latest</h2><p class="plot-meta">%d in the past %d days</p></header>'
                         '<div class="plot-body"><ul class="stories cols">%s</ul>%s</div></section>' % (
                             len(every), CFG["days_to_keep"], listing, button))
            meta = week_text(this_week)
        else:
            body = board + ('<section class="plot" id="headlines"><p class="quiet">No headlines in the past %d days.</p></section>'
                            % CFG["days_to_keep"])
            meta = "Quiet for now"
        lower = s["name"].lower() if s["id"] != OTHER else "sports"
        pages[page_name(s["id"])] = shell(
            sports, current=s["id"], title="%s %s headlines: %s" % ("Iowa" if s["id"] != OTHER else "More Iowa", lower, SITE["name"]),
            description=("The latest Iowa %s headlines from around the web, updated through the day." % lower if s["id"] != OTHER else
                         "Iowa headlines from the sports without a page of their own: swimming, track, golf, gymnastics and the rest."),
            path=page_name(s["id"]), skip_href="#page", skip_text="Skip to headlines",
            main=page_main(s["name"], meta, body, art=s["id"]), **common)

    # ---- the lines: every game with a number on it
    board, _ = odds_parts(games, checked, lost=lost)
    pages["odds.html"] = shell(
        sports, current="odds", title="Iowa betting lines: %s" % SITE["name"],
        description="Point spreads, totals and moneylines for Iowa's next games.",
        path="odds.html", skip_href="#page", skip_text="Skip to the lines",
        main=page_main("Odds", "The next games with a line", board), **common)
    return pages, common


def week_text(n):
    return "%s this week" % plural(n, "story", "stories") if n else "Quiet this week"


def site_data(items, sports):
    """What the page's script needs to know about the whole site: when it was built, and for each sport
    how many seconds ago the site first held each of its headlines. From this a returning reader is told
    how much is new."""
    now = int(NOW.timestamp())
    return {"at": now, "sports": [
        {"name": s["name"], "page": page_name(s["id"]),
         "ages": sorted(max(0, now - it.get("seen", int(it["date"].timestamp()))) for it in items if it["sport"] == s["id"])}
        for s in sports]}


def page_main(title, meta, body, art="", cls=""):
    """An inside page: a black title band carrying the sport's field, then the page."""
    return ('<main class="page%s" id="page"><header class="page-head">%s<a class="crumb" href="./">Home</a>'
            '<h1 class="page-title">%s</h1>%s</header>%s</main>' % (
                " " + cls if cls else "", turf(art), esc(title), '<p class="page-meta">%s</p>' % esc(meta) if meta else "", body))


def sport_links(sports, current=""):
    """The bar: the lines, a page for each sport, then the merch. The page being read is marked."""
    def link(page, label, here):
        return '<a href="%s"%s>%s</a>' % (page, ' aria-current="page"' if here else "", esc(label))
    return (link("odds.html", "Odds", current == "odds")
            + "".join(link(page_name(s["id"]), s.get("nav", s["name"]), current == s["id"]) for s in sports)
            + link("merch.html", "Merch", current == "merch"))


def fill(frame, parts, raw=None):
    """Put each part into its {{place}} in one pass, so text that came from a feed is never searched for
    places in its turn. Parts are HTML already unless `raw` names the only ones that are."""
    return re.sub(r"\{\{(\w+)\}\}", lambda m: parts[m.group(1)] if raw is None or m.group(1) in raw else esc(parts[m.group(1)]), frame)


def fingerprint(name):
    """A short hash of a file in public/. It goes in the file's address, so a browser never pairs a new
    page with an old, remembered copy of the styles or the scripts."""
    return hashlib.md5((PUBLIC / name).read_bytes()).hexdigest()[:10]


def shell(sports, current="", **fields):
    """Fill the shared page frame (top bar, sport bar, footer) around one page."""
    page = (ROOT / "template.html").read_text(encoding="utf-8")
    fields.setdefault("name", SITE["name"])
    fields.setdefault("tagline", SITE["tagline"])
    fields.setdefault("url", SITE["url"])
    fields.setdefault("css", fingerprint("style.css"))
    fields.setdefault("js", fingerprint("site.js"))
    fields.setdefault("home", "./")
    fields.setdefault("home_label", "%s home" % SITE["name"])
    fields.setdefault("brand_tag", "p")
    fields.setdefault("aside", "")
    fields.setdefault("search", "")
    data = fields.pop("data", None)
    # a "</" inside the block could end it early, so each one is written as "<\\/", which means the same to JSON
    fields["data"] = ('<script type="application/json" id="rc-data">%s</script>'
                      % json.dumps(data, separators=(",", ":")).replace("</", "<\\/")) if data else ""
    fields.setdefault("nav", sport_links(sports, current))
    fields.setdefault("game_current", ' aria-current="page"' if current == "game" else "")
    fields.setdefault("foot_nav", '<a href="./">Home</a>' + sport_links(sports) + '<a href="hang-time.html">Hang Time</a>')
    return fill(page, fields, raw={"main", "footer", "nav", "foot_nav", "aside", "search", "game_current", "brand_tag", "data"})


def render_merch(sports, common):
    return shell(
        sports, current="merch", title="%s merch" % SITE["name"],
        description="%s shirts, a cap and a can cooler with the corn wheel on them." % SITE["name"],
        path="merch.html", skip_href="#page", skip_text="Skip to merch", search=common["search"], data=common["data"],
        main=page_main("Merch", "Nothing is for sale yet.", merch.page(json.loads((ROOT / "merch.json").read_text(encoding="utf-8")))),
        footer="      " + DISCLAIMER)


def render_game(sports, items):
    """Hang Time, the punt game: a fixed page plus public/hang-time.js, and a way back to the news."""
    newest = [it for it in items if on_topic(it)][:4] or items[:4]
    body = fill((ROOT / "pages" / "hang-time.html").read_text(encoding="utf-8"),
                {"js": fingerprint("hang-time.js"), "headlines": "".join(story(it, kicker=True) for it in newest)})
    return shell(
        sports, current="game", title="Hang Time: the %s punt game" % SITE["name"],
        description="Keep the punt in the air. A hang time game from %s." % SITE["name"],
        path="hang-time.html", skip_href="#game", skip_text="Skip to the game", search="",
        main='<main class="page page-game" id="page">%s</main>' % body,
        footer="      " + DISCLAIMER)


def render_lost(sports, common):
    """The page GitHub Pages shows for an address that is not there. It can be served from any depth,
    so every address in it starts from the root."""
    page = shell(
        sports, title="Page not found: %s" % SITE["name"], description="That page is not on %s." % SITE["name"],
        path="404.html", skip_href="#page", skip_text="Skip to the page", search=common["search"], data=common["data"],
        main=page_main("Out of bounds", "That page is not here.",
                       '<section class="plot"><p class="quiet">The address may be old, or mistyped. '
                       'The <a href="./">front page</a> has today’s headlines, and <a href="hang-time.html">Hang Time</a> is always open.</p></section>'),
        footer="      " + DISCLAIMER)
    page = page.replace('<link rel="canonical" href="%s/404.html">' % esc(SITE["url"]), '<meta name="robots" content="noindex">')
    return re.sub(r'\b(href|src)="(?!https?:|/|#|data:)(\./)?', r'\1="/', page)


# The game used to live at coffin-corner.html; that address now sends people on.
MOVED = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Hang Time</title>
<link rel="canonical" href="{url}/hang-time.html">
<meta http-equiv="refresh" content="0; url=hang-time.html">
</head>
<body>
<p>The game is now called Hang Time. <a href="hang-time.html">Play it here.</a></p>
</body>
</html>
"""


def sitemap(names):
    day = NOW.strftime("%Y-%m-%d")
    rows = "".join("<url><loc>%s/%s</loc><lastmod>%s</lastmod></url>\n" % (esc(SITE["url"]), "" if n == "index.html" else n, day) for n in names)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s</urlset>\n' % rows


def main():
    items = snapshot()
    PUBLIC.mkdir(exist_ok=True)
    sports = site_sports()
    pages, common = render(items, sports)
    pages["merch.html"] = render_merch(sports, common)
    pages["hang-time.html"] = render_game(sports, items)
    for name, page in pages.items():
        (PUBLIC / name).write_text(page, encoding="utf-8")
    (PUBLIC / "404.html").write_text(render_lost(sports, common), encoding="utf-8")
    (PUBLIC / "latest.json").write_text(json.dumps(common["data"], separators=(",", ":")), encoding="utf-8")
    (PUBLIC / "coffin-corner.html").write_text(MOVED.format(url=SITE["url"]), encoding="utf-8")
    (PUBLIC / "sitemap.xml").write_text(sitemap(pages), encoding="utf-8")
    (PUBLIC / "robots.txt").write_text("User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % SITE["url"], encoding="utf-8")
    # every headline: what the search box reads, and what the next build remembers
    MEMORY.write_text(json.dumps(memory_rows(items), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("Wrote %d pages with %d headlines." % (len(pages) + 1, len(items)), file=sys.stderr)


if __name__ == "__main__":
    main()
