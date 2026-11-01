// Study Arcade menu: loading a set, picking which groups of cards to study,
// choosing a game, and starting it.
(() => {
  const { $, status, fillCardList, showScreen } = UI;

  // Running as the browser extension's page rather than from the web server.
  const EXT = location.protocol === 'chrome-extension:';
  document.body.classList.toggle('ext', EXT);

  const SET_KEY = 'studyArcade:lastSet';
  const PREFS_KEY = 'studyArcade:prefs';
  const groupsKey = () => 'studyArcade:groups:' + setId;

  let set = null; // { title, cards: [[term, def], ...] }
  let setId = '';
  let groupSize = 10;
  let selected = new Set([0]); // selected group numbers (0-based)
  let mode = 'flashcards';

  const load = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const store = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  };

  // ───────────────────────── Options ─────────────────────────
  const OPTION_IDS = ['opt-fc-direction', 'opt-fc-order', 'opt-fc-typing', 'opt-prompt', 'opt-level', 'opt-accents', 'opt-typos', 'opt-smart'];

  function readOptions() {
    return {
      direction: $('opt-fc-direction').value,
      order: $('opt-fc-order').value,
      typing: $('opt-fc-typing').checked,
      promptSide: $('opt-prompt').value,
      startLevel: Number($('opt-level').value),
      loose: $('opt-accents').checked,
      typos: $('opt-typos').checked,
      smart: $('opt-smart').checked,
    };
  }

  function savePrefs() {
    const prefs = { mode, groupSize };
    for (const id of OPTION_IDS) prefs[id] = $(id).type === 'checkbox' ? $(id).checked : $(id).value;
    store(PREFS_KEY, prefs);
  }

  function restorePrefs() {
    const prefs = load(PREFS_KEY, {});
    for (const id of OPTION_IDS) {
      if (!(id in prefs)) continue;
      if ($(id).type === 'checkbox') $(id).checked = prefs[id];
      else $(id).value = prefs[id];
    }
    if (prefs.mode) setMode(prefs.mode);
    if (prefs.groupSize) groupSize = prefs.groupSize;
  }

  OPTION_IDS.forEach((id) => $(id).addEventListener('change', savePrefs));

  function setMode(m) {
    mode = m;
    document.querySelectorAll('.mode-tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
    $('opts-flashcards').classList.toggle('hidden', m !== 'flashcards');
    $('opts-meteor').classList.toggle('hidden', m !== 'meteor');
    $('start').textContent = m === 'flashcards' ? 'Study' : 'Play';
  }
  document.querySelectorAll('.mode-tab').forEach((t) =>
    t.addEventListener('click', () => {
      setMode(t.dataset.mode);
      savePrefs();
    })
  );

  // ───────────────────────── Groups ─────────────────────────
  const groupCount = () => Math.ceil(set.cards.length / groupSize);
  const groupRange = (g) => [g * groupSize, Math.min(set.cards.length, (g + 1) * groupSize)];
  const groupLabel = (g) => {
    const [a, b] = groupRange(g);
    return b - a === 1 ? `${a + 1}` : `${a + 1}–${b}`;
  };

  function selectedCards() {
    const out = [];
    [...selected].sort((a, b) => a - b).forEach((g) => {
      const [a, b] = groupRange(g);
      for (let i = a; i < b; i++) out.push(i);
    });
    return out;
  }

  let lastClicked = 0;
  function renderGroups() {
    const box = $('groups');
    box.innerHTML = '';
    const n = groupCount();
    if (document.activeElement !== $('group-size')) $('group-size').value = groupSize;
    $('group-size').max = set.cards.length;
    $('group-summary').textContent = n === 1 ? '1 group' : `${n} groups`;
    for (let g = 0; g < n; g++) {
      const [a, b] = groupRange(g);
      const counts = [0, 0, 0];
      for (let i = a; i < b; i++) counts[Progress.strength(set.cards[i])]++;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (selected.has(g) ? ' on' : '');
      chip.title = `${counts[2]} known · ${counts[1]} learning · ${counts[0]} new`;
      const label = document.createElement('span');
      label.textContent = groupLabel(g);
      const bar = document.createElement('span');
      bar.className = 'chip-bar';
      const known = document.createElement('i');
      known.className = 'known';
      known.style.width = (counts[2] / (b - a)) * 100 + '%';
      const learning = document.createElement('i');
      learning.className = 'learning';
      learning.style.width = (counts[1] / (b - a)) * 100 + '%';
      bar.append(known, learning);
      chip.append(label, bar);
      chip.addEventListener('click', (e) => {
        if (e.shiftKey) {
          // Shift-click selects every group between the last click and this one.
          const [lo, hi] = [Math.min(lastClicked, g), Math.max(lastClicked, g)];
          for (let i = lo; i <= hi; i++) selected.add(i);
        } else if (selected.has(g)) selected.delete(g);
        else selected.add(g);
        lastClicked = g;
        selectionChanged();
      });
      box.append(chip);
    }
    selectionChanged(false);
  }

  function selectionChanged(rerender = true) {
    if (rerender) return renderGroups();
    store(groupsKey(), { size: groupSize, groups: [...selected] });
    const cards = selectedCards();
    $('selected-count').textContent = cards.length
      ? `${cards.length} of ${set.cards.length} cards selected`
      : 'Pick at least one group';
    $('start').disabled = !cards.length;
    fillCardList($('card-preview'), cards.map((i) => set.cards[i]), cards.map((i) => i + 1));
    const due = set.cards.filter((c) => Progress.isDue(c)).length;
    $('review-due').classList.toggle('hidden', !due);
    $('review-due').textContent = `Review ${due} due card${due === 1 ? '' : 's'}`;
  }

  // Applied while typing (not on blur), so clicking a group right after typing a size works.
  $('group-size').addEventListener('input', () => {
    const n = Math.round(Number($('group-size').value));
    if (!n || n < 1) return;
    const size = Math.min(set.cards.length, n);
    if (size === groupSize) return;
    groupSize = size;
    selected = new Set([0]);
    lastClicked = 0;
    savePrefs();
    renderGroups();
  });
  $('group-size').addEventListener('change', () => ($('group-size').value = groupSize));
  $('groups-all').addEventListener('click', () => {
    selected = new Set([...Array(groupCount()).keys()]);
    renderGroups();
  });
  $('groups-none').addEventListener('click', () => {
    selected = new Set();
    renderGroups();
  });

  // ───────────────────────── Starting games ─────────────────────────
  function backToMenu() {
    showScreen('setup');
    renderGroups(); // progress bars may have changed
  }

  function play(gameMode, cards) {
    const opt = readOptions();
    if (gameMode === 'meteor') {
      Meteor.start(set, cards, opt, { onExit: backToMenu, onStudy: (c) => play('flashcards', c) });
    } else {
      Flashcards.start(set, cards, opt, {
        onExit: backToMenu,
        onMeteor: (c) => play('meteor', c),
        nextGroup: () => nextGroupAfter(cards),
      });
    }
  }

  // After finishing a group, offer the one right after the last group studied.
  function nextGroupAfter(cards) {
    const last = Math.floor(cards[cards.length - 1] / groupSize);
    const g = last + 1;
    if (g >= groupCount() || cards.length !== selectedCards().length) return null;
    return {
      label: groupLabel(g),
      start: () => {
        selected = new Set([g]);
        renderGroups();
        play('flashcards', selectedCards());
      },
    };
  }

  $('start').addEventListener('click', () => play(mode, selectedCards()));
  $('review-due').addEventListener('click', () => {
    const due = set.cards.map((c, i) => (Progress.isDue(c) ? i : -1)).filter((i) => i >= 0);
    play('flashcards', due);
  });

  // ───────────────────────── Loading a set ─────────────────────────
  function useSet(newSet, { remember = true } = {}) {
    if (!newSet.cards.length) return false;
    set = newSet;
    setId = Progress.hash(JSON.stringify(set.cards));
    if (remember) store(SET_KEY, set);
    const saved = load(groupsKey(), null);
    if (saved && saved.size) {
      groupSize = saved.size;
      selected = new Set(saved.groups.filter((g) => g < groupCount()));
    } else {
      groupSize = Math.min(groupSize, set.cards.length) || 10;
      selected = new Set([0]);
    }
    $('set-title').textContent = set.title;
    $('set-count').textContent = `${set.cards.length} cards`;
    $('load-area').classList.add('hidden');
    $('set-area').classList.remove('hidden');
    status($('share-status'), '');
    renderGroups();
    return true;
  }

  function usePasted(text, title) {
    const cards = Cards.parseExport(text);
    if (!cards.length) {
      return status($('load-status'), 'Couldn\'t read any cards. Put one card per line, like "term - definition".', 'error');
    }
    status($('load-status'), '');
    useSet({ title, cards });
  }

  $('load-sample').addEventListener('click', (e) => {
    e.preventDefault();
    useSet(structuredClone(Cards.SAMPLE));
  });

  $('paste-load').addEventListener('click', () => usePasted($('paste-input').value, 'My study set'));

  $('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    $('paste-input').value = text;
    usePasted(text, file.name.replace(/\.[^.]+$/, ''));
    e.target.value = '';
  });

  $('change-set').addEventListener('click', () => {
    $('set-area').classList.add('hidden');
    $('load-area').classList.remove('hidden');
    history.replaceState(null, '', location.pathname + location.search);
  });

  $('share').addEventListener('click', async () => {
    const url = location.origin + location.pathname + '#set=' + (await Cards.encodeSet(set));
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      status(
        $('share-status'),
        EXT ? 'Game link copied. It opens this set for anyone who has the Study Arcade extension installed.' : 'Game link copied. Anyone who opens it gets this exact set.',
        'ok'
      );
    } catch {
      status($('share-status'), 'Copy the link from the address bar to share this game.', 'ok');
    }
  });

  const bm = $('bookmarklet');
  if (!EXT) bm.href = Cards.bookmarkletHref(location.origin + location.pathname);
  bm.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Drag this button to your bookmarks bar, then click it on any page with flashcards or a term list.');
  });

  async function loadFromHash() {
    if (location.hash === '#notice=no-cards') {
      status($('load-status'), "Couldn't find flashcards on that page. Highlight the terms you want there and click the icon again, or paste them below.", 'error');
      history.replaceState(null, '', location.pathname + location.search);
      return false;
    }
    const m = location.hash.match(/^#set=(.+)$/);
    if (!m) return false;
    try {
      return useSet(await Cards.decodeSet(m[1]));
    } catch (err) {
      status($('load-status'), 'That game link looks broken or incomplete.', 'error');
      return false;
    }
  }

  window.addEventListener('hashchange', () => {
    showScreen('setup');
    loadFromHash();
  });

  // AI grading was removed; delete any API key it saved in this browser.
  localStorage.removeItem('studyArcade:ai');

  restorePrefs();
  (async () => {
    if (await loadFromHash()) return;
    const saved = load(SET_KEY, null);
    if (saved && saved.cards && saved.cards.length) useSet(saved, { remember: false });
  })();
})();
