import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../app/src/main/assets/editor/editor.js',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('../app/src/main/assets/editor/renderer.html',import.meta.url),'utf8');
class Node {
 constructor(tag,text){this.tagName=tag;this.nodeType=tag?1:3;this.nodeValue=text||'';this.childNodes=[];this.attrs={};this.dataset={};this.parentElement=null;this.namespaceURI='html';const values={};this.style={setProperty:(k,v)=>values[k]=String(v),getPropertyValue:k=>values[k]||'',getPropertyPriority:()=>'',removeProperty:k=>delete values[k]};}
 get children(){return this.childNodes.filter(n=>n.nodeType===1)}
 set textContent(s){this.childNodes=[];if(s!=='')this.appendChild(new Node(null,String(s)))}
 get textContent(){return this.nodeType===3?this.nodeValue:this.childNodes.map(n=>n.textContent).join('')}
 appendChild(n){n.parentElement=this;this.childNodes.push(n);return n}
 insertBefore(n,other){n.parentElement=this;const i=this.childNodes.indexOf(other);this.childNodes.splice(i<0?this.childNodes.length:i,0,n)}
 replaceWith(n){const p=this.parentElement,i=p.childNodes.indexOf(this);p.childNodes[i]=n;n.parentElement=p;this.parentElement=null}
 setAttribute(k,v){this.attrs[k]=String(v)}
 hasAttribute(k){return k in this.attrs}
 normalize(){}
 getBoundingClientRect(){const p=this.parentElement?.getBoundingClientRect()||{left:10,top:20};return{left:p.left+(parseFloat(this.style.getPropertyValue('left'))||0),top:p.top+(parseFloat(this.style.getPropertyValue('top'))||0),width:40,height:16}}
}
let element=new Node('button');element.textContent='14:20';
const dom={createElement:t=>new Node(t),createElementNS:(ns,t)=>{const n=new Node(t);n.namespaceURI=ns;return n},createTextNode:t=>new Node(null,t),querySelector:()=>element,
 createRange(){return{setStart(n,a){this.n=n;this.a=a},setEnd(n,b){this.b=b},getClientRects(){const r=this.n.parentElement.getBoundingClientRect();return[{left:r.left+this.a*8,right:r.left+this.b*8,top:r.top,bottom:r.top+16,width:(this.b-this.a)*8,height:16}]}}}};
const c=vm.createContext({doc:()=>dom,document:dom,win:()=>({CStripPreview:{}}),project:{global:{'#value':{textDy:-4}},scenes:{}},currentScene:'home',baselines:new Map(),STYLE_PROPS:['transform','color'],loading:false,syncRuntimeScene(){},invalidateRenderer(){}});
vm.runInContext(source.slice(source.indexOf('function editorTextWrapper('),source.indexOf('function keyFor(')),c);
vm.runInContext(source.slice(source.indexOf('function ensureBase('),source.indexOf('function invalidateRenderer(')),c);
const directText=renderer.slice(renderer.lastIndexOf(' directText:function(')+1,renderer.indexOf('\n input:function(',renderer.lastIndexOf(' directText:function('))).replace(/,\s*$/,'');
const draw=vm.runInContext('({'+directText+'})',c).directText;
function frame(){c.beforeRendererBuild();const commands=[],r={color:()=>1,textCache:new WeakMap(),rootRect:{left:0,top:0},sx:1,sy:1,add:(type,args)=>commands.push(args)};draw.call(r,c.editorTextWrapper(element),{color:'white',fontSize:'16px',fontWeight:'400'},{});return commands}
for(let i=0;i<60;i++){
 // Same operations as live clock updates and full dialog/card innerHTML reconstruction.
 if(i%4===0){element=new Node('button');element.textContent='14:'+String(i).padStart(2,'0')}
 else if(i%2===0)element.textContent='15:'+String(i).padStart(2,'0');
 const live=element.textContent,commands=frame();
 assert.equal(element.textContent,live,'Live values must not freeze');
 assert.equal(commands[0][1],30,'Every rendered text baseline retains -4px offset');
 const wrapper=c.editorTextWrapper(element);frame();assert.equal(c.editorTextWrapper(element),wrapper,'No wrapper churn or accumulated offset');
}
c.project.global['#value'].textDy=-3;assert.equal(frame()[0][1],31);
c.loading=true;assert.equal(frame()[0][1],31,'Export and comparison builds retain override');c.loading=false;
c.restoreEditorChanges();delete c.project.global['#value'];c.beforeRendererBuild();assert.equal(c.editorTextWrapper(element),null,'Reset removes wrapper');
element.textContent='16:59';c.project.global['#value']={text:'CUSTOM',textDy:-4};frame();assert.equal(element.textContent,'CUSTOM');element.textContent='17:00';frame();assert.equal(element.textContent,'CUSTOM');c.restoreEditorChanges();assert.equal(element.textContent,'17:00','Reset restores latest runtime text');
assert(renderer.includes('build:function(){if(this.beforeBuild)this.beforeBuild();'));
assert(source.includes('win().CStripPreview.beforeBuild=beforeRendererBuild'));
console.log('PASS: 60 live frames, runtime text and element replacement, stable text command Y, no drift, export, latest-text reset');
