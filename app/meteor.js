// Meteor Shower: meteors carrying terms fall toward your planet; type the answers.
// Also draws the starry background behind every screen.
const Meteor = (() => {
  const { $, shuffle, fillCardList, showScreen, showOverlay, hideOverlay } = UI;
  const canvas = $('space');
  const ctx = canvas.getContext('2d');

  const MAX_LIVES = 5;

  let set = null; // { title, cards: [[term, def], ...] }
  let pool = []; // indexes of the cards being played
  let opt = null;
  let hooks = {}; // { onExit(), onStudy(cardIndexes) }
  let game = null;
  let W = 0;
  let H = 0;
  let DPR = 1;

  // ───────────────────────── Background ─────────────────────────
  const stars = Array.from({ length: 260 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.4 + 0.2,
    tw: Math.random() * Math.PI * 2,
    sp: Math.random() * 0.00004 + 0.00001,
  }));

  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function planetTop() {
    return H - Math.min(150, H * 0.18);
  }

  function drawBackground(t, dt) {
    const g = ctx.createRadialGradient(W * 0.7, H * 0.2, 0, W * 0.7, H * 0.2, Math.max(W, H));
    g.addColorStop(0, '#141a3d');
    g.addColorStop(0.5, '#0a0d24');
    g.addColorStop(1, '#05060f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      s.y += s.sp * dt;
      if (s.y > 1) s.y -= 1;
      const a = 0.5 + 0.5 * Math.sin(t * 0.002 + s.tw);
      ctx.globalAlpha = 0.3 + a * 0.7;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlanet(t, damage) {
    const top = planetTop();
    const r = Math.max(W * 1.1, 900);
    const cx = W / 2;
    const cy = top + r;

    // atmosphere glow
    const glow = ctx.createRadialGradient(cx, cy, r * 0.98, cx, cy, r * 1.08);
    const hurt = Math.min(1, damage);
    glow.addColorStop(0, `rgba(${90 + 160 * hurt}, ${140 - 80 * hurt}, 255, 0.55)`);
    glow.addColorStop(1, 'rgba(60, 100, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(0, top, 0, H);
    body.addColorStop(0, '#3b5bd9');
    body.addColorStop(0.35, '#22348f');
    body.addColorStop(1, '#0b1033');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // drifting continents
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(90, 200, 160, 0.28)';
    const off = (t * 0.01) % (W + 600);
    for (let i = 0; i < 6; i++) {
      const x = ((i * 380 + off) % (W + 600)) - 300;
      ctx.beginPath();
      ctx.ellipse(x, top + 40 + (i % 3) * 30, 120 + (i % 2) * 60, 22 + (i % 3) * 8, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // craters from hits
    if (game) {
      ctx.fillStyle = 'rgba(20, 10, 30, 0.55)';
      for (const c of game.craters) {
        ctx.beginPath();
        ctx.ellipse(c.x, top + 14 + c.d, c.r, c.r * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ───────────────────────── Asteroids ─────────────────────────
  function makeRockShape() {
    const n = 11;
    return Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2, r: 0.78 + Math.random() * 0.28 }));
  }

  function wrapText(text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > 4) {
      lines.length = 4;
      lines[3] = lines[3].replace(/.{0,3}$/, '…');
    }
    return lines;
  }

  function drawAsteroid(a) {
    const { x, y, size } = a;
    ctx.save();
    ctx.translate(x, y);

    // trail
    const trail = ctx.createLinearGradient(0, -size * 3.2, 0, 0);
    trail.addColorStop(0, 'rgba(255, 140, 60, 0)');
    trail.addColorStop(1, 'rgba(255, 170, 90, 0.35)');
    ctx.fillStyle = trail;
    ctx.beginPath();
    ctx.moveTo(-size * 0.7, 0);
    ctx.lineTo(0, -size * 3.2);
    ctx.lineTo(size * 0.7, 0);
    ctx.fill();

    ctx.rotate(a.rot);
    const rock = ctx.createRadialGradient(-size * 0.3, -size * 0.3, size * 0.1, 0, 0, size);
    rock.addColorStop(0, '#a08a7a');
    rock.addColorStop(1, '#4a3b33');
    ctx.fillStyle = rock;
    ctx.beginPath();
    a.shape.forEach((p, i) => {
      const px = Math.cos(p.a) * p.r * size;
      const py = Math.sin(p.a) * p.r * size;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(size * 0.25, size * 0.1, size * 0.18, 0, Math.PI * 2);
    ctx.arc(-size * 0.2, size * 0.35, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // label
    ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const lines = a.lines || (a.lines = wrapText(a.prompt, Math.min(300, W * 0.42)));
    const lh = 21;
    const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 22;
    const boxH = lines.length * lh + 12;
    const by = y + size + 8;
    ctx.fillStyle = 'rgba(8, 10, 30, 0.82)';
    ctx.strokeStyle = a.target ? 'rgba(255, 207, 138, 0.9)' : 'rgba(130, 150, 255, 0.45)';
    ctx.lineWidth = 1.5;
    roundRect(x - boxW / 2, by, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    lines.forEach((l, i) => ctx.fillText(l, x, by + 6 + i * lh));
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ───────────────────────── Particles ─────────────────────────
  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random()) * speed;
      game.particles.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 1, color, r: 1.5 + Math.random() * 3 });
    }
  }

  function drawParticles(dt) {
    for (const p of game.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.0004 * dt;
      p.life -= dt / 900;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    game.particles = game.particles.filter((p) => p.life > 0);
  }

  // ───────────────────────── Game state ─────────────────────────
  function start(newSet, cardIndexes, options, callbacks) {
    set = newSet;
    pool = cardIndexes;
    opt = options;
    hooks = callbacks;
    newGame();
  }

  function newGame() {
    ['paused', 'over', 'correct'].forEach(hideOverlay);
    game = {
      score: 0,
      level: opt.startLevel,
      lives: MAX_LIVES,
      asteroids: [],
      particles: [],
      craters: [],
      deck: [],
      redo: [], // missed cards come back soon
      levelLeft: 0,
      spawnTimer: 0,
      state: 'banner', // banner | playing | correcting | paused | over
      bannerTimer: 0,
      shake: 0,
      flash: 0,
      answered: 0,
      correct: 0,
      missed: new Map(),
    };
    startLevel();
    showScreen('game');
    updateHud();
    $('answer').value = '';
    $('answer').focus();
  }

  function cardsPerLevel(level) {
    return Math.min(pool.length, 5 + level);
  }
  function fallTime(level) {
    // seconds for an asteroid to fall from the top to the planet
    return Math.max(4.5, 15 * Math.pow(0.88, level - 1));
  }
  function maxOnScreen(level) {
    return Math.min(4, 1 + Math.floor((level - 1) / 2));
  }

  function startLevel() {
    game.levelLeft = cardsPerLevel(game.level);
    game.spawnTimer = 600;
    showBanner(`Level ${game.level}`, `${game.levelLeft} meteors incoming`, 1800);
  }

  function showBanner(text, sub, ms) {
    const b = $('banner');
    b.innerHTML = '';
    b.append(text);
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      b.append(s);
    }
    b.classList.remove('hidden');
    // restart pop animation
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    game.state = 'banner';
    game.bannerTimer = ms;
  }

  function nextCard() {
    // Missed cards get priority once a couple of others have gone by.
    const ready = game.redo.findIndex((r) => r.wait <= 0);
    if (ready >= 0) return game.redo.splice(ready, 1)[0].card;
    if (!game.deck.length) {
      game.deck = shuffle(pool.slice());
      // Avoid repeating a card that is currently on screen
      const onScreen = new Set(game.asteroids.map((a) => a.card));
      game.deck.sort((a, b) => onScreen.has(a) - onScreen.has(b));
    }
    return game.deck.pop();
  }

  function spawn() {
    const card = nextCard();
    game.redo.forEach((r) => r.wait--);
    const [term, def] = set.cards[card];
    const termPrompt = opt.promptSide === 'term';
    const size = 24 + Math.random() * 10;
    const margin = Math.min(180, W * 0.2);
    let x = margin + Math.random() * (W - margin * 2);
    // keep horizontal distance from others so labels don't overlap
    for (let tries = 0; tries < 8; tries++) {
      if (game.asteroids.every((a) => Math.abs(a.x - x) > 220 || a.y > H * 0.45)) break;
      x = margin + Math.random() * (W - margin * 2);
    }
    const travel = planetTop() - size + 60;
    game.asteroids.push({
      card,
      prompt: termPrompt ? term : def,
      answer: termPrompt ? def : term,
      x,
      y: -60,
      size,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.002,
      vy: travel / (fallTime(game.level) * 1000),
      shape: makeRockShape(),
      lines: null,
    });
    game.levelLeft--;
  }

  function update(dt) {
    if (game.state === 'banner') {
      game.bannerTimer -= dt;
      if (game.bannerTimer <= 0) {
        const next = game.afterBanner;
        game.afterBanner = null;
        if (next) return next();
        $('banner').classList.add('hidden');
        game.state = 'playing';
      }
      return;
    }
    if (game.state !== 'playing') return;

    // spawning
    game.spawnTimer -= dt;
    if (game.levelLeft > 0 && game.asteroids.length < maxOnScreen(game.level) && game.spawnTimer <= 0) {
      spawn();
      game.spawnTimer = (fallTime(game.level) * 1000) / (maxOnScreen(game.level) + 0.5);
    }
    if (game.levelLeft > 0 && game.asteroids.length === 0) game.spawnTimer = Math.min(game.spawnTimer, 300);

    // movement
    const ground = planetTop() + 10;
    let lowest = null;
    for (const a of game.asteroids) {
      a.y += a.vy * dt;
      a.rot += a.spin * dt;
      a.target = false;
      if (!lowest || a.y > lowest.y) lowest = a;
    }
    if (lowest) lowest.target = true;

    const hit = game.asteroids.find((a) => a.y + a.size >= ground);
    if (hit) return impact(hit, null);

    if (game.levelLeft <= 0 && game.asteroids.length === 0) {
      game.level++;
      game.score += 50 * game.level;
      updateHud();
      showBanner('Level complete!', `+${50 * game.level} bonus`, 1500);
      game.afterBanner = startLevel;
    }
  }

  function render(t, dt) {
    drawBackground(t, dt);
    if (!game) {
      drawPlanet(t, 0);
      return;
    }
    ctx.save();
    if (game.shake > 0) {
      game.shake -= dt;
      const m = Math.max(0, game.shake / 40);
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    drawPlanet(t, (MAX_LIVES - game.lives) / MAX_LIVES);
    for (const a of game.asteroids) drawAsteroid(a);
    drawParticles(dt);
    ctx.restore();
    if (game.flash > 0) {
      game.flash -= dt;
      ctx.fillStyle = `rgba(255, 60, 60, ${Math.max(0, game.flash / 600) * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(50, t - last);
    last = t;
    if (game) update(dt);
    render(t, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ───────────────────────── Answering ─────────────────────────
  function submitAnswer(text) {
    if (!game || game.state !== 'playing' || !text.trim()) return;
    const match = game.asteroids
      .filter((a) => Cards.isCorrect(text, a.answer, opt))
      .sort((a, b) => b.y - a.y)[0];
    if (match) {
      destroy(match);
      return;
    }
    // Wrong answer counts as a miss on the closest meteor.
    const target = game.asteroids.slice().sort((a, b) => b.y - a.y)[0];
    if (target) impact(target, text);
    else flashBar('shake');
  }

  function destroy(a) {
    game.asteroids = game.asteroids.filter((x) => x !== a);
    game.answered++;
    game.correct++;
    const height = 1 - Math.max(0, a.y) / planetTop();
    const pts = Math.round(10 * game.level + 20 * height * game.level);
    game.score += pts;
    burst(a.x, a.y, '#ffcf8a', 26, 0.35);
    burst(a.x, a.y, '#ffffff', 10, 0.25);
    flashBar('good');
    updateHud();
  }

  function impact(a, typed) {
    game.asteroids = game.asteroids.filter((x) => x !== a);
    game.answered++;
    game.lives--;
    game.shake = 400;
    game.flash = 600;
    burst(a.x, planetTop(), '#ff7a4d', 40, 0.45);
    game.craters.push({ x: a.x, r: 14 + Math.random() * 10, d: Math.random() * 30 });
    game.missed.set(a.card, (game.missed.get(a.card) || 0) + 1);
    game.redo.push({ card: a.card, wait: 2 });
    game.levelLeft++; // the missed card has to be answered again this level
    updateHud();

    game.state = 'correcting';
    game.correcting = { asteroid: a, typed, since: performance.now() };
    $('correct-kicker').textContent = typed == null ? 'Impact! Too slow' : 'Impact! Wrong answer';
    $('correct-prompt').textContent = a.prompt;
    $('correct-answer').textContent = a.answer;
    $('correct-yours').textContent = typed || '';
    $('correct-yours-wrap').classList.toggle('hidden', typed == null);
    $('override').classList.toggle('hidden', typed == null);
    $('copy-input').value = '';
    $('answer').value = '';
    showOverlay('correct');
    setTimeout(() => $('copy-input').focus(), 30);
  }

  function finishCorrection() {
    hideOverlay('correct');
    game.correcting = null;
    if (game.lives <= 0) return gameOver(false);
    game.state = 'playing';
    $('answer').focus();
  }

  $('copy-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const { asteroid, since } = game.correcting;
    const typed = $('copy-input').value;
    // Enter on an empty box skips retyping. Ignore it for a moment after the screen
    // opens, so a held-down Enter from the wrong answer doesn't skip it by accident.
    if (!typed.trim()) {
      if (performance.now() - since > 400) finishCorrection();
      return;
    }
    if (Cards.isCorrect(typed, asteroid.answer, opt)) finishCorrection();
    else {
      const input = $('copy-input');
      input.style.borderColor = '#ff8f8f';
      setTimeout(() => (input.style.borderColor = ''), 500);
    }
  });

  $('override').addEventListener('click', () => {
    // Undo the penalty for this miss.
    const { asteroid } = game.correcting;
    game.lives++;
    game.correct++;
    game.score += 10 * game.level;
    game.craters.pop();
    const n = game.missed.get(asteroid.card) - 1;
    n > 0 ? game.missed.set(asteroid.card, n) : game.missed.delete(asteroid.card);
    const i = game.redo.findIndex((r) => r.card === asteroid.card);
    if (i >= 0) game.redo.splice(i, 1);
    game.levelLeft--;
    updateHud();
    finishCorrection();
  });

  function flashBar(cls) {
    const bar = $('answer-form');
    bar.classList.remove('good', 'shake');
    void bar.offsetWidth;
    bar.classList.add(cls);
    setTimeout(() => bar.classList.remove(cls), 350);
  }

  $('answer-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitAnswer($('answer').value);
    $('answer').value = '';
  });

  function updateHud() {
    $('hud-score').textContent = game.score;
    $('hud-level').textContent = game.level;
    $('hud-lives').textContent = '♥'.repeat(Math.max(0, game.lives)) + '♡'.repeat(MAX_LIVES - Math.max(0, game.lives));
  }

  function gameOver(gaveUp) {
    game.state = 'over';
    game.asteroids = [];
    $('banner').classList.add('hidden');
    $('over-title').textContent = gaveUp ? 'You gave up' : 'Game over';
    $('over-score').textContent = game.score;
    $('over-level').textContent = game.level;
    $('over-acc').textContent = game.answered ? Math.round((game.correct / game.answered) * 100) + '%' : '–';
    const missed = [...game.missed.entries()].sort((a, b) => b[1] - a[1]);
    $('over-missed-wrap').classList.toggle('hidden', !missed.length);
    fillCardList($('over-missed'), missed.map(([i]) => set.cards[i]));
    $('over-study').classList.toggle('hidden', !missed.length);
    game.missedCards = missed.map(([i]) => i);
    showOverlay('over');
  }

  function giveUp() {
    if (!game || game.state === 'over') return;
    ['paused', 'correct'].forEach(hideOverlay);
    gameOver(true);
  }

  // ───────────────────────── Pause ─────────────────────────
  function pause() {
    if (!game || ['over', 'correcting', 'paused'].includes(game.state)) return;
    game.prevState = game.state;
    game.state = 'paused';
    showOverlay('paused');
  }
  function resume() {
    if (!game || game.state !== 'paused') return;
    game.state = game.prevState;
    hideOverlay('paused');
    $('answer').focus();
  }
  function quit() {
    game = null;
    ['paused', 'over', 'correct'].forEach(hideOverlay);
    $('banner').classList.add('hidden');
    hooks.onExit();
  }
  $('pause').addEventListener('click', pause);
  $('resume').addEventListener('click', resume);
  $('quit').addEventListener('click', quit);
  $('menu').addEventListener('click', quit);
  $('restart').addEventListener('click', newGame);
  $('p-restart').addEventListener('click', newGame);
  $('giveup').addEventListener('click', giveUp);
  $('p-giveup').addEventListener('click', giveUp);
  $('again').addEventListener('click', newGame);
  $('over-study').addEventListener('click', () => {
    const cards = game.missedCards;
    quit();
    hooks.onStudy(cards);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !game) return;
    game.state === 'paused' ? resume() : pause();
  });
  document.addEventListener('visibilitychange', () => document.hidden && pause());

  return { start };
})();
