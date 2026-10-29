# 特工枢纽 · 全境封锁 2 配装器

完整配装器的独立评审快照，包含页面、双端样式、装备与技能图标、游戏数据、计算引擎、自动配装、条件与天赋处理，以及现有回归测试。源自 2026-10-29 工作区当前版本，不是主站旧 GitHub 分支。

仍在开发中；公式与搜索有已知未覆盖机制，不能把理论弹匣快照当成实战持续 DPS。

## 运行完整页面

需要 Python 3.10+；无需安装 Python 第三方依赖。

```sh
python serve.py --port 8765
```

浏览器打开 <http://127.0.0.1:8765/build/>。不要用 `file://`。PC、手机视口及深浅主题均可评审。

手动配装、属性/天赋、自动配装预览/应用/撤销、JSON 导入导出、图片导出、配装链接分享均保留。独立版“保存配装／我的配装”使用当前浏览器的 localStorage，不上传个人数据；清理浏览器数据会删除本地记录。论坛发帖入口只提示独立版限制。

## 算法与测试

需要 Node.js 22+，无 npm 运行依赖。

```sh
npm test
npm run simulate
npm run optimize
# 自定义输入：JSON 文件，例如 {"target":"sdps","budget":6000,"req":{}}
npm run optimize -- options.json
```

`scripts/optimize.mjs` 是本地 JSON 输入／输出入口，使用同一份页面计算代码。它不会提供远程 HTTP 服务，不需要主站后台账号或 Token。

- 可选配装云存档服务端：`integrations/flarum/`，包含处理器与独立路由。
- 页面：`web/dashboard_build.html`；样式 `web/assets/db/build*.css`。
- 公式真值：`web/assets/db/engine.js`，修改须先确认公式、对拍与靶场依据。
- 自动配装：`build.opt.js`、`build.opt.defs.js`、`build.opt.cand.js`。
- 评分桥接：`build.app.js` 中 `evalBuild()` → `TD2Calc.buildCompute()`。
- 物品与条件：`build.data.js`、`build.attrs.js`、`build.req.js` 等。
- 装备数据：`geardb.json`、`geardb.lean.json`；专长分片 `spec/`。
- 页面试算台：`scripts/devcheck/build_sim.harness.mjs` 按 HTML 的 script 顺序加载；增删脚本时同步检查依赖。
- 源文件校验：`SOURCE-MANIFEST.json` 记录原文件 SHA-256；公式和搜索代码原样提取。HTML 仅追加独立运行适配器。

测试结果、发现的失败和页面实测范围见 `VALIDATION.md`，不要用“能运行”推断全部业务正确。

## 评审与反馈

请通过 Issue 或 PR 提交；附上运行环境、输入 JSON／配装导出、预期与实际结果、复现步骤。页面问题附 PC／手机视口、主题和截图。算法问题优先补可复现测试，勿仅靠排名变化证明公式正确。

