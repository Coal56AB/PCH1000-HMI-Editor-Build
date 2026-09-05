(function(){
'use strict';
var $=function(s){return document.querySelector(s)},$$=function(s){return Array.from(document.querySelectorAll(s))};
var modal=$('#shell-modal'),message=$('#shell-message'),requestId=1,pending={},saveTimer=0;
var authBusy=false,authVersion=0,authPollRequestId='',authCode='';
var state={repo:localStorage.getItem('pch-github-repo')||'',branch:localStorage.getItem('pch-github-branch')||'main',pr:Number(localStorage.getItem('pch-codex-pr')||0),head:''};
function setMessage(text,error){message.textContent=text||'';message.style.color=error?'#ff756e':'var(--yellow)'}
function bridge(){return window.AndroidEditor||null}
function parse(text){try{return JSON.parse(text||'{}')}catch(e){return{text:text||''}}}
function api(method,path,body){return new Promise(function(resolve,reject){var id=String(requestId++);pending[id]={resolve:resolve,reject:reject};var b=bridge();if(!b){delete pending[id];reject(new Error('GitHub доступен только в APK'));return}b.githubRequest(id,method,path,body==null?'':JSON.stringify(body))})}
function githubResult(id,status,text){var p=pending[String(id)];if(!p)return;delete pending[String(id)];var data=parse(text);if(status>=200&&status<300)p.resolve(data);else p.reject(new Error(data.message||data.error_description||('GitHub: HTTP '+status)))}
function nativeResult(id,ok,text){var p=pending[String(id)];if(!p)return;delete pending[String(id)];if(ok)p.resolve(parse(text));else p.reject(new Error(text||'Операция не выполнена'))}
function nativeCall(name,args){return new Promise(function(resolve,reject){var b=bridge(),id=String(requestId++);if(!b||typeof b[name]!=='function'){reject(new Error('Функция доступна только в APK'));return}pending[id]={resolve:resolve,reject:reject};args=args||[];if(name==='startGithubDeviceFlow')b.startGithubDeviceFlow(id,args[0]);else if(name==='pollGithubDeviceFlow'){authPollRequestId=id;b.pollGithubDeviceFlow(id,args[0],args[1],args[2],args[3]);}else{delete pending[id];reject(new Error('Неизвестная системная операция'))}})}
function open(tab){modal.classList.remove('hidden');selectTab(tab||'project');refreshFolder();refreshAuth()}
function close(){modal.classList.add('hidden');setMessage('')}
function selectTab(name){$$('[data-shell-tab]').forEach(function(b){b.classList.toggle('active',b.dataset.shellTab===name)});$$('[data-shell-pane]').forEach(function(p){p.classList.toggle('active',p.dataset.shellPane===name)});$('#shell-title').textContent=name==='github'?'GITHUB':name==='codex'?'CODEX':name==='settings'?'НАСТРОЙКИ':'ПРОЕКТ';if(name==='codex')updateCodexContext()}
$('#app-menu').onclick=function(){open('project')};$('#shell-close').onclick=close;modal.addEventListener('click',function(e){if(e.target===modal)close()});
$$('[data-shell-tab]').forEach(function(b){b.onclick=function(){selectTab(b.dataset.shellTab)}});

function refreshFolder(){var b=bridge(),info={};try{info=b&&b.workingFolderInfo?parse(b.workingFolderInfo()):{}}catch(e){}$('#folder-status').textContent=info.name?'Рабочая папка: '+info.name:'Сейчас используется встроенный шаблон'}
$('#choose-folder').onclick=function(){var b=bridge();if(b&&b.chooseWorkingFolder)b.chooseWorkingFolder();else setMessage('Выбор папки доступен только в APK',true)};
$('#save-folder').onclick=function(){close();HmiEditor.openExportDialog('working')};
$('#open-import').onclick=function(){HmiEditor.openProject();close()};
function workingFolderSelected(hasProject,json,name){refreshFolder();if(hasProject&&json)HmiEditor.importProject(json);else setMessage('Папка выбрана. Нажми «Экспорт», чтобы развернуть в неё шаблон.')}
function workingProjectSaved(ok,text){HmiEditor.exportFolderFinished(ok,text);setMessage(text,!ok)}
function projectChanged(json){clearTimeout(saveTimer);saveTimer=setTimeout(function(){var b=bridge();if(b&&b.autoSaveProject)b.autoSaveProject(json)},800)}

function hasToken(){var b=bridge();try{return !!(b&&b.hasGithubToken&&b.hasGithubToken())}catch(e){return false}}
function validClient(value){return /^(?:Iv1\.[A-Za-z0-9]+|[A-Za-z0-9]{20,})$/.test(value)}
function clientId(){var info={};try{info=parse(bridge()&&bridge().appInfo?bridge().appInfo():'{}')}catch(e){}return info.githubOAuthClientId||$('#github-client-id').value.trim()}
function updateLogin(){var info={};try{info=parse(bridge()&&bridge().appInfo?bridge().appInfo():'{}')}catch(e){}$('#github-oauth-setup').classList.toggle('hidden',validClient(info.githubOAuthClientId||''));var configured=validClient(clientId());$('#github-login').textContent=configured?'ВОЙТИ ЧЕРЕЗ GITHUB':'НАСТРОИТЬ ВХОД ЧЕРЕЗ GITHUB';$('#github-login-status').textContent=configured?'Скопируй код кнопкой ниже, вставь его на сайте GitHub и подтверди доступ. Затем вернись сюда.':'В этой сборке вход через сайт ещё не настроен. Ниже есть разовая настройка и вариант с токеном.'}
$$('[data-external]').forEach(function(b){b.onclick=function(){if(bridge())bridge().openExternal(b.dataset.external);else window.open(b.dataset.external,'_blank','noopener')}});
$('#github-client-save').onclick=function(){var client=$('#github-client-id').value.trim();if(!validClient(client)){setMessage('Нужен Client ID со страницы OAuth-приложения, не имя аккаунта и не пароль.',true);return}localStorage.setItem('pch-github-client-id',client);$('#github-oauth-setup').open=false;updateLogin();setMessage('Сохранено. Теперь нажми «Войти через GitHub».')};
function refreshAuth(){var yes=hasToken();$('#github-auth-off').classList.toggle('hidden',yes);$('#github-auth-on').classList.toggle('hidden',!yes);if(yes)loadGithub()}
$('#github-token-save').onclick=function(){var value=$('#github-token').value.trim(),b=bridge();if(!value){setMessage('Введи токен',true);return}try{cancelGithubLogin(false);b.setGithubToken(value);$('#github-token').value='';refreshAuth()}catch(e){setMessage('Не удалось сохранить токен',true)}};
$('#github-logout').onclick=function(){cancelGithubLogin(false);var b=bridge();if(b)b.clearGithubToken();refreshAuth();setMessage('GitHub отключён')};
function githubAuthProgress(id,text){if(authBusy&&String(id)===authPollRequestId&&pending[String(id)])setMessage(text)}
function cancelGithubLogin(showMessage){
  authVersion++;authBusy=false;authPollRequestId='';authCode='';
  var b=bridge();if(b&&b.cancelGithubDeviceFlow)b.cancelGithubDeviceFlow();
  $('#github-login').disabled=false;$('#device-code').classList.add('hidden');
  if(showMessage)setMessage('Вход отменён');
}
function copyAndOpenGithub(){
  if(!authCode)return;
  var b=bridge();if(b&&b.copyGithubDeviceCode)b.copyGithubDeviceCode(authCode);
  if(b&&b.openExternal)b.openExternal('https://github.com/login/device');
}
$('#github-code-open').onclick=copyAndOpenGithub;
$('#github-code-copy').onclick=function(){var b=bridge();if(authCode&&b&&b.copyGithubDeviceCode){b.copyGithubDeviceCode(authCode);setMessage('Код скопирован. Вставь его на странице GitHub.')}};
$('#github-code-cancel').onclick=function(){cancelGithubLogin(true)};
$('#github-login').onclick=async function(){
  if(authBusy)return;
  var client=clientId();if(!validClient(client)){$('#github-oauth-setup').open=true;$('#github-oauth-setup').scrollIntoView({block:'nearest'});setMessage('Это разовая настройка приложения, не вход по имени аккаунта. Инструкция раскрыта ниже.');return}
  var version=++authVersion;authBusy=true;$('#github-login').disabled=true;
  try{
    setMessage('Запрашиваю код GitHub…');
    var data=await nativeCall('startGithubDeviceFlow',[client]);
    if(version!==authVersion)return;
    if(!data.device_code||!data.user_code)throw new Error(data.error_description||'GitHub не выдал код входа. Попробуй снова.');
    authCode=data.user_code;$('#github-user-code').textContent=authCode;
    $('#device-code').classList.remove('hidden');
    $('#device-code').scrollIntoView({block:'nearest'});
    setMessage('Нажми «Скопировать код и открыть GitHub». Если уже подтвердил вход — просто подожди.');
    await nativeCall('pollGithubDeviceFlow',[client,data.device_code,Number(data.interval||5),Number(data.expires_in||900)]);
    if(version!==authVersion)return;
    $('#device-code').classList.add('hidden');authCode='';refreshAuth();setMessage('GitHub подключён');
  }catch(e){if(version===authVersion){$('#device-code').classList.add('hidden');authCode='';setMessage(e.message,true)}}
  finally{if(version===authVersion){authBusy=false;authPollRequestId='';$('#github-login').disabled=false}}
};

function option(value,label){var o=document.createElement('option');o.value=value;o.textContent=label||value;return o}
async function loadGithub(){
  try{var user=await api('GET','/user');$('#github-user').textContent='@'+user.login;var repos=await api('GET','/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member');fillRepos(repos);setMessage('');maybeAutoCheckUpdate()}catch(e){setMessage(e.message,true)}
}
function fillRepos(repos){var repo=$('#github-repo');repo.textContent='';(repos||[]).forEach(function(r){repo.appendChild(option(r.full_name,r.full_name))});if(state.repo&&Array.from(repo.options).some(function(o){return o.value===state.repo}))repo.value=state.repo;else if(repo.options.length)state.repo=repo.value;saveRepoState();loadBranches()}
function saveRepoState(){localStorage.setItem('pch-github-repo',state.repo);localStorage.setItem('pch-github-branch',state.branch)}
$('#github-repo').onchange=function(){state.repo=this.value;state.branch='main';saveRepoState();loadBranches()};$('#github-branch').onchange=function(){state.branch=this.value;saveRepoState()};
async function loadBranches(){if(!state.repo)return;try{var data=await api('GET','/repos/'+state.repo+'/branches?per_page=100'),select=$('#github-branch');select.textContent='';data.forEach(function(b){select.appendChild(option(b.name,b.name))});if(Array.from(select.options).some(function(o){return o.value===state.branch}))select.value=state.branch;else if(select.options.length)state.branch=select.value;saveRepoState()}catch(e){setMessage(e.message,true)}}
$('#github-refresh').onclick=loadGithub;
function decodeBase64(value){var bytes=Uint8Array.from(atob(String(value||'').replace(/\s/g,'')),function(c){return c.charCodeAt(0)});return new TextDecoder().decode(bytes)}
function encodedPath(path){return path.split('/').map(encodeURIComponent).join('/')}
async function fetchProject(repo,ref){var file=await api('GET','/repos/'+repo+'/contents/PCH1000_HMI_editor_project.json?ref='+encodeURIComponent(ref));return decodeBase64(file.content)}
$('#github-pull').onclick=async function(){try{setMessage('Загружаю проект из '+state.branch+'…');var text=await fetchProject(state.repo,state.branch);HmiEditor.importProject(text);setMessage('Проект загружен из GitHub')}catch(e){setMessage(e.message,true)}};

async function pushEntries(repo,branch,entries,messageText){
  var ref=await api('GET','/repos/'+repo+'/git/ref/heads/'+encodeURIComponent(branch)),parent=ref.object.sha,commit=await api('GET','/repos/'+repo+'/git/commits/'+parent),tree=[];
  for(var i=0;i<entries.length;i++){setMessage('GitHub: '+(i+1)+' / '+entries.length+' · '+entries[i].path);var blob=await api('POST','/repos/'+repo+'/git/blobs',{content:entries[i].content,encoding:'utf-8'});tree.push({path:entries[i].path,mode:'100644',type:'blob',sha:blob.sha})}
  var createdTree=await api('POST','/repos/'+repo+'/git/trees',{base_tree:commit.tree.sha,tree:tree});
  var createdCommit=await api('POST','/repos/'+repo+'/git/commits',{message:messageText||'Update PCH-1000 HMI',tree:createdTree.sha,parents:[parent]});
  await api('PATCH','/repos/'+repo+'/git/refs/heads/'+encodeURIComponent(branch),{sha:createdCommit.sha,force:false});return createdCommit;
}
$('#github-push').onclick=async function(){
  var button=$('#github-push');if(button.disabled)return;button.disabled=true;
  try{if(!state.repo)throw new Error('Выбери репозиторий');setMessage('Собираю C-проект…');var payload=await HmiEditor.buildExportEntries();await pushEntries(state.repo,state.branch,payload.entries,$('#github-message').value.trim());setMessage('Commit и push выполнены')}
  catch(e){setMessage(e.message,true)}finally{button.disabled=false}
};
$('#create-branch').onclick=async function(){try{var name=$('#new-branch-name').value.trim();if(!name)throw new Error('Укажи название ветки');if(!/^[A-Za-z0-9._\/-]+$/.test(name)||name.indexOf('..')>=0)throw new Error('Недопустимое название ветки');await createBranch(state.repo,state.branch,name);state.branch=name;saveRepoState();await loadBranches();$('#github-branch').value=name;setMessage('Ветка '+name+' создана и выбрана')}catch(e){setMessage(e.message,true)}};
$('#github-history').onclick=async function(){try{var commits=await api('GET','/repos/'+state.repo+'/commits?sha='+encodeURIComponent(state.branch)+'&per_page=20');$('#commit-history').textContent=commits.map(function(c){return c.sha.slice(0,7)+' · '+c.commit.author.date.slice(0,10)+'\n'+c.commit.message.split('\n')[0]}).join('\n\n');setMessage('Последние commit: '+commits.length)}catch(e){setMessage(e.message,true)}};
$('#create-repo').onclick=async function(){try{var name=$('#new-repo-name').value.trim();if(!name)throw new Error('Укажи название');setMessage('Создаю репозиторий…');var repo=await api('POST','/user/repos',{name:name,private:$('#new-repo-private').checked,auto_init:true,description:'C-код интерфейса экранчика ПЧ-1000'});state.repo=repo.full_name;await loadGithub();$('#github-repo').value=state.repo;state.branch=repo.default_branch||'main';saveRepoState();await loadBranches();setMessage('Репозиторий создан')}catch(e){setMessage(e.message,true)}};

function updateCodexContext(){var c=HmiEditor.selectedContext();$('#codex-context').textContent=c.key?'Выбран: '+c.name+' · '+c.key+' · '+c.sceneName:'Элемент не выбран — задача будет относиться ко всему C-проекту'}
async function createBranch(repo,base,name){var ref=await api('GET','/repos/'+repo+'/git/ref/heads/'+encodeURIComponent(base));await api('POST','/repos/'+repo+'/git/refs',{ref:'refs/heads/'+name,sha:ref.object.sha});return name}
$('#codex-start').onclick=async function(){try{
  if(!$('#ai-beta').checked)throw new Error('Сначала включи Codex-бета в настройках');if(!state.repo)throw new Error('Выбери репозиторий C-проекта');var task=$('#codex-task').value.trim();if(!task)throw new Error('Опиши задачу');
  var ctx=HmiEditor.selectedContext(),branch='codex/hmi-'+new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);setMessage('Создаю ветку '+branch+'…');await createBranch(state.repo,state.branch,branch);
  var pr=await api('POST','/repos/'+state.repo+'/pulls',{title:'HMI: '+task.slice(0,70),head:branch,base:state.branch,body:'Изменение C-интерфейса ПЧ-1000 через приложение.\n\nРабочая сцена: '+ctx.sceneName+'\nЭлемент: '+(ctx.key||'весь проект'),draft:true});
  var prompt='@codex '+task+'\n\nРаботай только с C-рендерером интерфейса ПЧ-1000. Не изменяй Android-приложение. Сохрани совместимость C99 и обнови PCH1000_HMI_editor_project.json, чтобы приложение могло показать рендер «было/стало». Запусти make test.\n\nКонтекст: сцена '+ctx.sceneName+', элемент '+(ctx.key||'не выбран')+'.';
  await api('POST','/repos/'+state.repo+'/issues/'+pr.number+'/comments',{body:prompt});state.pr=pr.number;state.head=branch;$('#codex-pr').value=pr.number;localStorage.setItem('pch-codex-pr',String(pr.number));setMessage('Draft PR #'+pr.number+' создан, задача отправлена Codex')
  }catch(e){setMessage(e.message,true)}};
async function loadPr(){var n=Number($('#codex-pr').value||state.pr);if(!n)throw new Error('Укажи номер PR');var pr=await api('GET','/repos/'+state.repo+'/pulls/'+n);state.pr=n;state.head=pr.head.ref;localStorage.setItem('pch-codex-pr',String(n));var files=await api('GET','/repos/'+state.repo+'/pulls/'+n+'/files?per_page=100');$('#code-diff').textContent=files.map(function(f){return f.filename+'  +'+f.additions+' −'+f.deletions+'\n'+(f.patch||'(бинарный или слишком большой файл)')}).join('\n\n');setMessage('PR #'+n+': '+pr.state+(pr.mergeable===false?' · есть конфликт':''));return pr}
$('#codex-refresh').onclick=function(){loadPr().catch(function(e){setMessage(e.message,true)})};
$('#codex-compare').onclick=async function(){try{var pr=await loadPr(),text=await fetchProject(state.repo,pr.head.ref);close();await HmiEditor.startComparison(text)}catch(e){setMessage(e.message,true)}};
$('#codex-followup').onclick=async function(){try{var task=$('#codex-task').value.trim();if(!task)throw new Error('Напиши уточнение');var pr=await loadPr();await api('POST','/repos/'+state.repo+'/issues/'+pr.number+'/comments',{body:'@codex '+task});setMessage('Уточнение отправлено в PR #'+pr.number)}catch(e){setMessage(e.message,true)}};
$('#codex-merge').onclick=async function(){try{var pr=await loadPr(),result=await api('PUT','/repos/'+state.repo+'/pulls/'+pr.number+'/merge',{merge_method:'squash',sha:pr.head.sha});if(!result.merged)throw new Error(result.message||'GitHub не выполнил слияние');state.branch=pr.base.ref;saveRepoState();setMessage('PR объединён. Загружаю обновлённую ветку…');var text=await fetchProject(state.repo,state.branch);HmiEditor.importProject(text);setMessage('Изменения приняты и загружены')}catch(e){setMessage(e.message,true)}};
$('#codex-reject').onclick=async function(){try{var pr=await loadPr();await api('PATCH','/repos/'+state.repo+'/pulls/'+pr.number,{state:'closed'});try{await api('DELETE','/repos/'+state.repo+'/git/refs/heads/'+encodeURIComponent(pr.head.ref))}catch(ignore){}setMessage('PR закрыт, рабочая ветка удалена')}catch(e){setMessage(e.message,true)}};

function versionParts(value){return String(value||'').replace(/^[^0-9]*/,'').split(/[^0-9]+/).slice(0,3).map(Number)}function newer(a,b){var x=versionParts(a),y=versionParts(b);for(var i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return(x[i]||0)>(y[i]||0)}return false}
function publicAppRelease(){return new Promise(function(resolve,reject){var b=bridge();if(!b||!b.checkAppUpdate){reject(new Error('Проверка обновлений доступна в APK'));return}var id=String(requestId++);pending[id]={resolve:resolve,reject:reject};b.checkAppUpdate(id)})}
async function checkUpdate(silent){try{if(!silent)setMessage('Проверяю GitHub Releases…');var release=await publicAppRelease(),info=parse(bridge().appInfo()),asset=(release.assets||[]).find(function(a){return /\.apk$/i.test(a.name)}),box=$('#update-result');if(!asset)throw new Error('В последнем релизе нет APK');if(!newer(release.tag_name,info.versionName)){box.textContent='Установлена актуальная версия '+info.versionName;if(!silent)setMessage('Обновление не требуется');return}var row=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');row.className='shell-status';label.textContent='Доступна '+release.tag_name+(release.name?' · '+release.name:'');button.textContent='СКАЧАТЬ';button.onclick=function(){bridge().downloadAndInstall(asset.browser_download_url,asset.name)};row.appendChild(label);row.appendChild(button);box.textContent='';box.appendChild(row);$('#app-menu').classList.add('active');if(!silent)setMessage('Найдено обновление '+release.tag_name)}catch(e){if(!silent)setMessage(e.message,true)}}
function maybeAutoCheckUpdate(){var last=Number(localStorage.getItem('pch-update-check')||0),now=Date.now();if(now-last<86400000)return;localStorage.setItem('pch-update-check',String(now));checkUpdate(true)}
$('#check-update').onclick=function(){checkUpdate(false)};

var ai=localStorage.getItem('pch-ai-beta')==='1';$('#ai-beta').checked=ai;function updateAi(){var enabled=$('#ai-beta').checked;localStorage.setItem('pch-ai-beta',enabled?'1':'0');$$('.ai-tab').forEach(function(x){x.classList.toggle('hidden',!enabled)});if(!enabled&&$('[data-shell-pane="codex"]').classList.contains('active'))selectTab('settings')}$('#ai-beta').onchange=updateAi;updateAi();
var savedClient=localStorage.getItem('pch-github-client-id')||'';$('#github-client-id').value=validClient(savedClient)?savedClient:'';updateLogin();$('#codex-pr').value=state.pr||'';try{var app=parse(bridge()&&bridge().appInfo?bridge().appInfo():'{}');$('#app-version').textContent='Версия приложения: '+(app.versionName||'веб-просмотр')}catch(e){}

var tourSteps=[
  {target:'#phone',title:'Живой экран',text:'Это симуляция настоящего экранчика 320×480. Меню, графики и окна можно нажимать.'},
  {target:'#hardware',title:'Кнопки и энкодер',text:'Здесь проверяются заряд, пуск и управление энкодером. Удержание энкодера 0,5 секунды переключает параметр.'},
  {target:'#mode-toggle',title:'Ручное редактирование',text:'Кнопка «Редактор» включает выбор элементов, перемещение по пикселям, текст, шрифт и цвета.',action:function(){$('#mode-toggle').click()}},
  {target:'#export',title:'Настоящий C-проект',text:'Сохраняй полный набор C-файлов в выбранную папку. Этот код затем встраивается в микроконтроллер.'},
  {target:'#app-menu',title:'Проекты и GitHub',text:'В меню выбирается рабочая папка или GitHub. Там же находятся обновления и необязательный Codex-бета.',action:function(){open('project')}}
],tourAt=0;
var tourLayoutFrame=0;
function positionTour(){
  if($('#tour').classList.contains('hidden'))return;
  var el=$(tourSteps[tourAt].target),spot=$('#tour-spot'),card=$('.tour-card');if(!el)return;
  // Reserve actual card space; this reflows the stage and controls above it.
  var reserve=Math.ceil(card.getBoundingClientRect().height)+24;
  document.body.style.setProperty('--tour-reserve',reserve+'px');
  var toolbar=el.closest('.toolbar');
  if(toolbar){var tr=toolbar.getBoundingClientRect(),er=el.getBoundingClientRect();if(er.right>tr.right-8)toolbar.scrollLeft+=er.right-tr.right+8;if(er.left<tr.left+8)toolbar.scrollLeft-=tr.left+8-er.left;}
  cancelAnimationFrame(tourLayoutFrame);
  tourLayoutFrame=requestAnimationFrame(function(){
    var r=el.getBoundingClientRect(),pad=4,limit=card.getBoundingClientRect().top-6;
    var left=Math.max(2,Math.min(innerWidth-2,r.left-pad)),top=Math.max(2,Math.min(limit,r.top-pad));
    var right=Math.min(innerWidth-2,r.right+pad),bottom=Math.min(limit,r.bottom+pad);
    spot.style.left=left+'px';spot.style.top=top+'px';spot.style.width=Math.max(0,right-left)+'px';spot.style.height=Math.max(0,bottom-top)+'px';
  });
}
function showTour(index){tourAt=index||0;if(tourAt===0&&document.body.classList.contains('editing'))$('#mode-toggle').click();var step=tourSteps[tourAt];$('#tour').classList.remove('hidden');document.body.classList.add('tour-active');$('#tour-count').textContent=(tourAt+1)+' / '+tourSteps.length;$('#tour-title').textContent=step.title;$('#tour-text').textContent=step.text;$('#tour-next').textContent=tourAt===tourSteps.length-1?'ГОТОВО':step.action?'ПОПРОБОВАТЬ':'ДАЛЬШЕ';positionTour()}
function finishTour(){localStorage.setItem('pch-tour-v1','done');$('#tour').classList.add('hidden');document.body.classList.remove('tour-active');document.body.style.removeProperty('--tour-reserve');cancelAnimationFrame(tourLayoutFrame)}
$('#tour-next').onclick=function(){var step=tourSteps[tourAt];if(step.action)step.action();if(tourAt+1>=tourSteps.length)finishTour();else showTour(tourAt+1)};$('#tour-skip').onclick=finishTour;$('#restart-tour').onclick=function(){close();showTour(0)};window.addEventListener('resize',positionTour);
if(window.ResizeObserver){var tourObserver=new ResizeObserver(positionTour);tourObserver.observe($('.tour-card'));tourObserver.observe($('#stage'));}
document.addEventListener('scroll',positionTour,true);
if(localStorage.getItem('pch-tour-v1')!=='done')setTimeout(function(){showTour(0)},900);
function onBack(){if(!$('#tour').classList.contains('hidden')){finishTour();return true}if(!modal.classList.contains('hidden')){close();return true}if(document.body.classList.contains('comparing')){HmiEditor.closeComparison();return true}return false}

window.AppShell={githubAuthProgress:githubAuthProgress,githubResult:githubResult,nativeResult:nativeResult,workingFolderSelected:workingFolderSelected,workingProjectSaved:workingProjectSaved,projectChanged:projectChanged,open:open,onBack:onBack};
refreshFolder();refreshAuth();
maybeAutoCheckUpdate();
})();
