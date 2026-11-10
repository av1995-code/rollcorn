#!/usr/bin/env python3
"""Build the RollCorn page.

Reads feeds.json, pulls headlines from each feed, sorts them by sport, and
writes public/index.html. Uses only the Python standard library.

Run:  python3 build.py
"""
import datetime as dt
import email.utils
import gzip
import html
import http.client
import json
import os
import pathlib
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo

import merch

ROOT = pathlib.Path(__file__).resolve().parent
CFG = json.loads((ROOT / "feeds.json").read_text())
OUT = ROOT / "public" / "index.html"
UA = "RollCornBot/1.0 (+%s)" % CFG["site"]["url"]
UTC = dt.timezone.utc
CENTRAL = ZoneInfo("America/Chicago")
NOW = dt.datetime.now(UTC)


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


def fetch(url):
    last = None
    for attempt in range(3):
        headers = {
            "User-Agent": UA,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        }
        if attempt == 0:
            headers["Accept-Encoding"] = "gzip"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=25, context=TLS) as resp:
                data = resp.read()
            if data[:2] == b"\x1f\x8b":
                data = gzip.decompress(data)
            return data
        except (http.client.IncompleteRead, TimeoutError, ConnectionError) as exc:
            last = exc
            time.sleep(1 + attempt)
    raise last


def local(tag):
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def child_text(node, name):
    for c in node:
        if local(c.tag) == name and c.text:
            return c.text.strip()
    return ""


def clean(text):
    text = html.unescape(re.sub(r"<[^>]+>", "", text or ""))
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
    root = ET.fromstring(data)
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
                    link = href
                elif not href and c.text:
                    link = c.text.strip()
            elif name == "category":
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


def pick_sport(title, cats, fallback):
    hay_title = norm(title)
    hay_all = norm(title + " | " + " | ".join(cats))
    for hay in (hay_title, hay_all):
        for sport in CFG["sports"]:
            if any(k in hay for k in sport["keywords"]):
                return sport["id"]
    return fallback or CFG["other_sport"]["id"]


def about_another_school(title):
    """True when a headline names Iowa State or another school and, with that
    name removed, says nothing about Iowa. A rivalry story such as
    "Iowa vs. Iowa State" still mentions Iowa on its own, so it stays."""
    text = norm(title)
    others = CFG.get("other_schools", [])
    if not any(o in text for o in others):
        return False
    for o in sorted(others, key=len, reverse=True):
        text = text.replace(o, " ")
    return not re.search(r"\biowa\b|hawkeye|cy-hawk", text)


def load(feed):
    if "google_news" in feed:
        q = urllib.parse.quote_plus(feed["google_news"] + " when:%dd" % CFG["days_to_keep"])
        url = "https://news.google.com/rss/search?q=%s&hl=en-US&gl=US&ceid=US:en" % q
        label = "Google News: " + feed["google_news"]
    else:
        url, label = feed["url"], feed["name"]
    try:
        raw = list(parse_feed(fetch(url)))
    except Exception as exc:  # one bad feed must not stop the build
        print("  skipped %-45s %s" % (label, exc), file=sys.stderr)
        return []
    items = []
    for it in raw:
        if not (it["title"] and it["link"].startswith("http") and it["date"]):
            continue
        source = feed.get("name") or it["source"]
        if not source:
            continue
        # Google News appends " - Source name" to every title
        if "google_news" in feed and it["title"].endswith(" - " + source):
            it["title"] = it["title"][: -len(" - " + source)].strip()
        must = feed.get("must_mention")
        if must and not any(m in norm(it["title"] + " ".join(it["cats"])) for m in must):
            continue
        if source in CFG.get("skip_sources", []):
            continue
        if about_another_school(it["title"]):
            continue
        items.append({
            "title": it["title"],
            "link": it["link"],
            "date": it["date"],
            "source": source,
            "sport": pick_sport(it["title"], it["cats"], feed.get("sport")),
            "direct": "google_news" not in feed,
        })
    print("  %3d  %s" % (len(items), label), file=sys.stderr)
    return items


def gather():
    with ThreadPoolExecutor(max_workers=6) as pool:
        batches = list(pool.map(load, CFG["feeds"]))
    items = [it for batch in batches for it in batch]
    cutoff = NOW - dt.timedelta(days=CFG["days_to_keep"])
    items = [it for it in items if cutoff <= it["date"] <= NOW + dt.timedelta(hours=1)]
    # direct feeds win over Google News copies of the same story
    items.sort(key=lambda it: (not it["direct"], -it["date"].timestamp()))
    seen, unique = set(), []
    for it in items:
        key = re.sub(r"[^a-z0-9]", "", norm(it["title"]))[:60]
        if key in seen:
            continue
        seen.add(key)
        unique.append(it)
    unique.sort(key=lambda it: it["date"], reverse=True)
    return unique


# ---------- page ----------

def esc(text):
    return html.escape(text, quote=True)


def stamp(d, short=False):
    """A <time> tag. The page's script rewrites the text as "3 hours ago"
    (or "3h" when short); the text here is what shows without scripts."""
    local_d = d.astimezone(CENTRAL)
    if short:
        same_day = local_d.date() == NOW.astimezone(CENTRAL).date()
        text = local_d.strftime("%-I:%M %p" if same_day else "%b %-d")
        return '<time class="when" data-short datetime="%s">%s</time>' % (
            d.strftime("%Y-%m-%dT%H:%M:%SZ"), text)
    text = local_d.strftime("%b %-d, %-I:%M %p")
    return '<time datetime="%s">%s</time>' % (d.strftime("%Y-%m-%dT%H:%M:%SZ"), text)


def story(it, tag="li", cls="story"):
    return (
        '<{t} class="{cls}"><a href="{href}" rel="noopener">{title}</a>'
        '<p class="from"><span class="source">{src}</span> {when}</p></{t}>'
    ).format(t=tag, cls=cls, href=esc(it["link"]), title=esc(it["title"]),
             src=esc(it["source"]), when=stamp(it["date"]))


def brief(it):
    """One line of the "just in" timeline: time first, then the headline."""
    return (
        '<li class="brief">{when}<div><a href="{href}" rel="noopener">{title}</a>'
        '<p class="from"><span class="source">{src}</span></p></div></li>'
    ).format(href=esc(it["link"]), title=esc(it["title"]),
             src=esc(it["source"]), when=stamp(it["date"], short=True))


def render(items):
    site = CFG["site"]
    sports = CFG["sports"] + [CFG["other_sport"]]
    # show sports in a fan's order, not keyword-matching order
    order = ["football", "mens-basketball", "womens-basketball", "wrestling",
             "volleyball", "baseball", "softball", "more"]
    sports.sort(key=lambda s: order.index(s["id"]) if s["id"] in order else 99)

    # The busiest sport of the past three days leads the page and gets the
    # wide row, so whatever is in season rises without anyone editing a list.
    recent = NOW - dt.timedelta(days=3)
    week = NOW - dt.timedelta(days=7)
    other = CFG["other_sport"]["id"]

    def heat(s):
        if s["id"] == other:
            return -1
        return sum(1 for it in items if it["sport"] == s["id"] and it["date"] >= recent)

    sports.sort(key=heat, reverse=True)   # stable: ties keep the fan's order

    # top of the page: one lead story, three runners-up beneath it,
    # and the rest as the Just in timeline beside them
    latest = items[: CFG["latest_count"]]
    lead, runners, rest = latest[0], latest[1:4], latest[4:]


    sections = []
    for n, s in enumerate(sports):
        wide = n == 0
        limit = CFG["per_sport_count"] + (3 if wide else 0)
        all_mine = [it for it in items if it["sport"] == s["id"]]
        mine = all_mine[:limit]
        this_week = sum(1 for it in all_mine if it["date"] >= week)
        if mine:
            body = ('<div class="plot-body">%s<ul class="stories">%s</ul></div>' % (
                story(mine[0], "article", "story story-top"),
                "".join(story(it) for it in mine[1:])))
            meta = "%d %s this week" % (this_week, "story" if this_week == 1 else "stories")
        else:
            body = ('<p class="quiet">No headlines in the past %d days. '
                    'This row fills in when the season picks up.</p>' % CFG["days_to_keep"])
            meta = "Out of season"
        sections.append(
            '<section class="plot{wide}" id="{id}" aria-labelledby="h-{id}">'
            '<header class="plot-head"><h2 class="sign" id="h-{id}">{name}</h2>'
            '<p class="plot-meta">{meta}</p></header>{body}</section>'
            .format(wide=" plot-wide" if wide else "", id=s["id"],
                    name=esc(s["name"]), meta=meta, body=body))

    sources = sorted({it["source"] for it in items}, key=str.lower)
    main_html = ((ROOT / "pages" / "home.html").read_text()
                 .replace("{{lead}}", story(lead, "article", "story lead"))
                 .replace("{{runners}}", "".join(story(it) for it in runners))
                 .replace("{{latest}}", "".join(brief(it) for it in rest))
                 .replace("{{sections}}", "\n".join(sections)))
    footer = (
        "  <p>{name} links to {count} recent stories from {sources}. "
        "Every headline opens the original publisher's page.</p>\n  " + DISCLAIMER
    ).format(name=esc(site["name"]), count=len(items),
             sources=", ".join(esc(s) for s in sources))
    home = shell(
        title="%s: Iowa sports headlines" % site["name"],
        description=site["tagline"] + " Football, basketball, wrestling and more, updated through the day.",
        path="", home="#top", home_label="Back to top",
        skip_href="#latest", skip_text="Skip to headlines",
        aside='<p class="updated">Updated %s</p>' % stamp(NOW),
        nav=sport_links(sports, ""), merch_current="",
        main=main_html, footer=footer)
    return home, sports


DISCLAIMER = ("<p>{name} is an independent fan site. It is not affiliated with, endorsed by, "
              "or sponsored by the University of Iowa or its athletics department.</p>")


def sport_links(sports, prefix):
    return "".join('<a href="%s#%s">%s</a>' % (prefix, s["id"], esc(s["name"])) for s in sports)


def shell(**fields):
    """Fill the shared page frame (masthead, sport bar, footer) around one page."""
    site = CFG["site"]
    page = (ROOT / "template.html").read_text()
    fields.setdefault("name", site["name"])
    fields.setdefault("tagline", site["tagline"])
    fields.setdefault("url", site["url"])
    raw = {"main", "footer", "nav", "aside", "merch_current"}   # already HTML
    for key, value in fields.items():
        page = page.replace("{{%s}}" % key, value if key in raw else esc(value))
    return page.replace("{name}", esc(site["name"]))


def render_merch(sports):
    site = CFG["site"]
    return shell(
        title="%s merch" % site["name"],
        description="%s shirts, hats and tailgate gear with the corn wheel on them." % site["name"],
        path="merch.html", home="./", home_label="%s home" % site["name"],
        skip_href="#merch", skip_text="Skip to merch",
        aside="", nav=sport_links(sports, "./"), merch_current=' aria-current="page"',
        main=merch.page(json.loads((ROOT / "merch.json").read_text())),
        footer="  " + DISCLAIMER)


def main():
    print("Pulling feeds…", file=sys.stderr)
    items = gather()
    if len(items) < 5:
        # keep the last good page rather than publish an empty one
        sys.exit("Only %d headlines found; leaving the existing page alone." % len(items))
    OUT.parent.mkdir(exist_ok=True)
    home, sports = render(items)
    OUT.write_text(home)
    (OUT.parent / "merch.html").write_text(render_merch(sports))
    print("Wrote %s with %d headlines." % (OUT.relative_to(ROOT), len(items)), file=sys.stderr)


if __name__ == "__main__":
    main()
