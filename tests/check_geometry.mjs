// Evaluate the actual sizing functions against numeric DOM fixtures.
// This is not a substitute for Chromium/Android layout testing.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const editor=fs.readFileSync(new URL('../app/src/main/assets/editor/editor.js',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../app/src/main/assets/editor/app-shell.js',import.meta.url),'utf8');
const fit=editor.slice(editor.indexOf('function fit(){'),editor.indexOf('function syncRuntimeScene('));
for (const [w,h,dpr] of [[393,627,2.75],[360,572,3],[412,682,2.625],[393,437,2.75]]) {
  const phone={style:{}},badge={};
  vm.runInNewContext(fit+'fit();',{window:{devicePixelRatio:dpr},stage:{clientWidth:w,clientHeight:h},phone,$:()=>badge});
  const n=Number(badge.textContent.slice(1));
  assert.equal(n,Math.max(1,Math.floor(Math.min(Math.floor(w*dpr)/320,Math.floor(h*dpr)/480))));
  assert(Math.abs(parseFloat(phone.style.left)*dpr + 160*n-Math.floor(w*dpr)/2)<=0.5);
  assert(Math.abs(parseFloat(phone.style.top)*dpr + 240*n-Math.floor(h*dpr)/2)<=0.5);
}
const position=shell.slice(shell.indexOf('function positionTour(){'),shell.indexOf('function showTour('));
for (const box of [{left:370,right:446,top:6,bottom:46},{left:-20,right:56,top:6,bottom:46}]) {
  const toolbar={scrollLeft:0,getBoundingClientRect:()=>({left:0,right:393})};
  const el={closest:()=>toolbar,getBoundingClientRect:()=>({left:box.left-toolbar.scrollLeft,right:box.right-toolbar.scrollLeft,top:box.top,bottom:box.bottom})};
  const spot={style:{}},card={getBoundingClientRect:()=>({height:154,top:629})},props={};
  vm.runInNewContext(position+'positionTour();',{
    $:s=>({'#tour':{classList:{contains:()=>false}},'#target':el,'#tour-spot':spot,'.tour-card':card}[s]),
    document:{body:{style:{setProperty:(k,v)=>{props[k]=v}}}},tourSteps:[{target:'#target'}],tourAt:0,tourLayoutFrame:0,
    innerWidth:393,innerHeight:795,cancelAnimationFrame:()=>{},requestAnimationFrame:f=>{f();return 1}
  });
  const x=parseFloat(spot.style.left),y=parseFloat(spot.style.top),w=parseFloat(spot.style.width),h=parseFloat(spot.style.height);
  assert(x>=0&&x+w<=393&&y>=0&&y+h<629);
  const actual=el.getBoundingClientRect();assert(actual.left>=0&&actual.right<=393);
  assert.equal(props['--tour-reserve'],'178px');
}
console.log('integer centering and tutorial clipping/scroll numeric tests: OK');
