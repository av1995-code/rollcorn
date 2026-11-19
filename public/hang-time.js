// Hang Time: keep the punt in the air.
// Tap to punt, then keep tapping to stay up. Fly between the wall and the stadium
// clouds, stay away from the returners who jump for the ball, and pick up
// corn. Hang time is the score. One touch and the punt is down; one tap and
// the next one is in the air.
(function () {
  var canvas = document.getElementById("cc-field");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var btn = document.getElementById("cc-go");
  var statusEl = document.getElementById("cc-status");
  var scoreEl = document.getElementById("cc-score");
  var bestEl = document.getElementById("cc-best");
  var kernEl = document.getElementById("cc-kernels");
  var potEl = document.getElementById("cc-pot");
  var ballsEl = document.getElementById("cc-balls");
  var soundBtn = document.getElementById("cc-sound");
  var shareBtn = document.getElementById("cc-share");
  var spinBtn = document.getElementById("cc-spin");
  var keepBtn = document.getElementById("cc-keep");
  var doubleBtn = document.getElementById("cc-double");
  var typeEl = document.getElementById("cc-type");
  var goalEl = document.getElementById("cc-goal"), earEl = {};   // the cob still fills; it is just no longer on the board
  var nemEl = document.getElementById("cc-nemesis");
  var mandala = document.getElementById("cc-mandala");
  var mandalaNote = document.getElementById("cc-mandala-note");
  var saveBtn = document.getElementById("cc-save");

  var GOLD = "#FFCD00", INK = "#000", TURF = "#3FA34D", TURF_DARK = "#2F8F41", HUSK = "#22753A", RED = "#D7261E";
  var DISPLAY = '"Antonio", "Roboto Condensed", "Arial Narrow", sans-serif';
  var LABEL = '"Roboto Condensed", "Arial Narrow", sans-serif';
  // The score. Hang time is the heart of it; everything else is a way to add to it.
  var POINTS = { second: 10, kernel: 5, bigKernel: 25, uprights: 30, close: 10, perfect: 50, good: 15 };
  var RANKS = [[0, "Warming up"], [150, "Finding your leg"], [400, "Good hang"],
               [900, "Great hang"], [2000, "Punting is winning"]];
  // What the game says when a punt comes down. It is always on the player's side.
  var KIND = ["Good try. You have another one in you.", "Nice effort. Shake it off.", "That is how you learn the wind.",
              "Every punt teaches you something.", "You are getting the feel of it.", "Good swing. Go again."];
  var BALLS = [
    { id: "football", name: "Football", need: 0 },
    { id: "popcorn", name: "Popcorn ball", need: 30 },
    { id: "cob", name: "Corn cob", need: 100 },
    { id: "gold", name: "Gold ball", need: 250 },
    { id: "pig", name: "Pigskin", need: 500 },
    { id: "dog", name: "Corn dog", need: 1000 }
  ];

  // Everything is drawn on a field 480 units tall; the width follows the screen.
  var VH = 480, GY = 408, TURF_H = 62, R = 10, YARD = 12;
  // GY is only the top edge of the grass in the picture. Everyone stands half way down it, at FEET, and
  // that is the ground for the ball as well: FLOOR is the ball's centre when it lies there. Whatever
  // stands on the field measures its height up from BASE, so a thing is as tall as it is drawn.
  var FEET = GY + TURF_H * 0.5, FLOOR = FEET - R, BASE = FLOOR + 6;
  var MAN = 60;                                        // how tall a standing player is drawn, feet to helmet
  var BED = FEET - 18;                                 // the bed of the mascot's trampoline
  var GRAV = 1350, TAP = -430, PUNT = -640;
  var SPIN = 1.5;                                      // seconds each spin of the slots takes
  var W = 960, H = 480, U = 1, VW = 960, BX = 270;

  function load(key) { try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; } }
  function loadText(key) { try { return localStorage.getItem(key) || ""; } catch (e) { return ""; } }
  function save(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }
  var best = load("rollcorn-hang-best");               // longest hang time, in seconds
  var bestPts = load("rollcorn-hang-bestscore");       // best score, in points
  var bank = load("rollcorn-hang-kernels");            // kernels picked up so far
  var earned = load("rollcorn-hang-earned") || bank;   // the count that unlocks balls
  var pot = load("rollcorn-hang-pot") || 150;          // the slots jackpot: a share of every spin goes into it
  var ballId = loadText("rollcorn-hang-ball") || "football";
  var muted = load("rollcorn-coffin-muted") === 1;
  var COB = 40;                                        // kernels it takes to fill the ear in the corner
  var cob = load("rollcorn-hang-cob") % COB;
  var BEAT = 0.3185;                                   // half the time between taps when the ball is held level
  var NOTES = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];   // a scale to climb, one kernel at a time
  function dayKey(back) {
    var d = new Date(Date.now() - (back || 0) * 864e5);
    return "rollcorn-hang-day-" + d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function dayStats(back) {                            // total seconds, punts and best for a day
    var parts = loadText(dayKey(back)).split(",");
    return { sum: Number(parts[0]) || 0, count: Number(parts[1]) || 0, best: Number(parts[2]) || 0 };
  }
  // How each of the last twenty punts was played: enough to say what kind of punter this is,
  // and what keeps bringing them down.
  var hist = [];
  try { hist = JSON.parse(loadText("rollcorn-hang-hist") || "[]"); } catch (e) { hist = []; }
  var typeWait = 0;                                    // punts in a row that have read as a different type
  var ptype = loadText("rollcorn-hang-type");          // the punter's type, once ten punts are in
  var nem = loadText("rollcorn-hang-nem");             // their nemesis: what downs them most
  var nemFree = load("rollcorn-hang-nemfree");         // punts in a row not lost to it
  var CAUSES = {
    "Blocked by the wall": { code: "C", name: "the wall", color: "#B9B5A5" },
    "Picked off by the returner": { code: "R", name: "the returner", color: "#8A1F1F" },
    "Flag on the play": { code: "W", name: "the flags", color: "#FFD400" },
    "Hit by their punt": { code: "K", name: "their punts", color: "#8B4A1E" },
    "Bounced by the mascot": { code: "M", name: "the mascot", color: "#6FBF4A" },
    "Corn bombed by the mascot": { code: "M", name: "the mascot", color: "#6FBF4A" },
    "Landed on the bench": { code: "H", name: "the bench", color: "#3D6FB5" },
    "Doinked off the upright": { code: "P", name: "the uprights", color: "#D9A300" },
    "Downed": { code: "G", name: "the ground", color: "#8B5A2B" }
  };
  if (nem && !{ C: 1, R: 1, W: 1, K: 1, M: 1, H: 1, P: 1, G: 1 }[nem]) { nem = ""; nemFree = 0; }   // an obstacle that no longer exists
  function causeOf(code) { for (var k in CAUSES) if (CAUSES[k].code === code) return CAUSES[k]; return null; }
  var TYPES = {
    gambler: ["The Gambler", "You go for the big ears."],
    steady: ["The Steady Hand", "Your taps keep an even beat."],
    storm: ["The High Flyer", "You like it up where the air is thin."],
    low: ["The Low Flyer", "You skim the helmets."],
    collector: ["The Collector", "You do not leave corn behind."],
    natural: ["The Natural", "You play it as it comes."]
  };
  // read the last ten punts and pick the trait that stands out most
  function readType() {
    var last = hist.slice(-10);
    if (last.length < 10) return "";
    var seen = 0, taken = 0, y = 0, cv = 0, cvN = 0, kern = 0, secs = 0;
    last.forEach(function (h) { seen += h.bs; taken += h.bt; y += h.y; kern += h.k; secs += h.t; if (h.cv >= 0) { cv += h.cv; cvN++; } });
    var scores = {
      gambler: seen >= 4 ? (taken / seen - 0.4) / 0.3 : -1,
      steady: cvN >= 4 ? (0.34 - cv / cvN) / 0.1 : -1,
      storm: (215 - y / last.length) / 30,
      low: (y / last.length - 240) / 30,
      collector: (kern / Math.max(secs, 1) - 0.75) / 0.25
    };
    var pick = "natural", top = 0.5;
    for (var k in scores) if (scores[k] > top) { top = scores[k]; pick = k; }
    return pick;
  }
  var punts = 0;                                       // punts this visit
  var lastPts = 0;                                     // what the punt before this one scored, this visit
  var held = false;                                    // finger, mouse button or key is down
  var superNext = false;                               // won on the slots: the next punt is a super punt
  var SUPER = { secs: 6, speed: 380, smash: 20, bonus: 100 };
  var doubleNext = false;                              // won on the slots: the next punt scores double
  var freeHelmet = false;                              // won on the slots: the next punt starts with a helmet

  var S = null;                                        // the current punt
  var now = 0, shake = 0, tod = 0, flash = 0, zoom = 0, cheerAt = -9, sparkAt = -9;
  var particles = [], floaters = [], clouds = [], stars = [];
  for (var c = 0; c < 2; c++) clouds.push({ x: Math.random() * 1400, y: 30 + Math.random() * 150, s: 0.6 + Math.random() * 0.7 });
  for (var st = 0; st < 30; st++) stars.push({ x: Math.random(), y: Math.random() * 0.7, r: 0.6 + Math.random() * 1.2, p: Math.random() * 6 });

  function reset() {
    S = { phase: "intro", t: 0, y: FLOOR - 24, vy: 0, dist: 0, speed: 0, spin: 0,
          obs: [], kernels: [], helmets: [], crows: [], refs: [], trail: [], nextX: 0, lastC: 300, count: 0, highT: 0, puntAt: 16,
          got: 0, gates: 0, wait: 0, freeze: 0, crowAt: 20, shield: false, safe: 0,
          pts: 0, mult: 1, superT: 0, smashed: 0, bestPtsWas: bestPts, kick: "", closes: 0, bigs: 0,
          bestWas: best, passedBest: false, passedLong: false, newBest: false, unlocked: "", cause: "", kind: "",
          taps: [], ySum: 0, bigSeen: 0, bigTaken: 0, typeLine: "", beat: false, dreamNem: "",
          rw: 1, rewindFrom: 0, dreamAt: 0, dreaming: 0, kwave: 0,
          floatLeft: 0, floating: false, closeRun: 0,
          combo: 0, slowT: 0, sq: 0, star: null, cow: null, todayBest: dayStats(0).best,
          newSpins: 0, br: {}, q: 0, beatT: 0, beatN: 0 };
  }

  // ---------- sound: a few synthesized blips, no files ----------

  var AC = null;
  function audio() {
    if (muted) return null;
    if (!AC) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      try { AC = new Ctor(); } catch (e) { return null; }
    }
    if (AC.state === "suspended") AC.resume();
    return AC;
  }
  function tone(freq, dur, type, vol, slide, delay) {
    var ac = audio(); if (!ac) return;
    var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function thud(vol) {
    var ac = audio(); if (!ac) return;
    var len = Math.floor(ac.sampleRate * 0.18), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 500;
    g.gain.value = vol || 0.4;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
  }
  function buzz(ms) {
    // the browser only allows a buzz once the player has really touched the page
    try { if (!muted && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) {}
  }
  var sfx = {
    kick: function () { tone(170, 0.22, "sine", 0.35, 45); thud(0.35); buzz(20); },
    kernel: function (n) { tone(900 + 70 * Math.min(n || 0, 12), 0.09, "triangle", 0.05); },
    note: function (n) { tone(NOTES[Math.min(n, NOTES.length) - 1] || NOTES[0], 0.14, "triangle", 0.07); },
    moo: function () { tone(150, 0.55, "sawtooth", 0.035, 98); },
    power: function () { [660, 880, 1320].forEach(function (f, i) { tone(f, 0.14, "square", 0.07, 0, i * 0.06); }); },
    saved: function () { tone(220, 0.25, "square", 0.1, 660); thud(0.4); buzz(60); },
    gate: function () { cheerAt = now; [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.2, "triangle", 0.16, 0, i * 0.07); }); buzz(40); },
    mark: function () { tone(523, 0.12, "triangle", 0.14); tone(784, 0.18, "triangle", 0.14, 0, 0.1); },
    hit: function () { tone(220, 0.3, "sine", 0.12, 110); thud(0.3); buzz(40); },
    over: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.26, "triangle", 0.12, 0, i * 0.15); }); }
  };

  // the machine's own voice: a lever, ticking reels, a bell for each stop, coins for a win
  var slotSfx = {
    lever: function () { thud(0.22); tone(150, 0.2, "sawtooth", 0.045, 70); for (var i = 0; i < 5; i++) tone(1500 - i * 90, 0.014, "square", 0.03, 0, 0.04 + i * 0.03); },
    tick: function (n, rising) { tone(rising ? 520 + rising * 620 : 700 + (n % 3) * 55, 0.022, "triangle", rising ? 0.05 : 0.028); },
    stop: function (i) { var f = [392, 494, 587][i] || 587; tone(f, 0.18, "triangle", 0.13); tone(f * 2, 0.1, "sine", 0.05); thud(0.18); buzz(10); },
    coins: function (n, from) { for (var i = 0; i < n; i++) tone((i % 2 ? 1568 : 1319) * (1 + (i % 5) * 0.03), 0.08, "triangle", 0.07, 0, (from || 0) + i * 0.065); },
    win: function (pay) { [523, 659, 784].forEach(function (f, i) { tone(f, 0.14, "triangle", 0.12, 0, i * 0.06); }); slotSfx.coins(clamp(Math.round(pay / 5), 3, 12), 0.2); buzz(25); },
    boost: function () { tone(330, 0.32, "square", 0.05, 1320); [659, 831, 988, 1319].forEach(function (f, i) { tone(f, 0.16, "triangle", 0.11, 0, 0.26 + i * 0.07); }); tone(1319, 0.5, "sine", 0.06, 0, 0.56); buzz(40); },
    jackpot: function () {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.2, "triangle", 0.15, 0, i * 0.09); });
      slotSfx.coins(22, 0.7); tone(1047, 0.9, "sine", 0.08, 0, 0.7); buzz(120);
    },
    miss: function () { tone(330, 0.16, "sine", 0.06, 262); },
    token: function () { tone(1319, 0.07, "triangle", 0.1); tone(1976, 0.18, "triangle", 0.1, 0, 0.07); buzz(15); },
    land: function (n) { tone(1400 + (n % 6) * 90, 0.035, "triangle", 0.045); },
    keep: function () { tone(1568, 0.06, "square", 0.045); tone(2093, 0.3, "triangle", 0.09, 0, 0.07); slotSfx.coins(3, 0.12); },
    doubled: function (n) { var k = Math.pow(2, n / 6); [523, 659, 784, 1047].forEach(function (f, i) { tone(f * k, 0.16, "triangle", 0.13, 0, i * 0.06); }); slotSfx.coins(4 + n * 2, 0.28); },
    gone: function () { tone(294, 0.22, "sine", 0.08, 196); tone(196, 0.35, "sine", 0.06, 147, 0.2); }
  };

  // ---------- layout ----------

  function resize() {
    var w = canvas.clientWidth || 960;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = w;
    H = Math.round(w < 620 ? Math.min(w * 1.15, 560) : Math.max(400, w * 0.5));
    canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    U = H / VH;
    VW = W / U;
    BX = Math.max(96, VW * 0.26);   // on a narrow screen the ball sits farther left, to see more of what is coming
    ctx.setTransform(dpr * U, 0, 0, dpr * U, 0, 0);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(a, b, t) {
    var out = "#";
    for (var i = 1; i < 7; i += 2) {
      var v = Math.round(lerp(parseInt(a.substr(i, 2), 16), parseInt(b.substr(i, 2), 16), clamp(t, 0, 1)));
      out += (v < 16 ? "0" : "") + v.toString(16);
    }
    return out;
  }
  function rank(secs) {
    var at = 0;
    for (var i = 0; i < RANKS.length; i++) if (secs >= RANKS[i][0]) at = i;
    return RANKS[at][1];
  }
  // where the field has scrolled to after t seconds in the air
  function distAt(t) {
    var cap = 150 / 3.2;
    return t <= cap ? 210 * t + 1.6 * t * t : 210 * cap + 1.6 * cap * cap + 360 * (t - cap);
  }

  // ---------- the punt ----------

  // The kicking gauge runs whenever the ball is on the punter's foot. It sweeps up and back about
  // once a second; the gold band near the top is the sweet spot.
  var SWEET = 0.86;
  // A soft start for new players, the same idea as the lucky start on the slots: the first punts are
  // kinder (a wider sweet spot, a slower ball, more room, a helmet), easing to the normal game by punt twelve.
  var ROOKIE = { until: 12, helmets: 3 };
  var played = Math.max(load("rollcorn-hang-played"), hist.length);
  function rookieAt(n) { return clamp(1 - n / ROOKIE.until, 0, 1); }
  function sweetHalf() { return 0.07 + 0.08 * rookieAt(played); }
  function gaugeNow() { return 0.5 - 0.5 * Math.cos(now * 5.4); }
  // every point is filed under where it came from, so the final score can be shown as a sum
  function addPts(n, why) { n *= (S.mult || 1); S.pts += n; S.br[why || "bonus"] = (S.br[why || "bonus"] || 0) + n; }

  // Lives: a game is three punts. The score carries from one to the next, and the game ends with the third.
  // Blockers, won on the slots: for a while three teammates run out in front, flatten whatever stands
  // in the way and swat flags and punts out of the air.
  var BLOCK = { secs: 10, knock: 15, swat: 10 };
  var WIND = 10;                                       // seconds of tailwind
  // Quarters: a punt is played in fifteen-second quarters. Each one ends with a bonus and a moment of open field,
  // and the day moves on: dusk by halftime, night by the final whistle. After four it is overtime.
  var QUARTER = { secs: 15, bonus: [50, 75, 100, 200], overtime: 100 };
  function quarterName(q) { return q < 4 ? "Q" + (q + 1) : "OT"; }
  function endQuarter(q) {
    var pay = q <= 4 ? QUARTER.bonus[q - 1] : QUARTER.overtime;
    addPts(pay);
    S.nextX = Math.max(S.nextX, S.dist + VW + 300);        // a breather before the next one starts
    var gold = q === 2 || q === 4;                         // halftime and the final whistle each pay a golden spin
    if (gold) goldSpin();
    floaters.push({ text: (q === 1 ? "END OF 1ST QUARTER" : q === 2 ? "HALFTIME" : q === 3 ? "END OF 3RD QUARTER" : q === 4 ? "FINAL WHISTLE" : "OVERTIME") + "  +" + pay * S.mult + (gold ? "  \u00B7  GOLDEN SPIN" : ""), life: -0.5, color: GOLD });
    sfx.gate(); burst(BX, S.y, 24); shake = Math.max(shake, 5);
  }
  // Spins are earned inside one punt, and each costs more than the last, so the third is a real punt's work.
  var SPIN_AT = [150, 400, 800];
  function spinsFor(pts) { var n = 0; while (n < SPIN_AT.length && pts >= SPIN_AT[n]) n++; return n; }
  var spinsBanked = 0;
  var xp = load("rollcorn-hang-xp");
  function levelNeed(n) { return 300 * n * (n + 1) / 2; }                 // total points to finish level n: 300, 900, 1800, 3000 ...
  function levelOf(v) { var n = 1; while (v >= levelNeed(n)) n++; return n; }
  // The nearest thing this punt just missed, if it was close: that is the reason to go again.
  function nearMiss() {
    var got = S.pts - S.base, n = spinsFor(got), best = null, rel, d;
    if (n < SPIN_AT.length) {
      d = SPIN_AT[n] - got; rel = d / (SPIN_AT[n] - (n ? SPIN_AT[n - 1] : 0));
      if (rel < 0.3) best = { rel: rel, text: "Just " + Math.ceil(d) + " points from " + (n ? "another" : "a") + " spin" };
    }
    d = QUARTER.secs - S.t % QUARTER.secs; rel = d / QUARTER.secs;
    if (rel < 0.25 && (!best || rel < best.rel)) best = { rel: rel, text: d.toFixed(1) + " seconds from " + (S.q === 1 ? "halftime" : S.q >= 3 ? "the whistle" : "the end of the quarter") };
    d = levelNeed(levelOf(xp)) - xp; rel = d / (300 * levelOf(xp));
    if (rel < 0.2 && (!best || rel < best.rel)) best = { rel: rel, text: "Only " + Math.ceil(d) + " points from level " + (levelOf(xp) + 1) };
    return best ? best.text : "";
  }
  var LIVES = 3, lives = LIVES, carry = 0, extraLives = 0, gameLives = LIVES, gamePunts = [];
  var gameFeed = 0, gameSpins = 0, gameGolds = 0;      // what this game has put into the machine: corn in the jackpot, spins, golden spins
  // One power-up in the hand at a time. A slot win or a catch on the field puts it in the pocket; the space bar
  // (or a tap on its badge) uses it, whenever the player chooses, while the ball is up. A good run on the
  // machine is never wasted: up to two more wait on the sideline, and the next steps up once the hand is free.
  var diving = false;                                  // down arrow, or a drag downward: the ball drops fast
  var KIT = 3;
  var kit0 = loadText("rollcorn-hang-kit").replace(/[^HSBPUT]/g, "").slice(0, KIT);
  var pocket = kit0.charAt(0), rack = kit0.slice(1).split("");
  function kitSave() { save("rollcorn-hang-kit", pocket + rack.join("")); }
  function gain(code) {                                // where it went: 1 the hand, 2 or 3 the sideline, 0 no room
    var at = 0;
    if (!pocket) { pocket = code; at = 1; }
    else if (rack.length < KIT - 1) { rack.push(code); at = rack.length + 1; }
    if (at) kitSave();
    return at;
  }
  function stepUp() { if (!pocket && rack.length) { pocket = rack.shift(); kitSave(); return true; } return false; }
  var POWERS = { H: "HELMET", S: "SUPER PUNT", B: "BLOCKERS", P: "CORN MAGNET", U: "BIG UPRIGHTS", T: "TAILWIND" };
  function usePower() {
    if (S.phase !== "play" || !pocket || paused) return;
    var code = pocket; pocket = ""; S.stepT = 0; kitSave();
    if (code === "H") S.shield = true;
    else if (code === "B") { S.blockT = BLOCK.secs; S.knocked = S.knocked || 0; }
    else if (code === "P") S.magnet = true;
    else if (code === "U") S.wide = true;
    else if (code === "T") S.windT = WIND;
    else if (code === "S") {                                // a huge boot: it rockets downfield and nothing can stop it
      S.superT = SUPER.secs; S.kick = "super"; S.vy = Math.min(S.vy, TAP); S.safe = SUPER.secs + 1.2;
      addPts(SUPER.bonus);
      fireworks(); shake = 16; flash = 0.8;
      tone(110, 0.5, "sawtooth", 0.14, 440); thud(0.6);
    }
    floaters.push({ text: POWERS[code] + (code === "S" ? "!  +" + SUPER.bonus * S.mult : code === "T" ? ": HOLD TO STAY UP" : "!"), life: -0.4, color: GOLD });
    burst(BX, S.y, code === "S" ? 60 : 16);
    sfx.power();
  }
  var blockNext = false;                               // won on the slots: three blockers run with the next punt
  function start() {
    slotWrapUp(); flights.length = 0;
    reset();
    if (lives <= 0 && extraLives > 0 && carry > 0) {       // a life won on the machine: the same game goes on
      lives = extraLives; gameLives += extraLives; extraLives = 0; S.cont = true;
      gameFeed = 0; gameSpins = 0; gameGolds = 0;
    } else if (lives <= 0) {                               // a new game
      lives = LIVES + extraLives; gameLives = lives; extraLives = 0; carry = 0;
      gameFeed = 0; gameSpins = 0; gameGolds = 0;
    }
    stepUp();
    S.base = carry; S.pts = carry;
    punts += 1;
    S.rookie = rookieAt(played);
    if (mercyNext || shortRun()) { S.rookie = Math.max(S.rookie, 0.6); S.mercy = true; mercyNext = false; }   // a kinder punt after a rough patch
    if (played < ROOKIE.helmets) S.shield = true;          // the first few punts start with a helmet on
    S.puntAt = QUARTER.secs * 3 + 1;                       // the other team only punts back in the fourth quarter
    played += 1; save("rollcorn-hang-played", played);
    // A dream punt: rare and never announced. For ten seconds everything gets out of the way.
    if (punts > 3 && Math.random() < 0.04) S.dreamAt = 3 + Math.random() * 4;
    particles.length = 0; floaters.length = 0;
    S.phase = "play";
    // the kick: how well the tap was timed against the gauge
    var g = gaugeNow();
    if (Math.abs(g - SWEET) <= 0.07 + 0.08 * S.rookie) {
      S.kick = "perfect"; S.vy = PUNT * 1.14; S.safe = 1.6; S.pts += POINTS.perfect * (doubleNext ? 2 : 1); S.br.bonus = POINTS.perfect * (doubleNext ? 2 : 1);
      burst(BX, FEET - 34, 26); shake = 7; cheerAt = now;
      floaters.push({ text: "PERFECT PUNT  +" + POINTS.perfect, life: 0, color: GOLD });
      tone(660, 0.12, "triangle", 0.12); tone(990, 0.2, "triangle", 0.12, 0, 0.09);
    } else if (g >= 0.5) {
      S.kick = "good"; S.vy = PUNT * (0.9 + 0.2 * (g - 0.5)); S.pts += POINTS.good * (doubleNext ? 2 : 1); S.br.bonus = POINTS.good * (doubleNext ? 2 : 1);
    } else {
      S.kick = "soft"; S.vy = PUNT * (0.62 + 0.5 * g);          // a soft one: it comes off low, and there is work to do
    }
    if (doubleNext) { S.mult = 2; doubleNext = false; }    // won on the slots: this punt scores double
    if (lives === 1 && carry > 0) {                        // the last life: everything on it counts double
      S.mult += 1; S.lastLife = true;
      floaters.push({ text: "LAST LIFE: DOUBLE POINTS", life: -0.6, color: GOLD });
    }
    S.speed = 210 - 30 * S.rookie;
    S.nextX = BX + 520 + 160 * S.rookie;
    shareBtn.hidden = true;
    sfx.kick();
    dust(BX - 4, FEET - 2, 8); divot(BX - 2, FEET, 6);
    label("Tap!");
    say("The punt is up. Keep tapping to keep it in the air.");
    board();
  }

  var paused = false;
  function pause() { if (S.phase === "play" && !paused) { paused = true; held = false; diving = false; label("Resume"); say("Paused. Tap to keep going."); } }
  function resume() {                                      // back in, with the ball given a lift and a moment's grace
    paused = false;
    S.vy = Math.min(S.vy, TAP * 0.7); S.safe = Math.max(S.safe, 0.9); S.floatLeft = 0.9;
    label("Tap!"); say("The punt is up. Keep tapping to keep it in the air.");
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });
  window.addEventListener("blur", pause);
  document.addEventListener("keydown", function (e) {
    if (e.key === "p" || e.key === "P" || e.key === "Escape") { if (paused) resume(); else pause(); }
  });
  function tap() {
    audio();
    if (paused) { resume(); return; }
    lastInput = now;
    if (S.phase === "intro" || (S.phase === "over" && S.wait > 0.25)) {
      if (slotVisible()) { putAway(); return; }            // first the machine steps aside, then the punter gets the tap
      if (now - awayAt < 0.35) return;
      start(); return;
    }
    if (S.phase !== "play") return;
    S.vy = TAP;
    S.floatLeft = 0.9;
    S.sq = 1;
    S.taps.push(S.t);
    buzz(6);
  }

  function spawn() {
    var t = S.t, n = ++S.count, x = S.nextX;
    var step = S.speed * BEAT * (t < 12 ? 5 : t < 35 ? 4 : 3);   // five, then four, then three half-beats apart
    var rk = S.rookie || 0;
    step *= 1 + 0.35 * rk;                                       // more room between them for a new player
    var q = Math.min(3, Math.floor(t / QUARTER.secs));           // 1st: walls and benches. 2nd: returners and flags. 3rd: mascots. 4th: everything, and blitzes
    var beat = n > 8 && rk < 0.5 && q >= 3 ? (n - 9) % 9 : -1, blitz = beat >= 5 && beat <= 7, breather = beat === 8;
    if (blitz) step = S.speed * BEAT * 2.6;
    if (breather) {                                              // open field after a blitz, with a line of kernels to take
      step *= 2;
      for (var kb = 1; kb <= 4; kb++) S.kernels.push({ x: x + 40 + step * kb / 5, y: 230 + Math.sin(kb * 1.3) * 50, got: false, ph: kb });
    }
    if (n > 3 && !S.cow && Math.random() < 0.06) S.cow = { x: x - step * 0.5, mooed: false };
    var roll = Math.random();
    var kind = n % 6 === 0 ? "gate" : q >= 2 && roll < (q === 2 ? 0.3 : 0.18) ? "mascot" : q >= 1 && n > 2 && roll < 0.55 ? "jump" : n > 2 && roll < 0.75 ? "bench" : "wall";
    // `reach` is how high this one stands; each is within a tap or two of the last
    var reach = clamp(S.lastC + (Math.random() * 2 - 1) * 150, 120, BASE - 80), o, ky;
    if (n <= 2) reach = Math.max(reach, BASE - 150);             // the first two are easy
    reach += (Math.max(reach, BASE - 170) - reach) * rk;         // and a new player meets shorter ones
    if (kind === "gate") {
      reach = clamp(reach, 180, BASE - 110);
      o = { kind: kind, x: x, w: 34, bot: reach, tip: reach - (S.wide ? 210 : 105) };   // crossbar at `bot`, uprights up to `tip`
      ky = reach - 52;
    } else if (kind === "jump") {
      o = { kind: kind, x: x, w: 48, bot: BASE, apex: 88 + Math.random() * 150, jy: 0, jv: 0, st: 0 };   // a returner who leaps as the ball arrives; apex is how far his feet leave the grass
      reach = FEET - MAN - o.apex; ky = reach - 34;
    } else if (kind === "mascot") {
      o = { kind: kind, x: x, w: 44, bot: BASE, hi: 130 + Math.random() * 100, sp: 3 + Math.random() * 0.8, ph: Math.random() * 6, jy: 0 };   // on a trampoline
      reach = BASE - 62 - o.hi; ky = BASE - 62 - o.hi * 0.5;
    } else if (kind === "bench") {
      reach = BASE - 62;
      o = { kind: kind, x: x, w: 120, bot: reach };
      ky = reach - 34;
      S.kernels.push({ x: x + 30, y: ky, got: false, ph: Math.random() * 6 });
    } else {
      reach = Math.min(reach, FEET - 104);                         // never fewer than two men: one alone would have to be stretched to fill it
      o = { kind: kind, x: x, w: 48, bot: reach };
      ky = reach - 36;
    }
    // a kernel sits just over the top of each one; some are big, and closer still
    if (kind !== "gate" && Math.random() < 0.3 + 0.3 * rk) S.kernels.push({ x: x + o.w / 2, y: ky + 14, got: false, big: true, ph: Math.random() * 6 });
    else S.kernels.push({ x: x + (kind === "bench" ? 90 : o.w / 2), y: ky, got: false, ph: Math.random() * 6 });
    if (S.mercy && n === 2) S.kernels.push({ x: x - step * 0.45, y: clamp(S.lastC - 80, 90, BASE - 120), got: false, ph: 0, spin: true });   // and a golden ear early on
    if (n > 3 && Math.random() < 0.045) S.kernels.push({ x: x - step * 0.45, y: clamp(S.lastC - 90 + (Math.random() - 0.5) * 120, 70, BASE - 110), got: false, ph: Math.random() * 6, spin: true });
    if (n % 9 === 5 || (n > 6 && n % 9 === 1)) {                 // something to catch: a helmet, or now and then another boost
      var pk = n % 9 === 5 && Math.random() < 0.55 ? "H" : "PTB".charAt(Math.floor(Math.random() * 3));
      S.helmets.push({ x: x - step / 2, y: (S.lastC + reach) / 2 - 70, ph: Math.random() * 6, kind: pk });
    }
    if (n > 4 && n % 9 !== 5 && S.dreaming <= 0 && q >= 1 && Math.random() < 0.28 * (1 - rk)) S.refs.push({ x: x - step / 2, st: 0, wind: 0 });
    if (beat === 5) o.blitz = true;                              // first of the three: blow the whistle when it gets close
    if (S.dreaming > 0) o.dream = true;
    S.obs.push(o);
    S.lastC = reach;
    S.nextX += step + (kind === "bench" ? 70 : 0);
  }

  // every kernel goes into the ear in the corner; a full ear pops and pays, then starts again
  function fillCob(n) {
    cob += n;
    if (cob >= COB) {
      cob -= COB;
      if (S.phase === "play") S.got += 50;                 // mid-punt it counts with the punt; otherwise it is banked at once
      else { bank += 50; earned += 50; save("rollcorn-hang-kernels", bank); save("rollcorn-hang-earned", earned); }
      sfx.gate();
      burst(VW / 2, 120, 40);
      floaters.push({ text: "FULL EAR  +50", life: 0, color: GOLD });
    }
    save("rollcorn-hang-cob", cob);
    earEl.textContent = cob + " / " + COB;
  }

  function fireworks() {
    var colors = [GOLD, "#FF6B5E", "#7FD4FF", "#FFFFFF"];
    for (var f = 0; f < 3; f++) {
      var fx = VW * (0.3 + f * 0.2), fy = 110 + Math.random() * 70, col = colors[f % colors.length];
      for (var i = 0; i < 26; i++) {
        var a = Math.PI * 2 * i / 26, v = 90 + Math.random() * 70;
        particles.push({ kind: "fw", x: fx, y: fy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: -f * 0.22, max: 1.1, size: 2.6, col: col });
      }
    }
  }

  function hitRect(cx, cy, r, x, y, w, h) {
    var nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h);
    return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < r * r;
  }

  // What can be hit, as rectangles on the field: the same shapes each thing is drawn to, so nothing
  // stops the ball where nothing is drawn. The collision and the test overlay both read this.
  function boxes(o) {
    var mid = o.x + o.w / 2, y, tall, n, each;
    if (o.kind === "jump") { y = FEET - o.jy; return [[mid - 11, y - 40, 22, 40], [mid - 14, y - MAN, 28, 24]]; }          // body, helmet
    if (o.kind === "mascot") { y = BED - o.jy; return [[mid - 14, y - 62, 28, 62], [mid - 34, BED - 3, 68, FEET - BED + 3]]; }   // the ear, and the trampoline under it
    if (o.kind === "gate") return [[o.x, o.bot - 3, o.w, 6], [mid - 4, o.bot, 8, BASE - o.bot + 40]];                  // crossbar, post
    if (o.kind === "bench") return [[o.x, o.bot, 92, BASE - o.bot + 40], [o.x + 94, o.bot + 22, o.w - 94, BASE - o.bot + 18]];   // the players, and the lower cooler
    tall = FEET - o.bot; n = Math.max(1, Math.round(tall / 60)); each = tall / n;                                      // a wall: the top man is narrower than the men under him
    if (n < 2) return [[mid - 16, o.bot, 32, BASE - o.bot + 40]];
    return [[mid - 16, o.bot, 32, each], [o.x, o.bot + each - 6, o.w, BASE - o.bot - each + 46]];
  }
  function touches(o, bx, by) {
    var b = boxes(o);
    for (var i = 0; i < b.length; i++) if (hitRect(bx, by, R - 2, b[i][0], b[i][1], b[i][2], b[i][3])) return true;
    return false;
  }
  var debugBoxes = false;                              // the test hook can outline them

  function die(cause) {
    S.phase = "dead";
    S.cause = cause;
    S.wait = 0;
    S.freeze = 0.13;
    S.diedAt = now;
    if (cause === "Downed") { thud(0.3); dust(BX, FEET, 10); divot(BX, FEET, 14); }     // it comes down on the grass
    else { S.bamAt = now; S.bamY = S.y; }
    if (S.vy < 0) S.vy = 0;
    shake = 6; flash = 0.25;
    sfx.hit();
    burst(BX, S.y, 6);
    label("Down", true);
  }

  // ---------- Kernel slots, built around a set return to player (RTP)
  //
  // Spins are earned on the field (150, 400 and 800 points in a punt), never bought, so there is no real
  // stake. To give RTP a meaning, every spin is treated as being worth STAKE kernels, and the machine is
  // set so that over the long run it pays back RTP of that.
  //
  // Three things tie the machine to the field, and all three sit outside those sums, as extras the player
  // earns by playing: a golden spin (a spin that cannot miss) for a golden ear, halftime, the final whistle
  // or a new best; every ear caught on the field added to the jackpot as well as to the player's pile; and
  // power-ups won here carried onto the field, three at most, one in the hand at a time.
  //
  // Where the return comes from:
  //   1. the jackpot: its seed, times the chance of hitting it, plus the share of every spin's
  //      stake that is fed into the pot (all of which is paid out eventually)
  //   2. the ordinary wins in WINS, in the proportions given by their weights
  // The paytable and the jackpot numbers are fixed. The one thing solved for is `hit`, the chance
  // that a spin which is not the jackpot lands an ordinary win. slotMath() works that out from RTP.
  var SLOTS = {
    stake: 15,             // what one spin is counted as being worth, in kernels
    rtp: 0.95,             // the target: 95 kernels back for every 100 kernels of spins, over the long run
    jackpotChance: 0.02,   // one spin in fifty
    jackpotSeed: 150,      // what the pot goes back to after it is won
    jackpotFeed: 0.15,     // the share of each spin's stake added to the pot
    helmetValue: 20,       // what a free helmet is counted as being worth
    superValue: 40,        // what a super punt is counted as being worth
    blockValue: 35,        // blockers for the next punt
    lifeValue: 35          // an extra life
  };
  var REEL = "KFPHCSBLUTG";   // kernel, football, popcorn, helmet, the Roll Corn mark (jackpot), super punt
  var WINS = [
    { syms: "PPP", pay: 0, magnet: true, weight: 6, text: "CORN MAGNET READY" },
    { syms: "UUU", pay: 0, wide: true, weight: 6, text: "BIG UPRIGHTS READY" },
    { syms: "TTT", pay: 0, wind: true, weight: 6, text: "TAILWIND READY" },
    { syms: "HHH", pay: 0, helmet: true, weight: 6, text: "HELMET READY" },
    { syms: "FFF", pay: 25, weight: 10, text: "+25 CORN, 2X POINTS NEXT PUNT" },
    { syms: "KKK", pay: 15, weight: 12, text: "+15 CORN" },
    { syms: "SSS", pay: 0, superPunt: true, weight: 5, text: "SUPER PUNT READY" },
    { syms: "BBB", pay: 0, blockers: true, weight: 8, text: "BLOCKERS READY" },
    { syms: "LLL", pay: 0, life: true, weight: 4, text: "EXTRA LIFE" },
    { syms: "GGG", pay: 0, bonus: true, weight: 9, text: "BONUS KICK" },
    { pair: true, pay: 5, weight: 30, text: "PAIR  +5 CORN" }
  ];
  // what a prize that is not kernels is counted as being worth, for the return sums
  var BOOSTS = { helmet: SLOTS.helmetValue, superPunt: SLOTS.superValue, blockers: SLOTS.blockValue, life: SLOTS.lifeValue, magnet: 30, wide: 25, wind: 25, bonus: 15 };
  var KICK = { perfect: 30, good: 15, short: 5 };       // what the bonus kick pays; a fair kicker averages about fifteen
  function boostValue(o) { for (var k in BOOSTS) if (o[k]) return BOOSTS[k]; return 0; }
  function takeWin(sp, win) { sp.pay = win.pay; sp.text = win.text; for (var k in BOOSTS) sp[k] = !!win[k]; }
  var RESPIN = 0.18;      // the chance a respun reel completes the three: an even trade for the pair
  var forced = "";        // testing only
  function slotMath(rtp) {
    var weights = 0, value = 0;
    WINS.forEach(function (w) { weights += w.weight; value += w.weight * (boostValue(w) || w.pay); });
    var avgWin = value / weights;                                               // what an ordinary win is worth on average
    var fromJackpot = SLOTS.jackpotSeed * SLOTS.jackpotChance + SLOTS.stake * SLOTS.jackpotFeed;
    var need = rtp * SLOTS.stake - fromJackpot;                           // what ordinary wins have to return per spin
    var hit = clamp(need / avgWin / (1 - SLOTS.jackpotChance), 0, 1);           // chance of a win on a spin that is not the jackpot
    var back = fromJackpot + (1 - SLOTS.jackpotChance) * hit * avgWin;
    return { hit: hit, weights: weights, rtp: back / SLOTS.stake, hitRate: SLOTS.jackpotChance + (1 - SLOTS.jackpotChance) * hit };
  }
  var MATH = slotMath(SLOTS.rtp);

  // A lucky start, in three parts, so a new player wins early and is never dropped off a cliff:
  //   spins 1 to 3   are set: three footballs (25), three kernels (15), then three popcorn (50).
  //                  That is 90 kernels, enough to unlock the first new ball on the spot.
  //   spins 4 to 10  run at a 130% return, which pays about 96 times in 100.
  //   spins 11 to 25 ease down, a little each spin, from 130% to the normal rate.
  // Nothing on the page mentions this, and nothing on the page states a return rate either.
  var WELCOME = { script: ["FFF", "KKK", "PPP"], hot: 10, rtp: 1.3, until: 25 };
  var spun = load("rollcorn-hang-spun");               // spins this player has ever pulled
  function rtpAt(n) {                                  // the return the machine is set to on a player's nth spin (counting from 0)
    if (n < WELCOME.hot) return WELCOME.rtp;
    if (n >= WELCOME.until) return SLOTS.rtp;
    return WELCOME.rtp - (WELCOME.rtp - SLOTS.rtp) * (n - WELCOME.hot) / (WELCOME.until - WELCOME.hot);
  }
  function spinOnce(m, nth) {
    nth = nth === undefined ? spun : nth;
    m = m || (nth < WELCOME.until ? slotMath(rtpAt(nth)) : MATH);
    var all = REEL, sp = { pay: 0 };
    pot += SLOTS.stake * SLOTS.jackpotFeed;
    if (forced) {                                                               // testing only: set through the hook at the foot of the file
      var fs = forced, fw; forced = "";
      for (fw = 0; fw < WINS.length; fw++) if (WINS[fw].syms === fs) { sp.syms = fs; takeWin(sp, WINS[fw]); return sp; }
      if (fs === "CCC") { sp.syms = fs; sp.pay = Math.floor(pot); sp.big = true; sp.text = "JACKPOT  +" + sp.pay.toLocaleString("en-US"); pot = pot - sp.pay + SLOTS.jackpotSeed; return sp; }
      sp.syms = fs;
      if (fs.charAt(0) === fs.charAt(1) || fs.charAt(1) === fs.charAt(2) || fs.charAt(0) === fs.charAt(2)) {
        takeWin(sp, WINS[WINS.length - 1]); sp.pair = true;
        sp.odd = fs.charAt(0) === fs.charAt(1) ? 2 : fs.charAt(0) === fs.charAt(2) ? 1 : 0; sp.pairSym = fs.charAt(sp.odd === 0 ? 1 : 0);
      } else sp.text = "NO MATCH";
      return sp;
    }
    if (nth < WELCOME.script.length) {                                          // one of the three set spins
      for (var w = 0; w < WINS.length; w++) if (WINS[w].syms === WELCOME.script[nth]) { sp.syms = WINS[w].syms; takeWin(sp, WINS[w]); }
      return sp;
    }
    if (Math.random() < SLOTS.jackpotChance) {
      sp.syms = "CCC"; sp.pay = Math.floor(pot); sp.big = true; sp.text = "JACKPOT  +" + sp.pay.toLocaleString("en-US");
      pot = pot - sp.pay + SLOTS.jackpotSeed;
      return sp;
    }
    var a = Math.floor(Math.random() * REEL.length), b = (a + 1 + Math.floor(Math.random() * (REEL.length - 1))) % REEL.length, c = a, order;
    if (Math.random() < m.hit) {
      var pick = Math.random() * m.weights, win = WINS[WINS.length - 1];
      for (var i = 0; i < WINS.length; i++) { pick -= WINS[i].weight; if (pick < 0) { win = WINS[i]; break; } }
      takeWin(sp, win);
      if (win.pair) {                                                           // two the same and one odd, never three ears
        var oi = Math.floor(Math.random() * 3);
        order = [[a, a, b], [a, b, a], [b, a, a]][oi];
        sp.pair = true; sp.pairSym = all.charAt(a); sp.odd = 2 - oi;
        sp.syms = all.charAt(order[0]) + all.charAt(order[1]) + all.charAt(order[2]);
      } else sp.syms = win.syms;
    } else {                                                                    // a miss: three different symbols, picked evenly, never a teased near-win
      do { c = Math.floor(Math.random() * REEL.length); } while (c === a || c === b);
      order = [[a, b, c], [b, c, a], [c, a, b]][Math.floor(Math.random() * 3)];
      sp.syms = all.charAt(order[0]) + all.charAt(order[1]) + all.charAt(order[2]);
      sp.text = "NO MATCH";
    }
    return sp;
  }
  // for checking the maths: spin n times with a pot of its own and report what actually came back
  function tripleValue(sym) {
    for (var i = 0; i < WINS.length; i++) if (WINS[i].syms === sym + sym + sym) return boostValue(WINS[i]) || WINS[i].pay;
    return 0;
  }
  function measureRtp(n, rtp, respin) {
    var m = rtp ? slotMath(rtp) : MATH;
    var keep = pot, paid = 0, wins = 0;
    pot = SLOTS.jackpotSeed;
    for (var i = 0; i < n; i++) {
      var sp = spinOnce(m, 9999);
      paid += sp.pay + boostValue(sp);
      if (sp.pay || boostValue(sp)) wins++;
      if (respin && sp.pair && sp.pairSym !== "C") {                            // give up the pair, take the one-in-six shot
        paid -= sp.pay;
        if (Math.random() < RESPIN) paid += tripleValue(sp.pairSym);
      }
    }
    paid += pot - SLOTS.jackpotSeed;                                            // what is still sitting in the pot is owed to players
    pot = keep;
    return { spins: n, rtp: paid / (n * SLOTS.stake), hitRate: wins / n, designed: m.rtp, designedHitRate: m.hitRate };
  }
  // what a new player's first `count` spins come to, averaged over many new players
  function measureStart(players, count) {
    var keep = pot, perSpin = [], wins = [], i, n;
    for (n = 0; n < count; n++) { perSpin[n] = 0; wins[n] = 0; }
    for (i = 0; i < players; i++) {
      pot = SLOTS.jackpotSeed;
      for (n = 0; n < count; n++) {
        var sp = spinOnce(null, n), got = sp.pay + boostValue(sp);
        perSpin[n] += got; if (got) wins[n]++;
      }
    }
    pot = keep;
    return { players: players, avgPay: perSpin.map(function (v) { return Math.round(v / players * 10) / 10; }),
             winRate: wins.map(function (v) { return Math.round(v / players * 100); }) };
  }

  // ---------- playing the slots
  // Spins are banked and wait for the player. A pull decides the result there and then (that is
  // what keeps the RTP honest); tapping again stops the reels sooner but cannot change what they
  // land on. A win can be kept or put on a fair coin flip, double or nothing, up to four times.
  // The flip is even money, so it leaves the return to player where it was.
  var spins = load("rollcorn-hang-spins");
  // A golden spin cannot miss. They are won on the field, not bought and not handed out by the clock:
  // a golden ear caught, halftime reached, the final whistle, a new best score.
  var golds = Math.min(load("rollcorn-hang-golds"), spins);
  function goldSpin() {
    spins += 1; golds += 1;
    if (S && S.phase === "play") S.golds = (S.golds || 0) + 1;
    save("rollcorn-hang-spins", spins); save("rollcorn-hang-golds", golds);
  }
  var ui = { state: "idle", sp: null, t: 0, stopAt: [0, 0, 0], stopped: 3, pend: 0, doubles: 0, msg: "" };
  var PANEL = { w: 280, h: 206, y: 270 };
  // The stake: one, two or three spins on a pull. Every prize is multiplied to match, so the return is the same.
  ui.bet = 1;
  function betScale(sp) {
    var b = ui.betNow || 1;
    if (b <= 1) return;
    if (sp.big) sp.pay += (b - 1) * SLOTS.jackpotSeed;
    else if (sp.pay > 0) sp.pay *= b;
    else if (boostValue(sp) && !sp.bonus) sp.pay = boostValue(sp) * (b - 1);      // a power-up cannot be doubled, so the rest comes as corn
    if (sp.pay > 0 && sp.text) sp.text = /\+[\d,]+/.test(sp.text) ? sp.text.replace(/\+[\d,]+/, "+" + sp.pay.toLocaleString("en-US")) : sp.text + "  +" + sp.pay + " CORN";
  }
  // The harvest: every pull and every win adds to a track with five rewards along it. Finish it and it starts again, a little longer.
  var HARVEST = [{ at: 100, spins: 2, text: "2 SPINS" }, { at: 250, corn: 50, text: "50 CORN" }, { at: 450, gold: true, text: "GOLDEN SPIN" },
                 { at: 700, boost: true, text: "POWER-UP" }, { at: 1000, spins: 5, text: "5 SPINS" }];
  var hv = loadText("rollcorn-hang-harvest").split("|"), hvLevel = parseInt(hv[0], 10) || 0, hvPts = parseFloat(hv[1]) || 0;
  function hvAt(i) { return Math.round(HARVEST[i].at * (1 + 0.25 * hvLevel)); }
  function hvNext() { for (var i = 0; i < HARVEST.length; i++) if (hvPts < hvAt(i)) return i; return HARVEST.length - 1; }
  function harvestAdd(n) {
    var before = hvPts, i, r;
    hvPts += n;
    for (i = 0; i < HARVEST.length; i++) {
      if (before < hvAt(i) && hvPts >= hvAt(i)) {
        r = HARVEST[i];
        if (r.spins) spins += r.spins;
        if (r.corn) { bank += r.corn; earned += r.corn; ui.tally = (ui.tally || 0) + r.corn; }
        if (r.gold) { spins += 1; golds += 1; }
        var gift = r.boost ? "BSPTUH".charAt(Math.floor(Math.random() * 6)) : "", giftAt = gift ? gain(gift) : 0;
        if (gift && !giftAt) { gift = ""; spins += 2; }                    // no room on the sideline: two spins instead
        ui.reward = "REWARD:  " + (gift ? POWERS[gift] : r.boost ? "2 SPINS" : r.text); ui.rewardNow = now;
        if (gift) fly(gift, VW / 2, PANEL.y + 193, "kit" + giftAt);
        if (r.corn) { flyCorn(8, VW / 2, PANEL.y + 193, "corn"); bankAt = now + FLY; }
        slotSfx.boost(); popcorn(14, 0.7);
        if (i === HARVEST.length - 1) { hvLevel += 1; hvPts = 0; }
      }
    }
    save("rollcorn-hang-harvest", hvLevel + "|" + hvPts.toFixed(0)); save("rollcorn-hang-spins", spins); save("rollcorn-hang-golds", golds);
    save("rollcorn-hang-kernels", bank); save("rollcorn-hang-earned", earned);
  }
  // Spins come back on their own: one every ten minutes, while there are fewer than five.
  var REFILL = { ms: 600000, cap: 5 };
  var refillAt = load("rollcorn-hang-refill") || Date.now();
  function refill() {
    var t = Date.now();
    if (spins >= REFILL.cap) { refillAt = t; return; }
    while (t - refillAt >= REFILL.ms && spins < REFILL.cap) { spins += 1; refillAt += REFILL.ms; save("rollcorn-hang-spins", spins); }
    save("rollcorn-hang-refill", refillAt);
  }
  function refillText() {
    if (spins >= REFILL.cap) return "";
    var left = Math.max(0, REFILL.ms - (Date.now() - refillAt)), m = Math.floor(left / 60000), sec = Math.floor(left / 1000) % 60;
    return "FREE SPIN IN " + m + ":" + (sec < 10 ? "0" : "") + sec;
  }
  // Keeping a player who is drifting. The game cannot read minds; it can see five things, and it leans their way on each:
  //   a dry run on the machine, a run of short punts, games getting worse through a session, a long pause at
  //   game over, and coming back after days away. None of it is announced.
  var CARE = { dryFrom: 4, drySure: 7, hotRtp: 1.3, shortSecs: 6, idleSecs: 20, awayDays: 3 };
  var dry = 0, hotLeft = 0, mercyNext = false, idleGift = false, lastInput = 0, games = [];
  function careMath() {                                    // the odds for the next pull, or nothing if no help is due
    if (dry >= CARE.drySure) return { hit: 1, weights: MATH.weights };
    if (dry >= CARE.dryFrom) return { hit: Math.min(1, MATH.hit + 0.15 * (dry - CARE.dryFrom + 1)), weights: MATH.weights };
    if (hotLeft > 0) return slotMath(CARE.hotRtp);
    return null;
  }
  function shortRun() {                                    // the last three punts all came down early
    var last = hist.slice(-3);
    return last.length === 3 && last.every(function (h) { return h.t < CARE.shortSecs; });
  }
  var seen = load("rollcorn-hang-seen");
  if (seen && Date.now() - seen >= CARE.awayDays * 864e5) {              // back after a few days: extra spins, and a warm machine
    spins += 3; hotLeft = 10; save("rollcorn-hang-spins", spins);
    ui.msg = "WELCOME BACK:  3 SPINS"; ui.daily = true;
  }
  save("rollcorn-hang-seen", Date.now());
  var SHOW = "CBSLPTUHGFK";                             // the order the prize list turns over in
  var PRIZE = { B: "BLOCKERS", S: "SUPER PUNT", L: "EXTRA LIFE", P: "CORN MAGNET", T: "TAILWIND", U: "BIG UPRIGHTS", H: "HELMET", G: "BONUS KICK", F: "+25 CORN AND 2X POINTS", K: "+15 CORN" };
  var meter = load("rollcorn-hang-meter") % 10;        // pulls toward the next free spin
  var streak = load("rollcorn-hang-streak");
  if (loadText("rollcorn-hang-spinday") !== dayKey(0)) {                 // daily spins: three, and one more for each day in a row, up to seven
    streak = loadText("rollcorn-hang-spinday") === dayKey(1) ? Math.min(99, streak + 1) : 1;
    var daily = Math.min(7, 2 + streak);
    spins += daily;
    save("rollcorn-hang-spinday", dayKey(0)); save("rollcorn-hang-spins", spins); save("rollcorn-hang-streak", streak);
    ui.msg = streak > 1 ? "DAY " + streak + ":  " + daily + " SPINS" : daily + " DAILY SPINS"; ui.daily = true;
  }
  refill();
  var markImg = new Image();                           // the Roll Corn mark: on the machine's sign, and as the jackpot symbol
  markImg.src = "mark-512.png";
  function mark(cx, cy, size) {
    if (markImg.complete && markImg.naturalWidth) ctx.drawImage(markImg, cx - size / 2, cy - size / 2, size, size);
    else cornEar(cx, cy + size * 0.45, size * 0.9);      // until the picture has loaded
  }

  // Leaving the machine: it settles whatever is on the reels, slides off, and the field is the punter's again.
  var away = false, awayAt = -9;
  function putAway() {
    slotWrapUp();
    away = true; awayAt = now; ui.auto = false;
    tone(300, 0.14, "sine", 0.06, 160);
    label("Punt");
    say("Back to the field. Tap when the arrow is on the gold to punt." + (spins > 0 ? " Your " + spins + (spins === 1 ? " spin is" : " spins are") + " saved." : ""));
    board();
  }
  function slotTime() { return S.phase === "intro" || (S.phase === "over" && lives <= 0); }   // never between lives: the next punt is one tap away
  function slotVisible() { return !away && slotTime() && (spins > 0 || ui.state !== "idle" || ui.sp); }
  function slotDom() {
    var show = !away && slotTime();
    var turning = ui.state === "spinning" || ui.state === "respin" || ui.state === "flip", choosing = ui.state === "double" || ui.state === "pair";
    spinBtn.hidden = !(show && (turning || ui.state === "kick" || (ui.state === "idle" && spins > 0)));
    spinBtn.textContent = ui.state === "kick" ? "Kick!" : turning ? "Stop the reel" : (golds > 0 ? "Golden spin" : "Spin" + (Math.min(ui.bet, spins) > 1 ? " x" + Math.min(ui.bet, spins) : "")) + " (" + spins + " left)";
    keepBtn.hidden = doubleBtn.hidden = !(show && choosing);
    keepBtn.textContent = "Keep " + ui.pend + " corn";
    doubleBtn.textContent = ui.state === "pair" ? "Try for three of a kind" : "Double or nothing";
  }
  function pull() {
    if (spins <= 0) return;
    golds = Math.min(golds, spins);
    ui.gold = golds > 0;                                   // golden spins go first, and one at a time
    ui.betNow = ui.gold ? 1 : Math.max(1, Math.min(ui.bet, spins));
    spins -= ui.betNow;
    if (ui.gold) { golds -= 1; save("rollcorn-hang-golds", golds); }
    var care = careMath();
    ui.sp = ui.gold ? spinOnce({ hit: 1, weights: MATH.weights }) : care ? spinOnce(care) : spinOnce();
    if (hotLeft > 0) hotLeft -= 1;
    betScale(ui.sp);
    harvestAdd(10 * ui.betNow);
    spun += 1; save("rollcorn-hang-spun", spun);
    ui.daily = false;
    var tease = ui.sp.syms.charAt(0) === ui.sp.syms.charAt(1);        // two the same: the last reel takes its time
    ui.t = 0; ui.stopped = 0; ui.state = "spinning"; ui.tease = tease;
    ui.pullNow = now; ui.stopNow = [0, 0, 0];
    ui.stopAt = ui.auto ? [0.3, 0.5, 0.7 + (tease ? 0.6 : 0)] : [0.7, 1.15, 1.6 + (tease ? 0.8 : 0)];
    save("rollcorn-hang-spins", spins); save("rollcorn-hang-pot", pot);
    slotSfx.lever();
    say("The reels are spinning. Tap the machine to stop them.");
    board();
  }
  function stopReel() {                                              // sooner, not different
    if (ui.stopped < 3) ui.stopAt[ui.stopped] = Math.min(ui.stopAt[ui.stopped], ui.t);
  }
  function settle() {
    var sp = ui.sp;
    var won = sp.helmet ? "H" : sp.superPunt ? "S" : sp.blockers ? "B" : sp.magnet ? "P" : sp.wide ? "U" : sp.wind ? "T" : "", wonAt = won ? gain(won) : 0;
    if (won && !wonAt) {                                   // no room on the sideline: it is paid in corn instead
      sp.pay += boostValue(sp); for (var bk in BOOSTS) sp[bk] = false;
      sp.text = "SIDELINE FULL  +" + sp.pay + " CORN"; won = "";
    }
    if (sp.life && lives <= 0) sp.text = "EXTRA LIFE: YOUR GAME GOES ON";
    ui.msg = sp.text; ui.quietAt = now;
    harvestAdd((sp.big ? 150 : sp.pay + boostValue(sp)) * (sp.pay > 0 || sp.big ? 1 : ui.betNow || 1));
    dry = sp.big || sp.pay > 0 || boostValue(sp) ? 0 : dry + 1;
    ui.streak = dry ? 0 : (ui.streak || 0) + 1;
    if (ui.streak === 2) { ui.reward = "2 WINS IN A ROW"; ui.rewardNow = now; }
    if (ui.streak >= 3) {
      ui.streak = 0; spins += 1; save("rollcorn-hang-spins", spins);
      ui.reward = "3 IN A ROW:  +1 SPIN"; ui.rewardNow = now;
      popcorn(12, 0.6);
    }
    if (sp.big) popcorn(80, 2.4);
    else if (sp.syms.charAt(0) === sp.syms.charAt(1) && sp.syms.charAt(1) === sp.syms.charAt(2)) popcorn(24, 1.0);
    if (won) flyWin(won, "kit" + wonAt);                   // the prize is seen going to the sideline
    if (sp.big || sp.pay > 0 || boostValue(sp)) { cheerAt = now; if (sp.big || !sp.pair) sparkAt = now; }     // and the crowd saw it too
    if (sp.bonus) {                                        // three tees: the prize is whatever the player kicks
      ui.state = "kick"; ui.kickAt = now; ui.winNow = now;
      slotSfx.boost(); burst(VW / 2, PANEL.y + 70, 24);
      say("Bonus kick! Tap when the arrow is on the gold.");
      board();
      return;
    }
    if (sp.life) {
      if (lives > 0) { if (lives < 5) { lives += 1; gameLives += 1; flyWin("L", "lives"); } }
      else { if (extraLives < 2) flyWin("L", "lives"); extraLives = Math.min(2, extraLives + 1); label("Keep going"); }      // at game over: the same game goes on
    }
    if (sp.syms === "FFF") { doubleNext = true; flyWin("F", "next"); }
    ui.winNow = sp.pay || boostValue(sp) ? now : -9;
    if (sp.big) {
      bank += sp.pay; earned += sp.pay;
      ui.tally = (ui.tally || 0) + sp.pay;
      flyCorn(16, VW / 2, PANEL.y + 99, "corn"); bankAt = now + FLY;
      slotSfx.jackpot(); burst(VW / 2, PANEL.y + 70, 90); shake = 14; flash = 1; fireworks();
      ui.state = "idle";
    } else if (sp.pay > 0) {
      ui.pend = sp.pay; ui.doubles = 0;
      ui.state = sp.pair && sp.pairSym !== "C" ? "pair" : "double";       // a pair can be respun; three of a kind can be doubled
      slotSfx.win(sp.pay);
      if (sp.pay >= 25) { burst(VW / 2, PANEL.y + 70, 30); shake = 5; }
    } else {
      ui.state = "idle";
      if (boostValue(sp)) { slotSfx.boost(); burst(VW / 2, PANEL.y + 70, 24); } else slotSfx.miss();
      if (sp.superPunt) { burst(VW / 2, PANEL.y + 70, 60); shake = 10; fireworks(); }
    }
    save("rollcorn-hang-kernels", bank); save("rollcorn-hang-earned", earned); save("rollcorn-hang-pot", pot);
    say("Corn slots: " + sp.text.toLowerCase().replace(/\s+/g, " ") + "." + (ui.state === "double" ? " Keep it, or double or nothing?" : ui.state === "pair" ? " Keep it, or give it up to respin the odd reel?" : ""));
    board(); buildBalls();
  }
  // Give up the pair for one more turn of the odd reel. It has six symbols, so the chance of
  // completing the three is one in six, and the average prize for doing so is thirty: an even trade.
  function respin() {
    if (ui.state !== "pair") return;
    var sp = ui.sp, other;
    ui.pend = 0; sp.pay = 0;
    if (Math.random() < RESPIN) ui.landing = sp.pairSym;
    else { do { other = REEL.charAt(Math.floor(Math.random() * REEL.length)); } while (other === sp.pairSym); ui.landing = other; }
    ui.state = "respin"; ui.t = 0; ui.until = 1.3;
    ui.pullNow = now;
    slotSfx.lever();
    say("The odd reel is spinning again.");
    board();
  }
  function landRespin() {
    var sp = ui.sp, i;
    sp.syms = sp.syms.substr(0, sp.odd) + ui.landing + sp.syms.substr(sp.odd + 1);
    ui.stopNow[sp.odd] = now;
    slotSfx.stop(2);
    sp.pair = false;
    if (ui.landing === sp.pairSym) {
      for (i = 0; i < WINS.length; i++) if (WINS[i].syms === sp.syms) takeWin(sp, WINS[i]);
      betScale(sp);
      settle();
    } else {
      sp.text = "NO MATCH"; ui.msg = sp.text; ui.winNow = -9; ui.quietAt = now;
      ui.state = "idle";
      slotSfx.gone();
      say("No match this time.");
      board();
    }
  }
  function kickGauge() { return 0.5 - 0.5 * Math.cos((now - ui.kickAt) * 4.6); }
  function kickNow() {
    if (ui.state !== "kick") return;
    var g = kickGauge(), base = Math.abs(g - 0.8) <= 0.08 ? KICK.perfect : g >= 0.5 ? KICK.good : KICK.short, pay = base * (ui.betNow || 1);
    ui.pend = pay; ui.doubles = 0; ui.state = "double"; ui.winNow = now;
    ui.msg = base === KICK.perfect ? "PERFECT KICK" : base === KICK.good ? "GOOD KICK" : "SHORT KICK";
    sfx.kick(); slotSfx.win(pay);
    if (base === KICK.perfect) { burst(VW / 2, PANEL.y + 70, 40); shake = 6; }
    say(ui.msg.charAt(0) + ui.msg.slice(1).toLowerCase() + ": " + pay + " corn. Keep it, or double or nothing?");
    board();
  }
  function keep() {
    if (ui.state !== "double" && ui.state !== "pair") return;
    var was = earned, fresh = "";
    bank += ui.pend; earned += ui.pend;
    ui.tally = (ui.tally || 0) + ui.pend;
    if (ui.pend > 0) { flyCorn(clamp(Math.round(ui.pend / 5), 2, 10), VW / 2 - 68, PANEL.y + 166, "corn"); bankAt = now + FLY; }
    ui.quietAt = now;
    fillCob(ui.pend);
    BALLS.forEach(function (b) { if (was < b.need && earned >= b.need) fresh = b.name; });
    ui.msg = fresh ? "NEW BALL: " + fresh.toUpperCase() : "KEPT  +" + ui.pend;
    if (fresh) { sfx.gate(); burst(VW / 2, PANEL.y + 70, 40); }
    ui.state = "idle";
    save("rollcorn-hang-kernels", bank); save("rollcorn-hang-earned", earned);
    slotSfx.keep();
    say("Kept " + ui.pend + " corn." + (fresh ? " New ball: " + fresh + ". Pick it under the game." : ""));
    board(); buildBalls();
  }
  // Double or nothing is an even coin flip, decided the moment it is taken. The reels spin to show it:
  // the same three come back for double, or they come up mixed and the win is gone.
  function doubleUp() {
    if (ui.state !== "double") return;
    ui.flipWin = Math.random() < 0.5;
    ui.state = "flip"; ui.t = 0; ui.until = 1.2;
    ui.pullNow = now;
    slotSfx.lever();
    say("Double or nothing: the reels are spinning.");
    board();
  }
  function landFlip() {
    var k;
    ui.state = "double";
    ui.stopNow = [now, now, now];
    slotSfx.stop(2);
    if (ui.flipWin) {
      ui.pend *= 2; ui.doubles += 1;
      ui.msg = "DOUBLED"; ui.winNow = now; cheerAt = now;
      slotSfx.doubled(ui.doubles); burst(VW / 2, PANEL.y + 70, 20);
      say("Doubled to " + ui.pend + " corn.");
      if (ui.doubles >= 4) keep();
    } else {
      k = Math.floor(Math.random() * REEL.length);                    // three different symbols: plainly a miss
      ui.sp.syms = REEL.charAt(k) + REEL.charAt((k + 2) % REEL.length) + REEL.charAt((k + 4) % REEL.length);
      ui.msg = "GONE"; ui.quietAt = now;
      ui.pend = 0; ui.state = "idle";
      slotSfx.gone();
      say("Nothing this time.");
    }
    board();
  }
  // anything left hanging when the next punt goes up is settled the safe way
  function slotWrapUp() {
    if (ui.state === "spinning") { ui.stopped = 3; settle(); }
    if (ui.state === "respin") landRespin();
    if (ui.state === "flip") landFlip();
    if (ui.state === "kick") kickNow();
    if (ui.state === "double" || ui.state === "pair") keep();
  }
  // a tap on the machine: which part was it
  function slotTap(side) {
    audio();
    lastInput = now;
    if (ui.state === "spinning") stopReel();
    else if (ui.state === "kick") kickNow();
    else if (ui.state === "respin" || ui.state === "flip") ui.until = Math.min(ui.until, ui.t);
    else if (ui.state === "pair") { if (side === "right") respin(); else keep(); }
    else if (ui.state === "double") { if (side === "right") doubleUp(); else keep(); }
    else pull();
  }
  function slotTick(dt) {
    if (ui.auto) {
      if (!slotVisible() || (ui.state === "idle" && spins <= 0)) ui.auto = false;
      else if (ui.state === "idle") { ui.autoT = (ui.autoT || 0) + dt; if (ui.autoT > 0.6) { ui.autoT = 0; pull(); } }
      else if (ui.state === "pair" || ui.state === "double") { ui.autoT = (ui.autoT || 0) + dt; if (ui.autoT > 1.0) { ui.autoT = 0; keep(); } }
    }
    if (ui.state === "respin" || ui.state === "flip" || ui.state === "spinning") {
      ui.pos = ui.pos || [0, 0, 0];
      for (var ri = 0; ri < 3; ri++) {                     // each reel eases down over its last third of a second
        var left = ui.state === "spinning" ? ui.stopAt[ri] - ui.t : ui.until - ui.t;
        var base = ui.state === "spinning" && ui.tease && ui.stopped === 2 && ri === 2 ? 7 : 13;
        ui.pos[ri] += base * clamp(left / 0.35, 0.22, 1) * dt;
      }
      var waitFor = ui.state === "spinning" && ui.tease && ui.stopped === 2;      // two the same: the ticks slow and climb
      ui.tick = (ui.tick || 0) - dt;
      if (ui.tick <= 0) {
        ui.tk = (ui.tk || 0) + 1;
        ui.tick = waitFor ? 0.11 : 0.07;
        slotSfx.tick(ui.tk, waitFor ? clamp((ui.t - ui.stopAt[1]) / Math.max(0.2, ui.stopAt[2] - ui.stopAt[1]), 0.05, 1) : 0);
      }
    }
    if (ui.state === "respin") { ui.t += dt; if (ui.t >= ui.until) landRespin(); return; }
    if (ui.state === "flip") { ui.t += dt; if (ui.t >= ui.until) landFlip(); return; }
    if (ui.state !== "spinning") return;
    ui.t += dt;
    while (ui.stopped < 3 && ui.t >= ui.stopAt[ui.stopped]) {
      ui.stopNow[ui.stopped] = now;
      ui.stopped += 1;
      slotSfx.stop(ui.stopped - 1);
      if (ui.stopped < 3) ui.stopAt[ui.stopped] = Math.max(ui.stopAt[ui.stopped], ui.t + 0.14);   // never two reels on the same beat
    }
    if (ui.stopped >= 3) settle();
  }
  spinBtn.addEventListener("click", function () { slotTap("main"); });
  keepBtn.addEventListener("click", keep);
  doubleBtn.addEventListener("click", function () { if (ui.state === "pair") respin(); else doubleUp(); });

  function finish() {
    S.phase = "over";
    away = false;
    lives -= 1; carry = Math.floor(S.pts);
    if (lives <= 0) ui.tally = 0;                          // a fresh round on the machine
    if (lives <= 0) {                                      // three games in a row, each worse than the last: lean their way
      if (S.cont && games.length) games[games.length - 1] = Math.floor(S.pts); else games.push(Math.floor(S.pts));
      var g3 = games.slice(-3);
      if (g3.length === 3 && g3[0] > g3[1] && g3[1] > g3[2]) { hotLeft = Math.max(hotLeft, 4); mercyNext = true; }
    }
    if (!gamePunts.length || S.base === 0) gamePunts = [];
    gamePunts.push(Math.floor(S.pts) - S.base);
    S.wait = 0;
    S.rw = 0; S.rewindFrom = S.dist;
    tone(240, 0.55, "sine", 0.045, 520);
    var before = earned;
    bank += S.got; earned += S.got;
    var feed = Math.max(0, S.got);                         // every ear caught on the field also goes into the jackpot
    pot += feed; gameFeed += feed;
    S.pts = Math.floor(S.pts);
    var longest = S.t > best;
    if (longest) { best = S.t; save("rollcorn-hang-best", best.toFixed(2)); }
    if (S.pts > bestPts) { bestPts = S.pts; S.newBest = true; save("rollcorn-hang-bestscore", bestPts); }
    var today = dayStats(0), bestToday = S.t > today.best && today.count > 0;
    save(dayKey(0), [(today.sum + S.t).toFixed(2), today.count + 1, Math.max(today.best, S.t).toFixed(2)].join(","));
    if (S.bestGold) { spins += 1; golds += 1; S.golds = (S.golds || 0) + 1; save("rollcorn-hang-golds", golds); }   // the golden spin for passing the best, banked along with the best
    var spinsWas = spins;
    S.newSpins = spinsFor(S.pts - S.base);
    var lvWas = levelOf(xp);
    xp += Math.max(0, Math.floor(S.pts) - S.base); save("rollcorn-hang-xp", xp);
    if (levelOf(xp) > lvWas) { S.levelUp = levelOf(xp); spins += 2 * (S.levelUp - lvWas); }
    S.near = nearMiss();          // a spin for every 150 points, three at most; the player pulls them
    if (spun === 0 && spins === 0 && S.newSpins === 0) S.newSpins = 1;   // a first spin on the house, however short the first punt
    spins += S.newSpins;
    save("rollcorn-hang-spins", spins);
    S.goalDone = goalCount();
    gameSpins += spins - spinsWas + (S.golds || 0); gameGolds += S.golds || 0;
    if (lives <= 0 && (gameSpins || gameFeed)) {             // the machine opens by saying what this game put into it
      ui.msg = (gameSpins ? "YOUR GAME EARNED " + gameSpins + (gameSpins === 1 ? " SPIN" : " SPINS") + (gameGolds ? " (" + gameGolds + " GOLDEN)" : "") : "") +
               (gameSpins && gameFeed ? "  \u00B7  JACKPOT +" + gameFeed : gameFeed ? "YOUR CORN FED THE JACKPOT:  +" + gameFeed : "");
      ui.daily = true;
    } else if (lives <= 0 && /^(YOUR |EXTRA LIFE:)/.test(ui.msg)) { ui.msg = "MATCH 3 TO WIN"; ui.daily = false; }     // nothing to report: the last game's line comes down
    if (lives <= 0) {
      shownBank = bank - feed; bankAt = now + 0.5;           // the pile on show counts this punt's corn in
      if (gameFeed > 0 && slotVisible()) {                   // and the game's corn is seen going into the jackpot
        shownPot = pot - gameFeed; potAt = now + 1.0 + FLY;
        flyCorn(clamp(Math.round(gameFeed / 5), 3, 12), 26, 25, "pot", 1.0);
      }
    }
    stepUp();
    save("rollcorn-hang-kernels", bank); save("rollcorn-hang-earned", earned); save("rollcorn-hang-pot", pot);
    BALLS.forEach(function (b) { if (before < b.need && earned >= b.need) S.unlocked = b.name; });
    S.kind = S.newBest ? "Your best score ever. Enjoy that one." :
             longest ? "Your longest hang ever." :
             bestToday ? "Your longest hang today." :
             lastPts > 0 && S.pts > lastPts ? "Up from " + lastPts.toLocaleString("en-US") + " last time. Nice." :
             bestPts > 0 && S.pts >= bestPts * 0.8 ? "So close to your best: just " + (bestPts - S.pts).toLocaleString("en-US") + " short." :
             KIND[Math.floor(Math.random() * KIND.length)];
    var personal = S.newBest || longest || bestToday || (lastPts > 0 && S.pts > lastPts);   // a line about this punt already said it
    lastPts = S.pts;

    // remember how this one was played
    var gaps = [], mean = 0, dev = 0, i;
    for (i = 1; i < S.taps.length; i++) gaps.push(S.taps[i] - S.taps[i - 1]);
    gaps.forEach(function (g) { mean += g / gaps.length; });
    gaps.forEach(function (g) { dev += (g - mean) * (g - mean) / gaps.length; });
    var code = (CAUSES[S.cause] || { code: "-" }).code;
    hist.push({ t: Math.round(S.t * 100) / 100, c: code, bs: S.bigSeen, bt: S.bigTaken, y: Math.round(S.ySum / Math.max(S.t, 0.1)),
                cv: gaps.length >= 5 ? Math.round(Math.sqrt(dev) / mean * 100) / 100 : -1, k: Math.max(0, S.got) });
    if (hist.length > 20) hist.shift();

    // the nemesis: face it ten punts running and it is beaten
    var last10 = hist.slice(-10);
    if (nem) {
      if (code === nem) {
        nemFree = 0;
        var times = last10.filter(function (h) { return h.c === nem; }).length, nm = causeOf(nem).name;
        if (!personal) S.kind = nm.charAt(0).toUpperCase() + nm.slice(1) + " again: " + times + " of your last " + last10.length + ". You will get it.";
      } else if (++nemFree >= 10) {
        S.kind = "Ten punts and " + causeOf(nem).name + " never got you. Beaten.";
        S.beat = true;
        bank += 50; earned += 50;
        hist.forEach(function (h) { if (h.c === nem) h.c = "-"; });
        nem = ""; nemFree = 0;
      }
    }
    if (!nem && last10.length >= 6) {
      var tally = {}, worst = "", most = 3;
      last10.forEach(function (h) { if (h.c !== "-") { tally[h.c] = (tally[h.c] || 0) + 1; if (tally[h.c] > most) { most = tally[h.c]; worst = h.c; } } });
      if (worst) { nem = worst; nemFree = 0; }
    }
    // the type: say so when it changes
    var nowType = readType();
    if (nowType && nowType === ptype) typeWait = 0;
    else if (nowType && (!ptype || ++typeWait >= 4)) {      // a new type has to show up four punts running before it sticks
      S.typeLine = (ptype ? "You have become " : "You are ") + TYPES[nowType][0] + ". " + TYPES[nowType][1];
      ptype = nowType; typeWait = 0;
    }
    save("rollcorn-hang-hist", JSON.stringify(hist)); save("rollcorn-hang-type", ptype);
    save("rollcorn-hang-nem", nem); save("rollcorn-hang-nemfree", nemFree); save("rollcorn-hang-kernels", bank); save("rollcorn-hang-earned", earned);

    // today's mandala gets a petal
    var petals = todayPetals();
    petals.push([Math.round(S.t * 10) / 10, code]);
    if (petals.length > 72) petals.shift();
    save(mandalaKey(), JSON.stringify(petals));
    drawMandala();

    if (S.newBest || S.unlocked || S.beat) { sfx.gate(); burst(VW / 2, GY - 30, 50); if (S.beat) fireworks(); } else sfx.over();
    label(lives > 0 ? "Next punt" : "New game");
    if (lives > 0 && S.newSpins) spinsBanked += S.newSpins;
    shareBtn.hidden = false;
    say((lives > 0 ? lives + (lives === 1 ? " life" : " lives") + " left; your score carries on. " : "That was your last life. Game over. ") + S.cause + ". Score " + S.pts.toLocaleString("en-US") + ". " + scoreSum() + " " + S.kind +
        (S.unlocked ? " New ball: " + S.unlocked + "." : "") + (S.goalDone ? " Daily goal done: 2 spins." : "") + (S.levelUp ? " Level " + S.levelUp + ": 2 spins." : "") +
        (S.newSpins + (S.golds || 0) ? " You earned " + (S.newSpins + (S.golds || 0)) + (S.newSpins + (S.golds || 0) === 1 ? " spin" : " spins") + " on the corn slots" + (S.golds ? ", " + S.golds + " of them golden" : "") + "." : "") +
        (feed ? " Your " + feed + " corn also went into the jackpot." : "") +
        (spins ? " " + spins + (spins === 1 ? " spin" : " spins") + " waiting: tap the machine." : ""));
    board();
    buildBalls(); buildShow();
  }

  // ---------- page controls ----------

  // where this punt's points came from, as a sum; it is read out under the game, not on the field
  function scoreSum() {
    var br = S.br, got = S.pts - S.base, air = Math.floor(br.air || 0), kn = Math.round(br.kernels || 0), kk = Math.round(br.kicks || 0), cl = Math.round(br.close || 0);
    var bonus = Math.max(0, got - air - kn - kk - cl), parts = [S.t.toFixed(1) + " seconds in the air, " + air];
    if (kn) parts.push("corn " + kn);
    if (kk) parts.push("kicks good " + kk);
    if (cl) parts.push("close calls " + cl);
    if (bonus) parts.push("bonuses " + bonus);
    return "This punt: " + parts.join(" + ") + " = " + got.toLocaleString("en-US") + ".";
  }
  // One goal a day, picked by the date. Finishing it pays two spins.
  var GOALS = [
    { id: "gates", n: 3, text: "Kick 3 through the uprights", short: "Uprights" },
    { id: "close", n: 5, text: "Make 5 close calls", short: "Close calls" },
    { id: "air", n: 60, text: "Spend 60 seconds in the air", short: "Seconds up" },
    { id: "kern", n: 40, text: "Collect 40 ears of corn", short: "Corn" },
    { id: "quarters", n: 4, text: "Finish 4 quarters", short: "Quarters" },
    { id: "caught", n: 3, text: "Catch 3 boosts mid-punt", short: "Boosts caught" }
  ];
  var goalKey = dayKey(0).replace("-day-", "-goal-");
  var goal = GOALS[Math.floor(Date.now() / 864e5) % GOALS.length], goalHad = loadText(goalKey), goalDone = goalHad === "done", goalN = goalDone ? goal.n : Math.min(goal.n, parseFloat(goalHad) || 0);
  function goalShow() {
    goalEl.textContent = goalDone ? "Done" : Math.floor(goalN) + " / " + goal.n; goalEl.title = goal.text;
    var gl = document.getElementById("cc-goal-label"); if (gl) gl.textContent = "Goal: " + goal.short.toLowerCase();
  }
  function goalCount() {                                   // after each punt
    if (goalDone) return false;
    goalN += { gates: S.gates, close: S.closes, air: S.t, kern: Math.max(0, S.got), quarters: S.q, caught: S.caught || 0 }[goal.id] || 0;
    if (goalN >= goal.n) { goalDone = true; goalN = goal.n; spins += 2; save("rollcorn-hang-spins", spins); save(goalKey, "done"); goalShow(); return true; }
    save(goalKey, goalN.toFixed(1)); goalShow();
    return false;
  }
  // A challenge: a shared link carries the score to beat.
  var rival = 0;
  try { rival = Math.min(999999, Math.max(0, parseInt((/[?&]beat=(\d{1,6})/.exec(location.search) || [])[1], 10) || 0)); } catch (e) { rival = 0; }
  // The walkthrough: only on a first-ever punt, one short prompt at a time.
  var tutor = played === 0, tutorStep = 0;
  function tutorText() {
    if (!tutor || S.phase !== "play") return "";
    var touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (tutorStep === 0) { if (S.taps.length >= 3) tutorStep = 1; return touch ? "TAP TO RISE" : "CLICK TO RISE"; }
    if (tutorStep === 1) { if (S.floating) S.floated = (S.floated || 0) + 1; if ((S.floated || 0) > 25 || S.t > 9) { tutorStep = 2; if (!pocket) { pocket = "B"; kitSave(); } } return "HOLD AFTER A " + (touch ? "TAP" : "CLICK") + " TO FLOAT"; }
    if (tutorStep === 2) { if (!pocket) tutorStep = 3; return (touch ? "TAP THE BADGE TO USE YOUR " : "PRESS SPACE TO USE YOUR ") + (POWERS[pocket] || "POWER-UP"); }
    if (tutorStep === 3) { if (S.dove || S.t > (S.tutorAt = S.tutorAt || S.t) + 5) { tutor = false; } return touch ? "DRAG DOWN TO DIVE" : "DOWN ARROW TO DIVE"; }
    return "";
  }
  function tutorDraw() {
    var text = tutorText();
    if (!text) return;
    ctx.font = "700 15px " + LABEL; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var tw = Math.min(VW - 16, ctx.measureText(text).width + 30);
    ctx.fillStyle = "rgba(17,17,17,.9)"; ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5;
    rr(VW / 2 - tw / 2, GY - 52, tw, 28, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = Math.sin(now * 6) > -0.4 ? GOLD : "#fff"; ctx.fillText(text, VW / 2, GY - 37.5, tw - 16);
  }
  // Five things to build, three levels each. Each build costs corn and pays a spin; finishing the lot pays ten and starts a bigger stadium.
  var BUILD = [["Bleachers", 150], ["Scoreboard", 250], ["Press box", 400], ["Lights", 600], ["Tunnel", 900]];
  var bd = loadText("rollcorn-hang-build").split("|"), stadium = parseInt(bd[0], 10) || 1, built = (bd[1] || "0,0,0,0,0").split(",").map(function (v) { return clamp(parseInt(v, 10) || 0, 0, 3); });
  while (built.length < BUILD.length) built.push(0);
  var buildEl = document.getElementById("cc-build"), buildNote = document.getElementById("cc-build-note");
  function buildCost(i) { return Math.round(BUILD[i][1] * (built[i] + 1) * (1 + 0.5 * (stadium - 1)) / 10) * 10; }
  function buildShow() {
    if (!buildEl) return;
    var done = built.reduce(function (a, b) { return a + b; }, 0);
    buildEl.textContent = "";
    BUILD.forEach(function (it, i) {
      var b = document.createElement("button"), full = built[i] >= 3, cost = buildCost(i);
      b.type = "button"; b.className = "cc-mini cc-ball";
      b.textContent = full ? it[0] + " \u00B7 built" : it[0] + " " + built[i] + "/3 \u00B7 " + cost.toLocaleString("en-US") + " corn";
      b.disabled = full || bank < cost;
      b.setAttribute("aria-pressed", full ? "true" : "false");
      b.addEventListener("click", function () {
        if (built[i] >= 3 || bank < buildCost(i)) return;
        bank -= buildCost(i); built[i] += 1; spins += 1;
        var all = built.every(function (v) { return v >= 3; });
        if (all) { spins += 10; stadium += 1; built = [0, 0, 0, 0, 0]; sfx.gate(); fireworks(); }
        else slotSfx.boost();
        save("rollcorn-hang-build", stadium + "|" + built.join(",")); save("rollcorn-hang-kernels", bank); save("rollcorn-hang-spins", spins);
        say(all ? "Stadium finished! 10 spins, and a bigger one to build." : it[0] + " built. 1 spin.");
        board(); buildShow();
      });
      buildEl.appendChild(b);
    });
    if (buildNote) buildNote.textContent = "Stadium " + stadium + ": " + done + " of 15 built. Each build pays a spin; finish all 15 for 10 more.";
  }
  function label(text, off) { btn.textContent = text; btn.disabled = !!off; }
  function say(text) { statusEl.textContent = text; }
  function board() {
    slotDom();
    scoreEl.textContent = Math.floor(S.pts).toLocaleString("en-US");
    bestEl.textContent = bestPts.toLocaleString("en-US");
    kernEl.textContent = (bank + (S.phase === "over" ? 0 : S.got)).toLocaleString("en-US");
    potEl.textContent = Math.floor(pot).toLocaleString("en-US");
    earEl.textContent = cob + " / " + COB;
    typeEl.textContent = ptype ? TYPES[ptype][0] : hist.length >= 10 ? TYPES.natural[0] : "In " + (10 - hist.length) + " punts";
    nemEl.textContent = nem ? causeOf(nem).name.replace(/^the /, "The ") + " \u00B7 " + nemFree + "/10" : "None yet";
  }

  // ---------- the mandala: one petal for every punt today, as long as the punt hung,
  //            coloured by what brought it down
  function mandalaKey() { return dayKey(0).replace("-day-", "-mandala-"); }
  function todayPetals() { try { return JSON.parse(loadText(mandalaKey()) || "[]"); } catch (e) { return []; } }
  function drawMandala() {
    var m = mandala.getContext("2d"), petals = todayPetals(), n = Math.max(petals.length, 12), size = mandala.width, c = size / 2;
    var bestT = 0, i;
    petals.forEach(function (pt) { bestT = Math.max(bestT, pt[0]); });
    m.clearRect(0, 0, size, size);
    m.fillStyle = "#FBF8EC"; m.beginPath(); m.arc(c, c, c - 4, 0, Math.PI * 2); m.fill();
    m.strokeStyle = "#E3E0D0"; m.lineWidth = 2;
    [0.36, 0.62, 0.9].forEach(function (r) { m.beginPath(); m.arc(c, c, (c - 8) * r, 0, Math.PI * 2); m.stroke(); });
    for (i = 0; i < petals.length; i++) {
      var a = -Math.PI / 2 + i / n * Math.PI * 2, t = petals[i][0], cause = causeOf(petals[i][1]);
      var len = (c - 12) * (0.28 + 0.7 * Math.min(1, Math.sqrt(t / Math.max(bestT, 8)))),   // measured against today's longest
          wide = Math.max(7, Math.min(22, Math.PI * len / n * 1.5));
      m.save();
      m.translate(c, c); m.rotate(a);
      m.fillStyle = cause ? cause.color : "#9A9685"; m.strokeStyle = "#000"; m.lineWidth = t === bestT ? 3 : 1.4; m.lineJoin = "round";
      m.globalAlpha = 0.9;
      m.beginPath();
      m.moveTo(14, 0);
      m.quadraticCurveTo(len * 0.55, -wide, len, 0);
      m.quadraticCurveTo(len * 0.55, wide, 14, 0);
      m.fill(); m.stroke();
      if (t === bestT) { m.fillStyle = "#FFCD00"; m.globalAlpha = 1; m.beginPath(); m.arc(len, 0, 4.5, 0, Math.PI * 2); m.fill(); m.stroke(); }
      m.restore();
    }
    m.fillStyle = "#FFCD00"; m.strokeStyle = "#000"; m.lineWidth = 2.5;
    m.beginPath(); m.arc(c, c, 13, 0, Math.PI * 2); m.fill(); m.stroke();
    mandalaNote.textContent = petals.length ? petals.length + (petals.length === 1 ? " punt" : " punts") + " today. Longest " + bestT.toFixed(1) + " seconds." : "Your first punt today starts it.";
    saveBtn.hidden = !petals.length;
  }
  saveBtn.addEventListener("click", function () {
    var a = document.createElement("a");
    a.download = "hang-time-" + dayKey(0).replace("rollcorn-hang-day-", "") + ".png";
    a.href = mandala.toDataURL("image/png");
    a.click();
  });
  function buildBalls() {
    ballsEl.textContent = "";
    BALLS.forEach(function (it) {
      var b = document.createElement("button"), open = earned >= it.need;
      b.type = "button";
      b.className = "cc-mini cc-ball";
      b.disabled = !open;
      b.textContent = open ? it.name : it.name + " · " + it.need.toLocaleString("en-US") + " corn";
      b.setAttribute("aria-pressed", ballId === it.id ? "true" : "false");
      b.addEventListener("click", function () { ballId = it.id; save("rollcorn-hang-ball", it.id); buildBalls(); });
      ballsEl.appendChild(b);
    });
  }

  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    downY = e.clientY; pressed = true;
    if (paused) { resume(); return; }
    var box = canvas.getBoundingClientRect(), px = (e.clientX - box.left) / U, py = (e.clientY - box.top) / U;
    if (slotVisible() && px > VW / 2 - PANEL.w / 2 && px < VW / 2 + PANEL.w / 2 + 34 && py > PANEL.y && py < PANEL.y + PANEL.h) {
      if (ui.auto) { ui.auto = false; tone(300, 0.08, "sine", 0.06); board(); return; }      // any tap ends an auto run
      if (ui.state === "idle" && spins > 0 && px > VW / 2 + PANEL.w / 2 - 6 && py > PANEL.y + 40 && py < PANEL.y + 150) {
        ui.grab = true; ui.grabY = py; ui.lever = 0; lastInput = now;                        // a hand on the lever
        return;
      }
      if (ui.state === "idle" && spins > 1 && px > VW / 2 + PANEL.w / 2 - 62 && px < VW / 2 + PANEL.w / 2 - 6 && py > PANEL.y + 147 && py < PANEL.y + 185) {
        ui.auto = true; ui.autoT = 0.4; lastInput = now;
        tone(700, 0.07, "triangle", 0.08); tone(1050, 0.1, "triangle", 0.08, 0, 0.07);
        return;
      }
      if (ui.state === "idle" && spins > 1 && px < VW / 2 - PANEL.w / 2 + 64 && py > PANEL.y + 147 && py < PANEL.y + 185) {
        if (golds > 0) tone(240, 0.08, "sine", 0.05);             // a golden spin is always pulled on its own
        else { ui.bet = ui.bet % Math.min(3, spins) + 1; tone(500 + ui.bet * 140, 0.06, "triangle", 0.08); }   // one, two, three, and round again
        board();
      } else if (ui.state === "idle" && spins <= 0) tap(); else slotTap(px > VW / 2 ? "right" : "left");
      return;
    }
    var pa = pocketAt();
    if (pocket && S.phase === "play" && (px - pa.x) * (px - pa.x) + (py - pa.y) * (py - pa.y) < 34 * 34) { usePower(); return; }
    held = true;
    tap();
  });
  btn.addEventListener("pointerdown", function () { held = true; });
  btn.addEventListener("click", tap);
  var downY = 0, pressed = false;
  window.addEventListener("pointerup", function () {
    held = false; diving = false; pressed = false;
    if (ui.grab) {                                         // let go: a full pull spins, a tap spins, a half-hearted tug springs back
      ui.grab = false;
      if (ui.lever > 0.55 || ui.lever < 0.08) pull(); else tone(240, 0.08, "sine", 0.05);
      ui.lever = 0;
    }
  });
  window.addEventListener("pointercancel", function () { held = false; diving = false; pressed = false; });
  canvas.addEventListener("pointermove", function (e) {                 // press and drag down to dive
    if (pressed && S.phase === "play" && e.clientY - downY > 34) { diving = true; held = false; }
    if (ui.grab) { var bx2 = canvas.getBoundingClientRect(); ui.lever = clamp(((e.clientY - bx2.top) / U - ui.grabY) / 50, 0, 1); }
  });
  window.addEventListener("blur", function () { held = false; });
  document.addEventListener("keyup", function (e) {
    if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp") held = false;
    if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") diving = false;
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "ArrowDown" || e.key === "s" || e.key === "S") && S.phase === "play" && !paused) { e.preventDefault(); diving = true; held = false; }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== " " && e.key !== "Enter" && e.key !== "ArrowUp") return;
    var t = e.target && e.target.tagName;
    if (t === "A" || t === "INPUT" || t === "TEXTAREA" || t === "SUMMARY" || (t === "BUTTON" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    if (e.key === " " && S.phase === "play" && !paused) { if (!e.repeat) usePower(); return; }   // in the air, space is the power-up
    held = true;
    if (!e.repeat) tap();
  });
  function soundLabel() {
    soundBtn.textContent = muted ? "Sound off" : "Sound on";
    soundBtn.setAttribute("aria-pressed", muted ? "false" : "true");
  }
  soundBtn.addEventListener("click", function () {
    muted = !muted;
    save("rollcorn-coffin-muted", muted ? 1 : 0);
    soundLabel();
    if (!muted) sfx.kernel(0);
  });
  shareBtn.addEventListener("click", function () {
    var url = "https://rollcorn.com/hang-time.html?beat=" + Math.max(1, Math.floor(S.pts));
    var text = "I scored " + S.pts.toLocaleString("en-US") + " on Hang Time, with " + S.t.toFixed(2) + " seconds in the air" + (ptype ? ". They call me " + TYPES[ptype][0] : "") + ". Beat it:";
    function copied() { shareBtn.textContent = "Copied"; setTimeout(function () { shareBtn.textContent = "Share score"; }, 1600); }
    if (navigator.share) navigator.share({ text: text, url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text + " " + url).then(copied, function () {});
  });

  // ---------- particles ----------

  function burst(x, y, n) {            // kernels fly up and pop into popcorn
    if (S.phase === "play") n = Math.ceil(n * 0.5);       // fewer while the ball is in the air
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = 120 + Math.random() * 260;
      particles.push({ kind: "kernel", x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                       life: 0, max: 0.9 + Math.random() * 0.7, pop: 0.2 + Math.random() * 0.35,
                       rot: Math.random() * 6, size: 3 + Math.random() * 2.5 });
    }
  }
  function dust(x, y, n) {
    for (var i = 0; i < n; i++) {
      particles.push({ kind: "dust", x: x, y: y, vx: (Math.random() - 0.5) * 140, vy: -Math.random() * 80,
                       life: 0, max: 0.4 + Math.random() * 0.4, size: 2 + Math.random() * 4 });
    }
  }

  function divot(x, y, n) {            // blades of grass, kicked up where something lands
    for (var i = 0; i < n; i++) {
      particles.push({ kind: "grass", x: x + (Math.random() - 0.5) * 14, y: y, vx: (Math.random() - 0.5) * 190, vy: -80 - Math.random() * 170,
                       life: 0, max: 0.45 + Math.random() * 0.35, rot: Math.random() * 6, size: 3 + Math.random() * 3.5 });
    }
  }

  // ---------- the clock ----------

  function update(dt) {
    now += dt;
    shake = Math.max(0, shake - dt * 24);
    flash = Math.max(0, flash - dt * 5);
    tod = S.phase === "over" ? lerp(tod, 0, Math.min(1, dt * 2.5))      // the day comes back with the ball
                             : lerp(tod, clamp(S.t / (QUARTER.secs * 2), 0, 2), Math.min(1, dt * 0.8));
    popTick(dt); flyTick(dt);
    if (!idleGift && S.phase === "over" && lives <= 0 && ui.state === "idle" && now - lastInput > CARE.idleSecs && S.wait > CARE.idleSecs) {
      idleGift = true;                                     // a long pause at game over, once a visit: one on the house, and it cannot miss
      spins += 1; golds += 1; save("rollcorn-hang-golds", golds); away = false;
      ui.msg = "ONE ON THE HOUSE"; ui.daily = true;
      save("rollcorn-hang-spins", spins);
      slotSfx.boost(); board();
    }
    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j];
      p.life += dt;
      if (p.life < 0) continue;                           // fireworks go up one after another
      p.vy += (p.kind === "kernel" ? 520 : p.kind === "grass" ? 640 : p.kind === "dust" ? 120 : p.kind === "fw" ? 70 : 0) * dt;
      if (p.kind === "fw") {
        p.vx *= 1 - dt * 1.6; p.vy *= 1 - dt * 1.6; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life > p.max) particles.splice(j, 1);
        continue;
      }
      p.x += (p.vx - S.speed * 0.5) * dt; p.y += p.vy * dt;
      if (p.kind === "kernel" && p.y > FEET && p.vy > 0) { p.y = FEET; p.vy *= -0.35; p.vx *= 0.6; }
      if (p.life > p.max) particles.splice(j, 1);
    }
    for (var k = floaters.length - 1; k >= 0; k--) {
      floaters[k].life += dt;
      if (floaters[k].life > 1.4) floaters.splice(k, 1);
    }
    for (var c = 0; c < clouds.length; c++) {
      clouds[c].x -= (6 + S.speed * 0.05) * clouds[c].s * dt;
      if (clouds[c].x < -80) clouds[c].x = VW + 80 + Math.random() * 200;
    }

    slotTick(dt);
    slotDom();
    if (S.freeze > 0) { S.freeze -= dt; return; }       // a beat of stillness on impact
    if (S.phase === "intro") return;
    if (S.phase === "over") {
      S.wait += dt;
      if (S.rw < 1) {
        S.rw = Math.min(1, S.rw + dt / 0.95);
        var back = 1 - Math.pow(1 - S.rw, 3);
        S.dist = S.rewindFrom * (1 - back);
        S.y = lerp(FLOOR, FEET - 9, back) - Math.sin(Math.PI * back) * 130;
        S.spin -= dt * 12;
        if (S.rw >= 1) { S.spin = -0.5; S.sq = 1; tone(330, 0.08, "sine", 0.06); }
      }
      S.sq = Math.max(0, S.sq - dt * 6);
      return;
    }
    if (S.phase === "dead") {
      S.wait += dt;
      S.speed *= Math.max(0, 1 - dt * 5);
      S.dist += S.speed * dt;
      if (S.y < FLOOR) {
        S.vy = Math.min(S.vy + GRAV * dt, 700); S.y += S.vy * dt; S.spin += dt * 14;
        if (S.y >= FLOOR) { S.y = FLOOR; thud(0.3); dust(BX, FEET, 10); divot(BX, FEET, 12); S.wait = 0.15; }
      } else if (S.wait > 0.4) finish();
      return;
    }

    // in the air
    var raw = dt;
    if (S.slowT > 0) { S.slowT -= dt; dt *= 0.45; }     // time stretches while the ball threads a tight gap
    S.t += dt;
    S.sq = Math.max(0, S.sq - raw * 6);
    if (!S.star && tod > 1.3 && Math.random() < raw / 9) S.star = { x: VW * (0.3 + Math.random() * 0.6), y: 30 + Math.random() * 90, life: 0 };
    if (S.star) { S.star.life += raw; if (S.star.life > 0.9) S.star = null; }
    if (S.cow) {
      var cowX = S.cow.x - S.dist;
      if (!S.cow.mooed && cowX < VW * 0.7) { S.cow.mooed = true; sfx.moo(); }
      if (cowX < -80) S.cow = null;
    }
    S.safe = Math.max(0, S.safe - dt);
    S.ySum += S.y * dt;
    if (S.dreamAt && S.dreaming <= 0 && S.t >= S.dreamAt) {
      S.dreamAt = 0;
      S.dreaming = 10;
      S.dreamNem = nem;
      if (nem !== "W") S.crows = [];
      S.refs = [];
      for (var d = 0; d < S.obs.length; d++) S.obs[d].dream = true;
      [262, 330, 392, 523].forEach(function (f, n) { tone(f, 2.4, "sine", 0.035, 0, n * 0.12); });   // a soft chord, and nothing said
    }
    if (S.dreaming > 0) {
      S.dreaming -= raw;
      S.safe = Math.max(S.safe, S.dreaming > 0 ? 0.3 : 1.2);   // nothing can touch the ball, and a moment of grace after
      S.crowAt = Math.max(S.crowAt, S.t + 3);
      if (S.dreamNem === "W" && S.dreaming > 1 && Math.random() < raw * 1.3) S.crows.push({ x: S.dist + VW + 60, y: 70 + Math.random() * (GY - 200), vx: -140, vy: 0, g: 0 });
      S.kwave -= S.speed * dt;
      if (S.kwave <= 0) { S.kwave = 70; S.kernels.push({ x: S.dist + VW + 30, y: 210 + Math.sin(S.t * 1.6) * 70, got: false, ph: 0 }); }
    }
    S.speed = 210 - 30 * (S.rookie || 0) + Math.min(150, S.t * 3.2);
    if (S.blockT > 0) S.blockT -= raw;
    if (!pocket && rack.length && !(S.blockT > 0 || S.windT > 0 || S.superT > 0)) {      // the hand is free: the next one steps up from the sideline
      S.stepT = (S.stepT || 0) + raw;
      if (S.stepT > 0.9 && stepUp()) {
        S.stepT = 0; S.steppedAt = now;
        floaters.push({ text: "NEXT UP: " + POWERS[pocket], life: 0.3, color: "#fff" });
        tone(660, 0.07, "triangle", 0.07); tone(990, 0.1, "triangle", 0.07, 0, 0.07);
      }
    }
    S.beatT -= raw;                                        // a quiet pulse that quickens with the ball
    if (S.beatT <= 0) {
      S.beatT += BEAT * 2 * 210 / Math.max(210, S.speed - (S.superT > 0 ? SUPER.speed : 0));
      S.beatN += 1;
      if (S.beatN % 2) tone(62, 0.11, "sine", 0.07, 38); else tone(1900, 0.012, "triangle", 0.012);
      if (S.beatN % 8 === 7) tone(S.q % 2 ? 196 : 147, 0.16, "triangle", 0.03);
    }
    if (Math.floor(S.t / QUARTER.secs) > S.q) { S.q += 1; endQuarter(S.q); }
    if (rival && !S.beatRival && S.pts > rival) {          // past the score on the challenge link
      S.beatRival = true;
      floaters.push({ text: "CHALLENGE BEATEN!", life: -0.4, color: GOLD });
      sfx.gate(); fireworks(); burst(BX, S.y, 30);
    }
    if (S.windT > 0) { S.windT -= raw; S.speed *= 0.75; }          // a tailwind: everything arrives a quarter slower
    if (S.superT > 0) {
      S.superT -= raw;
      S.speed += SUPER.speed * clamp(S.superT / 1.2, 0, 1);       // full tilt, easing off over the last second
      S.safe = Math.max(S.safe, 1.2);
      shake = Math.max(shake, 2.2);
    }
    S.dist += S.speed * dt;
    var dive = diving && S.dreaming <= 0;
    if (dive && !S.dove) { S.dove = true; }
    var glide = held && !dive && S.windT > 0;                      // a tailwind: hold, and the ball stays up for as long as it blows
    S.floating = held && !dive && S.vy > 0 && (glide || S.floatLeft > 0);   // holding after a tap: the ball hangs, for a moment
    if (S.floating && !glide) S.floatLeft -= raw;
    var weight = S.dreaming > 0 ? 0.45 : dive ? 3 : S.floating ? 0.22 : 1;
    if (dive && S.vy < 0) S.vy *= Math.max(0, 1 - dt * 14);     // a dive cuts the climb short
    if (glide && S.vy >= 0) S.vy *= Math.max(0, 1 - dt * 9);       // riding the wind: it levels off and holds
    else S.vy = Math.min(S.vy + GRAV * weight * dt, S.dreaming > 0 ? 300 : dive ? 980 : S.floating ? 110 : 640);
    S.y += S.vy * dt;
    S.spin += dt * 9;
    if (S.y < R + 2) { S.y = R + 2; S.vy = Math.max(S.vy, 0); }
    S.trail.push({ x: S.dist, y: S.y });
    if (S.trail.length > 8) S.trail.shift();
    addPts(POINTS.second * dt, "air");
    var sn = spinsFor(S.pts - S.base);
    if (sn > (S.spinN || 0)) {                             // a segment of the meter just filled: a spin for the machine
      S.spinN = sn; S.spinAt = now;
      floaters.push({ text: "+1 SPIN", life: 0.2, color: "#fff" });
      slotSfx.token();
    }
    scoreEl.textContent = Math.floor(S.pts).toLocaleString("en-US");

    if (S.nextX - S.dist < VW + 120) spawn();
    var bx = S.dist + BX, by = S.y, hit = "", killer = null, i;

    for (i = S.obs.length - 1; i >= 0; i--) {
      var o = S.obs[i], mid = o.x + o.w / 2, crest, hitWas = hit;
      if (o.blitz && !o.called && o.x - bx < 520 && S.dreaming <= 0) {
        o.called = true;
        tone(1900, 0.09, "square", 0.05); tone(1900, 0.2, "square", 0.05, 0, 0.13);
        floaters.push({ text: "BLITZ", life: 0, color: "#fff" });
      }
      if (o.x + o.w - S.dist < -160) { S.obs.splice(i, 1); continue; }
      if (o.down) continue;                             // flattened: nothing left to hit
      if (S.blockT > 0 && o.kind !== "gate" && o.x - bx < 120) {     // the blockers get there first
        o.down = true; o.downAt = now; S.knocked += 1;
        addPts(BLOCK.knock);
        burst(o.x + o.w / 2 - S.dist, BASE - 50, 14); dust(o.x + o.w / 2 - S.dist, FEET, 10);
        shake = Math.max(shake, 6); thud(0.4);
        floaters.push({ text: "KNOCKED DOWN  +" + BLOCK.knock * S.mult, life: 0, color: "#fff" });
        continue;
      }
      if (o.dream && S.dreamNem !== { wall: "C", jump: "R", mascot: "M", bench: "H", gate: "P" }[o.kind]) {
        // in a dream everything sinks out of the way, except the nemesis, which stays as a ghost
        if (o.kind === "jump") o.st = 2;
        else if (o.kind === "mascot") o.hi *= Math.max(0, 1 - raw * 2.6);
        else { o.bot += (BASE + 20 - o.bot) * Math.min(1, raw * 2.6); if (o.tip !== undefined) o.tip += (BASE + 20 - o.tip) * Math.min(1, raw * 2.6); }
      }
      if (o.kind === "jump") {
        // he crouches as the ball comes, then leaves his feet so that the top of the jump meets it
        var rise = Math.sqrt(2 * o.apex / 1500);
        if (o.st === 0 && !o.crouchAt && mid - bx < S.speed * (rise + 0.2) + 12) o.crouchAt = now;
        if (o.st === 0 && mid - bx < S.speed * rise + 12) { o.st = 1; o.jv = Math.sqrt(2 * 1500 * o.apex); }
        if (o.st === 1) { o.jy += o.jv * dt; o.jv -= 1500 * dt; if (o.jy <= 0) { o.jy = 0; o.st = 2; dust(mid - S.dist, FEET, 5); } }
        crest = FEET - o.jy - MAN;
        if (touches(o, bx, by)) hit = "Picked off by the returner";
      } else if (o.kind === "mascot") {
        // the mascot lobs one corn bomb at where the ball is heading; it bursts into popcorn at the end of its fuse
        if (!o.threw && S.dreaming <= 0 && (S.rookie || 0) < 0.5 && S.t >= QUARTER.secs * 2 - 2 && mid - bx < 430 && mid - bx > 220) {
          o.threw = true; o.threwAt = now;
          var bAir = 1.0, bG = 620, bY = BED - o.jy - 50, bAway = mid - bx;       // out of its hands, wherever it is in its bounce
          S.crows.push({ x: mid, y: bY, vx: clamp(-(bAway - S.speed * bAir) / bAir, -330, -20), vy: (clamp(S.y, 90, BASE - 90) - bY - 0.5 * bG * bAir * bAir) / bAir, g: bG, bomb: true, fuse: bAir + 0.3 });
          tone(880, 0.45, "sine", 0.06, 330);
        }
        o.jy = Math.max(0, o.hi - 14) * Math.abs(Math.sin(now * o.sp * 0.5 + o.ph));    // up off the trampoline and back, to the same height as ever
        crest = BED - o.jy - 62;
        if (touches(o, bx, by)) hit = "Bounced by the mascot";
      } else if (o.kind === "gate") {
        crest = o.bot - 3;
        if (touches(o, bx, by)) hit = "Doinked off the upright";
        if (!o.judged && bx > mid) { o.judged = true; o.good = by > o.tip && by < o.bot; }   // between the uprights, over the bar
      } else {
        crest = o.bot;
        if (touches(o, bx, by)) hit = o.kind === "bench" ? "Landed on the bench" : "Blocked by the wall";
      }
      if (S.superT > 0 && hit !== hitWas) {             // a super punt goes straight through whatever it meets
        hit = hitWas;
        S.smashed += 1;
        addPts(SUPER.smash);
        burst(o.x + o.w / 2 - S.dist, Math.min(by, BASE - 20), 18);
        dust(o.x + o.w / 2 - S.dist, by, 8);
        shake = Math.max(shake, 8);
        thud(0.35);
        S.obs.splice(i, 1);
        continue;
      }
      if (hit !== hitWas) killer = o;                    // remembered, so whoever stopped the punt can enjoy it
      if (bx > o.x - R && bx < o.x + o.w + R) {
        var room = crest - by - R;
        if (room > 0 && room < 13 && (o.slow || 0) < 0.3) { o.slow = (o.slow || 0) + raw; }
      }
      if (!o.passed && bx > o.x + o.w + R) {
        o.passed = true;
        if (o.slow) {
          S.closeRun += 1;
          var pay = Math.min(6, 1 + S.closeRun);
          addPts(POINTS.close * Math.min(5, S.closeRun), "close"); S.closes += 1;
          S.got += pay;
          fillCob(pay);
          sfx.note(Math.min(10, 4 + S.closeRun));
          floaters.push({ text: "CLOSE  +" + POINTS.close * Math.min(5, S.closeRun), life: 0.4, color: GOLD });
          kernEl.textContent = (bank + S.got).toLocaleString("en-US");
        } else S.closeRun = 0;
        if (o.kind === "gate" && o.good) {
          S.got += 5; S.gates += 1;
          addPts(POINTS.uprights * (S.wide ? 2 : 1), "kicks");
          sfx.gate(); shake = 6;
          burst(BX, S.y, 24);
          floaters.push({ text: "IT'S GOOD  +" + POINTS.uprights * (S.wide ? 2 : 1) * S.mult, life: 0, color: GOLD });
          fillCob(5);
          kernEl.textContent = (bank + S.got).toLocaleString("en-US");
        }
      }
    }
    for (i = S.kernels.length - 1; i >= 0; i--) {
      var kn = S.kernels[i];
      if (kn.x - S.dist < -40) { if (!kn.got && !kn.spin) { S.combo = 0; if (kn.big) S.bigSeen += 1; } S.kernels.splice(i, 1); continue; }
      if (S.magnet && !kn.got) {                        // the magnet: anything close flies to the ball
        var mdx = bx - kn.x, mdy = by - kn.y;
        if (mdx * mdx + mdy * mdy < 190 * 190) { var mp = Math.min(1, dt * 7); kn.x += mdx * mp; kn.y += mdy * mp; }
      }
      if (!kn.got && (kn.x - bx) * (kn.x - bx) + (kn.y - by) * (kn.y - by) < 24 * 24) {
        if (kn.spin) {                                  // a golden ear: a spin, there and then
          kn.got = true; goldSpin(); S.goldEars = (S.goldEars || 0) + 1;
          floaters.push({ text: "GOLDEN EAR:  GOLDEN SPIN", life: 0, color: GOLD });
          sfx.gate(); burst(BX, kn.y, 18); buzz(30);
          continue;
        }
        kn.got = true; S.got += kn.big ? 5 : 1;
        var chain = S.combo >= 9 ? 3 : S.combo >= 4 ? 2 : 1;        // ears taken in a row without missing one
        addPts((kn.big ? POINTS.bigKernel : POINTS.kernel) * chain, "kernels"); if (kn.big) S.bigs += 1;
        if (S.combo === 4 || S.combo === 9) floaters.push({ text: "CORN CHAIN  X" + (S.combo === 4 ? 2 : 3), life: 0.2, color: GOLD });
        if (kn.big) { S.bigSeen += 1; S.bigTaken += 1; }
        S.combo += 1;
        sfx.note(S.combo);
        buzz(8);
        if (kn.big) burst(BX, kn.y, 6);
        fillCob(kn.big ? 5 : 1);
        kernEl.textContent = (bank + S.got).toLocaleString("en-US");
      }
    }
    for (i = S.helmets.length - 1; i >= 0; i--) {
      var hm = S.helmets[i];
      if (hm.x - S.dist < -40) { S.helmets.splice(i, 1); continue; }
      if (!pocket && (hm.x - bx) * (hm.x - bx) + (hm.y - by) * (hm.y - by) < 28 * 28) {
        S.helmets.splice(i, 1);
        pocket = hm.kind || "H"; kitSave();
        floaters.push({ text: POWERS[pocket] + " READY", life: 0.3, color: "#fff" });
        burst(BX, S.y, 10);
        S.caught = (S.caught || 0) + 1;
        sfx.power();
      }
    }
    S.highT = S.y < 150 ? S.highT + raw : Math.max(0, S.highT - raw * 2);
    if (S.dreaming <= 0 && S.highT > 1.6) {
      S.highT = -1.5;
      S.crows.push({ x: S.dist + VW + 260, y: clamp(S.y + (Math.random() - 0.5) * 30, 30, 170), vx: -250, vy: 0, g: 0, punt: true });
    }
    if (S.dreaming <= 0 && S.t > S.puntAt) {
      S.puntAt = S.t + 6 + Math.random() * 4;
      var apex = 80 + Math.random() * 190, up = Math.sqrt(2 * 420 * (BASE - 60 - apex));
      S.crows.push({ x: S.dist + VW + 200, y: BASE - 60, vx: -150 - Math.random() * 60, vy: -up, g: 420, punt: true });
    }
    // referees: each one winds up as the ball comes near and throws his flag up at it
    for (i = S.refs.length - 1; i >= 0; i--) {
      var rf = S.refs[i], gap = rf.x - bx;
      if (gap < -200) { S.refs.splice(i, 1); continue; }
      if (rf.st === 0 && gap < 330 && S.dreaming <= 0) rf.st = 1;
      if (rf.st === 1) {
        rf.wind += dt;
        if (rf.wind >= 0.28) {
          rf.st = 2;
          var peak = 110 + Math.random() * 190, lift = Math.sqrt(2 * 900 * (BASE - 44 - peak)), air = lift / 900;
          S.crows.push({ x: rf.x - 8, y: BASE - 44, vx: clamp(-(gap - S.speed * air) / air, -280, -30), vy: -lift, g: 900 });
          tone(620, 0.07, "square", 0.04);
        }
      }
    }
    for (i = S.crows.length - 1; i >= 0; i--) {
      var cr = S.crows[i];
      cr.vy += cr.g * dt;
      cr.x += cr.vx * dt; cr.y += cr.vy * dt;
      if (cr.y > FEET + 4) { dust(cr.x - S.dist, FEET, 3); S.crows.splice(i, 1); continue; }     // it lands on the grass
      if (cr.x - S.dist < -60) { S.crows.splice(i, 1); continue; }
      if (cr.bomb && (cr.fuse -= dt) <= 0) {                         // the fuse runs out: popcorn, and no harm done
        burst(cr.x - S.dist, cr.y, 22); thud(0.3); tone(160, 0.2, "sawtooth", 0.06, 60);
        S.crows.splice(i, 1); continue;
      }
      if (S.blockT > 0 && cr.x - bx < 150 && cr.x - bx > -30) {      // swatted out of the air
        S.swatAt = now; S.swatX = cr.x - S.dist; S.swatY = cr.y; S.knocked += 1;
        addPts(BLOCK.swat);
        burst(cr.x - S.dist, cr.y, 12); shake = Math.max(shake, 4);
        tone(700, 0.08, "square", 0.07, 300);
        floaters.push({ text: "SWATTED  +" + BLOCK.swat * S.mult, life: 0, color: "#fff" });
        S.crows.splice(i, 1); continue;
      }
      if ((cr.x - bx) * (cr.x - bx) + (cr.y - by) * (cr.y - by) < 20 * 20) { hit = cr.bomb ? "Corn bombed by the mascot" : cr.punt ? "Hit by their punt" : "Flag on the play"; killer = null; }
    }
    if (!S.passedLong && S.bestWas > 2 && S.t > S.bestWas) S.passedLong = true;   // past the longest-hang line
    if (!S.passedBest && S.bestPtsWas > 60 && S.pts > S.bestPtsWas) {
      S.passedBest = true;
      sfx.gate(); burst(BX, S.y, 30); shake = 6;
      fireworks();
      S.bestGold = S.base < S.bestPtsWas;                  // only the punt that began below the old best earns the golden spin; it is banked when the punt lands
      floaters.push({ text: S.bestGold ? "NEW BEST!  GOLDEN SPIN" : "NEW BEST!", life: 0, color: GOLD });
    }
    if (S.y > FLOOR) { S.y = FLOOR; hit = "Downed"; killer = null; }
    if (hit && S.safe > 0) {                            // just saved: nothing can touch it for a moment
      if (hit === "Downed") S.vy = TAP;
    } else if (hit && S.shield) {                       // the helmet takes one hit
      S.shield = false; S.safe = 1.4;
      S.vy = hit === "Downed" ? PUNT * 0.75 : TAP * 0.6;
      shake = 9; flash = 0.6;
      sfx.saved();
      burst(BX, S.y, 14);
      floaters.push({ text: "SAVED BY THE HELMET", life: 0, color: "#fff" });
    } else if (hit) { S.killer = killer; die(hit); }
  }

  // ---------- drawing ----------

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  function player(x, y, o) {
    var run = o.run ? Math.sin(now * 16 + (o.seed || 0)) : 0, d = o.dir;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.5, 1.5);
    if (!o.air) { ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(0, 1, 9, 2.6, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = INK; ctx.lineWidth = 6.4;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(-3 - run * 5, -0.5);
    ctx.moveTo(0, -11);
    if (o.kick) ctx.lineTo(d * 11, -14); else ctx.lineTo(3 + run * 5, -0.5);
    ctx.stroke();
    ctx.strokeStyle = o.pants; ctx.lineWidth = 4.2; ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    ctx.fillStyle = o.jersey;
    rr(-5, -24.5, 10, 14.5, 3.4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.number; ctx.fillRect(-2.2, -20.5, 4.4, 1.6); ctx.fillRect(-2.2, -17.6, 4.4, 1.6);
    ctx.strokeStyle = INK; ctx.lineWidth = 5.2;
    ctx.beginPath(); ctx.moveTo(d * 1, -21);
    if (o.up) { ctx.lineTo(d * 4, -36); ctx.moveTo(-d * 1, -21); ctx.lineTo(-d * 3, -36); }
    else ctx.lineTo(d * (6 + run * 2), -15 + run * 3);
    ctx.stroke();
    ctx.strokeStyle = o.jersey; ctx.lineWidth = 3.2; ctx.stroke();
    // helmet, in profile: a round shell cut away at the face, with a cage facemask
    ctx.save();
    ctx.translate(d * 1.2, -32.5);
    ctx.scale(d, 1);
    ctx.fillStyle = "#E3B089";
    rr(0.5, -0.5, 6, 7, 2.5); ctx.fill();
    ctx.fillStyle = o.helmet; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(7.6, -0.6);
    ctx.arc(0, 0, 7.8, -0.08, Math.PI * 0.9, true);
    ctx.quadraticCurveTo(-7.4, 6.6, -3.4, 7.4);
    ctx.lineTo(-0.2, 7.6);
    ctx.quadraticCurveTo(1.6, 5.2, 1.2, 2.2);
    ctx.quadraticCurveTo(3.4, -0.2, 7.6, -0.6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = o.stripe; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(0, 0, 5.6, -Math.PI * 0.8, -Math.PI * 0.22); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, 6.3, -Math.PI * 0.62, -Math.PI * 0.42); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(-1.8, 2.2, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = o.mask; ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(7.4, -0.2); ctx.quadraticCurveTo(10.8, 2, 10, 7.6); ctx.lineTo(0.4, 7.6);
    ctx.moveTo(10.4, 4.4); ctx.lineTo(1.6, 4.4);
    ctx.moveTo(6.6, 4.4); ctx.lineTo(6.6, 7.6);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  var HOME = { jersey: "#151515", helmet: GOLD, stripe: "#151515", pants: GOLD, number: GOLD, mask: "#111", dir: 1 };
  var AWAY = { jersey: "#ffffff", helmet: "#8A1F1F", stripe: "#ffffff", pants: "#8A1F1F", number: "#8A1F1F", mask: "#F2F2F2", dir: -1 };
  function kit(base, extra) {
    var o = {}, k;
    for (k in base) o[k] = base[k];
    for (k in extra) o[k] = extra[k];
    return o;
  }

  function drawBall(x, y, spin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.lineJoin = "round";
    if (ballId === "popcorn") {
      ctx.fillStyle = "#FFFBEA";
      for (var i = 0; i < 6; i++) {
        ctx.beginPath(); ctx.arc(Math.cos(i * 1.05) * 6, Math.sin(i * 1.05) * 6, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(-1, 1, 2.4, 0, Math.PI * 2); ctx.fill();
    } else if (ballId === "cob") {
      ctx.fillStyle = "#3FA34D";
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.quadraticCurveTo(-8, -9, -2, -6); ctx.lineTo(-2, 6); ctx.quadraticCurveTo(-8, 9, -15, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.ellipse(2, 0, 11, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,.28)";
      for (var a = -5; a <= 9; a += 3.5) for (var b = -3; b <= 3; b += 3) { ctx.beginPath(); ctx.arc(a, b, 0.9, 0, Math.PI * 2); ctx.fill(); }
    } else if (ballId === "dog") {
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-9, 0); ctx.stroke();
      ctx.strokeStyle = "#E8D5A8"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-9, 0); ctx.stroke();
      ctx.fillStyle = "#B8752E"; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
      rr(-10, -7, 24, 14, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2.2; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(-6, 1); ctx.lineTo(-2, -3); ctx.lineTo(2, 2); ctx.lineTo(6, -3); ctx.lineTo(10, 1); ctx.stroke();
    } else if (ballId === "pig") {
      ctx.fillStyle = "#F4A6B8";
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 8.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(8, -13); ctx.lineTo(10, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#E88AA0";
      ctx.beginPath(); ctx.ellipse(12, 1, 3.6, 4.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(6, -2.5, 1.2, 0, Math.PI * 2); ctx.arc(11.4, 0, 0.8, 0, Math.PI * 2); ctx.arc(12.8, 2, 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-13.5, -2, 2.4, 0.4, Math.PI * 1.6); ctx.stroke();
    } else {
      var skin = ctx.createLinearGradient(0, -9, 0, 9);
      skin.addColorStop(0, ballId === "gold" ? "#FFE98A" : "#B86A30");
      skin.addColorStop(1, ballId === "gold" ? "#D9A300" : "#6B3513");
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.moveTo(-13, 0); ctx.quadraticCurveTo(0, -11.5, 13, 0); ctx.quadraticCurveTo(0, 11.5, -13, 0);
      ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = ballId === "gold" ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.85)";
      ctx.fillRect(-9.6, -12, 2.2, 24); ctx.fillRect(7.4, -12, 2.2, 24);
      ctx.restore();
      ctx.strokeStyle = ballId === "gold" ? INK : "#fff"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-5, -1.4); ctx.lineTo(5, -1.4);
      for (var l = -4; l <= 4; l += 2.6) { ctx.moveTo(l, -3.4); ctx.lineTo(l, 0.6); }
      ctx.stroke();
      if (ballId === "gold") {
        ctx.rotate(-spin);
        ctx.fillStyle = "#fff";
        var tw = 2 + 2 * Math.sin(now * 9);
        ctx.fillRect(7 - tw / 2, -9, tw, 1.4); ctx.fillRect(6.3, -9 - tw / 2 + 0.7, 1.4, tw);
      }
    }
    ctx.restore();
  }

  // The corn from the Roll Corn logo, drawn around the current origin: the same ear shape,
  // tilted the same 30 degrees, black with the same brick pattern of rounded gold corn.
  function kernel(k) {
    ctx.save();
    ctx.rotate(Math.PI / 6);
    ctx.scale(k * 0.33, k * 0.33);                       // the logo's ear is 85 units tall
    function ear() {
      ctx.beginPath();
      ctx.moveTo(0, -43);
      ctx.bezierCurveTo(12, -43, 19.5, -23, 19.5, 2);
      ctx.bezierCurveTo(19.5, 26, 13, 42, 0, 42);
      ctx.bezierCurveTo(-13, 42, -19.5, 26, -19.5, 2);
      ctx.bezierCurveTo(-19.5, -23, -12, -43, 0, -43);
      ctx.closePath();
    }
    ctx.strokeStyle = INK; ctx.lineCap = "round"; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(0, 42); ctx.lineTo(0, 54); ctx.stroke();     // the stem
    ear(); ctx.fillStyle = INK; ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = GOLD;
    for (var row = 0, y = -44 + 1.1; y < 44; y += 10.5, row++) {
      for (var x = -6.3 - 12.6 * 2 + (row % 2 ? -6.3 : 0) + 1.1; x < 22; x += 12.6) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, 10.4, 8.3, 3.4); else ctx.rect(x, y, 10.4, 8.3);
        ctx.fill();
      }
    }
    ctx.restore();
    ear(); ctx.lineWidth = 5.5; ctx.lineJoin = "round"; ctx.stroke();
    ctx.restore();
  }

  function cornEar(x, y, h) {
    ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y - h * 0.55, h * 0.24, h * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = TURF;
    ctx.beginPath();
    ctx.moveTo(x - h * 0.32, y - h * 0.55);
    ctx.quadraticCurveTo(x - h * 0.3, y, x, y);
    ctx.quadraticCurveTo(x + h * 0.3, y, x + h * 0.32, y - h * 0.55);
    ctx.quadraticCurveTo(x, y - h * 0.12, x - h * 0.32, y - h * 0.55);
    ctx.fill(); ctx.stroke();
  }

  function mix3(a, b, c, t) { return t < 0.5 ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2); }

  // a cloud with a shaded underside
  function puffCloud(x, y, s, col, under) {
    for (var pass = 0; pass < 2; pass++) {
      var dy = pass ? 0 : 6 * s;
      ctx.fillStyle = pass ? col : under;
      ctx.beginPath();
      ctx.ellipse(x, y + dy, 38 * s, 12 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 18 * s, y - 7 * s + dy, 17 * s, 12 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 8 * s, y - 12 * s + dy, 22 * s, 16 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 26 * s, y - 4 * s + dy, 14 * s, 10 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function hills(off, base, amp, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(-20, GY + 10);
    for (var hx = -20; hx <= VW + 20; hx += 16) {
      ctx.lineTo(hx, GY - base - amp * Math.sin((hx + off) * 0.006 + 1) - amp * 0.5 * Math.sin((hx + off) * 0.021 + base));
    }
    ctx.lineTo(VW + 20, GY + 10); ctx.fill();
  }

  // the sky runs from afternoon to sunset to dusk to night the longer the punt stays up
  function sky() {
    var a = clamp(tod, 0, 1), b = clamp(tod - 1, 0, 1), i;
    var g = ctx.createLinearGradient(0, 0, 0, GY);
    g.addColorStop(0, mix3(mix("#2F8FDD", "#2A3C92", a), "#241B5A", "#040716", b));
    g.addColorStop(0.55, mix3(mix("#8CCEF5", "#E56F5C", a), "#7A3F86", "#0E1840", b));
    g.addColorStop(1, mix3(mix("#FFF3CC", "#FFC465", a), "#E67E9B", "#27306E", b));
    ctx.fillStyle = g; ctx.fillRect(-20, -20, VW + 40, VH + 40);

    if (b > 0) {
      ctx.fillStyle = "#fff";
      for (i = 0; i < stars.length; i++) {
        ctx.globalAlpha = b * (0.45 + 0.55 * Math.sin(now * 2 + stars[i].p));
        ctx.beginPath(); ctx.arc(stars[i].x * VW, stars[i].y * GY * 0.9, stars[i].r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = b;
      var mx = VW * 0.8, my = 92, halo = ctx.createRadialGradient(mx, my, 10, mx, my, 90);
      halo.addColorStop(0, "rgba(220,230,255,.35)"); halo.addColorStop(1, "rgba(220,230,255,0)");
      ctx.fillStyle = halo; ctx.fillRect(mx - 95, my - 95, 190, 190);
      ctx.fillStyle = "#F6F2DC";
      ctx.beginPath(); ctx.arc(mx, my, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.08)";
      ctx.beginPath(); ctx.arc(mx - 7, my - 5, 5, 0, Math.PI * 2); ctx.arc(mx + 6, my + 7, 3.5, 0, Math.PI * 2); ctx.arc(mx + 8, my - 8, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (tod < 1.35) {                                   // the sun, with slow rays, sinking as the punt goes on
      var sx = VW * 0.72, sy = lerp(235, GY + 14, clamp(tod, 0, 1.15)), fade = clamp(1.35 - tod, 0, 1);
      var bloom = ctx.createRadialGradient(sx, sy, 6, sx, sy, 190);
      bloom.addColorStop(0, a > 0.5 ? "rgba(255,196,120," + fade + ")" : "rgba(255,246,190," + fade + ")");
      bloom.addColorStop(0.35, "rgba(255,220,150," + (0.35 * fade).toFixed(2) + ")");
      bloom.addColorStop(1, "rgba(255,220,150,0)");
      ctx.fillStyle = bloom; ctx.fillRect(sx - 200, sy - 200, 400, 400);
      var disc = ctx.createRadialGradient(sx - 6, sy - 6, 2, sx, sy, 27);
      disc.addColorStop(0, "#FFFDF0"); disc.addColorStop(1, mix("#FFE98A", "#FF8A4C", a));
      ctx.fillStyle = disc;
      ctx.beginPath(); ctx.arc(sx, sy, 27, 0, Math.PI * 2); ctx.fill();
    }
    var cc = mix3(mix("#FFFFFF", "#FFDCC0", a), "#C295BC", "#2F3766", b);
    var cu = mix3(mix("#CFE2F1", "#E8957A", a), "#7E5796", "#1A2046", b);
    for (i = 0; i < clouds.length; i++) puffCloud(clouds[i].x, clouds[i].y, clouds[i].s, cc, cu);

    // two ranges of hills, the far one paler, then the barn
    hills(S.dist * 0.05 + 900, 50, 17, mix3(mix("#ABD9A4", "#B79F74", a), "#5C6F8A", "#16293B", b));
    hills(S.dist * 0.12 + 300, 26, 13, mix3(mix("#86C37A", "#7E9A5E", a), "#3F5A63", "#102A2A", b));

    var bx = ((520 - S.dist * 0.2) % 1300 + 1300) % 1300 - 120, by = GY - 16, u = 1.7;
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(bx + 24 * u, by + 1, 30 * u, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.lineJoin = "round";
    var silo = ctx.createLinearGradient(bx + 30 * u, 0, bx + 40 * u, 0);
    silo.addColorStop(0, "#F1EEE2"); silo.addColorStop(1, "#B9B5A5");
    ctx.fillStyle = silo;
    rr(bx + 30 * u, by - 34 * u, 10 * u, 34 * u, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#8E8A7B";
    ctx.beginPath(); ctx.arc(bx + 35 * u, by - 34 * u, 5 * u, Math.PI, 0); ctx.fill(); ctx.stroke();
    var red = ctx.createLinearGradient(bx, 0, bx + 26 * u, 0);
    red.addColorStop(0, "#C8302A"); red.addColorStop(1, "#8F1C18");
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx, by - 16 * u); ctx.lineTo(bx + 5 * u, by - 24 * u); ctx.lineTo(bx + 13 * u, by - 28 * u);
    ctx.lineTo(bx + 21 * u, by - 24 * u); ctx.lineTo(bx + 26 * u, by - 16 * u); ctx.lineTo(bx + 26 * u, by); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(bx + 1, by - 16 * u); ctx.lineTo(bx + 25 * u, by - 16 * u); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.fillStyle = b > 0.4 ? "#FFE680" : "#fff";
    ctx.fillRect(bx + 9 * u, by - 11 * u, 8 * u, 11 * u); ctx.strokeRect(bx + 9 * u, by - 11 * u, 8 * u, 11 * u);
    ctx.beginPath(); ctx.moveTo(bx + 9 * u, by - 11 * u); ctx.lineTo(bx + 17 * u, by); ctx.moveTo(bx + 17 * u, by - 11 * u); ctx.lineTo(bx + 9 * u, by); ctx.stroke();
    if (b > 0.4) {                                      // a light in the barn at night
      var lamp = ctx.createRadialGradient(bx + 13 * u, by - 5 * u, 2, bx + 13 * u, by - 5 * u, 46);
      lamp.addColorStop(0, "rgba(255,230,128," + (0.45 * b).toFixed(2) + ")"); lamp.addColorStop(1, "rgba(255,230,128,0)");
      ctx.fillStyle = lamp; ctx.fillRect(bx - 40, by - 60, 130, 90);
    }
    // haze where the land meets the sky
    var haze = ctx.createLinearGradient(0, GY - 90, 0, GY);
    haze.addColorStop(0, "rgba(255,255,255,0)"); haze.addColorStop(1, "rgba(255,255,255," + (0.22 * (1 - b)).toFixed(2) + ")");
    ctx.fillStyle = haze; ctx.fillRect(-20, GY - 90, VW + 40, 90);
  }

  function cornRow(off, top, step, col, tassel) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(-20, GY + 1);
    for (var zi = Math.floor(off / step), zx = -(off % step) - step * 2; zx <= VW + 20; zx += step, zi++) {
      ctx.lineTo(zx, GY - top + (zi % 2 ? 0 : 7) + 1.5 * Math.sin(now * 1.5 + zi));
    }
    ctx.lineTo(VW + 20, GY + 1); ctx.fill();
    if (!tassel) return;
    ctx.fillStyle = GOLD;
    for (var gi = Math.floor(off / 46), gx = -(off % 46); gx < VW + 20; gx += 46, gi++) {
      ctx.beginPath(); ctx.ellipse(gx, GY - top * 0.45 + (gi % 3) * 2.5, 1.8, 3.8, 0.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // There is always a small stand behind the far sideline, with a crowd that gets to its feet when something
  // good happens. What is built under "Build your stadium" grows from there: more rows of bleachers,
  // a scoreboard that keeps the score, a press box, light poles, and a tunnel in the end zone. A finished
  // stadium stays, and each new one adds pennants along the top.
  function stadiumBack() {
    if (typeof built === "undefined") return;
    var lv = built.map(function (v) { return stadium > 1 ? 3 : v; });
    var base = GY - 12, off = S.dist * 0.42, P = 720, night = clamp(tod - 1, 0, 1), i, r;
    var joy = clamp(1 - (now - cheerAt) / 1.7, 0, 1);              // how much of the cheer is left
    var spark = clamp(1 - (now - sparkAt) / 1.6, 0, 1);            // and of the camera flashes, for a big win on the machine
    for (var k = Math.floor(off / P) - 1; k * P - off < VW + 40; k++) {
      var x0 = k * P - off, sx = x0 + 60, sw = 330;
      if (lv[3]) {                                                   // light poles, either side of the stand
        for (i = 0; i < 2; i++) {
          var lx = sx - 26 + i * (sw + 52), lh = 96 + lv[3] * 16;
          ctx.strokeStyle = "#4A4A46"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx, base); ctx.lineTo(lx, base - lh); ctx.stroke();
          ctx.fillStyle = "#2A2A28"; rr(lx - 13, base - lh - 9, 26, 10, 2); ctx.fill();
          ctx.fillStyle = night > 0.2 ? "#FFF6C2" : "#D9D6C6";
          for (r = 0; r < 4; r++) { ctx.beginPath(); ctx.arc(lx - 9 + r * 6, base - lh - 4, 2, 0, Math.PI * 2); ctx.fill(); }
          if (night > 0.2) {
            var glow = ctx.createRadialGradient(lx, base - lh - 4, 2, lx, base - lh - 4, 90);
            glow.addColorStop(0, "rgba(255,244,190," + (0.5 * night).toFixed(2) + ")"); glow.addColorStop(1, "rgba(255,244,190,0)");
            ctx.fillStyle = glow; ctx.fillRect(lx - 90, base - lh - 94, 180, 180);
          }
        }
      }
      {                                                              // bleachers: five rows to begin with, two more a level, and somebody in most seats
        var rows = 5 + lv[0] * 2, rh = 7.5, top = base - rows * rh;
        ctx.fillStyle = "#6F6F69"; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(sx - 8, base); ctx.lineTo(sx + 6, top - 3); ctx.lineTo(sx + sw - 6, top - 3); ctx.lineTo(sx + sw + 8, base); ctx.closePath(); ctx.fill(); ctx.stroke();
        for (r = 0; r < rows; r++) {
          var ry = base - (r + 1) * rh, inset = 8 - (r / rows) * 2 + 6 * ((r + 1) / rows);
          ctx.fillStyle = r % 2 ? "#8C8C85" : "#A3A39B"; ctx.fillRect(sx + inset - 6, ry, sw - (inset - 6) * 2, rh - 1);
          for (i = 0; i * 9 < sw - inset * 2 - 6; i++) {
            var seed = (k * 131 + r * 17 + i * 7) % 11;
            if (seed === 0) continue;                                 // an empty seat here and there
            ctx.fillStyle = seed < 5 ? GOLD : seed < 8 ? "#151515" : "#F3F1E6";
            ctx.fillRect(sx + inset + i * 9, ry + 1.2 - (joy > 0 ? Math.abs(Math.sin(now * 10 + i * 1.3 + r)) * 3.4 * joy : Math.sin(now * 3 + i + r) * 0.5), 5, 4.6);
            if (spark > 0 && (k * 131 + r * 17 + i * 7 + Math.floor(now * 14) * 11) % 41 === 0) { ctx.fillStyle = "rgba(255,255,255," + spark.toFixed(2) + ")"; ctx.fillRect(sx + inset + i * 9 - 2, ry - 2.5, 9, 9); }
          }
        }
        if (lv[2]) {                                                 // the press box sits on top
          var pw = 86 + lv[2] * 18, ph = 15 + lv[2] * 3, px = sx + sw / 2 - pw / 2, py = top - 3 - ph;
          ctx.fillStyle = "#1C1C1C"; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; rr(px, py, pw, ph, 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = night > 0.2 ? "#FFE680" : "#BFE4F6";
          for (i = 0; i * 14 + 8 < pw - 8; i++) ctx.fillRect(px + 6 + i * 14, py + 4, 10, ph - 9);
          ctx.fillStyle = GOLD; ctx.fillRect(px, py - 2.5, pw, 2.5);
        }
        if (stadium > 1) {                                           // a pennant for each thing built in the new stadium
          var flags = built.reduce(function (a, b) { return a + b; }, 0) + (stadium - 2) * 3;
          for (i = 0; i < Math.min(flags, 14); i++) {
            var fx = sx + 14 + i * ((sw - 28) / 13), fy = top - 6 - (lv[2] ? 0 : 0);
            ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 12); ctx.stroke();
            ctx.fillStyle = i % 2 ? GOLD : "#151515"; ctx.beginPath(); ctx.moveTo(fx, fy - 12); ctx.lineTo(fx + 8 + Math.sin(now * 5 + i) * 1.2, fy - 9.5); ctx.lineTo(fx, fy - 7); ctx.closePath(); ctx.fill();
          }
        }
      }
      if (lv[1]) {                                                   // the scoreboard, and it keeps the real score
        var bw = 92 + lv[1] * 14, bh = 38 + lv[1] * 5, bx = x0 + 470, by = base - 62 - lv[1] * 10;
        ctx.strokeStyle = "#4A4A46"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx + 14, base); ctx.lineTo(bx + 14, by + bh); ctx.moveTo(bx + bw - 14, base); ctx.lineTo(bx + bw - 14, by + bh); ctx.stroke();
        ctx.fillStyle = "#0B0B0B"; ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; rr(bx, by, bw, bh, 4); ctx.fill(); ctx.stroke();
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#C9C9BF"; ctx.font = "700 8px " + LABEL; ctx.fillText("ROLL CORN  \u00B7  " + quarterName(S.q || 0), bx + bw / 2, by + 9, bw - 8);
        ctx.fillStyle = GOLD; ctx.font = "700 " + (18 + lv[1] * 2) + "px " + DISPLAY;
        ctx.fillText(Math.floor(S.pts || 0).toLocaleString("en-US"), bx + bw / 2, by + bh / 2 + 6, bw - 10);
      }
    }
    if (lv[4]) {                                                     // the tunnel the team runs out of, right behind the punter
      var th = 40 + lv[4] * 7, tw = 62 + lv[4] * 6, tx = BX - 54 - S.dist - tw / 2;
      if (tx > -tw - 20) {
        for (i = 0; i < 5; i++) {
          ctx.fillStyle = i % 2 ? "#151515" : GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.ellipse(tx + tw / 2, GY + 2, tw / 2 - i * 5, th - i * 6, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = "#050505"; ctx.beginPath(); ctx.ellipse(tx + tw / 2, GY + 2, tw / 2 - 25, th - 30, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
      }
    }
  }

  function field() {
    stadiumBack();
    // a row of corn along the far sideline
    cornRow(S.dist * 0.62, 22, 7, HUSK, true);

    // the field scrolls by: mown stripes, yard lines, numbers, and the end zone the punt left from
    var goal = BX - 40, five = YARD * 5;
    var first = Math.floor((S.dist - goal) / five) - 1;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var k = first; goal + k * five - S.dist < VW + five; k++) {
      var x = goal + k * five - S.dist;
      ctx.fillStyle = k < -3 ? "#6B4F35" : k < 0 ? "#111" : k % 2 ? "#43A951" : "#318F43";
      ctx.fillRect(x - 0.5, GY, five + 1, TURF_H + 20);
      if (k < 0) continue;
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.fillRect(x - 1.2, GY, 2.4, TURF_H);
      ctx.fillStyle = "rgba(255,255,255,.5)";                       // hash marks, a yard apart
      for (var hm = 1; hm < 5; hm++) { ctx.fillRect(x + hm * YARD - 0.6, GY + 9, 1.2, 5); ctx.fillRect(x + hm * YARD - 0.6, GY + TURF_H - 15, 1.2, 5); }
      var yd = (k * 5) % 100;
      if (k > 0 && yd === 0) {
        ctx.fillStyle = GOLD; ctx.font = "700 16px " + DISPLAY;
        ctx.fillText("ROLL CORN", x, GY + TURF_H * 0.55);
      } else if (k % 2 === 0 && k > 0) {
        ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.font = "700 22px " + DISPLAY;
        ctx.fillText(String(yd <= 50 ? yd : 100 - yd), x - 18, GY + TURF_H * 0.55);
      }
    }
    var ez = goal - S.dist;
    if (ez > -20) {
      ctx.fillStyle = GOLD; ctx.font = "700 25px " + DISPLAY;
      ctx.fillText("ROLL", ez - five * 1.5, GY + TURF_H * 0.3, five * 3 - 24);
      ctx.fillText("CORN", ez - five * 1.5, GY + TURF_H * 0.72, five * 3 - 24);
      ctx.fillStyle = "#fff"; ctx.fillRect(ez - 2.5, GY, 5, TURF_H);
      cornEar(ez, GY + TURF_H * 0.5 + 2, 24);
    }
    // light falls across the grass: darker under the corn, brighter toward the near sideline
    var shade = ctx.createLinearGradient(0, GY, 0, GY + TURF_H);
    shade.addColorStop(0, "rgba(0,0,0,.30)"); shade.addColorStop(0.25, "rgba(0,0,0,.04)");
    shade.addColorStop(0.7, "rgba(255,255,255,.07)"); shade.addColorStop(1, "rgba(0,0,0,.12)");
    ctx.fillStyle = shade; ctx.fillRect(-20, GY, VW + 40, TURF_H);
    ctx.fillStyle = "#fff";
    ctx.fillRect(-20, GY, VW + 40, 2.5);
    ctx.fillRect(-20, GY + TURF_H - 3.5, VW + 40, 3.5);
    ctx.fillStyle = "#1C5A2B";
    ctx.fillRect(-20, GY + TURF_H, VW + 40, 20);
  }

  // one defender, drawn from the feet up to a height of h; the top man reaches for the ball
  function blocker(cx, feet, h, top, seed) {
    var sway = Math.sin(now * 2.4 + (seed || 0)), num = 10 + Math.abs(Math.round((seed || 0) * 7)) % 89;
    ctx.save();
    ctx.translate(cx, feet); ctx.scale(Math.max(1.05, Math.min(1.25, h / 58)), h / 58);   // always as wide as the space he blocks
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = INK; ctx.lineWidth = 8.5;
    ctx.beginPath(); ctx.moveTo(-4, -20); ctx.lineTo(-8, -1); ctx.moveTo(4, -20); ctx.lineTo(8, -1); ctx.stroke();
    ctx.strokeStyle = "#8A1F1F"; ctx.lineWidth = 5.5; ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 7.5;
    ctx.beginPath();
    if (top) { ctx.moveTo(-8, -37); ctx.lineTo(-13 + sway * 1.8, -56); ctx.moveTo(8, -37); ctx.lineTo(13 + sway * 1.8, -56); }   // hands up, feeling for the ball
    else { ctx.moveTo(-8, -36); ctx.lineTo(-20, -28 + sway * 2.5); ctx.moveTo(8, -36); ctx.lineTo(20, -28 - sway * 2.5); }       // arms out, keeping his balance
    ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 4.5; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
    rr(-10, -41, 20, 23, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#8A1F1F"; ctx.font = "700 13px " + DISPLAY; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(num), 0, -29, 16);                                                     // his number
    ctx.beginPath(); ctx.arc(0, -48, 8.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();           // helmet, face on
    ctx.fillStyle = "#E3B089"; rr(-5.5, -48.5, 11, 6.5, 2.5); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(0, -56.5); ctx.lineTo(0, -49.5); ctx.stroke();
    ctx.strokeStyle = "#E6E6E6"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-6.5, -45.5); ctx.lineTo(6.5, -45.5); ctx.moveTo(-5.5, -42.6); ctx.lineTo(5.5, -42.6); ctx.moveTo(0, -47.5); ctx.lineTo(0, -41.5); ctx.stroke();
    ctx.restore();
  }

  // the punt-block wall: defenders standing on each other's shoulders, as tall as it needs to be
  function wall(x, w, bot, seed) {
    var tall = FEET - bot, n = Math.max(1, Math.round(tall / 60)), each = tall / n, cx = x + w / 2;
    ctx.fillStyle = "rgba(0,0,0,.26)";
    ctx.beginPath(); ctx.ellipse(cx + 4, FEET + 2, w * 0.6, 5, 0, 0, Math.PI * 2); ctx.fill();
    for (var i = 0; i < n; i++) blocker(cx, FEET - i * each, each, i === n - 1, (seed || 0) + i * 37);
  }

  // goalposts: put the ball between the uprights and over the bar for five
  function gate(o, x) {
    var cx = x + o.w / 2, l = x + 1, r = x + o.w - 1, wv = Math.sin(now * 7 + o.x * 0.05);
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(cx + 3, FEET + 2, 12, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,225,90," + (0.2 + 0.07 * Math.sin(now * 4)).toFixed(2) + ")";      // the way through, gently lit
    ctx.fillRect(l, o.tip, r - l, o.bot - o.tip);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? "#F2C500" : INK; ctx.lineWidth = pass ? 4.5 : 8;
      ctx.beginPath();
      ctx.moveTo(cx, FEET); ctx.lineTo(cx, o.bot);
      ctx.moveTo(l, o.tip); ctx.lineTo(l, o.bot); ctx.lineTo(r, o.bot); ctx.lineTo(r, o.tip);
      ctx.stroke();
    }
    if (o.bot < FEET - 36) {                                                                     // the pad around the foot of the post
      ctx.fillStyle = "#151515"; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
      rr(cx - 6.5, FEET - 27, 13, 27, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = GOLD; ctx.fillRect(cx - 5.6, FEET - 18, 11.2, 5);
    }
    ctx.fillStyle = RED; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;                            // ribbons on the tips, in the wind
    [l, r].forEach(function (ux) { ctx.beginPath(); ctx.moveTo(ux, o.tip); ctx.lineTo(ux + 10 + wv, o.tip + 3.5 + wv * 1.5); ctx.lineTo(ux, o.tip + 8); ctx.closePath(); ctx.fill(); ctx.stroke(); });
  }

  // the other team's bench: three of them sitting it out, helmets on, and the water cooler at the end of it
  function bench(x, o) {
    var top = o.bot, seat = top + 44, i;
    ctx.fillStyle = "rgba(0,0,0,.24)";
    ctx.beginPath(); ctx.ellipse(x + o.w / 2 + 4, FEET + 3, o.w * 0.56, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (seat < FEET) {                                                                           // the legs of the bench, and of the cooler's table
      ctx.lineCap = "butt";
      ctx.strokeStyle = INK; ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + 9, seat); ctx.lineTo(x + 9, FEET + 1); ctx.moveTo(x + 83, seat); ctx.lineTo(x + 83, FEET + 1);
      ctx.moveTo(x + 99, seat); ctx.lineTo(x + 99, FEET + 1); ctx.moveTo(x + 115, seat); ctx.lineTo(x + 115, FEET + 1);
      ctx.stroke();
      ctx.strokeStyle = "#8C8C8C"; ctx.lineWidth = 3; ctx.stroke();
    }
    for (i = 0; i < 3; i++) {
      var px = x + 22 + i * 28, nod = Math.sin(now * 1.6 + i * 2 + o.x) * 0.8;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = INK; ctx.lineWidth = 8.5;                                                 // legs, knees forward
      ctx.beginPath(); ctx.moveTo(px, seat - 3); ctx.lineTo(px - 11, seat - 3); ctx.lineTo(px - 11, Math.max(seat, FEET - 1)); ctx.stroke();
      ctx.strokeStyle = "#8A1F1F"; ctx.lineWidth = 5.5; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
      rr(px - 9, top + 15, 19, 26, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#8A1F1F"; ctx.fillRect(px - 3, top + 21, 8, 2.6); ctx.fillRect(px - 3, top + 26, 8, 2.6);
      ctx.strokeStyle = INK; ctx.lineWidth = 6.5;                                                 // an arm, resting on the knee
      ctx.beginPath(); ctx.moveTo(px - 1, top + 22); ctx.lineTo(px - 10, seat - 8); ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3.8; ctx.stroke();
      ctx.fillStyle = "#8A1F1F"; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(px - 1 + nod, top + 9, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();      // helmet, facing the ball
      ctx.fillStyle = "#E3B089"; rr(px - 9 + nod, top + 7, 6, 7, 2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px - 1 + nod, top + 9, 6.2, -Math.PI * 0.85, -Math.PI * 0.2); ctx.stroke();   // the stripe over the top
      ctx.strokeStyle = "#E6E6E6"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(px - 4 + nod, top + 9); ctx.lineTo(px - 11 + nod, top + 10); ctx.lineTo(px - 10 + nod, top + 15); ctx.lineTo(px - 3 + nod, top + 15); ctx.stroke();
    }
    ctx.lineJoin = "round";
    ctx.fillStyle = "#3D6FB5"; ctx.strokeStyle = INK; ctx.lineWidth = 2;                         // the bench itself
    rr(x, seat, 92, 9, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#C9C9C9"; rr(x + 94, seat, 26, 5, 2); ctx.fill(); ctx.stroke();             // the cooler, on its own little table
    ctx.fillStyle = "#F26A1B"; rr(x + 97, seat - 21, 20, 21, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; rr(x + 96, seat - 25, 22, 6, 2.5); ctx.fill(); ctx.stroke();
    ctx.fillRect(x + 100, seat - 14, 14, 4.5);
    ctx.fillStyle = INK; ctx.fillRect(x + 94.5, seat - 6, 3.5, 2.6);
  }

  // the mascot: an ear of corn with a face, bouncing on a trampoline
  function mascot(cx, o) {
    var near = clamp(1 - o.jy / 16, 0, 1), y = BED - o.jy + near * 5;      // close to the bed it sags under him, and he squashes
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(0,0,0,.24)"; ctx.beginPath(); ctx.ellipse(cx + 3, FEET + 2, 40, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 5;                                                    // the trampoline stands on the grass: legs, a brace, the bed
    ctx.beginPath(); ctx.moveTo(cx - 30, BED); ctx.lineTo(cx - 34, FEET); ctx.moveTo(cx + 30, BED); ctx.lineTo(cx + 34, FEET); ctx.stroke();
    ctx.strokeStyle = "#8C8C8C"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 32, BED + 10); ctx.lineTo(cx + 32, BED + 10); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cx - 34, BED); ctx.quadraticCurveTo(cx, BED + near * 10, cx + 34, BED); ctx.stroke();
    ctx.strokeStyle = "#3D6FB5"; ctx.lineWidth = 5; ctx.stroke();
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(1 + near * 0.08, 1 - near * 0.1);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = INK; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(-8, 0); ctx.moveTo(6, -10); ctx.lineTo(8, 0);          // legs
    ctx.moveTo(-13, -36); ctx.lineTo(-23, -50); ctx.moveTo(13, -36); ctx.lineTo(23, -50); ctx.stroke();      // arms up
    ctx.fillStyle = "#3FA34D"; ctx.strokeStyle = INK; ctx.lineWidth = 2;                         // husk
    ctx.beginPath(); ctx.moveTo(-16, -30); ctx.quadraticCurveTo(-17, -6, 0, -6); ctx.quadraticCurveTo(17, -6, 16, -30); ctx.quadraticCurveTo(0, -16, -16, -30); ctx.fill(); ctx.stroke();
    ctx.fillStyle = GOLD;                                                                        // the ear
    ctx.beginPath(); ctx.ellipse(0, -37, 13.5, 25, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#3FA34D";
    ctx.beginPath(); ctx.moveTo(-16, -30); ctx.quadraticCurveTo(-15, -10, 0, -8); ctx.quadraticCurveTo(-8, -18, -13, -34); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16, -30); ctx.quadraticCurveTo(15, -10, 0, -8); ctx.quadraticCurveTo(8, -18, 13, -34); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.lineWidth = 1.4;                                                 // face
    ctx.beginPath(); ctx.arc(-5, -44, 3.6, 0, Math.PI * 2); ctx.arc(5, -44, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-5.8, -44, 1.5, 0, Math.PI * 2); ctx.arc(4.2, -44, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, -37, 5.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  // the returner: he waits, crouches as the ball comes, and goes up with both hands
  function returner(cx, o) {
    var squat = o.st === 0 && o.crouchAt ? clamp((now - o.crouchAt) / 0.16, 0, 1) : 0;
    ctx.save();
    ctx.translate(cx, FEET - o.jy);
    if (squat) ctx.scale(1 + squat * 0.1, 1 - squat * 0.17);
    player(0, 0, kit(AWAY, { up: o.st === 1, air: o.jy > 0 }));
    ctx.restore();
  }

  // a referee on the field: stripes, white cap, and an arm that comes up as he throws
  function referee(x, rf) {
    var feet = GY + TURF_H * 0.5, up = rf.st === 1 ? Math.min(1, rf.wind / 0.28) : rf.st === 2 ? 1 : 0;
    ctx.save();
    ctx.translate(x, feet); ctx.scale(1.5, 1.5);
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(0, 1, 9, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = INK; ctx.lineWidth = 5.6;
    ctx.beginPath(); ctx.moveTo(-1, -11); ctx.lineTo(-4, -0.5); ctx.moveTo(1, -11); ctx.lineTo(4, -0.5); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    rr(-5.5, -25, 11, 15, 3.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    for (var st = -3.6; st <= 3; st += 3.3) ctx.fillRect(st, -24.4, 1.5, 13.6);                 // the stripes
    ctx.strokeStyle = INK; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-2, -22); ctx.lineTo(-7 - up * 2, -17 - up * 17); ctx.stroke();   // throwing arm, toward the ball
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.8; ctx.stroke();
    if (rf.st < 2) { ctx.fillStyle = "#FFD400"; ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(-7 - up * 2, -17 - up * 17, 2.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = "#E3B089"; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(-0.5, -30, 4.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-0.5, -31, 5, Math.PI, 0); ctx.lineTo(-9, -30.6); ctx.closePath(); ctx.fill(); ctx.stroke();   // cap, brim forward
    ctx.restore();
  }

  // a yellow penalty flag, thrown hard, weighted end first
  function flag(x, y) {
    var wv = Math.sin(now * 14 + x * 0.02);
    ctx.fillStyle = "#FFD400"; ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x - 9, y);
    ctx.quadraticCurveTo(x + 3, y - 13 - wv * 3, x + 17, y - 7 + wv * 4);
    ctx.quadraticCurveTo(x + 26, y + wv * 3, x + 19, y + 9 - wv * 3);
    ctx.quadraticCurveTo(x + 4, y + 11, x - 9, y);
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x - 12, y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function drawSym(ch, x, y) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
    if (ch === "K") {
      ctx.save(); ctx.translate(x, y); kernel(1.3); ctx.restore();
    } else if (ch === "F") {
      ctx.fillStyle = "#8B4A1E";
      ctx.beginPath(); ctx.moveTo(x - 15, y); ctx.quadraticCurveTo(x, y - 13, x + 15, y); ctx.quadraticCurveTo(x, y + 13, x - 15, y); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 1.5); ctx.lineTo(x + 6, y - 1.5);
      for (var l = -4.5; l <= 4.5; l += 3) { ctx.moveTo(x + l, y - 4); ctx.lineTo(x + l, y + 1); }
      ctx.stroke();
    } else if (ch === "P") {                             // the kernel magnet: a red horseshoe with silver tips
      ctx.lineCap = "butt";
      ctx.strokeStyle = INK; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(x - 9, y + 12); ctx.lineTo(x - 9, y - 2); ctx.arc(x, y - 2, 9, Math.PI, 0); ctx.lineTo(x + 9, y + 12); ctx.stroke();
      ctx.strokeStyle = "#D62828"; ctx.lineWidth = 7.4;
      ctx.beginPath(); ctx.moveTo(x - 9, y + 11); ctx.lineTo(x - 9, y - 2); ctx.arc(x, y - 2, 9, Math.PI, 0); ctx.lineTo(x + 9, y + 11); ctx.stroke();
      ctx.strokeStyle = "#E6E6E6";
      ctx.beginPath(); ctx.moveTo(x - 9, y + 11); ctx.lineTo(x - 9, y + 5); ctx.moveTo(x + 9, y + 11); ctx.lineTo(x + 9, y + 5); ctx.stroke();
    } else if (ch === "U") {                             // big uprights: gold goalposts
      ctx.lineCap = "round";
      ctx.strokeStyle = INK; ctx.lineWidth = 6.5;
      ctx.beginPath(); ctx.moveTo(x - 11, y - 14); ctx.lineTo(x - 11, y + 2); ctx.lineTo(x + 11, y + 2); ctx.lineTo(x + 11, y - 14); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 14); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 3.4; ctx.stroke();
    } else if (ch === "T") {                             // tailwind: three blue gusts
      ctx.lineCap = "round";
      for (var gz = 0; gz < 3; gz++) {
        var gy2 = y - 9 + gz * 9, gl = gz === 1 ? 15 : 10;
        ctx.strokeStyle = INK; ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.moveTo(x - 14, gy2); ctx.lineTo(x + gl - 6, gy2); ctx.arc(x + gl - 6, gy2 - 3.5, 3.5, Math.PI / 2, -Math.PI * 0.7, true); ctx.stroke();
        ctx.strokeStyle = "#5AA9E6"; ctx.lineWidth = 2.8; ctx.stroke();
      }
    } else if (ch === "H") {
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(x - 2, y, 12, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(x + 2, y + 3); ctx.lineTo(x + 1, y + 10); ctx.lineTo(x - 10, y + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x + 9, y + 1); ctx.lineTo(x + 14, y + 5); ctx.lineTo(x + 13, y + 10); ctx.lineTo(x + 2, y + 10); ctx.moveTo(x + 14, y + 6); ctx.lineTo(x + 3, y + 6); ctx.stroke();
    } else if (ch === "B") {                             // a blocker: gold jersey, black helmet, arms out
      ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - 13, y + 1); ctx.lineTo(x + 13, y + 1); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 3.4; ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
      ctx.fillStyle = GOLD; rr(x - 7, y - 4, 14, 17, 3.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillRect(x - 3, y + 1, 6, 2); ctx.fillRect(x - 3, y + 5, 6, 2);
      ctx.fillStyle = "#151515"; ctx.beginPath(); ctx.arc(x, y - 9, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 9); ctx.stroke();
    } else if (ch === "L") {                             // an extra life: a ball with a plus
      ctx.fillStyle = "#8A4B1F";
      ctx.beginPath(); ctx.ellipse(x - 3, y + 2, 12, 8, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 7, y + 4.5); ctx.lineTo(x + 1, y - 0.5); ctx.stroke();
      ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x + 9, y - 8, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x + 5.5, y - 8); ctx.lineTo(x + 12.5, y - 8); ctx.moveTo(x + 9, y - 11.5); ctx.lineTo(x + 9, y - 4.5); ctx.stroke();
    } else if (ch === "G") {                             // the bonus kick: a ball stood on a tee
      ctx.fillStyle = "#8B4A1E";
      ctx.beginPath(); ctx.ellipse(x, y - 3, 7.5, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 2); ctx.moveTo(x - 2.5, y - 6); ctx.lineTo(x + 2.5, y - 6); ctx.moveTo(x - 2.5, y - 2); ctx.lineTo(x + 2.5, y - 2); ctx.stroke();
      ctx.fillStyle = "#F26A1B"; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(x - 10, y + 15); ctx.lineTo(x - 5, y + 8); ctx.lineTo(x + 5, y + 8); ctx.lineTo(x + 10, y + 15); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (ch === "S") {                             // super punt: a bolt on a black ball
      ctx.fillStyle = "#151515"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 3, y - 11); ctx.lineTo(x - 7, y + 2); ctx.lineTo(x - 1, y + 2); ctx.lineTo(x - 4, y + 11);
      ctx.lineTo(x + 8, y - 3); ctx.lineTo(x + 2, y - 3); ctx.lineTo(x + 7, y - 11); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else mark(x, y, 36);                              // the jackpot symbol is the Roll Corn mark
  }

  function sign(lines, cy, style, age) {
    var big = Math.min(42, VW * 0.085), sub = Math.min(17, VW * 0.04);
    ctx.font = "700 " + big + "px " + DISPLAY;
    var w = ctx.measureText(lines[0]).width;
    ctx.font = "700 " + sub + "px " + LABEL;
    for (var i = 1; i < lines.length; i++) w = Math.max(w, ctx.measureText(lines[i]).width);
    w = Math.min(VW - 20, w + 48);
    var h = big + 26 + (lines.length - 1) * (sub + 8);
    var t = clamp((age === undefined ? 1 : age) / 0.28, 0, 1), pop = 1 + 0.35 * Math.sin(t * Math.PI) * (1 - t) + (t - 1) * 0.3;
    ctx.save();
    ctx.translate(VW / 2, cy); ctx.scale(pop, pop);
    ctx.fillStyle = "rgba(0,0,0,.28)"; rr(-w / 2 + 5, -h / 2 + 6, w, h, 10); ctx.fill();
    ctx.fillStyle = style === "dark" ? "#111" : GOLD;
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    rr(-w / 2, -h / 2, w, h, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = style === "dark" ? GOLD : INK; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.font = "700 " + big + "px " + DISPLAY;
    ctx.fillText(lines[0], 0, -h / 2 + 12, w - 16);
    ctx.font = "700 " + sub + "px " + LABEL;
    for (var j = 1; j < lines.length; j++) ctx.fillText(lines[j], 0, -h / 2 + 14 + big + 5 + (j - 1) * (sub + 8), w - 16);
    ctx.restore();
  }

  // Popcorn out of the top of the machine, for three of a kind and the jackpot. Each piece pops with
  // its own soft, falling chirp, so a win sounds like a pan of popcorn going off.
  var pops = [];
  function popcorn(n, secs) {
    for (var i = 0; i < n; i++) {
      var d = Math.pow(Math.random(), 0.8) * secs, a = Math.random();
      pops.push({ x: VW / 2 + (Math.random() - 0.5) * (PANEL.w - 50), y: PANEL.y + 10, vx: (Math.random() - 0.5) * 300, vy: -(280 + Math.random() * 300),
                  r: 4.5 + Math.random() * 3.5, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 10, life: -d });
      if (i < 46) {                                     // the pop itself: a quick chirp down, a little thump under it
        var f = 520 + a * 760;
        tone(f, 0.045, "triangle", 0.055 + a * 0.03, f * 0.45, d);
        if (i % 3 === 0) tone(150 + a * 60, 0.05, "sine", 0.05, 90, d);
      }
    }
    buzz(30);
  }
  function popTick(dt) {
    for (var i = pops.length - 1; i >= 0; i--) {
      var q = pops[i];
      q.life += dt;
      if (q.life < 0) continue;
      q.vy += 760 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.spin * dt;
      if (q.y > VH + 30 || q.life > 4) pops.splice(i, 1);
    }
  }
  function popDraw() {
    for (var i = 0; i < pops.length; i++) {
      var q = pops[i];
      if (q.life < 0) continue;
      var grow = Math.min(1, q.life / 0.08);            // it bursts open as it leaves
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(grow, grow);
      ctx.fillStyle = "#FFFBEA"; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      for (var b = 0; b < 4; b++) { ctx.beginPath(); ctx.arc(Math.cos(b * 1.57) * q.r * 0.62, Math.sin(b * 1.57) * q.r * 0.62, q.r * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, 0, q.r * 0.66, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(-q.r * 0.12, q.r * 0.1, q.r * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function slotLine() {
    var sp = ui.sp, st = ui.state;
    if (st === "spinning") return ui.gold ? "GOLDEN SPIN: IT CANNOT MISS" : "MATCH 3 TO WIN";
    if (st === "respin") return "ONE REEL SPINS: MATCH IT FOR 3 OF A KIND";
    if (st === "flip") return "DOUBLE, OR NOTHING...";
    if (st === "kick") return "BONUS KICK: UP TO " + KICK.perfect * (ui.betNow || 1) + " CORN";
    if (st === "pair") return "PAIR: KEEP " + ui.pend + " CORN, OR TRY FOR 3 OF A KIND";
    if (st === "double") return (ui.msg === "DOUBLED" ? "NOW " : ui.msg.indexOf("SIDELINE") === 0 ? "SIDELINE FULL, SO " : "YOU WON ") + ui.pend + " CORN: KEEP, OR FLIP FOR " + ui.pend * 2;
    if (ui.daily && ui.msg) return ui.msg;
    if (sp && (spins > 0 || now - (ui.quietAt || -9) < 3.2)) return ui.msg;
    if (spins <= 0) {                                      // out of spins: what the round came to, and how the field earns more
      var tips = [];
      if (ui.tally) tips.push("THIS ROUND:  +" + ui.tally + " CORN");
      tips.push(SPIN_AT[0] + " POINTS IN A PUNT EARNS A SPIN", "REACH HALFTIME FOR A GOLDEN SPIN", "EVERY EAR YOU CATCH FEEDS THE JACKPOT");
      if (refillText()) tips.push(refillText());
      return tips[Math.floor(now / 3.2) % tips.length];
    }
    var show = SHOW.charAt(Math.floor(now / 1.7) % SHOW.length);                  // nothing spun yet: the prize list
    return show === "C" ? "3 OF THESE:  THE JACKPOT" : "3 OF THESE:  " + PRIZE[show];
  }

  // Prizes leave the machine and go where they belong: a power-up to the sideline, corn to the pile, a life to the
  // row of balls, a game's corn to the jackpot. The prize is the player's the moment it is won; the flight only
  // shows where it went, so nothing is lost if the next punt goes up before it lands.
  var FLY = 0.55, flights = [], bumps = {}, landed = 0, tagAt = null;
  var shownBank = -1, shownPot = -1, bankAt = 0, potAt = 0;     // the numbers on show count up to the real ones
  function reelX(i) { return VW / 2 + (i - 1) * 76; }
  function fly(sym, x0, y0, to, delay) { flights.push({ sym: sym, x0: x0, y0: y0, to: to, t: -(delay || 0) }); }
  function flyWin(sym, to) { for (var i = 0; i < 3; i++) fly(sym, reelX(i), PANEL.y + 99, to, i * 0.07); }
  function flyCorn(n, x0, y0, to, delay) {
    for (var i = 0; i < n; i++) fly("K", x0 + (Math.random() - 0.5) * 34, y0 + (Math.random() - 0.5) * 12, to, (delay || 0) + i * 0.05);
  }
  function pending(to) { for (var i = 0; i < flights.length; i++) if (flights[i].to === to) return true; return false; }
  function bump(key) { var a = now - (bumps[key] || -9); return a < 0.3 ? 1 + 0.32 * Math.sin(Math.PI * a / 0.3) : 1; }
  function spot(to) {
    if (to === "kit1") return pocketAt();
    if (to === "kit2" || to === "kit3") return rackAt(to === "kit2" ? 0 : 1);
    if (to === "lives") {
      var live = Math.max(1, lives > 0 ? lives : extraLives), lw = 9 + Math.max(LIVES, live) * 25;
      return { x: VW - 8 - lw + 17 + (live - 1) * 25, y: 25 };
    }
    if (to === "pot") return { x: VW / 2 + PANEL.w / 2 - 42, y: PANEL.y + 22 };
    if (to === "next") return tagAt || { x: 70, y: 59 };
    return { x: 22, y: 25 };                               // the corn pile
  }
  function flyTick(dt) {
    for (var i = flights.length - 1; i >= 0; i--) {
      var f = flights[i];
      f.t += dt;
      if (f.t >= FLY) { flights.splice(i, 1); bumps[f.to] = now; slotSfx.land(landed++); }
    }
    if (shownBank < 0) shownBank = bank;
    if (shownPot < 0) shownPot = pot;
    if (bank < shownBank) shownBank = bank;
    else if (now >= bankAt && shownBank < bank) shownBank = Math.min(bank, shownBank + Math.max(1, (bank - shownBank) * 7) * dt);
    var holding = ui.state === "spinning" && ui.sp && ui.sp.big;         // the pot is paid at the pull; the lights wait for the reels
    if (now >= potAt && !holding) shownPot = Math.abs(pot - shownPot) < 0.6 ? pot : shownPot + (pot - shownPot) * Math.min(1, dt * 7);
  }
  function flyDraw() {
    for (var i = 0; i < flights.length; i++) {
      var f = flights[i];
      if (f.t < 0) continue;
      var e = f.t / FLY, k = e * e * (3 - 2 * e), at = spot(f.to), sc = 0.75 + 0.55 * Math.sin(Math.PI * k);
      ctx.save();
      ctx.translate(lerp(f.x0, at.x, k), lerp(f.y0, at.y, k) - Math.sin(Math.PI * k) * 44); ctx.scale(sc, sc);
      if (f.sym === "K") { ctx.rotate(e * 5); kernel(1.2); }
      else {
        ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 15.5, 0, Math.PI * 2); ctx.stroke();
        ctx.scale(0.8, 0.8); drawSym(f.sym, 0, 0);
      }
      ctx.restore();
    }
  }

  // the kit: the power-up in the hand, big, and the ones waiting on the sideline beside it
  function pocketAt() { return { x: VW - 34, y: 80 }; }
  function rackAt(i) { return { x: VW - 75 - i * 31, y: 86 }; }
  function badge(code, r) {
    var big = r > 20;
    ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = big ? 3 : 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.lineWidth = big ? 3 : 2; ctx.beginPath(); ctx.arc(0, 0, r - (big ? 4 : 3), 0, Math.PI * 2); ctx.stroke();
    ctx.scale(r / 24, r / 24); drawSym(code, 0, 0);
  }
  function pocketDraw() {
    var at = pocketAt(), live = S.phase === "play", i;
    for (i = 0; i < rack.length; i++) {
      if (pending("kit" + (i + 2))) continue;
      var ra = rackAt(i), rb = bump("kit" + (i + 2));
      ctx.save(); ctx.translate(ra.x, ra.y); ctx.scale(rb, rb); badge(rack[i], 13); ctx.restore();
    }
    if (!pocket || pending("kit1")) return;
    var pulse = (live ? 1 + 0.06 * Math.sin(now * 7) : 1) * bump("kit1") * (live && now - (S.steppedAt || -9) < 0.25 ? 1.25 : 1);
    ctx.save(); ctx.translate(at.x, at.y); ctx.scale(pulse, pulse); badge(pocket, 24); ctx.restore();
    if (!live) return;                                     // how to use it, while the ball is up
    ctx.font = "700 10px " + LABEL; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var tag = window.matchMedia && window.matchMedia("(pointer: coarse)").matches ? "TAP" : "SPACE";
    ctx.fillStyle = INK; rr(at.x - 22, at.y + 27, 44, 15, 6); ctx.fill();
    ctx.fillStyle = GOLD; ctx.fillText(tag, at.x, at.y + 35);
  }
  function loaded() {
    pocketDraw();
    popDraw();
    if (doubleNext) {
      var text = "NEXT PUNT:  2X POINTS";
      ctx.font = "700 12px " + LABEL; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      var tw = Math.min(VW - 16, ctx.measureText(text).width + 18), plain = S.phase === "intro" && !slotVisible();
      var bx0 = plain ? VW / 2 - tw / 2 : 8, by0 = plain ? 10 : S.phase !== "intro" && VW < 560 ? 90 : 48, tb = bump("next");
      tagAt = { x: bx0 + tw / 2, y: by0 + 11 };
      ctx.save(); ctx.translate(tagAt.x, tagAt.y); ctx.scale(tb, tb);
      ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      rr(-tw / 2, -11, tw, 22, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillText(text, -tw / 2 + 9, 0.5, tw - 16);
      ctx.restore();
    } else tagAt = null;
    flyDraw();
  }

  function handOff(title) {
    var e = clamp((now - awayAt) / 0.3, 0, 1);
    if (e < 1) {                                           // the machine drops off the bottom of the field
      ctx.save(); ctx.globalAlpha = 1 - e * 0.6; ctx.translate(0, e * e * (VH - PANEL.y + 20));
      slotPanel();
      ctx.restore();
    }
    var touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    var lines = [title, "Tap when the arrow is on the gold"];
    if (pocket) lines.push((touch ? "In the air, tap the badge: " : "In the air, press space: ") + POWERS[pocket].toLowerCase());   // what the machine sent out with the punter
    else if (spins > 0) lines.push(spins + (spins === 1 ? " spin saved" : " spins saved") + " for after this punt");
    sign(lines, 170, "gold", now - awayAt);
  }

  // the machine, under the sign: the jackpot in lights, the reels, then what to do next
  function slotPanel() {
    var w = PANEL.w, h = PANEL.h, x = VW / 2 - w / 2, y = PANEL.y, sp = ui.sp, i, g;
    var won = ui.state === "double" || ui.state === "pair" || ui.state === "kick" || (ui.state === "idle" && sp && (sp.big || boostValue(sp) || ui.msg.indexOf("KEPT") === 0 || ui.msg === "DOUBLED"));
    var celebrating = won && now - (ui.winNow || -9) < 4;
    var golden = ui.state === "idle" ? golds > 0 && spins > 0 : !!ui.gold;          // a golden spin is next, or is on the reels now
    // the cabinet
    ctx.fillStyle = "rgba(0,0,0,.34)"; rr(x + 5, y + 7, w, h, 14); ctx.fill();
    g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "#3A342B"); g.addColorStop(0.45, "#171717"); g.addColorStop(1, "#070707");
    ctx.fillStyle = g; ctx.strokeStyle = celebrating && Math.sin(now * 14) > 0 ? "#fff" : GOLD; ctx.lineWidth = 4;
    rr(x, y, w, h, 14); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = 1.5; rr(x + 5.5, y + 5.5, w - 11, h - 11, 9); ctx.stroke();
    // the plate across the top: the wordmark, with the mark standing in for each O, and the jackpot in lights
    g = ctx.createLinearGradient(0, y + 7, 0, y + 37); g.addColorStop(0, "#FFE873"); g.addColorStop(1, "#E2AC00");
    ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    rr(x + 8, y + 7, w - 16, 30, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.font = "700 20px " + DISPLAY; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    var parts = ["R", null, "LL", " ", "C", null, "RN"], wx = x + 17, m = 18, pw;
    for (var pi = 0; pi < parts.length; pi++) {
      pw = parts[pi] === null ? m + 1 : parts[pi] === " " ? 7 : ctx.measureText(parts[pi]).width;
      if (parts[pi] === null) mark(wx + pw / 2, y + 22, m);
      else if (parts[pi] !== " ") ctx.fillText(parts[pi], wx, y + 23.5);
      wx += pw;
    }
    var lx0 = x + w - 130, lw0 = 118, fed = now - (bumps.pot || -9) < 0.35;
    ctx.fillStyle = "#1B0606"; ctx.strokeStyle = INK; ctx.lineWidth = 2; rr(lx0, y + 10, lw0, 24, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#FF9C7A"; ctx.font = "700 9px " + LABEL; ctx.fillText("JACKPOT", lx0 + 7, y + 22.5);
    ctx.fillStyle = fed ? "#fff" : "#FFD84A"; ctx.font = "700 18px " + DISPLAY; ctx.textAlign = "right";
    ctx.fillText(Math.round(shownPot < 0 ? pot : shownPot).toLocaleString("en-US"), lx0 + lw0 - 7, y + 23, lw0 - 56);
    ctx.textAlign = "center";
    ctx.fillStyle = golden ? "#FFE873" : GOLD; ctx.font = "700 12px " + LABEL;
    ctx.fillText(slotLine(), VW / 2, y + 47, w - 20);
    var winTop = y + 56, winH = 86, mid = winTop + winH / 2, strip = REEL, row = 38;   // the rows above and below peek in
    g = ctx.createLinearGradient(0, winTop - 5, 0, winTop + winH + 5); g.addColorStop(0, "#F4F4F4"); g.addColorStop(0.5, "#8F8F8F"); g.addColorStop(1, "#DCDCDC");
    ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 2;                         // the chrome the reels sit in
    rr(VW / 2 - 115, winTop - 5, 230, winH + 10, 10); ctx.fill(); ctx.stroke();
    var sy = sp ? sp.syms : "", three = !!sp && sy.charAt(0) === sy.charAt(1) && sy.charAt(1) === sy.charAt(2);
    var showWin = !!sp && (ui.state === "double" || ui.state === "pair" || ui.state === "kick" || now - (ui.winNow || -9) < 2.2) && ui.msg.indexOf("GONE") < 0 && ui.msg.indexOf("NO MATCH") < 0;
    for (i = 0; i < 3; i++) {
      var cx = reelX(i), spinning = (ui.state === "spinning" && i >= ui.stopped) || (ui.state === "respin" && sp && i === sp.odd) || ui.state === "flip";
      var waiting = spinning && i === 2 && ui.tease && ui.stopped === 2;          // two the same: all eyes on the last reel
      var inWin = !spinning && showWin && (three || (sp.pair && i !== sp.odd));
      ctx.fillStyle = golden ? "#FFF2B8" : "#FFFDF5"; ctx.strokeStyle = waiting ? GOLD : INK; ctx.lineWidth = waiting ? 4 : 2.5;
      rr(cx - 33, winTop, 66, winH, 7); ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - 31, winTop + 2, 62, winH - 4); ctx.clip();
      if (inWin) {                                             // rays turn behind a winning symbol
        ctx.save(); ctx.translate(cx, mid); ctx.rotate(now * 1.5 + i);
        ctx.fillStyle = "rgba(255,196,0,.45)";
        for (var ry = 0; ry < 8; ry++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, -64); ctx.lineTo(8, -64); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      if (spinning) {
        var roll = (ui.pos ? ui.pos[i] : 0) + i * 1.7, k = Math.floor(roll), off = (roll - k) * row;
        var left = ui.state === "spinning" ? ui.stopAt[i] - ui.t : ui.until - ui.t, fast = clamp(left / 0.35, 0, 1);   // it blurs while it runs flat out
        for (var rw = -2; rw <= 2; rw++) {
          ctx.save(); ctx.translate(cx, mid + rw * row + off); ctx.scale(1, 1 + 0.35 * fast); ctx.globalAlpha = 1 - 0.3 * fast;
          drawSym(strip.charAt(((k - rw) % strip.length + strip.length) % strip.length), 0, 0);
          ctx.restore();
        }
      } else if (sp) {
        var at = strip.indexOf(sp.syms.charAt(i)), since = now - ((ui.stopNow && ui.stopNow[i]) || -9);
        var bounce = since < 0.4 ? 9 * Math.exp(-since * 12) * Math.cos(since * 28) : 0;       // it lands with a little kick
        drawSym(strip.charAt((at + strip.length - 1) % strip.length), cx, mid - row + bounce);
        if (inWin) {
          var pu = 1 + 0.16 * Math.abs(Math.sin((now - (ui.winNow || 0)) * 6));
          ctx.save(); ctx.translate(cx, mid + bounce); ctx.scale(pu, pu); drawSym(sp.syms.charAt(i), 0, 0); ctx.restore();
        } else drawSym(sp.syms.charAt(i), cx, mid + bounce);
        drawSym(strip.charAt((at + 1) % strip.length), cx, mid + row + bounce);
      } else drawSym(SHOW.charAt(Math.floor(now / 1.7) % SHOW.length), cx, mid);        // the prize list, turning over
      g = ctx.createLinearGradient(0, winTop, 0, winTop + winH);                        // the reel is a drum: it falls into shadow above and below the line
      g.addColorStop(0, "rgba(0,0,0,.66)"); g.addColorStop(0.32, "rgba(0,0,0,0)"); g.addColorStop(0.68, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.66)");
      ctx.fillStyle = g; ctx.fillRect(cx - 31, winTop + 2, 62, winH - 4);
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(cx - 31, winTop + 2, 62, 2.5);   // a line of light on the glass
      ctx.restore();
    }
    ctx.strokeStyle = won ? GOLD : RED; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.lineCap = "butt";       // the payline
    ctx.beginPath(); ctx.moveTo(x + 18, mid); ctx.lineTo(VW / 2 - 76 - 33, mid); ctx.moveTo(VW / 2 + 76 + 33, mid); ctx.lineTo(x + w - 18, mid); ctx.stroke();
    ctx.fillStyle = won ? GOLD : RED;
    ctx.beginPath(); ctx.moveTo(x + 14, mid - 6); ctx.lineTo(x + 23, mid); ctx.lineTo(x + 14, mid + 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w - 14, mid - 6); ctx.lineTo(x + w - 23, mid); ctx.lineTo(x + w - 14, mid + 6); ctx.closePath(); ctx.fill();
    var rise = now - (ui.winNow || -9);
    if (ui.pend > 0 && rise < 1.3 && (ui.state === "double" || ui.state === "pair")) {      // the prize lifts off the payline
      ctx.globalAlpha = clamp(1.6 - rise * 1.3, 0, 1);
      ctx.font = "700 24px " + DISPLAY; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineJoin = "round";
      ctx.strokeText("+" + ui.pend, VW / 2, mid - 18 - rise * 34); ctx.fillStyle = GOLD; ctx.fillText("+" + ui.pend, VW / 2, mid - 18 - rise * 34);
      ctx.globalAlpha = 1;
    }
    for (var bl = 0; bl < 8; bl++) {                                                  // bulbs down each side
      var lx = bl < 4 ? x + 8 : x + w - 8, ly = winTop + 12 + (bl % 4) * 21;
      if (bl % 4 === 1 || bl % 4 === 2) ly += bl % 4 === 1 ? -4 : 4;                  // leave room for the payline arrows
      var lit = celebrating ? (Math.floor(now * 10) + bl) % 2 === 0 :
                ui.state === "spinning" ? (Math.floor(now * 14) + bl) % 3 === 0 :
                golden ? (Math.floor(now * 7) + bl) % 2 === 0 :
                spins > 0 ? (Math.floor(now * 3) + bl) % 4 === 0 : false;
      if (lit) { ctx.fillStyle = "rgba(255,243,160,.28)"; ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = lit ? "#FFF3A0" : "#5A4B00"; ctx.strokeStyle = INK; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(lx, ly, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // the lever: it comes down on a pull and springs back
    var pulled = clamp((now - (ui.pullNow || -9)) / 0.45, 0, 1), down = ui.grab ? ui.lever : Math.sin(Math.PI * pulled);
    var hx = x + w + 3, hy = mid + 22, kx = hx + 18, ky = mid - 34 + down * 50;
    ctx.fillStyle = "#333"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    rr(x + w - 2, hy - 9, 12, 18, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(hx + 4, hy); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.strokeStyle = "#BDBDBD"; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.fillStyle = RED; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(kx, ky, 8.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(kx - 2.5, ky - 3, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var by = y + 151, bh = 30;
    function pill(px0, pw0, top, bot, edge) {                  // a button, with a little shine along the top of it
      var pg = ctx.createLinearGradient(0, by, 0, by + bh); pg.addColorStop(0, top); pg.addColorStop(1, bot);
      ctx.fillStyle = pg; ctx.strokeStyle = edge || INK; ctx.lineWidth = 2.5; rr(px0, by, pw0, bh, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.26)"; rr(px0 + 3, by + 3, pw0 - 6, 9, 4.5); ctx.fill();
    }
    if (ui.state === "double" || ui.state === "pair") {                          // two buttons: keep it, or take the chance
      pill(x + 10, w / 2 - 15, "#FFFFFF", "#D9D5C6");
      pill(VW / 2 + 5, w / 2 - 15, "#FFE873", "#E2AC00");
      ctx.fillStyle = INK; ctx.font = "700 15px " + LABEL;
      ctx.fillText("KEEP  +" + ui.pend + " CORN", x + 10 + (w / 2 - 15) / 2, by + bh / 2 + 1, w / 2 - 24);
      ctx.fillText(ui.state === "pair" ? "TRY FOR 3" : "DOUBLE OR NOTHING", VW / 2 + 5 + (w / 2 - 15) / 2, by + bh / 2 + 1, w / 2 - 24);
    } else if (ui.state === "kick") {                                          // the bonus kick: a gauge to time
      var kg = kickGauge(), kx0 = x + 14, kw = w - 28;
      ctx.fillStyle = "#3A3A3A"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; rr(kx0, by + 4, kw, bh - 12, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#6B6B6B"; ctx.fillRect(kx0 + kw * 0.5, by + 6, kw * 0.5 - 3, bh - 16);
      ctx.fillStyle = GOLD; ctx.fillRect(kx0 + kw * 0.72, by + 6, kw * 0.16, bh - 16);
      ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = "700 11px " + LABEL; ctx.textAlign = "left";
      ctx.fillText("BONUS KICK: TAP ON THE GOLD", kx0 + 8, by + bh / 2 - 1.5, kw * 0.6);
      ctx.textAlign = "center";
      var kmx = kx0 + kw * kg, kon = Math.abs(kg - 0.8) <= 0.08;
      ctx.fillStyle = kon ? GOLD : "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(kmx - 8, by + bh + 3); ctx.lineTo(kmx, by + bh - 11); ctx.lineTo(kmx + 8, by + bh + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (ui.state === "spinning" || ui.state === "respin" || ui.state === "flip") {
      ctx.fillStyle = "#B9B5A5"; ctx.font = "700 15px " + LABEL;
      ctx.fillText(ui.auto ? "AUTO  \u00B7  TAP TO STOP IT" : "TAP TO STOP", VW / 2, by + bh / 2);
    } else if (spins > 0) {
      var pulse = 0.5 + 0.5 * Math.sin(now * 5);
      var sw2 = spins > 1 ? w - 76 - 56 : w - 76;                                  // room for the AUTO chip when there are spins to run through
      pill(x + 66, sw2, golden ? "#FFF8D0" : mix("#FFE873", "#FFF3A8", pulse), golden ? "#F2B600" : mix("#D9A600", "#F0C21C", pulse));
      if (golden) {                                                               // a golden spin: light runs across the button
        ctx.save(); rr(x + 66, by, sw2, bh, 8); ctx.clip();
        var gs = x + 66 - 30 + ((now * 0.8) % 1) * (sw2 + 60);
        ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.moveTo(gs, by); ctx.lineTo(gs + 14, by); ctx.lineTo(gs + 2, by + bh); ctx.lineTo(gs - 12, by + bh); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = INK; ctx.font = "700 15px " + LABEL;
      ctx.fillText(ui.auto ? "AUTO  (" + spins + ")" : (golds > 0 ? "GOLDEN SPIN" : "SPIN") + "  (" + spins + " LEFT)", x + 66 + sw2 / 2, by + bh / 2 + 1, sw2 - 12);
      if (spins > 1) {
        if (ui.auto) pill(x + w - 60, 50, "#FFFFFF", "#D9D5C6"); else pill(x + w - 60, 50, "#3A3A3A", "#1E1E1E", GOLD);
        ctx.fillStyle = ui.auto ? INK : GOLD; ctx.font = "700 14px " + DISPLAY;
        ctx.fillText(ui.auto ? "STOP" : "AUTO", x + w - 35, by + bh / 2 + 1);
      }
      var bet = golds > 0 ? 1 : Math.max(1, Math.min(ui.bet, spins));              // the stake chip: tap it to play two or three spins at once
      if (bet > 1) pill(x + 10, 50, "#FFFFFF", "#D9D5C6"); else pill(x + 10, 50, "#3A3A3A", "#1E1E1E", GOLD);
      ctx.fillStyle = bet > 1 ? INK : GOLD; ctx.font = "700 8px " + LABEL;
      ctx.fillText("BET", x + 35, by + 8);
      ctx.font = "700 15px " + DISPLAY;
      ctx.fillText(bet + (bet === 1 ? " SPIN" : " SPINS"), x + 35, by + 20.5, 44);
    } else {                                                                     // out of spins: one way on, and it is back to the field
      var gp = 0.5 + 0.5 * Math.sin(now * 4), kitN = (pocket ? 1 : 0) + rack.length;
      pill(x + 10, w - 20, mix("#62C972", "#7BDD8A", gp), mix("#2F8F41", "#3BA650", gp));
      var go = extraLives ? "KEEP YOUR GAME GOING" : kitN > 1 ? "PUNT WITH YOUR " + kitN + " POWER-UPS" : kitN ? "PUNT WITH YOUR " + POWERS[pocket] : S.phase === "intro" ? "PUNT" : "PUNT AGAIN";
      ctx.font = "700 16px " + LABEL; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 3; ctx.strokeText(go, VW / 2, by + bh / 2 + 1, w - 40);
      ctx.fillStyle = "#fff"; ctx.fillText(go, VW / 2, by + bh / 2 + 1, w - 40);
    }
    // the harvest track along the foot: five rewards, and the next one named
    var hn = hvNext(), top = hvAt(HARVEST.length - 1), hx2 = x + 66, hw = w - 76 - 78, fresh = now - (ui.rewardNow || -9) < 2.6;
    if (fresh) {                                           // a reward just landed: the row says so, and nothing else
      ctx.font = "700 12px " + LABEL; ctx.textBaseline = "middle"; ctx.textAlign = "center";
      ctx.fillStyle = Math.sin(now * 14) > 0 ? "#fff" : GOLD; ctx.fillText(ui.reward, VW / 2, y + 193, w - 24);
    } else {
      ctx.font = "700 10px " + LABEL; ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.fillStyle = "#B9B5A5"; ctx.fillText("REWARDS", x + 12, y + 193, 50);
      ctx.fillStyle = "#3A3A3A"; rr(hx2, y + 189, hw, 8, 4); ctx.fill();
      ctx.fillStyle = GOLD; rr(hx2, y + 189, Math.max(4, hw * clamp(hvPts / top, 0, 1)), 8, 4); ctx.fill();
      for (var hm2 = 0; hm2 < HARVEST.length; hm2++) {
        ctx.fillStyle = hvPts >= hvAt(hm2) ? "#fff" : "#8A8676";
        ctx.beginPath(); ctx.arc(hx2 + hw * hvAt(hm2) / top, y + 193, 3.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.textAlign = "right"; ctx.fillStyle = GOLD;
      ctx.fillText("NEXT: " + HARVEST[hn].text, x + w - 12, y + 193, 74);
    }
    ctx.textAlign = "center";
  }

  // The lives and the corn, in the top corners. In the air the corn is what this punt has caught; while the
  // machine is open it is the whole pile, counting up as prizes land in it.
  function chips(pile) {
    var live = lives > 0 ? lives : extraLives, ln = Math.max(LIVES, live), lw = 9 + ln * 25, lit = live - (pending("lives") ? 1 : 0), lb = bump("lives");
    ctx.strokeStyle = INK; ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.lineWidth = 2;
    rr(VW - 8 - lw, 8, lw, 34, 7); ctx.fill(); ctx.stroke();
    for (var lf = 0; lf < ln; lf++) {
      var on = lf < lit, sc = on && lf === lit - 1 ? lb : 1;
      ctx.save(); ctx.translate(VW - 8 - lw + 17 + lf * 25, 25); ctx.scale(sc, sc);
      ctx.fillStyle = on ? "#8A4B1F" : "#D4D0C2"; ctx.strokeStyle = on ? INK : "#A9A596"; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 6.5, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (on) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-3.5, 2); ctx.lineTo(3.5, -2); ctx.stroke(); }
      ctx.restore();
    }
    var text = (pile ? Math.round(shownBank < 0 ? bank : shownBank) : S.got).toLocaleString("en-US"), cb = bump("corn");
    ctx.font = "700 20px " + DISPLAY; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    var cw2 = Math.max(74, ctx.measureText(text).width + 38);
    ctx.strokeStyle = INK; ctx.fillStyle = cb > 1 ? "#FFF3A0" : "rgba(255,255,255,.92)"; ctx.lineWidth = 2;
    rr(8, 8, cw2, 34, 7); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(21.5, 25); ctx.scale(cb, cb); kernel(0.95); ctx.restore();
    ctx.fillStyle = INK; ctx.fillText(text, 34, 26);
  }

  // one clock, one kernel count: that is all the screen says while the ball is up
  function hud() {
    var cw = Math.min(200, VW * 0.4), cx = VW / 2 - cw / 2, hot = S.passedBest || S.newBest;
    ctx.fillStyle = hot ? "#111" : "rgba(255,255,255,.92)"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    rr(cx, 8, cw, 76, 8); ctx.fill(); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = hot ? GOLD : INK;
    ctx.font = "700 44px " + DISPLAY;
    ctx.fillText(Math.floor(S.pts).toLocaleString("en-US"), VW / 2, 12, cw - 14);
    ctx.font = "700 13px " + LABEL;
    ctx.fillText((S.superT > 0 ? "SUPER PUNT  \u00B7  " : S.blockT > 0 ? "BLOCKERS " + Math.ceil(S.blockT) + "  \u00B7  " : S.windT > 0 ? "TAILWIND " + Math.ceil(S.windT) + "  \u00B7  " : S.mult > 1 ? S.mult + "X  \u00B7  " : "") +
                 quarterName(S.q) + "  \u00B7  " + S.t.toFixed(1) + " S" + (hot ? "  \u00B7  NEW BEST" : ""), VW / 2, 62, cw - 12);

    var sw = cw - 16, seg = (sw - 46) / 3;                                      // points turn into spins: each segment that fills is one more for the machine
    ctx.fillStyle = "#111"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    if (S.phase !== "over") {
      var justNow = now - (S.spinAt || -9) < 0.8;
      rr(cx + 8, 88, sw, 15, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = justNow && Math.sin(now * 30) > 0 ? "#fff" : GOLD; ctx.font = "700 9px " + LABEL; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText("SPINS", cx + 15, 96);
      for (var sg = 0; sg < 3; sg++) {
        var sFrom = sg ? SPIN_AT[sg - 1] : 0, fill = clamp((S.pts - (S.base || 0) - sFrom) / (SPIN_AT[sg] - sFrom), 0, 1), gx = cx + 8 + 42 + sg * seg;
        var blink = justNow && sg === (S.spinN || 0) - 1 && Math.sin(now * 30) > 0;      // the one that just filled
        ctx.fillStyle = "#3A3A3A"; rr(gx, 92, seg - 4, 7, 3); ctx.fill();
        if (fill > 0.02) { ctx.fillStyle = fill >= 1 ? (blink ? GOLD : "#fff") : GOLD; rr(gx, 92, (seg - 4) * fill, 7, 3); ctx.fill(); }
      }
    }
    chips(S.phase === "over" && lives <= 0);
  }

  function draw() {
    ctx.save();
    if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    sky();
    if (S.star) {
      var sa = clamp(Math.min(S.star.life / 0.15, (0.9 - S.star.life) / 0.4), 0, 1), sx0 = S.star.x - S.star.life * 220, sy0 = S.star.y + S.star.life * 90;
      var tail = ctx.createLinearGradient(sx0, sy0, sx0 + 70, sy0 - 28);
      tail.addColorStop(0, "rgba(255,255,255," + sa.toFixed(2) + ")"); tail.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = tail; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx0 + 70, sy0 - 28); ctx.stroke();
    }
    field();
    if (S.cow) {                                          // once in a long while, a cow by the far sideline
      var cwx = S.cow.x - S.dist, cwy = GY - 3;
      ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cwx - 12, cwy - 10); ctx.lineTo(cwx - 12, cwy); ctx.moveTo(cwx - 5, cwy - 10); ctx.lineTo(cwx - 5, cwy); ctx.moveTo(cwx + 7, cwy - 10); ctx.lineTo(cwx + 7, cwy); ctx.moveTo(cwx + 13, cwy - 10); ctx.lineTo(cwx + 13, cwy); ctx.stroke();
      ctx.fillStyle = "#fff";
      rr(cwx - 16, cwy - 24, 33, 16, 6); ctx.fill(); ctx.stroke();
      rr(cwx - 27, cwy - 30, 14, 12, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#222";
      ctx.beginPath(); ctx.ellipse(cwx - 3, cwy - 18, 5, 4, 0.4, 0, Math.PI * 2); ctx.ellipse(cwx + 10, cwy - 15, 4, 3, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cwx - 23, cwy - 26, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#F4A6B8"; rr(cwx - 28, cwy - 23, 6, 5, 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cwx + 17, cwy - 22); ctx.quadraticCurveTo(cwx + 23, cwy - 18, cwx + 20, cwy - 11); ctx.stroke();
    }
    var i, x;

    if (S.phase === "play" && S.bestWas > 2 && !S.passedLong) {      // where the longest hang came down
      var bxLine = distAt(S.bestWas) + BX - S.dist;
      if (bxLine < VW + 60) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = 4; ctx.setLineDash([10, 9]);
        ctx.beginPath(); ctx.moveTo(bxLine, 96); ctx.lineTo(bxLine, GY + TURF_H); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        rr(bxLine - 42, 96, 84, 24, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.font = "700 14px " + LABEL; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("LONGEST", bxLine, 109);
      }
    }
    for (i = 0; i < S.obs.length; i++) {
      var o = S.obs[i];
      x = o.x - S.dist;
      if (o.down) {                                               // knocked flat: it tips over away from the blockers
        var fe = clamp((now - o.downAt) / 0.3, 0, 1);
        ctx.save();
        ctx.translate(x + o.w / 2, GY + TURF_H * 0.5); ctx.rotate(fe * fe * 1.5); ctx.translate(-(x + o.w / 2), -(GY + TURF_H * 0.5));
      }
      if (o.dream && S.dreaming > 0) ctx.globalAlpha = 0.38;       // in a dream the nemesis is pale and harmless
      // whoever stopped the punt has a little jump about it
      var glee = o === S.killer && S.phase !== "play" && o.kind !== "gate" && o.kind !== "mascot" ? Math.abs(Math.sin(now * 13)) * 6 * clamp(1.5 - (now - (S.diedAt || 0)), 0, 1) : 0;
      if (glee) { ctx.save(); ctx.translate(0, -glee); }
      if (o.kind === "gate") { if (o.bot < BASE - 20) gate(o, x); }
      else if (o.kind === "wall") { if (o.bot < FEET - 10) wall(x, o.w, o.bot, o.x); }
      else if (o.kind === "bench") { if (o.bot < BASE - 20) bench(x, o); }
      else if (o.kind === "mascot") mascot(x + o.w / 2, o);
      else returner(x + o.w / 2, o);
      if (glee) ctx.restore();
      if (debugBoxes) { ctx.strokeStyle = "#FF00FF"; ctx.lineWidth = 1.5; boxes(o).forEach(function (b) { ctx.strokeRect(b[0] - S.dist, b[1], b[2], b[3]); }); }
      ctx.globalAlpha = 1;
      if (o.down) ctx.restore();
    }
    for (i = 0; i < S.kernels.length; i++) {
      var kn = S.kernels[i];
      if (kn.got) continue;
      var kx = kn.x - S.dist, ky = kn.y + Math.sin(now * 3 + kn.ph) * 3;
      ctx.save(); ctx.translate(kx, ky); ctx.rotate(Math.sin(now * 2 + kn.ph) * 0.3);
      if (kn.big) ctx.scale(1.7, 1.7);
      if (kn.spin) {                                      // it glows, and it is bigger
        var gl = 0.5 + 0.5 * Math.sin(now * 8 + kn.ph);
        ctx.fillStyle = "rgba(255,236,120," + (0.35 + gl * 0.35).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(0, 0, 21 + gl * 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.stroke();
        ctx.scale(1.5, 1.5);
      }
      kernel(1.05);
      ctx.restore();
    }
    for (i = 0; i < S.helmets.length; i++) {
      var hm = S.helmets[i], qx = hm.x - S.dist, qy = hm.y + Math.sin(now * 3 + hm.ph) * 4;
      ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(qx, qy, 19, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      drawSym(hm.kind || "H", qx, qy - 1);
    }
    for (i = 0; i < S.crows.length; i++) {
      var cr = S.crows[i];
      x = cr.x - S.dist;
      if (x > VW + 10) {                                // warn before it shows up
        ctx.fillStyle = RED; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(VW - 8, cr.y); ctx.lineTo(VW - 26, cr.y - 12); ctx.lineTo(VW - 26, cr.y + 12); ctx.closePath();
        if (S.phase === "play" && Math.sin(now * 14) > 0) { ctx.fill(); ctx.stroke(); }
      } else {
        ctx.strokeStyle = "rgba(255,255,255,.38)"; ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x + 8, cr.y); ctx.lineTo(x + 8 - (cr.vx - S.speed) * 0.045, cr.y - cr.vy * 0.045); ctx.stroke();
        if (S.dreaming > 0) ctx.globalAlpha = 0.38;
        if (cr.bomb) {                                  // a fat ear with a lit fuse; it flashes as the fuse runs down
          var hot = cr.fuse < 0.4 && Math.sin(now * 40) > 0;
          ctx.save(); ctx.translate(x, cr.y); ctx.rotate(-now * 6);
          ctx.fillStyle = hot ? "rgba(255,80,40,.45)" : "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
          kernel(1.5);
          ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(6, -12); ctx.quadraticCurveTo(12, -19, 9, -24); ctx.stroke();
          ctx.fillStyle = Math.sin(now * 30) > 0 ? "#FFF3A0" : "#FF7A1A";
          ctx.beginPath(); ctx.arc(9, -25, 3.6, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else if (cr.punt) { ctx.save(); ctx.translate(x, cr.y); ctx.rotate(-now * 9); drawSym("F", 0, 0); ctx.restore(); }
        else flag(x, cr.y);
        ctx.globalAlpha = 1;
      }
    }

    for (i = 0; i < S.refs.length; i++) referee(S.refs[i].x - S.dist, S.refs[i]);

    // the punter, left behind once the ball is away
    var feet = GY + TURF_H * 0.5, px = BX - 16 - S.dist;
    if (px > -40) player(px, feet, kit(HOME, { kick: S.phase !== "intro" && S.t < 0.5 }));
    if (S.phase === "play" && S.blockT > 0 && (S.blockT > 2 || Math.sin(now * 20) > 0)) {      // they flicker as their time runs out
      for (var bk = 0; bk < 3; bk++) player(BX + 62 + bk * 26, feet, kit(HOME, { run: true, seed: bk * 2.1 }));
    }
    if (S.phase === "play" && now - (S.swatAt || -9) < 0.3) player(S.swatX - 6, S.swatY + 42, kit(HOME, { up: true, air: true }));   // one goes up for the swat

    // the ball, its trail and its shadow
    if (S.phase === "play" && S.trail.length > 1) {
      ctx.lineCap = "round";
      for (i = 1; i < S.trail.length; i++) {
        var tt = i / S.trail.length;
        ctx.strokeStyle = (S.superT > 0 ? "rgba(255," + Math.round(90 + 130 * tt) + ",30," : S.floating ? "rgba(255,205,0," : "rgba(255,255,255,") + (tt * (S.superT > 0 ? 0.95 : S.floating ? 0.8 : 0.5)).toFixed(2) + ")";
        ctx.lineWidth = S.superT > 0 ? 3 + tt * 16 : 1 + tt * 6;
        ctx.beginPath();
        ctx.moveTo(S.trail[i - 1].x - S.dist + BX, S.trail[i - 1].y); ctx.lineTo(S.trail[i].x - S.dist + BX, S.trail[i].y);
        ctx.stroke();
      }
    }
    // the ball's shadow on the grass: smaller and fainter the higher it flies, and flashing red when the ground is close
    var up = clamp((FLOOR - S.y) / (FLOOR - 30), 0, 1), low = S.phase === "play" && S.y > FLOOR - 72 && S.vy > 40 && S.safe <= 0;
    ctx.fillStyle = low ? "rgba(215,38,30," + (0.55 + 0.3 * Math.sin(now * 22)).toFixed(2) + ")" : "rgba(0,0,0," + (0.46 - 0.2 * up).toFixed(2) + ")";
    ctx.beginPath(); ctx.ellipse(BX + up * 6, feet + 3, 14 - 7 * up, 4.4 - 2 * up, 0, 0, Math.PI * 2); ctx.fill();
    if (S.phase === "intro" || (S.phase === "over" && S.rw >= 1)) {
      var gx = BX + 30, gTop = feet - 128, gH = 112, gW = 22, gv = gaugeNow();
      ctx.fillStyle = "#111"; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      rr(gx, gTop, gW, gH, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#4A4A4A"; rr(gx + 4, gTop + 4, gW - 8, gH - 8, 5); ctx.fill();
      var half = sweetHalf(), zoneTop = gTop + 4 + (gH - 8) * (1 - Math.min(1, SWEET + half)), zoneH = (gH - 8) * (Math.min(1, SWEET + half) - (SWEET - half));
      ctx.fillStyle = GOLD; ctx.fillRect(gx + 4, zoneTop, gW - 8, zoneH);   // the sweet spot
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(gx + 4, zoneTop, gW - 8, zoneH);
      var my = gTop + 4 + (gH - 8) * (1 - gv), on = Math.abs(gv - SWEET) <= half;
      ctx.fillStyle = on ? GOLD : "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(gx + gW + 14, my - 9); ctx.lineTo(gx + gW - 2, my); ctx.lineTo(gx + gW + 14, my + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (S.phase === "intro") drawBall(BX, feet - 9, -0.5);
    else if (S.safe <= 0 || Math.sin(now * 40) > 0) {
      var fall = S.phase === "play" ? clamp(S.vy / 640, 0, 1) * 0.14 : 0;   // flat on the tap, long on the way down
      ctx.save();
      ctx.translate(BX, S.y); ctx.scale(1 + S.sq * 0.28 - fall * 0.5, 1 - S.sq * 0.24 + fall);
      drawBall(0, 0, S.phase === "over" ? S.spin : S.spin + clamp(S.vy / 700, -0.6, 0.9));
      ctx.restore();
    }
    if (S.phase === "dead" && now - (S.bamAt || -9) < 0.3) {       // a burst of lines where it was stopped
      var bt = (now - S.bamAt) / 0.3;
      ctx.save(); ctx.translate(BX + 6, S.bamY); ctx.rotate(0.35);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 4 * (1 - bt) + 0.5; ctx.lineCap = "round";
      for (var ray = 0; ray < 8; ray++) {
        var ra = ray * Math.PI / 4, r0 = 10 + bt * 12, r1 = 18 + bt * 26;
        ctx.beginPath(); ctx.moveTo(Math.cos(ra) * r0, Math.sin(ra) * r0); ctx.lineTo(Math.cos(ra) * r1, Math.sin(ra) * r1); ctx.stroke();
      }
      ctx.restore();
    }
    if (S.magnet && S.phase === "play") {                // the magnet: a turning dashed ring
      ctx.save(); ctx.translate(BX, S.y); ctx.rotate(now * 2.4);
      ctx.strokeStyle = "rgba(214,40,40,.75)"; ctx.lineWidth = 2.5; ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
    if (S.shield && S.phase === "play") {                // the helmet: a gold shell around the ball
      ctx.strokeStyle = INK; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(BX, S.y, 17, Math.PI * 0.85, Math.PI * 2.15); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(BX, S.y, 17, Math.PI * 0.85, Math.PI * 2.15); ctx.stroke();
    }

    // popcorn and dust
    for (i = 0; i < particles.length; i++) {
      var pt = particles[i], fade = 1 - pt.life / pt.max;
      if (pt.life < 0) continue;
      // while the ball is up, anything near it goes faint, so the ball is never lost in the popcorn
      var clear = S.phase === "play" ? clamp((Math.sqrt((pt.x - BX) * (pt.x - BX) + (pt.y - S.y) * (pt.y - S.y)) - 40) / 90, 0.12, 1) : 1;
      if (pt.kind === "fw") {
        ctx.fillStyle = pt.col; ctx.globalAlpha = clamp(fade * 1.6, 0, 1) * clear;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, Math.max(0.1, pt.size * (0.6 + fade * 0.6)), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (pt.kind === "dust" || pt.kind === "puff") {
        ctx.fillStyle = "rgba(255,252,235," + (fade * 0.8 * clear).toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1.4 - fade * 0.4), 0, Math.PI * 2); ctx.fill();
      } else if (pt.kind === "grass") {
        ctx.save(); ctx.globalAlpha = clamp(fade * 2.4, 0, 1) * clear; ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot + pt.life * 9);
        ctx.fillStyle = "#2E8B3F"; ctx.fillRect(-pt.size * 0.5, -0.9, pt.size, 1.8);
        ctx.restore();
      } else if (pt.life < pt.pop) {
        ctx.save(); ctx.globalAlpha = clear; ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot + pt.life * 12);
        kernel(pt.size / 6.5);
        ctx.restore();
      } else {
        ctx.globalAlpha = clamp(fade * 3, 0, 1) * clear;
        ctx.fillStyle = "#FFFBEA"; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 1;
        for (var pb = 0; pb < 3; pb++) {
          ctx.beginPath();
          ctx.arc(pt.x + Math.cos(pt.rot + pb * 2.1) * pt.size * 0.9, pt.y + Math.sin(pt.rot + pb * 2.1) * pt.size * 0.9, pt.size * 1.1, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    // the few things worth saying mid-flight, one under another in the middle
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "700 " + Math.min(34, VW * 0.07) + "px " + DISPLAY;
    for (i = 0; i < floaters.length; i++) {
      var fo = floaters[i];
      ctx.globalAlpha = clamp(2.8 - fo.life * 2, 0, 1);
      ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineJoin = "round";
      ctx.strokeText(fo.text, VW / 2, 136 + 42 * i, VW - 16);
      ctx.fillStyle = fo.color;
      ctx.fillText(fo.text, VW / 2, 136 + 42 * i, VW - 16);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // evening light over the whole scene, and darker corners
    var eve = clamp(tod, 0, 1) * (1 - clamp(tod - 1, 0, 1)), night = clamp(tod - 1, 0, 1);
    if (eve > 0.01) { ctx.fillStyle = "rgba(255,120,60," + (eve * 0.08).toFixed(3) + ")"; ctx.fillRect(0, 0, VW, VH); }
    if (S.dreaming > 0 && S.phase === "play") {          // a soft glow while it lasts
      var dg = clamp(Math.min(10 - S.dreaming, S.dreaming) / 1.2, 0, 1) * 0.16;
      var glow = ctx.createRadialGradient(VW / 2, VH * 0.4, 20, VW / 2, VH * 0.4, Math.max(VW, VH) * 0.7);
      glow.addColorStop(0, "rgba(255,244,214," + dg.toFixed(3) + ")"); glow.addColorStop(1, "rgba(255,190,220," + (dg * 0.8).toFixed(3) + ")");
      ctx.fillStyle = glow; ctx.fillRect(0, 0, VW, VH);
    }
    if (night > 0.01) { ctx.fillStyle = "rgba(10,14,60," + (night * 0.30).toFixed(3) + ")"; ctx.fillRect(0, 0, VW, VH); }
    var vig = ctx.createRadialGradient(VW / 2, VH * 0.48, VH * 0.5, VW / 2, VH * 0.48, Math.max(VW, VH) * 0.78);
    vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,.30)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, VW, VH);
    if (flash > 0.01) { ctx.fillStyle = "rgba(255,255,255," + (flash * 0.6).toFixed(2) + ")"; ctx.fillRect(0, 0, VW, VH); }

    if (S.phase === "intro") {
      var d0 = dayStats(0), d1 = dayStats(1), up = d0.count > 2 && d1.count > 2 && d0.sum / d0.count > d1.sum / d1.count;
      if (away) { handOff("Hang Time"); loaded(); return; }
      sign(["Hang Time", rival ? "A friend scored " + rival.toLocaleString("en-US") + ". Beat it." : goalDone ? (streak > 1 ? "Day " + streak + " in a row. Tomorrow: " + Math.min(7, 3 + streak) + " spins." : "Today's goal is done. Nice.") : "Today: " + goal.text.toLowerCase() + " for 2 spins", "Tap on the gold to punt"], 190, "gold");
      if (slotVisible()) { chips(true); slotPanel(); }
      loaded();
      return;
    }
    hud();
    if (S.phase !== "over") { pocketDraw(); tutorDraw(); }
    if (S.phase === "over") {
      if (away) { handOff(lives > 0 ? "Life " + (gameLives - lives + 1) + " of " + gameLives : extraLives ? "Extra life" : "New game"); loaded(); return; }
      // three short lines: the score, where the game stands, and the one thing worth knowing
      var lines = [(S.newBest ? "New best: " : lives > 0 || extraLives ? "Score " : "Final score ") + S.pts.toLocaleString("en-US"),
                   lives > 0 ? lives + (lives === 1 ? " life left" : " lives left") : extraLives ? "Extra life won: this game goes on" : "Game over  \u00B7  Level " + levelOf(xp),
                   S.levelUp ? "Level " + S.levelUp + "!  +2 spins" :
                   S.goalDone ? "Daily goal done: +2 spins" :
                   S.unlocked ? "New ball: " + S.unlocked :
                   lives <= 0 && !S.newBest && bestPts - S.pts > 0 && bestPts - S.pts <= Math.max(60, bestPts * 0.25) ? "Only " + (bestPts - S.pts).toLocaleString("en-US") + " short of your best. Go again." :
                   lives <= 0 && gamePunts.length > 1 ? "Your punts: " + gamePunts.map(function (g) { return g.toLocaleString("en-US"); }).join(" + ") :
                   S.near ? S.near + ". Go again." :
                   lives > 0 && bestPts > S.pts ? (bestPts - S.pts).toLocaleString("en-US") + " to beat your best" + (lives === 1 ? "  \u00B7  last life scores double" : "") :
                   lives > 0 ? (lives === 1 ? "Last life scores double. Push the record." : "Ahead of your best. Keep going.") :
                   S.kind];
      sign(lines, slotVisible() ? (VW < 560 ? 176 : 158) : 240, S.newBest ? "gold" : "dark", S.wait);
      if (slotVisible()) slotPanel();
      loaded();
    }
  }

  var last = 0;
  function frame(ts) {
    var dt = Math.min(0.034, (ts - last) / 1000 || 0);
    last = ts;
    requestAnimationFrame(frame);                         // asked for first, so one bad frame can never stop the game
    if (!paused) update(dt);
    draw();
    if (paused) {
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 0, VW, VH);
      sign(["Paused", "Tap to keep going"], 220, "gold");
    }
  }

  // For testing only: open the page with #cctest to let a script read the game and tap.
  if (/cctest/.test(location.hash) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.__cc = { state: function () { return S; }, tap: tap, ballX: function () { return BX; },
                    step: function (dt, quiet) { update(dt || 1 / 60); if (!quiet) draw(); }, boxes: function (on) { debugBoxes = !!on; },
                    hits: function (o, y) { return touches(o, S.dist + BX, y); },
                    geo: function () { return { FEET: FEET, FLOOR: FLOOR, BASE: BASE, BED: BED, GY: GY, VW: VW }; },
                    dream: function () { S.dreamAt = S.t + 0.3; }, hold: function (on) { held = on; },
                    rtp: measureRtp, start: measureStart, rtpAt: rtpAt, gauge: gaugeNow, superPunt: function () { pocket = "S"; }, care: function (d) { if (d !== undefined) dry = d; return { dry: dry, hotLeft: hotLeft, mercyNext: mercyNext, idleGift: idleGift, math: careMath() }; }, popcorn: popcorn, use: usePower, pocket: function (c) { if (c !== undefined) pocket = c; return pocket; }, played: function (n) { if (n !== undefined) played = n; return played; }, blockers: function () { pocket = "B"; }, lives: function (n) { if (n !== undefined) lives = n; return lives; },
                    force: function (syms) { forced = syms; }, golds: function (n) { if (n !== undefined) golds = n; return golds; },
                    kit: function (k) { if (k !== undefined) { pocket = k.charAt(0); rack = k.slice(1).split(""); kitSave(); } return pocket + rack.join(""); },
                    extra: function () { return extraLives; }, fx: function () { return { flights: flights.length, shownBank: shownBank, shownPot: shownPot, bank: bank }; }, pot: function (n) { if (n !== undefined) pot = n; return pot; }, pull: pull, keepIt: keep, tapSlot: slotTap, finishNow: function () { die("Downed"); },
                    spins: function (n) { spins += n; board(); }, slot: function () { return ui; } };
  }

  window.addEventListener("resize", resize);
  reset();
  resize();
  soundLabel();
  board();
  goalShow();
  buildShow();
  setInterval(function () { var was = spins; refill(); if (spins !== was) board(); }, 5000);
  buildBalls();
  drawMandala();
  requestAnimationFrame(frame);
})();
