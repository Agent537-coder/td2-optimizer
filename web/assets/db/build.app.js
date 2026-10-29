/* 配装器页 · 应用层：recalc 计算与结果面板、静态文案、renderAll、事件委托、英文查找表、加载与启动 */
/* ── 计算 + 结果面板 ── */
function vnum(id,def){const v=parseFloat($(id).value);return isNaN(v)?def:v;}
/* ⚠️ 数组第 4 位 = **这个数字的颜色语义**（用户第 245 轮：「数字需要加颜色，明显一点」）：
   `dmg` 输出橙 · `rate` 射速/弹匣/换弹（中性）· `def` 防御蓝 · `crit` 暴击黄。
   第 5 位 = 是否主指标（字号更大，但**同样带标签**）。
   面板统一成**一套「标签在上、数字在下」**的格子（用户第 245 轮：「不要一部分是标签，一部分又不是」）——
   原来 DPS 是大数字在左、弹匣/循环是数字在左标签在右、下面十项又是虚线行，三种版式混在一张卡里。
   颜色与版式**由数据驱动**：加一格只需在这里补一列，渲染侧不写类名。 */
const RCELLS=[
  ['dps',['爆发 DPS','Burst DPS'],'DPS','dmg',1],
  ['dpm',['弹匣伤害','Mag DMG'],'DPM','dmg',1],
  ['sdps',['当前条件的弹匣快照','Current magazine snapshot'],'SDPS','dmg',1],
  ['bullet',['单发伤害','Bullet DMG'],'BulletDamage','dmg'],
  ['panel',['面板单发','Panel Hit'],'Damage','dmg'],
  ['armor',['护甲','Armor'],'Armor','def'],
  ['health',['生命','Health'],'Health','def'],
  ['rpm',['有效射速','RPM'],'RPM','rate'],
  ['reload',['换弹 (秒)','Reload (s)'],'ReloadTime','rate'],
  ['mag',['弹匣','Magazine'],'Magazine','rate'],
  ['chc',['暴击率 %','CHC %'],'CHC','crit'],
  ['chd',['暴击伤 %','CHD %'],'CHD','crit'],
  ['hsd',['爆头伤 %','HSD %'],'HSD','crit'],
];
 const STATCELLS=[
  /* 近战伤害（2026-10-16 新增通道）：引擎新字段 `MeleeDamage`（吃武器伤/近战伤害/总武器伤/独立增伤 + 目标态，
     不吃暴击爆头）；= 倍率口径，1.00 起步。 */
  ['melee',['近战伤害','Melee DMG'],'MeleeDamage','dmg'],
  ['range',['最佳射程','Optimal range'],'Range','rate'],
  ['handling',['武器操控 %','Handling %'],'WeaponHandling','rate'],
  ['acc',['准确度 %','Accuracy %'],'Accuracy','rate'],
  ['stab',['稳定度 %','Stability %'],'Stability','rate'],
  ['swap',['切换速度 %','Swap %'],'SwapSpeed','rate'],
  ['aok',['击杀回甲','Armor on kill'],'ArmorOnKill','def'],
  ['regen',['护甲回复','Armor regen'],'ArmorRegen','def'],
  ['hazard',['危害防护 %','Hazard %'],'HazardProtection','def'],
  ['skd',['技能伤害 %','Skill damage %'],'SkillDamage','rate'],
  ['skh',['技能加速 %','Skill haste %'],'SkillHaste','rate'],
  ['skdur',['技能持续 %','Skill duration %'],'SkillDuration','rate'],
  ['repair',['技能修复 %','Repair %'],'RepairSkills','rate'],
  ['sktier',['技能分阶','Skill tier'],'SkillTier','rate'],
  ['skeff',['技能效率 %','Skill efficiency %'],'SkillEfficiency','rate'],
  ['skhp',['技能生命 %','Skill health %'],'SkillHealth','rate'],
  ['status',['状态效果 %','Status effects %'],'StatusEffects','rate'],
  ['explosive',['爆裂物伤害 %','Explosive damage %'],'ExplosiveDamage','dmg'],
  ['bleed',['出血伤害 %','Bleed %'],'BleedDamage','dmg'],
  ['burn',['燃烧伤害 %','Burn %'],'BurnDamage','dmg'],
  ['bonus',['额外护甲 %','Bonus armor %'],'BonusArmor','def'],
  ['reduce',['伤害减免 %','Reduction %'],'DamageReduction','def'],
  ['move',['移动速度 %','Move %'],'MovementSpeed','rate'],
  ['repairfrom',['伤害转回复 %','Damage to repair %'],'DamageToRepair','def'],
  ['nextshots',['接下来几发伤害 %','Next shots %'],'NextShotsDamage','dmg'],
  ['spread',['状态扩散范围','Status spread'],'StatusSpreadRange','rate'],
 ];
function fillGridLabels(){
  const g=$('#r_grid');if(!g)return;
  const note=`<p class="result-scope">${esc(L(
    '下面是当前条件下的枪械弹匣快照，不是实战持续 DPS。技能、治疗、状态和未支持天赋在「未进 DPS」里。',
    'These numbers are a firearm magazine snapshot under the current conditions, not sustained combat DPS. Skills, healing, status effects, and unsupported talents stay under “not in DPS”.'
  ))}</p>`;
  g.innerHTML=note+RCELLS.concat(STATCELLS).map(([k,zh,,role,big])=>
    `<div class="rcell${big?' k':''}"><span class="rlbl">${esc(L(zh[0],zh[1]))}</span>`+
    `<b class="rnum r-${role||'dmg'}" id="v_${k}">—</b></div>`).join('');
}
/* ── 16 格命中矩阵 + 装甲目标（口径同 BuildTool 的 Result 命中四族 × 目标四态，逐格同名） ──
   单发基础值取 r.HitBase（= 引擎内部 num17，已含 武器伤/类别伤/总武器伤/独立增伤）；
   暴击/爆头/掩体/装甲修正按 BuildTool 逐格同式现算，不做二次近似。
   目标血量 / 装甲取官方系数表（enemy_coeffs.json），取不到就整列不显示（不拿 0 顶替）。 */
/* 取不到的值一律显示「—」，**不拿 0 顶替**（0 是「打了 0 点」，不是一个意思） */
function fmtDash(v){return (v==null||!isFinite(v))?'—':fmt0(v);}
function hitsHtml(r){
  /* ⚠️ 目标系数这一段**绝不许把整页算数拖死**：系数表缺文件 / 轴对不上时只让目标那两列留空。
     踩过：`enemyTarget()` 抛 TypeError ⇒ 冒泡到 `recalc → renderAll → DOMContentLoaded`，
     结果卡片连同 `#r_hits` 一起没渲染，而静态检查与单测全绿、只有真机冒烟看得见。 */
  let t=null;try{t=enemyTarget();}catch(e){t=null;}
  const base=r.HitBase;
  const rowHd=BP_ARM4.map(([,zh,en])=>`<span class="hgh">${esc(L(zh,en))}</span>`).join('');
  const cell=(colKey,rowKey,val,need)=>{
    const v=fmtDash(val);
    const n=(need==null)?'':`<span class="hgn">${need} ${esc(L('发','shots'))}</span>`;
    return `<span class="hgc" id="hg_${colKey}${rowKey}">${esc(v)}${n}</span>`;
  };
  const rows=BP_HIT4.map(([key,[zh,en]])=>{
    const cells=BP_ARM4.map(([suf,,])=>{
      const dmg=r.Hits?r.Hits[key+suf]:null;
      const tot=(t)?((suf==='_Armor'||suf==='_ArmorCover')?t.armor:t.hp):null;
      return cell(key,suf,dmg,tot==null?null:shotsToKill(tot,dmg));
    }).join('');
    return `<div class="hgr"><span class="hgrow">${esc(L(zh,en))}</span>${cells}</div>`;
  }).join('');
  const tgt=t?`<span>${esc(L('目标血量','Target health'))} ${esc(fmtDash(t.hp))}</span><span>${esc(L('目标装甲','Target armor'))} ${esc(fmtDash(t.armor))}</span>`:'';
  return `<div class="hg"><div class="hgr"><span class="hgrow"></span>${rowHd}</div>${rows}</div>
    <p class="hint tiny">${tgt}</p>`;
}
/* ── 试算：把「一次计算」抽成**不读页面控件、不写页面**的纯函数 ───────────────────────
   ① `picksFor(w,gear,opt)`：给定一套装等，产出引擎入参（唯一口径，`recalc` 也走它）；
   ② `evalBuild(w,gear,opt)`：算出 r（含 16 格矩阵与 DPS/DPM/SDPS）。
   一键配装要批量试算上百种组合，绝不能每试一次就去读 DOM（既慢又会把输入框的值当真相）。
   `opt` 是覆盖层：{talents, gmods, core, affix} —— 缺省时读 state（交互用），
   优化器则显式传自己那一套，互不污染。 */
function picksFor(w,gear,opt){
  opt=opt||{};
  const picks={attrs:buildSpecRows(w),mods:[],bonuses:[],talents:[],tweaks:[],redCorePieces:0};
  /* ⚠️ **引擎入参契约：`name` 必须是归一后的键（单位已折进去），`unit` 必须给空串。**
     引擎 `add()` 的键是 `attr.name + (attr.unit || '')`（公式不许改）⇒ 两处都带单位就会拼成
     `生命值伤害%%` / `突击步枪伤害%%`，MAP 查不到、`add()` 走 `InCalcu` 分支**静默忽略** ——
     页面上数字照出、控制台一句不报。2026-09-13 真踩：武器满值槽（`name_zh='生命值伤害'` + `unit='%'`）
     与 `ATTR_UNIT_FIX` 补单位的属性都命中这条，PvP 开关当时因此看着「生效了但一个数没动」。
     判据 `python scripts/devcheck/attr_key_check.py`（双单位条数非 0 即红）。
     显示侧要原始名 + 单位，直接读 `it.attrs_max.slots[]` / 数据行，**不经这里**。 */
  const attrOf=a=>({name:a.key||a.name,val:a.val!=null?a.val:a.value,unit:''});
  /* 件天赋（背包 / 胸甲 的「天赋槽」）：与词条**同一条入参通路**（`picks.attrs`），引擎一行未动。
     值与池的判据全在 `build.gtal.js`（对照复刻 BuildTool 的 `AppData.TalentData[Num-2]`）。
     ⚠️ `gtalRowsFor()` 返回 `null` 时**不喂**：① 该族归档位层（震荡 / 猎头者 / 土狼 / 头痛欲裂）
        —— 它们走 `build.tiers.js` 的档位入参，这里再喂一次就是**双算**；
        ② 取不到官方参数 —— 不拿 0 顶替（与 `picks.attrs` 那条纪律同款，见上）。
     ⚠️ 件来自**入参 `gear`**、手选值来自 `opt.gtal || state.gtal`：`picksFor()` 是纯函数，
        一键配装会拿它批量试算别的组合，读 `state.slots` 会把「评分的配装」和「交付的配装」拆成两套。 */
  const gtalArr=opt.gtal||state.gtal||[];
  (gear||[]).forEach((it,i)=>{
    if(!it)return;
    const coreCode=arr(opt.core||state.core)[i];
    const coreCodes=coreChoices(it)&&coreCode?[coreCode]:arr(it.attrs_max&&it.attrs_max.slots).filter(s=>s&&s.kind==='core'&&s.fixed===true&&s.val>0).map(s=>s.code);
    if(coreCodes.length&&coreCodes.every(c=>/^WeaponDamage(?:Default)?ModBonus$/.test(c)))picks.redCorePieces++;
    collectAttrs(it,i,opt).forEach(a=>picks.attrs.push(attrOf(a)));
    const gk=gtalKeyOfPiece(it,gtalArr[i]);
    if(!gk)return;
    const gRows=combatGearRows(gk,gear,w,opt);
    if(!gRows)return;
    gRows.forEach(x=>picks.attrs.push({name:x.name,val:+x.val,unit:''}));
  });
  const selectedWslot=(opt.wslot!=null)?opt.wslot:state.wactive;
  if(w)weaponMaxAttrs(w,selectedWslot,opt).forEach(a=>picks.attrs.push(attrOf(a)));
  const gmods=opt.gmods||state.gmods;
  gmods.forEach((mi,i)=>{const piece=gear[i];if(mi==null||!piece||!(MOD_POS.includes(i)||arr(piece.sockets).some(modSocketIsGear)||state.ovr[i]))return;const m=(GMODS||[])[mi];if(m)for(let n=0;n<gearModSlotCount(piece,i);n++)picks.mods.push({name:modName(m),val:modVal(m),unit:m.unit||''});});
  /* 武器配件（四插槽）：与词条/插件**同一条入参通路**（`picks.mods` → 引擎 `feedAttr`）。
     ⚠️ 这里读的是 `wmActive()`（含官方 `fixed_mods` 预装件）—— 预装件不占用户选择，但**必须进计算**：
        奇特武器全靠它（58/434 把有预装件，多数是奇特），漏了等于这类枪白少一条属性。
     ⚠️ `opt.wslot` / `opt.wmods` 是给一键配装评分用的覆盖层，缺省读 state ——
        否则「评分的配装 ≠ 交付的配装」那类错配会原样复制到配件上（§17 踩过）。 */
  const wmW=w;
  const savedW=state.wactive, savedBag=state.wmods;
  if(opt.wslot!=null)state.wactive=opt.wslot;         // 临时切到「被评分那把」，读它自己那套配件
  if(opt.wmods)state.wmods=opt.wmods;
  try{
    if(wmW)wmPicks(wmW,selectedWslot).forEach(r=>picks.mods.push(r));   // 没武器 ⇒ 一件都没有（不查表、不猜）
  }finally{state.wactive=savedW;state.wmods=savedBag;}
  return picks;
}
/* 品牌 / 装备组几件套定值（按传入的装备组合现算，不看页面） */
function bonusPicksFor(gear){
  const per=effectiveGearCounts(gear);
  const g=collectGearBonus((gear||[]).filter(Boolean),per);
  const out=[];
  g.bonuses.forEach(b=>out.push(b));
  /* 装备组 4 件套自带天赋也要进引擎（与 recalc 同口径） */
  const tals=[];
  g.talents.forEach(t=>{if(t.name)tals.push({name:t.name});});
  return {bonuses:out,talents:tals};
}
/* 评分上下文是独立、不可变的快照；不持久化到用户战斗条件。
   旧消费者仍经 scoped state adapter 运行，出口始终还原引用，禁止跨候选借状态。 */
function buildClone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function buildFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(buildFreeze);Object.freeze(value);}return value;}
function buildEvaluationContext(mode,objective,scenario){
  const projection={};
  for(const key of ['bp','bonuses','tweaks','ovr','skill','skillVariant'])projection[key]=buildClone(state[key]);
  const params=bpParams();
  if(mode==='theoretical'){
    projection.bp=Object.assign({},projection.bp,{optPeak:true,optDistanceM:scenario?.distanceM??25,effects:{},tiers:{},coverage:'ideal'});
  }else{mode='current';delete projection.bp.optPeak;}
  return buildFreeze({schema:1,mode,objective:objective||'sdps',dataset:DB.combat_audit?.dataset_digest||'',recipe:DB.combat_audit?.recipe_sha256||'',
    state:projection,params:{hit:params.hit,headshot:params.headshot,outcover:params.outcover,armorPct:params.armorPct}});
}
function withBuildEvaluationState(w,gear,opt,run){
  opt=opt||{};const before={},put=(key,value)=>{if(!Object.prototype.hasOwnProperty.call(before,key))before[key]=state[key];state[key]=value;};
  try{
    if(opt.context){
      if(opt.context.schema!==1||opt.context.dataset!==(DB.combat_audit?.dataset_digest||'')||opt.context.recipe!==(DB.combat_audit?.recipe_sha256||''))throw new Error('Evaluation context is stale');
      for(const key of ['bp','bonuses','tweaks','ovr','skill','skillVariant'])if(Object.prototype.hasOwnProperty.call(opt.context.state,key))put(key,buildClone(opt.context.state[key]));
    }
    for(const key of ['core','affix','gtal','gmods','wmods','waffix','talents'])if(opt[key])put(key,buildClone(opt[key]));
    put('slots',arr(gear).map(it=>it?(it.raw!=null?it.raw:DB.gear.indexOf(it)):null));
    const slot=opt.wslot!=null?opt.wslot:state.wactive;
    if(slot>=0){const slots=arr(opt.wslots||state.wslots).slice();slots[slot]=DB.weapons.indexOf(w);put('wslots',slots);put('wactive',slot);}
    return run();
  }finally{for(const key of Object.keys(before))state[key]=before[key];}
}
var BUILD_EVAL_TRACE=null;
function evalBuild(w,gear,opt){
  if(BUILD_EVAL_TRACE)BUILD_EVAL_TRACE.evalBuildCalls++;
  opt=opt||{};
  return withBuildEvaluationState(w,gear,opt,()=>evalBuildScoped(w,gear,opt));
}
function evalBuildScoped(w,gear,opt){

  opt=opt||{};
  const picks=picksFor(w,gear,opt);
  const bp=bonusPicksFor(gear);
  bp.bonuses.forEach(b=>picks.bonuses.push(b));
  /* ⚠️ **装备组 4 件套自带的那条天赋不许当「天赋名」喂引擎**：实测引擎侧 `applyTalent()` 拿
     「头痛欲裂」/「Headache」/`talent_gearset_hotshot_headache` **三种名字效果都是 0**（引擎天赋表里没这条）
     ⇒ 喂进去只会进 `unsupportedTalents`、静默不算。它的数值走**档位层**（`build.tiers.js` 按官方
     `talent_gearset_hotshot_headache_headshot_damage_bonus` 现算 `HeadshotDamage 80`），
     与其余条件型天赋同一条入参通路。 */
  const talArr=opt.talents||state.talents;
  const wslot=(opt.wslot!=null)?opt.wslot:state.wactive;
  const fixedTal=weaponFixedTalent(w),tal=talArr[wslot],talObj=fixedTal||((tal!=null&&tal>=0)?TALENTS[tal]:null);
  if(talObj?.key)combatGearRows(talObj.key,gear,w,opt).forEach(x=>picks.attrs.push(x));
  // A set's base talent is active only after meeting its piece requirement.
  for(const set of arr(DB.gearsets_official)){
    const count=effectiveGearCounts(gear)['set:'+set.code]||0;
    for(const tier of arr(set.tiers))if(count>=tier.pieces)for(const tl of arr(tier.talents)){
      if(tl.key)combatGearRows(tl.key.toLowerCase(),gear,w,opt).forEach(x=>picks.attrs.push(x));
    }
  }
  /* ── 额外参数 12 项 + 装备天赋档位 ──────────────────────────────────────────
     ⚠️ 两者都走**与词条同一条入参通路**（`picks.attrs`），引擎公式一行未动。
     ⚠️ `bp.extras` 此前只有输入框、**从来没进过计算**（`state.bp.extras` 全仓只被写、没人读）——
       也就是说那块面板上的 12 个数字此前是**纯装饰**：填了不生效、页面也不报错。本轮接上。
     ⚠️ 单位：`attrKey()` 已把单位折进名字（引擎按 `name + unit` 拼键）⇒ 这里 unit 一律空串，
       否则键会变成 `暴击几率%%` 而引擎认不出（这个坑 §13 真踩过）。 */
  /* ⚠️ 「额外参数 12 项」**不在这里推**：`bpParams()` 已经把整个 `bp`（含 `extras`）交给引擎，
     引擎 `applyBuildParams` 自己会应用它 ⇒ 这里再推一遍就是**双算**（2026-09-14 真机实测三项独立印证：
     喂 HSD +128.56 ⇒ 引擎 HSD 从 160.04 变 417.16（+257.12 = 两倍）· 喂暴击率 −4 ⇒ 算出 2（10−8）·
     喂装甲伤害 9 ⇒ 引擎读到 18）。同一天早先还发现这两项的名字（`所有武器伤害%` / `总武器伤害%`）
     引擎根本不认、被 `ignoredAttrs` 静默吞掉 —— 说明当时「接上了」的其实只是这条**重复且半死**的路。
     判据：改这里之后 `ignoredAttrs` 必须仍为空，且喂一个值只生效一次。 */
  const tb=state.bp.tiers||{},tierChoices=[];
  const oldSlots=state.slots,oldGtal=state.gtal,oldWeapons=state.wslots,oldActive=state.wactive;
  try{
    state.slots=(gear||[]).map(x=>!x?null:(x.raw!=null?x.raw:DB.gear.indexOf(x)));
    state.gtal=opt.gtal||state.gtal;state.wslots=(opt.wslots||state.wslots).slice();
    if(wslot>=0){state.wslots[wslot]=DB.weapons.indexOf(w);state.wactive=wslot;}
    talTierInPlay().filter(fam=>!combatBlocked(fam.family)&&(!fam.weaponTypes||fam.weaponTypes.includes(w?.typeZh||w?.type))).forEach(fam=>{
      const rows=talTierRows(fam,!!state.bp.pvp);
      if(state.bp.optPeak){
        // One attainable band per family; never sum mutually exclusive distance/kill bands.
        tierChoices.push({family:fam.id,bands:talTierPeakBands(fam,!!state.bp.pvp,+state.bp.optDistanceM)});
      }else{
        const band=rows.find(b=>b.id===(tb[fam.id]||(rows.find(x=>x.id!=='off'&&x.rows&&x.rows.length)||{}).id||'off'));
        if(band&&Array.isArray(band.rows))band.rows.forEach(x=>picks.attrs.push({name:x.name,val:+x.val,unit:''}));
      }
    });
  }finally{state.slots=oldSlots;state.gtal=oldGtal;state.wslots=oldWeapons;state.wactive=oldActive;}
  state.bonuses.forEach(k=>{const p=k.split('-'),b=arr(DB.brands)[+p[0]],t=b&&arr(b.bonus)[+p[1]];
    if(t){const pk=bonusPick((b.zh||b.en||b.name||''),t.effects);if(pk.bonus.length)picks.bonuses.push(pk);}});
  state.tweaks.forEach(t=>{if(t.name)picks.tweaks.push({name:t.name,val:+t.val||0,unit:t.unit||''});});
  const params=opt.context?Object.assign({},opt.context.params,{specialTalent:'',bp:state.bp}):bpParams();params.bp=Object.assign({},params.bp,{gearPresent:(gear||[]).map(Boolean),sp:{},spec:buildSpecData()?'':state.bp.spec});
  /* 引擎的「疯狂」分支按**完整循环**建模（fill + 切枪），没有半档参数。
     方案里没有副武器 + 填满时只给 0.25，这里就不喂循环名；有循环（0.55）才按理想分支算。
     峰值档 / 用户显式选 full 仍可看纸面上限，但默认交付不打这个折。 */
  const cycName=combatCycle(talObj?.key);
  params.specialTalent=(cycName&&(!talObj?.key||optCondFactor(talObj.key)>0.5))?cycName:'';
  const compute=()=>{
    const length=picks.attrs.length;
    try{
      if(BUILD_EVAL_TRACE)BUILD_EVAL_TRACE.engineComputeCalls=(BUILD_EVAL_TRACE.engineComputeCalls||0)+1;
      let result=TD2Calc.buildCompute(w,picks,params);
      const dependentKeys=[talObj?.key].concat((gear||[]).map((it,i)=>gtalKeyOfPiece(it,(opt.gtal||state.gtal||[])[i])).filter(Boolean));
      const dependent=combatDependentRowsFor(dependentKeys,result);
      if(dependent.length){
        picks.attrs.push(...dependent);
        if(BUILD_EVAL_TRACE)BUILD_EVAL_TRACE.engineComputeCalls=(BUILD_EVAL_TRACE.engineComputeCalls||0)+1;
        result=TD2Calc.buildCompute(w,picks,params);
      }
      const ti=TD2Calc.BP_TYPE_ORDER.indexOf((w&&(w.typeZh||w.type))||'');
      const names=ti<0?[]:[['ARDamage','SMGDamage','ShotgunDamage','RifleDamage','MMRDamage','LMGDamage','PistolDamage'][ti],attrKey(BP_WT[ti][1]+'伤害','%')];
      result.specHit=buildSpecRows(w).some(a=>a.val>0&&names.includes(a.name));
      result=combatApplyMagRefill(result,w,params,talObj);
      return combatApplyAugments(result,w,params,gear,wslot);
    }finally{picks.attrs.length=length;}
  };
  if(!tierChoices.length)return compute();
  let best=null,bestValue=-Infinity;
  const selected={};
  const visit=i=>{
    if(i===tierChoices.length){
      const result=compute(),value=optTargetValue(result,opt.context?.objective||'sdps');
      if(best===null||value>bestValue){best=result;bestValue=value;best.tierSelection=Object.assign({},selected);}
      return;
    }
    const choice=tierChoices[i],length=picks.attrs.length;
    for(const band of choice.bands){
      selected[choice.family]=band.id;picks.attrs.push(...band.rows.map(x=>({name:x.name,val:+x.val,unit:''})));
      try{visit(i+1);}finally{picks.attrs.length=length;}
    }
  };
  visit(0);return best||compute();
}
/* 战斗参数（界面控件 → 引擎 params）。抽出来是为了让试算与渲染用同一份口径。 */
function bpParams(){
  return {hit:vnum('#p_hit',100),headshot:vnum('#p_hs',10),outcover:vnum('#p_oc',100),
          armorPct:vnum('#p_ar',60),specialTalent:'',bp:state.bp};
}
function recalc(){
  /* 【护栏】**结果区的锚点节点不在 ⇒ 宁可不渲染，也不许抛。**
     这条链路（`load() → renderAll() → recalc()`）是 `/build` 的**启动路径**：中间抛一次，
     后面的 `renderWeapons()` / `renderGear()` / `renderSkills()` 全都不执行 ⇒ 武器槽 / 装备格 / 面板
     **一格都不渲染**，而 `console.error` 计数与「脚本加载失败」计数都是 0（只有 `Runtime.exceptionThrown` 看得见）。
     2026-09-13 真踩：`#r_grid` 改名、而 `recalc()` 里还写着 `$('#r_build').innerHTML=…`。
     现在缺节点就静默返回（`fillGridLabels()` 同样自带护栏），故障缩成「那一块没数字」。 */
  if(!$('#r_build')||!$('#r_grid'))return;
  const wi=state.wactive>=0?state.wslots[state.wactive]:null;
  if(wi==null){
    const gear=state.slots.map((raw,i)=>gearOf(i));
    const gathered=collectGearBonus();
    const gcount=gear.filter(Boolean).length;
    $('#r_build').innerHTML=gcount?`<b>${gcount}/6 ${esc(L('装备','gear'))}</b> · ${esc(L('选择武器后计算枪械输出','Select a weapon to calculate firearm output'))}`:`<span class="spin"></span> ${esc(L('点击上方一把已装武器即可开始计算','Click an equipped weapon to calculate'))}`;
    ['dps','dpm','sdps'].concat(RCELLS.concat(STATCELLS).map(c=>c[0])).forEach(k=>{const el=$('#v_'+k);if(el)el.textContent='—';});
    $('#r_warn').innerHTML='';$('#r_hits').innerHTML='';renderCharts(null);renderAgentPanel(gathered);
    return;
  }
  const w=arr(DB.weapons)[wi];
  if(!w){$('#r_warn').innerHTML=`<div class="wnote">${esc(L('武器数据缺失','Weapon data missing'))}</div>`;return;}
  const gear=state.slots.map((raw,i)=>gearOf(i));
  const gathered=collectGearBonus();                      // 品牌/装备组：官方几件套定值（按件数）
  let r;
  try{r=evalBuild(w,gear,{});}catch(e){$('#r_warn').innerHTML=`<div class="wnote">${esc(L('计算异常','Calc error'))}: ${esc(e&&e.message||e)}</div>`;return;}
  /* 原来这行是「ACR · ACR / — / —」：当前武器名先印一遍，三槽清单里又把它原样带出来（同物两印）。
     清单只列**另外两把**空/非空的槽位，当前这把不再重复。 */
  const wNames=state.wslots.map((x,i)=>i===state.wactive?null:(x==null?'—':nmTxt(arr(DB.weapons)[x]||{})))
    .filter(v=>v!=null).join(' / ');
  const gcount=state.slots.filter(s=>s!=null).length;
  const exN=state.slots.filter((raw,i)=>{const it=gearOf(i);return it&&it.kind==='exotic';}).length;
  const modN=state.gmods.filter(x=>x!=null).length;
  const tierN=gathered.rows.filter(x=>x.on).length;
  $('#r_build').innerHTML=`<b>${esc(nmTxt(w))}</b>${wNames?' · '+esc(wNames):''} · ${gcount}/6 ${esc(L('装备','gear'))} · ${exN} ${esc(L('奇特','exotic'))} · ${modN} ${esc(L('插件','mods'))} · ${tierN} ${esc(L('加成档','tiers'))}
    <span class="bpb">${bpRowHtml(r)}</span>`;
  $('#v_dps').textContent=fmt0(r.DPS); $('#v_dpm').textContent=fmt0(r.DPM); $('#v_sdps').textContent=fmt0(r.SDPS);
  RCELLS.concat(STATCELLS).forEach(([k, , ekey])=>{
    const el=$('#v_'+k); if(!el)return;
    const v=r[ekey];
    el.textContent=(k==='reload')?fmt2(v):(k==='bullet'||k==='panel'||k==='armor'||k==='health'||k==='rpm'||k==='mag')?fmt0(v):fmtN(v);
  });
  $('#r_hits').innerHTML=hitsHtml(r);
  COMBAT_LAST=r;renderAgentPanel(gathered);
  const activeTalent=weaponFixedTalent(w)||TALENTS[state.talents[state.wactive]];
  if($('#p_sp'))$('#p_sp').value=combatCycle(activeTalent?.key);
  renderCharts(r);
  const tgt=$('#bp_target');
  if(tgt){
    let t=null;try{t=enemyTarget();}catch(e){t=null;}
    tgt.textContent=t?L('目标血量 '+fmtDash(t.hp)+' · 装甲 '+fmtDash(t.armor),'Target health '+fmtDash(t.hp)+' · armor '+fmtDash(t.armor)):'';
  }
  /* ⚠️ 这里**只许放结果**（用户第 103 轮：「配装器不要显示那 4 个自注」）——
     原先这里有 4 条 `wnote` 自注：「已计入官方加成：…」「技能（Q/E）当前为展示/占位…」
     「天赋数值未录入（未计入…）/ 引擎按未知属性忽略：…」「装备/武器自身固定词条：按官方 L40 满值计入 N 条…」。
     它们都是**解释我们怎么做的 / 免责**，属于 UI 硬规则① 明令不许出现在界面上的东西，已全部删除。
     口径与算法说明只写在 `docs/*.md`。`#r_warn` 现在只承担两种**结果性**提示：
     计算异常（上一行）与武器数据缺失（上面那行），其余情况一律清空。 */
  $('#r_warn').innerHTML='';
}
/* ── 特工面板：这一套**正在生效**的加成（套装档位 / 件天赋 / 武器天赋），全部现算 ──
   只列「生效了什么、给多少」，不解释怎么算（UI 硬规则①）；专精 / 专长 / 手表 / 精通已经在
   `#r_build` 的徽标行里，这里不重复（红线②）。用户原话：「触发什么加成了也需要在下面的数据里显示出来」。 */
function talentPanelNote(obj,key){
  const bits=[combatStatusText(key)];
  if(obj&&obj.has_skill_script)bits.push(L('技能机制未进枪械结果','Skill mechanics are not in the firearm result'));
  return esc(bits.filter(Boolean).join(' · '));
}
function renderAgentPanel(gathered){
  const box=$('#r_agent');if(!box)return;
  const counted=[], idle=[];
  const row=(name,val)=>`<div class="arow"><span class="ak">${esc(name)}</span><span class="av">${val}</span></div>`;
  const putTalent=(obj,key,name)=>{
    const fed=key?combatVisibleRows(String(key).toLowerCase()):[];
    if(fed.length)counted.push(row(name,fed.map(x=>`${esc(buildEffectLabel(x.name))} ${esc(fmtN(x.val))}`).join(' · ')));
    else idle.push(row(name,talentPanelNote(obj,key)));
  };
  (gathered&&gathered.rows||[]).forEach(t=>{
    if(!t.on)return;
    /* 「已进入本次枪械结果」必须真的**进了**：品牌/套装档位 effects 里有一部分属性名引擎根本不收录
       （全库 41 行 `提升威胁度`，`result.ignoredAttrs` 当场承认被丢弃），照原样 push 就成了同一个面板
       上方写"已进入"、下方体检写"尚未计算的属性"。按 `affixEngineRead` 同一条判据分流：
       进了的留 counted，没进的落 idle 并带「不计入」，两处口径从此同源。 */
    const parts=arr(t.effects).map(e=>({e,read:affixEngineRead(attrKey(e.attr_zh||e.attr_en||'',e.unit||''))}));
    const fmtEff=p=>`${esc(p.e.attr_zh||p.e.attr_en||'')} ${esc(fmtN(p.e.value))}${esc(p.e.unit||'')}`;
    const inR=parts.filter(p=>p.read),outR=parts.filter(p=>!p.read);
    if(inR.length)counted.push(row(t.zh+' '+t.pieces,inR.map(fmtEff).join(' · ')));
    if(outR.length)idle.push(row(t.zh+' '+t.pieces,outR.map(fmtEff).join(' · ')+' · '+UNCOUNT_TITLE()));
    arr(t.talents).forEach(tl=>{
      const key=String(tl.key||'').toLowerCase();
      const nm=tl.zh||tl.en||tl.name||key;
      if(!nm)return;
      putTalent(TALENT_BY_KEY[key]||tl, key, nm);
    });
  });
  gtalInPlay().forEach(({key:k})=>{
    const obj=TALENT_BY_KEY[k];if(!obj)return;
    putTalent(obj,k,nmTxt(obj));
  });
  if(state.wactive>=0){
    const w=DB.weapons[state.wslots[state.wactive]];
    const spec=buildSpecData();
    const specRows=buildSpecRows(w);
    if(spec&&specRows.length)counted.push(row(L(spec.zh||spec.en||'专长',spec.en||spec.zh||'Specialization'), specRows.map(x=>`${esc(buildEffectLabel(x.name))} ${esc(fmtN(x.val))}`).join(' · ')));
    const wt=w&&(weaponFixedTalent(w)||TALENTS[state.talents[state.wactive]]);
    if(wt&&wt.key)putTalent(wt,wt.key,nmTxt(wt));
  }
  state.skill.forEach((si,i)=>{
    if(si<0)return;
    const s=SKILLS[si],v=skillVariantOf(s,state.skillVariant[i]);
    const skillTier=activeSkillTier(v&&v.code);
    const tier=v&&arr(v.tiers).find(x=>+x.req===skillTier);
    const eff=tier?arr(tier.effects).map(e=>`${esc(L(e.name_zh||e.name_en||e.attr,e.name_en||e.name_zh||e.attr))} ${esc(skillEffectValue(e))}`).join(' · '):'';
    const skillNote=(s&&s.has_skill_script)||(v&&v.has_skill_script)?(' · '+L('技能机制未进枪械结果','Skill mechanics are not in the firearm result')):'';
    idle.push(row((i===0?'Q':'E')+'·'+(v?L(v.zh||v.en,v.en||v.zh):L(s.zh,SKILL_EN[s.zh]||s.zh)), esc(L('技能阶','Tier')+' '+skillTier+(eff?' · '+eff:'')+' · '+skillExpertiseText(v&&v.code,i)+skillNote)));
  });
  const sec=(zh,en,list)=>list.length?`<details class="agent-fold"><summary>${esc(L(zh,en))} · ${list.length}</summary>${list.join('')}</details>`:'';
  const missed=idle.length?`<p class="result-missed">${esc(L(idle.length+' 项未进入上面的枪械数字。',' '+idle.length+' effects are not in the firearm numbers above.'))}</p>`:'';
  box.innerHTML=missed+sec('已进入本次枪械结果','In this firearm result',counted)+sec('只展示、未进 DPS','Shown only, not in DPS',idle);
}
/* 天赋描述里的数值点亮：发亮但**不加粗**（红线③：数字 font-weight ≤ 500）。
   拆成「先转义 / 再点亮」两步，是因为带内嵌图标的描述必须在转义后、点亮前插入图标节点
   （否则序号数字会被 `<i class="tnum">` 吃掉，占位符就还原不出来了）。`hlNum` 行为逐字不变。 */
function hlNumEsc(s){return String(s).replace(/(\d+(?:\.\d+)?[%秒米]?)/g,'<i class="tnum">$1</i>');}
function hlNum(s){return hlNumEsc(esc(s));}
/* 官方 desc 会内嵌 `<img src="hunter/baked/ui/loose_images/ui_player_offense|defense|utility.dds">`
   来表达**核心属性类别**（实测全库 9 条天赋在用，如 `warlock_talent_exotic_backpack_mk2`「追悼」、
   `talent_exotic_gloves_mk1_b`「能量灌注」）。判据只这张表，不再写第二套；两个出口共用一个内核：
     · `talentDescCore` 把 `<img>` 换成私有区占位符 `\uE000序号\uE001`（普通字符，活过 `box.textContent`），
       认不出的 `<img>` 连同表外的名字一律丢弃；
     · `talentDescPlain` → 文字标签 `[攻击]/[防御]/[效能]`（要塞进 `title`/aria，输出与旧版逐字符一致）；
     · `talentDescHtml`  → 行内真图标，复用本页 `.axic` 样式族（`build.layout.css:44`，mask + `currentColor`，
       白线稿在浅色主题下也跟着文字变色，与资料库 `.qic` 同一做法）。
   ⚠️ 官方文本一律先 `esc()` 再拼；进 `innerHTML` 的 `<i>` 只由上面那张常量表构造，URL 走 `imgUrl`（戳拼 `IMGV`）。 */
const TALENT_MARK_ICONS=[
  [/red|offen|firepower/,'ui/ui_player_offense.png','攻击','Offense'],
  [/blue|defen|armor/,'ui/ui_player_defense.png','防御','Defense'],
  [/yellow|util|skill/,'ui/ui_player_utility.png','效能','Utility']];
function talentDescCore(t,on){
  const ic=[];
  /* 先把官方文本里可能出现的私有区字符清掉，占位符通道才不会被正文自己伪造。 */
  let s=(talentDescText(t,on)||'').replace(/[\uE000\uE001]/g,'');
  s=s.replace(new RegExp('<'+'img\\b[^>]*>','gi'),tag=>{
    const hit=TALENT_MARK_ICONS.find(x=>x[0].test(tag.toLowerCase()));
    if(!hit)return '';
    ic.push(hit);
    return '\uE000'+(ic.length-1)+'\uE001';
  }).replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p\s*>/gi,'\n').replace(/<\/li\s*>/gi,'\n');
  const box=document.createElement('div');box.innerHTML=s;s=box.textContent||'';
  return {text:s.replace(/\{\d+\}/g,L('未提供数值','value unavailable')).replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim(),icons:ic};
}
function talentDescPlain(t,on){
  const {text,icons}=talentDescCore(t,on);
  return text.replace(/\uE000(\d+)\uE001/g,(m,i)=>{const h=icons[+i];return h?L('['+h[2]+']','['+h[3]+']'):'';});
}
function talentDescIconTag(h){
  const lbl=esc(L(h[2],h[3]));
  return `<i class="axic" role="img" aria-label="${lbl}" title="${lbl}" style="--axm:url('${imgUrl(h[1])}');--axc:currentColor"></i>`;
}
function talentDescHtml(t,on){
  const {text,icons}=talentDescCore(t,on);
  return text.split(/\n+/).filter(Boolean).map(line=>esc(line).split(/(\uE000\d+\uE001)/).map(seg=>{
    const m=/^\uE000(\d+)\uE001$/.exec(seg);
    if(!m)return hlNumEsc(seg);
    const h=icons[+m[1]];return h?talentDescIconTag(h):'';
  }).join('')).join('<br>');
}
/* ── 静态文案（语言切换时刷新） ── */
function applyLangText(){
  const put=(id,zh,en)=>{const el=$(id);if(el)el.textContent=L(zh,en);};
  put('#s_weapons','武器','Weapons');put('#s_gear','装备','Gear');put('#s_skills','技能','Skills');
  put('#h_tw','手填词条','Manual Affix');
  put('#h_cond','战斗条件','Combat Params');put('#h_res','属性与加成','Stats & bonuses');put('#h_analysis','伤害分析','Damage Analysis');
  /* 开发状态提示：与 `dashboard_build.html` 里预置的中文同句，切语言时由这里覆盖。 */
  put('#build-wip','配装器仍在开发中，部分功能尚未完善，结果仅供参考。',
      'The build planner is still under development — some features are incomplete. Results are for reference only.');
  put('#l_hit','命中率 %','Hit %');put('#l_hs','爆头率 %','Headshot %');put('#l_oc','掩体外比例 %','Out-of-cover %');put('#l_ar','装甲比例 %','Armor %');put('#l_sp','当前天赋的弹匣循环','Magazine cycle for active talent');
  put('#l_bpvp','PvP 模式（天赋取官方 PvP 数值）','PvP mode (official PvP talent values)');put('#l_bspec','专长','Specialization');put('#l_bsp','专长加成 15%','Specialization bonus 15%');put('#l_bexp','精通','Expertise');
  put('#l_bwatch','千级手表','Watch (1000)');
  put('#l_bproto','原型升级','Prototype upgrades');
  put('#l_btier','装备天赋档位','Gear-talent tiers');
  put('#l_be','装甲目标设置','Armor target');put('#l_hitgrid','命中伤害','Hit damage');
  /* 精通两项要保留 <b> 里的当前等级（数字不加粗的规则由 CSS 负责，这里不能整块 textContent 覆盖） */
  const wexp=$('#l_bwexp'),gexp=$('#l_bgexp'),wev=$('#bp_wexp_v'),gev=$('#bp_gexp_v');
  if(wexp&&wev)wexp.innerHTML=esc(L('武器精通','Weapon expertise'))+' <b id="bp_wexp_v">'+esc(wev.textContent)+'</b>';
  if(gexp&&gev)gexp.innerHTML=esc(L('防具精通','Gear expertise'))+' <b id="bp_gexp_v">'+esc(gev.textContent)+'</b>';
  put('#reset','清空','Reset');
  put('#h_opt','一键配装','Build optimizer');
  put('#h_optreq','目标与条件','Goals & constraints');
  /* 「确认清空？」只是按钮文字，任何一次别处的重渲都会把它抹平 ⇒ 状态位必须跟着归零，
     否则「点亮 → 去干别的 → 回来点一下」会直接清空（第一下被吃掉了）。 */
  state.armReset=false;
  /* 原来这里是 101 字的「我们怎么算的」（全部取自官方库 / 逐件按官方判定 / 库里 N 件…）——
     UI 硬规则①：只留**能操作的那句**，件数与判据的账目写在 docs/DESIGN-GEARDB.md。 */
  put('#hint_gear','点一格选装备；没有插件位的格子可点 OVR 临时开一格。',
      'Click a slot to pick gear. OVR opens a mod slot on a piece without one.');
  put('#hint_sk','点击 Q/E 从 '+SKILLS.length+' 技能库里选技能。','Click Q/E to pick from the '+SKILLS.length+'-skill library.');
  put('#hint_tw','上面 '+BP_EXTRA_FIELDS.length+' 项是手动补偿项；下面可再加任意属性行。',
      'The '+BP_EXTRA_FIELDS.length+' fields above are manual compensation values; add any extra rows below.');
  $('#twadd').textContent=L('＋ 添加一行','+ Add row');
  /* 页脚：数据源 + 运行时现算的件数（不放任何「我们怎么做的」说明 —— 那些只写在文档里） */
  $('#foot').textContent=L('Y8S3.1 官方游戏数据 · 非官方配装工具 · 游戏商标与素材版权归 Ubisoft 所有','Official Y8S3.1 game data · Unofficial build tool · Game trademarks and assets belong to Ubisoft');
  $('#hdrt').textContent=L('配装器','Build Planner');
  /* ⚠️ **别再写 `$('#l_dps').textContent` 这类句子**：结果面板改成 `RCELLS` 驱动的 `#r_grid` 之后，
     `#l_dps` / `#l_dpm` / `#l_sdps` 三个静态标签已经不存在了 —— 留着这三行就是
     `TypeError: Cannot set properties of null`，而它从 `load() → renderAll() → applyLangText()`
     抛出 ⇒ **整个 `/build` 页面一格都不渲染**（武器槽 / 装备格 / 面板全空），
     并且**一条 console.error 都没有**（只有 `Runtime.exceptionThrown`）。
     2026-09-13 真踩：static 断言全绿、pytest 全绿，只有真机冒烟点「空武器槽」时才炸出来。
     `#r_grid` 的标签一律由 `fillGridLabels()` 按 `RCELLS` 生成，语言切换走 `renderAll()` 重画。 */
  const lang=$('#lang');if(lang)lang.textContent=langLabel();
  /* 装甲目标四排各自的标签（原来四排 chip 只挂在一个总标题下 ⇒ 用户得记住哪排是什么） */
  put('#l_be_prog','兵种','Role');put('#l_be_diff','难度','Difficulty');
  put('#l_be_team','人数','Players');put('#l_be_esc','恶化','Escalation');
  /* 页头与主行动：原来这三个按钮的文字只写在 HTML 里，切「原文」时它们仍是中文 */
  put('#exp','导出','Export');put('#imp','导入','Import');
  /* ⚠️ 判据必须是 `res.ok`，不是 `res` 真值：算失败时 `state.opt.res` 也非空（`{ok:false}`），
     原来按钮会写着「预览待应用」而结果区一颗按钮都没有 —— 状态在撒谎。 */
  const or=$('#optrun');if(or)or.textContent=(state.opt&&state.opt.res&&state.opt.res.ok&&!state.opt.applied)
    ?L('预览待应用','Preview ready'):L('开始配装','Run optimizer');
  /* ⚠️ 搜索框 `#tq` / 品牌搜索 `#bq` 已随那两张卡一起删除：天赋搜索现在长在**天赋选择器弹窗**里
     （`#dlgq`，共用同一套 `state.tq`），品牌卡整张去掉（几件套加成按已装件数自动计入，不需要手动勾）。 */
  const sp=$('#p_sp');sp.options[0].text=L('标准（无）','Standard (none)');
  /* 弹匣专精选项：value 必须保持中文（引擎契约），仅换显示文本 */
  const SP_EN={'计算':'Controlled','完美计算':'Perfect Controlled','疯狂':'Frenzied','完美疯狂':'Perfect Frenzied'};
  for(let i=1;i<sp.options.length;i++){const o=sp.options[i];o.text=LANG==='zh'?o.value:(SP_EN[o.value]||o.value);}
}
/* 整页重渲会重建几乎所有节点 ⇒ 键盘用户的焦点每次都会掉回 BODY（实测：从「＋ 选择」展开候选之后
   焦点就没了，Tab 得从页首重新走一遍，主行动距装配台 102 个站点）。
   重渲**前**记下焦点落在哪个控件上（按 `data-act` + `data-i` + `data-k` 定位，不存节点引用），
   重渲**后**找回同一颗。 */
let focusAnchor=null;
function captureFocus(){
  if(focusAnchor)return;                      // 幂等：renderAll → renderGear 这条链上会被叫两次
  const a=document.activeElement;
  if(!a||!a.closest)return;
  const el=a.closest('[data-act]');
  focusAnchor=el?{act:el.dataset.act,i:el.dataset.i==null?null:el.dataset.i,k:el.dataset.k==null?null:el.dataset.k}:null;
}
function restoreFocus(){
  /* 弹窗自己管理焦点（openDlg 落搜索框、关窗回原格）⇒ 它开着的时候本函数不插手，
     否则会把焦点从弹窗里抢回装配台。 */
  if(state.dlg)return;
  const f=focusAnchor;focusAnchor=null;
  if(!f)return;
  const cur=document.activeElement;
  /* 「还在原位」必须**还挂在文档上**：`renderGear()` 之后手里那颗 chip 已经脱链，
     而脱链节点的 `closest()` 会命中它自己 ⇒ 误判成不用抢焦点，焦点实际掉进空气（实测 focusAfter=INPUT）。 */
  if(cur&&cur.isConnected&&cur!==document.body&&cur.closest&&cur.closest('[data-act="'+f.act+'"]'))return;
  let sel='[data-act="'+f.act+'"]';
  if(f.i!=null)sel+='[data-i="'+f.i+'"]';
  if(f.k!=null)sel+='[data-k="'+CSS.escape(f.k)+'"]';
  const el=document.querySelector(sel);
  if(el&&typeof el.focus==='function')el.focus({preventScroll:true});
}
function renderAll(){
  captureFocus();
  applyLangText();renderWeapons();renderGear();renderSkills();renderTweaks();renderParams();renderOpt();
  const bw=$('#bp_watch');if(bw)bw.checked=!!state.bp.watch;
  const bp=$('#bp_pvp');if(bp)bp.checked=!!state.bp.pvp;
  renderPvpNote();
  fillGridLabels();recalc();renderCombatAudit();
  if(state.dlg)renderDlg();else closeDlg();
  refocusBack();                                // 刚关掉弹窗 ⇒ 焦点回到那一格（键盘选件的下一跳才不会掉）
  restoreFocus();                               // 其余一切重渲：把焦点放回用户刚才那颗控件上
  scheduleSync();                               // 每一次重渲之后落一份本地存档（刷新不再回到空页）
  if(typeof buildLayoutPaint==='function')buildLayoutPaint();
  buildPickerNotice();
}
/* ── 事件（单一委托） ── */
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el)return;
  captureFocus();                             // 任何一次点击之前先把焦点锚点记下来（含只走局部渲染的 case）
  const act=el.dataset.act,i=el.dataset.i!=null?+el.dataset.i:null;
  switch(act){
    /* 武器槽：**空着 = 选枪；已经有枪 = 也是选枪**（要换别的枪就直接重开列表，用户第 4 轮：
       「武器选择了，再点不应该是再选择武器吗」）。原来已选时只切「当前武器」—— 那是给「面板上的数值
       跟着哪把枪走」，玩家根本感知不到，等于点了没反应。当前武器改为**顺手带上**（进列表时它高亮）。 */
    case 'wsl':{openDlg('w',i);break;}
    case 'wactivate': state.wactive=i;break;
    case 'wpick': openDlg('w',i);break;
    /* 武器卡上的天赋名：点它开官方天赋列表（每把枪各自一个天赋） */
    case 'wsl-tal': openDlg('t',i);break;
  case 'wtal-info': showTalentInfo(i);break;
    case 'wclear':{state.wslots[i]=null;state.talents[i]=-1;state.wmods[i]=null;state.waffix[i]=null;if(state.wactive===i)state.wactive=state.wslots.findIndex(x=>x!=null);break;}
    /* 装备卡上的词条区（面板直接选，用户第 110 轮）：
       这些 chip 长在装备卡内部，`closest('[data-act]')` 会直接命中它们自己 ⇒ 天然不会冒泡到
       `gcard`（不会出现「点词条却弹出选装备列表」）。 */
    /* ── 一键配装（用户第 111 轮）── */
    case 'optrun': askOpt();break;
    /* 「应用到配装台」才是**唯一**会动用户手配的那一下；`askOpt()` 只算、不落地。 */
    case 'optapply': commitOpt();break;
    case 'optx':{state.opt.res=null;state.opt.applied=false;state.opt.lockStale=false;break;}
    case 'optdrop':{state.opt.flow='';state.opt.cons=[];state.opt.res=null;state.opt.applied=false;renderOpt();askOpt();return;}
    /* 失败态给出口：把两个「至少几件」各松一档再算（不动用户圈定的池子本身）。 */
    case 'optloosen':{const q=req();q.bmin=Math.max(1,(q.bmin||3)-1);q.cmin=Math.max(1,(q.cmin||3)-1);
      state.opt.res=null;state.opt.applied=false;renderOpt();askOpt();return;}
    /* 撤销一键配装：优化会重排 6 格（并把换掉的格位词条清空）⇒ 必须能一键退回动手前的配装 */
    case 'optundo': optRestore(state.opt.undo);state.opt.applied=false;break;
    case 'optcadd':{
      const k=$('#bp_ocon')?$('#bp_ocon').value:'';
      const op=$('#bp_ocmp')?$('#bp_ocmp').value:'min';
      const raw=$('#bp_oval')?parseFloat($('#bp_oval').value):NaN;
      if(!k||!isFinite(raw))break;
      state.opt.cons.push({kind:'num',key:k,op:op==='max'?'max':'min',val:raw});
      state.opt.res=null;state.opt.applied=false;renderOpt();break;
    }
    case 'optcdel': state.opt.flow='';state.opt.cons.splice(i,1);renderOpt();break;
    /* 搜索式多选的两颗「＋」：把输入框里那一行文字换成条件键（判据见 `reqAdd`）。 */
    case 'optreqbadd': reqAdd('b');break;
    case 'optreqaadd': reqAdd('a');break;
    /* ── 6 条硬条件（用户第 300 轮定稿）─────────────────────────────────────────
       ①品牌（多选 chip）/ ②主武器（下拉）/ ③专长（单选 chip）/ ④手表（开关）
       ⑤核心属性（多选 chip）/ ⑥副属性（多选 chip，上限 2 —— 多选第 3 个时**替换最早的**，
       并如实提示，不许静默丢掉一个让用户以为选上了）。
       判定与取值全部在 `build.req.js`；这里只改 `state.opt.req` 然后重渲那一块。 */
    case 'optreqb':{
      const k=el.dataset.k||'',cur=arr(state.opt.req.brands);
      state.opt.req.brands=cur.indexOf(k)>=0?cur.filter(x=>x!==k):cur.concat([k]);
      renderOpt();break;
    }
    case 'optreqs':{
      /* 「不限」那颗的 key 是空串 ⇒ 点它 = 清空（与其余 chip 互斥） */
      const k=el.dataset.k||'';
      state.opt.req.spec=(k===''||state.opt.req.spec===k)?'':k;
      renderOpt();break;
    }
    case 'optreqc':{
      const k=el.dataset.k||'',cur=arr(state.opt.req.core);
      state.opt.req.core=cur.indexOf(k)>=0?cur.filter(x=>x!==k):cur.concat([k]);
      renderOpt();break;
    }
    case 'optreqa':{
      const k=el.dataset.k||'',cur=arr(state.opt.req.affix);
      if(cur.indexOf(k)>=0)state.opt.req.affix=cur.filter(x=>x!==k);
      else state.opt.req.affix=(cur.length>=2?cur.slice(1):cur).concat([k]);   // 上限 2：挤掉最早的
      renderOpt();break;
    }
    /* 单件锁定（用户第 5 条）：锁住的格在「全部重排」里保留当前件 */
    case 'glock':{const k=i;state.opt.lock[k]=!state.opt.lock[k];
      /* 改锁要作废**还没应用**的优化结果：`optimizeBuild()` 是按当时的 lock 集合评分的
         （锁在 `optimizeBuild()` 里三处生效：基座保底 / 坐标下降跳过 / 精修跳过），事后改锁再点「应用」就会把用户刚锁住那格换掉
         （2026-10-15 实测：预览 → 锁住面具格 → 应用 ⇒ 该件 439→462 照换、`changed=6`）。 */
      if(state.opt.res&&!state.opt.applied){state.opt.res=null;state.opt.lockStale=true;renderOptRes();}
      renderGear();break;}
    case 'gfxc':{const c=el.dataset.k||'';state.core[i]=(state.core[i]===c?null:c);break;}
    /* 词条行（`data-act="gfxo"`）：**展开 / 收起候选**（每一行「词条」自己就是开关；
       原来那行「＋ 副属性候选 / 收起候选」的标签已删 —— 用户：多余）。
       ⚠️ 这一条原来没有 case —— 那颗「＋ 选择」画在卡上、点了**什么都不发生**（死按钮）。
       玩家看到「＋ 选择」当然会去点它，点不动就只能自己去猜下面那行小字才是入口（用户实测抱怨的正是这里）。 */
    case 'gfxo': state.axopen=(state.axopen===i)?-1:i;renderGear();return;
    /* 清掉该格第 k 个词条的已选值（候选里再点已选中的那颗也能取消，这里给一个明确的「×」） */
    case 'gfxx':{
      const k=+el.dataset.k;const cur=arr(state.affix[i]).slice();
      if(k>=0&&k<cur.length)cur[k]='';
      state.affix[i]=cur;recalc();renderGear();return;
    }
    case 'gfxa':{
      /* 副属性：一件的随机槽共用一个候选集合（官方按 攻击/防御/效能 分三组，组内 4 项）
         ⇒ 点一项填进第一个空槽；再点已选中的 = 取消；槽满且都没命中 = 换掉最后一槽。 */
      const c=el.dataset.k||'',it=gearOf(i);if(!it)return;
      const n=nRandomSlots(it),cur=arr(state.affix[i]).slice();
      while(cur.length<n)cur.push('');
      const at=cur.indexOf(c);
      if(at>=0)cur[at]='';
      else{const e=cur.indexOf('');if(e>=0)cur[e]=c;else cur[n-1]=c;}
      state.affix[i]=cur.slice(0,n);
      recalc();renderGear();return;
    }
    case 'gcard': if(el.closest('#ggrid')&&gearOf(i)&&typeof buildOpenGearEditor==='function'){buildOpenGearEditor(i);return;}el.focus({preventScroll:true});openDlg('g',i);break;
    case 'gear-edit': if(typeof buildOpenGearEditor==='function')buildOpenGearEditor(i);return;
    /* 选装备抽屉第一屏的三件事（用户：「和参考工具一样，点一下直接填入」）：
       gfill = 点品牌 / 装备组 / 具名 / 奇特块 ⇒ 直接换上（代表件判据见 `gearFillFromKey`）；
       glist = 逐件挑（原来的件列表视图，类别行只摆该部位真有件的）；
       gswap = 卡上的「换一件」⇒ 直接进逐件挑并筛到这一组 */
    case 'gfill': gearFillFromKey(i,el.dataset.k||'',el);return;
    case 'glist':{const d=state.dlg;if(!d)return;d.mode='list';renderDlg();return;}
    case 'gswap':{const it=gearOf(i);openDlg('g',i);const d=state.dlg;
      if(d){d.mode='list';d.gkind=(it&&it.kind==='gearset')?'gearset':'brand';d.sub=gearGroupKey(it)||'';}
      renderDlg();return;}
    case 'modblk': openDlg('m',i);break;
    /* 件天赋（背包 / 胸甲 卡片脚行那颗）：独立 `kind:'gt'`。
       ⚠️ **不复用 `'t'`**（武器天赋）：`'t'` 整段按武器槽语义写死（`W_SLOTS` 标题、`state.talents[d.slot]`、
       `slotWeaponCls(d.slot)`、`pickt` 写 `state.talents`）⇒ 复用会把装备天赋静默串到武器槽上。 */
    case 'gtal': openDlg('gt',i);break;
    /* 武器卡上的插槽行：点开该槽的官方候选配件（`build.view.js` 的 `wmodBlock`）。
       与 `modblk`（装备插件）同一形状，只是要带上「哪把枪的哪个槽」（`state.wactive` 决定拿哪把）。 */
    case 'wmod': openDlg('wm',i,el.dataset.s||'');break;
    case 'ovr':{state.ovr[i]=!state.ovr[i];if(!state.ovr[i])state.gmods[i]=null;break;}
    case 'skl': openDlg('s',i!=null?i:+el.dataset.k);break;
    case 'sklclr':{const k=+el.dataset.k;state.skill[k]=-1;state.skillVariant[k]=null;break;}
    /* 天赋分类 chip（在天赋选择器弹窗里）：改完要重渲**弹窗**，不是整页 */
    case 'tk': state.tkind=el.dataset.k||'';if(state.dlg&&state.dlg.kind==='t'){renderDlg();return;}break;
    case 'bon':{const p=state.bonuses.indexOf(el.dataset.k);p>=0?state.bonuses.splice(p,1):state.bonuses.push(el.dataset.k);break;}
    /* 战斗参数：专精 / 专长 15% / 装甲目标设置（都是「选中态」单选或开关，值原样进 engine 的 params.bp） */
    case 'bpspec':{
      state.bp.spec=el.dataset.k||'';
      /* 节点树按专长分片取 ⇒ 换专长要先把它那份取回来再重渲（`buildSpecRows()` 在 recalc 里同步要 nodes）。
         已加载过时 `buildSpecEnsure()` 立刻 resolve，不产生额外请求。 */
      if(typeof buildSpecEnsure==='function'){buildSpecEnsure(state.bp.spec).then(()=>renderAll());return;}
      break;
    }
    case 'bpsp':{const k=el.dataset.k;state.bp.sp[k]=!state.bp.sp[k];break;}
    case 'bptech':state.bp.technicianBranch=el.dataset.k==='healing'?'healing':'damage';break;
    case 'bpovercharge':state.bp.overcharge=!state.bp.overcharge;break;
    /* 装备天赋档位：`族:档`（值只进 `state.bp.tiers`，由 `evalBuild()` 换成引擎入参行） */
    case 'bptier':{const p=(el.dataset.k||'').split(':');
      if(p.length===2&&p[0]&&p[1])state.bp.tiers[p[0]]=p[1];break;}
    case 'bpe':{const p=(el.dataset.k||'').split(':'),v=+p[1];const e=state.bp.enemy;
      if(p[0]==='progression')e.progression=v;else if(p[0]==='difficulty')e.difficulty=v;
      else if(p[0]==='players')e.players=v;else if(p[0]==='escalation')e.escalation=v;break;}
    /* 天赋弹窗的「完美版」开关：普通枪默认只列普通版（完美版是具名件自带的加强版） */
    case 'tperfect': state.tperfect=!state.tperfect;renderDlg();return;
    case 'tw-add': state.tweaks.push({name:'',val:0,unit:'%'});renderTweaks();return;
    case 'tw-del': state.tweaks.splice(i,1);renderTweaks();break;
    /* 「清空」= 一个字面量里显式列出全部键。⚠️ 2026-09-14 补齐三处：
       ① `gtal`（件天赋 6 格，本轮新增 —— 不列在这里就是「清空后天赋还在」的第三个漏项）；
       ② `opt`（一键配装的目标 / 条件条 / 单件锁 / **撤销快照**）—— 原先漏掉 ⇒ 实测「清空」之后
          点「撤销」能把已经清空的配装**还原回来**（`undo` 里还留着上一套的快照）；
       ③ `tperfect`（「含完美版」开关）—— 该键**根本不在 `state` 字面量里**（`build.app.js` 动态挂的），
          `Object.assign` 当然碰不到它 ⇒ 跨「清空」存活。 */
    case 'reset':{
      /* 第一下只把按钮点亮成「确认清空？」，第二下才真的清 —— 原生 confirm 会遮住整页、
         且在读屏里把背景内容一并吞掉；两步确认在键盘与鼠标上是同一条路径。 */
      if(!state.armReset){state.armReset=true;const b=$('#reset');if(b)b.textContent=L('确认清空？','Confirm reset?');return;}
      buildPickerUndo=null;state.armReset=false;Object.assign(state,{wslots:[null,null,null],wactive:-1,slots:[null,null,null,null,null,null],ovr:[false,false,false,false,false,false],gmods:[null,null,null,null,null,null],wmods:[null,null,null],waffix:[null,null,null],skill:[-1,-1],skillVariant:[null,null],talents:[-1,-1,-1],tq:'',tkind:'',bonuses:[],bq:'',tweaks:[],bp:bpDefaults(),core:[null,null,null,null,null,null],affix:[[],[],[],[],[],[]],gtal:[null,null,null,null,null,null],axopen:-1,cq:'',dlg:null,opt:{target:'sdps',wtype:0,cons:[],lock:[false,false,false,false,false,false],lockW:false,res:null,undo:null,changed:0},tperfect:false});clearSaved();break;}
    /* 弹窗 */
    case 'noop': return;
    case 'dlgx': closeDlg();renderAll();return;
    case 'dwtype': state.dlg.wtype=i;renderDlg();return;
    /* 武器类别维度（金装 / 具名 / 奇特）：与 `dwtype`（枪型）**两个独立维度**，互不替代。
       口径见 `W_KINDS` / `wKindOf()`（官方 `exotic` / `named` 布尔 ⇒ 参考工具的 `Rarity` 0/2/3）。 */
    case 'dwkind': state.dlg.wkind=el.dataset.k||'';renderDlg();return;
    case 'dgwall': state.dlg.wallkind=el.dataset.k;state.dlg.q='';renderDlg();return;
    case 'dgkind': state.dlg.gkind=el.dataset.k||'';state.dlg.sub='';renderDlg();return;
    /* 装备选择器的第二行维度（品牌 / 装备组）：换维度时清掉上一维度的选中值，
       否则「品牌」阶段选的 key 会留着把「装备组」阶段的列表筛成空（静默 0 行）。 */
    case 'dgsub': state.dlg.sub=el.dataset.k||'';renderDlg();return;
    case 'picker-apply': buildPickerCommit();return;
    case 'picker-back': buildPickerBack();return;
    case 'picker-undo': buildPickerRevert();return;
    case 'dlgclr':{const d=state.dlg;if(!d)return;
      if(d.kind==='g'||d.kind==='w'){buildPickerCommit(true);return;}
      if(d.kind==='w'){state.wslots[d.slot]=null;state.talents[d.slot]=-1;state.wmods[d.slot]=null;state.waffix[d.slot]=null;if(state.wactive===d.slot)state.wactive=state.wslots.findIndex(x=>x!=null);}
      else if(d.kind==='g'){state.slots[d.slot]=null;state.gmods[d.slot]=null;autoFillGear(d.slot);}
      else if(d.kind==='m'){state.gmods[d.slot]=null;}
      else if(d.kind==='t'){state.talents[d.slot]=-1;}
      /* 件天赋：取消 = 回到「不装」（`null`），与 `pickt` 的 `-1` 同义 */
      else if(d.kind==='gt'){state.gtal[d.slot]=null;}
      /* 武器配件：清掉**该槽这一件**的插槽选择（不是整把枪的）—— 固定件本来就不占选择，无需动 */
      else if(d.kind==='wm'){if(state.wmods&&state.wmods[d.slot])delete state.wmods[d.slot][d.wslot];}
      else{state.skill[d.slot]=-1;state.skillVariant[d.slot]=null;}
      closeDlg();renderAll();return;}
    case 'pickw':{const row=DLG_ROWS[+el.dataset.row];if(row)buildPickerSelect('w',row[1],el);return;}
    case 'pickg':{const row=DLG_ROWS[+el.dataset.row];if(row)buildPickerSelect('g',row[2],el);return;}
    case 'pickm':{const d=state.dlg,row=DLG_ROWS[+el.dataset.row];if(!d||!row){closeDlg();break;}const i=row[1];state.gmods[d.slot]=state.gmods[d.slot]===i?null:i;closeDlg();break;}
    case 'skprev':{const d=state.dlg;if(!d||d.kind!=='s')return;d.skillPreview=+el.dataset.row||0;const s=SKILLS[d.skillPreview],db=skillDbOf(s);d.skillVariant=(db&&db.variants&&db.variants[0]&&db.variants[0].code)||null;renderDlgList();return;}
    case 'skvar':{const d=state.dlg;if(!d||d.kind!=='s')return;d.skillVariant=el.dataset.v||null;renderDlgList();return;}
    case 'picks':{const d=state.dlg,row=DLG_ROWS[+el.dataset.row];if(!d||!row){closeDlg();break;}const i=row[1];state.skill[d.slot]=i;state.skillVariant[d.slot]=el.dataset.v||d.skillVariant||null;closeDlg();break;}
    case 'pickt':{const d=state.dlg,row=DLG_ROWS[+el.dataset.row];if(!d||!row){closeDlg();break;}const i=row[1];state.talents[d.slot]=state.talents[d.slot]===i?-1:i;closeDlg();break;}
    /* 件天赋（背包 / 胸甲）：写 `state.gtal[格位]` = 官方 `talents_official[].key` 串（与 `core` 存 code 串同构）。
       ⚠️ 行是 `[key, 天赋对象]` ⇒ **第 0 位才是 key**（`pickt` 那边第 1 位是下标，两者形状不同，别照抄）。
       ⚠️ 落地前校验这条 key **就在该格的池里**（换过件 / 数据层重排 ⇒ 旧 key 会指向别件才有的天赋），
          与 `pickg` 的 `GEAR_MAP[raw]` 校验同一思路：宁可判空，不许指向别件。
       再点一次 = 取消（与 `pickt` 同款）。 */
    case 'pickgt':{const d=state.dlg,row=DLG_ROWS[+el.dataset.row];if(!d||!row){closeDlg();break;}
      const pk=row[0];
      if(gtalPool(d.slot).keys.indexOf(pk)<0){closeDlg();break;}
      state.gtal[d.slot]=(state.gtal[d.slot]===pk)?null:pk;closeDlg();break;}
    /* 武器配件：写进 `state.wmods[武器槽位][插槽 code]`（三把枪各自一套）。
       ⚠️ 落地前校验候选仍然有效（换过枪 / 数据层重排 ⇒ 旧下标会指向别的配件），
          与 `pickg` 的 `GEAR_MAP[raw]` 校验同一思路：宁可判空，不许指向别的件。 */
    case 'pickwm':{const d=state.dlg,row=DLG_ROWS[+el.dataset.row];if(!d||!row){closeDlg();break;}
      const idx=row[1], w=arr(DB.weapons)[state.wslots[d.slot]];
      if(!w||wmCands(w,d.wslot).indexOf(idx)<0){closeDlg();break;}
      const cur=(state.wmods&&state.wmods[d.slot]&&state.wmods[d.slot][d.wslot]!=null)?state.wmods[d.slot][d.wslot]:null;
      if(!state.wmods)state.wmods=[null,null,null];
      if(!state.wmods[d.slot])state.wmods[d.slot]={};
      if(cur===idx)delete state.wmods[d.slot][d.wslot];else state.wmods[d.slot][d.wslot]=idx;
      closeDlg();break;}
    default:return;
  }
  renderAll();
});
document.addEventListener('mousedown',e=>{if(e.target===$('#dlgmask')){closeDlg();renderAll();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.dlg)closeDlg(),renderAll();});
/* Ctrl/Cmd + Enter = 这一页的动词：有预览就应用、没有就重算（键盘用户不必 Tab 一百多站找主行动） */
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.key!=='Enter')return;
  const o=state.opt;
  if(o&&o.res&&o.res.ok&&!o.applied){e.preventDefault();commitOpt();}
  else if(!state.dlg){e.preventDefault();askOpt();}
});
/* 弹窗开着时把**背景整块设成 inert**：`aria-modal="true"` 与「背后还有 149 个可 Tab 到的控件」
   是自相矛盾的（读屏会念出用户根本看不见的东西，键盘也会掉进洞里）。
   `inert` 不支持的旧浏览器退化成「Tab 到背景就弹回弹窗」那条兜底循环。 */
function setBgInert(on){
  const nodes=[...document.body.children].filter(x=>x.id!=='dlgmask'&&x.tagName!=='SCRIPT');
  nodes.forEach(n=>{try{on?n.setAttribute('inert',''):n.removeAttribute('inert');}catch(e){}});
}
document.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||!state.dlg)return;
  const box=$('#dlg');if(!box)return;
  const f=[...box.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter(x=>!x.disabled&&x.offsetParent!==null);
  if(!f.length)return;  const first=f[0],last=f[f.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  else if(!box.contains(document.activeElement)){e.preventDefault();first.focus();}
});
document.addEventListener('keydown',e=>{
  /* 两条条件搜索框里的回车：`input` 事件在部分浏览器不伴随 Enter 触发，这里显式接一次。
     ⚠️ `isComposing` 那一下不算数（中文输入法候选词上的回车是「选字」，不是「加入条件」）。 */
  const el=e.target;
  if(e.key==='Enter'&&el&&(el.id==='optreqbi'||el.id==='optreqai')){
    if(e.isComposing)return;
    e.preventDefault();reqAdd(el.id==='optreqbi'?'b':'a');
  }
});
document.addEventListener('input',e=>{
  const el=e.target, act=el.dataset?el.dataset.act:null;
  if(el.id==='dlgq'){if(state.dlg){state.dlg.q=el.value;renderDlgList();}return;}
  if(act==='tw-n'){state.tweaks[+el.dataset.i].name=el.value;recalc();return;}
  if(act==='tw-u'){state.tweaks[+el.dataset.i].unit=el.value;recalc();return;}
  if(act==='tw-v'){state.tweaks[+el.dataset.i].val=parseFloat(el.value)||0;recalc();return;}
  if(act==='bpext'){state.bp.extras[el.dataset.k]=parseFloat(el.value)||0;recalc();return;}
  if(el.id==='bp_wexp'){state.bp.weaponExpertise=Math.max(0,Math.min(TD2Calc.MAX_EXPERTISE,parseInt(el.value,10)||0));if($('#bp_wexp_v'))$('#bp_wexp_v').textContent=state.bp.weaponExpertise;recalc();return;}
  if(el.id==='bp_gexp'){state.bp.gearExpertise=Math.max(0,Math.min(TD2Calc.MAX_EXPERTISE,parseInt(el.value,10)||0));if($('#bp_gexp_v'))$('#bp_gexp_v').textContent=state.bp.gearExpertise;recalc();return;}
  if(el.id==='tq'){state.tq=el.value.trim().toLowerCase();if(state.dlg&&state.dlg.kind==='t')renderDlgList();return;}
  if(el.id&&el.id.indexOf('p_')===0){recalc();return;}
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(state.dlg&&el.dataset?.act==='dlg-wtype'){state.dlg.wtype=+el.value;renderDlg();return;}
  if(state.dlg&&el.dataset?.act==='dlg-wkind'){state.dlg.wkind=el.value;renderDlg();return;}
  if(state.dlg&&el.dataset?.act==='dlg-skill'){state.dlg.skillPreview=+el.value;state.dlg.skillVariant=null;renderDlgList();document.getElementById('dlg-skill-category')?.focus({preventScroll:true});return;}
  if(el&&el.dataset&&['gaugment','gaugmentlevel','waugment','waugmentlevel'].includes(el.dataset.act)){
    const i=+el.dataset.i;state.bp.augments=state.bp.augments||[];const prev=state.bp.augments[i]||{};state.bp.augments[i]=el.dataset.act==='gaugment'||el.dataset.act==='waugment'?{key:el.value,level:+prev.level||10}:{key:prev.key,level:Math.max(1,Math.min(10,+el.value||10))};renderAll();return;
  }
  if(el&&el.dataset&&el.dataset.act==='waffix'){
    const i=+el.dataset.i,w=arr(DB.weapons)[state.wslots[i]],code=el.value||null;
    state.waffix[i]=(code&&weaponAffixCodes(w).indexOf(code)>=0)?code:null;renderAll();return;
  }
  if(el&&el.dataset&&el.dataset.act==='gcore'){
    const i=+el.dataset.i,it=gearOf(i),code=el.value||null;
    if(it&&arr(coreChoices(it)).indexOf(code)>=0)state.core[i]=code;renderAll();return;
  }
  if(el&&el.dataset&&el.dataset.act==='gaffix'){
    const i=+el.dataset.i,k=+el.dataset.k,it=gearOf(i),code=el.value||null,pick=arr(state.affix[i]).slice();
    if(!it)return;if(code&&pick.indexOf(code)>=0&&pick[k]!==code)return;
    pick[k]=code;state.affix[i]=pick;renderAll();return;
  }
  if(el&&el.id==='bp_watch'){state.bp.watch=!!el.checked;recalc();}
  /* 原型升级（非奇特 ×1.5 档）：开了要**连装备卡上的词条数字一起重画**（卡片上印的是放大后的值） */
  if(el&&el.id==='bp_proto'){state.bp.prototype=!!el.checked;recalc();renderGear();renderWeapons();}
  /* PvP 模式：换的是**天赋数值** ⇒ 结果、天赋选择器（描述里的数字跟着变）、说明行都要重画 */
  if(el&&el.id==='bp_pvp'){state.bp.pvp=!!el.checked;renderPvpNote();if(state.dlg&&state.dlg.kind==='t')renderDlg();recalc();}
});
/* setLang / setTheme 见 /assets/base.js（本页切换语言后的重渲染已由 onLangChange(renderAll) 注册） */
/* 官方装备库归一化：
   ① 只保留 slot ∈ 六部位 且 kind ∈ 已知类别的条目（自动滤掉占位行）；
   ② 按 G_SLOTID 的官方顺序聚合进 GEAR（供选择器遍历）；
   ③ GEAR_MAP 以 **DB.gear 原始下标** 为键 → 选择结果跨重排依然指向同一件装备。 */
function buildGear(){
  GEAR.length=0;GEAR_ITEMS.length=0;
  for(const k in GEAR_MAP)delete GEAR_MAP[k];
  const src=Array.isArray(DB.gear)?DB.gear:[];
  for(let si=0;si<G_SLOTID.length;si++){
    for(let i=0;i<src.length;i++){
      const it=src[i];if(!it)continue;
      if(G_SLOTID.indexOf(it.slot)!==si)continue;               // 只收六部位，且按官方顺序分桶
      if(G_KINDS.indexOf(it.kind)<0)continue;                   // 未知/占位类别丢弃
      const norm={raw:i,slot_idx:si,slot:it.slot,kind:it.kind,kind_zh:it.kind_zh||'',zh:it.zh||'',en:it.en||'',name:it.name||'',brand:it.brand||'',brand_en:it.brand_en||'',brand_code:it.brand_code||'',set_code:it.set_code||'',set_zh:it.set_zh||'',gear_icon:it.gear_icon||'',mitem:it.mitem||'',slot_zh:it.slot_zh||'',
        set_bonus:Array.isArray(it.set_bonus)?it.set_bonus:[],   // 官方装备组 2/3/4 件套（必须带上，否则套装档位会静默丢失）
        /* ⚠️ `sockets` 也必须带上：`modSockets()` / `canOvr()` 读 `it.sockets` 数插件位，
           不带 ⇒ 每一件都数出 0 个槽（配合 `canOvr` 还会把「官方给了插件位」的件也点亮 OVR）。
           库里 **678/678** 件都带这个键（`scripts/devcheck/ui_contract_check.py` 现在会盯住这类漏键）。 */
        sockets:Array.isArray(it.sockets)?it.sockets:[],
        /* ⚠️ **库里没有 `named` 这个键** —— 具名件只由 `kind==='named'` 表达（72 件）。
           卡面原来写 `it.named||it.kind==='named'`，那半句永远是 `undefined`（死条件，看不出坏）
           ⇒ 归一化这里补一个真正的布尔，视图侧就可以老实读 `it.named`。
           （2026-09-13 由 `ui_contract_check.py` 的「norm 白名单 vs 视图侧实际读的字段」对账抓出。） */
        named:it.kind==='named',
        attrs_max:it.attrs_max||null,
        /* ⚠️ 件上的**天赋指针**（`gear[].talent`）在库里是**对象** `{key,zh,en,perfect,kind}`（84 件），
           不是字符串。原来这里写 `(typeof it.talent==='string')?it.talent:''` ⇒ 归一化后 `talent` 恒为空串
           ⇒ `gearTalent()` 在任何入参下都取不到名字（页面上连天赋名都显示不出来）。
           现在原样保留对象（视图侧只读 `key/zh/en/perfect`），并补 `talent_code`（2 件的 code 与 key 大小写不同）。
           `talent` 缺省 `null`（不是空串）：空串会被 `typeof === 'string'` 那类判据当成「有一条空天赋」。 */
        talent:(it.talent&&typeof it.talent==='object')?{key:it.talent.key||'',zh:it.talent.zh||'',en:it.talent.en||'',perfect:!!it.talent.perfect,kind:it.talent.kind||''}:(typeof it.talent==='string'&&it.talent.trim()?{key:it.talent.trim(),zh:'',en:'',perfect:false,kind:''}:null),
        talent_code:it.talent_code||''};
      GEAR_MAP[i]=norm;
      GEAR.push(norm);
      /* ⚠️ **按原始下标存，不许 `push`**：`GEAR` 是「按部位聚合后的压缩数组」，而 `GEAR_MAP` /
         `GEAR_ITEMS` 的键是 **`DB.gear` 的原始下标**。原来这里是 `GEAR_ITEMS.push(it)` ⇒ 两个下标体系
         **静默错位**（实测 `GEAR_ITEMS[472]` = 暗影拳击手套，而 `DB.gear[472]` = 战斗面具“瑟提”），
         症状全是「不报错的坏数」：① 装备选择框印的是**别件**的天赋（view 层按 `GEAR[k]` 取 `GEAR_ITEMS[k]`）；
         ② `optPools()` 拿错件 ⇒ ⑤ 核心限定池预筛时「可挑核心」的真件全被滤掉、池内塞进不具备该槽的件
         ⇒ 一键配装永远挑不出核心（`fitOk` 恒 false 或空满足）。2026-09-14 由真机探针抓出。 */
      GEAR_ITEMS[i]=it;
    }
  }
}
/* ── 选件后**自动带上默认值**（复刻参考工具的 `GearViewModel.OnSelectedGearChanged`）─────
   参考工具在 `SelectedGear` 一变就依次跑 SetPrototype → SetAttribute1..4 → SetTalent，
   每个池的收尾都是 `AttributeViewModel.NotNull(index)`：**池非空且当前未选 ⇒ 把 Index 落到默认档**
   （核心 0 / 副属性 0 / 插件 1 / 件天赋 0，见 `GearViewModel.cs:128-363` 与
   `AttributeViewModel.cs:54-63`）。所以玩家**点完那件就已经有数**，不必再逐项点一遍。
   ⚠️ 只填「该件池里确实有」的项：取不到就保持空（不编默认值、不拿 0 顶替）。
   ⚠️ 逐项复用界面同一批判据（`coreChoices` / `randomSlotCodes` / `gtalPool`）⇒ 手选与自动填
      走**同一条口径**，不会出现「自动填的候选里没有手选那个」这种静默错位。
   ⚠️ 副属性逐槽取该槽候选的**第一条**并按 `used` 去重：参考工具的 `Check()` 明确禁止同一属性出现两次
      （`GearViewModel.cs:86-114`）。 */
function autoFillGear(slot){
  if(state.bp.augments)state.bp.augments[slot]=null;
  state.core[slot]=null;state.affix[slot]=[];state.gtal[slot]=null;
  const it=gearOf(slot);if(!it)return;
  /* 参考工具的 NotNull() 是「池非空落 Index 0」，但它那份池的第一条就是件自带值；我们全局三条的
     第一条是「武器伤害」⇒ 直接落 0 会让每一件的核心都从「装甲」悄悄变成「武器伤害」。
     所以：件自带哪条就先落哪条，自带那条不在池里才落池子第一条。 */
  const ch=coreChoices(it);
  if(ch&&ch.length){
    const own=arr((it.attrs_max||{}).slots).filter(x=>x&&x.kind==='core'&&x.code)[0];
    state.core[slot]=(own&&ch.indexOf(own.code)>=0)?own.code:ch[0];
  }
  const used={},picks=[];
  const nR=nRandomSlots(it);
  for(let k=0;k<nR;k++){
    const codes=randomSlotCodes(it,k);
    const c=codes.filter(x=>x&&!used[x])[0];
    if(!c)continue;
    used[c]=1;picks.push(c);
  }
  state.affix[slot]=picks;
  const gkeys=gtalPool(slot).keys;
  if(gkeys.length)state.gtal[slot]=gkeys[0];                     // SetTalent() → Index=0
}
const TALENTS=[];              // 官方天赋（仅有名字的条目：zh||en）
function buildTalents(){
  TALENTS.length=0;
  const src=Array.isArray(DB.talents_official)?DB.talents_official:[];
  const kinds={};
  for(let i=0;i<src.length;i++){
    const t=src[i];if(!t)continue;
    const nm=((t.zh||'')+(t.en||'')).trim();if(!nm)continue;      // 官方表里有大量纯代码占位行 → 不给用户看
    TALENTS.push(t);
    const k=t.kind_zh||'其它';kinds[k]=(kinds[k]||0)+1;
  }
  TALENT_KINDS=Object.keys(kinds).sort((a,b)=>{const ia=T_KIND_ORDER.indexOf(a),ib=T_KIND_ORDER.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);}).map(k=>({kind:k,n:kinds[k]}));
}
function buildIndexes(){
  TALENT_BY_KEY={};GSETS={};
  for(const t of arr(DB.talents_official))if(t&&t.key)TALENT_BY_KEY[t.key]=t;
  for(const s of arr(DB.gearsets_official))if(s&&s.code)GSETS[s.code]=s;
  MISCONF={};
}
/* 从数据汇总英文查找表：TYPE_EN（武器类型）+ AFFIX_EN（词条名：官方 attr_zh→attr_en、装备组天赋名） */
function indexDb(){
  TYPE_EN={};AFFIX_EN={};
  for(const w of arr(DB.weapons))if(w&&w.type&&w.type_en)TYPE_EN[w.type]=w.type_en;
  const add=(zh,en)=>{if(zh&&en&&!AFFIX_EN[zh])AFFIX_EN[zh]=en;};
  for(const b of arr(DB.brands))for(const t of arr(b&&b.bonus))for(const e of arr(t&&t.effects))if(e)add(e.attr_zh,e.attr_en);
  for(const s of arr(DB.gearsets_official)){for(const t of arr(s&&s.tiers))for(const e of arr(t&&t.effects))if(e)add(e.attr_zh,e.attr_en);
    for(const t of arr(s&&s.tiers))for(const tl of arr(t&&t.talents))if(tl)add(tl.zh,tl.en);}
}
/* ── 本地存档（`td2build`）───────────────────────────────────────────────────────
   原来配装台一个字都不存：刷新 = 回到空页，手配半小时全没了；而「导出 / 导入」是
   唯一能把一套配装带走或比对两条路线的路径。存的**只有下标与 code 串**（与 `state` 同构），
   不存件对象 ⇒ 数据层重排后老存档只会**失效**（下面逐键校验），不会指向另一件装备。
   ⚠️ `opt.res` / `dlg` / `undo` 一律不落盘：那是计算结果与瞬时 UI，不是用户的选择。 */
const TD2_BUILD_KEY='td2build';
const SAVE_KEYS=['wslots','wactive','slots','ovr','gmods','wmods','waffix','skill','skillVariant','talents','bonuses','tweaks',
  'core','affix','gtal','bp','tperfect','folds'];
function snapshot(){
  const o={};SAVE_KEYS.forEach(k=>{o[k]=state[k];});
  /* 折叠位（手填词条 / 战斗条件 / 档位与目标）也进存档：用户收过一次就别下次回来再收一遍 */
  o.folds={};['fold_tw','fold_cond','fold_tgt','fold_opt'].forEach(id=>{const el=document.getElementById(id);
    if(el)o.folds[id]=!!el.open;});
  o.opt={flow:state.opt.flow||'',target:state.opt.target,wtype:state.opt.wtype,cons:state.opt.cons,lock:state.opt.lock,lockW:state.opt.lockW};
  return o;
}
let syncTimer=null;
function scheduleSync(){
  if(syncTimer)clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{syncTimer=null;try{lsSet(TD2_BUILD_KEY,JSON.stringify(snapshot()));}catch(e){}},350);
}
function clearSaved(){try{lsSet(TD2_BUILD_KEY,'');}catch(e){}}
/* 逐键校验后落地：数组长度不对、下标越界（GEAR_MAP / DB.weapons 取不到）⇒ 该项整体作废，
   宁可少恢复一格，也不许把「上一件才有的词条 / 别件的天赋」摆回来（与 `pickg` 的判空同一条纪律）。 */
/* 武器配件按位存档的形状校验（口径同 `build.mods.js` 的 `wmIndex`：`DB.mods[i].slot` 就是插槽 code）。
   ⚠️ 这一层只能验**形状**：纯下标没有锚点，「同一槽换成了另一件」在这里看不出来 ——
   稳定锚点在 `build.share.js` 的 `items.wmods`（分享链接与账号存档都走那条路）。
   被拦下的件数记进 `SAVE_ISSUES`，由调用方接 `#build-share-status` 提示，绝不静默留空。 */
let SAVE_ISSUES={wmods:0,slots:0,waffix:0};
function applySavedWmods(bags){
  const rows=arr(DB.mods),out=[];let dropped=0;
  for(let i=0;i<3;i++){
    const bag=(bags&&bags[i])||null;
    if(!bag||typeof bag!=='object'){out.push(null);continue;}
    const kept={};
    Object.keys(bag).forEach(code=>{
      const idx=bag[code],m=Number.isInteger(idx)?rows[idx]:null;
      if(m&&m.slot===code)kept[code]=idx;else dropped++;
    });
    out.push(Object.keys(kept).length?kept:null);
  }
  return {bags:out,dropped};
}
/* 校验留下的可见提示：件数由本次校验现算（不硬编码），分享/存档、本机草稿、导入文件三条路共用这一句 */
function saveIssueText(){
  /* 逐字段报，件数一律运行时现算（AGENTS.md §4「计数不硬编码」）。原来只有 wmods 一个键，
     装备换部位 / 第三词条对不上都是**静默**的（实测 4 格串部位、3 格换词条，提示位全空）。 */
  const out=[];
  if(SAVE_ISSUES.wmods)out.push(L(SAVE_ISSUES.wmods+' 件武器配件在当前资料库里已对不上，对应插槽留空，请重新选择。',
    SAVE_ISSUES.wmods+' weapon mod(s) no longer match the current library; those sockets are empty — please pick again.'));
  if(SAVE_ISSUES.slots)out.push(L(SAVE_ISSUES.slots+' 件装备在当前资料库里已对不上（部位不符），对应格子留空。',
    SAVE_ISSUES.slots+' gear item(s) no longer match their socket; those slots are empty.'));
  if(SAVE_ISSUES.waffix)out.push(L(SAVE_ISSUES.waffix+' 把枪的第三词条已不在候选里，留空待你重选。',
    SAVE_ISSUES.waffix+' weapon talent(s) are no longer offered; left empty for you to pick again.'));
  return out.join(' ');
}
function applySaved(raw){
  buildPickerUndo=null;
  if(!raw||typeof raw!=='object')return false;
  SAVE_ISSUES={wmods:0,slots:0,waffix:0};
  let ok=false;
  const W=arr(DB.weapons);
  if(Array.isArray(raw.wslots)&&raw.wslots.length===3){
    const ws=raw.wslots.map(x=>(Number.isInteger(x)&&x>=0&&x<W.length)?x:null);
    if(ws.some(x=>x!=null)){state.wslots=ws;state.wactive=Number.isInteger(raw.wactive)&&ws[raw.wactive]!=null?raw.wactive:ws.findIndex(x=>x!=null);ok=true;}
  }
  if(Array.isArray(raw.slots)&&raw.slots.length===6){
    /* ⚠️ 光判「这个下标还在库里」不够：`DB.gear` 一重烘就整体位移，实测拿 9-22 那代存档按当前库恢复 ⇒
       6 格里 4 格换成**别的部位**（面具格印「哈布斯堡护膝」）而提示位全空。加一道部位判据，
       部位不对就留空（与 `pickg` 的 `GEAR_MAP[raw]` 校验同一思路：宁可少恢复一格，不许摆错格子），
       并把件数记进 `SAVE_ISSUES.slots`，由 `saveIssueText()` 如实报。 */
    let slotDropped=0;
    /* ⚠️ 空位（`null`）是「用户没填」，不是「对不上」：本机草稿把没填的格子原样存成 `null`，
       若一并计数，任何「存过一次空配装再回来」的人都会吃一条「6 件装备在当前资料库里已对不上」的假告警
       （线上 330 实测复现：首访无提示 → 自动存盘 → 再刷即现）。只对**填了值却过不了校验**的格子计数。 */
    const next=raw.slots.map((x,i)=>{if(x==null)return null;const g=Number.isInteger(x)?GEAR_MAP[x]:null;if(g&&g.slot_idx===i)return x;slotDropped++;return null;});
    SAVE_ISSUES.slots=slotDropped;
    if(next.some(x=>x!=null)){
      state.slots=next;ok=true;
      state.core=arr(raw.core).length===6?raw.core.map((c,i)=>(c&&randomSlotHas(next[i],'core',c))?c:null):[null,null,null,null,null,null];
      state.affix=arr(raw.affix).length===6?raw.affix.map((a,i)=>arr(a).filter(c=>randomSlotHas(next[i],-1,c))):[[],[],[],[],[],[]];
      state.gtal=arr(raw.gtal).length===6?raw.gtal.map((g,i)=>(g&&gtalPool(i).keys.indexOf(g)>=0)?g:null):[null,null,null,null,null,null];
      state.gmods=arr(raw.gmods).length===6?raw.gmods.map(x=>(Number.isInteger(x)&&(GMODS||[])[x]!=null)?x:null):[null,null,null,null,null,null];
      state.ovr=arr(raw.ovr).length===6?raw.ovr.map(Boolean):state.ovr;
    }
  }
  if(Array.isArray(raw.talents)&&raw.talents.length===3)state.talents=raw.talents.map(x=>(Number.isInteger(x)&&TALENTS[x])?x:-1);
  /* 存档里的第三词条 code 不在该枪候选里 ⇒ **留空并计数**，不许回落到「该枪第一条可选词条」：
     实测喂一个不存在的 code 会静默换成 `DamageDoneToArmorModBonus`（对装甲的伤害）三格全中、
     `SAVE_ISSUES` 仍是 0、提示为空，而这直接改 DPS ⇒ 用户以为恢复了原配装。 */
  if(Array.isArray(raw.waffix)&&raw.waffix.length===3){
    let waDropped=0;
    state.waffix=raw.waffix.map((c,i)=>{const w=W[state.wslots[i]];
      if(!c)return null;
      if(weaponAffixCodes(w).indexOf(c)>=0)return c;
      waDropped++;return null;});
    SAVE_ISSUES.waffix=waDropped;
  }
  else state.waffix=state.wslots.map(x=>weaponAffixCodes(W[x])[0]||null);
  if(Array.isArray(raw.skill)&&raw.skill.length===2)state.skill=raw.skill.map(x=>(Number.isInteger(x)&&x>=0&&x<SKILLS.length)?x:-1);
  if(Array.isArray(raw.skillVariant)&&raw.skillVariant.length===2)state.skillVariant=raw.skillVariant.map((v,i)=>{
    const db=skillDbOf(SKILLS[state.skill[i]]);return db&&arr(db.variants).some(x=>x.code===v)?v:null;});
  if(Array.isArray(raw.tweaks))state.tweaks=raw.tweaks.filter(t=>t&&t.name).map(t=>({name:String(t.name),val:+t.val||0,unit:t.unit==null?'%':String(t.unit)}));
  if(Array.isArray(raw.bonuses))state.bonuses=raw.bonuses.filter(x=>typeof x==='string');
  /* 武器配件：逐键校验后落地（原来整包 `state.wmods=raw.wmods` 一个字都不验 ⇒ 资料库重烘后
     越界/串槽的下标被 `wmCands` 静默判空，用户看不出配件已经变了）。没有配件也落成三个空位，
     不给「载入别人的配装却留着自己那身枪口配件」留口子。 */
  const wm=applySavedWmods(Array.isArray(raw.wmods)&&raw.wmods.length===3?raw.wmods:null);
  state.wmods=wm.bags;SAVE_ISSUES.wmods=wm.dropped;
  if(raw.bp&&typeof raw.bp==='object')Object.assign(state.bp,raw.bp);
  /* 场景假设只认 `OPT_SCENE_PROFILES` 里的 id；旧存档没有这一项 → 保持默认 `pve_solo`。
     档位表必须是对象，避免被旧包里的字符串/数组污染后静默失效。 */
  if(!Object.prototype.hasOwnProperty.call(OPT_SCENE_PROFILES,state.bp.scene))state.bp.scene='pve_solo';
  if(!state.bp.condTier||typeof state.bp.condTier!=='object'||Array.isArray(state.bp.condTier))state.bp.condTier={};
  if(!OPT_SKILL_TIERS[state.bp.player_skill_tier])state.bp.player_skill_tier='normal';
  if(state.bp.stance!=='stationary')state.bp.stance='mobile';
  state.bp.sp=Object.fromEntries(BP_WT.map(([k])=>[k,raw.bp?.spMode==='all-default-v1'?state.bp.sp?.[k]!==false:true]));
  state.bp.spMode='all-default-v1';
  state.bp.skillExpertise=[0,1].map(i=>Math.max(0,Math.min(30,Math.floor(+(state.bp.skillExpertise||[])[i]||0))));
  state.tperfect=!!raw.tperfect;
  if(raw.folds&&typeof raw.folds==='object')Object.keys(raw.folds).forEach(id=>{
    const el=document.getElementById(id);if(el)el.open=!!raw.folds[id];});
  if(raw.opt&&typeof raw.opt==='object'){
    const o=state.opt;
    if(OPT_TARGETS.some(t=>t[0]===raw.opt.target))o.target=raw.opt.target;
    if(raw.opt.flow===''||optFlowOf(raw.opt.flow))o.flow=raw.opt.flow;
    if(Number.isInteger(raw.opt.wtype))o.wtype=raw.opt.wtype;
    if(Array.isArray(raw.opt.cons))o.cons=raw.opt.cons;
    if(Array.isArray(raw.opt.lock)&&raw.opt.lock.length===6)o.lock=raw.opt.lock.map(Boolean);
    o.lockW=!!raw.opt.lockW;
  }
  return ok;
}
/* 存档里的一个 code 在「这一件」还成立吗（核心槽 / 随机槽两种查法，口径与 autoFillGear 同一批函数） */
/* ⚠️ 入参是 **DB.gear 的原始下标**（存档里存的就是它），必须走 `GEAR_MAP[raw]` 解引用；
   `gearOf(i)` 要的是**部位下标** —— 原来这里写成 `gearOf(raw)`，于是「436 号件」被当成「第 436 格」，
   取到 undefined ⇒ 存档里合法的核心与副属性被**静默丢掉**（刷新一次少一条词条，页面上看不出来）。 */
function randomSlotHas(raw,kind,code){
  const it=(raw==null)?null:GEAR_MAP[raw];
  if(!it||!code)return false;
  if(kind==='core')return arr(coreChoices(it)).indexOf(code)>=0;
  /* 认「三族白名单的并集」—— 与卡上摆出来的候选、⑥ 的池同一份判据。
     原来逐槽比 `randomSlotCodes(it,k)`：槽与族的对应关系一变，一条完全合法的存档词条
     会被判成脏数据静默丢掉（少一条词条，页面上看不出来）。 */
  const n=nRandomSlots(it);
  if(n){
    const ok={}; let restricted=true;
    for(let k=0;k<n;k++){
      const g=pieceAffixGroups(it,k);
      if(!g){restricted=false;break;}
      g.forEach(x=>x.codes.forEach(c=>{ok[c]=1;}));
    }
    if(restricted)return !!ok[code];
  }
  const q=amQuality(it);
  for(const f of AFFIX_FAM_ORDER)if(arr(affixPoolCodes(f,q)).indexOf(code)>=0)return true;
  return false;
}
function restoreSaved(){
  let raw=null;try{const t=lsGet(TD2_BUILD_KEY);raw=t?JSON.parse(t):null;}catch(e){raw=null;}
  const ok=applySaved(raw);
  /* 本机草稿跨资料库重烘恢复时同样不许静默：校验拦下的件数写进本页提示位（role=status / aria-live） */
  if(saveIssueText()&&typeof buildShareNotice==='function')buildShareNotice(saveIssueText());
  return ok;
}
function exportBuild(){
  const blob=new Blob([JSON.stringify({v:1,app:'agent-hub-build',data:(DB&&DB._meta&&DB._meta.version)||'',build:snapshot()},null,1)],
    {type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='agent-hub-build.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
async function importBuild(file){
  let doc=null;
  try{doc=JSON.parse(await file.text());}catch(e){warnImport(L('文件不是有效的 JSON','Not valid JSON'));return;}
  if(!doc||!doc.build){warnImport(L('文件里没有配装数据','No build in this file'));return;}
  if(!applySaved(doc.build)){warnImport(L('这份配装与当前装备库对不上','This build does not match the current gear library'));return;}
  state.opt.res=null;state.opt.applied=false;renderAll();
  /* 导入文件按原生下标格式（与本机草稿同一条纪律，不自造第二套）：这里只能验形状，
     拦下来的件数照样落到本页提示位，不让用户以为导进来了就是自己那一身。 */
  if(saveIssueText()&&typeof buildShareNotice==='function')buildShareNotice(saveIssueText());
}
function warnImport(msg){
  const el=$('#r_warn');if(el)el.innerHTML=`<div class="wnote">${esc(msg)}</div>`;
}
async function load(){
  try{
    /* 不传 cache：让响应头决定。公网 nginx 对 geardb.json 发 `no-cache` + ETag ⇒
       每次带 If-None-Match，没变就回 304（约 200 B）而不是重下 0.94 MB（gzip）。
       以前这里写 `{cache:'no-store'}`，把 HTTP 缓存**和 304 一起**扔了，
       于是每次切到本页都要全量重下 —— 手机端「切页面有点卡」的主因。
       本机开发服务器对 /assets/ 一律回 `no-store`（`td2qa/server_static.py`），
       响应头仍然压着不缓存，所以去掉这个参数对本地开发没有影响。 */
    /* ⚠️ 拉的是**精简库** `geardb.lean.json`（gzip 1201 → 979 KB，−18.5%），不是完整库。
       精简库 = 完整库减去 `gear[]/weapons[].sources`（+ 4 个无人读的顶层键）；
       `sources` 是「获取途径 / 出处」，只有资料库的详情抽屉与关联视图读它
       （`db.detail.js` / `db.relations.js`），**配装器一处都不读**（逐个 grep 过）。
       生成脚本 `scripts/rebuild/geardb_lean.py`（重建完整库后必须重跑）。
       完整库仍归资料库：`db.detail.js` 的 `loadFullDB()` 拉的是 `/assets/db/geardb.json`。 */
    DB=await fetchJSON('/assets/db/geardb.lean.json');
    buildIndexes();
    GMODS=Array.isArray(DB.gear_mods)&&DB.gear_mods.length?DB.gear_mods:(Array.isArray(DB.mods)?DB.mods.filter(m=>m&&(m.value!=null||m.val!=null)):[]);
    skillIconMap();                                // 技能图标取官方那张（`DB.skills[].icon`）
    buildGear();buildTalents();indexDb();
  }
  catch(e){document.querySelector('main').innerHTML='<div id="empty">配装数据未就绪（web/assets/db/geardb.json）</div>';return;}
  await loadEnemyCoeffs();                          // 官方敌人系数表：缺文件不影响其余计算，只是目标血量/装甲不显示
  if(typeof TD2Calc==='undefined'){document.querySelector('main').innerHTML='<div id="empty">计算引擎未加载（/assets/db/engine.js）</div>';return;}
  restoreSaved();                               // 先落回上一次的配装，再首渲（顺序错了就是「闪一下空页」）
  try{document.getElementById('attrnames').innerHTML=(TD2Calc.attrDisplayNames?TD2Calc.attrDisplayNames():TD2Calc.attrNames()).map(n=>`<option value="${esc(n)}">`).join('');}catch(e){}
  renderAll();
  buildInspectFromUrl();
}
window.addEventListener('DOMContentLoaded',()=>{
  $('#lang').onclick=()=>setLang(LANG==='zh'?'en':'zh');
  $('#theme').onclick=()=>toggleTheme();
  $('#exp').onclick=exportBuild;
  $('#imp').onclick=()=>$('#impf').click();
  $('#impf').onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)importBuild(f);e.target.value='';};
  /* 键盘：`<button>` 自带回车/空格；剩下那些 `role=button` 的卡片（武器 / 装备 / 技能 / 弹窗行）
     靠这一条把按键变成点击 —— 卡片里有嵌套按钮，不能整张换成 `<button>`（HTML 不允许按钮套按钮）。 */
  document.addEventListener('keydown',ev=>{
    if(ev.key!=='Enter'&&ev.key!==' ')return;
    const a=document.activeElement;
    if(!a||!a.closest||a.tagName==='BUTTON'||a.tagName==='INPUT'||a.tagName==='SELECT'||
       a.tagName==='TEXTAREA'||a.tagName==='SUMMARY'||a.tagName==='A')return;
    const el=a.closest('[data-act]');
    if(!el||el===a&&el.getAttribute('tabindex')===null)return;
    if(el.getAttribute('tabindex')===null)return;
    ev.preventDefault();el.click();
  });
  /* 一键配装的四个控件（用户第 111 轮）：目标 / 武器类别 / 条件比较 / 数值 —— 改完只重渲染面板，
     不自动重跑（跑一次要几百毫秒，不该在改下拉时就跑）。 */
  /* 6 条硬条件里的**下拉与开关**走 change（chip 走 click，见上面那张委托表）：
     ⚠️ 这里**不能**用 `bind()` 那套「渲完再 addEventListener」—— `#optreq` 每次 `renderOpt()` 都重建，
     绑在旧节点上的监听会跟着节点一起被丢掉（症状：下拉选完什么都不发生、也不报错）。
     一律按 `id` / `data-act` 现查，靠**文档级委托**活着。 */
  document.addEventListener('change',ev=>{
    const el=ev.target;
    if(!el||!el.matches)return;
    if(el.id==='optreqbn'){req().bmin=Math.max(1,+el.value||1);renderOpt();}
    else if(el.id==='optreqcn'){req().cmin=Math.max(1,+el.value||1);renderOpt();}
    else if(el.id==='optreqw'){req().weapon=(el.value===''?null:+el.value);renderOpt();}
    else if(el.dataset&&el.dataset.act==='optreqwt'){req().watchKey=!!el.checked;renderOpt();}
    else if(el.dataset&&el.dataset.act==='optreqwreset'){req().weapon=null;renderOpt();}
    /* 下拉候选是被「选」中的（不敲回车）⇒ 这里必须接住，否则鼠标用户点了候选什么都不会发生 */
    else if(el.id==='optreqbi'){reqAdd('b');}
    else if(el.id==='optreqai'){reqAdd('a');}
  });
  const bind=(id,fn)=>{const el=$('#'+id);if(el)el.addEventListener('change',fn);};
  /* 词条候选抽屉「点别处自动收起」：卡片重渲之后玩家经常直接去点下一件事，
     抽屉挂在那儿不收会一直占着卡片高度、也让人以为还要再点一次「收起」。
     判据：点在 `#ggrid` 之外（或点的是别的卡片）⇒ 收起。**不拦截事件**（不 preventDefault / 不 stopPropagation），
     各 `data-act` 的处理照旧跑 —— 这里只负责把 `state.axopen` 归位。 */
  document.addEventListener('click',ev=>{
    /* ⚠️ 判据用 `composedPath()`，**不能用 `ev.target.closest('#ggrid')`**：
       委托里 `case 'gfxo'/'gfxt'` 先跑并 `renderGear()` 重建了 `#ggrid` ⇒ 事件目标那颗 span **已经脱链**，
       脱链节点的 `closest()` 找不到 `#ggrid` ⇒ 判成「点在网格外」⇒ 立刻把刚展开的抽屉收起。
       症状 = 点「＋ 选择」什么都不发生、chip 恒 0、无报错无 console（2026-09-14 真踩，
       同一个坑的第三种形状：先是 `<0` 把「刚展开(=0)」当成「已收起」，再是这里的目标脱链）。
       路径在派发时就定格了，不受重渲影响；`isConnected===false` 的事件一律不当作「点别处」。 */
    if(state.axopen===-1)return;
    if(ev.target&&ev.target.isConnected===false)return;
    const path=ev.composedPath?ev.composedPath():[];
    for(let i=0;i<path.length;i++)if(path[i]&&path[i].id==='ggrid')return;
    state.axopen=-1;renderGear();
  });
  /* Esc：弹窗与抽屉都收起（弹窗在时优先关弹窗） */
  document.addEventListener('keydown',ev=>{
    if(ev.key!=='Escape')return;
    if(state.dlg){closeDlg();renderAll();return;}
    if(state.axopen>=0){state.axopen=-1;renderGear();}
  });
  bind('bp_oflow',()=>{const id=$('#bp_oflow').value,flow=optFlowOf(id);state.opt.flow=id;state.opt.res=null;state.opt.applied=false;if(flow){state.opt.target=flow.target;state.opt.cons=buildClone(flow.cons||[]);const q=req();q.core=arr(flow.core).slice();q.affix=arr(flow.affix).slice();state.opt.wtype=0;}renderOpt();});
  bind('bp_otarget',()=>{state.opt.target=$('#bp_otarget').value;state.opt.res=null;state.opt.applied=false;renderOpt();});
  bind('bp_owtype',()=>{state.opt.wtype=+$('#bp_owtype').value;state.opt.res=null;state.opt.applied=false;renderOpt();});
  bind('bp_olockw',()=>{state.opt.lockW=!!$('#bp_olockw').checked;});
  /* 切换语言后重渲染（base.js 的 setLang 回调）。必须注册在启动块里：外链脚本各自是独立的
     提升单元，数据层里 `onLangChange(renderAll)` 时 renderAll 还没定义（内联单文件时靠提升没暴露）。 */
  /* ⚠️ 2026-09-14 删：原来这里有一个 `#bp_gtal`（装备天赋手选下拉）的 change 监听。
     那个下拉是与本轮新做的「卡片上的件天赋选择器」重复的第二套入口（硬规则②），且只影响档位层，
     选别的天赋不改任何数字。装备天赋现在一律走卡片上的 `data-act="gtal"`（见 `case 'gtal'` 与 `pickgt`）。 */
  onLangChange(renderAll);
  load();
});
/* 收尾导出：`page.$()` 之外的**纯函数试算口**。只在这最后一层注册（外链脚本的提升不跨文件，
   注册语句必须留在启动层），给 node 试算台 `scripts/devcheck/build_sim.mjs` 与将来的优化器用。 */
window.TD2Build={evalBuild:evalBuild,picksFor:picksFor,bpParams:bpParams,state:state,
  gearOf:gearOf,arr:arr,attrNames:function(){return TD2Calc.attrNames();}};

/* Readable labels for engine field names; input keys and numeric units are untouched. */
function buildEffectLabel(key){
 const displayNames={'装弹速度':'Reload speed','稳定度':'Stability','稳定性':'Stability','精准度':'Accuracy','子弹':'Magazine size','弹匣容量':'Magazine size','暴击几率':'Critical hit chance','暴击机率':'Critical hit chance','暴击伤害':'Critical hit damage','爆头伤害':'Headshot damage','武器控制力':'Weapon handling','对离开掩体目标的伤害':'Out of cover damage','对离开掩体目标伤害':'Out of cover damage'};
 /* 卡片窄，官方全名「对离开掩体目标的伤害」会把数值挤出可视区；统一显示为「掩体伤害」。 */
 const zhShort={'对离开掩体目标的伤害':'掩体伤害','对离开掩体目标伤害':'掩体伤害'};
 const plain=String(key||'').replace(/%$/,'');
 if(LANG!=='en'&&zhShort[plain])return zhShort[plain]+(String(key).endsWith('%')?'%':'');
 if(LANG==='en'&&displayNames[plain])return displayNames[plain]+(String(key).endsWith('%')?'%':'');
 const label={TotalWeaponDamage:['总武器伤害 %','Total weapon damage %'],AllWeaponDamage:['全武器伤害 %','All weapon damage %'],WeaponDamage_Talent:['武器伤害（天赋）%','Weapon damage (talent) %'],AmplifyDamage:['独立增伤','Damage multiplier'],WeaponDamage:['武器伤害 %','Weapon damage %'],CriticalHitDamage:['暴击伤害 %','Critical hit damage %'],CriticalHitChance:['暴击率 %','Critical hit chance %'],HeadshotDamage:['爆头伤害 %','Headshot damage %'],Armor:['装甲','Armor'],ArmorDamage:['装甲伤害 %','Armor damage %'],MagazineSize:['弹匣容量 %','Magazine size %'],ReloadSpeed:['装填速度 %','Reload speed %'],RateOfFire:['射速 %','Rate of fire %'],Accuracy:['准确度 %','Accuracy %'],Stability:['稳定度 %','Stability %'],WeaponHandling:['武器操控 %','Weapon handling %'],OptimalRange:['最佳射程 %','Optimal range %'],SwapSpeed:['切换速度 %','Swap speed %'],DamageToElites:['精英伤害 %','Damage to elites %'],SkillDamage:['技能伤害 %','Skill damage %'],SkillEfficiency:['技能效率 %','Skill efficiency %'],RepairSkills:['技能修复 %','Repair skills %'],ArmorRegenPercent:['护甲回复 %','Armor regeneration %']};
 return label[key]?L(...label[key]):key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ');
}

/* Do not lose the last edit when a phone backgrounds or a reload beats the debounce. */
function flushPendingBuildSave(){
 if(!syncTimer)return;
 clearTimeout(syncTimer);syncTimer=null;
 try{lsSet(TD2_BUILD_KEY,JSON.stringify(snapshot()));}catch(_){}
}
window.addEventListener('pagehide',flushPendingBuildSave);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushPendingBuildSave();});

// Skill expertise levels are per equipped slot and persist in bp snapshots/imports.
document.addEventListener('change',e=>{const x=e.target;if(x&&x.dataset.act==='bpexpskill'){state.bp.skillExpertise=state.bp.skillExpertise||[0,0];state.bp.skillExpertise[+x.dataset.i]=Math.max(0,Math.min(30,Math.floor(+x.value||0)));renderAll();scheduleSync();}});