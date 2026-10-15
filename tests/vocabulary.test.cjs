const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./support/fixture.cjs');
test('both school photographs add exactly 37 numbers and seven unique personal pronouns', () => {
  const f=fixture();
  const expectedNumbers=['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','one hundred','twenty-one','thirty-two','forty-three','fifty-four','sixty-five','seventy-six','eighty-seven','ninety-eight','ninety-nine'];
  const numbers=JSON.parse(f.run("JSON.stringify(LESSONS.find(l=>l.id==='numbers-1').words)"));
  assert.deepEqual(numbers.map(w=>w.en),expectedNumbers);
  assert.equal(new Set(numbers.map(w=>w.en)).size,37);
  const pronouns=JSON.parse(f.run("JSON.stringify(LESSONS.find(l=>l.id==='personal-pronouns-1').words)"));
  assert.deepEqual(pronouns.map(w=>[w.en,w.ru]),[['I','я'],['you','ты, вы'],['he','он'],['she','она'],['it','оно'],['we','мы'],['they','они']]);
  assert.equal(f.run('allWords().length'),59);
  assert.equal(f.run('new Set(allWords().map(wordKey)).size'),59);
  assert.equal(f.run("LESSONS.filter(l=>['prepositions-1','activities-1'].includes(l.id)).reduce((n,l)=>n+l.words.length,0)"),15);
});
test('I stays uppercase in the letter bank and can be checked without typing',()=>{
  const f=fixture();
  f.run("openLesson('personal-pronouns-1');setMode('build',currentWords.find(w=>w.en==='I'))");
  assert.equal(f.element('#buildPrompt').textContent,'я');
  assert.equal(f.run('buildState.answers[0]'),'I');
  assert.ok(f.run('buildState.bank.length')>=4);
  assert.equal(f.run("buildState.bank.every(t=>/^[A-Z]$/.test(t.letter))"),true);
  const id=f.run("buildState.bank.find(t=>t.letter==='I').id");
  f.elements('#letterBank .letter-btn').find(b=>Number(b.dataset.id)===id).click();
  assert.equal(f.run('buildState.checked'),false);
  f.click('#checkBuildBtn');
  assert.equal(f.run('getRec(buildItem).buildCorrect'),1);
});
test('new number and pronoun topics participate in every practice mode',()=>{
  const f=fixture();
  for(const topic of ['numbers-1','personal-pronouns-1']){
    f.run(`openLesson(${JSON.stringify(topic)});setMode('quiz');`);
    assert.equal(f.run('quizItem.lessonId'),topic);
    f.run("setMode('build')");assert.equal(f.run('buildItem.lessonId'),topic);
    f.run("setMode('match')");assert.ok(f.run('matchState.words.length')>0);
  }
  assert.equal(f.run('counts().learned'),0);
  const topics=JSON.parse(f.run("JSON.stringify(Learning.createPlan(allWords().filter(w=>['numbers-1','personal-pronouns-1'].includes(w.lessonId)),progress,todayKey(),[]).tasks.filter(t=>t.mode==='cards').map(t=>allWords().find(w=>wordKey(w)===t.key).lessonId))"));
  assert.equal(topics.length,3);
  assert.equal(new Set(topics).size,2);
});
