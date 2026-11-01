// Flashcards: recall the answer, flip, and rate yourself honestly.
// - "Didn't know" brings the card back in a few cards, "Unsure" a bit later,
//   "Knew it" retires it for this session.
// - Your first rating of each card feeds spaced repetition (progress.js), so the
//   menu can tell you which cards are due for review on later days.
// - Optional typing mode makes you produce the answer instead of just recognizing it.
const Flashcards = (() => {
  const { $, shuffle, fillCardList, showScreen, showOverlay, hideOverlay } = UI;
  const RATINGS = ['again', 'hard', 'good'];
  const REINSERT = { again: 3, hard: 7 }; // how many cards later a card comes back

  let set = null;
  let opt = null;
  let hooks = {}; // { onExit(), onMeteor(cardIndexes), nextGroup() -> { label, start() } | null }
  let s = null; // session

  function start(newSet, cardIndexes, options, callbacks) {
    set = newSet;
    opt = options;
    hooks = callbacks;
    const order = opt.order === 'shuffle' ? shuffle(cardIndexes.slice()) : cardIndexes.slice();
    let queue = order.map((card) => ({ card, reverse: opt.direction === 'def' }));
    if (opt.direction === 'both') queue = queue.concat(order.map((card) => ({ card, reverse: true })));
    s = {
      cards: cardIndexes,
      queue,
      total: queue.length,
      done: 0,
      first: new Map(), // card -> first rating this session
      current: null,
      flipped: false,
      suggested: null,
    };
    hideOverlay('study-done');
    showScreen('study');
    next();
  }

  function next() {
    if (!s.queue.length) return finish();
    s.current = s.queue.shift();
    s.flipped = false;
    // What Enter does once the answer is showing: "Knew it", or with typing on, the
    // rating suggested by whether the typed answer was right.
    s.suggested = opt.typing ? null : 'good';
    // Snap the card back to its front instantly, before the new text goes in, so the
    // next card's answer never shows during an un-flip animation.
    const card = $('fc-card');
    card.classList.add('no-anim');
    card.classList.remove('flipped');
    void card.offsetWidth; // apply the instant reset before re-enabling the animation
    card.classList.remove('no-anim');
    const [term, def] = set.cards[s.current.card];
    $('fc-front').textContent = s.current.reverse ? def : term;
    $('fc-back').textContent = s.current.reverse ? term : def;
    $('fc-front-label').textContent = s.current.reverse ? 'Definition' : 'Term';
    $('fc-back-label').textContent = s.current.reverse ? 'Term' : 'Definition';
    $('fc-verdict').textContent = '';
    $('fc-verdict').className = 'fc-verdict';
    $('fc-type').classList.toggle('hidden', !opt.typing);
    $('fc-show').classList.toggle('hidden', opt.typing);
    $('fc-keys-front').classList.toggle('hidden', opt.typing);
    $('fc-rate').classList.add('hidden');
    RATINGS.forEach((r) => $('rate-' + r).classList.remove('suggested'));
    $('fc-input').value = '';
    if (opt.typing) setTimeout(() => $('fc-input').focus(), 30);
    else $('fc-show').focus();
    updateProgress();
  }

  function flip() {
    if (!s || s.flipped) return;
    s.flipped = true;
    $('fc-card').classList.add('flipped');
    $('fc-type').classList.add('hidden');
    $('fc-show').classList.add('hidden');
    $('fc-keys-front').classList.add('hidden');
    $('fc-rate').classList.remove('hidden');
    if (s.suggested) $('rate-' + s.suggested).classList.add('suggested');
    $('fc-input').blur();
  }

  // After the first reveal, flipping just turns the card over and back.
  function toggleFlip() {
    if (!s || !s.current) return;
    if (!s.flipped) return flip();
    $('fc-card').classList.toggle('flipped');
  }

  function checkTyped() {
    const typed = $('fc-input').value;
    if (!typed.trim()) return;
    const [term, def] = set.cards[s.current.card];
    const answer = s.current.reverse ? term : def;
    const right = Cards.isCorrect(typed, answer, opt);
    s.suggested = right ? 'good' : 'again';
    const v = $('fc-verdict');
    v.textContent = right ? '✓ Correct' : `✗ You typed: ${typed}`;
    v.className = 'fc-verdict ' + (right ? 'right' : 'wrong');
    flip();
  }

  function rate(rating) {
    if (!s || !s.current) return;
    const { card } = s.current;
    if (!s.first.has(card)) {
      s.first.set(card, rating);
      Progress.review(set.cards[card], rating);
    }
    if (rating === 'good') s.done++;
    else s.queue.splice(Math.min(REINSERT[rating], s.queue.length), 0, s.current);
    next();
  }

  function updateProgress() {
    $('fc-progress-bar').style.width = (s.done / s.total) * 100 + '%';
    $('fc-progress-text').textContent = `${s.done} / ${s.total} learned`;
    $('fc-left').textContent = `${s.queue.length + 1} to go`;
  }

  function finish() {
    s.current = null;
    $('fc-progress-bar').style.width = '100%';
    const firstTry = s.cards.filter((c) => s.first.get(c) === 'good');
    const practice = s.cards.filter((c) => s.first.has(c) && s.first.get(c) !== 'good');
    $('done-first').textContent = firstTry.length;
    $('done-practice').textContent = practice.length;
    $('done-total').textContent = s.cards.length;
    $('done-practice-wrap').classList.toggle('hidden', !practice.length);
    fillCardList($('done-practice-list'), practice.map((c) => set.cards[c]));
    $('done-again-missed').classList.toggle('hidden', !practice.length);
    s.practice = practice;
    const nextGroup = hooks.nextGroup && hooks.nextGroup();
    $('done-next').classList.toggle('hidden', !nextGroup);
    if (nextGroup) $('done-next').textContent = `Next group: ${nextGroup.label} →`;
    s.nextGroup = nextGroup;
    showOverlay('study-done');
  }

  function exit() {
    s = null;
    hideOverlay('study-done');
    hooks.onExit();
  }

  // ── Controls ──
  $('fc-card').addEventListener('click', () => (!opt.typing || s.flipped) && toggleFlip());
  $('fc-show').addEventListener('click', flip);
  $('fc-type').addEventListener('submit', (e) => {
    e.preventDefault();
    checkTyped();
  });
  $('fc-skip-typing').addEventListener('click', () => {
    s.suggested = 'again';
    flip();
  });
  RATINGS.forEach((r) => $('rate-' + r).addEventListener('click', () => rate(r)));
  $('fc-exit').addEventListener('click', () => (s && s.done < s.total && s.done > 0 ? finish() : exit()));
  $('done-menu').addEventListener('click', exit);
  $('done-again').addEventListener('click', () => start(set, s.cards, opt, hooks));
  $('done-again-missed').addEventListener('click', () => start(set, s.practice, opt, hooks));
  $('done-meteor').addEventListener('click', () => {
    const cards = s.cards;
    hideOverlay('study-done');
    s = null;
    hooks.onMeteor(cards);
  });
  $('done-next').addEventListener('click', () => s.nextGroup.start());

  document.addEventListener('keydown', (e) => {
    if (!s || !s.current || $('study').classList.contains('hidden')) return;
    if (e.target === $('fc-input')) return; // typing an answer
    if (e.key === 'Escape') return $('fc-exit').click();
    // Space: flip the card over and back, as often as you like.
    if (e.key === ' ') {
      e.preventDefault();
      if (!opt.typing || s.flipped) toggleFlip();
      return;
    }
    // Enter: "Knew it" and on to the next card (with typing, the suggested rating).
    if (e.key === 'Enter') {
      e.preventDefault();
      if (s.suggested) rate(s.suggested);
      return;
    }
    const byKey = s.flipped && { 1: 'again', 2: 'hard', 3: 'good' }[e.key];
    if (byKey) rate(byKey);
  });

  return { start };
})();
