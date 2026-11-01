# Study Arcade

Study games for your flashcards. Import cards from any web page, a file, or pasted text, then play.

- **Flashcards**: recall, flip, and rate yourself. Built on spaced repetition, so cards come back right before you'd forget them.
- **Meteor Shower**: meteors carrying terms fall toward your planet. Type the answer before they hit.

## Getting your cards

- **From any web page.** Open a page with flashcards or a term list, such as a flashcard set, a class
  glossary, or a vocabulary table, and click the Study Arcade icon (extension) or bookmark (website). It finds:
  - flashcard data embedded in the page (term/definition, front/back, question/answer, schema.org quizzes)
  - definition lists and two-column tables
  - repeated two-part rows, like most card lists
- **Pick exactly what you want.** Highlight the terms on the page (one per line, like `term - definition`, or
  term and definition on alternating lines) and click the icon. A selection always wins.
- **Paste or open a file.** One card per line, separated by a Tab, ` - `, `:`, `=`, or a comma (CSV is fine).
  The "Export" text from most flashcard sites works as is.

Once a set is loaded, **Copy game link** gives you a URL with the cards packed into it.

## Option 1: Browser extension (Chrome, Brave, Edge)

1. Open `chrome://extensions` (or `brave://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and choose this project's **`app`** folder.
3. Pin **Study Arcade** to the toolbar.

The extension only uses `activeTab`: it can read a page only at the moment you click its icon there, and it has no
access to any site otherwise. Clicking the icon on a page without cards just opens the game.

### Publishing to the Chrome Web Store

```sh
npm run package   # → dist/study-arcade-extension.zip
```

This copies `app/` and removes the local `"key"` from the manifest, since the store assigns its own extension ID.
Bump `version` in `app/manifest.json` for each new upload.

## Option 2: Website

```sh
npm start         # or: node server.js
```

Then open http://localhost:3000. No dependencies are needed (Node 18+). Drag the **🕹️ Study Arcade** button
to your bookmarks bar to import from web pages. The bookmark opens the game at the address you added it from,
so add it again if you host `app/` somewhere else (such as GitHub Pages).

## Studying in groups

Pick a group size (10 by default) and the set is split in order: 1–10, 11–20, and so on. Click the groups you
want (Shift-click picks a range). Both games use only the selected cards. Each group shows a bar of how many of
its cards you know (green) and are still learning (yellow). After finishing a group in Flashcards, you can go
straight to the next one.

## How Flashcards works

- Try to recall the answer, then flip (**Space**) and rate yourself: **1** Didn't know, **2** Unsure, **3** Knew it.
  **Space** flips the card back and forth as often as you like. **Enter** marks the card "Knew it" and goes to the
  next one, even without flipping. With **Type my answers**, Enter submits your answer, then picks the highlighted
  rating ("Knew it" if you were right, "Didn't know" if not).
- "Didn't know" brings the card back after 3 cards and "Unsure" after 7. The session ends when you've marked every
  card "Knew it".
- Your first rating of each card is saved in the browser and schedules its next review: 1 day, 3 days, about a
  week, and so on, growing each time you know it. When cards are due, the menu shows **Review N due cards**.
- Options: show the term or the definition first, or both ways; in order or shuffled; and **Type my answers**,
  where you type the answer before flipping. That's harder, but better for memory.

## Answer checking

Typed answers (Meteor Shower, and Flashcards with **Type my answers**) are checked in two steps:

1. **Exact match**, optionally ignoring accents and capitalization and forgiving small typos. A leading
   "to", "the", "a", or "an" doesn't matter ("to speak" = "speak"). Any one alternative counts when the answer
   lists several, separated by `/`, `;`, or commas and "or" in short lists ("speak, talk" accepts "talk"). If you
   type a list yourself ("talk, speak"), every item in it must be right. Digits and number words are the same
   ("21" = "twenty-one"), but numbers are never typo-forgiven (1066 ≠ 1067). Spacing, hyphens, and "&" vs "and"
   don't matter.
2. **Smart matching** (on by default, free, offline). It compares the key words of your answer and the expected
   one, ignoring word order, filler words, and word endings, so "cell division" matches "the division of a cell".
   An answer that adds or drops "not"/"no"/"never" is never matched.

## How to play Meteor Shower

- Type the answer to any meteor and press **Enter**.
- Pressing Enter with a wrong answer, or letting a meteor land, costs a life (♥). You then type the correct
  answer to continue, or press Enter on the empty box to skip retyping. Missed cards come back soon after.
- Each level adds more and faster meteors. Answering earlier scores more points. **Esc** pauses.
- **↻ Restart** starts over and **⚑ Give up** ends the game and shows your results, including the cards you
  missed, which you can study as flashcards in one click.
- Options: show the term or the definition on the meteors, choose a starting level, ignore accents and
  capitalization, and forgive small typos. In an answer like `big / large`, either word counts, and text in
  (parentheses) can be left out.
