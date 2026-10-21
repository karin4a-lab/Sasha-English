const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const engineFile = html.match(/<script src="(learning[^"?]+)(?:\?[^" ]*)?"/)[1];
const dataFile = html.match(/<script src="(data[^"?]+)(?:\?[^" ]*)?"/)[1];
const L = require('../' + engineFile);
const source = fs.readFileSync(path.join(__dirname, '..', dataFile), 'utf8');
const lessons = vm.runInNewContext(source + '\nJSON.parse(JSON.stringify(LESSONS));');
const words = L.allWords(lessons), day = '2026-10-11';
function learned() {
  let r = L.baseRec();
  for (const mode of ['quiz', 'quiz', 'build', 'build']) r = L.result(r, mode, true, day, 1);
  return L.result(r, 'quiz', true, '2026-10-12', 2);
}

test('one day and card self-ratings cannot prove mastery', () => {
  let r = L.baseRec();
  for (const mode of ['quiz', 'quiz', 'build', 'build']) r = L.result(r, mode, true, day, 1);
  assert.equal(r.status, 'reinforce');
  r = L.result(r, 'cards', true, '2026-10-12', 2);
  assert.equal(r.status, 'reinforce');
  assert.equal(r.days.length, 1);
  r = L.result(r, 'build', true, '2026-10-12', 3);
  assert.equal(r.status, 'learned');
});
test('card unknown and wrong checked answers reset all old proofs', () => {
  for (const type of ['cards', 'quiz', 'build', 'match']) {
    let r = L.result(learned(), type, false, '2026-10-13', 5);
    assert.equal(r.status, 'reinforce');
    assert.deepEqual(r.days, []);
    assert.equal(r.quizCorrect + r.buildCorrect, 0);
    r = L.result(r, 'quiz', true, '2026-10-13', 6);
    assert.equal(r.status, 'reinforce');
  }
});
test('hinted answers and correct pairs do not advance learning or due dates', () => {
  for (const [type, hinted] of [['build', true], ['match', false], ['cards', false]]) {
    const before = learned(), r = L.result(before, type, true, '2026-10-13', 7, hinted);
    assert.equal(r.quizCorrect, before.quizCorrect);
    assert.equal(r.buildCorrect, before.buildCorrect);
    assert.equal(r.nextReview, before.nextReview);
    assert.deepEqual(r.days, before.days);
  }
});
test('scheduled reviews use 1, 3, 7, 14 days and early extra checks do not skip stages', () => {
  let r = learned();
  assert.equal(r.nextReview, '2026-10-13');
  r = L.result(r, 'build', true, '2026-10-13', 3);
  assert.equal(r.nextReview, '2026-10-16');
  r = L.result(r, 'quiz', true, '2026-10-14', 4);
  assert.equal(r.nextReview, '2026-10-16');
  r = L.result(r, 'quiz', true, '2026-10-16', 5);
  assert.equal(r.nextReview, '2026-10-23');
  r = L.result(r, 'build', true, '2026-10-16', 6);
  assert.equal(r.nextReview, '2026-10-23');
  r = L.result(r, 'quiz', true, '2026-10-23', 7);
  assert.equal(r.nextReview, '2026-11-06');
});
test('v3 migration preserves valid mastery and repairs inconsistent unknown series', () => {
  const old = {status:'learned',quizCorrect:2,buildCorrect:2,days:['2026-10-10',day],wrong:0};
  assert.equal(L.normalizeRec(old, day).status, 'learned');
  const unknown = L.normalizeRec({...old, status:'reinforce', wrong:1}, day);
  assert.equal(unknown.status, 'reinforce');
  assert.equal(unknown.quizCorrect, 0);
  assert.deepEqual(unknown.days, []);
});
test('dates and daily rollover use Moscow even if the device is elsewhere', () => {
  assert.equal(L.todayKey(Date.parse('2026-10-11T20:59:59Z')), '2026-10-11');
  assert.equal(L.todayKey(Date.parse('2026-10-11T21:00:01Z')), '2026-10-12');
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
});
test('all words keep partial spelling, spaces, and plausible distractor letters', () => {
  for (const w of [...words, {en:"don't"}, {en:'ice-skating'}]) {
    for (let n = 0; n < 25; n++) {
      const s = L.makeBuild(w, learned());
      const letterCount = [...w.en].filter(c => /[a-z]/i.test(c)).length;
      assert.ok(s.hidden.length > 0 && (letterCount === 1 ? s.hidden.length === 1 : s.hidden.length < letterCount));
      assert.ok(s.hidden.every(i => /[a-z]/i.test(s.chars[i])));
      assert.equal(s.chars.join(''), w.en);
      assert.ok(s.bank.some(t => !s.answers.includes(t.letter)));
      assert.equal(new Set(s.bank.map(t => t.id)).size, s.bank.length);
    }
  }
});
function fillCorrect(s) {
  for (let i = 0; i < s.answers.length; i++) {
    const t = s.bank.find(t => t.letter === s.answers[i] && !s.chosen.includes(t.id));
    L.assignToken(s, i, t.id);
  }
}
test('every filled slot remains editable and tokens can be moved before checking', () => {
  const s = L.makeBuild(words.find(w => w.en === 'between'), learned());
  fillCorrect(s);
  assert.equal(L.buildCorrect(s), true);
  const original = s.chosen[0], extra = s.bank.find(t => !s.answers.includes(t.letter));
  L.assignToken(s, 0, extra.id);
  assert.equal(L.buildReady(s), true);
  assert.equal(L.buildCorrect(s), false);
  L.assignToken(s, 0, original);
  assert.equal(L.buildCorrect(s), true);
  L.assignToken(s, s.chosen.length - 1, null);
  assert.equal(L.buildReady(s), false);
  assert.equal(L.hint(s), true);
  assert.equal(s.hinted, true);
  assert.equal(L.buildCorrect(s), true);
  s.checked = true;
  assert.equal(L.assignToken(s, 0, extra.id), false);
});
test('duplicate letters are separate tokens and hints preserve already correct slots', () => {
  const w = {en:'letter'}, s = L.makeBuild(w, learned(), () => .999);
  s.hidden = [1,2,3]; s.answers = ['e','t','t'];
  s.bank = [{id:0,letter:'e'},{id:1,letter:'t'},{id:2,letter:'t'},{id:3,letter:'x'}];
  s.chosen = [0,3,null];
  assert.equal(L.hint(s), true);
  assert.equal(s.chosen[0], 0);
  assert.equal(L.hint(s), true);
  assert.equal(L.buildCorrect(s), true);
});
test('daily plan fills six active places, includes overdue words and picks missing skills', () => {
  const p = Object.create(null), w = words[0];
  p[L.wordKey(w)] = {status:'reinforce',quizCorrect:2,buildCorrect:0,days:[day],seen:true};
  p[L.wordKey(words[1])] = {...learned(),days:['2026-10-09','2026-10-10'],lastReviewDay:'2026-10-10',nextReview:day};
  const plan = L.createPlan(words,p,day,[]);
  assert.equal(plan.newCount,4);
  assert.equal(plan.tasks.find(t=>t.key===L.wordKey(w)).mode,'build');
  assert.ok(plan.tasks.some(t=>t.key===L.wordKey(words[1])));
  assert.equal(L.createPlan(words,p,day,['a','b','c']).newCount,4);
  for (const w of words.slice(0,12)) p[L.wordKey(w)] = {status:'reinforce',wrong:1};
  assert.equal(L.createPlan(words,p,day,[]).newCount,0);
});
test('adding a topic and words automatically updates plans without touching old progress', () => {
  const p = {[L.wordKey(words[0])]:learned()};
  const before = JSON.stringify(p);
  const expanded = L.allWords([...lessons,{id:'animals',title:'Животные',words:[{en:'otter',ru:'выдра'},{en:'fox',ru:'лиса'}]}]);
  assert.equal(expanded.length, words.length+2);
  assert.equal(L.getRec(p, expanded.find(w=>w.en==='otter'), day).status,'new');
  assert.equal(L.getRec(p, words[0], day).status,'learned');
  const newOnly = expanded.filter(w=>w.lessonId==='animals');
  assert.equal(L.createPlan(newOnly,p,day,[]).newCount,2);
  assert.equal(JSON.stringify(p),before);
});
test('backup merge keeps newer failures and does not double count daily time', () => {
  const key = L.wordKey(words[0]), existing = learned(); existing.last=100;
  const newerFailure = L.result(existing,'quiz',false,day,200);
  const payload = {format:'sasha-english-progress',version:4,progress:{[key]:newerFailure},daily:{[day]:200}};
  const merged = L.mergeBackup({progress:{[key]:existing},daily:{[day]:360}},payload,day);
  assert.equal(merged.progress[key].status,'reinforce');
  assert.equal(merged.daily[day],360);
  assert.throws(()=>L.mergeBackup({progress:{},daily:{}},{progress:{},daily:{}},day));
  assert.deepEqual(Object.keys(L.normalizeDaily({'bad-date':500,'2026-02-31':500})),[]);
});

test('completed first-day words rest without prematurely becoming learned', () => {
  const w=words[0], key=L.wordKey(w); let r=L.baseRec();
  for (const mode of ['quiz','build','quiz','build']) r=L.result(r,mode,true,day,1);
  assert.equal(r.status,'reinforce');
  assert.equal(L.dailyAvailable(w,{[key]:r},day),false);
  assert.equal(L.dailyAvailable(w,{[key]:r},'2026-10-12'),true);
  assert.equal(L.createPlan([w],{[key]:r},day,[key]).tasks.length,0);
  assert.equal(L.dailyAvailable(w,{},day,{[key]:6}),false);
});
