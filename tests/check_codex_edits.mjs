import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const source=fs.readFileSync(new URL('../app/src/main/assets/editor/app-shell.js',import.meta.url),'utf8');
const flow=source.slice(source.indexOf('var codexEditBusy='),source.indexOf('async function loadPr()'));
assert(flow,'Edit request handler must be present');
const fault=(message,status=0)=>Object.assign(new Error(message),{status});

function fixture({lose='',deny=false}={}){
 const stored=new Map(),calls=[],branches=new Map(),files=new Map(),prs=[],comments=[];
 let lost=false,gate=null,context,nodes,state;
 const api=async(method,path,body)=>{
  calls.push({method,path,body});if(gate)await gate;
  if(deny)throw fault('Forbidden',403);
  let result,stage='';
  if(method==='GET'&&path.includes('/git/ref/heads/')){
   const branch=decodeURIComponent(path.split('/heads/')[1]);
   if(branch==='main')return{object:{sha:'base-sha'}};
   if(!branches.has(branch))throw fault('Not Found',404);
   return{object:{sha:branches.get(branch)}};
  }else if(method==='POST'&&path.endsWith('/git/refs')){
   const branch=body.ref.slice('refs/heads/'.length);
   assert(!branches.has(branch),'Retry must not create a second ref');
   branches.set(branch,body.sha);stage='branch';result={};
  }else if(method==='GET'&&path.includes('/contents/')){
   const key=path.split('?')[0];if(!files.has(key))throw fault('Not Found',404);
   return{type:'file',content:files.get(key)};
  }else if(method==='PUT'&&path.includes('/contents/')){
   assert(path.includes('/contents/.codex/tasks/'),'Never overwrite C/project files');
   assert(!files.has(path),'Retry must not overwrite task file');
   assert(branches.has(body.branch));assert.notEqual(body.branch,'main');
   files.set(path,body.content);branches.set(body.branch,'task-commit');stage='file';result={};
  }else if(method==='GET'&&path.includes('/pulls?')){
   const url=new URL('https://api.github.com'+path);
   const branch=url.searchParams.get('head').slice('owner:'.length);
   return prs.filter(pr=>pr.head===branch);
  }else if(method==='POST'&&path.endsWith('/pulls')){
   // Reproduce the original GitHub rejection of an identical head and base.
   if(branches.get(body.head)==='base-sha')throw fault('Validation Failed: No commits between main and head',422);
   assert.equal(body.base,'main');assert.equal(body.draft,true);
   result={number:42+prs.length,head:body.head};prs.push(result);stage='pr';
  }else if(method==='GET'&&path.includes('/comments?')){
   return comments;
  }else if(method==='POST'&&path.endsWith('/comments')){
   comments.push({body:body.body});result={};stage='comment';
  }else throw new Error('Unexpected API call '+method+' '+path);
  if(stage===lose&&!lost){lost=true;throw fault('Response lost after '+stage)}
  return result;
 };
 function boot(){
  nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:true,disabled:false});return nodes.get(id)};
  state={repo:'owner/project',branch:'main',pr:0,head:''};
  context=vm.createContext({$,state,api,hasToken:()=>true,window:{crypto:webcrypto},TextEncoder,Date,
   btoa:s=>Buffer.from(s,'binary').toString('base64'),
   decodeBase64:s=>Buffer.from(s,'base64').toString('utf8'),
   encodedPath:p=>p.split('/').map(encodeURIComponent).join('/'),
   parse:s=>{try{return JSON.parse(s||'{}')}catch{return{}}},
   localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
   HmiEditor:{selectedContext:()=>({sceneName:'Графики',key:'#tabs'})},
   setMessage:(text,error)=>{$('#status').value=text;$('#status').error=!!error}
  });
  vm.runInContext(flow,context);$('#codex-task').value='Передавай названия вкладок с контроллера — °C';
 }
 boot();
 return{calls,stored,branches,files,prs,comments,boot,get state(){return state},
  node:id=>nodes.get(id),send:()=>nodes.get('#codex-start').onclick(),gate:p=>gate=p,
  setEnabled:v=>context.$('#ai-beta').checked=v};
}

{
 const f=fixture();await f.send();assert(!f.node('#status').error,f.node('#status').value);
 assert.equal(f.branches.size,1);assert.equal(f.files.size,1);assert.equal(f.prs.length,1);assert.equal(f.comments.length,1);
 const writes=f.calls.filter(c=>c.method!=='GET');
 assert.deepEqual(writes.map(c=>c.method),['POST','PUT','POST','POST']);
 const document=Buffer.from([...f.files.values()][0],'base64').toString('utf8');
 assert(document.includes('контроллера — °C'),'Russian text must survive UTF-8/Base64');
 assert(f.comments[0].body.startsWith('@codex '));assert.equal(f.state.pr,42);
 assert.equal(f.stored.has('pch-codex-edit-pending'),false);
}
for(const lose of ['branch','file','pr','comment']){
 const f=fixture({lose});await f.send();assert(f.node('#status').error);
 assert.equal(f.node('#codex-start').disabled,false);assert(f.stored.has('pch-codex-edit-pending'));
 if(lose==='comment')assert.equal(f.state.pr,42,'PR remains accessible if sending fails');
 f.boot();await f.send();assert(!f.node('#status').error,f.node('#status').value);
 assert.equal(f.branches.size,1,lose);assert.equal(f.files.size,1,lose);
 assert.equal(f.prs.length,1,lose);assert.equal(f.comments.length,1,lose);
}
{
 const f=fixture();let release;f.gate(new Promise(r=>release=r));
 const first=f.send();await f.send();assert.equal(f.node('#codex-start').disabled,true);
 release();f.gate(null);await first;assert.equal(f.comments.length,1,'Double tap sends once');
}
{
 const f=fixture();f.setEnabled(false);await f.send();assert.equal(f.calls.length,0);
 const denied=fixture({deny:true});await denied.send();assert(denied.calls.every(c=>c.method==='GET'),'403 must never be treated as missing ref');
}
{
 const f=fixture();let release;f.gate(new Promise(r=>release=r));const first=f.send();
 f.state.repo='other/project';f.state.branch='other';release();f.gate(null);await first;
 assert(f.calls.every(c=>c.path.startsWith('/repos/owner/project/')),'Async work must use captured repo/base');
 assert.equal(f.state.pr,0,'Do not attach old-repo PR to a newly selected repo');
}
{
 const resultSource=source.slice(source.indexOf('function githubResult('),source.indexOf('function nativeResult('));
 let error;
 const c=vm.createContext({pending:{'1':{reject:e=>error=e}},parse:JSON.parse});
 vm.runInContext(resultSource,c);
 c.githubResult('1',422,JSON.stringify({message:'Validation Failed',errors:[{message:'No commits between main and head'}]}));
 assert.equal(error.status,422);assert(error.message.includes('No commits between main and head'));
}
console.log('PASS: task commit before PR, UTF-8, safe file writes, restart/retry after lost responses at every step, double tap, permissions, repo switching, detailed API errors');
