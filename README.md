# Roll Corn

Independent Iowa sports headlines, gathered from around the web, with the lines for the next games and
a punt game. A fan site, not affiliated with the University of Iowa.

## What is here

| File | What it does |
|---|---|
| `feeds.json` | The news sources, the sports, and the words that sort a headline into a sport. Edit this to add or remove sources. |
| `build.py` | Pulls every feed, joins the result with the headlines the site already holds, and writes the whole site into `public/`: the front page, a page per sport, the lines, the merch page, the game's page, the list of headlines, a sitemap and a not-found page. Standard Python only, nothing to install. |
| `template.html` | The frame every page shares: top bar, sport bar, footer, and the drawings (the corn wheel, each sport's field). |
| `pages/home.html`, `pages/hang-time.html` | The inside of the front page and of the game's page. |
| `public/style.css` | The look: colors, type, spacing. |
| `public/site.js` | What the pages do once loaded: "new since you were here", search, the clock running down to the next game. |
| `public/hang-time.js` | Hang Time, the punt game. |
| `merch.py`, `merch.json` | The merch page and its drawn mockups. Nothing is for sale. |
| `tools/make_images.py` | Draws the icons, the mouse pointer and the share image. Needs Pillow; only run it when the mark changes. |
| `.github/workflows/update.yml` | Rebuilds and republishes the site on GitHub. |

## Rebuild the site on this Mac

```bash
python3 build.py
```

Then run `python3 -m http.server 8923 --directory public` and visit http://localhost:8923.

To work on the look without pulling the feeds each time, name a file to keep the headlines in:

```bash
ROLLCORN_SNAPSHOT=/tmp/headlines.json python3 build.py
```

The first run saves the headlines there; later runs read them back.

## What the build remembers

A feed lists only its newest stories, and a search of Google News returns a different hundred each
time. So each build reads back `headlines.json` from the live site (the list the last build published,
and the same file the search box reads) and joins it with the fresh pull. A story stays for its full
fourteen days, a feed that fails keeps the stories it had, and every story carries the time the site
first held it. That time is what "new since your last visit" is counted from. `public/headlines.json`
and `public/odds.json` are written by the build and are not kept in git: the live site is the copy.

## Add a source

Add a line to `"feeds"` in `feeds.json`:

```json
{"name": "Site name", "url": "https://example.com/feed/"}
```

A feed has to show that each story is about Iowa: the headline must use one of the `"iowa_words"`.
Two settings change that:

- `"all_iowa": true` for a feed that carries nothing but Iowa. Its stories are taken as they come.
- `"iowa_link": "/teams/iowa-hawkeyes/"` for a site that files its Iowa stories under one address.

To drop a publisher that arrives by way of Google News, put its name in `"skip_sources"`.

Each sport has `"keywords"` that name it outright ("football") and looser `"hints"` (a coach, the
stadium). A headline is sorted by a keyword in the headline, then one in the story's address, then by the
sport its feed files it under, then by a hint, then by the search it came from, and last by a `"loose"`
word that only suggests a sport (the arena). Two more settings: `"plain"` is a sport's bare name shared
with another sport ("basketball"), which beats a search for a different sport; `"not_if"` lists words
that rule a sport out ("women" for men's basketball).

## The lines

The lines board reads The Odds API. Its key lives in the repository secret `ODDS_API_KEY` and is never
written to a page or a log. The free plan allows 500 credits a month, so lines are fetched at most every
fourteen hours and kept in `public/odds.json` between builds. If part of a fetch fails it is tried once
more three hours later, and then the fourteen hours come back. Without the key the board is simply empty.

## Schedules and results

The games strip on the front page and the Schedule card on each sport's page come from Iowa Athletics'
own schedule data: the public JSON address its schedule pages load (hawkeyesports.com/website-api). It
needs no key, and the site's robots.txt allows it. Only plain facts are shown (dates, opponents,
results, TV networks), each result linked to its official box score, with a credit beside them. A team
that cannot be read keeps the games it had last time (`public/schedules.json`, read back from the live
site). TV networks are known only by the name on their logo; a new one goes in `TV_NAMES` in build.py.

## Keeping it fresh

The workflow asks GitHub to rebuild twice an hour. GitHub runs scheduled workflows when it has room, and
for this repository that has meant a rebuild every few hours. Two more things to know:

- For a dependable half hour, have an outside timer (cron-job.org, for one) call the workflow's
  `workflow_dispatch` address every 30 minutes, with a token limited to this repository's Actions.
- GitHub switches a schedule off after 60 days with no commits. Push something, or press "Enable
  workflow" on the Actions page, to start it again.

If fewer than five headlines come back, or more than a third of the feeds cannot be read and there is
no earlier list to fill in from, the build stops and the last good site stays up. A feed that could
not be read shows as a warning on the run's page on GitHub.

## Put it online at rollcorn.com

1. Buy `rollcorn.com` at Porkbun.
2. Create a GitHub repository and push this folder to its `main` branch.
3. In the repository: Settings → Pages → Source: **GitHub Actions**.
4. Settings → Pages → Custom domain: `rollcorn.com`, then tick **Enforce HTTPS**
   once it is offered.
5. In Porkbun, open the domain's DNS records, delete the default parking
   records, and add:
   - `A` records for the bare domain to `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153`
   - a `CNAME` record for `www` pointing to `<your-github-username>.github.io`

## Ground rules the site follows

- Headlines and links only, each with its publisher's name. No article text, photos or thumbnails.
- No university logos, mascots, wordmarks, slogans or songs. The corn wheel, the field drawings and the
  game's art are original. Team names appear in plain text, to say who is playing.
- The site says it is independent: in its tagline, in the footer of every page, beside the lines and on
  the merch page.
- The lines are information. The site takes no bets, links to no sportsbook, and carries a problem
  gambling line. In the game, corn and spins cannot be bought and are worth nothing.
