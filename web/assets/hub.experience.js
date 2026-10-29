/* Shared presentation only. Source data, calculation engines and API contracts are unchanged. */
(function(){
'use strict';
const q=s=>document.querySelector(s);
const all=s=>[...document.querySelectorAll(s)];
const text=(zh,en)=>LANG==='en'?en:zh;
const page=q('#fr')?'home':q('#home-board')?'today':q('#guide-main')?'guide':q('#current-body')?'loot':q('#vendor-title')?'vendor':q('#tasks-title')?'tasks':q('#stats-main')?'stats':q('#col-desk')?'build':q('#catlist')?'db':q('#sets-controls')?'sets':q('#la-title')?'admin':q('#steam-summary')?'steam':q('#statline')?'bug':'other';
document.body.dataset.hubPage=page;
function label(el,zh,en){if(!el)return;el.dataset.hubZh=zh;el.dataset.hubEn=en;el.textContent=text(zh,en);}
function fold(el,zh,en){
 if(!el||el.parentElement.classList.contains('hub-fold'))return null;
 const d=document.createElement('details');d.className='hub-fold';const s=document.createElement('summary');label(s,zh,en);el.before(d);d.append(s,el);return d;
}
function prefs(){
 document.documentElement.lang=LANG==='en'?'en':'zh-CN';
 all('[data-hub-zh]').forEach(e=>e.textContent=LANG==='en'?e.dataset.hubEn:e.dataset.hubZh);
 const b=q('#lang');if(b){b.textContent=langLabel();b.title=LANG==='en'?'Switch to Chinese':'切换为英文';b.setAttribute('aria-label',b.title);}
 paintThemeAction();
 if(page==='home'){window.applyShellLanguage();window.syncFramePrefs();window.hubShellLabel();}
 const pairs={h_opt:['一键配装','Build optimizer'],h_optreq:['目标与条件','Goals & constraints']};
 Object.entries(pairs).forEach(([id,t])=>{const el=document.getElementById(id);if(el)el.textContent=text(...t);});
 if(page==='stats'){
  const crumb=q('.eyebrow,.head-kicker,.stats-kicker,.breadcrumb');if(crumb)label(crumb,'特工枢纽 / 战绩查询','Agent Hub / Agent stats');
  q('#agent-input')?.setAttribute('aria-label',text('特工游戏 ID','Agent username'));
  q('#raw-search-input')?.setAttribute('aria-label',text('搜索指标','Search metrics'));
 }
 all('nav[aria-label="主要功能"]').forEach(e=>e.setAttribute('aria-label',text('主要功能','Main navigation')));
 all('.hub-fold').forEach(d=>{const s=d.firstElementChild;if(!s.dataset.hubZh)return;const count=d.querySelectorAll(page==='vendor'?'[aria-pressed="false"]':'[aria-pressed="true"],.chip.on').length;if(d.classList.contains('hub-filter-fold'))s.textContent=text(s.dataset.hubZh,s.dataset.hubEn)+(count?' · '+count:'');});
 if(page==='admin')adminLabels();
}
function shellMenu(){
 const nav=q('.primary-nav');nav.id='shell-route-list';
 const b=document.createElement('button');b.id='shell-menu';b.type='button';b.className='hub-menu-button';b.setAttribute('aria-controls',nav.id);b.setAttribute('aria-expanded','false');nav.before(b);
 window.hubShellLabel=()=>{const title=nav.querySelector('.tab.on .tab-label, .shell-support[aria-current="page"]');b.textContent=(title?title.textContent:'Agent Hub')+' · '+text('菜单','Menu');nav.querySelectorAll('.tab').forEach(e=>e.setAttribute('aria-current',e.classList.contains('on')?'page':'false'));};
 b.onclick=()=>{const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));q('.bar').classList.toggle('hub-open',open);};
 nav.addEventListener('keydown',e=>{if(e.key==='Escape'){q('.bar').classList.remove('hub-open');b.setAttribute('aria-expanded','false');b.focus();}});
 nav.addEventListener('click',()=>window.hubShellLabel());window.hubShellLabel();
}
function filterFold(nodes){
 const list=nodes.filter(Boolean);if(!list.length)return;
 const d=document.createElement('details');d.className='hub-fold hub-filter-fold';const s=document.createElement('summary');label(s,page==='vendor'?'筛选':'更多筛选',page==='vendor'?'Filters':'More filters');list[0].before(d);d.append(s,...list);
 const watch=new MutationObserver(()=>{const n=d.querySelectorAll(page==='vendor'?'[aria-pressed="false"]':'[aria-pressed="true"],.chip.on').length;const val=text(s.dataset.hubZh,s.dataset.hubEn)+(n?' · '+n:'');if(s.textContent!==val)s.textContent=val;});
 list.forEach(el=>watch.observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed']}));
}
function setupBugFilterFold(){
 const bar=q('header .sub'),chips=q('#chips');
 const controls=['status','cat','plat','sort','collapse'].map(id=>document.getElementById(id)).filter(Boolean);
 if(!bar||!chips||!controls.length)return;
 const fold=document.createElement('details');fold.className='hub-fold hub-filter-fold';
 const summary=document.createElement('summary');label(summary,'筛选与排序','Filters & sorting');
 const grid=document.createElement('div');grid.className='hub-bug-filters';
 fold.append(summary,grid);grid.append(...controls,chips);bar.append(fold);
 const refresh=()=>{
  const keys=['status','cat','plat','hard','official','watched','changed','unresolved','hasatt','gone','dup'];
  const n=typeof F==='object'?keys.filter(k=>F[k]).length:0;
  summary.textContent=text('筛选与排序','Filters & sorting')+(n?' · '+n:'');
 };
 grid.addEventListener('change',refresh);
 new MutationObserver(refresh).observe(grid,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-pressed']});
 refresh();
}
function anchorOpen(e){
 const a=e.target.closest('a[href^="#"]');if(!a)return;
 let target;try{target=document.getElementById(decodeURIComponent(a.hash.slice(1)));}catch(_){return;}
 if(!target)return;
 for(let p=target.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
 if(target.tagName==='DETAILS')target.open=true;
}
function sectionFold(selector,zh,en){const e=q(selector);if(e)return fold(e,zh,en);}
function installBuildJump(){
 const nav=document.createElement('nav');nav.className='hub-build-jump';nav.setAttribute('aria-label',text('配装分区','Build sections'));
 [['.loadout-gear','装备','Gear'],['.loadout-weapons','武器','Weapons'],['.build-summary','结果','Results'],['#col-res','条件','Conditions']].forEach(([selector,zh,en],i)=>{const target=q(selector);if(!target)return;target.id=target.id||'hub-build-section-'+i;const a=document.createElement('a');a.href='#'+target.id;label(a,zh,en);nav.append(a);});
 q('main').before(nav);

}
function makeRowsAccessible(){
 if(!['steam','bug'].includes(page))return;
 const list=q('#list');if(!list)return;
 const apply=()=>list.querySelectorAll('.row').forEach(row=>{
  const title=row.querySelector('.ttl');if(!title)return;
  const meta=row.querySelector('.meta'),star=row.querySelector('.star'),detail=row.querySelector('.detail');
  if(meta&&star&&star.parentElement!==meta)meta.append(star);
  if(star)star.setAttribute('aria-label',star.textContent+' · '+title.textContent);
  if(detail){detail.id='hub-detail-'+row.dataset.k;title.setAttribute('aria-controls',detail.id);}

  title.tabIndex=0;title.setAttribute('role','button');title.setAttribute('aria-expanded',String(row.classList.contains('open')));
  if(!title.dataset.hubKeys){title.dataset.hubKeys='1';title.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();title.click();}});}
 });
 const observer=new MutationObserver(apply);observer.observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});apply();
}
function dialogKeys(){
 document.addEventListener('keydown',e=>{
  if(e.key!=='Tab')return;
  const d=all('[role="dialog"][aria-modal="true"]').find(x=>x.getBoundingClientRect().height>0);if(!d)return;
  const focus=[...d.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"],summary')].filter(x=>x.getBoundingClientRect().height>0);
  if(!focus.length)return;const first=focus[0],last=focus[focus.length-1];
  if(e.shiftKey&&(document.activeElement===first||!d.contains(document.activeElement))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(document.activeElement===last||!d.contains(document.activeElement))){e.preventDefault();first.focus();}
 });
}
function adminLabels(){
 const footer=q('#foot');if(footer)footer.textContent=text('恶化掉落录入 · 非官方粉丝站 · 游戏商标与素材版权归 Ubisoft 所有','Loot entry · Unofficial fan site · Game trademarks and assets belong to Ubisoft');
 const h=q('#entry .admin-hint');if(h)h.textContent=text('保存会替换所选日期的整天记录；只填写已确认的掉落。','Saving replaces the selected day. Enter only confirmed loot.');
 all('.sr-only').filter(e=>['操作','Actions'].includes(e.textContent)).forEach(e=>e.textContent=text('操作','Actions'));
 const map={'not set':'未选择','Assault Rifle':'突击步枪','Rifle':'步枪','Submachine Gun':'冲锋枪','Shotgun':'霰弹枪','Marksman Rifle':'射手步枪','Light Machine Gun':'轻机枪','Pistol':'手枪','Mask':'面具','Backpack':'背包','Chest':'胸甲','Gloves':'手套','Holster':'枪套','Kneepads':'护膝','Gear Mod':'装备插件','Skill Mod':'技能插件'};
 all('#la-vendor-weapon option,#la-vendor-gear option').forEach(o=>{const en=o.dataset.hubOriginal||o.textContent;o.dataset.hubOriginal=en;if(map[en])o.textContent=LANG==='zh'?map[en]:en;});
 all('#la-rows tr').forEach(tr=>[...tr.children].forEach((td,i)=>td.dataset.label=text(['恶化副本','目标战利品','类别','操作'][i]||'',['Mission','Targeted loot','Category','Actions'][i]||'')));
}
function adminSafety(){
 let dirty=false;
 const discard=()=>!dirty||confirm(text('放弃尚未保存的修改？','Discard unsaved changes?'));
 const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
 q('#entry').addEventListener('input',e=>{if(!e.target.matches('#la-date,#la-playlist'))dirty=true;});
 q('#entry').addEventListener('change',e=>{
  if(e.target.matches('#la-date,#la-playlist')){
   if(!discard()){e.target.value=e.target.id==='la-date'?LA_STATE.date:LA_STATE.playlist;stop(e);return;}
   if(e.target.id==='la-playlist')dirty=true;
  }else dirty=true;
 },true);
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 document.addEventListener('click',e=>{
  if(e.target.closest('#la-clear,#la-load,#la-today,[data-la-load]')){
   if(!discard()){stop(e);return;}
   if(e.target.closest('#la-clear'))dirty=true;
  }
  if(e.target.closest('#la-add-row,[data-la-del]'))dirty=true;
 },true);
 q('#la-save')?.addEventListener('click',e=>{if(typeof LA_STATE!=='undefined'&&LA_STATE.entry?.found&&!confirm(text('覆盖这个日期已有的整天记录？','Replace the existing records for this entire day?')))stop(e);},true);
 document.addEventListener('hub:entry-saved',()=>dirty=false);
 document.addEventListener('hub:entry-loaded',()=>dirty=false);
 new MutationObserver(adminLabels).observe(q('#la-rows'),{childList:true});
}

async function installLocalLootEntry(){
 // The server protects the editor and writes; this link only makes login discoverable.
 if(['agenthub.fans','www.agenthub.fans'].includes(location.hostname)){
  const actions=q('.loot-head .hd .actions');
  if(actions&&!q('.hub-loot-entry')){const a=document.createElement('a');a.className='hub-loot-entry';a.href='/admin/loot';a.textContent=text('管理员录入','Admin entry');a.dataset.zh='管理员录入';a.dataset.en='Admin entry';actions.prepend(a);}
  return;
 }
 if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname)||document.querySelector('script[src*="/assets/public.js"]'))return;
 try{
  const health=await fetchJSON('/api/health',{timeoutMs:4000});
  if(!health||health.public===true)return;
  const data=await fetchJSON('/api/loot/state',{timeoutMs:4000});
  if(!data||data.ok!==true||!data.options||!Array.isArray(data.days))return;
  const a=document.createElement('a');a.className='hub-loot-entry';a.href='/loot-admin';
  label(a,'录入恶化掉落','Enter loot');q('.loot-head .actions')?.prepend(a);
 }catch(_){}
}
function start(){
 if(page==='home')shellMenu();
 if(page==='loot'){
  installLocalLootEntry();
  ['frequency','history','timeline','vendor'].forEach((id,i)=>sectionFold('#'+id,['出现频率','历史记录','轮换周期','征用补给历史'][i],['Frequency','History','Rotation archive','Requisition history'][i]));
  sectionFold('#metrics','档案统计','Archive summary');
 }
 // Vendor filters remain visible; region inventory has only two levels.
 if(page==='tasks'){
  sectionFold('#metrics','赛季概览','Season summary');
  /* ⚠️ 必须点名 `#manhunt` 下的那块：tasks 页顶部（赛季活动）现在也有 `.board-block`
     （活动排期/活动说明），裸 `.board-block` 会抓到第一个 ⇒ 把甘特图折进"全季一览"里
     （2026-09-20 踩过：甘特图整块消失，猎捕自己的全季一览反而没折叠）。 */
  sectionFold('#manhunt .board-block','全季一览','Season overview');
  sectionFold('.climax','最终任务 · 含剧透','Final mission · Spoilers');
  const b=document.createElement('button');b.type='button';b.className='hub-current-week';label(b,'返回本周','This week');b.onclick=()=>{window.mhSelectWeek(window.tasksCurrentWeek()||window.tasksWeeks()[0]?.no);q('#week-panel').scrollIntoView({block:'start'});};q('#week-nav').before(b);
 }
 if(page==='build')installBuildJump();
 if(page==='stats'){
  sectionFold('#sec-raw','全部指标','All metrics');
  sectionFold('#sec-missions','副本与战区','Missions & expeditions');
 }
 if(page==='bug')setupBugFilterFold();
 if(page==='steam')filterFold([q('#chips')]);
 if(page==='admin'){
  ['status','sync','days'].forEach((id,i)=>sectionFold('#'+id,['记录概览','第三方同步（高级）','最近记录'][i],['Record overview','Third-party sync (advanced)','Recent records'][i]));
  adminSafety();
 }
 makeRowsAccessible();dialogKeys();
 document.addEventListener('click',anchorOpen);
 document.addEventListener('hub:language',prefs);
 prefs();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

window.addEventListener("DOMContentLoaded",()=>{document.body.classList.toggle("hub-embedded",window.parent!==window);window.addEventListener("scroll",()=>{if(window.scrollY>200)document.body.classList.add("hub-scrolled");else if(window.scrollY<32)document.body.classList.remove("hub-scrolled");},{passive:true});});

/* Shared page tabs, disclosure menus and reading navigation. Native form inputs
   retain their keyboard, selection and change-event behavior. */
(function(){
'use strict';
const tabs='.subnav,.se-subnav,.hub-subnavigation';
const menus='#build-quick details,#db-filter-panel,.hub-filter-fold,.v-filters-more';
const wide=matchMedia(document.body.dataset.hubPage==='loot'?'(min-width:1000px)':'(min-width:1200px)');
const label=()=>LANG==='en'?'On this page':'本页目录';
let scheduled=false,scrollPending=false;
function closeMenus(except,focus){
 document.querySelectorAll(menus).forEach(d=>{if(d!==except&&d.open){d.open=false;if(focus)d.querySelector('summary')?.focus();}});
}
function placeMenu(details){
 const panel=details.querySelector(':scope > #filters,:scope > div');
 const trigger=details.querySelector(':scope > summary');
 if(!details.open||!panel||!trigger||getComputedStyle(panel).position!=='absolute')return;
 for(const key of ['left','right','width','maxWidth','minWidth'])panel.style[key]='';
 const bounds=trigger.getBoundingClientRect(),parent=panel.offsetParent.getBoundingClientRect();
 const width=Math.min(panel.getBoundingClientRect().width,innerWidth-32);
 const left=Math.max(16,Math.min(bounds.left,innerWidth-width-16));
 Object.assign(panel.style,{left:(left-parent.left)+'px',right:'auto',width:width+'px',maxWidth:(innerWidth-32)+'px',minWidth:'0'});
}
function reader(nav,host,inside=false){
 if(!nav||!host||nav.closest('.hub-reader')||nav.querySelectorAll('a[href^="#"]').length<3)return;
 const layout=document.createElement('div');layout.className='hub-reading-layout';
 const aside=document.createElement('aside');aside.className='hub-reader';
 const details=document.createElement('details');details.open=wide.matches;
 const summary=document.createElement('summary');summary.textContent=label();
 const title=document.createElement('p');title.className='hub-reader-label';title.textContent=label();
 details.append(summary,title,nav);aside.append(details);
 if(inside){
  const content=document.createElement('div');content.className='hub-reading-content';
  content.append(...host.childNodes);layout.append(aside,content);host.append(layout);
 }else{
  host.before(layout);host.classList.add('hub-reading-content');layout.append(aside,host);
 }
 nav.setAttribute('aria-label',label());
}
function refresh(){
 scheduled=false;
 document.querySelectorAll(tabs).forEach(nav=>{
  const active=nav.querySelector('.on,[aria-current="page"]');
  if(active&&nav.dataset.active!==active.getAttribute('href')){
   nav.dataset.active=active.getAttribute('href');
   if(nav.scrollWidth>nav.clientWidth)nav.scrollLeft=Math.max(0,active.offsetLeft-nav.offsetLeft-20);
  }
 });
 document.querySelectorAll(menus).forEach(d=>d.classList.add('hub-menu-panel'));
 const proto=document.querySelector('.proto-page:not(.proto-unavailable)');
 if(proto)reader(proto.querySelector('.proto-title nav'),proto,true);
 if(document.querySelector('.loot-head'))reader(document.querySelector('.loot-head .section-nav'),document.querySelector('main'));
 const isac=document.querySelector('#isac-body');
 if(isac){
  const rows=[...isac.querySelectorAll('.se-grp')];
  if(rows.length>=3){
   let nav=document.getElementById('hub-isac-contents');
   if(!nav){nav=document.createElement('nav');nav.id='hub-isac-contents';document.querySelector('main').prepend(nav);}
   const titles=rows.map((r,i)=>{r.id='isac-section-'+i;return r.querySelector('.se-gname')?.textContent||'';});
   const signature=JSON.stringify(titles);
   if(nav.dataset.signature!==signature){nav.replaceChildren(...titles.map((name,i)=>{const a=document.createElement('a');a.href='#isac-section-'+i;a.textContent=name;return a;}));nav.dataset.signature=signature;}
   reader(nav,document.querySelector('main'));
  }
 }
 const stats=document.querySelector('.stats-jump:not([hidden])');
 if(stats)reader(stats,document.querySelector('main'));
 document.querySelectorAll('.hub-reader').forEach(rail=>{
  for(const el of rail.querySelectorAll('summary,.hub-reader-label'))if(el.textContent!==label())el.textContent=label();rail.querySelector('nav').setAttribute('aria-label',label());
 });
 scrollUpdate();
}
function schedule(){if(!scheduled){scheduled=true;setTimeout(refresh,90);}}
function scrollUpdate(){
 if(scrollPending)return;scrollPending=true;
 requestAnimationFrame(()=>{
  scrollPending=false;
  let offset=document.getElementById('hub-navigation')?.offsetHeight||0;
  document.documentElement.style.setProperty('--hub-navigation-height',offset+'px');
  const header=document.querySelector('body[data-hub-page=db]>header,body[data-hub-page=loot]>.loot-head');
  if(header&&getComputedStyle(header).position==='sticky')offset+=header.offsetHeight;
  document.documentElement.style.setProperty('--hub-reading-top',offset+'px');
  document.querySelectorAll('.hub-reader nav').forEach(nav=>{
   const entries=[...nav.querySelectorAll('a[href^="#"]')].map(a=>({a,target:document.getElementById(decodeURIComponent(a.hash.slice(1)))})).filter(x=>x.target&&!x.target.hidden);
   let current=entries[0];
   for(const item of entries){const target=item.target.closest('details:not([open])')||item.target;if(target.getBoundingClientRect().top<=offset+130)current=item;}
   entries.forEach(item=>{const active=item===current;item.a.classList.toggle('on',active);if(active)item.a.setAttribute('aria-current','location');else item.a.removeAttribute('aria-current');});
  });
 });
}
function start(){
 refresh();
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('hub:language',schedule);
 window.addEventListener('scroll',scrollUpdate,{passive:true});window.addEventListener('resize',schedule,{passive:true});
 wide.addEventListener('change',()=>document.querySelectorAll('.hub-reader details').forEach(d=>d.open=wide.matches));
 document.addEventListener('toggle',e=>{if(e.target.matches(menus)&&e.target.open){closeMenus(e.target,false);placeMenu(e.target);}},true);
 window.addEventListener('resize',()=>document.querySelectorAll(menus).forEach(placeMenu),{passive:true});
 document.addEventListener('pointerdown',e=>{if(!e.target.closest(menus))closeMenus(null,false);});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeMenus(null,true);const d=e.target.closest('.hub-reader details');if(d&&!wide.matches){d.open=false;d.querySelector('summary').focus();}return;}
  const nav=e.target.closest(tabs);if(!nav||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  const links=[...nav.querySelectorAll('a')],i=links.indexOf(e.target);if(i<0)return;
  e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?links.length-1:(i+(e.key==='ArrowRight'?1:-1)+links.length)%links.length;
  links[next].focus();links[next].scrollIntoView({block:'nearest',inline:'nearest'});
 });
 document.addEventListener('click',e=>{
  const a=e.target.closest('.hub-reader a[href^="#"]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  const target=document.getElementById(decodeURIComponent(a.hash.slice(1)));if(!target)return;
  e.preventDefault();for(let p=target;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
  if(!wide.matches)a.closest('details').open=false;
  history.replaceState(history.state,'',a.hash);
  requestAnimationFrame(()=>{target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});scrollUpdate();});
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
