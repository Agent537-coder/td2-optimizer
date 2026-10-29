/* 配装器页 · 一键配装（优化器）· 口径定义层 ────────────────────────────────────
   流派预设 / 目标表 / 约束种类与谓词 / 覆盖矩阵口径（res.cover 的形状）/
   骨架种子（o.seeds）的规格解析与落地。
   ⚠️ 只声明「什么算什么、按什么判、账长什么样」：不写任何公式、不跑搜索。
     搜索层 = build.opt.js；候选取数层 = build.opt.cand.js（拆层见 docs/DESIGN-OPTIMIZER.md）。
   ⚠️ 目标字段一律取引擎真实输出（`TD2Calc.buildCompute` 的返回值）。
   ⚠️ 骨架种子**只作搜索起点、不作硬约束**（optSeedSpec / optSeedGear）。 */

/* ── 流派预设表（用户 2026-10-16「搞好流派」：爆率爆伤 / 爆头 / 危房 / 精英防御 …）─────
   配装不是裸跑一个数值，是**先定流派再优化**：流派给定 ①核心属性色 ②次要属性族
   ③武器类别取向 ④默认目标 ⑤默认硬条件。翻译成搜索约束后仍跑同一套坐标下降，
   **公式一行不改**；用户显式给的（`o.req` / `o.target` / `o.constraints`）**优先于**预设。
   次要属性 code 一律取官方随机池那 12 条（`build.attrs.js` 的 `AFFIX_POOL_CODES`），不臆造。 */
var OPT_FLOWS = [
  /* ⚠️ 交战距离（用户 2026-10-16「冰冷关系没人带，因为它是冲锋枪、打近距离的」）：
     枪种不只是伤害表，还决定**你要站多近**。冲锋枪/霰弹枪要贴脸（有被精英一脚踢倒的风险），
     步枪/射手/轻机枪站中远距 ⇒ 拆成两条流派，别让「循环最高」默认把人推去贴脸。 */
  ['crit', '全火 · 爆率爆伤（中距）', 'All-red · Crit (mid range)', {
    core: ['WeaponDamageModBonus'],
    affix: ['WeaponCriticalHitChanceFlatBonus', 'WeaponCriticalHitDamageFlatBonus', 'WeaponDamageMultiplierHeadFlatBonus'],
    wtypes: ['突击步枪', '轻机枪', '步枪'], target: 'sdps', eng: 'mid',
    /* 爆率硬顶（用户 2026-10-16：「爆率上限 60，理想上就该尽量到 60」）。
       判据：CHC 52 / CHD 212 时，+6% 爆率 = 爆伤乘区 +6.05%，+12% 暴伤 = +2.97% ⇒
       在 60 之前爆率一定比暴伤值钱；冲不到 60 的套件如实报「无解」，不偷偷放宽。 */
    cons: [{kind:'num',key:'chc',op:'min',val:'60'},{kind:'num',key:'redcores',op:'min',val:'6'}],
    note: '核心全武器伤害 · 副属性爆率/爆伤 · 高射速枪种 · 爆率达到 60%',
  }],
  ['close', '贴脸 · 爆率爆伤（近距）', 'Close quarters · Crit', {
    core: ['WeaponDamageModBonus'],
    affix: ['WeaponCriticalHitChanceFlatBonus', 'WeaponCriticalHitDamageFlatBonus', 'WeaponDamageMultiplierHeadFlatBonus'],
    wtypes: ['冲锋枪', '霰弹枪'], target: 'sdps', eng: 'close',
    cons: [{kind:'num',key:'chc',op:'min',val:'60'},{kind:'num',key:'redcores',op:'min',val:'6'}],
    note: '猎人/突袭这类贴脸流：冲锋枪与霰弹枪，爆率顶 60、爆伤拉满；代价是要站进怪堆里',
  }],
  ['hs', '全火 · 爆头', 'All-red · Headshot', {
    core: ['WeaponDamageModBonus'],
    affix: ['WeaponDamageMultiplierHeadFlatBonus', 'WeaponCriticalHitChanceFlatBonus', 'WeaponCriticalHitDamageFlatBonus'],
    wtypes: ['步枪', '射手步枪', '手枪', '突击步枪'], target: 'sdps',
    note: '副属性优先爆头 · 步枪/射手步枪/手枪 · 猎头者、道奇这类走这条',
  }],
  ['hazard', '高体 · 危房', 'Tank · Hazard', {
    core: ['ArmorGearFlatBonus'],
    affix: ['AllStatusResistancePercentageFlatBonus', 'ArmorRegenFlatBonus', 'HealthFlatBonus'],
    wtypes: [], target: 'armor',
    note: '核心全装甲 · 副属性危害防护/回甲/生命 · 燃烧本、100 危防这类场景套',
  }],
  ['pfe', '精防 · 精英防御', 'Protection from Elites', {
    core: ['ArmorGearFlatBonus', 'WeaponDamageModBonus'],
    affix: ['WeaponCriticalHitChanceFlatBonus', 'WeaponCriticalHitDamageFlatBonus', 'BlastDamageMitigationPercentageFlatBonus'],
    wtypes: ['霰弹枪', '冲锋枪'], target: 'sdps', eng:'close',
    cons: [{kind:'num',key:'elites',op:'min',val:'80'},{kind:'num',key:'taken',op:'max',val:'1'}],
    note: '精英防御 80% 且不带额外承伤，按近距10米优化武器输出；不是血量/坦度最优，不防非精英伤害',
  }],
  ['melee', '近战', 'Melee', {
    core: ['WeaponDamageModBonus'],
    affix: ['WeaponDamageMultiplierHeadFlatBonus', 'WeaponCriticalHitChanceFlatBonus', 'WeaponCriticalHitDamageFlatBonus'],
    wtypes: [], target: 'melee',
    note: '目标 = 近战乘区（近战池 × 独立增伤 × 目标态）；不吃武器伤/暴击/爆头',
  }],
  ['skill', '电工 · 技能', 'Skill', {
    core: ['SkillPowerFlatBonus'],
    affix: ['allskills_damage_mod_Bonus', 'SkillHasteModBonus', 'allskills_healing_mod_Bonus'],
    wtypes: [], target: 'skillout',
    cons: [{kind:'num',key:'skilltier',op:'min',val:'6'}],
    note: '输出电工：分阶6 · 炮塔/突击无人机的单技能条件快照倍率（基准100）；不是双技能持续DPS或奶量，波形只代表单侧峰值',
  }],
];
/* 结果、请求与数据代际契约；不保存预览对象本身或撤销记录。 */
function optStable(value){
  if(Array.isArray(value))return value.map(optStable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,optStable(value[k])]));
  return value;
}
function optRequestOptions(o){const out={};for(const k of ['target','flow','wtype','wslot','lock','lockW','req','constraints','scoreMode','budget','seeds','distanceM'])if(o&&o[k]!==undefined)out[k]=buildClone(o[k]);return out;}
function optRequestSignature(o){
  const selected={};for(const key of ['slots','wslots','wactive','core','affix','gtal','talents','gmods','wmods','waffix'])selected[key]=state[key];
  const ui={};for(const key of ['target','flow','wtype','lock','lockW','req','cons'])ui[key]=state.opt?.[key];
  return JSON.stringify(optStable({selected,ui,context:buildEvaluationContext('current'),request:optRequestOptions(o)}));
}
function optResultArgs(res,context){return {context:context||res.context,wslot:res.wslot,wslots:res.wslots,core:res.core,affix:res.aff,
  gtal:res.gtal,gmods:res.gmods,wmods:res.wmods,waffix:res.waffix,talents:res.talents};}
function optWeaponSelLegal(w,slot,sel){
  if(!combatWeaponAllowed(w,slot)||!sel)return false;
  const ti=arr(sel.talents)[slot];
  if(!weaponFixedTalent(w)&&ti!=null&&ti>=0){const t=arr(TALENTS)[ti];if(!t||!talentUsableBy(t,w.cls)||talentIsPerfect(t))return false;}
  const bag=arr(sel.wmods)[slot]||{},codes=arr(wmSlots(w));
  for(const code of Object.keys(bag))if(bag[code]!=null&&(codes.indexOf(code)<0||arr(wmCands(w,code)).indexOf(bag[code])<0))return false;
  const aff=arr(sel.waffix)[slot];if(aff&&arr(weaponAffixCodes(w)).indexOf(aff)<0)return false;
  return true;
}
function optWholeLegal(w,gear,sel,slot,wslots){
  if(!Array.isArray(gear)||gear.length!==6||gear.some((it,i)=>!it||it.not_in_game||(DB.gear[it.raw]!==it&&GEAR_MAP[it.raw]!==it)||!GEAR_MAP[it.raw]||GEAR_MAP[it.raw].slot_idx!==i))return false;
  if(new Set(gear.map(optPieceKey)).size!==6||!exoticOk(gear)||!optPieceLimits(gear)||!optSelLegal(gear,sel)||!optWeaponSelLegal(w,slot,sel))return false;
  const ws=arr(wslots).slice();ws[slot]=DB.weapons.indexOf(w);
  if(ws.filter(i=>i!=null&&DB.weapons[i]?.exotic).length>1)return false;
  for(let i=0;i<6;i++){
    const c=optGtalCandsOf(gear[i],i),key=arr(sel.gtal)[i];
    if(key&&(c.keys.indexOf(key)<0))return false;
  }
  return true;
}
function optRecheckResult(res){
  if(!res||!res.ok||!res.context||!res.currentContext||!res.requestSignature||res.requestSignature!==optRequestSignature(res.requestOptions))return {ok:false,why:'stale-result'};
  try{
    const locks=state.opt?.lock||[],requested=res.requestOptions?.lock||[];
    for(let i=0;i<6;i++)if(locks[i]||requested[i]){
      const old={raw:state.slots[i],core:state.core[i],aff:state.affix[i],gtal:state.gtal[i],mod:state.gmods[i]};
      const next={raw:res.gear[i].raw,core:res.core[i],aff:res.aff[i],gtal:res.gtal[i],mod:res.gmods[i]};
      if(JSON.stringify(optStable(old))!==JSON.stringify(optStable(next)))return {ok:false,why:'locked-slot-mismatch'};
    }
    if(state.opt?.lockW||res.requestOptions?.lockW){
      const s=res.wslot,old={raw:state.wslots[s],talent:state.talents[s]??-1,mods:state.wmods[s]||{},affix:state.waffix[s]||''};
      const next={raw:DB.weapons.indexOf(res.w),talent:res.talents[s]??-1,mods:res.wmods[s]||{},affix:res.waffix[s]||''};
      if(JSON.stringify(optStable(old))!==JSON.stringify(optStable(next)))return {ok:false,why:'locked-weapon-mismatch'};
    }
    const args=optResultArgs(res);

    return withBuildEvaluationState(res.w,res.gear,args,()=>{
      if(!optWholeLegal(res.w,res.gear,res.sel,res.wslot,res.wslots))return {ok:false,why:'illegal-result'};
      // The delivered arrays and the validated selection must be the same build.
      const delivered={core:res.core,aff:res.aff,gtal:res.gtal,gmods:res.gmods,wmods:res.wmods,waffix:res.waffix,talents:res.talents};
      if(JSON.stringify(optStable(delivered))!==JSON.stringify(optStable(res.sel)))return {ok:false,why:'selection-mismatch'};
      const r=evalBuild(res.w,res.gear,args),preds=optPredicates(res.effectiveConstraints).concat(reqPredicates(res.effectiveReq));
      if(!preds.every(p=>p(r,res.gear,res.w))||optTargetValue(r,res.target)!==res.v)return {ok:false,why:'score-mismatch'};
      const current=evalBuild(res.w,res.gear,optResultArgs(res,res.currentContext));
      if(optTargetValue(current,res.target)!==res.currentV)return {ok:false,why:'current-score-mismatch'};
      return {ok:true,r,current};
    });
  }catch(e){return {ok:false,why:'invalid-context'};}
}
function optFlowOf(id) {

  if (!id) return null;
  for (var i = 0; i < OPT_FLOWS.length; i++) if (OPT_FLOWS[i][0] === id) return OPT_FLOWS[i][3];
  return null;
}
/* ── 目标表：引擎字段 → 界面名（越大越好） ───────────────────────────────────── */
/* 顺序 = 配装的常规口径（用户 2026-10-16 定）：**循环 → 爆发**；
   `单发`只对霰弹/狙击有意义（实测：双管猎枪爆发 58.98M、循环只剩 9.30M ——
   霰弹打完一梭子就装弹，光看单发/爆发会配出"纸面很猛、持续很虚"的枪）⇒ 单发排在后面。 */
var OPT_TARGETS = [
  ['sdps', '弹匣快照', 'Magazine snapshot', function (r) { return r.SDPS; }],
  ['dps', '爆发 DPS', 'Burst DPS', function (r) { return r.DPS; }],
  ['dpm', '弹匣伤害', 'Mag DMG', function (r) { return r.DPM; }],
  ['bullet', '单发伤害（霰弹/狙击口径）', 'Bullet DMG (shotgun / sniper)', function (r) { return r.BulletDamage; }],
  /* 近战伤害（2026-10-16 新增通道）：引擎 `compute()` 新出的 `MeleeDamage`（近战池 × 独立增伤 × 目标态；
     不吃武器伤/暴击/爆头）。选中它跑一键配装 = 以近战为首要目标。 */
  ['melee', '近战伤害', 'Melee DMG', function (r) { return r.MeleeDamage; }],
  ['armor', '护甲', 'Armor', function (r) { return r.Armor; }],
  /* 电工流派要的「技能伤害%」（`buildCompute` 的 r.SkillDamage = 技能伤害 + 技能效率） */
  ['skdam', '基础技能伤害%', 'Base skill DMG', function (r) { return r.SkillDamage; }],
  ['skillout', '单技能参考倍率（基准100）', 'Single-skill reference (base 100)', function (r) { return r.SkillOutputPercent; }],
  ['health', '生命', 'Health', function (r) { return r.Health; }],
];
/* ── 引擎未建模的开火机制（输出目标下必须排除）────────────────────────────────
   判据：武器自带天赋描述里的机制，引擎既不在 `applyTalent` 白名单、也没有对应公式
   ⇒ 引擎按「面板伤害 × rpm」硬算，结果系统性偏高。复仇女神是最直接的证据：
   面板 `dmg` 是满蓄力值、`rpm` 只算射击间隔、蓄力时间不计 ⇒ 每发都按满值进 DPS。
   这类不能靠调参修（蓄力时长是玩家操作，不是解包数据），只能排除。
   来源：`work/model-audit-20261023/talent-coverage.md` 的 A 类「开火机制」子集。
   ⚠️ 只收「机制不可建模」的；「击杀后 / 命中后 +X%」属于乐观假设，不在此列。 */
var OPT_UNMODELED_FIRE = {
  'player_weapon_marksmanrifle_awm_exotic_v1': '电磁加速器：0-100% 按蓄力时长结算，引擎按满值且不计蓄力时间',
  'player_weapon_sig_gl_m32_v1': 'M406 高爆榴弹：特殊弹药，引擎按普通枪械公式计算',
  'player_weapon_sig_sm_mamm_v1': '导引导弹：特殊弹药，引擎按普通枪械公式计算',
  'player_weapon_sig_crossbow_t1_v1': '爆破弩箭：特殊弹药，引擎按普通枪械公式计算'
};
/* 件天赋里同类的问题：条件是「切换武器」的增益，引擎按常驻计入 ⇒ 单枪持续输出里根本不存在。
   来源同上（A 类里 host_kind=gear 且机制是切枪的）。 */
var OPT_UNMODELED_GEAR = {
  'player_gear_holster_exotic_05': '复调旋律：切换武器后才触发 +20% 射速 / +20% 武器伤害，引擎按常驻计算'
};
function optGearModeled(it,target){
  if(!optOutputTarget(target)) return true;
  return !(it && OPT_UNMODELED_GEAR[it.mitem]);
}
/* 输出类目标：比的是持续/单发伤害，未建模的开火机制会直接污染排序。 */
function optOutputTarget(t){ return t==='dps'||t==='sdps'||t==='dpm'||t==='bullet'; }
function optWeaponModeled(w,target){
  if(!optOutputTarget(target)) return true;
  return !(w && OPT_UNMODELED_FIRE[w.mitem]);
}
/* 约束能盯的量：结果面三项 + 引擎 `fields` 里的常用项（键 = fields 名） */
var OPT_CKINDS = [
  ['elites', '精英防御%', 'ProtectionFromElites'],
  ['regen', '装甲回复', 'ArmorRegen'],
  ['hazard', '危害防护%', 'HazardProtection'],
  ['chc', '暴击几率%', null],
  ['chd', '暴击伤害%', 'CriticalHitDamage'],
  ['hsd', '爆头伤害%', 'HeadshotDamage'],
  ['handling', '武器控制%', 'WeaponHandling'],
  ['reload', '装弹速度%', 'ReloadSpeed'],
  ['skdam', '基础技能伤害%', 'SkillDamage'],
  ['skilltier', '技能分阶', 'SkillTier'],
  ['redcores', '纯红核心件数', 'RedCorePieces'],
  ['taken', '额外承伤倍率', 'DamageTakenMultiplier'],
  ['armor', '护甲', null],
  ['health', '生命', null],
];
function optTargetOf(id) {
  for (var i = 0; i < OPT_TARGETS.length; i++) if (OPT_TARGETS[i][0] === id) return OPT_TARGETS[i];
  return OPT_TARGETS[3];
}
function optTargetValue(r, id) {
  var v = optTargetOf(id)[3](r);
  return isFinite(v) ? v : -Infinity;
}
function optCKindOf(key) {
  for (var i = 0; i < OPT_CKINDS.length; i++) if (OPT_CKINDS[i][0] === key) return OPT_CKINDS[i];
  return null;
}
/* 约束取值：先看结果面（护甲 / 生命 / 暴击），再读 `r.fields`（属性累加项）。取不到 = NaN（判不满足）。 */
function optCValue(r, key) {
  var spec = optCKindOf(key);
  if (!spec) return NaN;
  if (key === 'armor') return r.Armor;
  if (key === 'elites') return r.ProtectionFromElites;
  if (key === 'skilltier') return r.SkillTier;
  if (key === 'redcores') return r.RedCorePieces;
  if (key === 'taken') return r.DamageTakenMultiplier;
  if (key === 'health') return r.Health;
  if (key === 'chc') return r.CHC;
  var f = r.fields || {}, v = f[spec[2]];
  return isFinite(v) ? v : NaN;
}
/* 约束 → 谓词。全部是**硬过滤**：不满足直接淘汰；淘汰光了如实报告，绝不偷偷放宽。 */
function optNumericDeficit(r,cs){
  return arr(cs).reduce((sum,c)=>{
    if(!c||c.kind!=='num'||!isFinite(+c.val))return sum;
    const value=optCValue(r,c.key),need=+c.val;if(!isFinite(value))return sum+1;
    return sum+Math.max(0,c.op==='max'?value-need:need-value)/Math.max(1,Math.abs(need));
  },0);
}
function optPredicates(cs) {
  var out = [];
  (cs || []).forEach(function (c) {
    if (!c) return;
    if (c.kind === 'num' && c.key && isFinite(+c.val)) {
      var need = +c.val, key = c.key, isMax = (c.op === 'max');
      out.push(function (r) {
        var v = optCValue(r, key);
        if (!isFinite(v)) return false;
        return isMax ? v <= need : v >= need;
      });
    } else if (c.kind === 'force' && c.what === 'weaponType' && c.val) {
      out.push(function (r, gear, w) { return !!w && w.type === c.val; });
    }
  });
  return out;
}
/* ── 覆盖矩阵（运行时现算，别写死条数）────────────────────────────────────────
   `evaluated` 只能由块**真进 `evaluate`** 的次数自增；unsupported 一律「列出 + 排除出搜索」。
   `ran`（2026-10-16 补，问题⑤）：「这个维度的块**被跑到过没有**」——没有则为 `false`。
   ⚠️ 没有它，`usable/evaluated` 的 0 会把两种完全不同的情况混成同一个数：
      「预算被件块吃光、块根本没跑」（1500 的实况）与「跑了但真没有可选」（枪自带固定天赋 /
      件是具名指针）。结果面上的文案与判读全靠这个区分，别删。
   `wtalent.fixed`：跑过的枪里出现过「自带固定天赋」（天赋不可换）⇒ 没有可选是合理 0。 */
function optCoverNew(){
  return {mode:'theoretical',
    dims:{piece:{pool:0,evaluated:0,ran:false},core:{codes:[],evaluated:0,unsupported:[],ran:false},
      affix:{codes:[],evaluated:0,unsupported:[],ran:false},gmods:{cands:0,evaluated:0,noValue:0,noSlot:[],ran:false},
      weapon:{pool:0,screened:0,refined:0,ran:false,unmodeled:[]},wtalent:{cands:0,usable:0,evaluated:0,unsupportedKeys:[],ran:false,fixed:false},
      wmods:{cands:0,evaluated:0,noValue:0,ran:false},waffix:{cands:0,evaluated:0,ran:false},
      gtal:{usable:0,evaluated:0,unsupportedKeys:[],lockedByPiece:0,ran:false}},
    /* 两种模式**必须显式区分**（结果面上照实说）：本轮只交付 `theoretical`。
       `inventory`（现有库存约束）本轮未实现 —— 仓库没有玩家持有物数据模型，
       **禁止**用静态 `geardb.json` 反推「玩家手上有什么」，所以这里把话说死。 */
    notes:['理论模式：按官方资料库满值计算（属性取官方满值 · 奇特唯一强制）',
      '非库存约束：本轮不读玩家持有物（inventory 模式未实现），结果**不代表你现在就能穿出来'],
    engineIgnored:[]};
}
/* ── 生产侧骨架种子（入口 = `o.seeds`）────────────────────────────────────────
   `spec` = 6 长数组，元素为 `null` 或族键（格式**必须同 `reqPieceKey(it)`**：`set:<code>`/`brand:<code>`）。
   骨架**只作搜索起点、不作硬约束**（用户 2026-10-16 定）。挑件顺序沿用套装种子的「背包→胸甲→其余」。 */
function optSeedSpec(spec){
  if(!Array.isArray(spec)||spec.length!==6)return null;
  for(var i=0;i<6;i++)if(spec[i]!=null&&typeof spec[i]!=='string')return null;
  return spec;
}
/* 装备组起点：先计入锁定件，再按背包/胸甲优先补到四件。 */
function optSetSeedGear(code,base,pools,lock){
  var seed=arr(base).slice(),order=[1,2,0,3,4,5],n=0;
  if(seed.length!==6)return null;
  for(var i=0;i<6;i++)if(lock&&lock[i]&&seed[i]&&seed[i].set_code===code)n++;
  if(n>4)return null;
  for(var oi=0;oi<order.length;oi++){
    var slot=order[oi];if(lock&&lock[slot])continue;
    if(n<4){
      var hit=arr(pools.gear[slot]).find(function(it){return it&&it.set_code===code;});
      if(hit){seed[slot]=hit;n++;continue;}
    }
    if(seed[slot]&&seed[slot].set_code===code){
      seed[slot]=arr(pools.gear[slot]).find(function(it){return it&&it.set_code!==code&&it.kind!=='exotic';})||null;
    }
  }
  return seed.every(Boolean)&&exoticOk(seed)&&optPieceLimits(seed)?seed:null;
}
function optSeedGear(spec,base,pools,lock){
  var order=[1,2,0,3,4,5],seed=arr(base).slice();
  if(seed.length!==6)return null;
  for(var oi=0;oi<order.length;oi++){
    var i=order[oi];
    if(lock&&lock[i])continue;                          // 锁定格：用 base（= 用户当前件），骨架不改它
    var key=spec[i];
    if(!key)continue;                                   // 未指定 ⇒ 用 base 那件补齐（骨架**不是**硬约束）
    var hit=null;
    for(var c=0;c<arr(pools.gear[i]).length;c++){
      var cand=pools.gear[i][c];
      if(!cand||cand.kind==='exotic')continue;
      if(reqPieceKey(cand)!==key)continue;
      hit=cand;break;
    }
    if(!hit)return null;                                // 指定了族键却挑不到件 ⇒ **丢这一条**（不替换成别的族）
    seed[i]=hit;
  }
  if(seed.some(function(x){return !x;}))return null;
  if(!exoticOk(seed))return null;
  if(!optPieceLimits(seed))return null;
  return seed;
}
