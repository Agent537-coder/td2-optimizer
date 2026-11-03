import test from 'node:test';
import assert from 'node:assert/strict';
import {runInContext} from 'node:vm';
import {boot} from '../scripts/devcheck/build_sim.harness.mjs';
async function fixture(){const {context,errors}=boot();await runInContext('load()',context);assert.deepEqual(errors,[]);return context;}
const read=(c,code)=>JSON.parse(runInContext(`JSON.stringify((()=>{${code}})())`,c));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('status amplifiers multiply with a separate total-weapon buff rather than adding into it',async()=>{
 const c=await fixture();const r=read(c,`const key='talent_weapon_addle',rows=combatGearRows(key);return {rows,out:TD2Calc.buildCompute({type:0,dmg:100,rpm:600,mag:30,reload:2},{attrs:rows.concat([{name:'TotalWeaponDamage',val:25}])},{bp:{}})};`);
 assert.deepEqual(r.rows,[{name:'AmplifyDamage',val:30,unit:''}]);near(r.out.BulletDamage,100*1.3*1.25);
});
test('melee bonuses cannot raise firearm damage and Mantis applies one headshot-only amplifier',async()=>{
 const c=await fixture();const r=read(c,`const melee=combatGearRows('talent_shotgun_low_ammo_increases_melee_damage'),mantis=combatGearRows('warlock_talent_exotic_marksman_mk2');return {melee,mantis,out:TD2Calc.buildCompute({type:0,dmg:100,rpm:600,mag:30,reload:2},{attrs:melee.concat(mantis)},{bp:{}})};`);
 assert.equal(r.melee[0].name,'MeleeDamage');assert.deepEqual(r.mantis.map(x=>x.name),['AmplifyDamage_Headshot']);near(r.out.BulletDamage,100);
});
test('Bloom health steps use the selected snapshot and the frozen peak uses full target health',async()=>{
 const c=await fixture();const r=read(c,`const key='talent_weapon_blossom_harvest';state.bp.effects={[key]:{on:true,amount:100}};const full=combatGearRows(key);state.bp.effects[key].amount=50;const half=combatGearRows(key);state.bp.effects[key].amount=0;const empty=combatGearRows(key);const peak=withBuildEvaluationState(DB.weapons[0],[],{context:buildEvaluationContext('theoretical')},()=>combatGearRows(key));return {full,half,empty,peak};`);
 near(r.full[0].val,33);near(r.half[0].val,16.5);near(r.empty[0].val,0);near(r.peak[0].val,33);
});
test('suppression backpack increases every selected stack and does not survive its parent',async()=>{
 const c=await fixture();const r=read(c,`const key='talent_gearset_throttle_control_4pc',back=optPools({}).gear[1].find(it=>gtalPtr(it)==='talent_gearset_throttle_control_back');return {base:combatGearRows(key,[]),back:combatGearRows(key,[back]),child:combatGearRows('talent_gearset_throttle_control_back',[back])};`);
 near(r.base.find(x=>x.name==='CriticalHitDamage').val,250);near(r.back.find(x=>x.name==='CriticalHitDamage').val,400);assert.deepEqual(r.child,[]);
});
test('Memento short buff counts equipped red cores while its selected long stacks add base weapon damage',async()=>{
 const c=await fixture();const r=read(c,`const key='warlock_talent_exotic_backpack_mk2',g=optPools({}).gear.map(p=>p.find(it=>it.kind==='brand')),w=DB.weapons[0];return withBuildEvaluationState(w,g,{core:Array(6).fill('WeaponDamageModBonus')},()=>{state.bp.effects={[key]:{on:true,stacks:20}};const rows=combatGearRows(key,g),dependent=combatDependentRows(key,{fields:{}});state.core=Array(6).fill('ArmorGearFlatBonus');return {rows,dependent,blue:combatDependentRows(key,{fields:{}})};});`);
 assert.deepEqual(r.rows,[{name:'WeaponDamage_Talent',val:20,unit:''}]);assert.deepEqual(r.dependent,[{name:'WeaponDamage_Talent',val:30,unit:''}]);near(r.blue[0].val,0);
});
test('base and peak presets actually switch current conditional effects and tier families',async()=>{
 const c=await fixture();const r=read(c,`const pools=optPools({}),g=pools.gear.map(p=>p.find(it=>it.kind==='brand')),w=pools.weapons.find(w=>combatWeaponAllowed(w,0)&&!weaponFixedTalent(w));state.slots=g.map(it=>it.raw);state.wslots=[DB.weapons.indexOf(w),null,null];state.wactive=0;state.talents=[TALENTS.findIndex(t=>t.key==='talent_weapon_addle'),-1,-1];combatPreset('base');const base=combatGearRows('talent_weapon_addle');combatPreset('peak');return {base,peak:combatGearRows('talent_weapon_addle')};`);
 assert.deepEqual(r.base,[]);assert.equal(r.peak[0].val,30);
});
