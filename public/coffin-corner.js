// Coffin CORNer: a five-punt game about hang time.
// Tap once to set the angle, again to set the power. Keep the ball up long
// enough and the coverage gets there before it comes down.
(function () {
  var canvas = document.getElementById("cc-field");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var btn = document.getElementById("cc-go");
  var statusEl = document.getElementById("cc-status");
  var puntEl = document.getElementById("cc-punt");
  var scoreEl = document.getElementById("cc-score");
  var bestEl = document.getElementById("cc-best");

  var G = 7.4;            // gravity, in yards per second squared (tuned for the game)
  var PUNTS = 5;
  var HANG_GOAL = 4.4;    // seconds the coverage needs to reach the returner
  var GOLD = "#FFCD00", INK = "#000", TURF = "#3FA34D", TURF_DARK = "#22753A";
  var DISPLAY = '"Antonio", "Roboto Condensed", "Arial Narrow", sans-serif';
  var LABEL = '"Roboto Condensed", "Arial Narrow", sans-serif';

  var W = 960, H = 440, S = 11, VS = 10, groundY = 370, small = false;

  var best = 0;
  try { best = Number(localStorage.getItem("rollcorn-coffin-best")) || 0; } catch (e) {}

  var game = { n: 0, score: 0, phase: "intro" };
  var punt = null;

  // ---------- layout ----------

  function resize() {
    var w = canvas.clientWidth || 960;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    small = w < 620;
    W = w;
    H = Math.round(small ? w * 0.8 : Math.max(360, w * 0.46));
    canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = W / 88;                                // 74 yards of field, the end zone, a strip of corn
    groundY = H - (small ? 50 : 62);
    VS = (groundY - (small ? 58 : 70)) / 31;   // room for the highest punt
  }
  // f is yards from the goal line: 0 is the goal line, below 0 is the end zone
  function X(f) { return W - (f + 14) * S; }
  function Y(h) { return groundY - h * VS; }

  // ---------- one punt ----------

  function newPunt() {
    var wind = Math.round((Math.random() * 1.8 - 0.9) * 10) / 10;
    punt = {
      f0: 40 + Math.floor(Math.random() * 23),   // 40 to 62 yards out
      wind: wind,                                // + helps, - is in the punter's face
      clock: 0, angle: 50, power: 0, t: 0, rt: 0, res: null
    };
    game.phase = "angle";
    say("Punt " + (game.n + 1) + " of " + PUNTS + ": " + punt.f0 + " yards from the goal line, " +
        windWords(wind) + ". Tap to set the angle.");
    label("Set angle");
  }

  function windWords(w) {
    var mph = Math.round(Math.abs(w) * 10);
    if (!mph) return "no wind";
    return mph + " mph wind " + (w > 0 ? "at your back" : "in your face");
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function kick() {
    var v = 12 + 10 * punt.power, a = punt.angle * Math.PI / 180;
    var vx = v * Math.cos(a), vy = v * Math.sin(a);
    var hang = 2 * vy / G;
    var land = punt.f0 - (vx * hang + 0.5 * punt.wind * hang * hang);
    var r = { vx: vx, vy: vy, hang: hang, land: land, ret: 0 };

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
    r.fieldPts = Math.round(Math.max(0, 50 - r.spot) * 2);
    r.hangPts = r.kind === "touchback" ? 0 : Math.round(clamp((hang - 3.5) * 25, 0, 50));
    r.cornerPts = r.kind === "touchback" ? 0 : r.spot <= 5 ? 50 : r.spot <= 10 ? 25 : 0;
    r.pts = r.fieldPts + r.hangPts + r.cornerPts;

    if (r.kind === "touchback") r.head = land < -10 ? "Into the corn" : "Touchback";
    else if (r.cornerPts) r.head = "Coffin CORNer!";
    else if (r.kind === "faircatch") r.head = "Fair catch at the " + r.spot;
    else if (r.kind === "downed") r.head = "Downed at the " + r.spot;
    else r.head = "Returned to the " + r.spot;

    punt.res = r;
    punt.t = 0;
    game.phase = "flight";
    label("In the air", true);
    say("The punt is up.");
  }

  function finishPunt() {
    var r = punt.res;
    game.score += r.pts;
    game.n += 1;
    game.phase = "result";
    var what =
      r.kind === "touchback" ? (r.land < -10 ? "Into the corn. Touchback, they start at the 20."
                                             : "Touchback. They start at the 20.") :
      r.kind === "faircatch" ? "Fair catch at the " + r.spot + "." :
      r.kind === "downed" ? "Downed at the " + r.spot + "." :
      "Returned " + r.ret + " yards to the " + r.spot + ".";
    var parts = ["field position " + r.fieldPts];
    if (r.hangPts) parts.push("hang time " + r.hangPts);
    if (r.cornerPts) parts.push("Coffin CORNer " + r.cornerPts);
    say((r.cornerPts ? "Coffin CORNer! " : "") + what + " Hang time " + r.hang.toFixed(2) +
        " seconds, net " + r.net + " yards. Points: " + parts.join(" + ") + " = " + r.pts + ".");
    if (game.n >= PUNTS) {
      if (game.score > best) {
        best = game.score;
        try { localStorage.setItem("rollcorn-coffin-best", String(best)); } catch (e) {}
      }
      label("See final score");
    } else {
      label("Next punt");
    }
    board();
  }

  function rank(score) {
    return score >= 700 ? "Punting is winning." :
           score >= 550 ? "All-conference leg." :
           score >= 400 ? "Special teams captain." :
           score >= 250 ? "Scout team." : "Back to the practice field.";
  }

  // ---------- input ----------

  function act() {
    if (game.phase === "intro" || game.phase === "over") {
      game.n = 0; game.score = 0;
      board();
      newPunt();
    } else if (game.phase === "angle") {
      game.phase = "power";
      punt.clock = 0;
      label("Kick");
      say("Angle " + Math.round(punt.angle) + " degrees. Tap to set the power.");
    } else if (game.phase === "power") {
      kick();
    } else if (game.phase === "result") {
      if (game.n >= PUNTS) {
        game.phase = "over";
        label("Play again");
        say("Final score " + game.score + ". " + rank(game.score) + " Best " + best + ".");
      } else {
        newPunt();
      }
      board();
    }
  }

  function label(text, off) { btn.textContent = text; btn.disabled = !!off; }
  function say(text) { statusEl.textContent = text; }
  function board() {
    puntEl.textContent = Math.min(game.n + (game.phase === "result" || game.phase === "over" ? 0 : 1), PUNTS) +
      " of " + PUNTS;
    scoreEl.textContent = game.score;
    bestEl.textContent = best;
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

  // ---------- the clock ----------

  function update(dt) {
    if (game.phase === "angle") {
      punt.clock += dt;
      punt.angle = 50 + 25 * Math.sin(punt.clock * (2.1 + 0.3 * game.n));
    } else if (game.phase === "power") {
      punt.clock += dt;
      punt.power = 1 - Math.abs((punt.clock * (1.5 + 0.2 * game.n)) % 2 - 1);
    } else if (game.phase === "flight") {
      punt.t += dt;
      if (punt.t >= punt.res.hang) {
        punt.t = punt.res.hang;
        punt.rt = 0;
        game.phase = "return";
      }
    } else if (game.phase === "return") {
      punt.rt += dt;
      if (punt.rt >= (punt.res.ret ? 1.1 : 0.5)) finishPunt();
    }
  }

  // ---------- drawing ----------

  function person(x, body, helmet, lean, legUp) {
    var y = groundY;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = "round";
    ctx.strokeStyle = body;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(lean * 2, -21);            // torso
    ctx.moveTo(0, -11); ctx.lineTo(-4, 0);                    // back leg
    ctx.moveTo(0, -11);
    if (legUp) ctx.lineTo(lean * 9, -15); else ctx.lineTo(4, 0);
    ctx.moveTo(lean * 1.5, -19); ctx.lineTo(lean * 7, -14);   // arm
    ctx.stroke();
    ctx.fillStyle = helmet;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(lean * 2.5, -25.5, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function football(x, y, spin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.fillStyle = "#7A4A21";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.beginPath(); ctx.moveTo(-3.5, -1); ctx.lineTo(3.5, -1); ctx.stroke();
    ctx.restore();
  }

  function cornEar(x, y, h) {
    ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y - h / 2, h * 0.24, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = TURF;
    ctx.beginPath();
    ctx.moveTo(x - h * 0.3, y - h * 0.5);
    ctx.quadraticCurveTo(x - h * 0.3, y, x, y);
    ctx.quadraticCurveTo(x + h * 0.3, y, x + h * 0.3, y - h * 0.5);
    ctx.quadraticCurveTo(x, y - h * 0.1, x - h * 0.3, y - h * 0.5);
    ctx.fill(); ctx.stroke();
  }

  function field() {
    var turfH = small ? 18 : 24;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);

    // the cornfield behind the end zone
    var i = 0;
    for (var x = X(-10) + 7; x < W + 6; x += small ? 9 : 13, i++) {
      var h = (small ? 44 : 64) + (i * 37 % 17);
      ctx.strokeStyle = TURF_DARK; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, groundY + turfH); ctx.lineTo(x, groundY - h); ctx.stroke();
      ctx.lineWidth = 2;
      for (var k = 0; k < 3; k++) {
        var ly = groundY - h * (0.35 + k * 0.22), dir = (k + i) % 2 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(x, ly);
        ctx.quadraticCurveTo(x + dir * 8, ly - 9, x + dir * 12, ly + 3); ctx.stroke();
      }
      if (i % 2 === 0) cornEar(x + 3, groundY - h * 0.5, small ? 11 : 15);
    }

    // turf, the gold stretch inside the 10, and the end zone
    ctx.fillStyle = TURF;
    ctx.fillRect(0, groundY, X(0), turfH);
    ctx.fillStyle = GOLD;
    ctx.fillRect(X(10), groundY, X(0) - X(10), turfH);
    ctx.fillStyle = INK;
    ctx.fillRect(X(0), groundY, X(-10) - X(0), turfH);
    ctx.fillStyle = GOLD;
    ctx.font = "700 " + (small ? 11 : 15) + "px " + DISPLAY;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("CORN", (X(0) + X(-10)) / 2, groundY + turfH / 2 + 1);

    // yard lines and numbers
    ctx.textBaseline = "top";
    for (var f = 5; f <= 70; f += 5) {
      ctx.fillStyle = f <= 10 ? INK : "#fff";
      ctx.fillRect(X(f) - 1, groundY, 2, turfH);
      if (f % 10 === 0) {
        ctx.fillStyle = INK;
        ctx.font = "700 " + (small ? 11 : 14) + "px " + LABEL;
        ctx.fillText(String(f <= 50 ? f : 100 - f), X(f), groundY + turfH + 5);
      }
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(X(0) - 2, groundY, 4, turfH);          // goal line
    if (!small) {
      ctx.fillStyle = "#5F5F4C";
      ctx.font = "700 11px " + LABEL;
      ctx.fillText("COFFIN CORNER", (X(10) + X(0)) / 2, groundY + turfH + 22);
    }
    cornEar(X(0), groundY, small ? 14 : 18);            // the pylon is an ear of corn
    ctx.fillStyle = INK;
    ctx.fillRect(0, groundY - 1, X(-10), 2);
  }

  function sign(lines, cy) {
    var big = small ? 24 : 38, sub = small ? 13 : 17;
    ctx.font = "700 " + big + "px " + DISPLAY;
    var w = ctx.measureText(lines[0]).width;
    ctx.font = "700 " + sub + "px " + LABEL;
    for (var i = 1; i < lines.length; i++) w = Math.max(w, ctx.measureText(lines[i]).width);
    w = Math.min(W - 16, w + (small ? 28 : 48));
    var h = big + 22 + (lines.length - 1) * (sub + 7);
    var x = (W - w) / 2, y = cy - h / 2;
    ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 9); else ctx.rect(x, y, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.font = "700 " + big + "px " + DISPLAY;
    ctx.fillText(lines[0], W / 2, y + 11, w - 16);
    ctx.font = "700 " + sub + "px " + LABEL;
    for (var j = 1; j < lines.length; j++) {
      ctx.fillText(lines[j], W / 2, y + 11 + big + 5 + (j - 1) * (sub + 7), w - 16);
    }
  }

  function draw() {
    field();
    var p = punt, phase = game.phase;

    if (!p) {
      sign(["Coffin CORNer", "Five punts. Hang it high, pin them deep.", "Tap to start"], H * 0.42);
      return;
    }
    var r = p.res, px = X(p.f0);

    // wind, top left
    ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.font = "700 " + (small ? 12 : 15) + "px " + LABEL;
    var mph = Math.round(Math.abs(p.wind) * 10);
    ctx.fillText("WIND " + (mph ? mph + " MPH " + (p.wind > 0 ? "→" : "←") : "CALM"), 10, 10);
    ctx.fillText(p.f0 + " YDS OUT", 10, small ? 27 : 31);

    // hang clock, top centre
    var hangNow = r ? Math.min(p.t, r.hang) : 0;
    ctx.textAlign = "center";
    ctx.font = "700 " + (small ? 11 : 13) + "px " + LABEL;
    ctx.fillText("HANG TIME", W / 2, 8);
    ctx.font = "700 " + (small ? 30 : 44) + "px " + DISPLAY;
    ctx.fillStyle = r && hangNow >= HANG_GOAL ? TURF_DARK : INK;
    ctx.fillText(hangNow.toFixed(2), W / 2, small ? 21 : 24);

    // punter
    person(px, INK, GOLD, 1, phase !== "angle" && phase !== "power");

    if (phase === "angle" || phase === "power") {
      // angle arrow
      var a = p.angle * Math.PI / 180;
      var dx = Math.cos(a) * S, dy = Math.sin(a) * VS, n = Math.sqrt(dx * dx + dy * dy);
      var len = small ? 46 : 70, ex = px + 8 + dx / n * len, ey = groundY - 8 - dy / n * len;
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(px + 8, groundY - 8); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = GOLD; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.font = "700 " + (small ? 13 : 16) + "px " + LABEL;
      ctx.fillText(Math.round(p.angle) + "°", ex + 10, ey);
      football(px + 8, groundY - 8, -a);

      // power meter
      var mh = small ? 60 : 90, mx = Math.max(6, px - 30), my = groundY - 6 - mh;
      ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.fillRect(mx, my, 12, mh); ctx.strokeRect(mx, my, 12, mh);
      ctx.fillStyle = phase === "power" ? GOLD : "#E3E0D0";
      ctx.fillRect(mx + 1, my + mh - 1 - (mh - 2) * p.power, 10, (mh - 2) * p.power);
      ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.font = "700 " + (small ? 10 : 12) + "px " + LABEL;
      ctx.fillText("POWER", mx + 6, my - 3);
    }

    if (r) {
      // returner waits under it; the coverage needs HANG_GOAL seconds to arrive
      var catchF = clamp(r.land, -8, 70);
      var back = phase === "return" || phase === "result" || phase === "over";
      var prog = back && r.ret ? clamp(p.rt / 1.0, 0, 1) : 0;
      if (phase === "result" || phase === "over") prog = 1;
      var retF = catchF + (r.spot - Math.max(1, Math.round(r.land))) * prog;
      if (r.kind !== "touchback" || r.land > -10) person(X(r.kind === "return" ? retF : catchF), "#8A1F1F", "#fff", -1, false);
      var elapsed = p.t + (back ? p.rt : 0);
      var target = r.kind === "return" ? Math.max(1, Math.round(r.land)) + r.ret : Math.max(catchF, 0);
      var cov = p.f0 - (p.f0 - Math.max(catchF, 0)) * clamp(elapsed / HANG_GOAL, 0, 1);
      if (r.kind === "return") cov = Math.min(cov, Math.max(target + 1, cov - 0));
      if (r.kind === "return" && prog >= 1) cov = target + 1;
      person(X(cov + 2.5), INK, GOLD, 1, false);
      person(X(cov), INK, GOLD, 1, false);

      // flight path and the ball
      var t = Math.min(p.t, r.hang);
      ctx.fillStyle = INK;
      for (var s = 0.12; s < t; s += 0.12) {
        ctx.beginPath();
        ctx.arc(X(p.f0 - (r.vx * s + 0.5 * p.wind * s * s)), Y(r.vy * s - 0.5 * G * s * s) - 8, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      var bf = p.f0 - (r.vx * t + 0.5 * p.wind * t * t), bh = Math.max(0, r.vy * t - 0.5 * G * t * t);
      if (back && r.kind === "return") bf = retF;
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath(); ctx.ellipse(X(bf), groundY + 4, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      football(clamp(X(bf), 8, W - 8), Y(bh) - (back && r.kind === "return" ? 14 : 8), t * 9);
    }

    if (phase === "result") {
      sign([r.head.toUpperCase().replace("CORNER", "CORNer"),
            "Hang " + r.hang.toFixed(2) + " s  ·  Net " + r.net + " yds  ·  +" + r.pts],
           H * 0.36);
    } else if (phase === "over") {
      sign(["Final score " + game.score, rank(game.score), "Best " + best + "  ·  Tap to play again"], H * 0.4);
    }
  }

  var last = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  resize();
  board();
  requestAnimationFrame(frame);
})();
