import test from 'node:test';
import assert from 'node:assert/strict';
import {runInContext} from 'node:vm';
import {boot} from '../scripts/devcheck/build_sim.harness.mjs';
async function fixture(){const {context,errors}=boot();await runInContext('load()',context);assert.deepEqual(errors,[]);return context;}
const read=(c,code)=>JSON.parse(runInContext(`JSON.stringify((()=>{${code}})())`,c));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('Rigger chest is merged exactly once into its platform pool, not gear skill damage',async()=>{
 const c=await fixture();const r=read(c,`const key='talent_gearset_minionmancer_4pc',child='talent_gearset_minionmancer_chest',w=DB.weapons[0],chest=optPools({}).gear[2].find(it=>gtalPtr(it)===child);if(!chest)throw Error('Rigger chest fixture missing');return withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical')},()=>({base:combatGearRows(key,[],w),chest:combatGearRows(key,[chest],w),standalone:combatGearRows(child,[chest],w)}));`);
 assert.deepEqual(r,{base:[{name:'PlatformSkillDamage',val:25,unit:''}],chest:[{name:'PlatformSkillDamage',val:50,unit:''}],standalone:[]});
});

test('platform damage follows the unpacked turret/drone equation as a separate pool',async()=>{
 const c=await fixture();const r=read(c,`return TD2Calc.buildCompute({type:0,dmg:100,rpm:600,mag:30,reload:2},{attrs:[{name:'SkillDamage',val:100},{name:'PlatformSkillDamage',val:50},{name:'TotalSkillDamage',val:25}]},{bp:{}});`);
 near(r.SkillDamage,100);near(r.PlatformSkillDamage,50);near(r.TotalSkillDamage,25);near(r.SkillDamageMultiplier,1.5*2*1.25);
});

test('Camaraderie applies base weapon damage and CHD, not total weapon damage',async()=>{
 const c=await fixture();const r=read(c,`const key='talent_gearset_camaraderie_4pc',child='talent_gearset_camaraderie_back',w=DB.weapons[0],back=optPools({}).gear[1].find(it=>gtalPtr(it)===child);if(!back)throw Error('Camaraderie backpack fixture missing');return withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical')},()=>({base:combatGearRows(key,[],w),back:combatGearRows(key,[back],w),child:combatGearRows(child,[back],w)}));`);
 assert.deepEqual(r.base,[{name:'AllWeaponDamage',val:105,unit:''},{name:'CriticalHitDamage',val:105,unit:''}]);
 assert.deepEqual(r.back,[{name:'AllWeaponDamage',val:210,unit:''},{name:'CriticalHitDamage',val:105,unit:''}]);assert.deepEqual(r.child,[]);
 const out=read(c,`return TD2Calc.buildCompute({type:0,dmg:100,rpm:600,mag:30,reload:2},{attrs:[{name:'AllWeaponDamage',val:100},{name:'AllWeaponDamage',val:210},{name:'CriticalHitDamage',val:105},{name:'CriticalHitChance',val:60}]},{bp:{}});`);
 near(out.BulletDamage,100*(1+1+2.1)*(1+.6*(.25+1.05)));
});

test('consumed chest modifier cannot survive a disabled or absent parent',async()=>{
 const c=await fixture();const r=read(c,`const keys=['talent_gearset_minionmancer_chest','talent_gearset_hardwired_warlock_chest'],w=DB.weapons[0];return withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical')},()=>keys.map(key=>combatGearRows(key,[],w)));`);assert.deepEqual(r,[[],[]]);
});

test('a six-piece Rigger fixture matches independent inventory arithmetic end to end',async()=>{
 const c=await fixture();const r=read(c,`const pools=optPools({}),chest=pools.gear[2].find(it=>gtalPtr(it)==='talent_gearset_minionmancer_chest'),g=pools.gear.map(p=>p.find(it=>it.kind==='gearset'&&it.set_code===chest.set_code));if(g.some(it=>!it))throw Error('six-slot Rigger fixture missing');const w=DB.weapons.find(w=>combatWeaponAllowed(w,0)&&!weaponFixedTalent(w)),args={context:buildEvaluationContext('theoretical'),core:Array(6).fill('SkillPowerFlatBonus'),affix:Array.from({length:6},()=>['allskills_damage_mod_Bonus']),gmods:Array(6).fill(null),gtal:g.map(gtalPtr),talents:[-1,-1,-1]};args.context=buildClone(args.context);args.context.state.bp.watch=false;args.context.state.bp.spec='';args.context.state.bp.extras={};const expectedBase=g.reduce((sum,it)=>sum+DB.attrs_max_curve.pools['allskills_damage_mod_Bonus@'+it.attrs_max.quality].val,0);return withBuildEvaluationState(w,g,args,()=>{const out=evalBuild(w,g,args);return {expectedBase,base:out.SkillDamage,platform:out.PlatformSkillDamage,tier:out.SkillTier,total:out.TotalSkillDamage,mult:out.SkillDamageMultiplier,keys:g.map(it=>it.mitem)};});`);
 assert.equal(r.keys.length,6);assert.equal(new Set(r.keys).size,6);near(r.base,r.expectedBase);near(r.platform,50);near(r.tier,6);near(r.total,0);near(r.mult,(1+r.expectedBase/100)*1.5);
});
test('Negotiator transfer affects other marked targets, never primary-target weapon damage',async()=>{
 const c=await fixture();const r=read(c,`const key='talent_gearset_negotiatorsdilemma_6piece',child='talent_gearset_negotiatorsdilemma_warlock_backpack',w=DB.weapons[0],back=optPools({}).gear[1].find(it=>gtalPtr(it)===child);return withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical')},()=>({rows:combatGearRows(key,[back],w),child:combatGearRows(child,[back],w)}));`);
 assert.deepEqual(r.rows,[{name:'CriticalHitDamage',val:100,unit:''},{name:'MarkedTargetTransfer',val:112,unit:''}]);assert.deepEqual(r.child,[]);
});

test('Precision Strike is amplified per stack and rejects targets beyond its frozen threshold',async()=>{
 const c=await fixture();const r=read(c,`const w=DB.weapons[0],key='talent_weapon_precision_strike';return [10,20,25].map(distanceM=>withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical','sdps',{distanceM})},()=>combatGearRows(key,[],w)));`);
 assert.deepEqual(r,[[{name:'AmplifyDamage',val:60,unit:''}],[{name:'AmplifyDamage',val:60,unit:''}],[]]);
});

test('Coyote contributes only via its attainable tier, with source distance boundaries',async()=>{
 const c=await fixture();const r=read(c,`const fam=TAL_TIER_FAMILIES.find(f=>f.id==='coyote');return {direct:combatGearRows(fam.family),bands:[10,15,15.01,25,25.01].map(d=>talTierPeakBands(fam,false,d).map(b=>b.id))};`);
 assert.deepEqual(r,{direct:[],bands:[['off','close'],['off','close'],['off','mid'],['off','mid'],['off','far']]});
});

test('Striker is linear within its own modifier and independent of other total-weapon buffs',async()=>{
 const c=await fixture();const r=read(c,`const key='talent_gearset_strikersbattlegear_warlock',w=DB.weapons[0],pools=optPools({}),g=[pools.gear[1].find(it=>gtalPtr(it)===key+'_backpack'),pools.gear[2].find(it=>gtalPtr(it)===key+'_chest')];return withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical')},()=>({base:combatGearRows(key,[],w),full:combatGearRows(key,g,w)}));`);
 assert.deepEqual(r.base,[{name:'AmplifyDamage',val:65,unit:''}]);near(r.full[0].val,200*(.65+.25));
 const out=read(c,`return TD2Calc.buildCompute({type:0,dmg:100,rpm:600,mag:30,reload:2},{attrs:[{name:'AmplifyDamage',val:180},{name:'TotalWeaponDamage',val:25}]},{bp:{}});`);near(out.BulletDamage,100*2.8*1.25);
});

test('a six-slot PFE fixture independently accounts for six 13-percent sockets and the effective cap',async()=>{
 const c=await fixture();const r=read(c,`const pools=optPools({}),g=pools.gear.map((p,i)=>p.find(it=>!gtalPtr(it)&&it.kind!=='exotic'&&it.kind!=='gearset'&&gearModSlotCount(it,i)===1)),w=DB.weapons.find(w=>combatWeaponAllowed(w,0)&&!weaponFixedTalent(w));if(g.some(it=>!it))throw Error('six socket fixture missing');const context=buildClone(buildEvaluationContext('theoretical'));context.state.bp.spec='survivalist';context.state.bp.extras={};context.state.bp.watch=false;const m=GMODS.findIndex(x=>modName(x)==='精英防御'),args={context,core:Array(6).fill('ArmorGearFlatBonus'),affix:Array.from({length:6},()=>[]),gmods:Array(6).fill(null),gtal:Array(6).fill(''),talents:[-1,-1,-1]};const base=evalBuild(w,g,args);args.gmods=Array(6).fill(m);const full=evalBuild(w,g,args);return {sockets:g.map(gearModSlotCount),mod:modVal(GMODS[m]),delta:full.RawProtectionFromElites-base.RawProtectionFromElites,effective:full.ProtectionFromElites,incoming:full.DamageTakenMultiplier};`);
 assert.deepEqual(r.sockets,[1,1,1,1,1,1]);near(r.mod,13);near(r.delta,6*13);near(r.effective,80);near(r.incoming,1);
});
test('Hunter Fury near-target debuff and kill-stack buffs are independent and distance-correct',async()=>{
 const c=await fixture();const r=read(c,`const key='talent_gearset_shocktrooper_4pc',w=DB.weapons[0];return [10,25].map(distanceM=>withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical','sdps',{distanceM})},()=>combatGearRows(key,[],w)));`);
 assert.deepEqual(r,[[{name:'AmplifyDamage',val:20,unit:''},{name:'AmplifyDamage',val:25,unit:''}],[{name:'AmplifyDamage',val:25,unit:''}]]);
});

test('Future Initiative uses the total-skill pool and Full Flag does not boost primary-target damage',async()=>{
 const c=await fixture();const r=read(c,`const w=DB.weapons[0];return withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical')},()=>({future:combatGearRows('talent_gearset_futureiniative_warlock',[],w),flag:combatGearRows('talent_gearset_truepatriot_6piece',[],w)}));`);
 assert.deepEqual(r.future.map(x=>x.name),['TotalWeaponDamage','TotalSkillDamage']);assert.equal(r.future[0].val,r.future[1].val);assert.deepEqual(r.flag,[]);
});

test('a six-red Striker fixture matches independently summed cores and a 180-percent modifier',async()=>{
 const c=await fixture();const r=read(c,`const pools=optPools({}),chest=pools.gear[2].find(it=>gtalPtr(it)==='talent_gearset_strikersbattlegear_warlock_chest'),g=pools.gear.map(p=>p.find(it=>it.kind==='gearset'&&it.set_code===chest.set_code)),w=DB.weapons.find(w=>combatWeaponAllowed(w,0)&&!weaponFixedTalent(w));if(g.some(it=>!it))throw Error('six Striker fixture missing');const context=buildClone(buildEvaluationContext('theoretical'));context.state.bp.watch=false;context.state.bp.spec='';context.state.bp.extras={};context.state.bp.weaponExpertise=0;const args={context,core:Array(6).fill('WeaponDamageModBonus'),affix:Array.from({length:6},()=>['WeaponCriticalHitDamageFlatBonus']),gmods:Array(6).fill(null),gtal:g.map(gtalPtr),talents:[-1,-1,-1]};const out=evalBuild(w,g,args),expectedCores=g.reduce((sum,it)=>sum+DB.attrs_max_curve.pools['WeaponDamageModBonus@'+it.attrs_max.quality].val,0);return {cores:out.RedCorePieces,wd:out.fields.AllWeaponDamage,expectedCores,amp:out.fields.AmplifyDamage,twd:out.fields.TotalWeaponDamage};`);
 near(r.cores,6);near(r.wd,r.expectedCores);near(r.amp,1+(.65+.25)*200/100);near(r.twd,0);
});

test('Centurion group one adds source base weapon damage, never total weapon damage',async()=>{
 const c=await fixture();const rows=read(c,`const w=DB.weapons[0];return withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical')},()=>combatGearRows('talent_exotic_holster_equalizer_counterpoise',[],w));`);
 assert.deepEqual(rows,[{name:'RateOfFire',val:20,unit:''},{name:'WeaponDamage_Talent',val:20,unit:''}]);
 const out=read(c,`return TD2Calc.buildCompute({type:0,dmg:100,rpm:600,mag:30,reload:2},{attrs:[{name:'AllWeaponDamage',val:100},{name:'WeaponDamage_Talent',val:20},{name:'AmplifyDamage',val:180},{name:'TotalWeaponDamage',val:25}]},{bp:{}});`);near(out.BulletDamage,100*2.2*2.8*1.25);
});

test('Intimidate source instances compound independently and obey 10m in peak and manual modes',async()=>{
 const c=await fixture();const r=read(c,`const w=DB.weapons[0],key='warlock_talent_bonus_armor_grants_damage';const peak=[10,10.01].map(distanceM=>withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical','sdps',{distanceM})},()=>({normal:combatGearRows(key,[],w),perfect:combatGearRows(key+'_perfect',[],w)})));state.bp.optPeak=false;state.bp.effects={[key]:{on:true,stacks:2,amount:10}};const two=combatGearRows(key,[],w);state.bp.effects[key].amount=11;const far=combatGearRows(key,[],w);delete state.bp.effects[key].amount;const unknown=combatGearRows(key,[],w);return {peak,two,far,unknown};`);
 assert.equal(r.peak[0].normal[0].name,'AmplifyDamage');near(r.peak[0].normal[0].val,(1.04**9-1)*100);near(r.peak[0].perfect[0].val,(1.04**10-1)*100);assert.deepEqual(r.peak[1],{normal:[],perfect:[]});near(r.two[0].val,(1.04**2-1)*100);assert.deepEqual(r.far,[]);assert.deepEqual(r.unknown,[]);assert.match(read(c,`return combatStatusText('warlock_talent_bonus_armor_grants_damage');`),/距离|Distance/);
});

test('Versatile is an independent modifier gated by the actual class and distance, never a free 35-percent total pool',async()=>{
 const c=await fixture();const r=read(c,`const key='warlock_talent_weapon_swap_to_different_weapon_grants_damage';return [['冲锋枪',15],['冲锋枪',15.01],['突击步枪',14.99],['突击步枪',15],['突击步枪',25],['突击步枪',25.01],['射手步枪',24.99],['射手步枪',25]].map(([type,distanceM])=>{const w=DB.weapons.find(w=>(w.typeZh||w.type)===type);if(!w)throw Error('weapon type fixture missing');return withBuildEvaluationState(w,[],{context:buildEvaluationContext('theoretical','sdps',{distanceM})},()=>combatGearRows(key,[],w));});`);
 const row=v=>[{name:'AmplifyDamage',val:v,unit:''}];assert.deepEqual(r,[row(35),[],[],row(10),row(10),[],[],row(35)]);
});

test('Precision PvP and manual distances fail closed for missing, negative and out-of-range targets',async()=>{
 const c=await fixture();const r=read(c,`const w=DB.weapons[0],key='talent_weapon_precision_strike';state.bp.pvp=true;state.bp.optPeak=false;state.bp.effects={[key]:{on:true,stacks:3,amount:25}};const at=combatGearRows(key,[],w);state.bp.effects[key].amount=25.01;const far=combatGearRows(key,[],w);state.bp.effects[key].amount=-1;const negative=combatGearRows(key,[],w);delete state.bp.effects[key].amount;const unknown=combatGearRows(key,[],w);state.bp.optPeak=true;state.bp.optDistanceM=undefined;return {at,far,negative,unknown,peakUnknown:combatGearRows(key,[],w)};`);
 assert.deepEqual(r,{at:[{name:'AmplifyDamage',val:54,unit:''}],far:[],negative:[],unknown:[],peakUnknown:[]});
});



