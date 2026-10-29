/* 配装器页 · 战斗参数层：与 BuildTool「更多参数 / 专长加成及手表 / 装甲目标设置」对位的参数表 + 面板渲染。
   数据口径（BuildTool 出处 / 我们自己的数据）一律写在 docs/DESIGN-GEARDB.md §11，界面上只出现标签与数值。 */
/* ── 专精（6 个）──────────────────────────────────────────────────────────────
   键 = 数据侧名称，**不是位置**：BuildTool 的 SpecializationList 顺序与 CalculateBuild 的
   case 编号并不一致（列表 [烈焰之墙,技师,重机枪手,生存专家,爆破专家,精准射手] vs 加成
   case0 无 / case1 技能 / case2 击杀回甲 / case3 精英防御 / case4 爆裂物+燃烧抗性 / case5 稳定+爆头），
   逐条对不上；这里按**加成语义**贴名字，并只采用能一一对应的四项（技师 / 生存专家 / 爆破专家 / 精准射手），
   其余两项（烈焰之墙 / 重机枪手）有加成语义分歧，一律按「无加成」如实呈现，绝不错贴。 */
const BP_SPEC_LIST=[
  {id:'',zh:'无',en:'None'},
  {id:'technician',zh:'技师',en:'Technician'},
  {id:'survivalist',zh:'生存专家',en:'Survivalist'},
  {id:'demolitionist',zh:'爆破专家',en:'Demolitionist'},
  {id:'sharpshooter',zh:'精准射手',en:'Sharpshooter'},
  {id:'firewall',zh:'烈焰之墙',en:'Firewall'},
  {id:'gunner',zh:'重机枪手',en:'Gunner'},
];
/* 专精加成明细（zh 名用于面板副标题；数值 = engine.js 的 BP_SPEC 现算，不在这里写数） */
const BP_SPEC_EFF={technician:['技能分阶 +1'],
  gunner:['击杀回甲 +10%'],survivalist:['精英防御 +10%'],demolitionist:['爆裂物伤害 +10%','燃烧抗性 +20%'],
  sharpshooter:['稳定度 +15%','步枪 / 射手步枪 爆头伤 +15%']};
/* ── 武器 7 类：专长 15% 的开关名 + 引擎类型序号（0..6 与 TD2Calc 的 TYPE_IDX 同序） ── */
const BP_WT=[['ar','突击步枪','Assault Rifle'],['smg','冲锋枪','SMG'],['shotgun','霰弹枪','Shotgun'],
  ['rifle','步枪','Rifle'],['mmr','射手步枪','MMR'],['lmg','轻机枪','LMG'],['pistol','手枪','Pistol']];
/* ── 额外参数 12 项（BuildTool 「手动输入补偿」；键 = engine.js BP_EXTRA 的键） ── */
const BP_EXTRA_FIELDS=[['chc','暴击几率','CHC'],['chd','暴击伤害','CHD'],['hsd','爆头伤害','HSD'],
  ['damage','所有武器伤害','All Weapon DMG'],['totalDamage','总武器伤害','Total Weapon DMG'],
  ['amplify','独立增伤','Amplify DMG'],['reloadSpeed','装弹速度','Reload Speed'],
  ['rateOfFire','射速','Rate of Fire'],['outCoverDamage','掩体外伤害','Out-of-cover DMG'],
  ['armorDamage','装甲伤害','Armor DMG'],['healthDamage','生命伤害','Health DMG'],
  ['magazineSize','弹匣容量','Magazine Size']];
/* ── 16 格：命中形态 4 × 目标装甲状态 4（结果面板那张矩阵的行列，与 BuildTool 的
   Result 命中四族（Hit / Critical_Hit / Headshot_Hit / CriticalHeadshot_Hit）逐格同名） ── */
const BP_HIT4=[['Hit',['命中','Hit']],['Critical_Hit',['暴击','Crit']],
  ['Headshot_Hit',['爆头','Headshot']],['CriticalHeadshot_Hit',['暴击爆头','Crit+Head']]];
const BP_ARM4=[['','生命值','Health'],['_Cover','掩体外生命值','Health out of cover'],
  ['_Armor','装甲','Armor'],['_ArmorCover','掩体外装甲','Armor out of cover']];
/* ── 装甲目标设置：坐标轴**全部取自数据文件自己的轴**（`axis/order/labels`），页面不另写一套常量 ──
   为什么必须这样：系数表按官方模型出表，它的第 1 维是**兵种基础值档**（progression）、难度 6 档、
   人数倍率单独一块；BuildTool 那套「红/紫/金 × 6 难度 + 三武器系数」是**另一套轴**，硬把它的常量
   贴到我们的表上 = 编语义（数据换了页面还照着旧坐标读数）。表缺文件 ⇒ 整块不出结果，不拿 0 顶替。 */
const BP_ESC_N=11;                        // 恶化 T0..T10（无表时的退化档数；有表按表长）
let ENEMY_COEFFS=null;                    // 官方系数表（web/assets/db/enemy_coeffs.json，缺文件 ⇒ null，面板不出结果）
function enemyCoeffs(){return ENEMY_COEFFS;}
async function loadEnemyCoeffs(){
  /* 不传 cache（同 build.app.js 的 geardb）：`no-store` 会连 304 一起扔掉，
     每次进配装页都重下这 91 KB。新鲜度由托管侧的响应头负责 —— nginx 对
     `/assets/db/*.json` 整类发 `no-cache` + ETag，没变就回 304。 */
  try{ENEMY_COEFFS=await fetchJSON('/assets/db/enemy_coeffs.json');}catch(e){ENEMY_COEFFS=null;}
  return ENEMY_COEFFS;
}
/* 方形块取值：块内是 `{axis,shape,order,labels,matrix,by_*}`，按**轴名字**定位维度、按序号取 `matrix`。
   ⚠️ 2026-09-14 修（真机实测 `enemyTarget()` 恒 null）：这里原来读的是 `block.vals` —— **那个键从来没存在过**
   （生成器 `scripts/datamine/gen_enemy_coeffs.py` 从第一版就用 `matrix`/`by_tier`/`by_role`/`health_mult`/`armor_mult`；
   `git log --all -- web/assets/db/enemy_coeffs.json` 无历史、`grep vals` 在生成器里 0 处）
   ⇒ 装甲目标那一整块**从来没出过结果**，而且**静默**（`build.app.js` 的 try/catch 兜住，页面不报错）。
   真实结构：`pve.health.axis=["progression","difficulty"] · matrix[4][6]`；
   `pve.armor.axis=["role","progression","difficulty"] · matrix[3][4][6]`。
   块缺失 / 轴名对不上 / 越界一律 null（页面据此不显示，而不是拿 0 顶替）。
   ⚠️ 下标一律先 `Number()`：`data-k` 经 `setAttribute` 会字符串化，而 `Number.isInteger("1")` 为假 ⇒ 静默判死。 */
function coeffAt(block,idxByAxis){
  if(!block||!Array.isArray(block.axis)||!Array.isArray(block.matrix)||!idxByAxis)return null;
  let v=block.matrix;
  for(const ax of block.axis){
    const i=Number(idxByAxis[ax]);
    if(!Number.isInteger(i)||!Array.isArray(v)||i<0||i>=v.length)return null;
    v=v[i];
  }
  return (typeof v==='number'&&isFinite(v))?v:null;
}
/* 人数倍率：`pve.players` = `{order:[1,2,3,4], labels, health_mult[4], armor_mult:{Veteran|Elite|Named:[4]}}`
   —— **血 / 甲各有各的表**（`armor_mult` 还带 role 维，官方「紫甲 / 金甲 / 具名甲各自斜率不同」），
   所以不能像原来那样用一个 `t` 同时乘两列。
   入参 `count` = **人数本身**（1..4，与 `state.bp.enemy.players` 同义）；位次是内部派生量（`order.indexOf`），不外露。 */
function playersMult(which,count,role){
  const p=ENEMY_COEFFS&&ENEMY_COEFFS.pve&&ENEMY_COEFFS.pve.players;
  if(!p)return null;
  const ord=Array.isArray(p.order)?p.order.map(Number):[];
  let j=ord.indexOf(Number(count));if(j<0)j=0;
  if(which==='health'){const a=p.health_mult,v=Array.isArray(a)?a[j]:null;return isFinite(v)?v:null;}
  const m=p.armor_mult||{},row=m[role]||m.Veteran;
  const v=Array.isArray(row)?row[j]:null;
  return isFinite(v)?v:null;
}
/* 面板用的轴：返回 `[{v,label}]`（v = 该维在表里的下标；`players` 那类 `order` 是人数本身 ⇒ v=人数）。
   数据块里可能是 `labels`（人话）或只有 `order`（内部代号）⇒ **只印人话**：
   有 labels 用 labels，否则退回调用方给的兜底标签，**绝不把 `npc_weak_progression` 这种内部串印到界面上**（UI 硬规则①）。
   ⚠️ 档数一律**现算**：`matrix` 第一维 → `vals` → `order`（2026-09-14 修：原来只看 `vals`/`order`，
   而 `pve.health` 没有 `vals` ⇒ 颜色/兵种档那排会退化成 0 格）。 */
function enemyAxis(name,fallback){
  const c=ENEMY_COEFFS,b=(c&&c.pve&&c.pve[name])||(c&&c[name])||null;
  const n=(b&&Array.isArray(b.matrix))?b.matrix.length
        :((b&&Array.isArray(b.vals))?b.vals.length:((b&&Array.isArray(b.order))?b.order.length:0));
  const lab=(b&&Array.isArray(b.labels))?b.labels:null;
  const fb=Array.isArray(fallback)?fallback:[];
  const cnt=n||fb.length;
  return Array.from({length:cnt},(_,i)=>({v:axisValue(b,i),
    label:(lab&&typeof lab[i]==='string')?lab[i]:(fb[i]!=null?fb[i]:String(i+1))}));
}
/* 轴第 i 档对应的「值」（players 这类 order 是 [1,2,3,4] 而不是下标） */
function axisValue(b,i){
  if(!b)return i;
  if(Array.isArray(b.order)&&(typeof b.order[i]==='number'))return b.order[i];
  return i;
}
/* 当前目标设置的 血量 / 装甲（官方系数 × **各自**的人数倍率；取不到 ⇒ null）
   ⚠️ `role` 这一维官方是 `[Veteran, Elite, Named]`，而界面只有「兵种基础值档」四条（`progression`）⇒
   这里**钉死 role=Veteran(0)**：红名/杂兵在官方模型里 `Armor=0`（见 `enemy_coeffs.json` 的 `meta.gaps`），
   「红名装甲」这一档官方压根不存在，不许编一档出来。 */
function enemyTarget(){
  const c=ENEMY_COEFFS,e=state.bp&&state.bp.enemy;if(!c||!c.pve||!e)return null;
  const role='Veteran';
  const i={progression:Number(e.progression),difficulty:Number(e.difficulty),role:0,players:Number(e.players)};
  const hp=coeffAt(c.pve.health,i);
  const ar=coeffAt(c.pve.armor,i);
  const th=playersMult('health',e.players,role);
  const ta=playersMult('armor',e.players,role);
  const tiers=c.escalation&&c.escalation.tiers;
  const tier=Array.isArray(tiers)?tiers[e.escalation]:null;
  /* ⚠️ 变量名不许叫 esc（会遮蔽 base.js 的全局转义助手 esc()）：这里用 escT */
  const escT=tier?{hp:Number(tier.hp),armor:Number(tier.armor)}:null;
  const escv=(escT&&isFinite(escT.hp)&&isFinite(escT.armor))?escT:null;
  /* ⚠️ 恶化档必须**乘进**目标血量与装甲：这里只把它挂在返回值 `.esc` 上，全仓没有任何调用点读它 ⇒
     「恶化 T1…T10」那一排 chip 选了等于没选（2026-10-15 实测 T0 与 T3 的「目标血量 796,347 · 装甲 995,433 ·
     15 发击杀」一字不差，而官方 `enemy_coeffs.json` 的 T3 是 hp/armor ×2.5）。用户在「几发打死」上做的
     决策全部按 T0 算 ⇒ 这是假数字，不是"少个功能"。`.esc` 仍然带出去，供面板如实标注倍率。 */
  const mult=(v,e)=>(v==null||!isFinite(v))?null:(e==null?v:v*e);
  if(hp==null&&ar==null)return null;
  return {hp:mult(mult(hp,th),escv&&escv.hp),armor:mult(mult(ar,ta),escv&&escv.armor),esc:escv};
}
/* 打死目标需要几发（用结果里的单发值现算；除数为 0 / 缺失 ⇒ null） */
function shotsToKill(total,bullet){
  if(total==null||!(bullet>0))return null;
  return Math.ceil(total/bullet);
}
/* ── 参数面板的渲染（战斗条件卡里那几块） ─────────────────────────────────── */
/* ⚠️ 这些控件全部是可点的：必须是 `<button>`（能 Tab 到、回车/空格生效），不能是 `<span>`。
   `aria-pressed` 让「哪一颗是当前档」在读屏与纯黑白显示下也成立（选中不只靠颜色）。 */
function bpChip(act,k,on,zh,en,extra){
  return '<button type="button" class="chip'+(on?' on':'')+'" data-act="'+act+'" data-k="'+esc(k)+'"'+
    ' aria-pressed="'+(on?'true':'false')+'"'+(extra||'')+'>'+esc(L(zh,en))+'</button>';
}
function renderParams(){
  buildSpecToolbar();
  const bp=state.bp;
  /* 专精：单行文字 chip（与全站筛选条同款，选中态 accent）；title 里给该项的加成名 */
  const box=$('#bp_spec');
  if(box)box.innerHTML=BP_SPEC_LIST.map(s=>{
    const eff=BP_SPEC_EFF[s.id];
    return bpChip('bpspec',s.id,bp.spec===s.id,s.zh,s.en,eff?' title="'+esc(eff.join(' · '))+'"':'');
  }).join('');
  const hint=$('#bp_spec_eff');
  if(hint){
    const en={technician:'Skill Tier +1',survivalist:'Protection from Elites +10%',gunner:'Armor on Kill +10%',demolitionist:'Explosive Damage +10% · Burn Resistance +20%',sharpshooter:'Stability +15% · Rifle/MMR Headshot Damage +15%'};
    hint.innerHTML=esc(L((BP_SPEC_EFF[bp.spec]||[]).join(' · '),en[bp.spec]||''))+(bp.spec==='technician'?'<br>'+bpChip('bptech','damage',bp.technicianBranch!=='healing','技能伤害 +10%','Skill Damage +10%')+bpChip('bptech','healing',bp.technicianBranch==='healing','技能修复 +10%','Skill Repair +10%'):'');
  }
  const px=$('#bp_skill_exp');if(px)px.innerHTML=[0,1].map(i=>`<label class="pf"><span>${i?'E':'Q'} ${esc(L('技能精通','Skill expertise'))}</span><input type="number" min="0" max="30" step="1" data-act="bpexpskill" data-i="${i}" value="${(bp.skillExpertise||[])[i]||0}"></label>`).join('')+bpChip('bpovercharge','',!!bp.overcharge,'超载已触发（手动条件）','Overcharge triggered (manual condition)');
  /* 专长 15%：七类武器各一个开关 */
  const sp=$('#bp_sp');
  if(sp)sp.innerHTML=BP_WT.map(([k,zh,en])=>bpChip('bpsp',k,!!bp.sp[k],zh,en)).join('');
  /* 精通：两条 0..30（数字不加粗，靠字号与颜色分层次） */
  const we=$('#bp_wexp'),ge=$('#bp_gexp');
  if(we){we.value=bp.weaponExpertise;we.max=TD2Calc.MAX_EXPERTISE;}
  if(ge){ge.value=bp.gearExpertise;ge.max=TD2Calc.MAX_EXPERTISE;}
  const wel=$('#bp_wexp_v'),gel=$('#bp_gexp_v');
  if(wel)wel.textContent=bp.weaponExpertise;
  if(gel)gel.textContent=bp.gearExpertise;
  /* 额外参数 12 项 */
  const ex=$('#bp_extras');
  if(ex)ex.innerHTML=BP_EXTRA_FIELDS.map(([k,zh,en])=>
    `<label class="pf"><span>${esc(L(zh,en))}</span><input type="number" step="any" data-act="bpext" data-k="${k}" value="${bp.extras[k]}"></label>`).join('');
  /* 装备天赋档位（猎头者 / 土狼面具…）：**只对已在装的那件出选项**，没在装就整段不渲染。
     每个 chip 的 title 给该档实际喂进引擎的数值（现算），点击只改 `state.bp.tiers`，公式层零改动。 */
  const tl=$('#l_btier'),tt=$('#bp_tier');
  const fams=talTierInPlay();
  /* 标题常显；档位 chip 只在「有族在玩」时才多出来。
     ⚠️ 2026-09-14：原来这里还挂了一个 `#bp_gtal` 的**装备天赋手选下拉**（列 `kind==='slot'` 的 102 条）。
     它与本轮新做的「卡片上的件天赋选择器」（`build.gtal.js` + `data-act="gtal"`）是**同一个概念的第二套入口**，
     而且那个下拉只被 `talTierInPlay()` 读——选别的天赋一个数都不动（等于假控件）。按硬规则②（同一概念不出现两次）
     已删除；装备天赋一律走卡片上的那个入口（背包 / 胸甲，池 = 参考工具 `AppData.TalentData[Num-2]`）。 */
  /* 标题跟着**有没有档位在玩**走：族为空时 `#bp_tier` 高度 0，光留一条标题就是空壳。 */
  if(tl)tl.style.display=(tt&&fams.length)?'':'none';
  if(tt)tt.innerHTML=fams.map(fam=>{
    const t=talTierTalent(fam),nm=t?(t.zh||t.en||''):'';
    /* 公式被挡的族整族不进引擎：不画档位按钮，也不挂 data-act，避免点了像可选、DPS 却不变。 */
    if(combatBlocked(fam.family))return '<span class="tal-state">'+esc([nm,L('待核验 · 未计入','Needs validation · not counted')].filter(Boolean).join(' '))+'</span>';
    const rows=talTierRows(fam,!!bp.pvp),cur=bp.tiers[fam.id]||(rows.find(x=>x.id!=='off'&&x.rows&&x.rows.length)||{}).id||'off';
    const chips=rows.map(b=>{
      const band=arr(fam.bands).find(z=>z.id===b.id)||{};
      const d=talTierBandDist(fam,band,!!bp.pvp);
      const num=v=>(v==null?'—':fmtN(v));
      const dTxt=d?((d[0]===''?L('0 米','0 m'):num(d[0])+' '+L('米','m'))
        +' – '+(d[1]===''?L('∞','∞'):num(d[1])+' '+L('米','m'))):'';
      const eff=(b.rows||[]).map(r=>num(r.val)+'%').join(' + ');
      const tip=[dTxt,eff].filter(Boolean).join(' · ');
      return bpChip('bptier',fam.id+':'+b.id,cur===b.id,L(band.zh,band.en),band.en||'',
        (tip?' title="'+esc((nm?nm+' · ':'')+tip)+'"':'')+(b.rows===null?' data-na="1"':''));
    }).join('');
    return chips;
  }).join('');
  /* **随机词条天赋**原来在这里有一个手选入口（`#bp_gtal`）—— 已删除，理由见上：
     它是「装备天赋」的第二个入口，且只影响档位层、选别的天赋不改任何数字。
     现在一律走卡片上的 `data-act="gtal"`（背包 / 胸甲，池与值见 `build.gtal.js`）。 */
  /* 装甲目标设置：坐标轴取自系数表自己的轴（`labels`/`order`），取不到就退化成通用标签 */
  const ec=$('#bp_ecolor'),ed=$('#bp_ediff'),et=$('#bp_eteam'),ee=$('#bp_eesc');
  const pl=(sel,c)=>'<button type="button" class="chip'+(c.on?' on':'')+'" data-act="bpe" data-k="'+esc(sel+':'+c.v)+
    '" aria-pressed="'+(c.on?'true':'false')+'">'+esc(c.label)+'</button>';
  const chips=(sel,list,cur)=>list.map(x=>pl(sel,{v:x.v,on:cur===x.v,label:x.label})).join('');
  /* 颜色/兵种档那排：轴取自 `pve.health`（`labels` = 弱/标准/精锐/重装，与 `matrix` 第一维同序），
     `c.types` 只当标签兜底（官方 `labels` 缺了才用）—— 实测这一排 4 格、标签正确，别再动。 */
  if(ec)ec.innerHTML=chips('progression',
    enemyAxis('health',(ENEMY_COEFFS&&ENEMY_COEFFS.types)||[]),bp.enemy.progression);
  if(ed){
    const c=ENEMY_COEFFS;
    /* ⚠️ 难度那排**不许**借 `enemyAxis('health', …)`：那读的是 `pve.health` 的 `order`/`labels`
       （4 条兵种基础值档）⇒ 2026-09-14 真机实测渲染出「弱/标准/精锐/重装」4 格 —— **难度选择器挂着
       兵种档的标签、还少 2 档**。难度名字只在顶层 `c.difficulties`（6 条），直接用它现算。 */
    const fb=(c&&Array.isArray(c.difficulties)&&c.difficulties.length)?c.difficulties
      :['一般','困难','挑战','英雄','传奇','大师'];
    ed.innerHTML=chips('difficulty',fb.map((t,i)=>({v:i,label:t})),bp.enemy.difficulty);
  }
  if(et)et.innerHTML=chips('players',enemyAxis('players',['1 人','2 人','3 人','4 人']),bp.enemy.players);
  if(ee){
    const tiers=(ENEMY_COEFFS&&ENEMY_COEFFS.escalation&&ENEMY_COEFFS.escalation.tiers)||[];
    const n=tiers.length||BP_ESC_N;
    ee.innerHTML=chips('escalation',Array.from({length:n},(_,i)=>{
      const t=tiers[i];
      /* 兜底标签也必须是**人话**：`T0…T10` 是系数表内部的档位代号，不许直接印到界面上（UI 硬规则①）。 */
      return {v:i,label:(t&&(L(t.zh,t.en)||t.zh))||L('恶化 '+i,'Escalation '+i)};
    }),bp.enemy.escalation);
  }
}
/* 参数面板上的「本页参数」徽标行：只写名称，不解释过程（UI 硬规则①） */
function bpRowHtml(r){
  const bp=state.bp,w=state.wactive>=0?arr(DB.weapons)[state.wslots[state.wactive]]:null;
  const t=[];
  if(bp.watch)t.push(L('手表·一千级','Watch 1000'));
  if(bp.spec&&BP_SPEC_EFF[bp.spec])t.push(L(BP_SPEC_LIST.find(s=>s.id===bp.spec).zh,'')||'');
  if(w&&r&&r.specHit)t.push(L('专长 15%','Specialization 15%'));
  /* 精通徽标读**引擎实际吃进去的值**（`engine.js:319/430` 回传 `r.weaponExpertise` / `r.gearExpertise`），
     不读滑杆原值：手撑式榴弹发射器、猛禽、弩类三把枪引擎把武器精通显式清零（`engine.js:310`），
     照原值印就变成「chip 写 30、实按 0 算」（实测 M32 上 AllWeaponDamage 10 vs 换普通枪 40）。 */
  const we=(r&&typeof r.weaponExpertise==='number')?r.weaponExpertise:bp.weaponExpertise;
  const ge=(r&&typeof r.gearExpertise==='number')?r.gearExpertise:bp.gearExpertise;
  if(we)t.push(L('武器精通','Weapon expertise')+' '+we);
  if(ge)t.push(L('防具精通','Gear expertise')+' '+ge);
  return t.filter(Boolean).map(x=>`<span class="bpbadge">${esc(x)}</span>`).join('');
}
