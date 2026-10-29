/* 配装器页 · 一键配装的**条件层**（用户第 300 轮定稿的 6 条硬条件）
   ────────────────────────────────────────────────────────────────────────────
   用户定稿（**都是硬条件**，不是加权偏好；不满足就淘汰，淘汰光了如实报告、**绝不偷偷放宽**）：
     ① 品牌：可多选（含装备组），件数 ≥ N（用户定稿：**做成硬条件**）
     ② 主武器：**指定某一把**（不是只限类别；类别那份下拉仍保留）
     ③ 专长：`state.bp.spec` 必须是它（硬）
     ④ 手表：`state.bp.watch` 必须是它（硬）
     ⑤ 主要属性（核心）：**限定池** —— 装备上**可挑**的核心槽，选的必须是池里的
     ⑥ 次要属性（副属性）：**限定池，最多 2 个** —— 每件每槽只能从池里挑
   ────────────────────────────────────────────────────────────────────────────
   ⚠️ 本层只做「判定 + 取值 + 显示」，**不碰公式**（数值一律由 engine.js 算）。
   ⚠️ 品牌 / 装备组 / 件数三个概念在官方数据里是同一族：
     `gear[].kind==='gearset'` 的件带 `set_code`，其余带 `brand_code`；两者都出现在 `DB.brands` 或
     `DB.gearsets_official` 里 ⇒ 本层统一用「一个 key = `set:<code>` 或 `brand:<code>`」表示，
     与 `countsGear()` 的键**逐字一致**（别自己另造一套键，那样件数会永远算不对）。
   ⚠️ 谓词签名与 `build.opt.js` 的 `optPredicates()` 一致：(r, gear, w) —— 便于直接 concat 进同一张表。 */

/* ── 条件对象 ─────────────────────────────────────────────────────────────── */
function reqDefaults() {
  return {
    brands: [],        // ① 允许的品牌/装备组 key 数组（空 = 不限；`brand:<code>` / `set:<code>`）
    bmin: 1,           // ① 件数下限（≥1 才有意义；用户第 1 条定稿为硬条件）
    weapon: null,      // ② 指定主武器：DB.weapons 下标（null = 不限，由类别下拉决定）
    spec: '',          // ③ 专长数据名（'' = 不限）
    watchKey: null,    // ④ 手表：null = 不限；true/false = 必须开/关
    core: [],          // ⑤ 核心属性限定池（code 数组；空 = 不限）
    cmin: 1,           // ⑤ 至少要**几件真的挑到**池里的核心（见 `reqCoreMiss()` 的长注释）
    affix: [],         // ⑥ 副属性限定池（code 数组；≤2；空 = 不限）
  };
}
/* 界面上真正「被用上」的条件（用于面板计数与结果脚注：现算，不写死） */
function reqUsed(q) {
  q = q || req();
  var n = 0;
  if (arr(q.brands).length) n++;
  if (q.weapon != null) n++;
  if (q.spec) n++;
  if (q.watchKey != null) n++;
  if (arr(q.core).length) n++;
  if (arr(q.affix).length) n++;
  return n;
}
function req() {
  if (!state.opt) state.opt = {};
  if (!state.opt.req) state.opt.req = reqDefaults();
  var q = state.opt.req;
  /* 老状态兜底：缺键就补默认（用户存档 / 撤销快照可能来自加这一层之前） */
  var d = reqDefaults(), k;
  for (k in d) if (q[k] === undefined) q[k] = d[k];
  return q;
}
/* 键 → 显示名。品牌与装备组分别取官方表，取不到就报键本身（不静默变空）。 */
function reqBrandName(key) {
  var s = String(key || ''), code = s.replace(/^(brand|set):/, '');
  var isSet = s.indexOf('set:') === 0, i, x;
  var gs = arr(DB.gearsets_official);
  for (i = 0; i < gs.length; i++) {
    x = gs[i];
    if (x && (x.code === code || x.key === code || x.set_code === code)) return x.zh || x.en || code;
  }
  var bs = arr(DB.brands);
  for (i = 0; i < bs.length; i++) {
    x = bs[i];
    if (x && (x.code === code || x.key === code)) return x.zh || x.en || code;
  }
  return (isSet ? '' : '') + code;
}
function reqBrandList() {
  var out = [], seen = {}, i, x, c;
  var bs = arr(DB.brands);
  for (i = 0; i < bs.length; i++) {
    x = bs[i]; c = x && (x.code || x.key);
    if (!c || seen['brand:' + c]) continue;
    seen['brand:' + c] = 1;
    out.push({ key: 'brand:' + c, zh: x.zh || x.en || c, code: c });
  }
  var gs = arr(DB.gearsets_official);
  for (i = 0; i < gs.length; i++) {
    x = gs[i]; c = x && (x.code || x.key || x.set_code);
    if (!c || seen['set:' + c]) continue;
    seen['set:' + c] = 1;
    out.push({ key: 'set:' + c, zh: x.zh || x.en || c, code: c });
  }
  return out;
}
/* 某件装备属于哪个条件键（与 countsGear() 逐字一致）；不属于任何一族（奇特/普通）⇒ null */
function reqPieceKey(it) {
  if (!it) return null;
  if (it.kind === 'gearset' && it.set_code) return 'set:' + it.set_code;
  if (it.brand_code) return 'brand:' + it.brand_code;
  return null;
}

/* ── 逐条判定 ─────────────────────────────────────────────────────────────── */
/* ① 品牌：**至少要有一件**落在允许的品牌/装备组里，且该族件数 ≥ bmin。
   （用户第 1 条定稿就是「品牌 + 件数」两件事一起成硬条件。） */
function reqBrandOk(gear, q) {
  var allow = arr(q.brands); if (!allow.length) return true;
  var per = {};
  for (var i = 0; i < 6; i++) { var k = reqPieceKey(gear[i]); if (k) per[k] = (per[k] || 0) + 1; }
  for (var j = 0; j < allow.length; j++) if ((per[allow[j]] || 0) >= (q.bmin > 1 ? q.bmin : 1)) return true;
  return false;
}
/* ② 主武器：指定了就必须是那一把（按 DB.weapons 下标；取不到 = 不满足，不拿同类别的别把枪顶替） */
function reqWeaponOk(w, q) {
  if (q.weapon == null) return true;
  var t = arr(DB.weapons)[q.weapon];
  return !!(w && t && w === t);
}
/* ③④ 专长 / 手表：读的是同一份 `state.bp`，引擎也读它 ⇒ 「面板值 == 判定值」天然一致 */
function reqSpecOk(q) { return !q.spec || (state.bp && state.bp.spec === q.spec); }
function reqWatchOk(q) { return q.watchKey == null || !!(state.bp && !!state.bp.watch === !!q.watchKey); }
/* ⑤ 核心属性限定池：**只约束「可挑」的核心槽**（官方 `fixed:false` 的那一个）。
   该件不可挑（只有固定核心）⇒ 不受约束 —— 否则等于要求「所有件都必须是某一类核心」，没人配得出来。
   ⚠️ **光有「不满足就淘汰」还不够**：可挑核心的件全库只有 23 件、池内 code 只有那么几个
   （实测：3 个 code / 23 件，见 build.view.js 的 `reqCoreCodes()`），于是「把池圈死」这件事
   极容易被**空满足**——挑出来的 6 件里一件可挑核心的都没有 ⇒ 循环体一次都不进 ⇒ 判定返回「满足」，
   优化器报 `fitOk:true`，界面上却一件都没挑（实测踩到）。所以这里再加一条**件数下限 `cmin`**：
   至少要 `cmin` 件**真的从池里挑到了核心**，否则判不满足（如实报，不放宽）。 */
function reqCoreProvide(gear, q) {
  var allow = arr(q.core); if (!allow.length) return 0;
  var n = 0;
  for (var i = 0; i < 6; i++) {
    var it = gear[i]; if (!it) continue;
    var ch = (typeof coreChoices === 'function') ? coreChoices(it) : null;
    if (!ch || !ch.length) continue;
    if (allow.indexOf(state.core[i]) >= 0) n++;
  }
  return n;
}
function reqCoreMiss(gear, q, cminLow) {
  var allow = arr(q.core); if (!allow.length) return [];
  var need = (q.cmin > 0) ? q.cmin : 0;
  /* 二级：件数下限降级（见 `build.opt.js` 的两阶段）。
     ⚠️ 2026-09-14 修：原来写 `if (cminLow)` —— 二级传进来的就是 **`0`**（falsy）⇒ 这个分支从不执行、
     `need` 又变回 `q.cmin` ⇒ **二级永远放宽不了件数下限**、该档设计意图全部落空
     （而 `build.opt.js:354` 的注释明写「`cminLow=0` 只关掉 `core:<n>` 件数哨兵」——注释与代码矛盾）。
     判据必须用 `!= null`：`null` = 一级（按 `q.cmin`），`0` = 二级（彻底关掉这件哨兵）。 */
  if (cminLow != null) need = cminLow > 0 ? cminLow : 0;
  var miss = [];
  if (reqCoreProvide(gear, q) < need) miss.push('core:<' + need);
  for (var i = 0; i < 6; i++) {
    var it = gear[i]; if (!it) continue;
    var ch = (typeof coreChoices === 'function') ? coreChoices(it) : null;
    if (!ch || !ch.length) continue;                    // 不可挑 ⇒ 豁免
    var cur = state.core[i];
    if (allow.indexOf(cur) < 0) miss.push(i);
  }
  return miss;
}
function reqCoreOk(gear, q, cminLow) { return reqCoreMiss(gear, q, cminLow).length === 0; }
/* ⑥ 副属性限定池（≤2）：**每个随机槽都得填满**，且每一格都得在池里。
   「填满」是必须的：空槽等于没算那条属性 ⇒ 拿「少填」当满足就是把条件偷偷放宽了。 */
function reqAffixMiss(gear, q) {
  var allow = arr(q.affix); if (!allow.length) return [];
  var miss = [];
  for (var i = 0; i < 6; i++) {
    var it = gear[i]; if (!it) continue;
    var n = nRandomSlots(it);
    var cur = arr(state.affix[i]);
    for (var k = 0; k < n; k++) if (allow.indexOf(cur[k]) < 0) { miss.push(i); break; }
  }
  return miss;
}
function reqAffixOk(gear, q) { return reqAffixMiss(gear, q).length === 0; }
/* 全部条件 → 一张谓词表（与 `optPredicates()` 同签名，直接 concat） */
function reqPredicates(q, cminLow) {
  q = q || req();
  var out = [];
  if (arr(q.brands).length) out.push(function (r, gear) { return reqBrandOk(gear, q); });
  if (q.weapon != null) out.push(function (r, gear, w) { return reqWeaponOk(w, q); });
  if (q.spec) out.push(function () { return reqSpecOk(q); });
  if (q.watchKey != null) out.push(function () { return reqWatchOk(q); });
  if (arr(q.core).length) out.push(function (r, gear) { return reqCoreOk(gear, q, cminLow); });
  if (arr(q.affix).length) out.push(function (r, gear) { return reqAffixOk(gear, q); });
  return out;
}
/* 哪些件**有资格**进池：目前只有 ⑤ 核心池能安全地收窄候选池。
   ⚠️ **①品牌不许用来收窄候选池**：品牌条件的语义是「≥ bmin 件来自允许的那几族」，
   其余格位**照样可以放别的件**（官方配装本来就是这样混搭）。按品牌筛池会直接砍掉混搭解，
   把「品牌 A ×3 + 任意」变成「6 格全是 A」——那是另一个条件，不是用户说的那条。 */
function reqPoolOk(it, q) {
  q = q || req();
  if (!it) return false;
  if (!arr(q.core).length) return true;
  var ch = (typeof coreChoices === 'function') ? coreChoices(it) : null;
  /* ⚠️ **没有可挑核心的件也必须淘汰**，不能「没得挑就放行」：
     ⑤ 的语义已经是「至少 `cmin` 件真的挑到了池里的核心」（见 `reqCoreMiss()`），
     而能挑的核心只有那么几个（实测 3 个 code / 23 件）⇒ 把不具备可挑核心的件放进候选池，
     搜索会一路把它们选进来、`cmin` 永远凑不上，最后如实报「没凑上」——那等于⑤永远不可用。
     实测踩到：`return true` 那版让池子 678/678 全放行、交付 0 件可挑核心。 */
  if (!ch || !ch.length) return false;
  for (var i = 0; i < ch.length; i++) if (q.core.indexOf(ch[i]) >= 0) return true;
  return false;                                          // 这件挑不出池里的核心 ⇒ 别进池
}

/* 在**当前配装**上做一轮局部改进：逐格 × 逐槽换池内候选，只有目标变大才留。
   `scoreAt()` 由调用方给（它负责调 evalBuild 并返回目标值）。返回提升次数。
   `skip(i)` 可选：调用方用它排除**用户锁定的格**（一键配装的锁定格必须原样交付，收尾段也不许动）。 */
function reqPolish(q, scoreAt, rounds, skip) {
  q = q || req();
  var coreAllow = arr(q.core), affAllow = arr(q.affix);
  var up = 0;
  if (!coreAllow.length && !affAllow.length) return 0;
  rounds = rounds || 2;
  for (var rd = 0; rd < rounds; rd++) {
    var moved = false;
    for (var i = 0; i < 6; i++) {
      var it = gearOf(i); if (!it) continue;
      if (skip && skip(i)) continue;                                 // 锁定格：件与词条都归用户
      if (coreAllow.length) {
        var ch = (typeof coreChoices === 'function') ? coreChoices(it) : null;
        var cur = state.core[i], bestSc = scoreAt();
        if (ch && ch.length) {
          for (var k = 0; k < ch.length; k++) {
            if (coreAllow.indexOf(ch[k]) < 0 || ch[k] === cur) continue;
            state.core[i] = ch[k];
            var sc = scoreAt();
            if (sc > bestSc) { bestSc = sc; cur = ch[k]; moved = true; }
          }
          state.core[i] = cur;
        }
      }
      if (affAllow.length) {
        var n = nRandomSlots(it);
        for (var s = 0; s < n; s++) {
          var was = state.affix[i][s], bestA = scoreAt(), best = was;
          for (var j = 0; j < affAllow.length; j++) {
            if (affAllow[j] === was) continue;
            state.affix[i][s] = affAllow[j];
            var sc2 = scoreAt();
            if (sc2 > bestA) { bestA = sc2; best = affAllow[j]; moved = true; }
          }
          state.affix[i][s] = best;
        }
      }
    }
    if (moved) up++; else break;
  }
  return up;
}
