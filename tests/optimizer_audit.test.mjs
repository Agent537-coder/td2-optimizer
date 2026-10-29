import test from 'node:test';
import assert from 'node:assert/strict';
import { runInContext } from 'node:vm';
import { boot } from '../scripts/devcheck/build_sim.harness.mjs';

async function fixture() {
  const { context, errors } = boot();
  await runInContext('load()', context);
  assert.equal(errors.length, 0, errors.join('\n'));
  runInContext(`
    state.opt.req = reqDefaults();
    var auditPools = optPools();
    var auditGear = [];
    for (let i=0;i<6;i++) auditGear.push(auditPools.gear[i].find(it=>it.kind!=='exotic' && optPieceLimits(auditGear.concat([it]))));
    var auditW = auditPools.weapons.find(w=>combatWeaponAllowed(w,0)&&w.type!=='手枪'&&!weaponFixedTalent(w));
    state.slots=auditGear.map(it=>it.raw);state.wslots=[DB.weapons.indexOf(auditW),null,null];state.wactive=0;
  `, context);
  return context;
}
const read = (ctx, code) => JSON.parse(runInContext(`JSON.stringify((()=>{${code}})())`, ctx));

test('explicit candidate requirements override unrelated page requirements', async () => {
  const c = await fixture();
  const r = read(c, `state.opt.req={core:['not-a-real-core']};
    return {pool:optPools({core:['WeaponDamageModBonus']}).gear.reduce((n,p)=>n+p.length,0)};`);
  assert.ok(r.pool > 0, 'explicit red-core pool must not read the invalid page pool');
});

test('search does not create or overwrite global q', async () => {
  const c = await fixture();
  const r = read(c, `globalThis.q={sentinel:27};
    const res=optimizeBuild({req:{},probe:{gear:auditGear,w:auditW}});
    return {ok:res.ok,q:globalThis.q};`);
  assert.equal(r.ok,true);
  assert.deepEqual(r.q,{sentinel:27});
});

test('locked weapon retains its selected talent', async () => {
  const c = await fixture();
  const r = read(c, `const ti=TALENTS.findIndex(t=>t&&talentUsableBy(t,auditW.cls)&&!talentIsPerfect(t));
    state.talents[0]=ti;
    const res=optimizeBuild({lockW:true,req:{},probe:{gear:auditGear,w:auditW}});
    return {ok:res.ok,expected:ti,actual:res.talents&&res.talents[0]};`);
  assert.equal(r.ok,true);
  assert.ok(r.expected >= 0);
  assert.equal(r.actual,r.expected);
});

test('set seed honors backpack/chest priority and counts locked pieces', async () => {
  const c = await fixture();
  const r = read(c, `const set=DB.gearsets_official.find(s=>auditPools.gear.every(p=>p.some(it=>it.set_code===s.code)));
    const seed=optSetSeedGear(set.code,auditGear,auditPools,[]);
    const locked=auditGear.slice();locked[4]=auditPools.gear[4].find(it=>it.set_code===set.code);locked[5]=auditPools.gear[5].find(it=>it.set_code===set.code);
    const withLock=optSetSeedGear(set.code,locked,auditPools,[false,false,false,false,true,true]);
    return {slots:seed.map((it,i)=>it.set_code===set.code?i:null).filter(i=>i!==null),
      lockedCount:withLock.filter(it=>it.set_code===set.code).length,lockedSlots:withLock.map((it,i)=>it.set_code===set.code?i:null).filter(i=>i!==null),preserved:withLock[5]===locked[5]};`);
  assert.deepEqual(r.slots,[0,1,2,3]);
  // Slot priority matters when a higher-priority slot is unavailable/locked.
  assert.equal(r.lockedCount,4);
  assert.deepEqual(r.lockedSlots,[1,2,4,5]);
  assert.equal(r.preserved,true);
});

test('candidate probing restores every borrowed state field on success and exception', async () => {
  const c = await fixture();
  const r = read(c, `const keys=['slots','wslots','wactive','core','affix','gtal','talents','gmods','wmods','waffix','bp'];
    const snap=()=>JSON.stringify(keys.map(k=>state[k]));const before=snap();
    optimizeBuild({req:{},probe:{gear:auditGear,w:auditW}});const success=before===snap();
    const original=evalBuild;let thrown=false;
    try{evalBuild=()=>{throw new Error('audit injection');};optimizeBuild({req:{},probe:{gear:auditGear,w:auditW}});}
    catch(e){thrown=e.message==='audit injection';}finally{evalBuild=original;}
    return {success,thrown,restored:before===snap()};`);
  assert.deepEqual(r,{success:true,thrown:true,restored:true});
});

test('proven melee and damage-over-time mapping errors fail closed', async () => {
  const c = await fixture();
  const r = read(c, `return ['talent_exotic_holster_shocker_punch_defibrillator','talent_exotic_lmg_mk1_a'].map(key=>({
    blocked:combatBlocked(key),status:combatSupport(key).status,rows:combatGearRows(key,auditGear,auditW).length}));`);
  for (const item of r) assert.deepEqual(item,{blocked:true,status:'blocked_formula',rows:0});
});

test('optimizer polish never invokes the unbudgeted legacy callback', async () => {
  const c = await fixture();
  const r = read(c, `reqPolish=()=>{throw new Error('legacy polish called');};
    const res=optimizeBuild({target:'armor',budget:250,req:{core:['ArmorGearFlatBonus']}});
    return {calls:res.calls,valid:res.ok||res.why==='no-improvement'||res.why==='search-exhausted'};`);
  assert.ok(r.valid);assert.ok(r.calls<=250);
});

test('bounded real-data search returns legal selections and respects budget', async () => {
  const c = await fixture();
  const r = read(c, `const res=optimizeBuild({target:'sdps',budget:1500,req:{}});
    return {ok:res.ok,why:res.why,calls:res.calls,legal:res.ok&&optSelLegal(res.gear,res.sel),finite:res.ok&&Number.isFinite(res.v)};`);
  assert.ok(r.ok || r.why==='no-improvement', JSON.stringify(r));
  assert.ok(r.calls <= 1500);
  if(r.ok){assert.equal(r.legal,true);assert.equal(r.finite,true);}
});
