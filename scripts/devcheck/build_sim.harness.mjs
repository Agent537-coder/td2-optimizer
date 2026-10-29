/* 配装器试算台 · 装置层：把页面真正加载的脚本按序放进一个 vm 上下文 ——
   最小 DOM 桩件 / fetch 桩 / geardb 读数 / `EXPORT` 取数模板 / `boot()`。
   ⚠️ 表单默认值与 `<option>` 都从 dashboard_build.html 里现解析 ⇒ 与真页面同源，不手抄。
   ⚠️ 装置层不含任何「判什么、比什么」的断言 —— 那全在 build_sim.mjs（用例主控）；
     两份同属一件验收活儿（试算台），要一起带走。 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* 大数缩写（只在试算台输出里用；页面上有 fmt0/fmtN） */
export const svgish = (v) => (v == null || !isFinite(v)) ? '—'
  : (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : (Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v * 100) / 100)));
export const num2 = (v) => (v == null || !isFinite(v)) ? '—' : String(Math.round(v * 100) / 100);

/* ── 1. 从页面骨架里现解析表单默认值与下拉选项（不手抄）────────────────────── */
function formShape() {
  const html = read('web/dashboard_build.html');
  const def = {}; const opts = {};
  let open = null;                                     // 当前正在读的 <select id="...">
  for (const ln of html.split(/\r?\n/)) {
    const sm = ln.match(/<select\b[^>]*\bid="([^"]+)"/);
    if (sm) { open = sm[1]; opts[open] = opts[open] || []; }
    if (open) {
      const om = ln.match(/<option\b[^>]*value="([^"]*)"/);
      if (om) opts[open].push(om[1]);
    }
    if (open && /<\/select>/.test(ln)) open = null;
    const im = ln.match(/<(input|select|textarea)\b([^>]*)>/);
    if (!im) continue;
    const attrs = im[2];
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    if (!id) continue;
    const type = (attrs.match(/\btype="([^"]+)"/) || [])[1] || '';
    const val = (attrs.match(/\bvalue="([^"]*)"/) || [])[1];
    def[id] = type === 'checkbox' ? /\bchecked\b/.test(attrs) : (val != null ? val : '');
  }
  // Real skeleton IDs include containers, not just form controls.
  const skeletonIds = [...html.matchAll(/\bid="([\w-]+)"/g)].map(match => match[1]);
  return { def, opts, skeletonIds };
}

/* ── 2. 最小 DOM 桩件：够 build.*.js 与 base.js 用 ─────────────────────────── */
function makeDom(shape) {
  const ids = new Map();
  const docListeners = {};                             // document 上注册的监听（页面靠它做事件委托）
  let onHtml = null;                                   // 由下面用 make() 接上（innerHTML 里出现的新 id）
  class El {
    constructor(tag, id, optVals) {
      this.tagName = String(tag || 'DIV').toUpperCase();
      this.children = []; this.attrs = {}; this.dataset = {}; this.className = ''; this.id = id || '';
      this._text = ''; this._html = ''; this.onclick = null; this.oninput = null;
      this.listeners = {};
      this.checked = false; this.value = ''; this.scrollTop = 0; this.scrollHeight = 0;
      this.style = { setProperty() {}, removeProperty() {} };
      this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      /* `<dialog>` 语义：`#dlgmask` 与两个配装器弹窗都是真 `<dialog>`（要进 top layer，
         抽屉里才能再叠选择器）。桩件不给 `showModal/open/close`，页面一调就
         `m.showModal is not a function`，看着像产品坏了其实是桩件缺件（2026-10-14 踩过）。
         `close()` 要回灌 `close` 监听 —— 页面靠它清 `state.dlg`。 */
      this.open = false;
      this.showModal = () => { this.open = true; };
      this.close = () => { if (!this.open) return; this.open = false; (this.listeners.close || []).forEach((f) => f({ type: 'close' })); };
      if (optVals) this.options = optVals.map((v) => { const o = new El('OPTION'); o.value = v; o.text = v; return o; });
      /* `<template>` 语义：真 DOM 里节点在 `temp.content`（文档片段）上，不在 `temp` 自己身上。
         `buildGearSummaryBlock()` 走 `document.createElement('template')` → `temp.content.querySelectorAll(...)`
         ⇒ 桩件不给 `content` 就是 `Cannot read properties of undefined (reading 'querySelectorAll')`
         （2026-10-16 加 `--seed` 实验时真踩：那条路径会渲染到「装了件的格子」，而此前所有路径只渲染空格子）。
         这里给一个**空片段**：查询恒空 ⇒ 卡片摘要渲成空框；状态与引擎结果不受影响（实验只读 state 与 r）。 */
      if (this.tagName === 'TEMPLATE') {
        this.content = { children: [], querySelector: () => null, querySelectorAll: () => [] };
      }
    }
    get id() { return this._id||''; }
    set id(value) { this._id=String(value||'');if(this._id)ids.set(this._id,this); }
    get textContent() { return this._text; }
    set textContent(v) { this._text = v == null ? '' : String(v); }
    get innerText() { return this._text; }
    set innerText(v) { this.textContent = v; }
    get innerHTML() { return this._html; }
    /* ⚠️ 页面用**字符串**生成子元素（`#r_grid` 的十格、命中矩阵……），桩件不解析 HTML
       ⇒ 那些 `id` 必须先登记成元素，否则 `recalc` 写进去的值全落在「查不到就现建的空壳」上，
       读回来十个空串，看着像「计算没跑」。这里只按 id 登记，不搭 DOM 树。 */
    set innerHTML(v) {
      this._html = v == null ? '' : String(v);
      this.children.length = 0;
      if (onHtml) onHtml(this._html, this.id);
    }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }
    removeAttribute(k) { delete this.attrs[k]; }
    hasAttribute(k) { return this.attrs[k] != null; }
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; }
    append(...cs) { cs.forEach((c) => this.appendChild(c)); }
    contains(c) { return !!c && (c === this || this.children.some(child => child === c || child.contains?.(c)) || ownerOf.get(c.id) === this.id); }
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
    remove() {}
    insertBefore(c) { this.children.unshift(c); c.parentElement=this; return c; }
    after(...nodes) { this.parentElement?.append(...nodes); }
    before(...nodes) { const p=this.parentElement||ids.get(ownerOf.get(this.id));nodes.forEach(n=>p?.insertBefore(n,this)); }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    removeEventListener() {}
    dispatchEvent() { return true; }
    focus() {} blur() {}
    click() { if (this.onclick) this.onclick({ target: this, currentTarget: this }); }
    closest() { return null; }
    matches() { return false; }
    querySelector(sel) {
      const s = String(sel).trim();
      if (s.startsWith('.') && /^\.[\w-]+$/.test(s)) {
        const cls=s.slice(1),match=[...this._html.matchAll(/<(\w+)[^>]*\bclass="([^"]*)"[^>]*>/g)].find(row=>row[2].split(/\s+/).includes(cls));
        if (!match) return null;
        const node=new El(match[1]);node.className=match[2];node.parentElement=this;return node;
      }
      if (!s.startsWith('#')) return null;
      const id = s.slice(1).split(/[\s>[]/)[0];
      const e = ids.get(id);
      if (!e) return null;
      const own = ownerOf.get(id);
      return (own === this.id) ? e : null;               // 只认「确实长在我里面」的子节点
    }
    querySelectorAll() { return []; }
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
    scrollIntoView() {}
  }
  const make = (tag, id) => {
    const e = new El(tag, id, shape.opts[id] || null);
    if (id && Object.prototype.hasOwnProperty.call(shape.def, id)) {
      const d = shape.def[id];
      if (typeof d === 'boolean') e.checked = d; else e.value = d;
    }
    if (id) ids.set(id, e);
    return e;
  };
  /* ⚠️ `getElementById`（页面的 `$()` 走的是它）必须优先查**真表**，否则 `querySelector` 现建的
     桩件写在 `lastById` 里、而 `innerHTML` 写在那份桩件上 —— 两份不是同一个对象，
     `#wstrip` 读回来就是空的（本文件踩过）。只有 `querySelector` 建出来的才记进 `lastById`。 */
  for (const id of shape.skeletonIds) make("DIV", id);
  const lastById = new Map();
  const ownerOf = new Map();                           // 子 id → 它是被谁的 innerHTML 造出来的
  /* html 里出现的 id：登记成桩件，并记下「它长在哪个容器里」——
     页面会先用 `$('#dlg').innerHTML = …<div id="dlglist">…` 造出列表容器，
     随后 `$('#dlglist')` 是**在 `#dlg` 里查**（`$('#dlg').querySelector` 那类写法），
     不记父子关系就查不到（踩过：`renderDlg` 首行 `if(!box)return` 静默早退，弹窗空着）。 */
  onHtml = (html, ownerId) => {
    const re = /\bid="([\w-]+)"/g; let m;
    while ((m = re.exec(html))) {
      if (!ids.has(m[1])) make('DIV', m[1]);
      if (ownerId) ownerOf.set(m[1], ownerId);
    }
  };
  /* 诊断用：把「返回给页面的那份 DB」的形状也带出去 */
  const shapeOf = () => ({ n: Array.isArray(dbRef) ? dbRef.length : -1, keys: dbRef ? Object.keys(dbRef).length : -1 });
  const document = {
    documentElement: new El('HTML'),
    body: new El('BODY'),
    head: new El('HEAD'),
    title: '', readyState: 'loading',
    createElement: (t) => new El(t),
    createTextNode: (t) => { const e = new El('#text'); e.textContent = t; return e; },
    getElementById: (id) => ids.get(id) || null,
    querySelector: (sel) => {
      const s = String(sel).trim();
      if (s === 'main') return ids.get('main') || make('MAIN', 'main');
      if (s.startsWith('#')) {
        const id = s.slice(1).split(/[\s>[]/)[0];
        const real = ids.get(id);
        if (real) return real;                           // 真表优先：`$()` 拿到的一律是同一份桩件
        if (!/^[\w-]+$/.test(id)) return null;            // 带空格/类的选择器是子查询，不建
        const e = make(/^p_|^bp_/.test(id) ? 'INPUT' : 'DIV', id);
        lastById.set(id, e);
        return e;
      }
      return null;
    },
    querySelectorAll: () => [],
    addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); },
    removeEventListener() {},
  };
  const localStorage = {
    _v: {},
    getItem(k) { return this._v[k] == null ? null : this._v[k]; },
    setItem(k, v) { this._v[k] = String(v); },
    removeItem(k) { delete this._v[k]; },
  };
  /* 点一个「委托按钮」= 让 document 上注册的 click 监听按真顺序跑一遍 */
  const fireClick = (el) => {
    const ev = { target: el, currentTarget: document, preventDefault() {}, stopPropagation() {} };
    for (const f of (docListeners.click || [])) f(ev);
  };
  void shapeOf;
  return { document, localStorage, ids, fireClick };
}

/* ── 3b. 点按钮的桩件 ───────────────────────────────────────────────────────
   页面统一用**事件委托**：`document.addEventListener('click', …)` 里
   `el=event.target.closest('[data-act]')` → `act=el.dataset.act` → `i` 取 `el.closest('[data-i]')`
   → `pickw/pickg` 另外读 `el.dataset.row`。桩件里没有 DOM 节点，就用**生成出来的 markup 字符串**
   造按钮、并把 `onclick` 接到页面自己注册的那个委托函数上 —— 这样「点一下」走的就是真路径。 */
export function attrsOf(tag) {
  const a = {};
  const re = /([\w-]+)(?:="([^"]*)")?/g; let m;
  const head = ' ' + tag.replace(/^<\w+/, '').replace(/\/?>$/, '');   // 前置空格，否则第一个属性匹配不上（踩过）
  while ((m = re.exec(head))) a[m[1]] = m[2] == null ? '' : m[2];
  return a;
}
/* 在 markup 里找第一个带 `data-act="<act>"` 的元素（可再按 data-i 过滤；
   `fire` = 上面的委托派发）。⚠️ 必须匹配**任意标签**：武器/装备卡本身是
   `<div class="wcard" data-act="wsl" data-i="0">`，只在 `<button>` 里找会把整张卡漏掉（踩过）。 */
export function btnOf(html, act, i, fire) {
  const re = new RegExp('<(\\w+)[^>]*data-act="' + act + '"[^>]*>', 'g');
  let m;
  while ((m = re.exec(html))) {
    const a = attrsOf(m[0]);
    if (i != null && String(a['data-i']) !== String(i)) continue;
    const el = { tagName: m[1].toUpperCase(), dataset: {}, onclick: null, _tag: m[0] };
    for (const k in a) if (k.startsWith('data-')) el.dataset[k.slice(5).replace(/-(\w)/g, (s, c) => c.toUpperCase())] = a[k];
    el.closest = (sel) => {
      if (sel === '[data-act]') return el;
      if (sel === '[data-i]') return a['data-i'] == null ? null : el;
      return null;
    };
    if (!fire) return el;
    el.focus=()=>{};
    el.click = () => fire(el);                          // 走真正的委托链，不直接调 case 分支
    return el;
  }
  return null;
}
export function matchIn(html, act, attrRe) {
  const re = new RegExp('<(\\w+)[^>]*' + act + '[^>]*>', 'g');
  const m = re.exec(html);
  if (!m) return null;
  const a = attrsOf(m[0]);
  const am = m[0].match(new RegExp(attrRe));
  return { tag: m[0], i: am ? am[1] : null, act: a['data-act'] };
}

/* CLI 取值：`--name=value` → 值；没这个参数返回空串（`--seed` 实验块自用，不动上面 --opt 的既有解析） */
export const argVal = (name) => {
  const a = process.argv.find((x) => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : '';
};

/* ── 3c. 骨架 → 6 件最小装配（`--seed` 实验用）─────────────────────────────────
   骨架 = 一组「族 + 件数」，族键与 `req.brands` 同一套：`set:<code>` / `brand:<code>`
   （官方装备组 code 是单字母：`set:j` = 突袭者战斗装备）。例：`set:j:4,set:a:2`。
   ⚠️ 件数上限与 `optPieceLimits` 同口径（装备组 ≤4 / 品牌 ≤3）；配方违规**直接报错**，不静默修补。
   ⚠️ 摆件顺序取优化器套装种子的 order [1,2,0,3,4,5]（背包 → 胸甲 → 其余）：突袭这类靠
      「包 + 甲」拉满 4 件档，起点照同一顺序摆，免得起点自带一个与优化器口径相反的偏差。
   空槽填**无族中性件**（无 set_code 且无 brand_code 的普通件）⇒ 填充不产生任何套装/品牌档位。 */
export const SLOT_NAME = ['mask', 'backpack', 'chest', 'gloves', 'holster', 'kneepads'];
const SEED_ORDER = ['backpack', 'chest', 'mask', 'gloves', 'holster', 'kneepads'];
export function assembleSeed(page, spec) {
  const entries = [];
  for (const part of String(spec).split(',')) {
    const t = part.trim(); if (!t) continue;
    const m = t.match(/^(set|brand):([^:]+):(\d+)$/);
    if (!m) return { err: '看不懂的骨架段「' + t + '」（写法：set:<code>:<件数> 或 brand:<code>:<件数>）' };
    if (m[1] === 'set' && +m[3] > 4) return { err: '装备组件数 >4（官方没有 5/6 件档）：' + t };
    if (m[1] === 'brand' && +m[3] > 3) return { err: '品牌件数 >3（官方品牌加成只到 3 件）：' + t };
    entries.push({ fam: m[1] + ':' + m[2], n: +m[3] });
  }
  if (!entries.length) return { err: '骨架是空的' };
  const total = entries.reduce((n, e) => n + e.n, 0);
  if (total > 6) return { err: '骨架件数之和 ' + total + ' > 6（只有 6 个防具槽）' };
  const gear = new Array(6).fill(null), taken = {}, filled = [];
  for (const e of entries) {
    let got = 0;
    for (const slot of SEED_ORDER) {
      if (got >= e.n) break;
      if (taken[slot]) continue;
      const cand = page.gearByFamily(e.fam, slot)[0];
      if (!cand) continue;
      gear[SLOT_NAME.indexOf(slot)] = cand; taken[slot] = 1; got++;
      filled.push({ slot: slot, fam: e.fam, item: cand.zh || cand.en || '?' });
    }
    if (got < e.n) return { err: '族 ' + e.fam + ' 只摆得下 ' + got + '/' + e.n + ' 件' };
  }
  for (const slot of SEED_ORDER) {
    if (taken[slot]) continue;
    const cand = page.gearNeutral(slot)[0];
    if (!cand) return { err: '槽 ' + slot + ' 没有无族中性件可填' };
    gear[SLOT_NAME.indexOf(slot)] = cand; taken[slot] = 1;
    filled.push({ slot: slot, fam: '—', item: cand.zh || cand.en || '?' });
  }
  return { gear: gear, entries: entries, filled: filled };
}

/* ── 4. 按页面顺序把脚本放进同一个上下文 ─────────────────────────────────── */
/* ⚠️ **不许手抄脚本清单**：原来是写死的一串路径，而页面 `dashboard_build.html` 里加一层
   （`build.tiers.js`）时这里不会跟着变 ⇒ `renderParams()` 里 `tierInPlay is not defined`
   ⇒ 整场试算台崩（2026-09-13 真踩，`all.py` 第 ⑨b 项「属性键形态」当场判失败）。
   同类断链在本仓已经栽过五次（页面引用的层没入库 / 契约层的 `#id` 与函数清单 / 试算台的脚本清单），
   所以口径统一成一句：**唯一的清单在页面自己身上** —— 这里现读 `<script src>` 的**出现顺序**。
   （`?v=` 戳照剥；`/assets/` 前缀映射到仓库相对路径。） */
function pageScripts() {
  const html = read('web/dashboard_build.html');
  const out = [];
  const re = /<script[^>]+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1].split('?')[0];
    if (u.charAt(0) !== '/') continue;
    out.push('web' + u);
  }
  return out;
}
const FILES = pageScripts();
if (!FILES.length) throw new Error('web/dashboard_build.html 里一个 <script src> 都没读到（判据要跟着改）');

/* 官方敌人系数表：页面在浏览器里是 fetch 拿的，这里直接喂文件；缺了只是目标血量/装甲不显示 */
function enemyCoeffs() {
  try { return JSON.parse(read('web/assets/db/enemy_coeffs.json')); } catch (e) { return null; }
}

/* ⚠️ vm 里顶层 `const/let` **不挂到上下文对象上**（只有 `var` 与函数声明会）：
   `state` / `RCELLS` / `DB` 都是 `const`/`let` ⇒ 从外面 `ctx.state` 永远是 undefined，
   而且 `get DB(){return DB}` 这种取值器**也取不到**（本文件踩过：`page.DB.weapons.length` 恒为 0）。
   能取到的只有从外面看得见的那些：`state`（build.data.js 里是 const，但下面这段脚本在**同一上下文**里求值，
   所以能读到）、以及函数。**数据一律走 UI 路径验证**（点按钮 → 弹窗 → 选中），不直接读 DB。 */
export const EXPORT = `(function(){ return { state:state, RCELLS:RCELLS,
  load:load, renderAll:renderAll, recalc:recalc, $:$, arr:arr, gearOf:gearOf,
  evalBuild:evalBuild, picksFor:picksFor,
  /* 优化器要的取数口（都在页面上下文里取，避免 vm 的 let/const 取不到那类坑） */
  weaponAt:function(i){return arr(DB.weapons)[i];},
  allWeapons:function(){return arr(DB.weapons).filter(function(w){return w&&w.dmg;});},
  gearAtSlot:function(slot){var seen={},out=[];
    GEAR.forEach(function(x){if(!x||x.slot_idx!==slot||seen[x.raw])return;seen[x.raw]=1;
      var it=GEAR_ITEMS[x.raw];if(it){it.raw=x.raw;out.push(it);}});
    return out;},
  gearCount:function(){return GEAR.length;},
  allWeaponCount:function(){return arr(DB.weapons).filter(function(w){return w&&w.dmg;}).length;},
  /* 优化器与目标表：直接调页面里的实现（同一份代码，试算台不另写一套） */
  /* PvP 判据要的取数口：TALENTS 是 build.app.js 里的 const ⇒ 外部取不到，只能这样开口 */
  talentAt:function(i){return arr(TALENTS)[i];},
  pvpTalents:function(){var out=[];arr(TALENTS).forEach(function(t,i){if(t&&talentPvpDiff(t))out.push(i);});return out;},
  pvpBonusOf:function(t){return talentBonusOf(t,true);},
  picksOf:picksFor, attrKeysOf:function(){return TD2Calc.attrNames();},
  attrKeyOf:attrKey, attrKnownOf:attrKnown, talentSupportedOf:talentSupported,
  optimize:function(o){return optimizeBuild(o);},
  optTargets:function(){return OPT_TARGETS.map(function(t){return [t[0],t[1]];});},
  optFlows:function(){return (typeof OPT_FLOWS!=='undefined'?OPT_FLOWS:[]).map(function(f){return [f[0],f[1],f[3]&&f[3].target,f[3]&&f[3].note];});},
  tval:function(r,id){return optTargetValue(r,id);},
  /* 配装状态快照 / 还原 / 直接摆一套（优化器自证要「把 state 摆成那套再独立重算」）。
     ⚠️ 深拷贝不用 structuredClone（页面里不一定有）、也不用 JSON 往返（DB 引用会被拆开）；
     只拷**纯数据**的那几项，slots/talents 里存的都是下标或 null。
     ⚠️ 这段注释身处 EXPORT 模板串里 ⇒ **不许出现反引号**（会提前闭合它）。 */
  snapshot:function(){return {wslots:state.wslots.slice(),wactive:state.wactive,slots:state.slots.slice(),
    core:state.core.map(function(x){return x==null?x:x;}),affix:state.affix.map(function(a){return (a||[]).slice();}),
    talents:state.talents.slice(),gtal:state.gtal.slice(),gmods:state.gmods.slice(),
    wmods:state.wmods.map(function(b){var o={};for(var k in (b||{}))o[k]=b[k];return o;}),
    waffix:state.waffix.slice(),bonuses:state.bonuses.slice(),tweaks:state.tweaks.slice()};},
  restore:function(s){state.wslots=s.wslots.slice();state.wactive=s.wactive;state.slots=s.slots.slice();
    state.core=s.core.map(function(x){return x==null?x:x;});state.affix=s.affix.map(function(a){return (a||[]).slice();});
    state.talents=s.talents.slice();state.gtal=s.gtal.slice();state.gmods=s.gmods.slice();
    state.wmods=s.wmods.map(function(b){var o={};for(var k in (b||{}))o[k]=b[k];return o;});
    state.waffix=s.waffix.slice();state.bonuses=s.bonuses.slice();state.tweaks=s.tweaks.slice();
    renderAll();},
  setBuild:function(w,gear,o){o=o||{};var ws=(o.wslots||state.wslots).slice();
    ws[o.wslot!=null?o.wslot:state.wactive]=arr(DB.weapons).indexOf(w);
    state.wslots=ws;state.wactive=(o.wslot!=null?o.wslot:state.wactive);
    state.slots=(gear||[]).map(function(it){return it&&it.raw!=null?it.raw:null;});
    for(var i=0;i<6;i++){state.core[i]=null;state.affix[i]=[];}},
  cval:function(r,k){return optCValue(r,k);},
  gearNames:function(g){return g.map(function(it){return it?(it.zh||it.en||'?'):'—';});},
  weaponName:function(w){return w?(w.zh||w.en||'?'):'—';},
  /* --build 试算用的取数口（2026-10-16）：按官方名找件/枪；
     ⚠️ 从 DB.gear 取件时**必须把 raw 下标挂上**（setBuild 读 it.raw，缺了会被塞 null）。 */
  gearByName:function(nm){var g=arr(DB.gear);for(var i=0;i<g.length;i++){var it=g[i];
    if(it&&(it.zh===nm||it.en===nm||it.name===nm)){if(it.raw==null)it.raw=i;return it;}}return null;},
  weaponByName:function(nm){var g=arr(DB.weapons);for(var i=0;i<g.length;i++){var w=g[i];
    if(w&&(w.zh===nm||w.en===nm||w.name===nm))return w;}return null;},
  /* --seed 实验的取数口：按「族键 + 槽位」取件（族键与 req.brands 同一套：set:<code> / brand:<code>），
     以及「无族中性件」（奇特 / 无 set_code 且无 brand_code ⇒ 不产生任何套装/品牌档位）。
     ⚠️ 一律把 DB.gear 下标**覆盖写**到件上（setBuild 读 it.raw；不挂会被塞成 null）。
     ⚠️ 本段注释身处 EXPORT 模板串里 ⇒ 不许出现反引号。 */
  gearByFamily:function(fam,slot){var g=arr(DB.gear),out=[];
    for(var i=0;i<g.length;i++){var it=g[i];if(!it||it.slot!==slot)continue;
      var key=it.set_code?('set:'+it.set_code):(it.brand_code?('brand:'+it.brand_code):null);
      if(key!==fam)continue;it.raw=i;out.push(it);}
    return out;},
  gearNeutral:function(slot){var g=arr(DB.gear),out=[];
    for(var i=0;i<g.length;i++){var it=g[i];if(!it||it.slot!==slot)continue;
      if(it.kind==='exotic'||it.set_code||it.brand_code)continue;it.raw=i;out.push(it);}
    return out;},
  familiesOf:function(g){return arr(g).map(function(it){return it?(it.set_code?('set:'+it.set_code):(it.brand_code?('brand:'+it.brand_code):'—')):'—';});},
  /* 该件每个随机槽的第一条候选（与 autoFillGear 同判据）—— 用来复刻「优化器口径」的词条填充 */
  /* 优化器口径的核心：优先武器伤害（与 build.opt.js 的 words() 同判据） */
  coreWantedOf:function(it){var c=coreChoices(it);if(!c||!c.length)return null;return c.indexOf("WeaponDamageModBonus")>=0?"WeaponDamageModBonus":c[0];},
  affixPlan:function(it){var out=[],n=nRandomSlots(it);for(var k=0;k<n;k++){var c=randomSlotCodes(it,k)[0];out.push(c||'');}return out;},
  DBINFO:(function(){ try{ return { t:typeof DB, isArr:Array.isArray(DB.weapons),
    n:DB.weapons?DB.weapons.length:-1, keys:Object.keys(DB).length,
    n0:DB.weapons&&DB.weapons[0]?(DB.weapons[0].zh||DB.weapons[0].en||'?'):'∅' }; }
    catch(e){ return { err:String(e) }; } })(), WEAPONS_LEN:(function(){try{return arr(DB.weapons).length;}catch(e){return -1;}})(),
  setW:function(i,v){state.wslots[i]=v;}, setActive:function(i){state.wactive=i;},
  setSlot:function(i,v){state.slots[i]=v;}, setGmod:function(i,v){state.gmods[i]=v;} }; })()`;

export function boot() {
  const shape = formShape();
  const dom = makeDom(shape);
  const db = JSON.parse(read('web/assets/db/geardb.json'));
  const lean = JSON.parse(read('web/assets/db/geardb.lean.json'));
  const coeffs = enemyCoeffs();
  const errors = [];
  const calls = [];
  const ctx = {
    URL, URLSearchParams,
    console: { log() {}, warn() {}, error: (...a) => errors.push(a.map(String).join(' ')) },
    document: dom.document, localStorage: dom.localStorage,
    location: { pathname: '/build', href: 'http://127.0.0.1:8080/build', search: '' },
    navigator: { language: 'zh-CN', userAgent: 'node-sim' },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    /* `optimizeBuild()` 用 `performance.now()` 计时 ⇒ 不给它就 `ReferenceError: performance is not defined`
       （2026-10-16 跑 `--opt` 时踩到；node 侧真实现来自 node:perf_hooks，行为与浏览器一致）。 */
    performance,
    /* ⚠️ 要桩的是 **`fetch`**，不是 `fetchJSON`：后者是 base.js 自己定义的（我的同名声明的会被它遮蔽），
       真实现走 `fetch` + `res.json()`。桩 `fetchJSON` 等于没桩，而 `fetch is not defined`
       会被 `load()` 的兜底 catch 吞掉 ⇒ 页面照渲染、DB 却还是那份空壳（本文件踩过：DBINFO n=0）。 */
    fetch: async (url) => {
      const u = String(url);
      calls.push(u);
      let body = null;
      if (u.includes('geardb.lean.json')) body = lean;
      else if (u.includes('geardb.json')) body = db;
      else if (u.includes('enemy_coeffs')) body = coeffs;
      if (!body) throw new Error('sim: 未桩的请求 ' + u);
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    },
    postJSON: async () => { throw new Error('sim: 不该发 POST'); },
    addEventListener() {}, removeEventListener() {},scrollTo() {},
    requestAnimationFrame: (f) => setTimeout(f, 0),
    Image: class { constructor() { this.onload = null; this.onerror = null; } set src(v) { this._v = v; } },
  };
  // Standard loading-state DOM APIs, not alternate page/business logic.
  ctx.matchMedia = query => ({ media: query, matches: false, addEventListener() {}, removeEventListener() {} });
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.parent = ctx;
  const context = createContext(ctx);
  for (const f of FILES) {
    try { runInContext(read(f), context, { filename: f }); }
    catch (e) { throw new Error('脚本加载失败 ' + f + ' :: ' + (e && e.stack || e)); }
  }
  return { ctx, context, dom, db, errors, calls };
}
