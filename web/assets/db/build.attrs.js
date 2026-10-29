/* 配装器页 · 属性名归一层：geardb.json（官方解包名）→ engine.js MAP 键（BuildTool 内部名）。
   ───────────────────────────────────────────────────────────────────────────────
   为什么要这一层：库里自带的是**官方数据名**，引擎的累加表用的是 BuildTool 的内部名，两边是两套中文。
   不做归一的话，装备固定槽 740 条里绝大多数、武器固定槽 782 条里的四条会被引擎按「未知属性」静默忽略
   （`add()` 走 default 只往 InCalcu 记一个 "?"），页面上看不出任何异常 —— 对不出账来才最危险。
   ───────────────────────────────────────────────────────────────────────────────
   ⚠️ 只有**同一个量**才允许归一，且必须逐条给出依据（列在 ALIAS 的第二位）：
     ① 同义异写（官方简体 vs 工具用词）：暴击机率/暴击几率、修复技能/技能修复、对精英的防御/精英防御…
     ② 同义换序（官方「对装甲的伤害」vs 工具「装甲伤害%」）—— 是同一个乘区，不是两个。
     ③ 官方英文漏出来（Pulse Resistance）—— 落回中文键。
     ④ 单位差异：官方 击杀时回复装甲 / 击杀回甲 两个名字分属**百分比**与**定值**两条（引擎里是
        ArmorOnKillPercent 与 ArmorOnKill 两个字段），一律用**单位**判，不用名字判。
   ⚠️ 不许归一的（归了就是编语义）：对生命值的伤害 / 燃烧伤害 / 提升燃烧持续时间 / 护盾生命值 /
     扫描脉冲加速 / 特有武器伤害 / 降低威胁度、提升威胁度 ——
     它们在引擎里根本没有对应字段，页面上按「未知」如实留空（构建期由 `python scripts/devcheck/attr_alias_check.py` 记账）。
     ✅ 「近战伤害」2026-10-16 起**已归一**（引擎新增 `MeleeDamage` 通道，`近战伤害%` ☰ MAP）：
      官方属性码 `WeaponMeleeDamageDefaultModBonus`（张牙舞爪 200%）与天赋参数
      `talent_gloves_over_the_top_melee_damage`（大张旗鼓 +100%）都进这一池 —— 名字原样命中，无需 ALIAS 项。 */
/* ALIAS：官方名（不带单位）→ [引擎 MAP 名（不含单位）, 依据] */
const ATTR_ALIAS={
  '暴击机率':['暴击几率','同义异写：官方「机率」= 工具「几率」'],
  '武器控制力':['武器控制','同义异写'],
  '修复技能':['技能修复','同义换序'],
  '对精英的防御':['精英防御','同义异写'],
  '对装甲的伤害':['装甲伤害','同义换序'],
  '对离开掩体目标的伤害':['掩体外伤害','同义换序'],
  '对生命值的伤害':['生命值伤害','同义换序'],
  '技能持续时间':['技能持续','同义异写'],
  '总装甲值':['装甲','同义异写：本身即「总装甲值%」这一条'],
  '击杀时回复装甲':['击杀回甲','同义异写：装备组官方名，单位仍决定百分比或定值'],
  'Pulse Resistance':['脉冲抗性','官方英文漏出'],
};
/* 单位补齐：官方件里少数属性**漏了单位**（同一属性在别的行是有 % 的），
   而引擎 MAP 的键含单位 ⇒ 不补就会被当成定值算进另一个字段（击杀回甲：定值 vs 百分比）。
   判据 = **同一属性在库里出现过 % 写法**，只补这一类，绝不把「本来就没有单位」的量补成百分比。 */
const ATTR_UNIT_FIX={
  '击杀时回复装甲':'%',
  '击杀回甲':'%',
};
/* 名字相同、单位不同 = 两个不同的字段，所以判据一律是「名字 + 单位」，绝不用名字单独判。 */
function attrKey(name,unit){
  const raw=String(name==null?'':name).trim();
  if(!raw)return '';
  const a=ATTR_ALIAS[raw];
  const u=String(unit==null?'':unit).trim()||(ATTR_UNIT_FIX[raw]||'');
  return (a?a[0]:raw)+u;
}
/* 归一是否命中引擎（给面板/体检用；未命中即「官方有、引擎没有」那一类，页面上不当成已计入） */
let ATTR_KNOWN=null;
function attrKnown(name,unit){
  if(!ATTR_KNOWN)ATTR_KNOWN=TD2Calc.attrNames();
  return ATTR_KNOWN.indexOf(attrKey(name,unit))>=0;
}
/* 「官方有、引擎没有」的账目（运行时现算，别写死条数）：{属性名: 次数} */
function attrUnknown(names){
  const miss={};
  for(const [n,u] of names)if(n&&!attrKnown(n,u))miss[n]=(miss[n]||0)+1;
  return miss;
}

/* ── 装备词条池的官方口径（对照参考工具 BuildTool 的 GearAttribute1List / GearAttribute23List）────
   这一层只管「哪些属性**有资格**出现在装备的哪个槽」，数值一律还是走 `attrs_max_curve.pools`（官方满值）。
   出处在参考工具源码（桌面 BuildTool 完整复刻 / 01-源码）：
   ① **核心（槽 1）全库只有 3 条**：武器伤害 / 装甲 / 技能分阶（`AppData.cs:3502-3512`），
      品牌件与装备组的核心就是在这 3 条里换（`GearViewModel.cs:132-142`）；
      奇特的核心是**件自带**（游戏里奇特的主属性固定）⇒ 界面锁死、只如实显示固定值；
      具名的核心按用户 2026-10-14 的口径放开，与品牌/装备组一样在这 3 条里换（判据在 `build.view.js` 的 `coreChoices()`）。
   ② **随机槽（槽 2/3）只有 12 条**：攻击族 4 + 防御族 4 + 效能族 4（`AppData.cs:3513-3542`）。
      「轻机枪伤害」这类**特定武器伤害从不进装备随机池** —— 它们只在武器核心
      （`WeaponAttribute1List`，`AppData.cs:1564-1583`）与品牌/套装的奖励文本里出现。
   ⚠️ 白名单按 **code** 给（名字有「机率/几率」两套写法，code 才稳）；同一属性在库里有
   `Default`/非 `Default` 两个变体的，两个都收 —— 取哪一个由该件品质档实际取得到那行决定。 */
const CORE_CODES_OFFICIAL=['WeaponDamageModBonus','ArmorGearFlatBonus','SkillPowerFlatBonus'];
const AFFIX_POOL_CODES={
  /* 只收**装备随机池真身引用到的**那 4 条：库里另有 `...DefaultFlatBonus` 两条同义变体
     （武器池在用），一并收进来会在卡上印出两颗同名 chip（用户：比例不对、重复）⇒ 排除。 */
  off:['WeaponCriticalHitChanceFlatBonus','WeaponCriticalHitDamageFlatBonus',
       'WeaponDamageMultiplierHeadFlatBonus','WeaponHandlingModBonus'],
  def:['AllStatusResistancePercentageFlatBonus','BlastDamageMitigationPercentageFlatBonus',
       'ArmorRegenFlatBonus','HealthFlatBonus'],
  uti:['allskills_damage_mod_Bonus','AllStatusEffectsModBonus','SkillHasteModBonus',
       'allskills_healing_mod_Bonus'],
};
const AFFIX_FAM_ORDER=['off','def','uti'];
/* 「特定武器伤害」族（以及武器伤害/装甲/技能分阶这类核心专属）—— 一律不许出现在装备随机池里 */
function isWeaponClassAffix(code,name){
  const n=String(name||'').trim();
  if(/^(突击步枪|步枪|射手步枪|狙击步枪|冲锋枪|轻机枪|霰弹枪|手枪)(伤害|Damage)$/.test(n))return true;
  return /^(AR|SMG|LMG|Shotgun|MarksmanRifle|SniperRifle|Pistol)Damage/.test(String(code||''));
}
/* 该件品质档能不能取到这条属性的官方满值（取不到就不摆上界面 —— 宁缺毋滥，不拿 0 顶替） */
function poolRowOf(code,q){
  const pools=(DB.attrs_max_curve||{}).pools||{};
  return pools[code+'@'+q]||pools[code+'@Orange']||null;
}
/* 某一族的随机副词条候选 = 白名单 ∩ 该件品质档取得到满值的 */
function affixPoolCodes(fam,q){
  return (AFFIX_POOL_CODES[fam]||[]).filter(c=>poolRowOf(c,q)!=null);
}
/* 全库副属性候选的并集：一键配装的 ⑥ 池与界面上摆出来的必须是同一份（两边同一判据，不许两套） */
function affixPoolUnion(q){
  const out=[],seen={};
  AFFIX_FAM_ORDER.forEach(f=>affixPoolCodes(f,q).forEach(c=>{if(!seen[c]){seen[c]=1;out.push(c);}}));
  return out;
}
