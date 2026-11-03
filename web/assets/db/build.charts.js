/* 配装器页 · 伤害曲线层：循环伤害曲线 + 16 格命中柱状（纯内联 SVG，不引任何外部库）
   口径一律**按引擎同一套公式现算**：`r.DPS / r.DPM / r.RPM / r.ReloadTime / r.Magazine / r.Hits`。
   图为同条件下的等效平均循环，不模拟逐发触发顺序；每周期伤害和时间严格与引擎结果一致。
   ⚠️ 数字样式守 UI 硬规则⑤：`font-weight ≤ 500` + `tabular-nums`，层次靠字号与颜色。 */

/* 曲线时间窗（秒）：够看见 2~3 个弹匣周期，又不至于把换弹空窗压成一根毛刺 */
var CHART_SPAN = 20;
/* 最近一次渲染的采样数据（冒烟与调试读它，判据取运行时真值，不写死数字） */
var CHART_DATA = null;

function svgNum(v, digits) {
  if (!isFinite(v)) return '0';
  var s = (digits == null ? 0 : digits), p = Math.pow(10, s);
  return String(Math.round(v * p) / p);
}
/* `1234567` → `1.23M`（图内标注用；面板数字仍走 fmt0/fmtN，不改它们） */
function svgShort(v) {
  var a = Math.abs(v);
  if (a >= 1e9) return svgNum(v / 1e9, 2) + 'B';
  if (a >= 1e6) return svgNum(v / 1e6, 2) + 'M';
  if (a >= 1e3) return svgNum(v / 1e3, 1) + 'K';
  return svgNum(v, 0);
}
function svgEsc(s) { return esc(s); }

/* ── 循环伤害曲线：累计伤害（实线，锯齿上升，每弹匣末换弹留台阶）+ 瞬时 DPS（虚线） ──────
   模型（与引擎同源，全部读 r 的字段）：
     开火时间 = r.DPM / r.DPS；循环时间 = r.DPM / r.SDPS（保留命中率与小数等效弹匣）
     每周期以 r.DPM 线性累积，非开火段保持不变；特殊循环同样只是等效均值。 */
function magCurve(r) {
  var rpm=+r.RPM||0,mag=+r.Magazine||0;
  // DPM and DPS retain fractional refill rounds and hit chance from the engine.
  var dur=r.DPS>0&&r.DPM>0?r.DPM/r.DPS:(rpm>0?mag/(rpm/60):0);
  var cycle=r.SDPS>0&&r.DPM>0?r.DPM/r.SDPS:dur+(+r.ReloadTime||0);
  var pts=[],dmg=[],dps=[];
  if(!(dur>0)||!(cycle>=dur)||!(CHART_SPAN>0))return {dur:dur,cycle:cycle,pts:pts,dmg:dmg,dps:dps};
  var times=[];for(var k=0;k<=120;k++)times.push(CHART_SPAN*k/120);
  for(var j=0;j<200&&j*cycle<CHART_SPAN;j++){
    [j*cycle,j*cycle+dur,(j+1)*cycle].forEach(function(t){if(t>0&&t<CHART_SPAN)times.push(Math.max(0,t-0.000001),t);});
  }
  times=Array.from(new Set(times)).sort(function(a,b){return a-b;});
  times.forEach(function(t){
    var full=Math.floor(t/cycle),inC=t-full*cycle,progress=Math.min(inC,dur)/dur;
    pts.push(t);dmg.push(full*(+r.DPM||0)+progress*(+r.DPM||0));dps.push(inC<dur?(+r.DPS||0):0);
  });
  return {dur:dur,cycle:cycle,pts:pts,dmg:dmg,dps:dps};
}

/* 折线 → SVG path（x/y 由外部给出的映射函数算，避免两处各写一套比例） */
function pathOf(xs, ys, mx, my) {
  var d = '';
  for (var i = 0; i < xs.length; i++) d += (i ? 'L' : 'M') + svgNum(mx(xs[i]), 2) + ' ' + svgNum(my(ys[i]), 2) + ' ';
  return d.replace(/\s+$/, '');
}

function curveSvg(r) {
  var W = matchMedia('(max-width:700px)').matches?360:560, H = 220, leftPad = 52, R = 52, T = 26, B = 26;
  var pw = W - leftPad - R, ph = H - T - B;
  var c = magCurve(r);
  if (!c.pts.length) return '';
  var dmax = Math.max.apply(null, c.dmg) || 1;
  var smax = Math.max.apply(null, c.dps) || 1;
  var mx = function (t) { return leftPad + pw * (t / CHART_SPAN); };
  var myD = function (v) { return T + ph - ph * (v / dmax); };
  var myS = function (v) { return T + ph - ph * (v / smax); };
  var base = T + ph;
  var g = '';
  for(var shade=0;shade<200&&shade*c.cycle<CHART_SPAN;shade++){var from=shade*c.cycle+c.dur,to=Math.min((shade+1)*c.cycle,CHART_SPAN);if(from<to)g+='<rect class="reload-zone" x="'+svgNum(mx(from),2)+'" y="'+T+'" width="'+svgNum(mx(to)-mx(from),2)+'" height="'+ph+'"/>';}
  /* 底轴与左轴（细线，主题色由 CSS 给：.chart svg .ax） */
  g += '<line class="ax" x1="' + leftPad + '" y1="' + base + '" x2="' + (leftPad + pw) + '" y2="' + base + '"/>';
  g += '<line class="ax" x1="' + leftPad + '" y1="' + T + '" x2="' + leftPad + '" y2="' + base + '"/>';
  /* 每轮换弹的分界线（虚线），让人一眼看出换弹空窗在哪 */
  var cyc = c.cycle, n = 0;
  while (cyc > 0 && n < 200 && cyc * (n + 1) < CHART_SPAN) {
    n++;
    var x = mx(cyc * n);
    g += '<line class="grid" x1="' + svgNum(x, 2) + '" y1="' + T + '" x2="' + svgNum(x, 2) + '" y2="' + base + '"/>';
  }
  if(r.prototypeEffects){var baseline=magCurve(r.prototypeEffects.before);g+='<path class="baseline-line" d="'+pathOf(baseline.pts,baseline.dmg,mx,myD)+'"/>';}
  g += '<text class="tick" x="'+leftPad+'" y="14">'+svgEsc(L('累计伤害','Total damage'))+'</text>';
  g += '<text class="tick" x="'+(leftPad+pw)+'" y="14" text-anchor="end">DPS</text>';
  g += '<text class="tick" x="'+(leftPad+pw+4)+'" y="'+(T+8)+'">'+svgShort(smax)+'</text>';
  g += '<text class="tick" x="'+(leftPad+pw+4)+'" y="'+(base+3)+'">0</text>';
  g += '<path class="dmgline" d="' + pathOf(c.pts, c.dmg, mx, myD) + '"/>';
  g += '<path class="dpsline" d="' + pathOf(c.pts, c.dps, mx, myS) + '"/>';
  /* 刻度：Y 轴只标 0 与峰值（避免密集小字）；X 轴标 0 / 中 / 末 */
  g += '<text class="tick" x="' + (leftPad - 4) + '" y="' + (base + 3) + '" text-anchor="end">0</text>';
  g += '<text class="tick" x="' + (leftPad - 4) + '" y="' + (T + 8) + '" text-anchor="end">' + svgShort(dmax) + '</text>';
  g += '<text class="tick" x="' + leftPad + '" y="' + (H - 6) + '" text-anchor="middle">0s</text>';
  g += '<text class="tick" x="' + (leftPad + pw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + svgNum(CHART_SPAN / 2, 0) + 's</text>';
  g += '<text class="tick" x="' + (leftPad + pw) + '" y="' + (H - 6) + '" text-anchor="middle">' + svgNum(CHART_SPAN, 0) + 's</text>';
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="'+svgEsc(L('当前条件下的等效循环伤害','Equivalent damage cycles under current conditions'))+'">' + g + '</svg>';
}

/* ── 16 格命中柱状：把已有的 `r.Hits` 画出来（把「哪一族最高」变成一眼可见） ─────────── */
var HCOL = [['', '生命','Health'], ['_Cover', '掩体外生命','Health, out of cover'], ['_Armor', '装甲','Armor'], ['_ArmorCover', '掩体外装甲','Armor, out of cover']];
var HROW = [['Hit', '命中','Hit'], ['Critical_Hit', '暴击','Crit'], ['Headshot_Hit', '爆头','Headshot'], ['CriticalHeadshot_Hit', '暴击爆头','Crit + headshot']];
function barsSvg(r) {
  var H = r.Hits;
  if (!H) return '';
  var vals = [];
  HROW.forEach(function (rw) { HCOL.forEach(function (cl) { vals.push(+H[rw[0] + cl[0]] || 0); }); });
  var vmax = Math.max.apply(null, vals) || 1;
  var W = 560, Hh = 210, left = 42, R = 12, T = 18, B = 58;
  var pw = W - left - R, ph = Hh - T - B, group = pw / 4, bar = 18, gap = 5;
  var g = '<line class="ax" x1="' + left + '" y1="' + (T + ph) + '" x2="' + (left + pw) + '" y2="' + (T + ph) + '"/>';
  g += '<text class="tick" x="' + (left - 6) + '" y="' + (T + 4) + '" text-anchor="end">' + svgShort(vmax) + '</text>';
  g += '<text class="tick" x="' + (left - 6) + '" y="' + (T + ph) + '" text-anchor="end">0</text>';
  for (var c = 0; c < 4; c++) {
    for (var rw = 0; rw < 4; rw++) {
      var v = vals[rw * 4 + c], h = ph * (v / vmax);
      var x = left + group * c + 12 + rw * (bar + gap), y = T + ph - h;
      g += '<rect class="bar b' + rw + '" x="' + svgNum(x, 2) + '" y="' + svgNum(y, 2) + '" width="' + bar + '" height="' + svgNum(Math.max(h, .6), 2) + '" style="height:' + svgNum(Math.max(h,.6),2) + 'px;min-width:0" rx="2"><title>' + svgEsc(L(HROW[rw][1],HROW[rw][2]) + ' · ' + L(HCOL[c][1],HCOL[c][2]) + ' ' + fmtN(v)) + '</title></rect>';
    }
    g += '<text class="tick" x="' + svgNum(left + group * c + group / 2, 2) + '" y="' + (T + ph + 18) + '" text-anchor="middle">' + svgEsc(L(HCOL[c][1],HCOL[c][2])) + '</text>';
  }
  for (var i = 0; i < 4; i++) {
    var lx = left + i * 112;
    g += '<rect class="bar b' + i + '" x="' + lx + '" y="' + (Hh - 18) + '" width="9" height="9" style="height:9px;min-width:0" rx="2"/>';
    g += '<text class="tick" x="' + (lx + 14) + '" y="' + (Hh - 10) + '">' + svgEsc(L(HROW[i][1],HROW[i][2])) + '</text>';
  }
  return '<svg class="chart bars" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="' + svgEsc(L('命中伤害对照', 'Hit damage comparison')) + '">' + g + '</svg>';
}

/* 渲染入口：`recalc()` 每次算完都调它（`r` 为 null = 没装武器，清空） */
function renderCharts(r) {
  renderDamageAnalysis(r);
  var a = $('#ch_cycle'), b = $('#ch_hits');
  if (!a && !b) return;
  if (!r) {
    CHART_DATA = null;
    if (a) a.innerHTML = '';
    if (b) b.innerHTML = '';
    var e1 = $('#ch_cycle_note'), e2 = $('#ch_hits_note');
    if (e1) e1.textContent = '—';
    if (e2) e2.textContent = '—';
    return;
  }
  var c = magCurve(r);
  if (a) a.innerHTML = curveSvg(r);
  if (b) b.innerHTML = barsSvg(r);
  CHART_DATA = {
    model:'equivalent-cycle',dur: c.dur, cycle: c.cycle, span: CHART_SPAN, dmg: c.dmg, dps: c.dps,
    hits: r.Hits || null, vmax: c.dmg.length ? Math.max.apply(null, c.dmg) : 0,
  };
  var n1 = $('#ch_cycle_note');
  if (n1) n1.textContent = L('等效平均循环 · 开火 ' + svgNum(c.dur, 2) + ' 秒 · 一轮 ' + svgNum(c.cycle, 2) + ' 秒',
    'Equivalent average cycle · firing ' + svgNum(c.dur, 2) + 's per mag · ' + svgNum(c.cycle, 2) + 's per cycle');
  var n2 = $('#ch_hits_note');
  if (n2) n2.textContent = L('四族 × 目标四态', 'four hit types × four target states');
}

var ANALYSIS_HIT='Hit',ANALYSIS_COVER=true;
function damageAnalysisData(r,w,params,target){
 const f=r.fields||{},type=TD2Calc.weaponTypeIndex(w.type),keys=['ARDamage','SMGDamage','ShotgunDamage','RifleDamage','MMRDamage','LMGDamage','PistolDamage'];
 const typed=f.typeDamage!=null&&f.typeDamage!==0?f.typeDamage:(f[keys[type]]||0);
 const cycle=magCurve(r),physicalMagazine=Math.floor((+w.mag||0)*(1+(+f.MagazineSize||0)/100));
 const armorKey=ANALYSIS_HIT+(ANALYSIS_COVER?'_ArmorCover':'_Armor'),healthKey=ANALYSIS_HIT+(ANALYSIS_COVER?'_Cover':'');
 let kill=null;
 if(target&&Number.isFinite(target.hp)&&target.hp>0&&Number.isFinite(target.armor)&&target.armor>=0&&r.Hits?.[armorKey]>0&&r.Hits?.[healthKey]>0){
  const armorShots=Math.ceil(target.armor/r.Hits[armorKey]),healthShots=Math.ceil(target.hp/r.Hits[healthKey]);
  kill={armorShots,healthShots,total:armorShots+healthShots,hp:target.hp,armor:target.armor,physicalMagazine};
 }
 return {cycle,kill,conditions:{hit:params.hit,headshot:params.headshot,outcover:params.outcover,armorPct:params.armorPct},
  base:+w.dmg||0,weaponBonus:(+f.AllWeaponDamage||0)+typed+(+f.WeaponDamage_Talent||0),totalBonus:+f.TotalWeaponDamage||0,
  amplify:(f.AmplifyDamage??1)*(f.AmplifyDamage_NotForHeadhunter??1),
  critOverflow:Math.max(0,(+f.CriticalHitChance||0)-60),reloadLoss:r.DPS>0?100*(1-r.SDPS/r.DPS):null,
  windowDamage:cycle.dmg.length?cycle.dmg[cycle.dmg.length-1]:0};
}
function renderDamageAnalysis(r){
 const box=document.getElementById('damage_analysis'),controls=document.getElementById('analysis_controls');if(!box)return;
 if(!r){box.innerHTML='<p class="hint">'+esc(L('选择武器后查看伤害来源、换弹损失和目标对照。','Choose a weapon to inspect damage sources, reload loss and the target comparison.'))+'</p>';if(controls)controls.innerHTML='';return;}
 const w=DB.weapons[state.wslots[state.wactive]];if(!w)return;
 let target=null;if(!state.bp.pvp)try{target=enemyTarget();}catch(_){}
 const d=damageAnalysisData(r,w,bpParams(),target),value=n=>Number.isFinite(n)?fmtN(n):'—';
 const metric=(label,n,unit='')=>`<div><dt>${esc(label)}</dt><dd>${esc(value(n)+unit)}</dd></div>`;
 const conditions=[L('命中','Hit')+' '+value(d.conditions.hit)+'%',L('爆头','Headshot')+' '+value(d.conditions.headshot)+'%',L('掩体外','Out of cover')+' '+value(d.conditions.outcover)+'%',L('装甲占比','Armor share')+' '+value(d.conditions.armorPct)+'%'];
 const metrics=[metric(L('爆发 DPS','Burst DPS'),r.DPS),metric(L('循环 DPS（当前条件）','Cycle DPS (current conditions)'),r.SDPS),metric(L('循环非开火占比','Non-firing share'),d.reloadLoss,'%'),metric(L(CHART_SPAN+' 秒累计伤害期望',CHART_SPAN+'s expected total damage'),d.windowDamage)];
 const factors=[metric(L('武器基础伤害','Weapon base damage'),d.base),metric(L('武器伤害区（同区相加）','Weapon damage pool (additive)'),d.weaponBonus,'%'),metric(L('总武器伤害区','Total weapon damage pool'),d.totalBonus,'%'),metric(L('独立增伤合并倍率','Combined independent multiplier'),d.amplify,'×')];
 const selector=`<div class="analysis-target-controls"><label>${esc(L('命中形态','Hit type'))}<select data-analysis-hit>${BP_HIT4.map(([key,label])=>`<option value="${key}"${ANALYSIS_HIT===key?' selected':''}>${esc(L(...label))}</option>`).join('')}</select></label><label>${esc(L('目标位置','Target position'))}<select data-analysis-cover><option value="1"${ANALYSIS_COVER?' selected':''}>${esc(L('掩体外','Out of cover'))}</option><option value="0"${!ANALYSIS_COVER?' selected':''}>${esc(L('掩体内','In cover'))}</option></select></label></div>`;
 const k=d.kill;
 const targetHtml=k?`<dl class="analysis-values">${metric(L('目标装甲','Target armor'),k.armor)}${metric(L('目标生命','Target health'),k.hp)}${metric(L('破甲需要','Shots to break armor'),k.armorShots,L(' 发',' shots'))}${metric(L('生命段需要','Shots against health'),k.healthShots,L(' 发',' shots'))}${metric(L('合计（不计破甲溢出）','Total (without armor overflow)'),k.total,L(' 发',' shots'))}</dl>`:`<p class="hint">${esc(state.bp.pvp?L('当前未提供 PvP 目标血甲模型。命中矩阵仍可用于对照。','No PvP target health/armor model is provided. The hit matrix remains available.'):L('目标数据不可用，暂不估算击杀发数。','Target data is unavailable; shot counts are not estimated.'))}</p>`;
 const proto=combatAugmentSummaryHtml();
 box.innerHTML=`<p class="analysis-condition-line">${esc(conditions.join(' · '))} <button type="button" class="mini ghost" data-analysis-conditions>${esc(L('调整条件','Edit conditions'))}</button></p><dl class="analysis-metrics">${metrics.join('')}</dl><p class="hint">${esc(L('循环 DPS 按当前增益保持不变、持续射击与换弹计算；不等于实战全程 DPS。概率增幅按长期期望计算。','Cycle DPS assumes unchanged buffs and repeated firing/reloading; it is not encounter DPS. Random augments use long-run expectations.'))}</p><div class="analysis-sections"><section><h3>${esc(L('伤害构成','Damage composition'))}</h3><dl class="analysis-values">${factors.join('')}</dl><p class="hint">${esc(L('同区先相加，不同区再乘算。暴击、爆头与目标修正在下方命中矩阵中分别对照。','Bonuses add within a pool and multiply between pools. Compare crits, headshots and target modifiers separately in the hit matrix below.'))}</p>${d.critOverflow?`<p class="hint">${esc(L('暴击率超过 60% 上限 '+value(d.critOverflow)+' 个百分点；超出部分不提高当前输出。','Critical hit chance exceeds the 60% cap by '+value(d.critOverflow)+' percentage points; the excess does not increase current output.'))}</p>`:''}</section><section><h3>${esc(L('当前目标需要几发','Shots against the current target'))}</h3>${selector}${targetHtml}<p class="hint">${esc(L('按所选命中形态全部命中，装甲和生命分段取整；不模拟破甲溢出、回声追加命中、目标回复及免伤。','Assumes every shot has the selected hit type. Armor and health are rounded separately; overflow, Echo duplicates, target healing and immunity are not simulated.'))}</p></section></div>${proto}`;
 if(controls)controls.innerHTML=`<label>${esc(L('观察时间','Time window'))}<select data-analysis-span>${[10,20,30,60].map(n=>`<option value="${n}"${CHART_SPAN===n?' selected':''}>${n} ${esc(L('秒','seconds'))}</option>`).join('')}</select></label><span>${esc(L('实线：累计伤害 · 虚线：瞬时输出 · 阴影：非开火', 'Solid: cumulative damage · dashed: DPS · shading: non-firing'))}${r.prototypeEffects?' · '+esc(L('点线：关闭原型输出增幅','Dotted: without prototype output augments')):''}</span>`;
}
