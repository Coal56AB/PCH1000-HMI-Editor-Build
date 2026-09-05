(function(){
'use strict';
function el(name,className){var node=document.createElement(name);if(className)node.className=className;return node}
function safeUrl(value){try{var url=new URL(value);return url.protocol==='https:'?url.href:null}catch(e){return null}}
function link(parent,label,raw,openExternal){
  var url=safeUrl(raw);if(!url){parent.appendChild(document.createTextNode(label));return}
  var a=el('a');a.href=url;a.textContent=label;a.rel='noopener noreferrer';a.onclick=function(event){event.preventDefault();openExternal(url)};parent.appendChild(a)
}
function inline(parent,value,openExternal,depth){
  var text=String(value||''),pattern=/(`[^`\n]+`|\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_)|https:\/\/[^\s<>]+)/g,index=0,match;
  if((depth||0)>3){parent.appendChild(document.createTextNode(text));return}
  while((match=pattern.exec(text))){
    if(match.index>index)parent.appendChild(document.createTextNode(text.slice(index,match.index)));
    var token=match[0],node;
    if(token[0]==='`'){node=el('code');node.textContent=token.slice(1,-1);parent.appendChild(node)}
    else if(token[0]==='['){link(parent,match[2],match[3],openExternal)}
    else if(token.startsWith('**')||token.startsWith('__')){node=el('strong');inline(node,match[4]||match[5],openExternal,(depth||0)+1);parent.appendChild(node)}
    else if(token[0]==='*'||token[0]==='_'){node=el('em');inline(node,match[6]||match[7],openExternal,(depth||0)+1);parent.appendChild(node)}
    else{var clean=token.replace(/[.,;:!?]+$/,'');link(parent,clean,clean,openExternal);if(clean.length<token.length)parent.appendChild(document.createTextNode(token.slice(clean.length)))}
    index=pattern.lastIndex;
  }
  if(index<text.length)parent.appendChild(document.createTextNode(text.slice(index)))
}
function startsBlock(line){return /^\s*$|^\s*```|^\s*#{1,6}\s+|^\s*>\s?|^\s*[-+*]\s+|^\s*\d+[.)]\s+|^\s*---+\s*$/.test(line)}
function render(target,source,openExternal){
  target.textContent='';target.className='codex-markdown';var lines=String(source||'').replace(/\r\n?/g,'\n').split('\n'),i=0;
  openExternal=openExternal||function(url){window.open(url,'_blank','noopener')};
  while(i<lines.length){
    var line=lines[i];if(!line.trim()){i++;continue}
    var fence=line.match(/^\s*```\s*([^\s`]*)/);
    if(fence){var code=[],pre=el('pre'),codeNode=el('code');i++;while(i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;if(fence[1])codeNode.className='language-'+fence[1].replace(/[^a-z0-9_-]/gi,'');codeNode.textContent=code.join('\n');pre.appendChild(codeNode);target.appendChild(pre);continue}
    var heading=line.match(/^\s*(#{1,6})\s+(.+)$/);
    if(heading){var h=el('h'+Math.min(heading[1].length+2,6));inline(h,heading[2],openExternal);target.appendChild(h);i++;continue}
    if(/^\s*---+\s*$/.test(line)){target.appendChild(el('hr'));i++;continue}
    var list=line.match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
    if(list){var ordered=/\d/.test(list[1]),listNode=el(ordered?'ol':'ul');while(i<lines.length){var item=lines[i].match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);if(!item||/\d/.test(item[1])!==ordered)break;var li=el('li'),body=item[2].replace(/^\[([ xX])\]\s*/,function(_,checked){return checked===' '?'☐ ':'☑ '});inline(li,body,openExternal);listNode.appendChild(li);i++}target.appendChild(listNode);continue}
    if(/^\s*>/.test(line)){var quote=el('blockquote'),parts=[];while(i<lines.length&&/^\s*>/.test(lines[i]))parts.push(lines[i++].replace(/^\s*>\s?/,''));inline(quote,parts.join(' '),openExternal);target.appendChild(quote);continue}
    var parts=[line.trim()];i++;while(i<lines.length&&!startsBlock(lines[i])){parts.push(lines[i].trim());i++}var p=el('p');inline(p,parts.join(' '),openExternal);target.appendChild(p)
  }
}
window.CodexMarkdown={render:render,safeUrl:safeUrl};
})();
