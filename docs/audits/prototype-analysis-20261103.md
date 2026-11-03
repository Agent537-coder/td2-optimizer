# 原型条件与伤害分析 · 2026-11-03

本次按用户要求完善配装页，后续界面改动不再先上 Pen。只做本地实现，未提交、推送或部署。

## 实现范围

- `web/assets/db/build.audit.js`：原型来源、等级与 PvE/PvP 曲线共用入口；回声与悖论按组开关并进入基础／峰值预设。列出实际槽位，排除奇特、空槽与备用武器。候选奇特武器不继承当前武器增幅。保存与恢复沿用 bp 快照，新增 `bp.augmentEffects`（缺失时保持旧版默认计入）。
- 回声复用现有 `Echo`，悖论复用 `MagRefill`。核心 `engine.js` 未改动。捕猎者的状态效果持续时间不再错加到技能持续时间。其他原型保留官方数值和按等级替换的官方说明，明确未模拟，不能据此声称治疗、免疫或状态机制已被计算。
- `web/assets/db/build.charts.js` 与页面分析区：先给伤害来源、循环输出与非开火占比，再给目标分段发数、原型收益、时间窗口／原型对照曲线和命中矩阵。曲线是固定条件下的等效均值，按 `DPM / DPS` 与 `DPM / SDPS` 保留命中率和小数等效弹匣，不代表逐发随机触发或真实增益持续时间。
- 目标发数分别对装甲与生命取整，不模拟破甲溢出、回声重复命中、目标回复和免疫；PvP 缺目标模型时不编造结果。
- `web/assets/db/build.layout.js`：窄屏条件入口到实际条件内容，修复打开空弹窗。图表柱形通过自己的几何样式避免被共享 `.bar { height:6px }` 压扁。
- 同步了功能仓 `G:/td2-optimizer` 中的同一变更，保留两个仓库既有差异。功能仓没有本次 Git 提交。

## 外部参考

实际读取了 [mxswat](https://github.com/mxswat/mx-division-builds) 的 README 与[网页](https://mxswat.github.io/mx-division-builds/)，以及 [ImThatTeriyaki Gear Calculator](https://github.com/ImThatTeriyaki/Tom-Clancy-The-Division-2-Gear-calculator) 的 README。借鉴配装分享、即时属性和区分爆发／循环输出的任务组织，没有复制代码或采用它们的数值真值。另两站读取失败，未作为已验证依据。

## 上线前复核与验证

- 对当前 858 条官方天赋执行 PvE/PvP 参数及来源漂移校验，0 issue；这不等于所有战斗机制均已完整模拟。
- 原有 6 项失败均已修复，不修改既有断言：显式关闭条件优先；游骑兵、精准打击、突袭者使用正确乘区；精准打击遵守 PvE 20m / PvP 25m 距离边界。
- 继续检查枪械相关配方：修正状态增伤的乘区、螳螂爆头重复加成、追悼进攻核心缩放、花期目标剩余装甲生命档位、压制背包每层增量，以及基础/满值预设和修改条件输入时的状态保持。
- 核心转换尚无完整模型，删除原先把每核心基值/转换率直接加入面板的错误数值；保留官方描述和明确未模拟提示。瘟疫持续伤害不当作每发增伤。近战伤害不进入普通枪伤。原型中仅回声和悖论接入现有期望模型，其余机制保持说明边界。
- 两仓优化器回归均 67/67 通过，包括新增 6 项上线前机制测试。主仓试算台、DOM/跨层契约、属性别名/入参、前端依赖及数据闭环通过。数据闭环有 4 条既有警告、1 份待登记资产；结构 error 为 0。
- 浏览器 85 项检查通过：1440/393/320，中文/英文，深/浅色，保存恢复、PvE/PvP、原型贡献、伤害曲线、条件开关/层数/距离与预设。无脚本错误和失败资源；截图是浏览器模拟视口，未作真实手机硬件验证。
- 增量版本 v374；由版本脚本统一推进后保留本次配装页引用，其他页面源内容复原为任务前状态。公开 HTML 经 scripts/publish/page.py 变换；静态资源从本次产物现压 .br。发布收据及备份位置见 work/prototype-20261103/release-receipt.json。
- 功能仓同步当前线上已有的兼容模块，以保证本次新增功能的运行依赖可复现；公式引擎未作新修改。生成配方真源在主仓 scripts/rebuild/recipes，功能仓保存重建快照。

## 证据

work/prototype-20261103/ 下保存 preflight-audit/audit.json、preflight-tests.log、functional-preflight-tests.log、browser-report.json、dataops-final.log、ship-gap-before.json、release-manifest.json、release-receipt.json，以及桌面/手机视口截图。

## 发布结果

v374 已增量发布至 https://agenthub.fans/build/ 。首批替换 24 件（含 .br），未变化的 vendor 数据与 .br 保留线上版本。服务器逐 SHA 和明文/Brotli HTTP 实取通过；线上 85 项浏览器检查通过。发布后 ship_gap 检查 42 件，本次资源清零；唯一剩余 base.css 差异经逐行比较为 CRLF/LF 差异，未发布这个共享文件。花期说明最后一次对齐是纯数据文案更新，单独保留 release-copy-receipt.json。
