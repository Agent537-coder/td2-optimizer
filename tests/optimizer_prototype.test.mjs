import test from 'node:test';
import assert from 'node:assert/strict';
import {runInContext} from 'node:vm';
import {boot} from '../scripts/devcheck/build_sim.harness.mjs';

async function fixture(){
 const {context,errors}=boot();await runInContext('load()',context);assert.deepEqual(errors,[]);
 runInContext(`
  state.bp=bpDefaults();state.bp.prototype=true;state.bp.watch=false;state.bp.sp={};
  const pools=optPools();var pg=pools.gear.map(p=>p.find(g=>g.kind==='brand')||p.find(g=>g.kind!=='exotic'));
  var pw=pools.weapons.find(w=>combatWeaponAllowed(w,0)&&!w.exotic&&!weaponFixedTalent(w));
  state.slots=pg.map(g=>g.raw);state.wslots=[DB.weapons.indexOf(pw),DB.weapons.indexOf(pw),null];state.wactive=0;
  state.slots.forEach((_,i)=>autoFillGear(i));state.gtal=Array(6).fill(null);state.talents=[-1,-1,-1];
  state.bp.augments=[];var pbase=evalBuild(pw,pg,{});
 `,context);return context;
}
const read=(c,code)=>JSON.parse(runInContext(`JSON.stringify((()=>{${code}})())`,c));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('Echo uses independently checked level and PvE/PvP curves without changing the hit matrix',async()=>{
 const c=await fixture();
 for(const [pvp,level,chance] of [[false,1,1.2],[false,5,2],[false,10,3],[true,1,.3],[true,5,.7],[true,10,1.2]]){
  const r=read(c,`state.bp.pvp=${pvp};state.bp.augments=[];const base=evalBuild(pw,pg,{});state.bp.augments[0]={key:'talent_augment_echo',level:${level}};const after=evalBuild(pw,pg,{});return {base,after};`);
  near(r.after.fields.Echo,chance);near(r.after.DPS/r.base.DPS,1+chance/100);near(r.after.SDPS/r.base.SDPS,1+chance/100);
  assert.deepEqual(r.after.Hits,r.base.Hits);near(r.after.Damage,r.base.Damage);near(r.after.Magazine,r.base.Magazine);
 }
});
test('Paradox returns two rounds per proc and changes magazine/SDPS rather than burst damage',async()=>{
 const c=await fixture();
 const r=read(c,`state.bp.augments[0]={key:'talent_augment_paradox',level:10};const after=evalBuild(pw,pg,{});return {base:pbase,after};`);
 near(r.after.fields.MagRefill,12);near(r.after.DPS,r.base.DPS);near(r.after.BulletDamage,r.base.BulletDamage);
 near(r.after.DPM/r.base.DPM,1/.88);assert.equal(r.after.Magazine,Math.floor(r.base.Magazine/.88));assert.ok(r.after.SDPS>r.base.SDPS);
});
test('only equipped non-exotic gear and the active non-exotic weapon contribute',async()=>{
 const c=await fixture();const r=read(c,`
  state.bp.augments=Array.from({length:9},()=>({key:'talent_augment_echo',level:10}));
  const all=combatAugmentTotals(pg,0,pw);const exotic=combatAugmentTotals(pg,0,{...pw,exotic:true});
  const partial=combatAugmentTotals([null,...pg.slice(1)],0,pw);const old=state.wactive;state.wactive=1;
  state.bp.augments[7].level=1;const swapped=combatAugmentTotals(pg,1,pw);state.wactive=old;
  state.bp.prototype=false;const off=combatAugmentTotals(pg,0,pw);
  return {all,exotic,partial,swapped,off};`);
 near(r.all.echo,21);assert.equal(r.all.sources.length,7);near(r.exotic.echo,18);near(r.partial.echo,18);near(r.swapped.echo,19.2);near(r.off.echo,0);
});
test('candidate exotic weapon cannot inherit the previous weapon augment',async()=>{
 const c=await fixture();const r=read(c,`
  const w=optPools().weapons.find(w=>w.exotic&&combatWeaponAllowed(w,0));
  state.bp.augments[6]={key:'talent_augment_echo',level:10};const candidate=evalBuild(w,pg,{});
  state.bp.augments=[];const base=evalBuild(w,pg,{});return {candidate,base};`);
 near(r.candidate.DPS,r.base.DPS);near(r.candidate.SDPS,r.base.SDPS);
});
test('individual comparison switches preserve other augments, prototype stats, and saved builds',async()=>{
 const c=await fixture();const r=read(c,`
  state.bp.augments=[{key:'talent_augment_echo',level:10},{key:'talent_augment_paradox',level:10}];
  state.bp.augmentEffects={talent_augment_echo:false};const one=evalBuild(pw,pg,{});const snap=JSON.parse(JSON.stringify(snapshot()));
  state.bp.augmentEffects={};applySaved(snap);const restored=evalBuild(pw,pg,{});
  state.bp.augmentEffects.talent_augment_paradox=false;const off=evalBuild(pw,pg,{});
  return {one,restored,off,base:pbase,settings:state.bp.augmentEffects};`);
 near(r.one.fields.Echo,0);near(r.one.fields.MagRefill,12);near(r.restored.SDPS,r.one.SDPS);near(r.off.SDPS,r.base.SDPS);assert.equal(r.settings.talent_augment_echo,false);
});
test('status duration is not silently applied as skill duration or firearm damage',async()=>{
 const c=await fixture();const r=read(c,`state.bp.augments[0]={key:'talent_augment_trapper',level:10};const after=evalBuild(pw,pg,{});return {base:pbase,after,html:combatAugmentAuditHtml({key:'talent_augment_trapper'})};`);
 near(r.after.fields.SkillDuration,r.base.fields.SkillDuration);near(r.after.DPS,r.base.DPS);assert.match(r.html,/14%/);assert.match(r.html,/未计入枪械输出/);
});
test('conditions include distinct augment groups and baseline/max presets control them',async()=>{
 const c=await fixture();const r=read(c,`
  state.bp.augments=[{key:'talent_augment_echo',level:1},{key:'talent_augment_echo',level:10},{key:'talent_augment_paradox',level:10}];
  const list=combatInPlay().filter(x=>x.prototype);combatPreset('base');const off=evalBuild(pw,pg,{});
  combatPreset('peak');const on=evalBuild(pw,pg,{});COMBAT_LAST=on;
  return {list,off,on,summary:combatAugmentSummaryHtml(),html:combatAugmentAuditHtml({key:'talent_augment_echo'})};`);
 assert.equal(r.list.length,2);near(r.off.fields.Echo,0);near(r.on.fields.Echo,4.2);near(r.on.fields.MagRefill,12);
 assert.match(r.summary,/原型增幅收益/);assert.match(r.html,/Lv\.1/);assert.match(r.html,/Lv\.10/);assert.match(r.html,/1.2%/);assert.match(r.html,/3%/);
});
test('missing mode parameters fail closed and absent legacy levels agree with the displayed default',async()=>{
 const c=await fixture();const r=read(c,`
  state.bp.augments[0]={key:'talent_augment_echo'};const legacy=combatAugmentTotals(pg,0,pw);
  delete DB.combat_audit.prototype_curves.talent_augment_echo.pvp;state.bp.pvp=true;
  return {legacy,missing:combatAugmentTotals(pg,0,pw),html:combatAugmentAuditHtml({key:'talent_augment_echo'})};`);
 near(r.legacy.echo,3);near(r.missing.echo,0);assert.match(r.html,/当前模式参数缺失/);assert.doesNotMatch(r.html,/data-combat-augment/);
});
