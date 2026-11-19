/* Roll Corn: what the pages do once they have loaded. One file, nothing to install.
   Every part looks for its own markup and does nothing when it is not on the page. */
(function () {
  "use strict";
  var doc = document;
  // The site's own files are asked for beside this script, wherever the page is: the not-found page can
  // be shown at an address of any depth.
  var home = doc.currentScript && doc.currentScript.src ? doc.currentScript.src : location.href;
  function beside(name) { try { return new URL(name, home).href; } catch (e) { return name; } }
  function all(sel, el) { return [].slice.call((el || doc).querySelectorAll(sel)); }
  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function put(key, value) { try { localStorage.setItem(key, String(value)); } catch (e) {} }
  function count(n, one, many) { return n.toLocaleString("en-US") + " " + (n === 1 ? one : many); }
  var calm = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var q = doc.getElementById("q");
  // "?fresh=..." is only how the newest copy of a page was asked for (see the refresh pill); it is not part of the address
  try { if (/^\?fresh=\d+$/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}

  // ---------- times: "3 hours ago" under a headline, "3h" in the Latest column
  // Minutes and hours are counted; days go by the calendar, so "yesterday" means yesterday.
  var ago = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;
  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function times() {
    var nowD = new Date();
    all("time[datetime]").forEach(function (el) {
      var then = new Date(el.dateTime);
      if (isNaN(then)) return;
      if (!el.hasAttribute("data-tip")) {                        // the exact time, in the reader's own zone, on hover
        el.title = then.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
        el.setAttribute("data-tip", "");
      }
      var secs = Math.max(0, (nowD - then) / 1000), days = Math.round((midnight(nowD) - midnight(then)) / 864e5);
      var unit = secs < 3600 ? "minute" : days < 1 || secs < 43200 ? "hour" : "day";
      var n = unit === "minute" ? Math.floor(secs / 60) : unit === "hour" ? Math.floor(secs / 3600) : days;
      if (el.hasAttribute("data-short")) el.textContent = n + unit.charAt(0);
      else if (ago) el.textContent = n || unit !== "minute" ? ago.format(-n, unit) : "just now";
    });
  }
  times();
  setInterval(times, 60000);

  // ---------- new since the last visit
  // A visit lasts for as long as the reader keeps showing up: opening a page, scrolling, pressing a key,
  // with never more than half an hour between two of those. Everything the site has taken in since the
  // visit before this one counts as new on every page of this visit, however many pages are opened.
  var HALF_HOUR = 18e5, touched = 0;
  function touch() {
    var t = Date.now();
    if (t - touched < 60000) return 0;                          // once a minute is often enough to write it down
    var last = Math.max(touched, Number(get("rollcorn-visit-at")) || 0), line = Number(get("rollcorn-since")) || 0;
    if (!last || t - last > HALF_HOUR) {                        // a new visit: what the old one saw is the line
      line = Number(get("rollcorn-seen-at")) || Number(get("rollcorn-last-visit")) || 0;   // "rollcorn-last-visit" is the name this used before
      put("rollcorn-since", line);
    }
    touched = t;
    put("rollcorn-visit-at", t);
    return line;
  }
  // This page is drawn for the visit it was opened in. A reader who comes back to it after hours and then
  // follows a link has started a new visit, and the next page is drawn for that one.
  var since = touch();
  ["pointerdown", "keydown", "scroll"].forEach(function (type) { window.addEventListener(type, touch, { passive: true }); });

  // When the site first held each headline is written into the page by the build ("rc-data"), so the
  // count is of the whole site, not only of what this page happens to draw.
  var data = null;
  try { data = JSON.parse(doc.getElementById("rc-data").textContent); } catch (e) {}
  if (!data || !Array.isArray(data.sports) || !(data.at > 0)) data = null;
  var reads = !!(data && doc.querySelector("main .story, main .brief"));       // a page with headlines on it
  // What the reader has now seen is this page as it was built, not the moment they looked: a story that
  // came in after the build is still new to them next time. It takes three seconds in front of them to
  // count, and the mark never moves back, whatever older copy of a page a browser brings out.
  if (reads) {
    var seenIt = function () {
      if (doc.hidden) { doc.addEventListener("visibilitychange", look); return; }
      put("rollcorn-seen-at", Math.max(Number(get("rollcorn-seen-at")) || 0, data.at * 1000));
    };
    var look = function () {
      if (doc.hidden) return;
      doc.removeEventListener("visibilitychange", look);
      setTimeout(seenIt, 3000);
    };
    if (doc.hidden) doc.addEventListener("visibilitychange", look); else look();
  }
  function newer(than, d) {                                     // how many headlines the site took in after a moment, by sport
    d = d || data;
    var out = { all: 0, by: [] };
    d.sports.forEach(function (sp) {
      var n = (sp.ages || []).filter(function (age) { return (d.at - age) * 1000 > than; }).length;
      if (n) { out.all += n; out.by.push({ name: sp.name, page: sp.page, n: n }); }
    });
    out.by.sort(function (a, b) { return b.n - a.n; });
    return out;
  }
  function when(ms) {                                           // "2:40 PM", "yesterday at 6:12 PM", "Monday at 6:12 PM", "Nov 12"
    var d = new Date(ms), days = Math.round((midnight(new Date()) - midnight(d)) / 864e5);
    var clock = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return days <= 0 ? clock : days === 1 ? "yesterday at " + clock
      : days < 7 ? d.toLocaleDateString("en-US", { weekday: "long" }) + " at " + clock
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  // A story is new to the reader if the site first held it after their last visit. That moment is in
  // data-seen; where it is the story's own time, the time itself says it.
  function heldSince(t) { return Number(t.getAttribute("data-seen")) * 1000 || new Date(t.dateTime).getTime(); }
  var fresh = since && data ? newer(since) : null;
  if (since) {
    all(".story, .brief").forEach(function (el) {
      var t = el.querySelector("time[datetime]");
      if (t && heldSince(t) > since) el.classList.add("is-new");
    });
    all(".briefs, .stories.cols").forEach(function (list) {     // newest first: one line marks where the reader left off,
      var rows = [].slice.call(list.children), n = 0;           // when everything above it is new and nothing below is
      while (n < rows.length && rows[n].classList.contains("is-new")) n++;
      if (n && n < rows.length && !list.querySelector(".is-new ~ :not(.is-new) ~ .is-new")) rows[n].classList.add("was-here");
    });
  }

  // ---------- the Latest list: six headlines at a time, from the chosen sport, or only the new ones
  var briefs = all(".brief"), chips = all(".chip"), more = doc.getElementById("latest-more"), pick = "", STEP = 6, shown = STEP;
  var latest = doc.getElementById("latest"), lead = latest && latest.querySelector(".lead");
  function hold(on) {                                           // Beside a short list the top story stretches to the list's height.
    if (!lead || latest.classList.contains("is-open") === on) return;   // Once "More" makes the list long it keeps the height it has.
    lead.style.minHeight = on ? lead.offsetHeight + "px" : "";
    latest.classList.toggle("is-open", on);
  }
  function list() {
    var n = 0;
    briefs.forEach(function (b) {
      var ok = pick === "new" ? b.classList.contains("is-new") : !pick || b.getAttribute("data-sport") === pick;
      b.hidden = !(ok && n++ < shown);
    });
    if (more) more.hidden = n <= shown;                          // nothing further to show
  }
  if (more) more.addEventListener("click", function () {
    var was = shown;
    hold(true);
    shown += STEP; list();
    var next = briefs.filter(function (b) { return !b.hidden; })[was], a = next && next.querySelector("a");
    if (a) a.focus();                                            // the keyboard carries on from the first new row
  });
  function choose(sport) {
    pick = sport; shown = STEP;
    chips.forEach(function (o) {
      var on = o.getAttribute("data-sport") === sport;
      o.classList.toggle("is-on", on); o.setAttribute("aria-pressed", on ? "true" : "false");
    });
    hold(false);
    list();
  }
  chips.forEach(function (chip) {
    var sport = chip.getAttribute("data-sport");
    if (sport === "new") {
      var mine = briefs.filter(function (b) { return b.classList.contains("is-new"); }).length;
      if (!mine) return;
      chip.hidden = false;
      chip.textContent = "New (" + mine + ")";
    }
    chip.addEventListener("click", function () { choose(sport); });
  });

  // ---------- one line for a returning reader: what has come in since they were last here
  // The count is a button wherever the page has the search box: it lists every one of them (see search).
  var line = doc.getElementById("since"), showNew = null;
  if (line && fresh) {
    var say = doc.createElement("p"), tag = doc.createElement(q ? "button" : "span");
    say.className = "since-say";
    if (fresh.all) {
      tag.className = "since-tag"; tag.textContent = fresh.all + " new";
      if (q) {
        tag.type = "button";
        tag.setAttribute("aria-label", "Show the " + count(fresh.all, "new headline", "new headlines"));
        tag.addEventListener("click", function () { if (showNew) showNew(tag); });
      }
      line.appendChild(tag);
      say.textContent = "since " + when(since);
      line.appendChild(say);
      var where = doc.createElement("span");
      where.className = "since-where";
      fresh.by.slice(0, 5).forEach(function (sp) {
        var a = doc.createElement("a");
        a.href = sp.page; a.textContent = sp.name + " " + sp.n;
        where.appendChild(a);
      });
      line.appendChild(where);
    } else {
      line.classList.add("is-caught-up");
      say.textContent = "You are caught up. Nothing new since " + when(since) + ".";
      line.appendChild(say);
    }
    line.hidden = false;
  }

  // ---------- coming back to a tab that has been sitting: say what has come in, and offer to load it
  var updated = doc.querySelector(".updated");
  function stale() { return data ? Date.now() / 1000 - data.at : 0; }
  function light() { if (updated) updated.classList.toggle("is-stale", stale() > 2700); }      // the light is only live for 45 minutes
  light();
  setInterval(light, 60000);
  // The offer is made on pages that have headlines to show. Its place in the page is just after the bar,
  // so a keyboard comes to it early and a screen reader is told when it appears; it is drawn at the foot
  // of the window.
  var slot = null, bar0 = doc.querySelector(".jump"), asking = false, offered = false;
  if (reads && bar0 && bar0.parentNode) {
    slot = doc.createElement("div");
    slot.setAttribute("role", "status");
    bar0.parentNode.insertBefore(slot, bar0.nextSibling);
  }
  function check() {
    if (!slot || doc.hidden || asking || offered || stale() < 1200) return;
    asking = true;
    fetch(beside("latest.json") + "?" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      asking = false;
      if (!d || !Array.isArray(d.sports) || !(d.at > data.at + 60)) return;
      var n = newer(data.at * 1000, d).all;
      if (!n) return;
      offered = true;
      var pill = doc.createElement("button");
      pill.type = "button"; pill.className = "refresh";
      pill.textContent = count(n, "new headline", "new headlines") + ". Show";
      pill.addEventListener("click", function () {
        put("rollcorn-since", data.at * 1000);                   // what is new is what this page did not have
        // asked for by a new address, so no cache between here and the site can hand the old copy back
        location.replace(location.pathname + "?fresh=" + d.at + location.hash);
      });
      slot.appendChild(pill);
    }).catch(function () { asking = false; });
  }
  doc.addEventListener("visibilitychange", check);
  window.addEventListener("pageshow", function (e) { if (e.persisted) check(); });
  try {                                                          // Back can bring out a copy that is hours old
    if (performance.getEntriesByType("navigation")[0].type === "back_forward") check();
  } catch (e) {}

  // ---------- show more, on a sport's page
  all(".more-btn[data-reveal]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var hidden = all("[data-more]", btn.parentNode), first = hidden[0];
      hidden.forEach(function (el) { el.hidden = false; el.removeAttribute("data-more"); });
      btn.remove();
      var a = first && first.querySelector("a");
      if (a) a.focus();                                          // the keyboard carries on from the first new row
    });
  });

  // ---------- search: every headline the site holds, not only the ones on this page
  // The list is fetched the first time it is wanted. While there is a term, the page gives way to the
  // matches. The same panel lists everything new since the last visit when the count at the top is pressed.
  if (q) {
    var form = q.form, index = null, fetching = false, failed = false, failedAt = 0, timer = 0;
    var panel = null, rowsEl = null, saysEl = null, nameEl = null, backEl = null;
    var only = false, opener = null;                             // only: the panel is listing what is new, not what matches a term
    var fold = function (s) { return String(s).toLowerCase().replace(/[\u2018\u2019]/g, "'"); };   // either kind of apostrophe finds both
    var ask = function () {
      if (index || fetching || (failed && Date.now() - failedAt < 3000)) return;
      fetching = true; failed = false;
      fetch(beside("headlines.json")).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (rows) { fetching = false; index = (Array.isArray(rows) ? rows : []).filter(Array.isArray); find(); })
        .catch(function () { fetching = false; failed = true; failedAt = Date.now(); find(); });   // the next keystroke tries again
    };
    var heard = doc.createElement("p");                          // what a screen reader is told; it is on the page before it has anything to say
    heard.className = "visually-hidden"; heard.setAttribute("role", "status");
    doc.body.appendChild(heard);
    var shut = function () {                                     // leave the list of what is new
      if (!only) return;
      only = false; find();
      if (opener && doc.contains(opener)) opener.focus();
    };
    var frame = function () {
      panel = doc.createElement("section");
      panel.className = "plot search-results";
      panel.setAttribute("aria-labelledby", "h-search");
      panel.innerHTML = '<header class="plot-head"><h2 class="sign" id="h-search"></h2><p class="plot-meta"></p>' +
                        '<button class="search-back" type="button" hidden>Back to the page</button></header>' +
                        '<div class="plot-body"><ul class="stories cols"></ul></div>';
      var main = doc.querySelector("main");
      main.insertBefore(panel, main.firstChild);
      rowsEl = panel.querySelector("ul"); saysEl = panel.querySelector(".plot-meta");
      nameEl = panel.querySelector("h2"); backEl = panel.querySelector(".search-back");
      backEl.addEventListener("click", shut);
    };
    var row = function (r, marked) {                             // r is [headline, link, source, sport, time, sport id, first held]
      var li = doc.createElement("li"), kick = doc.createElement("p"), a = doc.createElement("a"),
          from = doc.createElement("p"), src = doc.createElement("span"), t = doc.createElement("time"), d = new Date(r[4]);
      li.className = "story" + (marked ? " is-new" : "");
      kick.className = "kicker"; kick.textContent = r[3];
      a.href = r[1]; a.rel = "noopener"; a.textContent = r[0];
      from.className = "from"; src.className = "source"; src.textContent = r[2];
      t.dateTime = r[4]; t.textContent = isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      from.appendChild(src); from.appendChild(doc.createTextNode(" ")); from.appendChild(t);
      li.appendChild(kick); li.appendChild(a); li.appendChild(from);
      return li;
    };
    var isNew = function (r) { return !!since && (Number(r[6]) * 1000 || new Date(r[4]).getTime()) > since; };
    var find = function () {
      var said = q.value.trim(), words = fold(said).split(/\s+/).filter(Boolean), MOST = 60, on = !!said || only;
      if (form) form.classList.toggle("has-term", !!said);
      doc.body.classList.toggle("is-searching", on);
      if (!on) {                                                 // the page comes back as it was
        if (panel) { panel.remove(); panel = null; }
        heard.textContent = "";
        return;
      }
      if (!panel) frame();
      nameEl.textContent = said ? "Search" : "New since " + when(since);
      backEl.hidden = !!said;
      if (!index) {
        rowsEl.textContent = "";
        saysEl.textContent = !failed ? "Looking…" : said ? "Search is not working right now." : "The list could not be loaded. Try again in a moment.";
        if (failed) heard.textContent = saysEl.textContent;
        return;
      }
      var hits = index.filter(said ? function (r) {
        var hay = fold(r[0] + " " + r[2] + " " + r[3]);
        return words.every(function (w) { return hay.indexOf(w) >= 0; });
      } : isNew);
      rowsEl.textContent = "";
      hits.slice(0, MOST).forEach(function (r) { rowsEl.appendChild(row(r, !!said && isNew(r))); });
      times();
      saysEl.textContent = !hits.length ? (said ? "Nothing matches. Try a name or a team." : "Nothing new since then.")
        : count(hits.length, "headline", "headlines") + (hits.length > MOST ? ", the newest " + MOST + " shown" : "");
      heard.textContent = (said ? "" : nameEl.textContent + ": ") + saysEl.textContent;
    };
    showNew = function (from) {
      opener = from; only = true;
      ask(); find();
      window.scrollTo(0, 0);
      if (backEl) backEl.focus({ preventScroll: true });
    };
    q.addEventListener("focus", ask);
    q.addEventListener("input", function () {
      if (q.value.trim()) only = false;                          // a term takes the panel over
      ask(); clearTimeout(timer); timer = setTimeout(find, 250);
    });
    q.addEventListener("keydown", function (e) { if (e.key === "Escape") { q.value = ""; find(); q.blur(); } });
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); ask(); find(); });
    doc.addEventListener("keydown", function (e) {              // "/" jumps to the search box, as on most news sites
      var el = doc.activeElement, typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); q.focus(); }
      if (e.key === "Escape" && only && !typing) shut();
    });
    if (q.value) { ask(); find(); }                              // a term the browser kept across a reload
  }

  // ---------- game times in the reader's own time zone, and the clock running down to the next one
  var kicks = all("[data-kick]"), clocks = all("[data-count]");
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  // The board gives a game's date and time in full. A tile on the strip has room for the day and the hour:
  // "Today, 6:00 PM", "Sat, 11:00 AM", and the date once the game is most of a week off.
  function kickTimes() {
    if (!window.Intl || !kicks.length) return;
    var day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
    var hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    var now = new Date();
    kicks.forEach(function (el) {
      var d = new Date(el.getAttribute("data-kick")), full = isNaN(d) ? "" : day.format(d) + ", " + hour.format(d), text = full;
      if (!full) return;
      if (el.hasAttribute("data-brief")) {
        text = (sameDay(d, now) ? "Today" : d - now < 6 * 864e5 ? d.toLocaleDateString("en-US", { weekday: "short" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })) +
               ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        el.title = full;
      }
      if (el.textContent !== text) el.textContent = text;
    });
  }
  kickTimes();
  setInterval(kickTimes, 60000);
  // The page may be hours old when it is read. A game that has started leaves the board, which is for games
  // to come; on the strip it reads "Underway" for four hours, about as long as a game lasts, and then goes too.
  var UNDERWAY = 4 * 3600;
  function started() {
    var t = Date.now();
    all(".game[data-start]").forEach(function (card) {
      if (new Date(card.getAttribute("data-start")).getTime() <= t) card.hidden = true;
    });
    all(".games").forEach(function (box) {
      if (box.querySelector(".game:not([hidden])")) return;
      box.hidden = true;
      var none = box.parentNode.querySelector(".odds-none"), help = box.parentNode.querySelector(".odds-help");
      if (none) none.hidden = false;
      if (help) help.hidden = true;
    });
  }
  var strip = doc.querySelector(".scores"), stripTag = strip && strip.querySelector(".scores-tag");
  function countdown() {
    var t = Date.now(), today = new Date(t), soon = false, lit = null;
    clocks.forEach(function (el) {
      var at = new Date(el.getAttribute("data-count")).getTime(), left = Math.floor((at - t) / 1000), tile = el.closest(".score");
      if (isNaN(at)) return;
      if (left <= -UNDERWAY) {                                    // long over: the tile goes, and the strip with the last of them
        var row = tile && tile.parentNode;
        if (tile) tile.hidden = true;
        if (row && !row.querySelector(".score:not([hidden])")) row.parentNode.hidden = true;
        return;
      }
      var d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
      var text = left <= 0 ? "Underway"
        : d >= 1 ? d + "d " + h + "h " + two(m) + "m"
        : calm ? (h ? h + "h " + two(m) + "m" : Math.max(1, m) + "m")
        : h ? h + "h " + two(m) + "m " + two(s) + "s" : m + "m " + two(s) + "s";
      if (el.textContent !== text) el.textContent = text;
      el.classList.toggle("is-live", left <= 0);
      if (left > 0 && d < 1) soon = true;
      if (tile && !lit && sameDay(new Date(at), today)) lit = tile;      // today's game: the first one still on the strip
    });
    if (strip) {                                                  // the day of a game looks like one, for as long as it is that day
      all(".score", strip).forEach(function (tile) { tile.classList.toggle("is-today", tile === lit); });
      strip.classList.toggle("is-gameday", !!lit);
      var word = lit ? "Game day" : "Lines";
      if (stripTag && stripTag.textContent !== word) stripTag.textContent = word;
    }
    return soon;
  }
  if (clocks.length) {
    var tick = function () { started(); setTimeout(tick, countdown() && !calm ? 1000 - Date.now() % 1000 : 30000); };
    tick();
  } else if (doc.querySelector(".game[data-start]")) {
    started();
    setInterval(started, 30000);
  }

  // ---------- the Hang Time band says where this reader's own game stands
  // The numbers are read from what the game saved in this browser. The daily spins follow the game's own
  // rule (hang-time.js, "daily spins"): three, and one more for each day in a row, up to seven.
  var band = doc.getElementById("promo-line");
  if (band) {
    var num = function (key) { return Math.max(0, Math.floor(Number(get(key)) || 0)); };
    var dayKey = function (back) {
      var d = new Date(Date.now() - back * 864e5);
      return "rollcorn-hang-day-" + d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    };
    var best = num("rollcorn-hang-bestscore"), spins = num("rollcorn-hang-spins"), pot = num("rollcorn-hang-pot");
    if (num("rollcorn-hang-played") || best) {
      var last = get("rollcorn-hang-spinday"), parts = [];
      if (last !== dayKey(0)) {
        var run = last === dayKey(1) ? Math.min(99, num("rollcorn-hang-streak") + 1) : 1;
        parts.push((run > 1 ? "Day " + run + " in a row: " : "Today: ") + Math.min(7, 2 + run) + " free spins are waiting.");
      } else if (spins) {
        parts.push(count(spins, "spin is", "spins are") + " waiting.");
      }
      if (pot >= 300) parts.push("The jackpot is at " + pot.toLocaleString("en-US") + ".");
      else if (best) parts.push("Your best is " + best.toLocaleString("en-US") + ".");
      if (parts.length) band.textContent = parts.join(" ");
    }
  }

  // ---------- on a narrow screen the bar is scrolled so the page being read can be seen in it
  var bar = doc.querySelector(".jump-sports"), here = bar && bar.querySelector("a[aria-current]");
  if (bar) {
    var edges = function () {                                    // the bar fades at whichever end has more to show
      bar.classList.toggle("more-left", bar.scrollLeft > 4);
      bar.classList.toggle("more-right", bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4);
    };
    if (here) {
      var left = here.offsetLeft - bar.offsetLeft, room = bar.clientWidth - 40;
      if (left + here.offsetWidth > bar.scrollLeft + room) bar.scrollLeft = left + here.offsetWidth - room;
    }
    bar.addEventListener("scroll", edges, { passive: true });
    window.addEventListener("resize", edges);
    edges();
  }

  // ---------- back to top, and the corn wheels that roll as the page scrolls
  var top = doc.querySelector(".totop"), ears = all(".ear"), queued = false;
  function scrolled() {
    queued = false;
    if (top) top.classList.toggle("is-up", window.scrollY > 900);
    if (calm) return;
    var turn = "rotate(" + (window.scrollY * 0.45).toFixed(1) + "deg)";
    ears.forEach(function (ear) { ear.style.transform = turn; });       // set on the wheels alone, so nothing else is restyled
  }
  window.addEventListener("scroll", function () {
    if (!queued) { queued = true; requestAnimationFrame(scrolled); }
  }, { passive: true });
  scrolled();
})();
