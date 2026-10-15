const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./support/fixture.cjs');
function solveQuiz(f, correct = true) {
  const key=f.run('wordKey(quizItem)');
  const buttons=f.elements('#quizOptions .option');
  (buttons.find(b=>correct?b.dataset.key===key:b.dataset.key!==key)||buttons[0]).click();
}
function fillBuild(f) {
  f.run(`for(let i=0;i<buildState.answers.length;i++){const t=buildState.bank.find(t=>t.letter===buildState.answers[i]&&!buildState.chosen.includes(t.id));Learning.assignToken(buildState,i,t.id);}renderBuild();`);
}
test('home retains Today, all three sections and dynamically generated topics',()=>{
  const f=fixture();
  assert.equal(f.element('#allCount').textContent,59);
  assert.equal(f.elements('.topic-card').length,4);
  assert.equal(f.element('#dailyTime').textContent,'00:00 / 10:00');
  assert.equal(f.elements('.library-tab').length,3);
  assert.equal(f.element('#dailyButtonTitle').textContent,'Занятие на сегодня');
});
test('unknown resets mastery and card recall cannot restore it',()=>{
  const key='prepositions-1::next to';
  const r={status:'learned',quizCorrect:2,buildCorrect:2,days:['2026-10-10','2026-10-11'],wrong:0};
  const f=fixture({storage:{sashaEnglishProgressV3:{[key]:r},sashaEnglishDailyV1:{'2026-10-11':360}}});
  assert.equal(f.run('statusOf(allWords()[0])'),'learned');
  assert.equal(f.run('dailySeconds()'),360);
  f.click('#practiceSelected'); f.click('#againBtn');
  assert.equal(f.run('statusOf(allWords()[0])'),'reinforce');
  assert.equal(f.run('getRec(allWords()[0]).quizCorrect+getRec(allWords()[0]).buildCorrect'),0);
  f.run("recordResult(allWords()[0],'quiz',true)");
  assert.equal(f.run('statusOf(allWords()[0])'),'reinforce');
});
test('idle study stops after one minute, and empty/home/hidden screens do not count',()=>{
  const f=fixture();f.advance(120);assert.equal(f.run('dailySeconds()'),0);
  f.run("selectLibrary('learned');openLibrary();");f.advance(120);assert.equal(f.run('dailySeconds()'),0);
  f.run("goHome();selectLibrary('all');openLibrary();");f.advance(600);
  assert.equal(f.run('dailySeconds()'),60);
  f.click('#soundBtn');f.advance(10);assert.equal(f.run('dailySeconds()'),70);
  f.visibility('hidden');f.advance(30);assert.equal(f.run('dailySeconds()'),70);
  f.visibility('visible');f.advance(10);assert.equal(f.run('dailySeconds()'),70);
});
test('pause button works both after idle and when paused deliberately',()=>{
  const f=fixture();f.click('#practiceSelected');f.advance(65);
  assert.equal(f.element('#timerToggleBtn').textContent,'Продолжить');
  f.click('#timerToggleBtn');f.advance(5);assert.equal(f.run('dailySeconds()'),65);
  f.click('#timerToggleBtn');f.advance(10);assert.equal(f.run('dailySeconds()'),65);
  f.click('#timerToggleBtn');f.advance(5);assert.equal(f.run('dailySeconds()'),70);
});
test('suspended computer does not earn an unattended daily goal',()=>{
  const f=fixture();f.click('#practiceSelected');f.jump(600000);
  assert.equal(f.run('dailySeconds()'),0);
});
test('spelling allows full editing and does not grade when all blanks are filled',()=>{
  const f=fixture();f.click('#practiceSelected');f.run("setMode('build',allWords().find(w=>w.en==='between'))");
  fillBuild(f);
  assert.equal(f.run('buildState.checked'),false);
  assert.equal(f.run('getRec(buildItem).buildCorrect'),0);
  const first=f.elements('#maskedWord .blank')[0];first.click();
  const extra=f.run('buildState.bank.find(t=>!buildState.answers.includes(t.letter)).id');
  f.elements('#letterBank .letter-btn').find(b=>Number(b.dataset.id)===extra).click();
  assert.equal(f.run('Learning.buildReady(buildState)'),true);
  assert.equal(f.run('Learning.buildCorrect(buildState)'),false);
  assert.equal(f.run('getRec(buildItem).wrong'),0);
  f.click('#clearBuildBtn');assert.equal(f.run('Learning.buildReady(buildState)'),false);
  fillBuild(f);f.click('#checkBuildBtn');
  assert.equal(f.run('getRec(buildItem).buildCorrect'),1);
  f.run('checkBuild()');assert.equal(f.run('getRec(buildItem).buildCorrect'),1);
});
test('hinted spelling succeeds without mastery credit',()=>{
  const f=fixture();f.click('#practiceSelected');f.run("setMode('build',allWords().find(w=>w.en==='in'))");
  f.click('#buildHintBtn');assert.equal(f.run('buildState.hinted'),true);
  f.click('#checkBuildBtn');assert.equal(f.run('getRec(buildItem).buildCorrect'),0);
  assert.equal(f.run('dayMeta().hinted'),1);
});
test('test answers count once and listening stays a question until answered',()=>{
  const f=fixture();f.click('#practiceSelected');f.run("setMode('quiz',allWords()[0])");
  const word=f.run('wordKey(quizItem)');solveQuiz(f);f.run("answerQuiz($$('#quizOptions .option').find(b=>b.dataset.key===wordKey(quizItem)))");
  assert.equal(f.run(`progress[${JSON.stringify(word)}].quizCorrect`),1);
  f.run('newQuiz(allWords()[1]);newQuiz(allWords()[2]);');
  assert.equal(f.run('quizState.kind'),'audio');
  assert.equal(f.element('#quizWord').textContent,'Слово на слух');
  assert.ok(f.speech.length>0);
  f.speech.at(-1).onerror();assert.equal(f.run('quizState.kind'),'en-ru');
});
test('devices without speech still have usable text tests',()=>{
  const f=fixture({audio:false});f.click('#practiceSelected');f.run("setMode('quiz')");
  assert.equal(f.run('quizState.kind'),'en-ru');solveQuiz(f);
  f.click('#nextQuizBtn');assert.equal(f.run('quizState.kind'),'ru-en');
});
test('daily lesson automatically changes modes and introduces at most three new words per day',()=>{
  const f=fixture();f.click('#startDailyBtn');
  const modes=new Set();
  for(let i=0;i<40;i++){
    const mode=f.run('currentMode');modes.add(mode);
    if(mode==='cards')f.click('#knowBtn');
    if(mode==='quiz'){solveQuiz(f);f.click('#nextQuizBtn');}
    if(mode==='build'){fillBuild(f);f.click('#checkBuildBtn');f.click('#nextBuildBtn');}
  }
  assert.deepEqual([...modes].sort(),['build','cards','quiz']);
  assert.equal(f.run('dayMeta().introduced.length'),3);
  assert.equal(f.run('counts().learned'),0);
  f.run('goHome();startDaily();');
  assert.equal(f.run('dayMeta().introduced.length'),3);
  assert.ok(['quiz','build'].includes(f.run('currentMode')));
});
test('daily errors return only after three other tasks',()=>{
  const f=fixture();f.click('#startDailyBtn');
  while(f.run('currentMode')==='cards')f.click('#knowBtn');
  const failed=f.run('wordKey(quizItem)');solveQuiz(f,false);f.click('#nextQuizBtn');
  for(let i=0;i<3;i++){
    assert.notEqual(f.run('session.task.key'),failed);
    if(f.run('currentMode')==='quiz'){solveQuiz(f);f.click('#nextQuizBtn');}
    else if(f.run('currentMode')==='build'){fillBuild(f);f.click('#checkBuildBtn');f.click('#nextBuildBtn');}
    else f.click('#knowBtn');
  }
  assert.equal(f.run('session.task.key'),failed);
});
test('daily goal uses already completed minutes and summary stops time',()=>{
  const f=fixture({storage:{sashaEnglishDailyV2:{'2026-10-11':590}}});
  f.click('#startDailyBtn');f.advance(10);f.click('#knowBtn');
  assert.equal(f.run('currentView'),'summary');
  assert.equal(f.run('dailySeconds()'),600);
  f.advance(30);assert.equal(f.run('dailySeconds()'),600);
  f.click('#continueSessionBtn');assert.equal(f.run('currentView'),'study');
});
test('new topics and appended words appear without a manual interface change',()=>{
  const f=fixture();
  f.run("recordResult(allWords()[0],'quiz',true);LESSONS.push({id:'animals',title:'Животные',words:[{en:'cat',ru:'кошка',icon:'🐈'}]});LESSONS[0].words.push({en:'above',ru:'выше'});renderHome();");
  assert.equal(f.element('#allCount').textContent,61);
  assert.equal(f.elements('.topic-card').length,5);
  assert.equal(f.run('getRec(allWords()[0]).quizCorrect'),1);
  f.elements('.topic-card').find(b=>b.dataset.id==='animals').click();
  assert.equal(f.run('currentWords.length'),1);
  assert.equal(f.element('#word').textContent,'cat');
  assert.equal(f.run('getRec(currentWords[0]).status'),'new');
});
test('saved progress reloads and storage failures do not break the buttons',()=>{
  const f=fixture();f.run("recordResult(allWords()[0],'build',true)");
  const again=fixture({storage:Object.fromEntries(f.storage)});
  assert.equal(again.run('getRec(allWords()[0]).buildCorrect'),1);
  const blocked=fixture({blocked:true});blocked.click('#startDailyBtn');
  assert.equal(blocked.run('currentView'),'study');
  assert.equal(blocked.element('#storageNotice').classList.contains('hidden'),false);
});
