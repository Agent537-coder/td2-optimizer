/* 配装器页 · 装备天赋层（背包 / 胸甲的「件天赋」选择 + 数值入参）
   ───────────────────────────────────────────────────────────────────────────────
   为什么单开一层：装备天赋**既不落在件的固定词条里**（`attrs_max.slots`），
   **也不是几件套档位**（`build.data.js` 的 `collectGearBonus`）。它是件上的一个
   「天赋槽」——品牌件由玩家从池里**选一条**（游戏里随机滚），具名/奇特件是件
   **自带的固定一条**。所以单独一层；但值走**与词条同一条入参通路**（`picks.attrs`），
   `engine.js` 一行未动。
   ⚠️ 三条纪律（与 `build.tiers.js` 同款）：
   ① **公式零改动**：只产出 `picks.attrs` 行（`{name,val,unit:''}`）。`unit` 一律空串
      —— 引擎 `add()` 的键是 `attr.name + (attr.unit||'')`，两处都带单位会拼成
      `总武器伤%%` 而静默进 `InCalcu`（2026-09-13 真踩，见 `build.app.js:70-76`）。
   ② **值一律现算**：数值全部取 `DB.talents_official[].bonus`（PvP 模式取 `bonus_pvp`），
      本文件**不写任何数值**——只写「读哪个官方参数尾」「怎么合成」。
      合成用的层数/倍数**另有出处**（官方 `max_stacks` 参数，或官方文案），逐条注明。
   ③ **取不到官方参数就整条不喂**（返回 null）：不编数字、不拿 0 顶替；面板如实标「不参与计算」。 */

/* ── 判据出处 ────────────────────────────────────────────────────────────────────
   本层是「对照复刻 BuildTool 29.0.0」的产物，逐条可核：
   · **池**：`AppData.TalentData[Num-2]` —— 背包 `Num=4` ⇒ 下标 2、胸甲 `Num=5` ⇒ 下标 3；
     面具/手套/枪套/护膝 **显式清空池**（`GearViewModel.cs:301-363`，尤其 `:308-312`）。
     本机可核的原表：`C:/Users/537/Desktop/BuildTool完整复刻/08-清单明细/TalentData.tsv`
     组3 = 背包 **22 条** · 组4 = 胸甲 **24 条**（本文件的 `GTAL_TABLE` 逐条对照该表）。
   · **值**：参考工具同一张表的 `Bonus.Attribute` / `Bonus.Value` 列。
     ⚠️ 数值**不照抄参考工具**（它的表可能落后于版本）：一律回官方
     `talents_official[].bonus` 现取；参考值只用于**对拍**，对不上就在报告里列出，不悄悄放行。
   · **具名/奇特**：件自带那一条（`gear[].talent.key`），池里只有它一条、不可换。
   ⚠️ **本层符号一律带 `gtal` / `GTAL` 前缀**：资料库侧（`db.*.js`）已有 `talentOwner()`
   一类同名概念，`scripts/devcheck/check_page_dupes.py`（H6 看门狗）判跨页同名函数为红 —— 它判得对。
   ⚠️ 本文件**只**负责「背包 / 胸甲的件天赋」；**装备组 4 件套天赋**在 `gearsets_official[].tiers[].talents`
   （按穿够件数解锁，与件指针是两条不同的挂载路径），归 `build.tiers.js` 的档位层。 */

/* ── 官方参数取用 ────────────────────────────────────────────────────────────────
   **按代号结尾精确匹配**（`code.slice(-ends.length)===ends`），不按前缀猜、不按尾巴模糊匹配：
   同族/同名天赋的代号前缀会互相串（例：`..._P0_damage_increase` 与
   `..._P0_damage_increase_per_stack` 是两条不同的参数，前缀猜法会取错）。
   `on` = PvP 模式（官方给了 PvP 数值就用 PvP 的，口径与 `talentBonusOf` 一致）。取不到返回 null。 */
function gtalVal(t,on,ends){
  if(!t||!ends)return null;
  const rows=talentBonusOf(t,on);
  for(let i=0;i<rows.length;i++){
    const c=String((rows[i]&&rows[i].code)||'');
    if(c&&c.slice(-ends.length)===ends){const v=(rows[i].value!=null)?+rows[i].value:NaN;return isFinite(v)?v:null;}
  }
  return null;
}

/* ── 对照表 ──────────────────────────────────────────────────────────────────────
   每条的字段：
   `k`    = 官方 `talents_official[].key` 的**基名**（`_perfect` 变体由 `gtalEntry()` 现找，不写死）；
   `slot` = 进池的部位（**1 = 背包 / 2 = 胸甲**，与 `G_SLOTS` 同序）；缺省 = 不进池、只作件指针用；
   `tier` = 该族**归档位层 `build.tiers.js` 拥有**（按战场状态分档，不是定值）⇒ 本层不喂，
            只把它登记进池（用户在背包上选「震荡」= 让档位层的震荡族出档位选项）；
   `rows` = 入参行：`ends` 官方代号结尾、`f` 引擎字段；
            `mul` 层数倍数（数值常量，**逐条注明出处**）或 `mulEnds`（层数取官方参数，优先用这个）；
            `mode:'compound'` = 逐层独立乘算（`(1+v/100)^n−1`，官方文案「每层增加 v%」的乘区写法）。
   ⚠️ 顺序**照 `TalentData.tsv` 组3/组4 的原表顺序**（池里第一行是「警戒」/「抹灭性破坏」）——
      将来若要复刻参考工具「有池子就一定选中一项」的默认值（`Index=0`），顺序就是默认值的依据。 */
function gtalRules(){return arr(DB&&DB.combat_audit&&DB.combat_audit.gear_rules);}

/* 官方 key → 对照表条目。**最长前缀优先**（`..._headshot_damage` 是 `..._headshot_damage_perfect` 的前缀，
   同族两版都要能命中，且要命中那条**更长**的基名，避免短基名抢走别的族）。
   ⚠️ 比较一律小写归一：官方指针里出现过 `talent_gearset_Season08_4pc` 这种混写大小写的，
   而对照表的 `k` 全小写 ⇒ 原来靠各个调用点自己 `toLowerCase()` 兜（build.app.js / build.audit.js 各一处），
   新调用点漏写就是**静默查不到规则**（面板上那条天赋直接没有条件开关，页面上看不出任何异常）。
   归一收进这个唯一入口，调用点就不需要再各自记得。 */
function gtalEntry(key){
  if(!key||typeof key!=='string')return null;      // 传进来非串（例：误把天赋**对象**当 key）⇒ 判空，别抛
  const want=key.toLowerCase();
  let hit=null;
  for(const e of gtalRules()){
    const k=String(e.k==null?'':e.k).toLowerCase();
    if(!k||want!==k&&!want.startsWith(k+'_perfect'))continue;
    if(!hit||k.length>hit.klen)hit={e:e,k:k,klen:k.length};
  }
  return hit?hit.e:null;
}
/* 件指针（`gear[].talent.key`，**归一化条目上也保留着对象**，见 `build.app.js` 的 `buildGear()`）。
   ⚠️ 这里**不**用 `gearTalentKey()`：那个函数对装备组件有「取 4 件套天赋」的兜底分支，
   会把 4 件套那条天赋当成「件天赋」摆到卡片上。件天赋只认**件本体声明的指针**。 */
function gtalPtr(it){
  const t=it&&it.talent;
  if(t&&typeof t==='object'&&t.key)return String(t.key);
  if(typeof t==='string'&&t.trim())return t.trim();
  return '';
}
/* 该格「在装」的件天赋 key：① **件自带的固定指针**（具名/奇特）优先；② 否则品牌件从池里选的那条
   （`state.gtal[格位]`，与 `state.core` / `state.affix` 同构的 6 格数组）。取不到 = 空串。 */
function gtalKeyOf(i){
  const it=gearOf(i);
  if(!it)return '';
  return gtalKeyOfPiece(it,(state.gtal&&state.gtal[i])||'');
}
/* 同上，但**入参是件本身 + 那一条手选值**（不读 `state`）：
   `picksFor()` 是「不读页面控件」的纯函数（一键配装要批量试算），所以件必须由调用方传进来，
   `opt.gtal` 覆盖层与 `opt.core` / `opt.affix` 同款 —— 否则「评分的配装 ≠ 交付的配装」。 */
function gtalKeyOfPiece(it,pick){
  if(!it)return '';
  const ptr=gtalPtr(it);
  if(ptr)return ptr;                                  // 件指针优先（具名/奇特：件上那条就是答案）
  if(it.kind==='gearset')return '';                   // 装备组件：天赋走 4 件套档（build.tiers.js）
  return pick||'';
}
/* 该格的候选池。`locked:true` = 件自带、不可换；`keys` 空 = 该件没有件天赋（卡片不出这一行）。 */
function gtalPool(i){
  const it=gearOf(i);
  if(!it)return {locked:false,keys:[]};
  const ptr=gtalPtr(it);
  if(ptr)return {locked:true,keys:[ptr]};             // 具名/奇特：锁定件上那条（哪怕我们还没有它的数值规则）
  if(it.kind==='gearset')return {locked:false,keys:[]};   // 装备组件不挂件天赋
  return {locked:false,keys:gtalRules().filter(e=>e.slot===i&&TALENT_BY_KEY[e.k]).map(e=>e.k)};
}
/* 一条天赋的「有没有数值通路」判据（面板据此标灰，不假装算了：
   `ok` 有入参 · `none` 官方无伤害类参数 · `tier` 归档位层 · `todo` 本层还没有它的对照条目 · `nodata` 取不到官方值）。
   ⚠️ `nodata` 与 `todo` 必须分开：前者是「官方数据缺」，后者是「我们还没做」—— 报告里要能分辨。 */
function gtalStatus(key,on){
  const e=gtalEntry(key);
  if(!e)return 'todo';
  if(e.tier)return 'tier';
  if(!arr(e.rows).length)return 'none';
  return gtalRowsFor(key,on)===null?'nodata':'ok';
}
/* 该格这一条天赋的引擎入参行：
   · `[]`     = 该天赋**不参与计算**（无伤害/生存类参数，面板如实标）；
   · `null`   = **取不到官方参数**（整条不喂，绝不拿 0 顶替）；
   · `[{name,val,unit:''}]` = 正常入参（与词条同一条通路）。 */
function gtalRowsFor(key,on){
  const e=gtalEntry(key);
  if(!e||e.tier)return null;                          // 档位层拥有 ⇒ 不在这里喂（避免双算）
  if(!arr(e.rows).length)return [];
  const t=TALENT_BY_KEY[key]||null;
  if(!t)return null;
  const out=[];
  for(const r of e.rows){
    if(r.color)continue;
    let v=gtalVal(t,on,r.ends);
    if(v==null)return null;
    if(r.mulEnds){
      const n=gtalVal(t,on,r.mulEnds);
      if(n==null)return null;
      v=(r.mode==='compound')?(Math.pow(1+v/100,n)-1)*100:v*n;   // 乘算档 / 线性叠加档
    }else if(r.mul!=null){
      v=v*r.mul;
    }
    if(!isFinite(v))return null;
    out.push({name:r.f,val:v,unit:''});
  }
  return out;
}
/* 当前配装里 6 格「在装」的件天赋（供档位层与结果区对账用）。 */
function gtalInPlay(){
  const out=[];
  for(let i=0;i<6;i++){const k=gtalKeyOf(i);if(k)out.push({slot:i,key:k});}
  return out;
}
/* 当前配装里是否有一条具名/奇特件自带的「在装」天赋 key（`build.tiers.js` 判档位族在不在玩用）。 */
function gtalHasKey(key){
  if(!key)return false;
  for(const g of gtalInPlay())if(g.key===key)return true;
  return false;
}
