/* TD2 配装计算引擎 —— 按游戏内公式实现的标准路径计算（武器面板 → 伤害 → 累加 → DPS/DPM/SDPS/护甲/生命）。
   仅做"累加→出 DPS/DPM/SDPS/护甲/伤害"这套数学；配装器选择器负责喂入累加前的属性来源。
   属性→字段的映射逐条按游戏内属性定义核对；关键路径已用 dotnet 真值逐位对拍，请勿改公式。 */
(function (global) {
  'use strict';

  // 属性名(含单位后缀) → 累加目标。op: add | mul | set
  var MAP = {
    '武器伤害%': ['AllWeaponDamage', 'add'],
    '射手步枪伤害%': ['MMRDamage', 'add'],
    '步枪伤害%': ['RifleDamage', 'add'],
    '突击步枪伤害%': ['ARDamage', 'add'],
    '轻机枪伤害%': ['LMGDamage', 'add'],
    '冲锋枪伤害%': ['SMGDamage', 'add'],
    '霰弹枪伤害%': ['ShotgunDamage', 'add'],
    '手枪伤害%': ['PistolDamage', 'add'],
    '装甲伤害%': ['ArmorDamage', 'add'],
    '掩体伤害%': ['OutCoverDamage', 'add'],
    '掩体外伤害%': ['OutCoverDamage', 'add'],
    '生命值伤害%': ['HealthDamage', 'add'],
    '生命伤害%': ['HealthDamage', 'add'],
    /* 近战伤害%（2026-10-16 新增通道）：官方属性码 `WeaponMeleeDamageDefaultModBonus`
       （张牙舞爪 200%）、天赋参数 `talent_gloves_over_the_top_melee_damage`（大张旗鼓 +100%）
       都进这个池；近战输出见 compute() 里那一段。 */
    '近战伤害%': ['MeleeDamage', 'add'],
    '暴击几率%': ['CriticalHitChance', 'add'],
    '暴击伤害%': ['CriticalHitDamage', 'add'],
    '爆头伤害%': ['HeadshotDamage', 'add'],
    '射速%': ['RateOfFire', 'add'],
    '武器控制%': ['WeaponHandling', 'add'],
    '稳定度%': ['Stability', 'add'],
    '准确度%': ['Accuracy', 'add'],
    '装弹速度%': ['ReloadSpeed', 'add'],
    '切换速度%': ['SwapSpeed', 'add'],
    '有效射程%': ['OptimalRange', 'add'],
    '弹药容量%': ['AmmoCapacity', 'add'],
    '弹匣容量%': ['MagazineSize', 'add'],
    '子弹': ['Rounds', 'add'],
    '危害防护%': ['HazardProtection', 'add'],
    '燃烧抗性%': ['BurnResistance', 'add'],
    '电击抗性%': ['ShockResistance', 'add'],
    '出血抗性%': ['BleedResistance', 'add'],
    '干扰抗性%': ['DisruptResistance', 'add'],
    '诱捕抗性%': ['EnsnareResistance', 'add'],
    '混乱抗性%': ['DisorientResistance', 'add'],
    '致盲抗性%': ['BlindDeafResistance', 'add'],
    '爆炸抗性%': ['ExplosiveResistance', 'add'],
    '装甲回复': ['ArmorRegen', 'add'],
    '装甲回复%': ['ArmorRegenPercent', 'add'],
    '受到修复%': ['IncomingRepairs', 'add'],
    '脉冲抗性%': ['PulseResistance', 'add'],
    '装甲%': ['TotalArmor', 'add'],
    '装甲': ['Armor', 'add'],
    '生命%': ['TotalHealth', 'add'],
    '生命值%': ['TotalHealth', 'add'],
    '生命': ['Health', 'add'],
    '生命值': ['Health', 'add'],
    '击杀回甲%': ['ArmorOnKillPercent', 'add'],
    '击杀回甲': ['ArmorOnKill', 'add'],
    '精英防御%': ['ProtectionFromElites', 'add'],
    '技能分阶': ['SkillTier', 'add'],
    '技能效率%': ['SkillEfficiency', 'add'],
    '技能伤害%': ['SkillDamage', 'add'],
    '总技能伤害%': ['TotalSkillDamage', 'add'],
    '技能平台伤害%': ['PlatformSkillDamage', 'add'],
    '技能独立增伤%': ['AmplifySkillDamage', 'mul'],
    '额外承伤增幅%': ['AmplifyDamageTaken', 'mul'],
    '总技能修复%': ['TotalRepairSkills', 'add'],
    '状态效果%': ['StatusEffects', 'add'],
    '技能加速%': ['SkillHaste', 'add'],
    '技能修复%': ['RepairSkills', 'add'],
    '技能持续%': ['SkillDuration', 'add'],
    '技能生命%': ['SkillHealth', 'add'],
    '技能生命值%': ['SkillHealth', 'add'],
    '爆裂物伤害%': ['ExplosiveDamage', 'add'],
    '武器伤害(天赋)%': ['WeaponDamage_Talent', 'add'],
    '总武器伤%': ['TotalWeaponDamage', 'add'],
    '独立增伤%': ['AmplifyDamage', 'mul'],
    '武器独立增伤%': ['AmplifyDamage_NotForHeadhunter', 'mul'],
    '爆头独立增伤%': ['AmplifyDamage_Headshot', 'mul'],
    '出血伤害%': ['BleedDamage', 'add'],
    '燃烧伤害%': ['BurnDamage', 'add'],
    '额外护甲%': ['BonusArmor', 'add'],
    '伤害减免%': ['DamageReduction', 'add'],
    '移动速度%': ['MovementSpeed', 'add'],
    '伤害转回复%': ['DamageToRepair', 'add'],
    '接下来几发伤害%': ['NextShotsDamage', 'add'],
    '猎头者上限%': ['HeadhunterCap', 'add'],
    '猎头者结转%': ['HeadhunterCarry', 'add'],
    '状态扩散范围': ['StatusSpreadRange', 'add'],
    '冷却秒': ['CooldownSeconds', 'add'],
    '持续秒': ['DurationSeconds', 'add'],
    '触发几率%': ['ProcChance', 'add'],
    '效果半径': ['EffectRadius', 'add'],
    /* 标记数量（谈判者胸甲、专注连队胸甲这类「能标记几个目标」）：**目标数量**增益，
       不进任何伤害乘区 —— 与「冷却秒 / 持续秒 / 效果半径」同款，只作展示与对账用。 */
    '标记数量': ['MarkAmount', 'add'],
    '标记伤害传递%': ['MarkedTargetTransfer', 'add'],
    '弹药获取': ['AmmoGain', 'add'],
  };

  /* 原数据键：把每个累加目标**自己的英文名**也注册成键（引擎字段名就是官方数据口径的名字）。
     ⚠️ 口径（用户 2026-09-14 定）：**搜索与引擎一律用英文原数据**，中文名只用于显示。
     中文那张表留着兼容老调用点；**新代码一律用英文键**（例：`TotalWeaponDamage` / `HeadshotDamage`）。
     自动登记而不是手抄一份 —— 手抄必然漂（MAP 加一行、别名表漏一行，静默走 `InCalcu` 的 `名字?`）。 */
  for (var _k in MAP) { var _t = MAP[_k][0]; if (!MAP[_t]) MAP[_t] = MAP[_k]; }

  function fresh() {
    var f = {};
    for (var k in MAP) f[MAP[k][0]] = 0;      // 所有累加目标默认 0（对齐 C# 数值字段）
    for (var k2 in MAP) if (MAP[k2][1] === 'mul') f[MAP[k2][0]] = 1.0;
    f.AmplifyDamage = 1.0; f.AmplifyDamage_NotForHeadhunter = 1.0; f.AmplifyDamage_Headshot = 1.0;
    f.Armor = 660000.0; f.Health = 270000.0;
    f.Echo = 0; f.MagRefill = 0; f.InCalcu = ''; f.typeDamage = 0;
    return f;
  }

  // SwitchNameAndValue：name 已含单位后缀（如 "武器伤害%"）
  function add(f, name, num) {
    var m = MAP[name];
    if (!m) { f.InCalcu += ' ' + name + '?'; return; }
    if (m[1] === 'mul') f[m[0]] *= (100.0 + num) / 100.0;
    else f[m[0]] += num;
  }

  // CalculateBonus：bonus = {bonus:[{attr,val,unit},...]}
  function applyBonus(f, bonus) {
    if (!bonus || !bonus.bonus) return;
    bonus.bonus.forEach(function (b) { add(f, b.attr + (b.unit || ''), b.val); });
  }

  // 属性(attr 对象 {name,val,unit}) 累加（装备/武器属性）
  function applyAttr(f, attr) {
    if (!attr || !attr.name) return;
    add(f, attr.name + (attr.unit || ''), attr.val);
  }

  // CalculateTalent 里的专属天赋（特殊增益类）。返回 true 表示已处理。
  // weapon 可选：快手族/完美快手族依赖弹匣计数（magp）；缺省时按 {mag:0} 退化，不再抛异常。
  function applyTalent(f, talent, weapon) {
    if (!talent) return false;
    var n = talent.name;
    var wp = weapon || { mag: 0 };
    switch (n) {
      case '技能电容': f.AllWeaponDamage += Math.min(f.SkillTier, 6.0) * 7.5; return true;
      case '龙息': f.AllWeaponDamage += f.StatusEffects * 0.5; return true;
      case '快手族': f.ReloadSpeed += 3.0 * Math.min(magp(f, wp) * chc(f) / 100.0, 40.0); return true;
      case '完美快手族': f.ReloadSpeed += 5.0 * Math.min(magp(f, wp) * chc(f) / 100.0, 40.0); return true;
      case '回力镖':
        f.WeaponDamage_Talent += 40.0 * chc(f) / 100.0 * 0.5;
        f.MagRefill = 100.0 - (100.0 - f.MagRefill) * (100.0 - chc(f) * 0.5) / 100.0; return true;
      case '完美回力镖':
        f.WeaponDamage_Talent += 40.0 * chc(f) / 100.0 * 0.75;
        f.MagRefill = 100.0 - (100.0 - f.MagRefill) * (100.0 - chc(f) * 0.75) / 100.0; return true;
      case '沸点': f.CriticalHitChance = 47.0; return true;
      case '完美沸点': f.CriticalHitChance = 52.0; return true;
      case '足智多谋': return true; // 品牌/套装件数+1，由选择器处理
      default: return false;
    }
  }

  function chc(f) { return f.CriticalHitChance > 60.0 ? 60.0 : f.CriticalHitChance; }
  function mag(f, weapon) { return Math.floor((weapon.mag + f.Rounds) * (1.0 + f.MagazineSize / 100.0)); }
  function magp(f, weapon) { return mag(f, weapon) / (1.0 - f.MagRefill / 100.0); }

  // 主计算。weapon={type,dmg,rpm,mag,reload,range}；params={hit,headshot,outcover,armorPct} 百分比(默认100/0/100/100)
  // weaponTypeDamageArr = [AR,SMG,Shotgun,Rifle,MMR,LMG,Pistol] 对应 type 索引
  function compute(f, weapon, params) {
    params = params || {};
    var num2 = params.hit != null ? params.hit : 100.0;      // 命中率%
    var num3 = params.headshot != null ? params.headshot : 0.0; // 爆头率%
    var num4 = params.outcover != null ? params.outcover : 100.0;
    var num5 = params.armorPct != null ? params.armorPct : 100.0;

    var typeArr = [f.ARDamage, f.SMGDamage, f.ShotgunDamage, f.RifleDamage, f.MMRDamage, f.LMGDamage, f.PistolDamage];
    var WDattr = f.AllWeaponDamage + (f.typeDamage != null && f.typeDamage !== 0 ? f.typeDamage : (typeArr[weapon.type] || 0));
    var WDTalent = f.WeaponDamage_Talent || 0;
    f.ReloadSpeed += f.WeaponHandling; f.Stability += f.WeaponHandling;
    f.Accuracy += f.WeaponHandling; f.SwapSpeed += f.WeaponHandling;

    var num14 = chc(f) * f.CriticalHitDamage / 100.0;
    var num15 = num3 * f.HeadshotDamage / 100.0;
    var num16 = (1.0 + num4 * f.OutCoverDamage / 10000.0) /
      (num5 / (100.0 + f.ArmorDamage) + (100.0 - num5) / (100.0 + f.HealthDamage)) * 100.0 - 100.0;
    var num17 = weapon.dmg * (1.0 + WDattr / 100.0 + WDTalent / 100.0) * (1.0 + f.TotalWeaponDamage / 100.0)
      * f.AmplifyDamage * f.AmplifyDamage_NotForHeadhunter;
    var num18 = num17 * (1.0 + num14 / 100.0 + num15 / 100.0) * (1.0 + num16 / 100.0) * (1.0 + (f.Echo || 0) / 100.0);
    /* ── 近战通道（2026-10-16 用户「加近战通道」；**新增输出**，上面既有公式一行未动）────────
       口径（用户 2026-10-16 裁定）：**近战就是近战 —— 只认「能加近战」的那几项**，
       武器伤 / 总武器伤 / 武器独立增伤**一律不进近战口径**（否则「近战最高」会被武器伤牵着走，
       配出来的是一套枪械配装：实测它因此去追专注连队 4 件 +105% 武器伤，近战件反而被挤掉）。
       进近战口径的只有三条：
         · **近战伤害池** `f.MeleeDamage`：死亡女神挂件「死亡之吻」+500% · 张牙舞爪 +200% ·
           大张旗鼓（染血指节）+100% —— 官方属性码都是 `WeaponMeleeDamageDefaultModBonus`；
         · **独立增伤** `f.AmplifyDamage`（全局增伤，如玻璃大炮「你造成的所有伤害 +30%」）；
         · **目标态**：对甲 / 血伤 / 掩体（四态与 Hits 矩阵同名同形；combined 与 num18 用同一个 num16）。
       ⚠️ 不吃暴击（CHC/CHD）、不吃爆头（HSD）、不吃枪种伤害 / 射速 / 装填。
       ⚠️ 另给一个**宽口径** `MeleeWide`（再乘武器伤池 + 总武器伤 + 武器独立增伤）留作对照，
          **不进一键配装目标表** —— 目标只有 `MeleeDamage` 这一个口径。 */
    var meleeBase = (1.0 + (f.MeleeDamage || 0) / 100.0) * f.AmplifyDamage;
    var meleeWide = meleeBase * (1.0 + (f.AllWeaponDamage + (f.WeaponDamage_Talent || 0)) / 100.0)
      * (1.0 + f.TotalWeaponDamage / 100.0) * f.AmplifyDamage_NotForHeadhunter;
    var num19 = weapon.rpm * (1.0 + f.RateOfFire / 100.0);
    var num20 = weapon.reload / (1.0 + f.ReloadSpeed / 100.0);
    if (num20 < 1.0) num20 = weapon.reload !== 0 ? 1 : 0;
    var MAG = mag(f, weapon);
    var MAGP = MAG / (1.0 - f.MagRefill / 100.0);
    var DPS, DPM, SDPS, bullet = num18;
    var st = params.specialTalent || '';
    if (st.indexOf('计算') >= 0 || st.indexOf('疯狂') >= 0) {
      var isCalc = st.indexOf('计算') >= 0, isCrazy = st.indexOf('疯狂') >= 0;
      var num22 = 0, num23 = 0, num24 = 0, num25 = 0;
      if (isCalc) { var perfect = st.indexOf('完美计算') >= 0; num22 = perfect ? -0.3 : -0.25; num23 = perfect ? 0.38 : 0.3; num24 = 0.25; num25 = -0.18; }
      var num27 = 0;
      if (isCrazy) num27 = (st.indexOf('完美疯狂') >= 0) ? (MAG / 8.0) : (MAG / 10.0);
      var num28 = isCalc ? (MAGP / 2.0) : MAGP;
      var num29 = isCalc ? (MAGP / 2.0) : 0.0;
      var e1 = 1.0 + (f.Echo || 0) / 100.0, mm = 1.0 + num14 / 100.0 + num15 / 100.0, mo = 1.0 + num16 / 100.0;
      var amp = f.AmplifyDamage * f.AmplifyDamage_NotForHeadhunter;
      var num30 = weapon.rpm * (1.0 + f.RateOfFire / 100.0 + num24 + num27 * 0.03);
      var num31 = weapon.dmg * (1.0 + WDattr / 100.0 + WDTalent / 100.0 + num22 + num27 * 0.03) * (1.0 + f.TotalWeaponDamage / 100.0) * amp;
      var num32 = num31 * mm * mo * e1;
      var num33 = weapon.rpm * (1.0 + f.RateOfFire / 100.0 + num24);
      var num34 = weapon.dmg * (1.0 + WDattr / 100.0 + WDTalent / 100.0 + num22) * (1.0 + f.TotalWeaponDamage / 100.0) * amp * mm * mo * e1;
      var num35 = weapon.rpm * (1.0 + f.RateOfFire / 100.0 + num25);
      var num36 = weapon.dmg * (1.0 + WDattr / 100.0 + WDTalent / 100.0) * (1.0 + f.TotalWeaponDamage / 100.0 + num23) * amp * mm * mo * e1;
      var num37 = weapon.rpm * (1.0 + f.RateOfFire / 100.0 + num25 + num27 * 0.03);
      var num38 = weapon.dmg * (1.0 + WDattr / 100.0 + WDTalent / 100.0 + num27 * 0.03) * (1.0 + f.TotalWeaponDamage / 100.0 + num23) * amp * mm * mo * e1;
      var num39 = num28 / num30 * 60.0, num40 = 0, num41 = 0;
      if (num39 <= 9.0) {
        num40 += num28 * num32; num41 += num39;
        var num42 = 9.0 - num39, num43 = Math.floor(num42 * num37 / 60.0);
        if (num43 >= num29) { num40 += num29 * num38; num41 += num29 / num37 * 60.0; }
        else { num40 += num43 * num38 + (num29 - num43) * num36; num41 += num42 + (num29 - num43) / num35 * 60.0; }
      } else {
        var num44 = Math.floor(9.0 * num30 / 60.0);
        num40 += num44 * num32 + (num28 - num44) * num34; num41 += 9.0 + (num28 - num44) / num33 * 60.0;
        num40 += num29 * num36; num41 += num29 / num35 * 60.0;
      }
      DPS = num2 / 100.0 * num30 / 60.0 * num32; DPM = num2 / 100.0 * num40; SDPS = DPM / (num41 + num20);
      bullet = num32; num19 = num30;
    } else {
      DPS = num2 / 100.0 * num19 / 60.0 * num18; DPM = num2 / 100.0 * MAGP * num18; SDPS = DPM / (MAGP / num19 * 60.0 + num20);
    }

    return {
      DPS: DPS, DPM: DPM, SDPS: SDPS,
      Damage: weapon.dmg * (1.0 + WDattr / 100.0),
      BulletDamage: bullet,
      MeleeBase: meleeBase,
      MeleeDamage: meleeBase * (1.0 + num16 / 100.0),
      Melee: meleeBase * (1.0 + f.HealthDamage / 100.0),
      Melee_Armor: meleeBase * (1.0 + f.ArmorDamage / 100.0),
      Melee_Cover: meleeBase * (1.0 + f.HealthDamage / 100.0) * (1.0 + f.OutCoverDamage / 100.0),
      Melee_ArmorCover: meleeBase * (1.0 + f.ArmorDamage / 100.0) * (1.0 + f.OutCoverDamage / 100.0),
      MeleeWide: meleeWide,
      Melee_ArmorCover: meleeBase * (1.0 + f.ArmorDamage / 100.0) * (1.0 + f.OutCoverDamage / 100.0),
      RPM: num19, ReloadTime: num20, Magazine: Math.floor(MAGP),
      CHC: chc(f), CHD: f.CriticalHitDamage, HSD: f.HeadshotDamage,
      Armor: f.Armor * (1.0 + f.TotalArmor / 100.0),
      Health: f.Health * (1.0 + f.TotalHealth / 100.0),
      fields: f,
    };
  }

  // ── Phase3 选择器编排（新增薄封装；上方 compute/applyBonus/applyAttr/applyTalent/add/fresh 原样未动，
  //    dotcheck 对拍路径不经过这里，真值行为不变） ─────────────────────────────
  // geardb 中文武器类型 → 游戏内伤害类型数组 [AR,SMG,Shotgun,Rifle,MMR,LMG,Pistol] 索引（DESIGN-GEARDB §3）。
  // 未知/缺失 → -1（compute 里 typeArr[-1]||0，与旧字符串输入同样落 0，不会 NaN）。
  var TYPE_IDX = { '突击步枪': 0, '冲锋枪': 1, '霰弹枪': 2, '狙击步枪': 3, '步枪': 3, '神射手步枪': 4, '射手步枪': 4, '轻机枪': 5, '手枪': 6 };
  function weaponTypeIndex(t) { if (typeof t === 'number') return t; var i = TYPE_IDX[t]; return i == null ? -1 : i; }

  // ── build 参数层（②手表/③专长/④精通/⑤额外参数/⑥基线） ─────────────────────────
  // 口径与出处见 docs/DESIGN-GEARDB.md §11。**一律挂在 params.bp 之下**：
  // bp 缺省（旧调用 / dotcheck / parity.mjs）⇒ 这一段整段不生效，默认入参逐位等价，既有真值对拍不受影响。
  var SPEC_WEAPON_KEYS = ['ar', 'smg', 'shotgun', 'rifle', 'mmr', 'lmg', 'pistol'];
  var BP_TYPE_ORDER = ['突击步枪', '冲锋枪', '霰弹枪', '步枪', '射手步枪', '轻机枪', '手枪'];
  // 与字段累加等价的「额外参数」项（attr 是 fresh() 里的字段名，unit 'mul' = 独立增伤连乘）
  var BP_EXTRA = [
    ['chc', 'CriticalHitChance', 'add'], ['chd', 'CriticalHitDamage', 'add'],
    ['hsd', 'HeadshotDamage', 'add'], ['damage', 'AllWeaponDamage', 'add'],
    ['totalDamage', 'TotalWeaponDamage', 'add'], ['amplify', 'AmplifyDamage', 'mul'],
    ['reloadSpeed', 'ReloadSpeed', 'add'], ['rateOfFire', 'RateOfFire', 'add'],
    ['outCoverDamage', 'OutCoverDamage', 'add'], ['armorDamage', 'ArmorDamage', 'add'],
    ['healthDamage', 'HealthDamage', 'add'], ['magazineSize', 'MagazineSize', 'add'],
  ];
  // 手表「一千级」满值（BuildTool MoreParam.Watch 分支，Services.g.cs L505-524 逐条抄）
  var BP_WATCH = [
    ['AllWeaponDamage', 10], ['CriticalHitChance', 10], ['CriticalHitDamage', 20], ['HeadshotDamage', 20],
    ['TotalArmor', 10], ['TotalHealth', 10], ['HazardProtection', 10], ['ExplosiveResistance', 10],
    ['SkillDamage', 10], ['RepairSkills', 10], ['SkillDuration', 10], ['SkillHaste', 10],
    ['ReloadSpeed', 10], ['Accuracy', 10], ['Stability', 10], ['AmmoCapacity', 20], ['Health', 60000],
  ];
  // 专精（判定依据 = 数据里的 key，不是位置）：Services.g.cs L478-504
  var BP_SPEC = {
    survivalist: [['ProtectionFromElites', 10]],
    gunner: [['ArmorOnKillPercent', 10]],
    sharpshooter: [['Stability', 15]],
    demolitionist: [['ExplosiveDamage', 10], ['BurnResistance', 20]],
    technician: [['SkillTier', 1]],
    firewall: [],
  };
  // 六部位装甲满值基数（Services.g.cs L992-997；精通按 Lv/100 加，原型件恒按 30）
  var BP_ARMOR = [80000, 131000, 158000, 80000, 112000, 99000];
  var MAX_EXPERTISE = 30;
  function bpNum(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function bpAdd(f, field, num, mul) { if (!num) return; if (mul) f[field] *= (100.0 + num) / 100.0; else f[field] += num; }
  function applyBuildParams(f, w, params) {
    var bp = params && params.bp;
    if (!bp) return;
    if (f.PulseResistance != null) f.PulseResistance += 50.0;     // 角色基础（L477）
    f.CriticalHitDamage += 25.0;                                  // 角色基础暴伤（L476）
    /* ① 武器枪种爆头：`weapons[].head_mult` 是**倍率**（手枪 2.0 / 突击步枪 1.55 / 射手步枪 1.0），
       官方真值表 `WeapoonHeadshotDamage = [55,50,45,60,0,65,100]` 给的是**加成百分点**（= (倍率-1)×100）
       ⇒ 只加"超出的那一部分"，不是整个倍率。
       判据（2026-09-14 靶场实测，同一发同一目标）：战术 .308（head_mult 1.0 = 射手步枪加成 0）
       + 武器词条爆头 111 + 手表 20 ⇒ +131%，实测爆头 3,932,287 / 反算 3,932,290（3 ppm）；
       旧写法 `head_mult * 100` 会给 +231% ⇒ **每个枪种都多 100 点**，实测差 43%。
       ⚠️ 数据里 `head_mult = 0`（1 把步枪）与 null（8 把射手步枪）是**没有该值**，不是"再扣 100"
       ⇒ 判据用 `> 0`，缺值一律不加。 */
    if (w && isFinite(w.head_mult) && w.head_mult > 0) f.HeadshotDamage += (w.head_mult - 1.0) * 100.0;
    // ② 手表满值
    if (bp.watch) for (var i = 0; i < BP_WATCH.length; i++) bpAdd(f, BP_WATCH[i][0], BP_WATCH[i][1]);
    // ③ 专长 15%：与 weapon.type 同项才加（L586-592）
    var ti = w ? BP_TYPE_ORDER.indexOf(w.typeZh) : -1, specHit = false;
    var selectedWeapons = SPEC_WEAPON_KEYS.filter(function(k){return bp.sp && bp.sp[k];}).slice(0,3);
    if (bp.spec && ti >= 0 && selectedWeapons.indexOf(SPEC_WEAPON_KEYS[ti]) >= 0) {
      bpAdd(f, ['ARDamage', 'SMGDamage', 'ShotgunDamage', 'RifleDamage', 'MMRDamage', 'LMGDamage', 'PistolDamage'][ti], 15);
      specHit = true;
    }
    // ④ 专精
    var rows = bp.spec ? BP_SPEC[bp.spec] : null;
    if (rows) for (var j = 0; j < rows.length; j++) bpAdd(f, rows[j][0], rows[j][1]);
    if (bp.spec === 'technician') bpAdd(f, bp.technicianBranch === 'healing' ? 'RepairSkills' : 'SkillDamage', 10);
    if (bp.spec === 'sharpshooter' && w && (w.typeZh === '步枪' || w.typeZh === '射手步枪')) f.HeadshotDamage += 15.0;
    // ⑤ 额外参数 12 项
    var ex = bp.extras || {};
    for (var k = 0; k < BP_EXTRA.length; k++) {
      var e = BP_EXTRA[k];
      bpAdd(f, e[1], bpNum(ex[e[0]], 0), e[2] === 'mul');
    }
    // ⑥ 精通：武器伤 +Lv、六部位装甲 +基数×Lv/100
    var wexp = bp.weaponExpertise == null ? 0 : bpNum(bp.weaponExpertise, 0);
    if (bp.weaponPrototype) wexp = MAX_EXPERTISE;
    wexp = Math.max(0, Math.min(MAX_EXPERTISE, Math.floor(wexp)));
    if (w && ['player_weapon_sig_gl_m32_v1','player_weapon_sig_sm_mamm_v1','player_weapon_sig_crossbow_t1_v1'].indexOf(w.mitem)>=0) wexp=0;
    if (wexp) bpAdd(f, 'AllWeaponDamage', wexp);
    var gexp = bp.gearExpertise == null ? 0 : bpNum(bp.gearExpertise, 0);
    gexp = Math.max(0, Math.min(MAX_EXPERTISE, Math.floor(gexp)));
    for (var m = 0; m < 6; m++) {
      if (bp.gearPresent && !bp.gearPresent[m]) continue;
      var lv = (bp.gearPrototype && bp.gearPrototype[m]) ? MAX_EXPERTISE : gexp;
      if (lv) bpAdd(f, 'Armor', BP_ARMOR[m] * lv / 100.0);
    }
    return { specHit: specHit, weaponExpertise: wexp, gearExpertise: gexp };
  }

  // buildCompute(weapon, picks, params)：整份 build → fresh 累加 → compute，返回 compute 结果 + 诊断字段。
  // weapon:{type(中文或索引),dmg,rpm,mag,reload,range, head_mult?, attrs?}   attrs=该件属性[{name,val?,value?,unit?}]（val 缺省当 0）
  // picks:{attrs?, mods?(允许 value 字段), bonuses?(品牌加成档，形状即 geardb 的 {bonus:[{attr,val,unit}]}),
  //        talents?([{name}]), tweaks?(手填微调 {name,val,unit})}
  // 累加顺序：参数层（bp，含手表/专精/精通/额外参数）→ 装备/武器/模组属性 → 品牌 bonus →
  //   天赋（applyTalent 依赖已累计的 chc/mag，必须最后），params 原样透传 compute。
  // 诊断：r.unsupportedTalents（applyTalent 不认识的专属天赋名）、r.ignoredAttrs（MAP 未收录、被引擎按默认分支忽略的属性名）。
  function buildCompute(weapon, picks, params) {
    picks = picks || {};
    var f = fresh();
    var unsupportedTalents = [];
    // 与 compute() 内部同一取法：[AR,SMG,Shotgun,Rifle,MMR,LMG,Pistol]（命中矩阵要用它复算 num17）
    function typeArrFor(ff) { return [ff.ARDamage, ff.SMGDamage, ff.ShotgunDamage, ff.RifleDamage, ff.MMRDamage, ff.LMGDamage, ff.PistolDamage]; }
    function feedAttr(a) {
      if (!a || !a.name) return;
      if (a.name.indexOf('随机') >= 0) return;   // 随机词条占位：不计入、也不算"未知属性"
      var v = a.val != null ? a.val : (a.value != null ? a.value : 0);
      applyAttr(f, { name: a.name, val: v, unit: a.unit || '' });
    }
    (picks.attrs || []).forEach(feedAttr);
    (picks.mods || []).forEach(feedAttr);
    (picks.tweaks || []).forEach(feedAttr);
    if (weapon && weapon.attrs) weapon.attrs.forEach(feedAttr);
    (picks.bonuses || []).forEach(function (b) { applyBonus(f, b); });
    var w = {
      dmg: weapon.dmg, rpm: weapon.rpm, mag: weapon.mag,
      reload: weapon.reload, range: weapon.range, type: weaponTypeIndex(weapon.type),
      typeZh: typeof weapon.type === 'string' ? weapon.type : '',
      head_mult: weapon.head_mult, mitem: weapon.mitem,
    };
    var layer = applyBuildParams(f, w, params || {});
    // Live-client acceptance: sum fractional cores first, round once; overflow is not overcharge.
    var rawSkillTier = f.SkillTier;
    f.SkillTier = Math.max(0, Math.min(6, Math.round(f.SkillTier)));
    (picks.talents || []).forEach(function (t) {
      if (!t || !t.name) return;
      if (!applyTalent(f, t, w)) unsupportedTalents.push(t.name);
    });
    var r = compute(f, w, params);
    r.unsupportedTalents = unsupportedTalents;
    r.RedCorePieces = Math.max(0, Math.min(6, +picks.redCorePieces || 0));
    r.BleedDamage = f.BleedDamage; r.BurnDamage = f.BurnDamage;
    r.BonusArmor = f.BonusArmor; r.DamageReduction = f.DamageReduction;
    r.MovementSpeed = f.MovementSpeed; r.DamageToRepair = f.DamageToRepair;
    r.NextShotsDamage = f.NextShotsDamage; r.StatusSpreadRange = f.StatusSpreadRange;
    if (layer) {
      /* 16 格命中矩阵：与 BuildTool 的 Result 命中四族（Hit / Critical_Hit / Headshot_Hit /
         CriticalHeadshot_Hit）× 目标四态（生命值 / 掩体外生命值 / 装甲 / 掩体外装甲）逐格同名同式。
         HitBase = 引擎内部 num17（已含 武器伤/类别伤/天赋武器伤/总武器伤/独立增伤）；四种命中形态都用它，
         所以矩阵不做第二次乘算，**对拍口径与旧 compute() 完全一致**。
         ⚠️ 两个表面怪癖照抄，不"修正"：① 掩体修正 1+OutCoverDamage/100 只进「掩体外」两列，         装甲修正只进「装甲」两列；② Headshot 两列多乘一个 AmplifyDamage_Headshot
         （`爆头独立增伤%` 累进去的），不是笔误。
          ⚠️ **③ 暴击与爆头是加算**（判据与实测见下方那个循环）；这 16 格**不在真值对拍覆盖内**
          —— `scripts/buildtool/parity.mjs` 的 `SKIP_DERIVED` 把 Hit / Critical_Hit / Headshot_Hit /
          CriticalHeadshot_Hit 及 `_Armor` / `_Cover` / `_ArmorCover` 全列进跳过表 ⇒ 只能靠靶场实测当判据。 */
      var hbase = w.dmg * (1.0 + (f.AllWeaponDamage + (f.typeDamage ? f.typeDamage : (typeArrFor(f)[w.type] || 0)) + (f.WeaponDamage_Talent || 0)) / 100.0)
        * (1.0 + f.TotalWeaponDamage / 100.0) * f.AmplifyDamage * f.AmplifyDamage_NotForHeadhunter;
      var combos = [
        ['', 'Hit', f.HealthDamage, false, false], ['_Cover', 'Hit', f.HealthDamage, true, false],
        ['_Armor', 'Hit', f.ArmorDamage, false, false], ['_ArmorCover', 'Hit', f.ArmorDamage, true, false],
        ['', 'Critical_Hit', f.HealthDamage, false, true], ['_Cover', 'Critical_Hit', f.HealthDamage, true, true],
        ['_Armor', 'Critical_Hit', f.ArmorDamage, false, true], ['_ArmorCover', 'Critical_Hit', f.ArmorDamage, true, true],
        ['', 'Headshot_Hit', f.HealthDamage, false, false, true], ['_Cover', 'Headshot_Hit', f.HealthDamage, true, false, true],
        ['_Armor', 'Headshot_Hit', f.ArmorDamage, false, false, true], ['_ArmorCover', 'Headshot_Hit', f.ArmorDamage, true, false, true],
        ['', 'CriticalHeadshot_Hit', f.HealthDamage, false, true, true], ['_Cover', 'CriticalHeadshot_Hit', f.HealthDamage, true, true, true],
        ['_Armor', 'CriticalHeadshot_Hit', f.ArmorDamage, false, true, true], ['_ArmorCover', 'CriticalHeadshot_Hit', f.ArmorDamage, true, true, true],
      ];
      var hits = {};
      for (var c = 0; c < combos.length; c++) {
        var co = combos[c];
        /* ⚠️ **暴击与爆头在同一个括号里相加**，不是两次相乘。
           真值路径 Compute（`CalculateBuild` 118740-118831 的 else 分支，原文见 `scripts/dotcheck/Program.cs:119-123`）
           给的就是 `1 + 暴击几率×暴伤/100 + 爆头率×爆头伤/100`；矩阵的「必定暴击 / 必定爆头」是它的极限形态
           ⇒ `1 + 暴伤/100 + 爆头伤/100`。
           判据（2026-09-14 靶场实测，同一发同一目标、身体 1,702,290 为基准）：
           暴击 3,898,241 = ×2.29、爆头 3,932,287 = ×2.31、暴击爆头 4,714,031 = **×3.60 = 1 + 1.29 + 1.31**。
           旧写法（两次相乘）在「暴击爆头」那一族给 ×5.29 ⇒ 实测差 **47%**。 */
        var headMul = co[5] ? (f.AmplifyDamage_Headshot || 1.0) : 1.0;
        var headFlat = co[5] && f.HeadhunterCap ? hbase * f.HeadhunterCap / 100.0 : 0.0;
        /* HeadhunterCarry 是上一发击杀伤害的比例，不是当前武器伤害的比例。没有上一发输入时不加。 */
        var v = hbase * (1.0 + co[2] / 100.0) * (co[3] ? (1.0 + f.OutCoverDamage / 100.0) : 1.0)
          * (1.0 + (co[4] ? f.CriticalHitDamage / 100.0 : 0) + (co[5] ? f.HeadshotDamage / 100.0 : 0))
          * headMul + headFlat;
        hits[co[1] + co[0]] = v;
      }
      r.HitBase = hbase; r.Hits = hits; r.Hit = hits.Hit; r.Headshot_Hit = hits.Headshot_Hit;
      r.Range = (weapon.range || 0) * (1.0 + f.OptimalRange / 100.0);
      r.Stability = f.Stability; r.Accuracy = f.Accuracy;
      r.WeaponHandling = f.WeaponHandling; r.OptimalRange = f.OptimalRange / 100.0;
      r.SwapSpeed = f.SwapSpeed; r.AmmoCapacity = f.AmmoCapacity;
      r.ArmorOnKill = r.Armor * f.ArmorOnKillPercent / 100.0 + f.ArmorOnKill;
      r.ArmorRegen = r.Armor * f.ArmorRegenPercent / 100.0 + f.ArmorRegen;
      // Y8S3.3 attribute_dictionary: Max(0.2, 1 - DamageTakenFromElitesModBonus).
      r.DamageTakenMultiplier = f.AmplifyDamageTaken;
      r.RawProtectionFromElites = f.ProtectionFromElites;
      r.ProtectionFromElites = Math.max(0, Math.min(80, f.ProtectionFromElites));
      r.IncomingRepairs = f.IncomingRepairs; r.ExplosiveResistance = f.ExplosiveResistance;
      r.HazardProtection = f.HazardProtection; r.PulseResistance = f.PulseResistance;
      r.BleedResistance = f.BleedResistance + f.HazardProtection;
      r.BlindDeafResistance = f.BlindDeafResistance + f.HazardProtection;
      r.BurnResistance = f.BurnResistance + f.HazardProtection;
      r.DisorientResistance = f.DisorientResistance + f.HazardProtection;
      r.DisruptResistance = f.DisruptResistance + f.HazardProtection;
      r.EnsnareResistance = f.EnsnareResistance + f.HazardProtection;
      r.ShockResistance = f.ShockResistance + f.HazardProtection;
      r.RawSkillTier = rawSkillTier; r.SkillTier = f.SkillTier; r.SkillEfficiency = f.SkillEfficiency;
      r.SkillDamage = f.SkillDamage + f.SkillEfficiency;
      // Separate pools in the unpacked drone/turret formulas; not actual skill DPS.
      r.TotalSkillDamage = f.TotalSkillDamage; r.AmplifySkillDamage = f.AmplifySkillDamage;
      r.PlatformSkillDamage = f.PlatformSkillDamage;
      // Reference scope: assault turret / assault drone, same tier and same skill.
      // Source: (1 + platform bonus + skill-specific bonus) * (1 + allskills) * (1 + GearTalentAllSkills).
      r.SkillDamageMultiplier = (1 + f.PlatformSkillDamage / 100) * (1 + r.SkillDamage / 100) * (1 + f.TotalSkillDamage / 100) * f.AmplifySkillDamage;
      r.SkillOutputPercent = r.SkillDamageMultiplier * 100;
      r.TotalRepairSkills = f.TotalRepairSkills;
      r.StatusEffects = f.StatusEffects + f.SkillEfficiency;
      r.SkillHaste = f.SkillHaste + f.SkillEfficiency; r.SkillDuration = f.SkillDuration + f.SkillEfficiency;
      r.RepairSkills = f.RepairSkills + f.SkillEfficiency; r.SkillHealth = f.SkillHealth + f.SkillEfficiency;
      r.ExplosiveDamage = f.ExplosiveDamage;
      r.CooldownSeconds = f.CooldownSeconds; r.DurationSeconds = f.DurationSeconds;
      r.ProcChance = f.ProcChance; r.EffectRadius = f.EffectRadius; r.AmmoGain = f.AmmoGain;
      r.specHit = layer.specHit; r.weaponExpertise = layer.weaponExpertise; r.gearExpertise = layer.gearExpertise;
    }
    var ignored = [];
    (f.InCalcu || '').split('?').forEach(function (s) {
      var n = s.trim(); if (n) ignored.push(n.replace(/\?$/, ''));
    });
    r.ignoredAttrs = ignored;
    return r;
  }
  function attrNames() { var a = []; for (var k in MAP) a.push(k); return a; }
  /* 展示用的属性名：**只出中文那套**（人看的自动补全 / 选择项）。
     原数据键（`TotalWeaponDamage` 这种）是**机器键** —— 引擎认，但不该混进用户的补全列表（同一条属性出现两次）。
     判据 = 键与它的累加目标同名者即原数据键。 */
  function attrDisplayNames() { var a = []; for (var k in MAP) if (MAP[k][0] !== k) a.push(k); return a; }

  global.TD2Calc = { fresh: fresh, add: add, applyBonus: applyBonus, applyAttr: applyAttr, applyTalent: applyTalent, compute: compute, chc: chc, mag: mag, magp: magp, buildCompute: buildCompute, weaponTypeIndex: weaponTypeIndex, attrNames: attrNames, attrDisplayNames: attrDisplayNames,
    BP_WATCH: BP_WATCH, BP_SPEC: BP_SPEC, BP_ARMOR: BP_ARMOR, BP_EXTRA: BP_EXTRA, BP_TYPE_ORDER: BP_TYPE_ORDER, MAX_EXPERTISE: MAX_EXPERTISE };
})(typeof window !== 'undefined' ? window : globalThis);
