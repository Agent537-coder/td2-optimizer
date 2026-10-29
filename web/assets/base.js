/* 特工枢纽 / Agent Hub · 页面共享的前端工具层（H6 解耦，2026-09-12）
   ─────────────────────────────────────────────────────────────────────────────
   为什么有这份文件：`$` / `esc` / 主题切换 / 语言切换 / JSON 请求这几段，原先在
   index.html、dashboard.html、dashboard_steam.html、dashboard_db.html、dashboard_build.html
   里各抄了一份（改一处要改四处，四份还会慢慢漂移）⇒ 收成唯一一份，页面只引用不重写。

   写法两条（**别改成 IIFE / 模块包装**）：
     · 全部是**顶层**函数与变量：这些名字已经被页面脚本和验收脚本按全局名字直接调用
       （scripts/devcheck/ui_smoke.mjs 会在页面上下文里调 `setTheme('light')`、`render()` 等），
       包进闭包等于把这些名字从全局拿掉，验收脚本会当场 ReferenceError。
     · `LANG` 由本文件持有（各页原来的 `let LANG` 已删）；语言切换后的重渲染由
       `onLangChange(fn)` 注册的钩子驱动 —— 各页渲染入口名字不同（render / renderAll）。

   行为口径（与搬进来之前**逐字一致**，本轮只搬代码不动界面）：
     · 主题：只写 `documentElement[data-theme]` + `localStorage['td2theme']`；
     · 语言：只写 `localStorage['td2lang']` + `#lang` 按钮文字（'中文' / '原文'）+ 各页钩子；
     · 请求：`fetchJSON` / `postJSON` **不额外判 `r.ok`** —— 与原来的
       `fetch(...).then(r=>r.json())` 完全等价，各页既有的 try/catch + 红条/降级语义保持不变。
   视觉与文案零改动：这里没有一行 CSS、没有一个界面字符串（除语言按钮那两个既有文字）。
*/
var LANG = 'zh';                                     // 当前界面语言；各页的 pick()/L() 直接读它
const TD2_THEME_KEY = 'td2theme', TD2_LANG_KEY = 'td2lang';
const JSON_HDRS = {'Content-Type':'application/json'};
const TD2_LANG_HOOKS = [];                           // onLangChange() 注册的重渲染钩子

const $ = s => document.querySelector(s);
const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* localStorage 读写（无痕/被禁用时不抛，取值失败当没有） */
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

/* 主题：读 / 写 / 切换（原来三页各自内联的那个三元表达式） */
function getTheme(){ return document.documentElement.getAttribute('data-theme') || 'dark'; }
function themeActionLabel(){ return LANG==='en' ? (getTheme()==='dark'?'Light':'Dark') : (getTheme()==='dark'?'浅色':'深色'); }
function preferredTheme(){
  try{if(parent!==window&&typeof parent.getTheme==='function')return parent.getTheme();}catch(e){}
  return lsGet(TD2_THEME_KEY)==='light'?'light':'dark';
}
function paintThemeAction(){
  const el = document.getElementById('theme');
  if(el){ if(!el.classList.contains("hub-tool"))el.textContent=themeActionLabel(); el.setAttribute('aria-label',LANG==='en'?'Switch to '+themeActionLabel().toLowerCase()+' theme':'切换为'+themeActionLabel()); el.title=el.getAttribute('aria-label'); }
}
let themeMotionTimer=0;
function themeMotionStart(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  if(!document.getElementById('hub-theme-motion')){const style=document.createElement('style');style.id='hub-theme-motion';style.textContent='html.hub-theme-changing body,html.hub-theme-changing body :where(main,header,nav,section,article,aside,footer,dialog,button,input,select,textarea,div,a,p,span,strong,small,b){transition-property:background-color,color,border-color;transition-duration:220ms;transition-timing-function:cubic-bezier(.2,0,0,1)}';document.head.append(style);}
  document.documentElement.classList.add('hub-theme-changing');clearTimeout(themeMotionTimer);themeMotionTimer=setTimeout(()=>document.documentElement.classList.remove('hub-theme-changing'),280);
}
function setTheme(t,options){
  t=t==='light'?'light':'dark';
  const persist=!options||options.persist!==false;
  if(persist){
    // An embedded user action updates the shell too. Passive restoration never
    // writes a stale document preference back over the user's latest choice.
    try{if(parent!==window&&typeof parent.setTheme==='function')parent.setTheme(t);}catch(e){}
    lsSet(TD2_THEME_KEY,t);
  }
  const root=document.documentElement,changed=getTheme()!==t;
  let animatedParent=false;try{animatedParent=parent!==window&&parent.document.documentElement.classList.contains('hub-theme-changing');}catch(e){}
  if(changed&&(persist||animatedParent)&&document.readyState!=='loading'&&options?.animate!==false)themeMotionStart();
  if(root.getAttribute('data-theme')!==t)root.setAttribute('data-theme',t);
  root.style.colorScheme=t;
  paintThemeAction();
  if(changed)window.dispatchEvent(new CustomEvent('hub:theme',{detail:t}));
}
function toggleTheme(){ const t = getTheme()==='dark' ? 'light' : 'dark'; setTheme(t); return t; }

/* 语言：按钮文字 + 状态 + 钩子（各页 setLang 的公共部分，逐字搬过来） */
function langLabel(){ return LANG==='zh' ? 'English' : '中文'; }
function onLangChange(fn){ if(typeof fn==='function') TD2_LANG_HOOKS.push(fn); }
function setLang(l){
  LANG = l === 'en' ? 'en' : 'zh';
  document.documentElement.lang=LANG==='en'?'en':'zh-CN';
  lsSet(TD2_LANG_KEY,l);
  const el = document.getElementById('lang');
  if(el){ if(!el.classList.contains("hub-tool"))el.textContent = langLabel(); el.setAttribute('aria-label',LANG==='zh'?'切换为英文':'Switch to Chinese'); }
  for(const fn of TD2_LANG_HOOKS) fn(LANG);
  paintThemeAction();
  document.dispatchEvent(new CustomEvent('hub:language',{detail:LANG}));
}

/* 筛选 chip 行：工单页与公告页共用同一段 DOM 生成（chip 定义来自各页 chipDefs()，
   点一块 = 翻转该维度布尔值再重渲染；两页渲染入口不同，由调用方传进来）。 */
function renderChips(sel, defs, flags, onChange){
  const c = $(sel);
  c.innerHTML = '';
  for(const d of defs){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (flags[d.k] ? ' on' : '');
    b.textContent = d.t;
    b.setAttribute('aria-pressed',String(!!flags[d.k]));
    b.onclick = () => { flags[d.k] = !flags[d.k]; onChange(); };
    c.appendChild(b);
  }
}

/* JSON 请求封装：与原来各页手写的 fetch+json 等价（见文件头「行为口径」）。
   可选 `init.timeoutMs`：**只在这一条请求上**加超时（不传 ⇒ 与原来逐字等价，无超时）。
   为什么要它：`fetch` 本身**不会超时** —— 请求悬住时 Promise 永不落地，调用方的
   `await` 卡死、`catch` 也不跑，界面上既没有数据也没有错误提示（2026-09-13 真踩：
   公告页首轮就停在这个形状，见 `steam/steam.state.js` 的 `load()`）。 */
/* First-screen request accounting is independent of animation timings. */
let HUB_READY_PENDING=0;
const HUB_FEEDBACK_ANIMATIONS=new Set();
function hubAnimate(element,keyframes,options){
  const animation=element.animate(keyframes,options);HUB_FEEDBACK_ANIMATIONS.add(animation);
  animation.finished.then(()=>HUB_FEEDBACK_ANIMATIONS.delete(animation),()=>HUB_FEEDBACK_ANIMATIONS.delete(animation));
  return animation;
}
function hubTrackReady(promise){
  const root=typeof document!=='undefined'&&document.documentElement;
  const paint=()=>{if(root&&root.dataset){root.dataset.hubPending=String(HUB_READY_PENDING);root.dataset.hubContentTick=String((+root.dataset.hubContentTick||0)+1);}};
  HUB_READY_PENDING++;paint();
  return Promise.resolve(promise).finally(()=>{HUB_READY_PENDING=Math.max(0,HUB_READY_PENDING-1);paint();});
}
function hubFeedback(message,kind,target){
  if(typeof document==='undefined'||!document.body||!document.createElement)return;
  let notice=document.getElementById('hub-action-notice');
  if(!notice){notice=document.createElement('div');notice.id='hub-action-notice';notice.className='hub-action-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.setAttribute('aria-atomic','true');document.body.append(notice);}
  clearTimeout(notice.__timer);notice.dataset.kind=kind||'status';notice.hidden=false;notice.textContent=message;
  notice.__timer=setTimeout(()=>{notice.hidden=true;},6500);
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced){for(const animation of HUB_FEEDBACK_ANIMATIONS)animation.cancel();HUB_FEEDBACK_ANIMATIONS.clear();}
  if(!reduced&&typeof notice.animate==='function')hubAnimate(notice,[{opacity:0,translate:'0 5px'},{opacity:1,translate:'0 0'}],{duration:180,easing:'ease-out'});
  const panel=typeof target==='string'?document.querySelector(target):target;
  if(!reduced&&panel&&typeof panel.animate==='function'){
    hubAnimate(panel,[{opacity:.45},{opacity:1}],{duration:200,easing:'ease-out'});
    panel.querySelectorAll('.orow').forEach((row,i)=>hubAnimate(row,[{opacity:0,translate:'0 4px'},{opacity:1,translate:'0 0'}],{duration:180,delay:i*25,easing:'ease-out',fill:'backwards'}));
  }
}
function initHubFeedback(){
  if(!document.documentElement?.dataset||typeof MutationObserver!=='function'||document.documentElement.dataset.hubFeedback)return;
  document.documentElement.dataset.hubFeedback='1';
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener?.('change',()=>{if(motion.matches){for(const animation of HUB_FEEDBACK_ANIMATIONS)animation.cancel();HUB_FEEDBACK_ANIMATIONS.clear();}});
  const selector='button:not(:disabled),summary,[role="button"]';let pressed,started=0;
  const release=()=>{const el=pressed;pressed=null;if(el)setTimeout(()=>{delete el.dataset.hubPressed;},Math.max(0,100-(performance.now()-started)));};
  const press=el=>{release();if(!el||el.getAttribute('aria-disabled')==='true')return;pressed=el;started=performance.now();el.dataset.hubPressed='true';};
  document.addEventListener('pointerdown',e=>{if(e.isPrimary!==false&&e.button===0)press(e.target.closest?.(selector));},{passive:true});
  document.addEventListener('pointerup',release,{passive:true});document.addEventListener('pointercancel',release,{passive:true});window.addEventListener('blur',release);
  document.addEventListener('keydown',e=>{if(!e.repeat&&(e.key==='Enter'||e.key===' ')&&!e.target.matches('input,textarea,select'))press(e.target.closest?.(selector));});
  document.addEventListener('keyup',e=>{if(e.key==='Enter'||e.key===' ')release();});
  const seen=new WeakMap(),dialogs='#dlg,#dlgbox,#build-spec-dialog,dialog,[role="dialog"]';
  const inspect=el=>{
    const open=!el.hidden&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>0;
    if(open&&!seen.get(el)&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&typeof el.animate==='function')hubAnimate(el,[{opacity:0,translate:'0 6px'},{opacity:1,translate:'0 0'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});
    seen.set(el,open);
  };
  new MutationObserver(changes=>{const nodes=new Set();for(const change of changes){const el=change.target;if(el.nodeType===1&&el.matches(dialogs))nodes.add(el);for(const node of change.addedNodes||[]){if(node.nodeType!==1)continue;if(node.matches(dialogs))nodes.add(node);node.querySelectorAll(dialogs).forEach(n=>nodes.add(n));}}nodes.forEach(inspect);}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open','style','class']});
}

function fetchJSON(url, init){
  const ms = (init && init.timeoutMs) || 0;
  if(!ms) return hubTrackReady(fetch(url, init).then(r => r.json()));
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  const o = Object.assign({}, init, {signal: ac.signal});
  delete o.timeoutMs;
  return hubTrackReady(fetch(url, o).then(r => r.json()).then(
    v => { clearTimeout(timer); return v; },
    e => { clearTimeout(timer); throw e; }));
}
function postJSON(url, body, headers){
  const init = {method:'POST'};
  const b = (body == null) ? null : (typeof body === 'string' ? body : JSON.stringify(body));
  if(b != null){ init.headers = headers || JSON_HDRS; init.body = b; }   // 无 body 就不发 Content-Type，与原来一致
  return fetch(url, init).then(r => r.json());
}

/* 回到顶部（全站共享 · 2026-09-17 从任务页提到这里，用户要求每个页面都有）。
   base.js 在每个页面都是**正文之后**加载 ⇒ `document.body` 已存在，直接建节点；
   唯一例外是自己嵌着外壳 iframe 的入口页（`#fr`），它不滚动、也不需要这颗按钮。
   文案跟随全站 LANG（onLangChange 里刷新），样式在 base.css 用主题令牌写一处。 */
const TD2_TO_TOP_MIN = 320;                       // 滚过这么多像素才出现，免得挡住正文
function toTopLabel(){ return LANG === 'zh' ? '回到顶部' : 'Back to top'; }
function toTopSync(){
  if(window.AgentHubMobile?.refreshToTop){ window.AgentHubMobile.refreshToTop(); return; }
  const b = document.getElementById('to-top');
  if(!b) return;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  b.hidden = y < TD2_TO_TOP_MIN;
}
function applyToTopLang(){
  const b = document.getElementById('to-top');
  if(!b) return;
  b.setAttribute('aria-label', toTopLabel());
  b.setAttribute('title', toTopLabel());
}
function setupToTop(){
  if(document.getElementById('fr')) return;       // 外壳入口页：内容是 iframe，自己不滚
  if(!document.getElementById('to-top')){
    const b = document.createElement('button');
    b.id = 'to-top'; b.className = 'to-top'; b.type = 'button'; b.hidden = true;
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
                  '<path d="M12 4l8 8-1.7 1.7L13 8.4V20h-2V8.4l-5.3 5.3L4 12z"/></svg>';
    b.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));
    document.body.appendChild(b);
    window.addEventListener('scroll', toTopSync, {passive: true});
    window.addEventListener('resize', toTopSync);
  }
  applyToTopLang();
  toTopSync();
}

/* 首屏还原：主题 + 语言（各页原先各写一份的那个 IIFE，逐字等价）。
   base.js 在所有页面都放在**正文之后、页面内联脚本之前** ⇒ 这里 `#lang` 一定已经存在。 */
(function(){
  if(window.parent!==window)document.documentElement.classList.add('embedded');
  try{
    setTheme(preferredTheme(),{persist:false});
    LANG = localStorage.getItem(TD2_LANG_KEY)==='en'?'en':'zh';
    document.documentElement.lang=LANG==='en'?'en':'zh-CN';
    paintThemeAction();
  }catch(e){}
  const el = document.getElementById('lang');
  if(el){ if(!el.classList.contains("hub-tool"))el.textContent = langLabel(); el.setAttribute('aria-label',LANG==='zh'?'切换为英文':'Switch to Chinese'); }
  onLangChange(applyToTopLang);
  setupToTop();
  initHubFeedback();
  window.addEventListener('storage',event=>{if(event.key===TD2_THEME_KEY||event.key===null)setTheme(preferredTheme(),{persist:false});});
  window.addEventListener('pageshow',()=>setTheme(preferredTheme(),{persist:false}));
})();

/* ── `assets/db/img/**` 的 WebP 改写（2026-10-12）───────────────────────────────
   这批图标已全部转成 WebP（`scripts/publish/webp_db_icons.py`，实测 q90 省 75%：
   `/vendor` 那 98 张 1612 KB → 399 KB），**PNG 仍留在盘上** —— 所以漏改一处只是「继续用 PNG」，
   永远不会断图。这里是**唯一**的扩展名改写点：调用方照旧按 `.png` 写路径，
   只在拼 URL 时换成 `.webp`。
   ⚠️ 两件不许做的事：
   ① **别只改扩展名不改反色名单的查表键** —— 反色名单（`monoIc()` / `HOME_MONO_ICONS` 等）
      是按 `.png` 名建的，URL 变 `.webp` 后会查不中，**浅色主题下白线条图标直接看不见**。
      各处查表函数已统一把 `.webp` 归一回 `.png`。
   ② **别碰后面的 `?v=` 戳** —— 各入口的戳号本来就不同（`IMGV` / `SEASON_IMGV` / vendor 自己的 119），
      统一改会打乱缓存，只换扩展名即可（扩展名变了 URL 就变了）。 */
/* ⚠️ 必须判目录：只改 `/assets/db/img/` 下的。别处的 `.png`（例如 `/assets/img/favicon.png`）
   没有对应的 `.webp`，无脑替换会把图改成 404。 */
function dbIcon(u){
  if(typeof u!=='string'||u.indexOf('/assets/db/img/')<0)return u;
  return u.replace(/\.png(?=\?|$)/, '.webp');
}

/* ── 图片渐进显现（LQIP）：占位框 + 模糊底 + 淡入，零转圈、零跳动 ──────────────────
   表由 `scripts/publish/lqip.py` 生成（`assets/lqip.json`，`<相对 web/ 的路径> -> {ar, ph}`）。
   只在**第一次真要看大图时**才拉：绝大多数页面根本用不到，不该为它多占一条首屏请求。
   拿不到表 ⇒ `ahLoad()` 返回 false、不加 `.ahph` ⇒ 调用方走原来的渲染，不会「占错框」。 */
let AH_LQIP=null, AH_LQIP_P=null;
function ahKey(u){
  try{ return new URL(u,location.href).pathname.replace(/^\/+/,'').replace(/\?.*$/,''); }
  catch(e){ return ''; }
}
function ahLqip(){
  if(AH_LQIP)return Promise.resolve(AH_LQIP);
  if(AH_LQIP_P)return AH_LQIP_P;
  AH_LQIP_P=fetchJSON('/assets/lqip.json')
    .then(t=>{ AH_LQIP=(t&&typeof t==='object')?t:{}; return AH_LQIP; })
    .catch(()=>{ AH_LQIP={}; return AH_LQIP; });
  return AH_LQIP_P;
}
/* 先摆框（宽高比 + 模糊底）再挂真图 —— 顺序反了会「先撑大再缩回」，正是要修的那个现象。 */
function ahLoad(frame,url){
  if(!frame)return false;
  frame.classList.remove('ahph','ah-on');
  frame.style.removeProperty('--ah-ar');
  frame.style.backgroundImage='';
  ahLqip();
  const m=AH_LQIP&&AH_LQIP[ahKey(url)];
  if(!m)return false;
  frame.classList.add('ahph');
  frame.style.setProperty('--ah-ar',m.ar);
  frame.style.backgroundImage='url("'+m.ph+'")';
  return true;
}
/* 真图到了就揭底。已经 `complete` 的（HTTP 命中）也必须走一次，否则会永远停在模糊层。 */
function ahReveal(frame){
  const im=frame&&frame.querySelector('img');
  if(!im)return;
  const show=()=>frame.classList.add('ah-on');
  if(im.complete&&im.naturalWidth){ show(); return; }
  im.addEventListener('load',show,{once:true});
}

/* Bounded rendering keeps full source arrays intact; only the visible prefix changes. */
const HUB_PAGES = new Map();
function hubPageSlice(items,key,host,render,signature,step=24){
  let state=HUB_PAGES.get(key);
  const sig=String(signature);
  if(!state||state.sig!==sig){state={sig,limit:step};HUB_PAGES.set(key,state);}
  let box=document.getElementById('hub-page-'+key);
  if(!box){box=document.createElement('div');box.id='hub-page-'+key;box.className='hub-pagination';host.after(box);}
  box.hidden=items.length<=step;
  const shown=Math.min(items.length,state.limit);
  box.innerHTML='<span role="status">'+(LANG==='en'?'Showing ':'已显示 ')+shown+' / '+items.length+'</span>'+(shown<items.length?'<button type="button">'+(LANG==='en'?'Load more':'加载更多')+'</button>':'');
  const button=box.querySelector('button');
  if(button)button.onclick=()=>{const y=window.scrollY;state.limit+=step;render();window.scrollTo(0,y);const next=document.querySelector('#hub-page-'+key+' button');if(next)next.focus({preventScroll:true});};
  return items.slice(0,state.limit);
}
const HUB_TERMS={'突击步枪':'Assault Rifle','步枪':'Rifle','射手步枪':'Marksman Rifle','轻机枪':'Light Machine Gun','冲锋枪':'Submachine Gun','霰弹枪':'Shotgun','手枪':'Pistol','专长':'Signature','面具':'Mask','背包':'Backpack','胸甲':'Chest','手套':'Gloves','枪套':'Holster','护膝':'Kneepads','金装（高级）':'High-End','灰装（普通）':'Standard','装备组':'Gear Set','具名':'Named','奇特':'Exotic','普通':'Standard'};
function hubTerm(text){return LANG==='en'?(HUB_TERMS[text]||text):text;}

// Skill display vocabulary only; internal tiers and overcharge conditions stay numeric.
function hubSkillTierLabel(value){
 const n=Number(String(value??'').replace(/^Tier|^T/i,''));
 return n===7?(LANG==='zh'?'超载':'Overcharge'):(LANG==='zh'?'分阶':'Tier ')+n;
}
