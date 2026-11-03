import test from 'node:test';
import assert from 'node:assert/strict';
import {runInContext} from 'node:vm';
import {boot} from '../scripts/devcheck/build_sim.harness.mjs';
const read=(c,s)=>JSON.parse(runInContext(`JSON.stringify((()=>{${s}})())`,c));
test('equivalent curve retains fractional magazines and conserves damage at cycle boundaries',()=>{
 const {context:c}=boot();const r=read(c,`CHART_SPAN=10;const c=magCurve({DPS:100,DPM:350,SDPS:70,RPM:60,Magazine:3,ReloadTime:1.5,BulletDamage:100});return c;`);
 assert.equal(r.dur,3.5);assert.equal(r.cycle,5);assert.equal(r.dmg.at(-1),700);
 assert.equal(r.dmg[r.pts.indexOf(3.5)],350);assert.equal(r.dmg[r.pts.indexOf(5)],350);
 assert.ok(r.dmg.every((v,i)=>!i||v>=r.dmg[i-1]-1e-8));
});
test('lower hit chance lowers the entire curve without changing the fire/reload timing',()=>{
 const {context:c}=boot();const r=read(c,`CHART_SPAN=20;const base={DPS:100,DPM:300,SDPS:75,RPM:60,Magazine:3,ReloadTime:1,BulletDamage:100};return {full:magCurve(base),half:magCurve({...base,DPS:50,DPM:150,SDPS:37.5})};`);
 assert.deepEqual(r.full.pts,r.half.pts);r.full.dmg.forEach((v,i)=>assert.ok(Math.abs(r.half.dmg[i]-v*.5)<1e-8));
});
test('zero-hit and no-weapon curves stay finite and empty charts do not invent damage',()=>{
 const {context:c}=boot();const r=read(c,`return {zero:magCurve({DPS:0,DPM:0,SDPS:0,RPM:600,Magazine:30,ReloadTime:1.5}),empty:magCurve({})};`);
 assert.ok(r.zero.dmg.every(n=>n===0));assert.deepEqual(r.empty.pts,[]);assert.equal(r.zero.cycle,4.5);
});
test('target shot counts use separate armor and health hits and respond to the chosen hit type',async()=>{
 const {context:c}=boot();await runInContext('load()',c);
 const r=read(c,`const result={fields:{AllWeaponDamage:20,ARDamage:15,WeaponDamage_Talent:5,TotalWeaponDamage:30,AmplifyDamage:1.2,AmplifyDamage_NotForHeadhunter:1.1,CriticalHitChance:75},DPS:100,DPM:300,SDPS:75,RPM:60,Magazine:3,ReloadTime:1,Hits:{Hit_ArmorCover:200,Hit_Cover:100,Critical_Hit_ArmorCover:400,Critical_Hit_Cover:200}};const w={type:'突击步枪',dmg:50,mag:30};const target={armor:1000,hp:500};ANALYSIS_HIT='Hit';const normal=damageAnalysisData(result,w,{},target);ANALYSIS_HIT='Critical_Hit';const crit=damageAnalysisData(result,w,{},target);return {normal,crit,missing:damageAnalysisData(result,w,{},null)};`);
 assert.equal(r.normal.kill.armorShots,5);assert.equal(r.normal.kill.healthShots,5);assert.equal(r.normal.kill.total,10);
 assert.equal(r.crit.kill.total,6);assert.equal(r.missing.kill,null);assert.equal(r.normal.weaponBonus,40);assert.equal(r.normal.critOverflow,15);assert.equal(r.normal.reloadLoss,25);
 assert.ok(Math.abs(r.normal.amplify-1.32)<1e-9);
 assert.equal(runInContext('state.bp.pvp=true;enemyTarget()',c),null,'PvP must not reuse the NPC health/armor table');
});
