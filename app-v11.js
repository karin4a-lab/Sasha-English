'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PROGRESS_KEY = 'sashaEnglishProgressV4', DAY_KEY = 'sashaEnglishDailyV2', META_KEY = 'sashaEnglishPracticeV1';
const IDLE_MS = 60000, GOAL_SECONDS = 600;
let cachedMinute = -1, cachedDay = '';
const todayKey = () => {
  const minute = Math.floor(Date.now() / 60000);
  if (minute !== cachedMinute) { cachedMinute = minute; cachedDay = Learning.todayKey(); }
  return cachedDay;
};
const allWords = () => Learning.allWords(LESSONS);
const wordsForLesson = id => Learning.lessonWords(LESSONS, id);
const wordKey = Learning.wordKey;
let storageWarning = '', progress, daily, meta;
function readSaved(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch {
      localStorage.setItem(key + 'Recovery', raw);
      storageWarning = 'Старые данные не удалось прочитать. Их копия сохранена в браузере; новая тренировка доступна.';
      return null;
    }
  } catch {
    storageWarning = 'Браузер не сохраняет прогресс. После занятия сохрани копию на экране «Прогресс и копия».';
    return null;
  }
}
function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { storageWarning = 'Браузер не сохраняет прогресс. После занятия сохрани копию на экране «Прогресс и копия».'; }
  $('#storageNotice').textContent = storageWarning;
  $('#storageNotice').classList.toggle('hidden', !storageWarning);
}
function loadProgress() {
  const v4 = readSaved(PROGRESS_KEY);
  if (v4 !== null) return Learning.normalizeProgress(v4);
  const v3 = readSaved('sashaEnglishProgressV3');
  if (Learning.isObject(v3) && Object.keys(v3).length) return Learning.normalizeProgress(v3);
  const old = readSaved('sashaEnglishProgressV2');
  const migrated = Object.create(null);
  if (Learning.isObject(old)) for (const [key, r] of Object.entries(old)) {
    if (!Learning.isObject(r)) continue;
    migrated[key] = { ...Learning.baseRec(), status: r.status === 'learned' ? 'reinforce' : r.status,
      wrong: Learning.safeNumber(r.wrong), seen: r.status !== 'new' };
  }
  return Learning.normalizeProgress(migrated);
}
function normalizeMeta(raw) {
  const out = Object.create(null);
  if (!Learning.isObject(raw)) return out;
  for (const [day, value] of Object.entries(raw)) {
    if (!Learning.validDay(day) || !Learning.isObject(value)) continue;
    const keys = name => [...new Set(Array.isArray(value[name]) ? value[name].filter(k => typeof k === 'string' && k.length <= 300) : [])];
    const attempts = Object.create(null);
    if (Learning.isObject(value.attempts)) for (const [key, count] of Object.entries(value.attempts)) {
      if (key.length <= 300 && !['__proto__', 'constructor', 'prototype'].includes(key)) attempts[key] = Learning.safeNumber(count);
    }
    out[day] = { attempts, introduced: keys('introduced'), touched: keys('touched'),
      correct: Learning.safeNumber(value.correct), wrong: Learning.safeNumber(value.wrong),
      hinted: Learning.safeNumber(value.hinted), pairs: Learning.safeNumber(value.pairs) };
  }
  return out;
}
progress = loadProgress();
daily = Learning.normalizeDaily(readSaved(DAY_KEY) ?? readSaved('sashaEnglishDailyV1'));
meta = normalizeMeta(readSaved(META_KEY));
let currentLesson = null, currentWords = [], currentSource = 'all', cardIndex = 0, currentCard = null;
let currentMode = 'cards', currentView = 'home', session = null;
let quizItem = null, quizState = null, quizTurn = 0, buildItem = null, buildState = null, matchState = null;
let manualQueues = { quiz: [], build: [] }, lastPracticeKey = '', pendingBackup = null;
let lastActivity = 0, timerLastTick = Date.now(), timerDay = todayKey(), timerCarry = 0, timerPaused = false;
function saveProgress() { persist(PROGRESS_KEY, progress); }
function saveDaily() { persist(DAY_KEY, daily); }
function saveMeta() { persist(META_KEY, meta); }
function dayMeta() {
  const day = todayKey();
  if (!meta[day]) meta[day] = { attempts: Object.create(null), introduced: [], touched: [], correct: 0, wrong: 0, hinted: 0, pairs: 0 };
  return meta[day];
}
function getRec(w) { return Learning.getRec(progress, w, todayKey()); }
function statusOf(w) { return getRec(w).status; }
function statusLabel(s) { return s === 'learned' ? 'Выучено' : s === 'reinforce' ? 'Закрепить' : 'Новое'; }
function noteTouch(w) {
  const key = wordKey(w), m = dayMeta();
  if (!m.touched.includes(key)) m.touched.push(key);
  if (session) session.touched.add(key);
}
function introduce(w) {
  const m = dayMeta(), key = wordKey(w);
  if (!m.introduced.includes(key)) m.introduced.push(key);
  saveMeta();
}
function observeCard(w) {
  const r = getRec(w);
  if (!r.seen) introduce(w);
  r.seen = true;
  r.last = Date.now();
  progress[wordKey(w)] = r;
  noteTouch(w);
  saveProgress(); saveMeta();
}
function recordResult(w, type, correct, hinted = false) {
  progress[wordKey(w)] = Learning.result(getRec(w), type, correct, todayKey(), Date.now(), hinted);
  noteTouch(w);
  const m = dayMeta();
  if (['quiz', 'build'].includes(type) || (type === 'cards' && !correct)) {
    const key = wordKey(w); m.attempts[key] = (m.attempts[key] || 0) + 1;
  }
  if (!correct) { m.wrong++; if (session) session.wrong++; }
  else if (hinted) { m.hinted++; if (session) session.hinted++; }
  else if (['quiz', 'build'].includes(type)) { m.correct++; if (session) session.correct++; }
  saveProgress(); saveMeta(); renderCounts(); updateProgressPill();
}
function filteredWords(filter) {
  return allWords().filter(w => !['learned', 'reinforce'].includes(filter) || statusOf(w) === filter);
}
function counts() {
  const words = allWords();
  return { all: words.length, reinforce: words.filter(w => statusOf(w) === 'reinforce').length, learned: words.filter(w => statusOf(w) === 'learned').length };
}
function renderCounts() {
  const c = counts();
  $('#allCount').textContent = c.all; $('#reinforceCount').textContent = c.reinforce; $('#learnedCount').textContent = c.learned;
  $('#streak').textContent = `${c.learned} ⭐`;
}
function renderHome() {
  renderCounts(); renderDaily();
  $('#topicGrid').innerHTML = LESSONS.map(l => {
    const words = wordsForLesson(l.id), known = words.filter(w => statusOf(w) === 'learned').length;
    return `<button class="topic-card" data-id="${esc(l.id)}"><span class="topic-icon" aria-hidden="true">${esc(l.icon || '🔤')}</span><span class="topic-meta"><span class="topic-title">${esc(l.title)}</span><span class="topic-sub">${l.words.length} слов</span><span class="topic-progress">${known}/${l.words.length} выучено</span></span><span aria-hidden="true">›</span></button>`;
  }).join('');
  $$('.topic-card').forEach(b => b.onclick = () => openLesson(b.dataset.id));
  const p = Learning.createPlan(allWords(), progress, todayKey(), dayMeta().introduced, dayMeta().attempts);
  $('#dailyButtonTitle').textContent = dailySeconds() >= GOAL_SECONDS ? 'Продолжить занятие' : 'Занятие на сегодня';
  $('#dailyPlanText').textContent = p.reviewCount || p.newCount ? `${p.reviewCount} на повторение · ${p.newCount} новых · задания чередуются` : 'Повторим знакомые слова и проверим их по-разному';
  $('#startDailyBtn').disabled = allWords().length === 0;
  selectLibrary(currentSource);
}
function selectLibrary(filter) {
  currentSource = filter;
  $$('.library-tab').forEach(b => { b.classList.toggle('active', b.dataset.filter === filter); b.setAttribute('aria-pressed', String(b.dataset.filter === filter)); });
  const map = { all: ['🔤', 'Повторить все слова', 'Все слова подряд'], reinforce: ['🎯', 'Закрепить', 'Слова для повторения'], learned: ['✓', 'Выучено', 'Проверить знакомые слова'] };
  const [icon, title, sub] = map[filter], n = filteredWords(filter).length;
  $('#practiceIcon').textContent = icon; $('#practiceTitle').textContent = title;
  $('#practiceSub').textContent = n ? `${sub} · ${n}` : filter === 'all' ? 'Добавим слова из школьных тем' : 'Сейчас здесь нет слов';
}
function showView(view) {
  currentView = view;
  for (const id of ['home', 'study', 'summary', 'progress']) $('#' + id + 'View').classList.toggle('hidden', id !== view);
  timerLastTick = Date.now(); timerCarry = 0;
  if (view === 'study') touchActivity(); else lastActivity = 0;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function newSession(automatic) {
  return { automatic, day: todayKey(), startSeconds: dailySeconds(), touched: new Set(), correct: 0, wrong: 0, hinted: 0,
    queue: [], retries: [], recent: [], step: 0, keepGoing: dailySeconds() >= GOAL_SECONDS, task: null };
}
function openLibrary() {
  openStudy({ title: currentSource === 'all' ? 'Все слова' : statusLabel(currentSource), type: 'Общий словарь', words: filteredWords(currentSource) });
}
function openLesson(id) {
  const l = LESSONS.find(x => x.id === id);
  if (l) openStudy({ title: l.title, type: l.type || 'Школьная тема', words: wordsForLesson(id) });
}
function openStudy(source, automatic = false) {
  tickTimer();
  currentLesson = source; currentWords = [...source.words]; cardIndex = 0; manualQueues = { quiz: [], build: [] }; lastPracticeKey = '';
  session = newSession(automatic); timerPaused = false;
  $('#topicTitle').textContent = source.title; $('#topicType').textContent = source.type;
  const empty = currentWords.length === 0;
  $('#emptyState').classList.toggle('hidden', !empty); $('#studyContent').classList.toggle('hidden', empty);
  $('.mode-tabs').classList.toggle('hidden', automatic || empty);
  $('#dailyStudyBanner').classList.toggle('hidden', !automatic || empty);
  $('#studyTools').classList.toggle('hidden', empty);
  $('#openMatchBtn').classList.toggle('hidden', automatic);
  if (empty) {
    $('#emptyTitle').textContent = source.title === 'Закрепить' ? 'Всё закреплено' : 'Здесь пока пусто';
    $('#emptyText').textContent = 'Можно открыть весь словарь или выбрать тему.';
  }
  showView('study'); updateProgressPill(); renderDaily();
  if (!empty) automatic ? nextDailyTask() : setMode('cards');
}
function startDaily() { openStudy({ title: 'Занятие на сегодня', type: 'Весь словарь', words: allWords() }, true); }
function updateProgressPill() {
  if (!currentLesson) return;
  $('#progressPill').textContent = `${currentWords.filter(w => statusOf(w) === 'learned').length}/${currentWords.length} ✓`;
}
function setMode(mode, word = null) {
  currentMode = mode;
  $$('.mode').forEach(b => { b.classList.toggle('active', b.dataset.mode === mode); b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });
  for (const name of ['cards', 'quiz', 'build', 'match']) $('#' + name + 'Mode').classList.toggle('hidden', name !== mode);
  if (mode === 'cards') renderCard(word || currentWords[cardIndex]);
  if (mode === 'quiz') newQuiz(word);
  if (mode === 'build') newBuild(word);
  if (mode === 'match') newMatch();
  touchActivity();
}
function renderCard(w = currentWords[cardIndex]) {
  if (!w) return;
  currentCard = w;
  const status = statusOf(w);
  $('#cardVisual').innerHTML = Visuals.word(w); $('#word').textContent = w.en; $('#translation').textContent = w.ru;
  $('#wordStatus').textContent = statusLabel(status); $('#wordStatus').className = 'status-chip ' + status;
  $('#soundBtn').disabled = !canSpeak();
  $('#counter').textContent = session?.automatic ? 'Знакомство со словом' : `${cardIndex + 1} из ${currentWords.length}`;
}
function markCard(knows) {
  if (!currentCard || currentView !== 'study' || currentMode !== 'cards') return;
  const w = currentCard;
  knows ? observeCard(w) : recordResult(w, 'cards', false);
  taskFinished(w, 'cards', knows);
  if (session?.automatic) nextDailyTask(); else { cardIndex = (cardIndex + 1) % currentWords.length; renderCard(); }
}
function taskFinished(w, mode, correct, hinted = false) {
  if (!session) return;
  session.step++; session.recent.push(wordKey(w)); session.recent = session.recent.slice(-5);
  if (session.automatic && (!correct || hinted)) {
    const key = wordKey(w);
    session.queue = session.queue.filter(t => t.key !== key);
    session.retries = session.retries.filter(t => t.key !== key);
    session.retries.push({ key, mode: mode === 'cards' ? 'quiz' : mode, after: session.step + 3 });
  } else if (!session.automatic && !correct && ['quiz', 'build'].includes(mode)) {
    const q = manualQueues[mode].filter(key => key !== wordKey(w));
    q.splice(Math.min(3, q.length), 0, wordKey(w)); manualQueues[mode] = q;
  }
}
function nextDailyTask() {
  if (!session?.automatic || !currentWords.length) return;
  if (session.day !== todayKey()) { session.day = todayKey(); session.startSeconds = 0; session.queue = []; session.retries = []; session.keepGoing = false; }
  if (dailySeconds() >= GOAL_SECONDS && !session.keepGoing) { showSummary(); return; }
  const byKey = new Map(currentWords.map(w => [wordKey(w), w]));
  const waitingKeys = new Set(session.retries.filter(t => t.after > session.step).map(t => t.key));
  const available = key => byKey.has(key) && Learning.dailyAvailable(byKey.get(key), progress, todayKey(), dayMeta().attempts);
  session.retries = session.retries.filter(t => available(t.key));
  session.queue = session.queue.filter(t => available(t.key) && !waitingKeys.has(t.key));
  if (!session.queue.length) session.queue = Learning.createPlan(currentWords, progress, todayKey(), dayMeta().introduced, dayMeta().attempts).tasks.filter(t => !waitingKeys.has(t.key));
  const recent = new Set(session.recent.slice(-Math.min(3, Math.max(0, currentWords.length - 1))));
  let task, index = session.retries.findIndex(t => t.after <= session.step && !recent.has(t.key));
  if (index >= 0) task = session.retries.splice(index, 1)[0];
  else {
    index = session.queue.findIndex(t => !recent.has(t.key));
    if (index >= 0) task = session.queue.splice(index, 1)[0];
    else if (session.queue.length) task = session.queue.shift();
  }
  if (!task) {
    // Never restart a completed tiny pool merely to fill the timer.
    showSummary();
    $('#summaryNote').textContent = 'Все запланированные слова на сегодня проверены. Следующее повторение — в другой день.';
    return;
  }
  const w = byKey.get(task.key);
  if (!w) return;
  session.task = task;
  if (task.fresh || (task.mode === 'cards' && !getRec(w).seen)) introduce(w);
  $('#dailyTaskNote').textContent = task.mode === 'cards' ? 'Новое слово · познакомься и послушай' : task.mode === 'build' ? 'Вставь буквы · затем нажми «Проверить»' : 'Проверим перевод или понимание на слух';
  setMode(task.mode, w);
}
function pickPracticeWord(mode) {
  if (!currentWords.length) return null;
  if (!manualQueues[mode].length) manualQueues[mode] = Learning.shuffle(currentWords)
    .sort((a, b) => Number(statusOf(b) === 'reinforce') - Number(statusOf(a) === 'reinforce')).map(wordKey);
  let index = manualQueues[mode].findIndex(key => key !== lastPracticeKey);
  if (index < 0) index = 0;
  const key = manualQueues[mode].splice(index, 1)[0]; lastPracticeKey = key;
  return currentWords.find(w => wordKey(w) === key) || currentWords[0];
}
function canSpeak() { return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function'; }
function speak(text, onError = null) {
  if (!canSpeak()) { if (onError) onError(); return; }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB'; utterance.rate = .82;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang === 'en-GB') || voices.find(v => /^en[-_]/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.onerror = () => { if (onError) onError(); };
    window.speechSynthesis.speak(utterance);
  } catch { if (onError) onError(); }
}
function wordFamily(w) { return w.family || (['by', 'next to'].includes(w.en) ? 'nearby' : w.ru); }
function quizOptions(w) {
  const pool = Learning.shuffle(allWords().filter(o => wordKey(o) !== wordKey(w) && wordFamily(o) !== wordFamily(w)));
  const sameTopic = pool.filter(o => o.lessonId === w.lessonId), others = pool.filter(o => o.lessonId !== w.lessonId);
  const unique = [], used = new Set([w.ru, w.en]);
  for (const o of [...sameTopic, ...others]) {
    if (used.has(o.ru) || used.has(o.en)) continue;
    unique.push(o); used.add(o.ru); used.add(o.en);
    if (unique.length === 3) break;
  }
  return Learning.shuffle([w, ...unique]);
}
function newQuiz(word = null) {
  quizItem = word || pickPracticeWord('quiz');
  if (!quizItem) return;
  const kinds = canSpeak() ? ['en-ru', 'ru-en', 'audio'] : ['en-ru', 'ru-en'];
  quizState = { kind: kinds[quizTurn++ % kinds.length], answered: false };
  $('#quizFeedback').textContent = ''; $('#quizExplain').classList.add('hidden'); $('#nextQuizBtn').classList.add('hidden');
  const kind = quizState.kind;
  $('#quizLabel').textContent = kind === 'audio' ? 'Послушай и выбери перевод' : kind === 'ru-en' ? 'Выбери английское слово' : 'Выбери перевод';
  $('#quizWord').textContent = kind === 'audio' ? 'Слово на слух' : kind === 'ru-en' ? quizItem.ru : quizItem.en;
  $('#quizWord').classList.toggle('ru', kind === 'ru-en');
  $('#quizSoundBtn').classList.toggle('hidden', kind === 'ru-en' || !canSpeak());
  $('#quizOptions').innerHTML = quizOptions(quizItem).map(o => `<button class="option" data-key="${esc(wordKey(o))}">${esc(kind === 'ru-en' ? o.en : o.ru)}</button>`).join('');
  $$('#quizOptions .option').forEach(b => b.onclick = () => answerQuiz(b));
  if (kind === 'audio') playQuizAudio();
}
function playQuizAudio() {
  const item = quizItem, state = quizState;
  if (!item) return;
  speak(item.en, () => {
    if (quizState === state && state.kind === 'audio' && !state.answered) {
      state.kind = 'en-ru'; $('#quizLabel').textContent = 'Озвучка недоступна · выбери перевод'; $('#quizWord').textContent = item.en;
    }
  });
}
function answerQuiz(button) {
  if (!quizItem || !quizState || quizState.answered || currentMode !== 'quiz' || currentView !== 'study') return;
  quizState.answered = true;
  const correct = button.dataset.key === wordKey(quizItem);
  $$('#quizOptions .option').forEach(b => { b.disabled = true; if (b.dataset.key === wordKey(quizItem)) b.classList.add('correct'); });
  if (!correct) button.classList.add('wrong');
  $('#quizFeedback').textContent = correct ? 'Верно ✓' : 'Нужно повторить';
  $('#quizFeedback').style.color = correct ? 'var(--good)' : 'var(--bad)';
  $('#quizExplain').innerHTML = `${Visuals.word(quizItem)}<div>${esc(quizItem.en)} — ${esc(quizItem.ru)}</div>`;
  $('#quizExplain').classList.remove('hidden');
  $('#quizSoundBtn').classList.toggle('hidden', !canSpeak());
  recordResult(quizItem, 'quiz', correct); taskFinished(quizItem, 'quiz', correct);
  $('#nextQuizBtn').classList.remove('hidden');
}
function newBuild(word = null) {
  buildItem = word || pickPracticeWord('build');
  if (!buildItem) return;
  buildState = Learning.makeBuild(buildItem, getRec(buildItem));
  $('#buildPrompt').textContent = buildItem.ru; $('#buildVisual').innerHTML = Visuals.word(buildItem);
  $('#buildFeedback').textContent = ''; $('#nextBuildBtn').classList.add('hidden'); $('#hintNote').classList.add('hidden');
  $('#checkBuildBtn').classList.remove('hidden'); renderBuild();
}
function renderBuild() {
  const s = buildState;
  if (!s) return;
  const letters = Learning.chosenLetters(s);
  let groups = '', group = '';
  s.chars.forEach((char, i) => {
    if (char === ' ') { if (group) groups += `<span class="word-group">${group}</span>`; group = ''; return; }
    const slot = s.hidden.indexOf(i);
    if (slot < 0) group += `<span class="fixed-letter">${esc(char)}</span>`;
    else {
      const resultClass = s.checked ? (letters[slot] === s.answers[slot] ? 'correct' : 'wrong') : s.active === slot ? 'active' : '';
      group += `<button class="blank ${resultClass}" data-slot="${slot}" aria-label="Пропуск ${slot + 1}: ${esc(letters[slot] || 'пусто')}" aria-pressed="${s.active === slot}" ${s.checked ? 'disabled' : ''}>${esc(letters[slot] || '_')}</button>`;
    }
  });
  if (group) groups += `<span class="word-group">${group}</span>`;
  $('#maskedWord').innerHTML = groups;
  $$('#maskedWord .blank').forEach(b => b.onclick = () => { s.active = Number(b.dataset.slot); renderBuild(); });
  $('#letterBank').innerHTML = s.bank.map(t => `<button class="letter-btn ${s.chosen.includes(t.id) ? 'used' : ''}" data-id="${t.id}" aria-label="Буква ${t.letter}${s.chosen.includes(t.id) ? ', уже в слове' : ''}" ${s.checked ? 'disabled' : ''}>${t.letter}</button>`).join('');
  $$('#letterBank .letter-btn').forEach(b => b.onclick = () => chooseLetter(Number(b.dataset.id)));
  $('#checkBuildBtn').disabled = s.checked || !Learning.buildReady(s);
  $('#removeLetterBtn').disabled = s.checked || s.chosen[s.active] === null;
  $('#clearBuildBtn').disabled = s.checked || s.chosen.every(id => id === null);
  $('#buildHintBtn').disabled = s.checked || Learning.buildCorrect(s);
  $('#hintNote').classList.toggle('hidden', !s.hinted);
}
function chooseLetter(id) {
  if (Learning.assignToken(buildState, buildState?.active, id)) renderBuild();
}
function clearBuild() {
  if (!buildState || buildState.checked) return;
  buildState.chosen = buildState.chosen.map(() => null); buildState.active = 0; renderBuild();
}
function checkBuild() {
  const s = buildState;
  if (!s || s.checked || !Learning.buildReady(s) || currentMode !== 'build' || currentView !== 'study') return;
  const correct = Learning.buildCorrect(s);
  s.checked = true; renderBuild();
  $('#checkBuildBtn').classList.add('hidden');
  $('#buildFeedback').textContent = correct ? s.hinted ? 'Верно. Потренируемся ещё без подсказки.' : 'Верно ✓' : `Правильно: ${buildItem.en}`;
  $('#buildFeedback').style.color = correct ? 'var(--good)' : 'var(--bad)';
  recordResult(buildItem, 'build', correct, s.hinted); taskFinished(buildItem, 'build', correct, s.hinted);
  $('#nextBuildBtn').classList.remove('hidden');
}
function newMatch() {
  const unique = [], families = new Set();
  for (const w of Learning.shuffle(currentWords)) {
    if (families.has(wordFamily(w))) continue;
    families.add(wordFamily(w)); unique.push(w);
    if (unique.length === 3) break;
  }
  matchState = { words: unique, matched: new Set(), english: null, russian: null };
  $('#matchFeedback').textContent = ''; $('#nextMatchBtn').classList.add('hidden');
  renderMatch();
}
function renderMatch() {
  const s = matchState;
  if (!s) return;
  // Keep each column's order stable during a round.
  if (!s.englishOrder) s.englishOrder = Learning.shuffle(s.words);
  if (!s.russianOrder) s.russianOrder = Learning.shuffle(s.words);
  for (const side of ['english', 'russian']) {
    const selector = side === 'english' ? '#matchEnglish' : '#matchRussian';
    $(selector).innerHTML = s[side + 'Order'].map(w => {
      const key = wordKey(w), matched = s.matched.has(key), selected = s[side] === key;
      return `<button class="match-option ${matched ? 'matched' : selected ? 'selected' : ''}" data-key="${esc(key)}" ${matched ? 'disabled' : ''}>${esc(side === 'english' ? w.en : w.ru)}${matched ? ' ✓' : ''}</button>`;
    }).join('');
    $$(selector + ' .match-option').forEach(b => b.onclick = () => chooseMatch(side, b.dataset.key));
  }
}
function chooseMatch(side, key) {
  const s = matchState;
  if (!s || s.matched.has(key) || currentMode !== 'match') return;
  s[side] = key;
  if (s.english && s.russian) {
    const w = s.words.find(x => wordKey(x) === s.english);
    if (s.english === s.russian) {
      s.matched.add(s.english); observeCard(w);
      dayMeta().pairs++; if (session) session.pairs = (session.pairs || 0) + 1;
      saveMeta(); $('#matchFeedback').textContent = 'Верная пара ✓'; $('#matchFeedback').style.color = 'var(--good)';
    } else {
      recordResult(w, 'match', false);
      $('#matchFeedback').textContent = `${w.en} — ${w.ru}`; $('#matchFeedback').style.color = 'var(--bad)';
    }
    s.english = null; s.russian = null;
  }
  renderMatch();
  if (s.matched.size === s.words.length) {
    $('#matchFeedback').textContent = 'Все пары найдены ✓'; $('#nextMatchBtn').classList.remove('hidden');
  }
}
function formatDay(day) {
  if (!Learning.validDay(day)) return '';
  return new Date(day + 'T12:00:00+03:00').toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short' });
}
function progressRow(w) {
  const r = getRec(w), status = statusLabel(r.status);
  const checkText = `Тест ${Math.min(2, r.quizCorrect)}/2 · Буквы ${Math.min(2, r.buildCorrect)}/2 · Дни ${Math.min(2, r.days.length)}/2`;
  const next = r.nextReview ? r.nextReview <= todayKey() ? 'Пора повторить' : `Повторение ${formatDay(r.nextReview)}` : 'Первое знакомство впереди';
  return `<div class="progress-row"><div class="progress-row-head"><strong>${esc(w.en)}</strong><span class="status-chip ${r.status}">${status}</span></div><div class="progress-translation">${esc(w.ru)}</div><div class="progress-checks">${checkText}<br>${next}</div></div>`;
}
const stat = (number, label) => `<div class="stat"><strong>${esc(number)}</strong>${esc(label)}</div>`;
function showSummary() {
  if (!session) { goHome(); return; }
  tickTimer();
  if (canSpeak()) window.speechSynthesis.cancel();
  const goalDone = dailySeconds() >= GOAL_SECONDS;
  $('#summaryTitle').textContent = goalDone ? 'Норма на сегодня выполнена' : 'Занятие завершено';
  $('#summaryNote').textContent = goalDone ? `Сегодня ${fmt(dailySeconds())} активного английского.` : `Сегодня ${fmt(dailySeconds())} из 10 минут. Можно продолжить позже.`;
  $('#summaryStats').innerHTML = stat(fmt(session.seconds || 0), 'в этом занятии') + stat(session.touched.size, 'слов в занятии') + stat(session.correct, 'верных проверок');
  const checkedWords = allWords().filter(w => session.touched.has(wordKey(w)));
  $('#summaryWords').innerHTML = `<p class="small-note">Ошибок: ${session.wrong} · Ответов с подсказкой: ${session.hinted}</p>` + checkedWords.map(progressRow).join('');
  showView('summary'); renderDaily();
}
function continueSession() {
  if (!session || !currentWords.length) { startDaily(); return; }
  session.keepGoing = true; timerPaused = false;
  showView('study');
  if (session.automatic) nextDailyTask();
  else setMode(currentMode);
}
function goHome() {
  tickTimer();
  if (canSpeak()) window.speechSynthesis.cancel();
  session = null; currentLesson = null; currentWords = [];
  showView('home'); renderHome();
}
function renderProgress() {
  const m = dayMeta(), activeKeys = new Set(allWords().map(wordKey));
  $('#progressToday').textContent = `Сегодня ${fmt(dailySeconds())}`;
  $('#dayStats').innerHTML = stat(fmt(dailySeconds()), 'активного времени') + stat(m.touched.filter(k => activeKeys.has(k)).length, 'слов в занятиях') + stat(m.correct, 'верных проверок');
  $('#wordProgressList').innerHTML = LESSONS.map(l => `<h3 class="progress-topic">${esc(l.title)}</h3>` + wordsForLesson(l.id).map(progressRow).join('')).join('');
}
function openProgress() { tickTimer(); showView('progress'); renderProgress(); }
function exportProgress() {
  try {
    const content = { format: 'sasha-english-progress', version: 4, exportedAt: new Date().toISOString(), progress, daily, meta };
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `sasha-english-progress-${todayKey()}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#backupMessage').textContent = 'Копия готова к сохранению.';
  } catch { $('#backupMessage').textContent = 'Не удалось сохранить копию. Попробуй открыть сайт в обычном браузере.'; }
}
async function readBackupFile(event) {
  const file = event.target.files?.[0]; pendingBackup = null;
  $('#importProgressBtn').classList.add('hidden');
  if (!file) return;
  try {
    if (file.size > 2000000) throw new Error('Файл слишком большой для копии прогресса.');
    const payload = JSON.parse(await file.text());
    Learning.mergeBackup({ progress, daily }, payload, todayKey());
    pendingBackup = payload;
    $('#backupMessage').textContent = `В копии ${Object.keys(payload.progress).length} записей слов. При объединении сохранятся более новые результаты; время за один день не суммируется.`;
    $('#importProgressBtn').classList.remove('hidden');
  } catch (error) { $('#backupMessage').textContent = error instanceof SyntaxError ? 'Файл не удалось прочитать. Выбери копию в формате JSON.' : error.message; }
  event.target.value = '';
}
function importProgress() {
  if (!pendingBackup) return;
  try {
    const merged = Learning.mergeBackup({ progress, daily }, pendingBackup, todayKey());
    progress = merged.progress; daily = merged.daily;
    const incomingMeta = normalizeMeta(pendingBackup.meta);
    for (const [day, r] of Object.entries(incomingMeta)) {
      const existing = meta[day];
      if (!existing) { meta[day] = r; continue; }
      for (const [key, count] of Object.entries(r.attempts)) existing.attempts[key] = Math.max(existing.attempts[key] || 0, count);
      for (const field of ['introduced', 'touched']) existing[field] = [...new Set([...existing[field], ...r[field]])];
      for (const field of ['correct', 'wrong', 'hinted', 'pairs']) existing[field] = Math.max(existing[field], r[field]);
    }
    saveProgress(); saveDaily(); saveMeta(); renderCounts(); renderDaily(); renderProgress();
    $('#backupMessage').textContent = 'Копия загружена. Прогресс объединён.';
    pendingBackup = null; $('#importProgressBtn').classList.add('hidden');
  } catch (error) { $('#backupMessage').textContent = error.message; }
}
function dailySeconds() { return Math.floor(Number(daily[todayKey()] || 0)); }
function fmt(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function hasTask() {
  return currentView === 'study' && currentWords.length > 0 && !$('#studyContent').classList.contains('hidden')
    && (currentMode !== 'match' || (matchState && matchState.matched.size < matchState.words.length));
}
function renderTimer() {
  const available = hasTask(), idle = Date.now() - lastActivity >= IDLE_MS;
  $('#timerToggleBtn').disabled = !available;
  $('#timerToggleBtn').textContent = timerPaused || idle ? 'Продолжить' : 'Пауза';
  $('#timerState').textContent = !available ? 'Время начнётся вместе с заданием' : timerPaused ? 'Пауза. Нажми «Продолжить», когда будешь готов.' : idle ? 'Пауза после минуты без действий. Нажми на задание, чтобы продолжить.' : dailySeconds() >= GOAL_SECONDS ? 'Норма выполнена. Можно закончить текущее задание.' : 'Считаем время занятия; при бездействии таймер остановится.';
}
function renderDaily() {
  const seconds = dailySeconds(), percent = Math.min(100, Math.floor(seconds / GOAL_SECONDS * 100));
  $('#dailyTime').textContent = `${fmt(seconds)} / 10:00`; $('#studyDailyTime').textContent = `${fmt(seconds)} / 10:00`;
  $('#dailyPercent').textContent = `${percent}%`; $('#dailyRing').style.setProperty('--p', `${percent * 3.6}deg`);
  $('#dailyNote').textContent = seconds >= GOAL_SECONDS ? 'Норма на сегодня выполнена ✓' : 'Минимум 10 минут английского в день';
  renderTimer();
}
function tickTimer(now = Date.now()) {
  const previous = timerLastTick, elapsed = now - previous;
  timerLastTick = now;
  const day = todayKey();
  if (timerDay !== day) {
    timerDay = day; timerCarry = 0;
    if (session?.automatic) { session.day = day; session.queue = []; session.retries = []; session.keepGoing = false; }
  } else if (elapsed > 0 && elapsed <= 3000 && hasTask() && document.visibilityState === 'visible' && !timerPaused) {
    const activeUntil = Math.min(now, lastActivity + IDLE_MS);
    const activeMilliseconds = Math.max(0, activeUntil - previous);
    timerCarry += activeMilliseconds / 1000;
    const seconds = Math.floor(timerCarry);
    if (seconds > 0) {
      timerCarry -= seconds;
      daily[day] = Math.min(86400, (daily[day] || 0) + seconds);
      if (session) session.seconds = (session.seconds || 0) + seconds;
      saveDaily();
    }
  }
  renderDaily();
}
function touchActivity(event) {
  if (event?.target?.closest?.('#timerToggleBtn')) return;
  if (currentView !== 'study' || document.visibilityState !== 'visible') return;
  tickTimer(); lastActivity = Date.now(); renderTimer();
}
function toggleTimer() {
  tickTimer();
  const idle = Date.now() - lastActivity >= IDLE_MS;
  timerPaused = idle || timerPaused ? false : true;
  lastActivity = Date.now(); timerLastTick = Date.now(); renderTimer();
}
$('#backBtn').onclick = () => session && (session.touched.size || session.seconds) ? showSummary() : goHome();
$('#emptyBackBtn').onclick = goHome;
$('#startDailyBtn').onclick = startDaily;
$('#soundBtn').onclick = () => currentCard && speak(currentCard.en);
$('#quizSoundBtn').onclick = playQuizAudio;
$('#knowBtn').onclick = () => markCard(true);
$('#againBtn').onclick = () => markCard(false);
$('#nextQuizBtn').onclick = () => session?.automatic ? nextDailyTask() : newQuiz();
$('#nextBuildBtn').onclick = () => session?.automatic ? nextDailyTask() : newBuild();
$('#checkBuildBtn').onclick = checkBuild;
$('#removeLetterBtn').onclick = () => { if (buildState && Learning.assignToken(buildState, buildState.active, null)) renderBuild(); };
$('#clearBuildBtn').onclick = clearBuild;
$('#buildHintBtn').onclick = () => { if (Learning.hint(buildState)) renderBuild(); };
$('#openMatchBtn').onclick = () => setMode('match');
$('#nextMatchBtn').onclick = newMatch;
$('#finishSessionBtn').onclick = showSummary;
$('#continueSessionBtn').onclick = continueSession;
$('#summaryHomeBtn').onclick = goHome;
$('#openProgressBtn').onclick = openProgress;
$('#progressBackBtn').onclick = goHome;
$('#exportProgressBtn').onclick = exportProgress;
$('#chooseBackupBtn').onclick = () => $('#backupFile').click();
$('#backupFile').onchange = readBackupFile;
$('#importProgressBtn').onclick = importProgress;
$('#timerToggleBtn').onclick = toggleTimer;
$$('.mode').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$$('.library-tab').forEach(b => b.onclick = () => selectLibrary(b.dataset.filter));
$('#practiceSelected').onclick = openLibrary;
document.addEventListener('pointerdown', touchActivity, { capture: true, passive: true });
document.addEventListener('keydown', touchActivity, { capture: true });
document.addEventListener('visibilitychange', () => { tickTimer(); lastActivity = 0; timerLastTick = Date.now(); renderTimer(); });
window.addEventListener('pagehide', () => { tickTimer(); saveDaily(); saveProgress(); saveMeta(); });
setInterval(tickTimer, 1000);
saveProgress(); saveDaily(); saveMeta(); renderHome();
