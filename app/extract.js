// Runs ON the page the user is viewing (via the extension icon or the bookmarklet)
// and finds study cards in it. It must stay self-contained: it is serialized with
// toString() / chrome.scripting, so it can't reference anything outside its own body.
//
// Sources, best first:
//   1. Text the user selected ("term - definition" per line): explicit intent wins.
//   2. Quizlet set pages.
//   3. Structured data embedded in the page (JSON with term/definition, front/back,
//      question/answer… and schema.org Quiz markup used by many flashcard sites).
//   4. Definition lists, two-column tables, and repeated two-part rows in the HTML.
//
// Resolves to { title, cards: [[term, def], ...], source } or { error: 'no-cards' }.
async function extractStudyCards() {
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const candidates = [];
  const add = (source, weight, pairs, min) => {
    const seen = new Set();
    const cards = [];
    for (const [a0, b0] of pairs) {
      const a = clean(a0);
      const b = clean(b0);
      if (!a || !b || a === b || a.length > 500 || b.length > 1500) continue;
      const key = a + '\u0000' + b;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push([a, b]);
    }
    if (cards.length >= (min || 2)) candidates.push({ source, cards, score: cards.length * weight });
  };

  const title = () => {
    let t = clean(document.title)
      .split(/\s+[|–—]\s+|\s+-\s+(?=[^-]*$)/)[0]
      .replace(/\s*\b(flash ?cards?|study set)\s*$/i, '')
      .trim();
    if (!t || /captcha|just a moment|attention required/i.test(t)) t = location.hostname.replace(/^www\./, '');
    return t;
  };

  // 1. Selection
  const selected = String(window.getSelection ? window.getSelection() : '').trim();
  if (selected) {
    const lines = selected.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const sep = ['\t', ' - ', ' – ', ' — ', ': ', ' = ', ';', ','].find(
      (s) => lines.filter((l) => l.includes(s)).length >= Math.ceil(lines.length * 0.8)
    );
    if (sep) add('selection', 100, lines.map((l) => [l.slice(0, l.indexOf(sep)), l.slice(l.indexOf(sep) + sep.length)]));
    else if (lines.length >= 4 && lines.length % 2 === 0) {
      // Alternating lines: term, definition, term, definition…
      const pairs = [];
      for (let i = 0; i < lines.length; i += 2) pairs.push([lines[i], lines[i + 1]]);
      add('selection', 100, pairs);
    }
    if (candidates.length) return { title: title(), cards: candidates[0].cards, source: 'selection' };
  }

  const sideText = (side) => {
    const media = (side && side.media) || [];
    const t = media.find((x) => typeof x.plainText === 'string');
    return t ? t.plainText : '';
  };

  // 2. Quizlet set pages
  const qz = /(^|\.)quizlet\.com$/.test(location.hostname) && location.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:flash-cards\/)?(\d{3,})/i);
  if (qz) {
    try {
      const pairs = [];
      let token = null;
      for (let page = 1; page <= 20; page++) {
        const r = await fetch(
          '/webapi/3.4/studiable-item-documents?filters%5BstudiableContainerId%5D=' + qz[1] +
            '&filters%5BstudiableContainerType%5D=1&perPage=1000&page=' + page +
            (token ? '&pagingToken=' + encodeURIComponent(token) : ''),
          { credentials: 'include' }
        );
        const resp = (await r.json()).responses[0];
        const items = resp.models.studiableItem || [];
        items.forEach((it) => pairs.push([sideText(it.cardSides[0]), sideText(it.cardSides[1])]));
        token = resp.paging && resp.paging.token;
        if (!token || items.length < 1000) break;
      }
      add('quizlet', 3, pairs);
    } catch (e) {}
  }

  // 3. Embedded structured data
  const KEY_PAIRS = [
    ['term', 'definition'], ['word', 'definition'], ['front', 'back'], ['question', 'answer'],
    ['prompt', 'answer'], ['term', 'meaning'], ['word', 'meaning'], ['word', 'translation'],
    ['term', 'translation'], ['front_text', 'back_text'], ['fronttext', 'backtext'], ['question_text', 'answer_text'],
  ];
  const asText = (v) => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') return v.text || v.plainText || v.value || v.content || '';
    return '';
  };
  const stripHtml = (s) => (/<[a-z][\s\S]*>/i.test(s) ? new DOMParser().parseFromString(s, 'text/html').body.textContent : s);
  const embedded = [];
  const seenObj = new Set();
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || seenObj.has(o) || depth > 40) return;
    seenObj.add(o);
    if (Array.isArray(o.cardSides) && o.cardSides.length >= 2) {
      embedded.push([sideText(o.cardSides[0]), sideText(o.cardSides[1])]);
      return;
    }
    if (o['@type'] === 'Question' && o.name && o.acceptedAnswer) {
      const ans = [].concat(o.acceptedAnswer)[0];
      embedded.push([o.name, stripHtml(asText(ans))]);
      return;
    }
    if (!Array.isArray(o)) {
      const lower = {};
      for (const k in o) lower[k.toLowerCase()] = o[k];
      for (const [ka, kb] of KEY_PAIRS) {
        const a = asText(lower[ka]);
        const b = asText(lower[kb]);
        if (a && b) {
          embedded.push([stripHtml(a), stripHtml(b)]);
          return;
        }
      }
    }
    for (const k in o) walk(o[k], depth + 1);
  };
  document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"], script#__NEXT_DATA__, script#__NUXT_DATA__').forEach((s) => {
    try { walk(JSON.parse(s.textContent), 0); } catch (e) {}
  });
  add('embedded', 1.6, embedded, 3);

  // 4a. Definition lists (merged: glossaries are often split into one list per letter)
  const listPairs = [];
  document.querySelectorAll('dl').forEach((dl) => {
    let term = null;
    for (const el of dl.querySelectorAll(':scope > dt, :scope > dd, :scope > div > dt, :scope > div > dd')) {
      if (el.tagName === 'DT') term = el.innerText;
      else if (term != null) {
        listPairs.push([term, el.innerText]);
        term = null;
      }
    }
  });
  add('list', 1.3, listPairs, 3);

  // 4b. Tables: the first two columns that aren't just numbers
  document.querySelectorAll('table').forEach((table) => {
    const rows = [...table.rows]
      .filter((row) => row.querySelector('td'))
      .map((row) => [...row.cells].map((c) => clean(c.innerText)));
    const width = Math.max(0, ...rows.map((r) => r.length));
    const cols = [];
    for (let c = 0; c < width && cols.length < 2; c++) {
      const vals = rows.map((r) => r[c]).filter(Boolean);
      const numeric = vals.filter((v) => /^[\d\s.,%°±()\[\]–-]+$/.test(v)).length;
      if (vals.length >= rows.length * 0.6 && numeric < vals.length * 0.8) cols.push(c);
    }
    if (cols.length === 2) add('table', 1.2, rows.map((r) => [r[cols[0]], r[cols[1]]]), 3);
  });

  // 4c. Repeated rows that each contain exactly two blocks of text (card lists).
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'BUTTON', 'NAV', 'HEADER', 'FOOTER', 'TEMPLATE']);
  const textBlocks = (el) => {
    const out = [];
    const visit = (node) => {
      if (SKIP.has(node.tagName) || node.getAttribute('aria-hidden') === 'true') return;
      const kids = [...node.children].filter((k) => !SKIP.has(k.tagName));
      const blockKids = kids.filter((k) => !/^(B|I|EM|STRONG|SPAN|SUB|SUP|U|MARK|SMALL|BR|A|CODE)$/.test(k.tagName) || k.children.length > 1);
      if (!blockKids.length) {
        const t = clean(node.innerText);
        if (t) out.push(t);
        return;
      }
      kids.forEach(visit);
    };
    visit(el);
    return out;
  };
  const sig = (el) => el.tagName + '.' + [...el.classList].sort().join('.');
  document.querySelectorAll('body *').forEach((parent) => {
    if (parent.children.length < 4 || SKIP.has(parent.tagName) || parent.closest('nav, header, footer, table, dl')) return;
    const groups = {};
    for (const c of parent.children) (groups[sig(c)] = groups[sig(c)] || []).push(c);
    const rows = Object.values(groups).sort((a, b) => b.length - a.length)[0];
    if (rows.length < 4) return;
    const pairs = [];
    for (const r of rows) {
      const blocks = textBlocks(r);
      if (blocks.length === 2) pairs.push(blocks);
    }
    if (pairs.length >= rows.length * 0.7) add('rows', 1, pairs, 4);
  });

  if (!candidates.length) return { error: 'no-cards' };
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  return { title: title(), cards: best.cards, source: best.source };
}
