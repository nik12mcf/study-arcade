// Chrome extension service worker.
// Clicking the toolbar icon reads study cards from the page you're viewing
// (thanks to "activeTab", only that page, only on click) and opens the game with them.
importScripts('extract.js', 'cards.js');

const GAME = chrome.runtime.getURL('index.html');

async function openGame(hash) {
  await chrome.tabs.create({ url: hash ? GAME + hash : GAME });
}

chrome.action.onClicked.addListener(async (tab) => {
  let res = null;
  try {
    const [frame] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractStudyCards });
    res = frame && frame.result;
  } catch (err) {
    // Browser pages (chrome://, the Web Store…) can't be read: just open the game.
  }
  if (res && res.cards) return openGame('#set=' + (await Cards.encodeSet(res)));
  openGame(res ? '#notice=no-cards' : '');
});
