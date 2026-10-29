var COMBAT_LAST=null;
/* Generated source metadata is shared with the database. Conditions are never inferred from selecting an item. */
function combatSupport(key){return DB&&DB.combat_audit&&DB.combat_audit.talents[key]||{status:'unsupported',scope:'not_counted'};}
function combatBlocked(key){return arr(DB&&DB.combat_audit&&DB.combat_audit.blocked).some(k=>key&&key.startsWith(k));}
function combatPassive(key){const e=gtalEntry(key);return !!e&&arr(DB&&DB.combat_audit&&DB.combat_audit.passive).includes(e.k);}
function combatEquippedModifier(m,gear){
 const pieces=gear||state.slots.map((_,i)=>gearOf(i));
 if(!pieces.some(it=>gtalPtr(it)===m.key))return 0;
 return gtalVal(TALENT_BY_KEY[m.key],!!state.bp.pvp,m.ends);
}
function combatLimit(key,gear){
 const e=gtalEntry(key),t=TALENT_BY_KEY[key];if(!e||!t)return null;
 let limit=null;for(const r of arr(e.rows)){if(r.mulEnds){limit=gtalVal(t,!!state.bp.pvp,r.mulEnds);if(r.limitDivEnds){const divisor=gtalVal(t,!!state.bp.pvp,r.limitDivEnds);if(!(divisor>0)||limit==null)return null;limit=Math.floor(limit/divisor);}if(r.stackSlots&&limit!=null)limit*=r.stackSlots;break;}if(r.mul!=null){limit=r.mul;break;}}
 if(limit!=null)limit=Math.max(0,limit+(e.limitOffset||0));
 for(const m of arr(e.limitAdd)){const v=combatEquippedModifier(m,gear);if(v==null)return null;limit+=v;}
 return limit;
}
/* 条件型天赋的判据：描述里带触发条件的天赋，自动配装里**不许当常驻**。
   用户 2026-10-23：「不是默认不计入，最起码你给中间挡位吧，启动一半吧」。
   三档：`off`（不计入）/ `half`（半程，默认）/ `full`（满值）。
   档位存 `state.bp.condTier[key]`；搜索与交付后重算读同一份，保证自证一致。
   ⚠️ 走档位族（`gtalEntry(key).tier`）的天赋在 `combatGearRows` 入口就被拦下，
      不经过这里，因此不会被这条判据二次处理。 */
var OPT_COND_RE=/切换|命中后|击杀|蓄力|按住|开火后|射击时|标记|压制|只剩|移动|站定|不移动/;
/* 参数行判据（比描述正则可靠）：带叠层 / 持续时间 / 每秒 / 击杀触发 / 命中触发的参数，
   就是条件型 —— 描述写得再含蓄也跑不掉（索耶的「坚守阵地」就是这么漏掉的）。 */
var OPT_COND_PARAM_RE=/(?:^|_)(?:max_)?stacks?(?:_|$)|_duration(?:_|$)|per_second|on_kill|on_hit|_buff_(?:per|duration)/;
function optCondTalent(key){
  const t=TALENT_BY_KEY[key];if(!t)return false;
  const desc=String(t.desc_zh||t.desc_filled_zh||t.en||'');
  if(OPT_COND_RE.test(desc))return true;
  return arr(t.bonus).some(b=>b&&OPT_COND_PARAM_RE.test(String(b.code||'')));
}
/* 档位：默认 half（半程）。`state.bp.condTier` 里显式写了就按写的。 */
function optCondTier(key){
  const m=state.bp&&state.bp.condTier;
  const v=m&&m[key];
  return v==='off'||v==='full'?v:'half';
}
/* 覆盖率：每条条件型天赋单独判，不用统一 0.5 —— 用户 2026-10-23
   「黑名单场上多名敌人我未必打得到，算一半已经夸张；制胜的覆盖率比它高多了，基本常驻」。
   判据：描述的触发门槛越窄、可维持时间越短 ⇒ 越低。
   ⚠️ 修改器类（`combatParent(key)` 非空，改的是父天赋的层数上限/每层值）**不独立折**，
      跟随父天赋的覆盖率，否则一次改动会被折两次。 */
var OPT_COND_COVERAGE = {
  /* 对「当前战斗中品阶最低」的敌人增伤。⚠️ 这个档位会**随战斗上移**：最低阶敌人死光后，
     下一阶就成为新的最低阶 ⇒ 效果不会失效，只要能按「从低到高」清场就接近常驻。
     只有「放着低阶不打、专打高阶」时才会落空。按目标分布估 0.7（用户 2026-10-23 定，
     作为保守下界；机制上可到 0.9）。 */
  'talent_exotic_mask_weakest_link': 0.7,
  /* 突袭者赌注的修改器：改上限/每层值，跟随父天赋 */
  'talent_gearset_strikersbattlegear_warlock_backpack': 1,
  'talent_gearset_strikersbattlegear_warlock_chest': 1,
  /* 对「未标记敌人」增伤，且只剩一名敌人时标记失效 ⇒ 单目标 / 打 Boss 场景接近 0 */
  'talent_exotic_ostracize': 0.2,
  /* 需要压制 + 目标离开掩体，两个条件同时成立才吃 */
  'talent_exotic_lmg_startling': 0.4,
  /* 站桩叠层：每秒 +3% 总武器伤、最多 10 层，移动 10 秒后归零。Boss 战站桩输出可维持高位 */
  'talent_exotic_kneepads_mk1_a': 0.75
};
/* 场景假设表（scene_profile）：条件型天赋的 uptime 只从这里取，不由评分层临时编。
   `build.triggers.js` 的每一行 `uptime` 必须带同名的三档键（生成脚本负责对齐）。
   版本化：改任何一档的到达率假设 ⇒ 升版本号；交付结果带 `cond.version`，旧结果仍可复现。 */
var OPT_SCENE_PROFILE_VERSION='2026-10-23.1';
var OPT_SCENE_PROFILES={
  pve_solo:{zh:'单人 PvE',en:'PvE Solo'},
  pve_group:{zh:'组队 PvE',en:'PvE Group'},
  pvp:{zh:'PvP',en:'PvP'}
};
function optSceneId(){
  const id=state.bp&&state.bp.scene;
  return Object.prototype.hasOwnProperty.call(OPT_SCENE_PROFILES,id)?id:'pve_solo';
}
/* 操作型天赋的玩家水平档：默认中档，只有用户显式选高手才按高手算。 */
var OPT_SKILL_TIERS={novice:0.1,normal:0.3,expert:0.6};
function optSkillTier(){
  const v=state.bp&&state.bp.player_skill_tier;
  return OPT_SKILL_TIERS[v]?v:'normal';
}
function optStance(){
  return state.bp&&state.bp.stance==='stationary'?'stationary':'mobile';
}
/* 叠层型（天平 / 突袭）的覆盖率按输出环境分两档：站桩能续层，走位/换弹/转火会掉层。
   不按同一个数，也不按满层纸面值。 */
var OPT_STANCE_COVERAGE={
  'talent_gearset_throttle_control_4pc':{stationary:0.75,mobile:0.4},
  'talent_gearset_strikersbattlegear_warlock':{stationary:0.8,mobile:0.6}
};
/* 轻机枪「疯狂」：7 秒 buff / 5.8 秒换弹，靠副武器「填满」把循环接起来。
   方案里没有可用的副武器 + 填满 ⇒ 不按理想 7/12.8 覆盖率算，直接降档。 */
function optLoopIntegrity(){
  try{
    const n=arr(state.wslots).length;
    for(let i=0;i<n;i++){
      if(i===state.wactive||state.wslots[i]==null)continue;
      const w=arr(DB&&DB.weapons)[state.wslots[i]];
      const t=w&&(weaponFixedTalent(w)||TALENTS[state.talents[i]]);
      if(t&&/reload_empty_weapon_refills|reload_fills_all_guns/.test(String(t.key||'')))return true;
    }
  }catch(e){}
  return false;
}
/* 语义大类：常驻以外的四类各走各的系数，不能拿一个 uptime 概全。
   trigger（事件触发）/ conditional（状态门槛）/ operational（玩家操作）/ team（队友依赖）。 */
function optCondClass(key){
  const trig=optCondTrigger(key);
  if(trig==='team')return 'team';
  if(trig==='headshot'||trig==='manual'||trig==='switch'||trig==='operational'||trig==='no_reload')return 'operational';
  if(trig==='kill'||trig==='crit'||trig==='hit'||trig==='stack'||trig==='cycling')return 'trigger';
  return 'conditional';
}
function optCondFactor(key){
  const tier=optCondTier(key);
  if(tier==='off')return 0;
  if(tier==='full')return 1;
  /* ① 站桩/走位两档（叠层型） */
  if(OPT_STANCE_COVERAGE[key])return OPT_STANCE_COVERAGE[key][optStance()];
  /* ② 逐条特例（人工判定 / 实测校准） */
  if(Object.prototype.hasOwnProperty.call(OPT_COND_COVERAGE,key))return OPT_COND_COVERAGE[key];
  if(!optCondTalent(key))return 1;
  /* ③ 修改器跟随父天赋，不独立折 */
  if(typeof combatParent==='function'&&combatParent(key))return 1;
  const cls=optCondClass(key);
  /* ④ 团队型：单人场景价值趋零（留 0.05 避免把整条抹成 0 后无法解释） */
  if(cls==='team'){
    const scene=optSceneId();
    return scene==='pve_solo'?0.05:scene==='pvp'?0.3:0.4;
  }
  /* ⑤ 操作型：按玩家水平档，不按场景到达率 */
  if(cls==='operational')return OPT_SKILL_TIERS[optSkillTier()];
  /* ⑥ 循环型：有副武器 + 填满才按理想循环，否则保守 */
  if(optCondTrigger(key)==='cycling')return optLoopIntegrity()?0.55:0.25;
  /* ⑦ 触发语义表：uptime 按 scene_profile 取 */
  const trig=(typeof OPT_TALENT_TRIGGERS!=='undefined')&&OPT_TALENT_TRIGGERS[key];
  if(trig&&trig.uptime){
    const scene=optSceneId();
    const v=trig.uptime[scene];
    return v!=null?v:trig.uptime.pve_solo;
  }
  /* ⑧ 没有触发表条目：按触发方式先验 */
  return optCondDefault(key);
}
/* 未逐条判定的条件型天赋：先归一到触发语义，再按「触发方式 → 战斗时间占比」给先验。
   不是拍一个统一值：命中类每发都在触发，击杀类要目标陆续死，状态类要先上状态。
   触发语义优先取 `build.triggers.js` 的显式判定；表里没有（或只标了 unknown）的，
   按描述/参数行判据归一 —— 两处只许有这一套正则。
   ⚠️ 先验遇到有实测/明确判断的条目，写进 OPT_COND_COVERAGE 覆盖。 */
function optCondTrigger(key){
  const t=TALENT_BY_KEY[key]||{};
  const codes=arr(t.bonus).map(b=>String(b&&b.code||'')).join(' ');
  const desc=String(t.desc_zh||t.desc_filled_zh||t.en||'');
  /* 机制明确的少数几条：表里可能写了别的触发词，这里按用户口径覆盖。 */
  if(/reloading_from_empty/.test(String(key||'')))return 'cycling';   // 疯狂：切枪/换弹循环
  if(key==='warlock_talent_scope_aiming_increases_damage')return 'operational'; // 专注：长瞄准
  if(/友军|队友|友方/.test(desc))return 'team';
  const trig=(typeof OPT_TALENT_TRIGGERS!=='undefined')&&OPT_TALENT_TRIGGERS[key];
  if(trig&&trig.trigger&&trig.trigger!=='unknown')return trig.trigger;
  if(/切换武器|枪套中/.test(desc))return 'switch';
  if(/瞄准|开镜/.test(desc))return 'operational';
  if(/连续爆头|爆头/.test(desc))return 'headshot';
  if(/不换弹|无需换弹|保持弹匣满/.test(desc))return 'operational';
  if(/只剩一|只剩一名/.test(desc))return 'single';
  if(/燃烧|致盲|混乱|电击|诱捕|出血|中毒/.test(desc))return 'status';
  if(/击杀/.test(desc)||/on_kill|kill_/i.test(codes))return 'kill';
  if(/命中|射击/.test(desc)||/on_hit|hit_/i.test(codes))return 'hit';
  if(/per_second|stack/i.test(codes))return 'stack';
  if(/掩体/.test(desc))return 'cover';
  return 'unknown';
}
function optCondDefault(key){
  switch(optCondTrigger(key)){
    case 'switch':return 0.1;                           // 单枪持续输出里基本用不上
    case 'single':return 0.2;
    case 'status':return 0.35;                          // 要先上状态
    case 'headshot':return 0.45;                        // PvE 爆头率有限
    case 'kill':return 0.6;
    case 'hit':return 0.75;                             // 每发都在触发
    case 'stack':return 0.7;
    case 'cover':return 0.6;
    default:return 0.5;
  }
}
/* 条件型依赖度：在**同一评分上下文**里把条件型天赋全关再算一次，差额占比就是这份方案
   有多少期望输出来自条件假设。重量级按目标口径算，不用纸面峰值当分母；数值只来自
   `scene_profile` + 触发表 + 档位，不由 LLM 生成。交付结果带 `cond.share` 与逐条明细。 */
function optCondDeps(res,ctx){
  try{
    const args=optResultArgs(res,ctx);
    return withBuildEvaluationState(res.w,res.gear,args,()=>{
      const items=[];
      for(const x of combatInPlay()){
        if(!optCondTalent(x.key))continue;
        const meta=(typeof OPT_TALENT_TRIGGERS!=='undefined')&&OPT_TALENT_TRIGGERS[x.key];
        const entry=typeof gtalEntry==='function'?gtalEntry(x.key):null;
        const rowsN=arr(entry&&entry.rows).length;
        items.push({key:x.key,label:x.label,trigger:optCondTrigger(x.key),cls:optCondClass(x.key),
          tier:optCondTier(x.key),factor:optCondFactor(x.key),
          modeled:rowsN>0,magRefill:!!(entry&&entry.magRefillCritEnds),
          sceneUptime:meta&&meta.uptime?meta.uptime[optSceneId()]:null});
      }
      const base={scene:optSceneId(),version:OPT_SCENE_PROFILE_VERSION,stance:optStance(),
        skill:optSkillTier(),loop:optLoopIntegrity(),items:items};
      if(!items.length)return Object.assign(base,{share:0,classes:{},offV:null});
      const v=res.v;
      /* 关掉指定一批 key 后重算同一目标，差额就是这批条件的期望贡献。 */
      const shareOff=keys=>{
        const offCtx=buildClone(ctx);
        offCtx.state.bp=Object.assign({},offCtx.state.bp||{});
        offCtx.state.bp.condTier=Object.assign({},offCtx.state.bp.condTier||{});
        keys.forEach(k=>{offCtx.state.bp.condTier[k]='off';});
        const off=evalBuild(res.w,res.gear,Object.assign({},args,{context:offCtx}));
        const vOff=optTargetValue(off,res.target);
        return (Number.isFinite(v)&&v>0&&Number.isFinite(vOff))?Math.max(0,Math.min(1,1-vOff/v)):0;
      };
      const byClass={};
      items.forEach(it=>{(byClass[it.cls]=byClass[it.cls]||[]).push(it.key);});
      const classes={};
      Object.keys(byClass).forEach(cls=>{classes[cls]=shareOff(byClass[cls]);});
      const share=shareOff(items.map(it=>it.key));
      return Object.assign(base,{share:share,classes:classes,
        statShare:Math.max(0,Math.min(1,1-share))});
    });
  }catch(e){return null;}
}
/* 约束诊断：把同一批 predicate 在交付方案上重跑一次，按命中/未命中聚合。
   只做统计，不改搜索；名字取函数名/序号，够面板定位「哪条约束最常淘汰」。 */
function optPredicateStats(res){
  try{
    const preds=arr(optPredicates(res.effectiveConstraints))
      .concat(typeof reqPredicates==='function'?arr(reqPredicates(res.effectiveReq)):[]);
    let hit=0;const missList=[];
    preds.forEach((p,i)=>{
      let ok=false;
      try{ok=!!p(res,res.gear,res.w);}catch(e){ok=false;}
      if(ok)hit++;else missList.push(String(p&&p.name||('#'+i)));
    });
    return {hit:hit,miss:missList.length,missList:missList};
  }catch(e){return null;}
}
/* ⚠️ 一键配装口径（2026-10-16 定，2026-10-23 修订）：
   常驻天赋按「条件满足 + 满值」算；**条件型天赋按档位系数折算，默认半程**。
   原口径「所有已支持的天赋一律满值」会把「对未标记敌人 +30%」这类概率性增益当成常驻
   （实测黑名单成员 ×1.3、目眩 +30%，冠军因此被虚高）。
   距离、武器类别、互斥档仍必须符合冻结上下文；optPeak 不越过这些门槛。 */
function combatEnabled(key){
  /* 条件型天赋的判定**不受 optPeak 影响**：搜索与交付后重算必须走同一条，
     否则会出现「评分的那套 ≠ 交出来的那套」（2026-10-23 bullet 自证变红就是这个）。
     常驻天赋仍按页面开关；optPeak 期间一律开。 */
  if(optCondTalent(key))return optCondTier(key)!=='off';
  if(state.bp&&state.bp.optPeak)return true;
  const saved=state.bp.effects&&state.bp.effects[key];if(saved&&saved.on===false)return false;return combatPassive(key)||!saved||!!saved.on;}
function affixColorCount(key,gear,color,opt){
 const pieces=gear||[0,1,2,3,4,5].map(i=>gearOf(i));
 let n=0;
 pieces.forEach((it,i)=>{
  if(!it)return;
  const ptr=gtalPtr(it);
  if(ptr!==key&&!String(ptr||'').startsWith(key+'_perfect'))return;
  const pick=(opt&&opt.affix&&opt.affix[i]!=null)?opt.affix[i]:(state.affix?state.affix[i]:[]);
  arr(pick).forEach(code=>{if(code&&affixColorOnPiece(it,code)===color)n++;});
 });
 return n;
}
var COMBAT_PARENT_PARAMETERS=null;
function combatModifierOwnedRow(key,row){
 const rules=gtalRules();
 if(!COMBAT_PARENT_PARAMETERS||COMBAT_PARENT_PARAMETERS.rules!==rules){
  const byKey=Object.create(null);
  for(const parent of rules)for(const m of arr(parent.limitAdd).concat(arr(parent.rows).flatMap(r=>arr(r.add)))){
   if(m.key&&m.ends)(byKey[m.key]||(byKey[m.key]=[])).push(m.ends);
  }
  COMBAT_PARENT_PARAMETERS={rules,byKey};
 }
 return arr(COMBAT_PARENT_PARAMETERS.byKey[key]).some(ends=>row.ends&&(row.ends.endsWith(ends)||ends.endsWith(row.ends)));
}
function combatDistanceAllowed(rule,t,saved){
 const bounds=[['minDistance','minDistanceEnds',true],['maxDistance','maxDistanceEnds',false]];
 for(const [literal,ends,isMin] of bounds){
  if(rule[literal]==null&&!rule[ends])continue;
  const threshold=rule[ends]?gtalVal(t,!!state.bp.pvp,rule[ends]):+rule[literal];
  const raw=state.bp.optPeak?state.bp.optDistanceM:saved?.amount,distance=+raw;
  if(raw==null||raw===''||!(threshold>=0)||!Number.isFinite(distance)||distance<0||(isMin?distance<threshold:distance>threshold))return false;
 }
 return true;
}
function combatGearRows(key,gear,weapon,opt){
 if(combatBlocked(key)||!combatEnabled(key))return [];
 const entry=gtalEntry(key),t=TALENT_BY_KEY[key];if(!entry||entry.tier||!t)return [];
 if(arr(entry.rows).some(r=>r.mulEnds&&gtalVal(t,!!state.bp.pvp,r.mulEnds)==null))return [];
 const limit=combatLimit(key,gear),saved=state.bp.effects&&state.bp.effects[key];
 if(!combatDistanceAllowed(entry,t,saved))return [];
 const stacks=limit==null?null:Math.max(0,Math.min(limit,Math.floor(saved&&Number.isFinite(+saved.stacks)?+saved.stacks:limit)));
 const rows=[];
 for(const r of arr(entry.rows)){
  // A parameter consumed by a parent is a modifier, not another standalone buff.
  // Full-code gear rows and suffix-based parent recipes refer to the same value.
  if(combatModifierOwnedRow(key,r))continue;
  if(!combatDistanceAllowed(r,t,saved))continue;
  if(r.scaleBy)continue; // Depends on the fully assembled/clamped build fields.
  const current=weapon||DB.weapons[state.wslots[state.wactive]];
  if(r.weaponTypes&&!r.weaponTypes.includes(current?.typeZh||current?.type))continue;
  let v=gtalVal(t,!!state.bp.pvp,r.ends);if(v==null)return [];
  for(const m of arr(r.add)){const add=combatEquippedModifier(m,gear);if(add==null)return [];v+=add;}
  if(r.color){const n=affixColorCount(key,gear,r.color,opt);if(!n)continue;v*=n;}
  else if(r.scaleByWeaponPellets){const pellets=+current?.pellets;if(!(pellets>0))continue;v*=pellets;}
  else if(r.mode==='negate')v=-v;
  else if(r.mulEnds||r.mul!=null)v=r.mode==='compound'?(Math.pow(1+v/100,stacks)-1)*100:v*stacks;
  /* 覆盖率折算（2026-10-16 用户「自动配装也要有合理性」）：
     **触发即按满值**（条件满足就给满值，与「自动配装满值口径」一致）；
     但**能不能一直吃到**是另一回事 ⇒ `cov` = 该增益的实战可持续比例，
     只给「官方文案写明要持续开火 / 击杀才叠层」的那一类（如压力使然：连射 4 秒才满、停火即掉）。
     `state.bp.coverage==='ideal'`（理想模式）时不折算；默认按实战折算。 */
  if(r.cov!=null&&!(state.bp&&state.bp.coverage==='ideal'))v*=r.cov;
  if(r.inputSteps){const divisor=gtalVal(t,!!state.bp.pvp,r.inputSteps.divideEnds);if(!(divisor>0)||!entry.input)return [];const amount=state.bp.optPeak?(entry.input.key==='distance'?Math.max(0,Math.min(entry.input.max,+state.bp.optDistanceM||0)):entry.input.max):Math.max(0,Math.min(entry.input.max,Number.isFinite(+saved?.amount)?+saved.amount:0));v*=Math.floor(amount/divisor);}
  rows.push({name:r.f,val:v,unit:''});
 }
 /* 条件型天赋按档位折算（默认半程）：触发条件不保证在场，满值计入就是白拿。
    系数只乘在**该天赋自己的参数行**上，常驻天赋恒为 1。 */
 const cf=optCondFactor(key);
 if(cf!==1)for(const r of rows)r.val*=cf;
 return rows;
}
function combatParent(key){
 return gtalRules().find(e=>arr(e.limitAdd).some(m=>m.key===key)||arr(e.rows).some(r=>arr(r.add).some(m=>m.key===key)))||null;
}
function combatStatusText(key){
 const s=combatSupport(key);if(s.status==='blocked_formula')return L('待核验 · 未计入','Needs validation · not counted');
 const parent=combatParent(key);
 if(parent)return combatEnabled(parent.k)?L('随父天赋计入','Counted with parent talent'):L('父天赋条件关闭','Parent condition off');
 const e=gtalEntry(key);
 if(e&&gtalStatus(key,!!state.bp.pvp)==='nodata')return L('当前模式参数缺失 · 未计入','Missing mode parameters · not counted');
 if(e&&!e.tier&&[e,...arr(e.rows)].some(r=>['minDistance','maxDistance','minDistanceEnds','maxDistanceEnds'].some(k=>r[k]!=null))&&combatEnabled(key)&&!combatGearRows(key).length)return L('距离/武器条件不满足 · 未计入','Distance/weapon condition unmet · not counted');
 if(e&&arr(e.rows).some(r=>r.color)){if(!combatEnabled(key))return L('条件关闭','Condition off');return combatGearRows(key).length?L('按已选颜色计入','Counted from selected colors'):L('未选择对应颜色 · 未计入','No matching colors selected · not counted');}
 if(e&&(e.rows?.length||e.cycle)){if(!combatEnabled(key))return L('条件关闭','Condition off');const n=combatLimit(key),current=state.bp.effects?.[key]?.stacks;return n==null?L('数值部分已计入','Numeric component counted'):L('当前层数：','Stacks: ')+Math.min(n,Math.max(0,Number.isFinite(+current)?+current:n))+'/'+n;}
 const fam=arr(TAL_TIER_FAMILIES).find(f=>key&&key.startsWith(f.family));
 if(fam&&!combatBlocked(key)){const rows=talTierRows(fam,!!state.bp.pvp),cur=state.bp.tiers[fam.id]||(rows.find(x=>x.id!=='off'&&x.rows&&x.rows.length)||{}).id||'off';return cur==='off'?L('条件关闭','Condition off'):L('选定档位 · 部分计入','Selected tier · partial');}
  return combatUnsupportedReason(key);
}
function combatUnsupportedReason(key){
 const talent=TALENT_BY_KEY[key];
 const text=((talent&&(talent.desc_zh||talent.desc_en))||"")+" "+arr(talent&&talent.bonus).map(b=>b&&b.code).join(" ");
 const low=text.toLowerCase();
 if(/标记数量|markamount|shots_ui|额外射击/.test(low))return L("只有层数或发数，没有伤害数值","Only stacks or shot count, no damage value");
 if(/技能|skill/.test(low)&&/伤害|damage|治疗|修复|repair|haste|duration/.test(low))return L("技能机制未进枪械结果","Skill mechanics are not in the firearm result");
 if(/治疗|修复|护甲包|复活|repair|heal|revive|armor kit/.test(low))return L("治疗与护甲回复未计入","Healing and armor repair are not counted");
 if(/致盲|混乱|出血|点燃|标记|状态|blind|confuse|bleed|burn|status/.test(low))return L("状态效果未模拟","Status effects are not simulated");
 if(/冷却|持续|范围|cooldown|duration|radius/.test(low))return L("只有时间或范围，没有可计入数值","Only timing or radius, no countable value");
  if(/弹匣中前|magazine.*threshold|first portion/.test(low))return L("弹匣前后段不同，不能整段计入","Magazine segments differ and cannot be flattened");
 if(talent&&talent.has_skill_script)return L("技能机制未进枪械结果","Skill mechanics are not in the firearm result");
 return L("尚未支持 · 未计入","Unsupported · not counted");
}
function combatInPlay(){
 const result=gtalInPlay().map(x=>({key:x.key,label:L(...G_SLOTS[x.slot])}));
 const w=DB.weapons[state.wslots[state.wactive]],t=w&&(weaponFixedTalent(w)||TALENTS[state.talents[state.wactive]]);
 if(t&&t.key)result.push({key:t.key,label:L('武器','Weapon')});
 for(const set of arr(DB.gearsets_official)){
  const n=countsGear()['set:'+set.code]||0;
  for(const tier of arr(set.tiers))if(n>=tier.pieces)for(const tl of arr(tier.talents))if(tl.key)result.push({key:tl.key.toLowerCase(),label:L(set.zh,set.en)+' '+tier.pieces});
 }
 return result.filter((x,i,a)=>a.findIndex(y=>y.key===x.key)===i);
}
function combatPreset(mode){
 state.bp.effects={};state.bp.tiers={};
 if(mode==='peak')for(const x of combatInPlay()){const e=gtalEntry(x.key);if(e&&(e.rows.length||e.cycle)&&!combatBlocked(x.key))state.bp.effects[x.key]={on:true,stacks:combatLimit(x.key)||0};}
 state.bp.combatPreset=mode;state.opt.res=null;renderAll();
}
function combatRangeText(t){
 const bonus=arr(t&&t.bonus), out=[];
 for(let i=0;i<bonus.length;i++){
  const code=String(bonus[i]&&bonus[i].code||'');
  if(!/(^|_)(min_?UI|ui_01)$/i.test(code))continue;
  const next=bonus[i+1], nextCode=String(next&&next.code||'');
  if(!/(^|_)(max_?UI|ui_02)$/i.test(nextCode))continue;
  const unit=bonus[i].unit||next.unit||'';
  out.push(bonus[i].value+unit+' → '+next.value+unit);
  i++;
 }
 const caps=bonus.filter(b=>/max_stacks|stacksMax|stackCount$/i.test(String(b&&b.code||'')));
 caps.forEach(b=>out.push((LANG==='en'?'Stacks ':'层数 ')+b.value));
 return out;
}
function renderCombatAudit(){
 let box=document.getElementById('combat-audit');
 if(!box){box=document.createElement('details');box.id='combat-audit';box.className='fold2';box.open=true;document.getElementById('fold_cond').append(box);}
 const open=box.open;const list=combatInPlay();
 const rows=list.map(x=>{const t=TALENT_BY_KEY[x.key],e=gtalEntry(x.key),lim=combatLimit(x.key),supported=!!e&&(arr(e.rows).length||e.cycle)&&!combatBlocked(x.key)&&combatSupport(x.key).status!=='missing_parameter';
 const control=supported&&!combatPassive(x.key)?`<label><input type="checkbox" data-combat-key="${esc(x.key)}" ${combatEnabled(x.key)?'checked':''}>${esc(L('条件满足','Condition met'))}</label>`:'';
 const currentStacks=state.bp.effects?.[x.key]?.stacks,stackDefault=combatEnabled(x.key)?lim:0,stack=supported&&lim!=null?`<label>${esc(e.counterLabel?L(...e.counterLabel):L('层数','Stacks'))}<input type="number" min="0" max="${lim}" step="1" data-combat-stack="${esc(x.key)}" value="${Math.min(lim,Math.max(0,Number.isFinite(+currentStacks)?+currentStacks:stackDefault))}"><span>/ ${lim}</span></label>`:'';
 const ranges=combatRangeText(t).map(line=>'<span>'+esc(line)+'</span>').join('');
  const amount=supported&&e.input?`<label>${esc(L(...e.input.label))}<input type="number" min="0" max="${e.input.max}" step="${e.input.step}" data-combat-amount="${esc(x.key)}" value="${Math.max(0,Math.min(e.input.max,+state.bp.effects?.[x.key]?.amount||0))}"></label>`:'';
 return `<div class="combat-effect"><b>${t?talIcon(t,'tic tic-s'):''}${esc(t?nmTxt(t):x.key)}</b><span>${esc(x.label)} · ${esc(combatStatusText(x.key))}</span>${control}${stack}${amount}${ranges?`<div class="tal-params">${ranges}</div>`:''}${((talentParamLines(t,!!state.bp.pvp)||[]).map(line=>'<span>'+esc(line)+'</span>').join('')?('<div class="tal-params">'+(talentParamLines(t,!!state.bp.pvp)||[]).map(line=>'<span>'+esc(line)+'</span>').join('')+'</div>'):'')}${e?.note?`<p class="hint">${esc(L(...e.note))}</p>`:''}<details><summary>${esc(L('触发说明','Trigger details'))}</summary><p>${esc(t?talentDescPlain(t,!!state.bp.pvp):'')}</p><a class="build-db-link" href="/db?cat=talents&id=${encodeURIComponent(t?.uid||x.key)}" target="_blank" rel="noopener">${esc(L('查看天赋','View talent'))}</a></details></div>`;
 }).join('');
 box.innerHTML=`<summary>${esc(L('效果与触发条件','Effects & conditions'))} · ${list.length}</summary><div class="combat-presets"><button type="button" data-combat-preset="base">${esc(L('基础对照','Baseline'))}</button><button type="button" data-combat-preset="peak">${esc(L('已支持效果满层','Supported effects at max'))}</button></div><p class="hint">${esc(L('只计算已支持的数值部分。满层是条件快照，不代表持续覆盖；技能伤害及未支持机制不含在输出中。','Only supported numeric components are counted. Maximum stacks are a conditional snapshot, not sustained uptime. Skill damage and unsupported mechanics are excluded.'))}</p>${rows||esc(L('选择装备后显示相关效果','Equip items to see effects'))}${COMBAT_LAST?.ignoredAttrs?.length?`<p class="hint">${esc(L('尚未计算的属性：','Unmodeled attributes: ')+COMBAT_LAST.ignoredAttrs.join(' · '))}</p>`:''}`;
 box.open=open;
 for(const x of gtalInPlay()){const b=document.querySelector(`.gcard[data-i="${x.slot}"] .taltx`);if(b){b.dataset.calc=combatGearRows(x.key).length?'on':'off';b.title=combatStatusText(x.key)+' · '+(TALENT_BY_KEY[x.key]?talentDescPlain(TALENT_BY_KEY[x.key],!!state.bp.pvp):'');}}
 const warn=document.getElementById('r_warn');if(warn&&state.wactive>=0){const n=list.filter(x=>!combatParent(x.key)&&!['conditional_component'].includes(combatSupport(x.key).status)).length;warn.innerHTML=`<div class="wnote">${esc(L('当前为所选条件下的武器输出估计；','Weapon output estimate under selected conditions; '))}${n?esc(L(n+' 项效果未计入。',n+' effects not counted.')):''}<button type="button" data-combat-open>${esc(L('检查效果','Review effects'))}</button></div>`;}
}
document.addEventListener('change',e=>{
 const t=e.target,key=t.dataset.combatKey||t.dataset.combatStack||t.dataset.combatAmount;if(!key)return;
 state.bp.effects=state.bp.effects||{};const v=state.bp.effects[key]||{on:false,stacks:0};
 if(t.dataset.combatKey)v.on=t.checked;else if(t.dataset.combatAmount)v.amount=Math.max(0,Math.min(gtalEntry(key)?.input?.max||0,+t.value||0));else v.stacks=Math.min(combatLimit(key)||0,Math.max(0,Math.floor(+t.value||0)));
 state.bp.effects[key]=v;state.bp.combatPreset='custom';state.opt.res=null;renderAll();
});
document.addEventListener('click',e=>{const p=e.target.closest('[data-combat-preset]');if(p){combatPreset(p.dataset.combatPreset);return;}if(e.target.closest('[data-combat-open]')){const box=document.getElementById('combat-audit');box.open=true;box.scrollIntoView({block:'nearest'});}});

function combatWeaponAllowed(w,slot){return !!w&&arr(DB.combat_audit?.weapons?.[w.mitem]?.slots).includes(slot);}
function combatCycle(key){
 const e=gtalEntry(key),c=e?.cycle;if(!c||!combatEnabled(key))return '';
 const perfect=key!==e.k,expected=c[perfect?'perfectParams':'params'];
 if(Object.entries(expected).some(([tail,v])=>gtalVal(TALENT_BY_KEY[key],!!state.bp.pvp,tail)!==v))return '';
 return perfect?c.perfect:c.normal;
}
function combatFieldFactor(name,fields){
 if(!fields||!name)return null;
 if(name==='CriticalHitChance')return Math.min(60,+fields.CriticalHitChance||0);
 if(name==='StatusEffects')return (+fields.StatusEffects||0)+(+fields.SkillEfficiency||0);
 const v=+fields[name];
 return Number.isFinite(v)?v:null;
}
function combatDependentRowsFor(keys,result){
 const out=[];
 arr(keys).forEach(key=>out.push(...combatDependentRows(key,result)));
 return out;
}
function combatDependentRows(key,result){
 if(!combatEnabled(key)||combatBlocked(key)||!result||!result.fields)return [];
 const talent=TALENT_BY_KEY[key],rows=[];
 for(const r of arr(gtalEntry(key)?.rows)){
  if(!r.scaleBy)continue;
  const value=gtalVal(talent,!!state.bp.pvp,r.ends),factor=combatFieldFactor(r.scaleBy,result.fields);
  if(value==null||factor==null)return [];
  let v=r.scaleOf==='percent'?value*factor/100:value*factor;
  if(r.mulEnds){
   const m=gtalVal(talent,!!state.bp.pvp,r.mulEnds);
   if(m==null)return [];
   v*=r.mulOf==='percent'?m/100:m;
  }
  rows.push({name:r.f,val:v*optCondFactor(key),unit:''});
 }
 return rows;
}
function combatVisibleRows(key){
 const rows=combatGearRows(key);
 if(COMBAT_LAST)rows.push(...combatDependentRows(key,COMBAT_LAST));
 return rows;
}
function combatApplyMagRefill(result,weapon,params,tal){
 const key=tal&&tal.key,entry=gtalEntry(key);
 if(!result||!entry||!entry.magRefillCritEnds||!combatEnabled(key)||combatBlocked(key))return result;
 const chance=gtalVal(TALENT_BY_KEY[key],!!state.bp.pvp,entry.magRefillCritEnds);
 if(!(chance>0))return result;
 /* 换弹回填也要按条件档折算：没有副武器 + 填满的循环，回填频率达不到纸面值。 */
 const portion=Math.min(60,+result.fields.CriticalHitChance||0)*chance/100*optCondFactor(key);
 const f=Object.assign({},result.fields);
 for(const name of ['ReloadSpeed','Stability','Accuracy','SwapSpeed'])f[name]-=f.WeaponHandling||0;
 f.MagRefill=100-(100-f.MagRefill)*(100-Math.min(portion,99))/100;
 const w=Object.assign({},weapon,{type:TD2Calc.weaponTypeIndex(weapon.type)});
 return Object.assign({},result,TD2Calc.compute(f,w,params),{HitBase:result.HitBase,Hits:result.Hits,Hit:result.Hit,Headshot_Hit:result.Headshot_Hit,magRefillTalent:true});
}

function combatAugmentValue(key,level,tail){
 const mode=state.bp.pvp?'pvp':'pve',curves=DB.combat_audit?.prototype_curves?.[key]?.[mode];
 const pair=Object.entries(curves||{}).find(([name])=>name.endsWith(tail));
 return pair?100*(pair[1].base+pair[1].step*(Math.max(1,Math.min(10,Math.floor(+level||1)))-1)):null;
}
function combatAugmentTotals(gear,weaponSlot){
 const out={echo:0,refill:0,rows:[]};if(!state.bp.prototype)return out;
 const slots=[];
 (gear||[]).forEach((it,i)=>{if(it&&it.kind!=='exotic')slots.push(state.bp.augments?.[i]);});
 if(weaponSlot>=0)slots.push(state.bp.augments?.[weaponSlot+6]);
 const add={};
 slots.forEach(a=>{
  if(!a||!a.key)return;
  if(a.key==='talent_augment_echo'||a.key==='talent_augment_paradox'){
   const chance=combatAugmentValue(a.key,a.level,'_activation_chance');if(chance==null)return;
   if(a.key==='talent_augment_echo')out.echo+=chance;
   else {const rounds=gtalVal(TALENT_BY_KEY[a.key],!!state.bp.pvp,'_ammo_refill');if(rounds!=null)out.refill+=chance*rounds;}
   return;
  }
  const field=a.key==='talent_augment_trapper'?'SkillDuration':'';
  const tail='_cc_effects_increased_duration';
  if(!field)return;
  const value=combatAugmentValue(a.key,a.level,tail);if(value==null)return;
  add[field]=(add[field]||0)+value;
 });
 out.rows=Object.entries(add).map(([name,val])=>({name,val,unit:''}));
 return out;
}
function combatApplyAugments(result,weapon,params,gear,weaponSlot){
 const a=combatAugmentTotals(gear,weaponSlot);if(!a.echo&&!a.refill&&!a.rows.length)return result;
 // Reuse the existing, parity-tested Echo/MagRefill engine fields. compute()
 // applies handling once, so undo that earlier derived addition on this copy.
 const f=Object.assign({},result.fields);for(const name of ['ReloadSpeed','Stability','Accuracy','SwapSpeed'])f[name]-=f.WeaponHandling;
 f.Echo+=a.echo;f.MagRefill=100-(100-f.MagRefill)*(100-Math.min(a.refill,99))/100;
 a.rows.forEach(r=>{f[r.name]=(+f[r.name]||0)+r.val;});
 const w=Object.assign({},weapon,{type:TD2Calc.weaponTypeIndex(weapon.type)});
 return Object.assign({},result,TD2Calc.compute(f,w,params),{HitBase:result.HitBase,Hits:result.Hits,Hit:result.Hit,Headshot_Hit:result.Headshot_Hit,augmentExpected:true});
}
