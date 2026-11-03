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
  /* ⚠️ 不再把 `preview` 塞进链接（2026-11-03）：那是一份**纯派生**的展示快照
     （名字 / 英文名 / 图标路径 / 排版好的词条文字 / 稀有度），接收端在 `renderSharedPreview()`
     里本来就用 `buildSharePreview()` 现算，**没有任何地方读回 `doc.preview`**。
     实测同一套配装：带 preview 的 JSON 3857 字符 → LZ 压完 2804；去掉后 1463 → 1105，
     链接直接短掉 61%。旧链接里多出来的 `preview` 键会被忽略，向后兼容。 */
  return {v:1,build:saved,items:{
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
/* 图片顶部的「关键数值条」（用户 2026-11-03：「保存图片没有数值」）。
   数字一律**读页面上结果面板的成品文本**（`#v_*`），不在导出路径里重算 —— 图与页永远同源。
   顺序按「先看输出、再看防御」排；值为 0 或取不到（`—`）的不印（用户：0% 的直接筛掉）。 */
const SHARE_STAT_KEYS=['dps','dpm','bullet','nexthit','rpm','chc','chd','hsd','armor','health','elites','hazard'];
function buildShareStats(){
  const defs={};
  RCELLS.concat(STATCELLS).forEach(([k,zh,,role])=>{defs[k]=[zh[0],role||'dmg'];});
  const out=[];
  for(const k of SHARE_STAT_KEYS){
    const el=document.getElementById('v_'+k);if(!el)continue;
    const raw=String(el.textContent||'').trim();
    if(!raw||raw==='—')continue;
    const num=Number(raw.replace(/[^0-9.-]/g,''));
    if(!isFinite(num)||num===0)continue;
    const [label,role]=defs[k]||[k,'dmg'];
    const pct=/\s*%/.test(label);
    out.push({label:label.replace(/\s*%/,''),value:raw+(pct?'%':''),role});
  }
  return out;
}
/* 图片里不印空行：0 / `—` / 「未选择」这类在页面上是**编辑入口**，印到图上只是噪声。
   同时把空槽的行动号召文案换成陈述（「选择瞄具」→「无」，「选择装备」→「未装备」）。 */
function buildShareCleanSheet(root){
  const empty=(v)=>/^(|—|-|0(\.0+)?%?)$/.test(String(v||'').trim());
  root.querySelectorAll('#ggrid .build-gear-attr, #wstrip .wax-row').forEach((row)=>{
    const b=row.querySelector('b');
    if(!b||empty(b.textContent)){row.remove();return;}
    if(/未选择/.test(row.textContent||''))row.remove();
  });
  /* 空配件槽 / 该枪没有这个槽（unavailable）整行去掉：图里只剩「无」或裸图标，像没做完。
     四槽都空时不再留一块空白，改印一行「配件 · 未装」，卡高不变、也不空。 */
  root.querySelectorAll('#wstrip .wmod-row.empty, #wstrip .wmod-row.unavailable').forEach((row)=>row.remove());
  root.querySelectorAll('#wstrip .wc-mod').forEach((mod)=>{
    if(mod.querySelector('.wmod-row'))return;
    mod.textContent='';
    mod.classList.add('share-mod-none');
    mod.textContent=L('配件 · 未装','Mods · none');
  });
  /* 技能位没选时把行动号召换成陈述 */
  root.querySelectorAll('#skstrip *').forEach((el)=>{
    if(!el.children.length&&/点击选择/.test(el.textContent||''))el.textContent=L('未装备','Empty');
  });
  /* 未设置的操作格（＋ 选择插件 / ＋ 选择原型天赋 / ＋ 天赋）在图上不占位：
     它们是页面上的入口，印成图以后没有可点性，只会让卡面看起来"没填完"。 */
  root.querySelectorAll('.modblk.empty, .taltx.empty, .tal-reserve, .build-gear-prototype.empty, #wstrip .prototype-augment.empty').forEach((el)=>el.remove());
  root.querySelectorAll('.gc-ft').forEach((ft)=>{ if(!ft.textContent.trim())ft.remove(); });
  root.querySelectorAll('#wstrip .wc-talrow').forEach((row)=>{
    const n=row.querySelector('.wc-tal-name');
    if(n&&/选择/.test(n.textContent||''))n.textContent=L('无天赋','No talent');
  });
  root.querySelectorAll('.build-gear-summary').forEach((box)=>{ if(!box.children.length)box.remove(); });
  root.querySelectorAll('.wcard.empty, .gcard:not(.filled)').forEach((card)=>{
    card.querySelectorAll('.wc-stats,.build-gear-empty,.wc-empty').forEach((el)=>{
      el.textContent=L('未装备','Empty');
    });
  });
}
function buildShareSheet(){
  const sheet=document.createElement('section');sheet.className='build-share-sheet';sheet.setAttribute('aria-hidden','true');
  const header=document.createElement('header'),brand=document.createElement('strong'),site=document.createElement('span');brand.textContent='AGENT HUB';site.textContent='agenthub.fans';
  /* 名称与条件收到抬头同一行：品牌 / 配装名 · 条件 / 站点，省掉标题占的那一行高度。
     2026-11-03：条件行里补「用哪把武器计算」——导出前用户可选（`buildSharePickWeapon`），
     不写在图上就说不清这些数字是按哪把枪算的。 */
  const preview=buildSharePreview()||{},ctx=preview.context||{},en=LANG==='en';
  const spec=ctx.specialization?(en?(ctx.specialization.en||ctx.specialization.zh):(ctx.specialization.zh||ctx.specialization.en)):'';
  const calc=state.wslots[state.wactive]==null?null:arr(DB.weapons)[state.wslots[state.wactive]];
  const cond=[ctx.mode==='PvP'?'PvP':'PvE',spec,ctx.prototype?L('原型','Prototype'):'',calc?L('计算','Calc')+' · '+nmTxt(calc):''].filter(Boolean).join(' · ');
  const mid=document.createElement('div');mid.className='share-head-mid';
  const name=document.createElement('strong');name.className='share-name';name.textContent=buildAccountCurrent?.name||L('我的配装','My build');
  const condEl=document.createElement('span');condEl.className='share-cond';condEl.textContent=cond;
  mid.append(name,condEl);
  header.append(brand,mid,site);
  /* 关键数值条 */
  const stats=buildShareStats();
  let statsBox=null;
  if(stats.length){
    statsBox=document.createElement('div');statsBox.className='share-stats';
    stats.forEach((s)=>{
      const cell=document.createElement('div');cell.className='share-stat';
      const k=document.createElement('span');k.textContent=s.label;
      const v=document.createElement('b');v.className='r-'+(s.role||'dmg');v.textContent=s.value;
      cell.append(k,v);statsBox.append(cell);
    });
  }
  /* 分享图与配装页同一套卡片、同一排列：武器一行三张 → 装备三列 → 技能一行两张。
     只去掉「武器／装备／技能」分节标题和它们的间距；宽度固定 1200，避免长条。
     ⚠️ 2026-11-03 起用**克隆**而不是把真节点搬进稿子：导出前要删空行、换文案，
        搬真节点会把页面上的行一起删掉（导出后页面空了一片）。 */
  const body=document.createElement('div');body.className='build-share-body';
  ['#wstrip','#ggrid','#skstrip'].forEach((sel)=>{
    const src=document.querySelector(sel);if(src)body.append(src.cloneNode(true));
  });
  /* 计算用的那把枪在图上也要能一眼认出来（抬头有文字，卡上再描一圈） */
  const calcCard=body.querySelector('#wstrip .wcard.filled.on');
  if(calcCard)calcCard.classList.add('share-calc');
  buildShareCleanSheet(body);
  sheet.style.width='1200px';
  sheet.append(header);
  if(statsBox)sheet.append(statsBox);
  sheet.append(body);
  return sheet;
}
/* 导出前选「用哪把武器计算」（用户 2026-11-03）。列已装的武器槽；只有一把就免问。
   返回 Promise<槽位号|null>：数字=选定，null=取消（不出图）。
   ⚠️ 选定后写的是 `state.wactive`（与点卡片左上徽标同一动作），不是附件域的临时变量 ——
      否则「图按 A 算、页面按 B 算」，而保存下来的配装也会跟着变，用户看着就是两套数。 */
function buildSharePickWeapon(){
  const list=state.wslots.map((id,i)=>({slot:i,w:id==null?null:arr(DB.weapons)[id]})).filter(x=>x.w);
  if(!list.length)return Promise.resolve(null);
  if(list.length===1)return Promise.resolve(list[0].slot);
  return new Promise(resolve=>{
    const cur=(state.wactive>=0&&list.some(x=>x.slot===state.wactive))?state.wactive:list[0].slot;
    const dlg=document.createElement('dialog');
    dlg.className='build-weapon-pick';
    dlg.setAttribute('aria-labelledby','build-weapon-pick-title');
    dlg.innerHTML='<h2 id="build-weapon-pick-title">'+esc(L('用哪把武器计算？','Which weapon to calculate with?'))+'</h2>'
      +'<p class="hint">'+esc(L('图片按这把武器的数值计算，并在抬头标注。','The image uses this weapon and labels it at the top.'))+'</p>'
      +'<div class="build-weapon-pick-list" role="radiogroup" aria-labelledby="build-weapon-pick-title">'
      +list.map(({slot,w})=>'<label class="build-weapon-pick-row"><input type="radio" name="build-weapon-pick" value="'+slot+'"'+(slot===cur?' checked':'')+'>'
          +'<span class="bwp-slot">'+esc(L(W_SLOTS[slot][0],W_SLOTS[slot][1]))+'</span>'
          +'<span class="bwp-name">'+esc(nmTxt(w))+'</span>'
          +'<span class="bwp-type">'+esc(L(w.type||'',w.type_en||w.type||''))+'</span></label>').join('')
      +'</div>'
      +'<div class="build-weapon-pick-actions"><button type="button" class="mini" data-bwp-cancel>'+esc(L('取消','Cancel'))+'</button>'
      +'<button type="button" class="mini primary" data-bwp-ok>'+esc(L('导出图片','Export image'))+'</button></div>';
    document.body.append(dlg);
    let done=false;
    const finish=v=>{if(done)return;done=true;try{if(dlg.open)dlg.close();}catch(e){}dlg.remove();resolve(v);};
    dlg.querySelector('[data-bwp-cancel]').addEventListener('click',()=>finish(null));
    dlg.querySelector('[data-bwp-ok]').addEventListener('click',()=>{
      const r=dlg.querySelector('input[name="build-weapon-pick"]:checked');
      finish(r?+r.value:null);
    });
    dlg.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
    dlg.addEventListener('click',e=>{if(e.target===dlg)finish(null);});
    dlg.showModal();
    dlg.querySelector('input:checked')?.focus({preventScroll:true});
  });
}
async function buildSharePng(){
  const lib=await buildShareLibrary('html-to-image-1.11.13.js','htmlToImage'),sheet=buildShareSheet();
  const host=document.createElement('div');host.className='build-share-render';host.appendChild(sheet);document.body.appendChild(host);
  try{await document.fonts.ready;return await lib.toPng(sheet,{pixelRatio:1.5,cacheBust:false,backgroundColor:getComputedStyle(sheet).backgroundColor});}
  finally{(sheet._moved||[]).forEach(({el,parent,next})=>{parent.insertBefore(el,next||null);});host.remove();}
}
async function buildShareAction(kind){
  if(!buildShareSelected()){buildShareNotice(L('先选择武器或装备，再分享配装。','Choose a weapon or gear before sharing.'));return;}
  /* 出图前先问「用哪把计算」：这一步会改 `state.wactive`，所以必须在渲染稿子/截图**之前**完成，
     中间只要再 `renderAll()` 一次，卡片上的徽标、面板数字与抬头标注才会是同一把枪。 */
  let calcSlot=null;
  if(kind==='image'){
    calcSlot=await buildSharePickWeapon();
    if(calcSlot==null){buildShareNotice('');return;}
  }
  const buttons=[...document.querySelectorAll('[data-build-share]')];buttons.forEach(x=>x.disabled=true);
  buildShareNotice(L('正在准备配装…','Preparing build…'));
  const calcName=calcSlot==null?'':nmTxt(arr(DB.weapons)[state.wslots[calcSlot]]||{});
  try{
    if(kind==='image'){
      if(state.wactive!==calcSlot){
        state.wactive=calcSlot;renderAll();
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      }
      const png=await buildSharePng(),a=document.createElement('a');a.href=png;a.download='agenthub-build.png';a.click();
      buildShareNotice(calcName?L('配装图片已导出（按 '+calcName+' 计算）。','Build image exported (calculated with '+calcName+').'):L('配装图片已导出。','Build image exported.'));
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
