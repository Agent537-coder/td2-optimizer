/* Specialization allocation adapter. The engine remains unchanged. */
let BUILD_SPEC_DATA=null,BUILD_SPEC_DRAFT=null;
const BUILD_SPEC_BUDGET=165;
const BUILD_SPEC_ORDER=['demolitionist','survivalist','sharpshooter','gunner','technician','firewall'];
/* ⚠️ 刻意**不加** `loading="lazy"`（2026-10-12 实测推翻）：`item.icon` 是 **data URI**
   （官方专长图谱 296 条图标都内联在 specializations.json 里），懒加载**省不到任何网络请求**，
   而这些图标挂在**闭合的 `<details class="build-quick-control">`** 里 ——
   Chrome 对「不参与渲染」的懒加载图**不加载**，于是展开那一下图标是空的（探针实测：
   摘掉 loading 立刻解码 256x256）。data URI 加 lazy 是纯亏，故本文件不进懒加载批次。 */
function buildSpecIcon(item){return item?.icon?`<img class="build-spec-icon${item.icon_mono?' mono':''}" src="${esc(item.icon)}" alt="">`:'';}
function buildSpecData(key=state.bp.spec){return BUILD_SPEC_DATA?.specializations.find(s=>s.key===(key==='firewall'?'flamethrower':key));}
/* ── 分片加载（2026-10-12）───────────────────────────────────────────────────────
   `specializations.json` 3.0 MB 里 2.9 MB 全是 6 个专长的节点树（gzip 压缩率只有 2.8×，
   因为每个档位都内联一张 base64 图标）⇒ 按专长切成 `spec/index.json`（161 KB）+ `spec/<key>.json`（各 ~500 KB）。
   `/build` 首屏只需要**当前那一个**专长的节点（`buildSpecRows()` 在 `recalc()` 里同步要它）。
   ⚠️ 分片沿用同一个形状 `{specializations:[...]}`，所以上面 `buildSpecData()` 一行都没改，
      只是把取来的那份**并进列表**（同 key 覆盖掉精简条目）。切分器见 `scripts/rebuild/split_specializations.py`。 */
const BUILD_SPEC_LOADED=new Set();
function buildSpecLoaded(key){return BUILD_SPEC_LOADED.has(key==='firewall'?'flamethrower':key);}
function buildSpecEnsure(key){
  const want=key==='firewall'?'flamethrower':key;
  if(!want||!BUILD_SPEC_DATA||BUILD_SPEC_LOADED.has(want))return Promise.resolve(false);
  return fetchJSON('/assets/db/spec/'+encodeURIComponent(want)+'.json').then(shard=>{
    const list=BUILD_SPEC_DATA.specializations||[];
    if(!Array.isArray(shard?.specializations))return false;
    shard.specializations.forEach(s=>{const i=list.findIndex(x=>x.key===s.key);if(i>=0)list[i]=s;else list.push(s);BUILD_SPEC_LOADED.add(s.key);});
    return true;
  }).catch(()=>false);
}
function buildSpecNodes(s){
 const used=new Set();return (s?.nodes||[]).slice().reverse().filter(n=>{const k=n.levels.map(l=>l.uid).join();if(used.has(k))return false;used.add(k);return true;}).reverse();
}
function buildSpecWeaponNode(n){return n.levels.some(l=>(l.requires||[]).some(k=>/WeaponDMG_Branch/i.test(k)))||n.levels.some(l=>(l.bonus||[]).some(b=>['突击步枪伤害','冲锋枪伤害','霰弹枪伤害','步枪伤害','射手步枪伤害','轻机枪伤害','手枪伤害'].includes(b.attr_zh)));}
function buildSpecSpent(s,ranks){return buildSpecNodes(s).reduce((sum,n)=>sum+n.levels.slice(0,ranks[n.key]||0).reduce((v,l)=>v+(+l.cost||0),0),0);}
function buildSpecDefault(s){
 const ns=buildSpecNodes(s),ranks=Object.fromEntries(ns.map(n=>[n.key,n.levels.length]));
 const weapons=ns.filter(buildSpecWeaponNode),required=new Set(ns.filter(n=>!buildSpecWeaponNode(n)).flatMap(n=>n.levels.flatMap(l=>l.requires||[])));
 const chosen=weapons.filter(n=>n.levels.some(l=>required.has(l.key)));
 for(const n of weapons.filter(n=>n.levels.some(l=>(l.bonus||[]).some(b=>['突击步枪伤害','冲锋枪伤害','步枪伤害'].includes(b.attr_zh)))).concat(weapons))if(chosen.length<3&&!chosen.includes(n))chosen.push(n);
 weapons.forEach(n=>{if(!chosen.includes(n))ranks[n.key]=0;});
 if(s?.key==='technician')ranks['Skill Healing']=state.bp.technicianBranch==='healing'?1:0,ranks['Skill Damage']=state.bp.technicianBranch==='healing'?0:1;
 return ranks;
}
function buildSpecValidate(s,ranks){
 if(!s||!ranks||typeof ranks!=='object'||Array.isArray(ranks))return L('加点数据无效','Invalid allocation');
 const ns=buildSpecNodes(s),active=new Set(ns.flatMap(n=>n.levels.slice(0,ranks[n.key]||0).map(l=>l.key)));
 if(buildSpecSpent(s,ranks)>BUILD_SPEC_BUDGET)return L('已超过 165 点预算','The 165-point budget is exceeded');
 for(const n of ns){
  const rank=ranks[n.key]||0;if(!Number.isInteger(rank)||rank<0||rank>n.levels.length)return L('档位无效','Invalid rank');
  for(const l of n.levels.slice(0,rank))if((l.requires||[]).some(k=>!active.has(k)))return L('请先分配前置节点','Allocate prerequisite nodes first');
 }
 const descendants=(key,seen=new Set())=>{
  for(const n of ns)if(!seen.has(n)&&n.levels.some(l=>(l.requires||[]).includes(key))){seen.add(n);n.levels.forEach(l=>descendants(l.key,seen));}return seen;
 };
 for(const n of ns)for(const l of n.levels)if(l.investment_max){
  const spent=[...descendants(l.key)].reduce((v,x)=>v+x.levels.slice(0,ranks[x.key]||0).reduce((a,b)=>a+(+b.cost||0),0),0);
  if(spent>l.investment_max)return L('超出分支点数上限：','Branch budget exceeded: ')+l.investment_max;
 }
 return '';
}
function buildSpecCustom(s){const r=state.bp.specAlloc?.[s?.key];return !!r&&!buildSpecValidate(s,r);}
function buildSpecRanks(s){
 const custom=state.bp.specAlloc?.[s?.key];
 return custom&&!buildSpecValidate(s,custom)?custom:buildSpecDefault(s);
}
function buildSpecRows(w){
 const s=buildSpecData(),custom=buildSpecCustom(s),rows=[];
 const type=w?.typeZh||w?.type,ti=TD2Calc.BP_TYPE_ORDER.indexOf(type);
 /* ⚠️ 分片未到位时 `s.nodes` 是空的。这里必须把「有条目但没节点」**当成没有专长**走 +15% 兜底，
    否则会输出一个**少算了专长加成**的面板 —— 本项目最忌讳的「假数字」。
    分片取回后 init / 换专长那两处都会再 `recalc()` 一次，数字会自己修正。
    ⚠️ 但 `buildSpecData()` 对「用户选了『不使用专长』」(`state.bp.spec===''`) 返回的也是 `undefined` ⇒
    光看 `!s` 会把**主动不选**误判成**分片没到**，白送 15% 武器伤害（2026-10-15 实测：ACR 空配装
    `ARDamage` 15.0054 → 便捷模式一开 30.0054，而引擎那层被 `build.app.js:202` 强制 `spec:''` 关着，
    这 15 个点全部来自本行）。所以兜底只在**确实选了某个专长**时成立。 */
 const noNodes=!s||!s.nodes;
 if(noNodes&&state.bp.spec&&ti>=0&&state.bp.sp?.[BP_WT[ti][0]])rows.push({name:['ARDamage','SMGDamage','ShotgunDamage','RifleDamage','MMRDamage','LMGDamage','PistolDamage'][ti],val:15,unit:''});
 if(noNodes)return rows;
 const ranks=buildSpecRanks(s);
 for(const n of buildSpecNodes(s)){
  const l=n.levels[(ranks[n.key]||0)-1];if(!l)continue;
  for(const b of (state.bp.pvp&&l.bonus_pvp?.length?l.bonus_pvp:l.bonus)||[]){
   if(b.code==='ArmorOnKillModBonus'){rows.push({name:'ArmorOnKillPercent',val:+b.value,unit:''});continue;}
   const headshotType={WeaponDamageMultiplierHeadMarksmanRifleFlatBonus:'射手步枪',WeaponDamageMultiplierHeadRifleFlatBonus:'步枪'}[b.code];
   if(headshotType){if(type===headshotType)rows.push({name:'HeadshotDamage',val:+b.value,unit:''});continue;}
   if(!b.attr_zh)continue;
   if(b.attr_zh==='爆头伤害'&&!['步枪','射手步枪'].includes(type))continue;
   const key=attrKey(b.attr_zh,b.unit);
   if(attrKnown(b.attr_zh,b.unit))rows.push({name:key,val:+b.value,unit:''});
  }
 }
 return rows;
}
function buildSpecToolbar(){
 const host=document.getElementById('build-spec-direct');if(!host)return;
 const active=buildSpecData(),custom=buildSpecCustom(active);
 const allocation=custom?buildSpecSpent(active,buildSpecRanks(active))+' / 165 '+L('点','points'):L('默认满加点 · 165 点','Full allocation · 165 points');
 host.innerHTML='<div class="build-spec-heading"><b>'+L('专长','Specialization')+'</b><span>'+esc(allocation)+'</span></div><div class="build-spec-options">'+BUILD_SPEC_ORDER.map(k=>{
  const s=buildSpecData(k),label=BP_SPEC_LIST.find(x=>x.id===k);
  return `<button type="button" data-act="bpspec" data-k="${k}" aria-pressed="${state.bp.spec===k}">${buildSpecIcon(s)}<span>${esc(L(label.zh,label.en))}</span></button>`;
 }).join('')+'</div><div class="build-spec-actions"><button type="button" data-build-spec-edit'+(!buildSpecData()?' disabled':'')+'>'+L('自定义加点 / 图谱','Customize points / tree')+'</button><button type="button" data-act="bpspec" data-k="">'+L('不使用专长','No specialization')+'</button>'+(custom?'<button type="button" data-build-spec-default>'+L('恢复默认模式','Restore default mode')+'</button>':'')+'<span>'+L(custom?'已使用自定义加点':'武器加成便捷模式：七类默认 +15%',custom?'Custom allocation active':'Convenience bonus: all seven weapon classes +15%')+'</span></div>';
}
function buildSpecDraw(){
 const d=BUILD_SPEC_DRAFT,s=buildSpecData(),ns=buildSpecNodes(s),chosen=ns.find(n=>n.key===d.node)||ns.find(n=>!n.hidden),level=chosen.levels[Math.max(0,(d.ranks[chosen.key]||0)-1)];
 const msg=buildSpecValidate(s,d.ranks),spent=buildSpecSpent(s,d.ranks);
 const tree=ns.filter(n=>!n.hidden);
 const byKey=new Map(ns.flatMap(n=>n.levels.map(l=>[l.key,n])));
 const lines=tree.flatMap(n=>[...new Set(n.levels.flatMap(l=>l.requires||[]).map(k=>byKey.get(k)).filter(p=>p&&p!==n))].map(p=>`<line x1="${49+n.column*100}" y1="${48+n.row*87}" x2="${49+p.column*100}" y2="${48+p.row*87}"/>`)).join('');
 const dialog=document.getElementById('build-spec-dialog');
 dialog.innerHTML=`<header><div><h2>${esc(L(s.zh,s.en))} · ${L('自定义加点','Custom allocation')}</h2><p>${spent} / ${BUILD_SPEC_BUDGET} ${L('点','points')}</p></div><button type="button" data-build-spec-close aria-label="${L('关闭','Close')}">×</button></header>
 <div class="build-spec-editor"><div class="build-spec-tree-scroll"><div class="build-spec-tree"><svg viewBox="0 0 820 554" aria-hidden="true">${lines}</svg>${tree.map(n=>`<button type="button" data-build-spec-node="${esc(n.key)}" aria-pressed="${d.node===n.key}" style="left:${49+n.column*100}px;top:${48+n.row*87}px" title="${esc(L(n.levels.at(-1).zh,n.levels.at(-1).en))}">${buildSpecIcon(n.levels.at(-1))}<span>${d.ranks[n.key]||0}/${n.levels.length}</span></button>`).join('')}</div></div>
 <section class="build-spec-node"><h3>${esc(L(level.zh,level.en))}</h3><p>${esc(L(level.description_zh,level.description_en))}</p><label>${L('分配档位','Allocated rank')}<select data-build-spec-rank>${Array.from({length:chosen.levels.length+1},(_,i)=>`<option value="${i}"${i===(d.ranks[chosen.key]||0)?' selected':''}>${i} · ${chosen.levels.slice(0,i).reduce((v,l)=>v+(+l.cost||0),0)} ${L('点','points')}</option>`).join('')}</select></label><p>${L('节点说明包含游戏内触发效果；面板统计计算已支持的属性。','Descriptions include in-game triggers; panel totals include supported attributes.')}</p><p role="status">${esc(d.error||msg)}</p></section></div>
 <footer><button type="button" data-build-spec-reset>${L('恢复默认满加点','Restore full allocation')}</button><button type="button" data-build-spec-clear>${L('清空点数','Clear points')}</button><button type="button" data-build-spec-apply${msg?' disabled':''}>${L('应用到配装','Apply to build')}</button></footer>`;
}
function buildSpecInit(){
 const direct=document.createElement('section');direct.id='build-spec-direct';document.getElementById('build-quick').after(direct);
 const dialog=document.createElement('dialog');dialog.id='build-spec-dialog';document.body.append(dialog);
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-build-spec-edit]')){
    /* 图谱要用 nodes ⇒ 先把当前专长那份分片取回来再开（取不到就不开，别开一个空树） */
    buildSpecEnsure(state.bp.spec).then(()=>{
      const s=buildSpecData();if(!s?.nodes?.length)return;
      BUILD_SPEC_DRAFT={ranks:{...buildSpecRanks(s)},node:buildSpecNodes(s).find(n=>!n.hidden).key};
      buildSpecDraw();dialog.showModal();
    });
    return;
  }
  if(e.target.closest('[data-build-spec-close]'))dialog.close();
  if(e.target.closest('[data-build-spec-default]')){delete state.bp.specAlloc[buildSpecData().key];renderAll();}
  const node=e.target.closest('[data-build-spec-node]');if(node){BUILD_SPEC_DRAFT.node=node.dataset.buildSpecNode;BUILD_SPEC_DRAFT.error='';buildSpecDraw();}
  if(e.target.closest('[data-build-spec-reset]')){BUILD_SPEC_DRAFT.ranks=buildSpecDefault(buildSpecData());BUILD_SPEC_DRAFT.error='';buildSpecDraw();}
  if(e.target.closest('[data-build-spec-clear]')){BUILD_SPEC_DRAFT.ranks=Object.fromEntries(buildSpecNodes(buildSpecData()).map(n=>[n.key,n.levels.every(l=>!l.cost)&&n.levels.every(l=>!l.requires?.length)?n.levels.length:0]));BUILD_SPEC_DRAFT.error='';buildSpecDraw();}
  if(e.target.closest('[data-build-spec-apply]')){if(buildSpecValidate(buildSpecData(),BUILD_SPEC_DRAFT.ranks))return;state.bp.specAlloc={...state.bp.specAlloc,[buildSpecData().key]:{...BUILD_SPEC_DRAFT.ranks}};dialog.close();renderAll();}
 });
 dialog.addEventListener('change',e=>{
  if(!e.target.matches('[data-build-spec-rank]'))return;
  const ranks={...BUILD_SPEC_DRAFT.ranks,[BUILD_SPEC_DRAFT.node]:+e.target.value},err=buildSpecValidate(buildSpecData(),ranks);
  if(err)BUILD_SPEC_DRAFT.error=err;else BUILD_SPEC_DRAFT.ranks=ranks,BUILD_SPEC_DRAFT.error='';buildSpecDraw();
 });
 /* 先取索引（161 KB）出标签栏，再取**当前专长**那份节点（~500 KB）—— 不再拉整包 3.0 MB。
    索引为空也算失败（与原来 `if(!data.specializations?.length)` 同口径）。 */
 fetchJSON('/assets/db/spec/index.json').then(data=>{
  if(!Array.isArray(data?.specializations)||!data.specializations.length)throw new Error('Empty spec index');
  BUILD_SPEC_DATA=data;buildSpecToolbar();
  return buildSpecEnsure(state.bp.spec);
 }).then(()=>{buildSpecToolbar();recalc();}).catch(()=>{direct.innerHTML='<p>'+L('专长图谱暂时加载失败，请刷新重试。','Specialization tree could not load. Please refresh.')+'</p>';});
 buildSpecToolbar();
}
