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
    { id: "pig", name: "Pigskin", need: 500 },
    { id: "dog", name: "Corn dog", need: 1000 }
  ];

  // Kind words painted small on the grass, one every hundred yards. Easy to miss at speed,
  // but they are plain paint on the field: nothing here is hidden from the player.
  var CHEERS = ["You've got this", "Nice and easy", "Great hang", "Smooth", "Keep flying", "Good read",
                "Steady hands", "Beautiful", "That's the way", "Look at you go"];

  // Positive words that flash in the sky for two frames, too quick to read on purpose.
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
  var freeHelmet = false;                              // won on the slots: the next punt starts with a helmet

  var S = null;                                        // the current punt
  var now = 0, shake = 0, tod = 0, flash = 0;
  var particles = [], floaters = [], clouds = [], stars = [];
  for (var c = 0; c < 5; c++) clouds.push({ x: Math.random() * 1400, y: 30 + Math.random() * 150, s: 0.6 + Math.random() * 0.7 });
  for (var st = 0; st < 60; st++) stars.push({ x: Math.random(), y: Math.random() * 0.7, r: 0.6 + Math.random() * 1.2, p: Math.random() * 6 });

  function reset() {
    S = { phase: "intro", t: 0, y: GY - 30, vy: 0, dist: 0, speed: 0, spin: 0,
          obs: [], kernels: [], helmets: [], crows: [], trail: [], nextX: 0, lastC: 220, count: 0,
          got: 0, gates: 0, wait: 0, freeze: 0, crowAt: 20, shield: false, safe: 0,
          bestWas: best, passedBest: false, newBest: false, unlocked: "", cause: "",
          flash: 0, flashText: "", flashAt: 4, slot: { spins: [], t: 0, stage: -1 } };
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
    sfx.tap();
    particles.push({ kind: "puff", x: BX - 6, y: S.y + 8, vx: -80, vy: 60, life: 0, max: 0.3, size: 4 });
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
    S.freeze = 0.13;
    if (S.vy < 0) S.vy = 0;
    shake = 12; flash = 1;
    sfx.hit();
    burst(BX, S.y, 10);
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
        if (r < 0.65) { sp.pay = 5; sp.text = "PAIR  +5"; } else sp.text = "NO LUCK";
      }
      if (!sp.big) pot += 3;
      spins.push(sp);
    }
    return { spins: spins, t: 0, stage: -1 };
  }
  function slotEnd() { return S.slot.spins.length * SPIN; }

  function finish() {
    S.phase = "over";
    S.wait = 0;
    var before = earned;
    bank += S.got; earned += S.got;
    if (S.t > best) { best = S.t; S.newBest = true; save("rollcorn-hang-best", best.toFixed(2)); }
    pot += S.got;
    S.slot = rollSlots((S.t >= 5 ? 1 : 0) + Math.min(2, S.gates));
    S.slot.spins.forEach(function (sp) { bank += sp.pay; earned += sp.pay; if (sp.helmet) freeHelmet = true; });
    save("rollcorn-hang-kernels", bank); save("rollcorn-hang-earned", earned); save("rollcorn-hang-pot", pot);
    BALLS.forEach(function (b) { if (before < b.need && earned >= b.need) S.unlocked = b.name; });
    if (S.newBest || S.unlocked) { sfx.gate(); burst(VW / 2, GY - 30, 50); } else sfx.over();
    label("Punt again");
    shareBtn.hidden = false;
    say(S.cause + ". Hang time " + S.t.toFixed(2) + " seconds. " + rank(S.t) + ". Kernels " + S.got + ". Best " + best.toFixed(2) + "." +
        (S.unlocked ? " New ball: " + S.unlocked + "." : "") +
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
  }
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
    var text = "I kept a punt in the air for " + S.t.toFixed(2) + " seconds on Hang Time. Beat it:";
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

    if (S.freeze > 0) { S.freeze -= dt; return; }       // a beat of stillness on impact
    if (S.phase === "intro") return;
    if (S.phase === "over") {
      S.wait += dt;
      var sl = S.slot;
      if (sl.spins.length && sl.t < slotEnd()) {
        sl.t += dt;
        // a click as each reel stops, and a sound for the result
        var idx = Math.min(sl.spins.length - 1, Math.floor(sl.t / SPIN)), lt = sl.t - idx * SPIN;
        var stage = idx * 4 + (lt >= 1.0 ? 4 : lt >= 0.9 ? 3 : lt >= 0.65 ? 2 : lt >= 0.4 ? 1 : 0);
        if (stage > sl.stage) {
          sl.stage = stage;
          if (stage % 4 === 0 && lt >= 1.0) {
            var won = sl.spins[idx];
            if (won.pay >= 25 || won.helmet) { sfx.gate(); burst(VW / 2, 380, won.big ? 90 : 30); shake = won.big ? 14 : 5; if (won.big) flash = 1; }
            else if (won.pay) sfx.kernel(4); else tone(200, 0.15, "sine", 0.08, 120);
          } else if (stage % 4) tone(520, 0.05, "square", 0.06);
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
    S.t += dt;
    S.safe = Math.max(0, S.safe - dt);
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
    var bx = S.dist + BX, by = S.y, hit = "", i;

    for (i = S.obs.length - 1; i >= 0; i--) {
      var o = S.obs[i];
      if (o.x + o.w - S.dist < -120) { S.obs.splice(i, 1); continue; }
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
      if (!o.passed && bx > o.x + o.w + R) {
        o.passed = true;
        if (o.kind === "gate") {
          S.got += 5; S.gates += 1;
          sfx.gate(); shake = 6;
          burst(BX, S.y, 24);
          floaters.push({ text: "COFFIN CORNer  +5", life: 0, color: GOLD });
          kernEl.textContent = (bank + S.got).toLocaleString("en-US");
        } else sfx.pass();
      }
    }
    for (i = S.kernels.length - 1; i >= 0; i--) {
      var kn = S.kernels[i];
      if (kn.x - S.dist < -40) { S.kernels.splice(i, 1); continue; }
      if (!kn.got && (kn.x - bx) * (kn.x - bx) + (kn.y - by) * (kn.y - by) < 24 * 24) {
        kn.got = true; S.got += kn.big ? 5 : 1;
        sfx.kernel(kn.big ? 8 : 0);
        burst(BX, kn.y, kn.big ? 10 : 3);
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
    if (S.t > S.crowAt) {                               // later on, crows come the other way
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
      S.flash = 2;                                       // frames
    }
    if (!S.passedBest && S.bestWas > 2 && S.t > S.bestWas) {
      S.passedBest = true;
      sfx.gate(); burst(BX, S.y, 30); shake = 6;
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
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(now * 0.05);
      ctx.fillStyle = "rgba(255,245,200," + (0.07 * fade).toFixed(3) + ")";
      for (i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-34, -460); ctx.lineTo(34, -460); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
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

    // two ranges of hills, a water tower and a windmill between them, then the barn
    hills(S.dist * 0.05, 46, 16, mix3(mix("#B5DCB0", "#C98F86", a), "#6F5687", "#16233F", b));
    var wt = ((900 - S.dist * 0.08) % 1500 + 1500) % 1500 - 100, wy = GY - 44;
    var ink = mix3(mix("#6E8F7A", "#8A5B62", a), "#4A3A66", "#0E1830", b);
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(wt - 10, wy); ctx.lineTo(wt - 6, wy - 44); ctx.moveTo(wt + 10, wy); ctx.lineTo(wt + 6, wy - 44); ctx.moveTo(wt, wy); ctx.lineTo(wt, wy - 44);
    ctx.moveTo(wt - 8, wy - 20); ctx.lineTo(wt + 8, wy - 20); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(wt, wy - 54, 17, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(wt - 12, wy - 64); ctx.lineTo(wt, wy - 74); ctx.lineTo(wt + 12, wy - 64); ctx.fill();
    ctx.fillStyle = GOLD; ctx.globalAlpha = 0.85; ctx.fillRect(wt - 16.5, wy - 57, 33, 5); ctx.globalAlpha = 1;
    var wm = ((300 - S.dist * 0.08) % 1500 + 1500) % 1500 - 100;
    ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(wm - 7, wy); ctx.lineTo(wm, wy - 56); ctx.lineTo(wm + 7, wy); ctx.moveTo(wm - 4, wy - 22); ctx.lineTo(wm + 4, wy - 22); ctx.stroke();
    ctx.save(); ctx.translate(wm, wy - 56); ctx.rotate(now * 1.2);
    ctx.fillStyle = ink;
    for (i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-3, -16); ctx.lineTo(3, -16); ctx.closePath(); ctx.fill(); }
    ctx.restore();
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
    for (var gi = Math.floor(off / 19), gx = -(off % 19); gx < VW + 20; gx += 19, gi++) {
      ctx.beginPath(); ctx.ellipse(gx, GY - top * 0.45 + (gi % 3) * 2.5, 1.8, 3.8, 0.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function field() {
    // two rows of corn along the far sideline
    cornRow(S.dist * 0.45, 31, 9, "#2E8B47", false);
    cornRow(S.dist * 0.62, 22, 7, HUSK, true);

    // the field scrolls by: mown stripes, hash marks, yard lines, numbers, and the end zone the punt left from
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
      ctx.fillStyle = "rgba(255,255,255,.7)";
      for (var hk = 1; hk < 5; hk++) {
        ctx.fillRect(x + hk * YARD - 0.6, GY + 6, 1.2, 6);
        ctx.fillRect(x + hk * YARD - 0.6, GY + TURF_H - 14, 1.2, 6);
      }
      var yd = (k * 5) % 100;
      if (k > 0 && yd === 0) {
        ctx.fillStyle = GOLD; ctx.font = "700 16px " + DISPLAY;
        ctx.fillText("ROLL CORN", x, GY + TURF_H * 0.55);
      } else if (yd === 75) {
        ctx.fillStyle = "rgba(255,255,255,.42)"; ctx.font = "700 11px " + LABEL;
        ctx.fillText(CHEERS[Math.floor(k / 20) % CHEERS.length].toUpperCase(), x, GY + TURF_H * 0.87);
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
    var on = Math.sin(now * 5 + x * 0.7) > 0.55, y;
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
    // lighter billows inside
    ctx.strokeStyle = "rgba(255,255,255,.13)"; ctx.lineWidth = 3; ctx.lineCap = "round";
    for (y = top - 58; y > -20; y -= 40) {
      ctx.beginPath(); ctx.arc(x + w * 0.36, y, 15, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + w * 0.7, y + 18, 12, Math.PI * 1.1, Math.PI * 1.8); ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,.20)";
    ctx.beginPath(); ctx.ellipse(x + w / 2, top - 6, w * 0.5, 7, 0, 0, Math.PI * 2); ctx.fill();
    if (top > 64) {
      var lx = x + w / 2, ly = top - 56;
      if (on) {
        var flashGlow = ctx.createRadialGradient(lx, ly + 14, 2, lx, ly + 14, 44);
        flashGlow.addColorStop(0, "rgba(255,236,140,.55)"); flashGlow.addColorStop(1, "rgba(255,236,140,0)");
        ctx.fillStyle = flashGlow; ctx.fillRect(lx - 46, ly - 32, 92, 92);
      }
      ctx.fillStyle = on ? "#FFE45C" : "#9A8F5A"; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
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
    for (var ly = bot + 40, row = 0; ly < base - 8; ly += 28, row++) {
      leaf(x + 12, ly, -1, 20, row % 2 ? "#3FA34D" : "#57B865");
      leaf(x + w - 10, ly + 12, 1, 20, row % 2 ? "#2F8F41" : "#3FA34D");
      leaf(x + 33, ly + 6, row % 2 ? 1 : -1, 15, "#4DB05C");
    }
    for (var ey = bot + 52, e = 0; ey < base - 4; ey += 46, e++) cornEar(x + (e % 2 ? w * 0.7 : w * 0.3), ey, 21);
    ctx.fillStyle = "rgba(255,255,255,.10)";
    ctx.fillRect(x + 2, bot + 16, 5, base - bot - 18);
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
    var done = sl.t >= slotEnd(), idx = Math.min(n - 1, Math.floor(sl.t / SPIN)), lt = done ? SPIN : sl.t - idx * SPIN, sp = sl.spins[idx];
    var w = 252, h = 96, x = VW / 2 - w / 2, y = 350, shown = lt >= 1.0, win = shown && (sp.pay || sp.helmet);
    ctx.fillStyle = "rgba(0,0,0,.3)"; rr(x + 5, y + 6, w, h, 12); ctx.fill();
    ctx.fillStyle = "#111"; ctx.strokeStyle = win && Math.sin(now * 18) > 0 ? "#fff" : GOLD; ctx.lineWidth = 4;
    rr(x, y, w, h, 12); ctx.fill(); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var i = 0; i < 3; i++) {
      var cx = VW / 2 + (i - 1) * 70, stopped = lt >= 0.4 + i * 0.25;
      ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      rr(cx - 30, y + 12, 60, 46, 7); ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - 28, y + 14, 56, 42); ctx.clip();
      if (stopped) drawSym(sp.syms.charAt(i), cx, y + 35);
      else {
        var roll = now * 13 + i * 1.7, k = Math.floor(roll), off = (roll - k) * 46;
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
    ctx.fillText(hot ? "NEW BEST" : best > 0 ? "BEST " + best.toFixed(2) : "HANG TIME", VW / 2, 62);

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
    field();
    var i, x;

    if (S.flash > 0 && S.phase === "play") {            // two frames, soft, behind everything else
      S.flash -= 1;
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.font = "700 " + Math.min(40, VW * 0.085) + "px " + DISPLAY; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(S.flashText.toUpperCase(), VW / 2, 200, VW - 40);
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
        storm(x, o.w, o.top);
        if (o.kind === "gap") cornWall(x, o.w, o.bot);
        else player(x + o.w / 2, GY - o.jy + (o.jy > 0 ? 0 : TURF_H * 0.5), kit(AWAY, { up: o.st === 1, air: o.jy > 0 }));
      }
    }
    for (i = 0; i < S.kernels.length; i++) {
      var kn = S.kernels[i];
      if (kn.got) continue;
      var kx = kn.x - S.dist, ky = kn.y + Math.sin(now * 3 + kn.ph) * 3;
      ctx.save(); ctx.translate(kx, ky); ctx.rotate(Math.sin(now * 2 + kn.ph) * 0.3);
      if (kn.big) { var bs = 1.7 + 0.15 * Math.sin(now * 8); ctx.scale(bs, bs); }
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
      } else crow(x, cr.y);
    }

    // the punter, left behind once the ball is away
    var feet = GY + TURF_H * 0.5, px = BX - 16 - S.dist;
    if (px > -40) player(px, feet, kit(HOME, { kick: S.phase !== "intro" && S.t < 0.5 }));

    // the ball, its trail and its shadow
    if (S.phase === "play" && S.trail.length > 1) {
      ctx.lineCap = "round";
      for (i = 1; i < S.trail.length; i++) {
        var tt = i / S.trail.length;
        ctx.strokeStyle = "rgba(255,255,255," + (tt * 0.75).toFixed(2) + ")";
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

    // popcorn and dust
    for (i = 0; i < particles.length; i++) {
      var pt = particles[i], fade = 1 - pt.life / pt.max;
      if (pt.kind === "dust" || pt.kind === "puff") {
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
    if (night > 0.01) { ctx.fillStyle = "rgba(10,14,60," + (night * 0.30).toFixed(3) + ")"; ctx.fillRect(0, 0, VW, VH); }
    var vig = ctx.createRadialGradient(VW / 2, VH * 0.48, VH * 0.5, VW / 2, VH * 0.48, Math.max(VW, VH) * 0.78);
    vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,.30)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, VW, VH);
    if (flash > 0.01) { ctx.fillStyle = "rgba(255,255,255," + (flash * 0.6).toFixed(2) + ")"; ctx.fillRect(0, 0, VW, VH); }

    if (S.phase === "intro") {
      sign(["Hang Time", "Keep the punt in the air.", best > 0 ? "Best " + best.toFixed(2) + "  ·  Tap to punt" : "Tap to punt"], 190, "gold");
      return;
    }
    hud();
    if (S.phase === "over") {
      var lines = [(S.newBest ? "New best: " : "Hang time ") + S.t.toFixed(2), S.cause + "  ·  " + rank(S.t)];
      if (!S.newBest && best > 0 && S.t >= best * 0.8) lines.push("So close: " + (best - S.t).toFixed(2) + " short of your best");
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
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // For testing only: open the page with #cctest to let a script read the game and tap.
  if (/cctest/.test(location.hash)) {
    window.__cc = { state: function () { return S; }, tap: tap, ballX: function () { return BX; } };
  }

  window.addEventListener("resize", resize);
  reset();
  resize();
  soundLabel();
  board();
  buildBalls();
  requestAnimationFrame(frame);
})();
