# Sasha-English
English words and exercises for Sasha

Published at https://karin4a-lab.github.io/Sasha-English/ (version 8).

## Source files

`index.html` loads `data.js`, `learning-v8.js`, `visuals-v8.js`, `app-v8.js`, and
`styles-v8.css`. These versioned filenames prevent mixing old scripts/styles with
new HTML. `app.js` and `styles.css` are retained for older cached pages; they are
not the current application. `sw.js` retires the previous cache worker.

## Adding school words and topics

Edit `data.js` only to add content. The sections, topic buttons, counts, practice
questions, letter tasks, progress screen, matching game, and daily lessons are
generated from `LESSONS`; there is no fixed word count or hardcoded topic menu.

Keep existing lesson IDs and English spellings stable so existing progress keys
(`lessonId::en`) keep their identity. New topics need unique stable lesson IDs.
Words may optionally use a globally unique stable `id`; do not add or change an
ID on an existing word without migrating its old progress key. Do not delete
existing words when appending a new school photograph's vocabulary.

Each word needs `en` and `ru`, and may have an `icon`. Preposition illustrations
are SVG scenes selected by the English word; other/new words use their icon.
An optional `visual` selects an existing scene or `false` disables it. An optional
`family` groups synonymous answers so a quiz does not falsely penalize an equally
valid translation. Other illustrations can be added in `visuals-v8.js`.

## Learning rules

Mastery requires two correct translation/listening checks and two correct letter
tasks on at least two distinct Moscow dates since the most recent mistake.
"Помню", correct game pairs, and answers with hints do not prove mastery.
"Не знаю" and submitted wrong answers reset both counters and the successful days.
Letter slots remain editable until the explicit "Проверить" button is pressed.
For short words the bank includes distractors. Duplicate letters are separate
tokens; spaces, hyphens, and punctuation stay visible.

The daily lesson prioritizes difficult and overdue words, chooses tasks based on
missing proof, and normally introduces up to three new words per Moscow day.
With a larger difficult-word backlog it introduces fewer new words. Failed tasks
return after three intervening tasks, and learned words are scheduled after
1, 3, 7, and 14 days. Optional early practice does not advance the review interval.

The Today widget and topics remain on the main screen. Time accrues only in a
nonempty visible study view, stops after 60 seconds of inactivity, supports
manual pause, and does not catch up after a suspended/backgrounded page.
Today's previously accumulated time counts toward the ten-minute goal.

Version 8 migrates valid v3 progress and old daily totals once into new storage
keys, leaving old data intact. Export/import merges whole word records by newest
result timestamp and takes the maximum time per day, rather than adding duplicate
copies. Backups preserve records for future words; adding vocabulary does not
erase progress. Storage failures leave practice usable and show a save-copy note.

## Verification

No installation or build is required. Run with a supported Node.js runtime:

```sh
node --test tests/*.test.cjs
```

The tests cover the pure learning rules and UI events using a small DOM model.
They do not replace a visual browser check. Publish all changed files atomically
in one Git commit so GitHub Pages receives a consistent version.

