#!/usr/bin/env python3
"""Build the RollCorn page.

Reads feeds.json, pulls headlines from each feed, sorts them by sport, and
writes public/index.html. Uses only the Python standard library.

Run:  python3 build.py
"""
import datetime as dt
import email.utils
import gzip
import hashlib
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


def brief(it, hidden=False):
    """One line of the "just in" timeline: time first, then the headline."""
    return (
        '<li class="brief" data-sport="{sport}"{hidden}>{when}<div><a href="{href}" rel="noopener">{title}</a>'
        '<p class="from"><span class="source">{src}</span></p></div></li>'
    ).format(href=esc(it["link"]), title=esc(it["title"]), sport=esc(it["sport"]), hidden=" hidden" if hidden else "",
             src=esc(it["source"]), when=stamp(it["date"], short=True))


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
               ("Women's basketball", "basketball_wncaab")]
ODDS_BOOKS = ["draftkings", "fanduel", "betmgm", "williamhill_us", "espnbet"]     # first one with a line wins
ODDS_EVERY = dt.timedelta(hours=14)
ODDS_FILE = ROOT / "public" / "odds.json"


def signed(n, digits=False):
    """+260, -325, +8.5, or PK for a game with no favorite."""
    if n is None:
        return "\u2013"
    n = float(n)
    if digits and n == 0:
        return "PK"
    return ("%+.1f" % n).replace(".0", "") if digits else "%+d" % round(n)


def odds_get(path, key, **params):
    params["apiKey"] = key
    try:
        return json.loads(fetch(ODDS_API + path + "?" + urllib.parse.urlencode(params)))
    except Exception as exc:
        # never let the address, which carries the key, reach the build log
        raise RuntimeError("%s: %s" % (path.split("/")[0], type(exc).__name__ + " " + str(getattr(exc, "code", "")))) from None


def upcoming(label, sport, key):
    """Iowa's next games in one sport, with the first listed sportsbook's line for each."""
    until = NOW + dt.timedelta(days=9)
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    events = odds_get(sport + "/events", key, commenceTimeFrom=NOW.strftime(fmt), commenceTimeTo=until.strftime(fmt))   # free
    mine = sorted((e for e in events if IOWA in (e["home_team"], e["away_team"])), key=lambda e: e["commence_time"])[:2]
    if not mine:
        return []
    data = odds_get(sport + "/odds", key, regions="us", markets="h2h,spreads,totals", oddsFormat="american",
                    eventIds=",".join(e["id"] for e in mine))                                                          # three credits
    games = []
    for ev in sorted(data, key=lambda e: e["commence_time"]):
        books = {bk["key"]: bk for bk in ev.get("bookmakers", [])}
        book = next((books[k] for k in ODDS_BOOKS if k in books), None) or next(iter(books.values()), None)
        if not book:
            continue
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
        games.append({"sport": label, "when": ev["commence_time"], "rows": rows, "book": book.get("title", "")})
    return games


def load_odds():
    """The lines to show and when they were checked: fresh from the service if the saved copy is old, else the saved copy."""
    saved = None
    for read in (lambda: fetch(CFG["site"]["url"] + "/odds.json"), lambda: ODDS_FILE.read_bytes()):
        try:
            saved = json.loads(read())
            break
        except Exception:
            continue
    checked = dt.datetime.fromisoformat(saved["at"]) if saved else None
    key = os.environ.get("ODDS_API_KEY", "").strip()
    if key and (not checked or NOW - checked >= ODDS_EVERY):
        try:
            games = []
            for label, sport in ODDS_SPORTS:
                games += upcoming(label, sport, key)
            saved, checked = {"at": NOW.isoformat(), "games": games}, NOW
        except Exception as exc:                     # out of credits, or the service is down: keep what we had
            print("  odds: %s" % exc, file=sys.stderr)
    elif not key and not saved:
        print("  odds: no ODDS_API_KEY set and no saved lines; the board will be empty.", file=sys.stderr)
    if saved:
        ODDS_FILE.write_text(json.dumps(saved))
    games = [dict(g, when=dt.datetime.fromisoformat(g["when"].replace("Z", "+00:00"))) for g in (saved or {}).get("games", [])]
    return sorted((g for g in games if g["when"] > NOW), key=lambda g: g["when"]), checked


def implied(money):
    """The chance a moneyline implies, before the sportsbook's cut is taken out."""
    money = float(money)
    return -money / (-money + 100) if money < 0 else 100 / (money + 100)


def odds_parts():
    """The Lines card for the home page, and the one-line Next up strip that sits above the headlines."""
    games, checked = load_odds()
    cards, nextup = [], ""
    for g in games:
        local = g["when"].astimezone(ZoneInfo("America/Chicago"))
        kick = local.strftime("%a, %b ") + str(local.day) + local.strftime(" \u00B7 %I:%M %p CT").replace(" 0", " ")
        away, home = g["rows"]
        fav = min(g["rows"], key=lambda r: r["spread"] if r["spread"] is not None else 0)
        dog = home if fav is away else away
        if fav["spread"] is None:
            read = "No spread posted yet"
        elif fav["spread"] == 0:
            read = "A pick'em: no favorite"
        else:
            read = "%s favored by %g over %s" % (fav["name"], abs(fav["spread"]), dog["name"])
        total = (away["total"] or "")[2:]
        if total:
            read += " \u00B7 %s total points expected" % total
        prob = ""
        if away["money"] is not None and home["money"] is not None:
            a, h = implied(away["money"]), implied(home["money"])
            pa = round(100 * a / (a + h))
            prob = ('<div class="prob" role="img" aria-label="{an} {pa}%, {hn} {ph}% to win, as the moneyline implies">'
                    '<span class="prob-a{ai}" style="width:{pa}%">{pa}%</span><span class="prob-h{hi}">{ph}%</span></div>'
                    '<p class="prob-key"><span>{an}</span><span>Chance to win, by the moneyline</span><span>{hn}</span></p>').format(
                        an=esc(away["name"]), hn=esc(home["name"]), pa=pa, ph=100 - pa,
                        ai=" is-iowa" if away["iowa"] else "", hi=" is-iowa" if home["iowa"] else "")
        body = "".join(
            '<tr{cls}><th scope="row">{name}</th>'
            '<td><b>{spread}</b><small>{sp}</small></td><td><b>{total}</b><small>{tp}</small></td><td><b>{money}</b></td></tr>'.format(
                cls=' class="is-iowa"' if r["iowa"] else "", name=esc(r["name"]),
                spread=signed(r["spread"], True), sp=signed(r["spread_price"]) if r["spread_price"] is not None else "",
                total=esc(r["total"] or "\u2013"), tp=signed(r["total_price"]) if r["total_price"] is not None else "",
                money=signed(r["money"]))
            for r in g["rows"])
        cards.append(
            '<article class="game"><p class="game-meta"><b>%s</b><span data-kick="%s">%s</span></p>'
            '<h3 class="matchup"><span%s>%s</span> <i>at</i> <span%s>%s</span></h3><p class="read">%s</p>%s'
            '<table class="lines"><thead><tr><th scope="col">Team</th><th scope="col">Spread</th><th scope="col">Total</th><th scope="col">Money</th></tr></thead>'
            '<tbody>%s</tbody></table></article>' % (
                esc(g["sport"]), g["when"].isoformat(), esc(kick),
                ' class="is-iowa"' if away["iowa"] else "", esc(away["name"]), ' class="is-iowa"' if home["iowa"] else "", esc(home["name"]),
                esc(read), prob, body))
        if not nextup:
            line = ("%s %s" % (fav["name"], signed(fav["spread"], True))) if fav["spread"] not in (None, 0) else ""
            nextup = ('<a class="nextup" href="#odds"><b>Next up</b><span class="nextup-game">%s at %s</span>'
                      '<span data-kick="%s">%s</span>%s%s<span class="nextup-go">The lines</span></a>' % (
                          esc(away["name"]), esc(home["name"]), g["when"].isoformat(), esc(kick),
                          '<em>%s</em>' % esc(line) if line else "", '<em>O/U %s</em>' % esc(total) if total else ""))
    book = next((g["book"] for g in games if g["book"]), "")
    source = ("Lines from %s, by way of The Odds API. " % esc(book)) if book else ""
    inner = ('<div class="games">%s</div>' % "".join(cards)) if cards else '<p class="odds-none">No lines are posted for the next week. They show up here a few days before each game.</p>'
    helper = ('<details class="odds-help"><summary>How to read the lines</summary>'
              '<dl><dt>Spread</dt><dd>The favorite has to win by more than this number; the underdog can lose by less, or win. Iowa -8.5 means Iowa must win by 9 or more.</dd>'
              '<dt>Total</dt><dd>Both teams\' points added together. O is over that number, U is under.</dd>'
              '<dt>Money</dt><dd>A bet on who wins, nothing else. -325 means risking $325 to win $100; +260 means $100 wins $260.</dd>'
              '<dt>The small green number</dt><dd>The price of that bet, read the same way as the moneyline.</dd></dl></details>') if cards else ""
    section = ('<section class="odds" id="odds" aria-labelledby="h-odds">'
               '<header class="odds-head"><h2 class="sign" id="h-odds">The lines</h2><p class="odds-src">Checked %s</p></header>%s%s'
               '<p class="odds-note">%sOdds move; check a sportsbook for the current number. {name} takes no bets and is here for information only. '
               'Betting is for adults 21 and over where it is legal. Gambling problem? Call 1-800-GAMBLER.</p></section>'
               % (stamp(checked or NOW), inner, helper, source))
    return section, nextup


def ticker(items, sports):
    """The running line under the bar: the newest headlines, each tagged with its sport. The second
    copy only makes the loop seamless, so it is hidden from screen readers and the keyboard."""
    names = {s["id"]: s["name"] for s in sports}
    def run(hidden):
        return "".join(
            '<a href="%s" rel="noopener"%s><b>%s</b>%s</a>' % (
                esc(it["link"]), ' tabindex="-1"' if hidden else "", esc(names.get(it["sport"], "Iowa")), esc(it["title"]))
            for it in items)
    return '<span class="ticker-run">%s</span><span class="ticker-run" aria-hidden="true">%s</span>' % (run(False), run(True))


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
    lead, runners = latest[0], latest[1:4]
    rest = items[4:64]                 # the headline list: ten showing, the rest there for the sport filter
    shown = len(latest) - 4
    in_list = {it["sport"] for it in rest}
    chips = '<button class="chip is-on" type="button" data-sport="" aria-pressed="true">All</button>' + "".join(
        '<button class="chip" type="button" data-sport="%s" aria-pressed="false">%s</button>' % (esc(sp["id"]), esc(sp["name"]))
        for sp in sports if sp["id"] in in_list)
    lines_html, nextup = odds_parts()


    sections = []
    for n, s in enumerate(sports):
        wide = n == 0
        limit = CFG["per_sport_count"] + (3 if wide else 0)
        all_mine = [it for it in items if it["sport"] == s["id"]]
        mine = all_mine[:limit]
        extra = all_mine[limit:limit + 15]
        this_week = sum(1 for it in all_mine if it["date"] >= week)
        if mine:
            more = "".join(story(it).replace('<li class="story"', '<li class="story" hidden data-more', 1) for it in extra)
            button = ('<button class="more-btn" type="button">Show %d more</button>' % len(extra)) if extra else ""
            body = ('<div class="plot-body">%s<ul class="stories">%s%s</ul>%s</div>' % (
                story(mine[0], "article", "story story-top"),
                "".join(story(it) for it in mine[1:]), more, button))
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
                 .replace("{{ticker}}", ticker(latest[:10], sports))
                 .replace("{{odds}}", lines_html).replace("{{nextup}}", nextup).replace("{{chips}}", chips)
                 .replace("{{lead}}", story(lead, "article", "story lead"))
                 .replace("{{runners}}", "".join(story(it) for it in runners))
                 .replace("{{latest}}", "".join(brief(it, n >= shown) for n, it in enumerate(rest)))
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
        search='<form class="search" role="search" onsubmit="return false"><label class="search-label" for="q">Search headlines</label>'
               '<input id="q" type="search" placeholder="Search headlines" autocomplete="off"></form>',
        nav=sport_links(sports, ""), merch_current="",
        main=main_html, footer=footer)
    return home, sports


DISCLAIMER = ("<p>{name} is an independent fan site. It is not affiliated with, endorsed by, "
              "or sponsored by the University of Iowa or its athletics department.</p>")


def sport_links(sports, prefix):
    return ('<a class="jump-odds" href="%s#odds">Odds</a>' % prefix) + "".join('<a href="%s#%s">%s</a>' % (prefix, s["id"], esc(s["name"])) for s in sports)


def shell(**fields):
    """Fill the shared page frame (masthead, sport bar, footer) around one page."""
    site = CFG["site"]
    page = (ROOT / "template.html").read_text()
    fields.setdefault("name", site["name"])
    fields.setdefault("tagline", site["tagline"])
    fields.setdefault("url", site["url"])
    # A fingerprint of the stylesheet goes in its address, so a browser never
    # pairs a new page with an old, remembered copy of the styles.
    fields.setdefault("css", hashlib.md5((ROOT / "public" / "style.css").read_bytes()).hexdigest()[:10])
    fields.setdefault("merch_current", "")
    fields.setdefault("game_current", "")
    fields.setdefault("search", "")
    raw = {"main", "footer", "nav", "aside", "search", "merch_current", "game_current"}   # already HTML
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


def render_game(sports):
    """Hang Time, the punt game: a fixed page plus public/hang-time.js."""
    site = CFG["site"]
    js = hashlib.md5((ROOT / "public" / "hang-time.js").read_bytes()).hexdigest()[:10]
    return shell(
        title="Hang Time: the %s punt game" % site["name"],
        description="Keep the punt in the air. A hang time game from %s." % site["name"],
        path="hang-time.html", home="./", home_label="%s home" % site["name"],
        skip_href="#game", skip_text="Skip to the game",
        aside="", nav=sport_links(sports, "./"), game_current=' aria-current="page"',
        main=(ROOT / "pages" / "hang-time.html").read_text().replace("{{js}}", js),
        footer="  " + DISCLAIMER)


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
    (OUT.parent / "hang-time.html").write_text(render_game(sports))
    (OUT.parent / "coffin-corner.html").write_text(MOVED.format(url=CFG["site"]["url"]))
    print("Wrote %s with %d headlines." % (OUT.relative_to(ROOT), len(items)), file=sys.stderr)


if __name__ == "__main__":
    main()
