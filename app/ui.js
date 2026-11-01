// Small DOM helpers shared by the menu and the games.
const UI = (() => {
  const $ = (id) => document.getElementById(id);

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function status(el, msg, kind) {
    el.textContent = msg;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  // cards: [[term, def], ...]; numbers: optional card numbers shown before each row
  function fillCardList(ul, cards, numbers) {
    ul.innerHTML = '';
    cards.forEach(([t, d], i) => {
      const li = document.createElement('li');
      const a = document.createElement('span');
      const b = document.createElement('span');
      if (numbers) {
        const n = document.createElement('span');
        n.className = 'num';
        n.textContent = numbers[i];
        li.append(n);
        li.classList.add('numbered');
      }
      a.textContent = t;
      b.textContent = d;
      li.append(a, b);
      ul.append(li);
    });
  }

  const SCREENS = ['setup', 'game', 'study'];
  function showScreen(name) {
    SCREENS.forEach((s) => $(s).classList.toggle('hidden', s !== name));
  }
  function showOverlay(name) {
    $(name).classList.remove('hidden');
  }
  function hideOverlay(name) {
    $(name).classList.add('hidden');
  }

  return { $, shuffle, status, fillCardList, showScreen, showOverlay, hideOverlay };
})();
