// Coffin CORNer: a punt game about hang time.
// Tap once to set the angle, again to set the power. Keep the ball up long
// enough and the coverage gets there before it comes down. Pin them inside
// the 10 to build a streak; give up field position and you lose an ear.
(function () {
  var canvas = document.getElementById("cc-field");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var btn = document.getElementById("cc-go");
  var statusEl = document.getElementById("cc-status");
  var scoreEl = document.getElementById("cc-score");
  var streakEl = document.getElementById("cc-streak");
  var livesEl = document.getElementById("cc-lives");
  var bestEl = document.getElementById("cc-best");
  var soundBtn = document.getElementById("cc-sound");
  var shareBtn = document.getElementById("cc-share");

  var G = 7.4;            // gravity, in yards per second squared (tuned for the game)
  var LIVES = 3;
  var HANG_GOAL = 4.4;    // seconds the coverage needs to reach the returner
  var FLIGHT_SPEED = 1.5; // the ball flies faster than the hang clock counts, to keep the game moving
  var GOLD = "#FFCD00", INK = "#000", TURF = "#3FA34D", TURF_DARK = "#2F8F41", HUSK = "#22753A";
  var DISPLAY = '"Antonio", "Roboto Condensed", "Arial Narrow", sans-serif';
  var LABEL = '"Roboto Condensed", "Arial Narrow", sans-serif';

  var W = 960, H = 480, S = 11, VS = 10, groundY = 400, turfH = 52, baseY = 426, small = false, K = 1;

  function load(key) { try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; } }
  function save(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }
  var best = load("rollcorn-coffin-best-v2");
  var muted = load("rollcorn-coffin-muted") === 1;

  var game = { phase: "intro", n: 0, score: 0, lives: LIVES, streak: 0, bestStreak: 0, wait: 0 };
  var punt = null;
  var now = 0, shake = 0;
  var particles = [], floaters = [], clouds = [];
  for (var c = 0; c < 5; c++) clouds.push({ x: Math.random(), y: 0.08 + Math.random() * 0.3, s: 0.6 + Math.random() * 0.7 });

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
  var sfx = {
    tick: function () { tone(660, 0.06, "square", 0.05); },
    kick: function () { tone(170, 0.22, "sine", 0.35, 45); thud(0.35); },
    land: function () { thud(0.3); },
    good: function () { tone(523, 0.12, "triangle", 0.14); tone(659, 0.16, "triangle", 0.14, 0, 0.09); },
    corner: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.2, "triangle", 0.16, 0, i * 0.08); }); },
    strike: function () { tone(160, 0.4, "sawtooth", 0.12, 70); },
    over: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.28, "triangle", 0.14, 0, i * 0.16); }); }
  };

  // ---------- layout ----------

  function resize() {
    var w = canvas.clientWidth || 960;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    small = w < 620;
    K = small ? 0.78 : 1;
    W = w;
    H = Math.round(small ? w * 0.82 : Math.max(400, w * 0.5));
    canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = W / 88;                               // 74 yards of field, the end zone, a strip of corn
    turfH = small ? 42 : 54;
    groundY = H - turfH - (small ? 8 : 12);
    baseY = groundY + turfH * 0.5;            // the line the players stand on
    VS = (baseY - (small ? 66 : 84)) / 31;    // room for the highest punt
  }
  // f is yards from the goal line: 0 is the goal line, below 0 is the end zone
  function X(f) { return W - (f + 14) * S; }
  function Y(h) { return baseY - h * VS; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---------- one punt ----------

  function newPunt() {
    var maxWind = Math.min(1.4, 0.5 + 0.08 * game.n);
    punt = {
      f0: 40 + Math.floor(Math.random() * 23),                               // 40 to 62 yards out
      wind: Math.round((Math.random() * 2 - 1) * maxWind * 10) / 10,          // + helps, - is in the punter's face
      clock: 0, angle: 50, power: 0, t: 0, rt: 0, res: null
    };
    game.phase = "angle";
    game.wait = 0;
    say("Punt " + (game.n + 1) + ": " + punt.f0 + " yards from the goal line, " +
        windWords(punt.wind) + ". Tap to set the angle.");
    label("Set angle");
  }

  function windWords(w) {
    var mph = Math.round(Math.abs(w) * 10);
    if (!mph) return "no wind";
    return mph + " mph wind " + (w > 0 ? "at your back" : "in your face");
  }

  function project(power) {
    var v = 12 + 10 * power, a = punt.angle * Math.PI / 180;
    var vx = v * Math.cos(a), vy = v * Math.sin(a), hang = 2 * vy / G;
    return { vx: vx, vy: vy, hang: hang, land: punt.f0 - (vx * hang + 0.5 * punt.wind * hang * hang), ret: 0 };
  }

  function kick() {
    var r = project(punt.power), hang = r.hang, land = r.land;
    if (land < 0) {
      r.kind = "touchback"; r.spot = 20;
    } else if (hang >= HANG_GOAL) {
      r.kind = land <= 10 ? "downed" : "faircatch";
      r.spot = Math.max(1, Math.round(land));
    } else {
      r.kind = "return";
      r.ret = Math.round(Math.min(35, (HANG_GOAL - hang) * 14) + Math.random() * 3);
      r.spot = Math.min(99, Math.max(1, Math.round(land)) + r.ret);
    }
    r.net = punt.f0 - r.spot;
    r.corner = r.kind !== "touchback" && r.spot <= 10;
    r.strike = r.kind === "touchback" || r.spot > 20;
    r.fieldPts = Math.round(Math.max(0, 50 - r.spot) * 2);
    r.hangPts = r.kind === "touchback" ? 0 : Math.round(clamp((hang - 3.5) * 25, 0, 50));
    r.cornerPts = !r.corner ? 0 : r.spot <= 5 ? 50 : 25;

    if (r.kind === "touchback") r.head = land < -10 ? "Into the corn" : "Touchback";
    else if (r.corner) r.head = "Coffin CORNer!";
    else if (r.kind === "faircatch") r.head = "Fair catch at the " + r.spot;
    else if (r.kind === "downed") r.head = "Downed at the " + r.spot;
    else r.head = "Returned to the " + r.spot;

    punt.res = r;
    punt.t = 0;
    game.phase = "flight";
    label("In the air", true);
    say("The punt is up.");
    sfx.kick();
    dust(X(punt.f0) + 8, baseY, 6);
  }

  function landed() {
    var r = punt.res;
    punt.t = r.hang;
    punt.rt = 0;
    game.phase = "return";
    sfx.land();
    shake = r.land < 0 ? 4 : 7;
    dust(clamp(X(r.land), 10, W - 10), baseY, 12);
  }

  function finishPunt() {
    var r = punt.res;
    game.streak = r.corner ? game.streak + 1 : 0;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    r.mult = clamp(game.streak, 1, 5);
    r.pts = (r.fieldPts + r.hangPts + r.cornerPts) * r.mult;
    game.score += r.pts;
    game.n += 1;
    r.regrow = r.corner && game.streak % 3 === 0 && game.lives < LIVES;
    if (r.regrow) game.lives += 1;
    if (r.strike) game.lives -= 1;
    game.phase = "result";
    game.wait = 0;

    var sx = clamp(X(r.kind === "touchback" ? Math.max(r.land, -12) : r.spot), 40, W - 40);
    floaters.push({ text: "+" + r.pts, x: sx, y: baseY - 44 * K, life: 0, color: r.corner ? GOLD : "#fff" });
    if (r.corner) { burst(sx, baseY - 10, 26 + 8 * r.mult); sfx.corner(); shake = 10; }
    else if (r.strike) sfx.strike();
    else sfx.good();

    var what =
      r.kind === "touchback" ? (r.land < -10 ? "Into the corn. Touchback, they start at the 20."
                                             : "Touchback. They start at the 20.") :
      r.kind === "faircatch" ? "Fair catch at the " + r.spot + "." :
      r.kind === "downed" ? "Downed at the " + r.spot + "." :
      "Returned " + r.ret + " yards to the " + r.spot + ".";
    say((r.corner ? "Coffin CORNer! " : "") + what + " Hang time " + r.hang.toFixed(2) + " seconds. " +
        (r.mult > 1 ? "Streak times " + r.mult + ". " : "") + "Plus " + r.pts + "." +
        (r.strike ? " Lost an ear." : "") + (r.regrow ? " Three in a row: an ear grows back." : ""));
    if (game.lives <= 0 && game.score > best) { best = game.score; save("rollcorn-coffin-best-v2", best); }
    label(game.lives <= 0 ? "Final score" : "Next punt");
    board();
  }

  function endGame() {
    game.phase = "over";
    game.wait = 0;
    label("Play again");
    shareBtn.hidden = false;
    sfx.over();
    say("Final score " + game.score + " in " + game.n + " punts. " + rank(game.score) + " Best " + best + ".");
    board();
  }

  function rank(score) {
    return score >= 2500 ? "Punting is winning." :
           score >= 1500 ? "All-conference leg." :
           score >= 800 ? "Special teams captain." :
           score >= 300 ? "Scout team." : "Back to the practice field.";
  }

  // ---------- input ----------

  function act() {
    audio();
    if (game.phase === "intro" || (game.phase === "over" && game.wait > 0.7)) {
      game.n = 0; game.score = 0; game.lives = LIVES; game.streak = 0; game.bestStreak = 0;
      shareBtn.hidden = true;
      board();
      newPunt();
    } else if (game.phase === "angle") {
      game.phase = "power";
      punt.clock = 0;
      sfx.tick();
      label("Kick");
      say("Angle " + Math.round(punt.angle) + " degrees. Tap to set the power.");
    } else if (game.phase === "power") {
      kick();
    } else if (game.phase === "result" && game.wait > 0.35) {
      next();
    }
  }
  function next() { if (game.lives <= 0) endGame(); else newPunt(); }

  function label(text, off) { btn.textContent = text; btn.disabled = !!off; }
  function say(text) { statusEl.textContent = text; }
  function board() {
    scoreEl.textContent = game.score.toLocaleString("en-US");
    streakEl.textContent = "x" + clamp(game.streak + (game.phase === "result" || game.phase === "over" ? 0 : 1), 1, 5);
    if (game.phase === "result" || game.phase === "over") streakEl.textContent = "x" + clamp(game.streak + 1, 1, 5);
    bestEl.textContent = Math.max(best, 0).toLocaleString("en-US");
    var ears = livesEl.querySelectorAll(".cc-life");
    for (var i = 0; i < ears.length; i++) ears[i].classList.toggle("is-lost", i >= game.lives);
    livesEl.setAttribute("aria-label", game.lives + " of " + LIVES + " ears left");
  }

  btn.addEventListener("click", act);
  canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); act(); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== " " && e.key !== "Enter") return;
    var t = e.target && e.target.tagName;
    if (t === "BUTTON" || t === "A" || t === "INPUT" || t === "TEXTAREA") return;
    e.preventDefault();
    if (!e.repeat) act();
  });

  function soundLabel() {
    soundBtn.textContent = muted ? "Sound off" : "Sound on";
    soundBtn.setAttribute("aria-pressed", muted ? "false" : "true");
  }
  soundBtn.addEventListener("click", function () {
    muted = !muted;
    save("rollcorn-coffin-muted", muted ? 1 : 0);
    soundLabel();
    if (!muted) sfx.tick();
  });
  shareBtn.addEventListener("click", function () {
    var url = "https://rollcorn.com/coffin-corner.html";
    var text = "I scored " + game.score.toLocaleString("en-US") + " on Coffin CORNer" +
      (game.bestStreak > 1 ? " with a " + game.bestStreak + "-punt streak" : "") + ". Beat it:";
    function copied() { shareBtn.textContent = "Copied"; setTimeout(function () { shareBtn.textContent = "Share score"; }, 1600); }
    if (navigator.share) navigator.share({ text: text, url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text + " " + url).then(copied, function () {});
  });

  // ---------- particles ----------

  function burst(x, y, n) {            // kernels fly up and pop into popcorn
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 120 + Math.random() * 260;
      particles.push({ kind: "kernel", x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                       life: 0, max: 1 + Math.random() * 0.8, pop: 0.25 + Math.random() * 0.4,
                       rot: Math.random() * 6, size: 3 + Math.random() * 2.5 });
    }
  }
  function dust(x, y, n) {
    for (var i = 0; i < n; i++) {
      particles.push({ kind: "dust", x: x, y: y, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 70,
                       life: 0, max: 0.4 + Math.random() * 0.4, size: 2 + Math.random() * 4 });
    }
  }

  // ---------- the clock ----------

  function update(dt) {
    now += dt;
    game.wait += dt;
    shake = Math.max(0, shake - dt * 22);
    var drift = punt ? punt.wind : 0.3;
    for (var i = 0; i < clouds.length; i++) {
      clouds[i].x += (0.006 + drift * 0.02) * dt * clouds[i].s;
      if (clouds[i].x > 1.2) clouds[i].x = -0.2;
      if (clouds[i].x < -0.2) clouds[i].x = 1.2;
    }
    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j];
      p.life += dt;
      p.vy += (p.kind === "kernel" ? 520 : 120) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === "kernel" && p.y > baseY + 6 && p.vy > 0) { p.y = baseY + 6; p.vy *= -0.35; p.vx *= 0.6; }
      if (p.life > p.max) particles.splice(j, 1);
    }
    for (var k = floaters.length - 1; k >= 0; k--) {
      floaters[k].life += dt;
      if (floaters[k].life > 1.5) floaters.splice(k, 1);
    }

    if (game.phase === "angle") {
      punt.clock += dt;
      punt.angle = 50 + 25 * Math.sin(punt.clock * Math.min(5, 2.0 + 0.18 * game.n));
    } else if (game.phase === "power") {
      punt.clock += dt;
      punt.power = 1 - Math.abs((punt.clock * Math.min(4, 1.3 + 0.14 * game.n)) % 2 - 1);
    } else if (game.phase === "flight") {
      punt.t += dt * FLIGHT_SPEED;
      if (punt.t >= punt.res.hang) landed();
    } else if (game.phase === "return") {
      punt.rt += dt;
      if (punt.rt >= (punt.res.ret ? 1.0 : 0.45)) finishPunt();
    } else if (game.phase === "result") {
      if (game.wait > 2.1) next();
    }
  }

  // ---------- drawing ----------

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  function player(x, o) {
    var run = o.run ? Math.sin(now * 16 + (o.seed || 0)) : 0, d = o.dir;
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(K * 1.15, K * 1.15);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(0, 1, 9, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = o.pants; ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(-3 - run * 5, 0);
    ctx.moveTo(0, -11);
    if (o.kick) ctx.lineTo(d * 11, -13); else ctx.lineTo(3 + run * 5, 0);
    ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    ctx.fillStyle = o.jersey;
    rr(-4.6, -24, 9.2, 14, 3.2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = o.jersey === "#fff" ? "#C9C5B6" : o.jersey; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(d * 1, -21);
    if (o.up) ctx.lineTo(d * 5, -31); else ctx.lineTo(d * (6 + run * 2), -15 + run * 3);
    ctx.stroke();
    ctx.fillStyle = o.helmet; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(d * 0.8, -29.5, 5.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = o.stripe; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(d * 0.8, -29.5, 5.2, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(d * 5.6, -29); ctx.lineTo(d * 7.4, -27.6); ctx.lineTo(d * 4.6, -26.2); ctx.stroke();
    ctx.restore();
  }
  var HOME = { jersey: "#111", helmet: GOLD, stripe: "#111", pants: GOLD, dir: 1 };
  var AWAY = { jersey: "#fff", helmet: "#8A1F1F", stripe: "#fff", pants: "#8A1F1F", dir: -1 };
  function kit(base, extra) {
    var o = {}, k;
    for (k in base) o[k] = base[k];
    for (k in extra) o[k] = extra[k];
    return o;
  }

  function football(x, y, spin, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.scale(scale || 1, scale || 1);
    ctx.fillStyle = "#8B4A1E"; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, -8.5, 10, 0); ctx.quadraticCurveTo(0, 8.5, -10, 0);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-4, -1.2); ctx.lineTo(4, -1.2);
    for (var i = -3; i <= 3; i += 2) { ctx.moveTo(i, -2.8); ctx.lineTo(i, 0.4); }
    ctx.stroke();
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

  function cloud(x, y, s) {
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.beginPath();
    ctx.ellipse(x, y, 34 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 16 * s, y - 7 * s, 16 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 10 * s, y - 10 * s, 20 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function scene() {
    // sky at golden hour
    var sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, "#58A9E0"); sky.addColorStop(0.6, "#BFE4F6"); sky.addColorStop(1, "#FFE7A0");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, groundY + 20);
    var sx = W * 0.2, sy = groundY - 62 * K;
    var glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 120 * K);
    glow.addColorStop(0, "rgba(255,240,170,.95)"); glow.addColorStop(1, "rgba(255,240,170,0)");
    ctx.fillStyle = glow; ctx.fillRect(sx - 130 * K, sy - 130 * K, 260 * K, 260 * K);
    ctx.fillStyle = "#FFF3B0";
    ctx.beginPath(); ctx.arc(sx, sy, 22 * K, 0, Math.PI * 2); ctx.fill();
    for (var c = 0; c < clouds.length; c++) cloud(clouds[c].x * W, clouds[c].y * groundY, clouds[c].s * K);

    // far hills, a barn and a silo
    ctx.fillStyle = "#8CC27A";
    ctx.beginPath(); ctx.moveTo(-20, groundY);
    for (var hx = -20; hx <= W + 20; hx += 20) ctx.lineTo(hx, groundY - (26 + 12 * Math.sin(hx * 0.006 + 1) + 6 * Math.sin(hx * 0.021)) * K);
    ctx.lineTo(W + 20, groundY); ctx.fill();
    var bx = W * 0.42, by = groundY - 14 * K, u = 1.5 * K;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.fillStyle = "#D9D5C7";
    rr(bx + 30 * u, by - 34 * u, 10 * u, 34 * u, 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx + 35 * u, by - 34 * u, 5 * u, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#B3261E";
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx, by - 16 * u); ctx.lineTo(bx + 5 * u, by - 24 * u); ctx.lineTo(bx + 13 * u, by - 28 * u);
    ctx.lineTo(bx + 21 * u, by - 24 * u); ctx.lineTo(bx + 26 * u, by - 16 * u); ctx.lineTo(bx + 26 * u, by); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(bx + 9 * u, by - 11 * u, 8 * u, 11 * u); ctx.strokeRect(bx + 9 * u, by - 11 * u, 8 * u, 11 * u);

    // the cornfield along the far sideline
    var rowH = 20 * K;
    ctx.fillStyle = HUSK;
    ctx.beginPath(); ctx.moveTo(-20, groundY + 1);
    for (var zx = -20, zi = 0; zx <= W + 20; zx += 7, zi++) ctx.lineTo(zx, groundY - rowH + (zi % 2 ? 0 : 6 * K) + 2 * Math.sin(zx * 0.05 + now * 1.4));
    ctx.lineTo(W + 20, groundY + 1); ctx.fill();
    ctx.fillStyle = GOLD;
    for (var gx = 6; gx < W; gx += 17) { ctx.beginPath(); ctx.ellipse(gx, groundY - rowH * 0.45 + (gx % 3) * 2, 1.6, 3.4, 0.3, 0, Math.PI * 2); ctx.fill(); }

    // the field: mown stripes, the gold stretch inside the 10, the end zone
    for (var f = -15; f < 80; f += 5) {
      ctx.fillStyle = f < -10 ? "#6B4F35" : f < 0 ? "#111" : f < 10 ? GOLD : (f / 5) % 2 ? TURF : TURF_DARK;
      ctx.fillRect(X(f + 5) - 0.5, groundY, 5 * S + 1, turfH);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(X(10), groundY, X(0) - X(10), turfH); ctx.clip();
    ctx.strokeStyle = "rgba(0,0,0,.14)"; ctx.lineWidth = 5;
    for (var d = X(10) - turfH; d < X(0); d += 14) { ctx.beginPath(); ctx.moveTo(d, groundY + turfH); ctx.lineTo(d + turfH, groundY); ctx.stroke(); }
    ctx.restore();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = GOLD;
    ctx.font = "700 " + (small ? 13 : 20) + "px " + DISPLAY;
    ctx.fillText("CORN", (X(0) + X(-10)) / 2, groundY + turfH * 0.72);
    for (var y5 = 5; y5 <= 70; y5 += 5) {
      ctx.fillStyle = y5 <= 10 ? "rgba(0,0,0,.75)" : "rgba(255,255,255,.9)";
      ctx.fillRect(X(y5) - 1, groundY, 2, turfH);
      if (y5 % 10 === 0) {
        ctx.font = "700 " + (small ? 12 : 18) + "px " + DISPLAY;
        ctx.fillText(String(y5 <= 50 ? y5 : 100 - y5), X(y5) - (small ? 10 : 15), groundY + turfH * 0.76);
      }
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(X(0) - 2.5, groundY, 5, turfH);                 // goal line
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fillRect(-20, groundY + turfH, W + 40, 3);
    ctx.fillStyle = "#fff";
    ctx.fillRect(-20, groundY, X(-10) + 20, 2.5);                // far sideline

    // goalpost with a wind flag
    var gp = X(-10), top = Y(11);
    ctx.strokeStyle = "#E0B400"; ctx.lineWidth = 4 * K; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(gp, baseY); ctx.lineTo(gp, top); ctx.moveTo(gp - 6 * K, Y(3.3)); ctx.lineTo(gp + 6 * K, Y(3.3)); ctx.stroke();
    var wind = punt ? punt.wind : 0.4, flag = (10 + Math.abs(wind) * 16) * K * (wind >= 0 ? 1 : -1);
    ctx.fillStyle = "#D7261E"; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(gp, top);
    ctx.quadraticCurveTo(gp + flag * 0.5, top - 3 + Math.sin(now * 9) * 2.5, gp + flag, top + 4 + Math.sin(now * 9 + 1) * 2);
    ctx.lineTo(gp, top + 9 * K); ctx.closePath(); ctx.fill(); ctx.stroke();

    // tall corn behind the end zone, swaying
    var i = 0;
    for (var x = gp + 9; x < W + 10; x += small ? 9 : 13, i++) {
      var h = (small ? 56 : 86) + (i * 37 % 19), sway = Math.sin(now * 1.6 + i) * 3 * (1 + Math.abs(wind));
      ctx.strokeStyle = HUSK; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, groundY + turfH); ctx.quadraticCurveTo(x, groundY - h * 0.4, x + sway, groundY + turfH - h); ctx.stroke();
      ctx.lineWidth = 2.2;
      for (var k = 0; k < 3; k++) {
        var ly = groundY + turfH - h * (0.38 + k * 0.2), dir = (k + i) % 2 ? 1 : -1, lx = x + sway * (0.3 + k * 0.2);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(lx + dir * 9, ly - 10, lx + dir * 14, ly + 3); ctx.stroke();
      }
      if (i % 2 === 0) cornEar(x + 3 + sway * 0.4, groundY + turfH - h * 0.52, small ? 12 : 17);
    }
    cornEar(X(0), baseY + 2, small ? 17 : 24);                   // the pylon is an ear of corn
  }

  function sign(lines, cy, style, age) {
    var big = small ? 24 : 40, sub = small ? 13 : 17;
    ctx.font = "700 " + big + "px " + DISPLAY;
    var w = ctx.measureText(lines[0]).width;
    ctx.font = "700 " + sub + "px " + LABEL;
    for (var i = 1; i < lines.length; i++) w = Math.max(w, ctx.measureText(lines[i]).width);
    w = Math.min(W - 16, w + (small ? 30 : 52));
    var h = big + 24 + (lines.length - 1) * (sub + 7);
    var t = clamp((age === undefined ? 1 : age) / 0.28, 0, 1), pop = 1 + 0.35 * Math.sin(t * Math.PI) * (1 - t) + (t - 1) * 0.3;
    ctx.save();
    ctx.translate(W / 2, cy); ctx.scale(pop, pop); ctx.rotate(style === "corner" ? -0.025 : 0);
    ctx.fillStyle = "rgba(0,0,0,.28)"; rr(-w / 2 + 5, -h / 2 + 6, w, h, 10); ctx.fill();
    ctx.fillStyle = style === "strike" ? "#111" : style === "plain" ? "#fff" : GOLD;
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    rr(-w / 2, -h / 2, w, h, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = style === "strike" ? GOLD : INK; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.font = "700 " + big + "px " + DISPLAY;
    ctx.fillText(lines[0], 0, -h / 2 + 12, w - 16);
    ctx.font = "700 " + sub + "px " + LABEL;
    for (var j = 1; j < lines.length; j++) ctx.fillText(lines[j], 0, -h / 2 + 12 + big + 5 + (j - 1) * (sub + 7), w - 16);
    ctx.restore();
  }

  function hud() {
    var p = punt, r = p.res;
    ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    var bw = small ? 104 : 132, bh = small ? 40 : 50;
    rr(8, 8, bw, bh, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = "700 " + (small ? 12 : 15) + "px " + LABEL;
    var mph = Math.round(Math.abs(p.wind) * 10);
    ctx.fillText("WIND " + (mph ? mph + " MPH " + (p.wind > 0 ? "→" : "←") : "CALM"), 16, 14);
    ctx.fillText(p.f0 + " YDS OUT", 16, small ? 29 : 34);

    // hang clock with a bar that turns green at the coverage mark
    var hangNow = r ? Math.min(p.t, r.hang) : 0, made = hangNow >= HANG_GOAL;
    var cw = small ? 128 : 190, ch = small ? 52 : 72, cx = W / 2 - cw / 2;
    ctx.fillStyle = made ? "#111" : "rgba(255,255,255,.9)"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    rr(cx, 8, cw, ch, 8); ctx.fill(); ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = made ? GOLD : INK;
    ctx.font = "700 " + (small ? 10 : 12) + "px " + LABEL;
    ctx.fillText("HANG TIME", W / 2, 12);
    ctx.font = "700 " + (small ? 26 : 38) + "px " + DISPLAY;
    ctx.fillText(hangNow.toFixed(2), W / 2, small ? 21 : 24);
    var barW = cw - 20, barY = 8 + ch - (small ? 9 : 11);
    ctx.fillStyle = made ? "#444" : "#D8D4C4"; ctx.fillRect(cx + 10, barY, barW, 5);
    ctx.fillStyle = made ? GOLD : "#D7261E"; ctx.fillRect(cx + 10, barY, barW * clamp(hangNow / 6, 0, 1), 5);
    ctx.fillStyle = made ? GOLD : INK; ctx.fillRect(cx + 10 + barW * HANG_GOAL / 6 - 1, barY - 3, 2, 11);

    if (game.streak > 0) {
      var m = clamp(game.streak + 1, 1, 5), pulse = 1 + 0.06 * Math.sin(now * 7);
      ctx.save();
      ctx.translate(W - (small ? 34 : 48), small ? 28 : 36); ctx.scale(pulse, pulse); ctx.rotate(0.08);
      ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      rr(-(small ? 24 : 34), -(small ? 17 : 23), small ? 48 : 68, small ? 34 : 46, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.textBaseline = "middle";
      ctx.font = "700 " + (small ? 20 : 28) + "px " + DISPLAY;
      ctx.fillText("x" + m, 0, 2);
      ctx.restore();
    }
  }

  function draw() {
    ctx.save();
    if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    scene();
    var p = punt, phase = game.phase;

    if (!p) {
      player(X(52), kit(HOME, {}));
      football(X(52) + 12 * K, baseY - 6, -0.6, K);
      ctx.restore();
      sign(["Coffin CORNer", "Hang it high. Pin them deep.", "Tap to punt"], H * 0.4, "gold");
      return;
    }
    var r = p.res, px = X(p.f0);
    var aiming = phase === "angle" || phase === "power";

    if (aiming) {
      // where this power would put the ball
      if (phase === "power") {
        var pr = project(p.power), lx = clamp(X(pr.land), 8, W - 8), over = pr.land < 0, pin = pr.land >= 0 && pr.land <= 10;
        ctx.fillStyle = over ? "#D7261E" : pin ? "#111" : "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(lx, baseY - 4); ctx.lineTo(lx - 8 * K, baseY - 20 * K); ctx.lineTo(lx + 8 * K, baseY - 20 * K); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.setLineDash([3, 6]); ctx.lineWidth = 2;
        ctx.beginPath();
        for (var q = 0; q <= 1.001; q += 0.05) {
          var qt = pr.hang * q, qx = X(p.f0 - (pr.vx * qt + 0.5 * p.wind * qt * qt)), qy = Y(pr.vy * qt - 0.5 * G * qt * qt) - 8;
          if (q === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
      // angle arrow
      var a = p.angle * Math.PI / 180;
      var dx = Math.cos(a) * S, dy = Math.sin(a) * VS, n = Math.sqrt(dx * dx + dy * dy);
      var len = small ? 50 : 78, ox = px + 12 * K, oy = baseY - 8, ex = ox + dx / n * len, ey = oy - dy / n * len;
      ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.font = "700 " + (small ? 14 : 18) + "px " + DISPLAY;
      ctx.fillText(Math.round(p.angle) + "°", ex + 11, ey);

      // power meter
      var mh = small ? 64 : 100, mw = small ? 13 : 16, mx = Math.max(8, px - 34 * K - mw), my = baseY - 4 - mh;
      ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      rr(mx, my, mw, mh, 4); ctx.fill(); ctx.stroke();
      var grad = ctx.createLinearGradient(0, my + mh, 0, my);
      grad.addColorStop(0, "#FFE680"); grad.addColorStop(0.7, GOLD); grad.addColorStop(1, "#D7261E");
      ctx.fillStyle = phase === "power" ? grad : "#E3E0D0";
      ctx.fillRect(mx + 2, my + mh - 2 - (mh - 4) * p.power, mw - 4, (mh - 4) * p.power);
      ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.font = "700 " + (small ? 10 : 12) + "px " + LABEL;
      ctx.fillText("POWER", mx + mw / 2, my - 3);
    }

    var back = phase === "return" || phase === "result" || phase === "over";
    if (r) {
      // returner waits under it; the coverage needs HANG_GOAL seconds to arrive
      var catchF = clamp(r.land, -9, 72), prog = !back ? 0 : phase === "return" ? clamp(p.rt / 0.9, 0, 1) : 1;
      var retF = r.kind === "return" ? lerp(catchF, r.spot, prog) : catchF;
      var meet = Math.max(catchF, 0) + 1.6;
      var cov = lerp(p.f0 - 2, meet, clamp(p.t / HANG_GOAL, 0, 1));
      if (r.kind === "return") cov = lerp(cov, r.spot + 1.6, prog);
      var arrived = Math.abs(cov - (r.kind === "return" ? r.spot + 1.6 : meet)) < 0.05;
      if (r.land > -10) player(X(retF), kit(AWAY, { run: r.kind === "return" && back && prog < 1, up: !back && r.kind !== "return" }));
      player(X(cov + 3), kit(HOME, { run: !arrived, seed: 2 }));
      player(X(cov), kit(HOME, { run: !arrived }));
    }
    player(px, kit(HOME, { kick: !aiming && (!r || p.t < 0.5) }));
    if (aiming) football(px + 12 * K, baseY - 8, -(p.angle * Math.PI / 180), K);

    if (r) {
      // flight path, shadow and the ball
      var t = Math.min(p.t, r.hang);
      for (var s = 0.1; s < t; s += 0.1) {
        ctx.fillStyle = "rgba(0,0,0," + (0.12 + 0.3 * (s / Math.max(t, 0.1))).toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(X(p.f0 - (r.vx * s + 0.5 * p.wind * s * s)), Y(r.vy * s - 0.5 * G * s * s) - 8, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      var bf = p.f0 - (r.vx * t + 0.5 * p.wind * t * t), bh = Math.max(0, r.vy * t - 0.5 * G * t * t);
      var carried = back && r.kind === "return";
      if (carried) bf = lerp(clamp(r.land, -9, 72), r.spot, phase === "return" ? clamp(p.rt / 0.9, 0, 1) : 1);
      var bx = clamp(X(bf), 10, W - 10), sh = clamp(1 - bh / 34, 0.35, 1);
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.beginPath(); ctx.ellipse(bx, baseY + 3, 10 * sh * K, 3 * sh * K, 0, 0, Math.PI * 2); ctx.fill();
      football(bx, carried ? baseY - 19 * K : Y(bh) - 8, carried ? 0.4 : t * 9, K * (1 + bh / 60));
    }

    // popcorn, dust and points
    for (var i = 0; i < particles.length; i++) {
      var pt = particles[i], fade = 1 - pt.life / pt.max;
      if (pt.kind === "dust") {
        ctx.fillStyle = "rgba(245,240,215," + (fade * 0.8).toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1.4 - fade * 0.4), 0, Math.PI * 2); ctx.fill();
      } else if (pt.life < pt.pop) {
        ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot + pt.life * 12);
        ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1;
        rr(-pt.size * 0.6, -pt.size, pt.size * 1.2, pt.size * 2, pt.size * 0.5); ctx.fill(); ctx.stroke();
        ctx.restore();
      } else {
        ctx.globalAlpha = clamp(fade * 3, 0, 1);
        ctx.fillStyle = "#FFFBEA"; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 1;
        for (var b = 0; b < 3; b++) {
          ctx.beginPath();
          ctx.arc(pt.x + Math.cos(pt.rot + b * 2.1) * pt.size * 0.9, pt.y + Math.sin(pt.rot + b * 2.1) * pt.size * 0.9, pt.size * 1.1, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var fl = 0; fl < floaters.length; fl++) {
      var fo = floaters[fl], up = fo.life / 1.5;
      ctx.globalAlpha = clamp(2 - up * 2, 0, 1);
      ctx.font = "700 " + (small ? 24 : 36) + "px " + DISPLAY;
      ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineJoin = "round";
      ctx.strokeText(fo.text, fo.x, fo.y - up * 60 * K);
      ctx.fillStyle = fo.color;
      ctx.fillText(fo.text, fo.x, fo.y - up * 60 * K);
      ctx.globalAlpha = 1;
    }

    hud();
    ctx.restore();

    if (phase === "result") {
      var sub = "Hang " + r.hang.toFixed(2) + " s  ·  +" + r.pts.toLocaleString("en-US") + (r.mult > 1 ? "  ·  x" + r.mult + " streak" : "");
      var lines = [r.head.toUpperCase().replace("CORNER", "CORNer"), sub];
      if (r.strike) lines.push(game.lives > 0 ? "Lost an ear" : "Out of ears");
      else if (r.regrow) lines.push("Three in a row: an ear grows back");
      sign(lines, H * 0.44, r.strike ? "strike" : r.corner ? "corner" : "plain", game.wait);
    } else if (phase === "over") {
      sign(["Final score " + game.score.toLocaleString("en-US"), rank(game.score),
            game.n + " punts  ·  Best " + best.toLocaleString("en-US"), "Tap to play again"], H * 0.45, "gold", game.wait);
    }
  }

  var last = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  resize();
  soundLabel();
  board();
  requestAnimationFrame(frame);
})();
