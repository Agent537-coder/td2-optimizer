/* 配装器页 · 视图层：武器 3 槽 / 装备 6 格 / 技能 Q·E / 天赋·品牌·微调 渲染 + 通用选择器弹窗 */
/* ── 武器天赋的可用口径（用户第 112 轮：「肯定只能选择对应类型的可用普通天赋」）─────────
   官方 `talents_official[].guns` = ['common', 'assaultrifle', …]，与 `weapons[].cls` **同一套字面量**
   （`common` = 88 条标为通用武器天赋，其余按枪种）。所以第一层过滤 = `guns` 含 `common` 或含该枪的 `cls`。
   官方表里带 `guns` 的只有 166 条，其余 685 条压根不是武器天赋（装备组 / 专精 / 手表 / 基地升级…）
   —— 原来没过滤，把 851 条全列出来了。

   ⚠️ 第二层（用户第 113 轮：「疾速模式不是具名迅步的天赋吗，为什么在通用里？」）：官方把 46 条
   **完美版**（`*_perfect`）也标成 `common`，但完美版只长在具名枪上、普通枪刷不出；
   `疾速模式`（`talent_weapon_sportmode_ui`）更是某把具名枪的专属、连基础版都没有。
   判据**运行时现算**（`namedOnlyTalentKeys()`）：一条天赋的代号被某把武器内嵌为 `talent`，
   且**没有同词干的基础版也在通用池里** ⇒ 判为「具名专属」，不进通用候选。
   `myPresetTalent`（阶段 21 已挂到件上）就是这条判据的数据源，不写死名单。 */
/* 本文件**只许有下面那一个** `weaponEmbedTalents()`：原来这里还有一份返回
   `key → [武器名]` 的旧实现，同名函数声明后写覆盖前写 ⇒ 它从来没跑到过（已删）。 */
/* 「官方标了 common、但普通枪其实刷不出」的代号集合，**运行时现算**：
   ① 完美版 `*_perfect`：只要官方池里另有同词干的基础版 ⇒ 这条是基础版的加强版（只长在具名枪上）；
   ② 带 `_ui` 后缀且被某把武器内嵌（如 疾速模式 ↔ 迅步）：某把枪的专属 UI 条目，连基础版都没有。
   其余被具名枪内嵌的**基础版**照旧算通用（实证 10 条，如 迅捷快手 ← 毒刺，普通枪也能刷到）。 */
function namedOnlyTalentKeys(){
  const emb=weaponEmbedTalents();
  const out={};
  arr(DB.talents_official).forEach(t=>{
    if(!t)return;
    const k=t.key||t.code;
    if(!k||!emb[k])return;                          // 没被任何武器内嵌 ⇒ 不是专属
    if(/_perfect$/.test(k)){ out[k]=1; return; }     // 完美版一律不进通用候选
    if(/_ui$/.test(k)){ out[k]=1; return; }          // 专属 UI 条目
  });
  return out;
}
function slotWeaponCls(slot){
  const w=arr(DB.weapons)[state.wslots[slot]];
  return w?(w.cls||''):'';
}
/* 官方占位名（`[AR Archetype Talent 4 (PH)]` / `[Chest Talent 1 (PH)]` 这种方括号串）——
   官方测试行，不该出现在「挑天赋」的候选里（资料库那边的 `talentsShown()` 同一口径）。 */
function talentPhName(t){return /^[\[\(]/.test(String((t&&(t.en||t.zh||t.name))||''));}
/* 武器上内嵌的天赋 key（奇特天赋 + 具名件的专属天赋）：这些**不是玩家能刷在别的枪上的天赋**，
   只能长在它自己那把枪上 ⇒ 普通枪的候选里必须剔掉（实测 AR 的 14 条里 12 条是这类）。
   ⚠️ 不能只信 `talents_official[].kind==='exotic'`：`warlock_talent_exotic_assault_rifle_mk3`（王牌猎人）
   这类官方 `kind` 是「其它」、只以内嵌指针出现（踩过：它会被当成普通枪的候选）。 */
let WEAPON_EMBED_TALENTS=null;
function weaponEmbedTalents(){
  if(WEAPON_EMBED_TALENTS)return WEAPON_EMBED_TALENTS;
  const m={};
  arr(DB.weapons).forEach(w=>{const tt=w&&w.talent;if(tt&&tt.key)m[tt.key]=1;});
  arr(DB.talents_official).forEach(t=>{if(t&&t.kind==='exotic'&&t.key)m[t.key]=1;});
  WEAPON_EMBED_TALENTS=m;return m;
}
/* 「完美版」= key 里带 `_perfect` 的那一条（官方写法固定，实测 `common` 88 条里 40 条如此）。
   它是**具名件自带**的加强版，普通枪刷不到 ⇒ 默认不进候选；要看得见就开「含完美版」那一颗 chip。 */
function talentIsPerfect(t){return /_perfect/.test(String((t&&t.key)||''));}
/* 该枪能刷到的天赋候选（口径 = 枪型 + 稀有度），用户第 4 轮：「一把普通的突击步枪，那就只能选择
   突击步枪的普通天赋」。
   ① 枪型：官方 `guns[]` 含该枪 `cls` 或含 `common`（166 条有 `guns`，其余 685 条压根不是武器天赋）；
   ② 稀有度：奇特枪只能被**内嵌在枪上**的那条天赋用（`weaponEmbedTalents()`）；普通 / 具名枪挑**普通版**，
      
      「完美版」是具名件自带的（`_perfect`），不进普通枪的候选；
   ③ 占位名（`[AR Archetype Talent 4 (PH)]`）一律不列。 */
function talentUsableBy(t,cls){
  const g=arr(t&&t.guns);
  if(!g.length)return false;
  if(cls&&g.indexOf('common')<0&&g.indexOf(cls)<0)return false;
  if(!cls&&g.indexOf('common')<0)return false;
  if(talentPhName(t))return false;                                  // 官方占位 / 测试行
  const k=String((t&&t.key)||'');
  if(weaponEmbedTalents()[k])return false;                          // 奇特 / 具名件专属（只能长在它自己那把枪上）
  if(namedOnlyTalentKeys()[k])return false;
  return true;
}
/* 「完美版」在普通枪的候选里再剔一层：同名的普通版存在时，完美版只是它的加强版，
   普通枪刷不到（实测 `common` 88 条里 40 条是完美版）。`state.tperfect` 打开时全都列出来。 */
function talentPickerPool(slot){
  const cls=slotWeaponCls(slot);
  const all=TALENTS.map((t,i)=>[t,i]).filter(([t])=>talentUsableBy(t,cls));
  if(state.tperfect)return all;
  const plainRow=all.filter(([t])=>!talentIsPerfect(t));
  return plainRow.length?plainRow:all;
}
function talentRowsFor(slot){
  /* 搜索真值统一取弹窗自己的 `state.dlg.q`（`#dlgq` 输入即写它、`renderDlgList` 即读它），
     与武器/装备/配件分支同一口径。旧的全局 `state.tq` 随 `#tq` 卡片删除后已无人写入，
     以前这里误读 `state.tq` ⇒ 天赋弹窗搜索框输入被静默忽略（2026-10-29 修复）。 */
  const q=((state.dlg&&state.dlg.q)||'').trim().toLowerCase();
  const rows=[];
  talentPickerPool(slot).forEach(([t,i])=>{
    if(state.tkind&&(t.kind_zh||'')!==state.tkind)return;
    if(q&&!((t.zh||'')+(t.en||'')+(t.name||'')+(t.kind_zh||'')+(t.desc_zh||'')+(t.desc_en||'')).toLowerCase().includes(q))return;
    rows.push([t,i]);
  });
  return rows;
}

/* 天赋图标：官方 `talents_official[].icon`（阶段 9 从官方图集裁帧得到）。取不到就返回空串 —— 
   **不占位、不破图**（用点阵兜底会把「缺图」当成「有图」，用户第 190 轮就是在追问这件事）。 */
function talIcon(t,cls){
  if(!t||!t.icon)return '';
  return iconImg(t.icon,cls||'tic');
}
/* ── 武器卡上的插槽区（官方四插槽：瞄具 / 枪口 / 握把 / 弹匣）──────────────────────────
   **取代**原来那行只读的 `attachHtml(w)`（它把四个槽一律画成一排「枪口·5.56」文本）：
   ① 官方逐把给的插槽数不等（1–4），原来四槽恒画 ⇒ 霰弹枪 / 1886 上多出根本不存在的槽；
   ② 它只显示官方**默认**安装位名，用户永远改不了，而 `DB.mods` 里 379 件配件一直没进过引擎。
   现在每槽一行：图标 + 槽名 + 当前那件（+ 它的属性值）；可换的槽点开官方候选，固定件标「固定」。
   ⚠️ 图标直接借 `WATT` 的官方 `weaponmod1..4.png`（原来是按槽位画的一排通用图，正好一一对应）。 */
function wmodBlock(w,weaponSlot){
  const rows=wmModel(w,weaponSlot);
  const body=WATT.map(meta=>{
    const sm=rows.find(row=>row.code===meta[0]);
    if(!sm)return `<div class="wmod-row unavailable" aria-label="${esc(wmSlotLbl(meta[0])+' · '+L('无插槽','No slot'))}"><span class="wmod-ic">${iconImg(meta[1],'wmic')}</span><span class="wmod-k">${esc(wmSlotLbl(meta[0]))}</span><span class="wmod-a">${esc(L('无','None'))}</span></div>`;
    /* 路径原来是 `/assets/img/`（该目录没有这批图 ⇒ 恒 404、槽位图标从不显示）；
       且白线条图在浅色主题下要反色 ⇒ 走 iconImg 查表。 */
    const ic=meta[1]?iconImg(meta[1],'wmic'):'';
    const shown=wmShown(w,sm.code,weaponSlot);
    if(sm.hasFixed){
      const m=shown&&shown.mod;
      const vals=m?wmAttrRows(m):[];
      const av=m?vals.map(a=>buildEffectLabel(a.name||a.key).replace(/%$/,'')+' '+fmtN(a.val)+(a.unit||'')).join(' · '):'';
      const avHtml=vals.length?vals.map(a=>`<span class="wmod-an">${esc(buildEffectLabel(a.name||a.key).replace(/%$/,''))}</span> <b>${esc(fmtN(a.val)+(a.unit||''))}</b>`).join(' · '):esc(L('无数值加成','No stat bonus'));
      return `<div class="wmod-row fixed" title="${esc(buildModLabel(m)+' · '+L('固定','Fixed'))}"><span class="wmod-ic">${ic}</span>`
        +`<span class="wmod-k">${esc(wmSlotLbl(sm.code))}</span>`
        +`<span class="wmod-v">${esc(buildModLabel(m))}</span><span class="wmod-a">${avHtml}</span>`
        +`<span class="wmod-tag">${esc(L('固定','Fixed'))}</span></div>`;
    }
    if(!sm.cands.length){
      return `<div class="wmod-row locked"><span class="wmod-ic">${ic}</span>`
        +`<span class="wmod-k">${esc(wmSlotLbl(sm.code))}</span>`
        +`<span class="wmod-v dim">${esc(L('不可更换','Locked'))}</span></div>`;
    }
    const m=shown&&shown.mod;
    const values=m?wmAttrRows(m):[];
    const av=m?(values.length?values.map(val=>buildEffectLabel(val.name||val.key).replace(/%$/,'')+' '+fmtN(val.val)+(val.unit||'')).join(' · '):L('无数值加成','No stat bonus')):L('选择','Choose');
    const avHtml=m?(values.length?values.map(val=>`<span class="wmod-an">${esc(buildEffectLabel(val.name||val.key).replace(/%$/,''))}</span> <b>${esc(fmtN(val.val)+(val.unit||''))}</b>`).join(' · '):esc(L('无数值加成','No stat bonus'))):'';
    return `<button type="button" class="wmod-row${m?' on':''}${values.length?' has-bonus':''}" title="${esc(m?buildModLabel(m):wmSlotLbl(sm.code))}" data-act="wmod" data-i="${weaponSlot}" data-s="${esc(sm.code)}" aria-pressed="${m?'true':'false'}" aria-label="${esc(L('选择配件','Pick mod'))} · ${esc(wmSlotLbl(sm.code))}${m?' · '+esc(buildModLabel(m)+' · '+av):''}">`
      +`<span class="wmod-ic">${ic}</span>`
      +`<span class="wmod-k">${esc(wmSlotLbl(sm.code))}</span>`
      +`<span class="wmod-v">${esc(m?buildModLabel(m):L('选择配件','Pick mod'))}</span>`
      +`<span class="wmod-a">${avHtml}</span></button>`;
  }).join('');
  return `<div class="wc-mod">${body}</div>`;
}
/* 槽位徽章：官方原生图形（书签形），已装备=✓、主/副/随身=1/2/3。 */
const SLOT_BADGE_KIND=['primary','secondary','sidearm'];
function slotBadge(i,on){
  const kind=on?'generic':(SLOT_BADGE_KIND[i]||'generic');
  const base='/assets/db/img/ui/state-equipped_'+kind;
  return '<img class="wc-slot-badge" src="'+base+'-light.png" alt="" aria-hidden="true">'
    +'<img class="wc-slot-badge dark" src="'+base+'-dark.png" alt="" aria-hidden="true">';
}
/* ── 渲染：武器 3 槽 ── */
function renderWeapons(){  $('#wstrip').innerHTML=W_SLOTS.map((sn,i)=>{
    const wi=state.wslots[i], w=wi==null?null:(DB.weapons||[])[wi];
    const on=state.wactive===i&&!!w;
    const fixedTal=weaponFixedTalent(w),ti=state.talents[i], picked=ti>=0?TALENTS[ti]:null;
    const talObj=fixedTal||picked,tn=talObj?L(talObj.zh||talObj.name||talObj.en||'',talObj.en||talObj.name||talObj.zh||''):'';
    const tico=talObj?talIcon(talObj,'tic tic-s'):'';
    /* 天赋行**长在武器卡上**（点它开官方天赋列表）：每把枪自带一个天赋，只有「计算中」那把生效。
       PvP 模式下该天赋若官方有 PvP 数值，行上标出来（用户第 268 轮要的 PvP 开关） */
    const tpv=(state.bp.pvp&&talObj&&talentPvpDiff(talObj))
      ?`<span class="pvpbadge on">${esc(L('PvP','PvP'))}</span>`:'';
    const wstat=talObj&&talObj.key?combatStatusText(talObj.key):'';
    const wcounted=!!(talObj&&talObj.key&&combatVisibleRows(talObj.key).length);
    const tal=w?`<button type="button" class="wc-talrow${tn?' has':''}${fixedTal?' fixed':''}${talObj&&talObj.key&&!wcounted?' na':''}" data-act="${fixedTal?'wtal-info':'wsl-tal'}" data-i="${i}" aria-pressed="${tn?'true':'false'}" title="${esc((fixedTal?L('武器自带天赋，不可更换','Built-in talent, locked'):(tn||L('点击选择该武器天赋','Pick this weapon talent')))+(wstat?' · '+wstat:''))}">
        ${tico}<span class="wc-tal-lbl">${esc(L('天赋','Talent'))}</span><span class="wc-tal-name">${esc(tn||L('＋ 选择','＋ pick'))}</span>${fixedTal?`<span class="wmod-tag">${esc(L('固定','Fixed'))}</span>`:tpv}${wstat?`<span class="wc-tal-state">${esc(wstat)}</span>`:''}</button>`:'';
    if(!w)return `<div class="wcard empty" data-act="wsl" data-i="${i}" tabindex="0" role="button" aria-label="${esc(L('选择武器','Pick weapon'))} · ${esc(L(sn[0],sn[1]))}">
        <div class="topbar" style="--rc:var(--mut)"></div>
        <div class="wc-hd"><span class="wc-slotlbl">${esc(L(sn[0],sn[1]))}</span></div>
        <div class="wc-mid" aria-hidden="true">${iconImg(i===2?'ui/wt_pistol.png':'ui/wt_ar.png','wc-placeholder')}</div>
        <div class="wc-stats"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>${esc(L('选择武器','Choose weapon'))}</div></div>`;
    const rrv=rarOfWeapon(w);
    const wti=w.type_icon?`<img loading="lazy" decoding="async" class="wc-ti" src="${imgUrl(w.type_icon)}" alt="" aria-hidden="true" onerror="this.remove()">`:'';
    return `<div class="wcard filled${on?' on':''}${state.bp.prototype&&!w.exotic?' r-proto':w.exotic?' r-exotic':w.named?' r-named':' r-brand'}" data-act="wsl" data-i="${i}" tabindex="0" role="button" aria-pressed="${on?'true':'false'}" aria-label="${esc(nmTxt(w))} · ${esc(L(sn[0],sn[1]))}">
      <div class="topbar"></div>
      <div class="wc-body"><div class="wc-mid">${wti}${iconImg(w.icon).replace('class="ic"','class="ic" style="width:auto;height:auto;max-width:100%;max-height:100%;border:none;background:none"')}</div>
      <div class="wc-col">
      <div class="wc-titleline"><button type="button" class="wc-slotlbl" data-act="wactivate" data-i="${i}" aria-pressed="${on}" aria-label="${esc(on?L('计算中','Active'):L('用于计算','Use for calculation'))}" title="${esc((on?L('计算中','Active'):L('用于计算','Use for calculation'))+' · '+L(sn[0],sn[1]))}">${slotBadge(i,on)}</button><div class="wc-name">${esc(nmTxt(w))}</div></div>
      <div class="wc-tools"><button type="button" class="wc-remove" data-act="wclear" data-i="${i}" aria-label="${esc(L('卸下武器','Unequip weapon'))}" title="${esc(L('卸下武器','Unequip weapon'))}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div>
      ${weaponAffixBlock(i,w)}
      <div class="wc-effects">${tal}${prototypeAugmentHtml(i+6,'w')}</div>
      ${wmodBlock(w,i)}</div></div></div>`;
  }).join('');
}
/* ── 渲染：装备 6 格（官方 gear[]） ── */
/* ── 装备卡上的词条区（用户第 110 轮：「需要直接在装备面板选择阿」）────────────────────
   官方 `attrs_max.slots[]` 有两种槽，面板上**都要能直接点**：
   ① 固定槽（`fixed:true`）＝ 这件必带的满值词条 ⇒ 只读展示（含具名件的额外固定词条，如张牙舞爪的
      近战伤害 200 / 手枪伤害 9%）；
   ② 随机槽（`fixed:false`，带 `by_list`）＝ 官方**按容器分组的候选** ⇒ 逐组给一排可点文本，点了即选。
   装备侧每组 4 项（攻击=武器控制力/暴击机率/暴击伤害/爆头伤害 · 防御=装甲回复/危害防护/生命值/
   爆炸抗性 · 效能=技能伤害/技能修复/技能加速/状态效果），武器侧是一组 13 项。
   `qmodKindUnder()` 是**官方写法不统一**的兼容：容器名里带 `Defence/Defense/Defensive` 判防御、
   `Utility` 判效能，其余（`Offense/Offensive`、武器的 `WeaponBonuses`）都归攻击。 */
function listKind(key){
  const n=((key||'').split('@')[0]||'').toLowerCase();
  if(n.indexOf('defen')>=0)return 'def';
  if(n.indexOf('utility')>=0)return 'uti';
  return 'off';
}
const AFFIX_KIND_ZH={off:['攻击','Offense'],def:['防御','Defense'],uti:['效能','Utility']};
/* 池引用 → [{key, kind, codes:[...]}]（顺序沿用官方容器声明顺序） */
function poolGroups(it){
  const am=it&&it.attrs_max;if(!am)return [];
  const by={};
  arr(am.slots).forEach(s=>{if(s&&s.fixed===false)arr(s.by_list).forEach(k=>{});});
  const out=[];
  arr(am.slots).forEach(s=>{
    if(!s||s.fixed!==false)return;
    const bl=s.by_list||{};
    Object.keys(bl).forEach(k=>{
      const kind=listKind(k);
      let g=out.filter(x=>x.key===k)[0];
      if(!g){g={key:k,kind:kind,codes:affixCodes(k)};out.push(g);}
    });
  });
  return out;
}
/* `<容器>@<品质>` → 官方候选 code 列表（阶段 8 写进 `attrs_max_curve.pool_lists`） */
function affixCodes(key){
  const c=DB.attrs_max_curve||{};  return arr((c.pool_lists||{})[key]).slice();
}
/* Official pools that stay inside the gear affix whitelist are offered as-is.
   The Investor mask is the case that matters: no headshot, health, or skill repair.
   Lists that also contain core-only stats return null so the 12-affix whitelist stays. */
function pieceAffixGroups(it,k){
  const talent=it&&it.talent;
  const talentKey=talent&&typeof talent==='object'?talent.key:talent;
  if(talentKey!=='talent_exotic_mask_invested')return null;
  const am=it&&it.attrs_max;if(!am)return null;
  const s=arr(am.slots).filter(x=>x&&x.fixed===false&&x.by_list&&x.kind!=='core')[k];
  if(!s)return null;
  const allowed={};
  affixPoolUnion(amQuality(it)).forEach(c=>{allowed[c]=1;});
  const keys=Object.keys(s.by_list||{});
  if(keys.length<2)return null;
  const groups=[];
  for(let i=0;i<keys.length;i++){
    const raw=affixCodes(keys[i]);
    if(!raw.length||raw.some(c=>!allowed[c]))return null;
    groups.push({kind:listKind(keys[i]),codes:raw.slice()});
  }
  return groups;
}
/* Which color an affix code has in this piece's official non-core pools. Ambiguous codes are skipped. */
function affixColorOnPiece(it,code){
  if(!it||!code)return '';
  const am=it.attrs_max;if(!am)return '';
  const hits={};
  arr(am.slots).forEach(s=>{
    if(!s||s.fixed!==false||s.kind==='core'||!s.by_list)return;
    Object.keys(s.by_list).forEach(key=>{if(affixCodes(key).indexOf(code)>=0)hits[listKind(key)]=1;});
  });
  const kinds=Object.keys(hits);
  return kinds.length===1?kinds[0]:'';
}
/* 候选 code → 显示名（`attrs_max_curve.pools` 的 `<code>@<品质>` 里有中英名与单位） */
function affixLabel(code,q){
  const pools=(DB.attrs_max_curve||{}).pools||{};
  const row=pools[code+'@'+q]||pools[code+'@Orange']||null;
  if(!row)return code;
  /* 官方全名「对离开掩体目标的伤害」在卡片里放不下，统一显示「掩体伤害」。 */
  const short={'对离开掩体目标的伤害':'掩体伤害','对离开掩体目标伤害':'掩体伤害'};
  const name=LANG==='zh'?(row.name_zh||row.name_en||code):(row.name_en||row.name_zh||code);
  return LANG==='zh'&&short[name]?short[name]:name;
}
function affixUnit(code,q){
  const pools=(DB.attrs_max_curve||{}).pools||{};
  const row=pools[code+'@'+q]||pools[code+'@Orange']||null;
  return (row&&row.unit)||'';
}
function weaponAffixCodes(w){
  const am=w&&w.attrs_max;if(!am)return [];
  const s=arr(am.slots).find(x=>x&&x.kind==='random'&&x.fixed===false&&x.by_list);
  if(!s)return [];
  const key=Object.keys(s.by_list||{})[0]||'';
  return affixCodes(key);
}
function weaponFixedTalent(w){
  const t=w&&w.talent;if(!t)return null;
  if(t.key&&TALENT_BY_KEY[t.key]){const o=TALENT_BY_KEY[t.key];return Object.assign({},o,t,{icon:t.icon||o.icon});}
  return (typeof t==='object')?t:null;
}
function weaponAffixBlock(i,w){
  const am=w&&w.attrs_max;if(!am)return '';
  const proto=!!state.bp.prototype&&!w.exotic;
  const q=amQuality(w),fixed=arr(am.slots).filter(s=>s&&s.fixed===true&&s.val!=null&&(s.name_zh||s.name_en));
  const rows=fixed.map(s=>`<div class="wax-row locked" data-fam="off">${axGlyph('off')}<span>${esc(L(s.name_zh||s.name_en,s.name_en||s.name_zh))}</span><b>${fmtN(prototypeAttrValue(s.code,s.val,s.qmod,proto))}${esc(s.unit||'')}</b></div>`).join('');
  const choices=weaponAffixCodes(w),cur=state.waffix[i]||'';
  const opts=choices.map(c=>`<option value="${esc(c)}"${cur===c?' selected':''}>${esc(weaponAffixOptionLabel(c,q,proto))}</option>`).join('');
  const chosen=cur?weaponMaxAttrs(w,i).find(a=>a.src==='weapon-affix'):null;
  const display=chosen?fmtN(chosen.val)+esc(chosen.unit||''):'—';
  return `<div class="wc-affix">${rows}${choices.length?`<label class="wax-row random" data-fam="off"><span class="wax-choice">${axGlyph('off')}<span>${esc(cur?affixLabel(cur,q):L('未选择','Not selected'))}</span><b>${display}</b></span><select data-act="waffix" data-i="${i}" aria-label="${esc(L('选择武器随机词条','Pick weapon random affix'))}"><option value="">${esc(L('未选择','Not selected'))}</option>${opts}</select></label>`:''}</div>`;
}
/* 该件 attrs_max 的品质档（与阶段 8 落库时的键一致） */
function amQuality(it){
  const q=(it&&it.attrs_max&&it.attrs_max.quality)||'Orange';
  return q==='None'?'Orange':q;
}
/* 该件的随机槽数（每个随机槽只能选一项）。
   ⚠️ 必须**剔掉核心槽**：核心槽多数是 `fixed:true`（件自带值，走固定行），但有 **23 件**是
   `fixed:false`（官方给三选一，如「投资者」）—— 那些件的核心有**自己那一行**，
   算进随机槽数会让词条区多画一行空槽（`fixed:false` 计数 1033 + 23 里含核心那部分）。 */
function nRandomSlots(it){
  const am=it&&it.attrs_max;if(!am)return 0;
  return arr(am.slots).filter(s=>s&&s.fixed===false&&s.kind!=='core').length;
}
/* 第 k 个**随机副属性槽**的候选 code 列表（按 `attrs_max.slots` 里的原序，不重排）。
   随机槽是**逐槽**各有自己的 `by_list`（`poolGroups` 把各槽并起来给抽屉看），这里要的是
   「单个槽」的候选 —— 选件后自动填默认值时逐槽取第一条用（见 `build.app.js` 的 `autoFillGear`）。 */
function randomSlotCodes(it,k){
  const groups=pieceAffixGroups(it,k);
  if(groups){
    const out=[],seen={};
    groups.forEach(g=>g.codes.forEach(c=>{if(!seen[c]){seen[c]=1;out.push(c);}}));
    return out;
  }
  const am=it&&it.attrs_max;if(!am)return [];
  const s=arr(am.slots).filter(x=>x&&x.fixed===false&&x.by_list&&x.kind!=='core')[k];
  if(!s)return [];
  /* ⚠️ 官方 `by_list` 那个容器里**混着**「特定武器伤害」与核心专属那几条（库里实测 19 个 code，
     其中 7 条属于这两类）。参考工具的真值是：装备随机槽只有 12 条（攻 4 / 防 4 / 效 4），
     特定武器伤害只长在武器上 ⇒ 这里按**该槽的族**取白名单那几条，不再原样摊官方容器。 */
  const out=[],seen=new Set();
  for(const list of Object.keys(s.by_list))for(const code of affixPoolCodes(listKind(list),amQuality(it))){if(!seen.has(code)){seen.add(code);out.push(code);}}
  return out;
}
/* 已选副属性 → 引擎属性对象。取值链（全部来自官方表，不臆造）：
   ① `attrs_max_curve.pools[<code>@<品质>].val` = 该属性的**官方满值**（品质取该件自身档）；
   ② 原型档再乘 `protoRatio(code, qmod)`（`Prototype / 自身品质`，取不到官方原型档就不乘）。 */
function affixAttrs(it,slot,opt){
  const am=it&&it.attrs_max;if(!am)return [];
  const q=amQuality(it),proto=!!(state.bp&&state.bp.prototype)&&it.kind!=='exotic';
  const t=(DB._meta&&DB._meta.attrs_max_basis&&DB._meta.attrs_max_basis.qmod_table)||{};
  const pools=(DB.attrs_max_curve||{}).pools||{};
  const pick=(opt&&opt.affix&&opt.affix[slot]!=null)?opt.affix[slot]:state.affix[slot];
  const out=[];
  arr(pick).forEach(code=>{
    if(!code)return;
    const row=pools[code+'@'+q]||pools[code+'@Orange']||pools[code+'@GearSet']||{};
    const name=row.name_zh||row.name_en||code;
    const base=+row.val;
    if(!isFinite(base))return;                        // 官方表查不到满值 ⇒ 不喂、不按 0 顶替
    const mul=proto?protoRatio(code,row.qmod||(t[code]||{})[q]):1;
    out.push({name:name,key:attrKey(name,affixUnit(code,q)),val:base*mul,unit:row.unit||'',src:'affix'});
  });
  return out;
}
/* 该件核心槽的三选一（官方：core 槽候选 >1 = 可挑） */
function coreChoices(it){
  const am=it&&it.attrs_max;if(!am)return null;
  /* ① 官方明确给了「可挑」的核心（fixed:false + by_list）⇒ 原样用官方的（「投资者」那类走这条） */
  const s=arr(am.slots).filter(x=>x&&x.kind==='core'&&x.fixed===false&&x.by_list)[0];
  if(s){
    const codes=affixCodes(Object.keys(s.by_list||{})[0]||'');
    if(codes.length)return codes;
  }
  /* ② 奇特的核心是**件自带**（游戏里奇特的主属性固定）⇒ 不给挑，面板照旧显示那条固定值。
     具名按用户 2026-10-14 的口径放开：核心同样在官方三条里换（实测 71/73 具名件自带的那条本就是三条之一）。
     ⚠️ 「特殊词条」（`kind==='random' && fixed===true` 那批件自带加成）**仍然只读** —— 它走
        `gearAffixBlock()` 的 `special` 固定行，不经过本函数 ⇒ 放开具名的核心不会把它一起放开。
     ⚠️ 放开后「只是点开看一眼」不会悄悄改数：`autoFillGear()` 先落件自带那条（见 build.app.js 的 NotNull 注释）。 */
  if(it.kind==='exotic')return null;
  /* ③ 品牌件 / 装备组件：在官方核心三条（武器伤害 / 装甲 / 技能分阶）里换 ——
     原来只有 23 件「官方声明了三选一」的才能改，其余一律只读，与游戏与参考工具都不符。
     该件品质档取不到满值的那条不摆（不拿 0 顶替）。 */
  const q=amQuality(it);
  const out=CORE_CODES_OFFICIAL.filter(c=>poolRowOf(c,q)!=null);
  return out.length?out:null;
}
/* 装备卡上的词条区：核心（只读或三选一）+ 已选副属性 + 展开候选 */
/* ── 卡色 = 这件的**核心属性**（用户第 304 轮：「卡片一个颜色、装甲蓝色、武器伤红色、技能绿色」）──
   判据用官方 `attrs_max.slots[]` 里那条 core 槽的 code（可挑核心的件读 `state.core[i]` 当前选择），
   与资料库 `.card[data-pg]` 一样是「整卡一个色」，不是按稀有度。绿色复用既有 `--rar-set`（装备组绿），
   不新造颜色；红/蓝沿用 `--rar-off/--rar-def`。 */
function gearCoreFam(i,it){
  if(!it||!it.attrs_max)return '';
  let code='';
  const ch=coreChoices(it);
  if(ch) code=state.core[i]||'';
  if(!code){
    const c0=arr(it.attrs_max.slots).filter(s=>s&&s.kind==='core')[0];
    code=c0?(c0.code||''):'';
  }
  const c=String(code).toLowerCase();
  if(!c)return '';
  if(c.indexOf('armor')>=0)return 'def';
  if(c.indexOf('skill')>=0||c.indexOf('utility')>=0)return 'uti';
  if(c.indexOf('weapondamage')>=0||c.indexOf('damage')>=0)return 'off';
  return '';
}
/* 词条「引擎读不读」判据（复用现成的，不另造）：喂给引擎的归一键（`attrKey` / `affixAttrs` 的 `key`）
   在不在 `TD2Calc.attrNames()`（= engine.js MAP 的全部键；不在的键 `add()` 只记进 `r.ignoredAttrs` 静默忽略，
   与 `build.attrs.js` 的 `attrKnown`、体检面板「尚未计算的属性」同一套账）。⚠️ 只判「引擎根本没收录」；
   “引擎在读、但当前条件让增量暂为 0”（如爆头率=0 时的爆头伤害）**不在此判据内，不许标**——标错就是第二次捕猎者。 */
function affixEngineRead(key){if(!affixEngineRead._s)affixEngineRead._s=new Set(TD2Calc.attrNames());return key?affixEngineRead._s.has(key):false;}
const UNCOUNT_TITLE=()=>L('该属性引擎未收录 · 不计入当前计算','Attribute not modeled by the engine · not in the current calculation');
function gearAffixBlock(i,it){
  const am=it&&it.attrs_max;if(!am)return '';
  const q=amQuality(it),proto=!!(state.bp&&state.bp.prototype)&&it.kind!=='exotic';
  const t=(DB._meta&&DB._meta.attrs_max_basis&&DB._meta.attrs_max_basis.qmod_table)||{};
  const mulOf=code=>proto?protoRatio(code,(t[code]||{})[q]):1;
  const fixed=arr(am.slots).filter(s=>s&&s.kind!=='random'&&s.fixed===true&&s.val!=null&&(s.name_zh||s.name_en));
  const special=arr(am.slots).filter(s=>s&&s.kind==='random'&&s.fixed===true&&s.val!=null&&(s.name_zh||s.name_en));
  const ch=coreChoices(it);
  let core='';
  if(ch){
    const cur=state.core[i], display=cur?coreAttrOf(it,cur):null;
    core=`<label class="axrow axselect core${cur?'':' empty'}" data-fam="${esc(gearCoreFam(i,it))}">${axGlyph(gearCoreFam(i,it))}<span class="axk">${esc(L('核心','Core'))}</span><span class="axchoice">${esc(cur?affixLabel(cur,q):L('未选择','Not selected'))}</span><b class="axvalue">${display&&Number.isFinite(display.val)?fmtN(display.val)+esc(display.unit):'—'}</b><select data-act="gcore" data-i="${i}" aria-label="${esc(L('更换核心属性','Change core attribute'))}">`
      +ch.map(c=>`<option value="${esc(c)}"${cur===c?' selected':''}>${esc(affixLabel(c,q))}</option>`).join('')+`</select></label>`;
  }else{
    const c0=fixed.filter(s=>s.kind==='core')[0];
    /* ⚠️ 数字格式一律用**本页的** `fmtN`（`build.data.js`）：`num()` 只存在于资料库那套脚本里
       （`db.core.js`），配装器页压根没加载它 ⇒ 这里写 `num(...)` 就是 `ReferenceError`，
       而它从 `renderGear()` 抛出 ⇒ **整列装备卡一张都不渲染**（只剩空壳）。2026-09-13 真踩。 */
    if(c0)core=`<div class="axrow core" data-fam="${esc(gearCoreFam(i,it))}">${axGlyph(gearCoreFam(i,it))}<span class="axchoice">${esc(L(c0.name_zh||c0.name_en,c0.name_en||c0.name_zh))}</span><b class="axvalue">${fmtN(prototypeAttrValue(c0.code,c0.val,c0.qmod,proto))}${esc(c0.unit||'')}</b></div>`;
  }
  const others=fixed.filter(s=>s.kind!=='core');
  const other=others.concat(special).map(s=>{const fam=listKindForCode(s.code,q);const read=affixEngineRead(attrKey(s.name_zh||s.name_en,s.unit));return `<div class="axrow fixed${read?'':' uncounted'}" data-fam="${esc(fam)}"${read?'':' title="'+esc(UNCOUNT_TITLE())+'"'}>${axGlyph(fam)}<span class="axk">${esc(L(s.name_zh||s.name_en,s.name_en||s.name_zh))}</span><b class="axvalue">${fmtN(prototypeAttrValue(s.code,s.val,s.qmod,proto))}${esc(s.unit||'')}</b>${read?'':`<small class="ax-uncount">${esc(L('不计入','Not counted'))}</small>`}</div>`;}).join('');
  const nR=nRandomSlots(it);
  const picked=arr(state.affix[i]);
  let rows='';
  for(let k=0;k<nR;k++){
    const code=picked[k]||'', display=code?affixAttrs(it,i,{affix:{[i]:[code]}})[0]:null;
    const custom=pieceAffixGroups(it,k);
    const source=custom?custom.map(g=>({f:g.kind,cs:g.codes.filter(c=>c===code||picked.indexOf(c)<0)})):AFFIX_FAM_ORDER.map(f=>({f:f,cs:affixPoolCodes(f,q).filter(c=>c===code||picked.indexOf(c)<0)}));
    const groups=source.filter(g=>g.cs.length).map(g=>'<optgroup label="'+esc(L(AFFIX_KIND_ZH[g.f][0],AFFIX_KIND_ZH[g.f][1]))+'">'+g.cs.map(c=>'<option value="'+esc(c)+'"'+(code===c?' selected':'')+'>'+esc(affixLabel(c,q))+'</option>').join('')+'</optgroup>').join('');
    const rfam=code?listKindForCode(code,q):'';
    /* 「不计入」标记（2026-10-15）：选了这条但归一键没被引擎收录（或被喂路径判为不喂，如官方表查不到满值）
       ⇒ 行如实标注：视觉 chip + 行 title + select aria-label 三处同源，判据只有一条 `affixEngineRead`。 */
    const read=!code||(!!display&&affixEngineRead(display.key));
    rows+=`<label class="axrow axselect ${code?rfam:'empty'}${read?'':' uncounted'}" data-fam="${esc(rfam)}"${read?'':' title="'+esc(UNCOUNT_TITLE())+'"'}>${axGlyph(rfam)}<span class="axk">${esc(L('副属性 '+(k+1),'Affix '+(k+1)))}</span><span class="axchoice">${esc(code?affixLabel(code,q):L('未选择','Not selected'))}</span><b class="axvalue">${display?fmtN(display.val)+esc(display.unit):'—'}</b>${read?'':`<small class="ax-uncount">${esc(L('不计入','Not counted'))}</small>`}<select data-act="gaffix" data-i="${i}" data-k="${k}" aria-label="${esc(L('更换副属性 ','Change affix ')+(k+1)+(read?'':' · '+UNCOUNT_TITLE()))}"><option value="">${esc(L('未选择','Not selected'))}</option>${groups}</select></label>`;
  }
  /* 「＋ 副属性候选 / 收起候选」那颗标签已删（用户：多余）—— 上面每一行「词条」本身就是开关，
     `aria-expanded` 带着状态；点别处与 Esc 也收（`build.app.js` 的两条既有通路）。 */
  /* 「同组共 N 件 · 逐件挑」独占一行会把卡撑高、话也和抽屉重复（用户两轮都点名）⇒
     收成卡头一颗计数钮：数字就是件数，title/aria 把话说全，点它进逐件挑。 */
  return `<div class="axblk">${core}${other}${rows}${prototypeAugmentHtml(i)}</div>`;
}
function listKindForCode(code,q){
  for(const f of AFFIX_FAM_ORDER)if(affixPoolCodes(f,q).indexOf(code)>=0)return f;
  /* 随机池查不到再查固定/具名槽的判族表（只给图标上色，不影响候选池）；两表都没有才留空槽 */
  return FIXED_AFFIX_FAM[code]||'';
}
/* 该件所在「品牌 / 装备组 × 部位」组里共有几件（点品牌块是填代表件，想指定另一件就走这里给的入口） */
function gearGroupKey(it){
  if(!it)return '';
  if(it.kind==='gearset')return it.set_code?'set:'+it.set_code:'';
  return it.brand_code?'brand:'+it.brand_code:'';
}
function gearSwapCount(it){
  const key=gearGroupKey(it);if(!key||it.kind==='named'||it.kind==='exotic')return 0;
  let n=0;
  for(let k=0;k<GEAR.length;k++){const x=GEAR[k];if(!x||x.slot_idx!==it.slot_idx)continue;if(gearGroupKey(x)===key)n++;}
  return n>1?n:0;
}
function renderGear(){
  const per=countsGear();
  $('#ggrid').innerHTML=G_SLOTS.map((sn,i)=>{
    const it=gearOf(i), gi=state.slots[i];
    const ms=hasModSlot(i);
    let modblk='';
    if(ms&&it){
      const mi=state.gmods[i], m=mi==null?null:(GMODS||[])[mi];
      /* 装了哪一类插件就画哪一类的官方字形（`img/modfilter/` 三张，颜色与 `.modblk.red/blue/yellow` 同源） */
      modblk=m?`<button type="button" class="modblk hasic ${modColor(m)}" data-act="modblk" data-i="${i}" aria-label="${esc(modTitle(m))}" title="${esc(modTitle(m))}">${modGlyph(m,'mglyph')}<span class="mod-label">${esc(buildModLabel(m))}${gearModSlotCount(it,i)>1?' ×'+gearModSlotCount(it,i):''}</span><b class="mod-value">${fmtN(modVal(m))}${esc(m.unit||'')}</b></button>`
              :`<button type="button" class="modblk empty" data-act="modblk" data-i="${i}" aria-label="${esc(L('选择插件','Pick gear mod'))}" title="${esc(L('插件（装备改造模块）','Gear mod'))}"><span class="mod-label">＋ ${esc(L('选择插件','Pick gear mod'))}${gearModSlotCount(it,i)>1?' ×'+gearModSlotCount(it,i):''}</span></button>`;
    }
    /* 件天赋（背包 / 胸甲）：卡片脚行上的**可点入口**（与武器卡的 `data-act="wsl-tal"` 同款）。
       ⚠️ 判据 = `gtalPool(i).keys.length`（**有池才画这一行**）：面具/手套/枪套/护膝 池空 ⇒ 不画；
          装备组件池空 ⇒ 不画（它的天赋走 4 件套档，见 `build.tiers.js`）；具名/奇特池里 1 条 ⇒ 画但锁定。
       ⚠️ 已选的那条读 `gtalKeyOf(i)`（件指针优先，其次 `state.gtal`），**不读 `gearTalent()`**：
          那个对装备组件有「取 4 件套天赋」的兜底分支，会把 4 件套那条摆到卡片上当成件天赋。
       ⚠️ 是否计入只看 `combatGearRows()`。条件关或层数是 0 就是空。`gtalStatus==='ok'` 只说明满层有公式，不能当成已经计入。 */
    const gpool=it?gtalPool(i):{locked:false,keys:[]};
    const gkey=it?gtalKeyOf(i):'';
    const gObj=gkey?TALENT_BY_KEY[gkey]:null;
    const gn=gkey?((gObj&&L(gObj.zh||gObj.en,gObj.en||gObj.zh))||gearTalent(it)||gkey):'';
    const gstat=gkey?combatStatusText(gkey):'';
    const gcounted=!!(gkey&&combatVisibleRows(gkey).length);
    const gNote=gkey?L('天赋','Talent')+'：'+gn+' · '+gstat:L('选择装备天赋','Pick gear talent');
    const gtico=gObj?talIcon(gObj,'tic tic-s'):'';
    const tal=gpool.keys.length?`<button type="button" class="taltx${gkey?'':' empty'}${gkey&&!gcounted?' na':''}" data-act="gtal" data-i="${i}" aria-pressed="${gkey?'true':'false'}" title="${esc(gNote)}">${gtico}<span class="tal-name">${esc(gn||L('＋ 天赋','＋ Talent'))}</span>${gkey?'<span class="tal-state">'+esc(gstat)+'</span>':''}</button>`:'';
    const ovr=canOvr(i)?`<button class="ovrbtn${state.ovr[i]?' on':''}" data-act="ovr" data-i="${i}" title="${esc(L('临时套装(Override)：开启后本格可插插件','Override set: enables mod slot on this piece'))}">OVR</button>`:'';
    /* 原型档开着时，非奇特件渲成紫色（官方原型色 --rar-proto）+ 一颗「原型」标，
       让「这一套现在按原型算」在卡面上看得见，不用去右栏找开关。 */
    const protoOn=!!(state.bp&&state.bp.prototype)&&it&&it.kind!=='exotic';
    /* 同组计数钮（卡头）：数字=该组在本部位的件数，点它进逐件挑；不占行、不撑高 */
    const swN=gearSwapCount(it);
    const sw=swN?`<button type="button" class="gswapn" data-act="gswap" data-i="${i}" aria-label="${esc(L('同组共 '+swN+' 件，逐件挑','Group of '+swN+', pick one'))}" title="${esc(L('同组共 '+swN+' 件，逐件挑','Group of '+swN+', pick one'))}">${swN}</button>`:'';
    const rv=it?rarOf(it):null;
    let cnt='';
    if(it&&it.kind==='gearset'&&it.set_code)cnt=`${per['set:'+it.set_code]||1}`;
    else if(it&&it.brand_code)cnt=`${per['brand:'+it.brand_code]||1}`;
    const lk=!!(state.opt&&state.opt.lock[i]);
    const cfam=it?gearCoreFam(i,it):'';
    /* 品质身份 class（与资料库 `.card.r-*` 同一套：品牌/普通=金 · 具名=橙 · 装备组=绿 · 奇特=红 · 原型=紫），
       颜色令牌全部来自 `base.css` 的 `.r-*{--rc}`，配装页不再按核心属性给整卡上色（用户：要和资料库一致）。 */
    const rcls=!it?'':(protoOn?' r-proto':({named:' r-named',gearset:' r-set',exotic:' r-exotic'}[it.kind]||' r-brand'));
    return `<div class="gcard build-gear-card${it?' filled':''}${protoOn?' proto':''}${rcls}${state.dlg&&state.dlg.kind==='g'&&state.dlg.slot===i?' open':''}"${cfam?` data-core="${cfam}"`:''} data-act="gcard" data-i="${i}" tabindex="0" role="button" aria-label="${esc(it?L('编辑装备','Edit gear'):L('选择装备','Pick gear'))} · ${esc(L(sn[0],sn[1]))}${it?' · '+esc(nmTxt(it)):''}">
      <div class="topbar"${it?'':' style="--rc:var(--mut)"'}></div>
      <div class="gc-hd"><span class="gc-lbl">${iconImg(SLOT_ICON[i],'gc-slot-icon gc-slot-icon-header')}<span>${esc(it?nmTxt(it):L(sn[0],sn[1]))}</span></span>${it?brandWmHtml(it,'gc-wm'):''}</div>
      <div class="gc-main"><div class="gc-mid">${it?(it.gear_icon?iconImg(it.gear_icon.startsWith('gear/')?'fit/'+it.gear_icon:it.gear_icon).replace('class="ic"','class="ic" style="width:auto;height:auto;max-width:100%;max-height:100%;border:none;background:none"'):silIcon(i,rv[0])):silIcon(i,'--mut')}</div>
      <div class="gc-info">${it?buildGearSummaryBlock(i,it):'<span class="build-gear-empty">'+esc(L('选择装备','Choose gear'))+'</span>'}</div></div>
      ${it?`<div class="gc-ft">${tal}${modblk}${buildGearPrototypeSummary(i)}</div>`:''}</div>`;
  }).join('');
  /* 装备格的提示行：只留**可操作**的（原来这里是「装备自身固定词条按官方 L40 满值计入，随机池候选另计。」
     —— 与配装器结果区那条被删掉的自注同义，属 UI 硬规则① 的「解释过程」，一并去掉，空着不显示内容） */
  const hintGearVals=$('#hint_gear_vals');
  if(hintGearVals)hintGearVals.textContent='';
  /* 这一层被 case 直接调用时（不走 `renderAll()` 的那几条路）也要收尾把焦点放回用户刚才那颗 chip，
     否则「展开词条 → 再按 Tab」焦点掉回 BODY（第四轮复评实测到）。`restoreFocus()` 幂等。 */
  if(typeof restoreFocus==='function')restoreFocus();
}
/* ── 一键配装面板（用户第 111 轮）────────────────────────────────────────────
   目标表 / 武器类别 / 条件量全部**运行时现算**（取自 OPT_TARGETS / OPT_CKINDS / WTYPES，不写死）。
   奇特唯一是强制项，界面上不给开关。 */
/* ── 一键配装的 6 条硬条件（用户第 300 轮定稿）──────────────────────────────
   ① 品牌（可多选 + 件数）② 主武器 ③ 专长 ④ 手表 ⑤ 核心属性 ⑥ 副属性（≤2）
   口径与语义见 `build.req.js` 头部。这里只画控件；**判定全在 `build.req.js`**（面板不自己算）。 */
function reqRow(label, body){
  return `<div class="axrow"><span class="axk">${esc(label)}</span><span class="axchips">${body}</span></div>`;
}
function reqChip(act,key,on,txt,extra){
  return `<button type="button" class="axc${on?' on':''}" data-act="${act}" data-k="${esc(key)}"`
    +` aria-pressed="${on?'true':'false'}"${extra||''}>${esc(txt)}</button>`;
}
/* ── 搜索式多选（用户 2026-09-14：「条件那一大片 chip 收起来」）───────────────────────
   已选 = 一排带 ✓ 的 chip（点一下取消）；加项 = 一个输入框 + 原生 datalist（打字即过滤、
   上下键可选、回车添加）+ 一颗「＋」。原来品牌那一行一次性摊 96 颗 chip，把「开始配装」
   压到看不见的地方 ⇒ 池子再大也不该占版面。 */
function reqAddBox(id,act,opts,ph){
  return `<span class="optadd"><input type="search" id="${id}" list="${id}o" autocomplete="off"`
    +` placeholder="${esc(ph)}" aria-label="${esc(ph)}"><datalist id="${id}o">`
    +opts.map(o=>`<option value="${esc(o)}"></option>`).join('')+`</datalist>`
    +`<button type="button" class="mini" data-act="${act}" aria-label="${esc(L('加入条件','Add'))}">＋</button></span>`;
}
/* 输入 → 条件键：显示名精确匹配优先；前缀匹配只在**唯一一个**时才算数。
   取不到 / 不唯一 ⇒ 不动状态（宁可不加，也不猜一个塞进条件里 —— 与「取不到不拿 0 顶替」同一条纪律）。 */
function reqBrandByLabel(txt){
  const t=String(txt||'').trim().toLowerCase();if(!t)return null;
  const bl=arr(reqBrandList()),eq=[],pre=[];
  bl.forEach(b=>{const n=String(b.zh||'').toLowerCase();if(!n)return;if(n===t)eq.push(b);else if(n.indexOf(t)===0)pre.push(b);});
  return eq.length?eq[0].key:(pre.length===1?pre[0].key:null);
}
function reqAffixByLabel(txt){
  const t=String(txt||'').trim().toLowerCase();if(!t)return null;
  const codes=arr(reqAffixCodes()),eq=[],pre=[];
  codes.forEach(c=>{const n=String(affixLabel(c,'Orange')||'').toLowerCase();if(!n)return;if(n===t)eq.push(c);else if(n.indexOf(t)>=0)pre.push(c);});
  return eq.length?eq[0]:(pre.length===1?pre[0]:null);
}
/* 「＋」与输入框回车走同一个入口：which='b' 品牌 / 装备组，which='a' 副属性（上限 2，挤掉最早的）。 */
function reqAdd(which){
  const id=which==='b'?'optreqbi':'optreqai';
  const inp=document.getElementById(id);
  const key=which==='b'?reqBrandByLabel(inp&&inp.value):reqAffixByLabel(inp&&inp.value);
  if(!key){if(inp)inp.focus();return;}
  const q=req(),cur=arr(which==='b'?q.brands:q.affix);
  if(cur.indexOf(key)<0){
    if(which==='b')q.brands=cur.concat([key]);
    else q.affix=(cur.length>=2?cur.slice(1):cur).concat([key]);
    state.opt.res=null;state.opt.applied=false;
  }
  if(inp){inp.value='';inp.focus();}
  renderOpt();
}
/* 词条池的候选 = **全库真正可用的 code 并集**，现算一次后缓存（678 件逐件扫一遍很轻，但每次重渲都扫没必要）。
   `poolGroups(it)` 只对**那一件**给出它能刷出的 code，所以并集必须逐件取 —— 不能拿一件代表全库。
   ⚠️ **核心池与副属性池是两份不同的表，不许混用**：
     · ⑤ 核心池只圈「有可挑核心槽」的那些 code（官方 `kind='core' && fixed:false`，全库只有极少数件有这种槽）；
       拿副属性并集当核心候选 ⇒ 用户能选中一个**根本没有任何件提供得了**的 core，
       判定侧照样报「满足」（那种件整片豁免），条件静默失效。
     · ⑥ 副属性池 = 随机槽能刷出的 code。
   两份都在这一次扫描里取（同一次遍历，别为它再扫 678 件）。 */
let REQ_CODES=null,REQ_CORE_CODES=null;
function reqAffixCodes(){
  if(REQ_CODES)return REQ_CODES;
  /* ⚠️ 池子只认界面上摆得出来的那一份：副属性 = 官方随机池 12 条白名单、核心 = 官方 3 条
     （`build.attrs.js` 的 AFFIX_POOL_CODES / CORE_CODES_OFFICIAL）。
     原来这里自己扫了一遍全库 `by_list`（含特定武器伤害与核心专属那 7 条）⇒ 用户能在 ⑥ 里
     选到一个**界面上根本选不出来**的 code，而优化器按它评了分（两套池 = 静默错配）。
     所以不再逐件扫库：两份池一次现算。 */
  REQ_CODES=affixPoolUnion('Orange');
  REQ_CORE_CODES=CORE_CODES_OFFICIAL.filter(c=>poolRowOf(c,'Orange')!=null);
  return REQ_CODES;
}
function reqCoreCodes(){reqAffixCodes();return REQ_CORE_CODES||[];}
function reqBlock(){
  const q=req(),used=reqUsed(q);
  const brand=arr(q.brands).map(k=>reqChip('optreqb',k,true,reqBrandName(k))).join('')
    +reqAddBox('optreqbi','optreqbadd',reqBrandList().map(x=>x.zh),L('加入品牌 / 装备组…','Add brand / gear-set…'))
    +`<select class="minisel" data-act="optreqbn" id="optreqbn" aria-label="${esc(L('品牌至少几件','Min pieces'))}">`
    +[1,2,3,4].map(n=>`<option value="${n}"${q.bmin===n?' selected':''}>×${n}</option>`).join('')
    +`</select>`;
  const W=arr(DB.weapons).filter(w=>w&&!w.not_in_game&&buildWeaponRepresentative(w));
  const weapon=`<select class="wsel" data-act="optreqw" id="optreqw"><option value="">${esc(L('不限','Any'))}</option>`
    +W.map(w=>{const i=arr(DB.weapons).indexOf(w);
        return `<option value="${i}"${q.weapon===i?' selected':''}>${esc(wtTxt(w.zh||w.en||'',w.en))}</option>`;}).join('')
    +`</select>`;
  /* ③ 专长**不许**再摊一遍那 7 颗专精（同一视图里同义清单印两次 = 红线②，而且它约束的就是
     「战斗条件」里已经选定的那一个）。收成两态：不约束 / 必须是当前这个。 */
  const nowSpec=(state.bp&&state.bp.spec)||'';
  const specLabel=(BP_SPEC_LIST.filter(x=>x.id===(q.spec||nowSpec))[0]||{}).zh||'';
  const spec=reqChip('optreqs','',!q.spec,L('不限','Any'))
    +(nowSpec?reqChip('optreqs',nowSpec,q.spec===nowSpec,L('用当前：'+specLabel,'Use current: '+specLabel))
             :`<span class="axc unsel">${esc(L('先选择专长','Pick a specialization above first'))}</span>`);
  const watch=`<label class="swrow tiny"><input type="checkbox" data-act="optreqwt" id="optreqwt"${q.watchKey===true?' checked':''}>`
    +`<span>${esc(L('手表一千级','Watch 1000'))}</span></label>`;
  const core=reqCoreCodes(),aff=reqAffixCodes();
  /* ⑤ 的件数下限（见 `build.req.js` 的 `reqCoreMiss()`）：可挑核心的件极少，光圈池会被**空满足**，
     所以要和 ① 一样能点「至少几件」。 */
  const coreMin=`<select class="minisel" data-act="optreqcn" id="optreqcn">`
    +[1,2,3,4,5,6].map(n=>`<option value="${n}"${(q.cmin||1)===n?' selected':''}>×${n}</option>`).join('')
    +`</select>`;
  const coreRow=core.length
    ? core.map(c=>reqChip('optreqc',c,arr(q.core).indexOf(c)>=0,affixLabel(c,'Orange'))).join('')+coreMin
    : `<span class="hint tiny">${esc(L('取不到属性表','no attr table'))}</span>`;
  /* 副属性上限 2：已选的两颗排在前面，加第三条走输入框（池是全库并集，摊成 chip 就是一整墙） */
  const affRow=arr(q.affix).map(c=>reqChip('optreqa',c,true,affixLabel(c,'Orange'))).join('')
    +reqAddBox('optreqai','optreqaadd',aff.map(c=>affixLabel(c,'Orange')),L('加入副属性…（最多 2 条）','Add affix… (max 2)'));
  return reqRow(L('品牌','Brand'),brand)
    +reqRow(L('主武器','Primary'),weapon)
    +reqRow(L('专长','Specialization'),spec)
    +reqRow(L('手表','Watch'),watch)
    +reqRow(L('核心属性','Core'),coreRow)
    +reqRow(L('副属性','Affix'),affRow)
    +`<div class="hint tiny">${esc(L('已设 ','active '))}${used}/6</div>`;
}
function optSlotLbl(i){ return L(G_SLOTS[i][0],G_SLOTS[i][1]); }
function brandOrSetName(it){
  if(!it)return '';
  return it.set_zh||it.brand||it.brand_en||'';
}
function renderOpt(){
  const o=state.opt;
  const fs=$('#bp_oflow');if(fs)fs.innerHTML='<option value="">'+esc(L('自定义','Custom'))+'</option>'+OPT_FLOWS.map(f=>`<option value="${f[0]}"${o.flow===f[0]?' selected':''}>${esc(L(f[1],f[2]))}</option>`).join('');
  const fl=$('#l_oflow');if(fl)fl.textContent=L('常规流派','Build archetype');
  const fh=$('#optflowhint'),flw=optFlowOf(o.flow);if(fh)fh.textContent=flw?(LANG==='en'?({crit:'Six all-red pieces, capped 60% CHC; 25 m theoretical snapshot.',skill:'Tier 6 damage build. Same-skill, same-tier damage multiplier; not skill DPS or healing. Both Kinetic skill slots can be fully stacked.',pfe:'80% elite resistance, no extra incoming-damage amplification; 10 m weapon-output snapshot. Not an armor/EHP optimum; no protection against non-elites.'}[o.flow]||flw.note):flw.note+(o.flow==='crit'?' · 理论中距25米':'')):'';
  const ts=$('#bp_otarget');
  if(ts)ts.innerHTML=OPT_TARGETS.map(t=>`<option value="${t[0]}"${o.target===t[0]?' selected':''}>${esc(L(t[1],t[2]))}</option>`).join('');
  const ws=$('#bp_owtype');
  if(ws)ws.innerHTML=`<option value="0">${esc(L('不限','Any'))}</option>`+WTYPES.map((t,i)=>`<option value="${i+1}"${o.wtype===i+1?' selected':''}>${esc(wtTxt(t))}</option>`).join('');
  const cs=$('#bp_ocon');
  if(cs)cs.innerHTML=OPT_CKINDS.map(k=>`<option value="${k[0]}">${esc(L(k[1],k[1]))}</option>`).join('');
  const box=$('#optcons');
  if(box){
    box.innerHTML=o.cons.length?o.cons.map((c,i)=>{
      const spec=optCKindOf(c.key);
      const nm=spec?L(spec[1],spec[1]):c.key;
      const op=c.op==='max'?'≤':'≥';
      return `<button type="button" class="chip on" data-act="optcdel" data-i="${i}" aria-label="${esc(L('去掉这条条件','Remove'))}">${esc(nm)} ${op} ${esc(fmtN(c.val))} ✕</button>`;
    }).join(''):`<span class="hint tiny">${esc(L('可不加条件','no constraint'))}</span>`;
  }
  const lw=$('#bp_olockw');
  if(lw)lw.checked=!!o.lockW;
  const rb=$('#optreq');
  if(rb)rb.innerHTML=reqBlock();
  /* 条件折起来之后摘要上也要看得见设了几条（现算，不写死、不另起一句解释） */
  const sm=document.getElementById('optreq_sum');
  if(sm)sm.textContent=L('已设 '+reqUsed(req())+'/6','set '+reqUsed(req())+'/6');
  renderOptRes();
  if(typeof restoreFocus==='function')restoreFocus();     // 同上：⑤⑥ 那几颗 chip 走的是这条直调路径
}
/* 结果面：装了哪把枪 / 哪六件 / 逐件徽标（具名 · 奇特 · 需原型）+ 三个量。只呈现结果。 */
function renderOptRes(){
  const box=$('#optres'),o=state.opt,res=o.res;
  if(!box)return;
  if(!res){
    /* ⚠️ 作废提示必须画在这里：`glock` 作废结果走的是 `state.opt.res=null`，函数在下面第一行就返回，
       原来把提示写在有结果的那段模板里 ⇒ 永远不显示（2026-10-15 自己踩的）。 */
    box.innerHTML=o.lockStale?`<div class="wnote">${esc(L('锁定已改变 · 结果已作废，请重新计算','Locks changed — the result was discarded; run it again.'))}</div>`:'';
    return;}
  if(o.applyFailure){box.innerHTML=`<div class="wnote">${esc(L('条件、数据或推荐结果已变化，未应用。请重新计算。','Conditions, data, or the result changed. Nothing was applied; calculate again.'))}</div>`;return;}
  if(!res.ok){
    const reason=res.why==='no-improvement'?L('在本次候选搜索中未找到优于当前配装的方案。现有配装未改变。','No improvement found in this candidate search. Your build is unchanged.'):
      res.why==='locked-piece-limit'?L('锁定的同一装备组已超过四件，或同品牌超过三件。请先解锁多余部位。','Locked pieces exceed four of one gear set or three of one brand. Unlock the extra slots first.'):
      res.why==='no-candidates'?L('候选池为空或锁定条件冲突。请检查武器类别、锁定与装备条件。','Empty candidate pool or conflicting locks. Check weapon type, locks and constraints.'):
      L('本次有限搜索未找到满足全部条件的完整配装；这不等于已证明无解。','The bounded search found no complete feasible build; this does not prove infeasibility.');

    /* 失败态要给出口，不只是「不行」：哪几条正在把解空间掐死，就让用户能一步松掉它们。 */
    const used=reqUsed(req()),nCons=arr(state.opt.cons).length;
    /* 三条出口，按「哪一条在掐死解空间」给：⑤⑥ 的件数下限 / 用户自己加的数值条件 / 全清。
       原来只给「放宽件数下限」一颗，而**数值条件**造成的无解（爆头伤害 ≥ 99999999 这种）
       实测结果区一颗按钮都没有 —— 最常用那条路径没有出口。 */
    const btns=(used?` <button type="button" class="mini" data-act="optloosen">${esc(L('放宽件数下限重算','Loosen min pieces & retry'))}</button>`:'')
      +(nCons?` <button type="button" class="mini" data-act="optdrop">${esc(L('去掉数值条件重算','Drop value conditions & retry'))}</button>`:'');
    box.innerHTML=`<div class="wnote">${esc(reason)}${btns}</div>`;
    return;
  }
  const goalFmt=v=>res.target==='skillout'?fmtN(v,2):fmt0(v);
  const proto=!!(state.bp&&state.bp.prototype);
  const wlbl=o.wtype>0?wtTxt(WTYPES[o.wtype-1]):L('不限','Any');
  const rows=res.gear.map((it,i)=>{
    const badges=[];
    if(it.kind==='exotic')badges.push(L('奇特','Exotic'));
    if(it.named||it.kind==='named')badges.push(L('具名','Named'));
    if(proto&&it.kind!=='exotic')badges.push(L('需原型','proto'));
    const bn=brandOrSetName(it);
    return `<div class="orow"><span class="oslot">${esc(optSlotLbl(i))}</span>
      <span class="onm">${it.gear_icon?iconImg(it.gear_icon.startsWith('gear/')?'fit/'+it.gear_icon:it.gear_icon):''}${esc(nmTxt(it))}</span>
      <span class="obn">${esc(bn)}</span><span class="obd">${esc(badges.join(' · '))}</span></div>`;
  }).join('');
  const composition=new Map();
  for(const it of res.gear){const key=it.set_code?'set:'+it.set_code:it.brand_code?'brand:'+it.brand_code:'item:'+optPieceKey(it);const entry=composition.get(key)||{name:brandOrSetName(it)||nmTxt(it),n:0,set:!!it.set_code};entry.n++;composition.set(key,entry);}
  const setSummary='<div class="opt-composition">'+Array.from(composition.values()).sort((a,b)=>b.n-a.n).map(x=>'<span'+(x.set?' class="opt-set"':'')+'>'+esc(x.name)+' ×'+x.n+'</span>').join('')+'</div>'
    +'<p class="opt-composition-note">'+esc(L('同一装备组最多四件；六红指六个武器伤害核心，不是六件同套装。','At most four pieces of one gear set. Six red cores do not mean six pieces of that set.'))+'</p>';
  const r=res.currentR||res.r||{};
  /* 「撤销」只在真的改过东西时出现（`changed` 由 `applyOpt()` 记账）。
     ⚠️ 本轮把「算出来」和「落到配装台」拆成两下：原来 `#optrun` 一点就直接重排 6 格 + 清词条，
     玩家手配半小时在**没有任何预览**的情况下被覆盖，回头的「撤销」还藏在结果文字流末尾。
     现在预览态给「应用到配装台」/「不要这套」，落地之后才换成「撤销」。 */
  /* 应用完但一格都没换（结果 == 当前装配）也要有落点，不然用户以为没点上。 */
  const done=(o.applied&&o.changed===0)
    ? `<button type="button" class="mini ghost" data-act="optx">${esc(L('已是这套','Already applied'))}</button>` : '';
  const act=!o.applied
    ? `<button class="mini optapply" data-act="optapply">${esc(L('仅应用装备','Apply gear only'))}</button>`
      +`<button class="mini ghost" data-act="optx">${esc(L('不要这套','Discard'))}</button>`
    : ((o.undo&&o.changed>0)
      ? `<button class="mini" data-act="optundo" id="optundo">${esc(L('撤销','Undo'))}</button>` : done);
  box.innerHTML=`<p class="hint">${esc(L('有限候选搜索 · 未支持效果不参与评分 · 非全局最优保证','Bounded candidate search · unsupported effects excluded · no global-optimum guarantee'))} · ${res.calls||0} ${esc(L('次搜索评分','search evaluations'))} · ${res.cover?.metrics?.overheadEvaluations??'—'} ${esc(L('次附加评分','overhead evaluations'))} · ${res.cover?.metrics?.engineComputeCalls??'—'} ${esc(L('次引擎计算','engine computations'))}</p><p>${esc(res.context?.mode==='theoretical'?L('理论满条件目标','Theoretical full-condition target'):L('当前条件目标','Current-condition target'))}: ${esc(L(optTargetOf(res.target)[1],optTargetOf(res.target)[2]))} ${res.baseline==null?'—':goalFmt(res.baseline)} → ${goalFmt(optTargetValue(res.r,res.target))} · ${esc(L('应用装备后的当前条件值','After applying gear, under current conditions'))}: ${goalFmt(res.currentV)}</p><div class="ohead">${esc(L('武器类别','Weapon type'))} ${esc(wlbl)} · ${esc(nmTxt(res.w))}${act}</div>
    ${setSummary}${rows}
    <div class="onum">${esc(L('单发伤害','Bullet'))} <b>${esc(fmt0(r.BulletDamage))}</b> ·      ${esc(L('爆发 DPS','Burst'))} <b>${esc(fmt0(r.DPS))}</b> ·
      ${esc(L('当前条件的弹匣快照','Current magazine snapshot'))} <b>${esc(fmt0(r.SDPS))}</b></div>`
    /* 设了条件时，照实说这一套是带着几条条件交出来的。交付的那套**必然满足全部谓词**
       （`optimizeBuild()` 的 `best` 只收 `miss===0`），所以这里不给「没凑上条件」那一档：
       凑不上走的是 `ok:false` 分支，那边按 `why` 给「放宽件数下限 / 去掉数值条件重算」的出口。
       —— 原来这段挂在恒为 false 的 `res.fitQ` 上，永远不渲染（`docs/HANDOFF.md` 记过的死标志）。 */
    +(res.fitQ?`<div class="wnote">${esc(L('推荐评分条件下满足 '+res.fitUsed+' 条条件；应用仅改装备','Meets '+res.fitUsed+' constraint(s) under the scoring context; applying changes gear only'))}</div>`:'')
    +(o.applied&&o.changed>0?`<div class="wnote">${esc(L('已应用：换掉 '+o.changed+' 格'+((o.changedSlots||[]).length?'（'+o.changedSlots.join('、')+'）':'')+'，可点「撤销」回退','Applied: replaced '+o.changed+' slot(s)'+((o.changedSlots||[]).length?' ('+o.changedSlots.join(', ')+')':'')+' — Undo available'))}</div>`:'');
}
/* 把优化结果落进页面状态。返回被换掉的格位数（-1 = 没有可用的优化结果）。
   ⚠️ 清词条的判据必须与 `optimizeBuild()` 的评分口径**逐字一致**（见 `build.opt.js` 的「口径护栏 ②」）：
   评分时**只有锁定的格**保留词条 ⇒ 交付时也只有锁定格保留，其余格一律清空。
   （曾写成「同格同件就留着词条」，看着更体贴，但那样「交付的配装」比「评分的配装」多带词条，
   两个数字从此对不上 —— 2026-09-13 真机冒烟抓的正是这个：SDPS 17,743,961 vs 重算 17,278,218。）
   ① 锁定的格（`opt.lock[i]`）件没换 ⇒ 件与词条都原样保留；
   ② 落完之后**必须能回头**：应用前存快照，结果条上给「撤销」（`optRestore`）。 */
function optSnap(){return Object.fromEntries(['wslots','wactive','slots','core','affix','axopen','gtal','talents','gmods','wmods','waffix','bp'].map(k=>[k,JSON.parse(JSON.stringify(state[k]))]));}
function optRestore(s){if(!s)return false;for(const k of Object.keys(s))state[k]=JSON.parse(JSON.stringify(s[k]));state.opt.undo=null;state.opt.res=null;renderAll();if(typeof hubFeedback==='function')hubFeedback(L('已撤销，原装备已恢复','Undone. Your previous equipment is restored.'));return true;}
/* 优化结果 → 界面状态。返回被换掉的格位数（0 = 结果与当前配装一致，什么都没动）。
   ⚠️ 词条口径（2026-09-14 改，别改回去）：`optimizeBuild()` 的交付**自带 core/affix**
   （`res.core` / `res.aff`，由收尾段 `reqPolish()` 在冠军那套上算出来的）。
   所以这里必须**照抄结果里的那一份**，不能像原来那样一律 `=null` / `=[]` ——
   原来的写法在「用户设了 ⑤ 核心池 / ⑥ 副属性池」时会让**交付的那套丢掉刚算出来的词条**，
   于是「交付的配装」又不等于「评分的配装」（2026-09-13 那个 1.0271 倍的老坑换了个形状）。 */
function applyOpt(){
  const res=state.opt&&state.opt.res;
  if(!res||!res.ok)return -1;
  const checked=optRecheckResult(res);
  if(!checked.ok){state.opt.applyFailure=checked.why;return -1;}
  const before=optSnap(),previousUndo=state.opt.undo;
  try{
    const names=[];
    for(let i=0;i<6;i++){
      const raw=res.gear[i].raw;
      if(raw!==before.slots[i]||res.core[i]!==before.core[i]||JSON.stringify(res.aff[i])!==JSON.stringify(before.affix[i])||res.gtal[i]!==before.gtal[i]||res.gmods[i]!==before.gmods[i])names.push(optSlotLbl(i));
      if(state.opt.lock&&state.opt.lock[i])continue;
      state.slots[i]=raw;state.core[i]=res.core[i];state.affix[i]=res.aff[i].slice();
      state.gtal[i]=res.gtal[i];state.gmods[i]=res.gmods[i];
    }
    const ws=res.wslot;
    const oldW={raw:before.wslots[ws],talent:before.talents[ws],mods:before.wmods[ws],affix:before.waffix[ws]};
    const newW={raw:DB.weapons.indexOf(res.w),talent:res.talents[ws],mods:res.wmods[ws],affix:res.waffix[ws]};
    if(JSON.stringify(optStable(oldW))!==JSON.stringify(optStable(newW)))names.push(L('武器/天赋/配件','Weapon / talent / mods'));
    if(!state.opt.lockW){
      state.wslots[ws]=newW.raw;state.talents[ws]=newW.talent;
      state.wmods[ws]=Object.assign({},newW.mods||{});state.waffix[ws]=newW.affix;
    }
    state.wactive=ws;state.axopen=-1;
    const actual=evalBuild(res.w,res.gear,{});
    if(optTargetValue(actual,res.target)!==res.currentV)throw new Error('Applied score mismatch');
    state.opt.undo=before;state.opt.applyFailure='';state.opt.changedSlots=names;
    return names.length;
  }catch(e){
    for(const key of Object.keys(before))state[key]=buildClone(before[key]);
    state.opt.undo=previousUndo;state.opt.applyFailure='apply-score-mismatch';return -1;
  }
}
function askOpt(){
  /* 「计算中」必须真看得见 ⇒ 让出一帧再算（优化是同步几百毫秒的活，不隔这一帧就是
     「点了没反应 → 咔一下整页重排」）。冒烟那侧对应地要等这一帧（见 ui_smoke.mjs 的 bopt 探针）。 */
  if(state.opt.busy)return;
  state.opt.busy=true;
  const sp=$('#optspin'),button=$('#optrun');
  if(sp){sp.setAttribute('role','status');sp.setAttribute('aria-live','polite');sp.innerHTML='<span class="spin"></span> '+esc(L('正在搜索配装…','Searching builds…'));}
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
  const launch=()=>setTimeout(runOptNow,0);
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>requestAnimationFrame(launch));else launch();
}
function runOptNow(){
  const o=state.opt,sp=$('#optspin');
  let res=null,err='';
  try{
    res=optimizeBuild({flow:o.flow,target:o.target,wtype:o.wtype,constraints:o.cons.slice(),
      lock:o.lock.slice(),lockW:!!o.lockW,wslot:state.wactive>=0?state.wactive:0,maxRounds:4});
  }catch(e){err=(e&&e.message)||String(e);}
  finally{o.busy=false;if(sp)sp.innerHTML='';const button=$('#optrun');if(button){button.disabled=false;button.setAttribute('aria-busy','false');}}
  if(err){if(typeof hubFeedback==='function')hubFeedback(L('配装计算失败，请重试','Build search failed; please retry'),'error');o.res=null;o.applied=false;const b=$('#optres');if(b)b.innerHTML=`<div class="wnote">${esc(L('配装异常','Optimize error'))}: ${esc(err)}</div>`;return;}
  o.res=res;o.applied=false;o.lockStale=false;o.applyFailure='';  // 只到「算出来了」为止 —— 动用户的装配是 commitOpt() 那一下
  renderAll();
  if(typeof hubFeedback==='function')hubFeedback(res?.ok?L('推荐已生成，尚未改变当前装备','Recommendation ready. Your equipment is unchanged.'):L('未找到可推荐的完整配装，请检查条件与锁定','No complete recommendation. Check constraints and locked pieces.'),res?.ok?'status':'error','#optres');
  document.getElementById('optres').scrollIntoView({block:'nearest'});
}
/* 「应用到配装台」= 唯一会改用户手配的那一下；改完仍然可以「撤销」（`applyOpt()` 自己存快照）。 */
function commitOpt(){
  const o=state.opt;
  if(!o.res||!o.res.ok)return;
  o.changed=applyOpt();o.applied=o.changed>=0;renderAll();
  if(typeof hubFeedback==='function')hubFeedback(o.applied?(o.changed?L('装备已应用，可撤销；战斗条件未改变','Equipment applied. Undo is available; combat conditions are unchanged.'):L('当前已是这套装备','This equipment is already applied')):L('未应用，请重新计算','Not applied. Please search again.'),o.applied?'status':'error','#optres');
}

/* ── 渲染：技能 Q/E ── */
function renderSkills(){
  $('#skstrip').innerHTML=[0,1].map(k=>{
    const si=state.skill[k], s=si<0?null:SKILLS[si];
    const sv=s?skillVariantOf(s,state.skillVariant[k]):null;
    const key=k===0?'Q':'E';
    return `<div class="scard${s?' filled':''}" data-act="skl" data-k="${k}" tabindex="0" role="button" aria-label="${esc(L('选择技能','Pick skill'))} · ${key}">      <span class="keycap">${key}</span>
      ${s?`<img loading="lazy" decoding="async" src="${imgUrl((sv&&sv.icon)||skillIconOf(s))}" onerror="this.remove()"><span class="scnm">${esc(sv?L(sv.zh||sv.en,sv.en||sv.zh):L(s.zh,SKILL_EN[s.zh]||s.zh))}<small>${sv?esc(L(s.zh,SKILL_EN[s.zh]||s.zh)):''}</small></span>`
         :`<span class="scnm" style="color:var(--mut)">${esc(L('点击选择技能','Click to pick a skill'))}</span>`}
      ${s?`<button class="scx" data-act="sklclr" data-k="${k}" title="${esc(L('移除','Remove'))}">${esc(L('卸','Off'))}</button>`:''}</div>`;
  }).join('');
}
function skillDbOf(s){
  if(!s)return null;
  return arr(DB.skills).find(x=>SKNORM(x.key)===SKNORM(s.id)||String(x.zh||'')===String(s.zh||''))||null;
}
function skillVariantOf(s,code){
  const db=skillDbOf(s),vs=arr(db&&db.variants);
  return vs.find(x=>x.code===code)||vs[0]||null;
}
function activeSkillTier(code){
  const wi=state.wactive>=0?state.wslots[state.wactive]:null;
  const w=arr(DB.weapons)[wi]||{dmg:0,rpm:60,mag:1,reload:1,range:0,type:'突击步枪'};
  try{
    const r=evalBuild(w,state.slots.map((x,i)=>gearOf(i)),{});
    let raw=Number(r.RawSkillTier==null?r.SkillTier:r.RawSkillTier)||0;
    if(String(code||'').startsWith('s_mod_shield_'))raw+=state.slots.reduce((n,_,i)=>n+(gearCoreFam(i,gearOf(i))==='def'?1:0),0);
    return state.bp.overcharge?7:Math.max(0,Math.min(6,Math.round(raw)));
  }catch(e){return 0;}
}
function skillExpertiseEffects(code,slot){
  const level=Math.max(0,Math.min(30,Math.floor(+(state.bp.skillExpertise||[])[slot]||0)));
  const rules=arr(DB.expertise_rules&&DB.expertise_rules.rules).filter(r=>arr(r.items).includes(code)&&!arr(r.exclude_items).includes(code));
  if(!rules.length)return null;
  return rules.flatMap(r=>arr(r.levels).filter(l=>(l.min<0||level>=l.min)&&(l.max<0||level<=l.max)).flatMap(l=>arr(l.effects).map(e=>Object.assign({},e,{value:e.formula.A*level*level+e.formula.B*level+e.formula.C}))));
}
function skillExpertiseText(code,slot){
  if(state.bp.pvp)return L('PvP 精通未计入：模式适用性待核验','PvP expertise excluded: applicability unverified');
  const rows=skillExpertiseEffects(code,slot);
  if(rows===null)return L('该技能精通映射待核验','Expertise mapping unverified');
  return rows.map(e=>L(e.zh||e.label,e.en||e.label)+' +'+fmtN(e.value*100)+'%').join(' · ')||L('精通 0','Expertise 0');
}
function skillEffectValue(e){return e&&e.val!=null?fmtN(e.val):'—';}
function skillPreviewHtml(d){
  const row=DLG_ROWS[d.skillPreview]||DLG_ROWS[0],s=row&&row[0],db=skillDbOf(s),vs=arr(db&&db.variants);
  if(!s||!db)return `<div class="pk-empty">${esc(L('技能数据未就绪','Skill data unavailable'))}</div>`;
  let v=vs.find(x=>x.code===d.skillVariant)||vs[0]||null;
  if(v&&!d.skillVariant)d.skillVariant=v.code;
  const tier=activeSkillTier(v&&v.code);
  const variantTabs=vs.map(x=>`<button type="button" class="skill-var${v&&v.code===x.code?' on':''}" data-act="skvar" data-v="${esc(x.code)}" aria-pressed="${v&&v.code===x.code?'true':'false'}">${x.icon?`<img loading="lazy" decoding="async" src="${imgUrl(x.icon)}" alt="">`:''}<span>${esc(L(x.zh||x.en,x.en||x.zh))}</span></button>`).join('');
  if(!v)return `<div class="pk-empty">${esc(L('没有可用分支','No variants'))}</div>`;
  const desc=L(v.desc_zh||v.desc_en,v.desc_en||v.desc_zh);
  const tiers=arr(v.tiers).map(t=>`<div class="skill-tier${tier===+t.req?' current':''}"><span>${esc(hubSkillTierLabel(t.tier))}</span><div>${arr(t.effects).map(e=>`<p><b>${esc(skillEffectValue(e))}</b><span>${esc(L(e.name_zh||e.name_en||e.attr,e.name_en||e.name_zh||e.attr))}</span></p>`).join('')||'—'}</div></div>`).join('');
  return `<div class="skill-preview-head"><div>${v.icon?`<img loading="lazy" decoding="async" src="${imgUrl(v.icon)}" alt="">`:''}<span><b>${esc(L(v.zh||v.en,v.en||v.zh))}</b><small>${esc(L(db.zh||db.en,db.en||db.zh))}</small></span></div><button type="button" class="mini primary" data-act="picks" data-row="${d.skillPreview}" data-v="${esc(v.code)}">${esc(L('装备到 '+(d.slot===0?'Q':'E'),'Equip '+(d.slot===0?'Q':'E')))}</button></div>`
    +`<div class="skill-variants">${variantTabs}</div>${desc?`<p class="skill-desc">${esc(desc)}</p>`:''}<p class="skill-desc">${esc(L("精通：","Expertise: ")+skillExpertiseText(v.code,d.slot))}</p>`
    +`<details class="skill-tier-details"><summary>${esc(L('技能分阶','Skill tiers'))} · ${esc(L('当前 ','Current '))}${esc(hubSkillTierLabel(tier))}</summary><div class="skill-tiers">${tiers}</div></details>`;
}
/* ── 渲染：天赋（官方 talents_official[]）──
   ⚠️ 原来这里是左侧一整张「武器天赋（专长 1）」卡片：一个全局 `state.talent` + 300 行列表常驻。
   现在天赋**长在武器卡上**（每个武器槽各自一个），列表改成点天赋名时弹出的选择器（`dlg.kind==='t'`），
   分类 chip 与搜索框跟着进弹窗。搜索取 `state.dlg.q`（与其余弹窗同一真值），分类取 `state.tkind`。 */
function talentName(i){const t=TALENTS[i];if(!t)return '';return (t.zh||t.en||t.name||'').trim();}
/* PvP 开关下面的说明行：**现算**官方给了 PvP 数值的天赋条数（不写死），并给出「与 PvE 不同」的那部分。
   用户第 268 轮：「PVP数值也没有加进去，我需要配装器加上 PVP 开关」。 */
function renderPvpNote(){
  /* 原来这里印的是「官方给 430 条天赋写了 PvP 数值，其中 404 条与 PvE 不同」——
     那是**账目**（UI 硬规则①：只呈现结果）。现在只说这一套**当前按什么算**。 */
  const el=$('#bp_pvp_note');if(!el)return;
  el.textContent=state.bp.pvp?L('当前按官方 PvP 数值计算天赋','Talents use official PvP values'):'';
}
/* 天赋选择器的候选行（弹窗用）：按分类 + 关键词过滤，返回 [t, 下标] */
function talentRows(){
  const q=(state.tq||'').trim().toLowerCase();
  const rows=[];
  TALENTS.forEach((t,i)=>{
    if(state.tkind&&(t.kind_zh||'')!==state.tkind)return;
    if(q&&!((t.zh||'')+(t.en||'')+(t.name||'')+(t.kind_zh||'')+(t.desc_zh||'')+(t.desc_en||'')).toLowerCase().includes(q))return;
    rows.push([t,i]);
  });
  return rows;
}
function renderTweaks(){
  $('#tweaks').innerHTML=state.tweaks.map((t,i)=>`<div class="trow">
    <input class="tname" data-act="tw-n" data-i="${i}" value="${esc(t.name)}" list="attrnames" placeholder="${esc(L('属性名(如 武器伤害)','Attr e.g. 武器伤害'))}">
    <select data-act="tw-u" data-i="${i}"><option value="%">%</option><option value="">${esc(L('原值','flat'))}</option></select>
    <input type="number" data-act="tw-v" data-i="${i}" value="${t.val}" step="any">
    <button class="mini ghost" data-act="tw-del" data-i="${i}" title="${esc(L('删除','Remove'))}">✕</button></div>`).join('');
  $('#tweaks').querySelectorAll('select').forEach((s,i)=>{s.value=state.tweaks[i].unit||'%';});
}
/* 装备抽屉第一屏：品牌 / 装备组 / 具名 / 奇特 四堆块，点一下直接填入该部位（参考工具的形态） */
function gearWallHtml(d){
  const q=(d.q||'').trim().toLowerCase();
  const g=gearWallGroups(d);
  const keep=x=>!q||String(x.zh||'').toLowerCase().indexOf(q)>=0;
  const tile=(x,cls,slot)=>`<button type="button" class="gtile ${cls}" data-act="gfill" data-i="${slot}" data-k="${esc(x.key)}" title="${esc(x.zh)}">`
    +(x.icon?iconImg(x.icon,'gic'):silIcon(slot,'--mut'))
    +`<span class="gn">${esc(x.zh)}</span></button>`;
  const sec=(zh,en,list,cls,open)=>{
    const keep2=list.filter(keep);
    if(!keep2.length)return '';
    if(!q&&d.wallkind!==cls)return '';
    return (q?`<h4 class="gwall-heading">${esc(L(zh,en))}</h4>`:'')+`<div class="gwall">${keep2.map(x=>tile(x,cls,d.slot)).join('')}</div>`;
  };
  return sec('品牌','Brands',g.brand,'tb',true)
    +sec('装备组','Gear sets',g.set,'ts',false)
    +sec('具名','Named',g.named,'tn',false)
    +sec('奇特','Exotic',g.exotic,'te',false)
    ||`<div class="pk-empty">${esc(L('没有匹配的装备，请调整搜索词','No matching gear. Try another search.'))}</div>`;
}
/* ── 通用选择器弹窗 ── */
/* 弹窗行用「行号」而非下标传递身份：data-i="0" 与「无 data-i」在 dataset 里无法区分，
   所以选择器把当前列表存进 DLG_ROWS，点击时按行号取回真实身份（GEAR 下标 / 原始下标）。 */
let DLG_ROWS=[];
/* 该部位下可直填的堆：品牌 / 装备组（每组取代表件）+ 具名 / 奇特（逐件） */function gearWallGroups(d){
  const g={brand:[],set:[],named:[],exotic:[]};
  for(let k=0;k<GEAR.length;k++){
    const x=GEAR[k];if(!x||x.slot_idx!==d.slot)continue;
    if(x.kind==='named'){g.named.push({key:'raw:'+x.raw,zh:nmTxt(x),icon:x.gear_icon||'',n:1});continue;}
    if(x.kind==='exotic'){g.exotic.push({key:'raw:'+x.raw,zh:nmTxt(x),icon:x.gear_icon||'',n:1});continue;}
    const key=gearGroupKey(x);if(!key)continue;
    const bucket=x.kind==='gearset'?g.set:g.brand;
    let row=bucket.filter(y=>y.key===key)[0];
    if(!row){row={key:key,zh:brandRowName(key),icon:brandRowIcon(key),n:0,rep:x.raw};bucket.push(row);}
    row.n++;
  }
  return g;
}
/* 品牌 / 装备组的官方图标与名字（取自 `DB.brands[]`，装备组也在那张表里，带 is_gearset） */
/* ⚠️ 码有两套写法且**短码在品牌与装备组之间撞车**：件上 `set_code='a1'`、`brand_code='set_a1'`，
   而 `DB.brands` 里装备组行 `code='set_a1'`、普通品牌行 `code='a1'`（= 冷漠）。
   原来按原码相等比较 ⇒ 装备组先按「is_gearset」找不到 'a1'，回退时又不看类型，
   抓到普通品牌「冷漠」的名字与 brand27.png ⇒ 装备组整排图标与名字全错（用户真机抓到）。
   现在两边都剥掉 `set_` / `brand_` 前缀再比，且类型必须对上；回退也只在同类型里找。 */
function brandRowOf(key){
  const norm=c=>String(c==null?'':c).replace(/^(set|brand)_/,'').toLowerCase();
  const code=norm(String(key).replace(/^(brand|set):/,''));
  const wantSet=String(key).indexOf('set:')===0;
  const list=arr(DB.brands);
  for(let i=0;i<list.length;i++){
    const b=list[i];if(!b)continue;
    if(norm(b.code||b.key)!==code)continue;
    if(!!b.is_gearset!==wantSet)continue;
    return b;
  }
  for(let i=0;i<list.length;i++){
    const b=list[i];if(!b)continue;
    if(norm(b.code||b.key)!==code)continue;
    if(!!b.is_gearset===wantSet)continue;      // 同类型没有才允许跨类型兜底
    return b;
  }
  return null;
}
function brandRowName(key){const b=brandRowOf(key);return (b&&L(b.zh||b.en||b.name,b.en||b.zh||b.name))||reqBrandName(key)||key;}
function brandRowIcon(key){const b=brandRowOf(key);return (b&&b.icon)||'';}
/* 点品牌块 = 填该品牌在该部位的**代表件**（官方库里该组的第一件）；具名 / 奇特块直接填那一件 */
function gearFillFromKey(slot,key,source){
  const raw=String(key).startsWith('raw:')?+String(key).slice(4):gearRepRaw(slot,key);
  buildPickerSelect('g',raw,source||document.activeElement);
}
function gearRepRaw(slot,key){
  for(let k=0;k<GEAR.length;k++){
    const x=GEAR[k];if(!x||x.slot_idx!==slot)continue;
    if(gearGroupKey(x)===key)return x.raw;
  }
  return null;
}
/* 固定天赋也能点开看：只读弹窗（不可更换）。 */
function showTalentInfo(i){
  const w=DB.weapons[state.wslots[i]];
  const t=weaponFixedTalent(w)||(state.talents[i]>=0?TALENTS[state.talents[i]]:null);
  if(!t)return;
  const nm=L(t.zh||t.en||'',t.en||t.zh||'');
  const pvp=!!(state.bp.pvp&&talentPvpDiff(t));
  const m=$('#dlgmask'),d=$('#dlg');
  state.dlg=null;
  const html='<div class="dlg-hd"><span class="dlg-title">'+esc(L('武器天赋','Weapon talent'))+'</span><span class="sp"></span>'
    +'<button class="mini" data-act="dlgx" title="'+esc(L('关闭','Close'))+'">'+esc(L('关闭','Close'))+'</button></div>'
    +'<div class="dlg-list"><div class="talinfo">'+(talIcon(t,'tic')||'')
    +'<div class="talinfo-body"><div class="talinfo-nm">'+esc(nm)+(pvp?' <span class="pvpbadge on">PvP</span>':'')+'</div>'
    +'<p>'+(talentDescHtml(t,false)||'')+'</p></div></div></div>';
  requestAnimationFrame(()=>{d.innerHTML=html;m.classList.add('on');if(!m.open)m.showModal();});
}
function openDlg(kind,slot,wslot){
  /* `wkind` = 武器选择器的**类别维度**（金装 / 具名 / 奇特），与装备选择器的 `gkind` 同款。
     参考工具的类别是 `Rarity`（0 金装 / 1 装备组 / 2 具名 / 3 奇特，见 `HighendGear.cs` 等），
     我们库里武器**没有** rarity 字段，但有官方 `exotic` / `named` 两个布尔 ⇒ 用它等价判定。 */
  /* `opener` = 按下这张卡的那颗元素；关掉弹窗要把焦点还回它（否则键盘用户每次都被丢回页首）。
     卡片重渲后原节点会脱链 ⇒ 那时按 `kind/slot` 找回**同一格**的新节点（见 renderAll 末尾的 refocusBack）。 */
  /* 武器选择器的默认筛选 = **这一槽那把枪自己的**枪型与类别（空槽退到三槽里任意一把的），
     没有「全部」这一档（用户：想选什么都很明确）—— 400+ 行摊开等于没筛。 */
  const dw=(kind==='w')?arr(DB.weapons)[state.wslots[slot]]:null;
  state.dlg={kind:kind,slot:slot,q:'',mode:(kind==='g'?'wall':'list'),
    wtype:(dw&&dw.type)?(WTYPES.indexOf(dw.type)+1||0):0,wkind:dw?wKindOf(dw):'',gkind:'',wallkind:'tb',sub:'',wslot:(wslot==null?null:wslot),
    skillPreview:(kind==='s'&&state.skill[slot]>=0)?state.skill[slot]:0,
    skillVariant:(kind==='s'&&state.skillVariant[slot])?state.skillVariant[slot]:null,
    scrollY:window.scrollY,scrollX:window.scrollX,
    openerDialog:document.activeElement?.closest('dialog')?.id||'',openerAction:document.activeElement?.dataset?.act||'',
    opener:document.activeElement&&document.activeElement!==document.body?document.activeElement:null};
  renderDlg();
}
function closeDlg(){
  const d=state.dlg;
  /* ⚠️ 只有**真的关一个开着的弹窗**时才登记「焦点回还目标」：`renderAll()` 的 else 分支每次重渲都会
     调一次 `closeDlg()`（那时 `state.dlg` 早就是 null），无条件覆盖会把刚记下的目标清成 null
     ⇒ 键盘用户 Esc 关掉弹窗后焦点掉回页首（真机探针实测到）。 */
  if(d){
    state.dlgBack=d.slot!=null?{kind:d.kind,slot:d.slot,wslot:d.wslot,dialog:d.openerDialog,action:d.openerAction}:null;
    // Focus is restored after leaving the modal top layer, not while its opener is inert.
  }
  state.dlg=null;const m=$('#dlgmask');m.classList.remove('on');if(m.open)m.close();$('#dlg').innerHTML='';
  const op=d?.opener?.isConnected?d.opener:d?.openerDialog?document.getElementById(d.openerDialog)?.querySelector(d.openerAction?'[data-act="'+CSS.escape(d.openerAction)+'"]':'button'):null;
  if(op&&typeof op.focus==='function')op.focus({preventScroll:true});
  if(typeof setBgInert==='function')setBgInert(false);
  if(d)requestAnimationFrame(()=>{if(!state.dlg)window.scrollTo({top:d.scrollY||0,left:d.scrollX||0,behavior:'instant'});});
}
/* Esc 由原生 `<dialog>` 自己关掉时不走 `closeDlg()` ⇒ `state.dlg` 会留着（下次渲染以为还开着弹窗，
     焦点回还目标也丢）。这里补一条 `close` 收尾，与点遮罩那条路径同一口径。
     事件触发时 `m.open` 已是 false，`closeDlg()` 里的 `if(m.open)m.close()` 不会再进一层。 */
document.getElementById('dlgmask').addEventListener('close',()=>{if(state.dlg&&!document.getElementById('dlgmask').open)closeDlg();});
/* 弹窗关掉之后（多数是刚选完一件装备、整列卡片刚被重渲）把焦点送回那一格。 */
function refocusBack(){
  const b=state.dlgBack;if(!b)return;state.dlgBack=null;
  const parentDialog=b.dialog?document.getElementById(b.dialog):null;
  if(parentDialog?.open){const source=parentDialog.querySelector(b.action?'[data-act="'+CSS.escape(b.action)+'"]':'button');source?.focus({preventScroll:true});return;}
  const sel=b.kind==='g'?'[data-act="gcard"][data-i="'+b.slot+'"]'
        :(b.kind==='w'?'[data-act="wsl"][data-i="'+b.slot+'"]'
        :(b.kind==='s'?'[data-act="skl"][data-k="'+b.slot+'"]'
        :(b.kind==='m'?'[data-act="modblk"][data-i="'+b.slot+'"]'
        :(b.kind==='gt'?'[data-act="gtal"][data-i="'+b.slot+'"]'
        :(b.kind==='t'?'[data-act="wsl-tal"][data-i="'+b.slot+'"]'
        :(b.kind==='wm'?'[data-act="wmod"][data-i="'+b.slot+'"][data-s="'+b.wslot+'"]':''))))));
  const el=sel?document.querySelector(sel):null;
  if(el&&typeof el.focus==='function')el.focus({preventScroll:true});
}
/* 该部位 + 当前类别下，各品牌 / 装备组各有多少件（现算，不写死）。
   键 = `brand:<code>` / `set:<code>`，与 `state.dlg.sub` 同口径；按件数降序、同数按名字排。 */
function gearFacets(d){
  if(!d)return [];
  const wantSet=(d.gkind==='gearset');
  const m={};
  for(let k=0;k<GEAR.length;k++){
    const x=GEAR[k];if(!x||x.slot_idx!==d.slot)continue;
    if(d.gkind&&x.kind!==d.gkind)continue;
    const key=wantSet?(x.set_code?'set:'+x.set_code:''):(x.brand_code?'brand:'+x.brand_code:'');
    if(!key)continue;
    if(!m[key])m[key]={key:key,n:0,zh:reqBrandName(key)||key};
    m[key].n++;
  }
  return Object.keys(m).map(k=>m[k]).sort((a,b)=>(b.n-a.n)||a.zh.localeCompare(b.zh,'zh'));
}
function dlgTitle(){
  const d=state.dlg;if(!d)return '';
  if(d.kind==='w')return L('选择武器','Pick weapon')+' · '+L(W_SLOTS[d.slot][0],W_SLOTS[d.slot][1]);
  if(d.kind==='g')return L(d.mode==='list'?'按件挑装备':'选择装备','Pick gear')+' · '+L(G_SLOTS[d.slot][0],G_SLOTS[d.slot][1]);
  if(d.kind==='m')return L('选择插件','Pick mod')+' · '+L(G_SLOTS[d.slot][0],G_SLOTS[d.slot][1]);
  if(d.kind==='t')return L('选择武器天赋','Pick weapon talent')+' · '+L(W_SLOTS[d.slot][0],W_SLOTS[d.slot][1]);
  if(d.kind==='wm')return L('选择武器配件','Pick weapon mod')+' · '+L(W_SLOTS[d.slot][0],W_SLOTS[d.slot][1])+' · '+wmSlotLbl(d.wslot);
  return L('选择技能','Pick skill')+' · '+(d.slot===0?'Q':'E');
}
function renderDlg(){
  const d=state.dlg,m=$('#dlgmask');
  if(!d){closeDlg();return;}
  m.classList.add('on');
  /* `#dlgmask` 现在是 `<dialog>`（见 dashboard_build.html 的注释）：必须真 `showModal()` 才在 top layer 里，
     否则从词条抽屉里点「选择插件」会开了却看不见。留 `.on` 是给既有 CSS 定位用。 */
  if(!m.open)m.showModal();
  if(typeof setBgInert==='function')setBgInert(true);
  const box=$('#dlg');
  const active=box.contains(document.activeElement)?document.activeElement:null;
  const focusKey=active?.id?{id:active.id}:active?.dataset?.act?{act:active.dataset.act,i:active.dataset.i,k:active.dataset.k}:null;
  box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',dlgTitle());
  const canClear=(d.kind==='w'&&state.wslots[d.slot]!=null)||(d.kind==='g'&&state.slots[d.slot]!=null)||(d.kind==='m'&&state.gmods[d.slot]!=null)||(d.kind==='s'&&state.skill[d.slot]>=0)||(d.kind==='t'&&state.talents[d.slot]>=0)
    ||(d.kind==='gt'&&state.gtal[d.slot]!=null)
    ||(d.kind==='wm'&&(()=>{const w=arr(DB.weapons)[state.wslots[d.slot]];const b=state.wmods&&state.wmods[d.slot];return !!(b&&b[d.wslot]!=null&&w&&wmCands(w,d.wslot).indexOf(b[d.wslot])>=0);})());
  const needSearch=(d.kind==='w'||d.kind==='g'||d.kind==='t'||d.kind==='gt'||d.kind==='wm');
  /* 装备抽屉的搜索框：wall 模式下筛的是品牌 / 装备组 / 具名 / 奇特块的名字，list 模式下筛件名 */
  const gph=(d.kind==='g')?' placeholder="'+esc(L('搜索品牌 / 装备组 / 具名 / 奇特','Search brand / set / named / exotic'))+'"':'';
  let bar='';
  /* 装备抽屉的**块网格**那一屏不摆类别 chip：它既不参与块的筛选（`gearWallHtml` 只认搜索），
     又与下面四个分组标题重复报数（「品牌装备 53」是件数、「品牌 37」是组数）⇒ 同义文本只留一处。 */
  const gwall=(d.kind==='g'&&d.mode!=='list');
  if((needSearch||d.kind==='m')&&!gwall)bar=`<div class="dlg-bar"><input type="search" id="dlgq" value="${esc(d.q)}"${gph||` placeholder="${esc(L('搜索…','Search…'))}"`}><span class="chips" id="${d.kind==='w'?'dlgtypes':(d.kind==='t'?'dlgtkinds':'dlgkinds')}"></span></div>`;
  else if(gwall)bar=`<div class="dlg-bar"><input type="search" id="dlgq" value="${esc(d.q)}"${gph}></div>`;
  /* 装备选择器的**第二行维度**：类别选到「品牌装备 / 装备组」时，下面给出具体品牌 / 装备组
     （带该部位下的件数，运行时现算）。玩家路径 = 先点品牌，再点那件 —— 而不是在一百多行里翻名字。 */
  const facet=(d.kind==='g'&&d.mode==='list'&&(d.gkind==='brand'||d.gkind==='gearset'))
    ? `<details class="dlg-brand-facet"><summary>${esc(L(d.gkind==='gearset'?'筛选装备组':'筛选品牌',d.gkind==='gearset'?'Filter gear sets':'Filter brands'))}${d.sub?' · '+esc(brandRowName(d.sub)):''}</summary><div class="dlg-bar dlg-bar2"><span class="chips" id="dlgsub"></span></div></details>`:'';
  /* 武器选择器的**类别维度**（与装备选择器的 `gkind` 同款）：金装 / 具名 / 奇特。
     参考工具的类别 = `Rarity`（`HighendGear`=0 / `GearsetGear`=1 / `NamedGear`=2 / `ExoticGear`=3）；
     武器库里**没有** rarity 字段，但官方给了 `exotic` / `named` 两个布尔 ⇒ 等价判定（口径见 `wKindOf`）。 */
  const wfacet=(d.kind==='w')?`<div class="dlg-bar dlg-bar2"><span class="chips" id="dlgwkind"></span></div>`:'';
  $('#dlg').innerHTML=`<div class="dlg-hd"><span class="dlg-title">${esc(dlgTitle())}</span><span class="sp"></span>
      ${canClear?`<button class="mini ghost" data-act="dlgclr">${esc(L('卸下/清空','Unequip'))}</button>`:''}
      <button class="mini" data-act="dlgx" title="${esc(L('关闭','Close'))}">${esc(L('关闭','Close'))}</button></div>${bar}${gwall?`<div class="dlg-gear-nav" role="group" aria-label="${esc(L('装备类别','Gear category'))}">${[['tb','品牌','Brands'],['ts','装备组','Gear sets'],['tn','具名','Named'],['te','奇特','Exotic']].map(([key,zh,en])=>`<button type="button" data-act="dgwall" data-k="${key}" aria-pressed="${d.wallkind===key}">${esc(L(zh,en))}</button>`).join('')}<button type="button" data-act="glist">${esc(L('逐件挑','Per piece'))}</button></div>`:''}${facet}${wfacet}<div class="dlg-list" id="dlglist"></div>`;
  buildPickerMount();
  if(d.kind==='w'){
    $('#dlgtypes').innerHTML=WTYPES.map((t,i)=>`<button type="button" class="chip${d.wtype===i+1?' on':''}" data-act="dwtype" data-i="${i+1}" aria-pressed="${d.wtype===i+1?'true':'false'}">${esc(wtTxt(t))}</button>`).join('');
    const wk=$('#dlgwkind');
    if(wk){
      const n={all:0,highend:0,named:0,exotic:0};
      arr(DB.weapons).forEach(w=>{if(d.wtype>0&&w.type!==WTYPES[d.wtype-1])return;n[wKindOf(w)]++;n.all++;});
      /* 该枪型下这一档一颗都没有 ⇒ 自动落到有的那一档（否则列表空着像坏了） */
      if(d.wkind&&!n[d.wkind])for(let i=0;i<W_KINDS.length;i++){if(n[W_KINDS[i]]){d.wkind=W_KINDS[i];break;}}
      wk.innerHTML=W_KINDS.map(k=>`<button type="button" class="chip${d.wkind===k?' on':''}" data-act="dwkind" data-k="${k}" aria-pressed="${d.wkind===k?'true':'false'}">${esc(L(W_KIND_ZH[k][0],W_KIND_ZH[k][1]))} ${n[k]}</button>`).join('');
    }
  }else if(d.kind==='g'){
    const box=$('#dlgkinds');
    if(box){
      const have={};
      for(let k=0;k<GEAR.length;k++){const x=GEAR[k];if(x&&x.slot_idx===d.slot)have[x.kind]=(have[x.kind]||0)+1;}
      box.innerHTML=G_KINDS.filter(k=>have[k]).map(k=>`<button type="button" class="chip${d.gkind===k?' on':''}" data-act="dgkind" data-k="${k}" aria-pressed="${d.gkind===k?'true':'false'}">${esc(kindLbl(k))} ${have[k]}</button>`).join('');
    }
    const sb=$('#dlgsub');
    if(sb){
      const list=gearFacets(d);
      sb.innerHTML=list.map(f=>`<button type="button" class="chip${d.sub===f.key?' on':''}" data-act="dgsub" data-k="${esc(f.key)}" aria-pressed="${d.sub===f.key?'true':'false'}">${esc(f.zh)} <i>${f.n}</i></button>`).join('');
    }
  }else if(d.kind==='t'){
    /* 该枪能刷到的天赋（口径 = 枪型 + 稀有度，见 `talentPickerPool`；引擎认不认由 `talentSupported` 标灰）。
       「完美版」默认不列（那是具名件自带的加强版），要看得见就点右边那颗 chip —— **含完美版**。 */
    const pool=TALENTS.map((t,i)=>[t,i]).filter(([t])=>talentUsableBy(t,slotWeaponCls(d.slot)));
    const kinds={};
    pool.forEach(([t])=>{const k=t.kind_zh||'其它';kinds[k]=(kinds[k]||0)+1;});
    const box=$('#dlgtkinds');
    if(box)box.innerHTML=`<button type="button" class="chip${!state.tkind?' on':''}" data-act="tk" data-k="" aria-pressed="${!state.tkind?'true':'false'}">${esc(L('全部分类','All'))} ${pool.length}</button>`+
      T_KIND_ORDER.filter(k=>kinds[k]).map(k=>`<button type="button" class="chip${state.tkind===k?' on':''}" data-act="tk" data-k="${esc(k)}" aria-pressed="${state.tkind===k?'true':'false'}">${esc(L(k,k))} ${kinds[k]}</button>`).join('')+
      `<button type="button" class="chip${state.tperfect?' on':''}" data-act="tperfect" aria-pressed="${state.tperfect?'true':'false'}">${esc(state.tperfect?L('含完美版','incl. Perfect'):L('＋ 完美版','＋ Perfect'))}</button>`;
  }
  if(d.kind==='w'){
    const filters=document.createElement('div');filters.className='dlg-mobile-filters';
    filters.innerHTML=`<label>${esc(L('枪型','Weapon type'))}<select id="dlg-weapon-type" data-act="dlg-wtype"><option value="0">${esc(L('选择枪型','Choose weapon type'))}</option>${WTYPES.map((t,i)=>`<option value="${i+1}"${d.wtype===i+1?' selected':''}>${esc(wtTxt(t))}</option>`).join('')}</select></label><label>${esc(L('品质','Quality'))}<select id="dlg-weapon-kind" data-act="dlg-wkind"><option value="">${esc(L('全部品质','All qualities'))}</option>${W_KINDS.map(k=>`<option value="${k}"${d.wkind===k?' selected':''}>${esc(L(...W_KIND_ZH[k]))}</option>`).join('')}</select></label>`;
    box.querySelector('.dlg-bar').after(filters);
  }
  renderDlgList();
  /* Keep filter focus through redraw. Touch opens on Close so it does not
     summon the keyboard; desktop opens on search. */
  const cur=document.activeElement;
  if(cur&&cur!==document.body&&box.contains(cur))return;
  let f=focusKey?.id?document.getElementById(focusKey.id):focusKey?.act?[...box.querySelectorAll('[data-act]')].find(x=>x.dataset.act===focusKey.act&&x.dataset.i===focusKey.i&&x.dataset.k===focusKey.k):null;
  f=f||(matchMedia('(max-width:760px)').matches?box.querySelector('[data-act=dlgx]'):box.querySelector('#dlgq')||box.querySelector('.prow,.sTile'));
  if(f&&typeof f.focus==='function')f.focus({preventScroll:true});
}
function renderDlgList(){
  const d=state.dlg;if(!d)return;
  const box=$('#dlglist');if(!box)return;
  const q=d.q.trim().toLowerCase();
  DLG_ROWS=[];
  try{
  if(d.kind==='g'&&d.mode!=='list'){box.innerHTML=gearWallHtml(d);return;}
  if(d.kind==='w'){
    const cur=state.wslots[d.slot];
    if(!q&&!d.wtype){
      box.innerHTML=`<div class="pk-empty pick-start">${esc(L('未选择枪型','No weapon type selected'))}</div>`;      return;
    }
    const rows=arr(DB.weapons).map((w,i)=>[w,i]).filter(([w])=>{
      if(w.not_in_game||!buildWeaponRepresentative(w)||!combatWeaponAllowed(w,d.slot))return false;                       // 屏蔽的枪不许进手选列表（与优化器同一口径）
      if(d.wtype>0&&w.type!==WTYPES[d.wtype-1])return false;
      if(d.wkind&&wKindOf(w)!==d.wkind)return false;                    // 类别维度（金装 / 具名 / 奇特）
      if(!q)return true;
      return ((w.name||'')+' '+(w.zh||'')+' '+(w.en||'')+' '+(w.type||'')+' '+(w.type_en||'')).toLowerCase().includes(q);
    }).slice(0,80);
    DLG_ROWS=rows;
    box.innerHTML=rows.map(([w,i],k)=>`<div class="prow${cur===i?' on':''}" data-act="pickw" data-row="${k}" tabindex="0" role="button" aria-pressed="${cur===i?'true':'false'}">${iconImg(w.icon)}<div class="wbody"><div class="wname">${nmAlt(w)} <span class="walt">${esc(L(W_KIND_ZH[wKindOf(w)][0],W_KIND_ZH[wKindOf(w)][1]))}</span></div><div class="wstats"><span>${esc(wtTxt(w.type,w.type_en))}</span><span>DMG <b>${fmt0(w.dmg)}</b></span><span>RPM <b>${fmtN(w.rpm)}</b></span><span>MAG <b>${fmtN(w.mag)}</b></span></div>${attachHtml(w)}</div></div>`).join('')||`<div class="pk-empty">${esc(L('无匹配','No match'))}</div>`;
  }else if(d.kind==='g'){
    const curId=state.slots[d.slot];
    const rows=[];
    for(let k=0;k<GEAR.length;k++){
      const x=GEAR[k];if(!x)continue;
      if(x.slot_idx!==d.slot)continue;                                  // 只按官方 slot 字段所在部位出条目（buildGear 已按 G_SLOTID 顺序聚合）
      if(d.gkind&&x.kind!==d.gkind)continue;
      if(d.sub){                                                        // 品牌 / 装备组细分（第二行维度）
        const key=(d.gkind==='gearset')?(x.set_code?'set:'+x.set_code:''):(x.brand_code?'brand:'+x.brand_code:'');
        if(key!==d.sub)continue;
      }
      if(q&&!(((x.zh||'')+' '+(x.en||'')+' '+(x.name||'')+' '+(x.brand||'')+' '+(x.set_zh||'')+' '+(x.mitem||'')).toLowerCase().includes(q)))continue;
      rows.push([x,GEAR_ITEMS[x.raw],x.raw]);
    }
    const lim=rows.slice(0,300);
    DLG_ROWS=lim;
    let h=lim.map(([x,it,k],row)=>{
      const tn=gearTalent(it);
      const tal=tn?`<div class="pk-tal">${esc(L('天赋','Talent'))}: ${esc(tn)}</div>`:'';
      const rv=rarOf(x);
      return `<div class="prow${curId===k?' on':''}" data-act="pickg" data-row="${row}" tabindex="0" role="button" aria-pressed="${curId===k?'true':'false'}">${x.gear_icon?iconImg(x.gear_icon):silIcon(d.slot,rv[0])}<div class="wbody"><div class="wname">${esc(nmTxt(x))} <span class="walt">${esc(L(G_KIND_ZH[x.kind]||'',G_KIND_EN[x.kind]||''))}</span>${(it.slot_zh||x.slot_zh)?`<span class="walt">${esc(it.slot_zh||x.slot_zh)}</span>`:''}</div>${x.brand||x.set_zh?`<div class="wsub">${esc(x.set_zh||x.brand||'')}</div>`:''}${tal}</div><span class="badge ${curId===k?'gold':'dim'}">${esc(curId===k?L('已穿','Worn'):L('穿上','Equip'))}</span></div>`;
    }).join('');
    if(rows.length>lim.length)h+=`<div class="pk-empty">${esc(L('还有 '+(rows.length-lim.length)+' 件，输入关键词继续筛选','+'+(rows.length-lim.length)+' more — type to filter'))}</div>`;
    if(!rows.length)h=`<div class="pk-empty">${esc(L('该部位/类别无匹配（官方装备库共 '+DB.gear.length+' 件，六部位齐全）。','No match for this slot / category.'))}</div>`;
    box.innerHTML=h;
  }else if(d.kind==='t'){
    /* 该枪可用的武器天赋（口径见文件头的 `talentUsableBy`；引擎认不认由 `talentSupported` 标灰）。
       图标走官方 `talents_official[].icon`（阶段 9 从官方图集裁出的帧）—— 没有图标的条目**不占位不破图**。 */
    const cur=state.talents[d.slot];
    const rows=talentRowsFor(d.slot);
    const lim=rows.slice(0,260);
    DLG_ROWS=lim;
    let h=lim.map(([t,i],row)=>{
      const note=combatStatusText(t.key),counted=combatVisibleRows(t.key).length>0;
      const desc=talentDescPlain(t,!!state.bp.pvp),descHtml=talentDescHtml(t,!!state.bp.pvp);
      const params=talentParamLines(t,!!state.bp.pvp).map(x=>`<span>${hlNum(x)}</span>`).join('');
      const pv=talentPvpDiff(t)?`<span class="pvpbadge" title="${esc(L('该天赋有官方 PvP 数值','official PvP values'))}">${esc(L('PvP 有差异','PvP differs'))}</span>`:'';
      return `<div class="prow${cur===i?' on':''}" data-act="pickt" data-row="${row}" tabindex="0" role="button" aria-pressed="${cur===i?'true':'false'}" title="${esc(desc)}">
        ${talIcon(t,'tic mono-tal')}<div class="wbody"><div class="wname">${esc(talentName(i))} <span class="walt">${esc(t.kind_zh||'')}</span>${pv}</div>
        <div class="tal-desc">${descHtml||esc(L('（官方无描述）','(no official description)'))}</div>${params?`<div class="tal-params">${params}</div>`:''}${talentPvpDiff(t)?talentCompareHtml(t):''}${counted?'':`<div class="pk-tal unsup">${esc(note)}</div>`}</div>
        <span class="badge ${cur===i?'gold':'dim'}">${esc(cur===i?L('已选','Picked'):L('选择','Pick'))}</span></div>`;
    }).join('');
    if(rows.length>lim.length)h+=`<div class="pk-empty">${esc(L('还有 '+(rows.length-lim.length)+' 条，输入关键词继续筛选','+'+(rows.length-lim.length)+' more — type to filter'))}</div>`;
    box.innerHTML=h||`<div class="pk-empty">${esc(L('无匹配','No match'))}</div>`;
  }else if(d.kind==='wm'){
    /* 该枪该槽的候选配件（口径全在 `build.mods.js`：官方 `weapons[].slots` + 武器级 `slot_tags`
       与配件 `tags` 的特征词元判定；`fixed_mods` 预装件占用的槽不开候选）。
       ⚠️ 库里**没有**「武器×可装件」的精确真值表（官方只给单向的 190 条 `myPreattachedMods`），
          官方 `slot_tags` 只能给**候选超集**（对那 190 条召回 189）⇒ 卡面按「可选」呈现，
          不声称穷尽；带属性的件才列（379 件里 184 件有属性，其余是官方模板件、选中一个数都不动）。
       每件配件的属性行只有 1 条（实测最大 1），所以直接列出来，不做「还有 N 条」。 */
    const w=arr(DB.weapons)[state.wslots[d.slot]];
    const all=wmCands(w,d.wslot);
    const rows=all.map(i=>[arr(DB.mods)[i],i]).filter(([m])=>!q||((buildModLabel(m))+' '+(m.en||'')+' '+(m.desc_zh||'')).toLowerCase().includes(q));
    DLG_ROWS=rows;
    const cur=(state.wmods&&state.wmods[d.slot])?state.wmods[d.slot][d.wslot]:null;
    let h=rows.map(([m,i],row)=>{
      const a=wmAttrRows(m)[0];
      /* 行名用官方显示名 `a.name`，不用归一键 `a.key`：`attrKey()` 已把单位折进键里，
      再拼一次 `a.unit` 就印成「装弹速度% +14%」（实测该弹窗 17 件候选每行都这样、title 同）。 */
      const av=a?`${esc(a.name||a.key)} ${a.val>=0?'+':''}${fmtN(a.val)}${esc(a.unit||'')}`:esc(L('不改变数值','no numbers'));
      const mic=wmICON[d.wslot]?`<img loading="lazy" decoding="async" src="${dbIcon('/assets/db/img/'+wmICON[d.wslot])}" alt="" onerror="this.remove()">`:'';
      return `<div class="sTile mTile${cur===i?' on':''}" data-act="pickwm" data-row="${row}" tabindex="0" role="button" aria-pressed="${cur===i?'true':'false'}" title="${esc(buildModLabel(m)+' '+(a?(a.name||a.key)+' '+(a.val>=0?'+':'')+fmtN(a.val):''))}">${mic}`
        +`<div style="min-width:0"><div class="wname" style="font-size:11.5px">${esc(buildModLabel(m))}</div>`
        +`<span class="wmod-a${a?'':' dim'}">${av}</span>`
        +`${m.desc_zh?`<div class="mdesc">${esc(m.desc_zh)}</div>`:''}</div></div>`;
    }).join('');
    if(!all.length)h=`<div class="pk-empty">${esc(L('该枪这一槽没有可换的配件','No replaceable mod for this slot'))}</div>`;
    box.innerHTML=`<div class="dlg-grid mgrid">${h}</div><div class="pk-empty">${esc(L('按官方安装位标签匹配，共 '+all.length+' 件','socket-tag matches: '+all.length))}</div>`;
  }else if(d.kind==='m'){
    const cur=state.gmods[d.slot];
    const ms=(GMODS||[]).map((m,i)=>[m,i]).filter(([m])=>!q||((buildModLabel(m))+' '+(m.en||'')+' '+(m.desc_zh||'')).toLowerCase().includes(q));
    DLG_ROWS=ms;
    box.innerHTML=`<div class="dlg-grid mgrid">`+ms.map(([m,i],row)=>`<div class="sTile mTile${cur===i?' on':''}" data-act="pickm" data-row="${row}" tabindex="0" role="button" aria-pressed="${cur===i?'true':'false'}" title="${esc(modTitle(m))}">${modGlyph(m,'mdot mglyph '+modColor(m))}<div style="min-width:0"><div class="wname" style="font-size:11.5px">${esc(buildModLabel(m))}</div><b>+${fmtN(modVal(m))}${esc(m.unit||'')}</b>${m.max!=null?`<span class="walt">${esc(L('满值','Max'))} ${fmtN(m.max)}${esc(m.unit||'')}</span>`:''}${m.desc_zh?`<div class="mdesc">${esc(m.desc_zh)}</div>`:''}${m.threshold?`<div class="mdesc">${esc(L('面板上限','Panel cap'))}: ${esc(m.threshold)}</div>`:''}</div></div>`).join('')+`</div>`;
  }else if(d.kind==='gt'){
    /* 装备天赋（背包 / 胸甲）：池与值全在 `build.gtal.js`（对照复刻 BuildTool 的 `AppData.TalentData[Num-2]`）。
       ⚠️ 每一行用 `combatStatusText` / `combatGearRows` 标当前有没有喂进枪械结果。选中不会自动满层。
       ⚠️ 具名/奇特件的天赋是**件自带的固定那条**（`locked`）⇒ 不可换、给 `data-act="noop"`，
          不是「隐藏」：页面上要看得见它是什么、参不参与计算。 */
    const pool=gtalPool(d.slot),it=gearOf(d.slot);
    const cur=pool.locked?'':(state.gtal[d.slot]||'');
    const rows=pool.keys.map(k=>[k,TALENT_BY_KEY[k]||{zh:(gearTalent(it)||k),en:'',desc_zh:''}])
      .filter(([k,t])=>!q||(((t.zh||'')+' '+(t.en||'')+' '+(t.desc_zh||'')).toLowerCase().includes(q)));
    DLG_ROWS=rows;
    let h=rows.map(([k,t],row)=>{
      const note=combatStatusText(k),counted=combatVisibleRows(k).length>0,on=(cur===k)||(pool.locked&&pool.keys.length===1);
      const desc=talentDescPlain(t,!!state.bp.pvp),descHtml=talentDescHtml(t,!!state.bp.pvp);
      const params=talentParamLines(t,!!state.bp.pvp).map(x=>`<span>${hlNum(x)}</span>`).join('');
      const badge=pool.locked?L('件自带','Built-in'):(cur===k?L('已选','Picked'):L('选择','Pick'));
      return `<div class="prow${on?' on':''}" data-act="${pool.locked?'noop':'pickgt'}" data-row="${row}" tabindex="0" role="button" aria-pressed="${on?'true':'false'}" title="${esc(desc)}">
        ${talIcon(t)}<div class="wbody"><div class="wname">${esc(t.zh||t.en||k)} <span class="walt">${esc(t.kind_zh||'')}</span></div>
        <div class="tal-desc">${descHtml||esc(L('（官方无描述）','(no official description)'))}</div>${params?`<div class="tal-params">${params}</div>`:''}${talentPvpDiff(t)?talentCompareHtml(t):''}${counted?'':`<div class="pk-tal unsup">${esc(note)}</div>`}</div>
        <span class="badge ${on?'gold':'dim'}">${esc(badge)}</span></div>`;
    }).join('');
    box.innerHTML=pool.locked
      ? `<div class="pk-empty">${esc(L('该件天赋为件自带，不可更换','This piece carries its own talent — not swappable'))}</div>`+h
      : (h||`<div class="pk-empty">${esc(L('该件没有可选的装备天赋','No gear talent for this piece'))}</div>`);
  }else{
    DLG_ROWS=SKILLS.map((s,i)=>[s,i]);
    box.innerHTML=`<label class="dlg-skill-select">${esc(L('技能类别','Skill category'))}<select id="dlg-skill-category" data-act="dlg-skill">${DLG_ROWS.map(([s,i])=>`<option value="${i}"${d.skillPreview===i?' selected':''}>${esc(L(s.zh,SKILL_EN[s.zh]||s.zh))}</option>`).join('')}</select></label><div class="skill-picker"><div class="skill-cats">`+DLG_ROWS.map(([s,i],row)=>`<button type="button" class="sTile${d.skillPreview===i?' on':''}" data-act="skprev" data-row="${row}" aria-pressed="${d.skillPreview===i?'true':'false'}"><img loading="lazy" decoding="async" src="${imgUrl(skillIconOf(s))}" onerror="this.remove()"><span>${esc(L(s.zh,SKILL_EN[s.zh]||s.zh))}</span></button>`).join('')+`</div><div class="skill-preview">${skillPreviewHtml(d)}</div></div>`;
  }
  }finally{buildPickerPaint();}
}
function talentCompareHtml(t){
  return `<details class="tal-more"><summary data-act="noop">${esc(L('查看 PvE / PvP 差异','Compare PvE / PvP'))}</summary><div class="tal-compare"><span><b>PvE</b>${talentDescHtml(t,false)}</span><span><b>PvP</b>${talentDescHtml(t,true)}</span></div></details>`;
}
/* Display translation only. modName remains untouched on the calculation input path. */
function buildModLabel(m){if(!m)return '';const zh=modName(m);return L(zh,m.en||AFFIX_EN[zh]||zh);}

// Chance and level display use the same generated PvE/PvP curves as calculation.
function prototypeAugmentHtml(i,kind){
 if(!state.bp.prototype)return '';
 if(kind==='w'){const w=arr(DB.weapons)[state.wslots[i-6]];if(!w||w.exotic)return '';}
 else if(!gearOf(i)||gearOf(i).kind==='exotic')return '';
 const rows=arr(DB.prototype_augments),sel=(state.bp.augments||[])[i]||{},key=sel.key||'',level=Math.max(1,Math.min(10,+sel.level||10));
 const a=rows.find(x=>x.code===key),t=arr(DB.talents_official).find(x=>x.key===key);
 const chance=combatAugmentValue(key,level,'_activation_chance');
 const curve=DB.combat_audit?.prototype_curves?.[key]?.[state.bp.pvp?'pvp':'pve'];
 const numeric=Object.values(curve||{})[0];
 const amount=numeric?100*(numeric.base+numeric.step*(level-1)):null;
 const effects=amount==null?[]:[L(chance!=null?'触发概率':'效果提升',chance!=null?'Trigger chance':'Effect bonus')+' '+fmtN(amount)+'%'];
 /* 捕猎者只喂 `SkillDuration`（`build.audit.js` 的 `combatAugmentTotals`），枪械公式不读那个字段 ——
    2026-10-15 实测：多件 L10 把 SkillDuration 10→94，DPS/SDPS 与不计入时一字不差 ⇒ 不许标「已计入」，
    与其余几条同口径标「不计入」。不许为此改 `engine.js`（公式真值，禁碰）。回声/悖论仍走 f.Echo，如实保留。 */
 const modeled=['talent_augment_echo','talent_augment_paradox'].includes(key);
 const note=modeled?L('已计入枪械输出期望值','Included in expected firearm output'):L('效果保留；不计入枪械输出','Effect retained; not included in firearm output');
 const levelChoices=Array.from({length:10},(_,n)=>`<option value="${n+1}"${n+1===level?' selected':''}>${n+1}</option>`).join('');
  const effect=a?esc(effects.join(' · ')):'';
  return `<label class="axrow axselect prototype-augment" title="${esc(effects.concat(note).join(' · '))}">${(t?talIcon(t,'tic tic-s'):'')||axGlyph('uti')}<span class="axk">${esc(L('原型增幅','Augment'))}</span><span class="axchoice">${esc(a?L(a.zh,a.en):L('未选择','None'))}</span><select data-act="${kind==='w'?'waugment':'gaugment'}" data-i="${i}" aria-label="${esc(L('原型增幅','Prototype augment'))}"><option value="">${esc(L('未选择','None'))}</option>${rows.map(x=>`<option value="${esc(x.code)}"${x.code===key?' selected':''}>${esc(L(x.zh,x.en))}</option>`).join('')}</select><select class="prototype-level-select" data-act="${kind==='w'?'waugmentlevel':'gaugmentlevel'}" data-i="${i}" aria-label="${esc(L('增幅等级','Augment level'))}"${a?'':' disabled'}>${levelChoices}</select>${effect?`<span class="prototype-effect">${effect}</span>`:''}</label>`;
}

function weaponAffixOptionLabel(code,q,proto){
 const row=poolRowOf(code,q);if(!row)return affixLabel(code,q);
 return affixLabel(code,q)+' '+fmtN(prototypeAttrValue(code,row.val,row.qmod,proto))+(row.unit||'');
}