import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const markdown=fs.readFileSync(new URL('../app/src/main/assets/editor/codex-markdown.js',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../app/src/main/assets/editor/codex-edits.js',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));

function fixture({withAnswer=false,withPr=false,merged=false,taskFile=false,loadError=false,prFirst=false}={}){
  const nodes=new Map(),stored=new Map(),calls=[],opened=[],imports=[];let tick,enabled=true,gate=null;
  let context={repo:'owner/project',branch:'main'};
  const issue={id:9,number:9,state:'open',title:'HMI: вкладки',body:'Изменить вкладки',user:{login:'owner'},created_at:'2026-09-05T10:00:00Z'};
  const comments=[{id:1,user:{login:'owner'},body:'@codex Исправь вкладки',created_at:'2026-09-05T10:00:01Z'}];
  if(withAnswer)comments.push({id:2,user:{login:'chatgpt-codex-connector[bot]'},body:'# Готово\n\n**Diff подготовлен.** https://chatgpt.com/codex/tasks/abc\n\n<script>bad()</script>',created_at:'2026-09-05T10:01:00Z'});
  const pr={id:4,number:4,node_id:'PR_node',html_url:'https://github.com/owner/project/pull/4',state:merged?'closed':'open',draft:false,merged,mergeable:true,merge_commit_sha:merged?'merge-sha':null,body:'Resolves #9',user:{login:'owner'},head:{sha:'head1',ref:'codex/ispravit-vkladki-a1b2c3d4',repo:{full_name:'owner/project'}},base:{sha:'base1',ref:'main'}};
  const files=[{filename:'src/hmi.c',additions:3,deletions:1,patch:'@@ code'}];if(taskFile)files.unshift({filename:'.codex/tasks/hmi-old.md',additions:1,deletions:0});
  stored.set('pch-codex-edit-selection:owner/project',JSON.stringify({issue:prFirst?0:9,pr:withPr?4:0,requestedBranch:'codex/ispravit-vkladki-a1b2c3d4',base:'main'}));
  function node(tag='div'){let own='';const classes=new Set();return{tagName:String(tag).toUpperCase(),value:'',style:{},dataset:{},disabled:false,children:[],scrollHeight:10,clientHeight:10,scrollTop:0,className:'',classList:{contains:name=>classes.has(name),toggle(name,on){if(on)classes.add(name);else classes.delete(name)},add:name=>classes.add(name),remove:name=>classes.delete(name)},appendChild(child){this.children.push(child)},closest(){return{classList:{contains:()=>true}}},set textContent(value){own=String(value);if(value==='')this.children=[]},get textContent(){return own+this.children.map(child=>child.textContent||'').join('')}}}
  const $=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};$('codex-mode').value='edit';
  async function api(method,path,body){
    calls.push({method,path,body});if(gate)await gate;
    if(method==='GET'&&path==='/repos/owner/project/issues/9')return clone(issue);
    if(method==='GET'&&(path.includes('/issues/9/comments?')||path.includes('/issues/4/comments?')))return path.endsWith('page=1')?clone(comments):[];
    if(method==='GET'&&path.includes('/issues/9/timeline?'))return[];
    if(method==='GET'&&path.includes('/pulls?state=all'))return withPr?[clone(pr)]:[];
    if(method==='GET'&&path==='/repos/owner/project/pulls/4')return clone(pr);
    if(method==='GET'&&path.includes('/pulls/4/files?'))return path.endsWith('page=1')?clone(files):[];
    if(method==='POST'&&path==='/graphql')return{data:{markPullRequestReadyForReview:{pullRequest:{isDraft:false}}}};
    if(method==='POST'&&path.includes('/branches/')&&path.endsWith('/rename')){pr.head.ref=body.new_name;return clone(pr)}
    if(method==='GET'&&path.includes('/contents/.codex/tasks/hmi-old.md'))return{sha:'task-sha'};
    if(method==='DELETE'&&path.includes('/contents/.codex/tasks/hmi-old.md')){files.splice(files.findIndex(f=>f.filename.startsWith('.codex/tasks/')),1);pr.head.sha='head2';return{commit:{sha:'head2'}}}
    if(method==='PUT'&&path.endsWith('/pulls/4/merge')){assert.equal(body.sha,pr.head.sha);pr.merged=true;pr.state='closed';pr.merge_commit_sha='merge-sha';return{merged:true,sha:'merge-sha'}}
    if(method==='PATCH'&&path.endsWith('/pulls/4')){pr.state=body.state;return clone(pr)}
    if(method==='PATCH'&&path.endsWith('/issues/9')){issue.state=body.state;return clone(issue)}
    if(method==='DELETE'&&path.includes('/git/refs/heads/'))return{};
    if(method==='POST'&&path.endsWith('/issues/9/comments')){comments.push({id:comments.length+1,user:{login:'owner'},body:body.body});return clone(comments.at(-1))}
    throw Error('Unexpected '+method+' '+path);
  }
  const document={hidden:false,getElementById:$,createElement:node,createTextNode:text=>({textContent:String(text)}),addEventListener(){}};
  const sandbox=vm.createContext({window:{},document,URL,Date,console,localStorage:{getItem:key=>stored.has(key)?stored.get(key):null,setItem:(key,value)=>stored.set(key,value)},setInterval:fn=>{tick=fn;return 1},clearInterval(){}});
  vm.runInContext(markdown,sandbox);sandbox.CodexMarkdown=sandbox.window.CodexMarkdown;vm.runInContext(source,sandbox);
  const app=sandbox.window.CodexEdits;app.init({api,context:()=>context,enabled:()=>enabled,selected(){},openExternal:url=>opened.push(url),fetchProject:async(repo,sha)=>{if(loadError)throw Error('offline');return repo+'@'+sha},importMerged:(...args)=>imports.push(args),compare(){}});
  return{app,$,calls,opened,imports,issue,comments,pr,files,stored,enable:value=>enabled=value,gate:value=>gate=value,tick:()=>tick(),context:value=>{context=value;app.contextChanged()},setPr:value=>withPr=value,click:id=>$(id).onclick()};
}

{
  const f=fixture({withPr:true,taskFile:true,prFirst:true});await f.app.refresh();assert.match(f.$('codex-edit-status').textContent,/обрабатывает/);assert.equal(f.$('codex-merge').disabled,true);
  f.comments.push({id:2,user:{login:'chatgpt-codex-connector[bot]'},body:'# Готово\n\n**Изменения опубликованы.**'});await f.app.refresh();assert.match(f.$('codex-edit-status').textContent,/Codex закончил/);assert.equal(f.$('codex-merge').disabled,false);
}

{
  const f=fixture();await f.app.refresh();assert.match(f.$('codex-edit-status').textContent,/ещё работает/);assert.equal(f.$('codex-result-actions').classList.contains('hidden'),true);
  f.comments.push({id:2,user:{login:'chatgpt-codex-connector[bot]'},body:'# Готово\n\n**Diff подготовлен.** https://chatgpt.com/codex/tasks/abc\n<script>bad()</script>'});await f.app.refresh();
  assert.match(f.$('codex-edit-status').textContent,/Codex ответил/);const body=f.$('codex-edit-conversation').children.at(-1).children[1];assert.equal(body.children[0].tagName,'H3');assert(body.textContent.includes('<script>bad()</script>'));
  await f.click('codex-edit-open');assert.equal(f.opened[0],'https://chatgpt.com/codex/tasks/abc');
}
{
  const f=fixture({withAnswer:true,withPr:true,taskFile:true});await f.app.refresh();assert.match(f.$('codex-edit-status').textContent,/Codex закончил/);assert.equal(f.$('codex-merge').disabled,false);
  await f.click('codex-merge');assert(f.calls.some(c=>c.method==='DELETE'&&c.path.includes('/contents/.codex/tasks/')),'Temporary task file is removed before merge');assert(f.calls.some(c=>c.method==='PUT'&&c.path.endsWith('/merge')));assert(f.calls.some(c=>c.method==='PATCH'&&c.path.endsWith('/issues/9')));assert(f.calls.some(c=>c.method==='DELETE'&&c.path.includes('/git/refs/heads/')));assert.equal(f.imports[0][0],'owner/project@merge-sha');
}
{
  const f=fixture({withAnswer:true});await f.app.refresh();await f.click('codex-reject');assert.equal(f.issue.state,'closed');assert(!f.calls.some(c=>c.path.includes('/git/refs/heads/')),'Issue-only cancellation has no branch to delete');
}
{
  const f=fixture({withAnswer:true,withPr:true});await f.app.refresh();await f.click('codex-reject');assert.equal(f.pr.state,'closed');assert.equal(f.issue.state,'closed');assert(f.calls.some(c=>c.method==='DELETE'&&c.path.includes('/git/refs/heads/')));
}
{
  const f=fixture({withAnswer:true,withPr:true});f.pr.head.ref='codex/generated-random-name';await f.app.refresh();assert(f.calls.some(c=>c.method==='POST'&&c.path.includes('/branches/codex%2Fgenerated-random-name/rename')));assert.equal(f.pr.head.ref,'codex/ispravit-vkladki-a1b2c3d4');
}
{
  const f=fixture({withAnswer:true,withPr:true});await f.app.refresh();f.$('codex-followup-text').value='Проверь часы';await f.click('codex-followup');assert(f.comments.at(-1).body.startsWith('@codex Проверь часы'));assert.match(f.$('codex-edit-status').textContent,/обрабатывает/);
}
{
  const f=fixture({withAnswer:true,withPr:true});f.enable(false);await f.app.refresh();f.tick();assert.equal(f.calls.length,0,'AI disabled sends no requests');
}
console.log('PASS: visible task states, Markdown answers, task-to-PR discovery, readable rename, follow-up, merge/reject cleanup and beta polling gate');
