# Roll Corn

Iowa sports headlines, gathered from around the web. An independent fan site,
not affiliated with the University of Iowa.

## What is here

| File | What it does |
|---|---|
| `feeds.json` | The list of news sources, the sports, and the keywords that sort a headline into a sport. Edit this to add or remove sources. |
| `build.py` | Pulls every feed and writes `public/index.html`. Standard Python only, nothing to install. |
| `template.html` | The page layout. |
| `public/style.css` | The look: colors, type, spacing. |
| `.github/workflows/update.yml` | Rebuilds and republishes the page twice an hour on GitHub. |

## Rebuild the page on this Mac

```bash
python3 build.py
```

Then open `public/index.html` through the preview, or run
`python3 -m http.server 8923 --directory public` and visit http://localhost:8923.

## Add a source

Add a line to `"feeds"` in `feeds.json`:

```json
{"name": "Site name", "url": "https://example.com/feed/"}
```

Add `"must_mention": ["iowa", "hawkeye"]` for a site that also covers other
teams, so only Iowa stories come through. To drop a publisher that arrives by
way of Google News, put its name in `"skip_sources"`.

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

The page then rebuilds itself about every 30 minutes. If every feed fails at
once, the build stops and the last good page stays up.

## Ground rules the site follows

- Headlines and links only. No article text or photos are copied.
- No university logos or marks. The yellow-sign look is original.
- The footer says the site is independent.
