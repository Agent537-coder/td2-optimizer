/* 配装器页 · 装备天赋档位层：随**配装**出现的档位/条件型天赋（猎头者、土狼面具…），
   把档位换算成与词条同一条通路的引擎入参。
   ───────────────────────────────────────────────────────────────────────────────
   为什么单开一层：这批天赋的数值不落在件上、也不是固定加成，而是**按配装 + 战场状态选一档**
   （BuildTool 反编译里也是一批按名字判的特判）。它们与「天赋文案里的 `{n}` 占位」是**同一批参数**
   （`talents_official[].bonus[].code` 的 `_P<n>_` 后缀），所以判据只能有一条：**代号后缀对齐，
   取不到就不出选项、不拿 0 顶替**。
   ───────────────────────────────────────────────────────────────────────────────
   ⚠️ 三条纪律：
   ① **公式零改动**：本层只产出 `picks.attrs` 行（`{name,val,unit:''}`），与词条走同一条入参通路；
      引擎不认的名字照旧进 `ignoredAttrs` 记账，页面不许假装算了。
   ② **值一律现算**：数值取自 `DB.talents_official` 的 bonus（PvP 模式取 `bonus_pvp`），本文件**不写任何数字**。
   ③ **只对「已在装的那件」出档位**：`talTierInPlay()` 检查 6 个装备格 + 生效武器是否真带这条天赋，
      没带就整段不渲染（不出选项 = 不参与计算，避免页面上摆一堆与当前配装无关的开关）。
   ⚠️ **本层符号一律带 `talTier` / `TALTIER` 前缀**：资料库那边（`db.cards.js`）已经有一个同名的
   `tierRows()`（装备组 2/3/4 件套档位）。两页出现**跨页同名函数**会被
   `scripts/devcheck/check_page_dupes.py`（H6 看门狗）判红 —— 它判得对：这两件事毫无关系，
   同名只会让后来的人以为可以合并。2026-09-13 真踩，按看门狗的要求**改名**而不是登记豁免。
   常量名里那个下划线是照 `TALORDER` / `TG` 的既有风格写的，不是打错。 */
/* 档位表。每族：
   `family` = `talents_official[].key`（普通版；`_perfect` 变体由 `talTierKeys()` 现找，不写死）；
   `param`  = bonus 代号的前缀（P<n> 之后的后缀按**片段**匹配，改后缀名不一定立刻失效）；
   `bands`  = `{id,zh,en,dist[zh,en],use:[槽位]} `；`use` 的值就是取值用的后缀片段。 */
const TAL_TIER_FAMILIES=[
  {id:'concussion',family:'talent_mask_headshots_increase_headshot_damage',
   /* 震荡（**背包**天赋）。⚠️ 官方内部代号里的 `mask_` 是**误导**（与 `Talent_H_*` 那类同源）：
      件指针 = 具名背包 ⇒ 归属按**件**判，不按代号前缀判。
      官方参数位 = P0 爆头总武器伤 / P1 持续 / P2 射手步枪持续 / P3 爆头击杀总武器伤 / P4 击杀持续
      （普通 10·1.5·5·15·10；完美 20·1.5·5·15·10 —— **完美版由 `talTierEquippedKey` 按件上那条自动选**）。
      ⚠️ **两条不叠加**（用户 2026-09-14 原话：「不是12.5是击杀的会有15%，不算那持续5秒的10%总武器伤」）
      ⇒ 档位 = 不计入 / 爆头后（P0）/ 爆头击杀后（P3，**覆盖** P0 那条），**没有「两条相加」这一档**。
      两条都落 `TotalWeaponDamage`（总武器伤害 = **独立乘区**）；本文件不写数字，值一律现取。 */
   bands:[
     {id:'off',zh:'不计入',en:'Not counted',dist:['',''],use:[]},
     {id:'head',zh:'爆头后（总武器伤）',en:'After headshot',dist:['',''],use:['damage_increase']},
     {id:'kill',zh:'爆头击杀后（总武器伤）',en:'After headshot kill',dist:['',''],use:['damage_increase_for_kill']},
   ]},
  {id:'headache',family:'talent_gearset_hotshot_headache',keyed:true,weaponTypes:['射手步枪'],
   /* 头痛欲裂（大炮 4 件套）：官方文案「使用精确射手步枪时，爆头将会使**下一枪**爆头伤害提升 {0}%…
      从下一枪开始，若继续连续爆头，则每次都可得到上述三个奖励加成」。⇒ 档位只表「这一枪吃不吃」，
      回甲 / 填弹匣那两条与伤害无关，不进出参。它的参数位**没有** `_P<n>_` 标记 ⇒ `keyed:true`。 */
   bands:[
     {id:'off',zh:'不计入',en:'Not counted',dist:['',''],use:[]},
     {id:'on',zh:'下一发爆头',en:'Next headshot',dist:['',''],use:['headshot_damage_bonus']},
   ]},
  {id:'headhunter',family:'warlock_talent_headshot_kills_increase_next_weapon_hit',
   /* 猎头者：爆头击杀后，下一次武器命中额外获得该击杀伤害的 P1%，上限是武器伤害的 P2%
      （爆头伤超过 P0_pistol 时上限提到 P1_assault）。脚本是 Additive 平铺，不是 AmplifyDamage。
      默认关闭。没有上一击输入，所以「按击杀伤害」只喂结转比例，不编造上一击数字。 */
   bands:[
     {id:'off',zh:'不计入',en:'Not counted',dist:['',''],use:[]},
     {id:'low',zh:'达到较低上限',en:'At lower cap',dist:['',''],use:['cap']},
     {id:'high',zh:'达到较高上限',en:'At higher cap',dist:['',''],use:['pistol']},
     {id:'carry',zh:'按击杀伤害结转',en:'Carry from kill',dist:['',''],use:['damage_carried_over']},
   ]},
  {id:'coyote',family:'warlock_talent_exotic_mask_mk1',
   /* 土狼面具「群体本能」：按与最后命中目标的**距离**分三档（阈值也是官方参数 P0/P1）。 */
   bands:[
     {id:'off',zh:'不计入',en:'Not counted',dist:['',''],use:[]},
     {id:'close',zh:'近',en:'Close',dist:['0',{code:'distance_threshold_close'}],use:['close_crit_damage_bonus']},
     {id:'mid',zh:'中',en:'Mid',
      dist:[{code:'distance_threshold_close'},{code:'distance_threshold_far'}],
      use:['mid_crit_damage_bonus','mid_crit_chance_bonus']},
     {id:'far',zh:'远',en:'Far',dist:[{code:'distance_threshold_far'},''],use:['far_crit_chance_bonus']},
   ]},
  {id:'acesandeights',family:'talent_gearset_acesandeights_5piece',
   /* 亡者手牌（A8 4 件套）：官方数值 `damageBonus = 75%`（配合胸甲 +25% = 100%），
      触发节奏也是官方给的：`UI_baseCardsFlipped = 5` ⇒ 翻 5 张牌才触发一次，
      `4ofakind = 4` ⇒ 铁支那一手有 4 发吃到加成（葫芦 3 发 / 对A对8 2 发，见天赋文案）。
      ⚠️ 这是**下一枪**增伤，不进整匣常驻：`mul` 给的是折算口径，用户自己选档，
        **不写死一个方案**（站长 2026-11-03：「把触发的条件写进配装器，不要定死一个方案」）。
         · 平均（5 张牌 1 发）：75% × 1/5 = 15%
         · 铁支（4 发受益）：75% × 4/5 = 60%
         · 本枪已触发：75%（带胸甲 25% 时 100%）
      系数只在这里，页面/引擎不写数字。 */
   paramKey:'talent_gearset_acesandeights_warlock_damageBonus',
   bands:[
     {id:'off',zh:'不计入',en:'Not counted',dist:['',''],use:[]},
     {id:'avg',zh:'平均（5 张牌 1 发）',en:'Averaged (1 in 5 shots)',dist:['',''],use:['value'],mul:0.2},
     {id:'four',zh:'铁支（4 发受益）',en:'Four of a Kind (4 shots)',dist:['',''],use:['value'],mul:0.8},
     {id:'hit',zh:'本枪已触发',en:'Triggered this shot',dist:['',''],use:['value'],mul:1},
   ]},
  {id:'calculated',family:'talent_weapon_half_ammo_lowers_fire_rate_increases_weapon_damage',
   /* 精密计算（武器天赋）：官方 P0..P3 = 前半段 +25% 射速 / -25% 武器伤害；后半段 -18% 射速 / +30% 总武器伤害。
      两段互斥（由弹匣位置决定），所以做成可选档而不是相加；默认落在「后半段」。 */
   bands:[
     {id:'off',zh:'不计入',en:'Not counted',dist:['',''],use:[]},
     {id:'back',zh:'弹匣后半段（+30% 总武器伤）',en:'Back half (+30% total)',dist:['',''],use:['back_half_weapon_damage_change','back_half_RPM_change']},
     {id:'first',zh:'弹匣前半段（-25% 武器伤）',en:'First half (-25% weapon dmg)',dist:['',''],use:['first_half_weapon_damage_change','first_half_RPM_change']},
   ]},
  {id:'frenzy',family:'talent_lmg_reloading_from_empty_increases_damage_and_fire_rate',
   /* 疯狂（轻机枪武器天赋）：空弹匣装弹后，弹匣里每 `magazine_interval`（官方 10）发 1 层，
      每层 +3% 武器伤害 / +3% 射速，持续 9 秒。层数上限 = 弹匣 / 间隔（现算），
      当前层数在面板里可改（`perStack`），不写死。 */
   paramKey:'talent_lmg_reloading_from_empty_increases_damage_and_fire_rate_magazine_interval',
   stackInterval:'magazine_interval',
   bands:[
     {id:'off',zh:'不计入',en:'Not counted',dist:['',''],use:[]},
     {id:'on',zh:'空仓换弹后（按层数）',en:'After empty reload (per stack)',dist:['',''],use:['damage_increase','RPM_increase'],perStack:true},
   ]},
  {id:'bewildered',family:'talent_kneepads_turmoil_bewildered',
   /* 迷惑（动荡护膝）：官方 `percent_damage_to_transfer = 50%`，把对一名敌人的武器伤害转 50% 给附近另一名。
      转移几个目标官方没给 ⇒ 目标数输入（1..3），默认 1。 */
   paramKey:'talent_kneepads_bewildered_percent_damage_to_transfer',
   stackLabel:['转移目标','Targets'],stackMax:3,stackDefault:1,
   bands:[
     {id:'off',zh:'不计入',en:'Not counted',dist:['',''],use:[]},
     {id:'on',zh:'转移给附近敌人（按目标数）',en:'Transfer to nearby (per target)',dist:['',''],use:['value'],perStack:true},
   ]},
  {id:'versatile',family:'warlock_talent_weapon_swap_to_different_weapon_grants_damage',
   /* 多才多艺 / 完美多变（武器天赋）：换枪后 10 秒内按枪型与距离给武器伤害。
      官方 P1/P3/P5 = 近 / 远 / 中三档的伤害，P2/P4/P6/P7 = 各自的距离门槛。
      三档互斥（由枪型决定），所以用档位选择；完美版的数值由官方表自己的 `_perfect` 行给出，不另写。 */
   bands:[
     {id:'off',zh:'不计入',en:'Not counted',dist:['',''],use:[]},
     {id:'short',zh:'近距（≤15m · 冲锋枪/霰弹枪）',en:'Close (≤15m · SMG/shotgun)',dist:['0',{code:'short_range_distance'}],use:['short_range_damage_increase'],weaponTypes:['冲锋枪','霰弹枪']},
     {id:'mid',zh:'中距（15–25m · 轻机枪/突击步枪）',en:'Mid (15–25m · LMG/AR)',dist:[{code:'mid_range_distance_1'},{code:'mid_range_distance_2'}],use:['mid_range_damage_increase'],weaponTypes:['轻机枪','突击步枪']},
     {id:'long',zh:'远距（>25m · 步枪/射手步枪）',en:'Long (>25m · rifle/MMR)',dist:[{code:'long_range_distance'},''],use:['long_range_damage_increase'],weaponTypes:['步枪','射手步枪']},
   ]},
  {id:'unstoppable',family:'talent_chest_kills_increase_weapon_damage_based_on_armor',
   /* 无人能挡的力量 / 完美无人能挡的力量（胸甲 / 背包件天赋）：击杀后每层 +5%（完美 7%）总武器伤害。
      官方参数位只给了每层数值与持续时间，**没有给层数上限**（文案里的 {2} 位对的是持续时间 = 15，
      占位符对不上）⇒ 层数交给用户填（1..5，默认 1），不替官方编一个上限。
      完美版数值由官方 `_perfect` 行自动取用（7%），脚本不写数字。 */
   stackLabel:['层数','Stacks'],stackMax:5,stackDefault:1,
   bands:[
     {id:'off',zh:'不计入',en:'Not counted',dist:['',''],use:[]},
     {id:'on',zh:'击杀后（按层数）',en:'After kill (per stack)',dist:['',''],use:['weapon_damage'],perStack:true},
   ]},
];
/* 一族在库里的**全部** key（普通 + 完美 + 任何带同前缀的官方条目）——现找，写死会漏变体。 */
function talTierKeys(fam){
  const out=[];
  for(const t of arr(DB.talents_official)){
    const k=t&&t.key;
    if(typeof k==='string'&&(k===fam.family||k.indexOf(fam.family)===0))out.push(k);
  }
  return out;
}
/* 这一族在**当前配装里实际带着**的那个 key（普通版 / 完美版 / 具名件上的变体）。
   ⚠️ 不能用「优先 key 全等的普通版」的旧口径：带着完美版时会把 125% 当 150%、
   把震荡的 10% 当 20%（或反过来）算错 —— 判据只能是**件上写的那条**（`gearTalentKey`）。 */
function talTierEquippedKey(fam){
  const ks=talTierKeys(fam).filter(gearHasTalent);
  return ks.length?ks[0]:'';
}
/* 取该族当前模式下**任意一条**现存 key 的天赋对象：先取**实际带着的**那条，再退回普通版。 */
function talTierTalent(fam){
  const ks=talTierKeys(fam);
  if(!ks.length)return null;
  const list=arr(DB.talents_official);
  const pick=k=>list.find(t=>t&&t.key===k)||null;
  return pick(talTierEquippedKey(fam))||pick(fam.family)||pick(ks[0]);
}
/* 官方参数：按代号后缀片段取（**带 P<n>** 的参数位才算参数；同名不带参数位的行是别的天赋串进来的，跳过）。
   返回 {片段: 数值}；PvP 模式下官方给了 PvP 数值就用 PvP 的。 */
function talTierParams(t,on,style,fam){
  const out={};
  for(const b of talentBonusOf(t,on)){
    const c=String((b&&b.code)||'');
    if(!/_P\d+_/.test(c))continue;                       // 无参数位的行不属于文案里的 {n}
    const tail=c.replace(/^.*?_P\d+_/,'');
    if(!tail)continue;
    const v=(b.value!=null)?+b.value:NaN;
    if(isFinite(v))out[tail]=v;
  }
  /* `keyed` 族：参数位**没有** `_P<n>_` 标记时（大炮 4 件套「头痛欲裂」的
     `talent_gearset_hotshot_headache_headshot_damage_bonus`），改按「本天赋 key + `_`」剥前缀再收一遍。
     只在家族显式声明 `keyed:true` 时跑 —— 否则会把别的天赋串进来的行也当成本族参数。 */
  if(style==='keyed'){
    const key=String((t&&t.key)||'');
    if(key)for(const b of talentBonusOf(t,on)){
      const c=String((b&&b.code)||'');
      if(!c||/_P\d+_/.test(c)||c.indexOf(key+'_')!==0)continue;
      const v=(b.value!=null)?+b.value:NaN;
      if(isFinite(v))out[c.slice(key.length+1)]=v;
    }
  }
  /* `paramKey` 族：参数位的**完整代号**与天赋 key 不同前缀（A8 亡者手牌：天赋 key 是
     `talent_gearset_acesandeights_5piece`，数值行却是 `..._warlock_damageBonus`）⇒ 只能按完整代号取，
     统一收进 `out.value`。取不到就让整档作废（返回 null），不猜。 */
  if(fam&&fam.paramKey){
    const hit=talentBonusOf(t,on).find(b=>b&&String(b.code||'')===fam.paramKey);
    const v=hit?(hit.value!=null?+hit.value:NaN):NaN;
    if(isFinite(v))out.value=v;
  }
  return out;
}
/* 按片段取参数：先全等、再「以该片段结尾」（官方后缀偶有 `_ui` / `_value` 这类尾巴） */
function talTierParam(p,suf){
  if(!suf)return null;
  if(p[suf]!=null)return p[suf];
  for(const k in p)if(k===suf||k.slice(-suf.length)===suf)return p[k];
  return null;
}
/* 层数型档位（疯狂这类「每 N 发 1 层」）：层数上限由**弹匣 / 官方间隔**现算，
   当前层数取用户在该族上选的值（`state.bp.tierStacks[族]`），没选过就取满层。
   取不到弹匣或间隔就返回 null ⇒ 该档整档作废，不拿 0 或猜值顶替。 */
function talTierStacks(fam){
  const t=talTierTalent(fam);if(!t)return null;
  const p=talTierParams(t,!!state.bp.pvp,fam.keyed?'keyed':'',fam);
  /* paramKey 取到的值统一落在 p.value 上（见 talTierParams）；没给 paramKey 时按 stackInterval 的后缀取。 */
  /* 手动目标数（`stackMax`）：旗帜飘扬 / 迷惑这类「波及 / 转移给几个目标」的档位，
     目标数不能从武器推出来 ⇒ 给一个 1..stackMax 的输入，默认 stackDefault（不写死 1 之外的值）。 */
  if(fam.stackMax){
    const max=Math.max(1,Math.floor(+fam.stackMax||1));
    const saved=state.bp&&state.bp.tierStacks&&state.bp.tierStacks[fam.id];
    const dflt=Math.max(1,Math.min(max,Math.floor(+fam.stackDefault||1)));
    const cur=Number.isFinite(+saved)?Math.max(1,Math.min(max,Math.floor(+saved))):dflt;
    return {cur,max};
  }
  const interval=talTierParam(p,fam.paramKey?'value':(fam.stackInterval||'magazine_interval'));
  const w=arr(DB.weapons)[state.wslots[state.wactive]],mag=w?+w.mag:0;
  if(!(interval>0)||!(mag>0))return null;
  const max=Math.max(1,Math.floor(mag/interval));
  const saved=state.bp&&state.bp.tierStacks&&state.bp.tierStacks[fam.id];
  const cur=Number.isFinite(+saved)?Math.max(1,Math.min(max,Math.floor(+saved))):max;
  return {cur,max};
}
/* 档位 → 引擎入参行。**取不到任一参数就整档作废**（返回 null），绝不拿 0 或猜值顶替。 */
function talTierAttrs(fam,bandId,on){
  const band=arr(fam.bands).find(b=>b.id===bandId);
  if(!band||!band.use.length)return [];
  const t=talTierTalent(fam);if(!t)return null;
  const style=fam.keyed?'keyed':'';
  const p=talTierParams(t,on,style,fam),rows=[];
  /* 档位自带的折算系数：同一份官方数值在不同触发口径下按比例折算
     （A8「平均 1/5 枪」= ×0.2、「铁支 4 发」= ×0.8、「本枪」= ×1）。
     系数只写在家族表的 `mul` 上，本层不写任何游戏数字。 */
  const mul=(band.mul==null)?1:+band.mul;
  /* `perStack`：这份数值是**每层**的，乘上当前层数（层数由 talTierStacks 现算）。 */
  const stacks=band.perStack?talTierStacks(fam):null;
  if(band.perStack&&!stacks)return null;
  for(const suf of band.use){
    const raw=talTierParam(p,suf);
    if(raw==null||!isFinite(raw))return null;
    const v=raw*mul*(band.perStack?stacks.cur:1);
    /* 代号后缀 → 引擎字段名：后缀里的 `crit_damage`/`crit_chance`/`cap` 是**语义词**，不是展示名；
       官方展示名（`attr_zh`）对这批参数位是空的，所以只能按后缀判 —— 每个分支都要给依据。 */
    const nm=talTierAttrName(fam,suf);
    if(!nm)return null;
    /* 同一属性的多条官方参数（震荡的「爆头」与「爆头击杀」两条）在 `band.sum` 档上合成**一行**：
       入参按名字累加，拆两行在下游可能被按名去重、只留一条（那类丢项是静默的）。 */
    const hit=band.sum?rows.find(r=>r.name===nm):null;
    if(hit)hit.val+=v;else rows.push({name:nm,val:v,unit:''});
  }
  return rows;
}
/* 后缀 → 引擎属性键。⚠️ 口径（用户 2026-09-14）：**入参一律用英文原数据键**
   （引擎字段名 = 官方数据口径的名字），中文名只用于显示 —— 中文那套键引擎仍认（兼容老调用点），
   但**新代码不许再用**，否则以后又是一次"中文名当键"的静默失配。 */
function talTierAttrName(fam,suf){
  if(suf.indexOf('crit_damage')>=0)return 'CriticalHitDamage';
  if(suf.indexOf('crit_chance')>=0)return 'CriticalHitChance';
  /* 猎头者：上限与结转都是爆头格上的平铺加成，不进 HeadshotDamage，也不进 AmplifyDamage。
     较低上限是 _P2_cap；较高上限复用手枪操控那条参数位（P0_pistol），后缀里没有 cap。 */
  if(fam.id==='headhunter'&&(suf==='cap'||suf.indexOf('pistol')>=0))return 'HeadhunterCap';
  if(fam.id==='headhunter'&&suf.indexOf('damage_carried_over')>=0)return 'HeadhunterCarry';
  /* 震荡（**背包**天赋）：两条都进「总武器伤害」独立乘区（引擎侧 `×(1 + v/100)`）。 */
  if(fam.id==='concussion'&&suf.indexOf('damage_increase')>=0)return 'TotalWeaponDamage';
  /* 头痛欲裂（大炮 4 件套）：下一枪爆头独立增伤，只乘爆头本体，不进爆头伤词条。 */
  if(fam.id==='headache'&&suf.indexOf('headshot_damage_bonus')>=0)return 'AmplifyDamage_Headshot';
  /* 亡者手牌（A8 4pc）：翻牌后的下一枪增伤，进「总武器伤害」乘区。
     触发口径由档位自己的 `mul` 决定（平均 / 铁支 / 本枪），本函数只认字段。 */
  if(fam.id==='acesandeights'&&suf==='value')return 'TotalWeaponDamage';
  /* 疯狂（轻机枪）：空仓换弹后每 N 发 1 层，每层 +3% 武器伤害 / +3% 射速（官方 P0/P1）。
     层数由 `perStack` 乘上去，字段用「武器伤害」平铺区，不是总武器伤害乘区。 */
  /* 迷惑（动荡护膝）：把对一名敌人的武器伤害转 50% 给附近另一名 ⇒ 按「转移目标数」合计进总武器伤害乘区。 */
  if(fam.id==='bewildered'&&suf==='value')return 'TotalWeaponDamage';
  /* 多才多艺 / 完美多变：换枪后按「枪型 × 距离」给**武器伤害**（平铺区，不是总武器伤害乘区）。 */
  if(fam.id==='versatile'&&suf.indexOf('range_damage_increase')>=0)return 'AllWeaponDamage';
  /* 无人能挡的力量 / 完美版：击杀后按层数增加**总武器伤害**（官方文案「增加 {0}% 的总武器伤害」）。 */
  if(fam.id==='unstoppable'&&suf==='weapon_damage')return 'TotalWeaponDamage';
  if(fam.id==='frenzy'){
    if(suf.indexOf('RPM_increase')>=0)return 'RateOfFire';
    if(suf.indexOf('damage_increase')>=0)return 'AllWeaponDamage';
  }
  /* 精密计算（武器天赋）：弹匣前半段是「+射速 / −武器伤害（平铺）」，后半段是「−射速 / +总武器伤害（乘区）」。
     两段互斥，用档位选其一；字段按官方文案的「武器伤害」vs「总武器伤害」分开，不合并。 */
  if(fam.id==='calculated'){
    if(suf.indexOf('RPM_change')>=0)return 'RateOfFire';
    if(suf.indexOf('back_half_weapon_damage_change')>=0)return 'TotalWeaponDamage';
    if(suf.indexOf('first_half_weapon_damage_change')>=0)return 'AllWeaponDamage';
  }
  return null;
}
/* 档位的距离区间（米）。门槛本身也是官方参数（`distance_threshold_*`）⇒ 现算；
   取不到就给 null（面板据此不写这段，不拿 0 顶替）。`''` = 该端无界。 */
function talTierBandDist(fam,band,on){
  const t=talTierTalent(fam);if(!t)return null;
  const p=talTierParams(t,on,fam.keyed?'keyed':'',fam);
  const one=d=>{
    if(d==='')return '';
    if(d&&typeof d==='object'&&d.code){const v=talTierParam(p,d.code);return (v==null||!isFinite(v))?null:v;}
    const v=+d;return isFinite(v)?v:null;
  };
  const a=one((band.dist||['',''])[0]),b=one((band.dist||['',''])[1]);
  if(a===null||b===null)return null;
  return [a,b];
}
/* 一族的全部档位行：返回 [{id,rows}]，rows=null 表示该档取不到官方参数。被挡的族提前返回，不把上限冒充成伤害行。 */
function talTierRows(fam,on){
  if(combatBlocked(fam.family))return arr(fam.bands).map(b=>({id:b.id,rows:b.use.length?null:[]}));
  return arr(fam.bands).map(b=>{
    if(!b.use.length)return {id:b.id,rows:[]};
    /* 档位级的枪型门槛（多才多艺：冲锋/霰弹近距、轻机枪/突击中距、步枪/射手远距）：
       当前生效武器不在该档的枪型里 ⇒ 该档不出数值（也不参与默认档挑选）。 */
    if(b.weaponTypes&&b.weaponTypes.length){
      const w=arr(DB.weapons)[state.wslots[state.wactive]];
      const wt=w?(w.typeZh||w.type||''):'';
      if(b.weaponTypes.indexOf(wt)<0)return {id:b.id,rows:[]};
    }
    const rows=talTierAttrs(fam,b.id,on);
    if(!rows)return {id:b.id,rows:null};
    return {id:b.id,rows:rows};
  });
}
/* Frozen theoretical distance must select the attainable Coyote band, not the most profitable one.
   Source talentrules: close <= close threshold; mid >= close+.01 and <= far; far >= far+.01. */
function talTierPeakBands(fam,on,distance){
 const rows=talTierRows(fam,on).filter(b=>Array.isArray(b.rows));
 if(fam.id!=='coyote')return rows;
 const p=talTierParams(talTierTalent(fam),on,''),close=talTierParam(p,'distance_threshold_close'),far=talTierParam(p,'distance_threshold_far');
 let id='off';
 if(Number.isFinite(distance)&&distance>=0&&close!=null&&far!=null){
  if(distance<=close)id='close';
  else if(distance>=close+.01&&distance<=far)id='mid';
  else if(distance>=far+.01)id='far';
 }
 return rows.filter(b=>b.id==='off'||b.id===id);
}
/* 装备组**穿够了几件**（按件上的 `set_zh` 与本组的 `zh` 同名计数）。 */
function talTierSetCount(set){
  let n=0;
  for(const raw of arr(state.slots)){
    const it=raw==null?null:arr(DB.gear)[raw];
    if(it&&set&&it.set_zh&&it.set_zh===set.zh)n++;
  }
  return n;
}
/* **装备组档位天赋**是否已解锁：这条天赋不在任何件上，而是挂在装备组的 `tiers[].talents` 上
   （实测 `gearsets_official` 烈焰大炮 = 2 件 射手步枪伤害 30 · 3 件 爆头伤害 30 + 武器控制力 30 ·
   4 件 `talents:["头痛欲裂"]`、`effects:[]`）⇒ 判据只能是**穿够该档要求的件数**。
   ⚠️ 2026-09-14 的病灶就在这：老判据只认件指针 ⇒ 头痛欲裂**永远判「不在玩」** ⇒ 档位开不了。 */
function talTierSetUnlocked(fam){
  const ks=talTierKeys(fam);if(!ks.length)return false;
  for(const set of arr(DB.gearsets_official)){
    const n=talTierSetCount(set);
    for(const t of arr(set.tiers)){
      const need=NUM(t.pieces,0);if(need<=0||n<need)continue;
      const names=arr(t.talents).map(x=>(x&&(x.key||x.code||x.zh||x.name))||'');
      if(names.some(nm=>nm&&ks.some(k=>k===nm||k.indexOf(nm)===0||nm.indexOf(k)===0)))return true;
    }
  }
  return false;
}
/* 一族「在玩」的判据 = 三选一，全部照原生逻辑，不猜：
   ① 件上真有这条天赋（官方固定指针，含完美变体）；
   ② **装备组档位天赋** —— 不在件上，按穿够件数解锁（见 `talTierSetUnlocked`）；
   ③ **背包 / 胸甲 的件天赋选择**（`build.gtal.js` 的 `gtalInPlay()`）—— 游戏里这两个部位的天赋是
      **随机滚 / 可换**的，件表里查不到宿主件 ⇒ 判据只能是「用户在这一格选的那条」。
      ⚠️ 2026-09-14 改：原来这里读的是 `state.bp.gtal`（一个列 `kind==='slot'` 的**单值手选下拉**）。
      那个下拉与本轮新做的卡片选择器是同一个概念的第二套入口，已删（硬规则②）——
      现在只有一个来源：`gtalInPlay()`（6 格逐格，存官方 `key`）。 */
function talTierInPlay(){
  const out=[];
  const picked=gtalInPlay().map(x=>x.key);
  /* ④ **生效武器上的天赋**（2026-11-03 补）：武器天赋（精密计算 / 疯狂…）既不在件上、也不进 `gtal`，
     判据只能是「当前用于计算的那把枪带的是哪条」——固定天赋优先，其次是用户在这一槽选的天赋。 */
  const wa=state.wactive>=0?state.wslots[state.wactive]:null;
  const w=wa==null?null:arr(DB.weapons)[wa];
  const wtal=w?((typeof weaponFixedTalent==='function'&&weaponFixedTalent(w))||TALENTS[state.talents[state.wactive]]||null):null;
  const wtalKey=wtal&&wtal.key?String(wtal.key):'';
  for(const fam of TAL_TIER_FAMILIES){
    const ks=talTierKeys(fam);if(!ks.length)continue;
    const hit=ks.some(k=>gearHasTalent(k))||talTierSetUnlocked(fam)
      ||picked.some(p=>p&&ks.some(k=>k===p||k.indexOf(p)===0))
      ||(wtalKey&&ks.some(k=>k===wtalKey||wtalKey.indexOf(k)===0));
    if(hit)out.push(fam);
  }
  return out;
}
