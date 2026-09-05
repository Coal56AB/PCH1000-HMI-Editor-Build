import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../app/src/main/assets/editor/editor.js',import.meta.url),'utf8');
function element(hidden=false){const names=new Set(hidden?['hidden']:[]);return {textContent:'',disabled:false,value:'working',classList:{add:n=>names.add(n),remove:n=>names.delete(n),contains:n=>names.has(n),toggle:(n,on)=>on?names.add(n):names.delete(n)},addEventListener(){},focus(){}}}
function fixture(){
 const nodes=new Map();const $=s=>{if(!nodes.has(s))nodes.set(s,element(s==='#busy'||s==='#export-dialog'));return nodes.get(s)};
 let failScene=false,failGenerator=false,reloads=0,saves=0;const sceneCalls=[];
 const r={commands:[{kind:'text'}],ready:true,build(){}};
 const bridge={readAsset:()=>'',workingFolderInfo:()=>JSON.stringify({uri:'content://folder',name:'Project'}),saveWorkingProject(){saves++},saveExport(){saves++}};
 const c=vm.createContext({$,window:{AndroidEditor:bridge},AndroidEditor:bridge,
   exportBuilding:false,exportPending:false,rendererReloading:false,loading:false,
   SCENES:Array.from({length:47},(_,i)=>['scene'+i,'scene'+i]),project:{format:'test'},win:()=>({CStripPreview:r}),
   applyScene:async name=>{sceneCalls.push(name);if(failScene)throw Error('scene failure')},nextFrame:async()=>{},
   CSceneGenerator:{generate(){if(failGenerator)throw Error('generator failure');return{source:'C',header:'H',stats:{scenes:47}}}},
   reloadLiveRenderer(){reloads++},toast(){},setTimeout:f=>f()
 });
 vm.runInContext(source.slice(source.indexOf('function readAsset('),source.indexOf('async function captureProjectFrame(')),c);
 vm.runInContext(source.slice(source.indexOf('function workingExportFolder('),source.indexOf("$$('[data-compare]')",source.indexOf('function workingExportFolder('))),c);
 return {c,$,sceneCalls,bridge,get reloads(){return reloads},get saves(){return saves},failScene(){failScene=true},failGenerator(){failGenerator=true}};
}
for(const failure of [null,'failScene','failGenerator']){
 const f=fixture();if(failure)f[failure]();
 if(failure)await assert.rejects(f.c.buildExportEntries());else{const payload=await f.c.buildExportEntries();assert(payload.entries.some(e=>e.path.endsWith('hmi_scene_generated.c')));assert.equal(f.sceneCalls.length,47)}
 assert(f.$('#busy').classList.contains('hidden'));assert.equal(f.c.loading,false);assert.equal(f.c.exportBuilding,false);assert.equal(f.reloads,1);
}
{
 const f=fixture();let release;
 f.c.applyScene=()=>new Promise(r=>release=r);
 const first=f.c.buildExportEntries();await assert.rejects(f.c.buildExportEntries(),/текущей операции/);
 f.c.applyScene=async()=>{};release();await first;assert(f.$('#busy').classList.contains('hidden'));
}
{
 const f=fixture();f.c.openExportDialog();assert.equal(f.sceneCalls.length,0);
 f.$('#export-cancel').onclick();assert.equal(f.sceneCalls.length,0);assert.equal(f.saves,0);
 f.c.openExportDialog();await f.$('#export-confirm').onclick();assert.equal(f.saves,1);assert.equal(f.sceneCalls.length,47);assert(f.$('#busy').classList.contains('hidden'));
 await f.$('#export-confirm').onclick();assert.equal(f.saves,1);
}
{
 const f=fixture();f.bridge.workingFolderInfo=()=> '{}';f.c.openExportDialog();
 assert.equal(f.$('#export-confirm').disabled,true);await f.c.confirmExport();assert.equal(f.sceneCalls.length,0);
 f.$('#export-destination').value='zip';f.c.updateExportDestination();assert.equal(f.$('#export-confirm').disabled,false);
 await f.c.confirmExport();assert.equal(f.saves,1);
}
console.log('PASS: 47-scene generation cleanup, scene/generator exceptions, re-entry, confirmation/cancel, missing folder, ZIP export');
const shell=fs.readFileSync(new URL('../app/src/main/assets/editor/app-shell.js',import.meta.url),'utf8');
const pushHandler=shell.slice(shell.indexOf("$('#github-push').onclick="),shell.indexOf("$('#create-branch')"));
for(const fail of [false,true]){
 const f=fixture();const messages=[];
 Object.assign(f.c,{HmiEditor:f.c,state:{repo:'owner/project',branch:'main'},setMessage:m=>messages.push(m),
  pushEntries:async()=>{assert(f.$('#busy').classList.contains('hidden'));if(fail)throw Error('push failure')}});
 f.$('#github-message').value='Design changes';vm.runInContext(pushHandler,f.c);
 await f.$('#github-push').onclick();assert.equal(f.$('#github-push').disabled,false);assert(f.$('#busy').classList.contains('hidden'));
 assert(messages.includes(fail?'push failure':'Commit и push выполнены'));
}
console.log('PASS: GitHub push success/failure leaves no generation overlay and unlocks the button');
