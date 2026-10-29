/* Layout and editing from Pen mLXAp / qSebX. Existing data and engine stay authoritative. */
let buildEditorDraft=null;
function buildToolIcon(kind){
 const paths={folder:'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2M3 7h18l-3 10H3Z',share:'M8 12l8-5M8 12l8 5M7 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm13-6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm0 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',save:'M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7',more:'M5 12h.01M12 12h.01M19 12h.01',close:'m6 6 12 12M18 6 6 18'};
 return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="'+paths[kind]+'" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function buildToolLabel(el,kind,label){
 if(!el)return;el.innerHTML=buildToolIcon(kind)+'<span class="build-tool-text">'+esc(label)+'</span>';el.setAttribute('aria-label',label);el.title=label;
}
function buildLayoutPaint(){
 if(!document.getElementById('build-toolbar'))return;
 const mobile=matchMedia('(max-width:760px)').matches,spec=BP_SPEC_LIST.find(s=>s.id===state.bp.spec)||BP_SPEC_LIST[0];
 document.getElementById('hdrt').textContent=mobile?(typeof buildAccountCurrent!=='undefined'&&buildAccountCurrent?.name||L('未命名配装','Untitled build')):L('装配','Loadout');
 buildToolLabel(document.getElementById('build-records'),'folder',L('我的配装','My builds'));buildToolLabel(document.querySelector('#build-share-menu>summary'),'share',L('分享','Share'));buildToolLabel(document.getElementById('build-save'),'save',L('保存配装','Save build'));buildToolLabel(document.querySelector('#build-more-menu>summary'),'more',L('更多配装操作','More build actions'));
 const mode=document.getElementById('build-mode'),proto=document.getElementById('build-prototype');mode.value=state.bp.pvp?'pvp':'pve';proto.value=state.bp.prototype?'1':'0';proto.closest('label').classList.toggle('on',!!state.bp.prototype);
 proto.options[0].textContent=L('关闭','Off');proto.options[1].textContent=L('开启','On');
 for(const [id,zh,en] of [['build-mode-label','模式','Mode'],['build-prototype-label','原型','Prototype'],['build-specialization-label','专长','Specialization'],['build-condition-label','战斗条件','Combat conditions'],['build-condition-value','查看条件','View conditions']])document.getElementById(id).textContent=L(zh,en);
 document.getElementById('build-specialization-value').textContent=L(spec.zh,spec.en);document.querySelector('#build-conditions-dialog h2').textContent=L('战斗条件','Combat conditions');document.querySelector('#build-conditions-dialog [data-build-close]').setAttribute('aria-label',L('关闭','Close'));
 buildGearEditorPaint();
}
function buildGearSummaryBlock(i,it){
 const temp=document.createElement('template');temp.innerHTML=gearAffixBlock(i,it);
 /* 卡片摘要是把 `gearAffixBlock` 的成品行拆字段重排的 ⇒ 判据不在这里重算，只把抽屉那条「不计入」的
    状态原样带过来（class + title）。不带上就会出现同一词条两处口径不一致：抽屉明说没算，卡片还像算了。 */
 return '<div class="build-gear-summary">'+[...temp.content.querySelectorAll('.axrow:not(.prototype-augment)')].map(row=>{const un=row.classList.contains('uncounted'),tt=row.getAttribute('title')||'';return '<div class="build-gear-attr'+(un?' uncounted':'')+'"'+(un?' title="'+esc(tt)+'"':'')+' data-fam="'+esc(row.dataset.fam||'')+'">'+(row.querySelector('.axic')?.outerHTML||'')+'<span>'+esc((row.querySelector('.axchoice')||row.querySelector('.axk'))?.textContent||'')+'</span><b>'+esc(row.querySelector('.axvalue')?.textContent||'')+'</b></div>';}).join('')+'</div>';
}
function buildGearPrototypeSummary(i){
 const temp=document.createElement('template');temp.innerHTML=prototypeAugmentHtml(i);const root=temp.content.querySelector('.prototype-augment');if(!root)return '';
 const name=root.querySelector('select[data-act=gaugment]')?.selectedOptions[0]?.textContent||root.querySelector('.axchoice')?.textContent||'',level=root.querySelector('.prototype-level-select')?.value;
 return '<button type="button" class="build-gear-prototype" data-act="gear-edit" data-i="'+i+'">'+(root.querySelector('.tic,.axic')?.outerHTML||'')+'<span>'+esc(name)+'</span>'+(level?'<small>Lv.'+esc(level)+'</small>':'')+'</button>';
}
function buildGearEditorSeed(i){return {slot:i,item:state.slots[i],core:state.core[i],affix:arr(state.affix[i]).slice(),gtal:state.gtal[i],augment:structuredClone(state.bp.augments?.[i]||{})};}
/* 草稿 vs state 的**未应用改动数**（脏检测判据，2026-10-15）：按 `buildGearEditorSeed` 的草稿域逐字段比 ——
   `augment` 是 {key,level} 对象（level 一律按抽屉写入路径归一到 1–10 整数再比，避免 "3" vs 3 误报），
   `affix` 是数组（空槽 null 与缺项同义，逐格比、按最长取）。整份 stringify 比会因键序/空值表示产生误报，禁用。
   返回 0 = 干净。 */
function buildGearDraftDiff(){
 const d=buildEditorDraft;if(!d||d.item!==state.slots[d.slot])return 0;
 let n=0;
 if((d.core??null)!==(state.core[d.slot]??null))n++;
 const da=arr(d.affix),sb=arr(state.affix[d.slot]);
 for(let k=0;k<Math.max(da.length,sb.length);k++)if((da[k]??null)!==(sb[k]??null))n++;
 if((d.gtal??null)!==(state.gtal[d.slot]??null))n++;
 const aug=a=>{const key=a&&a.key||null;return key?{key,level:Math.max(1,Math.min(10,+a.level||10))}:null;};
 const xa=aug(d.augment),xb=aug(state.bp.augments&&state.bp.augments[d.slot]);
 if((xa?xa.key:'')!==(xb?xb.key:'')||(xa?xa.level:0)!==(xb?xb.level:0))n++;
 return n;
}
/* 脏提示 = dialog 里的常驻 live region（不写进 `host.innerHTML`，否则每次重绘都重建节点，读屏读不到）。
   每次重绘回到短文案「有 N 处未应用改动」；`buildGearEditorNudge`（Esc／点遮罩拦下时）换成带出路的长文案。 */
function buildGearDirtyNote(){
 const note=document.getElementById('build-editor-dirty');if(!note)return;
 const n=buildGearDraftDiff();
 note.classList.remove('warn');
 note.hidden=!n;
 note.textContent=n?L('有 '+n+' 处未应用改动',n+(n===1?' unapplied change':' unapplied changes')):'';
 const apply=document.querySelector('#build-item-editor [data-build-edit-apply]');
 if(apply){apply.classList.toggle('pending',!!n);if(n)apply.setAttribute('aria-describedby','build-editor-dirty');else apply.removeAttribute('aria-describedby');}
}
function buildGearEditorNudge(){
 const n=buildGearDraftDiff(),note=document.getElementById('build-editor-dirty');
 if(!note||!n)return;
 note.hidden=false;
 note.textContent=L('有 '+n+' 处未应用改动 —— 已暂时保留：点「应用」提交，点「取消」才会丢弃',n+' unapplied change(s) kept for now — Apply commits them, Cancel discards');
 note.classList.remove('warn');void note.offsetWidth;note.classList.add('warn');
 document.querySelector('#build-item-editor [data-build-edit-apply]')?.focus({preventScroll:true});
}
function buildGearDraftView(fn){
 const d=buildEditorDraft,i=d.slot,core=state.core[i],affix=state.affix[i],gtal=state.gtal[i],augments=state.bp.augments;
 try{state.core[i]=d.core;state.affix[i]=d.affix;state.gtal[i]=d.gtal;state.bp.augments=arr(augments).slice();state.bp.augments[i]=d.augment;return fn();}
 finally{state.core[i]=core;state.affix[i]=affix;state.gtal[i]=gtal;state.bp.augments=augments;}
}
/* 抽屉里的装备天赋：候选 = `gtalPool(i).keys`（与卡片上那颗天赋按钮同一判据，不另造一套）。
   具名/奇特的天赋是件自带 ⇒ `pool.locked`，这里给一条禁用项如实显示，不做成"能点但没反应"。 */
function buildGearTalentSection(i){
 const pool=gtalPool(i),keys=arr(pool.keys),cur=gtalKeyOf(i);
 const opts=[...new Set(keys.concat(cur?[cur]:[]))];
 if(!opts.length)return '';
 const sel='<select class="build-editor-gtal" data-act="gtalpick" aria-label="'+esc(L('更换装备天赋','Change gear talent'))+'"'+(pool.locked?' disabled':'')+'>'
   +(pool.locked?'':'<option value="">'+esc(L('不装天赋','No talent'))+'</option>')
   +opts.map(k=>{const t=TALENT_BY_KEY[k];return '<option value="'+esc(k)+'"'+(k===cur?' selected':'')+'>'+esc(t?nmTxt(t):k)+'</option>';}).join('')+'</select>';
 /* 描述必须走 `talentDescHtml`（`build.app.js` 的 html 出口）而不是 `esc(talentDescText(...))`：
    官方 desc 里内嵌 `<img src="…ui_player_utility.dds">` 这类核心属性标记，`talentDescHtml` 会把它还原成
    `.axic` 行内真图标（`talentDescPlain` 才出 `[攻击]/[防御]/[效能]` 文字，用于 title/aria）；
    直接 `esc()` 则把整条 `.dds` 路径原样印到抽屉里。 */
 const t=cur?TALENT_BY_KEY[cur]:null,desc=t?talentDescHtml(t,!!state.bp.pvp):'';
 return '<section class="build-editor-talent"><h3>'+(t?talIcon(t,'tic'):'')+'<span>'+esc(L('装备天赋','Gear talent'))+'</span></h3>'+sel+(desc?'<p>'+desc+'</p>':'')+'</section>';
}
function buildGearEditorPaint(){
 const host=document.getElementById('build-item-editor');if(!host)return;
 if(!buildEditorDraft){const first=state.slots.findIndex((v,i)=>v!=null&&gearOf(i));if(first>=0)buildEditorDraft=buildGearEditorSeed(first);}
 if(!buildEditorDraft||!gearOf(buildEditorDraft.slot)){buildEditorDraft=null;host.innerHTML='<div class="build-editor-empty"><h2>'+esc(L('装备属性','Gear attributes'))+'</h2><p>'+esc(L('选择装备后，在这里调整属性。','Choose gear to adjust its attributes here.'))+'</p></div>';buildGearDirtyNote();return;}
 const i=buildEditorDraft.slot,it=gearOf(i);if(buildEditorDraft.item!==state.slots[i])buildEditorDraft=buildGearEditorSeed(i);
 const active=document.activeElement,focus=host.contains(active)&&active.dataset.act?{act:active.dataset.act,k:active.dataset.k}:null;
 const temp=document.createElement('template');temp.innerHTML=buildGearDraftView(()=>gearAffixBlock(i,it));let index=0;
 const fields=[...temp.content.querySelectorAll('.axrow')].map(row=>{const core=row.classList.contains('core'),proto=row.classList.contains('prototype-augment');const label=proto?L('原型','Prototype'):core?L('核心属性','Core attribute'):L('属性 '+(++index),'Attribute '+index);row.classList.add('build-editor-input');return '<div class="build-editor-field"><span>'+esc(label)+'</span>'+row.outerHTML+'</div>';}).join('');
 const card=document.querySelector('#ggrid .gcard[data-i="'+i+'"]'),mod=card?.querySelector('.gc-ft .modblk');
 /* 天赋段必须在草稿作用域里渲染（与上面 `gearAffixBlock` 同一通路）：`gtalKeyOf` 读的是 `state.gtal`，
    不入草稿域则选完回弹旧值。提交时机不变 —— 仍只有「应用」（`buildCloseGearEditor(true)`）写 state。 */
 const talentHtml=buildGearDraftView(()=>buildGearTalentSection(i));
 host.innerHTML='<header class="build-editor-head"><h2>'+iconImg(SLOT_ICON[i],'gc-slot-icon')+'<span>'+esc(nmTxt(it))+'</span></h2><p class="build-editor-kind">'+esc(L(G_KIND_ZH[it.kind]||'装备',G_KIND_EN[it.kind]||'Gear'))+' · '+esc(L(...G_SLOTS[i]))+'</p><button type="button" class="build-editor-change" data-act="gcard" data-i="'+i+'">'+esc(L('更换装备','Change gear'))+'</button></header><section class="build-editor-fields"><h3>'+esc(L('属性','Attributes'))+'</h3>'+fields+'</section>'+(mod?'<section class="build-editor-mod"><h3>'+esc(L('插件','Gear mod'))+'</h3>'+mod.outerHTML+'</section>':'')+talentHtml+'<footer class="build-editor-actions"><button type="button" data-build-edit-cancel>'+esc(L('取消','Cancel'))+'</button><button type="button" data-build-edit-apply>'+esc(L('应用','Apply'))+'</button></footer>';
 document.querySelectorAll('#ggrid .gcard').forEach(c=>c.classList.toggle('editing',+c.dataset.i===i));
 if(focus)host.querySelector('[data-act="'+focus.act+'"]'+(focus.k!=null?'[data-k="'+focus.k+'"]':''))?.focus({preventScroll:true});
 buildGearDirtyNote();
}
function buildOpenGearEditor(i){
 if(!gearOf(i)){openDlg('g',i);renderAll();return;}
 buildEditorDraft=buildGearEditorSeed(i);
 /* 词条编辑一律走抽屉（用户 2026-10-14：右侧不再常驻选择词条面板，点词条行弹出，一层直达）。
    `#build-item-editor` 本来就常驻在 `#build-item-dialog` 里，这里只是打开它；
    旧的 `max-width:1100px` 分支让 PC 与手机两套行为，现在两端同一条通路。 */
 const d=document.getElementById('build-item-dialog');
 buildGearEditorPaint();
 if(!d.open)d.showModal();
 d.querySelector('[data-build-edit-cancel]')?.focus({preventScroll:true});
}
function buildCloseGearEditor(apply){
 const d=buildEditorDraft;if(apply&&d&&d.item===state.slots[d.slot]){state.core[d.slot]=d.core;state.affix[d.slot]=d.affix.slice();state.gtal[d.slot]=d.gtal;state.bp.augments=arr(state.bp.augments).slice();state.bp.augments[d.slot]=structuredClone(d.augment);}
 if(d)buildEditorDraft=gearOf(d.slot)?buildGearEditorSeed(d.slot):null;if(apply)renderAll();else buildGearEditorPaint();document.getElementById('build-item-dialog')?.close();document.querySelector('#ggrid .gcard[data-i="'+d?.slot+'"]')?.focus({preventScroll:true});
}
function initBuildMobileFlow(){buildLayoutPaint();}
function initBuildLayout(){
 if(document.getElementById('build-toolbar'))return;
 const main=document.querySelector('main'),desk=document.getElementById('col-desk'),res=document.getElementById('col-res');
 ['.loadout-weapons','.loadout-gear','.loadout-skills','.build-summary','#fold_analysis','#fold_tw'].forEach((sel,i)=>{const e=desk.querySelector(sel);if(e){desk.append(e);e.style.order=String(i+1);}});
 const toolbar=document.querySelector('body>header');toolbar.id='build-toolbar';main.prepend(toolbar);const actions=toolbar.querySelector('.actions'),more=document.createElement('details');more.id='build-more-menu';more.className='build-share-menu';more.innerHTML='<summary class="mini"></summary><div></div>';
 const fileControls=['exp','imp','impf','reset'].map(id=>document.getElementById(id));fileControls.forEach(el=>more.lastElementChild.append(el));actions.prepend(document.getElementById('build-records'),document.getElementById('build-share-menu'),document.getElementById('build-save'));actions.append(more);
 const narrow=matchMedia('(max-width:760px)'),arrangeFiles=()=>{const target=narrow.matches?document.querySelector('#build-share-menu>div'):more.lastElementChild;fileControls.forEach(el=>target.append(el));};arrangeFiles();narrow.addEventListener('change',arrangeFiles);
 const quick=document.createElement('section');quick.id='build-quick';quick.innerHTML='<label class="build-quick-control"><span id="build-mode-label"></span><select id="build-mode" aria-labelledby="build-mode-label"><option value="pve">PvE</option><option value="pvp">PvP</option></select></label><label class="build-quick-control"><span id="build-prototype-label"></span><select id="build-prototype" aria-labelledby="build-prototype-label"><option value="0"></option><option value="1"></option></select></label><details id="build-spec-menu" class="build-quick-control"><summary><span id="build-specialization-label"></span><b id="build-specialization-value"></b></summary><div class="build-spec-popover"></div></details><button type="button" id="build-condition-open" class="build-quick-control"><span id="build-condition-label"></span><b id="build-condition-value"></b></button>';
 toolbar.after(quick);buildSpecInit();quick.querySelector('.build-spec-popover').append(document.getElementById('build-spec-direct'));
 const editor=document.createElement('aside');editor.id='build-item-editor';editor.setAttribute('aria-label',L('当前装备编辑','Current gear editor'));
 const itemDialog=document.createElement('dialog');itemDialog.id='build-item-dialog';itemDialog.setAttribute('aria-label',L('装备属性','Gear attributes'));
 /* 脏提示 live region：常驻在 dialog 里、editor 之外（`buildGearEditorPaint` 整段重写 editor.innerHTML，
    每次重建的节点读屏不会播报）。role=status ⇒  polite 播报，不抢焦点。 */
 const dirtyNote=document.createElement('p');dirtyNote.id='build-editor-dirty';dirtyNote.className='build-editor-dirty';dirtyNote.setAttribute('role','status');dirtyNote.hidden=true;
 itemDialog.append(dirtyNote,editor);document.body.append(itemDialog);
 itemDialog.addEventListener('close',()=>{buildEditorDraft=buildEditorDraft&&gearOf(buildEditorDraft.slot)?buildGearEditorSeed(buildEditorDraft.slot):null;document.querySelector('#ggrid .gcard[data-i="'+buildEditorDraft?.slot+'"]')?.focus({preventScroll:true});});
 /* 草稿制抽屉的离开路径（2026-10-15）：脏时 Esc 与点遮罩一律按「暂时离开」处理 —— 保持抽屉开着并提示，
    绝不静默丢草稿；只有「取消」按钮（`buildCloseGearEditor(false)`）才是明确丢弃。干净时维持原行为：直接关。
    ⚠️ Esc 的拦截走**两条通路**：2026-10-15 Chrome 155 真机实测，按 Escape 时 dialog 的 `cancel` 事件是
    **不可取消的（cancelable=false）**，只监听 cancel 拦不住关闭；可靠的默认动作否决在 keydown 那一下
    （见下方 document keydown 守卫），cancel 守卫保留给「cancel 可取消」的浏览器，两道都先判脏、不重复提示。
    遮罩判定沿用上面 :118 的几何守卫：dialog 本体 `overflow:auto`，落在自身 padding 里的点击不是外点。 */
 itemDialog.addEventListener('cancel',e=>{if(e.cancelable&&buildGearDraftDiff()){e.preventDefault();buildGearEditorNudge();}});
 itemDialog.addEventListener('click',e=>{if(e.target!==itemDialog)return;const r=itemDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){if(buildGearDraftDiff())buildGearEditorNudge();else itemDialog.close();}});
 /* 右侧栏 = 配装结果 + 一键配装（Pen `ZrW9H`／`PA35I` 的紧凑结果侧栏）。
    原来「一键配装」整块藏在 `main>#col-res{display:none}` 之后，只能从「查看条件」弹窗里进去，
    关掉弹窗连结果都看不见 ⇒ 用户报的「应用不了」。现在它在页面上直接可见。
    ⚠️ 只搬 DOM，不改任何 id：`hub.experience.js` 的跳转导航与 `mobile.js` 的配装步骤都按这些选择器找元素。 */
 const rail=document.createElement('aside');rail.id='build-rail';rail.setAttribute('aria-label',L('配装结果与一键配装','Build results and auto build'));main.append(rail);rail.append(res);
 const summary=desk.querySelector('.build-summary'),analysis=desk.querySelector('#fold_analysis'),foldCond=document.getElementById('fold_cond'),narrowDesk=matchMedia('(max-width:1100px)');
 const dialog=document.createElement('dialog');dialog.id='build-conditions-dialog';dialog.setAttribute('aria-label',L('战斗条件','Combat conditions'));dialog.innerHTML='<header><h2></h2><button type="button" data-build-close>'+buildToolIcon('close')+'</button></header>';document.body.append(dialog);
 /* 宽屏：结果卡进右栏（第一块），「战斗条件」整块交给弹窗（页面上不再占那一长条折叠区，
    顶部「查看条件」那颗就是它唯一的入口，一层直达）。
    窄屏／手机：两块都搬回主列流里，配装步骤流（`mobile.js`）按原样分组。
    ⚠️ 搬进右栏必须清掉第 68 行给主列写的内联 `order`，否则 `#col-res`（order 0）会排到结果卡（order 4）前面。 */
 const placeSecondary=()=>{
  if(narrowDesk.matches){summary.style.order='4';analysis?desk.insertBefore(summary,analysis):desk.append(summary);res.prepend(foldCond);foldCond.open=true;}
  else{summary.style.order='';rail.prepend(summary);dialog.append(foldCond);foldCond.open=true;}
 };
 /* 「查看条件」只开弹窗：「战斗条件」那块已经常驻在弹窗里，不再跟着「一键配装」一起躲进二级弹窗。 */
 document.getElementById('build-condition-open').onclick=()=>{dialog.showModal();dialog.querySelector('[data-build-close]').focus({preventScroll:true});};dialog.querySelector('[data-build-close]').onclick=()=>dialog.close();
 /* 点外面也要能关（站长：只能点 ✕，而 ✕ 又会滚走）。原生 `<dialog>` 的 `::backdrop` 在
    Chrome/Safari 系会把点击派发到 dialog 本体、Firefox 不派发 ⇒ 用 `pass.app.js:59-63` 那套
    **几何守卫**（target 是 dialog 且坐标落在 rect 外才关），别只判 `target===dialog`：
    本弹窗自己是 `overflow:auto`，落在自身 padding 里的点击 target 也是 dialog，那种不能关。
    这块是纯查看、无草稿，外点=关闭不会丢任何数据。 */
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
 placeSecondary();narrowDesk.addEventListener('change',placeSecondary);
 quick.addEventListener('change',e=>{const target=e.target.id==='build-mode'?document.getElementById('bp_pvp'):e.target.id==='build-prototype'?document.getElementById('bp_proto'):null;if(target){target.checked=e.target.value===(e.target.id==='build-mode'?'pvp':'1');target.dispatchEvent(new Event('change',{bubbles:true}));buildLayoutPaint();}});
 document.addEventListener('change',e=>{if(!editor.contains(e.target)||!buildEditorDraft)return;const el=e.target,d=buildEditorDraft,it=gearOf(d.slot),act=el.dataset.act;if(!['gcore','gaffix','gaugment','gaugmentlevel','gtalpick'].includes(act))return;e.stopImmediatePropagation();
  if(act==='gcore'&&arr(coreChoices(it)).includes(el.value))d.core=el.value;if(act==='gtalpick'){const p=gtalPool(d.slot);if(!el.value&&!p.locked)d.gtal=null;else if(arr(p.keys).includes(el.value)||el.value===gtalPtr(it))d.gtal=el.value;}if(act==='gaffix'){const k=+el.dataset.k,c=el.value;if(!c||d.affix[k]===c||!d.affix.includes(c))d.affix[k]=c||null;}if(act==='gaugment')d.augment={key:el.value,level:+d.augment.level||10};if(act==='gaugmentlevel')d.augment={key:d.augment.key,level:+el.value};buildGearEditorPaint();},true);
 document.addEventListener('click',e=>{const apply=e.target.closest('[data-build-edit-apply]'),cancel=e.target.closest('[data-build-edit-cancel]');if(apply||cancel){e.preventDefault();buildCloseGearEditor(!!apply);}if(e.target.closest('#build-spec-menu [data-act=bpspec]')||!e.target.closest('#build-spec-menu'))document.getElementById('build-spec-menu').open=false;if(e.target.closest('#build-more-menu button'))document.getElementById('build-more-menu').open=false;});
 /* Esc 的抽屉分支（2026-10-15 重写）：旧条件 `!document.querySelector('dialog[open]')&&editor.contains(e.target)`
    永假不可达 —— 编辑器本体就常驻在开着的 `#build-item-dialog` 里，`dialog[open]` 恒存在，已删。
    现在这里就是抽屉 Esc 的**主拦截点**：脏时否决 keydown 默认动作（Chrome 155 实测 cancel 不可取消，
    拦截必须做在这一下），保持抽屉并提示；干净时不拦，交给原生关闭。cancel 事件上另有一道
    可取消浏览器的兜底守卫（见上方 `itemDialog` 监听），两道共用同一判据 `buildGearDraftDiff`。 */
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const spec=document.getElementById('build-spec-menu');if(spec.open){spec.open=false;spec.querySelector('summary').focus();return;}if(itemDialog.open&&buildGearDraftDiff()){e.preventDefault();buildGearEditorNudge();}}});
 new MutationObserver(buildGearEditorPaint).observe(document.getElementById('ggrid'),{childList:true});new MutationObserver(buildLayoutPaint).observe(document.getElementById('build-spec-direct'),{childList:true});
 initBuildPicker();
 onLangChange(buildLayoutPaint);matchMedia('(max-width:760px)').addEventListener('change',buildLayoutPaint);buildLayoutPaint();
}
// Called by the final startup owner after all classic script definitions exist.