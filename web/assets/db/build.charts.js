/* 配装器页 · 伤害曲线层：循环伤害曲线 + 16 格命中柱状（纯内联 SVG，不引任何外部库）
   口径一律**按引擎同一套公式现算**：`r.DPS / r.DPM / r.RPM / r.ReloadTime / r.Magazine / r.Hits`。
   本层不碰 engine.js，也不做任何近似 —— 图与上面的数字必须同源，否则「图好看、数不对」比没有图更坏。
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
     单发 = r.BulletDamage；射速 = r.RPM 发/分；弹匣 = r.Magazine 发；换弹 = r.ReloadTime 秒
     开火段时长 = 弹匣 / (RPM/60)；一轮 = 开火段 + 换弹
     t 时刻累计伤害 = 已完成弹匣数 × r.DPM + 当前弹匣内已打出发数 × 单发 */
function magCurve(r) {
  var rpm = +r.RPM || 0, mag = +r.Magazine || 0, rel = +r.ReloadTime || 0;
  var dur = rpm > 0 ? mag / (rpm / 60) : 0;             // 一个弹匣打光要多久
  var cycle = dur + rel;
  var pts = [], dmg = [], dps = [];
  if (!(dur > 0) || !(cycle > 0) || CHART_SPAN <= 0) return { dur: dur, cycle: cycle, pts: pts, dmg: dmg, dps: dps };
  var N = 60;                                           // 采样点数：够画出台阶，又不至于糊
  for (var k = 0; k <= N; k++) {
    var t = CHART_SPAN * k / N;
    var full = Math.floor(t / cycle);                   // 已完整打完的弹匣数
    var inC = t - full * cycle;                         // 本轮内已过时间
    var inMag = inC < dur ? inC : dur;                  // 换弹期间停留在「已打光」
    var shot = mag * (inMag / dur);
    pts.push(t);
    dmg.push(full * (+r.DPM || 0) + shot * (+r.BulletDamage || 0));
    dps.push(inC < dur ? (+r.DPS || 0) : 0);
  }
  return { dur: dur, cycle: cycle, pts: pts, dmg: dmg, dps: dps };
}

/* 折线 → SVG path（x/y 由外部给出的映射函数算，避免两处各写一套比例） */
function pathOf(xs, ys, mx, my) {
  var d = '';
  for (var i = 0; i < xs.length; i++) d += (i ? 'L' : 'M') + svgNum(mx(xs[i]), 2) + ' ' + svgNum(my(ys[i]), 2) + ' ';
  return d.replace(/\s+$/, '');
}

function curveSvg(r) {
  var W = 320, H = 132, L = 46, R = 8, T = 10, B = 22;
  var pw = W - L - R, ph = H - T - B;
  var c = magCurve(r);
  if (!c.pts.length) return '';
  var dmax = Math.max.apply(null, c.dmg) || 1;
  var smax = Math.max.apply(null, c.dps) || 1;
  var mx = function (t) { return L + pw * (t / CHART_SPAN); };
  var myD = function (v) { return T + ph - ph * (v / dmax); };
  var myS = function (v) { return T + ph - ph * (v / smax); };
  var base = T + ph;
  var g = '';
  /* 底轴与左轴（细线，主题色由 CSS 给：.chart svg .ax） */
  g += '<line class="ax" x1="' + L + '" y1="' + base + '" x2="' + (L + pw) + '" y2="' + base + '"/>';
  g += '<line class="ax" x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + base + '"/>';
  /* 每轮换弹的分界线（虚线），让人一眼看出换弹空窗在哪 */
  var cyc = c.cycle, n = 0;
  while (cyc > 0 && cyc * (n + 1) < CHART_SPAN) {
    n++;
    var x = mx(cyc * n);
    g += '<line class="grid" x1="' + svgNum(x, 2) + '" y1="' + T + '" x2="' + svgNum(x, 2) + '" y2="' + base + '"/>';
  }
  g += '<path class="dmgline" d="' + pathOf(c.pts, c.dmg, mx, myD) + '"/>';
  g += '<path class="dpsline" d="' + pathOf(c.pts, c.dps, mx, myS) + '"/>';
  /* 刻度：Y 轴只标 0 与峰值（避免密集小字）；X 轴标 0 / 中 / 末 */
  g += '<text class="tick" x="' + (L - 4) + '" y="' + (base + 3) + '" text-anchor="end">0</text>';
  g += '<text class="tick" x="' + (L - 4) + '" y="' + (T + 8) + '" text-anchor="end">' + svgShort(dmax) + '</text>';
  g += '<text class="tick" x="' + L + '" y="' + (H - 6) + '" text-anchor="middle">0s</text>';
  g += '<text class="tick" x="' + (L + pw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + svgNum(CHART_SPAN / 2, 0) + 's</text>';
  g += '<text class="tick" x="' + (L + pw) + '" y="' + (H - 6) + '" text-anchor="middle">' + svgNum(CHART_SPAN, 0) + 's</text>';
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img">' + g + '</svg>';
}

/* ── 16 格命中柱状：把已有的 `r.Hits` 画出来（把「哪一族最高」变成一眼可见） ─────────── */
var HCOL = [['', '生命'], ['_Cover', '掩体外生命'], ['_Armor', '装甲'], ['_ArmorCover', '掩体外装甲']];
var HROW = [['Hit', '命中'], ['Critical_Hit', '暴击'], ['Headshot_Hit', '爆头'], ['CriticalHeadshot_Hit', '暴击爆头']];
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
      g += '<rect class="bar b' + rw + '" x="' + svgNum(x, 2) + '" y="' + svgNum(y, 2) + '" width="' + bar + '" height="' + svgNum(Math.max(h, .6), 2) + '" rx="2"><title>' + svgEsc(HROW[rw][1] + ' · ' + HCOL[c][1] + ' ' + svgShort(v)) + '</title></rect>';
    }
    g += '<text class="tick" x="' + svgNum(left + group * c + group / 2, 2) + '" y="' + (T + ph + 18) + '" text-anchor="middle">' + svgEsc(HCOL[c][1]) + '</text>';
  }
  for (var i = 0; i < 4; i++) {
    var lx = left + i * 112;
    g += '<rect class="bar b' + i + '" x="' + lx + '" y="' + (Hh - 18) + '" width="9" height="9" rx="2"/>';
    g += '<text class="tick" x="' + (lx + 14) + '" y="' + (Hh - 10) + '">' + svgEsc(HROW[i][1]) + '</text>';
  }
  return '<svg class="chart bars" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="' + svgEsc(L('命中伤害对照', 'Hit damage comparison')) + '">' + g + '</svg>';
}

/* 渲染入口：`recalc()` 每次算完都调它（`r` 为 null = 没装武器，清空） */
function renderCharts(r) {
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
    dur: c.dur, cycle: c.cycle, span: CHART_SPAN, dmg: c.dmg, dps: c.dps,
    hits: r.Hits || null, vmax: c.dmg.length ? Math.max.apply(null, c.dmg) : 0,
  };
  var n1 = $('#ch_cycle_note');
  if (n1) n1.textContent = L('当前条件的弹匣快照 · 每弹匣 ' + svgNum(c.dur, 2) + ' 秒 · 一轮 ' + svgNum(c.cycle, 2) + ' 秒',
    'Current magazine snapshot · ' + svgNum(c.dur, 2) + 's per mag · ' + svgNum(c.cycle, 2) + 's per cycle');
  var n2 = $('#ch_hits_note');
  if (n2) n2.textContent = L('四族 × 目标四态', 'four hit types × four target states');
}
