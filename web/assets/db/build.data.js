/* 配装器页 · 数据层：官方 gear[]/talents_official[] 归一化、品牌与装备组件数、词条/插件收集（引擎契约） */
const NUM=(v,d)=>{const n=typeof v==='number'?v:parseFloat(v);return isFinite(n)?n:(d==null?0:d);};
const arr=x=>Array.isArray(x)?x:[];
/* 数据源：geardb.json（游戏文件 hunter / rogue 解包 Y8S3.1）。旧版可能缺键 → 一律 || / Array.isArray 兜底，
   绝不出现 TypeError: Cannot read properties of undefined。
   $ / esc / LANG / 主题语言 / fetchJSON 见 /assets/base.js（base.js 已首屏还原 data-theme + LANG）。 */
let DB={weapons:[],gear:[],talents_official:[],brands:[],gear_mods:[],gearsets_official:[],mods:[],weapon_slots:[],weapon_mod_matrix:{},weapon_mod_compat:{}}, GMODS=[];
const L=(zh,en)=>LANG==='zh'?zh:(en==null?zh:en);
/* 英文查找表（load 后从 geardb 数据汇总）：TYPE_EN=武器类型中→英；AFFIX_EN=词条名中→英（加成/属性没有自带 en 时用） */
let TYPE_EN={},AFFIX_EN={};

/* ── 装备 6 部位 ────────────────────────────────────────────────────────────
   顺序依据 = **官方 gear[].slot 字段**（game 文件），0..5 一一对应：
     0 mask 面具 / 1 backpack 背包 / 2 chest 胸甲 / 3 gloves 手套 / 4 holster 枪套 / 5 kneepads 护膝
   游戏里没有"护肩"；每个部位在 ui/ 下都有原生剪影图（含枪套 gs_holster），无 gear_icon 的装备回退剪影。 */
const G_SLOTID=['mask','backpack','chest','gloves','holster','kneepads'];
const G_SLOTS=[['面具','Mask'],['背包','Backpack'],['胸甲','Chest'],['手套','Gloves'],['枪套','Holster'],['护膝','Kneepads']];
const SLOT_ICON=['ui/gs_mask.png','ui/gs_backpack.png','ui/gs_chest.png','ui/gs_gloves.png','ui/gs_holster.png','ui/gs_knees.png'];
/* 装备插件位 = **部位**决定（面具 / 背包 / 胸甲，各 1 个）+ 临时件本体声明的例外 —— 判据在 `hasModSlot()`。
   ⚠️ 2026-09-14 回退一次错误的改法：曾改成「只看 `gear[].sockets` 的标签」，结果把枪套 106 / 护膝 95
   判成有插件位（官方模板给它们写的是 `Mod` 标签的占位 socket），而 36 件面具反倒没有 —— 双证见 `hasModSlot()`。 */
/* 武器 3 槽（第 3 槽游戏固定为手枪） */
const W_SLOTS=[['主武器','Primary'],['副武器','Secondary'],['手枪','Sidearm']];
/* 武器类别 = **官方简中类名**（官方 gear/weapon 数据的 type 字段）。
   顺序与 engine.js TYPE_IDX 的 0..6 对应：AR/SMG/Shotgun/Rifle/MMR/LMG/Pistol */
const WTYPES=['突击步枪','冲锋枪','霰弹枪','步枪','射手步枪','轻机枪','手枪'];
const WTYPES_EN={'突击步枪':'AR','冲锋枪':'SMG','霰弹枪':'Shotgun','步枪':'Rifle','射手步枪':'MMR','轻机枪':'LMG','手枪':'Pistol'};
/* 装备类别（官方 kind_zh）筛选与稀有度标签 */
const G_KINDS=['brand','gearset','named','exotic','highend'];
const G_KIND_ZH={brand:'品牌装备',gearset:'装备组',named:'具名',exotic:'奇特',highend:'普通'};
const G_KIND_EN={brand:'Brand',gearset:'Gear Set',named:'Named',exotic:'Exotic',highend:'High-end'};
/* 武器类别筛选（与装备的 `G_KINDS` 同款 —— 参考工具的类别是 `Rarity`：
   `HighendGear`=0 金装 / `GearsetGear`=1 装备组 / `NamedGear`=2 具名 / `ExoticGear`=3 奇特）。
   ⚠️ 官方 `weapons[]` **没有** `rarity` 字段，但给了两个布尔 `exotic`（70 件）与 `named`（140 件）
   ⇒ 等价判定放 `wKindOf()`，**不臆造**第六种分类（枪型另有一排 chip，两个维度互不替代）。 */
const W_KINDS=['highend','named','exotic'];
const W_KIND_ZH={highend:['金装','High-end'],named:['具名','Named'],exotic:['奇特','Exotic']};
function wKindOf(w){
  if(!w)return 'highend';
  if(w.exotic)return 'exotic';
  if(w.named)return 'named';
  return 'highend';
}
/* 天赋分类（官方 talents_official[].kind_zh）展示顺序；未列出的分类排在末尾 */
const T_KIND_ORDER=['武器天赋','背包天赋','胸甲天赋','手套天赋','枪套天赋','护膝天赋','面具天赋','装备组','奇特','专精加成','专精','基地升级','手表','生存/暗区','基础','其它'];
const SKILL_EN={蜂群:'Hive',无人机:'Drone',炮塔:'Turret',智能掩体:'Smart Cover',弹道护盾:'Ballistic Shield',脉冲:'Pulse',萤火:'Firefly',寻敌地雷:'Seeker Mine',电击陷阱:'Shock Trap',粘性炸弹:'Sticky Bomb',化学发射器:'Chem Launcher',诱饵:'Decoy'};
/* 技能 12 库（官方简中；`id` 与 `DB.skills[].key` 归一化后一一对应 ⇒ 图标一律取官方那张，
   `skillIconOf()` 在 DB 载入后按 id 查）。 */
const SKILLS=[
  {id:'hive',zh:'蜂群',icon:'skillhive'},{id:'drone',zh:'无人机',icon:'skilldrone'},
  {id:'turret',zh:'炮塔',icon:'skillturret'},{id:'smartcover',zh:'智能掩体',icon:'skillsmartcover'},
  {id:'shield',zh:'弹道护盾',icon:'skillshield'},{id:'pulse',zh:'脉冲',icon:'skillpulse'},
  {id:'firefly',zh:'萤火',icon:'skillfirefly'},{id:'seekermine',zh:'寻敌地雷',icon:'skillseekermine'},
  {id:'trap',zh:'电击陷阱',icon:'skilltrap'},{id:'stickybomb',zh:'粘性炸弹',icon:'skillstickybomb'},
  {id:'chemlauncher',zh:'化学发射器',icon:'skillchemlauncher'},{id:'decoy',zh:'诱饵',icon:'skilldecoy'},
];
/* 键归一化：只留字母数字小写（官方键 `Smart_Cover` ↔ 本地 id `smartcover`） */
const SKNORM=k=>String(k==null?'':k).toLowerCase().replace(/[^a-z0-9]/g,'');
const SKICON={};                                  // 归一化键 → 官方图标路径（`skill/skills_menu_*.png`）
function skillIconMap(){
  const arr=(DB&&Array.isArray(DB.skills))?DB.skills:[];
  for(const c of arr){const k=SKNORM(c&&c.key);if(k&&c.icon&&!SKICON[k])SKICON[k]=c.icon;}
  return SKICON;
}
function skillIconOf(s){return SKICON[SKNORM(s&&s.id)]||SKICON[SKNORM(s&&s.zh)]||'';}

/* 战斗参数：与 BuildTool「更多参数」面板一一对位（口径见 docs/DESIGN-GEARDB.md §11）。
   state 里只存**选择**，不存自造的派生值：手表/专长/专精/精通/额外参数全部由 engine.js 的
   buildCompute(params.bp) 现算，面板只负责把选择原样递进去。 */
const BP_DEFAULT_EXTRAS={chc:0,chd:0,hsd:0,damage:0,totalDamage:0,amplify:0,reloadSpeed:0,rateOfFire:0,outCoverDamage:0,armorDamage:0,healthDamage:0,magazineSize:0};
/* Item attribute maxima use the current prototype rule, including named special
   attributes. Eligibility is decided by the caller; mods/talents never pass here.
   The old flattened qmod table mixed several curves for WeaponDamageModBonus. */
function prototypeAttrValue(code,val,qmod,eligible){
  if(state.bp&&state.bp.prototype&&code==='SkillPowerFlatBonus')return 1.5;
  return +val*(eligible?protoRatio(code,qmod):1);
}
function protoRatio(code,qmod){return 1.5;}
function bpDefaults(){
  return {
    effects:{}, combatPreset:'base', spec:'',                                             // 专精：'' = 无；其余见 BP_SPEC（键为数据名，不是位置）
    watch:true,                                          // 手表「一千级」满值（默认开，与 BuildTool 一致）
    weaponExpertise:30, gearExpertise:0,                 // 精通 0..30（BuildTool 默认 30 / 0）
    technicianBranch:'damage', skillExpertise:[0,0], overcharge:false,
    spMode:'all-default-v1', sp:{ar:true,smg:true,shotgun:true,rifle:true,mmr:true,lmg:true,pistol:true},  // 专长 15%（七类武器）
    extras:Object.assign({},BP_DEFAULT_EXTRAS),           // 额外参数 12 项（手动输入补偿）
    // Prototype caps apply to item attributes; augmentation levels are separate.
    prototype:false,
    /* PvP 模式：开启后**天赋**取官方 PvP 专属数值（`talents_official[].bonus_pvp`），
       描述按该套数值回填（官方 PvE / PvP 共用同一份 `{0}…{n}` 占位文本，
       见 scripts/rebuild/stage25_pvp.py 头部）。**没有 PvP 覆盖的天赋不受影响**（不改价、不猜）。
       ⚠️ 公式层（engine.js）一行未动：PvP 数值走的是与词条同一条入参通路，官方名对不上引擎字段的照旧如实留空。 */
    pvp:false,
    /* 场景假设（`OPT_SCENE_PROFILES`）：条件型天赋的到达率从这里取，不另外拍值。
       随存档/分享包一起持久化；非法值在载入时回落到 `pve_solo`。 */
    scene:'pve_solo',
    /* 条件型天赋档位：`{key: 'off'|'half'|'full'}`，缺省 `half`。 */
    condTier:{},
    /* 操作型天赋的玩家水平档（novice / normal / expert）。默认中档，不按高手算。 */
    player_skill_tier:'normal',
    /* 输出环境：mobile（走位多）/ stationary（站桩）。叠层型天赋的假设按这档取。 */
    stance:'mobile',
    /* 装备天赋档位（`build.tiers.js` 的 `TIER_FAMILIES`）：`{(族 id): 档位 id}`。
       只对**已在装**的那件出现选项；未选到的族一律按 `'off'` 处理（＝不计入）。 */
    tiers:{},
    /* 随机词条天赋（背包 / 面具 / 背心那一类在游戏里**随机滚**的天赋）：件表里只有官方**固定**指针，
       这类天赋没有宿主件 ⇒ 只能手选。值 = 官方 `talents_official[].key`（现取，不写死中文名）。 */
    /* ⚠️ 2026-09-14 删 `gtal:''`：那是「装备天赋手选下拉」的单值状态，下拉本身已删
       （与 `state.gtal[6]` 的卡片选择器是同一个概念的第二套入口，硬规则②）。 */
    /* 装甲目标设置：轴名与 enemy_coeffs.json 的轴一一对应（progression 兵种基础值档 / difficulty /
       players 人数 / escalation 恶化档）；取不到表时整块不出结果，页面不显示假数字 */
    enemy:{progression:1,difficulty:0,players:1,escalation:0},
  };
}
const state={
  wslots:[null,null,null], wactive:-1,          // 武器 3 槽：存 DB.weapons 下标
  slots:[null,null,null,null,null,null],        // 装备 6 格：存 DB.gear 原始下标（经 GEAR_MAP 解引用）
  ovr:[false,false,false,false,false,false],    // 临时套装 Override（仅枪套/手套/护膝有意义）
  gmods:[null,null,null,null,null,null],        // 每格 1 个插件：GMODS 下标（= geardb.gear_mods[] 装备改造模块）
  /* 武器配件：**三把枪各自一套**（与 `talents` 同口径），`wmods[武器槽位][插槽 code]` = DB.mods 下标。
     官方逐把给插槽（`weapons[].slots[]`，1–4 个不等）与预装件（`fixed_mods[]`，58/434 把）⇒
     候选与取值一律走 `build.mods.js` 现算，这里只存「用户选了哪件」。 */
  wmods:[null,null,null],
  /* 武器随机第三词条：每把武器槽独立保存官方属性 code。 */
  waffix:[null,null,null],
  skill:[-1,-1], skillVariant:[null,null],       // Q/E：技能类目下标 + 官方分支 code
  /* 武器天赋：**每个武器槽各自一个**（跟游戏一致：每把枪自带天赋），只对「计算中」那把生效。
     原来是单个 `state.talent`，等于三把枪共用一个天赋 —— 换枪时天赋会跟着串到另一把上。 */
  talents:[-1,-1,-1], tq:'', tkind:'', bonuses:[], bq:'', tweaks:[],
  /* 面板上直接选的词条（用户第 110 轮「需要直接在装备面板选择阿」）：
     `state.core[格位]` = 核心槽三选一的 code（该件 core 槽只有一个候选时为 null ⇒ 走固定值）；
     `state.affix[格位]` = 副属性按**槽序**排的 code 数组（长度 = 该件 `fixed:false` 的随机槽数）；
     `state.axopen` = 当前展开候选的格位下标（-1 = 都收起），避免 6 格 × 12 个候选 chip 把左列拉成长条。 */
  core:[null,null,null,null,null,null],
  affix:[[],[],[],[],[],[]],
  /* 件天赋（背包 / 胸甲 的「天赋槽」）：`state.gtal[格位]` = `talents_official[].key` 串或 `null`。
     与 `core`（存 code 串）/ `affix`（存 code 串数组）同构的 6 格数组 —— **别塞进 `state.talents`**：
     那是 `TALENTS` 下标体系 + 「只有 3 个武器槽」的语义，混用会把装备天赋串到武器槽上。
     池的判据与数值全在 `build.gtal.js`（对照复刻 BuildTool 的 `AppData.TalentData[Num-2]`）。 */
  gtal:[null,null,null,null,null,null],
  axopen:-1,
  bp:bpDefaults(),                              // 战斗参数（专精/手表/精通/专长/额外参数/目标设置）
  cq:'',                                        // 战斗参数面板的专精搜索词
  /* 一键配装（用户第 111 轮）：目标 / 武器类别 / 条件条 / 单件锁定。奇特唯一是强制项，不在这里。
     `undo` = 应用前的那份快照、`changed` = `applyOpt()` 记的被换格位数（两者一起决定「撤销」按不按得动）。 */
  opt:{target:'sdps', wtype:0, cons:[], lock:[false,false,false,false,false,false], lockW:false, res:null,
       undo:null, changed:0, applied:false},
  /* 一键配装改成「先算给用户看，点头才落地」⇒ `res` 是**预览**，`applied` 才表示已经动过配装台。 */
  dlg:null,                                     // {kind:'w'|'g'|'m'|'s'|'t', slot, q, wtype, gkind}
  armReset:false,                               // 「清空」两步确认：第一下只点亮按钮
  dlgBack:null,                                 // 弹窗关掉后要把焦点送回哪一格 {kind,slot}
};

/* ── 官方数据归一化 ──
   ⚠️ state.slots 一律存 **DB.gear 的原始下标**（不是某个中间表的位置）：
   数据层随时可能在另一条线上重排/增删 DB.gear，位置下标会静默错位（已踩过），
   原始下标则只会失效、不会指向另一件装备 —— 失效时按「空」处理。 */
const GEAR_MAP={};             // DB.gear 原始下标 → 归一化条目（仅六部位 + 已知 kind）
const GEAR=[];                 // 归一化条目列表（按官方 slot 顺序，供选择器遍历）
const GEAR_ITEMS=[];           // DB.gear 原始下标 → 那一件原始条目（与 GEAR_MAP 同一套键；**不是**压缩数组）
let GSETS={};                  // set_code → 官方装备组（gearsets_official[]）
let TALENT_BY_KEY={};          // 官方天赋 key → 条目
let TALENT_KINDS=[];           // 官方天赋分类（按 T_KIND_ORDER 排序 + 计数）
let MISCONF={};                // 键 → 官方中文名（geardb.json 里没有独立键时用；另一条线会补）

/* 官方装备组几件套：set_code → {zh,en,tiers:[{pieces,effects,pvp,talents}]}（`tiers` 是唯一档位字段）。
   priorityTier=true（默认，按品质）时给「4 件套天赋优先」，与 gear[].set_bonus 合并。
   ⚠️ 2026-09-14 修死路径：原来读 `s.bonus` —— `gearsets_official[]` **根本没有 `bonus` 键（实测 0/28）**
   ⇒ 这个函数对 28 个装备组**全部返回 []**（`arr()` 兜底成空数组），`priorityTier` 参数永远走不到。
   资料库页一直是按 `tiers` 读的（`db.cards.js` / `db.core.js`），两页口径不一致才是真隐患 —— 现在对齐。 */
function setBonusOf(code){return arr(GSETS[code]?.tiers).map(t=>Object.assign({},t,{pieces:NUM(t.pieces,0),effects:arr(t.effects),talents:arr(t.talents)}));}
function gearSetBonus(it){const canonical=setBonusOf(it&&it.set_code);return canonical.length?canonical:arr(it&&it.set_bonus);}
function brandOf(it){
  const code=it&&it.brand_code;if(!code)return null;
  for(const b of arr(DB.brands))if(b&&b.code===code)return b;
  return null;
}
/* 品牌几件套加成（官方 brands[].bonus：1/2/3 件）；旧版库没有该键 → 空数组 */
function brandBonusOf(it){const b=brandOf(it);return arr(b&&(b.tiers_official||b.bonus)).map(t=>Object.assign({},t,{pieces:NUM(t.pieces,0),effects:arr(t.effects),talents:arr(t.talents)})).filter(t=>t.effects.length||t.talents.length).sort((a,b)=>a.pieces-b.pieces);}

/* 装备件身上的官方天赋名。两条挂载路径：
   ① **件指针** `gear[].talent`（对象 `{key,zh,en,perfect,kind}`，84 件；归一化后同样保留对象）；
   ② **装备组 4 件套天赋** —— 键在 `gearsets_official[].tiers[].talents`。
   ⚠️ 2026-09-14 修：原来只认**字符串** `it.talent` ⇒ 84 件对象指针全被跳过、这个函数**恒返回空串**
   （页面上连天赋名都显示不出来）；且装备组分支读的是 `GSETS[code].bonus` —— `gearsets_official[]`
   **没有 `bonus` 键（0/28）**，那是死路径（双死）。两处一并按上面两条修。取不到就是空串，**不猜名字**。 */
function gearTalent(it){
  if(!it)return '';
  const o=(it.talent&&typeof it.talent==='object')?it.talent:null;
  const key=o?(o.key||''):((typeof it.talent==='string')?it.talent.trim():'');
  if(key){
    const t=TALENT_BY_KEY[key];
    const nm=(o&&(o.zh||o.en))||(t&&(t.zh||t.en))||key;
    if(nm)return nm;
  }
  if(it.kind==='gearset'&&it.set_code&&GSETS[it.set_code]){
    const tl=arr(GSETS[it.set_code].tiers).map(x=>arr(x&&x.talents)[0]).filter(Boolean)[0];
    if(tl){
      const t=tl.key?TALENT_BY_KEY[tl.key]:null;
      return tl.zh||tl.en||(t&&(t.zh||t.en))||'';
    }
  }
  return '';
}
/* 件上的天赋**内部 key**（与 `gearTalent()` 的展示名口径分开：这里要的是 `talents_official[].key`）。
   装备组取 4 件套天赋的 key（**读 `tiers`，不是 `bonus`** —— `gearsets_official[]` 无 `bonus` 键，0/28）；
   普通件取 `it.talent.key`（阶段 12 给具名/奇特装备挂的指针，归一化后仍是对象）。取不到就是空串，**不猜名字**。 */
function gearTalentKey(it){
  if(!it)return '';
  const t=it.talent;
  if(t&&typeof t==='object'&&t.key)return String(t.key);
  if(typeof t==='string'&&t.trim())return t.trim();
  if(it.kind==='gearset'&&it.set_code&&GSETS[it.set_code]){
    const o=arr(GSETS[it.set_code].tiers).map(x=>arr(x&&x.talents)[0]).filter(Boolean)[0];
    if(o&&o.key)return String(o.key);
  }
  return '';
}
/* 当前配装里是否有件带这条天赋 key（6 个装备格 + 生效武器）。档位天赋据此决定「出不出选项」。 */
function gearHasTalent(key){
  if(!key)return false;
  const gs=arr(state.slots),ws=arr(state.wslots);
  if(state.wactive>=0&&ws[state.wactive]!=null){
    const w=arr(DB.weapons)[ws[state.wactive]];
    const tk=w&&w.talent&&(w.talent.key||w.talent);
    if(tk&&String(tk).toLowerCase()===key.toLowerCase())return true;
  }
  for(const i of gs){
    if(i==null)continue;
    if(gtalPtr(arr(DB.gear)[i]).toLowerCase()===key.toLowerCase())return true;
  }
  const counts=countsGear();
  for(const set of arr(DB.gearsets_official))for(const tier of arr(set.tiers)){
    if((counts['set:'+set.code]||0)>=tier.pieces&&arr(tier.talents).some(t=>t.key?.toLowerCase()===key.toLowerCase()))return true;
  }
  return false;
}
const fmt0=x=>(x==null||!isFinite(x))?'—':Math.round(x).toLocaleString('en-US');
const fmt2=x=>(x==null||!isFinite(x))?'—':(+x).toFixed(2);
const fmtN=x=>(x==null||!isFinite(x))?'—':(Math.abs(x)>=100?Math.round(x).toLocaleString('en-US'):(Math.round(x*100)/100).toString());
/* 双语主/副名：cn=zh||name、en=en||name；主名随 LANG 互换，副名缺失或与主名相同→不显示（不重复） */
function nmTxt(o){const cn=(o&&o.zh)||o.name||'',en=(o&&o.en)||o.name||'';return LANG==='zh'?cn:en;}
function nmAlt(o){const cn=(o&&o.zh)||o.name||'',en=(o&&o.en)||o.name||'';const m=LANG==='zh'?cn:en,a=LANG==='zh'?en:cn;return `<span>${esc(m)}</span>${a&&a!==m?`<span class="walt">${esc(a)}</span>`:''}`}
/* 图标 URL 的版本戳（与资料库页同一个口径）：重建脚本**原地覆盖** `web/assets/db/img/` 下的文件，
   文件名不变内容变 ⇒ 浏览器会端旧图。服务器已一律 `no-store`，这里再挂戳让**已缓存的旧份**当场失效。 */
const IMGV='?v=349';
/* 图标路径可能带目录（`skill/skills_menu_hive.png` / `gearmod/g_mod_*.png` / `modfilter/offense.png`）——
   逐段编码，别把 `/` 编成 `%2F`（那样服务器找不到文件）。戳一律由调用处拼 `IMGV`。 */
function imgPath(ic){return String(ic).split('/').map(encodeURIComponent).join('/');}
function imgUrl(ic){return dbIcon('/assets/db/img/'+imgPath(ic)+IMGV);}
/* ---------- 图标反色（与资料库 `db.core.js` 同一套四段式，名单在 `_meta.mono_icons`）----------
   配装器页不载 db.core.js，所以这里自带一份查表：构建期像素检测的名单（均值亮度≥200 且饱和度<0.15）
   决定哪些是「白线条图」⇒ 浅色主题下加 .mono 反色。不用文件名正则（新图标进来必然漏）。 */
let MONO_B=null;
function monoSetB(){
  if(MONO_B)return MONO_B;
  MONO_B=new Set(Object.keys(((DB&&DB._meta)||{}).mono_icons||{}));
  return MONO_B;
}
function monoKeyB(ic){
  const s=String(ic||'').replace(/\\/g,'/').split('?')[0].replace(/^\/+/, '').replace(/\.webp$/,'.png');
  const i=s.indexOf('assets/db/img/');
  return i>=0?s.slice(i+13):s;
}
function monoIcB(ic){
  const s=monoSetB();
  if(!s.size||!ic)return '';
  const k=monoKeyB(ic);
  return (s.has(k)||s.has(k.split('/').pop()))?' mono':'';
}
function iconImg(ic,cls){cls=cls||'ic';return ic?`<img loading="lazy" decoding="async" class="${cls}${monoIcB(ic)}" src="${imgUrl(ic)}" onerror="this.classList.add('ph');this.removeAttribute('src')">`:`<span class="${cls} ph"></span>`}
function silIcon(i,colorVar){const ic=SLOT_ICON[i==null?0:i];const u=dbIcon(ic?('/assets/db/img/'+ic.split('/').map(encodeURIComponent).join('/')+IMGV):`/assets/db/img/gear${i}.png${IMGV}`);return `<span class="sil" style="background:var(${colorVar});-webkit-mask-image:url('${u}');mask-image:url('${u}')"></span>`}
/* 稀有度映射（官方 gear[].kind）：品牌/具名/普通→金、装备组→绿、奇特→红。
   带占位符（普通/品牌装备没有固定数值）时返回 dim=true，页面标「占位」。 */
function rarOf(it){
  const kind=(it&&it.kind)||'highend';
  const M={named:['--rar-gold',['具名','Named'],false],highend:['--rar-gold',['普通','High-end'],true],brand:['--rar-gold',['品牌','Brand'],true],gearset:['--rar-set',['装备组','Gear Set'],false],exotic:['--rar-exotic',['奇特','Exotic'],false]};
  return M[kind]||M.highend;
}
/* 品牌 / 装备组水印图（与资料库 `db.cards.js` 的 `cvBrandIcon()` 同一条查找链）：
   先按件上的 set_code / set_zh / brand_code / brand 去 `DB.brands[]` 里找那张官方图。
   ⚠️ `brands[]` 同时装着**品牌与装备组**（`is_gearset`），所以装备组件也能查到自己的标；
      查不到就返回空串 —— 卡面不画水印，**不拿别的图顶替**。 */
let BWM=null;
function brandWmIcon(it){
  if(!it)return '';
  if(!BWM){
    /* ⚠️ 品牌与装备组**分两张表**存，不能混进一个索引。
       踩过的坑（用户第 304 轮：「突袭绑定到芬里斯去了」）：突袭者战斗装备的件上
       `set_code:"j"`、`brand_code:"set_j"`，而**芬里斯集团公司的品牌 code 恰好就是 "j"**。
       原来一个扁平索引 + `set_code` 优先 ⇒ 拿 "j" 去查，命中的是芬里斯的 brand3.png。
       现在照资料库 `inBrand()/wallItems()` 的口径：**有 set_zh 就是装备组、只查装备组表；
       没有才按品牌查品牌表**，两表互不串门。 */
    BWM={set:{},brand:{}};
    for(const b of arr(DB.brands)){
      if(!b||!b.icon)continue;
      const t=b.is_gearset?BWM.set:BWM.brand;
      for(const k of [b.code,b.zh,b.en,b.name,b.abbr_zh,b.abbr_en]){
        const s2=String(k==null?'':k).toLowerCase();
        if(s2&&!t[s2])t[s2]=b.icon;
      }
    }
  }
  const pick=(tbl,keys)=>{
    for(const k of keys.map(x=>String(x==null?'':x).toLowerCase()).filter(Boolean))
      if(tbl[k])return tbl[k];
    return '';
  };
  /* 装备组件：set_zh / brand（装备组件的 brand 字段存的就是组名）/ brand_code("set_j")，
     一律只在装备组表里找 —— 查不到就不画，**绝不回退到品牌表**，否则又会串成别家的标。 */
  if(it.set_zh) return pick(BWM.set,[it.set_zh,it.brand,it.brand_code,it.set_code]);
  return pick(BWM.brand,[it.brand_code,it.brand,it.brand_en]);
}
/* 水印用 CSS mask 画（颜色在 build.css 里按主题给）⇒ 这里只交出一个带 --wm 的空盒 */
function brandWmHtml(it,cls){
  const ic=brandWmIcon(it);
  if(!ic)return '';
  const u=dbIcon('/assets/db/img/'+imgPath(ic)+IMGV);
  return `<i class="${cls||'gc-wm'}" style="--wm:url('${u}')" aria-hidden="true"></i>`;
}
function rarOfWeapon(w){return (w&&w.rarity>=2)?['--rar-exotic',['奇特','Exotic']]:['--rar-gold',['金装','High-end']];}
function kindLbl(k){return L(G_KIND_ZH[k]||k,G_KIND_EN[k]||k);}
/* 武器 4 配件槽：源无逐件配件渲染图 → 槽位图标(weaponmod1~4) + 配件名，缺失显示 — */
const WATT=[['optics','weaponmod1.png',['瞄具','Optics']],['muzzle','weaponmod2.png',['枪口','Muzzle']],['underbarrel','weaponmod3.png',['握把','Grip']],['magazine','weaponmod4.png',['弹匣','Magazine']]];
function attachHtml(w){
  const A=(w&&w.attachments)||{};
  return `<div class="wc-att">`+WATT.map(([k,ic,lb])=>{
    const a=A[k];
    const t=a?((LANG==='zh'?(a.zh||a.name):(a.name||a.zh))||'—'):'—';
    return `<span title="${esc(L(lb[0],lb[1]))}：${esc(t)}"><img loading="lazy" decoding="async" src="${imgUrl(ic)}" alt="" onerror="this.remove()">${esc(t)}</span>`;
  }).join('')+`</div>`;
}
/* 武器类型英文：优先条目自带 type_en，其次数据汇总 TYPE_EN，再回退缩写表 */
function wtTxt(zh,en){return LANG==='zh'?(zh||''):(en||TYPE_EN[zh]||WTYPES_EN[zh]||zh||'');}
function isRnd(a){return !a||!a.name||(a.name.indexOf('随机')>=0);}
/* 天赋是否被引擎认数（applyTalent 命中）：命中才算进「专属天赋」数值，否则标 ? */
function talentSupported(key){return combatSupport(key).status==='conditional_component';}
/* 插件（装备改造模块）三色：官方 `gear_mods[].official_group` = GearModOffensive/Defensive/Utility
   → 攻击/防御/性能（红/蓝/黄）。**先认官方那个字段**，没有才退回按属性名归类（未知按蓝）。
   三色字形图在 `img/modfilter/offense|defense|utility.png`（与 `--rar-off/def/uti` 同色）。 */
const MODGLYPH={off:'offense',def:'defense',uti:'utility'};
function modGroup(m){
  const g=((m&&m.official_group)||'')+'';
  if(/offensive/i.test(g))return 'off';
  if(/defensive/i.test(g))return 'def';
  if(/utility/i.test(g))return 'uti';
  return '';
}
function modColor(m){
  const g=modGroup(m);
  if(g==='off')return 'red';
  if(g==='def')return 'blue';
  if(g==='uti')return 'yellow';
  const ic=((m&&m.icon)||'')+'';
  if(ic.indexOf('red')>=0)return 'red';
  if(ic.indexOf('yellow')>=0)return 'yellow';
  if(ic.indexOf('blue')>=0)return 'blue';
  const n=((m&&(m.name||m.zh))||'')+'';
  if(/暴击|爆头|武器|伤害|射速|准确|稳定|装弹|弹匣/.test(n))return 'red';
  if(/技能|状态|效率|修复|持续|加速/.test(n))return 'yellow';
  return 'blue';
}
/* 装上去的插件显示哪一色：装了/选中哪个组的插件就画哪个组的字形（官方图，不是自绘） */
function modGlyph(m,cls){
  const code=MODGLYPH[modGroup(m)||(modColor(m)==='red'?'off':(modColor(m)==='blue'?'def':'uti'))];
  return `<img loading="lazy" decoding="async" class="${cls||'mglyph'} mg-${code}" src="${imgUrl('modfilter/'+code+'.png')}" alt="" onerror="this.remove()">`;
}
/* 词条行左端的三色字形（用户第 304 轮：「词条的颜色也是一样，和资料库对应」）。
   复用官方 `img/modfilter/offense|defense|utility.png` —— 与插件字形、资料库
   `.badge.pg-*` 同一套图与同一套色，不另画。fam 取 'off'|'def'|'uti'。 */
const AXFAM_GLYPH={off:'offense',def:'defense',uti:'utility'};
function axGlyph(fam){
  const f=AXFAM_GLYPH[fam];
  /* 没有家族色的行也占同样宽的**空槽**：否则「有字形 / 没字形」两种行的文字起点差 13px，
     整列词条看着就是歪的（用户 2026-10-19：「词条不能对齐？」）。 */
  if(!f)return '<i class="axic axic-empty" aria-hidden="true"></i>';
  /* 用 <i> + CSS mask 上色（官方字形是白图，直接 <img> 在浅色主题上看不见；
     mask 取形状、颜色由 --axc 给 ⇒ 深浅两主题都对，也不违反「禁止局部 filter:invert」那条规则）。 */
  return `<i class="axic" style="--axm:url('${imgUrl('modfilter/'+f+'.png')}')" aria-hidden="true"></i>`;
}
/* 插件字段归一：人工核对表 {name,val,max,unit,desc_zh,threshold}；旧版可能只有 {name,value,unit}。缺字段全部兜底 */
function modVal(m){if(!m)return 0;const v=(m.val!=null)?m.val:(m.value!=null?m.value:0);return isFinite(+v)?+v:0;}
function modName(m){return (m&&(m.zh||m.name))||'';}
function modTitle(m){
  const t=[];
  t.push(modName(m)+' +'+fmtN(modVal(m))+(m&&m.unit||''));
  if(m&&m.desc_zh)t.push(m.desc_zh);
  if(m&&m.max!=null)t.push(L('满值','Max')+' '+fmtN(m.max)+(m.unit||''));
  if(m&&m.threshold)t.push(L('面板上限','Panel cap')+' '+m.threshold);
  return t.join(' · ');
}
/* 这件有没有装备插件位 —— 判据是**部位**（用户 2026-09-14 定稿：「一般情况下只有面具、背心、背包有插件槽」）。
   ✅ 双证（两条独立来源，结论一致）：
     ① 参照实现 `Division2BuildTool\01-源码\源码-按类拆分\GearViewModel.cs:280 SetAttribute4()`：
        `Num < 6` ⇒ 走 `GearAttribute4List`（插件池）；`GearViewModel.cs:67` 构造 ⇒ Mask=3 / Backpack=4 /
        Chest=5 / Gloves=6 / Holster=7 / Kneepads=8 ⇒ **只有 3/4/5 三个部位有插件位**（`BuildViewModel.cs:199-209`）。
     ② 官方 `.mitem`：面具/胸甲/背包的件本体写着 `mySocketIO SocketFace1|SocketChest1|SocketBack1` + `Gear` 标签；
        枪套/护膝的模板（`player_gear_holster_template.mitem` / `player_gear_kneepads_template.mitem`）写的是
        `Mod` 占位 socket，**没有任何 mod 带这个标签**（`g_mod_*` 的标签是 `Gear`/`*_Protocol`/`*_System`）。
   ⚠️ **别再看 socket 标签当判据**（踩过，2026-09-14 当天来回改了两次）：
     · 只看 `tags` 含 `Gear` ⇒ 装备组/奇特件（本体不声明 socket、只继承模板的 `Mod`）全被判成「没有插件位」；
     · 于是改成「`Gear` / `Mod` / `*Protocol` 都算」⇒ 反过来把 **枪套 106 件、护膝 95 件**判成有插件位，
       而 **面具 36 件**被判成没有 —— 两头都错，因为标签表达的是「这一格收哪一类 mod」，不是「这个部位有没有插槽」。
   ✅ 例外（保留，用户第 110 轮：「临时品牌的装备都有插件的阿」）：临时件（Grey 的「临时做出来的手套/枪套/护膝」、
     以及「海登手套」）**件本体**真的声明了 `Gear` 标签 socket（3 手套 / 2 枪套 / 2 护膝，实测逐件可查）
     ⇒ 这一条按件放行，不算进部位规则里。 */
const MOD_POS=[0,1,2];                          // G_SLOTS 前三 = 面具 / 背包 / 胸甲
function modSocketIsGear(s){
  if(!s||s.kind==='skin')return false;          // `skin`/`Dye` 是染色槽，永远不算
  const tg=arr(s.tags).map(String);
  if(tg.indexOf('Dye')>=0)return false;
  return tg.indexOf('Gear')>=0;                 // 只有件本体声明的那一种写法算真插件位
}
/* Multiple declared Gear sockets are real slots, not one boolean. A single selected
   mod means the same mod in each slot; independent mixed-slot choices are not modeled. */
function gearModSlotCount(it,i){
  const declared=new Set(arr(it&&it.sockets).filter(modSocketIsGear).map(s=>s.io)).size;
  return Math.max(declared,MOD_POS.includes(i)?1:0,(state.ovr&&state.ovr[i])?1:0);
}
function hasModSlot(i){
  if(MOD_POS.indexOf(i)>=0)return true;         // 官方三部位恒有 1 个
  if(modSockets(i).length)return true;          // 临时件本体声明的例外
  return !!state.ovr[i];                        // 临时套装：用户显式放行（含真无插槽的件）
}
/* 该格的官方 Gear 插件位列表（没有就返回空数组） */
function modSockets(i){
  const it=gearOf(i);
  return arr(it&&it.sockets).filter(modSocketIsGear);
}
/* 该格能不能开 OVR 开关：官方三部位与临时件都不需要它 */
function canOvr(i){return MOD_POS.indexOf(i)<0&&!modSockets(i).length;}
/* picks.attrs 的官方来源：该件 attrs_max.slots[] 里的**固定槽**（官方 itemgeneration 曲线算出的 L40 满值，
   口径见 geardb._meta.attrs_max_basis）。随机池是「可能出现」的候选、不是这件实际带的 → 一律不喂。
   查不到官方满值的件返回空数组：不编数字、不按 0 顶替。品牌/装备组几件套定值仍走 picks.bonuses。
   `key` = 归一后的引擎键（build.attrs.js 的 attrKey：官方名 → 引擎 MAP 名 + 单位），`name` 保留官方原名供展示。 */
function collectAttrs(it,slot,opt){
  const am=it&&it.attrs_max;
  if(!am||!Array.isArray(am.slots))return [];
  /* 原型档（用户第 110 轮）：**逐属性**用官方 `Prototype / 自身品质` 系数，取不到官方原型档的不动。
     奇特件不参与升级 ⇒ 直接跳过。 */
  const proto=!!(state.bp&&state.bp.prototype)&&it.kind!=='exotic';
  /* ⚠️ 选了核心 ⇒ 件自带那条核心**要让位**（游戏里的核心转换是替换，不是两条一起算）。
     原来这里是「固定槽全喂 + 选中的核心再喂一条」⇒ 一旦允许全局三选，装甲会被算两次。 */
  const csel0=(opt&&opt.core)||state.core||[];
  const pickedCore=(slot!=null&&csel0[slot])?csel0[slot]:null;
  const out=am.slots.filter(s=>s&&s.kind!=='random'&&s.fixed===true&&s.val!=null&&(s.name_zh||s.name_en)
                   &&!(pickedCore&&s.kind==='core'))
    .map(s=>{
      const mul=proto?protoRatio(s.code,s.qmod):1;
      return {name:s.name_zh||s.name_en,key:attrKey(s.name_zh||s.name_en,s.unit),
              val:prototypeAttrValue(s.code,s.val,s.qmod,proto),unit:s.unit||'',src:'curve'};
    });
  /* 面板上直接选的词条：① 核心槽三选一（该件 core 槽候选 >1 时）② 副属性随机槽（`state.affix`）。
     两者都是**用户明确选的**，只有选了才进引擎 —— 没选就维持「只喂固定槽」的原口径，结果不凭空变。
     `opt` = 试算覆盖层（一键配装用）：不传就读 state。 */
  const csel=(opt&&opt.core)||state.core||[];
  const ch=(slot!=null)?coreChoices(it):null;
  const pick=(slot!=null&&ch&&csel[slot])?csel[slot]:null;
  if(pick){const a=coreAttrOf(it,pick);if(a)out.push(a);}
  /* ⚠️ 件自带的「特殊固定词条」（具名的 对甲 6% / 血伤 10% / 掩体 7.2% / **近战伤害 200%**(张牙舞爪)
     这一类，官方 `NamedAttributes` 里的固定加成）是这件**天生带着**的，与随机槽选了什么无关
     ⇒ **无条件喂**，不随玩家的随机槽选择消失。
     原来写成「该格一条副属性都没选才喂」⇒ 一旦自动填（`autoFillGear`，选件即触发）或一键配装
     给随机槽填了第一候选，具名那一条就被**整条丢掉**，具名件在界面与优化器里被系统性低估。
     判据（2026-10-16 近战通道实测，同一套装等）：
       空词条：近战池 800（死亡之吻 500 + 张牙舞爪 200 + 大张旗鼓 100）· 血伤 10 · 掩体 7.2
       自动填：近战池 600（掉了张牙舞爪 200）· 血伤 0（掉了空心人）· 掩体 0（掉了散兵坑）
     ⚠️ 不会双计：随机槽候选是官方那 12 条（攻/防/效各 4），里面**没有** DTA/DTH/OOC/近战，
        所以「特殊固定词条」与「随机槽选的那条」不可能撞同一个 code。 */
  const special=am.slots.filter(s=>s&&s.kind==='random'&&s.fixed===true&&s.val!=null&&(s.name_zh||s.name_en));
  special.forEach(s=>{
    out.push({name:s.name_zh||s.name_en,key:attrKey(s.name_zh||s.name_en,s.unit),val:prototypeAttrValue(s.code,s.val,s.qmod,proto),unit:s.unit||'',src:'special'});
  });
  return out.concat((slot!=null)?affixAttrs(it,slot,opt):[]);
}
/* 核心槽三选一选中项的引擎属性（值取该属性在**该件品质档**的官方满值 × 原型系数） */
function coreAttrOf(it,code){
  const q=amQuality(it),pools=(DB.attrs_max_curve||{}).pools||{};
  const row=pools[code+'@'+q]||pools[code+'@Orange']||{};
  const name=row.name_zh||row.name_en||code;
  const proto=!!(state.bp&&state.bp.prototype)&&it.kind!=='exotic';
  const mul=proto?protoRatio(code,row.qmod):1;
  return {name:name,key:attrKey(name,affixUnit(code,q)),val:prototypeAttrValue(code,row.val,row.qmod,proto),unit:row.unit||'',src:'core'};
}
/* 武器自身的固定词条满值（武器伤害/型号加成…）；武器自带 attrs 里已有的同名属性不重复喂，避免双计 */
function weaponMaxAttrs(w,wslot,opt){
  const am=w&&w.attrs_max;if(!am||!Array.isArray(am.slots))return [];
  const have={};(Array.isArray(w.attrs)?w.attrs:[]).forEach(a=>{if(a&&a.name)have[a.name]=1;});
  const proto=!!(state.bp&&state.bp.prototype)&&!w.exotic;              // 原型档（奇特武器不参与）
  const out=am.slots.filter(s=>s&&s.fixed===true&&s.val!=null&&(s.name_zh||s.name_en)&&!have[s.name_zh||s.name_en])
    .map(s=>{
      const mul=proto?protoRatio(s.code,s.qmod):1;
      return {name:s.name_zh||s.name_en,key:attrKey(s.name_zh||s.name_en,s.unit),
              val:prototypeAttrValue(s.code,s.val,s.qmod,proto),unit:s.unit||'',src:'curve'};
    });
  const choices=weaponAffixCodes(w), saved=(opt&&opt.waffix)||state.waffix;
  const code=(wslot!=null&&saved)?saved[wslot]:null;
  if(code&&choices.indexOf(code)>=0){
    const row=poolRowOf(code,amQuality(w));
    if(row){
      const name=row.name_zh||row.name_en||code;
      out.push({name:name,key:attrKey(name,row.unit||''),val:prototypeAttrValue(code,row.val,row.qmod,proto),unit:row.unit||'',src:'weapon-affix'});
    }
  }
  return out;
}
function gearOf(i){
  const raw=state.slots[i];
  if(raw==null)return null;
  return GEAR_MAP[raw]||null;            // 数据层重排后旧下标失效 → 按空处理，不指向别件装备
}
/* 已选装备的品牌/装备组件数统计。遍历时第 1 个形参是「原始下标值」，第 2 个才是 6 格位置。
   ⚠️ 不能写成 forEach(i=>gearOf(i))：那会把装备下标当格位下标，件数统计直接归零。 */
function countsGear(){
  return effectiveGearCounts(state.slots.map((_,i)=>gearOf(i)));
}
function effectiveGearCounts(gear){
  const per={};
  (gear||[]).forEach(it=>{
    if(!it)return;
    const key=(it.kind==='gearset'&&it.set_code)?('set:'+it.set_code):(it.brand_code?('brand:'+it.brand_code):null);
    if(!key)return;
    per[key]=(per[key]||0)+1;
  });
  if((gear||[]).some(it=>gtalPtr(it)==='ninja_backpack_talent_exotic'))for(const key in per)per[key]++;
  return per;
}
/* 官方加成 → engine buildCompute 契约 picks.bonuses:[{bonus:[{attr,val,unit}]}]
   `attr` 必须走 attrKey 归一（官方名 → 引擎 MAP 名）：官方「暴击机率% / 武器控制力% / 对装甲的伤害% / 修复技能%」
   与引擎键不是同一个写法，不归一会被引擎按未知属性静默丢掉（品牌/套装那一侧品牌墙也走这里，两边同源）。 */
function bonusPick(zh,effects){return {name:zh,bonus:arr(effects).filter(e=>e&&e.attr_zh).map(e=>({attr:attrKey(e.attr_zh,e.unit),val:NUM(e.value,0),unit:''}))};}
/* 当前配装实际触发的品牌/套装加成（按件数）+ 命中天赋名。引擎契约不变，只换数值来源。 */
function collectGearBonus(pickList,per){
  const sel=Array.isArray(pickList)?pickList.filter(Boolean):(function(){
    const l=[];state.slots.forEach((raw,i)=>{const it=gearOf(i);if(it)l.push(it);});return l;})();
  per=per||countsGear();
  const bonuses=[],talents=[],rows=[];
  const seen={};
  /* ⚠️ 形参不能叫 arr（会遮蔽全局的 arr() 数组兜底助手，导致 effects/talents 全取成函数 → 加成静默丢失） */
  const addRows=(it,list,kindZh,zhName,count)=>{for(const rawTier of list){const t=Object.assign({},rawTier,{effects:state.bp.pvp&&arr(rawTier.pvp_effects||rawTier.pvp).length?rawTier.pvp_effects||rawTier.pvp:rawTier.effects});const on=count>=t.pieces;rows.push({kind:kindZh,zh:zhName,pieces:t.pieces,on:on,effects:arr(t.effects),talents:arr(t.talents)});if(!on)continue;
    const pick=bonusPick(zhName,t.effects);if(pick.bonus.length)bonuses.push(pick);
    for(const tl of arr(t.talents))if(tl&&(tl.zh||tl.en||tl.key))talents.push({name:tl.zh||tl.en||tl.key,zh:tl.zh||'',en:tl.en||'',key:tl.key||'',desc:tl.desc_zh||tl.desc_en||''});}};
  for(const it of sel){
    if(it.kind==='gearset'&&it.set_code){if(seen['s:'+it.set_code])continue;seen['s:'+it.set_code]=1;addRows(it,gearSetBonus(it),'set',it.set_zh||it.brand||it.set_code,per['set:'+it.set_code]||0);}
    else if(it.brand_code){if(seen['b:'+it.brand_code])continue;seen['b:'+it.brand_code]=1;addRows(it,brandBonusOf(it),'brand',it.brand||it.brand_en||it.brand_code,per['brand:'+it.brand_code]||0);}
  }
  return {bonuses:bonuses,talents:talents,rows:rows};
}

/* ── PvP 模式：天赋的官方 PvP 数值（`talents_official[].bonus_pvp`，由阶段 25 写入） ──────────────
   口径（用户第 268/275 轮「PVP数值也没有加进去，我需要配装器加上 PVP 开关」）：
   ① **只有官方给了 PvP 覆盖的天赋**才切值（`talentPvpN` 为 0 的照旧用 PvE，不改价、不猜）；
   ② 描述**不分两套**：官方 PvE / PvP 共用同一份带 `{0}…{n}` 占位的文本，
      差异纯粹来自回填哪套数值 ⇒ 这里按当前模式现填，**不回写数据**；
   ③ 占位比数值多时（实测 374 条里有 2 条）**保留占位原样**，不拿 0 或 PvE 值顶替。 */
function talentBonusOf(t,on){
  if(!t)return [];
  if(!on)return arr(t.bonus);
  return arr(t.bonus_pvp).length?arr(t.bonus_pvp):arr(t.bonus);
}
function talentPvpN(t){return arr(t&&t.bonus_pvp).length;}
/* 描述按给定数值表回填占位（口径与 scripts/rebuild/stage04_talents.py::fill_desc 逐字一致） */
function talentDescFill(t,on){
  if(!t)return '';
  const base=(t.desc_zh||t.desc_en||'').trim();
  if(!base)return '';
  const vals=talentBonusOf(t,on).map(b=>(b&&b.value!=null)?b.value:b&&b.raw);
  if(!vals.length)return base;
  return base.replace(/\{(\d+)\}/g,(m,g)=>{
    const v=vals[+g];
    if(v==null||!isFinite(+v))return m;
    return String(+v);
  });
}
/* 天赋卡 / 选择器用的描述：PvP 模式下若官方确实有 PvP 数值就现填，否则用 PvE 的官方填好版 */
function talentDescText(t,on){
  if(!t)return '';
  if(on&&talentPvpN(t))return talentDescFill(t,true);
  return (t.desc_filled_zh||t.desc_zh||t.desc_en||'').trim();
}
/* 描述占位对不上时，把官方参数原样列出来。数值仍取当前模式，不另写一份。 */
function talentParamLines(t,on){
  const rows=talentBonusOf(t,on).filter(b=>b&&b.value!=null&&isFinite(+b.value));
  if(!rows.length)return [];
  const text=talentDescText(t,on);
  const slots=(text.match(/\{(\d+)\}/g)||[]).map(x=>+x.slice(1,-1));
  const filled=text&&!slots.length;
  if(filled)return [];
  return rows.map(b=>{
    const code=String(b.code||'');
    const tail=code.replace(/^.*(?:_P\d+_|Final|ModBonus)/,'')||code;
    const name=(b.attr_zh&&on!=='en')?(b.attr_zh):(b.attr_en||b.name||tail||code);
    return name+' '+String(+b.value)+(b.unit||'');
  });
}
/* 这条天赋在 PvP 模式下会不会变（供界面标注「PvP 有差异」） */
function talentPvpDiff(t){
  if(!t||!talentPvpN(t))return false;
  const a=arr(t.bonus).map(b=>b&&b.raw),b=arr(t.bonus_pvp).map(x=>x&&x.raw);
  if(!a.length||!b.length)return false;
  return a.length!==b.length||a.some((v,i)=>v!==b[i]);
}

/* 同名同枪族只留一条主条目（用户 2026-10-19：「配装器里有重复武器」——帕坎两条、火种六条…）。
   口径与重建脚本 `scripts/rebuild/stage02_weapons.py:dedupe_by_name()` 一致：那份脚本给重复项打了
   `variant`/`dup_primary`，但**只做了标记，没删数据**；资料库靠 `SHOWVAR` 默认折叠，配装器原来
   一个都没过滤 ⇒ 同一把枪按不同变体（level30boost / worldtier / dupsuffix / dupname）重复列出。
   这里按 (family, 显示名) 分组挑一条代表项，判据顺序：
     ① 有主条目（没有 `dup_primary`）→ ② 不是变体 → ③ 有官方满值曲线（配装器要算数）
     → ④ 基础伤害高 → ⑤ 有弹匣
   ⚠️ 只在**展示/候选**层收口，不动 `DB.weapons` 下标：存档与分享链接都按下标存，
      删/移数组会让旧配装静默串枪。 */
let WREP=null;
function buildWeaponRepSet(){
  if(WREP)return WREP;
  const all=arr(DB.weapons),groups=new Map();
  for(let i=0;i<all.length;i++){
    const w=all[i];if(!w||w.not_in_game)continue;
    const k=(w.family||'')+'|'+(w.zh||w.en||w.mitem||'');
    let a=groups.get(k);if(!a){a=[];groups.set(k,a);}a.push(i);
  }
  const rank=i=>{const w=all[i];return [w.dup_primary?1:0,w.variant?1:0,w.attrs_max?0:1,-(w.dmg||0),w.mag?0:1];};
  const cmp=(a,b)=>{const ra=rank(a),rb=rank(b);for(let i=0;i<ra.length;i++)if(ra[i]!==rb[i])return ra[i]-rb[i];return a-b;};
  WREP=new Set();
  for(const a of groups.values()){a.sort(cmp);WREP.add(a[0]);}
  return WREP;
}
function buildWeaponRepresentative(w){
 if(!w||w.not_in_game)return false;
 const i=arr(DB.weapons).indexOf(w);
 if(i<0)return true;                    // 外来对象（分享存档里的旧件）不拦
 return buildWeaponRepSet().has(i);
}
