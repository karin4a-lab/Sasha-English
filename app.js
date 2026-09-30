const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const PROGRESS_KEY="sashaEnglishProgressV2",OLD_KEY="sashaEnglishProgressV1",DAY_KEY="sashaEnglishDailyV1";
const SESSION_ID=Date.now().toString(36)+Math.random().toString(36).slice(2);
let progress=JSON.parse(localStorage.getItem(PROGRESS_KEY)||"{}");
let daily=JSON.parse(localStorage.getItem(DAY_KEY)||"{}");
let currentLesson=null,currentWords=[],currentSource="all",cardIndex=0,quizItem=null,typingItem=null;

const allWords=()=>LESSONS.flatMap(l=>l.words.map(w=>({...w,lessonId:l.id,lessonTitle:l.title})));
const wordKey=w=>`${w.lessonId}::${w.en}`;
const todayKey=()=>new Date().toLocaleDateString("sv-SE");

function migrateOld(){
  if(Object.keys(progress).length)return;
  const old=JSON.parse(localStorage.getItem(OLD_KEY)||"{}");
  if(!old||!Object.keys(old).length)return;
  allWords().forEach(w=>{
    const v=old[w.lessonId]?.[w.en];
    if(v===true)progress[wordKey(w)]={status:"learned",correct:3,correctSessions:["legacy1","legacy2"],wrong:0};
    if(v===false)progress[wordKey(w)]={status:"reinforce",correct:0,correctSessions:[],wrong:1};
  });
  saveProgress();
}
function getRec(w){return progress[wordKey(w)]||{status:"new",correct:0,correctSessions:[],wrong:0}}
function saveProgress(){localStorage.setItem(PROGRESS_KEY,JSON.stringify(progress))}
function saveDaily(){localStorage.setItem(DAY_KEY,JSON.stringify(daily))}
function statusOf(w){return getRec(w).status||"new"}
function statusLabel(s){return s==="learned"?"Выучено":s==="reinforce"?"Закрепить":"Новое"}
function ensureRec(w){const k=wordKey(w);if(!progress[k])progress[k]={status:"new",correct:0,correctSessions:[],wrong:0};return progress[k]}
function recordResult(w,correct){
  const r=ensureRec(w);
  if(correct){
    r.correct=(r.correct||0)+1;
    r.correctSessions=Array.isArray(r.correctSessions)?r.correctSessions:[];
    if(!r.correctSessions.includes(SESSION_ID))r.correctSessions.push(SESSION_ID);
    if(r.correct>=3&&r.correctSessions.length>=2)r.status="learned";
    else if(r.status!=="learned")r.status="reinforce";
  }else{
    r.wrong=(r.wrong||0)+1;
    r.status="reinforce";
    r.correct=0;
    r.correctSessions=[];
  }
  r.last=Date.now();
  saveProgress();
  renderCounts();
  updateProgressPill();
}
function filteredWords(filter){
  const words=allWords();
  if(filter==="reinforce")return words.filter(w=>statusOf(w)==="reinforce");
  if(filter==="learned")return words.filter(w=>statusOf(w)==="learned");
  return words;
}
function counts(){
  const words=allWords();
  return {all:words.length,reinforce:words.filter(w=>statusOf(w)==="reinforce").length,learned:words.filter(w=>statusOf(w)==="learned").length};
}
function renderCounts(){
  const c=counts();
  $("#allCount").textContent=c.all;$("#reinforceCount").textContent=c.reinforce;$("#learnedCount").textContent=c.learned;
  $("#streak").textContent=`${c.learned} ⭐`;
}
function lessonProgress(id){
  const words=allWords().filter(w=>w.lessonId===id);
  return {known:words.filter(w=>statusOf(w)==="learned").length,total:words.length};
}
function renderHome(){
  renderCounts();renderDaily();
  $("#topicGrid").innerHTML=LESSONS.map(l=>{const p=lessonProgress(l.id);return`<button class="topic-card" data-id="${l.id}"><div class="topic-icon">${l.icon}</div><div class="topic-meta"><div class="topic-title">${l.title}</div><div class="topic-sub">${l.words.length} слов</div><div class="topic-progress">${p.known}/${p.total} выучено</div></div><div>›</div></button>`}).join("");
  $$(".topic-card").forEach(b=>b.onclick=()=>openLesson(b.dataset.id));
}
function selectLibrary(filter){
  currentSource=filter;
  $$(".library-tab").forEach(b=>b.classList.toggle("active",b.dataset.filter===filter));
  const map={all:["🔤","Повторить все слова","Все слова подряд"],reinforce:["🎯","Закрепить","Слова, которые нужно повторить ещё"],learned:["✓","Выучено","Проверить уже выученные слова"]};
  const m=map[filter];$("#practiceIcon").textContent=m[0];$("#practiceTitle").textContent=m[1];
  const n=filteredWords(filter).length;$("#practiceSub").textContent=n?`${m[2]} • ${n}`:(filter==="reinforce"?"Сейчас здесь нет слов":filter==="learned"?"Пока нет выученных слов":m[2]);
}
function openLibrary(){
  const words=filteredWords(currentSource);
  openStudy({id:`virtual-${currentSource}`,title:currentSource==="all"?"Все слова":currentSource==="reinforce"?"Закрепить":"Выучено",type:"Общий словарь",words});
}
function openLesson(id){
  const l=LESSONS.find(x=>x.id===id);
  openStudy({id:l.id,title:l.title,type:l.type,words:l.words.map(w=>({...w,lessonId:l.id,lessonTitle:l.title}))});
}
function openStudy(source){
  currentLesson=source;currentWords=[...source.words];cardIndex=0;
  $("#homeView").classList.add("hidden");$("#studyView").classList.remove("hidden");
  $("#topicTitle").textContent=source.title;$("#topicType").textContent=source.type;
  const empty=!currentWords.length;$("#emptyState").classList.toggle("hidden",!empty);$("#studyContent").classList.toggle("hidden",empty);$(".mode-tabs").classList.toggle("hidden",empty);
  if(empty){$("#emptyTitle").textContent=source.title==="Закрепить"?"Всё закреплено":"Здесь пока пусто";$("#emptyText").textContent=source.title==="Закрепить"?"Ошибочных слов сейчас нет. Можно повторить весь словарь.":"Слова появятся здесь после занятий.";}
  else{setMode("cards");renderCard();}
  updateProgressPill();renderDaily();window.scrollTo({top:0,behavior:"smooth"});
}
function updateProgressPill(){
  if(!currentLesson)return;
  const total=currentWords.length,learned=currentWords.filter(w=>statusOf(w)==="learned").length;
  $("#progressPill").textContent=`${learned}/${total} ✓`;
}
function renderCard(){
  if(!currentWords.length)return;
  const w=currentWords[cardIndex%currentWords.length],s=statusOf(w);
  $("#cardVisual").textContent=w.icon||"🔤";$("#word").textContent=w.en;$("#translation").textContent=w.ru;$("#counter").textContent=`${cardIndex+1} из ${currentWords.length}`;
  const chip=$("#wordStatus");chip.textContent=statusLabel(s);chip.className=`status-chip ${s}`;
}
function nextCard(){cardIndex=(cardIndex+1)%currentWords.length;renderCard()}
function markCard(correct){const w=currentWords[cardIndex];recordResult(w,correct);nextCard()}
function speak(text){if(!("speechSynthesis" in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang="en-US";u.rate=.82;speechSynthesis.speak(u)}
function shuffle(a){return[...a].sort(()=>Math.random()-.5)}
function pickPracticeWord(){
  if(!currentWords.length)return null;
  const weighted=[...currentWords,...currentWords.filter(w=>statusOf(w)==="reinforce"),...currentWords.filter(w=>statusOf(w)==="reinforce")];
  return weighted[Math.floor(Math.random()*weighted.length)];
}
function newQuiz(){
  quizItem=pickPracticeWord();if(!quizItem)return;
  $("#quizWord").textContent=quizItem.en;$("#quizFeedback").textContent="";$("#nextQuizBtn").classList.add("hidden");
  const pool=shuffle(allWords().filter(w=>w.en!==quizItem.en)).slice(0,3),opts=shuffle([quizItem,...pool]);
  $("#quizOptions").innerHTML=opts.map(o=>`<button class="option" data-en="${o.en}">${o.ru}</button>`).join("");
  $$("#quizOptions .option").forEach(b=>b.onclick=()=>answerQuiz(b));
}
function answerQuiz(btn){
  const correct=btn.dataset.en===quizItem.en;
  $$("#quizOptions .option").forEach(b=>{b.disabled=true;if(b.dataset.en===quizItem.en)b.classList.add("correct")});if(!correct)btn.classList.add("wrong");
  $("#quizFeedback").textContent=correct?"Верно ✓":`Правильно: ${quizItem.ru}`;$("#quizFeedback").style.color=correct?"var(--good)":"var(--bad)";
  recordResult(quizItem,correct);$("#nextQuizBtn").classList.remove("hidden");
}
function newTyping(){
  typingItem=pickPracticeWord();if(!typingItem)return;
  $("#typingPrompt").textContent=typingItem.ru;$("#typingInput").value="";$("#typingFeedback").textContent="";$("#nextTypingBtn").classList.add("hidden");$("#checkTypingBtn").classList.remove("hidden");
}
function normalize(s){return s.trim().toLowerCase().replace(/\s+/g," ")}
function checkTyping(){
  const ok=normalize($("#typingInput").value)===normalize(typingItem.en);
  $("#typingFeedback").textContent=ok?"Верно ✓":`Правильно: ${typingItem.en}`;$("#typingFeedback").style.color=ok?"var(--good)":"var(--bad)";
  recordResult(typingItem,ok);$("#checkTypingBtn").classList.add("hidden");$("#nextTypingBtn").classList.remove("hidden");
}
function setMode(mode){
  $$(".mode").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));$("#cardsMode").classList.toggle("hidden",mode!=="cards");$("#quizMode").classList.toggle("hidden",mode!=="quiz");$("#typingMode").classList.toggle("hidden",mode!=="typing");if(mode==="quiz")newQuiz();if(mode==="typing")newTyping();
}
function dailySeconds(){return Number(daily[todayKey()]||0)}
function fmt(sec){const m=Math.floor(sec/60),s=sec%60;return`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
function renderDaily(){
  const sec=dailySeconds(),pct=Math.min(100,Math.floor(sec/600*100));
  $("#dailyTime").textContent=`${fmt(sec)} / 10:00`;$("#studyDailyTime").textContent=`${fmt(sec)} / 10:00`;$("#dailyPercent").textContent=`${pct}%`;$("#dailyRing").style.setProperty("--p",`${pct*3.6}deg`);
  $("#dailyNote").textContent=sec>=600?"Норма на сегодня выполнена ✓":"Минимум 10 минут английского в день";
}
setInterval(()=>{
  if(document.visibilityState!=="visible")return;
  const studying=!$("#studyView").classList.contains("hidden");if(!studying)return;
  const k=todayKey();daily[k]=Number(daily[k]||0)+1;saveDaily();renderDaily();
},1000);

$("#backBtn").onclick=()=>{$("#studyView").classList.add("hidden");$("#homeView").classList.remove("hidden");renderHome();selectLibrary(currentSource)};
$("#emptyBackBtn").onclick=$("#backBtn").onclick;
$("#soundBtn").onclick=()=>currentWords.length&&speak(currentWords[cardIndex].en);
$("#quizSoundBtn").onclick=()=>quizItem&&speak(quizItem.en);
$("#knowBtn").onclick=()=>markCard(true);$("#againBtn").onclick=()=>markCard(false);
$("#nextQuizBtn").onclick=newQuiz;$("#checkTypingBtn").onclick=checkTyping;$("#nextTypingBtn").onclick=newTyping;
$("#typingInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!$("#checkTypingBtn").classList.contains("hidden"))checkTyping()});
$$(".mode").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$$(".library-tab").forEach(b=>b.onclick=()=>selectLibrary(b.dataset.filter));
$("#practiceSelected").onclick=openLibrary;

migrateOld();renderHome();selectLibrary("all");
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});