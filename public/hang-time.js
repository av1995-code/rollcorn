// Hang Time: keep the punt in the air.
// Tap to punt, then keep tapping to stay up. Fly between the corn and the storm
// clouds, stay away from the returners who jump for the ball, and pick up
// kernels. Hang time is the score. One touch and the punt is down; one tap and
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
  var typeEl = document.getElementById("cc-type");
  var nemEl = document.getElementById("cc-nemesis");
  var mandala = document.getElementById("cc-mandala");
  var mandalaNote = document.getElementById("cc-mandala-note");
  var saveBtn = document.getElementById("cc-save");

  var GOLD = "#FFCD00", INK = "#000", TURF = "#3FA34D", TURF_DARK = "#2F8F41", HUSK = "#22753A", RED = "#D7261E";
  var DISPLAY = '"Antonio", "Roboto Condensed", "Arial Narrow", sans-serif';
  var LABEL = '"Roboto Condensed", "Arial Narrow", sans-serif';
  var RANKS = [[0, "Warming up"], [5, "Finding your leg"], [15, "Good hang"],
               [30, "Great hang"], [60, "Punting is winning"]];
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

  // Positive words that flash in the sky for a single frame, too quick to read on purpose,
  // followed for two frames by a fainter jumble of letters in the same spot (a backward mask),
  // which is what keeps the word from being noticed.
  // Rule for this list: encouragement for the player only. Nothing that tells anyone
  // to keep playing, buy, share or come back. The page says in "How it works" that they are there.
  var FLASHES = ["You've got this", "You are good at this", "You are capable", "You are enough", "You are doing great",
                 "You belong here", "Good things are coming", "Be proud of yourself", "Breathe", "Smile", "Well done", "Enjoy this"];

  // Everything is drawn on a field 480 units tall; the width follows the screen.
  var VH = 480, GY = 408, TURF_H = 62, R = 10, YARD = 12;
  var GRAV = 1350, TAP = -430, PUNT = -640;
  var SPIN = 1.5;                                      // seconds each spin of the slots takes
  var W = 960, H = 480, U = 1, VW = 960, BX = 270;

  function load(key) { try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; } }
  function loadText(key) { try { return localStorage.getItem(key) || ""; } catch (e) { return ""; } }
  function save(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }
  var best = load("rollcorn-hang-best");
  var bank = load("rollcorn-hang-kernels");            // kernels picked up so far
  var earned = load("rollcorn-hang-earned") || bank;   // the count that unlocks balls
  var pot = load("rollcorn-hang-pot") || 150;          // the slots jackpot: it grows with every kernel and every losing spin
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
    "Lost in the storm": { code: "S", name: "the storm", color: "#5B6475" },
    "Into the corn": { code: "C", name: "the corn", color: "#3FA34D" },
    "Picked off by the returner": { code: "R", name: "the returner", color: "#8A1F1F" },
    "Hit a crow": { code: "W", name: "the crows", color: "#15151A" },
    "Downed": { code: "G", name: "the ground", color: "#8B5A2B" },
    "Hit the post": { code: "P", name: "the gate", color: "#D9A300" }
  };
  function causeOf(code) { for (var k in CAUSES) if (CAUSES[k].code === code) return CAUSES[k]; return null; }
  var TYPES = {
    gambler: ["The Gambler", "You go for the big kernels."],
    steady: ["The Steady Hand", "Your taps keep an even beat."],
    storm: ["The Stormchaser", "You fly up near the clouds."],
    low: ["The Low Flyer", "You skim the corn."],
    collector: ["The Collector", "You do not leave kernels behind."],
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
  var lastT = 0;                                       // how long the punt before this one hung, this visit
  var freeHelmet = false;                              // won on the slots: the next punt starts with a helmet

  var S = null;                                        // the current punt
  var now = 0, shake = 0, tod = 0, flash = 0;
  var particles = [], floaters = [], clouds = [], stars = [];
  for (var c = 0; c < 3; c++) clouds.push({ x: Math.random() * 1400, y: 30 + Math.random() * 150, s: 0.6 + Math.random() * 0.7 });
  for (var st = 0; st < 30; st++) stars.push({ x: Math.random(), y: Math.random() * 0.7, r: 0.6 + Math.random() * 1.2, p: Math.random() * 6 });

  function reset() {
    S = { phase: "intro", t: 0, y: GY - 30, vy: 0, dist: 0, speed: 0, spin: 0,
          obs: [], kernels: [], helmets: [], crows: [], trail: [], nextX: 0, lastC: 220, count: 0,
          got: 0, gates: 0, wait: 0, freeze: 0, crowAt: 20, shield: false, safe: 0,
          bestWas: best, passedBest: false, newBest: false, unlocked: "", cause: "", kind: "",
          taps: [], ySum: 0, bigSeen: 0, bigTaken: 0, typeLine: "", beat: false, dreamNem: "",
          rw: 1, rewindFrom: 0, dreamAt: 0, dreaming: 0, kwave: 0,
          combo: 0, slowT: 0, sq: 0, star: null, rainbow: 0, cow: null, todayBest: dayStats(0).best,
          flash: 0, flashText: "", flashMask: ["", ""], flashX: 0, flashY: 0, flashAt: 4, slot: { spins: [], t: 0, stage: -1 } };
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
    gate: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.2, "triangle", 0.16, 0, i * 0.07); }); buzz(40); },
    mark: function () { tone(523, 0.12, "triangle", 0.14); tone(784, 0.18, "triangle", 0.14, 0, 0.1); },
    hit: function () { tone(220, 0.3, "sine", 0.12, 110); thud(0.3); buzz(40); },
    over: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.26, "triangle", 0.12, 0, i * 0.15); }); }
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

  function start() {
    reset();
    punts += 1;
    // A dream punt: rare and never announced. For ten seconds everything gets out of the way.
    if (punts > 3 && Math.random() < 0.04) S.dreamAt = 3 + Math.random() * 4;
    particles.length = 0; floaters.length = 0;
    S.phase = "play";
    S.vy = PUNT;
    S.speed = 210;
    S.nextX = BX + 520;
    if (freeHelmet) { S.shield = true; freeHelmet = false; }
    shareBtn.hidden = true;
    sfx.kick();
    dust(BX - 4, GY - 4, 10);
    label("Tap!");
    say("The punt is up. Keep tapping to keep it in the air.");
    board();
  }

  function tap() {
    audio();
    if (S.phase === "intro" || (S.phase === "over" && S.wait > 0.25)) { start(); return; }
    if (S.phase !== "play") return;
    S.vy = TAP;
    S.sq = 1;
    S.taps.push(S.t);
    buzz(6);
  }

  function spawn() {
    var t = S.t, n = ++S.count, x = S.nextX;
    var step = S.speed * BEAT * (t < 12 ? 5 : t < 35 ? 4 : 3);   // five, then four, then three half-beats apart
    if (n > 3 && !S.cow && Math.random() < 0.06) S.cow = { x: x - step * 0.5, mooed: false };
    var kind = n % 6 === 0 ? "gate" : (n > 2 && Math.random() < 0.3 ? "jump" : "gap");
    var o, cy;
    if (kind === "jump") {
      // a storm cloud above, a returner below who leaps as the ball arrives
      var top = 90 + Math.random() * 60, room = GY - 52 - top - 128;
      o = { kind: kind, x: x, w: 64, top: top, bot: GY, apex: 40 + Math.random() * (room - 40), jy: 0, jv: 0, st: 0 };
      cy = top + 66;
    } else {
      var gap = kind === "gate" ? 118 : Math.max(128, 178 - t * 1.1) + (n <= 2 ? 30 : 0);   // the first two are wide open
      cy = clamp(S.lastC + (Math.random() * 2 - 1) * 150, 60 + gap / 2, GY - 50 - gap / 2);
      o = { kind: kind, x: x, w: kind === "gate" ? 30 : 64, top: cy - gap / 2, bot: cy + gap / 2 };
      var amp = Math.min(28 + Math.random() * 26, o.top - 44, GY - 54 - o.bot);
      if (kind === "gap" && t > 25 && amp > 10 && Math.random() < 0.4) {     // later on, some gaps slide up and down
        o.amp = amp; o.sp = 1.4 + Math.random(); o.ph = Math.random() * 6; o.top0 = o.top; o.bot0 = o.bot;
      }
      if (!o.amp && kind === "gap" && Math.random() < 0.3) {                 // a big kernel, tucked right against the corn or the cloud
        S.kernels.push({ x: x + o.w / 2, y: Math.random() < 0.5 ? o.top + 19 : o.bot - 19, got: false, big: true, ph: Math.random() * 6 });
      } else S.kernels.push({ x: x + o.w / 2, y: cy, got: false, ph: Math.random() * 6 });
    }
    if (n % 9 === 5) S.helmets.push({ x: x - step / 2, y: (S.lastC + cy) / 2, ph: Math.random() * 6 });
    else S.kernels.push({ x: x - step / 2, y: (S.lastC + cy) / 2, got: false, ph: Math.random() * 6 });
    if (S.dreaming > 0) o.dream = true;
    S.obs.push(o);
    S.lastC = cy;
    S.nextX += step;
  }

  // every kernel goes into the ear in the corner; a full ear pops and pays, then starts again
  function fillCob(n) {
    cob += n;
    if (cob >= COB) {
      cob -= COB;
      S.got += 50;
      sfx.gate();
      burst(VW - 30, 60, 40);
      floaters.push({ text: "FULL EAR  +50", life: 0, color: GOLD });
    }
    save("rollcorn-hang-cob", cob);
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

  function die(cause) {
    S.phase = "dead";
    S.cause = cause;
    S.wait = 0;
    S.freeze = 0.13;
    if (S.vy < 0) S.vy = 0;
    shake = 6; flash = 0.25;
    sfx.hit();
    burst(BX, S.y, 6);
    label("Down", true);
  }

  // Kernel slots: a punt of five seconds earns a spin, and each Coffin CORNer gate adds one (three at most).
  // The result is decided and paid up front, so punting again mid-spin loses nothing.
  function rollSlots(n) {
    var spins = [], all = "KFPHC";
    for (var i = 0; i < n; i++) {
      var r = Math.random(), sp = { pay: 0 };
      if (r < 0.02) { sp.syms = "CCC"; sp.pay = pot; sp.big = true; sp.text = "JACKPOT  +" + pot.toLocaleString("en-US"); pot = 150; }
      else if (r < 0.07) { sp.syms = "PPP"; sp.pay = 50; sp.text = "POPCORN  +50"; }
      else if (r < 0.13) { sp.syms = "HHH"; sp.helmet = true; sp.text = "FREE HELMET NEXT PUNT"; }
      else if (r < 0.23) { sp.syms = "FFF"; sp.pay = 25; sp.text = "THREE FOOTBALLS  +25"; }
      else if (r < 0.35) { sp.syms = "KKK"; sp.pay = 15; sp.text = "THREE KERNELS  +15"; }
      else {
        var a = Math.floor(Math.random() * 5), b = (a + 1 + Math.floor(Math.random() * 4)) % 5, c = a;
        if (r >= 0.65) { do { c = Math.floor(Math.random() * 5); } while (c === a || c === b); }
        var order = [[a, c, b], [a, b, c], [b, a, c]][Math.floor(Math.random() * 3)];
        sp.syms = all.charAt(order[0]) + all.charAt(order[1]) + all.charAt(order[2]);
        if (r < 0.65) { sp.pay = 5; sp.text = "PAIR  +5"; } else sp.text = "NEXT TIME";
      }
      if (!sp.big) pot += 3;
      spins.push(sp);
    }
    return { spins: spins, t: 0, stage: -1 };
  }
  // where the slots are at time t: which spin, how far into it, and when its last reel stops.
  // When the first two reels match, the third takes longer to land. The result itself is never touched.
  function slotAt(t) {
    var spins = S.slot.spins, start = 0;
    for (var i = 0; i < spins.length; i++) {
      var tease = spins[i].syms.charAt(0) === spins[i].syms.charAt(1), dur = SPIN + (tease ? 0.7 : 0);
      if (t < start + dur || i === spins.length - 1) {
        return { idx: i, sp: spins[i], lt: Math.min(t - start, dur), last: 0.9 + (tease ? 0.7 : 0), tease: tease };
      }
      start += dur;
    }
    return null;
  }
  function slotEnd() {
    var total = 0;
    S.slot.spins.forEach(function (sp) { total += SPIN + (sp.syms.charAt(0) === sp.syms.charAt(1) ? 0.7 : 0); });
    return total;
  }

  function finish() {
    S.phase = "over";
    S.wait = 0;
    S.rw = 0; S.rewindFrom = S.dist;
    tone(240, 0.55, "sine", 0.045, 520);
    var before = earned;
    bank += S.got; earned += S.got;
    if (S.t > best) { best = S.t; S.newBest = true; save("rollcorn-hang-best", best.toFixed(2)); }
    var today = dayStats(0), bestToday = S.t > today.best && today.count > 0;
    save(dayKey(0), [(today.sum + S.t).toFixed(2), today.count + 1, Math.max(today.best, S.t).toFixed(2)].join(","));
    pot += S.got;
    S.slot = rollSlots((S.t >= 5 ? 1 : 0) + Math.min(2, S.gates));
    S.slot.spins.forEach(function (sp) { bank += sp.pay; earned += sp.pay; if (sp.helmet) freeHelmet = true; });
    save("rollcorn-hang-kernels", bank); save("rollcorn-hang-earned", earned); save("rollcorn-hang-pot", pot);
    BALLS.forEach(function (b) { if (before < b.need && earned >= b.need) S.unlocked = b.name; });
    S.kind = S.newBest ? "Your best ever. Enjoy that one." :
             bestToday ? "Your best punt today." :
             lastT > 0 && S.t > lastT ? "Up from " + lastT.toFixed(2) + " last time. Nice." :
             best > 0 && S.t >= best * 0.8 ? "So close to your best: just " + (best - S.t).toFixed(2) + " short." :
             KIND[Math.floor(Math.random() * KIND.length)];
    var personal = S.newBest || bestToday || (lastT > 0 && S.t > lastT);   // a line about this punt already said it
    lastT = S.t;

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
    label("Punt again");
    shareBtn.hidden = false;
    say(S.cause + ". Hang time " + S.t.toFixed(2) + " seconds. " + rank(S.t) + ". " + S.kind + " Kernels " + S.got + ". Best " + best.toFixed(2) + "." +
        (S.unlocked ? " New ball: " + S.unlocked + "." : "") + (S.typeLine ? " " + S.typeLine : "") +
        (S.slot.spins.length ? " Kernel slots: " + S.slot.spins.map(function (sp) { return sp.text.toLowerCase().replace(/\s+/g, " "); }).join(", ") + "." : ""));
    board();
    buildBalls();
  }

  // ---------- page controls ----------

  function label(text, off) { btn.textContent = text; btn.disabled = !!off; }
  function say(text) { statusEl.textContent = text; }
  function board() {
    scoreEl.textContent = S.t.toFixed(2);
    bestEl.textContent = best.toFixed(2);
    kernEl.textContent = (bank + (S.phase === "over" ? 0 : S.got)).toLocaleString("en-US");
    potEl.textContent = pot.toLocaleString("en-US");
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
      b.textContent = open ? it.name : it.name + " · " + it.need.toLocaleString("en-US") + " kernels";
      b.setAttribute("aria-pressed", ballId === it.id ? "true" : "false");
      b.addEventListener("click", function () { ballId = it.id; save("rollcorn-hang-ball", it.id); buildBalls(); });
      ballsEl.appendChild(b);
    });
  }

  canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); tap(); });
  btn.addEventListener("click", tap);
  document.addEventListener("keydown", function (e) {
    if (e.key !== " " && e.key !== "Enter" && e.key !== "ArrowUp") return;
    var t = e.target && e.target.tagName;
    if (t === "A" || t === "INPUT" || t === "TEXTAREA" || t === "SUMMARY" || (t === "BUTTON" && e.key !== "ArrowUp")) return;
    e.preventDefault();
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
    var url = "https://rollcorn.com/hang-time.html";
    var text = "I kept a punt in the air for " + S.t.toFixed(2) + " seconds on Hang Time" + (ptype ? ". They call me " + TYPES[ptype][0] : "") + ". Beat it:";
    function copied() { shareBtn.textContent = "Copied"; setTimeout(function () { shareBtn.textContent = "Share score"; }, 1600); }
    if (navigator.share) navigator.share({ text: text, url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text + " " + url).then(copied, function () {});
  });

  // ---------- particles ----------

  function burst(x, y, n) {            // kernels fly up and pop into popcorn
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

  // ---------- the clock ----------

  function update(dt) {
    now += dt;
    shake = Math.max(0, shake - dt * 24);
    flash = Math.max(0, flash - dt * 5);
    tod = S.phase === "over" ? lerp(tod, 0, Math.min(1, dt * 2.5))      // the day comes back with the ball
                             : lerp(tod, clamp(S.t / 22, 0, 2), Math.min(1, dt * 0.8));
    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j];
      p.life += dt;
      if (p.life < 0) continue;                           // fireworks go up one after another
      p.vy += (p.kind === "kernel" ? 520 : p.kind === "dust" ? 120 : p.kind === "fw" ? 70 : 0) * dt;
      if (p.kind === "fw") {
        p.vx *= 1 - dt * 1.6; p.vy *= 1 - dt * 1.6; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life > p.max) particles.splice(j, 1);
        continue;
      }
      p.x += (p.vx - S.speed * 0.5) * dt; p.y += p.vy * dt;
      if (p.kind === "kernel" && p.y > GY + 20 && p.vy > 0) { p.y = GY + 20; p.vy *= -0.35; p.vx *= 0.6; }
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

    if (S.freeze > 0) { S.freeze -= dt; return; }       // a beat of stillness on impact
    if (S.phase === "intro") return;
    if (S.phase === "over") {
      S.wait += dt;
      if (S.rw < 1) {
        S.rw = Math.min(1, S.rw + dt / 0.95);
        var back = 1 - Math.pow(1 - S.rw, 3);
        S.dist = S.rewindFrom * (1 - back);
        S.y = lerp(GY - 6, GY + TURF_H * 0.5 - 9, back) - Math.sin(Math.PI * back) * 130;
        S.spin -= dt * 12;
        if (S.rw >= 1) { S.spin = -0.5; S.sq = 1; tone(330, 0.08, "sine", 0.06); }
      }
      S.sq = Math.max(0, S.sq - dt * 6);
      var sl = S.slot;
      if (sl.spins.length && sl.t < slotEnd()) {
        sl.t += dt;
        var at = slotAt(sl.t), stage = at.idx * 2 + (at.lt >= at.last + 0.1 ? 1 : 0);
        if (stage > sl.stage) {                           // a sound only when a spin pays
          sl.stage = stage;
          if (stage % 2) {
            if (at.sp.pay >= 25 || at.sp.helmet) { sfx.gate(); burst(VW / 2, 380, at.sp.big ? 90 : 30); shake = at.sp.big ? 14 : 5; if (at.sp.big) { flash = 1; fireworks(); } }
            else if (at.sp.pay) sfx.kernel(4);
          }
        }
      }
      return;
    }
    if (S.phase === "dead") {
      S.wait += dt;
      S.speed *= Math.max(0, 1 - dt * 5);
      S.dist += S.speed * dt;
      if (S.y < GY - 6) {
        S.vy = Math.min(S.vy + GRAV * dt, 700); S.y += S.vy * dt; S.spin += dt * 14;
        if (S.y >= GY - 6) { S.y = GY - 6; thud(0.3); dust(BX, GY, 12); S.wait = 0.15; }
      } else if (S.wait > 0.4) finish();
      return;
    }

    // in the air
    var raw = dt;
    if (S.slowT > 0) { S.slowT -= dt; dt *= 0.45; }     // time stretches while the ball threads a tight gap
    S.t += dt;
    S.sq = Math.max(0, S.sq - raw * 6);
    S.rainbow = Math.max(0, S.rainbow - raw);
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
      for (var d = 0; d < S.obs.length; d++) S.obs[d].dream = true;
      [262, 330, 392, 523].forEach(function (f, n) { tone(f, 2.4, "sine", 0.035, 0, n * 0.12); });   // a soft chord, and nothing said
    }
    if (S.dreaming > 0) {
      S.dreaming -= raw;
      S.safe = Math.max(S.safe, S.dreaming > 0 ? 0.3 : 1.2);   // nothing can touch the ball, and a moment of grace after
      S.crowAt = Math.max(S.crowAt, S.t + 3);
      if (S.dreamNem === "W" && S.dreaming > 1 && Math.random() < raw * 1.3) S.crows.push({ x: S.dist + VW + 60, y: 70 + Math.random() * (GY - 200), ph: Math.random() * 6 });
      S.kwave -= S.speed * dt;
      if (S.kwave <= 0) { S.kwave = 70; S.kernels.push({ x: S.dist + VW + 30, y: 210 + Math.sin(S.t * 1.6) * 70, got: false, ph: 0 }); }
    }
    S.speed = 210 + Math.min(150, S.t * 3.2);
    S.dist += S.speed * dt;
    S.vy = Math.min(S.vy + GRAV * (S.dreaming > 0 ? 0.45 : 1) * dt, S.dreaming > 0 ? 300 : 640);   // in a dream the ball floats
    S.y += S.vy * dt;
    S.spin += dt * 9;
    if (S.y < R + 2) { S.y = R + 2; S.vy = Math.max(S.vy, 0); }
    S.trail.push({ x: S.dist, y: S.y });
    if (S.trail.length > 8) S.trail.shift();
    scoreEl.textContent = S.t.toFixed(2);

    if (S.nextX - S.dist < VW + 120) spawn();
    var bx = S.dist + BX, by = S.y, hit = "", i;

    for (i = S.obs.length - 1; i >= 0; i--) {
      var o = S.obs[i];
      if (o.x + o.w - S.dist < -120) { S.obs.splice(i, 1); continue; }
      if (o.dream) {                                    // the clouds lift and the corn bows out of the way,
        var keepTop = S.dreamNem === "S", keepBot = S.dreamNem === "C" && o.kind === "gap";   // except the nemesis, which stays as a ghost
        o.amp = 0;
        if (!keepTop) o.top += (-80 - o.top) * Math.min(1, raw * 2.6);
        if (!keepBot) o.bot += (GY + 16 - o.bot) * Math.min(1, raw * 2.6);
        if (o.kind === "jump" && S.dreamNem !== "R") o.st = 2;
      }
      if (o.amp) { var slide = o.amp * Math.sin(now * o.sp + o.ph); o.top = o.top0 + slide; o.bot = o.bot0 + slide; }
      if (o.kind === "jump") {
        // he leaves his feet so that the top of the jump meets the ball
        var rise = Math.sqrt(2 * o.apex / 1500);
        if (o.st === 0 && o.x + o.w / 2 - bx < S.speed * rise + 12) { o.st = 1; o.jv = Math.sqrt(2 * 1500 * o.apex); }
        if (o.st === 1) { o.jy += o.jv * dt; o.jv -= 1500 * dt; if (o.jy <= 0) { o.jy = 0; o.st = 2; } }
        var px = o.x + o.w / 2, fy = GY - o.jy;
        if (hitRect(bx, by, R - 2, px - 11, fy - 50, 22, 50) || hitRect(bx, by, R - 2, px - 14, fy - 74, 28, 24)) hit = "Picked off by the returner";
        if (hitRect(bx, by, R - 2, o.x, -40, o.w, o.top + 40)) hit = "Lost in the storm";
      } else {
        if (hitRect(bx, by, R - 2, o.x, -40, o.w, o.top + 40)) hit = o.kind === "gate" ? "Hit the post" : "Lost in the storm";
        if (hitRect(bx, by, R - 2, o.x, o.bot, o.w, GY - o.bot + 40)) hit = o.kind === "gate" ? "Hit the post" : "Into the corn";
      }
      if (bx > o.x - R && bx < o.x + o.w + R) {
        var room = Math.min(by - o.top, (o.kind === "jump" ? GY - o.jy - 74 : o.bot) - by) - R;
        if (room > 0 && room < 13 && (o.slow || 0) < 0.3) { o.slow = (o.slow || 0) + raw; S.slowT = 0.05; }
      }
      if (!o.passed && bx > o.x + o.w + R) {
        o.passed = true;
        if (o.kind === "gate") {
          S.got += 5; S.gates += 1;
          sfx.gate(); shake = 6;
          burst(BX, S.y, 24);
          floaters.push({ text: "COFFIN CORNer  +5", life: 0, color: GOLD });
          fillCob(5);
          kernEl.textContent = (bank + S.got).toLocaleString("en-US");
        } else if (tod < 0.8 && S.rainbow <= 0 && Math.random() < 0.07) S.rainbow = 4;   // once in a while, a rainbow after the storm
      }
    }
    for (i = S.kernels.length - 1; i >= 0; i--) {
      var kn = S.kernels[i];
      if (kn.x - S.dist < -40) { if (!kn.got) { S.combo = 0; if (kn.big) S.bigSeen += 1; } S.kernels.splice(i, 1); continue; }
      if (!kn.got && (kn.x - bx) * (kn.x - bx) + (kn.y - by) * (kn.y - by) < 24 * 24) {
        kn.got = true; S.got += kn.big ? 5 : 1;
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
      if ((hm.x - bx) * (hm.x - bx) + (hm.y - by) * (hm.y - by) < 28 * 28) {
        S.helmets.splice(i, 1);
        S.shield = true;
        sfx.power();
      }
    }
    if (S.t > S.crowAt && S.dreaming <= 0) {                           // later on, crows come the other way
      S.crowAt = S.t + 3.5 + Math.random() * 3.5;
      S.crows.push({ x: S.dist + VW + 320, y: 70 + Math.random() * (GY - 200), ph: Math.random() * 6 });
    }
    for (i = S.crows.length - 1; i >= 0; i--) {
      var cr = S.crows[i];
      cr.x -= 140 * dt;
      cr.y += Math.sin(now * 3 + cr.ph) * 14 * dt;
      if (cr.x - S.dist < -60) { S.crows.splice(i, 1); continue; }
      if ((cr.x - bx) * (cr.x - bx) + (cr.y - by) * (cr.y - by) < 20 * 20) hit = "Hit a crow";
    }
    if (S.t > S.flashAt) {
      S.flashAt = S.t + 6 + Math.random() * 4;
      S.flashText = FLASHES[Math.floor(Math.random() * FLASHES.length)];
      S.flash = 3;                                       // one frame of the word, then two of the mask
      S.flashX = VW * (0.3 + Math.random() * 0.4);       // never the same spot twice, so there is nowhere to stare
      S.flashY = 130 + Math.random() * 130;
      S.flashMask = ["", ""];
      for (var mc = 0; mc < S.flashText.length; mc++) {
        S.flashMask[0] += "XKWMHNZRVB".charAt(Math.floor(Math.random() * 10));
        S.flashMask[1] += "MWKXNHBZRV".charAt(Math.floor(Math.random() * 10));
      }
    }
    if (!S.passedBest && S.bestWas > 2 && S.t > S.bestWas) {
      S.passedBest = true;
      sfx.gate(); burst(BX, S.y, 30); shake = 6;
      fireworks();
      floaters.push({ text: "NEW BEST!", life: 0, color: GOLD });
    }
    if (S.y > GY - 6) { S.y = GY - 6; hit = "Downed"; }
    if (hit && S.safe > 0) {                            // just saved: nothing can touch it for a moment
      if (hit === "Downed") S.vy = TAP;
    } else if (hit && S.shield) {                       // the helmet takes one hit
      S.shield = false; S.safe = 1.4;
      S.vy = hit === "Downed" ? PUNT * 0.75 : TAP * 0.6;
      shake = 9; flash = 0.6;
      sfx.saved();
      burst(BX, S.y, 14);
      floaters.push({ text: "SAVED BY THE HELMET", life: 0, color: "#fff" });
    } else if (hit) die(hit);
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

  // one kernel of corn, drawn around the current origin: a broad rounded crown with a dimple,
  // a deep gold body, and the blunt pale tip where it sat on the cob
  function kernel(k) {
    ctx.save();
    ctx.scale(k, k);
    var g = ctx.createLinearGradient(-7, 0, 7, 0);
    g.addColorStop(0, "#FFD84A"); g.addColorStop(0.55, "#FFBE1E"); g.addColorStop(1, "#F29D00");
    ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 1.7; ctx.lineJoin = "round";
    function outline() {
      ctx.beginPath();
      ctx.moveTo(-3.4, 9.5);
      ctx.lineTo(3.4, 9.5);                                // the blunt tip
      ctx.bezierCurveTo(6.2, 9.5, 8, 3, 8, -2.5);
      ctx.bezierCurveTo(8, -8.6, 3.6, -9.8, 0, -9.2);      // the crown
      ctx.bezierCurveTo(-3.6, -9.8, -8, -8.6, -8, -2.5);
      ctx.bezierCurveTo(-8, 3, -6.2, 9.5, -3.4, 9.5);
      ctx.closePath();
    }
    outline(); ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#FFF4D0"; ctx.fillRect(-9, 5.2, 18, 6);          // pale tip
    ctx.fillStyle = "rgba(150,80,0,.30)"; ctx.fillRect(-9, 4.6, 18, 1.1);
    ctx.fillStyle = "rgba(160,85,0,.38)";                             // the dimple in the crown
    ctx.beginPath(); ctx.ellipse(0.4, -4.6, 3.3, 2.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.8)";                           // shine
    ctx.beginPath(); ctx.ellipse(-4.4, -5.2, 1.4, 2.6, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    outline(); ctx.stroke();
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

    // one range of hills, then the barn
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

  function field() {
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

  // a thunderhead hanging down from the top of the sky
  function storm(x, w, top) {
    var on = false, y;
    var g = ctx.createLinearGradient(0, Math.max(-30, top - 170), 0, top);
    g.addColorStop(0, on ? "#7B8498" : "#666F82"); g.addColorStop(1, on ? "#3C4354" : "#2A303D");
    ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x - 2, -34);
    for (y = -34; y < top - 46; y += 34) ctx.arc(x + 4, y + 17, 17, -Math.PI / 2, Math.PI / 2, true);
    ctx.lineTo(x - 6, top - 24);
    ctx.arc(x + 6, top - 17, 17, Math.PI, Math.PI * 0.5, true);
    ctx.arc(x + w / 2, top - 21, 21, Math.PI * 0.78, Math.PI * 0.22, true);
    ctx.arc(x + w - 6, top - 17, 17, Math.PI * 0.5, 0, true);
    var rises = [];
    for (y = -34; y < top - 46; y += 34) rises.push(y);
    for (var i = rises.length - 1; i >= 0; i--) ctx.arc(x + w - 4, rises[i] + 17, 17, Math.PI / 2, -Math.PI / 2, true);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.20)";
    ctx.beginPath(); ctx.ellipse(x + w / 2, top - 6, w * 0.5, 7, 0, 0, Math.PI * 2); ctx.fill();
    if (top > 64) {
      var lx = x + w / 2, ly = top - 56;
      if (on) {
        var flashGlow = ctx.createRadialGradient(lx, ly + 14, 2, lx, ly + 14, 44);
        flashGlow.addColorStop(0, "rgba(255,236,140,.55)"); flashGlow.addColorStop(1, "rgba(255,236,140,0)");
        ctx.fillStyle = flashGlow; ctx.fillRect(lx - 46, ly - 32, 92, 92);
      }
      ctx.fillStyle = "#FFD84A"; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(lx + 3, ly); ctx.lineTo(lx - 8, ly + 17); ctx.lineTo(lx - 1, ly + 17); ctx.lineTo(lx - 6, ly + 32);
      ctx.lineTo(lx + 9, ly + 12); ctx.lineTo(lx + 2, ly + 12); ctx.lineTo(lx + 9, ly); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }

  function leaf(x, y, dir, len, col) {
    ctx.fillStyle = col; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dir * len * 0.5, y - len * 0.75, x + dir * len, y - len * 0.1);
    ctx.quadraticCurveTo(x + dir * len * 0.45, y - len * 0.25, x, y + 5);
    ctx.fill(); ctx.stroke();
  }

  // a stand of tall corn, lit from the left
  function cornWall(x, w, bot) {
    var base = GY + TURF_H * 0.62;
    ctx.fillStyle = "rgba(0,0,0,.26)";
    ctx.beginPath(); ctx.ellipse(x + w / 2 + 6, base + 2, w * 0.72, 6, 0, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#2C8A40"); g.addColorStop(0.45, "#24753A"); g.addColorStop(1, "#124A25");
    ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, base); ctx.lineTo(x, bot + 13);
    for (var i = 0; i <= 4; i++) ctx.lineTo(x + (i + 0.5) * w / 5 - w / 10, bot + (i % 2 ? 11 : 0));
    ctx.lineTo(x + w, bot + 13); ctx.lineTo(x + w, base); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // tassels on the tips
    ctx.strokeStyle = "#E7C24A"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
    for (i = 0; i <= 4; i += 2) {
      var tx = x + (i + 0.5) * w / 5 - w / 10;
      ctx.beginPath(); ctx.moveTo(tx, bot + 2); ctx.lineTo(tx - 4, bot - 7); ctx.moveTo(tx, bot + 2); ctx.lineTo(tx, bot - 9); ctx.moveTo(tx, bot + 2); ctx.lineTo(tx + 4, bot - 7); ctx.stroke();
    }
    // stalks, leaves and ears
    ctx.strokeStyle = "#5CC06B"; ctx.lineWidth = 3;
    for (var sx = x + 12, n = 0; sx < x + w - 4; sx += 21, n++) {
      ctx.beginPath(); ctx.moveTo(sx, base - 2); ctx.lineTo(sx, bot + 18); ctx.stroke();
    }
    for (var ly = bot + 40, row = 0; ly < base - 8; ly += 44, row++) {
      leaf(x + 12, ly, -1, 20, row % 2 ? "#3FA34D" : "#57B865");
      leaf(x + w - 10, ly + 12, 1, 20, row % 2 ? "#2F8F41" : "#3FA34D");
    }
    for (var ey = bot + 52, e = 0; ey < base - 4; ey += 74, e++) cornEar(x + (e % 2 ? w * 0.7 : w * 0.3), ey, 21);
    ctx.fillStyle = "rgba(255,255,255,.10)";
    ctx.fillRect(x + 2, bot + 16, 5, base - bot - 18);
  }

  function gate(o, x) {
    ctx.fillStyle = "rgba(255,225,90,.2)";
    ctx.fillRect(x - 6, o.top, o.w + 12, o.bot - o.top);
    ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    rr(x, -30, o.w, o.top + 30, 6); ctx.fill(); ctx.stroke();
    rr(x, o.bot, o.w, GY - o.bot + 40, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    for (var y = o.bot + 12; y < GY + 20; y += 22) ctx.fillRect(x, y, o.w, 8);
    for (var y2 = o.top - 20; y2 > -30; y2 -= 22) ctx.fillRect(x, y2, o.w, 8);
    cornEar(x + o.w / 2, o.bot + 2, 26);
    ctx.save();
    ctx.translate(x + o.w / 2, o.top - 4); ctx.rotate(Math.PI);
    cornEar(0, 0, 26);
    ctx.restore();
  }

  function crow(x, y) {
    var flap = Math.sin(now * 16 + x * 0.01);
    ctx.fillStyle = "#15151A"; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.ellipse(x, y, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 12, y - 3, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 4, y - 2); ctx.lineTo(x + 6, y - 2 - 18 * flap); ctx.lineTo(x + 10, y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 11, y - 2); ctx.lineTo(x + 22, y - 5); ctx.lineTo(x + 21, y + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.moveTo(x - 17, y - 4); ctx.lineTo(x - 25, y - 1); ctx.lineTo(x - 17, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - 13, y - 4, 1.6, 0, Math.PI * 2); ctx.fill();
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
    } else if (ch === "P") {
      ctx.fillStyle = "#FFFBEA";
      for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x + Math.cos(i * 1.26) * 7, y + Math.sin(i * 1.26) * 7, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(x - 1, y + 1, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (ch === "H") {
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(x - 2, y, 12, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(x + 2, y + 3); ctx.lineTo(x + 1, y + 10); ctx.lineTo(x - 10, y + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x + 9, y + 1); ctx.lineTo(x + 14, y + 5); ctx.lineTo(x + 13, y + 10); ctx.lineTo(x + 2, y + 10); ctx.moveTo(x + 14, y + 6); ctx.lineTo(x + 3, y + 6); ctx.stroke();
    } else cornEar(x, y + 15, 30);
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

  // the reels, under the game-over sign
  function slotPanel() {
    var sl = S.slot, n = sl.spins.length;
    if (!n) return;
    var at = slotAt(Math.min(sl.t, slotEnd())), sp = at.sp, lt = at.lt;
    var w = 252, h = 96, x = VW / 2 - w / 2, y = 350, shown = lt >= at.last + 0.1, win = shown && (sp.pay || sp.helmet);
    ctx.fillStyle = "rgba(0,0,0,.3)"; rr(x + 5, y + 6, w, h, 12); ctx.fill();
    ctx.fillStyle = "#111"; ctx.strokeStyle = win && Math.sin(now * 18) > 0 ? "#fff" : GOLD; ctx.lineWidth = 4;
    rr(x, y, w, h, 12); ctx.fill(); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var i = 0; i < 3; i++) {
      var cx = VW / 2 + (i - 1) * 70, stopAt = i === 2 ? at.last : 0.4 + i * 0.25, stopped = lt >= stopAt;
      var waiting = i === 2 && at.tease && !stopped && lt >= 0.65;   // two the same: all eyes on the last reel
      ctx.fillStyle = "#fff"; ctx.strokeStyle = waiting ? GOLD : INK; ctx.lineWidth = waiting ? 4 : 2.5;
      rr(cx - 30, y + 12, 60, 46, 7); ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - 28, y + 14, 56, 42); ctx.clip();
      if (stopped) drawSym(sp.syms.charAt(i), cx, y + 35);
      else {
        var slow = waiting ? 1 - 0.65 * clamp((lt - 0.65) / (at.last - 0.65), 0, 1) : 1;   // the last reel winds down
        var roll = now * 13 * slow + i * 1.7, k = Math.floor(roll), off = (roll - k) * 46;
        drawSym("KFPHC".charAt(k % 5), cx, y + 35 + off);
        drawSym("KFPHC".charAt((k + 1) % 5), cx, y + 35 + off - 46);
      }
      ctx.restore();
    }
    ctx.font = "700 15px " + LABEL;
    ctx.fillStyle = win ? GOLD : "#B9B5A5";
    ctx.fillText(shown ? sp.text : "JACKPOT " + pot.toLocaleString("en-US"), VW / 2, y + 77);
  }

  // one clock, one kernel count: that is all the screen says while the ball is up
  function hud() {
    var cw = Math.min(200, VW * 0.4), cx = VW / 2 - cw / 2, hot = S.passedBest || S.newBest;
    ctx.fillStyle = hot ? "#111" : "rgba(255,255,255,.92)"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    rr(cx, 8, cw, 76, 8); ctx.fill(); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = hot ? GOLD : INK;
    ctx.font = "700 44px " + DISPLAY;
    ctx.fillText(S.t.toFixed(2), VW / 2, 12);
    ctx.font = "700 13px " + LABEL;
    ctx.fillText(hot ? "NEW BEST" : best > 0 ? "BEST " + best.toFixed(2) + (S.todayBest > 0 && S.todayBest < best ? "  \u00B7  TODAY " + S.todayBest.toFixed(2) : "") : "HANG TIME", VW / 2, 62, cw - 12);

    // the ear being filled, kernel by kernel, across punts
    var ex = VW - 40, ey = 10, cols = 4, rows = COB / cols;
    ctx.fillStyle = "#3FA34D"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ex - 5, ey + 34); ctx.quadraticCurveTo(ex - 6, ey + 70, ex + 14, ey + 72); ctx.quadraticCurveTo(ex + 34, ey + 70, ex + 33, ey + 34); ctx.quadraticCurveTo(ex + 14, ey + 62, ex - 5, ey + 34); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#F6EFD3";
    rr(ex, ey, 28, 62, 13); ctx.fill(); ctx.stroke();
    for (var ci = 0; ci < COB; ci++) {
      var cr = rows - 1 - Math.floor(ci / cols), cc = ci % cols;
      ctx.fillStyle = ci < cob ? GOLD : "rgba(0,0,0,.10)";
      rr(ex + 3.5 + cc * 5.5, ey + 5 + cr * 5.3, 4.4, 4.2, 1.6); ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.lineWidth = 2;
    rr(8, 8, 74, 34, 7); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(21.5, 25); kernel(0.95); ctx.restore();
    ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = "700 20px " + DISPLAY;
    ctx.fillText(String(S.got), 34, 26);
  }

  function draw() {
    ctx.save();
    if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    sky();
    if (S.rainbow > 0) {
      var ra = clamp(Math.min(S.rainbow, 4 - S.rainbow) / 0.8, 0, 1) * 0.5, bands = ["#FF5E5E", "#FFA940", "#FFE14D", "#6FD46F", "#5EA8FF", "#9B7BFF"];
      ctx.lineWidth = 7; ctx.globalAlpha = ra;
      for (var rb = 0; rb < bands.length; rb++) {
        ctx.strokeStyle = bands[rb];
        ctx.beginPath(); ctx.arc(VW * 0.52, GY + 30, 300 - rb * 7, Math.PI, 0); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
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

    if (S.flash > 0 && S.phase === "play") {            // soft, and behind everything else
      ctx.font = "700 " + Math.min(30, VW * 0.065) + "px " + DISPLAY; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (S.flash === 3) {
        ctx.fillStyle = "rgba(255,255,255,.28)";
        ctx.fillText(S.flashText.toUpperCase(), S.flashX, S.flashY, VW * 0.55);
      } else {
        ctx.fillStyle = "rgba(255,255,255,.17)";
        ctx.fillText(S.flashMask[0], S.flashX, S.flashY, VW * 0.55);
        ctx.fillText(S.flashMask[1], S.flashX + 4, S.flashY + 2, VW * 0.55);
      }
      S.flash -= 1;
    }
    if (S.phase === "play" && S.bestWas > 2 && !S.passedBest) {      // the line to beat
      var bxLine = distAt(S.bestWas) + BX - S.dist;
      if (bxLine < VW + 60) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = 4; ctx.setLineDash([10, 9]);
        ctx.beginPath(); ctx.moveTo(bxLine, 96); ctx.lineTo(bxLine, GY + TURF_H); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        rr(bxLine - 30, 96, 60, 24, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.font = "700 14px " + LABEL; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("BEST", bxLine, 109);
      }
    }
    for (i = 0; i < S.obs.length; i++) {
      var o = S.obs[i];
      x = o.x - S.dist;
      if (o.kind === "gate") gate(o, x);
      else {
        var ghost = o.dream && S.dreaming > 0;                 // in a dream the nemesis is pale and harmless
        if (ghost) ctx.globalAlpha = 0.38;
        if (o.top > 6) storm(x, o.w, o.top);
        if (o.kind === "gap") { if (o.bot < GY - 6) cornWall(x, o.w, o.bot); }
        else player(x + o.w / 2, GY - o.jy + (o.jy > 0 ? 0 : TURF_H * 0.5), kit(AWAY, { up: o.st === 1, air: o.jy > 0 }));
        ctx.globalAlpha = 1;
      }
    }
    for (i = 0; i < S.kernels.length; i++) {
      var kn = S.kernels[i];
      if (kn.got) continue;
      var kx = kn.x - S.dist, ky = kn.y + Math.sin(now * 3 + kn.ph) * 3;
      ctx.save(); ctx.translate(kx, ky); ctx.rotate(Math.sin(now * 2 + kn.ph) * 0.3);
      if (kn.big) ctx.scale(1.7, 1.7);
      kernel(1.05);
      ctx.restore();
    }
    for (i = 0; i < S.helmets.length; i++) {
      var hm = S.helmets[i], qx = hm.x - S.dist, qy = hm.y + Math.sin(now * 3 + hm.ph) * 4;
      ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(qx, qy, 19, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      drawSym("H", qx, qy - 1);
    }
    for (i = 0; i < S.crows.length; i++) {
      var cr = S.crows[i];
      x = cr.x - S.dist;
      if (x > VW + 10) {                                // warn before it shows up
        ctx.fillStyle = RED; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(VW - 8, cr.y); ctx.lineTo(VW - 26, cr.y - 12); ctx.lineTo(VW - 26, cr.y + 12); ctx.closePath();
        if (Math.sin(now * 14) > 0) { ctx.fill(); ctx.stroke(); }
      } else { if (S.dreaming > 0) ctx.globalAlpha = 0.38; crow(x, cr.y); ctx.globalAlpha = 1; }
    }

    // the punter, left behind once the ball is away
    var feet = GY + TURF_H * 0.5, px = BX - 16 - S.dist;
    if (px > -40) player(px, feet, kit(HOME, { kick: S.phase !== "intro" && S.t < 0.5 }));

    // the ball, its trail and its shadow
    if (S.phase === "play" && S.trail.length > 1) {
      ctx.lineCap = "round";
      for (i = 1; i < S.trail.length; i++) {
        var tt = i / S.trail.length;
        ctx.strokeStyle = "rgba(255,255,255," + (tt * 0.5).toFixed(2) + ")";
        ctx.lineWidth = 1 + tt * 6;
        ctx.beginPath();
        ctx.moveTo(S.trail[i - 1].x - S.dist + BX, S.trail[i - 1].y); ctx.lineTo(S.trail[i].x - S.dist + BX, S.trail[i].y);
        ctx.stroke();
      }
    }
    var sh = clamp(1 - (GY - S.y) / 400, 0.3, 1);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(BX, feet + 3, 12 * sh, 3.4 * sh, 0, 0, Math.PI * 2); ctx.fill();
    if (S.phase === "intro") drawBall(BX, feet - 9, -0.5);
    else if (S.safe <= 0 || Math.sin(now * 40) > 0) {
      var fall = S.phase === "play" ? clamp(S.vy / 640, 0, 1) * 0.14 : 0;   // flat on the tap, long on the way down
      ctx.save();
      ctx.translate(BX, S.y); ctx.scale(1 + S.sq * 0.28 - fall * 0.5, 1 - S.sq * 0.24 + fall);
      drawBall(0, 0, S.phase === "over" ? S.spin : S.spin + clamp(S.vy / 700, -0.6, 0.9));
      ctx.restore();
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
      if (pt.kind === "fw") {
        ctx.fillStyle = pt.col; ctx.globalAlpha = clamp(fade * 1.6, 0, 1);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, Math.max(0.1, pt.size * (0.6 + fade * 0.6)), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (pt.kind === "dust" || pt.kind === "puff") {
        ctx.fillStyle = "rgba(255,252,235," + (fade * 0.8).toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1.4 - fade * 0.4), 0, Math.PI * 2); ctx.fill();
      } else if (pt.life < pt.pop) {
        ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot + pt.life * 12);
        kernel(pt.size / 6.5);
        ctx.restore();
      } else {
        ctx.globalAlpha = clamp(fade * 3, 0, 1);
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
      ctx.strokeText(fo.text, VW / 2, 136 + 42 * i);
      ctx.fillStyle = fo.color;
      ctx.fillText(fo.text, VW / 2, 136 + 42 * i);
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
      sign(["Hang Time", up ? "Your average is up from yesterday." : ptype ? "You are " + TYPES[ptype][0] + "." : "Keep the punt in the air.", best > 0 ? "Best " + best.toFixed(2) + "  ·  Tap to punt" : "Tap to punt"], 190, "gold");
      return;
    }
    hud();
    if (S.phase === "over") {
      var lines = [(S.newBest ? "New best: " : "Hang time ") + S.t.toFixed(2), S.cause + "  ·  " + rank(S.t)];
      lines.push(S.kind);
      if (S.typeLine) lines.push(S.typeLine);
      if (S.unlocked) lines.push("New ball: " + S.unlocked);
      lines.push("Tap to punt again");
      sign(lines, S.slot.spins.length ? 225 : 240, S.newBest ? "gold" : "dark", S.wait);
      slotPanel();
    }
  }

  var last = 0;
  function frame(ts) {
    var dt = Math.min(0.034, (ts - last) / 1000 || 0);
    last = ts;
    requestAnimationFrame(frame);                         // asked for first, so one bad frame can never stop the game
    update(dt);
    draw();
  }

  // For testing only: open the page with #cctest to let a script read the game and tap.
  if (/cctest/.test(location.hash)) {
    window.__cc = { state: function () { return S; }, tap: tap, ballX: function () { return BX; },
                    dream: function () { S.dreamAt = S.t + 0.3; } };
  }

  window.addEventListener("resize", resize);
  reset();
  resize();
  soundLabel();
  board();
  buildBalls();
  drawMandala();
  requestAnimationFrame(frame);
})();
