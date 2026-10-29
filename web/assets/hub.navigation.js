/* Standalone and embedded pages share the same route names. */
/* ⚠️ 顺序与 `web/index.html` 的外壳 Tab 保持一致（这样内嵌页的菜单与顶栏不会"两套顺序"）。
   ⚠️ **论坛不在 `HUB_ROUTES` 里**：它在 Flarum（`/forum/`），是个**外链**。
   放进下面这张表会被第 33 行那个点击拦截当成内部路由 postMessage 给外壳，
   而外壳的 `show('forum')` 因为 TABS 里没有它 → **静默弹回首页**。外链必须单独一张表。 */
const HUB_ROUTES=[['/home','首页','Home'],['/guide','攻略','Guide'],['/loot','掉率轮换','Loot rotation'],['/tasks','赛季','Season'],['/db','资料库','Database'],['/build','配装器','Build planner'],['/stats','特工数据','Agent stats'],['/steam','公告','News'],['/bug','问题追踪','Bug tracker'],['/support','支持站点','Support']];
/* 外链：只渲染成普通 `<a>`（新标签打开），**不参与**点击拦截、也不参与 `hubAlias` 高亮。 */
const HUB_EXTERNAL=[['/forum/','论坛','Forum']];
/* 赛季四个子页（/journey /priorities /pass /isac）**故意不进 HUB_ROUTES**：
   它们是 /tasks 的子版块，进表会把内嵌页菜单再撑长一截。
   但它们仍要有个"当前在哪"的落点 ⇒ 这里做别名，让菜单高亮「赛季」而不是掉回「首页」。 */
const HUB_ALIAS={'/journey':'/tasks','/priorities':'/tasks','/pass':'/tasks','/isac':'/tasks','/vendor':'/loot','/sets':'/db'};
function hubAlias(route){ return HUB_ALIAS[route] || route; }
function hubNavigation(){
 if(parent!==window){document.getElementById('hub-navigation')?.remove();return Promise.resolve();}
 let nav=document.getElementById('hub-navigation');if(!nav){nav=document.createElement('nav');nav.id='hub-navigation';
  /* 创建时就把外壳的**最终**高度占住：`.hub-shell` 是 `position:sticky`（占文档流）且高
     72px（手机 60px + safe-area），而它由 hub.shell.js 稍后**异步**构建。不预留的话，
     构建完成那一刻整页下移 —— 实测 /build/ CLS 0.851 里 0.22 就是这一段位移。
     这里安全：函数开头已对 iframe 内页 return，所以只有顶层页面会走到本行。
     ⚠️ 改 .hub-shell 的高度（hub.shell.css）时必须同改这里。 */
  nav.style.minHeight=matchMedia('(max-width:760px)').matches?'calc(60px + env(safe-area-inset-top))':'72px';
  document.body.prepend(nav);}
 if(window.AgentHubShell)return window.AgentHubShell.standalone();
 const source=document.querySelector('script[src*="hub.navigation.js"]')?.src||location.origin+'/assets/hub.navigation.js';
 return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/hub.shell.js'+new URL(source).search;script.onload=()=>window.AgentHubShell.standalone().then(resolve,reject);script.onerror=reject;document.body.append(script);});
}
function hubLootNavigation(){
 const route=location.pathname.replace(/\/+$/,'');
 if(!['/loot','/vendor','/dashboard_loot.html','/dashboard_vendor.html'].includes(route))return;
 const current=route.includes('vendor')?'/vendor':'/loot';
 let nav=document.getElementById('loot-subnavigation');
 if(!nav){nav=document.createElement('nav');nav.id='loot-subnavigation';nav.className='hub-subnavigation';const header=document.querySelector('.loot-head,.vendor-head');header?.querySelector('.hd')?.after(nav);}
 nav.setAttribute('aria-label',LANG==='zh'?'掉率轮换子页面':'Loot rotation pages');
 nav.innerHTML=[['/loot','原型掉落','Prototype drops'],['/vendor','供应商重置','Vendor reset']].map(([url,zh,en])=>`<a href="${url}" data-hub-link${url===current?' aria-current="page"':''}>${esc(LANG==='zh'?zh:en)}</a>`).join('');
}
document.addEventListener('DOMContentLoaded',()=>{window.AgentHubNavigationReady=hubNavigation();hubLootNavigation();onLangChange(()=>{window.AgentHubShell?.paint();hubLootNavigation();});});
document.addEventListener('click',e=>{
 const a=e.target.closest('a[data-hub-link]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0||window.parent===window)return;
 const url=new URL(a.href,location.href);if(url.origin!==location.origin)return;
 /* 论坛：不在 `HUB_ROUTES`（Flarum 是完整前端，`page.py` 的 `ROUTE_INDEXES` 里也刻意没有它），
    但外壳有 `forum` 路由 + `path` 参数（`index.nav.js: show('forum',{path})`）。
    不认这一支的话，页内指向论坛的链接会在 iframe 里再把整个外壳套一层（`/home` 的两张图片卡踩过）。 */
 if(url.pathname==='/forum'||url.pathname.startsWith('/forum/')){
  e.preventDefault();window.parent.postMessage({type:'agenthub:navigate',tab:'forum',params:{path:url.pathname+url.search+url.hash}},location.origin);return;
 }
 const tab=url.pathname.replace(/^\/|\/$/g,'');if(!HUB_ROUTES.some(r=>r[0]===hubAlias('/'+tab)))return;
 e.preventDefault();window.parent.postMessage({type:'agenthub:navigate',tab,params:Object.fromEntries(url.searchParams),hash:url.hash},location.origin);
});
