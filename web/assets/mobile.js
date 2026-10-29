/* Mobile task surfaces. No data, formula, authentication or browser-edge gestures. */
(function () {
'use strict';
if (window.AgentHubMobile) return;
const small = matchMedia('(max-width:760px), (max-height:500px) and (pointer:coarse)'), root = document.documentElement;
const shell = !!document.getElementById('fr'), embedded = parent !== window;
const forum = location.pathname.startsWith('/forum/');
const q = s => document.querySelector(s);
const text = (zh, en) => (typeof LANG !== 'undefined' ? LANG === 'en' : /^en/i.test(root.lang)) ? en : zh;
const paths = {
 home: ['今日','Today','home'], db: ['资料库','Database','db'], build: ['配装','Build','build'], forum: ['论坛','Forum','forum'],
 guide: ['精选攻略','Guides','forum'], loot: ['目标掉落','Targeted loot','home'], vendor: ['每周供应商','Weekly vendors','home'],
 tasks: ['赛季活动与猎捕','Season & manhunt','home'], journey: ['赛季旅程','Journey','home'], priorities: ['头号目标','Priority objectives','home'],
 pass: ['赛季通行证','Season pass','home'], isac: ['ISAC 修正','ISAC modifiers','home'], sets: ['装备图鉴','Gear collection','db'],
 stats: ['特工数据','Agent stats','home'], steam: ['官方公告','Official news','home'], bug: ['问题追踪','Bug tracker','home'], support: ['支持本站','Support','home']
};
const icons = {
 home:'<path d="m3 10 9-7 9 7v10H6V10M9 20v-7h6v7"/>',
 db:'<path d="M4 4h7v16H4zM14 4h6v16h-6zM7 8h1m9 0h1M7 12h1m9 0h1"/>',
 build:'<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6"/>',
 forum:'<path d="M4 4h16v13H9l-5 4V4ZM8 9h8m-8 4h5"/>',
 guide:'<path d="M4 4h7c1 0 1 1 1 1s0-1 1-1h7v15h-7c-1 0-1 1-1 1s0-1-1-1H4V4Zm8 1v15M7 8h2m6 0h2M7 12h2m6 0h2"/>',
 menu:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>', search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
 support:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 gear:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9M8 5.2l8 4.5"/>',
 season:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m4 0h2"/>',
 news:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v15"/>',
 tools:'<path d="M4 3v18h17M8 17v-5m5 5V8m5 9V5"/>'
};
const svg = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';
const mainIcon=name=>'<img class="hub-nav-icon" src="/assets/img/navigation/'+({home:'home',db:'database',build:'loadout',forum:'community'}[name])+'.png" width="24" height="24" alt="">';
let nav, catalog, opener, trigger, toolbar, toolbarSource, toolbarAnchor, currentBuild='gear', lastScroll=0, travel=0;
const buildScrollPositions={};
let modalHistory=false, closingHistory=false, catalogExit=null, touchStart=null, lastTouch=0;
const route = () => shell ? (location.hash.slice(1).split(/[?#]/)[0] || 'home') : forum ? 'forum' : (location.pathname.replace(/\/$/,'').split('/').pop() || 'home').replace(/^dashboard_/, '').replace(/\.html$/, '');
function linkFor(name) { return '/#'+name; }
function navigate(name) {
 const replace=modalHistory;
 if (catalog?.open) closeCatalog(false);
 if (shell && typeof show === 'function') { if(route()!==name) show(name,{},replace); else document.getElementById('fr').contentWindow.scrollTo({top:0,behavior:'auto'}); }
 else if(route()===name) window.scrollTo({top:0,behavior:'auto'});
 else location.assign(linkFor(name));
 paint();
}
function makeNav() {
 nav=document.createElement('nav');nav.id='mobile-tabs';nav.setAttribute('aria-label',text('主要功能','Main navigation'));
 for (const name of ['home','db','build','forum']) {
  const a=document.createElement('a');a.href=linkFor(name);a.dataset.mobileRoute=name;a.innerHTML=mainIcon(name)+'<span></span>';
  a.onclick=e=>{if(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(name);};nav.append(a);
 }
 document.body.append(nav);
}
function makeCatalog() {
 catalog=document.createElement('dialog');catalog.id='mobile-catalog';catalog.setAttribute('aria-labelledby','mobile-catalog-title');
 catalog.innerHTML='<div class="mobile-catalog-head"><div><h2 id="mobile-catalog-title"></h2><a class="hub-support-link" href="'+linkFor('support')+'" data-mobile-route="support">'+svg('support')+'<span></span></a><button type="button" class="mobile-close">'+svg('close')+'</button></div><label class="mobile-nav-search">'+svg('search')+'<input id="mobile-nav-search" type="search" autocomplete="off"></label></div><div class="mobile-catalog-body"></div>';
 catalog.querySelector('.hub-support-link').onclick=e=>{if(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate('support');};
 const body=catalog.querySelector('.mobile-catalog-body');
 const directory=document.createElement('div');directory.className='mobile-nav-directory';
 let tools;
 for(const [zh,en,names,kind] of [
  ['常用入口','Main pages',['home','db','build','forum'],'main'],
  ['装备与掉落','Gear & loot',['sets','loot','vendor'],'gear'],
  ['赛季与猎捕','Season & manhunt',['tasks','journey','priorities','pass','isac'],'season'],
  ['攻略与资讯','Guides & news',['guide','steam','bug'],'news'],
  ['更多工具','More tools',['stats'],'tools']
 ]) {
  const section=document.createElement('section');
  for(const name of names) {const a=document.createElement('a');a.href=linkFor(name);a.dataset.mobileRoute=name;a.onclick=e=>{if(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(name);};section.append(a);}
  if(zh==='常用入口'){section.className='mobile-nav-primary';body.append(section);}
  else{section.className='mobile-nav-group';section.dataset.navGroup=kind;const heading=document.createElement('h3');heading.innerHTML=svg(kind)+'<span data-zh="'+zh+'" data-en="'+en+'"></span>';section.prepend(heading);directory.append(section);if(zh==='更多工具')tools=section;}
 }
 const installGuide=document.createElement('a');installGuide.href='/install/';installGuide.dataset.zh='安装到设备';installGuide.dataset.en='Install on this device';
 tools.append(installGuide);body.append(directory);
 const empty=document.createElement('p');empty.id='mobile-nav-empty';empty.hidden=true;empty.setAttribute('role','status');body.append(empty);
 document.body.append(catalog);
 catalog.querySelector('.mobile-close').onclick=()=>closeCatalog();
 catalog.addEventListener('click',e=>{const box=catalog.getBoundingClientRect();if(e.target===catalog&&(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom))closeCatalog();});
 catalog.querySelector('.mobile-close').setAttribute('aria-label',text('关闭导航','Close navigation'));
 catalog.addEventListener('cancel',e=>{e.preventDefault();closeCatalog();});
 catalog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeCatalog();}});
 catalog.addEventListener('close',()=>{document.body.classList.remove('mobile-catalog-open');trigger?.setAttribute('aria-expanded','false');if(opener?.isConnected)opener.focus({preventScroll:true});});
 catalog.querySelector('input').addEventListener('input',filterCatalog);
 dragDismiss(catalog.querySelector('.mobile-catalog-head>div'),catalog,closeCatalog,'left');
}
function filterCatalog() {
 const value=q('#mobile-nav-search').value.trim().toLocaleLowerCase();let found=0;
 catalog.querySelectorAll('section').forEach(section=>{
  let count=0;section.querySelectorAll('a,button').forEach(el=>{const name=el.dataset.mobileRoute;const haystack=name?[name,...paths[name]].join(' '):el.textContent;el.hidden=!!value&&!haystack.toLocaleLowerCase().includes(value);if(!el.hidden)count++;});
  section.hidden=!count;found+=count;const group=section.closest('details');if(group){group.hidden=!count;if(value){if(!group.dataset.searchOpen)group.dataset.searchOpen=String(group.open);group.open=!!count;}else if(group.dataset.searchOpen){group.open=group.dataset.searchOpen==='true';delete group.dataset.searchOpen;}}
 });q('#mobile-nav-empty').hidden=!!found;
}
function openCatalog() {
 if(catalogExit!==null){clearTimeout(catalogExit);catalogExit=null;catalog.classList.remove('hub-catalog-closing');}
 if(catalog.open)return;
 opener=document.activeElement;q('#mobile-nav-search').value='';filterCatalog();paint();
 catalog.showModal();document.body.classList.add('mobile-catalog-open');trigger?.setAttribute('aria-expanded','true');catalog.querySelector('.mobile-close').focus({preventScroll:true});
 if(!small.matches&&trigger){const box=trigger.getBoundingClientRect();catalog.style.left=Math.max(16,Math.min(box.left,innerWidth-catalog.getBoundingClientRect().width-16))+'px';catalog.style.right='auto';}else{catalog.style.removeProperty('left');catalog.style.removeProperty('right');}
 history.pushState({...history.state,agenthubMobileCatalog:true},'',location.href);modalHistory=true;
}
function closeCatalog(back=true) {
 if(!catalog?.open||catalogExit!==null)return;
 const finish=()=>{catalogExit=null;catalog.close();catalog.classList.remove('hub-catalog-closing');};
 if(matchMedia('(prefers-reduced-motion:reduce)').matches)finish();
 else{catalog.classList.add('hub-catalog-closing');catalogExit=setTimeout(finish,180);}
 if(modalHistory){modalHistory=false;if(back){closingHistory=true;history.back();}else history.replaceState(null,'',location.href);}
}
function makeTrigger() {
 if(shell){trigger=q('#shell-menu');window.hubShellLabel=()=>window.AgentHubShell?.paint();}
 else if(!embedded&&!forum) {
  const old=q('#hub-navigation .hub-menu-button');
  trigger=old||document.createElement('button');
  if(!old){trigger.id='mobile-open';document.body.prepend(trigger);}
 } else if(forum&&!embedded) {
  trigger=document.createElement('button');trigger.id='mobile-open';document.body.prepend(trigger);
 }
 if(trigger){trigger.type='button';trigger.classList.add('mobile-open');trigger.setAttribute('aria-controls','mobile-catalog');trigger.setAttribute('aria-expanded','false');
  const old=trigger.onclick;trigger.onclick=e=>{openCatalog();};}
}
function paint() {
 const active=route(), family=['home','db','build','forum'].includes(active)?active:active==='sets'?'db':active==='guide'?'forum':'';
 nav?.querySelectorAll('a').forEach(a=>{a.querySelector('span').textContent=text(...paths[a.dataset.mobileRoute]);if(a.dataset.mobileRoute===family)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 if(trigger){trigger.innerHTML=(window.AgentHubShell?.icon('menu')||svg('menu'))+'<span class="hub-visually-hidden">'+text('全部导航','All pages')+'</span>';trigger.setAttribute('aria-label',text('打开全部导航','Open all pages'));}window.AgentHubShell?.paint();
 if(catalog){
  q('#mobile-catalog-title').textContent=text('全部导航','All pages');q('#mobile-nav-search').placeholder=text('搜索页面或功能','Find a page or tool');q('#mobile-nav-search').setAttribute('aria-label',text('搜索导航','Search navigation'));
  catalog.querySelectorAll('[data-zh]').forEach(el=>el.textContent=text(el.dataset.zh,el.dataset.en));
  catalog.querySelectorAll('[data-mobile-route]').forEach(a=>{const name=a.dataset.mobileRoute;if(a.classList.contains('hub-support-link'))a.querySelector('span').textContent=text(...paths[name]);else if(a.closest('.mobile-nav-primary')){a.innerHTML=svg(name==='sets'?'db':name)+'<span></span>';a.querySelector('span').textContent=text(...paths[name]);}else a.textContent=text(...paths[name]);if(name==='steam'&&shell){const badge=document.createElement('span');badge.id='sNew';badge.className='hub-news-unread';badge.textContent=text('新','New');badge.hidden=!window.AgentHubNewsUnread;a.append(badge);}if(name===active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  q('#mobile-nav-empty').textContent=text('没有找到页面，请换个关键词。','No matching pages. Try another keyword.');
 }
 q('#mobile-build-steps')?.querySelectorAll('button').forEach(b=>b.textContent=text(...{gear:['装备','Gear'],weapons:['武器技能','Weapons / skills'],results:['结果','Results'],conditions:['条件','Conditions']}[b.dataset.step]));
 document.querySelectorAll('.mobile-home-disclosure').forEach(b=>b.textContent=b.getAttribute('aria-expanded')==='true'?text('收起','Collapse'):text('展开','Expand'));
 filterCatalogIfOpen();
}
function filterCatalogIfOpen(){if(catalog?.open)filterCatalog();}
const tapGuards=new WeakMap();
function suppressCurrentTap(doc,event){
 let guard=tapGuards.get(doc);if(!guard){guard={pointerId:null,startedAt:0};tapGuards.set(doc,guard);doc.addEventListener('pointerdown',e=>{if(guard.startedAt!==e.timeStamp)guard.pointerId=null;},true);doc.addEventListener('click',e=>{if(guard.pointerId!==null&&(!('pointerId'in e)||e.pointerId===guard.pointerId)){guard.pointerId=null;e.preventDefault();e.stopImmediatePropagation();}},true);}guard.pointerId=event.pointerId;guard.startedAt=event.timeStamp;
}
function dragDismiss(handle,panel,close,direction='down') {
 if(!handle||!panel||handle.dataset.dismissGesture)return;handle.dataset.dismissGesture=direction;
 const horizontal=direction==='left',sign=horizontal?-1:1;
 const position=e=>sign*(horizontal?e.clientX:e.clientY),transform=d=>(horizontal?'translateX(':'translateY(')+(sign*d)+'px)';
 handle.style.touchAction=horizontal?'pan-y':'pan-x';
 let resting=null;
 // The title owns this drag. Cancel native touch scrolling so its fling
 // recognizer does not consume the next independent tap after dismissal.
 handle.addEventListener('touchmove',e=>{if(touchStart&&e.cancelable)e.preventDefault();},{passive:false});
 handle.addEventListener('pointerdown',e=>{if(!small.matches||e.button)return;const control=e.target.closest('button,a,input,select,textarea');if(control&&control!==handle)return;const matrix=resting?new DOMMatrixReadOnly(getComputedStyle(panel).transform):null,current=matrix?sign*(horizontal?matrix.m41:matrix.m42):0;resting?.cancel();resting=null;touchStart={id:e.pointerId,y:position(e)-current,samples:[{y:position(e),t:performance.now()}]};handle.setPointerCapture(e.pointerId);panel.classList.add('mobile-dragging');panel.style.transform=transform(current);});
 const finish=e=>{if(!touchStart||touchStart.id!==e.pointerId)return;const distance=Math.max(0,position(e)-touchStart.y),recent=touchStart.samples.find(s=>performance.now()-s.t<100)||touchStart.samples.at(-1),speed=(position(e)-recent.y)/Math.max(1,performance.now()-recent.t);touchStart=null;lastTouch=distance>8?Date.now():0;panel.classList.remove('mobile-dragging');panel.style.removeProperty('transform');
  if(distance>8)suppressCurrentTap(handle.ownerDocument,e);
  if(e.type!=='pointercancel'&&(distance>96||(distance>36&&speed>.65))){close();return;}
  if(distance>8&&!matchMedia('(prefers-reduced-motion:reduce)').matches&&panel.animate){const animation=panel.animate([{transform:transform(distance)},{transform:transform(0)}],{duration:160,easing:'cubic-bezier(.23,1,.32,1)'});resting=animation;animation.finished.then(()=>{if(resting===animation)resting=null;}).catch(()=>{});}
 };
 handle.addEventListener('pointermove',e=>{if(touchStart?.id===e.pointerId){const now=performance.now();touchStart.samples.push({y:position(e),t:now});touchStart.samples=touchStart.samples.filter(s=>now-s.t<120);panel.style.transform=transform(Math.max(0,position(e)-touchStart.y));}});
 handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
}
function searchToolbar() {
 const name=route();
 toolbarSource=q(name==='home'?'#home-find':name==='db'?'.searchwrap':name==='vendor'?'.search-field':name==='stats'?'.search-bar':name==='steam'?'#q':name==='bug'?'#q':'#mobile-no-search');
 if(!toolbarSource)return;
 toolbarAnchor=document.createComment('mobile toolbar original position');toolbarSource.before(toolbarAnchor);
 toolbar=document.createElement('div');toolbar.id='mobile-toolbar';toolbar.setAttribute('role','region');toolbar.setAttribute('aria-label',text('当前页面操作','Page actions'));document.body.append(toolbar);
 // Moving the real control retains its value, native listeners, labels and form.
 if(toolbarSource.tagName==='INPUT'&&!toolbarSource.getAttribute('aria-label'))toolbarSource.setAttribute('aria-label',toolbarSource.placeholder||text('搜索','Search'));
 if(name==='db')toolbarSource.querySelector('input').setAttribute('aria-label',text('搜索资料库','Search database'));
}
function arrangeToolbar() {
 if(!toolbarSource)return;
 if(small.matches)toolbar.append(toolbarSource);else toolbarAnchor.after(toolbarSource);
}
function buildSteps() {
 if(route()!=='build')return;
 const steps=document.createElement('nav');steps.id='mobile-build-steps';steps.setAttribute('aria-label',text('配装分区','Build workspaces'));
 for(const step of ['gear','weapons','results','conditions']){const b=document.createElement('button');b.type='button';b.dataset.step=step;b.onclick=()=>selectBuild(step,true);steps.append(b);}
 const anchor=q('#build-toolbar');if(anchor)anchor.after(steps);else(q('main')||document.body).prepend(steps);
 document.querySelectorAll('.loadout-gear,.loadout-weapons,.loadout-skills,.build-summary,#fold_analysis,#fold_tw,#col-res,#build-mobile-settings').forEach(el=>{
  el.dataset.mobileBuild=el.matches('.loadout-gear')?'gear':el.matches('.loadout-weapons,.loadout-skills')?'weapons':el.matches('.build-summary,#fold_analysis')?'results':'conditions';
 });
 document.addEventListener('click',e=>{const a=e.target.closest('.hub-build-jump a');if(a&&small.matches){e.preventDefault();selectBuild(['gear','weapons','results','conditions'][[...a.parentElement.children].indexOf(a)],true);}},true);
 selectBuild(currentBuild,false);
}
function selectBuild(step,scroll) {
 if(scroll&&small.matches)buildScrollPositions[currentBuild]=window.scrollY;
 currentBuild=step;document.body.dataset.mobileBuildStep=small.matches?step:'';
 q('#mobile-build-steps')?.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.step===step));});
 document.querySelectorAll('[data-mobile-build]').forEach(el=>el.classList.toggle('mobile-build-inactive',small.matches&&el.dataset.mobileBuild!==step));
 if(scroll){window.scrollTo({top:buildScrollPositions[step]||0,behavior:'instant'});const heading=q('[data-mobile-build="'+step+'"] .sec-lbl,[data-mobile-build="'+step+'"] summary,[data-mobile-build="'+step+'"] h2');if(heading){if(!heading.hasAttribute('tabindex'))heading.tabIndex=-1;heading.focus({preventScroll:true});}}
}
function pageDialogs() {
 const watch=()=>{
  const settings=q('#build-mobile-settings:not([data-mobile-build])');if(settings){settings.dataset.mobileBuild='conditions';selectBuild(currentBuild,false);}
  document.querySelectorAll('#dlgbox,#v-dlg,#v-dlgwrap .v-dlg,.ah-guide-toc-modal .Modal-content').forEach(box=>{
   if(box.querySelector(':scope>.mobile-drag'))return;
   const close=box.querySelector('#dlgx,.v-close,.Modal-close button,[data-act="close"]');if(!close)return;
   const handle=document.createElement('button');handle.type='button';handle.className='mobile-drag';handle.setAttribute('aria-label',text('关闭详情，可下滑','Close details, or drag down'));handle.innerHTML='<i></i>';box.prepend(handle);handle.onclick=()=>{if(Date.now()-lastTouch>350)close.click();};dragDismiss(handle,box,()=>close.click());
  });
  const modal=!!document.querySelector('dialog[open],body.detail-open,.modal-backdrop.in,#dlgmask.on')||[...document.querySelectorAll('.ModalManager[aria-modal=true],.Composer:not(.minimized):not(.ah-reply-flow)')].some(el=>el.getBoundingClientRect().height>0&&getComputedStyle(el).visibility!=='hidden');
  document.body.classList.toggle('mobile-modal',modal);if(embedded)parent.postMessage({type:'agenthub:mobile-state',modal,keyboard:document.body.classList.contains('mobile-keyboard'),reply:document.body.classList.contains('ah-inline-reply-open')},location.origin);
 };
 let pending=false;new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;watch();});}}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open','class']});watch();
}
function keyboard() {
 const focused=()=>!!document.activeElement?.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]),textarea,[contenteditable=true]');
 function update(){
  const vv=visualViewport,inset=vv&&vv.scale===1?Math.max(0,innerHeight-vv.height-vv.offsetTop):0;
  const active=small.matches&&focused();document.body.classList.toggle('mobile-keyboard',active);root.style.setProperty('--mobile-keyboard-inset',active?inset+'px':'0px');
  if(embedded)parent.postMessage({type:'agenthub:mobile-state',keyboard:active,modal:document.body.classList.contains('mobile-modal'),reply:document.body.classList.contains('ah-inline-reply-open')},location.origin);
 }
 document.addEventListener('focusin',update);document.addEventListener('focusout',()=>requestAnimationFrame(update));visualViewport?.addEventListener('resize',update);visualViewport?.addEventListener('scroll',update);
}
function forumTools() {
 if(!forum)return;
 toolbar=document.createElement('div');toolbar.id='mobile-toolbar';toolbar.className='mobile-forum-tools';toolbar.setAttribute('aria-label',text('论坛操作','Forum actions'));
 const search=document.createElement('button');search.type='button';search.className='mobile-forum-search';search.setAttribute('aria-label',text('搜索论坛','Search forum'));search.innerHTML=svg('search')+'<span>'+text('搜索论坛','Search forum')+'</span>';search.onclick=()=>{const input=q('.Search-input input,input.Search-input,.Search input');if(input){if(window.AgentHubForumSearch)window.AgentHubForumSearch();requestAnimationFrame(()=>requestAnimationFrame(()=>input.focus()));}else q('.App-primaryControl button')?.click();};
 const compose=document.createElement('button');compose.type='button';compose.textContent=text('发帖','New discussion');compose.onclick=()=>{const button=q('.IndexPage-newDiscussion,.DiscussionPage-reply,.ah-discussion-topic-actions .SplitDropdown-button');if(button)button.click();};toolbar.append(search,compose);document.body.append(toolbar);
 if(!embedded&&trigger){toolbar.prepend(trigger);trigger.setAttribute('aria-label',text('打开全部导航','Open all pages'));}
 const refresh=document.createElement('button');refresh.type='button';refresh.className='mobile-forum-refresh';refresh.setAttribute('aria-label',text('刷新主题','Refresh discussions'));refresh.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16m5 0H3v5"/></svg>';refresh.onclick=()=>q('.IndexPage-toolbar-action .item-refresh button')?.click();toolbar.insertBefore(refresh,compose);compose.className='mobile-forum-compose';
 let pending=false;const update=()=>{pending=false;const reply=q('.DiscussionPage-reply,.ah-discussion-topic-actions .SplitDropdown-button'),create=q('.IndexPage-newDiscussion');compose.hidden=!reply&&!create;const kind=reply?'reply':'create';if(compose.dataset.kind!==kind){compose.dataset.kind=kind;compose.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(reply?'M9 10 4 15l5 5M4 15h10a6 6 0 0 0 0-12':'M12 5v14M5 12h14')+'"/></svg>';}compose.setAttribute('aria-label',reply?text('回复','Reply'):text('发帖','New discussion'));compose.title=compose.getAttribute('aria-label');refresh.hidden=!create;search.hidden=!create;search.querySelector('span').textContent=text('搜索论坛','Search forum');};
 new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(update);}}).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});update();
}
function scrollTools() {
 let viewportHeight=innerHeight;
 addEventListener('scroll',()=>{if(!small.matches||(!toolbar&&!forum)||toolbar?.contains(document.activeElement))return;
  // Expanding the iframe clamps short threads' scroll position; this is not an upward gesture.
  if(viewportHeight!==innerHeight){viewportHeight=innerHeight;lastScroll=scrollY;travel=0;return;}
  const delta=scrollY-lastScroll;travel=delta*travel<0?delta:travel+delta;lastScroll=scrollY;
  const previous=document.body.classList.contains('mobile-reading');
  if(scrollY<60||travel< -20)document.body.classList.remove('mobile-reading');else if(travel>48)document.body.classList.add('mobile-reading');
  if(forum&&embedded&&previous!==document.body.classList.contains('mobile-reading'))parent.postMessage({type:'agenthub:mobile-reading',reading:document.body.classList.contains('mobile-reading')},location.origin);
 },{passive:true});
}
let topButton, topFrameWindow, topPending=false;
function refreshToTop(){
 if(topPending)return;topPending=true;
 requestAnimationFrame(()=>{
  topPending=false;if(!topButton)return;
  let target=window;try{if(shell)target=q('#fr')?.contentWindow||window;}catch(_){}
  let visible=false;
  try{
   const body=target.document.body,scroller=target.document.scrollingElement;
   const blocked=document.body.matches('.mobile-modal,.mobile-keyboard,.mobile-forum-reply,.mobile-catalog-open')||body.matches('.mobile-modal,.mobile-keyboard,.ah-inline-reply-open')||target.document.querySelector('dialog[open],.ModalManager[aria-modal=true],#dlgmask.on');
   visible=!embedded&&!blocked&&scroller.scrollHeight>target.innerHeight+320&&target.scrollY>=320;
   const label=/^en/i.test(target.document.documentElement.lang)?'Back to top':'回到顶部';
   if(topButton.getAttribute('aria-label')!==label){topButton.setAttribute('aria-label',label);topButton.title=label;}
  }catch(_){}
  if(topButton.hidden===visible)topButton.hidden=!visible;
 });
}
function backToTop(){
 const legacy=q('#to-top');if(legacy)legacy.remove();
 topButton=document.createElement('button');topButton.id='to-top';topButton.className='to-top hub-to-top';topButton.type='button';topButton.hidden=true;
 topButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h14M12 21V7m-6 6 6-6 6 6"/></svg>';
 topButton.onclick=()=>{try{const target=shell?q('#fr').contentWindow:window;target.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});const heading=target.document.querySelector('.IndexPage-toolbar h1,.ah-home-heading,main h1,h1');if(heading){if(!heading.hasAttribute('tabindex'))heading.tabIndex=-1;heading.focus({preventScroll:true});}}catch(_){}refreshToTop();};
 document.body.append(topButton);
 const bind=()=>{try{const target=shell?q('#fr').contentWindow:window;if(topFrameWindow)topFrameWindow.removeEventListener('scroll',refreshToTop);topFrameWindow=target;target.addEventListener('scroll',refreshToTop,{passive:true});refreshToTop();}catch(_){}};
 if(shell)q('#fr').addEventListener('load',bind);bind();addEventListener('resize',refreshToTop);
 new MutationObserver(refreshToTop).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','open','aria-modal']});
 document.addEventListener('hub:language',refreshToTop);addEventListener('hub:navigate',refreshToTop);
}
function arrange() {
 document.body.classList.toggle('mobile-shell',shell);document.body.classList.toggle('mobile-embedded',embedded);document.body.classList.toggle('mobile-standalone',!embedded&&!shell);
 document.body.classList.toggle('mobile-forum',forum);document.body.classList.toggle('mobile-enabled',small.matches);
 if(!small.matches&&catalog?.open)closeCatalog();
 arrangeToolbar();if(q('#mobile-build-steps'))selectBuild(currentBuild,false);paint();
}
function start() {
 if(!embedded){makeNav();makeCatalog();makeTrigger();}else if(forum)document.body.classList.add('mobile-forum-embedded');
 if(!shell){searchToolbar();buildSteps();forumTools();pageDialogs();keyboard();scrollTools();
  if(embedded)document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const url=new URL(a.href,location.href),name=url.pathname.replace(/^\/|\/$/g,'');if(url.origin!==location.origin||!paths[name]||url.pathname===location.pathname&&url.hash)return;e.preventDefault();parent.postMessage({type:'agenthub:navigate',tab:name,params:Object.fromEntries(url.searchParams),hash:url.hash},location.origin);});
 }
 else {
  const iframe=q('#fr');let replyObserver;
  iframe.addEventListener('load',()=>{document.body.classList.remove('mobile-forum-reading');replyObserver?.disconnect();try{const body=iframe.contentDocument.body;const update=()=>document.body.classList.toggle('mobile-forum-reply',body.classList.contains('ah-inline-reply-open'));replyObserver=new MutationObserver(update);replyObserver.observe(body,{attributes:true,attributeFilter:['class']});update();}catch(_){}});
  addEventListener('message',e=>{if(e.origin===location.origin&&e.source===iframe.contentWindow&&e.data?.type==='agenthub:mobile-reading')document.body.classList.toggle('mobile-forum-reading',!!e.data.reading);});
  addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==iframe.contentWindow||e.data?.type!=='agenthub:mobile-state')return;document.body.classList.toggle('mobile-keyboard',!!e.data.keyboard);document.body.classList.toggle('mobile-modal',!!e.data.modal);document.body.classList.toggle('mobile-forum-reply',!!e.data.reply);});
  visualViewport?.addEventListener('resize',()=>{root.style.setProperty('--mobile-keyboard-inset',document.body.classList.contains('mobile-keyboard')?Math.max(0,innerHeight-visualViewport.height-visualViewport.offsetTop)+'px':'0px');});
 }
 backToTop();small.addEventListener('change',arrange);addEventListener('hub:navigate',()=>{document.body.classList.remove('mobile-keyboard','mobile-modal','mobile-forum-reply');requestAnimationFrame(paint);});addEventListener('hashchange',paint);
 addEventListener('popstate',()=>{if(catalog?.open){modalHistory=false;closeCatalog(false);}closingHistory=false;paint();});
 document.addEventListener('hub:language',paint);new MutationObserver(paint).observe(root,{attributes:true,attributeFilter:['data-theme','lang']});arrange();
}
window.AgentHubMobile={openNavigation:openCatalog,closeNavigation:closeCatalog,bindDismissGesture:dragDismiss,suppressCurrentTap,refreshToTop,handlesHistory:()=>!!catalog?.open||closingHistory};
window.AgentHubMobileBoot=start;
// This is the final script on static pages. DOMContentLoaded waits for all classic definitions.
// The shell keeps index.auth.js as its final startup owner.
if(!shell){const boot=()=>Promise.resolve(window.AgentHubNavigationReady).then(start);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();}
})();