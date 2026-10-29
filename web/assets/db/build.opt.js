/* 配装器页 · 一键配装（优化器）· 搜索层 ────────────────────────────────────────
   多起点 + 统一调度（坐标下降块）+ LNS；口径见 docs/DESIGN-GEARDB.md §12 与
   docs/DESIGN-OPTIMIZER.md。2026-10-16 拆层：口径定义 → build.opt.defs.js，
   候选取数 → build.opt.cand.js，本层只留搜索与记账。
   ────────────────────────────────────────────────────────────────────────────
   用户第 111 轮定的六条（别改）：
     ① 武器类别下拉（默认不限，结果显示它选了什么）② 奇特唯一**强制**、不给开关
     ③ 原型档跟随全局开关，结果逐件标注「需原型」 ④ 默认理论模式
     ⑤ 默认「全部重排」，另给单件锁定 ⑥ 目标 = 条件值（单发最高 / DPS 最高 / 精英防御+DPS …）
   ⚠️ 目标字段一律取引擎真实输出（`TD2Calc.buildCompute` 的返回值），本层**不写任何公式**。
   ⚠️ 试算走 `evalBuild(w,gear,opt)`（纯函数，不读页面控件）⇒ 可批量跑上万次。 */

/* ── 坐标下降主循环 ─────────────────────────────────────────────────────────
   o = { target, wtype(0=不限,1..7), lock[6], lockW, wslot, maxRounds, constraints } *
/* `budget` 默认 6000（原 18000）：配合武器预筛与 seeds 3，正常路径约 3000–4000 次
   收敛（原实测 ~12000 次 / 98 秒；2026-10-16 用户「不要穷举、设置次数、1.2 万太多」）。 */
/* Bounded multi-seed coordinate search. Feasibility is checked on a complete build;
   the result is a recommendation, never a proof of global optimality. */
function optimizeBuild(o){
 o=o||{};const started=performance.now(),keys=['slots','wslots','wactive','core','affix','gtal','talents','gmods','wmods','waffix','bp'];
 const saved=Object.fromEntries(keys.map(k=>[k,JSON.parse(JSON.stringify(state[k]))]));
 const original=Object.fromEntries(keys.map(k=>[k,state[k]]));
 const restore=()=>keys.forEach(k=>state[k]=original[k]);
 const flow=optFlowOf(o.flow!=null?o.flow:(state.opt&&state.opt.flow));
 const target=o.target||(flow&&flow.target)||'sdps',slot=o.wslot!=null?o.wslot:Math.max(0,saved.wactive),budget=o.budget||6000;
 const requestOptions=optRequestOptions(o),requestSignature=optRequestSignature(o),context=buildEvaluationContext(o.scoreMode||'theoretical',target,{distanceM:o.distanceM??(flow?.eng==='close'?10:25)}),currentContext=buildEvaluationContext('current');
 const previousTrace=BUILD_EVAL_TRACE,metrics={evalBuildCalls:0,searchEvaluations:0,overheadEvaluations:0};BUILD_EVAL_TRACE=metrics;
 let calls=0,best=null,rounds=0,phaseDeadline=budget;const wordCache=new Map(),cover=optCoverNew(),plan=[];cover.metrics=metrics;
  /* 阶段账（Step ⑤）：各阶段实际用掉多少次评分、拿到多少增量 ⇒ 「6000 里空跑多少」有据可查 */
  const planNote=(phase,c0,v0)=>plan.push({phase:phase,calls:calls-c0,gain:+(best?best.v-v0:0)});
 try{
  /* ⚠️ 一键配装与页面「效果与触发条件」是**两套系统**（用户 2026-10-16）：
     自动配装一律按「条件满足 + 层数满值」算，不读页面上那些开关；
     页面手玩仍由 `#combat-audit` 的开关/层数决定。`optPeak` 只在本次搜索期间为真，
     `restore()` 随 `bp` 一起还原（页面那份开关不会被改写）。 */
  state.bp=buildClone(context.state.bp);
  /* `q` 优先取**入参**（探针与测试要能指定一套条件跑），没给才退回界面上那份。
     原来这里无条件读 `state.opt.req` ⇒ `optimizeBuild(o)` 不是 `o` 的纯函数，
     探针传进来的条件会被静默忽略，界面与探针各判一套。 */
  let q=(o.req!==undefined?o.req:(state.opt&&state.opt.req))||{};
  /* 流派预设：只**补空缺**（用户显式给的核心池/副属性池/目标/条件优先），不覆盖。 */
  if(flow){
    q=Object.assign({},q);
    if(!arr(q.core).length&&flow.core)q.core=flow.core.slice();
    if(!arr(q.affix).length&&flow.affix)q.affix=flow.affix.slice();
  }
  /* 硬条件：显式 `o.constraints` 优先，否则用流派自带那条（如爆率 ≥45%）。 */
  const cons=o.constraints!==undefined?arr(o.constraints):((flow&&flow.cons)||[]);
  const fitCount=(typeof reqUsed==='function'?reqUsed(q):0)+arr(cons).length;
  const fitReport=fitCount>0;
  const wantsPfe=cons.some(c=>c.kind==='num'&&c.key==='elites'&&c.op!=='max'&&+c.val>0);
  const pfeMod=wantsPfe?arr(GMODS).map((m,i)=>({m,i})).filter(x=>attrKey(modName(x.m),x.m.unit||'')==='精英防御%').sort((a,b)=>modVal(b.m)-modVal(a.m))[0]?.i:null;
  const poolsRaw=optPools(q),preds=optPredicates(cons).concat(typeof reqPredicates==='function'?reqPredicates(q):[]);
  /* 件天赋「切换武器才触发」这类在输出目标下不参与（引擎按常驻算，见 OPT_UNMODELED_GEAR）。
     锁定格保留用户那件 —— 锁定是用户的决定，不因为建模口径偷偷换掉。 */
  const pools=optOutputTarget(target)
    ? {gear:poolsRaw.gear.map((a,i)=>a.filter(it=>optGearModeled(it,target)||(o.lock&&o.lock[i]))),weapons:poolsRaw.weapons,wtypes:poolsRaw.wtypes}
    : poolsRaw;
  const flowTypes=(flow&&flow.wtypes&&flow.wtypes.length)?flow.wtypes:null;
  const weapons0=pools.weapons.filter(w=>combatWeaponAllowed(w,slot)&&(!o.wtype||w.type===pools.wtypes[o.wtype-1])
    &&(!flowTypes||flowTypes.indexOf(w.type)>=0)&&((slot===2)===(w.type==='手枪'))&&(q.weapon==null||DB.weapons.indexOf(w)===+q.weapon)
    /* 开火机制未建模的武器在输出目标下直接排除（判据与清单见 `build.opt.defs.js` 的 OPT_UNMODELED_FIRE）。
       不排除的话引擎会按「满值面板 × rpm」算，复仇女神这类蓄力枪必然夺冠 —— 2026-10-23 实测。 */
    &&optWeaponModeled(w,target));
  /* 被排除的枪要留账（结果面如实显示，不许静默丢）。 */
  const unmodeledW=o.lockW?[]:pools.weapons.filter(w=>!optWeaponModeled(w,target)&&combatWeaponAllowed(w,slot));
  /* 候选枪池 = 纸面双榜并集（`optShortlist`，K=30，0 call）。纸面榜**看不见武器天赋**，
     所以它只负责「别把候选面收得太窄」，真正的强弱判据在下游 `blockWeapon` 的引擎屏幕。
     近战目标再并上「自带近战增伤」的枪（纸面榜筛不出那一把）；锁定武器另有 `o.lockW` 通路。 */
  const keepW=o.lockW?[]:curKeep(weapons0,saved,slot)
    .concat(target==='melee'?optMeleeSources(weapons0):[]).filter((x,i,a)=>a.indexOf(x)===i);
  const paperList=o.lockW?weapons0:optShortlist(weapons0,keepW);
  const ws=o.lockW?[DB.weapons[saved.wslots[slot]]].filter(Boolean):paperList;
  if(!ws.length||ws.some(w=>weapons0.indexOf(w)<0||!combatWeaponAllowed(w,slot)))return {ok:false,why:'no-candidates',calls,mode:cover.mode,plan,cover};
  cover.dims.weapon.pool=ws.length;      // 候选枪池（问题⑤：进 UI 的账）
  cover.dims.weapon.unmodeled=unmodeledW.map(w=>({zh:w.zh||w.en||'',en:w.en||'',why:OPT_UNMODELED_FIRE[w.mitem]}));
  const oldGear=saved.slots.map((raw,i)=>raw==null?null:DB.gear[raw]);
  if(!optPieceLimits(oldGear.filter((it,i)=>o.lock&&o.lock[i])))return {ok:false,why:'locked-piece-limit',calls,mode:cover.mode,plan,cover};
  const baselineR=DB.weapons[saved.wslots[slot]]?evalBuild(DB.weapons[saved.wslots[slot]],oldGear,{wslot:slot,context}):null;
  const baseline=baselineR?optTargetValue(baselineR,target):null;
  const currentSel={core:saved.core,aff:saved.affix,gtal:saved.gtal,gmods:saved.gmods,wmods:saved.wmods,waffix:saved.waffix,talents:saved.talents};
  const currentFeasible=!!baselineR&&optWholeLegal(DB.weapons[saved.wslots[slot]],oldGear,currentSel,slot,saved.wslots)&&weapons0.includes(DB.weapons[saved.wslots[slot]])&&preds.every(p=>p(baselineR,oldGear,DB.weapons[saved.wslots[slot]]));
  function words(it,i){
   if(o.lock&&o.lock[i])return {core:saved.core[i],aff:saved.affix[i]};
   if(wordCache.has(it))return wordCache.get(it);
   const cores=coreChoices(it)||[],wanted=target==='armor'?'ArmorGearFlatBonus':'WeaponDamageModBonus';
   const restricted=arr(q.core).length?cores.filter(c=>q.core.includes(c)):cores;
   const own=arr(it.attrs_max?.slots).find(x=>x.kind==='core'&&x.code)?.code;
   const core=restricted.find(c=>c===wanted)||restricted.find(c=>/WeaponDamage/.test(c)&&target!=='armor')||restricted.find(c=>c===own)||restricted[0]||null;
   const prefer=target==='skillout'||target==='skdam'?['allskills_damage','SkillHaste','allskills_healing']:target==='armor'?['Armor','Health','WeaponCriticalHitChance','WeaponCriticalHitDamage']:['WeaponCriticalHitChance','WeaponCriticalHitDamage','WeaponDamageMultiplierHead'];
   const aff=optAffixPlan(it,arr(q.affix),prefer)||[];
   const val={core,aff};wordCache.set(it,val);return val;
  }
  /* ── sel：本次搜索「选了什么」的唯一载体（②③④ 全部维度）──────────────────────
     core/aff 走 `words()`（只看偏好、不看分数）、非锁定格的件天赋为 null、防具/武器插件沿用
     用户那套；武器天赋位留 -1（**只作起点**：真正择优交给 `blockTalent`，它按当前那套装备
     现算）。⚠️ 起点/种子/交接一律用 -1，**不**按枪查类最佳天赋——实测按枪给会让
     `start.w` 换人、把下降带进另一个盆地（dpm 841M→653M）；屏幕阶段才按枪挂天赋（见 `refitWeapon`）。
     ⚠️ 换件/换枪必须**重建该维**（`refitSlot`/`refitWeapon`）：`affixAttrs()` 不校验该件能不能刷
       该 code，带着上一件的词条就是给新件凭空加成（虚高且游戏里做不到）。 */
  function selFrom(gear){
    var sel={core:[],aff:[],gtal:[],gmods:[],wmods:arr(saved.wmods).map(b=>Object.assign({},b||{})),
      waffix:arr(saved.waffix).slice(),talents:arr(saved.talents).slice()};
    for(let i=0;i<6;i++){
      const it=gear[i],locked=!!(o.lock&&o.lock[i]),wd=words(it,i);
      sel.core.push(locked?arr(saved.core)[i]||null:wd.core);
      sel.aff.push(locked?arr(arr(saved.affix)[i]).slice():wd.aff.slice());
      sel.gtal.push(locked?arr(saved.gtal)[i]||null:null);
      const gm=arr(saved.gmods)[i];
      sel.gmods.push(!locked&&pfeMod!=null&&optGmodOkFor(it,i,pfeMod)?pfeMod:(gm!=null&&optGmodOkFor(it,i,gm)?gm:null));
    }
    sel.talents[slot]=o.lockW?saved.talents[slot]:-1;
    return sel;
  }
  function refitSlot(sel,gear,i){
    const it=gear[i];
    if(!it||(o.lock&&o.lock[i]))return;
    const wd=words(it,i);
    sel.core[i]=wd.core;sel.aff[i]=wd.aff.slice();sel.gtal[i]=null;
    const gm=arr(saved.gmods)[i];
    sel.gmods[i]=pfeMod!=null&&optGmodOkFor(it,i,pfeMod)?pfeMod:((gm!=null&&optGmodOkFor(it,i,gm))?gm:null);
  }
  function refitWeapon(sel,w,tal){
    /* 天赋位不再一律留 -1：换枪后先挂上**该枪类最佳可换天赋**（`clsBestTal`，固定天赋枪 → -1）。
       屏幕阶段拿「无天赋的普通枪」比「自带天赋的奇特枪」会把 Top-K 系统性带偏，见 `clsBestTal`。
       第三实参 `tal` 允许调用方传**按当前装备现算**的类最佳（`blockWeapon` 每轮刷新一次）。 */
    sel.talents[slot]=(tal==null?clsBestTal(w):tal);
    sel.wmods[slot]=Object.assign({},arr(saved.wmods)[slot]||{});
    sel.waffix[slot]=arr(saved.waffix)[slot]||'';
    if(w&&typeof wmSlots==='function'){                     // 该枪不认的配件先清掉（别留脏值）
      const codes=arr(wmSlots(w)),bag=sel.wmods[slot];
      for(const k in bag)if(codes.indexOf(k)<0)delete bag[k];
    }
  }
  /* 单次评分：`sel` 是唯一「选什么」的载体。同一份 sel 既写进 `state`（`reqCoreMiss`/`reqAffixMiss`
     只认 state）**又**整体传 `opt` ⇒ 「评分的配装 = 交付的配装」；返回的 `result` 自带 sel 深拷贝，
     禁止在结尾另建一份（评分≠交付那类错配就是这么来的）。 */
  function evaluate(w,gear,sel){
  if(calls>=Math.min(budget,phaseDeadline)||!w||gear.some(x=>!x)||!exoticOk(gear))return null;
  if(new Set(gear.map(optPieceKey)).size!==6)return null;
  /* 装备组 ≤4 件、品牌 ≤3 件（官方没有 5/6 件档，也没有第 4 件品牌加成） */
  if(!optPieceLimits(gear))return null;
  if(!optSelLegal(gear,sel))return null;
   const wslots=saved.wslots.slice();wslots[slot]=DB.weapons.indexOf(w);
   if(wslots.filter(i=>i!=null&&DB.weapons[i]?.exotic).length>1)return null;
   if(!optWholeLegal(w,gear,sel,slot,wslots))return null;
   calls++;metrics.searchEvaluations=calls;
   state.slots=gear.map(x=>x.raw);state.core=sel.core.slice();state.affix=sel.aff.map(a=>a.slice());
   state.gtal=sel.gtal.slice();state.gmods=sel.gmods.slice();state.wmods=sel.wmods.map(b=>Object.assign({},b||{}));
   state.waffix=sel.waffix.slice();state.wslots=wslots;state.wactive=slot;state.talents=sel.talents.slice();
   const r=evalBuild(w,gear,{context,wslot:slot,wslots,core:state.core,affix:state.affix,gtal:state.gtal,gmods:state.gmods,wmods:state.wmods,waffix:state.waffix,talents:state.talents}),v=optTargetValue(r,target);
   if(!Number.isFinite(v))return null;
   const miss=preds.reduce((n,p)=>n+(!p(r,gear,w)?1:0),0);
   /* `fitQ` = 这一次搜索**到底有没有条件在管着它**（⑤⑥ 池 / 品牌 / 专长 / 手表 / 数值条件）。
      以前这里写死 `false` ⇒ 结果面上那句「已按条件收尾」永远不出现，用户看不出交的是哪一套口径。
      交付的那套必然满足全部谓词（`best` 只收 `miss===0`），所以这里不给「没凑上」那一档 ——
      凑不上走的是 `ok:false` 的 `search-exhausted`，由结果面另说。 */
   const result={ok:true,context,currentContext,requestOptions,requestSignature,effectiveReq:buildClone(q),effectiveConstraints:buildClone(cons),gear:gear.slice(),w,wslot:slot,wslots,
     core:state.core.slice(),aff:state.affix.map(a=>a.slice()),gtal:state.gtal.slice(),
     gmods:state.gmods.slice(),wmods:state.wmods.map(b=>Object.assign({},b||{})),waffix:state.waffix.slice(),
     talents:state.talents.slice(),sel:optSelClone(sel),r,v,miss,deficit:optNumericDeficit(r,cons),fitOk:miss===0,fitQ:fitReport,fitUsed:fitCount};
   if(!miss&&(!best||v>best.v))best=result;
   return result;
  }
  const finish=r=>{r.calls=calls;r.budget=budget;r.rounds=rounds;r.cover=cover;r.target=target;r.currentR=evalBuild(r.w,r.gear,optResultArgs(r,currentContext));r.currentV=optTargetValue(r.currentR,target);
    /* 条件型依赖度只算**交付的这一套**（额外几次重算，不进 `calls` 预算）；
       搜索内部不读它，避免把说明性指标又塞回评分。
       `explain` 是可解释性面板的数据契约：核心值 / 约束诊断 / 依赖度分类。 */
    r.cond=optCondDeps(r,context);
    r.explain={version:OPT_SCENE_PROFILE_VERSION,scene:optSceneId(),stance:optStance(),
      skill:optSkillTier(),core:{target:target,v:r.v,current:r.currentV},
      constraints:optPredicateStats(r),deps:r.cond};
    return r;};
  const better=(a,b)=>a&&(!b||a.miss<b.miss||(a.miss===b.miss&&((a.deficit||0)<(b.deficit||0)||((a.deficit||0)===(b.deficit||0)&&a.v>b.v))));
  /* ── 靶场（`o.probe`，试算台穷举参照用）────────────────────────────────────────
     给一个 gear（+可选武器、可选「自由槽」列表），**只用本次搜索那份 sel 口径**评一次分就返回，
     不跑任何搜索。`o.probe.sel` 给了就照它改（缺省 = `selFrom`），`free` 里的槽再按 `refitSlot`
     重填（与 `blockPiece` 换件的口径逐位一致）。**不许在试算台里另写一份 sel** ——
     「评分 = 交付」靠的就是全站只有这一份口径。 */
  if(o.probe){
    const pg=arr(o.probe.gear),pw=o.probe.w||DB.weapons[saved.wslots[slot]];
    if(pg.length!==6||!pg.every(Boolean)||!pw||DB.weapons.indexOf(pw)<0)
      return {ok:false,why:'probe-bad-gear',calls:calls,target:target,mode:cover.mode,plan,cover};
    const s=o.probe.sel?optSelClone(o.probe.sel):selFrom(pg);
    for(const f of arr(o.probe.free))if(f>=0&&f<6)refitSlot(s,pg,f);
    const r=evaluate(pw,pg,s);
    return r?Object.assign(finish(r),{target:target,mode:cover.mode,plan,cover})
            :{ok:false,why:'probe-infeasible',calls:calls,target:target,mode:cover.mode,plan,cover};
  }
  /* ── 覆盖矩阵计数（Step ⑦）───────────────────────────────────────────────────
     `evaluated` **只能由块真进 `evaluate` 的次数自增**；unsupported 一律「列出 + 排除出搜索」。
     口径与搜索入口同源，否则覆盖率虚高（`optGtalUsable` / `optTalentCounted` 是唯一判据源）。 */
  const coverAdd=(dim,field,n)=>{const d=cover.dims[dim];if(d&&typeof d[field]==='number')d[field]+=n;};
  const coverUnsup=(dim,key)=>{const d=cover.dims[dim];if(d&&Array.isArray(d.unsupportedKeys)&&d.unsupportedKeys.indexOf(key)<0)d.unsupportedKeys.push(key);};
  cover.dims.piece.pool=arr(pools.gear).reduce((n,a)=>n+arr(a).length,0);
  const talUsableSet=new Set(),gtalUsableSet=new Set();
  /* 候选**按枪 / 按件缓存**（每次开跑算一遍）：判定要跑 `combatGearRows` 探测，
     放进块里每轮重算会把预算之外的 CPU 全烧在这儿（预算只算 `evaluate` 的次数）。 */
  const talCandCache=new Map(),wmodCandCache=new Map(),gtalCandCache=new Map();
  const wkey=w=>String((w&&(w.mitem||w.uid||w.name||w.zh||w.en))||'');
  function talCandsOf(w){
    const k=wkey(w);if(talCandCache.has(k))return talCandCache.get(k);
    /* 判据/排除表同源：`optTalScan` 一次遍历同时给出「候选」与「被排除」，
       被排除的 key 一律登进覆盖矩阵（问题②：原来 `unsupportedKeys` 永远 0 条）。 */
    const scan=optTalScan(w,base,slot);
    scan.cands.forEach(i=>{const t=arr(TALENTS)[i];if(t&&t.key)talUsableSet.add(t.key);});
    scan.rejected.forEach(key=>coverUnsup('wtalent',key));
    if(scan.cands.length>cover.dims.wtalent.cands)cover.dims.wtalent.cands=scan.cands.length;
    talCandCache.set(k,scan.cands);return scan.cands;
  }
  /* 枪类的「最佳可换天赋」：同类的候选天赋列表相同 ⇒ 扫一把代表枪即代表全类，按类缓存。
     为什么必须有这一条：屏幕 / 起点 / 预筛阶段若一律把天赋位留 -1，就是拿「**无天赋**的普通枪」
     去比「**自带天赋**的奇特枪」——两边的口径不一致，Top-K 被系统性带偏。实测 sdps（同一套装备与
     sel）：GR9 无天赋 15.11M，换上该类最佳天赋 26.05M，反超当场冠军 23.52M —— 真正更好的枪因为
     纸面/无天赋屏幕排在圈外，连一次精算都进不去。
     固定天赋枪不吃外来天赋（实测：给它传任意天赋下标，分数一字不变）⇒ 一律 -1。
     判据与搜索入口同源：候选一律来自 `talCandsOf`（`optTalScan`），不另判一次。 */
  const clsTalCache=new Map();
  function clsBestTal(w,gear,fresh){
    if(!w||(typeof weaponFixedTalent==='function'&&weaponFixedTalent(w)))return -1;
    const cls=w.cls;if(!fresh&&clsTalCache.has(cls))return clsTalCache.get(cls);
    const ctx=gear||base;                                   // `base` 在下方构建（运行时已就绪）
    let best=-1,bv=-Infinity;
    const baseSel=selFrom(ctx);
    for(const ti of [-1].concat(talCandsOf(w))){
      if(calls>=budget)break;
      const sel=optSelClone(baseSel);sel.talents[slot]=ti;
      const r=evaluate(w,ctx,sel);
      coverAdd('wtalent','evaluated',1);
      if(r&&r.v>bv){bv=r.v;best=ti;}
    }
    clsTalCache.set(cls,best);return best;
  }
  function wmodCandsOf(w,code){
    const k=wkey(w)+'|'+code;if(wmodCandCache.has(k))return wmodCandCache.get(k);
    const all=arr(typeof wmCands==='function'?wmCands(w,code):[]);
    const out=optWmodCandsOf(w,code);
    cover.dims.wmods.noValue+=Math.max(0,all.length-out.length);   // 被判据剔掉的 0 值/无名候选数
    wmodCandCache.set(k,out);return out;
  }
  function gtalCandsOf(it,i){
    const k=i+'|'+String((it&&(it.mitem||it.code||it.zh||it.en))||'');
    if(gtalCandCache.has(k))return gtalCandCache.get(k);
    const p=optGtalCandsOf(it,i),keys=[];
    if(!p.locked)for(const key of p.keys){
      if(optGtalUsable(key)){keys.push(key);gtalUsableSet.add(key);}else coverUnsup('gtal',key);
    }
    const out={locked:p.locked,keys:keys};
    gtalCandCache.set(k,out);return out;
  }
  /* ── 搜索块（Steps ②③④）─────────────────────────────────────────────────────
     统一签名 `(cur,cap)`：`cap` = 本块允许消耗的**调用次数**上限（另受全局 `budget` 限）。
     统一纪律：① 锁定格一律跳过 ② 每次尝试都走 `evaluate` ③ **只在严格更好时替换**（`better`）。
     返回本块找到的最好解；没找到更好就返回 `cur` 本身（引用相等 ⇒ 上层据此判「有没有改进」）。 */
  /* 件块**断点续扫**指针（问题①：1500 下件块独吞 326 次/起点，其它维全 0）：
     额度被切成小片后，扫描位置跨调用保留（`i` 槽 / `j` 池内下标）——否则每次重扫都从 0 号开始，
     小切片永远只摸得到 0 号槽的头几件。
     `gain` = 本**整轮**（六格走完）有没有过改进；`done` = 一整轮零改进 ⇒ 本轮收工
     （别的块后续改了解会把它解锁重扫，见 `descend`）。`descend` 入口重置。 */
  let pieceScan=null,pieceSeq=[0,1,2,3,4,5];
  /* 扫描序 · 修格子优先（问题① 三次修订，2026-10-16 全火 1500 实证）：窗口里某件的随机词条位
     **填不满**（存在位置的码不在 `q.affix` 池里 ⇒ `reqAffixMiss` 对该件恒 miss，整个窗口被判
     「无解」）时，件块**先扫这些槽**。实证：crit-1500 有 322 次评分已到 CHC=60，全部栽在
     5 号位护膝填不满；低预算下件块额度只够扫到 0-1 号槽，护膝池（首个干净件在池内第 12 位）
     永远摸不到 ⇒ 假「无解」（探针 probeE/F/G）。
     ⚠️ 只在**低预算**（≤3500：单起点件额扫不完 687 件池、深槽摸不到）启用：那时先修格子才是
     唯一出路；高预算按池序扫得完，且要保住已验收的高预算行为（crit-6000 全序 25.40M，
     全时开修格子序实测掉到 22.72M —— 高预算下改序是纯扰动）。无副属性池时不存在「填不满」。 */
  const PSEQ_DEF=[0,1,2,3,4,5],pieceRepair=budget<=3500;
  function repairSeq(cur){
    if(!arr(q.affix).length)return PSEQ_DEF;
    const bad=[],good=[];
    for(let i=0;i<6;i++){
      const it=arr(cur.gear)[i];
      if(!it||(o.lock&&o.lock[i])){good.push(i);continue;}
      (arr(cur.sel.aff[i]).length<nRandomSlots(it)?bad:good).push(i);
    }
    return bad.length?bad.concat(good):PSEQ_DEF;
  }
  function blockPiece(cur,cap){
    const t0=calls;
    cover.dims.piece.ran=true;
    if(!pieceScan)pieceScan={i:0,j:0,gain:false,done:false,seq:pieceSeq.slice()};
    if(pieceScan.done)return cur;
    let win=cur;
    for(;;){
      if(calls>=budget||calls-t0>=cap)return win;          // 额度用尽：指针留在原地（下次接着扫）
      if(pieceScan.i>=pieceScan.seq.length){                // 整轮走完：看这一轮有没有收获
        const gained=pieceScan.gain;
        pieceScan={i:0,j:0,gain:false,done:!gained,seq:pieceScan.seq};
        return win;
      }
      const i=pieceScan.seq[pieceScan.i];
      if(o.lock&&o.lock[i]){pieceScan.i++;pieceScan.j=0;continue;}
      const pool=arr(pools.gear[i]);
      while(pieceScan.j<pool.length){
        if(calls>=budget||calls-t0>=cap)return win;
        const it=pool[pieceScan.j++];
        if(it===win.gear[i])continue;
        const g=win.gear.slice();g[i]=it;
        const sel=optSelClone(win.sel);refitSlot(sel,g,i);
        const trial=evaluate(win.w,g,sel);
        coverAdd('piece','evaluated',1);
        if(better(trial,win)){win=trial;pieceScan.gain=true;}
      }
      pieceScan.i++;pieceScan.j=0;
    }
  }
  function blockCore(cur,cap){
    const t0=calls,codes=[],pool=arr(q.core);
    cover.dims.core.ran=true;
    for(let i=0;i<6;i++){
      if(o.lock&&o.lock[i])continue;
      const it=cur.gear[i];if(!it)continue;
      const all=arr(coreChoices(it));
      /* 条件池外的 code = 本次搜索**没纳入**的核心候选：列账（问题②：`core.unsupported` 原来没有写入点）。
         口径 = 「不参与本次择优的 code」，不是「游戏不支持」——结果面文案照此说。 */
      if(pool.length)all.forEach(c=>{if(c&&pool.indexOf(c)<0&&cover.dims.core.unsupported.indexOf(c)<0)cover.dims.core.unsupported.push(c);});
      for(const code of all.filter(c=>!pool.length||pool.indexOf(c)>=0)){
        if(!code||code===cur.sel.core[i])continue;
        if(codes.indexOf(code)<0)codes.push(code);
        if(calls>=budget||calls-t0>=cap)break;
        const sel=optSelClone(cur.sel);sel.core[i]=code;
        const trial=evaluate(cur.w,cur.gear,sel);
        coverAdd('core','evaluated',1);
        if(better(trial,cur))cur=trial;
      }
    }
    cover.dims.core.codes=codes.slice();
    return cur;
  }
  function blockAffix(cur,cap){
    const t0=calls,codes=[],apool=arr(q.affix);
    cover.dims.affix.ran=true;
    for(let i=0;i<6;i++){
      if(o.lock&&o.lock[i])continue;
      const it=cur.gear[i];if(!it)continue;
      for(let k=0;k<nRandomSlots(it);k++){
        const all=arr(randomSlotCodes(it,k));
        /* 同 core：条件池外的副属性 code 列账（不参与本次择优） */
        if(apool.length)all.forEach(c=>{if(c&&apool.indexOf(c)<0&&cover.dims.affix.unsupported.indexOf(c)<0)cover.dims.affix.unsupported.push(c);});
        for(const code of all.filter(c=>!apool.length||apool.indexOf(c)>=0)){
          if(!code)continue;
          if(codes.indexOf(code)<0)codes.push(code);
          const pick=arr(arr(cur.sel.aff)[i]);
          if(k>=pick.length)continue;                  // 只做**就位替换**，不在数组里开洞（同 `words()` 的填法）
          if(pick[k]===code)continue;
          let dup=false;
          for(let j=0;j<pick.length;j++)if(j!==k&&pick[j]===code)dup=true;
          if(dup)continue;                              // 同件不重复（与 `optSelLegal` 同口径）
          if(calls>=budget||calls-t0>=cap)break;
          const sel=optSelClone(cur.sel);
          sel.aff[i]=pick.slice();sel.aff[i][k]=code;
          const trial=evaluate(cur.w,cur.gear,sel);
          coverAdd('affix','evaluated',1);
          if(better(trial,cur))cur=trial;
        }
      }
    }
    cover.dims.affix.codes=codes.slice();
    return cur;
  }
  function blockGmods(cur,cap){
    const t0=calls,pool=optGmodPool();
    cover.dims.gmods.ran=true;
    cover.dims.gmods.cands=pool.length;
    cover.dims.gmods.noValue=arr(GMODS).length-pool.length;   // 纸面预筛未进池的件数（同名只留最大 + 截前 N）
    for(let i=0;i<6;i++){
      if(o.lock&&o.lock[i])continue;
      const it=cur.gear[i];if(!it)continue;
      /* 该件有没有插件位：判据同 `picksFor`（官方三部位 / 件本体声明 / OVR 放行） */
      if(!(MOD_POS.indexOf(i)>=0||arr(it.sockets).some(modSocketIsGear)||!!(state.ovr&&state.ovr[i]))){
        if(cover.dims.gmods.noSlot.indexOf(i)<0)cover.dims.gmods.noSlot.push(i);
        continue;
      }
      for(const mi of pool.concat([null])){            // `null` = 该格不装插件
        if(mi===cur.sel.gmods[i])continue;
        if(calls>=budget||calls-t0>=cap)break;
        const sel=optSelClone(cur.sel);sel.gmods[i]=mi;
        const trial=evaluate(cur.w,cur.gear,sel);
        coverAdd('gmods','evaluated',1);
        if(better(trial,cur))cur=trial;
      }
    }
    return cur;
  }
  function blockGtal(cur,cap){
    const t0=calls;
    cover.dims.gtal.ran=true;
    for(let i=0;i<6;i++){
      if(o.lock&&o.lock[i])continue;
      const it=cur.gear[i];if(!it)continue;
      const c=gtalCandsOf(it,i);
      if(c.locked){cover.dims.gtal.lockedByPiece++;continue;}   // 件指针（具名/奇特）：不可换
      for(const key of c.keys.concat([null])){
        if(key===cur.sel.gtal[i])continue;
        if(calls>=budget||calls-t0>=cap)break;
        const sel=optSelClone(cur.sel);sel.gtal[i]=key;
        const trial=evaluate(cur.w,cur.gear,sel);
        coverAdd('gtal','evaluated',1);
        if(better(trial,cur))cur=trial;
      }
    }
    cover.dims.gtal.usable=gtalUsableSet.size;
    return cur;
  }
  function blockTalent(cur,cap){
    const t0=calls,cands=talCandsOf(cur.w);
    cover.dims.wtalent.ran=true;
    /* 枪自带固定天赋 ⇒ 没有可选是**合理 0**（把原因单独记账，问题⑤） */
    if(!cands.length&&typeof weaponFixedTalent==='function'&&weaponFixedTalent(cur.w))cover.dims.wtalent.fixed=true;
    let win=cur;
    for(const ti of [-1].concat(cands)){
      if(ti===win.sel.talents[slot])continue;
      if(calls>=budget||calls-t0>=cap)break;
      const sel=optSelClone(win.sel);sel.talents[slot]=ti;
      const trial=evaluate(win.w,win.gear,sel);
      coverAdd('wtalent','evaluated',1);
      if(better(trial,win))win=trial;
    }
    cover.dims.wtalent.usable=talUsableSet.size;
    return win;
  }
  function blockWmods(cur,cap){
    const t0=calls;
    cover.dims.wmods.ran=true;
    let win=cur;
    for(const code of arr(wmSlots(win.w))){
      const cands=wmodCandsOf(win.w,code);
      if(cands.length>cover.dims.wmods.cands)cover.dims.wmods.cands=cands.length;
      for(const mi of cands.concat([null])){
        const bag=win.sel.wmods[slot]||{};
        const hasV=bag[code]==null?null:bag[code];
        if(mi===hasV)continue;
        if(calls>=budget||calls-t0>=cap)break;
        const sel=optSelClone(win.sel);
        if(!sel.wmods[slot])sel.wmods[slot]={};
        if(mi==null)delete sel.wmods[slot][code];else sel.wmods[slot][code]=mi;
        const trial=evaluate(win.w,win.gear,sel);
        coverAdd('wmods','evaluated',1);
        if(better(trial,win))win=trial;
      }
    }
    return win;
  }
  function blockWaffix(cur,cap){
    const t0=calls;
    cover.dims.waffix.ran=true;
    let win=cur;
    const codes=arr(weaponAffixCodes(win.w));
    if(codes.length>cover.dims.waffix.cands)cover.dims.waffix.cands=codes.length;
    for(const code of codes.concat([''])){
      if(code===(win.sel.waffix[slot]||''))continue;
      if(calls>=budget||calls-t0>=cap)break;
      const sel=optSelClone(win.sel);sel.waffix[slot]=code;
      const trial=evaluate(win.w,win.gear,sel);
      coverAdd('waffix','evaluated',1);
      if(better(trial,win))win=trial;
    }
    return win;
  }
  /* 武器联合块（Step ③）：tier-2「1 call/枪」屏幕取 Top-K（含当前那把），只对 Top-K 跑内层联合下降
     （武器天赋 → 每槽配件 → 武器词条）。`o.lockW` 时不跑（锁定武器由用户决定）。 */
  function blockWeapon(cur,cap){
    if(o.lockW)return cur;
    cover.dims.weapon.ran=true;
    const t0=calls,K=3,scored=[];
    /* 换枪前先给**当前枪所在枪类**按 `cur.gear` 现算一次「该类最佳可换天赋」（不读缓存）。
       理由：该类最佳天赋**随装备漂移**——实测 sdps 同一把 GR9，拿 base 上算出的类最佳天赋只得
       17.96M，换成冠军那套装备后现算的真最佳得 26.36M（冠军 23.01M）。用旧值屏幕会把「能反超的
       普通枪」压到圈外，它便永远进不了 Top-K ⇒ 天赋这一维对普通枪等于没搜。
       探针用**同类里第一把可换天赋的普通枪**（固定天赋枪没有候选，扫不出东西）。
       ⚠️ **只现算当前这一类**：给每个枪类都现算一遍实测把件块预算吃干（sdps 25.39M→22.22M、
          dpm 811.52M→468.89M）；6000 预算下「一类现算 + 其余吃 base 缓存」才是净正。 */
    const clsNow=cur.w&&cur.w.cls;
    const rep=clsNow?(ws.find(w=>w&&w.cls===clsNow&&!weaponFixedTalent(w))||null):null;
    const ct=rep?clsBestTal(rep,cur.gear,true):null;
    const talOf=w=>((ct!=null&&w&&w.cls===clsNow)?ct:clsBestTal(w));
    for(const w of ws){
      if(w===cur.w)continue;
      if(calls>=budget||calls-t0>=cap)break;
      const sel=optSelClone(cur.sel);refitWeapon(sel,w,talOf(w));
      const r=evaluate(w,cur.gear,sel);
      coverAdd('weapon','screened',1);
      if(r)scored.push(r);
    }
    scored.sort((a,b)=>a.miss-b.miss||b.v-a.v);
    /* `refined` = 「拿到内层联合下降的枪数」——取各轮**最大值**（末轮常因额度见底而空屏，
       若直接覆盖会把它误报成 0，结果面会以为这一维没跑）。 */
    cover.dims.weapon.refined=Math.max(cover.dims.weapon.refined,Math.min(K,scored.length));
    const list=scored.slice(0,K).concat([cur]);
    const share=Math.max(24,Math.floor((cap-(calls-t0))/Math.max(1,list.length)));
    let win=cur;
    for(const st of list){
      if(calls>=budget||calls-t0>=cap)break;
      let c2=blockTalent(st,share);
      c2=blockWmods(c2,share);
      c2=blockWaffix(c2,share);
      if(better(c2,win))win=c2;
    }
    return win;
  }
  const BLOCKS=[blockPiece,blockCore,blockAffix,blockGmods,blockGtal,blockWeapon].map(block=>(cur,cap)=>{
    const previous=phaseDeadline;phaseDeadline=Math.min(previous,calls+Math.max(0,cap));
    try{return block(cur,cap);}finally{phaseDeadline=previous;}
  });
  /* 统一下降器（Step ⑤）：唯一的循环。连续一轮无改进即收敛（不按 `maxRounds` 空转）。
     预算分配（2026-10-16 二次修订，问题①）：「其它块总额度 + 件块吃其余」。
       · 其它块的总额度 = `max(190, cap×0.16)`（低预算下的开门线：核心 12 + 副属性 ~53 +
         防具插件 ~45 + 件天赋 ~6 + 武器屏 42 + 内层 ~39 ≈ 190 ⇒ 1000 预算也各维非零）；
       · 件块配额 = 当前剩余 − 其它块没花完的额度；其它块花完额度后就全归件块。
         依据：6000 实测（同预算对照）——件块第二遍扫描的边际收益 > 其它块二遍重扫
         （旧口径件块吃 5121 得 29.71M；公平切分件块只吃 1824 得 20.69M；1500 下公平
         切分反超旧口径 —— 所以是「首扫保底 + 其余归件」而不是单向独吞）。
       · 其它块**首扫保底**由额度保证（件块配额 = 剩余 − 未花完额度，不抢它们的首扫钱）；
       · 件块零改进收工后（`pieceScan.done`），别的块改了解 ⇒ 解锁重扫（输入变了，结论作废）。 */
  function descend(cur,cap,othersAllow){
    const t0=calls;
    let c=cur,improved=true,guard=0;
    pieceScan=null;pieceSeq=pieceRepair?repairSeq(cur):PSEQ_DEF;
    let oLeft=Math.min(cap,othersAllow!=null?othersAllow:Math.max(190,Math.floor(cap*0.16)));
    while(improved&&guard++<4&&calls<budget&&calls-t0<cap){
      improved=false;rounds++;
      for(let bi=0;bi<BLOCKS.length;bi++){
        const left=cap-(calls-t0);
        if(calls>=budget||left<=0)break;
        const quota=bi===0
          ?Math.max(8,left-oLeft)                                    /* 件块：其余全给（正数才动） */
          :Math.max(0,Math.min(left,Math.floor(oLeft/(BLOCKS.length-bi)))); /* 其它块：按剩余块数平分额度 */
        if(bi>0&&quota<=0)continue;
        const c0=calls;
        const r=BLOCKS[bi](c,quota);
        if(bi>0)oLeft=Math.max(0,oLeft-(calls-c0));
        if(r&&r!==c&&better(r,c)){c=r;improved=true;
          if(bi>0&&pieceScan)pieceScan.done=false;
        }
      }
    }
    return c;
  }
  /* LNS（Step ⑤）：释放 2–3 格换随机件 + 重收。**确定性伪随机**（LCG，不用 `Math.random`）
     ⇒ 同一份入参每次跑出同一结果（可归因、可对照）。 */
  function lns(cur,passIdx,cap){
    const t0=calls;
    let win=cur;
    for(let rep=0;rep<2;rep++){
      if(calls>=budget||calls-t0>=cap)break;
      let s=(budget*31+passIdx*17+rep*7+calls+1)%2147483647;
      const rnd=()=>{s=(s*48271)%2147483647;return s/2147483647;};
      const free=[];
      for(let i=0;i<6;i++)if(!(o.lock&&o.lock[i]))free.push(i);
      if(!free.length)break;
      for(let i=free.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));const t=free[i];free[i]=free[j];free[j]=t;}
      const dropN=Math.min(free.length,2+(rnd()<0.5?1:0));
      const g=win.gear.slice(),sel=optSelClone(win.sel);
      let moved=false;
      for(const i of free.slice(0,dropN)){
        const pool=arr(pools.gear[i]);if(!pool.length)continue;
        const it=pool[Math.floor(rnd()*pool.length)];
        if(it===g[i])continue;
        g[i]=it;refitSlot(sel,g,i);moved=true;
      }
      if(!moved)break;
      let r=evaluate(win.w,g,sel);
      if(!r)continue;
      /* LNS 的重收 = 以件块为主（扰动的就是件），其它块给一笔小额重配额度（140） */
      r=descend(r,Math.max(60,Math.floor(cap-(calls-t0))),140);
      if(better(r,win))win=r;
    }
    return win;
  }
  /* 起点**逐格**挑：每格取第一个「不撞件数上限」的非奇特件（直接修好，不再事后补救） */
  const base=Array.from({length:6},(_,i)=>o.lock&&o.lock[i]?oldGear[i]:null);
  for(let i=0;i<6;i++){
    if(o.lock&&o.lock[i])continue;
    for(const cand of (wantsPfe?pools.gear[i].slice().sort((a,b)=>gearModSlotCount(b,i)-gearModSlotCount(a,i)):pools.gear[i])){
      if(!cand||cand.kind==='exotic')continue;
      const trial=base.slice();trial[i]=cand;
      if(optPieceLimits(trial)&&exoticOk(trial)&&new Set(trial.filter(Boolean).map(optPieceKey)).size===trial.filter(Boolean).length){base[i]=cand;break;}
    }
  }
  if(base.some(x=>!x))return {ok:false,why:'no-candidates',calls,mode:cover.mode,plan,cover};
  /* ── 候选枪池 · 纸面加宽 + 下游天赋感知屏幕 ────────────────────────────────────
     纸面榜（`optShortlist` 的 dmg×rpm / 循环伤害）**看不见武器天赋**：枪自带的固定天赋随枪生效，
     可换天赋在纸面里等于 0 ⇒ 「能被天赋反超的普通枪」会被系统性压出候选（实测 sdps：GR9 纸面
     循环榜第 22 名，挂上该类最佳可换天赋后反超当场冠军）。所以 K 由 22 加宽到 30，把「刚好落在
     榜外一位」的枪收回来；真正的强弱判据交给下游 `blockWeapon` 的屏幕——它按枪挂「该类最佳可换
     天赋」（`refitWeapon` → `clsBestTal`）再进引擎评分，固定天赋枪与普通枪在「都吃满天赋」的
     同一口径下比大小，避免拿「无天赋的普通枪」去比「自带天赋的奇特枪」。
     ⚠️ 不在这一层再插一道「全库引擎预筛」：实测它把 `start.w` / 种子评序一起改写，把下降带进
     另一个盆地（dpm 811M → 653M），净亏；候选面由 K 保证、强弱由屏幕与 `blockTalent` 保证。 */
  cover.dims.weapon.pool=ws.length;      // 候选枪池（进 UI 的账）
  /* `seeds` 顺序 = [base, 现有配装?, 近战种子?, …套装种子…, …o.seeds…]，`mustIdx` 记「保底来源」 */
  const seeds=[base],mustIdx=[0];if(oldGear.every(Boolean)){mustIdx.push(seeds.length);seeds.push(oldGear);}
  /* 近战目标：把「自带近战增伤」的件并进一个种子 —— 有界搜索预算内未必走到那一格，
     不播种就会差一件（实测：不播种 → 手套选承包商 15.5；播种 → 染血指节 16.86）。 */
  if(target==='melee'&&typeof optMeleeGear==='function'){
    const mseed=base.map((x,i)=>{
      if(o.lock&&o.lock[i])return x;
      const hit=optMeleeGear().find(m=>m.slot===i);
      return hit?hit.it:x;
    });
    if(mseed.every(Boolean)){mustIdx.push(seeds.length);seeds.push(mseed);}
  }
  for(const set of arr(DB.gearsets_official)){
   /* ⚠️ 套装种子**最多四件**（官方没有 5/6 件档，且件数上限 ≤4）：
      原来把六个部位都塞成同一套 ⇒ 种子本身违规（会被 `optPieceLimits` 淘汰，白跑一轮）。
      取件顺序 **背包 → 胸甲 → 其余**：突袭这类「包+甲」就是靠这两件把 4 件档拉满
      （实测：4 件含包+甲 循环 9.78M > 传统 4+2 的 8.95M）。 */
   const seed=optSetSeedGear(set.code,base,pools,o.lock);
   if(seed)seeds.push(seed);
  }
  /* ── 生产侧骨架种子（Step ⑥）：`o.seeds` = 一组 6 长族键数组（骨架**只作起点、不作硬约束**）。
     `res.seeds` 记账口径（调用方/试算台靠它证明「通路是否生效」）：
       `requested` 请求条数；`accepted` 真入池；`dupes` 与既有起点**逐件相同**（按 raw 序列去重，计划 Step ⑥）；
       `invalid` 形状非法或族键挑不到件；`starts` = 入池后真被选进起点集的条数。
     ⚠️ 三种丢弃（invalid / dupes / 超出起点集名额）**都只丢那一条**，其余搜索路径不受影响；
     「同预算差值」大概率是 0（种子被下降器带到同一最优，或与内部套装种子逐件相同被去重 ——
     `set:y:4,brand:a1:2` 就是后者的实测例子），所以「通路是否生效」**必须看这组计数**，不能只看分数差。 */
  let seedReq=arr(o.seeds).length,seedAcc=0,seedDup=0,seedInv=0;const seedIdx=new Set();
  if(arr(o.seeds).length){
    const seen=new Set(seeds.map(g=>g.map(x=>x.raw).join('|')));
    for(const spec of arr(o.seeds)){
      const s=optSeedSpec(spec);
      if(!s){seedInv++;continue;}
      const g=optSeedGear(s,base,pools,o.lock);
      if(!g||!g.every(Boolean)){seedInv++;continue;}
      const key=g.map(x=>x.raw).join('|');
      if(seen.has(key)){seedDup++;continue;}
      seen.add(key);seedAcc++;seedIdx.add(seeds.length);mustIdx.push(seeds.length);seeds.push(g);
    }
  }
  let start=null;for(const w of ws){const r=evaluate(w,base,selFrom(base));if(better(r,start))start=r;}
  if(!start)return {ok:false,why:'no-candidates',calls,mode:cover.mode,plan,cover};
  /* ── 多起点（Step ⑤）：先给每个 seed 记一次分（1 call/seed），再按**来源配额**选起点。
     `mustIdx`（base / 现有配装 / 近战种子 / `o.seeds`）各保底 1 —— 否则 29 个套装种子按
     (miss,v) 排序会把用户显式给的骨架挤掉（骨架就白播了）。其余按 `miss→v` 填到 `MULTISTART_N`。 */
  const MULTISTART_N=4,ranked0=[];
  for(let si=0;si<seeds.length;si++){
    if(calls>=budget)break;
    const r=evaluate(start.w,seeds[si],selFrom(seeds[si]));
    if(r)ranked0.push({i:si,r:r});
  }
  const picked=[];
  const push0=h=>{if(h&&picked.length<MULTISTART_N&&picked.indexOf(h)<0)picked.push(h);};
  mustIdx.slice(0,MULTISTART_N).forEach(i=>push0(ranked0.filter(x=>x.i===i)[0]));
  ranked0.slice().sort((a,b)=>a.r.miss-b.r.miss||b.r.v-a.r.v).forEach(push0);
  const starts=picked.map(h=>h.r);
  if(!starts.length)starts.push(start);
  /* 骨架种子是否真的被选进起点集（`mustIdx` 保底 + 去重的实际结果）。0 且 dupes=0、invalid=0 才说明通路没生效。 */
  const seedStarts=picked.filter(h=>seedIdx.has(h.i)).length;
  /* ⚠️ 多起点分法（6000 预算实测，bullet/sdps/dpm 三个目标都试过）：
     · 起点各跑**完整下降**、不留 LNS 预留 → 32.08M/23.52M/811.52M，但预算吃干、LNS 0 次
     · 起点各跑**完整下降**、留 15% → 29.71M/23.52M/811.52M，LNS 627 次但零增益
     · 起点只跑**件块** + 主起点完整下降 → 26.25M/23.27M/811.52M（摊薄预算、起点拉不开差距）
     取「每起点一遍完整下降 + 小预留」：`cap` 是**上限**（收敛早退不浪费），
     `cap=(budget-calls-lnsReserve)/starts.length`，剩下的交给 LNS。只留一个 `descend` 循环。
     LNS 预留取 2%（下限 120）：15% 时 LNS 620 次仍零增益，纯粹是从起点那边抢预算；
     120 次够 LNS 真跑起来（`plan` 里有账），又不至于把起点饿到换盆地。 */
  const lnsReserve=Math.max(120,Math.floor(Math.max(0,budget-calls)*0.02));
  const share=Math.max(160,Math.floor(Math.max(0,budget-calls-lnsReserve)/Math.max(1,starts.length)));
  let champ=null;const trace=[];
  for(let k=0;k<starts.length;k++){
    const st=starts[k];
    if(calls>=budget)break;
    const c0=calls,v0=st.v;
    const r=descend(st,share);
    planNote('multistart',c0,v0);
    trace.push({seed:(picked[k]||{}).i,v0:v0,v1:r.v,miss:r.miss});
    if(!champ||better(r,champ))champ=r;
  }
  if(!champ)champ=starts[0];
  /* `best` 可能已在某个起点的下降里被刷新 ⇒ 从「两者中更好的那个」出发做 LNS。 */
  const main=(best&&better(best,champ))?best:champ;
  /* ── LNS（Step ⑤）：剩余预算做最多 3 遍「释放 2–3 格 + 重收」（确定性伪随机）。
     每遍都从**当前最优**出发（前一遍若改进，后一遍接着收），不是各遍各跑。 */
  if(calls<budget){
    const c0=calls,v0=main.v;
    for(let p=0;p<3&&calls<budget;p++){
      const r=lns(best||main,p,Math.max(80,Math.floor((budget-calls)/3)));
      if(r&&r.miss===0&&(!best||r.v>best.v))best=r;
    }
    planNote('lns',c0,v0);
  }
  if(!best)return {ok:false,why:'search-exhausted',calls,budgetReached:calls>=budget,mode:cover.mode,plan,cover,
    seeds:{requested:seedReq,accepted:seedAcc,dupes:seedDup,invalid:seedInv,starts:seedStarts}};
  /* ── 收尾段：只在剩余额度内重用核心/副属性块，不另建评分通路。
     锁定、合法词条、硬条件与冠军单调性仍由同一 evaluate 路径保证。 */
  /* 收尾复用同一套合法候选/约束/计数通路；不得再调用不计预算、读取旧 sel 的 reqPolish。
     evaluate 只将合法且满足全部硬条件的更优候选写入 best，失败不会覆盖冠军。 */
  if(calls<budget&&(arr(q.core).length||arr(q.affix).length)){
    const c0=calls,v0=best.v;
    const polished=blockCore(best,budget-calls);
    if(calls<budget)blockAffix(polished,budget-calls);
    planNote('polish',c0,v0);
  }
  finish(best);
  if(best&&best.r)arr(best.r.ignoredAttrs).forEach(k=>{if(cover.engineIgnored.indexOf(k)<0)cover.engineIgnored.push(k);});
  restore();
  /* `res.dbg.mut` = 出入口的**用户状态指纹**（借 `core/affix/talents/gmods/...` 试算后必须原样还回来）。
     `ui_smoke` 的 bopt 探针对这条逐字断言 —— 它就是「优化器没偷改用户状态」的运行时证据。 */
  const dbgMut={gmod:arr(state.gmods).join(','),bon:arr(state.bonuses).join(','),twk:arr(state.tweaks).length,
    core:arr(state.core).join(','),aff:arr(state.affix).map(a=>arr(a).length).join(',')};

  if(currentFeasible&&Number.isFinite(baseline)&&best.v<=baseline*(1+1e-9))return {ok:false,why:'no-improvement',calls,baseline,candidate:best.v,mode:cover.mode,plan,cover,
    seeds:{requested:seedReq,accepted:seedAcc,dupes:seedDup,invalid:seedInv,starts:seedStarts},dbg:{mut:dbgMut}};
  return Object.assign(best,{trace,target,baseline,calls,budgetReached:calls>=budget,ms:performance.now()-started,rounds:rounds,wtypeName:o.wtype?pools.wtypes[o.wtype-1]:'',search:'bounded-block-descent+lns',mode:cover.mode,plan,cover,
    seeds:{requested:seedReq,accepted:seedAcc,dupes:seedDup,invalid:seedInv,starts:seedStarts},dbg:{mut:dbgMut}});
 }finally{metrics.overheadEvaluations=metrics.evalBuildCalls-calls;BUILD_EVAL_TRACE=previousTrace;restore();}
}
