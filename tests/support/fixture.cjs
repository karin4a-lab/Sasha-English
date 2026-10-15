// A small DOM model for event/learning tests, not a browser or a visual renderer.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', '..');
const decode = text => text.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function fixture(options = {}) {
  let now = Date.parse(options.now || '2026-10-11T12:00:00Z');
  const ids = new Map(), staticNodes = [], listeners = new Map(), intervals = [], speech = [];
  const storage = new Map(Object.entries(options.storage || {}).map(([key,value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  class Element {
    constructor(tag, attrs = {}) {
      this.tagName = tag; this.attributes = attrs; this.id = attrs.id || ''; this.dataset = {};
      this.classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean)); this.children = [];
      this.disabled = 'disabled' in attrs; this.style = {setProperty:(k,v)=>this.style[k]=v};
      this.textContent = ''; this._html = ''; this.value = ''; this.parentNode = null;
      for (const [key,value] of Object.entries(attrs)) if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] = value;
      this.classList = { add:(...names)=>names.forEach(n=>this.classes.add(n)), remove:(...names)=>names.forEach(n=>this.classes.delete(n)),
        contains:n=>this.classes.has(n), toggle:(n,force)=>{ const on=force ?? !this.classes.has(n); on?this.classes.add(n):this.classes.delete(n); return on; } };
    }
    set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
    get className() { return [...this.classes].join(' '); }
    setAttribute(key,value) { this.attributes[key]=value; }
    getAttribute(key) { return this.attributes[key]; }
    set innerHTML(value) { this._html=value; this.children=parse(value); this.children.forEach(n=>n.parentNode=this); }
    get innerHTML() { return this._html; }
    closest(selector) { let n=this; while(n){ if(matches(n,selector))return n; n=n.parentNode; } return null; }
    click() { if(this.disabled)return; for(const fn of listeners.get('pointerdown')||[]) fn({target:this}); if(this.onclick)return this.onclick({target:this}); }
    appendChild(child) { this.children.push(child); child.parentNode=this; }
    remove() { if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this); }
  }
  function parse(html) {
    const nodes = [], re=/<([a-z][\w:-]*)\b([^>]*?)>/gi;
    for (const match of html.matchAll(re)) {
      const attrs={};
      for (const a of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1]]=decode(a[2]??a[3]??a[4]??'');
      const el=new Element(match[1].toLowerCase(),attrs);
      const after=html.slice(match.index+match[0].length);
      el.textContent=decode(after.split('<')[0]);
      nodes.push(el);
    }
    return nodes;
  }
  function matches(el,selector) { return selector.startsWith('#')?el.id===selector.slice(1):selector.startsWith('.')?el.classes.has(selector.slice(1)):el.tagName===selector; }
  staticNodes.push(...parse(fs.readFileSync(path.join(root,'index.html'),'utf8')));
  for(const n of staticNodes)if(n.id){if(ids.has(n.id))throw new Error('Duplicate HTML id '+n.id);ids.set(n.id,n);}
  const descendants = nodes => nodes.flatMap(n=>[n,...descendants(n.children)]);
  function queryAll(selector) {
    const parts=selector.trim().split(/\s+/);
    if(parts.length===1)return descendants(staticNodes).filter(n=>matches(n,parts[0]));
    const host=queryAll(parts[0])[0];
    return host?descendants(host.children).filter(n=>matches(n,parts.at(-1))):[];
  }
  const document = {visibilityState:'visible', querySelectorAll:queryAll,querySelector:selector=>{
    const n=queryAll(selector)[0]; if(!n)throw new Error('Missing DOM element '+selector); return n;
  },addEventListener:(event,fn)=>{if(!listeners.has(event))listeners.set(event,[]);listeners.get(event).push(fn);},
    createElement:tag=>new Element(tag),body:staticNodes.find(n=>n.tagName==='body')};
  class ClockDate extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} }
  const windowListeners = new Map();
  const window = {scrollTo(){},addEventListener:(name,fn)=>windowListeners.set(name,fn)};
  if(options.audio!==false)window.speechSynthesis={cancel(){},getVoices:()=>[{lang:'en-GB'}],speak:u=>speech.push(u)};
  const context=vm.createContext({document,window,Date:ClockDate,console,
    localStorage:{getItem:key=>{if(options.blocked)throw new Error('blocked');return storage.get(key)??null;},setItem:(key,value)=>{if(options.blocked)throw new Error('blocked');storage.set(key,value);}},
    setInterval:fn=>intervals.push(fn),setTimeout:fn=>fn(),Blob,
    URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
    SpeechSynthesisUtterance:options.audio===false?undefined:class{constructor(text){this.text=text;}}});
  const scripts = [...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script src="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
  for(const file of scripts)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  return {context,document,storage,speech,run:code=>vm.runInContext(code,context),
    click:selector=>document.querySelector(selector).click(),
    advance:seconds=>{for(let i=0;i<seconds;i++){now+=1000;intervals.forEach(fn=>fn());}},
    jump:milliseconds=>{now+=milliseconds;intervals.forEach(fn=>fn());},
    visibility:value=>{document.visibilityState=value;(listeners.get('visibilitychange')||[]).forEach(fn=>fn());},
    element:selector=>document.querySelector(selector),elements:queryAll};
}
module.exports={fixture};
