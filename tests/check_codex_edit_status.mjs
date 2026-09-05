import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../app/src/main/assets/editor/codex-edits.js',import.meta.url),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const request={id:1,user:{login:'owner'},body:'@codex Исправь текст',created_at:'2026-09-05T10:00:00Z'};
const answer={id:2,user:{login:'chatgpt-codex-connector[bot]'},body:'Готово. https://chatgpt.com/s/task\n<script>bad()</script> https://evil.example/',created_at:'2026-09-05T10:01:00Z'};
function fixture({onlyTask=false,graphqlError=false,loadError=false}={}){
 const nodes=new Map(),calls=[],stored=new Map(),opened=[],imports=[];let tick,visibility,gate=null,readHook=null;
 let ctx={repo:'owner/project',branch:'main'},enabled=true;
 const element=()=>({value:'',disabled:false,textContent:'',style:{},children:[],scrollHeight:0,scrollTop:0,clientHeight:0,classList:{contains:()=>false},appendChild(n){this.children.push(n)},closest:()=>({classList:{contains:()=>true}})});
 const $=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 $('codex-pr').value=4;$('codex-mode').value='edit';$('codex-task').value='Уточнение';
 const pr={number:4,node_id:'PR_node',state:'open',draft:true,merged:false,mergeable:true,head:{sha:'head1',ref:'codex/hmi-123',repo:{full_name:'owner/project'}},base:{sha:'base1',ref:'main'},body:'Задача',user:{login:'owner'}};
 const files=[{filename:'.codex/tasks/task.md',additions:1,deletions:0}];if(!onlyTask)files.push({filename:'src/hmi.c',additions:3,deletions:1});
 const comments=[request,answer];
 async function api(method,path,body){
  calls.push({method,path,body});if(gate)await gate;
  if(method==='GET'&&/\/pulls\/\d+$/.test(path)){if(readHook)readHook();return clone(pr)}
  if(method==='GET'&&path.includes('/files?'))return path.endsWith('page=1')?clone(files):[];
  if(method==='GET'&&path.includes('/comments?'))return path.endsWith('page=1')?clone(comments):[];
  if(path==='/graphql'){
   assert.equal(body.variables.id,'PR_node');assert(body.query.includes('markPullRequestReadyForReview'));
   if(graphqlError)return{errors:[{message:'permission denied'}]};pr.draft=false;return{data:{markPullRequestReadyForReview:{pullRequest:{isDraft:false}}}};
  }
  if(method==='PUT'&&path.endsWith('/merge')){assert.equal(pr.draft,false);assert.equal(body.sha,pr.head.sha);pr.merged=true;pr.state='closed';pr.merge_commit_sha='merged-sha';return{merged:true,sha:'merged-sha'}}
  if(method==='POST'&&path.endsWith('/comments')){comments.push({id:comments.length+1,user:{login:'owner'},body:body.body});return{}};
  if(method==='PATCH'){pr.state=body.state;return{}};
  if(method==='DELETE')return{};
  throw Error('Unexpected '+method+' '+path);
 }
 const sandbox=vm.createContext({window:{},document:{getElementById:$,createElement:element,hidden:false,addEventListener:(name,fn)=>visibility=fn},localStorage:{getItem:k=>stored.has(k)?stored.get(k):null,setItem:(k,v)=>stored.set(k,v)},URL,Date,console,setInterval:(fn,ms)=>{assert.equal(ms,15000);tick=fn},clearInterval:()=>{}});
 vm.runInContext(source,sandbox);const app=sandbox.window.CodexEdits;
 app.init({api,context:()=>ctx,enabled:()=>enabled,selected:()=>{},openExternal:url=>opened.push(url),fetchProject:async(repo,sha)=>{if(loadError)throw Error('offline');return repo+'@'+sha},importMerged:(...args)=>imports.push(args),compare:()=>{}});
 return{app,$,calls,pr,files,comments,opened,imports,stored,tick:()=>tick(),visibility:()=>visibility(),gate:p=>gate=p,hook:fn=>readHook=fn,context:next=>{ctx=next;app.contextChanged()},enabled:v=>enabled=v,click:id=>$(id).onclick()};
}
{
 const f=fixture({onlyTask:true});await f.app.refresh();
 assert.match(f.$('codex-edit-status').textContent,/не опубликованы/);assert.equal(f.$('codex-merge').disabled,true);
 await f.click('codex-merge');assert.equal(f.calls.filter(c=>c.method!=='GET').length,0,'Never merge the task-only PR from the reported incident');
 const articles=f.$('codex-edit-conversation').children;assert.equal(articles.length,3);const last=articles.at(-1);
 assert(last.children.some(n=>n.textContent.includes('<script>bad()</script>')),'Render untrusted message as literal text');
 const link=last.children.find(n=>n.href);assert.equal(link.href,'https://chatgpt.com/s/task');link.onclick({preventDefault(){}});assert.deepEqual(f.opened,['https://chatgpt.com/s/task']);
 assert(!last.children.some(n=>n.href?.includes('evil.example')));
}
{
 const f=fixture();await f.app.refresh();assert.equal(f.$('codex-merge').disabled,false);
 await f.click('codex-merge');assert.deepEqual(f.calls.filter(c=>c.method!=='GET').map(c=>c.path),['/graphql','/repos/owner/project/pulls/4/merge']);
 assert.equal(f.imports[0][0],'owner/project@merged-sha','Load exactly the merged result');assert.equal(f.$('codex-edit-load').disabled,false);
}
{
 const f=fixture({graphqlError:true});await f.click('codex-merge');assert.match(f.$('codex-edit-status').textContent,/permission denied/);assert(!f.calls.some(c=>c.method==='PUT'));
 const g=fixture();g.pr.mergeable=false;await g.click('codex-merge');assert(!g.calls.some(c=>c.method!=='GET'));
}
{
 const f=fixture();await f.click('codex-followup');assert.match(f.$('codex-edit-status').textContent,/Нового ответа/);assert.equal(f.$('codex-merge').disabled,true);
 assert(f.comments.at(-1).body.includes('ветка codex/hmi-123'));
 await f.click('codex-merge');assert(!f.calls.some(c=>c.method==='PUT'));
 f.comments.push({...answer,id:4});await f.app.refresh();assert.equal(f.$('codex-merge').disabled,false);
}
{
 const f=fixture({loadError:true});await f.click('codex-merge');assert.match(f.$('codex-edit-status').textContent,/уже объединён, но проект не загружен/);assert.equal(f.$('codex-edit-load').disabled,false);
 await f.click('codex-edit-load');assert.equal(f.calls.filter(c=>c.method==='PUT').length,1,'Retry loading without merging again');
}
{
 const f=fixture();let release;f.gate(new Promise(r=>release=r));const first=f.click('codex-merge');await f.click('codex-merge');release();f.gate(null);await first;assert.equal(f.calls.filter(c=>c.method==='PUT').length,1,'Double tap merges once');
}
{
 const f=fixture();let release;f.gate(new Promise(r=>release=r));const pending=f.click('codex-merge');
 f.context({repo:'other/project',branch:'main'});release();f.gate(null);await pending;
 assert(!f.calls.some(c=>c.method!=='GET'),'Repo switch must cancel mutations');assert.equal(Number(f.$('codex-pr').value),0);
 f.context({repo:'owner/project',branch:'main'});assert.equal(Number(f.$('codex-pr').value),4,'PR selection is per repo');
}
{
 const f=fixture();let reads=0;f.hook(()=>{if(++reads===3)f.pr.head.sha='head2'});await f.click('codex-merge');assert(!f.calls.some(c=>c.method==='PUT'),'Head changed after ready: review again');
 assert.match(f.$('codex-edit-status').textContent,/изменились/);
}
{
 const f=fixture();f.enabled(false);await f.app.refresh();f.tick();assert.equal(f.calls.length,0,'AI disabled sends no requests');
 const g=fixture();g.$('codex-mode').value='ask';g.tick();assert.equal(g.calls.length,0,'Only poll the active edit panel');
}
{
 const f=fixture();f.comments.splice(0,f.comments.length,...Array.from({length:100},(_,i)=>({...request,id:i,body:'comment'})));
 f.files.splice(0,f.files.length,...Array.from({length:100},(_,i)=>({filename:'src/'+i+'.c'})));
 await f.app.refresh();assert(f.calls.some(c=>c.path.endsWith('/files?per_page=100&page=2')));assert(f.calls.some(c=>c.path.endsWith('/comments?per_page=100&page=2')));
}
console.log('PASS: missing published code, replies/links, follow-up status, draft-to-merge, GraphQL errors, conflicts, SHA race, duplicate clicks, merged-load recovery, repo isolation, pagination and polling gates');
