(function(){
'use strict';
var $=function(id){return document.getElementById(id)},deps=null,repo='',generation=0,busy=false,refreshing=false,timer=0,snapshot=null,signature='';
function status(text,error){$('codex-edit-status').textContent=text;$('codex-edit-status').style.color=error?'#ff756e':''}
function key(name){return 'pch-codex-edit-pr:'+name}
function remember(name,number){localStorage.setItem(key(name),String(number));if(deps&&name===deps.context().repo){$('codex-pr').value=number||'';deps.selected(number)}}
function contextChanged(){
  if(!deps||repo===deps.context().repo)return;
  repo=deps.context().repo;generation++;snapshot=null;signature='';
  var saved=localStorage.getItem(key(repo));
  remember(repo,Number(saved)||0);$('codex-edit-conversation').textContent='';$('code-diff').textContent='';
  status('Создай запрос или укажи номер существующего PR.');controls();
}
function token(){contextChanged();var n=Number($('codex-pr').value);if(!deps.enabled())throw new Error('Включи ИИ и войди в GitHub');if(!repo)throw new Error('Выбери репозиторий');if(!Number.isSafeInteger(n)||n<1)throw new Error('Укажи номер PR');return{repo:repo,number:n,version:generation,branch:deps.context().branch}}
function current(t){return t.version===generation&&t.repo===deps.context().repo&&t.number===Number($('codex-pr').value)&&t.branch===deps.context().branch}
function requireCurrent(t){if(!current(t)||!deps.enabled())throw new Error('Контекст изменился. Обнови выбранный PR перед действием.')}
function active(){return deps&&deps.enabled()&&!document.hidden&&!$('shell-modal').classList.contains('hidden')&&$('codex-mode').value==='edit'&&$('codex-edit-panel').closest('[data-shell-pane]').classList.contains('active')}
function controls(){
  var valid=snapshot&&current(snapshot.token),canMerge=valid&&snapshot.pr.state==='open'&&snapshot.changes.length>0&&!snapshot.waiting&&snapshot.pr.mergeable!==false;
  $('codex-merge').disabled=busy||!canMerge;
  ['codex-followup','codex-reject','codex-compare'].forEach(function(id){$(id).disabled=busy});
  $('codex-edit-open').disabled=!Number($('codex-pr').value);
  $('codex-edit-load').disabled=busy||!valid||!snapshot.pr.merged;
}
async function pages(path){var result=[],batch,page=1;do{batch=await deps.api('GET',path+'?per_page=100&page='+page++);result=result.concat(batch)}while(batch.length===100);return result}
function bot(c){return /^(chatgpt-codex-connector|codex)\[bot\]$/.test(c.user&&c.user.login||'')}
function analyze(pr,files,comments){
  var request=-1,reply=-1;
  comments.forEach(function(c,i){if(!bot(c)&&/@codex\b/i.test(c.body||''))request=i;if(bot(c)&&String(c.body||'').trim())reply=i});
  var changes=files.filter(function(f){return !/^\.codex\/tasks\//.test(f.filename)}),answered=reply>request,waiting=request>=0&&!answered,text;
  if(pr.merged)text='Изменения объединены в '+pr.base.ref+'. Можно загрузить результат.';
  else if(pr.state==='closed')text='PR закрыт без слияния.';
  else if(answered&&!changes.length)text='Ответ Codex получен, но изменения проекта в этот PR не опубликованы. Открой ответ и задачу ниже.';
  else if(waiting)text='Запрос отправлен. Нового ответа Codex пока нет.'+(changes.length?' В PR есть изменения; они могут относиться к предыдущему запросу.':' Изменений проекта в PR пока нет.');
  else if(changes.length)text=(answered?'Ответ Codex получен. ':'')+'В PR опубликованы изменения: '+changes.length+' файлов. Проверь ответ и сравнение перед принятием.';
  else text='Изменений проекта в PR пока нет.';
  if(pr.state==='open')text+=' '+(pr.draft?'Черновик будет снят при принятии. ':'')+(pr.mergeable===false?'Есть конфликт с основной веткой. ':'')+'Точный прогресс облачной задачи GitHub не передаёт.';
  return{changes:changes,waiting:waiting,text:text};
}
function addMessage(c){
  var item=document.createElement('article'),head=document.createElement('header'),body=document.createElement('pre');item.className='codex-message';
  head.textContent=(c.user&&c.user.login||'GitHub')+(c.created_at?' · '+new Date(c.created_at).toLocaleString():'');body.textContent=c.body||'';item.appendChild(head);item.appendChild(body);
  var links=String(c.body||'').match(/https:\/\/[^\s<>"\])]+/g)||[];
  Array.from(new Set(links)).forEach(function(raw){try{var url=new URL(raw);if(url.protocol!=='https:'||!['github.com','chatgpt.com'].includes(url.hostname))return;var a=document.createElement('a');a.href=url.href;a.textContent=url.hostname==='chatgpt.com'?'ОТКРЫТЬ ЗАДАЧУ CODEX':url.href;a.onclick=function(e){e.preventDefault();deps.openExternal(url.href)};item.appendChild(a)}catch(ignore){}});
  $('codex-edit-conversation').appendChild(item);
}
function render(s){
  if(!current(s.token))return;snapshot=s;remember(s.token.repo,s.pr.number);
  status('PR #'+s.pr.number+' · '+s.text+' · обновлено '+new Date().toLocaleTimeString());
  var next=JSON.stringify([s.token.repo,s.pr.number,s.pr.body,s.comments]);
  if(next!==signature){var box=$('codex-edit-conversation'),bottom=box.scrollHeight-box.scrollTop-box.clientHeight<30;box.textContent='';addMessage(s.pr);s.comments.forEach(addMessage);if(bottom)box.scrollTop=box.scrollHeight;signature=next}
  $('code-diff').textContent=s.files.map(function(f){return f.filename+'  +'+f.additions+' −'+f.deletions+'\n'+(f.patch||'(полный diff доступен в GitHub)')}).join('\n\n');controls();
}
async function read(t){
  var root='/repos/'+t.repo+'/pulls/'+t.number;
  var data=await Promise.all([deps.api('GET',root),pages(root+'/files'),pages('/repos/'+t.repo+'/issues/'+t.number+'/comments')]);
  // Do not combine a new head with files loaded from an older head.
  var latest=await deps.api('GET',root);if(latest.head.sha!==data[0].head.sha||latest.base.sha!==data[0].base.sha)throw new Error('PR обновился во время проверки. Нажми «Проверить» ещё раз.');
  return Object.assign({token:t,pr:latest,files:data[1],comments:data[2]},analyze(latest,data[1],data[2]));
}
async function refresh(){
  if(refreshing||busy)return;var t;
  try{t=token();refreshing=true;var s=await read(t);if(current(t)){render(s);return s}}
  catch(e){if(!t||current(t)){snapshot=null;controls();status('Не удалось обновить PR: '+e.message,true)}}finally{refreshing=false}
}
async function action(work){
  if(busy)return;var t;
  try{t=token();t.version=++generation;busy=true;controls();var s=await read(t);requireCurrent(t);render(s);await work(s)}
  catch(e){if(!t||current(t))status(e.message,true)}finally{busy=false;controls()}
}
async function loadMerged(s,sha){
  try{var text=await deps.fetchProject(s.token.repo,sha||s.pr.merge_commit_sha||s.pr.base.ref);requireCurrent(s.token);deps.importMerged(text,s.token.repo,s.pr.base.ref);status('PR объединён, проект загружен в редактор.')}
  catch(e){if(current(s.token))status('PR уже объединён, но проект не загружен: '+e.message+'. Нажми «Загрузить результат».',true)}
}
function merge(){var shown=snapshot;return action(async function(s){
  var t=s.token,pr=s.pr,root='/repos/'+t.repo+'/pulls/'+t.number;
  if(pr.merged){await loadMerged(s);return}
  if(shown&&shown.token.repo===t.repo&&shown.pr.number===t.number&&shown.pr.head.sha!==pr.head.sha)throw new Error('В PR появились новые коммиты. Сравнение обновлено — проверь его перед принятием.');
  if(pr.state!=='open')throw new Error('PR закрыт без слияния.');
  if(!s.changes.length)throw new Error('В PR только описание задачи. Изменения проекта не опубликованы — принимать нечего.');
  if(s.waiting)throw new Error('На последний запрос ещё нет ответа Codex. Обнови переписку перед принятием.');
  if(pr.mergeable===false)throw new Error('В PR конфликт с основной веткой. Сначала исправь конфликт.');
  if(pr.draft){
    status('Снимаю черновик PR #'+t.number+'…');
    var result=await deps.api('POST','/graphql',{query:'mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{isDraft}}}',variables:{id:pr.node_id}});
    if(result.errors&&result.errors.length)throw new Error('Не удалось снять черновик: '+result.errors.map(function(e){return e.message}).join('; ')+'. Можно открыть PR в GitHub и нажать Ready for review.');
    if(!result.data||!result.data.markPullRequestReadyForReview||result.data.markPullRequestReadyForReview.pullRequest.isDraft)throw new Error('GitHub не подтвердил снятие черновика. Обнови PR.');
  }
  requireCurrent(t);
  var fresh=await read(t);requireCurrent(t);
  if(fresh.pr.head.sha!==pr.head.sha||fresh.pr.base.sha!==pr.base.sha||JSON.stringify(fresh.comments)!==JSON.stringify(s.comments))throw new Error('PR или переписка изменились. Проверь новый результат перед принятием.');
  status('Объединяю PR #'+t.number+'…');
  var merged=await deps.api('PUT',root+'/merge',{merge_method:'squash',sha:pr.head.sha});
  if(!merged.merged)throw new Error(merged.message||'GitHub не выполнил слияние.');
  if(!current(t))return;s.pr.merged=true;s.pr.state='closed';s.pr.merge_commit_sha=merged.sha;snapshot=s;
  await loadMerged(s,merged.sha);
})}
function followup(){return action(async function(s){
  var text=$('codex-task').value.trim();if(!text)throw new Error('Напиши уточнение');if(s.pr.state!=='open')throw new Error('Этот PR уже закрыт. Создай новый запрос.');
  await deps.api('POST','/repos/'+s.token.repo+'/issues/'+s.pr.number+'/comments',{body:'@codex '+text+'\n\nПродолжай работу в существующем PR #'+s.pr.number+', ветка '+s.pr.head.ref+'. Опубликуй изменения именно в эту ветку, не создавай новый PR и не выполняй слияние. Ответь по-русски здесь: что изменено, какие проверки прошли и удалось ли опубликовать код. Если публикация не удалась, явно сообщи об этом.'});
  if(current(s.token)){snapshot=null;status('Уточнение отправлено. Ждём нового ответа Codex.');var next=await read(s.token);render(next)}
})}
function activate(){contextChanged();if(active()&&Number($('codex-pr').value))refresh()}
function init(options){
  deps=options;
  // Bind the old global PR number only to the repo selected at migration time.
  var name=deps.context().repo;if(name&&localStorage.getItem(key(name))===null)localStorage.setItem(key(name),String(Number($('codex-pr').value)||0));
  $('codex-pr').onchange=function(){generation++;snapshot=null;signature='';$('codex-edit-conversation').textContent='';$('code-diff').textContent='';controls();refresh()};
  $('codex-refresh').onclick=refresh;$('codex-merge').onclick=merge;$('codex-followup').onclick=followup;
  $('codex-compare').onclick=function(){return action(async function(s){var text=await deps.fetchProject(s.token.repo,s.pr.head.sha);requireCurrent(s.token);await deps.compare(text)})};
  $('codex-edit-load').onclick=function(){return action(async function(s){if(!s.pr.merged)throw new Error('PR ещё не объединён.');await loadMerged(s)})};
  $('codex-edit-open').onclick=function(){try{var t=token();deps.openExternal('https://github.com/'+t.repo+'/pull/'+t.number)}catch(e){status(e.message,true)}};
  $('codex-reject').onclick=function(){return action(async function(s){
    if(s.pr.merged)throw new Error('PR уже объединён.');
    await deps.api('PATCH','/repos/'+s.token.repo+'/pulls/'+s.pr.number,{state:'closed'});
    var sameRepo=s.pr.head.repo&&s.pr.head.repo.full_name===s.token.repo;
    if(sameRepo&&s.pr.head.ref!==s.pr.base.ref&&/^codex\/hmi-/.test(s.pr.head.ref)){
      try{await deps.api('DELETE','/repos/'+s.token.repo+'/git/refs/heads/'+encodeURIComponent(s.pr.head.ref))}
      catch(e){if(current(s.token))status('PR закрыт, но ветка не удалена: '+e.message,true);return}
      if(current(s.token))status('PR закрыт, рабочая ветка удалена.');
    }else if(current(s.token))status('PR закрыт. Ветка сохранена.');
    if(current(s.token)){s.pr.state='closed';snapshot=s}
  })};
  clearInterval(timer);timer=setInterval(function(){if(active()&&!busy&&Number($('codex-pr').value))refresh()},15000);
  document.addEventListener('visibilitychange',activate);contextChanged();controls();
}
window.CodexEdits={init:init,activate:activate,contextChanged:contextChanged,remember:remember,refresh:refresh,analyze:analyze};
})();
