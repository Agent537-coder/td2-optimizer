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
function talTierParams(t,on,style){
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
  return out;
}
/* 按片段取参数：先全等、再「以该片段结尾」（官方后缀偶有 `_ui` / `_value` 这类尾巴） */
function talTierParam(p,suf){
  if(!suf)return null;
  if(p[suf]!=null)return p[suf];
  for(const k in p)if(k===suf||k.slice(-suf.length)===suf)return p[k];
  return null;
}
/* 档位 → 引擎入参行。**取不到任一参数就整档作废**（返回 null），绝不拿 0 或猜值顶替。 */
function talTierAttrs(fam,bandId,on){
  const band=arr(fam.bands).find(b=>b.id===bandId);
  if(!band||!band.use.length)return [];
  const t=talTierTalent(fam);if(!t)return null;
  const style=fam.keyed?'keyed':'';
  const p=talTierParams(t,on,style),rows=[];
  for(const suf of band.use){
    const v=talTierParam(p,suf);
    if(v==null||!isFinite(v))return null;
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
  return null;
}
/* 档位的距离区间（米）。门槛本身也是官方参数（`distance_threshold_*`）⇒ 现算；
   取不到就给 null（面板据此不写这段，不拿 0 顶替）。`''` = 该端无界。 */
function talTierBandDist(fam,band,on){
  const t=talTierTalent(fam);if(!t)return null;
  const p=talTierParams(t,on,fam.keyed?'keyed':'');
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
  for(const fam of TAL_TIER_FAMILIES){
    const ks=talTierKeys(fam);if(!ks.length)continue;
    const hit=ks.some(k=>gearHasTalent(k))||talTierSetUnlocked(fam)
      ||picked.some(p=>p&&ks.some(k=>k===p||k.indexOf(p)===0));
    if(hit)out.push(fam);
  }
  return out;
}
