import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../app/src/main/assets/editor/codex-markdown.js',import.meta.url),'utf8');
function node(tag='div'){
  let own='';
  return{tagName:String(tag).toUpperCase(),children:[],className:'',appendChild(child){this.children.push(child)},set textContent(value){own=String(value);if(value==='')this.children=[]},get textContent(){return own+this.children.map(child=>child.textContent||'').join('')}};
}
const opened=[],target=node();
const context=vm.createContext({window:{},URL,document:{createElement:node,createTextNode:text=>({textContent:String(text)})}});
vm.runInContext(source,context);
context.window.CodexMarkdown.render(target,'# Готово\n\n- **Изменён** `hmi.c`\n- [Задача](https://chatgpt.com/codex/tasks/1)\n\n<script>alert(1)</script>\n\n```c\nint main(void);\n```',url=>opened.push(url));
assert.deepEqual(target.children.map(x=>x.tagName),['H3','UL','P','PRE']);
assert.equal(target.children[1].children[0].children[0].tagName,'STRONG');
assert(target.children[1].children[0].children.some(x=>x.tagName==='CODE'));
const link=target.children[1].children[1].children.find(x=>x.href);assert.equal(link.href,'https://chatgpt.com/codex/tasks/1');link.onclick({preventDefault(){}});assert.deepEqual(opened,['https://chatgpt.com/codex/tasks/1']);
assert(target.children[2].textContent.includes('<script>alert(1)</script>'),'Raw HTML must remain harmless text');
assert.equal(target.children[3].children[0].textContent,'int main(void);');
assert.equal(context.window.CodexMarkdown.safeUrl('javascript:alert(1)'),null);
console.log('PASS: safe Markdown headings, lists, emphasis, code, links and literal HTML');
