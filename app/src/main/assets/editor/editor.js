(function(){
'use strict';
var SCENES=[
['dialog-axis','Диалог · оси'],['dialog-confirm','Диалог · подтверждение'],['dialog-filter','Диалог · фильтр'],['dialog-keypad','Диалог · цифровая клавиатура'],['dialog-panel-control','Диалог · управление'],['dialog-panel-motor','Диалог · двигатель'],['dialog-panel-output','Диалог · выход'],['dialog-rom','Диалог · ROM'],['dialog-sensor-display','Диалог · показания'],['dialog-sensor-schemes','Диалог · датчики'],['dialog-time','Диалог · время'],
['graphs-dqD','Графики · ток d'],['graphs-dqQ','Графики · ток q'],['graphs-limit','Графики · ограничение'],['graphs-power','Графики · сила'],['graphs-speed-sf','Графики · скорость SF'],['graphs-speed-vf','Графики · скорость VF'],['graphs-speed','Графики · скорость'],
['help-graphs','Справка · графики'],['help-home','Справка · главный'],['help-journal','Справка · журнал'],['help-params','Справка · параметры'],
['home-charge','Главный · предзаряд'],['home-default','Главный · исходный'],['home-fault','Главный · авария'],['home-off','Главный · выключен'],['home-ready','Главный · готов'],['home-regulating','Главный · регулирование'],['home-run','Главный · работа'],['home-select-freq','Главный · выбрана частота'],['home-select-limit','Главный · выбран ток'],['home-select-mod','Главный · выбрана модуляция'],['home-sf','Главный · SF'],['home-target-equal','Главный · уставка достигнута'],['home-uf','Главный · U/F'],['home-vf','Главный · VF'],
['journal-page1','Журнал · страница 1'],['journal-page2','Журнал · страница 2'],['params-auto-done','Параметры · авто готово'],['params-auto-running','Параметры · авто выполняется'],['params-auto','Параметры · авто'],['params-calibration','Параметры · калибровка'],['params-communication','Параметры · связь'],['params-inverter','Параметры · инвертор'],['params-motor','Параметры · двигатель'],['params-protections','Параметры · защиты'],['params-system','Параметры · система']
];
var $=function(s){return document.querySelector(s)},$$=function(s){return Array.from(document.querySelectorAll(s))};
var frame=$('#renderer'),phone=$('#phone'),stage=$('#stage'),interaction=$('#interaction'),selection=$('#selection');
var sceneSelect=$('#scene'),scopeSelect=$('#scope');
var project={format:'pch1000-hmi-editor',version:1,name:'ПЧ-1000 HMI',created:new Date().toISOString(),global:{},scenes:{}};
var currentScene='home-ready',selectedKey='',selectedEl=null,baselines=new Map(),undo=[],redo=[],gesture=null,loading=false,mode='view',lastRuntimeScene='';
var view={zoom:1,x:0,y:0},layout={scale:1,pixelScale:1,left:0,top:0},touches=new Map(),touchGesture=null,TAP_SLOP=8;
var exportBuilding=false,exportPending=false,rendererReloading=false;
var comparison={before:null,after:null,diff:null,candidate:null,changed:0};
var STYLE_PROPS=['transform','transform-origin','color','background-color','border-color','stroke','fill','font-size','font-weight'];

SCENES.forEach(function(s){var o=document.createElement('option');o.value=s[0];o.textContent=s[1];if(s[0]===currentScene)o.selected=true;sceneSelect.appendChild(o)});
function win(){return frame.contentWindow}function doc(){return frame.contentDocument}
function editorTextWrapper(el){for(var i=0;i<el.children.length;i++)if(el.children[i].hasAttribute('data-editor-text-wrapper'))return el.children[i];return null}
function directTextNode(el){for(var i=0;i<el.childNodes.length;i++)if(el.childNodes[i].nodeType===3&&/\S/.test(el.childNodes[i].nodeValue))return el.childNodes[i];return null}
function ownText(el){var wrapper=editorTextWrapper(el);if(wrapper)return wrapper.dataset.editorText||wrapper.textContent;var node=directTextNode(el);return node?node.nodeValue.trim():''}
function restoreOwnText(el,text){var wrapper=editorTextWrapper(el);if(wrapper){wrapper.replaceWith(doc().createTextNode(text));el.normalize();return}var node=directTextNode(el);if(node){node.nodeValue=text;return}if(text)el.insertBefore(doc().createTextNode(text),el.firstChild)}
function setEditorText(el,text,gapAfter,gapPx,textDx,textDy){
  text=String(text==null?'':text);gapPx=Math.max(0,Math.round(Number(gapPx)||0));textDx=Number(textDx)||0;textDy=Number(textDy)||0;
  var svg=el.namespaceURI==='http://www.w3.org/2000/svg';
  var at=gapAfter&&gapPx?text.indexOf(String(gapAfter)):-1;
  var wrapper=editorTextWrapper(el),node=directTextNode(el),signature=JSON.stringify([text,gapAfter||'',gapPx,textDx,textDy]);
  if(wrapper&&wrapper.dataset.editorSignature===signature)return;
  if(!wrapper){wrapper=svg?doc().createElementNS('http://www.w3.org/2000/svg','tspan'):doc().createElement('hmi-editor-text');wrapper.setAttribute('data-editor-text-wrapper','');if(node)node.replaceWith(wrapper);else el.insertBefore(wrapper,el.firstChild)}
  wrapper.dataset.editorSignature=signature;wrapper.dataset.editorText=text;wrapper.textContent='';if(svg){wrapper.setAttribute('dx',textDx);wrapper.setAttribute('dy',textDy)}else{wrapper.style.setProperty('position','relative','important');wrapper.style.setProperty('left',textDx+'px','important');wrapper.style.setProperty('top',textDy+'px','important')}
  if(at<0){wrapper.appendChild(doc().createTextNode(text));return}
  wrapper.appendChild(doc().createTextNode(text.slice(0,at+1)));
  if(svg){var tail=doc().createElementNS('http://www.w3.org/2000/svg','tspan');tail.setAttribute('dx',gapPx);tail.textContent=text.slice(at+1);wrapper.appendChild(tail);return}
  var gap=doc().createElement('span');gap.setAttribute('data-editor-gap','');gap.style.display='inline-block';gap.style.width=gapPx+'px';gap.style.height='1px';wrapper.appendChild(gap);wrapper.appendChild(doc().createTextNode(text.slice(at+1)));
}
function keyFor(el){return win().qaElementKey?win().qaElementKey(el):(el.id?'#'+el.id:el.tagName.toLowerCase())}
function niceName(el,key){var t=ownText(el);if(t)return t.slice(0,42);if(el.id)return '#'+el.id;return key.split('>').pop().slice(0,42)}
function ensureBase(el,key){if(!baselines.has(key)||baselines.get(key).el!==el){var style={};STYLE_PROPS.forEach(function(p){style[p]=[el.style.getPropertyValue(p),el.style.getPropertyPriority(p)]});baselines.set(key,{el:el,key:key,style:style,text:ownText(el)})}return baselines.get(key)}
function allKeys(){var keys=new Set(Object.keys(project.global));Object.keys(project.scenes).forEach(function(s){Object.keys(project.scenes[s]||{}).forEach(function(k){keys.add(k)})});return Array.from(keys)}
function findEl(key){try{return doc().querySelector(key)}catch(e){return null}}
function restoreEditorChanges(){
  baselines.forEach(function(base){STYLE_PROPS.forEach(function(p){var v=base.style[p];if(v[0])base.el.style.setProperty(p,v[0],v[1]);else base.el.style.removeProperty(p)});if(editorTextWrapper(base.el))restoreOwnText(base.el,base.text)});
}
function mergedOverride(key,scene){return Object.assign({},project.global[key]||{},(project.scenes[scene]||{})[key]||{})}
function applyOne(el,key,o){
  var base=ensureBase(el,key),baseTransform=base.style.transform[0]||'';
  // Runtime textContent/innerHTML writes remove our wrapper. Keep the fresh value.
  if(!editorTextWrapper(el))base.text=ownText(el);
  var dx=Number(o.dx)||0,dy=Number(o.dy)||0,sx=o.sx==null?1:Number(o.sx),sy=o.sy==null?1:Number(o.sy);
  if(dx||dy||sx!==1||sy!==1){el.style.setProperty('transform-origin','0 0','important');el.style.setProperty('transform',(baseTransform?baseTransform+' ':'')+'translate('+dx+'px,'+dy+'px) scale('+sx+','+sy+')','important')}
  if(o.text!=null||o.gapAfter||o.gapPx||o.textDx!=null||o.textDy!=null){base.textTouched=true;setEditorText(el,o.text!=null?String(o.text):ownText(el),o.gapAfter,o.gapPx,o.textDx,o.textDy)}
  if(o.fontSize!=null)el.style.setProperty('font-size',Number(o.fontSize)+'px','important');
  if(o.bold!=null)el.style.setProperty('font-weight',o.bold?'800':'400','important');
  [['color','color'],['background','background-color'],['border','border-color'],['stroke','stroke'],['fill','fill']].forEach(function(pair){if(o[pair[0]])el.style.setProperty(pair[1],o[pair[0]],'important')});
}
function applyOverrides(invalidate){allKeys().forEach(function(key){var el=findEl(key);if(el)applyOne(el,key,mergedOverride(key,currentScene))});if(invalidate!==false)invalidateRenderer()}
function beforeRendererBuild(){
  // Apply AFTER live UI updates, synchronously BEFORE DOM is converted to C commands.
  // This also covers direct build() calls during export and comparison.
  if(!loading)syncRuntimeScene(false);
  applyOverrides(false);
}
function invalidateRenderer(){var w=win();if(w.CStripPreview){w.CStripPreview.commandCache=new WeakMap();w.CStripPreview.lastHashes=[]}}
function nextFrame(){return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve)})})}
async function applyScene(name){
  if(!win().CStripPreview||!win().qaApplyScenario)return;
  restoreEditorChanges();win().qaApplyScenario(name);currentScene=name;sceneSelect.value=name;
  await nextFrame();applyOverrides();await nextFrame();updateSelection();updateStateSummary();
}
function currentBucket(create){
  if(scopeSelect.value==='global')return project.global;
  if(!project.scenes[currentScene]&&create)project.scenes[currentScene]={};
  return project.scenes[currentScene]||{};
}
function currentOverride(create){var b=currentBucket(create);if(create&&!b[selectedKey])b[selectedKey]={};return b[selectedKey]||null}
function save(){try{localStorage.setItem('pch1000-hmi-editor-project-v1',JSON.stringify(project))}catch(e){}updateButtons();if(window.AppShell&&window.AppShell.projectChanged)window.AppShell.projectChanged(JSON.stringify(project))}
function snapshot(){undo.push(JSON.stringify(project));if(undo.length>50)undo.shift();redo=[];updateButtons()}
function restoreSnapshot(text){project=JSON.parse(text);save();restoreEditorChanges();applyOverrides();updateSelection()}
function updateButtons(){$('#undo').disabled=!undo.length;$('#redo').disabled=!redo.length}
function toast(text){var t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(t.tm);t.tm=setTimeout(function(){t.classList.remove('show')},1700)}
function round(v){return Math.round(v*10)/10}
function internalRect(el){var a=el.getBoundingClientRect(),root=doc().getElementById('hmi').getBoundingClientRect();return{x:(a.left-root.left)*320/root.width,y:(a.top-root.top)*480/root.height,w:a.width*320/root.width,h:a.height*480/root.height}}
function updateSelection(){
  if(!selectedKey){selection.classList.add('hidden');return}
  selectedEl=findEl(selectedKey);if(!selectedEl){selection.classList.add('hidden');return}
  var r=internalRect(selectedEl);selection.classList.remove('hidden');selection.style.left=r.x+'px';selection.style.top=r.y+'px';selection.style.width=Math.max(1,r.w)+'px';selection.style.height=Math.max(1,r.h)+'px';
  $('#selection-name').textContent=niceName(selectedEl,selectedKey);$('#element-name').textContent=niceName(selectedEl,selectedKey);
  $('#x').value=round(r.x);$('#y').value=round(r.y);$('#width').value=round(r.w);$('#height').value=round(r.h);fillPropertyInputs();
}
function selectElement(el){if(el&&el.closest&&el.closest('[data-editor-text-wrapper]'))el=el.closest('[data-editor-text-wrapper]').parentElement;if(!el||el===doc().getElementById('hmi')){selectedKey='';selectedEl=null;updateSelection();return}selectedKey=keyFor(el);selectedEl=el;ensureBase(el,selectedKey);updateSelection()}
function targetAt(x,y){
  var root=doc().getElementById('hmi'),rr=root.getBoundingClientRect(),px=rr.left+x*rr.width/320,py=rr.top+y*rr.height/480,candidates=[];
  Array.from(root.querySelectorAll('*')).forEach(function(el){if(el.hasAttribute('data-editor-text-wrapper')||el.hasAttribute('data-editor-gap'))return;var cs=win().getComputedStyle(el),r=el.getBoundingClientRect();if(cs.display==='none'||cs.visibility==='hidden'||r.width<1||r.height<1)return;if(px>=r.left&&px<=r.right&&py>=r.top&&py<=r.bottom)candidates.push(el)});
  candidates.sort(function(a,b){var ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),aa=ar.width*ar.height,ba=br.width*br.height;return aa-ba||(a.id?0:1)-(b.id?0:1)});
  return candidates[0]||root;
}
function point(e){var r=interaction.getBoundingClientRect();return{x:(e.clientX-r.left)*320/r.width,y:(e.clientY-r.top)*480/r.height}}
function snap(v){if(!$('#grid').classList.contains('active'))return v;var n=Number($('#snap').value)||1;return Math.round(v/n)*n}
function mutateGeometry(next){var o=currentOverride(true);Object.assign(o,next);applyOverrides();save();updateSelection()}

function distance(a,b){var x=a.x-b.x,y=a.y-b.y;return Math.sqrt(x*x+y*y)}
function propertiesCoverStage(){
  if(mode!=='edit'||document.body.classList.contains('properties-closed'))return false;
  var pr=$('#properties').getBoundingClientRect(),sr=stage.getBoundingClientRect();
  return pr.top>sr.top&&pr.top<sr.bottom;
}
function clampView(){
  var scale=layout.scale*view.zoom,w=320*scale,h=480*scale,sw=stage.clientWidth,sh=stage.clientHeight,left=layout.left+view.x,top=layout.top+view.y,visible=48;
  if(w<=sw)view.x=0;else view.x=Math.min(sw-visible,Math.max(visible-w,left))-layout.left;
  // An open properties sheet overlays the stage. Even when the whole phone would
  // otherwise fit, it must remain vertically movable so the selection can be revealed.
  if(h<=sh&&!propertiesCoverStage())view.y=0;else view.y=Math.min(sh-visible,Math.max(visible-h,top))-layout.top;
}
function applyView(){
  clampView();phone.style.left=(layout.left+view.x)+'px';phone.style.top=(layout.top+view.y)+'px';phone.style.transform='scale('+(layout.scale*view.zoom)+')';
  var shown=Math.round(layout.pixelScale*view.zoom*100)/100;$('#scale-badge').textContent='×'+shown;
}
function ensureSelectionVisible(){
  if(!selectedEl||mode!=='edit'||document.body.classList.contains('properties-closed'))return;
  requestAnimationFrame(function(){
    var pr=$('#properties').getBoundingClientRect(),sr=stage.getBoundingClientRect(),r=selection.getBoundingClientRect(),margin=14;
    if(pr.top<=sr.top||pr.top>=sr.bottom)return;
    var limit=pr.top-margin;
    if(r.bottom>limit){view.y-=r.bottom-limit;applyView()}
  });
}
function openPropertiesForSelection(){
  if(!selectedEl)return;
  document.body.classList.remove('properties-closed');
  ensureSelectionVisible();
  // Run once more after the sheet transition reaches its final position.
  setTimeout(ensureSelectionVisible,210);
}
function beginPinch(){
  var pair=Array.from(touches.values()).slice(0,2),a=pair[0],b=pair[1],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},sr=stage.getBoundingClientRect(),scale=layout.scale*view.zoom;
  touchGesture={type:'pinch',distance:Math.max(1,distance(a,b)),zoom:view.zoom,focusX:(mid.x-sr.left-layout.left-view.x)/scale,focusY:(mid.y-sr.top-layout.top-view.y)/scale};gesture=null;
}
function continueWithRemainingTouch(){
  if(touches.size!==1){touchGesture=null;return}var entry=touches.entries().next().value,id=entry[0],p=entry[1];touchGesture={type:'pan',id:id,startX:p.x,startY:p.y,viewX:view.x,viewY:view.y};
}

interaction.addEventListener('pointerdown',function(e){
  if(e.pointerType==='touch'){
    if(loading)return;var tp=point(e),th=e.target.dataset.handle||'';touches.set(e.pointerId,{x:e.clientX,y:e.clientY});interaction.setPointerCapture(e.pointerId);
    if(touches.size>=2)beginPinch();
    else if(th&&selectedEl){snapshot();var to=Object.assign({dx:0,dy:0,sx:1,sy:1},currentOverride(true)||{});gesture={id:e.pointerId,start:tp,base:to,rect:internalRect(selectedEl),handle:th,touch:true};touchGesture=null}
    else touchGesture={type:'pending',id:e.pointerId,startX:e.clientX,startY:e.clientY,viewX:view.x,viewY:view.y};
    e.preventDefault();return;
  }
  if(loading)return;var p=point(e),handle=e.target.dataset.handle||'';
  if(!handle){var hit=targetAt(p.x,p.y);selectElement(hit);openPropertiesForSelection()}if(!selectedEl)return;
  snapshot();var o=Object.assign({dx:0,dy:0,sx:1,sy:1},currentOverride(true)||{}),r=internalRect(selectedEl);
  gesture={id:e.pointerId,start:p,base:o,rect:r,handle:handle};interaction.setPointerCapture(e.pointerId);e.preventDefault();
});
interaction.addEventListener('pointermove',function(e){
  if(e.pointerType==='touch'){
    if(!touches.has(e.pointerId))return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touchGesture&&touchGesture.type==='pinch'&&touches.size>=2){
      var pair=Array.from(touches.values()).slice(0,2),a=pair[0],b=pair[1],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},sr=stage.getBoundingClientRect();view.zoom=Math.max(1,Math.min(4,touchGesture.zoom*distance(a,b)/touchGesture.distance));var scale=layout.scale*view.zoom;view.x=mid.x-sr.left-layout.left-touchGesture.focusX*scale;view.y=mid.y-sr.top-layout.top-touchGesture.focusY*scale;applyView();e.preventDefault();return;
    }
    if(gesture&&gesture.touch&&gesture.id===e.pointerId){var rp=point(e),rdx=rp.x-gesture.start.x,rdy=rp.y-gesture.start.y,rb=gesture.base,rsx=Number(rb.sx)||1,rsy=Number(rb.sy)||1,rnw=Math.max(2,gesture.rect.w+(gesture.handle.indexOf('e')>=0?rdx:-rdx)),rnh=Math.max(2,gesture.rect.h+(gesture.handle.indexOf('s')>=0?rdy:-rdy)),rc={sx:snap(rnw)/Math.max(1,gesture.rect.w)*rsx,sy:snap(rnh)/Math.max(1,gesture.rect.h)*rsy};if(gesture.handle.indexOf('w')>=0)rc.dx=snap((Number(rb.dx)||0)+rdx);if(gesture.handle.indexOf('n')>=0)rc.dy=snap((Number(rb.dy)||0)+rdy);mutateGeometry(rc);e.preventDefault();return}
    var tg=touchGesture;if(!tg||tg.id!==e.pointerId)return;var mx=e.clientX-tg.startX,my=e.clientY-tg.startY;if(tg.type==='pending'&&Math.sqrt(mx*mx+my*my)>TAP_SLOP)tg.type='pan';if(tg.type==='pan'){view.x=tg.viewX+mx;view.y=tg.viewY+my;applyView()}e.preventDefault();return;
  }
  if(!gesture||gesture.id!==e.pointerId)return;var p=point(e),dx=p.x-gesture.start.x,dy=p.y-gesture.start.y,b=gesture.base;
  if(!gesture.handle){mutateGeometry({dx:snap((Number(b.dx)||0)+dx),dy:snap((Number(b.dy)||0)+dy)});return}
  var sx=Number(b.sx)||1,sy=Number(b.sy)||1,nw=Math.max(2,gesture.rect.w+(gesture.handle.indexOf('e')>=0?dx:-dx)),nh=Math.max(2,gesture.rect.h+(gesture.handle.indexOf('s')>=0?dy:-dy));
  var change={sx:snap(nw)/Math.max(1,gesture.rect.w)*sx,sy:snap(nh)/Math.max(1,gesture.rect.h)*sy};
  if(gesture.handle.indexOf('w')>=0)change.dx=snap((Number(b.dx)||0)+dx);if(gesture.handle.indexOf('n')>=0)change.dy=snap((Number(b.dy)||0)+dy);mutateGeometry(change);
});
interaction.addEventListener('pointerup',function(e){
  if(e.pointerType==='touch'){
    var tg=touchGesture,wasTap=tg&&tg.type==='pending'&&tg.id===e.pointerId;touches.delete(e.pointerId);
    if(gesture&&gesture.touch&&gesture.id===e.pointerId){gesture=null;save()}
    if(wasTap){var p=point(e);selectElement(targetAt(p.x,p.y));openPropertiesForSelection()}
    if(tg&&tg.type==='pinch')continueWithRemainingTouch();else if(!touches.size)touchGesture=null;e.preventDefault();return;
  }
  if(gesture&&gesture.id===e.pointerId){gesture=null;save()}
});
interaction.addEventListener('pointercancel',function(e){if(e.pointerType==='touch'){touches.delete(e.pointerId);if(touchGesture&&touchGesture.type==='pinch')continueWithRemainingTouch();else if(!touches.size)touchGesture=null;if(gesture&&gesture.touch&&gesture.id===e.pointerId)gesture=null;return}gesture=null});

function cssHex(value){var m=String(value||'').match(/\d+/g);if(!m||m.length<3)return'#000000';return'#'+m.slice(0,3).map(function(n){return Number(n).toString(16).padStart(2,'0')}).join('')}
function fillPropertyInputs(){
  if(!selectedEl)return;var cs=win().getComputedStyle(selectedEl),o=mergedOverride(selectedKey,currentScene);
  $('#text').value=o.text!=null?o.text:ownText(selectedEl);$('#font-size').value=Math.round(parseFloat(cs.fontSize)||10);$('#bold').checked=parseInt(cs.fontWeight,10)>=700;
  $('#gap-after').value=o.gapAfter||'';$('#gap-px').value=Math.max(0,Math.round(Number(o.gapPx)||0));
  $('#text-x').value=round(Number(o.textDx)||0);$('#text-y').value=round(Number(o.textDy)||0);
  $('#color').value=cssHex(cs.color);$('#background').value=cssHex(cs.backgroundColor);$('#border').value=cssHex(cs.borderTopColor);$('#stroke').value=cssHex(cs.stroke);$('#fill').value=cssHex(cs.fill);
}
function changeProperty(prop,value){if(!selectedEl)return;snapshot();var o=currentOverride(true);o[prop]=value;save();applyOverrides();updateSelection()}
['text','font-size','bold','color','background','border','stroke','fill','gap-after','gap-px','text-x','text-y'].forEach(function(id){
  var el=$('#'+id),prop=id==='font-size'?'fontSize':id;
  if(id==='gap-after')prop='gapAfter';if(id==='gap-px')prop='gapPx';if(id==='text-x')prop='textDx';if(id==='text-y')prop='textDy';
  var numeric=id==='font-size'||id==='gap-px'||id==='text-x'||id==='text-y';
  el.addEventListener(id==='bold'||id==='color'||id==='background'||id==='border'||id==='stroke'||id==='fill'?'input':'change',function(){var value=id==='bold'?el.checked:numeric?Number(el.value):el.value;if(numeric&&!isFinite(value))return;changeProperty(prop,value)})
});
['x','y','width','height'].forEach(function(id){$('#'+id).addEventListener('change',function(){if(!selectedEl)return;var r=internalRect(selectedEl),v=Number(this.value);if(!isFinite(v))return;snapshot();var o=currentOverride(true);if(id==='x')o.dx=(Number(o.dx)||0)+(v-r.x);if(id==='y')o.dy=(Number(o.dy)||0)+(v-r.y);if(id==='width')o.sx=(Number(o.sx)||1)*v/Math.max(1,r.w);if(id==='height')o.sy=(Number(o.sy)||1)*v/Math.max(1,r.h);save();applyOverrides();updateSelection()})});
function clearProps(props){if(!selectedKey)return;snapshot();var o=currentOverride(false);if(o){props.forEach(function(p){delete o[p]});if(!Object.keys(o).length)delete currentBucket(false)[selectedKey]}save();restoreEditorChanges();applyOverrides();updateSelection()}
$('#reset-geometry').onclick=function(){clearProps(['dx','dy','sx','sy'])};$('#reset-text').onclick=function(){clearProps(['text','fontSize','bold'])};$('#reset-text-position').onclick=function(){clearProps(['textDx','textDy'])};$('#reset-gap').onclick=function(){clearProps(['gapAfter','gapPx'])};$('#reset-colors').onclick=function(){clearProps(['color','background','border','stroke','fill'])};$('#delete-override').onclick=function(){if(!selectedKey)return;snapshot();delete currentBucket(false)[selectedKey];save();restoreEditorChanges();applyOverrides();updateSelection()};
scopeSelect.onchange=fillPropertyInputs;sceneSelect.onchange=function(){applyScene(this.value)};$('#grid').onclick=function(){this.classList.toggle('active')};
$('#undo').onclick=function(){if(!undo.length)return;redo.push(JSON.stringify(project));restoreSnapshot(undo.pop())};$('#redo').onclick=function(){if(!redo.length)return;undo.push(JSON.stringify(project));restoreSnapshot(redo.pop())};
$$('[data-tab]').forEach(function(b){b.onclick=function(){$$('[data-tab]').forEach(function(x){x.classList.toggle('active',x===b)});$$('[data-pane]').forEach(function(x){x.classList.toggle('active',x.dataset.pane===b.dataset.tab)})}});
function sceneLabel(name){var found=SCENES.find(function(s){return s[0]===name});return found?found[1]:name}
function runtimeScene(){try{return win().qaCurrentScenario?win().qaCurrentScenario():currentScene}catch(e){return currentScene}}
function updateStateSummary(){var count=Object.keys(project.scenes[currentScene]||{}).length,total=Object.keys(project.scenes).reduce(function(n,s){return n+Object.keys(project.scenes[s]||{}).length},0);$('#state-summary').textContent='Текущее состояние: '+sceneLabel(currentScene)+'. Здесь: '+count+' переопределений. Всего сценарных: '+total+'. Глобальных: '+Object.keys(project.global).length+'.'}
function fit(){
  var dpr=Math.max(1,window.devicePixelRatio||1),availableW=Math.max(1,Math.floor(stage.clientWidth*dpr)),availableH=Math.max(1,Math.floor(stage.clientHeight*dpr));
  var integerScale=Math.max(1,Math.floor(Math.min(availableW/320,availableH/480))),cssScale=integerScale/dpr;
  var leftPx=Math.floor((availableW-320*integerScale)/2),topPx=Math.floor((availableH-480*integerScale)/2);
  layout.scale=cssScale;layout.pixelScale=integerScale;layout.left=leftPx/dpr;layout.top=topPx/dpr;applyView();
}
function syncRuntimeScene(force){
  if(loading)return;var next=runtimeScene()||'home-ready';$('#runtime-state').textContent=sceneLabel(next).toUpperCase();
  if(!force&&next===lastRuntimeScene)return;lastRuntimeScene=next;currentScene=next;sceneSelect.value=next;restoreEditorChanges();applyOverrides();updateStateSummary();
}
function setMode(next){
  mode=next;document.body.classList.toggle('editing',mode==='edit');$('#mode-toggle').textContent=mode==='edit'?'ГОТОВО':'РЕДАКТОР';$('#mode-toggle').classList.toggle('primary',mode!=='edit');
  if(mode==='edit'){syncRuntimeScene(true);document.body.classList.add('properties-closed');toast('Коснись элемента для редактирования')}
  else{selectedKey='';selectedEl=null;updateSelection();document.body.classList.remove('properties-closed');syncRuntimeScene(true)}
  requestAnimationFrame(fit);
}
$('#mode-toggle').onclick=function(){setMode(mode==='edit'?'view':'edit')};
function toggleProperties(){document.body.classList.toggle('properties-closed');requestAnimationFrame(function(){fit();ensureSelectionVisible()});setTimeout(ensureSelectionVisible,210)}
$('#drawer-toggle').onclick=toggleProperties;
$('#properties-collapse').onclick=toggleProperties;
window.addEventListener('resize',fit);if(window.visualViewport)window.visualViewport.addEventListener('resize',fit);
// Layout must not depend on iframe load timing or renderer readiness.
if(window.ResizeObserver)new ResizeObserver(fit).observe(stage);
requestAnimationFrame(fit);

function frameAction(objectName,method,arg){try{var object=win()[objectName];if(!object||typeof object[method]!=='function')throw new Error('not ready');object[method](arg);setTimeout(function(){syncRuntimeScene(true)},40)}catch(e){toast('Симулятор ещё загружается')}}
$('#charge-control').onclick=function(){frameAction('Sim','toggleCharge')};
$('#run-control').onclick=function(){frameAction('Sim','toggleInverter')};
$('#encoder-minus').onclick=function(){frameAction('Encoder','adjust',-1)};
$('#encoder-plus').onclick=function(){frameAction('Encoder','adjust',1)};
var encoderPush=$('#encoder-push'),encoderGesture=null,encoderTimer=0;
encoderPush.addEventListener('pointerdown',function(e){encoderPush.setPointerCapture(e.pointerId);encoderGesture={id:e.pointerId,startY:e.clientY,lastY:e.clientY,moved:false,long:false};encoderPush.classList.add('pressed');encoderTimer=setTimeout(function(){if(encoderGesture&&!encoderGesture.moved){encoderGesture.long=true;encoderPush.classList.add('long');frameAction('Encoder','next')}},500);e.preventDefault()});
encoderPush.addEventListener('pointermove',function(e){var g=encoderGesture;if(!g||g.id!==e.pointerId)return;var delta=g.lastY-e.clientY;if(Math.abs(e.clientY-g.startY)>5){g.moved=true;clearTimeout(encoderTimer)}if(Math.abs(delta)>=12){var steps=delta>0?Math.floor(delta/12):Math.ceil(delta/12);g.lastY-=steps*12;frameAction('Encoder','adjust',steps)}});
function releaseEncoder(e,cancel){var g=encoderGesture;if(!g||g.id!==e.pointerId)return;clearTimeout(encoderTimer);encoderPush.classList.remove('pressed','long');if(!cancel&&!g.moved&&!g.long)frameAction('Encoder','apply');encoderGesture=null}
encoderPush.addEventListener('pointerup',function(e){releaseEncoder(e,false)});encoderPush.addEventListener('pointercancel',function(e){releaseEncoder(e,true)});

function readAsset(path){try{return window.AndroidEditor?AndroidEditor.readAsset(path):''}catch(e){return''}}
async function collectScenes(){
  var result=[];
  for(var i=0;i<SCENES.length;i++){
    $('#busy-state').textContent=(i+1)+' / '+SCENES.length+' · '+SCENES[i][1];await applyScene(SCENES[i][0]);
    var r=win().CStripPreview;r.commandCache=new WeakMap();r.build();result.push({name:SCENES[i][0],commands:JSON.parse(JSON.stringify(r.commands))});await new Promise(function(resolve){setTimeout(resolve,0)});
  }
  return result;
}
async function buildExportEntries(){
  if(exportBuilding||exportPending||loading||rendererReloading)throw new Error('Дождись завершения текущей операции');
  if(!win().CStripPreview||!win().CStripPreview.ready)throw new Error('Симулятор ещё загружается');
  exportBuilding=true;loading=true;$('#busy').classList.remove('hidden');
  try{
    var scenes=await collectScenes();
    $('#busy-state').textContent='Формирую C-файлы…';await nextFrame();
    var generated=CSceneGenerator.generate(scenes),projectText=JSON.stringify(project,null,2),root='PCH1000_HMI_C_Renderer_edited/',entries=[
      {path:'PCH1000_HMI_editor_project.json',content:projectText},
      {path:root+'src/hmi_scene_generated.c',content:generated.source},
      {path:root+'include/hmi_scene_generated.h',content:generated.header}
    ];
    ['AGENTS.md','Makefile','README.md','TEST_RESULTS.md','examples/host_preview.c','examples/stm32_display_backend_example.c','reference/EXPORT.md','reference/SCENE_FORMAT.md','include/hmi.h','include/hmi_backend.h','include/hmi_gfx.h','include/hmi_state.h','src/hmi_gfx.c','src/hmi_scene.c','src/hmi_dirty.c','src/hmi_dynamic.c','src/font_data.inc'].forEach(function(path){var text=readAsset('template/'+path);if(text)entries.push({path:path==='AGENTS.md'?'AGENTS.md':root+path,content:text})});
    entries.push({path:'README_EDITED.txt',content:'ПЧ-1000 HMI Editor\n\nСгенерировано: '+new Date().toISOString()+'\nСцен: '+generated.stats.scenes+'\nУникальных примитивов: '+generated.stats.primitives+'\nОбщих блоков: '+generated.stats.blocks+'\nДанные сцен: '+generated.stats.bytes+' байт\n\nКаталог PCH1000_HMI_C_Renderer_edited содержит полный отредактированный C99 RGB565-рендерер в структуре исходного архива. Проект повторного редактирования находится в PCH1000_HMI_editor_project.json.\n'});
    return{entries:entries,projectText:projectText};
  }finally{
    // Every caller owns only the generated files, never this progress overlay.
    // qaApplyScenario disables live simulation; recreate the live renderer here.
    try{reloadLiveRenderer()}finally{exportBuilding=false;loading=false;$('#busy').classList.add('hidden')}
  }
}
async function captureProjectFrame(projectVersion){
  var active=project,canvas=win().document.getElementById('pixel-preview');
  restoreEditorChanges();project=projectVersion;applyOverrides();await nextFrame();
  var renderer=win().CStripPreview;renderer.lastHashes=[];renderer.render();await nextFrame();
  var copy=document.createElement('canvas'),copyContext;copy.width=320;copy.height=480;copyContext=copy.getContext('2d',{alpha:false});copyContext.drawImage(canvas,0,0);
  var pixels=copyContext.getImageData(0,0,320,480);
  restoreEditorChanges();project=active;applyOverrides();renderer.lastHashes=[];renderer.render();await nextFrame();
  return pixels;
}
function makePixelDiff(before,after){
  var out=document.createElement('canvas').getContext('2d').createImageData(320,480),changed=0;
  for(var i=0;i<before.data.length;i+=4){
    var different=before.data[i]!==after.data[i]||before.data[i+1]!==after.data[i+1]||before.data[i+2]!==after.data[i+2];
    if(different){out.data[i]=255;out.data[i+1]=45;out.data[i+2]=190;changed++}
    else{var gray=Math.round((before.data[i]+before.data[i+1]+before.data[i+2])/15);out.data[i]=gray;out.data[i+1]=gray;out.data[i+2]=gray}
    out.data[i+3]=255;
  }
  comparison.changed=changed;return out;
}
function showComparison(kind){
  var image=comparison[kind],canvas=$('#comparison-canvas');if(!image)return;
  canvas.getContext('2d',{alpha:false}).putImageData(image,0,0);canvas.classList.remove('hidden');
  $$('[data-compare]').forEach(function(b){b.classList.toggle('active',b.dataset.compare===kind)});
  if(kind==='diff')toast(comparison.changed+' изменённых пикселей');
}
async function startComparison(candidateText){
  try{
    var candidate=typeof candidateText==='string'?JSON.parse(candidateText):candidateText;
    if(!candidate||candidate.format!==project.format)throw new Error('в ветке нет совместимого проекта редактора');
    loading=true;$('#busy').classList.remove('hidden');$('#busy-state').textContent='Готовлю рендеры «было» и «стало»';
    comparison.before=await captureProjectFrame(project);comparison.after=await captureProjectFrame(candidate);comparison.diff=makePixelDiff(comparison.before,comparison.after);comparison.candidate=candidate;
    loading=false;$('#busy').classList.add('hidden');document.body.classList.add('comparing');$('#compare-bar').classList.remove('hidden');showComparison('after');requestAnimationFrame(fit);return comparison.changed;
  }catch(e){loading=false;$('#busy').classList.add('hidden');toast('Сравнение недоступно: '+e.message);throw e}
}
function closeComparison(){document.body.classList.remove('comparing');$('#compare-bar').classList.add('hidden');$('#comparison-canvas').classList.add('hidden');requestAnimationFrame(fit)}
function acceptComparisonCandidate(){if(!comparison.candidate)return false;snapshot();project=comparison.candidate;save();restoreEditorChanges();applyOverrides();closeComparison();return true}
function workingExportFolder(){try{return window.AndroidEditor?JSON.parse(AndroidEditor.workingFolderInfo()):{}}catch(e){return{}}}
function updateExportDestination(){
  var info=workingExportFolder(),working=$('#export-destination').value==='working';
  $('#export-location').textContent=working?(info.uri?'Рабочая папка: '+(info.name||'выбрана'):'Сначала выбери рабочую папку в меню «Проект».'):'Android предложит выбрать, куда сохранить ZIP-файл.';
  $('#export-confirm').disabled=working&&!info.uri;
  $('#export-choose-folder').classList.toggle('hidden',!working||!!info.uri);
}
function openExportDialog(destination){
  if(exportBuilding||exportPending||rendererReloading){toast('Дождись завершения текущей операции');return}
  $('#export-destination').value=destination||'working';updateExportDestination();
  $('#export-dialog').classList.remove('hidden');$('#export-cancel').focus();
}
function closeExportDialog(){$('#export-dialog').classList.add('hidden')}
function openProject(){if(window.AndroidEditor)AndroidEditor.pickProject();else toast('Импорт файла доступен в APK')}
async function confirmExport(){
  var destination=$('#export-destination').value,bridge=window.AndroidEditor;
  if($('#export-dialog').classList.contains('hidden')||exportBuilding||exportPending)return;
  if(!bridge){toast('Экспорт C-проекта доступен в APK');return}
  if(destination==='working'&&!workingExportFolder().uri){updateExportDestination();return}
  closeExportDialog();
  try{
    var payload=await buildExportEntries();
    exportPending=true;
    if(destination==='working'){toast('Сохраняю файлы в рабочую папку…');bridge.saveWorkingProject(JSON.stringify({entries:payload.entries}))}
    else bridge.saveExport(JSON.stringify({entries:payload.entries}));
  }catch(e){exportPending=false;toast('Ошибка экспорта: '+e.message)}
}
$('#export').onclick=function(){openExportDialog()};
$('#export-destination').onchange=updateExportDestination;
$('#export-confirm').onclick=confirmExport;$('#export-cancel').onclick=closeExportDialog;
$('#export-dialog').addEventListener('click',function(e){if(e.target===this)closeExportDialog()});
$('#export-choose-folder').onclick=function(){closeExportDialog();if(window.AppShell)AppShell.open('project')};
$$('[data-compare]').forEach(function(b){b.onclick=function(){showComparison(b.dataset.compare)}});$('#compare-close').onclick=closeComparison;
function importProject(text){try{var p=JSON.parse(text);if(p.format!=='pch1000-hmi-editor')throw new Error('неверный формат');snapshot();project=p;save();restoreEditorChanges();applyOverrides();updateSelection();toast('Проект загружен')}catch(e){toast('Не удалось открыть проект: '+e.message)}}
function reloadLiveRenderer(){rendererReloading=true;selectedKey='';selectedEl=null;baselines=new Map();lastRuntimeScene='';frame.src='renderer.html?embed=1&live=1'}
function exportFinished(ok){exportPending=false;if(ok)toast('C-файлы и проект сохранены');else toast('Экспорт отменён или не удалось сохранить ZIP')}
function exportFolderFinished(ok,message){exportPending=false;toast(message||(ok?'C-файлы и проект сохранены':'Экспорт отменён'))}
function onBack(){if(!$('#export-dialog').classList.contains('hidden')){closeExportDialog();return true}if(!selection.classList.contains('hidden')){selectedKey='';selectedEl=null;updateSelection();return true}if(mode==='edit'){setMode('view');return true}return false}
window.HmiEditor={
  openExportDialog:openExportDialog,openProject:openProject,importProject:importProject,exportFinished:exportFinished,exportFolderFinished:exportFolderFinished,onBack:onBack,
  getProject:function(){return JSON.stringify(project)},buildExportEntries:buildExportEntries,startComparison:startComparison,
  closeComparison:closeComparison,acceptComparisonCandidate:acceptComparisonCandidate,
  selectedContext:function(){return{key:selectedKey,name:selectedEl?niceName(selectedEl,selectedKey):'',scene:currentScene,sceneName:sceneLabel(currentScene)}}
};

var rendererReadyTimer=0;
function initializeRenderer(){
  fit();clearInterval(rendererReadyTimer);baselines=new Map();
  function ready(){
    if(!win().CStripPreview||!win().CStripPreview.ready||!win().qaApplyScenario||!win().qaCurrentScenario)return false;
    try{var stored=JSON.parse(localStorage.getItem('pch1000-hmi-editor-project-v1')||'null');if(stored&&stored.format===project.format)project=stored}catch(e){}
    win().CStripPreview.beforeBuild=beforeRendererBuild;rendererReloading=false;syncRuntimeScene(true);fit();save();return true;
  }
  if(!ready())rendererReadyTimer=setInterval(function(){if(ready())clearInterval(rendererReadyTimer)},80);
}
frame.addEventListener('load',initializeRenderer);
initializeRenderer();
setInterval(function(){if(!loading&&win()&&win().CStripPreview)syncRuntimeScene(false)},300);
})();
