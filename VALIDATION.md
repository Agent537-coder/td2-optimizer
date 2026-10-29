# 验证记录 · 2026-10-29

## 已运行

- Node.js 页面试算台：通过，错误列表为空。
- JSON 优化入口：通过，默认预算300，返回 ok:true。
- 真实 Edge 浏览器：PC1440／手机393，深浅色均截图检查，无水平溢出，无脚本异常或HTTP失败。实点武器类别、候选、应用选择；本地保存与记录列表；自动配装预览保持手配状态，点击应用后可撤销还原；配装分享链接生成成功。
- 账户适配器与完整Flarum配装记录处理器都包含在仓库；独立网页只使用localStorage。Flarum集成未在本独立仓库部署或认证实测。

## 原有失败项

原工作区和独立仓库运行相同4份优化器回归测试，均为49项：37通过、12失败，失败名称一致。保留原测试与算法，未为发布修改断言或计算公式。请优先协助核对以下项目（失败不一定全是同一类公式错误）：

- Camaraderie applies base weapon damage and CHD, not total weapon damage
- Centurion group one adds source base weapon damage, never total weapon damage
- Hunter Fury near-target debuff and kill-stack buffs are independent and distance-correct
- Intimidate source instances compound independently and obey 10m in peak and manual modes
- Kinetic Momentum has two independent skill slots, normal 45 and perfect 54 total skill damage
- Negotiator transfer affects other marked targets, never primary-target weapon damage
- Precision PvP and manual distances fail closed for missing, negative and out-of-range targets
- Precision Strike is amplified per stack and rejects targets beyond its frozen threshold
- Striker is linear within its own modifier and independent of other total-weapon buffs
- Versatile is an independent modifier gated by the actual class and distance, never a free 35-percent total pool
- a six-red Striker fixture matches independently summed cores and a 180-percent modifier
- theoretical/current scores are independently reproducible without changing user conditions

## 复现

```sh
npm test
npm run simulate
npm run optimize
```

当前 `npm test` 预期退出1，应以修复后的真实结果更新本记录。此记录不覆盖全部武器／天赋／导入导出边界或游戏内靶场验证。
