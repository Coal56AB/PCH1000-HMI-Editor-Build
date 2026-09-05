import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../app/src/main/assets/editor/app-shell.js',import.meta.url),'utf8');
const flow=source.slice(source.indexOf('var codexEditBusy='),source.indexOf('async function loadPr()'));
assert(flow,'Edit request handler must be present');
const fault=(message,status=0)=>Object.assign(new Error(message),{status});

function fixture({lose='',deny=false}={}){
  const stored=new Map(),calls=[],issues=[],comments=[],remembered=[];let lost=false,gate=null,nodes,state,context;
  async function api(method,path,body){
    calls.push({method,path,body});if(gate)await gate;if(deny)throw fault('Forbidden',403);
    let result,stage='';
    if(method==='GET'&&/\/issues\?state=all/.test(path))result=issues;
    else if(method==='POST'&&path.endsWith('/issues')){result={number:41+issues.length,title:body.title,body:body.body};issues.push(result);stage='issue'}
    else if(method==='GET'&&path.includes('/comments?'))result=comments;
    else if(method==='POST'&&path.endsWith('/comments')){result={id:comments.length+1,user:{login:'owner'},body:body.body};comments.push(result);stage='comment'}
    else throw Error('Unexpected '+method+' '+path);
    if(lose&&stage===lose&&!lost){lost=true;throw fault('Response lost after '+stage)}return result;
  }
  function boot(){
    nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:true,disabled:false});return nodes.get(id)};
    state={repo:'owner/project',branch:'main'};
    const CodexEdits={rememberTask:job=>remembered.push({...job}),activate(){}};
    context=vm.createContext({$,state,api,hasToken:()=>true,CodexEdits,window:{crypto:webcrypto,CodexEdits},Date,
      parse:s=>{try{return JSON.parse(s||'{}')}catch{return{}}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
      HmiEditor:{selectedContext:()=>({sceneName:'Графики',key:'#tabs'})},setMessage:(text,error)=>{$('#status').value=text;$('#status').error=!!error}
    });
    vm.runInContext(flow,context);$('#codex-task').value='Передавай названия вкладок с контроллера — °C';
  }
  boot();return{calls,issues,comments,remembered,stored,get state(){return state},node:id=>nodes.get(id),send:()=>nodes.get('#codex-start').onclick(),boot,gate:v=>gate=v,setEnabled:v=>context.$('#ai-beta').checked=v};
}

{
  const f=fixture();await f.send();assert(!f.node('#status').error,f.node('#status').value);
  assert.equal(f.issues.length,1);assert.equal(f.comments.length,1);assert.equal(f.remembered.length,1);
  assert.deepEqual(f.calls.filter(c=>c.method!=='GET').map(c=>c.path),['/repos/owner/project/issues','/repos/owner/project/issues/41/comments']);
  assert(!f.calls.some(c=>/git\/refs|\/contents\/|\/pulls$/.test(c.path)),'Starting a Codex task must not create an empty branch or Draft PR');
  const branch=f.remembered[0].branch;assert.match(branch,/^codex\/peredavay-nazvaniya-vkladok-s-kontrollera-c-[0-9a-f]{8}$/);
  assert(f.issues[0].body.includes(branch));assert(f.comments[0].body.startsWith('@codex '));assert(f.comments[0].body.includes('Open pull request'));assert(f.comments[0].body.includes('Не пытайся выполнять обычный git push'));
  assert.equal(f.stored.has('pch-codex-edit-pending'),false);
}
for(const lose of ['issue','comment']){
  const f=fixture({lose});await f.send();assert(f.node('#status').error);assert(f.stored.has('pch-codex-edit-pending'));
  f.boot();await f.send();assert(!f.node('#status').error,f.node('#status').value);assert.equal(f.issues.length,1,lose);assert.equal(f.comments.length,1,lose);
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
console.log('PASS: issue-first Codex task, readable branch request, no empty Draft PR, idempotent retries, double-tap, permission and repo-switch guards');
