(function(){
'use strict';
var $=function(id){return document.getElementById(id)},deps=null,repo='',thread=0,threadPath='issues',generation=0,sending=false,refreshing=false,timer=0,lastSignature='';
function status(text,error){$('codex-ask-status').textContent=text;$('codex-ask-status').style.color=error?'#ff756e':''}
function storageKey(name){return 'pch-codex-question-'+name}
function readThread(name){try{var t=JSON.parse(localStorage.getItem(storageKey(name))||'{}');return{number:Number(t.number)||0,path:t.path==='pull'?'pull':'issues'}}catch(e){return{number:0,path:'issues'}}}
function remember(name,number,path){localStorage.setItem(storageKey(name),JSON.stringify({number:number,path:path}))}
function controls(){['codex-ask-send','codex-ask-new','codex-thread-load'].forEach(function(id){$(id).disabled=sending});$('codex-ask-open').disabled=!thread;$('codex-thread').value=thread||''}
function contextChanged(){if(!deps)return;var next=deps.context().repo;if(next===repo)return;repo=next;var saved=readThread(repo);thread=saved.number;threadPath=saved.path;generation++;lastSignature='';$('codex-conversation').textContent='';status(thread?'Обсуждение #'+thread:'Напиши первый вопрос.');controls()}
function active(){return deps&&deps.enabled()&&!document.hidden&&!$('shell-modal').classList.contains('hidden')&&$('codex-mode').value==='ask'&&$('codex-ask-panel').closest('[data-shell-pane]').classList.contains('active')}
function allowed(){if(!deps.enabled())throw new Error('Включи Codex-бета и войди в GitHub');if(!repo)throw new Error('Выбери репозиторий C-проекта')}
function safeExternal(url){try{var u=new URL(url);return u.protocol==='https:'&&(u.hostname==='github.com'||u.hostname==='chatgpt.com')?u.href:null}catch(e){return null}}
function addMessage(author,body,date){var item=document.createElement('article'),head=document.createElement('header'),text=document.createElement('pre');item.className='codex-message';head.textContent=author+(date?' · '+new Date(date).toLocaleString():'');text.textContent=body||'';item.appendChild(head);item.appendChild(text);
  var links=String(body||'').match(/https:\/\/[^\s<>"\])]+/g)||[];Array.from(new Set(links)).forEach(function(raw){var url=safeExternal(raw);if(!url)return;var a=document.createElement('a');a.href=url;a.textContent=url;a.onclick=function(e){e.preventDefault();deps.openExternal(url)};item.appendChild(a)});$('codex-conversation').appendChild(item)
}
async function refresh(){
  contextChanged();if(!thread||refreshing||!deps.enabled())return;refreshing=true;
  var version=generation,number=thread,name=repo;
  try{
    var issue=await deps.api('GET','/repos/'+name+'/issues/'+number),comments=[],page=1,batch;
    do{batch=await deps.api('GET','/repos/'+name+'/issues/'+number+'/comments?per_page=100&page='+page);comments=comments.concat(batch);page++}while(batch.length===100&&page<=20);
    if(version!==generation||name!==deps.context().repo)return;
    threadPath=issue.pull_request?'pull':'issues';remember(name,number,threadPath);controls();
    var signature=JSON.stringify([issue.body,comments.map(function(c){return[c.id,c.updated_at,c.body]})]);
    if(signature!==lastSignature){var box=$('codex-conversation'),atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<30;box.textContent='';addMessage(issue.user?issue.user.login:'Обсуждение',issue.body,issue.created_at);comments.forEach(function(c){addMessage(c.user?c.user.login:'GitHub',c.body,c.created_at)});if(atBottom)box.scrollTop=box.scrollHeight;lastSignature=signature}
    status('Обсуждение #'+number+' · '+comments.length+' сообщений'+(batch.length===100?' · остальная история в GitHub':'')+' · обновлено '+new Date().toLocaleTimeString());
  }catch(e){if(version===generation)status('Не удалось обновить переписку: '+e.message,true)}finally{refreshing=false}
}
function questionPrompt(text,ctx,sha){return '@codex Ответь на вопрос по исходникам. Режим: только объяснение. Не изменяй файлы, не создавай коммиты, ветки или pull requests. Ответь по-русски, укажи файлы и функции, на которые опираешься. Если кода недостаточно, прямо скажи об этом.\n\nВопрос: '+text+'\n\nРепозиторий: '+ctx.repo+'\nВетка: '+ctx.branch+'\nКоммит: '+sha+'\nСцена: '+ctx.element.sceneName+'\nЭлемент: '+(ctx.element.key||'не выбран')}
async function send(){
  if(sending)return;contextChanged();
  var text=$('codex-question').value.trim(),ctx=deps.context(),version=generation,number=thread,name=repo;
  try{
    allowed();if(!text)throw new Error('Напиши вопрос');sending=true;controls();status('Отправляю вопрос…');
    var ref=await deps.api('GET','/repos/'+name+'/git/ref/heads/'+encodeURIComponent(ctx.branch));
    if(!number){
      var issue=await deps.api('POST','/repos/'+name+'/issues',{title:'Вопрос по HMI: '+text.slice(0,90),body:'Обсуждение C-кода HMI. Режим вопросов: без изменения исходников.\nВетка: '+ctx.branch+'\nКоммит: '+ref.object.sha});
      number=issue.number;remember(name,number,'issues');
      if(version===generation&&name===deps.context().repo){thread=number;threadPath='issues';controls()}
    }
    await deps.api('POST','/repos/'+name+'/issues/'+number+'/comments',{body:questionPrompt(text,ctx,ref.object.sha)});
    if(version===generation&&name===deps.context().repo){if($('codex-question').value.trim()===text)$('codex-question').value='';status('Вопрос отправлен в #'+number+'. Ждём ответа Codex.');await refresh()}
  }catch(e){if(version===generation)status('Вопрос не отправлен: '+e.message+'. Текст сохранён; перед повтором можно обновить обсуждение.',true)}finally{sending=false;controls()}
}
function activate(){contextChanged();if(active())refresh()}
function init(options){deps=options;
  $('codex-ask-send').onclick=send;$('codex-ask-refresh').onclick=refresh;
  $('codex-ask-new').onclick=function(){if(sending)return;generation++;thread=0;threadPath='issues';lastSignature='';remember(repo,0,'issues');$('codex-conversation').textContent='';status('Новый диалог начнётся после отправки вопроса.');controls()};
  $('codex-thread-load').onclick=async function(){try{allowed();var number=Number($('codex-thread').value);if(!Number.isSafeInteger(number)||number<1)throw new Error('Укажи номер Issue или PR');generation++;thread=number;lastSignature='';$('codex-conversation').textContent='';controls();await refresh()}catch(e){status(e.message,true)}};
  $('codex-ask-open').onclick=function(){if(thread&&repo)deps.openExternal('https://github.com/'+repo+'/'+threadPath+'/'+thread)};
  clearInterval(timer);timer=setInterval(function(){if(active()&&!sending)refresh()},15000);
  document.addEventListener('visibilitychange',function(){if(active())refresh()});contextChanged();controls()
}
window.CodexQuestions={init:init,activate:activate,contextChanged:contextChanged};
})();
