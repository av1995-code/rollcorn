// Coffin CORNer: keep the punt in the air.
// Tap to punt, then keep tapping to stay up. Thread the gaps between the corn
// and the storm clouds, stay away from the returners who jump for the ball,
// and pick up kernels on the way. Hang time is the score.
(function () {
  var canvas = document.getElementById("cc-field");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var btn = document.getElementById("cc-go");
  var statusEl = document.getElementById("cc-status");
  var scoreEl = document.getElementById("cc-score");
  var bestEl = document.getElementById("cc-best");
  var kernEl = document.getElementById("cc-kernels");
  var ballsEl = document.getElementById("cc-balls");
  var soundBtn = document.getElementById("cc-sound");
  var shareBtn = document.getElementById("cc-share");
  var goalsEl = document.getElementById("cc-goals");
  var daysEl = document.getElementById("cc-days");

  var GOLD = "#FFCD00", INK = "#000", TURF = "#3FA34D", TURF_DARK = "#2F8F41", HUSK = "#22753A", RED = "#D7261E";
  var DISPLAY = '"Antonio", "Roboto Condensed", "Arial Narrow", sans-serif';
  var LABEL = '"Roboto Condensed", "Arial Narrow", sans-serif';
  var RANKS = [[0, "Shanked it"], [5, "Scout team"], [15, "Special teams captain"],
               [30, "All-conference leg"], [60, "Punting is winning"]];
  var BALLS = [
    { id: "football", name: "Football", need: 0 },
    { id: "popcorn", name: "Popcorn ball", need: 30 },
    { id: "cob", name: "Corn cob", need: 100 },
    { id: "gold", name: "Gold ball", need: 250 },
    { id: "pig", name: "Pigskin", need: 500 }
  ];

  // Goals: each has a ladder of targets; beating one pays kernels and moves to the next.
  var GOALS = [
    { id: "hang", steps: [10, 20, 30, 45, 60, 90, 120], text: function (n) { return "Hang for " + n + " seconds"; }, val: function () { return S.t; } },
    { id: "kern", steps: [8, 15, 25, 40, 60], text: function (n) { return "Pick up " + n + " kernels in one punt"; }, val: function () { return S.got; } },
    { id: "gate", steps: [1, 2, 3, 5, 8], text: function (n) { return "Clear " + n + " Coffin CORNer gate" + (n > 1 ? "s" : "") + " in one punt"; }, val: function () { return S.gates; } },
    { id: "close", steps: [1, 3, 5, 8], text: function (n) { return n + " close call" + (n > 1 ? "s" : "") + " in one punt"; }, val: function () { return S.close; } }
  ];

  // Everything is drawn on a field 480 units tall; the width follows the screen.
  var VH = 480, GY = 408, TURF_H = 62, R = 10, YARD = 12;
  var GRAV = 1350, TAP = -430, PUNT = -640;
  var W = 960, H = 480, U = 1, VW = 960, BX = 270;

  function load(key) { try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; } }
  function loadText(key) { try { return localStorage.getItem(key) || ""; } catch (e) { return ""; } }
  function save(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }
  var best = load("rollcorn-hang-best");
  var bank = load("rollcorn-hang-kernels");            // kernels picked up over every game
  var ballId = loadText("rollcorn-hang-ball") || "football";
  var muted = load("rollcorn-coffin-muted") === 1;
  var letters = load("rollcorn-hang-letters");         // how much of C-O-R-N is collected; it carries over between punts
  var dayStreak = load("rollcorn-hang-days");          // days in a row with at least one punt

  var S = null;                                         // the current run
  var now = 0, shake = 0, tod = 0, flash = 0;
  var particles = [], floaters = [], clouds = [], stars = [];
  for (var c = 0; c < 6; c++) clouds.push({ x: Math.random() * 1400, y: 30 + Math.random() * 150, s: 0.6 + Math.random() * 0.7 });
  for (var st = 0; st < 60; st++) stars.push({ x: Math.random(), y: Math.random() * 0.7, r: 0.6 + Math.random() * 1.2, p: Math.random() * 6 });

  function reset() {
    S = { phase: "intro", t: 0, y: GY - 30, vy: 0, dist: 0, speed: 0, spin: 0,
          obs: [], kernels: [], crows: [], trail: [], nextX: 0, lastC: 220, count: 0,
          got: 0, wait: 0, crowAt: 20, mark: 10, newBest: false, unlocked: "", cause: "",
          pows: [], shield: false, safe: 0, magnet: 0, combo: 0, gates: 0, close: 0, goalsDone: [],
          frenzy: 0, kwave: 0, marks: [] };
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
  function buzz(ms) { try { if (!muted && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  var sfx = {
    kick: function () { tone(170, 0.22, "sine", 0.35, 45); thud(0.35); buzz(20); },
    tap: function () { tone(300, 0.09, "sine", 0.1, 520); },
    pass: function () { tone(740, 0.06, "square", 0.04); },
    kernel: function (n) { var f = 900 + 70 * Math.min(n || 0, 12); tone(f, 0.1, "triangle", 0.1); tone(f * 1.34, 0.1, "triangle", 0.08, 0, 0.05); },
    power: function () { [660, 880, 1320].forEach(function (f, i) { tone(f, 0.14, "square", 0.07, 0, i * 0.06); }); },
    saved: function () { tone(220, 0.25, "square", 0.1, 660); thud(0.4); buzz(60); },
    gate: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.2, "triangle", 0.16, 0, i * 0.07); }); buzz(40); },
    mark: function () { tone(523, 0.12, "triangle", 0.14); tone(784, 0.18, "triangle", 0.14, 0, 0.1); },
    hit: function () { tone(180, 0.35, "sawtooth", 0.14, 60); thud(0.5); buzz(120); },
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
    return { name: RANKS[at][1], next: RANKS[at + 1] || null };
  }

  // ---------- the run ----------

  function start() {
    reset();
    particles.length = 0; floaters.length = 0;
    S.phase = "play";
    S.vy = PUNT;
    S.speed = 210;
    S.nextX = BX + 520;
    // lines across the field to fly at: each rank, and where the best punt came down
    for (var i = 1; i < RANKS.length; i++) S.marks.push({ t: RANKS[i][0], label: RANKS[i][1] });
    if (best > 2) S.marks.push({ t: best, label: "Best " + best.toFixed(2), best: true });
    // first punt of the day: keep the streak going and collect a few kernels
    var d = new Date(), key = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    if (loadText("rollcorn-hang-day") !== key) {
      var y = new Date(d.getTime() - 864e5), yKey = y.getFullYear() + "-" + (y.getMonth() + 1) + "-" + y.getDate();
      dayStreak = loadText("rollcorn-hang-day") === yKey ? dayStreak + 1 : 1;
      var gift = Math.min(dayStreak, 7) * 5;
      bank += gift;
      save("rollcorn-hang-day", key); save("rollcorn-hang-days", dayStreak); save("rollcorn-hang-kernels", bank);
      floaters.push({ text: "DAY " + dayStreak + "  \u00B7  +" + gift + " KERNELS", x: VW / 2, y: 150, life: -0.5, color: GOLD, big: true });
    }
    shareBtn.hidden = true;
    sfx.kick();
    dust(BX - 4, GY - 4, 10);
    label("Tap!");
    say("The punt is up. Keep tapping to keep it in the air.");
    board();
  }

  // where the field has scrolled to after t seconds in the air
  function distAt(t) {
    var cap = 150 / 3.2;
    return t <= cap ? 210 * t + 1.6 * t * t : 210 * cap + 1.6 * cap * cap + 360 * (t - cap);
  }

  // all four letters: a few seconds with nothing in the way and kernels everywhere
  function frenzy() {
    S.frenzy = 6;
    S.obs = S.obs.filter(function (o) { return o.x - S.dist < BX; });
    S.pows = []; S.crows = [];
    S.crowAt = Math.max(S.crowAt, S.t + 9);
    S.nextX = Math.max(S.nextX, S.dist + VW + S.speed * 6 + 150);
    S.lastC = 220;
    shake = 8; flash = 0.7;
    sfx.gate();
    burst(BX, S.y, 40);
    floaters.push({ text: "POPCORN FRENZY!", x: VW / 2, y: 170, life: 0, color: GOLD, big: true });
  }

  function tap() {
    audio();
    if (S.phase === "intro" || (S.phase === "over" && S.wait > 0.3)) { start(); return; }
    if (S.phase !== "play") return;
    S.vy = TAP;
    sfx.tap();
    for (var i = 0; i < 3; i++) {
      particles.push({ kind: "puff", x: BX - 6, y: S.y + 8, vx: -60 - Math.random() * 60, vy: 40 + Math.random() * 50,
                       life: 0, max: 0.3 + Math.random() * 0.2, size: 3 + Math.random() * 3 });
    }
  }

  function spawn() {
    var t = S.t, n = ++S.count, x = S.nextX, step = Math.max(255, 335 - t * 1.6);
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
      S.kernels.push({ x: x + o.w / 2, y: cy, got: false, ph: Math.random() * 6 });
    }
    if (n % 5 === 3) S.pows.push({ x: x - step / 2, y: (S.lastC + cy) / 2, kind: "letter", ph: Math.random() * 6 });
    else if (n % 7 === 4) S.pows.push({ x: x - step / 2, y: (S.lastC + cy) / 2, kind: n % 14 === 4 ? "helmet" : "magnet", ph: Math.random() * 6 });
    else S.kernels.push({ x: x - step / 2, y: (S.lastC + cy) / 2, got: false, ph: Math.random() * 6 });
    S.obs.push(o);
    S.lastC = cy;
    S.nextX += step;
  }

  function hitRect(cx, cy, r, x, y, w, h) {
    var nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h);
    return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < r * r;
  }

  function die(cause) {
    S.phase = "dead";
    S.cause = cause;
    S.wait = 0;
    if (S.vy < 0) S.vy = 0;
    shake = 12; flash = 1;
    sfx.hit();
    burst(BX, S.y, 10);
    label("Down", true);
  }

  function finish() {
    S.phase = "over";
    S.wait = 0;
    var before = bank;
    bank += S.got;
    save("rollcorn-hang-kernels", bank);
    if (S.t > best) { best = S.t; S.newBest = true; save("rollcorn-hang-best", best.toFixed(2)); }
    GOALS.forEach(function (g) {
      var lvl = load("rollcorn-hang-goal-" + g.id);
      if (lvl < g.steps.length && g.val() >= g.steps[lvl]) {
        var pay = 10 * (lvl + 1);
        S.goalsDone.push(g.text(g.steps[lvl]) + "  +" + pay);
        bank += pay;
        save("rollcorn-hang-goal-" + g.id, lvl + 1);
      }
    });
    save("rollcorn-hang-kernels", bank);
    for (var i = 0; i < BALLS.length; i++) if (before < BALLS[i].need && bank >= BALLS[i].need) S.unlocked = BALLS[i].name;
    if (S.newBest || S.unlocked || S.goalsDone.length) { sfx.gate(); burst(VW / 2, GY - 30, 50); } else sfx.over();
    label("Punt again");
    shareBtn.hidden = false;
    say((S.cause ? S.cause + ". " : "") + "Hang time " + S.t.toFixed(2) + " seconds. " + rank(S.t).name + ". " +
        "Kernels " + S.got + ". Best " + best.toFixed(2) + "." +
        (S.goalsDone.length ? " Goal done: " + S.goalsDone.join("; ") + "." : "") + (S.unlocked ? " New ball: " + S.unlocked + "." : ""));
    board();
    buildBalls();
    buildGoals();
  }

  // ---------- page controls ----------

  function label(text, off) { btn.textContent = text; btn.disabled = !!off; }
  function say(text) { statusEl.textContent = text; }
  function board() {
    scoreEl.textContent = S.t.toFixed(2);
    bestEl.textContent = best.toFixed(2);
    daysEl.textContent = dayStreak;
    kernEl.textContent = (bank + (S.phase === "over" ? 0 : S.got)).toLocaleString("en-US");
  }
  function buildBalls() {
    ballsEl.textContent = "";
    BALLS.forEach(function (b) {
      var el = document.createElement("button"), open = bank >= b.need;
      el.type = "button";
      el.className = "cc-mini cc-ball";
      el.disabled = !open;
      el.textContent = open ? b.name : b.name + " · " + b.need + " kernels";
      el.setAttribute("aria-pressed", ballId === b.id ? "true" : "false");
      el.addEventListener("click", function () { ballId = b.id; save("rollcorn-hang-ball", ballId); buildBalls(); });
      ballsEl.appendChild(el);
    });
  }

  function buildGoals() {
    goalsEl.textContent = "";
    GOALS.forEach(function (g) {
      var lvl = load("rollcorn-hang-goal-" + g.id), li = document.createElement("li");
      li.textContent = lvl < g.steps.length ? g.text(g.steps[lvl]) + ": " + 10 * (lvl + 1) + " kernels" : g.text(g.steps[g.steps.length - 1]) + ": done";
      goalsEl.appendChild(li);
    });
  }

  canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); tap(); });
  btn.addEventListener("click", tap);
  document.addEventListener("keydown", function (e) {
    if (e.key !== " " && e.key !== "Enter" && e.key !== "ArrowUp") return;
    var t = e.target && e.target.tagName;
    if (t === "A" || t === "INPUT" || t === "TEXTAREA" || (t === "BUTTON" && e.key !== "ArrowUp")) return;
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
    var url = "https://rollcorn.com/coffin-corner.html";
    var text = "I kept a punt in the air for " + S.t.toFixed(2) + " seconds on Coffin CORNer. Beat it:";
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
    tod = lerp(tod, clamp(S.t / 22, 0, 2), Math.min(1, dt * 0.8));
    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j];
      p.life += dt;
      p.vy += (p.kind === "kernel" ? 520 : p.kind === "dust" ? 120 : 0) * dt;
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

    if (S.phase === "over") { S.wait += dt; return; }
    if (S.phase === "intro") return;

    if (S.phase === "dead") {
      S.wait += dt;
      S.speed *= Math.max(0, 1 - dt * 5);
      S.dist += S.speed * dt;
      if (S.y < GY - 6) {
        S.vy = Math.min(S.vy + GRAV * dt, 700); S.y += S.vy * dt; S.spin += dt * 14;
        if (S.y >= GY - 6) { S.y = GY - 6; thud(0.3); dust(BX, GY, 12); S.wait = 0.2; }
      } else if (S.wait > 0.45) finish();
      return;
    }

    // in the air
    S.t += dt;
    S.safe = Math.max(0, S.safe - dt);
    S.magnet = Math.max(0, S.magnet - dt);
    if (S.frenzy > 0) {
      S.frenzy -= dt;
      S.safe = Math.max(S.safe, 0.4);
      S.kwave -= S.speed * dt;
      if (S.kwave <= 0) { S.kwave = 44; S.kernels.push({ x: S.dist + VW + 30, y: 205 + Math.sin(S.t * 3.2) * 115, got: false, ph: 0 }); }
    }
    S.speed = 210 + Math.min(150, S.t * 3.2);
    S.dist += S.speed * dt;
    S.vy = Math.min(S.vy + GRAV * dt, 640);
    S.y += S.vy * dt;
    S.spin += dt * 9;
    if (S.y < R + 2) { S.y = R + 2; S.vy = Math.max(S.vy, 0); }
    S.trail.push({ x: S.dist, y: S.y });
    if (S.trail.length > 14) S.trail.shift();
    scoreEl.textContent = S.t.toFixed(2);

    if (S.nextX - S.dist < VW + 120) spawn();
    var bx = S.dist + BX, by = S.y, hit = "";

    for (var i = S.obs.length - 1; i >= 0; i--) {
      var o = S.obs[i];
      if (o.x + o.w - S.dist < -120) { S.obs.splice(i, 1); continue; }
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
      if (bx > o.x - R && bx < o.x + o.w + R) {         // how close did it come to the edges on the way through
        var room = Math.min(by - o.top, (o.kind === "jump" ? GY - o.jy - 74 : o.bot) - by) - R;
        o.near = Math.min(o.near === undefined ? 99 : o.near, room);
      }
      if (!o.passed && bx > o.x + o.w + R) {
        o.passed = true;
        if (o.kind === "gate") {
          S.got += 5; S.gates += 1;
          sfx.gate(); shake = 6;
          burst(BX, S.y, 26);
          floaters.push({ text: "COFFIN CORNer  +5", x: BX + 40, y: S.y - 30, life: 0, color: GOLD, big: true });
        } else if (o.near !== undefined && o.near < 11) {
          S.got += 1; S.close += 1;
          sfx.power();
          floaters.push({ text: "CLOSE CALL  +1", x: BX + 30, y: S.y - 26, life: 0, color: "#fff" });
        } else sfx.pass();
        kernEl.textContent = (bank + S.got).toLocaleString("en-US");
      }
    }
    for (var q = S.kernels.length - 1; q >= 0; q--) {
      var kn = S.kernels[q];
      if (kn.x - S.dist < -40) { if (!kn.got) S.combo = 0; S.kernels.splice(q, 1); continue; }
      if (kn.got) continue;
      var kd = Math.sqrt((kn.x - bx) * (kn.x - bx) + (kn.y - by) * (kn.y - by));
      if (S.magnet > 0 && kd < 190) { kn.x += (bx - kn.x) * Math.min(1, dt * 7); kn.y += (by - kn.y) * Math.min(1, dt * 7); }
      if (kd < 24) {
        kn.got = true; S.got += 1; S.combo += 1;
        sfx.kernel(S.combo);
        burst(BX, kn.y, 5);
        kernEl.textContent = (bank + S.got).toLocaleString("en-US");
      }
    }
    for (var pw = S.pows.length - 1; pw >= 0; pw--) {
      var po = S.pows[pw];
      if (po.x - S.dist < -40) { S.pows.splice(pw, 1); continue; }
      if ((po.x - bx) * (po.x - bx) + (po.y - by) * (po.y - by) < 28 * 28) {
        S.pows.splice(pw, 1);
        sfx.power();
        if (po.kind === "letter") {
          letters += 1;
          if (letters >= 4) { letters = 0; frenzy(); }
          else floaters.push({ text: "CORN".slice(0, letters), x: BX + 40, y: S.y - 30, life: 0, color: GOLD, big: true });
          save("rollcorn-hang-letters", letters);
        } else {
          if (po.kind === "helmet") S.shield = true; else S.magnet = 7;
          floaters.push({ text: po.kind === "helmet" ? "HELMET ON" : "KERNEL MAGNET", x: BX + 40, y: S.y - 30, life: 0, color: GOLD, big: true });
        }
      }
    }
    if (S.t > S.crowAt) {                               // later on, crows come the other way
      S.crowAt = S.t + 3.5 + Math.random() * 3.5;
      S.crows.push({ x: S.dist + VW + 320, y: 70 + Math.random() * (GY - 200), ph: Math.random() * 6 });
    }
    for (var w = S.crows.length - 1; w >= 0; w--) {
      var cr = S.crows[w];
      cr.x -= 140 * dt;
      cr.y += Math.sin(now * 3 + cr.ph) * 14 * dt;
      if (cr.x - S.dist < -60) { S.crows.splice(w, 1); continue; }
      if ((cr.x - bx) * (cr.x - bx) + (cr.y - by) * (cr.y - by) < 20 * 20) hit = "Hit a crow";
    }
    if (S.t >= S.mark) {
      if (S.mark !== 30 && S.mark !== 60) {
        floaters.push({ text: S.mark + " SECONDS", x: VW / 2, y: 150, life: 0, color: "#fff", big: true });
        sfx.mark();
      }
      S.mark += 10;
    }
    for (var mk = 0; mk < S.marks.length; mk++) {
      var m = S.marks[mk];
      if (m.done || S.t < m.t) continue;
      m.done = true;
      if (m.best) { sfx.gate(); burst(BX, S.y, 30); shake = 6; floaters.push({ text: "NEW BEST!", x: VW / 2, y: 150, life: 0, color: GOLD, big: true }); }
      else { sfx.mark(); floaters.push({ text: m.label.toUpperCase(), x: VW / 2, y: 150, life: 0, color: "#fff", big: true }); }
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
      floaters.push({ text: "SAVED BY THE HELMET", x: BX + 60, y: S.y - 30, life: 0, color: "#fff", big: true });
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
      ctx.fillStyle = ballId === "gold" ? GOLD : "#8B4A1E";
      ctx.beginPath();
      ctx.moveTo(-12, 0); ctx.quadraticCurveTo(0, -10.5, 12, 0); ctx.quadraticCurveTo(0, 10.5, -12, 0);
      ctx.fill(); ctx.stroke();
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

  function puffCloud(x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(x, y, 34 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 16 * s, y - 7 * s, 16 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 10 * s, y - 10 * s, 20 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // the sky runs from afternoon to sunset to night the longer the punt stays up
  function sky() {
    var a = clamp(tod, 0, 1), b = clamp(tod - 1, 0, 1);
    var g = ctx.createLinearGradient(0, 0, 0, VH * 0.92);
    g.addColorStop(0, mix(mix("#4FA3DE", "#35479A", a), "#060A22", b));
    g.addColorStop(0.62, mix(mix("#BFE4F6", "#F0895C", a), "#17224F", b));
    g.addColorStop(1, mix(mix("#FFE7A0", "#FFD27A", a), "#3B3F78", b));
    ctx.fillStyle = g; ctx.fillRect(-20, -20, VW + 40, VH + 40);
    if (b > 0) {
      ctx.fillStyle = "#fff";
      for (var i = 0; i < stars.length; i++) {
        ctx.globalAlpha = b * (0.5 + 0.5 * Math.sin(now * 2 + stars[i].p));
        ctx.beginPath(); ctx.arc(stars[i].x * VW, stars[i].y * VH, stars[i].r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = b;
      ctx.fillStyle = "#F4F1DE";
      ctx.beginPath(); ctx.arc(VW * 0.8, 90, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mix("#35479A", "#060A22", b);
      ctx.beginPath(); ctx.arc(VW * 0.8 + 9, 85, 17, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (tod < 1.3) {
      var sx = VW * 0.72, sy = lerp(250, 400, clamp(tod, 0, 1.2));
      var glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 150);
      glow.addColorStop(0, a > 0.5 ? "rgba(255,190,110,.95)" : "rgba(255,240,170,.95)"); glow.addColorStop(1, "rgba(255,220,150,0)");
      ctx.fillStyle = glow; ctx.fillRect(sx - 160, sy - 160, 320, 320);
      ctx.fillStyle = mix("#FFF3B0", "#FF9D5C", a);
      ctx.beginPath(); ctx.arc(sx, sy, 24, 0, Math.PI * 2); ctx.fill();
    }
    var cc = mix(mix("#FFFFFF", "#FFD0B0", a), "#3A4270", b);
    for (var c = 0; c < clouds.length; c++) puffCloud(clouds[c].x, clouds[c].y, clouds[c].s, cc);

    // far hills, with a barn and silo going by now and then
    var off = S.dist * 0.12;
    ctx.fillStyle = mix(mix("#8CC27A", "#5E8F5A", a), "#1C3329", b);
    ctx.beginPath(); ctx.moveTo(-20, GY + 10);
    for (var hx = -20; hx <= VW + 20; hx += 20) ctx.lineTo(hx, GY - 30 - 14 * Math.sin((hx + off) * 0.006 + 1) - 7 * Math.sin((hx + off) * 0.021));
    ctx.lineTo(VW + 20, GY + 10); ctx.fill();
    var bx = ((520 - S.dist * 0.2) % 1300 + 1300) % 1300 - 120, by = GY - 16, u = 1.6;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.fillStyle = "#D9D5C7";
    rr(bx + 30 * u, by - 34 * u, 10 * u, 34 * u, 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx + 35 * u, by - 34 * u, 5 * u, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#B3261E";
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx, by - 16 * u); ctx.lineTo(bx + 5 * u, by - 24 * u); ctx.lineTo(bx + 13 * u, by - 28 * u);
    ctx.lineTo(bx + 21 * u, by - 24 * u); ctx.lineTo(bx + 26 * u, by - 16 * u); ctx.lineTo(bx + 26 * u, by); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = b > 0.5 ? "#FFE680" : "#fff";
    ctx.fillRect(bx + 9 * u, by - 11 * u, 8 * u, 11 * u); ctx.strokeRect(bx + 9 * u, by - 11 * u, 8 * u, 11 * u);
  }

  function field() {
    // the cornfield along the far sideline
    var off = S.dist * 0.6;
    ctx.fillStyle = HUSK;
    ctx.beginPath(); ctx.moveTo(-20, GY + 1);
    for (var zi = Math.floor(off / 7), zx = -(off % 7) - 14; zx <= VW + 20; zx += 7, zi++) ctx.lineTo(zx, GY - 22 + (zi % 2 ? 0 : 6));
    ctx.lineTo(VW + 20, GY + 1); ctx.fill();
    ctx.fillStyle = GOLD;
    for (var gi = Math.floor(off / 17), gx = -(off % 17); gx < VW + 20; gx += 17, gi++) {
      ctx.beginPath(); ctx.ellipse(gx, GY - 10 + (gi % 3) * 2, 1.6, 3.4, 0.3, 0, Math.PI * 2); ctx.fill();
    }

    // the field scrolls by: mown stripes, yard lines, numbers, and the end zone the punt left from
    var goal = BX - 40, five = YARD * 5;
    var first = Math.floor((S.dist - goal) / five) - 1;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var k = first; goal + k * five - S.dist < VW + five; k++) {
      var x = goal + k * five - S.dist;
      ctx.fillStyle = k < -3 ? "#6B4F35" : k < 0 ? "#111" : k % 2 ? TURF : TURF_DARK;
      ctx.fillRect(x - 0.5, GY, five + 1, TURF_H + 20);
      if (k < 0) continue;
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.fillRect(x - 1, GY, 2, TURF_H);
      var yd = (k * 5) % 100;
      if (k > 0 && yd === 0) {
        ctx.fillStyle = GOLD; ctx.font = "700 15px " + DISPLAY;
        ctx.fillText("ROLL CORN", x, GY + TURF_H * 0.76);
      } else if (k % 2 === 0 && k > 0) {
        ctx.font = "700 19px " + DISPLAY;
        ctx.fillText(String(yd <= 50 ? yd : 100 - yd), x - 16, GY + TURF_H * 0.76);
      }
    }
    var ez = goal - S.dist;
    if (ez > -20) {
      ctx.fillStyle = GOLD; ctx.font = "700 24px " + DISPLAY;
      ctx.fillText("ROLL", ez - five * 1.5, GY + TURF_H * 0.3, five * 3 - 24);
      ctx.fillText("CORN", ez - five * 1.5, GY + TURF_H * 0.72, five * 3 - 24);
      ctx.fillStyle = "#fff"; ctx.fillRect(ez - 2.5, GY, 5, TURF_H);
      cornEar(ez, GY + TURF_H * 0.5 + 2, 24);
    }
    var shade = ctx.createLinearGradient(0, GY, 0, GY + TURF_H);
    shade.addColorStop(0, "rgba(0,0,0,.16)"); shade.addColorStop(0.35, "rgba(0,0,0,0)"); shade.addColorStop(1, "rgba(255,255,255,.08)");
    ctx.fillStyle = shade; ctx.fillRect(-20, GY, VW + 40, TURF_H);
    ctx.fillStyle = "#fff";
    ctx.fillRect(-20, GY, VW + 40, 2.5);
    ctx.fillRect(-20, GY + TURF_H - 3, VW + 40, 3);
  }

  function storm(x, w, top) {
    var dark = "#3F4756";
    ctx.fillStyle = dark; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 6, -30); ctx.lineTo(x - 6, top - 22);
    ctx.arc(x + 4, top - 16, 16, Math.PI, Math.PI * 0.5, true);
    ctx.arc(x + w / 2, top - 20, 20, Math.PI * 0.75, Math.PI * 0.25, true);
    ctx.arc(x + w - 4, top - 16, 16, Math.PI * 0.5, 0, true);
    ctx.lineTo(x + w + 6, -30); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.10)";
    ctx.fillRect(x, -30, 8, top + 4);
    if (top > 60) {
      var on = Math.sin(now * 5 + x) > 0.2;
      ctx.fillStyle = on ? GOLD : "#8B8050"; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
      var lx = x + w / 2, ly = top - 52;
      ctx.beginPath();
      ctx.moveTo(lx + 3, ly); ctx.lineTo(lx - 7, ly + 16); ctx.lineTo(lx - 1, ly + 16); ctx.lineTo(lx - 5, ly + 30);
      ctx.lineTo(lx + 8, ly + 11); ctx.lineTo(lx + 2, ly + 11); ctx.lineTo(lx + 8, ly); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }

  function cornWall(x, w, bot) {
    ctx.fillStyle = HUSK; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, GY + 30); ctx.lineTo(x, bot + 12);
    for (var i = 0; i <= 4; i++) { ctx.lineTo(x + (i + 0.5) * w / 5 - w / 10, bot + (i % 2 ? 10 : 0)); }
    ctx.lineTo(x + w, bot + 12); ctx.lineTo(x + w, GY + 30); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#3FA34D"; ctx.lineWidth = 3; ctx.lineCap = "round";
    for (var sx = x + 11; sx < x + w - 4; sx += 21) {
      ctx.beginPath(); ctx.moveTo(sx, GY + 28); ctx.lineTo(sx, bot + 16); ctx.stroke();
      for (var ly = bot + 34, s = 0; ly < GY + 10; ly += 30, s++) {
        var dir = s % 2 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(sx, ly); ctx.quadraticCurveTo(sx + dir * 8, ly - 10, sx + dir * 12, ly + 2); ctx.stroke();
      }
    }
    for (var ey = bot + 50, e = 0; ey < GY + 6; ey += 46, e++) cornEar(x + (e % 2 ? w * 0.7 : w * 0.3), ey, 20);
  }

  function gate(o, x) {
    ctx.fillStyle = "rgba(255,225,90," + (0.25 + 0.12 * Math.sin(now * 6)).toFixed(2) + ")";
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

  function hud() {
    var cw = Math.min(210, VW * 0.42), cx = VW / 2 - cw / 2, hot = S.newBest || (best > 0 && S.t > best);
    ctx.fillStyle = hot ? "#111" : "rgba(255,255,255,.92)"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    rr(cx, 8, cw, 70, 8); ctx.fill(); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = hot ? GOLD : INK;
    ctx.font = "700 12px " + LABEL;
    ctx.fillText(hot ? "HANG TIME  ·  NEW BEST" : "HANG TIME", VW / 2, 13);
    ctx.font = "700 44px " + DISPLAY;
    ctx.fillText(S.t.toFixed(2), VW / 2, 24);

    ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.lineWidth = 2;
    rr(8, 8, 74, 34, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = GOLD; ctx.lineWidth = 1.6;
    rr(16, 15, 11, 19, 5.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = "700 20px " + DISPLAY;
    ctx.fillText(String(S.got), 34, 26);
    if (best > 0) {
      ctx.textAlign = "right"; ctx.font = "700 14px " + LABEL;
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineJoin = "round";
      ctx.strokeText("BEST " + best.toFixed(2), VW - 12, 24);
      ctx.fillText("BEST " + best.toFixed(2), VW - 12, 24);
    }
    var pills = [];
    if (S.shield) pills.push("HELMET");
    if (S.magnet > 0) pills.push("MAGNET " + Math.ceil(S.magnet));
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "700 13px " + LABEL;
    for (var pi = 0; pi < pills.length; pi++) {
      var pwid = ctx.measureText(pills[pi]).width + 16;
      ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      rr(8, 48 + pi * 28, pwid, 22, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillText(pills[pi], 16, 60 + pi * 28);
    }
    // C-O-R-N: the letters collected so far
    ctx.font = "700 17px " + DISPLAY; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var li = 0; li < 4; li++) {
      var lx = VW - 96 + li * 24, have = li < letters || S.frenzy > 0;
      ctx.fillStyle = have ? GOLD : "rgba(255,255,255,.55)"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      rr(lx - 10, 40, 20, 24, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = have ? INK : "rgba(0,0,0,.4)";
      ctx.fillText("CORN".charAt(li), lx, 53);
    }
  }

  function draw() {
    ctx.save();
    if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    sky();
    field();
    var i, x;

    for (i = 0; i < S.marks.length; i++) {              // the lines to fly at
      var mk = S.marks[i], mx = distAt(mk.t) + BX - S.dist;
      if (mk.done || mx > VW + 80) continue;
      ctx.strokeStyle = mk.best ? GOLD : "rgba(255,255,255,.9)"; ctx.lineWidth = 4; ctx.setLineDash([10, 9]);
      ctx.beginPath(); ctx.moveTo(mx, 92); ctx.lineTo(mx, GY + TURF_H); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "700 14px " + LABEL; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var mw = ctx.measureText(mk.label.toUpperCase()).width + 18;
      ctx.fillStyle = mk.best ? GOLD : "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      rr(mx - mw / 2, 92, mw, 24, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillText(mk.label.toUpperCase(), mx, 105);
    }
    for (i = 0; i < S.obs.length; i++) {
      var o = S.obs[i];
      x = o.x - S.dist;
      if (o.kind === "gate") gate(o, x);
      else {
        storm(x, o.w, o.top);
        if (o.kind === "gap") cornWall(x, o.w, o.bot);
        else player(x + o.w / 2, GY - o.jy + (o.jy > 0 ? 0 : TURF_H * 0.5), kit(AWAY, { up: o.st === 1, air: o.jy > 0 }));
      }
    }
    for (i = 0; i < S.kernels.length; i++) {
      var kn = S.kernels[i];
      if (kn.got) continue;
      var kx = kn.x - S.dist, ky = kn.y + Math.sin(now * 3 + kn.ph) * 3;
      var halo = ctx.createRadialGradient(kx, ky, 2, kx, ky, 20);
      halo.addColorStop(0, "rgba(255,240,150,.9)"); halo.addColorStop(1, "rgba(255,240,150,0)");
      ctx.fillStyle = halo; ctx.fillRect(kx - 22, ky - 22, 44, 44);
      ctx.save(); ctx.translate(kx, ky); ctx.rotate(Math.sin(now * 2 + kn.ph) * 0.3);
      ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
      rr(-5, -7.5, 10, 15, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.7)"; rr(-2.6, -5, 2.4, 5, 1.2); ctx.fill();
      ctx.restore();
    }
    for (i = 0; i < S.pows.length; i++) {
      var po = S.pows[i], qx = po.x - S.dist, qy = po.y + Math.sin(now * 3 + po.ph) * 4;
      var aura = ctx.createRadialGradient(qx, qy, 4, qx, qy, 34);
      aura.addColorStop(0, "rgba(255,255,255,.95)"); aura.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = aura; ctx.fillRect(qx - 36, qy - 36, 72, 72);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(qx, qy, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (po.kind === "letter") {
        ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(qx, qy, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.font = "700 22px " + DISPLAY; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("CORN".charAt(letters), qx, qy + 1.5);
      } else if (po.kind === "helmet") {
        ctx.fillStyle = GOLD; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(qx - 1, qy, 10, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(qx + 2, qy + 2); ctx.lineTo(qx + 1, qy + 8); ctx.lineTo(qx - 8, qy + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(qx + 8, qy + 1); ctx.lineTo(qx + 12, qy + 4); ctx.lineTo(qx + 11, qy + 8); ctx.lineTo(qx + 2, qy + 8); ctx.moveTo(qx + 12, qy + 5); ctx.lineTo(qx + 3, qy + 5); ctx.stroke();
      } else {
        ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.lineCap = "butt";
        ctx.beginPath(); ctx.arc(qx, qy - 1, 7.5, Math.PI, 0); ctx.lineTo(qx + 7.5, qy + 9); ctx.moveTo(qx - 7.5, qy - 1); ctx.lineTo(qx - 7.5, qy + 9); ctx.stroke();
        ctx.strokeStyle = RED; ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.arc(qx, qy - 1, 7.5, Math.PI, 0); ctx.lineTo(qx + 7.5, qy + 4); ctx.moveTo(qx - 7.5, qy - 1); ctx.lineTo(qx - 7.5, qy + 4); ctx.stroke();
        ctx.strokeStyle = "#E6E6E6";
        ctx.beginPath(); ctx.moveTo(qx + 7.5, qy + 4); ctx.lineTo(qx + 7.5, qy + 8); ctx.moveTo(qx - 7.5, qy + 4); ctx.lineTo(qx - 7.5, qy + 8); ctx.stroke();
      }
    }
    for (i = 0; i < S.crows.length; i++) {
      var cr = S.crows[i];
      x = cr.x - S.dist;
      if (x > VW + 10) {                                // warn before it shows up
        ctx.fillStyle = RED; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(VW - 8, cr.y); ctx.lineTo(VW - 26, cr.y - 12); ctx.lineTo(VW - 26, cr.y + 12); ctx.closePath();
        if (Math.sin(now * 14) > 0) { ctx.fill(); ctx.stroke(); }
      } else crow(x, cr.y);
    }

    // the punter, left behind once the ball is away
    var feet = GY + TURF_H * 0.5;
    var px = BX - 16 - S.dist;
    if (px > -40) player(px, feet, kit(HOME, { kick: S.phase !== "intro" && S.t < 0.5 }));

    // the ball, its trail and its shadow
    if (S.phase === "play" && S.trail.length > 1) {
      ctx.lineCap = "round";
      for (i = 1; i < S.trail.length; i++) {
        var tt = i / S.trail.length;
        ctx.strokeStyle = S.t > 30 ? "rgba(255,140,40," + (tt * 0.8).toFixed(2) + ")" : "rgba(255,255,255," + (tt * 0.7).toFixed(2) + ")";
        ctx.lineWidth = 1 + tt * 9;
        ctx.beginPath();
        ctx.moveTo(S.trail[i - 1].x - S.dist + BX, S.trail[i - 1].y); ctx.lineTo(S.trail[i].x - S.dist + BX, S.trail[i].y);
        ctx.stroke();
      }
    }
    var sh = clamp(1 - (GY - S.y) / 400, 0.3, 1);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(BX, feet + 3, 12 * sh, 3.4 * sh, 0, 0, Math.PI * 2); ctx.fill();
    if (S.phase === "intro") drawBall(BX, feet - 9, -0.5);
    else if (S.safe <= 0 || Math.sin(now * 40) > 0) drawBall(BX, S.y, S.phase === "over" ? 0.3 : S.spin + clamp(S.vy / 700, -0.6, 0.9));
    if (S.shield && S.phase === "play") {                // the helmet: a gold shell around the ball
      ctx.strokeStyle = INK; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(BX, S.y, 17, Math.PI * 0.85, Math.PI * 2.15); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(BX, S.y, 17, Math.PI * 0.85, Math.PI * 2.15); ctx.stroke();
    }
    if (S.magnet > 0 && S.phase === "play") {
      ctx.strokeStyle = "rgba(215,38,30," + (0.25 + 0.2 * Math.sin(now * 10)).toFixed(2) + ")"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(BX, S.y, 26 + 6 * Math.sin(now * 8), 0, Math.PI * 2); ctx.stroke();
    }

    // popcorn, dust and words
    for (i = 0; i < particles.length; i++) {
      var pt = particles[i], fade = 1 - pt.life / pt.max;
      if (pt.kind === "dust" || pt.kind === "puff") {
        ctx.fillStyle = "rgba(255,252,235," + (fade * 0.8).toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1.4 - fade * 0.4), 0, Math.PI * 2); ctx.fill();
      } else if (pt.life < pt.pop) {
        ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot + pt.life * 12);
        ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1;
        rr(-pt.size * 0.6, -pt.size, pt.size * 1.2, pt.size * 2, pt.size * 0.5); ctx.fill(); ctx.stroke();
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
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (i = 0; i < floaters.length; i++) {
      var fo = floaters[i], up = fo.life / 1.4;
      ctx.globalAlpha = clamp(2 - up * 2, 0, 1);
      ctx.font = "700 " + (fo.big ? Math.min(34, VW * 0.07) : 24) + "px " + DISPLAY;
      ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineJoin = "round";
      var fx = clamp(fo.x, 110, VW - 110);
      ctx.strokeText(fo.text, fx, fo.y - up * 50);
      ctx.fillStyle = fo.color;
      ctx.fillText(fo.text, fx, fo.y - up * 50);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // evening light over the whole scene
    var eve = clamp(tod, 0, 1) * (1 - clamp(tod - 1, 0, 1)), night = clamp(tod - 1, 0, 1);
    if (eve > 0.01) { ctx.fillStyle = "rgba(255,110,50," + (eve * 0.1).toFixed(3) + ")"; ctx.fillRect(0, 0, VW, VH); }
    if (night > 0.01) { ctx.fillStyle = "rgba(8,12,48," + (night * 0.28).toFixed(3) + ")"; ctx.fillRect(0, 0, VW, VH); }
    if (S.frenzy > 0) { ctx.fillStyle = "rgba(255,205,0," + (0.12 + 0.06 * Math.sin(now * 12)).toFixed(3) + ")"; ctx.fillRect(0, 0, VW, VH); }
    if (flash > 0.01) { ctx.fillStyle = "rgba(255,255,255," + (flash * 0.6).toFixed(2) + ")"; ctx.fillRect(0, 0, VW, VH); }

    if (S.phase === "intro") {
      sign(["Coffin CORNer", "Keep the punt in the air.", best > 0 ? "Best " + best.toFixed(2) + "  ·  Tap to punt" : "Tap to punt"], 190, "gold");
      return;
    }
    hud();
    if (S.phase === "over") {
      var rk = rank(S.t), lines = [(S.newBest ? "New best: " : "Hang time ") + S.t.toFixed(2), S.cause + "  ·  " + rk.name];
      if (rk.next) lines.push((rk.next[0] - S.t).toFixed(1) + " more seconds for " + rk.next[1]);
      lines.push("+" + S.got + " kernels  ·  Best " + best.toFixed(2));
      for (var gd = 0; gd < S.goalsDone.length; gd++) lines.push("Goal done: " + S.goalsDone[gd]);
      if (S.unlocked) lines.push("New ball: " + S.unlocked);
      lines.push("Tap to punt again");
      sign(lines, 240, S.newBest ? "gold" : "dark", S.wait);
    }
  }

  var last = 0;
  function frame(ts) {
    var dt = Math.min(0.034, (ts - last) / 1000 || 0);
    last = ts;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  reset();
  resize();
  soundLabel();
  board();
  buildBalls();
  buildGoals();
  requestAnimationFrame(frame);
})();
