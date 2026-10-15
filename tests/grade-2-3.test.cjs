const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {fixture}=require('./support/fixture.cjs');
const sources=require('../vocabulary/grade-2-3-sources.json');
const norm=s=>s.trim().replace(/\s+/g,' ').toLowerCase();
test('all 15 photographed pages are represented in one group without repeated cards',()=>{
  const f=fixture();
  assert.equal(sources.pages.length,15);
  assert.deepEqual(sources.pages.map(p=>p.words.length),[15,14,15,14,17,15,15,18,14,18,16,16,13,16,3]);
  const words=JSON.parse(f.run("JSON.stringify(wordsForLesson('grade-2-3'))"));
  const byEnglish=new Map(words.map(w=>[norm(w.en),w]));
  assert.equal(words.length,205);
  assert.equal(byEnglish.size,205);
  assert.equal(f.run('allWords().length'),249);
  assert.equal(f.run('new Set(allWords().map(wordKey)).size'),249);
  for(const page of sources.pages)for(const w of page.words){
    const actual=byEnglish.get(norm(w.en));
    assert.ok(actual,`${page.photo}: ${w.en} missing`);
    assert.ok(actual.ru.trim(),`${w.en}: empty translation`);
  }
  assert.equal(f.run("LESSONS.filter(l=>l.id==='grade-2-3').length"),1);
});
test('shared numbers and prepositions keep their original progress in both groups',()=>{
  const key='numbers-1::three';
  const f=fixture({storage:{sashaEnglishProgressV4:{[key]:{status:'learned',quizCorrect:2,buildCorrect:2,days:['2026-10-10','2026-10-11'],last:1}}}});
  const shared=JSON.parse(f.run("JSON.stringify(wordsForLesson('grade-2-3').filter(w=>w.id))"));
  assert.equal(shared.length,15);
  f.run("openLesson('grade-2-3')");
  assert.equal(f.run('currentWords.length'),205);
  assert.equal(f.run("statusOf(currentWords.find(w=>w.en==='three'))"),'learned');
  f.run("recordResult(currentWords.find(w=>w.en==='three'),'quiz',false)");
  assert.equal(f.run("statusOf(wordsForLesson('numbers-1').find(w=>w.en==='three'))"),'reinforce');
  assert.equal(f.run("Object.hasOwn(progress,'grade-2-3::three')"),false);
  for(const en of ['in','on','under'])assert.equal(f.run(`wordKey(wordsForLesson('grade-2-3').find(w=>w.en===${JSON.stringify(en)}))`),'prepositions-1::'+en);
});
test('all 59 earlier word records are preserved while the new group is appended',()=>{
  const legacy=JSON.parse(vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','data-v9.js'),'utf8')+'\nJSON.stringify(LESSONS)'));
  const f=fixture(),current=JSON.parse(f.run('JSON.stringify(LESSONS)'));
  for(const lesson of legacy){
    const next=current.find(l=>l.id===lesson.id);assert.ok(next);
    for(const word of lesson.words)assert.deepEqual(next.words.find(w=>w.en===word.en),word);
  }
});
test('phrases and missing translations are complete and preserve punctuation in letter tasks',()=>{
  const f=fixture();f.run("openLesson('grade-2-3')");
  const expected={'fly a kite':'запускать воздушного змея','watch TV':'смотреть телевизор','make a sandcastle':'строить замок из песка','ride a horse':'ездить верхом'};
  for(const [en,ru]of Object.entries(expected)){
    assert.equal(f.run(`currentWords.find(w=>w.en===${JSON.stringify(en)}).ru`),ru);
  }
  for(const en of ['jack-in-the-box',"What's your favourite food?","It's raining!",'watch TV']){
    f.run(`setMode('build',currentWords.find(w=>w.en===${JSON.stringify(en)}))`);
    assert.equal(f.run('buildState.chars.join(\'\')'),en);
    assert.equal(f.run('buildState.hidden.every(i=>/[a-z]/i.test(buildState.chars[i]))'),true);
  }
});
test('grade group works in tests, letters, pairs and progress; near excludes synonymous answers',()=>{
  const f=fixture();f.run("openLesson('grade-2-3');setMode('quiz')");
  assert.ok(f.run("currentWords.some(w=>wordKey(w)===wordKey(quizItem))"));
  f.run("setMode('build')");assert.ok(f.run("currentWords.some(w=>wordKey(w)===wordKey(buildItem))"));
  f.run("setMode('match')");assert.equal(f.run('matchState.words.length'),3);
  f.run('openProgress()');assert.ok(f.element('#wordProgressList').innerHTML.includes('2–3 класс'));
  assert.equal(f.run("wordFamily(allWords().find(w=>w.en==='near'))===wordFamily(allWords().find(w=>w.en==='by'))"),true);
});
