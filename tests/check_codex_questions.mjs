import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../app/src/main/assets/editor/codex-questions.js',import.meta.url),'utf8');
function fixture(){
 const nodes=new Map(),stored=new Map(),calls=[];let repo='owner/c-project',enabled=true,failComment=false,gate=null;const comments=[];
 function node(){return{value:'',textContent:'',style:{},disabled:false,children:[],scrollHeight:10,clientHeight:10,scrollTop:0,classList:{contains:()=>false},appendChild(x){this.children.push(x)},closest(){return{classList:{contains:()=>true}}}}}
 const $=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 $('codex-mode').value='ask';let poll;
 const deps={enabled:()=>enabled,context:()=>({repo,branch:'main',element:{sceneName:'Графики',key:'#graph-tabs'}}),openExternal(){},async api(method,path,body){calls.push({method,path,body});if(gate)await gate;
  if(path.includes('/git/ref/heads/'))return{object:{sha:'abc123'}};
  if(method==='POST'&&path.endsWith('/issues'))return{number:42};
  if(method==='POST'&&path.endsWith('/comments')){if(failComment)throw Error('offline');const c={id:comments.length+1,user:{login:'user'},body:body.body};comments.push(c);return c}
  if(method==='GET'&&path.includes('/comments?'))return comments;
  if(method==='GET'&&/\/issues\/\d+$/.test(path))return{body:'Conversation',user:{login:'user'}};
  throw Error('Unexpected request '+method+' '+path);
 }};
 const context=vm.createContext({window:{},URL,document:{hidden:false,getElementById:$,createElement:node,addEventListener(){}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},setInterval:f=>{poll=f;return 1},clearInterval(){}});
 vm.runInContext(source,context);const q=context.window.CodexQuestions;q.init(deps);
 return{$,q,calls,stored,comments,poll:()=>poll(),enabled:v=>enabled=v,repo:v=>{repo=v;q.contextChanged()},fail:v=>failComment=v,gate:v=>gate=v};
}
{
 const f=fixture();f.$('codex-question').value='Кто задаёт названия вкладок?';await f.$('codex-ask-send').onclick();
 assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/issues')).length,1);
 assert(f.calls.every(c=>c.method==='GET'||/\/issues(?:\/42\/comments)?$/.test(c.path)),'Question must never mutate files, refs or PRs');
 const prompt=f.comments[0].body;assert(prompt.includes('Не изменяй файлы'));assert(prompt.includes('abc123'));assert(prompt.includes('#graph-tabs'));assert(!prompt.includes('обнови PCH1000'));
 f.$('codex-question').value='А почему?';await f.$('codex-ask-send').onclick();assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/issues')).length,1,'Followup reuses conversation');
 f.repo('other/project');assert.equal(f.$('codex-thread').value,'');assert.equal(f.$('codex-conversation').textContent,'');f.repo('owner/c-project');assert.equal(f.$('codex-thread').value,42);
 f.comments.push({id:3,user:{login:'codex'},body:'<img src=x onerror=alert(1)> https://chatgpt.com/codex/tasks/test'});await f.$('codex-ask-refresh').onclick();
 const message=f.$('codex-conversation').children.at(-1);assert(message.children[1].textContent.startsWith('<img'),'Bot text is displayed literally');assert.equal(message.children[2].href,'https://chatgpt.com/codex/tasks/test');
}
{
 const f=fixture();f.enabled(false);f.$('codex-question').value='question';await f.$('codex-ask-send').onclick();assert.equal(f.calls.length,0,'Beta-off sends nothing');
}
{
 const f=fixture();let release;f.gate(new Promise(r=>release=r));f.$('codex-question').value='question';const first=f.$('codex-ask-send').onclick();await f.$('codex-ask-send').onclick();release();f.gate(null);await first;assert.equal(f.comments.length,1,'Double tap sends once');
}
{
 const f=fixture();f.fail(true);f.$('codex-question').value='question';await f.$('codex-ask-send').onclick();assert.equal(f.$('codex-question').value,'question');assert.equal(f.$('codex-ask-send').disabled,false);f.fail(false);await f.$('codex-ask-send').onclick();assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/issues')).length,1,'Retry does not create duplicate issue');
}
console.log('PASS: question-only API requests, read-only prompt, repo-isolated conversations, safe answer text/links, beta gate, double tap, failed-send recovery');
