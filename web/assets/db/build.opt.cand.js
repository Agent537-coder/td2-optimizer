/* 配装器页 · 一键配装（优化器）· 候选取数层 ────────────────────────────────────
   候选池与武器预筛 / 件数与奇特规则 / sel（「选了什么」）的合法性与候选取数 /
   防具插件纸面池 / 天赋可用判据。
   ⚠️ 只取候选、不写公式：数值一律由 `engine.js` 现算。
   ⚠️「这条到底会不会被引擎算」的判据集中在本层（optTalentCounted / optGtalUsable）——
     覆盖矩阵的口径与搜索的入口必须同源，否则覆盖率虚高。
   ⚠️ 未支持的条目一律排除出搜索并登记进覆盖矩阵（不许当零收益参与择优）。 */

/* ── 候选池（每次开跑前现算一次）───────────────────────────────────────────── */
/* 每个随机槽必须能从限定池填满；匹配时禁止同件重复属性。只做可行性，不评分。 */
function optAffixPlan(it,allowed,prefer){
  const used=new Set(arr(it.attrs_max?.slots).filter(s=>s.fixed&&s.kind!=='core').map(s=>s.code)),picks=[];
  const rank=code=>{const at=arr(prefer).findIndex(p=>code.includes(p));return at<0?99:at;};
  const visit=k=>{
    if(k>=nRandomSlots(it))return true;
    const pool=arr(randomSlotCodes(it,k)).filter(code=>!arr(allowed).length||allowed.includes(code)).slice().sort((a,b)=>rank(a)-rank(b));
    for(const code of pool){
      if(used.has(code))continue;
      used.add(code);picks[k]=code;if(visit(k+1))return true;used.delete(code);picks.length=k;
    }
    return false;
  };
  return visit(0)?picks:null;
}
function optAffixFillable(it,allowed){return !arr(allowed).length||optAffixPlan(it,allowed)!==null;}

function optPools(requirements) {

  var bySlot = [[], [], [], [], [], []];
  /* 有 ⑤ 核心属性限定池时按件预筛：挑不出池内核心的件**不必进池**（位置搜索少试冤枉件）。
     其余条件（品牌 / 副属性池）**不许**在这里收窄 —— 品牌是「≥N 件来自允许族」而不是「全部来自」，
     按它筛池会把混搭解整片砍掉（取证见 `build.req.js` 的 `reqPoolOk()` 注释）。 */
  var q = requirements !== undefined ? requirements : ((typeof req === 'function' && state.opt && state.opt.req) ? req() : null);
  var filterCore = !!(q && arr(q.core).length);
  for (var k = 0; k < GEAR.length; k++) {
    var x = GEAR[k]; if (!x) continue;
    var it = GEAR_ITEMS[x.raw]; if (!it) continue;
    if (!(x.slot_idx >= 0 && x.slot_idx <= 5)) continue;
    if (it.not_in_game) continue;
    if (filterCore && arr(coreChoices(it)).length && !reqPoolOk(it, q)) continue;
    if (q && !optAffixFillable(it, arr(q.affix))) continue;
    /* ⚠️ 池里必须放**原始件**（`GEAR_ITEMS[raw]`），并且**把原始下标显式挂上去**：
       归一化条目 `GEAR[k]` 的 `raw` 是「在 DB.gear 里的下标」，但**原始件本身没有 `raw` 这个键**
       （实测 678/678 件都没有）⇒ 池子里放原始件时 `it.raw` 就是 `undefined`
       ⇒ `applyOpt()` 的落地校验（`GEAR_MAP[it.raw]`）把 6 格**全判空**
       ⇒ 用户点「开始配装」看着跑完 2586 次试算，界面上**一件都没装上**
       （2026-09-13 真机冒烟抓到的真缺陷；`applyOpt()` 返回的「换掉几格」因此恒为 6，撤销成了摆设）。
       修法：取数时把下标挂到件上（幂等、覆盖写），评分与交付用同一种对象、同一个下标。 */
    bySlot[x.slot_idx].push(it);
    it.raw = x.raw;
  }
  /* ⚠️ 候选池必须排除 `not_in_game`（野熊等 23 把已屏蔽的枪）：原来只判 `w.dmg`，
     优化器会把一把游戏里拿不到的枪交到用户手上（2026-09-14 用户真机抓到「配到野熊」）。 */
  return { gear: bySlot,
    weapons: arr(DB.weapons).filter(function (w) { return w && w.dmg && !w.not_in_game && buildWeaponRepresentative(w); }),
    wtypes: WTYPES.slice() };
}
/* 件数上限（用户 2026-10-16「没有六件套效果 / 不会超过四件 / 品牌不会超过三件」）：
   官方套装只有 2/3/4 件档 ⇒ 第 5、6 件**没有任何加成**，配出来就是不合理的配装；
   品牌加成只到 3 件 ⇒ 第 4 件同品牌白占一格（具名件也算它自己那个品牌）。
   ⚠️ 「四件」可以是任意四件 —— 突袭的胸甲/背包（风险管理 / 强化优势）照样能用，只是总数 ≤4。 */
function optPieceLimits(gear){
  const sets={},brands={};
  for(const it of gear){
    if(!it)continue;
    if(it.set_code)sets[it.set_code]=(sets[it.set_code]||0)+1;
    else if(it.brand_code)brands[it.brand_code]=(brands[it.brand_code]||0)+1;
  }
  for(const k in sets)if(sets[k]>4)return false;
  for(const k in brands)if(brands[k]>3)return false;
  return true;
}
function exoticOk(gear) {
  var n = 0;
  for (var i = 0; i < gear.length; i++) if (gear[i] && gear[i].kind === 'exotic') n++;
  return n <= 1;                                        // 奇特装备唯一（用户第 2 条：强制）
}
/* 同一件不能重复穿：按官方件号判同一性 */
function optPieceKey(it) {
  if (!it) return null;
  return it.mitem || it.code || it.key || it.zh || null;
}
function optSamePiece(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  var ka = optPieceKey(a), kb = optPieceKey(b);
  return ka != null && ka === kb;
}
/* ── 武器候选预筛（「不穷举、设置次数」第一刀，2026-10-16 用户裁定）─────────────
   437 把武器**每轮每 seed 都要全遍历一遍**，光这一项吃掉近半预算
   （本地实测 12221 次 / 98 秒里约 6 千次是武器遍历）。本层只按**纸面值**
   （零成本纯算式，不调引擎、不计入试算次数）取双榜并集，**仅用来定评序**：
     · 爆发榜 Top 30：dmg × rpm / 60
     · 循环榜 Top 30：弹匣伤害 ÷ (打空弹匣秒数 + 装填秒数)
   再**强制并入**当前已装的武器（不并入会把用户手里那把好枪「优化掉」）。
   ⚠️ 纸面值**看不见武器天赋**（固定天赋随枪生效、可换天赋在纸面里等于 0）⇒ 纸面名次
   与「配装后真实强弱」不保证一致（实测：GR9 循环榜第 22 名，纸面看着平平，挂上该类
   最佳可换天赋后反超当场冠军）。所以纸面榜**不是**去留判据：真正的强弱判据在下游
   `blockWeapon` 的引擎屏幕（对候选池逐把「1 call/枪」打分，再按 miss/v 取 Top-K 精算）。
   K 由 22 加宽到 30 是为了让「刚好排在榜外一位」的枪（如 GR9 的循环 #22）也能进入引擎屏幕的前列。 */
function optShortlist(ws, mustKeep){
  const K = 30;
  if (ws.length <= K * 2) return ws;
  const cyc = w => { const m = Math.max(1, w.mag || 1), r = w.rpm || 1, rel = w.reload || 2;
    return w.dmg * m / (m / r * 60 + rel); };
  const keep = new Set(), out = [];
  const push = w => { if (w && !keep.has(w)) { keep.add(w); out.push(w); } };
  ws.slice().sort((a, b) => b.dmg * b.rpm - a.dmg * a.rpm).slice(0, K).forEach(push);
  ws.slice().sort((a, b) => cyc(b) - cyc(a)).slice(0, K).forEach(push);
  arr(mustKeep).forEach(push);
  return ws.filter(w => keep.has(w));      // 保持原顺序（稳定、确定性）
}
/* 近战目标的补池（2026-10-16）：纸面双榜（爆发/循环）**筛不出近战武器** ——
   全库只有「死亡女神」带近战伤害（奇特固定挂件「死亡之吻」+500%，官方属性码
   `WeaponMeleeDamageDefaultModBonus`），它纸面排不进 Top22 ⇒ 按目标把「自带近战增伤」的枪补进池。
   装备同理：近战加成只长在少数几件上（张牙舞爪 200% / 染血指节 100%），坐标下降是**有界**搜索，
   预算内未必走到那一格 ⇒ 把它们做成**种子**（`optMeleeGear`）。 */
function optMeleeSources(ws){
  const out=[];
  for(const w of arr(ws)){
    if(!w)continue;
    let n=0;
    arr(w.fixed_mods).forEach(m=>arr(m&&m.attrs).forEach(a=>{
      if(String(a&&a.code||'')==='WeaponMeleeDamageDefaultModBonus'||String(a&&a.name||'')==='近战伤害')n++;}));
    arr(w.attrs).forEach(a=>{if(String(a&&a.name||'')==='近战伤害')n++;});
    arr(w.attrs_max&&w.attrs_max.slots).forEach(s=>{if(String(s&&s.code||'')==='WeaponMeleeDamageDefaultModBonus')n++;});
    if(n)out.push(w);
  }
  return out;
}
/* 强制保留的「当前武器」**也必须过前面的筛选**（武器类别 / 流派枪种 / 手枪槽位）：
   原来无条件塞进 `mustKeep` ⇒ 手里那把被排除的枪（例：爆率爆伤流手里拿着复仇女神这把射手步枪）
   照样进候选池、还因为基数大被选上 ⇒ 流派/类别下拉形同虚设（2026-10-16 用户「怎么老是配复仇去了」）。 */
function curKeep(weapons0,saved,slot){
  const w=saved.wslots[slot]!=null?DB.weapons[saved.wslots[slot]]:null;
  return (w&&weapons0.indexOf(w)>=0)?[w]:[];
}
/* 自带「近战增伤」的装备件（件自带固定词条 / 件自带天赋的近战行）→ [{it, slot}]。
   判据只有一条：官方属性码 `WeaponMeleeDamageDefaultModBonus`，或天赋规则里 `f === 'MeleeDamage'`。*/
function optMeleeGear(){
  const out=[], idxOf={ '面具':0, '背包':1, '胸甲':2, '背心':2, '手套':3, '枪套':4, '护膝':5 };
  for(const it of arr(DB&&DB.gear)){
    if(!it)continue;
    let n=0;
    arr(it.attrs_max&&it.attrs_max.slots).forEach(s=>{if(String(s&&s.code||'')==='WeaponMeleeDamageDefaultModBonus')n++;});
    arr(it.attrs).forEach(a=>{if(String(a&&a.name||'')==='近战伤害')n++;});
    const e=(typeof gtalEntry==='function')?gtalEntry((typeof gtalPtr==='function'?gtalPtr(it):'')||''):null;
    if(e&&arr(e.rows).some(r=>r.f==='MeleeDamage'))n++;
    if(!n)continue;
    const si=idxOf[it.slot_zh!=null?it.slot_zh:it.slot];
    if(si==null)continue;
    out.push({it:it,slot:si});
  }
  return out;
}
/* ── 全维度「选什么」的取数层（②③④ 的候选）──────────────────────────────────
   ⚠️ 本层只**取候选**，不写任何公式；数值一律由 `engine.js` 现算。
   ⚠️「这条到底会不会被引擎算」的判据**集中在本节**（`optTalentCounted`）：搜索块不许再各判一遍，
     覆盖矩阵的口径与搜索的入口必须同源，否则覆盖率虚高。
   ⚠️ 未支持的条目一律**排除出搜索**并登记进 `res.cover`，不许当零收益参与择优。 */
function optSelClone(sel){
  return {core:arr(sel.core).slice(),
    aff:arr(sel.aff).map(a=>arr(a).slice()),
    gtal:arr(sel.gtal).slice(),
    gmods:arr(sel.gmods).slice(),
    wmods:arr(sel.wmods).map(b=>Object.assign({},b||{})),
    waffix:arr(sel.waffix).slice(),
    talents:arr(sel.talents).slice()};
}
/* 该件核心槽能否取 code（不可挑的件只接受空值） */
function optCoreOkFor(it,code){
  var ch=coreChoices(it);
  if(!ch||!ch.length)return code==null||code==='';
  return code==null||ch.indexOf(code)>=0;
}
/* 该件第 k 个随机槽能否取 code */
function optAffOkFor(it,k,code){
  if(code==null||code==='')return true;
  return arr(randomSlotCodes(it,k)).indexOf(code)>=0;
}
/* 防具插件下标对某件是否合法（判据同 `picksFor`：官方三部位 / 件本体声明 / OVR 放行） */
function optGmodOkFor(it,i,mi){
  if(mi==null)return true;
  if(!arr(GMODS)[mi])return false;
  return MOD_POS.indexOf(i)>=0||arr(it&&it.sockets).some(modSocketIsGear)||!!(state.ovr&&state.ovr[i]);
}
/* 一件 × 一整套 sel 是否相容（防「上一件的核心/词条/插件给新件凭空加成」） */
function optSelPieceLegal(it,i,sel){
  if(!it||!sel)return false;
  if(!optCoreOkFor(it,arr(sel.core)[i]))return false;
  var n=nRandomSlots(it),pick=arr(arr(sel.aff)[i]);
  if(pick.length>n)return false;
  var seen={};
  arr(it.attrs_max?.slots).filter(s=>s.fixed&&s.kind!=='core').forEach(s=>{if(s.code)seen[s.code]=1;});
  for(var k=0;k<pick.length;k++){
    if(!optAffOkFor(it,k,pick[k]))return false;
    if(pick[k]){if(seen[pick[k]])return false;seen[pick[k]]=1;}
  }
  if(!optGmodOkFor(it,i,arr(sel.gmods)[i]))return false;
  return true;
}
function optSelLegal(gear,sel){
  if(!sel)return false;
  for(var i=0;i<6;i++)if(!optSelPieceLegal(gear[i],i,sel))return false;
  return true;
}
/* 件天赋候选（件基，不读 `gearOf`）：件指针 → 只有一个（锁）；装备组件 → 无（收益在 4 件档）；否则该槽条目 */
function optGtalCandsOf(it,i){
  if(!it)return {locked:false,keys:[]};
  var ptr=(typeof gtalPtr==='function')?gtalPtr(it):null;
  if(ptr)return {locked:true,keys:[ptr]};
  if(it.kind==='gearset')return {locked:false,keys:[]};
  var out=[],seen={};
  if(typeof gtalRules==='function')arr(gtalRules()).forEach(function(e){
    if(!e||e.slot!==i||!e.k||seen[e.k]||!TALENT_BY_KEY[e.k])return;
    seen[e.k]=1;out.push(e.k);
  });
  return {locked:false,keys:out};
}
/* 「这一条天赋引擎真算吗」——唯一判据（2026-10-16 修订；实证见 work/talents-audit-verify-20261016/）。
   四条通路，命中任意一条即算：
     ① 档位族（`build.tiers.js` 层在 `state.bp.optPeak=true` 下按满值真算）
     ② `combatGearRows` 有行（`evalBuild` 把行直接喂进 `picks.attrs`）
     ③ `combatCycle` 非空（`params.specialTalent` → 引擎「计算 / 疯狂」分支，如精密计算）
     ④ 分数差实证：`evalBuild` 给该天赋 vs 不给，任一数字变了才算（scaleBy 行如回力镖、
        magRefill 这类「走 combatDependentRows 第二遍」的都归这一条）。
   ⚠️ **不能**按原计划用「读 `r.unsupportedTalents`」做探测：实测 `picks.talents` 在 `evalBuild`
      链上恒为空（选中的武器天赋不进 `applyTalent`，走 ②③④ 三条路）⇒ 那个字段恒空、
      探测会把**所有**天赋判成可用（2026-10-16 probeA/probeB 实证）。
   ⚠️ 判据必须**与搜索入口同源**（本函数 + `optTalScan` 是唯一来源），否则覆盖率虚高。
   未被引擎算的一律**排除**（不许当零收益参与择优），由覆盖矩阵另行列账。 */
function optTalentDeltaMove(ti,gear,w,slot){
  if(typeof evalBuild!=='function'||slot<0||!w)return false;
  var tals=[-1,-1,-1];tals[slot]=ti;
  var base=null,cand=null;
  try{base=evalBuild(w,gear,{wslot:slot,talents:[-1,-1,-1]});cand=evalBuild(w,gear,{wslot:slot,talents:tals});}
  catch(e){return false;}
  if(!base||!cand)return false;
  var keys=['SDPS','DPS','DPM','BulletDamage','Damage','CHC','CHD','HSD','Armor','Health','Magazine','ReloadTime','RPM','MeleeDamage','SkillDamage','TotalSkillDamage','PlatformSkillDamage','SkillDamageMultiplier','AmplifySkillDamage','WeaponDamage','NextShotsDamage'];
  for(var i=0;i<keys.length;i++){var k=keys[i];
    if(Math.abs((+cand[k]||0)-(+base[k]||0))>1e-9)return true;}
  var fa=base.fields||{},fb=cand.fields||{};
  for(var k2 in fb)if(typeof fb[k2]==='number'&&isFinite(fb[k2])){
    var va=fa[k2];if(!(typeof va==='number'&&isFinite(va))||Math.abs(va-fb[k2])>1e-9)return true;}
  for(var k3 in fa)if(typeof fa[k3]==='number'&&isFinite(fa[k3])){
    var vb=fb[k3];if(!(typeof vb==='number'&&isFinite(vb))||Math.abs(vb-fa[k3])>1e-9)return true;}
  return false;
}
function optTalentCounted(key,ti,gear,w,slot){
  if(!key)return false;
  /* ⚠️ 兼容旧签名 `(key,gear,w,slot)`（探针脚本按旧签名调用，证据要能原样复跑）：
     第二个实参是对象 = 旧写法 ⇒ 整体右移一位。 */
  if(ti!=null&&typeof ti==='object'){slot=w;w=gear;gear=ti;ti=null;}
  if(typeof TAL_TIER_FAMILIES!=='undefined'&&typeof talTierKeys==='function'){
    var fams=arr(TAL_TIER_FAMILIES);
    for(var f=0;f<fams.length;f++)if(talTierKeys(fams[f]).indexOf(key)>=0)return true;
  }
  if(typeof combatGearRows!=='function')return false;
  try{if(combatGearRows(key,gear,w,{wslot:slot,gtal:state.gtal,affix:state.affix}).length>0)return true;}
  catch(e){/* 判据偏差按「不算」处理，由分数差实证兜底 */}
  try{if(typeof combatCycle==='function'&&combatCycle(key))return true;}catch(e2){}
  if(ti==null){var ts0=arr(TALENTS);for(var j=0;j<ts0.length;j++)if(ts0[j]&&ts0[j].key===key){ti=j;break;}}
  return optTalentDeltaMove(ti,gear,w,slot);
}
/* 武器天赋扫描（一次遍历同时产出「候选」与「被排除」两张表）：
   · cands    = 该枪可用（枪型/稀有度）且引擎真算的天赋下标；**普通枪再剔完美版**（见下方 ③）。
   · rejected = 该枪可用、但判据说引擎不算的 key（登记进覆盖矩阵，不许静默）。
   枪自带固定天赋时**不可换**：两张表都空（固定天赋不是「不支持」，是「没有选择」）。 */
function optTalScan(w,gear,slot){
  var out={cands:[],rejected:[]};
  if(typeof weaponFixedTalent==='function'&&weaponFixedTalent(w))return out;
  var ts=arr(TALENTS);
  for(var i=0;i<ts.length;i++){
    var t=ts[i];
    if(!t||!t.key)continue;
    if(typeof talentUsableBy==='function'&&!talentUsableBy(t,w&&w.cls))continue;
    if(!optTalentCounted(t.key,i,gear,w,slot)){out.rejected.push(t.key);continue;}
    out.cands.push(i);
  }
  /* ③ 完美版与 UI `talentPickerPool` 同口径：完美版是具名件自带（`_perfect`），普通枪刷不到
     ⇒ 有普通版撑着的池子一律剔完美版；整池全是完美版（没有普通版可替）才保留。
     ⚠️ 自动配装**不读**「含完美版」那颗 chip：那颗是给手选「看得见」用的，自动出装必须游戏里做得到。 */
  if(typeof talentIsPerfect==='function'){
    var plain=[];
    for(var p=0;p<out.cands.length;p++)if(!talentIsPerfect(ts[out.cands[p]]))plain.push(out.cands[p]);
    if(plain.length)out.cands=plain;
  }
  return out;
}
/* 兼容入口（探针 / 旧调用点）：候选下标数组 */
function optTalCandsOf(w,gear,slot){return optTalScan(w,gear,slot).cands;}
/* 武器插件候选（该槽有候选 + 会动数值；固定槽/纯外观件不进搜索） */
function optWmodCandsOf(w,code){
  return arr(typeof wmCands==='function'?wmCands(w,code):[]).filter(function(i){
    var m=arr(DB.mods)[i];return m&&typeof wmHasValue==='function'&&wmHasValue(m);
  });
}
/* 防具插件候选池（**纸面预筛**，不写任何评分公式）：按「同名取最大 val」去重后截前 N。
   ⚠️ 为什么必须预筛：`GMODS` 全量可能上百件 ⇒ 6 槽 × N 会瞬间吃掉整个预算。
   判据只用官方名与官方 val（`modName`/`modVal`），**与目标无关** ⇒ 不对「哪一侧更值钱」作任何假设。 */
var OPT_GMOD_TOPK=12,OPT_GMOD_POOL=null;
function optGmodPool(){
  if(OPT_GMOD_POOL)return OPT_GMOD_POOL;
  var all=arr(GMODS),best={},order=[];
  for(var i=0;i<all.length;i++){
    var m=all[i];if(!m)continue;
    var nm=modName(m)||('#'+i),v=modVal(m);
    if(best[nm]==null){best[nm]={i:i,v:v};order.push(nm);}
    else if(v>best[nm].v)best[nm]={i:i,v:v};
  }
  /* 截前 N：按官方 val 降序取（同族只留最大那条）。**这是纸面预筛**，允许漏掉低值件；
     要把搜索放宽就调大 `OPT_GMOD_TOPK`（总预算上限仍是 6000）。 */
  order.sort(function(a,b){return best[b].v-best[a].v;});
  // Different attribute units are not comparable: retain every distinct attribute.
  OPT_GMOD_POOL=order.map(function(k){return best[k].i;});
  return OPT_GMOD_POOL;
}
/* 件天赋「引擎真算吗」（判据源与 `build.gtal.js` 的 `gtalStatus` 同源）：
   `ok` = 有官方入参行 · `tier` = 归 `build.tiers.js` 档位层（`state.bp.optPeak=true` 下按满值真算）。
   其余（`none`/`todo`/`nodata`）一律**排除出搜索**并登记进覆盖矩阵。 */
function optGtalUsable(key){
  if(!key)return false;
  if(typeof gtalStatus==='function'){
    /* ⚠️ 第二个参数是 **PvP 模式**（官方 `bonus_pvp`），不是「开不开」：传错会去 PvP 表里找 PvE 数值
       ⇒ 大面积判成 `nodata` ⇒ 件天赋候选**全线归零**却看不出报错（真踩过一次）。口径随用户开关。 */
    var on=!!(state.bp&&state.bp.pvp),st=gtalStatus(key,on);
    if(st==='ok')return typeof gtalRowsFor!=='function'||gtalRowsFor(key,on)!==null;
    return st==='tier';
  }
  return optTalentCounted(key,null,null,null,-1);
}
