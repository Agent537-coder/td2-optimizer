/* 配装器试算台（node，无浏览器）· 主控：用例编排与断言。装置在 build_sim.harness.mjs。
   用途：
     ① 交付前把「引擎 + 数据 + 页面逻辑」整条链真跑一遍看数字（就是这个文件的第一件事）；
     ② 一键配装要批量试算上万次 ⇒ 先在 node 里量真实耗时、看优化结果，再决定放页面里跑。
   用法：node scripts/devcheck/build_sim.mjs [--json] [--opt|--seed|--brute|--build|--pvp …]
   判据（脚本自己断言，退出码非 0 = 有问题）：面板十项都不为 '—'、命中矩阵 16 格、无页面报错。 */

import { runInContext } from 'node:vm';
import { boot, EXPORT, svgish, num2, attrsOf, btnOf, matchIn, argVal, SLOT_NAME, assembleSeed } from './build_sim.harness.mjs';

const strictCover = process.argv.includes('--strict-cover');
async function main() {
  const asJson = process.argv.includes('--json');
  const { context, dom, db, errors, calls } = boot();
  /* ⚠️ `load()` 自己会 catch 掉建索引的异常并改写 `main`（页面上那是给人看的兜底），
     试算台里必须把**真异常**暴露出来，否则只看到「main 是 null」这种二次错误。 */
  try { await runInContext('load()', context, { filename: 'sim-load' }); }
  catch (e) { throw new Error('load() 抛异常：' + (e && e.stack || e)); }
  if (errors.length) throw new Error('load() 期间 console.error：\n  ' + errors.join('\n  '));
  const page = runInContext(EXPORT, context, { filename: 'sim-export' });
  if (!page || !page.state || !Array.isArray(page.state.wslots)) throw new Error('取不到页面 state');
  if (!(page.WEAPONS_LEN > 0)) throw new Error('库里没武器：DBINFO=' + JSON.stringify(page.DBINFO) + ' · fetch ' + JSON.stringify(calls));
  /* ── 选武器走**页面自己的 UI 路径**（点 ⌄ → 弹窗 → 挑第一行），与真机冒烟同一条路 ──────────
     ⚠️ 不要从外面直接 `state.wslots[0]=<DB 下标>`：`DB` 在上下文外取不到（`let`），
        而弹窗内部自己按 `DLG_ROWS[+dataset.row][1]` 回填下标，那才是唯一正确的下标来源。 */
  const wbox = page.$('#wstrip');
  /* 空槽上「点卡片本身」= `data-act="wsl"`（`closest` 命中自己，⌄ 不会被顺带点到）；
     已装槽才显示 ⌄（`wpick`）。两种入口都认，谁先出现用谁。 */
  let pickBtn = matchIn(wbox.innerHTML, 'data-act="wpick"', 'data-i="(\\d+)"');
  let openAct = 'wpick';
  if (!pickBtn) { pickBtn = matchIn(wbox.innerHTML, 'data-act="wsl"', 'data-i="(\\d+)"'); openAct = 'wsl'; }
  if (!pickBtn) {
    throw new Error('#wstrip 里既没有 wpick 也没有 wsl 入口（' + wbox.innerHTML.length + ' 字）：'
      + wbox.innerHTML.slice(0, 200) + ' ｜ attrs=' + JSON.stringify(attrsOf(wbox.innerHTML.slice(0, wbox.innerHTML.indexOf('>') + 1))));
  }
  const wclick = btnOf(wbox.innerHTML, openAct, pickBtn.i, dom.fireClick);
  if (!wclick) throw new Error('取不到 ' + openAct + ' 入口 · pickBtn=' + JSON.stringify(pickBtn));
  wclick.click();                                        // → openDlg('w', i)
  const list = page.$('#dlglist');
  let row0 = matchIn(list.innerHTML, 'data-act="pickw"', 'data-row="(\\d+)"');
  if (!row0) {
    const typeBtn = btnOf(page.$('#dlgtypes').innerHTML, 'dwtype', null, dom.fireClick);
    if (typeBtn) typeBtn.click();
    row0 = matchIn(list.innerHTML, 'data-act="pickw"', 'data-row="(\\d+)"');
  }
  if (!row0) throw new Error('武器弹窗没出条目（#' + wbox.innerHTML.length + ' 字 / #dlglist ' + list.innerHTML.length + ' 字）');
  /* ⚠️ 弹窗行用的是 `data-row`、不是 `data-i` ⇒ 这里**不按 i 过滤**（`matchIn` 已定位到第一条，
     `btnOf` 从同段 markup 里找的第一个 `pickw` 就是同一条；按 `data-i` 过滤会永远 null，踩过）。 */
  const rowEl = btnOf(list.innerHTML, 'pickw', null, dom.fireClick);
  if (!rowEl) throw new Error('弹窗第一行取不到（row0=' + JSON.stringify(row0) + ' · ' + list.innerHTML.slice(0, 200) + '）');
  rowEl.click();                                         // → 只选候选，不能写入配装
  if(page.state.wslots[+pickBtn.i]!=null)throw new Error('候选预览提前写入了武器槽');
  const pickerFooter=page.$('#dlg').children.find(el=>el.className==='build-picker-footer');
  const applyItem=btnOf(pickerFooter?.innerHTML||'', 'picker-apply', null, dom.fireClick);
  if(!applyItem)throw new Error('武器候选缺少应用入口');
  applyItem.click();                                     // → 明确应用才写入 state.wslots
  if(page.state.wslots[+pickBtn.i]==null)throw new Error('应用后武器槽仍为空');
  page.setActive(pickBtn.i);
  page.recalc();
  /* ── `--build='面具,背包,背心,手套,枪套,护膝|武器'` 指定一套装等直接试算（2026-10-16 近战通道）─────
     两种词条口径各算一遍：
       · `empty` = 六格词条全空（件的「特殊固定词条」全部喂引擎）；
       · `auto`  = 每格随机槽填第一条候选（**优化器口径**，`words()`/autoFillGear 同判据）。
     两者对照能直接看出「件的自带加成（具名 DTA/DTH/OOC/近战伤害）有没有被喂进去」。 */
  let buildProbe = null;
  const buildArg = (process.argv.find((a) => a.startsWith('--build=')) || '').slice('--build='.length);
  if (buildArg) {
    const parts = buildArg.split('|');
    const gear = [], miss = [];
    for (const n of parts[0].split(',')) {
      if (!n || n === '-' || n === '—') { gear.push(null); continue; }
      const it = page.gearByName(n.trim());
      if (it) gear.push(it); else { gear.push(null); miss.push(n.trim()); }
    }
    while (gear.length < 6) gear.push(null);
    const wb = parts[1] ? page.weaponByName(parts[1].trim()) : null;
    if (!wb) throw new Error('--build 找不到武器：' + (parts[1] || '(空)'));
    const probeOne = (mode) => {
      const snap = page.snapshot();
      page.setBuild(wb, gear, { wslot: 0 });
      if (mode === 'auto') for (let i = 0; i < 6; i++) if (gear[i]) page.state.affix[i] = page.affixPlan(gear[i]);
      /* 核心按优化器口径挑（武器伤害优先），否则件自带蓝核的件（空心人）会白少一条红核 */
      if (mode === 'auto') for (let i = 0; i < 6; i++) if (gear[i]) page.state.core[i] = page.coreWantedOf(gear[i]);
      const r = page.evalBuild(wb, gear, { wslot: 0 });
      const f = (r && r.fields) || {};
      /* 近战相关的入参行（谁喂的、喂了多少）—— 池里多了 500 这种事必须有出处，不能靠猜 */
      const fed = [];
      try {
        const pk = page.picksOf(wb, gear, { wslot: 0 });
        (pk.attrs || []).concat(pk.mods || []).concat(pk.tweaks || []).forEach((a) => {
          const nm = String(a.name || a.key || '');
          if (/melee|近战/i.test(nm)) fed.push(nm + ' ' + Math.round((+a.val || 0) * 100) / 100);
        });
      } catch (e) { fed.push('ERR:' + e); }
      const out = {
        melee: r && r.MeleeDamage, base: r && r.MeleeBase, armor: r && r.Melee_Armor,
        cover: r && r.Melee_Cover, armorCover: r && r.Melee_ArmorCover,
        pool: f.MeleeDamage, wpn: f.AllWeaponDamage, wdtal: f.WeaponDamage_Talent,
        total: f.TotalWeaponDamage, amp: f.AmplifyDamage, dta: f.ArmorDamage, dth: f.HealthDamage,
        ooc: f.OutCoverDamage, chd: f.CriticalHitDamage, chcF: f.CriticalHitChance, ignored: (r && r.ignoredAttrs) || null, fed: fed,
        bullet: r && r.BulletDamage, sdps: r && r.SDPS,
      };
      page.restore(snap);
      return out;
    };
    buildProbe = { miss: miss, weapon: page.weaponName(wb), gear: page.gearNames(gear), empty: probeOne('empty'), auto: probeOne('auto') };
  }
  /* ── 一键配装的**可行性能测**：全遍历一遍「每格所有候选 + 3 个武器槽所有武器」耗时多久 ──────
     这是「优化器放页面里跑还是挪进 Web Worker」的判据，所以必须在**真引擎 + 真数据**上量，
     不能用「一次 compute 看着很快」推。`--bench` 时才跑，平常不拖慢冒烟。 */
  let bench = null;
  if (process.argv.includes('--bench')) {
    /* 量「一轮坐标下降要试算多少次、多久」：候选集 = 6 格该部位全部件 + 3 个武器槽全部武器。
       一律走页面的纯函数口 `evalBuild`（真引擎 + 真数据）⇒ 结论直接对应将来的优化器。 */
    const t0 = Date.now();
    let n = 0;
    const wcur = page.state.wslots[0];
    const wobj = page.weaponAt(wcur);
    const base = page.state.slots.map((raw, i) => page.gearOf(i));
    /* ① 每个装备格：试遍「该部位全部件」（去重后），其余格保持当前装等 */
    const perSlot = [];
    let gearN = 0;
    for (let s = 0; s < 6; s++) {
      const cands = page.gearAtSlot(s);
      perSlot.push(cands.length);
      gearN += cands.length;
      const g = base.slice();
      for (const it of cands) {
        g[s] = it;
        const r = page.evalBuild(wobj, g, {});
        if (r && isFinite(r.SDPS)) n++;
      }
      g[s] = base[s];
    }
    /* ② 每个武器槽：试遍所有武器 */
    const weaponN = page.allWeaponCount();
    for (let s = 0; s < 3; s++) {
      for (const w of page.allWeapons()) {
        const r = page.evalBuild(w, base, { wslot: s });
        if (r && isFinite(r.SDPS)) n++;
      }
    }
    const ms = Date.now() - t0;
    bench = { calls: n, ms: ms, perCall: n ? ms / n : 0, perSlot: perSlot, gearPer: gearN, weaponN: weaponN };
  }
  /* ── PvP 开关的**结果级**判据（用户第 268 轮「PVP数值也没有加进去，我需要配装器加上 PVP 开关」）──────
     不能只断言「开关能点」：必须证明**同一套装等下，开关真的把结果算变了**，且变的是官方那套数。
     做法：挑一条官方确实有 PvP 数值的天赋装到当前武器上，比 `state.bp.pvp` 关/开两次的 r。
     ⚠️ PvP 数值只喂给**引擎认识的属性名**（`attrKey` 归一后落在 MAP 里的），
     官方名对不上引擎字段的那部分照旧不参与计算 ⇒ 这里不断言「一定变」，只断言「变了的条数 ≥ 1」
     并要求把**没变**的样本一起打出来，免得拿一条恰好变了的当全部。 */
  let pvp = null;
  if (process.argv.includes('--pvp')) {
    const w = page.weaponAt(page.state.wslots[0]);
    const cands = page.pvpTalents();
    const tried = [], changed = [];
    for (const idx of cands.slice(0, 12)) {
      page.state.talents[0] = idx;
      page.state.bp.pvp = false;
      const off = page.evalBuild(w, page.state.slots.map((raw, i) => page.gearOf(i)), { wslot: 0 });
      page.state.bp.pvp = true;
      const on = page.evalBuild(w, page.state.slots.map((raw, i) => page.gearOf(i)), { wslot: 0 });
      const row = { name: page.talentAt(idx).zh || page.talentAt(idx).en || '', off: off && off.SDPS, on: on && on.SDPS };
      tried.push(row);
      if (Math.abs((row.on || 0) - (row.off || 0)) > 1e-6) changed.push(row);
    }
    page.state.bp.pvp = false;
    /* 诊断：把**入参里的键**与引擎 MAP 对照，找出会让引擎静默忽略的写法。
       别只看结果 —— 「喂了但引擎不认」与「没喂」在数字上完全同形（2026-09-13 真踩：双单位 `%%`）。 */
    let diag = null;
    if (cands.length) {
      const t = page.talentAt(cands[0]);
      const picks = page.picksOf(w, page.state.slots.map((raw, i) => page.gearOf(i)), { wslot: 0 });
      const keys = page.attrKeysOf();
      const bad = {};
      (picks.attrs || []).forEach((a) => {
        const k = String(a.name || '') + (a.unit || '');
        if (k && keys.indexOf(k) < 0) bad[k] = (bad[k] || 0) + 1;
      });
      const r0 = page.evalBuild(w, page.state.slots.map((raw, i) => page.gearOf(i)), { wslot: 0 });
      diag = {
        pve: Object.keys(bad).length,
        sample: Object.keys(bad).slice(0, 6),
        params: page.pvpBonusOf(t).map((b) => {
          const raw = b.attr_zh || b.attr_en || '';
          const key = page.attrKeyOf(raw, b.unit || '');
          return { raw: raw || '(无名)', key: key || '(空)', known: !!key && page.attrKnownOf(raw, b.unit || '') };
        }),
        supported: page.talentSupportedOf(t.zh || t.en || ''),
        ignored: (r0 && r0.ignoredAttrs) || null,
      };
    }
    pvp = { candidates: cands.length, tried: tried.length, changed: changed.length, samples: tried.slice(0, 6), diag: diag };
  }
  const out = {
    dps: page.$('#v_dps').textContent, dpm: page.$('#v_dpm').textContent,
    sdps: page.$('#v_sdps').textContent, panel: {},
  };
  page.RCELLS.forEach(([k]) => { out.panel[k] = page.$('#v_' + k).textContent; });
  out.hits = (page.$('#r_hits').innerHTML.match(/hgc/g) || []).length;
  /* 武器名从**渲染出来的卡面**读（不是从 db 里猜下标）：卡面是什么，就是页面真的装了什么 */
  const wn = (page.$('#wstrip').innerHTML.match(/class="wname">\s*([^<]*)/) || [])[1] || '—';
  out.weapon = wn.replace(/\s+/g, ' ').trim() || '—';
  out.slot = page.state.wslots[0];
  /* ── 一键配装真跑一遍：**不同目标必须配出不同装等**（否则目标函数是摆设） ──────────────
     这既是「优化器能跑」的证据，也是「单发最高 ≠ DPS 最高」的实证。 */
  let opts = null;
  if (process.argv.includes('--opt')) {
    /* `--tgt=bullet` / `--tgt=bullet,sdps` 只跑指定目标；`--budget=1500` 传试算预算
       （不传走 optimizeBuild 默认 6000）；`--wtype=N`（0=不限，1..7=WTYPES 顺序）。
       用途：多进程并行跑「条件 × 预算档」矩阵，蒸馏「次数↔结果」曲线 + 生成条件预设
       （2026-10-16 用户「多线程跑各个条件、条件是有限的、次数少结果不会怎么变」）。 */
    const tgtArg = (process.argv.find((a) => a.startsWith('--tgt=')) || '').split('=')[1];
    const flowArg=(process.argv.find((a) => a.startsWith('--flow='))||'').split('=')[1];
    const tList = tgtArg ? tgtArg.split(',').filter(Boolean) : (flowArg ? ['auto'] : ['bullet', 'sdps', 'dpm']);
    const budArg = +(process.argv.find((a) => a.startsWith('--budget=')) || '').split('=')[1];
    const wtArg = +(process.argv.find((a) => a.startsWith('--wtype=')) || '').split('=')[1];
    const wsArg = +(process.argv.find((a) => a.startsWith('--wslot=')) || '').split('=')[1];
    /* `--brands=set:strikersbattlegear` + `--bmin=4` = 「≥4 件来自该族」的硬约束
       （repo 的 `reqBrandOk` 语义）——用于「4+2 配装」对照实验（2026-10-16 用户质疑）。 */
    const brArg = (process.argv.find((a) => a.startsWith('--brands=')) || '').split('=')[1];
    const bminArg = +(process.argv.find((a) => a.startsWith('--bmin=')) || '').split('=')[1];
    const wtype = isFinite(wtArg) ? wtArg : 0;
    const wslot = isFinite(wsArg) ? wsArg : 0;
    opts = [];
    for (const t of tList) {
      const t0 = Date.now();
      /* `--flow=<流派>`：用流派自带的目标（`auto`）；显式 `--tgt=` 优先。 */
      const o = { wtype, wslot, maxRounds: 4 };
      if (t !== 'auto') o.target = t;
      if (flowArg) o.flow = flowArg;
      if (isFinite(budArg) && budArg > 0) o.budget = budArg;
      if (brArg) o.req = { brands: brArg.split(','), bmin: isFinite(bminArg) && bminArg > 0 ? bminArg : 4 };
      const res = page.optimize(o);
      const ms = Date.now() - t0;
      /* 流派模式下目标由流派决定 ⇒ 后面一律用引擎回的那个 `res.target` 计价/展示 */
      const tUsed = (res && res.target) || t;
      if (!res || !res.ok) { opts.push({ target: tUsed, ok: false, why: res && res.why }); continue; }
      const r = res.r;
      /* **优化器自证**：把它交出来的那套（武器 + 装备）拿引擎**独立重算一遍**，
         目标值必须与它内部的评分完全相等。不等就说明「评分用的那套」与「交出来的那套」不是同一套
         —— 那是最坏的一类缺陷：界面把 A 的分数贴到 B 的配装上，而两个数看着都很正常。
         ⚠️ 重算必须**把 `state` 摆成那套**（`evalBuild` 会读 `state.gmods` / `state.talents` /
         `state.bonuses` / `state.tweaks`），所以先存快照再还原。 */
      const snap = page.snapshot();
      page.setBuild(res.w, res.gear, { wslots: res.wslots, wslot: res.wslot });
      let r2 = null; let verify = null;
      /* ⚠️ 必须调 `evalBuild(w,gear,opt)` 而**不是** `recalc()`：`recalc()` 没有返回值（只往 DOM 写），
         拿它当判据会永远得到 undefined ⇒ 诊断恒判「不一致」（本轮真踩，差点当成优化器缺陷去改公式）。 */
      try {
        /* ⚠️ 重算必须带上优化器交付的**全六维**：`core`/`affix`/`gtal` 少了会退回「件自带核心 + 无副属性」
           （2026-10-16 近战目标实测 32.4 vs 32.86 就是这条）；`gmods`/`wmods`/`waffix`/`talents` 少了会
           退回页面残值 ⇒ 自证值与内部评分对不上，恒判「不一致」（假报警，比真缺陷更难查）。 */
        r2 = page.evalBuild(res.w, res.gear, { wslots: res.wslots, wslot: res.wslot, core: res.core, affix: res.aff,
          gtal: res.gtal, gmods: res.gmods, wmods: res.wmods, waffix: res.waffix, talents: res.talents });
        verify = r2 ? page.tval(r2, tUsed) : null;
      } catch (e) { verify = 'ERR:' + e; }
      page.restore(snap);
      const score = r ? page.tval(r, tUsed) : null;
      opts.push({
        target: tUsed, ok: true, ms: ms, rounds: res.rounds, calls: res.calls,
        search: res.search, mode: res.mode, plan: res.plan, cover: res.cover, sel: res.sel,
        wtype: res.wtypeName || '不限', w: page.weaponName(res.w),
        gear: page.gearNames(res.gear),
        bullet: r && r.BulletDamage, dps: r && r.DPS, dpm: r && r.DPM, sdps: r && r.SDPS,
        armor: r && r.Armor, health: r && r.Health, chc: r && r.CHC, chd: r && r.CHD,
        elite: r ? page.cval(r, 'elites') : null, exotic: res.gear.filter((x) => x && x.kind === 'exotic').length,
        score: score, verify: verify, same: score === verify,
      });
    }
  }
  /* ── `--seed='set:j:4,set:a:2'` 骨架起点实验（2026-10-16，只读实验层）────────────────
     用户 2026-10-16 定的第一轮实验：**骨架作为搜索起点、不作为硬约束**，在同一份预算内
     「少量骨架起点 + 局部优化」能不能稳定改善结果。这里只验证三件事：种子输入 / 全局预算 / 同预算对照。
       ① 骨架 →（本体只用来算「起点分」）→ 6 长族键数组 `spec6`；
       ② 直接传 `o.seeds=[spec6]` 跑 `optimize`（同目标、同预算）：分数 / calls / ms / ok·why / 交付族结构 / 自证；
       ③ `restore` 回原状态再跑一次**同预算对照**（同一份 `o`，不带 `seeds`），给出两者差值。
     ⚠️ **本轮已接生产侧种子通路（`o.seeds`）**：骨架不再经「当前配装」进入搜索，而是作为
        一组 6 长族键数组直接传给 `optimizeBuild`（`optSeedSpec`/`optSeedGear`）——
        未指定的格由中性件补齐，非法族键**只丢那一条**，与既有起点逐件相同的按 raw 序列**去重**
        （`res.seeds` 分账：`requested = accepted + dupes + invalid`）。骨架**只作起点、不作硬约束**：
        优化器把每个起点跑一遍统一下降器，谁分高谁留。 */
  let seedExp = null;
  const seedSpec = argVal('seed'), seedBadKey = argVal('seedbad');
  if (seedSpec) {
    const plan = assembleSeed(page, seedSpec);
    if (plan.err) throw new Error('--seed 装配失败：' + plan.err);
    const flowArg2 = argVal('flow'), tgtArg2 = argVal('tgt');
    const flowTgt = flowArg2 ? ((page.optFlows().find((f) => f[0] === flowArg2) || [])[2] || null) : null;
    const scoreId = (tgtArg2 && tgtArg2 !== 'auto') ? tgtArg2 : (flowTgt || 'sdps');
    const sbud = +argVal('budget'), swt = +argVal('wtype'), swsl = +argVal('wslot');
    const wslot = isFinite(swsl) ? swsl : page.state.wactive;
    const wobj = page.weaponAt(page.state.wslots[wslot]);
    if (!wobj) throw new Error('--seed 实验：槽 ' + wslot + ' 上没有武器（试算台启动时会先挑一把）');
    const clean = page.snapshot();
    /* 骨架 → 6 长族键数组（元素 `null` 或 `set:<code>`/`brand:<code>`，格式同 `reqPieceKey`）。
       未指定的格写 `null` ⇒ 由优化器用中性件补齐（这正是「骨架不是硬约束」的落地）。 */
    const spec6 = new Array(6).fill(null);
    plan.filled.forEach((f) => { if (f.fam !== '—') spec6[SLOT_NAME.indexOf(f.slot)] = f.fam; });
    /* 起点分（最小装配、未优化）：只作对照展示，跑完立刻还原 —— 它不参与优化，只是给用户一个参照。 */
    page.setBuild(wobj, plan.gear, { wslot: wslot });
    const placed = page.state.slots.map((raw) => ((db.gear[raw] || {}).slot || '?'));
    const idxOk = placed.every((s, i) => s === SLOT_NAME[i]);
    const startScore = page.tval(page.evalBuild(wobj, plan.gear, { wslot: wslot }), scoreId);
    page.restore(clean);
    if (!idxOk) throw new Error('--seed 装配下标与槽位对不上：' + JSON.stringify(placed));
    const mkOpt = (withSeeds) => {
      const o = { target: scoreId, wtype: isFinite(swt) ? swt : 0, wslot: wslot, maxRounds: 4 };
      if (flowArg2) o.flow = flowArg2;
      if (isFinite(sbud) && sbud > 0) o.budget = sbud;
      if (withSeeds) {
        o.seeds = [spec6];
        /* `--seedbad=<族键>`：再塞一条**保证挑不到件**的骨架（族键在本池不存在）
           ⇒ `optSeedGear` 走 `!hit → return null`，验证「非法 spec 只丢那一条」。
           合法那条必须照常入池并进起点集。 */
        if (seedBadKey) o.seeds.push(new Array(6).fill(seedBadKey));
      }
      return o;
    };
    const famCount = (fams) => { const m = {}; (fams || []).forEach((f) => { m[f] = (m[f] || 0) + 1; }); return m; };
    const runOne = (label, withSeeds) => {
      const t0 = Date.now();
      const res = page.optimize(mkOpt(withSeeds));
      const ms = Date.now() - t0;
      const row = { label: label, seedSpec: withSeeds ? spec6 : null,
        ok: !!(res && res.ok), why: res && res.why, ms: ms, calls: res && res.calls,
        budget: mkOpt(false).budget || 6000, target: (res && res.target) || scoreId,
        search: res && res.search, mode: res && res.mode, plan: res && res.plan,
        seeds: res && res.seeds };
      if (!res) return row;
      if (!res.ok) {
        /* 没交出方案（`no-improvement` / `search-exhausted`）⇒ **原配装保留**（用户口径）。
           `no-improvement` 把两边都摊开：基线（起点自己的分）与被比下去的那个候选。 */
        row.baseline = res.baseline; row.candidate = res.candidate; row.kept = true;
        row.score = res.baseline; row.w = page.weaponName(wobj);
        return row;
      }
      /* 与 `--opt` 同一条自证：把交出来的那套**含全六维**摆回 state 再用引擎独立重算。
         ⚠️ 少传任一维（gmods/wmods/waffix/talents）都会退回页面残值 ⇒ 自证值恒不相等（假报警）。 */
      const snap2 = page.snapshot();
      page.setBuild(res.w, res.gear, { wslots: res.wslots, wslot: res.wslot });
      let r2 = null, verify = null;
      try {
        r2 = page.evalBuild(res.w, res.gear, { wslots: res.wslots, wslot: res.wslot, core: res.core, affix: res.aff,
          gtal: res.gtal, gmods: res.gmods, wmods: res.wmods, waffix: res.waffix, talents: res.talents });
        verify = r2 ? page.tval(r2, row.target) : null;
      } catch (e) { verify = 'ERR:' + e; }
      page.restore(snap2);
      const r = res.r || {};
      row.score = r ? page.tval(r, row.target) : null;
      row.verify = verify; row.same = row.score === verify;
      row.w = page.weaponName(res.w); row.gear = page.gearNames(res.gear); row.families = page.familiesOf(res.gear);
      row.exotic = (res.gear || []).filter((x) => x && x.kind === 'exotic').length;
      row.bullet = r.BulletDamage; row.dps = r.DPS; row.dpm = r.DPM; row.sdps = r.SDPS;
      row.armor = r.Armor; row.chc = r.CHC; row.chd = r.CHD;
      row.cover = res.cover; row.wtalent = res.talents ? res.talents[res.wslot] : null;
      /* 「保族」：交付的那套里骨架各族还剩几件 —— 骨架被优化器离开了多少，一眼可见
         （只在有骨架起点的那一行算；对照行没有骨架，就只给族结构） */
      row.famCounts = famCount(row.families);
      if (withSeeds) row.keptFamilies = plan.entries.map((e) => ({ fam: e.fam, want: e.n, got: row.famCounts[e.fam] || 0 }));
      return row;
    };
    const rows = [runOne('骨架起点（o.seeds）', true)];
    page.restore(clean);
    rows.push(runOne('同预算对照（无 seeds）', false));
    seedExp = {
      spec: seedSpec, seedSpec6: spec6, target: scoreId, budget: mkOpt(false).budget || 6000,
      weapon: page.weaponName(wobj), assembled: plan.filled, idxOk: idxOk,
      startScore: startScore, rows: rows,
      delta: (isFinite(rows[0].score) && isFinite(rows[1].score)) ? rows[0].score - rows[1].score : null,
    };
  }
  /* ── 穷举参照（`--brute=slot|subset|tiny`）──────────────────────────────────────
     给「搜索质量」一个**可核的参照**：在人为缩小的空间里**穷举**，断言优化器交出来的分
     `opt.v` **不低于**该空间最优 `ref.v`（否则搜索在这个空间里输给暴力）。
     参照的每一格都走生产侧 `o.probe`（`sel` + `refitSlot` 那份**唯一**口径），试算台不另写 sel。
     空间定义（`free` = 允许重填口径的槽，其余槽 + 武器锁在交付解上）：
       · slot   某一槽**全池**逐件（`--gslot=<i>`，缺省 2 号胸甲；`--slot` 已是武器槽，别撞名）
       · subset 2 槽 × 每槽 3 个「非交付件」= 9 组
       · tiny   2 槽 × 每槽 4 个「非交付件」= 16 组（≤32）
     另加一条**同口径逐位比较**：把交付解原样喂回 `o.probe`（不重填），分必须**逐位相等**。 */
  const bruteMode = argVal('brute');
  let brute = null;
  if (bruteMode) {
    const budgetB = (() => { const b = +argVal('budget'); return isFinite(b) && b > 0 ? b : 6000; })();
    const tgtB = (() => { const t = argVal('tgt'); return (t && t !== 'auto') ? t : 'sdps'; })();
    const wslotB = (() => { const v = +argVal('wslot'); return isFinite(v) ? v : page.state.wactive; })();
    const wtypeB = (() => { const v = +argVal('wtype'); return isFinite(v) ? v : 0; })();
    const opt = page.optimize({ target: tgtB, wtype: wtypeB, wslot: wslotB, budget: budgetB, maxRounds: 4 });
    if (!opt || !opt.ok) {
      brute = { mode: bruteMode, ok: false, why: '优化器未交出方案：' + (opt && opt.why) };
    } else {
      const D = opt.gear, Dw = opt.w, Dsel = opt.sel, optV = page.tval(opt.r, tgtB);
      const altOf = (i, per) => {
        const out = [];
        for (const it of page.gearAtSlot(i)) { if (out.length >= per) break; if (it !== D[i]) out.push(it); }
        return out;
      };
      const probe = (gear, free) => {
        const snap = page.snapshot();
        let v = null;
        try {
          const r = page.optimize({ target: tgtB, wslot: wslotB, probe: { gear: gear, w: Dw, sel: Dsel, free: free } });
          v = r && r.ok ? r.v : null;
        } catch (e) { v = null; }
        page.restore(snap);
        return v;
      };
      let ref = -Infinity, refAt = null, total = 0, skipped = 0;
      const consider = (gear, free, tag) => {
        const v = probe(gear, free); total++;
        if (v == null) { skipped++; return; }
        if (v > ref) { ref = v; refAt = tag; }
      };
      if (bruteMode === 'slot') {
        const si = (() => { const i = +argVal('gslot'); return (i >= 0 && i <= 5) ? i : 2; })();
        for (const it of page.gearAtSlot(si)) {
          if (it === D[si]) continue;
          const g = D.slice(); g[si] = it;
          consider(g, [si], '槽' + si + ' → ' + (it.zh || it.en || '?'));
        }
      } else {
        const per = bruteMode === 'tiny' ? 4 : 3;
        const A = altOf(2, per), B = altOf(3, per);
        for (const a of A) for (const b of B) {
          const g = D.slice(); g[2] = a; g[3] = b;
          consider(g, [2, 3], '胸甲 ' + (a.zh || a.en) + ' + 护膝 ' + (b.zh || b.en));
        }
      }
      /* 同口径逐位比较：交付解原样喂回（`sel` 照用、不重填），必须 == `optV`。 */
      const sameV = probe(D.slice(), []);
      brute = {
        mode: bruteMode, ok: true, budget: budgetB, optV: optV,
        ref: isFinite(ref) ? ref : null, refAt: refAt, combos: total, skipped: skipped,
        sameV: sameV, same: sameV === optV,
        pass: (isFinite(ref) ? optV >= ref - 1e-9 : true) && sameV === optV,
      };
      console.log('  穷举参照 [' + bruteMode + '] 组合 ' + total + '（不可行 ' + skipped + '）'
        + ' · 交付 ' + svgish(optV) + ' ≥ 参照 ' + svgish(brute.ref) + ' ' + (brute.pass ? '✅' : '❌'));
      console.log('    参照最优出现在：' + (refAt || '（参照集全不可行）'));
      console.log('    同口径逐位比较：交付 ' + svgish(optV) + (brute.same ? ' == ' : ' != ') + '探针 ' + svgish(sameV));
      if (!brute.pass) throw new Error('穷举参照未通过：' + JSON.stringify(brute));
    }
  }
  out.opts = opts;
  out.seed = seedExp;
  out.brute = brute;
  out.errors = errors;
  if (asJson) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log('武器：' + out.weapon + '（槽内下标 ' + out.slot + '）');
  console.log('爆发 DPS ' + out.dps + ' · 弹匣伤害 ' + out.dpm + ' · 循环 DPS ' + out.sdps);
  console.log('玩家面板：' + Object.entries(out.panel).map(([k, v]) => k + '=' + v).join(' · '));
  console.log('命中矩阵格数 ' + out.hits + ' · 页面 console.error ' + out.errors.length);
  if (bench) {
    console.log('一键配装一轮试算：' + bench.calls + ' 次 / ' + bench.ms + ' ms ⇒ 单次 ' + bench.perCall.toFixed(3)
      + ' ms（部位候选 ' + bench.perSlot.join('/') + ' = ' + bench.gearPer + ' 件 · 武器 ' + bench.weaponN + ' × 3 槽）');
  }
  if (opts) {
    console.log('');
    console.log('── 一键配装（全重排 · 不限武器类别 · 奇特唯一强制）──');
    for (const o of opts) {
      if (!o.ok) { console.log('  ' + o.target + ' ❌ 无解（' + o.why + '）'); continue; }
      console.log('  目标 ' + o.target + ' → ' + o.w + '（' + o.wtype + '）· ' + o.rounds + ' 轮 / '
        + o.calls + ' 次 / ' + o.ms + ' ms · 奇特 ' + o.exotic);
      console.log('    单发 ' + svgish(o.bullet) + ' · 爆发 ' + svgish(o.dps) + ' · 弹匣 ' + svgish(o.dpm)
        + ' · 循环 ' + svgish(o.sdps) + ' · 护甲 ' + svgish(o.armor) + ' · 精英防御 ' + svgish(o.elite));
      console.log('    装备 ' + o.gear.join(' ｜ '));
      if (o.cores) console.log('    交付：核心 ' + (o.cores||[]).join(',') + ' · 副属性 ' + (o.affs||[]).map(a=>a.join('/')).join(' , ') + ' · 枪种 ' + o.wtype);
      if (o.fTwd != null) console.log('    乘区：武器伤 ' + num2(o.fWpn) + ' · 总武器伤 ' + num2(o.fTwd) + ' · 暴伤 ' + num2(o.fChd) + ' · 独立增伤 x' + num2(o.fAmp) + ' · 暴率 ' + num2(o.chc));
      console.log('    自证：目标值 ' + svgish(o.score) + ' vs 引擎独立重算 ' + svgish(o.verify)
        + (o.same ? ' ✅ 一致' : ' ❌ 不一致（评分的那套 ≠ 交出来的那套）'));
      if (o.plan) console.log('    阶段账：' + o.plan.map((p) => p.phase + ' ' + p.calls + '次'
        + (p.gain ? ' (+' + svgish(p.gain) + ')' : '')).join(' · ')
        + ' · 搜索 ' + (o.search || '—') + ' · 模式 ' + (o.mode || '—'));
      if (o.cover && o.cover.dims) {
        const d = o.cover.dims;
        console.log('    覆盖：件 ' + d.piece.evaluated + ' 次(池 ' + d.piece.pool + ' 件) · 核心 ' + d.core.evaluated
          + ' · 副属性 ' + d.affix.evaluated + ' · 防具插件 ' + d.gmods.evaluated + '/' + d.gmods.cands
          + ' · 武器 ' + d.weapon.screened + '(精算 ' + d.weapon.refined + ') · 武器天赋 ' + d.wtalent.evaluated
          + '/' + d.wtalent.usable + ' · 武器插件 ' + d.wmods.evaluated + ' · 武器词条 ' + d.waffix.evaluated
          + ' · 件天赋 ' + d.gtal.evaluated + '/' + d.gtal.usable + '(锁件 ' + d.gtal.lockedByPiece + ')');
        console.log('    未支持：武器天赋 ' + d.wtalent.unsupportedKeys.length + ' 条 · 件天赋 '
          + d.gtal.unsupportedKeys.length + ' 条 · 核心池 ' + (d.core.codes || []).length
          + ' · 副属性池 ' + (d.affix.codes || []).length + ' · 无插件位槽 ' + JSON.stringify(d.gmods.noSlot)
          + (o.cover.engineIgnored.length ? ' · 引擎忽略属性 ' + o.cover.engineIgnored.join('/') : '')
          + (o.cover.notes.length ? ' · 口径：' + o.cover.notes.join(' / ') : ''));
       if (o.cover && o.cover.dims) {
         const __unran = Object.keys(o.cover.dims).filter((k) => o.cover.dims[k] && o.cover.dims[k].ran !== true);
         if (__unran.length) console.log('    ⚠️ 未跑到：' + __unran.join(' ｜ '));
       }
      }

    }
  }
  if (seedExp) {
    console.log('');
    console.log('── 骨架起点实验（--seed）──');
    console.log('  骨架 ' + seedExp.spec + ' → ' + seedExp.assembled.map((x) => x.item + '（' + x.fam + '）').join(' ｜ '));
    console.log('  武器 ' + seedExp.weapon + ' · 装配槽位校验 ' + (seedExp.idxOk ? '✅ 一致' : '❌ 错位')
      + ' · 起点分（最小装配，未优化） ' + svgish(seedExp.startScore));
    for (const r of seedExp.rows) {
      if (!r.ok) {
        console.log('  ' + r.label + ' ⏹ 未交出方案（' + r.why + '）· ' + r.calls + ' 次 / ' + r.ms + ' ms');
        if (r.baseline != null) console.log('    起点分 ' + svgish(r.baseline) + ' · 被比下的候选 '
          + svgish(r.candidate) + '（原配装保留）· 装备 ' + (r.gear || []).join(' ｜ '));
        continue;
      }
      console.log('  ' + r.label + ' ✅ 目标 ' + r.target + ' ' + svgish(r.score) + ' · '
        + (r.rounds != null ? r.rounds + ' 轮 / ' : '') + r.calls + ' 次 / ' + r.ms + ' ms · 奇特 ' + r.exotic
        + ' · 自证 ' + (r.same ? '✅ 一致' : '❌ 不一致（评分的那套 ≠ 交出来的那套）'));
      console.log('    武器 ' + r.w + ' · 装备 ' + r.gear.join(' ｜ ')
        + (r.wtalent != null ? ' · 武器天赋下标 ' + r.wtalent : ''));
      if (r.cover && r.cover.dims) {
        const d = r.cover.dims;
        console.log('    覆盖：件 ' + d.piece.evaluated + ' 次(池 ' + d.piece.pool + ' 件) · 核心 ' + d.core.evaluated
          + ' · 副属性 ' + d.affix.evaluated + ' · 防具插件 ' + d.gmods.evaluated + '/' + d.gmods.cands
          + ' · 武器 ' + d.weapon.screened + '(精算 ' + d.weapon.refined + ') · 武器天赋 ' + d.wtalent.evaluated
          + '/' + d.wtalent.usable + ' · 武器插件 ' + d.wmods.evaluated + ' · 武器词条 ' + d.waffix.evaluated
          + ' · 件天赋 ' + d.gtal.evaluated + '/' + d.gtal.usable);
      }
      console.log('    ' + (r.keptFamilies ? '保族 '
        + r.keptFamilies.map((k) => k.fam + ' ' + k.got + '/' + k.want).join(' · ') + ' · ' : '')
        + '族 ' + Object.entries(r.famCounts || {}).map(([k, n]) => k + '×' + n).join(' ')
        + ' · 循环 ' + svgish(r.sdps) + ' · 弹匣 ' + svgish(r.dpm) + ' · 护甲 ' + svgish(r.armor));
      if (r.seeds) { const s = r.seeds, isCtl = !r.seedSpec;
        console.log('    种子账：请求 ' + s.requested + ' · 入池 ' + s.accepted
          + ' · 去重 ' + (s.dupes || 0) + ' · 非法 ' + (s.invalid || 0) + ' · 进起点集 ' + s.starts
          + (isCtl ? ' —（对照行：五项恒 0 才对）'
            : s.starts > 0 ? ' ✅ 通路生效'
              : (s.dupes || 0) > 0 ? ' ✅ 去重：该骨架与既有起点逐件相同（raw 序列去重，计划 Step ⑥）'
                : ' ❌ 通路未生效（种子没被选进起点集）')); }
    }
    if (seedExp.delta != null) {
      console.log('  同预算差值（骨架起点 − 对照） ' + (seedExp.delta >= 0 ? '+' : '') + svgish(seedExp.delta)
        + ' · 预算 ' + seedExp.budget + ' 次');
    }
    /* ⚠️ 判据不是「差值 ≠ 0」：全预算下差值大概率是 0 —— 骨架被下降器带到**同一个**全局最优
       （`保族 0/4` 正是「骨架不是硬约束」的落地），这不代表通路失效。
       通路是否生效看 `res.seeds` 记账（每档都要落账）：
       ① `requested === accepted + dupes + invalid` —— 每条请求必须三选一（入池 / 去重 / 非法）；
       ② `accepted >= 1` ⇒ `starts >= 1`（`mustIdx` 保底把入池的种子塞进起点集，它一定被下降过）；
          `accepted === 0` 且 `dupes >= 1` 也算合法路径（`set:y:4,brand:a1:2` 就是内部套装种子的孪生）；
       ③ 「无 seeds」对照行五项全 0；
       ④ `--seedbad`：坏族键那条记进 `invalid`（只丢它自己），合法那条照常入池/去重。
       差值≠0 的实例（骨架真的改变受限预算下的搜索结果）：`--seed=set:d:4,brand:g:1 --budget=600 --tgt=bullet`。 */
    const withS = seedExp.rows[0].seeds, noS = seedExp.rows[1].seeds;
    const expReq = seedBadKey ? 2 : 1;
    const accounted = !!withS && (withS.accepted + (withS.dupes || 0) + (withS.invalid || 0)) === withS.requested;
    const invalidOk = !seedBadKey || (withS && (withS.invalid || 0) === 1);
    const startsOk = !!withS && (withS.accepted === 0 || withS.starts >= 1);
    const seedWired = !!(withS && withS.requested === expReq && accounted && invalidOk && startsOk);
    const seedClean = !!(noS && noS.requested === 0 && noS.accepted === 0
      && (noS.dupes || 0) === 0 && (noS.invalid || 0) === 0 && noS.starts === 0);
    if (!seedWired || !seedClean) throw new Error('骨架种子通路未生效：'
      + JSON.stringify({ withSeeds: withS, noSeeds: noS }));
    console.log('  种子通路自证 ✅ 有 seeds 时请求 ' + withS.requested + ' / 入池 ' + withS.accepted
      + ' / 去重 ' + (withS.dupes || 0) + ' / 非法 ' + (withS.invalid || 0)
      + ' / 进起点集 ' + withS.starts + (seedBadKey ? '（非法那条 ' + seedBadKey + ' 被丢、合法那条照常入池）' : '')
      + ' · 无 seeds 时全为 0（差值 0 属正常：骨架被带到同一最优或与既有起点去重，保族 0/N 即「不作硬约束」）');
  }
  if (pvp) {
    console.log('');
    console.log('── PvP 开关（官方 talents_official[].bonus_pvp，阶段 25）──');
    console.log('  库里有 PvP 数值的天赋 ' + pvp.candidates + ' 条 · 本轮试了 ' + pvp.tried
      + ' 条 · 结果真的变了 ' + pvp.changed + ' 条');
    for (const s of pvp.samples) {
      const d = (s.on || 0) - (s.off || 0);
      console.log('    ' + (s.name || '(无名)') + '：循环 DPS ' + svgish(s.off) + ' → ' + svgish(s.on)
        + (Math.abs(d) > 1e-6 ? '（' + (d > 0 ? '+' : '') + svgish(d) + '）' : '（无变化）'));
    }
    /* 一条都没变时必须能自证「喂进去的属性引擎认不认」，否则「PvP 没做」与「官方参数引擎不认识」分不清 */
    if (pvp.diag) {
      console.log('  诊断：PvP 参数 ' + pvp.diag.params.map((x) => x.raw + '→' + x.key
        + (x.known ? '（引擎认识）' : '（引擎不认识）')).join(' ｜ '));
      console.log('  诊断：该天赋 ' + (pvp.diag.supported ? '引擎有专属公式' : '引擎无专属公式（只走参数通路）')
        + ' · 入参里引擎不认的键 ' + pvp.diag.pve + ' 种'
        + (pvp.diag.sample.length ? '：' + pvp.diag.sample.join(' / ') : ''));
      console.log('  诊断：ignoredAttrs=' + JSON.stringify(pvp.diag.ignored));
    }
    if (!pvp.changed) {
      console.log('❌ PvP 判据不过：官方有 PvP 数值的天赋一条都没改变结果（开关是摆设）');
      process.exit(1);
    }
  }
  /* 机器可读诊断（`attr_key_check.py` 拿它当**权威判据**）：把「引擎不认的入参键」摊开报出来。
     为什么要有：`attr_key_check.py` 原来拿**数据侧**的「双单位会怎样」当判据，那是**可能性**不是**事实** ——
     库里 268 条属性确实可以拼出 `生命值伤害%%`，但只要配装器喂值时 `unit:''`，一条都不会真的发生。
     判据必须量**运行时真的喂了什么**（2026-09-13 改成这条）。 */
  if (process.argv.includes('--diag')) {
    const dg = (pvp && pvp.diag) || null;
    console.log('DIAG_JSON ' + JSON.stringify({
      unrecognizedKeys: dg ? dg.pve : null,
      sample: dg ? dg.sample : [],
      ignoredAttrs: dg ? dg.ignored : null,
    }));
  }
  if (buildProbe) {
    console.log('');
    console.log('── 指定配装试算（--build）── ' + buildProbe.weapon + ' ｜ ' + buildProbe.gear.join(' · '));
    if (buildProbe.miss.length) console.log('  ⚠️ 找不到：' + buildProbe.miss.join(' / '));
    for (const [label, p] of [['空词条（件自带特殊词条全喂）', buildProbe.empty], ['自动词条（优化器口径）', buildProbe.auto]]) {
      console.log('  ' + label + '：近战 combined ' + svgish(p.melee) + ' · 基础 ' + svgish(p.base)
        + ' · 对甲 ' + svgish(p.armor) + ' · 掩体 ' + svgish(p.cover) + ' · 对甲+掩体 ' + svgish(p.armorCover));
      console.log('        池：近战 ' + num2(p.pool) + ' · 武器伤 ' + num2(p.wpn) + ' · 天赋武器伤 ' + num2(p.wdtal)
        + ' · 总武器伤 ' + num2(p.total) + ' · 独立增伤 ×' + num2(p.amp)
        + ' · 对甲 ' + num2(p.dta) + ' · 血伤 ' + num2(p.dth) + ' · 掩体 ' + num2(p.ooc));
      console.log('        近战入参：' + (p.fed.length ? p.fed.join(' ｜ ') : '（无）'));
      console.log('        枪械口径对照：单发 ' + svgish(p.bullet) + ' · 循环 ' + svgish(p.sdps)
        + (p.ignored && p.ignored.length ? ' · ignoredAttrs=' + p.ignored.join('/') : ''));
    }
  }
  const seedBad = seedExp ? seedExp.rows.filter((r) => r.ok && r.same === false).length : 0;
  const blank = Object.values(out.panel).filter((v) => v === '').length;
  const __unranStrict = strictCover
    ? opts.reduce((acc, o) => acc.concat(o.cover && o.cover.dims ? Object.keys(o.cover.dims).filter((k) => o.cover.dims[k] && o.cover.dims[k].ran !== true).map((k) => o.target + "." + k) : []), [])
    : [];
  if (blank || out.hits !== 16 || out.errors.length || seedBad || __unranStrict.length) {
    if (__unranStrict.length) console.log('\u274c --strict-cover\uff1a\u672a\u8dd1\u5230\u7684\u7ecf\u5ea6\uff1a' + __unranStrict.join(' \uff5c '));
    console.log('❌ 试算台判据不过：面板空 ' + blank + ' 项 · 矩阵 ' + out.hits + ' 格 · 报错 ' + out.errors.length
      + (seedBad ? ' · 骨架实验自证不一致 ' + seedBad + ' 条' : ''));
    process.exit(1);
  }
  console.log('✅ 试算台通过');
}

main().catch((e) => { console.log('❌ ' + (e && e.stack || e)); process.exit(1); });
