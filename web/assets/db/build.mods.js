/* 配装器页 · 武器插槽层（第 7 层）：官方四个插槽（瞄具 / 枪口 / 握把 / 弹匣）的候选与入参。
   ───────────────────────────────────────────────────────────────────────────────
   为什么单独一层：这是配装器里**唯一**一处「官方数据齐备、界面从来没接」的面 ——
   `DB.mods` 379 件配件、`DB.weapon_slots` 4 个槽位、`DB.weapon_mod_matrix` 四张型号表
   都早就在库里，而 `picksFor()` 只把**装备**插件（`state.gmods`）喂进引擎，武器配件一件都没进过。
   ───────────────────────────────────────────────────────────────────────────────
   ⚠️ 三个口径全部照抄官方解包，**不许自己发明**：
   ① **该枪有哪些插槽** = `weapons[].slots[]`（官方逐把给：269 把 4 槽 / 101 把 3 槽 / 37 把 2 槽 /
      24 把 1 槽 / 3 把 0 槽）。**不是**「所有枪都四槽」—— 霰弹枪常见只有瞄具+握把，
      1886 只有弹匣。少给一个槽和少给一件装备一样，都是凭空多算。
   ② **该槽能装哪些配件** = 官方 `weapons[].slot_tags[槽]`（该槽允许的安装位标签）与
      `mods[].tags`（该件配件自己的标签）之间的判定：
        · 基底词元（`Magazine` / `Magazine_5.56` / `Muzzle_Large` 这类**别的配件也都有**的泛用词元）
          不参与判定 —— 官方给每把枪都带一个基底词元，拿它判定等于「所有配件都能装」；
        · 剩下的**特征词元**必须落在该枪该槽的允许集合里（`Magazine_Extended` 只能装给声明了它的枪）。
      判据是官方 `tags`，不是名字、不是型号字符串（`weapon_mod_matrix` 只是型号清单，没有「谁能装谁」的信息）。
   ③ **固定件**：`weapons[].fixed_mods[]`（58/434 把有，奇特武器为主）是该枪**预装好、不可换**的配件。
      槽位照常画出来（否则玩家看不到自己那把枪自带什么），但**不可选**，取值一律走官方预装那件。 */

/* ⚠️ **入参契约与词条完全一致**：喂进引擎的是 `{name,val,unit:''}`，`name` 走 `attrKey()` 归一
   （引擎按 `attr.name + (attr.unit||'')` 拼键 ⇒ 两处都带单位会拼成 `暴击几率%%`、MAP 查不到、
   `add()` 走 `InCalcu` 静默忽略 —— 页面数字照出、控制台一句不报，本仓踩过三次）。
   归不进去的属性（实测只有「近战伤害」一项，引擎里确实没有对应字段）**照旧如实喂**，
   由引擎记进 `r.ignoredAttrs`，页面按「未知」显示，**绝不假装算了**。 */

/* 槽位顺序 = 官方 `weapons[].slots[]` 里的出现序（官方就是按这个序给的），缺槽不占位。
   ⚠️ 符号一律 `wm` 前缀：资料库那边已有 `weaponMods()`（配件页的**型号→配件分组**，另一件事），
   跨页同名会被 `check_page_dupes.py`（H6）判红 —— 2026-09-13 在装备天赋档位那层刚踩过一次。 */
const WM_ORDER=['optics','muzzle','underbarrel','magazine'];
/* 官方槽位小图标（`web/assets/db/img/weaponmod1..4.png`）—— 与 `build.data.js` 的 `WATT` 同一批文件，
   这里给槽位→文件名，供武器卡与选择器两处共用（`WATT` 那份是给 `attachHtml` 用的旧口径）。 */
const wmICON={optics:'weaponmod1.png',muzzle:'weaponmod2.png',underbarrel:'weaponmod3.png',magazine:'weaponmod4.png'};
const WM_SLOT_ZH={optics:['瞄具','Optics'],muzzle:['枪口','Muzzle'],underbarrel:['握把','Underbarrel'],magazine:['弹匣','Magazine']};
/* 官方 `weapon_slots[].code` 就是这四个；`zh` 直接读库，不写死一份平行表 */
function wmSlotZh(code){
  const s=arr(DB.weapon_slots).filter(x=>x&&x.code===code)[0];
  return s?(s.zh||s.en||code):(WM_SLOT_ZH[code]?WM_SLOT_ZH[code][0]:code);
}
function wmSlotLbl(code){return L(wmSlotZh(code),code);}

/* `mods[]` 的索引：槽位 → 该槽全部配件（构建一次，页面生命周期内不变） */
let WM_BY_SLOT=null;
function wmIndex(){
  if(WM_BY_SLOT)return WM_BY_SLOT;
  WM_BY_SLOT={};
  arr(DB.mods).forEach((m,i)=>{
    if(!m)return;
    const s=m.slot;
    if(!s)return;
    (WM_BY_SLOT[s]=WM_BY_SLOT[s]||[]).push(i);
  });
  return WM_BY_SLOT;
}
/* 该配件的「安装位词元」= `tags` 里属于本槽前缀的那些（`UI_*` / `Audio_*` / 武器专属标签都不算安装位）。
   前缀取官方两套写法：`optics` 既有 `Optic`（`Optic_Long`）也有 `Sniper_Scope`。
   官方 `slot_tags` 里混着一个**泛用基底词元**（`Muzzle` / `Magazine` 裸词），它出现在该槽几乎每一件
   配件上 ⇒ 拿它判定等于「所有配件都能装」，必须丢掉（判据见下面 `wmBaseTags()`）。 */
const WM_TAG_PREF={optics:['Optic','Sniper_Scope'],muzzle:['Muzzle'],underbarrel:['Underbarrel'],magazine:['Magazine']};
function wmTags(m){
  const sl=m&&m.slot;
  const pref=WM_TAG_PREF[sl];
  if(!pref)return [];
  return arr(m&&m.tags).filter(t=>typeof t==='string'&&pref.some(p=>t.indexOf(p)===0));
}
/* 覆盖该槽**全部带属性配件**的标签 = 泛用基底（实测 4 个槽各 0–1 个）。判据现算、不写死：
   官方加一件新配件，这个集合自己会跟着变；某槽一件配件都没覆盖到 ⇒ 返回空集（那就没有可丢的）。 */
let WM_BASE_TAG=null;
function wmBaseTags(){
  if(WM_BASE_TAG)return WM_BASE_TAG;
  const idx=wmIndex(), all=arr(DB.mods);
  WM_BASE_TAG={};
  WM_ORDER.forEach(sl=>{
    const pool=(idx[sl]||[]).filter(i=>arr(all[i]&&all[i].attrs).length);   // 分母 = 该槽**带属性**的配件
    if(!pool.length)return;
    const cnt={};
    pool.forEach(i=>wmTags(all[i]).forEach(t=>{cnt[t]=(cnt[t]||0)+1;}));
    Object.keys(cnt).forEach(t=>{if(cnt[t]===pool.length)WM_BASE_TAG[sl+'|'+t]=1;});
  });
  return WM_BASE_TAG;
}
function wmIsBaseTag(slot,tag){return !!wmBaseTags()[slot+'|'+tag];}

/* `w` = 归一化后的武器条目（`w.raw` 才是 geardb 原始行）；两个形态都收，省得调用方自己判。 */
function wmRaw(w){return (w&&(w.raw||w))||null;}
function wmSlots(w){
  const raw=wmRaw(w);
  const s=arr(raw&&raw.slots);
  return WM_ORDER.filter(x=>s.indexOf(x)>=0);
}
/* 该枪该槽的官方允许标签（`slot_tags` 优先，缺了退回 `attachments[槽].tags` —— 两者官方同源） */
function wmAllowed(w,slot){
  const raw=wmRaw(w);if(!raw)return [];
  const t=(raw.slot_tags||{})[slot];
  if(arr(t).length)return arr(t);
  const a=(raw.attachments||{})[slot];
  return arr(a&&a.tags);
}
/* 该枪该槽的官方预装件（不可换）；没有就 null */
function wmFixed(w,slot){
  const raw=wmRaw(w);if(!raw)return null;
  return arr(raw.fixed_mods).filter(f=>f&&f.slot===slot)[0]||null;
}
/* 该枪该槽可选的配件下标（**只碰官方标签命中件**，不额外按「有没有属性」过滤）。
   ⚠️ 为什么不过滤掉「属性为空的件」（本轮第一版就错在这，真机一量 714 个槽空掉）：
      实测带属性的**普通**件每槽只有 optics 15 / muzzle 13 / underbarrel 2 / magazine 14 件
      （385 件带属性里 349 件是奇特预装件）⇒ 按「带属性」过滤后握把只剩 49/368 把枪有候选、
      弹匣 119/404，**大部分枪的槽直接空掉**；按官方标签取则是 368/368、404/404 全覆盖
      （实测 1477 个 (枪,槽) 里只有 2 个真无解：牛椋鸟 / 天蝎座的枪口）。
      所以候选**按官方标签给全**，行上如实标「不改变数值」（`wmHasValue`），由用户自己看。
   固定件占用的槽返回空数组（不可换）。 */
function wmCands(w,slot){
  if(wmFixed(w,slot))return [];
  const raw=wmRaw(w), compat=DB.weapon_mod_compat||{};
  const exact=raw&&compat[raw.mitem||raw.uid];
  if(exact&&Array.isArray(exact[slot])){
    const wanted={};exact[slot].forEach(n=>{wanted[n]=1;});
    return (wmIndex()[slot]||[]).filter(i=>{const m=arr(DB.mods)[i];return m&&!m.exotic&&wanted[m.name];});
  }
  const allowed=wmAllowed(w,slot);
  if(!allowed.length)return [];                      // 官方没给标签 ⇒ 不知道能装什么 ⇒ 不给候选，不猜
  const feat=allowed.filter(t=>!wmIsBaseTag(slot,t)); // 去掉泛用基底词元；全落空 ⇒ 只剩泛用词 ⇒ 无候选
  if(!feat.length)return [];
  return (wmIndex()[slot]||[]).filter(i=>{
    const m=arr(DB.mods)[i];
    if(!m)return false;
    if(m.exotic)return false;                        // 奇特配件是某把奇特枪的预装件，不该让别的枪挑
    const tags=wmTags(m);
    return tags.some(t=>feat.indexOf(t)>=0);         // 至少一个词元落在该枪该槽的允许集里
  });
}
/* 这件配件装上去会不会动数值（库里 184/379 件带 `attrs`，其余是官方模板 / 纯外观件）。
   行上据此标「不改变数值」——**不隐藏**（理由见 `wmCands`），也不假装它有属性。 */
function wmHasValue(m){return arr(m&&m.attrs).length>0&&wmAttrRows(m).length>0;}
/* ⚠️ 「不让用户选奇特配件」的判据是 `exotic:true`、**不是**「它在某把枪的 `fixed_mods` 里」：
   官方 190 个预装项里 26 个是**普通件**（例：亚历山卓预装的「补偿器 5.56」），那些在别的枪上仍可选。 */
/* 该枪三个槽（含固定件）的展示模型：{code,zh,fixed,cur,cands}；`cur` = 当前生效的配件下标或 null */
function wmSlotModel(w,slot,weaponSlot){
  const fixed=wmFixed(w,slot);
  const sel=wmSel(w,slot,weaponSlot);
  const cands=wmCands(w,slot);
  return {code:slot,zh:wmSlotZh(slot),fixed:fixed,hasFixed:!!fixed,
          cur:(fixed?null:(cands.indexOf(sel)>=0?sel:null)),cands:cands,
          locked:!!fixed||!cands.length};
}
function wmModel(w,weaponSlot){
  return wmSlots(w).map(s=>wmSlotModel(w,s,weaponSlot));
}
/* 当前选中：`state.wmods[武器槽位][插槽 code]`。武器槽位用 `state.wactive`（计算中那把）——
   ⚠️ 三把枪各自一套配件（与 `state.talents` 三槽各自一个天赋同一口径），换枪不会把配件串过去。 */
function wmSel(w,slot,weaponSlot){
  const wi=(weaponSlot!=null)?weaponSlot:((state.wactive>=0)?state.wactive:null);
  if(wi==null)return null;
  const bag=(state.wmods&&state.wmods[wi])||null;
  if(!bag)return null;
  const v=bag[slot];
  return (v==null)?null:v;
}
function wmSet(slot,idx){
  const wi=state.wactive;
  if(wi<0)return;
  if(!state.wmods)state.wmods=[null,null,null];
  if(!state.wmods[wi])state.wmods[wi]={};
  if(idx==null)delete state.wmods[wi][slot];
  else state.wmods[wi][slot]=idx;
}
/* 某把枪**实际生效**的配件行（含官方固定件）：[{slot,mod,src:'user'|'fixed'}] */
function wmActive(w,weaponSlot){
  const out=[];
  if(!w)return out;
  wmSlots(w).forEach(sl=>{
    const fixed=wmFixed(w,sl);
    if(fixed){out.push({slot:sl,mod:fixed,src:'fixed'});return;}
    const sel=wmSel(w,sl,weaponSlot);
    if(sel==null)return;
    if(wmCands(w,sl).indexOf(sel)<0)return;          // 换了枪 ⇒ 旧选择失效，按没选处理（不指向别的配件）
    out.push({slot:sl,mod:arr(DB.mods)[sel],src:'user'});
  });
  return out;
}
/* 固定件行 → 引擎属性行。`fixed_mods` 的内嵌 `attrs` 只有 `{name,en,val,unit}`（没有 `code`/`uid`），
   名字与配件表同一套官方名，所以走同一个 `attrKey()`。 */
function wmAttrRows(m){
  return arr(m&&m.attrs).filter(a=>a&&(a.name||a.en)).map(a=>{
    const nm=a.name||a.en;
    return {name:nm,key:attrKey(nm,a.unit),val:+(a.val!=null?a.val:0),unit:a.unit||''};
  });
}
/* 喂进引擎的 `picks.mods` 行。名字口径与提示词完全一致：`name` 归一、`unit` 空串。 */
function wmPicks(w,weaponSlot){
  return wmActive(w,weaponSlot).map(x=>{
    const m=x.mod;
    const rows=wmAttrRows(m);
    /* 一件配件只有一条属性（实测 379 件里带属性的全部恰好 1 条），但按行展开更稳：
       官方将来给两行的配件，这里不会静默只取第一条。 */
    return rows.map(r=>{
      const k=r.key||attrKey(m.zh||m.name||'',r.unit);
      return k?{name:k,val:r.val,unit:''}:null;
    });
  }).reduce((a,b)=>a.concat(b),[]).filter(Boolean);
}
/* 显示用：某槽当前那一件（用户选的或官方固定件）；没有就 null */
function wmShown(w,slot,weaponSlot){
  const fixed=wmFixed(w,slot);
  if(fixed)return {mod:fixed,src:'fixed'};
  const sel=wmSel(w,slot,weaponSlot);
  if(sel==null)return null;
  if(wmCands(w,slot).indexOf(sel)<0)return null;
  return {mod:arr(DB.mods)[sel],src:'user'};
}
/* 该枪四槽里还剩几个空位可挑（面板上那行小字与冒烟判据都用它，现算） */
function wmOpenCount(w){return wmModel(w).filter(s=>!s.hasFixed&&s.cands.length).length;}
