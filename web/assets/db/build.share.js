/* Share the existing build snapshot. Calculation and local save formats stay native. */
const BUILD_DRAFT_KEY='agenthub:build-draft:v1';
function buildShareLibrary(file,key){
  if(window[key])return Promise.resolve(window[key]);
  if(!buildShareLibrary.pending)buildShareLibrary.pending={};
  if(!buildShareLibrary.pending[key])buildShareLibrary.pending[key]=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/assets/vendor/'+file;
    script.onload=()=>window[key]?resolve(window[key]):reject(new Error('Library unavailable'));
    script.onerror=()=>{delete buildShareLibrary.pending[key];reject(new Error('Library unavailable'));};
    document.head.appendChild(script);
  });
  return buildShareLibrary.pending[key];
}
function buildShareNotice(text){
  const el=document.getElementById('build-share-status');if(el)el.textContent=text;
}
function buildShareSelected(){return state.wslots.some(x=>x!=null)||state.slots.some(x=>x!=null);}
function buildShareIdentity(item){return item&&(item.mitem||item.uid||item.key)||null;}
/* 武器配件的稳定锚点：`DB.mods` 是裸数组，重烘后整体换序，**下标不是标识**（实测 2026-10-15：
   配件表错位 1 位后按纯下标恢复 ⇒ 12/12 件静默换成别的配件、DPS +151,212.66，页面 0 提示）。
   所以分享存档里除了 `build.wmods` 的原生下标，再并行走一份 `items.wmods` 官方件标识
   —— 口径与 `weapons`/`gear` 那一路的 `buildShareIdentity`、`mods` 那一路的 code+val+unit 完全一致，
   不另立第二套格式。实测本库 264/264 件的 `mitem` 唯一（`zh` 只有 259 唯一，不能用）。 */
function buildShareWmodKey(i){return buildShareIdentity(Number.isInteger(i)?arr(DB.mods)[i]:null);}
function buildSharePreview(){
  const names=o=>({zh:o.zh||o.name||o.en||'',en:o.en||o.zh||o.name||''});
  const attr=a=>({zh:a.name_zh||a.name||a.name_en||'',en:a.name_en||AFFIX_EN[a.name_zh||a.name]||a.name_zh||a.name||'',value:fmtN(a.val)+(a.unit||''),kind:attrKey(a.name_zh||a.name||'',a.unit)==='armor'?'def':/技能|Skill/.test(a.name_zh||a.name||'')?'uti':'off'});
  const effect=t=>t?{...names(t),icon:t.icon||''}:null;
  const augment=i=>{const a=state.bp.prototype&&arr(DB.prototype_augments).find(a=>a.code===state.bp.augments?.[i]?.key);return a?{...names(a),icon:arr(DB.talents_official).find(t=>t.key===a.code)?.icon||'',level:state.bp.augments[i].level||10}:null;};
  const gear=state.slots.map((id,i)=>{const it=gearOf(i);if(!it)return null;const fixed=arr(it.attrs_max?.slots).filter(s=>s.fixed&&s.val!=null),ch=coreChoices(it),proto=state.bp.prototype&&it.kind!=='exotic';
    /* 与页面 `collectAttrs()` 同口径：没手选核心时，件自带的固定核心**照常显示**；
       手选了才替换掉它（原来这里一律先剔掉核心、只在 `state.core[i]` 有值时才补 ⇒ 导出图整条核心消失）。 */
    let attrs=fixed.map(a=>({...a,val:prototypeAttrValue(a.code,a.val,a.qmod,proto)}));
    if(ch&&state.core[i]){const a=coreAttrOf(it,state.core[i]);attrs=attrs.filter(x=>x.kind!=='core');if(a)attrs.unshift(a);}
    attrs.push(...affixAttrs(it,i));
    const mod=GMODS[state.gmods[i]];
    return {...names(it),icon:it.gear_icon?.startsWith('gear/')?'fit/'+it.gear_icon:it.gear_icon||'',brandIcon:brandWmIcon(it)||'',quality:proto?'proto':it.kind,rarity:({named:'named',gearset:'set',exotic:'exotic'}[it.kind]||'brand'),attrs:attrs.map(attr),mod:mod?{...names(mod),attrs:[attr({name:modName(mod),val:modVal(mod),unit:mod.unit||''})]}:null,talent:effect(TALENT_BY_KEY[gtalKeyOf(i)]),augment:it.kind==='exotic'?null:augment(i)};});
  const weapons=state.wslots.map((id,i)=>{const w=DB.weapons[id];if(!w)return null;const mods=wmModel(w,i).map(slot=>{const selected=wmShown(w,slot.code,i)?.mod;return {slot:slot.code,fixed:!!slot.hasFixed,item:selected?{...names(selected),attrs:wmAttrRows(selected).map(attr)}:null};});return {...names(w),icon:w.icon||'',quality:w.exotic?'exotic':state.bp.prototype?'proto':'brand',rarity:w.exotic?'exotic':w.named?'named':'brand',attrs:[...arr(w.attrs),...weaponMaxAttrs(w,i)].map(attr),mods,talent:effect(weaponFixedTalent(w)||TALENTS[state.talents[i]]),augment:w.exotic?null:augment(i+6)};});
  const skills=state.skill.map((id,i)=>{const s=SKILLS[id],db=s&&skillDbOf(s),v=s&&skillVariantOf(s,state.skillVariant[i]);return v?{...names(v),icon:v.icon||db.icon||'',tier:activeSkillTier(v.code)}:null;});
  const spec=BP_SPEC_LIST.find(x=>x.id===state.bp.spec);
  return {weapons,gear,skills,context:{mode:state.bp.pvp?'PvP':'PvE',prototype:!!state.bp.prototype,specialization:spec?names(spec):null}};
}
function buildShareDocument(){
  const saved=JSON.parse(JSON.stringify(snapshot()));delete saved.opt;delete saved.folds;
  return {v:1,build:saved,preview:buildSharePreview(),items:{
    weapons:state.wslots.map(i=>buildShareIdentity(DB.weapons[i])),
    gear:state.slots.map(i=>buildShareIdentity(DB.gear[i])),
    talents:state.talents.map(i=>TALENTS[i]?.key||null),
    mods:state.gmods.map(i=>GMODS[i]?{code:GMODS[i].code,val:modVal(GMODS[i]),unit:GMODS[i].unit||''}:null),
    wmods:[0,1,2].map(i=>{const bag=arr(state.wmods)[i];return (bag&&typeof bag==='object')?Object.fromEntries(Object.keys(bag).map(code=>[code,buildShareWmodKey(bag[code])])):null;}),
    skills:state.skill.map(i=>SKILLS[i]?.zh||null)
  }};
}
async function buildShareUrl(){
  const lz=await buildShareLibrary('lz-string-1.5.0.min.js','LZString');
  const packed=lz.compressToEncodedURIComponent(JSON.stringify(buildShareDocument()));
  if(packed.length>6000)throw new Error(L('配装附加词条太多，请使用配装文件分享。','Too many custom attributes; share the build file instead.'));
  return location.origin+'/build/?'+new URLSearchParams({loadout:packed});
}
/* 武器配件按锚点重定位（照上面 `mods` 那一路同一做法：锚点为准，下标只作兼容退路）。
   新旧形状的区分只看一个键：`items.wmods` 是不是长度 3 的数组。
     · 没有 ⇒ 改动前发出去的老链接（`build.wmods` 里只有裸下标）⇒ 原样不动，走老行为。
     · 有 ⇒ 逐槽按 `mitem` 在当前 `DB.mods` 现查下标；查到但与存档下标不同 ⇒ 以锚点为准并计入
       `moved`，让用户看得见「配件在库里换过位」，而不是悄悄换一件。
     · ⚠️ 锚点**查不到**（那件被改名或删除）⇒ 留空并计入 `missing`，绝不退回存档里的裸下标：
       下标是别代数组的位置，实测退回后 4/4 槽静默换成别的配件且 0 提示，正是本函数要消灭的那个缺陷。
       唯一保留下标退路的情形是「导出时那件本身就没有标识」（`id==null`），那种没有可比对的锚点。 */
function buildShareWmods(items,raw){
  const anchors=Array.isArray(items.wmods)&&items.wmods.length===3?items.wmods:null;
  if(!anchors)return {moved:0,missing:0};
  const rows=arr(DB.mods),saved=Array.isArray(raw.wmods)?raw.wmods:[];let moved=0,missing=0;
  raw.wmods=anchors.map((bag,wi)=>{
    const old=(saved[wi]&&typeof saved[wi]==='object')?saved[wi]:null;
    if(!bag||typeof bag!=='object'||!Object.keys(bag).length)return old;
    const out={};
    Object.keys(bag).forEach(code=>{
      const id=bag[code],savedIdx=old?old[code]:null;
      if(id==null){if(Number.isInteger(savedIdx)){out[code]=savedIdx;return;}missing++;return;}
      const idx=rows.findIndex(m=>m&&buildShareIdentity(m)===id);
      if(idx<0){missing++;return;}
      if(Number.isInteger(savedIdx)&&savedIdx!==idx)moved++;
      out[code]=idx;
    });
    return Object.keys(out).length?out:null;
  });
  return {moved,missing};
}
/* 恢复后的差额提示：件数由本次校验现算，接本页现成的提示位（预览条 / `#build-share-status`），不自造一套 */
function buildShareMissingText(missing){return missing?L(missing+' 件物品暂未找到，载入时对应位置留空。',missing+' items unavailable; their slots will stay empty.'):'';}
function buildShareMovedText(moved){return moved?L('已按资料库重新定位 '+moved+' 件武器配件。',moved+' weapon mods were relocated to the current library.'):'';}
function buildShareWmodNote(moved){return [buildShareMovedText(moved),typeof saveIssueText==='function'?saveIssueText():''].filter(Boolean).join(' ');}
function buildShareRemap(doc){
  if(!doc||doc.v!==1||!doc.build||!doc.items)throw new Error('Invalid build');
  const raw=doc.build,items=doc.items;let missing=0;
  const map=(ids,length,rows,find)=>{
    if(!Array.isArray(ids)||ids.length!==length)throw new Error('Invalid slots');
    return ids.map(id=>{if(id==null)return null;const i=rows.findIndex(x=>x&&find(x,id));if(i<0)missing++;return i<0?null:i;});
  };
  raw.wslots=map(items.weapons,3,DB.weapons,(x,id)=>buildShareIdentity(x)===id);
  raw.slots=map(items.gear,6,DB.gear,(x,id)=>buildShareIdentity(x)===id);
  raw.talents=map(items.talents,3,TALENTS,(x,id)=>x.key===id).map(i=>i==null?-1:i);
  raw.skill=map(items.skills,2,SKILLS,(x,id)=>x.zh===id).map(i=>i==null?-1:i);
  raw.gmods=map(items.mods,6,GMODS,(x,id)=>id&&x.code===id.code&&modVal(x)===id.val&&(x.unit||'')===id.unit);
  const wmod=buildShareWmods(items,raw);
  if(!raw.wslots.some(x=>x!=null)&&!raw.slots.some(x=>x!=null))throw new Error('No matching items');
  return {raw,missing:missing+wmod.missing,moved:wmod.moved};
}
async function buildShareRestoreFromUrl(){
  const packed=new URLSearchParams(location.search).get('loadout');if(!packed)return;
  let box=document.createElement('section');box.className='build-shared-preview';box.id='build-shared-preview';
  document.querySelector('main').prepend(box);
  try{
    if(packed.length>6000)throw new Error('Too large');
    const lz=await buildShareLibrary('lz-string-1.5.0.min.js','LZString'),text=lz.decompressFromEncodedURIComponent(packed);
    if(!text||text.length>65536)throw new Error('Invalid payload');
    const doc=JSON.parse(text,(k,v)=>{if(k==='__proto__'||k==='constructor'||(k==='prototype'&&typeof v!=='boolean'))throw new Error('Invalid key');return v;});
    const {raw,missing,moved}=buildShareRemap(doc);
    const names=raw.wslots.map(i=>DB.weapons[i]).concat(raw.slots.map(i=>DB.gear[i])).filter(Boolean).map(nmTxt);
    box.innerHTML='<div><strong>'+esc(L('分享的配装','Shared build'))+'</strong><p>'+esc(names.join(' · '))+'</p><p>'+esc([buildShareMissingText(missing)||L('载入后可查看完整词条和计算条件。','Load to inspect all attributes and calculation conditions.'),buildShareMovedText(moved)].filter(Boolean).join(' '))+'</p></div>';
    const button=document.createElement('button');button.className='mini';button.type='button';button.textContent=L('载入配装','Load build');
    button.onclick=()=>{
      state.wslots=[null,null,null];state.slots=[null,null,null,null,null,null];
      if(!applySaved(raw)){buildShareNotice(L('无法载入这份配装。','Unable to load this build.'));return;}
      buildAccountCurrent=null;state.opt.res=null;state.opt.applied=false;renderAll();scheduleSync();box.remove();
      buildShareNotice([L('已载入分享配装。','Shared build loaded.'),buildShareMissingText(missing),buildShareWmodNote(moved)].filter(Boolean).join(' '));
    };box.appendChild(button);
  }catch(e){box.textContent=L('配装链接无效或已不兼容；现有配装已保留。','This build link is invalid or incompatible; your existing build is unchanged.');}
}
function buildShareSheet(){
  const sheet=document.createElement('section');sheet.className='build-share-sheet';sheet.setAttribute('aria-hidden','true');
  const header=document.createElement('header'),brand=document.createElement('strong'),site=document.createElement('span');brand.textContent='AGENT HUB';site.textContent='agenthub.fans';
  /* 名称与条件收到抬头同一行：品牌 / 配装名 · 条件 / 站点，省掉标题占的那一行高度。 */
  const preview=buildSharePreview()||{},ctx=preview.context||{},en=LANG==='en';
  const spec=ctx.specialization?(en?(ctx.specialization.en||ctx.specialization.zh):(ctx.specialization.zh||ctx.specialization.en)):'';
  const cond=[ctx.mode==='PvP'?'PvP':'PvE',spec,ctx.prototype?L('原型','Prototype'):''].filter(Boolean).join(' · ');
  const mid=document.createElement('div');mid.className='share-head-mid';
  const name=document.createElement('strong');name.className='share-name';name.textContent=buildAccountCurrent?.name||L('我的配装','My build');
  const condEl=document.createElement('span');condEl.className='share-cond';condEl.textContent=cond;
  mid.append(name,condEl);
  header.append(brand,mid,site);
  /* 分享图与配装页同一套卡片、同一排列：武器一行三张 → 装备三列 → 技能一行两张。
     只去掉「武器／装备／技能」分节标题和它们的间距；宽度固定 1200，避免长条。 */
  const body=document.createElement('div');body.className='build-share-body';
  const moved=[];
  const take=(sel,parent)=>{const el=document.querySelector(sel);if(!el)return null;moved.push({el,parent:el.parentNode,next:el.nextSibling});parent.append(el);return el;};
  take('#wstrip',body);take('#ggrid',body);take('#skstrip',body);
  sheet._moved=moved;
  sheet.style.width='1200px';
  sheet.append(header,body);
  return sheet;
}
async function buildSharePng(){
  const lib=await buildShareLibrary('html-to-image-1.11.13.js','htmlToImage'),sheet=buildShareSheet();
  const host=document.createElement('div');host.className='build-share-render';host.appendChild(sheet);document.body.appendChild(host);
  try{await document.fonts.ready;return await lib.toPng(sheet,{pixelRatio:1.5,cacheBust:false,backgroundColor:getComputedStyle(sheet).backgroundColor});}
  finally{(sheet._moved||[]).forEach(({el,parent,next})=>{parent.insertBefore(el,next||null);});host.remove();}
}
async function buildShareAction(kind){
  if(!buildShareSelected()){buildShareNotice(L('先选择武器或装备，再分享配装。','Choose a weapon or gear before sharing.'));return;}
  const buttons=[...document.querySelectorAll('[data-build-share]')];buttons.forEach(x=>x.disabled=true);
  buildShareNotice(L('正在准备配装…','Preparing build…'));
  try{
    if(kind==='image'){
      const png=await buildSharePng(),a=document.createElement('a');a.href=png;a.download='agenthub-build.png';a.click();
      buildShareNotice(L('配装图片已导出。','Build image exported.'));
    }else{
      const url=await buildShareUrl();
      if(kind==='link'){
        try{await navigator.clipboard.writeText(url);buildShareNotice(L('配装链接已复制。','Build link copied.'));}
        catch(e){const field=document.createElement('textarea');field.value=url;field.setAttribute('aria-label',L('配装分享链接','Build share link'));document.getElementById('build-share-status').replaceChildren(field);field.select();}
      }else{
        const selected=state.wslots.map(i=>DB.weapons[i]).concat(state.slots.map(i=>DB.gear[i])).filter(Boolean),name=nmTxt(selected[0]);
        const packed=new URL(url).searchParams.get('loadout');
        const content=L('分享我的配装，欢迎讨论搭配和使用条件。','Sharing my build; feedback on gear and usage conditions is welcome.')+'\n\n[AHBUILD='+packed+']'+L('打开完整配装','Open full build')+'[/AHBUILD]';
        const pending={v:1,title:(name+' · '+L('配装分享','Build discussion')).slice(0,80),content,createdAt:Date.now()};
        try{localStorage.setItem(BUILD_DRAFT_KEY,JSON.stringify(pending));}
        catch(e){delete pending.image;localStorage.setItem(BUILD_DRAFT_KEY,JSON.stringify(pending));}
        flushPendingBuildSave();
        const path='/forum/?buildDraft=1';
        if(window.parent!==window)window.parent.postMessage({type:'agenthub:navigate',tab:'forum',params:{path}},location.origin);
        else location.assign('/#forum?'+new URLSearchParams({path}));
      }
    }
  }catch(e){buildShareNotice(e.message==='Library unavailable'?L('分享组件加载失败，请重试。','Sharing tools failed to load; please retry.'):e.message);}
  finally{buttons.forEach(x=>x.disabled=false);}
}
async function buildShareBoot(){
  if(typeof initBuildLayout==='function')initBuildLayout();
  if(typeof initBuildMobileFlow==='function')initBuildMobileFlow();
  const menu=document.getElementById('build-share-menu');if(!menu)return;
  const paint=()=>{
    if(typeof buildToolLabel==='function')buildToolLabel(menu.querySelector('summary'),'share',L('分享','Share'));
    else menu.querySelector('summary').textContent=L('分享','Share');
    menu.querySelectorAll('[data-build-share]').forEach(b=>{const labels={image:['导出图片','Export image'],link:['复制配装链接','Copy build link'],forum:['分享到论坛','Discuss in forum']};b.textContent=L(...labels[b.dataset.buildShare]);});
  };paint();onLangChange(paint);
  menu.addEventListener('click',e=>{const b=e.target.closest('[data-build-share]');if(b){menu.open=false;buildShareAction(b.dataset.buildShare);}});
  document.addEventListener('click',e=>{if(!menu.contains(e.target))menu.open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.open=false;menu.querySelector('summary').focus();}});
  for(let i=0;i<300;i++){if(DB.weapons?.length&&document.getElementById('v_dps')){await buildShareRestoreFromUrl();buildAccountBoot();return;}await new Promise(r=>setTimeout(r,100));}
}
// This is the page's final classic script: register after all build functions exist.
window.addEventListener('DOMContentLoaded',buildShareBoot);
