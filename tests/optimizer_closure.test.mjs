import test from 'node:test';
import assert from 'node:assert/strict';
import { runInContext } from 'node:vm';
import { boot } from '../scripts/devcheck/build_sim.harness.mjs';
const read=(c,code)=>JSON.parse(runInContext(`JSON.stringify((()=>{${code}})())`,c));
async function fixture(){
 const {context:c,errors}=boot();await runInContext('load()',c);assert.deepEqual(errors,[]);
 runInContext(`
  state.opt.req=reqDefaults();state.opt.cons=[];
  var cp=optPools({}),cg=[];
  for(let i=0;i<6;i++)cg.push(cp.gear[i].find(it=>it.kind!=='exotic'&&optPieceLimits(cg.concat([it]))));
  var cw=cp.weapons.find(w=>w.type==='突击步枪'&&!weaponFixedTalent(w)&&combatWeaponAllowed(w,0));
  state.slots=cg.map(it=>it.raw);state.wslots=[DB.weapons.indexOf(cw),null,null];state.wactive=0;
  var ct=TALENTS.findIndex(t=>t.key==='talent_weapon_addle');
  state.talents[0]=ct;state.bp.effects={talent_weapon_addle:{on:false,stacks:0}};
  var makeResult=()=>optimizeBuild({target:'sdps',req:{},lockW:true,probe:{gear:cg,w:cw}});
 `,c);return c;
}

test('theoretical/current scores are independently reproducible without changing user conditions',async()=>{
 const c=await fixture();const r=read(c,`const before=JSON.stringify(optSnap()),res=makeResult();
  const score=evalBuild(res.w,res.gear,optResultArgs(res)).SDPS;
  const current=evalBuild(res.w,res.gear,optResultArgs(res,res.currentContext)).SDPS;
  return {ok:res.ok,theory:res.v,current:res.currentV,score,currentScore:current,unchanged:before===JSON.stringify(optSnap()),frozen:Object.isFrozen(res.context.state.bp)};`);
 assert.equal(r.ok,true);assert.equal(r.theory,r.score);assert.equal(r.current,r.currentScore);assert.ok(r.theory>r.current);assert.equal(r.unchanged,true);assert.equal(r.frozen,true);
});

test('apply uses current-condition score, leaves conditions intact, and undo restores the complete snapshot',async()=>{
 const c=await fixture();const r=read(c,`const before=optSnap(),bp=JSON.stringify(state.bp),res=makeResult();state.opt.res=res;
  const check=optRecheckResult(res),n=applyOpt(),actual=evalBuild(res.w,res.gear,{}).SDPS;
  const unchanged=bp===JSON.stringify(state.bp);optRestore(before);
  return {check,n,actual,expected:res.currentV,unchanged,undo:JSON.stringify(before)===JSON.stringify(optSnap())};`);
 assert.equal(r.check.ok,true,JSON.stringify(r.check));assert.ok(r.n>=0);assert.equal(r.actual,r.expected);assert.equal(r.unchanged,true);assert.equal(r.undo,true);
});

test('stale inputs and tampered results fail closed without changing equipment',async()=>{
 const c=await fixture();const r=read(c,`const outcomes=[];
  for(const kind of ['watch','input','lock','selection','score','data']){
   const clean=optSnap(),res=makeResult();state.opt.res=res;
   let oldData;
   if(kind==='watch')state.bp.watch=!state.bp.watch;
   if(kind==='input')$('#p_hs').value=String(+$('#p_hs').value+1);
   if(kind==='lock')state.opt.lock[0]=!state.opt.lock[0];
   if(kind==='selection')res.sel.core[0]='not-a-core';
   if(kind==='score')res.v+=1;
   if(kind==='data'){oldData=DB.combat_audit.recipe_sha256;DB.combat_audit.recipe_sha256='changed';}
   const before=JSON.stringify(optSnap()),n=applyOpt();outcomes.push({kind,n,unchanged:before===JSON.stringify(optSnap())});
   if(kind==='data')DB.combat_audit.recipe_sha256=oldData;
   if(kind==='input')$('#p_hs').value=String(+$('#p_hs').value-1);
   if(kind==='lock')state.opt.lock[0]=!state.opt.lock[0];
   for(const key of Object.keys(clean))state[key]=buildClone(clean[key]);
  }return outcomes;`);
 for(const item of r){assert.equal(item.n,-1,item.kind);assert.equal(item.unchanged,true,item.kind);}
});

test('snapshot evaluation ignores later DOM and battle-condition changes, restoring state even on exceptions',async()=>{
 const c=await fixture();const r=read(c,`const res=makeResult(),expected=res.v;
  $('#p_hs').value='87';state.bp.effects={talent_weapon_addle:{on:true,stacks:99}};
  const before=JSON.stringify(optSnap()),actual=evalBuild(res.w,res.gear,optResultArgs(res)).SDPS;
  const old=evalBuildScoped;let threw=false;
  try{evalBuildScoped=()=>{throw new Error('injected');};evalBuild(res.w,res.gear,optResultArgs(res));}catch(e){threw=true;}finally{evalBuildScoped=old;}
  return {expected,actual,restored:before===JSON.stringify(optSnap()),threw};`);
 assert.equal(r.actual,r.expected);assert.equal(r.restored,true);assert.equal(r.threw,true);
});

test('explicit empty constraints do not silently restore flow defaults',async()=>{
 const c=await fixture();const r=read(c,`const a=optimizeBuild({flow:'crit',req:{},constraints:[],probe:{gear:cg,w:cw}}),b=optimizeBuild({flow:'crit',req:{},probe:{gear:cg,w:cw}});
  return [a.effectiveConstraints.length,b.effectiveConstraints.length];`);
 assert.deepEqual(r,[0,2]);
});

test('search and overhead evaluation counts reconcile exactly',async()=>{
 const c=await fixture();const r=read(c,`const res=makeResult();return {calls:res.calls,...res.cover.metrics};`);
 assert.equal(r.searchEvaluations,r.calls);assert.equal(r.evalBuildCalls,r.calls+r.overheadEvaluations);assert.ok(r.overheadEvaluations>0);
});

test('affix matching fills legal slots instead of getting trapped by a greedy first choice',async()=>{
 const c=await fixture();const r=read(c,`const oldN=nRandomSlots,oldR=randomSlotCodes;let out;
  try{nRandomSlots=()=>2;randomSlotCodes=(_,k)=>k===0?['A','B']:['A'];out=optAffixPlan({attrs_max:{slots:[]}},['A','B']);}
  finally{nRandomSlots=oldN;randomSlotCodes=oldR;}return out;`);
 assert.deepEqual(r,['B','A']);
});

test('hazard and skill flows find complete legal candidates within the configured budget',async()=>{
 const c=await fixture();const r=read(c,`return ['hazard','skill'].map(flow=>{
  const res=optimizeBuild({flow,req:{},budget:1500});return {flow,ok:res.ok,why:res.why,calls:res.calls,fit:res.fitOk,legal:res.ok&&optWholeLegal(res.w,res.gear,res.sel,res.wslot,res.wslots),tier:res.r?.fields?.SkillTier};});`);
 for(const item of r){assert.equal(item.ok,true,JSON.stringify(item));assert.equal(item.fit,true);assert.equal(item.legal,true);assert.ok(item.calls<=1500);if(item.flow==='skill')assert.equal(item.tier,6);}
});

test('apply-time exceptions roll back every equipment field and preserve the previous undo record',async()=>{
 const c=await fixture();const r=read(c,`const res=makeResult();state.opt.res=res;state.opt.undo={sentinel:1};
  const before=JSON.stringify(optSnap()),old=evalBuild;
  let n;try{evalBuild=(w,g,o)=>{if(!o.context)throw new Error('injected apply failure');return old(w,g,o);};n=applyOpt();}finally{evalBuild=old;}
  return {n,restored:before===JSON.stringify(optSnap()),undo:state.opt.undo};`);
 assert.equal(r.n,-1);assert.equal(r.restored,true);assert.deepEqual(r.undo,{sentinel:1});
});

test('weapon-only changes are counted and locked equipment stays byte-for-byte unchanged',async()=>{
 const c=await fixture();const r=read(c,`state.opt.lock=[true,true,true,true,true,true];
  const before=optSnap(),res=optimizeBuild({target:'sdps',req:{},lock:state.opt.lock,probe:{gear:cg,w:cw}});state.opt.res=res;
  const check=optRecheckResult(res),n=applyOpt();
  return {ok:res.ok,check,n,names:state.opt.changedSlots,gear:['slots','core','affix','gtal','gmods'].every(k=>JSON.stringify(before[k])===JSON.stringify(state[k]))};`);
 assert.equal(r.ok,true);assert.equal(r.check.ok,true,JSON.stringify(r));assert.equal(r.n,1);assert.equal(r.gear,true);
});

test('theoretical non-distance tier scoring selects one supported band, never sums mutually exclusive bands',async()=>{
 const c=await fixture();const r=read(c,`const oldIn=talTierInPlay,oldRows=talTierRows,oldGear=combatGearRows;
  try{
   talTierInPlay=()=>[{id:'synthetic',family:'test_exclusive_bands'}];
   talTierRows=()=>[{id:'off',rows:[]},{id:'close',rows:[{name:'CriticalHitDamage',val:25,unit:''}]},{id:'far',rows:[{name:'CriticalHitChance',val:15,unit:''}]}];
   combatGearRows=()=>[];
   const ctx=buildEvaluationContext('theoretical','sdps'),peak=evalBuild(cw,cg,{context:ctx});
   const values=['off','close','far'].map(band=>{const one=buildClone(ctx);one.state.bp.optPeak=false;one.state.bp.tiers={synthetic:band};return evalBuild(cw,cg,{context:one}).SDPS;});
   return {peak:peak.SDPS,max:Math.max(...values),band:peak.tierSelection.synthetic};
  }finally{talTierInPlay=oldIn;talTierRows=oldRows;combatGearRows=oldGear;}`);
 assert.equal(r.peak,r.max);assert.ok(['close','far'].includes(r.band));
});

test('search restores original state references as well as values',async()=>{
 const c=await fixture();const r=read(c,`const keys=['slots','wslots','wactive','core','affix','gtal','talents','gmods','wmods','waffix','bp'];
  const refs=Object.fromEntries(keys.map(k=>[k,state[k]])),value=JSON.stringify(optSnap());makeResult();return {refs:keys.every(k=>state[k]===refs[k]),value:value===JSON.stringify(optSnap())};`);
 assert.equal(r.refs,true);assert.equal(r.value,true);
});

test('a small locked pool matches its fully enumerated piece/core oracle',async()=>{
 const c=await fixture();const r=read(c,`const original=optPools,q={core:['WeaponDamageModBonus','ArmorGearFlatBonus'],affix:['WeaponCriticalHitChanceFlatBonus','WeaponCriticalHitDamageFlatBonus']},p=original(q);
  cg=[];for(let i=0;i<6;i++)cg.push(p.gear[i].find(it=>it.kind!=='exotic'&&optPieceLimits(cg.concat([it]))));state.slots=cg.map(it=>it.raw);
  state.core=cg.map(it=>coreChoices(it).find(code=>q.core.includes(code))||null);
  state.affix=cg.map(it=>optAffixPlan(it,q.affix)||[]);
  const two=p.gear[3].filter(it=>it.kind!=='exotic'&&!it.named&&!it.set_code&&q.core.every(c=>coreChoices(it).includes(c))&&optAffixFillable(it,q.affix)&&optPieceLimits(cg.map((x,i)=>i===3?it:x))).slice(0,2),locks=[true,true,true,false,true,true];
  try{
   optPools=()=>({gear:cg.map((it,i)=>i===3?two:[it]),weapons:[cw],wtypes:p.wtypes});
   const result=optimizeBuild({target:'armor',req:q,lock:locks,lockW:true,budget:800});let maximum=-Infinity,count=0;
   if(result.ok)for(const piece of two)for(const core of q.core){
    if(!coreChoices(piece).includes(core))continue;
    const gear=result.gear.slice(),sel=optSelClone(result.sel);gear[3]=piece;sel.core[3]=core;sel.aff[3]=optAffixPlan(piece,q.affix);sel.gtal[3]=null;
    const probe=optimizeBuild({target:'armor',req:q,lock:locks,lockW:true,probe:{gear,w:cw,sel}});
    if(probe.ok&&probe.fitOk){maximum=Math.max(maximum,probe.v);count++;}
   }
   return {ok:result.ok,why:result.why,value:result.v,maximum,count,calls:result.calls};
  }finally{optPools=original;}`);
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.count,4);assert.equal(r.value,r.maximum);assert.ok(r.calls<=800);
});
