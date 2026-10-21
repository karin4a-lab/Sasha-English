/* Shared, browser-independent rules. Word and lesson IDs are stable across updates. */
const Learning = (() => {
  const INTERVALS = [1, 3, 7, 14];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const safeNumber = n => Number.isFinite(Number(n)) ? Math.max(0, Math.min(1000000, Math.floor(Number(n)))) : 0;
  const isObject = o => !!o && typeof o === 'object' && !Array.isArray(o);
  function validDay(day) {
    if (typeof day !== 'string' || !DATE_RE.test(day)) return false;
    const d = new Date(day + 'T12:00:00Z');
    return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === day;
  }
  function todayKey(now = Date.now()) {
    return new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
  }
  function addDays(day, count) {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + count);
    return d.toISOString().slice(0, 10);
  }
  const wordKey = w => w.id || `${w.lessonId}::${w.en}`;
  function lessonWords(lessons, id) {
    const lesson = lessons.find(l => l.id === id);
    return lesson ? lesson.words.map(w => ({ ...w, lessonId: lesson.id, lessonTitle: lesson.title })) : [];
  }
  function allWords(lessons) {
    const unique = new Map();
    for (const lesson of lessons) for (const word of lessonWords(lessons, lesson.id)) {
      if (!unique.has(wordKey(word))) unique.set(wordKey(word), word);
    }
    return [...unique.values()];
  }
  function baseRec() {
    return { status: 'new', quizCorrect: 0, buildCorrect: 0, days: [], wrong: 0, seen: false,
      nextReview: null, reviewStage: 0, lastReviewDay: '', lastMode: '', last: 0 };
  }
  function qualifies(r) {
    return r.quizCorrect >= 2 && r.buildCorrect >= 2 && new Set(r.days).size >= 2;
  }
  function normalizeRec(input, day = todayKey()) {
    const raw = isObject(input) ? input : {};
    const r = baseRec();
    for (const k of ['quizCorrect', 'buildCorrect', 'wrong']) r[k] = safeNumber(raw[k]);
    r.days = [...new Set(Array.isArray(raw.days) ? raw.days.filter(validDay) : [])].sort().slice(-40);
    r.last = Number.isFinite(Number(raw.last)) ? Math.max(0, Number(raw.last)) : 0;
    r.seen = Boolean(raw.seen || r.quizCorrect || r.buildCorrect || r.wrong || raw.status === 'learned');
    r.lastMode = ['quiz', 'build'].includes(raw.lastMode) ? raw.lastMode : '';
    r.reviewStage = Math.min(INTERVALS.length, safeNumber(raw.reviewStage));
    r.lastReviewDay = validDay(raw.lastReviewDay) ? raw.lastReviewDay : '';
    // A v3 card marked "Не знаю" could leave an otherwise complete series behind.
    if (raw.status === 'reinforce' && qualifies(r)) {
      r.quizCorrect = 0;
      r.buildCorrect = 0;
      r.days = [];
      r.reviewStage = 0;
    }
    r.status = qualifies(r) ? 'learned' : (r.quizCorrect || r.buildCorrect || r.wrong || raw.status === 'reinforce' ? 'reinforce' : 'new');
    r.nextReview = validDay(raw.nextReview) ? raw.nextReview : (r.status === 'new' ? null : day);
    return r;
  }
  function normalizeProgress(input, day = todayKey()) {
    const out = Object.create(null);
    if (!isObject(input)) return out;
    for (const [key, value] of Object.entries(input)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || key.length > 300 || !isObject(value)) continue;
      out[key] = normalizeRec(value, day);
    }
    return out;
  }
  function result(input, type, correct, day = todayKey(), now = Date.now(), hinted = false) {
    const r = normalizeRec(input, day);
    r.seen = true;
    r.last = now;
    if (!correct) {
      r.wrong += 1;
      r.quizCorrect = 0;
      r.buildCorrect = 0;
      r.days = [];
      r.status = 'reinforce';
      r.reviewStage = 0;
      r.lastMode = '';
      r.lastReviewDay = day;
      r.nextReview = addDays(day, 1);
      return r;
    }
    // Self-ratings, games, and answers helped by a hint do not prove mastery.
    if (!['quiz', 'build'].includes(type) || hinted) return r;
    const wasLearned = r.status === 'learned';
    r[type === 'quiz' ? 'quizCorrect' : 'buildCorrect'] += 1;
    if (!r.days.includes(day)) r.days.push(day);
    r.lastMode = type;
    r.status = qualifies(r) ? 'learned' : 'reinforce';
    if (r.status !== 'learned') {
      r.nextReview = addDays(day, 1);
    } else if (!wasLearned) {
      r.reviewStage = 1;
      r.nextReview = addDays(day, INTERVALS[0]);
    } else if (r.lastReviewDay !== day && (!r.nextReview || r.nextReview <= day)) {
      r.reviewStage = Math.min(INTERVALS.length, Math.max(1, r.reviewStage) + 1);
      r.nextReview = addDays(day, INTERVALS[r.reviewStage - 1]);
    }
    r.lastReviewDay = day;
    return r;
  }
  const getRec = (progress, w, day) => normalizeRec(progress[wordKey(w)], day);
  function nextMode(r) {
    if (r.quizCorrect < 2 || r.buildCorrect < 2) {
      if (r.quizCorrect !== r.buildCorrect) return r.quizCorrect < r.buildCorrect ? 'quiz' : 'build';
    }
    return r.lastMode === 'quiz' ? 'build' : 'quiz';
  }
  // Rest a word after enough evidence today, or six attempts including errors/hints.
  // Existing progress also rests words already over-practised by older versions.
  function dailyAvailable(w, progress, day, attempts = {}) {
    const r = getRec(progress, w, day);
    return safeNumber(attempts[wordKey(w)]) < 6
      && !(r.days.includes(day) && r.quizCorrect >= 2 && r.buildCorrect >= 2)
      && !(r.status === 'learned' && r.lastReviewDay === day);
  }
  function createPlan(words, progress, day, introduced = [], attempts = {}) {
    words = words.filter(w => dailyAvailable(w, progress, day, attempts));
    const seenToday = new Set(introduced);
    const hard = words.filter(w => getRec(progress, w, day).status === 'reinforce');
    const due = words.filter(w => {
      const r = getRec(progress, w, day);
      return r.status === 'learned' && (!r.nextReview || r.nextReview <= day);
    });
    const familiar = words.filter(w => {
      const r = getRec(progress, w, day);
      return r.status === 'new' && r.seen;
    });
    const fresh = words.filter(w => {
      const r = getRec(progress, w, day);
      return r.status === 'new' && !r.seen;
    });
    const newLimit = Math.max(0, 6 - hard.length - due.length - familiar.length);
    // Interleave topics so a long new list of numbers does not postpone pronouns.
    const buckets = [...new Set(fresh.map(w => w.lessonId))].map(id => ({ id, words: fresh.filter(w => w.lessonId === id) }));
    const rotation = buckets.length ? Math.floor(new Date(day + 'T12:00:00Z').valueOf() / 86400000) % buckets.length : 0;
    const ordered = [...buckets.slice(rotation), ...buckets.slice(0, rotation)];
    const introducedIn = id => words.filter(w => w.lessonId === id && seenToday.has(wordKey(w))).length;
    ordered.sort((a, b) => introducedIn(a.id) - introducedIn(b.id));
    const newWords = [], remaining = newLimit;
    while (newWords.length < remaining && ordered.some(b => b.words.length)) {
      for (const bucket of ordered) {
        if (bucket.words.length && newWords.length < remaining) newWords.push(bucket.words.shift());
      }
    }
    const priority = [...hard, ...due, ...familiar].sort((a, b) => {
      const ra = getRec(progress, a, day), rb = getRec(progress, b, day);
      const da = ra.nextReview || day, db = rb.nextReview || day;
      return da.localeCompare(db) || ra.last - rb.last;
    });
    const tasks = priority.slice(0, 6).map(w => ({ key: wordKey(w), mode: nextMode(getRec(progress, w, day)) }));
    for (const mode of ['cards', 'quiz', 'build']) {
      for (const w of newWords) tasks.push({ key: wordKey(w), mode, fresh: mode === 'cards' });
    }
    return { tasks, reviewCount: priority.length, newCount: newWords.length };
  }
  function shuffle(list, random = Math.random) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function makeBuild(word, rec = baseRec(), random = Math.random) {
    const chars = [...word.en];
    const letters = chars.map((c, i) => /[a-z]/i.test(c) ? i : null).filter(i => i !== null);
    const ratio = rec.buildCorrect >= 2 ? .5 : rec.buildCorrect >= 1 ? .4 : .25;
    // At least one visible letter remains, even for two-letter words.
    const hideCount = Math.max(1, Math.min(5, letters.length - 1, Math.ceil(letters.length * ratio)));
    const hidden = shuffle(letters, random).slice(0, hideCount).sort((a, b) => a - b);
    const answers = hidden.map(i => chars[i]);
    const uppercaseOnly = letters.every(i => chars[i] === chars[i].toUpperCase());
    const alphabet = uppercaseOnly ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : 'abcdefghijklmnopqrstuvwxyz';
    const extras = shuffle([...alphabet].filter(c => !answers.includes(c)), random)
      .slice(0, letters.length <= 3 ? 3 : 2);
    const bank = shuffle([...answers, ...extras].map((letter, id) => ({ letter, id })), random);
    return { chars, hidden, answers, bank, chosen: answers.map(() => null), active: 0, hinted: false, checked: false };
  }
  function assignToken(state, slot, tokenId) {
    if (!state || state.checked || slot < 0 || slot >= state.chosen.length) return false;
    if (tokenId !== null && !state.bank.some(t => t.id === tokenId)) return false;
    if (tokenId !== null) state.chosen = state.chosen.map(id => id === tokenId ? null : id);
    state.chosen[slot] = tokenId;
    const after = state.chosen.findIndex((id, i) => id === null && i > slot);
    const first = state.chosen.findIndex(id => id === null);
    state.active = after >= 0 ? after : first >= 0 ? first : slot;
    return true;
  }
  function chosenLetters(state) {
    return state.chosen.map(id => id === null ? '' : state.bank.find(t => t.id === id)?.letter || '');
  }
  function buildReady(state) { return state.chosen.every(id => id !== null); }
  function buildCorrect(state) { return buildReady(state) && chosenLetters(state).every((c, i) => c === state.answers[i]); }
  function hint(state) {
    if (!state || state.checked) return false;
    const letters = chosenLetters(state);
    let slot = state.chosen.findIndex(id => id === null);
    if (slot < 0) slot = letters.findIndex((c, i) => c !== state.answers[i]);
    if (slot < 0) return false;
    const correctSlots = new Set(state.chosen.filter((id, i) => letters[i] === state.answers[i]));
    const token = state.bank.find(t => t.letter === state.answers[slot] && !correctSlots.has(t.id));
    if (!token) return false;
    assignToken(state, slot, token.id);
    state.hinted = true;
    return true;
  }
  function normalizeDaily(input) {
    const out = Object.create(null);
    if (isObject(input)) for (const [day, seconds] of Object.entries(input)) {
      if (validDay(day) && Number.isFinite(Number(seconds)) && Number(seconds) >= 0) out[day] = Math.min(86400, Math.floor(Number(seconds)));
    }
    return out;
  }
  function mergeBackup(current, payload, day = todayKey()) {
    if (!isObject(payload) || payload.format !== 'sasha-english-progress' || payload.version !== 4 || !isObject(payload.progress) || !isObject(payload.daily)) {
      throw new Error('Это не копия прогресса Саши. Выбери файл, сохранённый кнопкой «Сохранить копию».');
    }
    const incoming = normalizeProgress(payload.progress, day);
    const progress = normalizeProgress(current.progress, day);
    for (const [key, r] of Object.entries(incoming)) {
      if (!progress[key] || r.last > progress[key].last) progress[key] = r;
    }
    const daily = normalizeDaily(current.daily);
    for (const [key, value] of Object.entries(normalizeDaily(payload.daily))) daily[key] = Math.max(daily[key] || 0, value);
    return { progress, daily };
  }
  return { INTERVALS, safeNumber, isObject, validDay, todayKey, addDays, wordKey, lessonWords, allWords, baseRec, qualifies,
    normalizeRec, normalizeProgress, result, getRec, nextMode, dailyAvailable, createPlan, shuffle, makeBuild,
    assignToken, chosenLetters, buildReady, buildCorrect, hint, normalizeDaily, mergeBackup };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Learning;
