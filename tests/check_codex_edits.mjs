import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../app/src/main/assets/editor/app-shell.js',import.meta.url),'utf8');
const flow=source.slice(source.indexOf('var codexEditBusy='),source.indexOf('async function loadPr()'));
assert(flow,'Edit request handler must be present');
const fault=(message,status=0)=>Object.assign(new Error(message),{status});

function fixture({lose='',deny=false}={}){
  const stored=new Map(),calls=[],refs=new Map([['main','base-sha']]),files=new Map(),pulls=[],comments=[],remembered=[];
  let lost=false,gate=null,nodes,state,context;
  async function api(method,path,body){
    calls.push({method,path,body});if(gate)await gate;if(deny)throw fault('Forbidden',403);
    let result,stage='';
    const ref=decodeURIComponent((path.match(/\/git\/ref\/heads\/(.+)$/)||[])[1]||'');
    if(method==='GET'&&ref){if(!refs.has(ref))throw fault('Not Found',404);result={object:{sha:refs.get(ref)}}}
    else if(method==='POST'&&path.endsWith('/git/refs')){const name=body.ref.replace(/^refs\/heads\//,'');refs.set(name,body.sha);result={ref:body.ref,object:{sha:body.sha}};stage='branch'}
    else if(method==='GET'&&path.includes('/contents/.codex/tasks/')){const filePath=decodeURIComponent(path.split('/contents/')[1].split('?')[0]);if(!files.has(filePath))throw fault('Not Found',404);result={path:filePath,sha:'task-sha',content:files.get(filePath)}}
    else if(method==='PUT'&&path.includes('/contents/.codex/tasks/')){const filePath=decodeURIComponent(path.split('/contents/')[1]);files.set(filePath,body.content);result={content:{path:filePath,sha:'task-sha'}};stage='file'}
    else if(method==='GET'&&path.includes('/pulls?state=all&head='))result=pulls;
    else if(method==='POST'&&path.endsWith('/pulls')){result={number:41,html_url:'https://github.com/owner/project/pull/41',state:'open',draft:body.draft,head:{ref:body.head},base:{ref:body.base}};pulls.push(result);stage='pr'}
    else if(method==='GET'&&path.includes('/issues/41/comments?'))result=comments;
    else if(method==='POST'&&path.endsWith('/issues/41/comments')){result={id:comments.length+1,user:{login:'owner'},body:body.body};comments.push(result);stage='comment'}
    else throw Error('Unexpected '+method+' '+path);
    if(lose&&stage===lose&&!lost){lost=true;throw fault('Response lost after '+stage)}return result;
  }
  function boot(){
    nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:true,disabled:false});return nodes.get(id)};
    state={repo:'owner/project',branch:'main'};
    const CodexEdits={rememberTask:job=>remembered.push({...job}),activate(){}};
    context=vm.createContext({$,state,api,hasToken:()=>true,CodexEdits,window:{crypto:webcrypto,CodexEdits},Date,TextEncoder,btoa:value=>Buffer.from(value,'binary').toString('base64'),decodeBase64:value=>Buffer.from(value,'base64').toString('utf8'),
      parse:s=>{try{return JSON.parse(s||'{}')}catch{return{}}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
      HmiEditor:{selectedContext:()=>({sceneName:'Графики',key:'#tabs'})},setMessage:(text,error)=>{$('#status').value=text;$('#status').error=!!error}
    });
    vm.runInContext(flow,context);$('#codex-task').value='Передавай названия вкладок с контроллера — °C';
  }
  boot();return{calls,refs,files,pulls,comments,remembered,stored,get state(){return state},node:id=>nodes.get(id),send:()=>nodes.get('#codex-start').onclick(),boot,gate:v=>gate=v,setEnabled:v=>context.$('#ai-beta').checked=v};
}

{
  const f=fixture();await f.send();assert(!f.node('#status').error,f.node('#status').value);
  assert.equal(f.pulls.length,1);assert.equal(f.comments.length,1);assert.equal(f.remembered.length,1);
  const writes=f.calls.filter(c=>c.method!=='GET');
  assert.deepEqual(writes.map(c=>c.method),['POST','PUT','POST','POST']);
  assert.equal(writes[0].path,'/repos/owner/project/git/refs');
  assert.match(writes[1].path,/\/contents\/\.codex\/tasks\/hmi-/);
  assert.equal(writes[2].path,'/repos/owner/project/pulls');
  assert.equal(writes[3].path,'/repos/owner/project/issues/41/comments');
  const branch=f.remembered[0].branch;assert.match(branch,/^codex\/peredavay-nazvaniya-vkladok-s-kontrollera-c-[0-9a-f]{8}$/);
  assert.equal(f.pulls[0].draft,true);assert.equal(f.pulls[0].head.ref,branch);assert.equal(f.pulls[0].base.ref,'main');
  assert(f.comments[0].body.startsWith('@codex '));assert(f.comments[0].body.includes('текущей ветке этого Draft PR'));assert(f.comments[0].body.includes('не вызывай make_pr'));
  assert.equal(f.remembered[0].pr,41);assert.equal(f.stored.has('pch-codex-edit-pending'),false);
}
for(const lose of ['branch','file','pr','comment']){
  const f=fixture({lose});await f.send();assert(f.node('#status').error);assert(f.stored.has('pch-codex-edit-pending'));
  f.boot();await f.send();assert(!f.node('#status').error,f.node('#status').value);assert.equal(f.pulls.length,1,lose);assert.equal(f.comments.length,1,lose);assert.equal(f.refs.size,2,lose);assert.equal(f.files.size,1,lose);
}
{
  const f=fixture();let release;f.gate(new Promise(resolve=>release=resolve));const first=f.send();await f.send();assert.equal(f.node('#codex-start').disabled,true);release();f.gate(null);await first;assert.equal(f.comments.length,1,'Double tap sends once');
}
{
  const f=fixture();f.setEnabled(false);await f.send();assert.equal(f.calls.length,0);const denied=fixture({deny:true});await denied.send();assert.equal(denied.calls.length,1);assert(denied.node('#status').error);
}
{
  const f=fixture();let release;f.gate(new Promise(resolve=>release=resolve));const first=f.send();f.state.repo='other/project';f.state.branch='other';release();f.gate(null);await first;assert(f.calls.every(c=>c.path.startsWith('/repos/owner/project/')),'Async work must use captured repository');assert.equal(f.remembered.at(-1).repo,'owner/project');
}
console.log('PASS: Draft-PR-first Codex task, readable branch, task marker, idempotent retries, double-tap, permission and repo-switch guards');
