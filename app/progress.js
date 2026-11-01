// Spaced repetition memory, saved in the browser.
// Each card (keyed by its text, so it's shared across sets and groups) gets a review
// interval that grows each time you know it and resets when you don't, so cards come
// back right before you'd forget them: 1 day, 3 days, ~1 week, ~3 weeks…
const Progress = (() => {
  const KEY = 'studyArcade:progress';
  const DAY = 864e5;
  let db = {};
  try {
    db = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {}

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {}
  }

  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  const cardKey = ([term, def]) => hash(term + '\u0000' + def);
  const get = (card) => db[cardKey(card)] || null;

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  // rating: 'again' (didn't know) | 'hard' (unsure) | 'good' (knew it)
  // Stored fields: i = interval in days, e = ease, r = successful reviews in a row,
  // l = times forgotten, d = due date (ms).
  function review(card, rating) {
    const s = get(card) || { i: 0, e: 2.5, r: 0, l: 0 };
    if (rating === 'again') {
      s.r = 0;
      s.l++;
      s.e = Math.max(1.3, s.e - 0.2);
      s.i = 1;
    } else if (rating === 'hard') {
      s.e = Math.max(1.3, s.e - 0.15);
      s.i = s.r === 0 ? 1 : Math.max(s.i + 1, Math.round(s.i * 1.2));
      s.r++;
    } else {
      s.i = s.r === 0 ? 1 : s.r === 1 ? 3 : Math.round(s.i * s.e);
      s.r++;
    }
    s.d = startOfToday() + s.i * DAY;
    db[cardKey(card)] = s;
    save();
  }

  const isDue = (card) => {
    const s = get(card);
    return !!s && s.d <= Date.now();
  };

  // 0 = never studied, 1 = learning, 2 = known (passed with a gap of 3+ days)
  function strength(card) {
    const s = get(card);
    if (!s) return 0;
    return s.r >= 2 && s.i >= 3 ? 2 : 1;
  }

  return { hash, review, isDue, strength };
})();
