// Card-set helpers: parsing pasted/uploaded term lists, share-link encoding,
// the "Send to Study Arcade" bookmarklet, and answer checking.
const Cards = (() => {
  const SAMPLE = {
    title: 'Sample: Spanish basics',
    cards: [
      ['hola', 'hello'],
      ['adiós', 'goodbye'],
      ['gracias', 'thank you'],
      ['por favor', 'please'],
      ['perro', 'dog'],
      ['gato', 'cat'],
      ['casa', 'house'],
      ['agua', 'water'],
      ['libro', 'book'],
      ['rojo', 'red'],
      ['verde', 'green'],
      ['grande', 'big'],
      ['pequeño', 'small'],
      ['comer', 'to eat'],
      ['beber', 'to drink'],
      ['escuela', 'school'],
    ],
  };

  // One card per line: "term<TAB>definition" (what most flashcard sites export),
  // or "term - definition", "term: definition", "term = definition", CSV, etc.
  const HEADER = /^(term|word|front|question|prompt)s?$/i;

  function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted && ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function parseExport(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
    const seps = ['\t', ' - ', ' – ', ' — ', ' = ', ': ', ';', ','];
    const sep = seps.find((s) => lines.filter((l) => l.includes(s)).length >= Math.ceil(lines.length * 0.8));
    if (!sep) return [];
    const cards = lines
      .map((l) => {
        if (sep === ',') return splitCsvLine(l).slice(0, 2);
        const i = l.indexOf(sep);
        return i < 0 ? null : [l.slice(0, i), l.slice(i + sep.length)];
      })
      .filter((c) => c && c.length === 2)
      .map(([t, d]) => [t.trim(), d.trim()])
      .filter(([t, d]) => t && d);
    if (cards.length && HEADER.test(cards[0][0])) cards.shift();
    return cards;
  }

  // ── Share links: cards packed into the URL hash (deflate + base64url) ──
  function toB64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64Url(str) {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }

  async function encodeSet(set) {
    const json = new TextEncoder().encode(JSON.stringify({ t: set.title, c: set.cards }));
    return 'z' + toB64Url(await pipe(json, new CompressionStream('deflate-raw')));
  }

  async function decodeSet(data) {
    const raw = data[0] === 'z' ? await pipe(fromB64Url(data.slice(1)), new DecompressionStream('deflate-raw')) : fromB64Url(data);
    const obj = JSON.parse(new TextDecoder().decode(raw));
    const cards = (obj.c || []).filter((c) => Array.isArray(c) && c[0] && c[1]).map((c) => [String(c[0]), String(c[1])]);
    return { title: String(obj.t || 'Study set'), cards };
  }

  // ── Bookmarklet: runs extractStudyCards (extract.js) on the page the user is
  // viewing, then opens the game with the cards packed into the URL. ──
  function bookmarkletSource(GAME, extract) {
    extract().then(async (res) => {
      if (res.error) return alert("Study Arcade couldn't find flashcards on this page.\n\nSelect the terms you want (one per line, like \"term - definition\") and click it again.");
      const json = new TextEncoder().encode(JSON.stringify({ t: res.title, c: res.cards }));
      const buf = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      location.href = GAME + '#set=z' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    });
  }

  function bookmarkletHref(gameUrl) {
    const code = `(${bookmarkletSource.toString()})(${JSON.stringify(gameUrl)}, ${extractStudyCards.toString()})`;
    return 'javascript:' + encodeURIComponent(code);
  }

  // ── Answer checking ──
  const UNITS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
  const TENS = 'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');

  // "twenty one" → "21", so digits and number words compare equal.
  function numberWordsToDigits(text) {
    const words = text.split(' ');
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i].toLowerCase();
      const tens = TENS.indexOf(w);
      const unit = UNITS.indexOf(w);
      if (tens >= 0) {
        const next = UNITS.indexOf((words[i + 1] || '').toLowerCase());
        if (next >= 1 && next <= 9) {
          out.push(String((tens + 2) * 10 + next));
          i++;
        } else out.push(String((tens + 2) * 10));
      } else if (unit >= 0) out.push(String(unit));
      else out.push(words[i]);
    }
    return out.join(' ');
  }

  function normalize(s, loose) {
    let out = String(s).trim().replace(/&/g, ' and ');
    if (loose) out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    out = out
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return numberWordsToDigits(out);
  }

  function distance(a, b) {
    if (a === b) return 0;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return prev[b.length];
  }

  // Splits a list of alternatives: "big / large", "big; large", and, when every
  // part is short, "speak, talk" or "happy or glad". Longer definitions that just
  // contain a comma or "or" ("a large, gray animal with a trunk") aren't split.
  function splitAlternatives(text) {
    const out = [];
    for (const part of String(text).split(/\s*[;/]\s*/)) {
      const pieces = part.split(/\s*,\s*|\s+or\s+/i).filter((p) => p.trim());
      const short = pieces.length > 1 && pieces.every((p) => p.trim().split(/\s+/).length <= 3);
      out.push(...(short ? pieces : [part]));
    }
    return out.map((p) => p.trim()).filter(Boolean);
  }

  // Accept the full answer, the answer without (parentheticals), or any one alternative.
  function variants(answer) {
    const base = String(answer);
    const out = new Set([base, base.replace(/\([^)]*\)/g, ' ')]);
    for (const v of [...out]) splitAlternatives(v).forEach((p) => out.add(p));
    return [...out];
  }

  // "to speak" = "speak", "to be happy" = "happy", "the cell" = "cell".
  const stripLead = (s) => s.replace(/^(to be|to|the|a|an) (?=\S)/, '');

  // One typed answer vs one expected alternative, both normalized.
  function sameAnswer(t, a, typos) {
    if (!t || !a) return false;
    if (t === a) return true;
    // Spacing and hyphens don't matter: "well known" = "well-known" = "wellknown".
    const ts = t.replace(/ /g, '');
    const as = a.replace(/ /g, '');
    if (ts === as) return true;
    // Numbers must be exact: 1066 is not 1067.
    if (!typos || /\d/.test(as + ts)) return false;
    const allowed = as.length >= 12 ? 2 : as.length >= 5 ? 1 : 0;
    return distance(as, ts) <= allowed;
  }

  // ── Smart matching: same meaning, different wording ──
  // Compares the meaningful words of each answer, ignoring word order, filler words
  // ("the", "of", "a"…) and word endings ("divides" ≈ "division"), so a definition
  // you phrase your own way still counts if it has the same key ideas.
  const STOPWORDS = new Set(
    ('a an the of to in on for and or is are was were be been being by with as at from that this these those ' +
      'it its which who whom whose into onto than then so such their them they he she his her you your our we ' +
      'i me my also can may might will would should could do does did has have had something someone thing things ' +
      'used use when where what how very just about over under up out').split(' ')
  );
  const SUFFIXES = ['ingly', 'edly', 'ments', 'ment', 'ness', 'ations', 'ation', 'ings', 'ing', 'ions', 'ion', 'ers', 'er', 'ies', 'ied', 'ed', 'es', 'ly', 's', 'e', 'y'];

  function stem(word) {
    for (const suf of SUFFIXES) {
      if (word.length - suf.length >= 3 && word.endsWith(suf)) return word.slice(0, -suf.length);
    }
    return word;
  }

  function keyWords(text) {
    return normalize(text, true)
      .split(' ')
      .filter((w) => w && !STOPWORDS.has(w))
      .map(stem);
  }

  function wordsMatch(a, b) {
    if (a === b) return true;
    if (/\d/.test(a + b)) return false; // numbers must be exact
    const short = Math.min(a.length, b.length);
    if (short >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
    if (short < 4) return false;
    return distance(a, b) <= (short >= 8 ? 2 : 1);
  }

  // How well the typed answer covers the expected one (0–1), plus how much of
  // what was typed is on-topic.
  function closeness(typed, answer) {
    let best = { coverage: 0, precision: 0 };
    const t = keyWords(typed);
    if (!t.length) return best;
    for (const v of variants(answer)) {
      const a = keyWords(v);
      if (!a.length) continue;
      const coverage = a.filter((w) => t.some((x) => wordsMatch(w, x))).length / a.length;
      const precision = t.filter((x) => a.some((w) => wordsMatch(w, x))).length / t.length;
      if (coverage + precision > best.coverage + best.precision) best = { coverage, precision, size: a.length };
    }
    return best;
  }

  // "not alive" must never match "alive".
  const NEGATION = /\b(not|no|never|none|neither|nor|without|cannot|non)\b|n['’]t\b/i;

  function smartMatch(typed, answer) {
    if (NEGATION.test(typed) !== NEGATION.test(answer)) return false;
    const { coverage, precision, size } = closeness(typed, answer);
    if (!size) return false;
    // Short answers need every key word; longer definitions need most of them.
    if (size <= 2) return coverage === 1 && precision >= 0.5;
    return coverage >= 0.7 && precision >= 0.5;
  }

  function isCorrect(typed, answer, { loose = true, typos = true, smart = false } = {}) {
    const prep = (x) => stripLead(normalize(x, loose));
    const t = prep(typed);
    if (!t) return false;
    const expected = variants(answer).map(prep).filter(Boolean);
    const matches = (x) => expected.some((a) => sameAnswer(x, a, typos));
    if (matches(t)) return true;
    // A typed list ("talk, speak", "speak or talk") counts only when every item in it is right.
    const typedParts = splitAlternatives(typed);
    if (typedParts.length > 1) return typedParts.every((part) => matches(prep(part)) || (smart && smartMatch(part, answer)));
    return smart && smartMatch(typed, answer);
  }

  return { SAMPLE, parseExport, encodeSet, decodeSet, bookmarkletHref, isCorrect };
})();
