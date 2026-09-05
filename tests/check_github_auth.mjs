import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../app/src/main/assets/editor/app-shell.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function githubAuthProgress('),source.indexOf('function option('));
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const nodes=new Map(),calls=[],messages=[];let startResolve,pollResolve;
 const $=s=>{if(!nodes.has(s))nodes.set(s,{textContent:'',disabled:false,classList:{add(){},remove(){}},scrollIntoView(){calls.push('scroll')}});return nodes.get(s)};
 const bridge={cancelGithubDeviceFlow(){calls.push('cancel')},copyGithubDeviceCode(v){calls.push(['copy',v])},openExternal(v){calls.push(['open',v])}};
 const c=vm.createContext({$,authBusy:false,authVersion:0,authPollRequestId:'',authCode:'',pending:{},
 clientId:()=> 'Ov23liZhW4JlhvBxx6zs',validClient:()=>true,bridge:()=>bridge,
 setMessage:(s)=>messages.push(s),refreshAuth:()=>calls.push('refresh'),
 nativeCall:(name,args)=>{calls.push([name,...args]);return new Promise(resolve=>{if(name==='startGithubDeviceFlow')startResolve=resolve;else pollResolve=resolve})}});
 vm.runInContext(code,c);
 return {c,$,calls,messages,start:(v)=>startResolve(v),poll:(v)=>pollResolve(v)};
}
const data={device_code:'private-device-code',user_code:'ABCD-1234',interval:5,expires_in:900};
let f=fixture(),done=f.$('#github-login').onclick();
await f.$('#github-login').onclick();
assert.equal(f.calls.filter(v=>Array.isArray(v)&&v[0]==='startGithubDeviceFlow').length,1);
f.start(data);await flush();
assert.equal(f.$('#github-user-code').textContent,'ABCD-1234');
f.$('#github-code-open').onclick();
assert.deepEqual(f.calls.filter(v=>Array.isArray(v)&&['copy','open'].includes(v[0])),[['copy','ABCD-1234'],['open','https://github.com/login/device']]);
f.poll({authorized:true});await done;
assert(f.calls.includes('refresh'));assert.equal(f.$('#github-login').disabled,false);
f=fixture();done=f.$('#github-login').onclick();f.$('#github-code-cancel').onclick();f.start(data);await done;
assert(!f.calls.some(v=>Array.isArray(v)&&v[0]==='pollGithubDeviceFlow'));
f=fixture();done=f.$('#github-login').onclick();f.start(data);await flush();f.$('#github-code-cancel').onclick();f.poll({authorized:true});await done;
assert(!f.calls.includes('refresh'));assert.equal(f.$('#github-login').disabled,false);
f=fixture();done=f.$('#github-login').onclick();f.start({error_description:'Device Flow disabled'});await done;
assert(f.messages.includes('Device Flow disabled'));assert.equal(f.$('#github-login').disabled,false);
console.log('PASS: login lock, code copy/open, completed login, cancellation before/after code, malformed start response');
