import test from 'node:test';
import assert from 'node:assert/strict';
import {runInContext} from 'node:vm';
import {boot} from '../scripts/devcheck/build_sim.harness.mjs';
async function fixture(){const {context,errors}=boot();await runInContext('load()',context);assert.deepEqual(errors,[]);return context;}
const read=(c,code)=>JSON.parse(runInContext(`JSON.stringify((()=>{${code}})())`,c));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('separate skill damage, total skill damage, efficiency and amplification match an independent arithmetic oracle',async()=>{
 const c=await fixture();const r=read(c,`return TD2Calc.buildCompute({type:'突击步枪',dmg:100,rpm:600,mag:30,reload:2},{attrs:[{name:'SkillDamage',val:100},{name:'SkillEfficiency',val:10},{name:'TotalSkillDamage',val:25},{name:'TotalSkillDamage',val:30},{name:'AmplifySkillDamage',val:25},{name:'AmplifySkillDamage',val:15}]}, {bp:{}});`);
 near(r.SkillDamage,110);near(r.TotalSkillDamage,55);near(r.SkillDamageMultiplier,2.1*1.55*1.25*1.15);near(r.SkillOutputPercent,100*2.1*1.55*1.25*1.15);
});

test('putting total skill damage into the base pool is observably wrong',async()=>{
 const c=await fixture();const values=read(c,`const w={type:0,dmg:100,rpm:600,mag:30,reload:2};return [TD2Calc.buildCompute(w,{attrs:[{name:'SkillDamage',val:100},{name:'TotalSkillDamage',val:25}]}, {bp:{}}).SkillDamageMultiplier,TD2Calc.buildCompute(w,{attrs:[{name:'SkillDamage',val:125}]}, {bp:{}}).SkillDamageMultiplier];`);
 near(values[0],2.5);near(values[1],2.25);
});

test('PFE follows the unpacked Max(0.2, 1-bonus) cap, including hard predicates',async()=>{
 const c=await fixture();const r=read(c,`const r=TD2Calc.buildCompute({type:0,dmg:100,rpm:600,mag:30,reload:2},{attrs:[{name:'ProtectionFromElites',val:91}]}, {bp:{}});return {raw:r.RawProtectionFromElites,effective:r.ProtectionFromElites,pass80:optPredicates([{kind:'num',key:'elites',op:'min',val:80}])[0](r),pass81:optPredicates([{kind:'num',key:'elites',op:'min',val:81}])[0](r)};`);
 assert.deepEqual(r,{raw:91,effective:80,pass80:true,pass81:false});near(Math.max(.2,1-r.raw/100),1-r.effective/100);
});

test('a random slot retains every declared family instead of only its first list',async()=>{
 const c=await fixture();const codes=read(c,`return randomSlotCodes({attrs_max:{quality:'Orange',slots:[{kind:'random',fixed:false,by_list:{'MaskOffense@Orange':4,'MaskDefensive@Orange':4,'MaskUtility@Orange':4}}]}},0);`);
 assert.equal(codes.length,12);assert.ok(codes.includes('allskills_damage_mod_Bonus'));assert.ok(codes.includes('WeaponCriticalHitDamageFlatBonus'));assert.ok(codes.includes('ArmorRegenFlatBonus'));
});

test('Kinetic Momentum has two independent skill slots, normal 45 and perfect 54 total skill damage',async()=>{
 const c=await fixture();const r=read(c,`const key='warlock_talent_active_skills_increase_damage',w=DB.weapons[0],ctx=buildEvaluationContext('theoretical');return [key,key+'_perfect'].map(k=>withBuildEvaluationState(w,[],{context:ctx},()=>({cap:combatLimit(k),rows:combatGearRows(k,[],w)})));`);
 assert.equal(r[0].cap,30);assert.equal(r[1].cap,36);near(r[0].rows.find(x=>x.name==='TotalSkillDamage').val,45);near(r[1].rows.find(x=>x.name==='TotalSkillDamage').val,54);
});

test('Ranger uses the frozen scenario distance, not the UI input maximum',async()=>{
 const c=await fixture();const rows=read(c,`const w=DB.weapons[0],key='talent_weapon_damage_increased_by_range';return [10,25].map(distanceM=>withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical','sdps',{distanceM})},()=>combatGearRows(key,[],w)));`);
 // Source mtalent: PvE +2% for every 4 metres; talentrules: AddCombatModifier.
 assert.deepEqual(rows,[[{name:'AmplifyDamage',val:4,unit:''}],[{name:'AmplifyDamage',val:12,unit:''}]]);
});

test('Chill Out has exactly two real sockets and two identical 13% mods contribute 26%',async()=>{
 const c=await fixture();const r=read(c,`const pools=optPools({}),g=pools.gear.map(p=>p.find(it=>it.kind!=='exotic')),w=DB.weapons.find(w=>combatWeaponAllowed(w,0));g[0]=DB.gear.find(it=>it.mitem==='player_gear_mask_b_named_02_xmas');const m=GMODS.findIndex(x=>modName(x)==='精英防御');const base=picksFor(w,g,{gmods:[null,null,null,null,null,null]}),two=picksFor(w,g,{gmods:[m,null,null,null,null,null]});return {count:gearModSlotCount(g[0],0),delta:TD2Calc.buildCompute(w,two, {bp:{}}).RawProtectionFromElites-TD2Calc.buildCompute(w,base, {bp:{}}).RawProtectionFromElites};`);
 assert.deepEqual(r,{count:2,delta:26});
});

test('default common flow conditions express their actual names and objectives',async()=>{
 const c=await fixture();const r=read(c,`return ['crit','skill','pfe'].map(id=>({id,target:optFlowOf(id).target,cons:optFlowOf(id).cons}));`);
 assert.equal(r[0].cons.find(x=>x.key==='redcores').val,'6');assert.equal(r[0].cons.find(x=>x.key==='chc').val,'60');assert.equal(r[1].target,'skillout');assert.equal(r[1].cons.find(x=>x.key==='skilltier').val,'6');assert.equal(r[2].cons.find(x=>x.key==='elites').val,'80');
});

test('all-red counts actual fixed exotic cores, not the requested core pool',async()=>{
 const c=await fixture();const r=read(c,`const pools=optPools({}),g=pools.gear.map(p=>p.find(it=>it.kind!=='exotic')),w=DB.weapons.find(w=>combatWeaponAllowed(w,0)),core=Array(6).fill('WeaponDamageModBonus');const a=picksFor(w,g,{core});const ex=DB.gear.find(it=>it.kind==='exotic'&&arr(it.attrs_max?.slots).filter(s=>s.kind==='core'&&s.fixed&&s.val>0).length>=3);if(!ex)throw new Error('Memento/Ninja fixed-core fixture missing');g[GEAR_MAP[ex.raw]?.slot_idx??1]=ex;return [a.redCorePieces,picksFor(w,g,{core}).redCorePieces];`);
 assert.deepEqual(r,[6,5]);
});

test('unverified 8x-scope requirements fail closed rather than buff an incompatible SMG',async()=>{
 const c=await fixture();const rows=read(c,`const w=DB.weapons.find(w=>w.mitem==='player_weapon_submachinegun_pp19_t1_v1');return withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical')},()=>['warlock_talent_scope_aiming_increases_damage','warlock_talent_scope_aiming_increases_damage_perfect'].map(k=>combatGearRows(k,[],w)));`);
 assert.deepEqual(rows,[[],[]]);
});

test('Glass Cannon incoming damage is modeled and default PFE rejects it',async()=>{
 const c=await fixture();const r=read(c,`const key='warlock_talent_damage_dealt_and_damage_taken_increased',w=DB.weapons[0];return withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical')},()=>{const rows=combatGearRows(key,[],w),result=TD2Calc.buildCompute(w,{attrs:rows.concat([{name:'ProtectionFromElites',val:91}])},{bp:{}});return {incoming:result.DamageTakenMultiplier,pfe:result.ProtectionFromElites,accepted:optPredicates(optFlowOf('pfe').cons).every(p=>p(result))};});`);
 assert.deepEqual(r,{incoming:1.5,pfe:80,accepted:false});
});

