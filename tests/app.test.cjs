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
  assert.equal(f.element('#allCount').textContent,f.run('allWords().length'));
  assert.equal(f.elements('.topic-card').length,f.run('LESSONS.length'));
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
function finishDailyTask(f, correct = true) {
  const mode=f.run('currentMode');
  if(mode==='cards')f.click(correct?'#knowBtn':'#againBtn');
  if(mode==='quiz'){solveQuiz(f,correct);f.click('#nextQuizBtn');}
  if(mode==='build'){
    if(correct)fillBuild(f);
    else {fillBuild(f);f.run("buildState.hinted=true;renderBuild();");}
    f.click('#checkBuildBtn');f.click('#nextBuildBtn');
  }
}
test('ten-minute daily lesson moves beyond the first three words and rests completed words',()=>{
  const f=fixture({now:'2026-10-21T12:00:00Z'});f.click('#startDailyBtn');
  const modes=new Set(), appearances=new Map(), firstMinute=new Set(), thirdMinute=new Set();
  for(let i=0;i<200;i++){
    assert.equal(f.run('currentView'),'study');
    const key=f.run('session.task.key');
    if(i<20)firstMinute.add(key);
    if(i>=40&&i<60)thirdMinute.add(key);
    appearances.set(key,(appearances.get(key)||0)+1);
    modes.add(f.run('currentMode'));f.advance(3);finishDailyTask(f);
  }
  assert.equal(f.run('currentView'),'summary');
  assert.equal(f.run('dailySeconds()'),600);
  assert.deepEqual([...modes].sort(),['build','cards','quiz']);
  assert.ok(appearances.size>=30);
  assert.ok([...appearances.values()].every(n=>n<=5));
  assert.ok([...thirdMinute].some(key=>!firstMinute.has(key)));
  assert.equal(f.run('counts().learned'),0);
  const rested=[...appearances].filter(([,n])=>n===5).map(([key])=>key);
  const again=fixture({now:'2026-10-21T12:00:00Z',storage:Object.fromEntries(f.storage)});again.click('#startDailyBtn');
  assert.ok(!rested.includes(again.run('session.task.key')));
});
test('existing over-practised one, I and ant are immediately replaced without losing progress',()=>{
  const f=fixture();
  f.run("for(const w of allWords().filter(w=>['one','I','ant'].includes(w.en))) {progress[wordKey(w)]={...Learning.baseRec(),seen:true,status:'reinforce',quizCorrect:30,buildCorrect:30,days:[todayKey()],lastReviewDay:todayKey()};introduce(w);}saveProgress();");
  f.click('#startDailyBtn');
  for(let i=0;i<35;i++){
    assert.ok(!['one','I','ant'].includes(f.run('currentWords.find(w=>wordKey(w)===session.task.key).en')));
    finishDailyTask(f);
  }
  assert.equal(f.run("getRec(allWords().find(w=>w.en==='one')).quizCorrect"),30);
});
test('six failed or hinted attempts rest a word across reopening and become available tomorrow',()=>{
  const f=fixture();f.click('#startDailyBtn');
  const key=f.run('session.task.key');
  // Seed five prior unsuccessful attempts, then exercise a real sixth quiz failure.
  f.run(`dayMeta().attempts[session.task.key]=5;setMode('quiz',currentWords.find(w=>wordKey(w)===session.task.key));`);
  solveQuiz(f,false);f.click('#nextQuizBtn');
  assert.equal(f.run(`dayMeta().attempts[${JSON.stringify(key)}]`),6);
  assert.notEqual(f.run('session.task.key'),key);
  const again=fixture({storage:Object.fromEntries(f.storage)});again.click('#startDailyBtn');
  for(let i=0;i<20;i++){assert.notEqual(again.run('session.task.key'),key);finishDailyTask(again);}
  again.jump(86400000);again.run('goHome();startDaily();');
  assert.equal(again.run(`Learning.dailyAvailable(allWords().find(w=>wordKey(w)===${JSON.stringify(key)}),progress,todayKey(),dayMeta().attempts)`),true);
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
  const before=f.run('allWords().length'),topicCount=f.run('LESSONS.length');
  f.run("recordResult(allWords()[0],'quiz',true);LESSONS.push({id:'animals',title:'Животные',words:[{en:'otter',ru:'выдра',icon:'🦦'}]});LESSONS[0].words.push({en:'above',ru:'выше'});renderHome();");
  assert.equal(f.element('#allCount').textContent,before+2);
  assert.equal(f.elements('.topic-card').length,topicCount+1);
  assert.equal(f.run('getRec(allWords()[0]).quizCorrect'),1);
  f.elements('.topic-card').find(b=>b.dataset.id==='animals').click();
  assert.equal(f.run('currentWords.length'),1);
  assert.equal(f.element('#word').textContent,'otter');
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

test('small exhausted dictionary ends instead of looping to fill ten minutes',()=>{
  const f=fixture();f.run("LESSONS.splice(0,LESSONS.length,{id:'tiny',title:'Маленькая тема',words:[{en:'one',ru:'один'},{en:'I',ru:'я'},{en:'ant',ru:'муравей'}]});renderHome();");
  f.click('#startDailyBtn');
  let tasks=0;
  while(f.run('currentView')==='study'&&tasks<50){finishDailyTask(f);tasks++;}
  assert.equal(tasks,15);
  assert.equal(f.run('currentView'),'summary');
  assert.equal(f.run('counts().learned'),0);
});
test('persistent mistakes and hints cannot trap the daily lesson on three words',()=>{
  const f=fixture();f.click('#startDailyBtn');
  const keys=new Set();
  for(let i=0;i<100;i++){keys.add(f.run('session.task.key'));f.advance(3);finishDailyTask(f,false);}
  assert.ok(keys.size>=12);
  assert.ok(f.run('Object.values(dayMeta().attempts).every(n=>n<=6)'));
});
test('backup merging preserves daily attempt limits without summing duplicates',()=>{
  const f=fixture();
  f.run("dayMeta().attempts['numbers-1::one']=4;pendingBackup={format:'sasha-english-progress',version:4,progress:{},daily:{},meta:{[todayKey()]:{attempts:{'numbers-1::one':6},introduced:[],touched:[]}}};importProgress();");
  assert.equal(f.run("dayMeta().attempts['numbers-1::one']"),6);
  const again=fixture({storage:Object.fromEntries(f.storage)});
  assert.equal(again.run("dayMeta().attempts['numbers-1::one']"),6);
});

test('persistent home button exits a used lesson directly and preserves results and time',()=>{
  const f=fixture();
  assert.equal(f.element('#backBtn').classList.contains('hidden'),true);
  f.click('#startDailyBtn');f.click('#knowBtn');
  f.run("setMode('quiz',currentWords[0])");
  const key=f.run('wordKey(quizItem)');
  solveQuiz(f);f.advance(8);f.click('#backBtn');
  assert.equal(f.run('currentView'),'home');
  assert.equal(f.run('session'),null);
  assert.equal(f.run('dailySeconds()'),8);
  assert.equal(f.element('#backBtn').classList.contains('hidden'),true);
  const again=fixture({storage:Object.fromEntries(f.storage)});
  assert.equal(again.run(`progress[${JSON.stringify(key)}].quizCorrect`),1);
  assert.equal(again.run('dailySeconds()'),8);
});
test('persistent home button works from results, progress, empty lists and each exercise mode',()=>{
  const f=fixture();
  for(const mode of ['cards','quiz','build','match']){
    f.click('#practiceSelected');f.run(`setMode('${mode}')`);
    assert.equal(f.element('#backBtn').classList.contains('hidden'),false);
    f.click('#backBtn');assert.equal(f.run('currentView'),'home');
  }
  f.click('#startDailyBtn');f.click('#knowBtn');f.click('#finishSessionBtn');
  assert.equal(f.run('currentView'),'summary');
  assert.equal(f.element('#backBtn').classList.contains('hidden'),false);
  f.click('#backBtn');assert.equal(f.run('currentView'),'home');
  f.click('#openProgressBtn');
  assert.equal(f.element('#backBtn').classList.contains('hidden'),false);
  f.click('#backBtn');assert.equal(f.run('currentView'),'home');
  f.run("selectLibrary('learned');openLibrary()");
  assert.equal(f.element('#studyContent').classList.contains('hidden'),true);
  f.click('#backBtn');assert.equal(f.run('currentView'),'home');
});
