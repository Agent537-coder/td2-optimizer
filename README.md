# 特工枢纽 · 全境封锁 2 配装器

包含完整配装页面、游戏数据与图标、计算引擎、自动配装和回归测试。

当前回归测试37项通过、12项失败，详见 [已知问题](VALIDATION.md)。

## 从哪里开始看

- **看页面或改交互**：先运行下面的页面，再读 [代码导航](docs/CODEMAP.md)，从 `web/dashboard_build.html` 的加载顺序入手。
- **看自动配装**：读代码导航的“搜索与评分”，用 `npm run optimize` 取得可复现输入／输出，再跑回归测试。
- **看数据**：读 [数据与资源说明](docs/DATA.md)，区分页面加载数据与参考快照。
- **接手前核对完整性**：运行 `npm run check`；[资源清单](docs/ASSET-INVENTORY.json) 按目录汇总数量和体积。

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

`scripts/optimize.mjs` 接收本地 JSON，调用页面计算代码，输出优化结果 JSON。

- 可选配装云存档服务端：`integrations/flarum/`，包含处理器与独立路由。
- 页面：`web/dashboard_build.html`；样式 `web/assets/db/build*.css`。
- 公式真值：`web/assets/db/engine.js`，修改须先确认公式、对拍与靶场依据。
- 自动配装：`build.opt.js`、`build.opt.defs.js`、`build.opt.cand.js`。
- 评分桥接：`build.app.js` 中 `evalBuild()` → `TD2Calc.buildCompute()`。
- 物品与条件：`build.data.js`、`build.attrs.js`、`build.req.js` 等。
- 装备数据：`geardb.json`、`geardb.lean.json`；专长分片 `spec/`。
- 页面试算台：`scripts/devcheck/build_sim.harness.mjs` 按 HTML 的 script 顺序加载；增删脚本时同步检查依赖。
- 源文件校验：`SOURCE-MANIFEST.json` 记录原文件 SHA-256；公式和搜索代码原样提取。HTML 仅追加独立运行适配器。

测试失败项和页面实测范围见 `VALIDATION.md`。

## 评审与反馈

Issue／PR 请附复现步骤、输入 JSON 或配装导出、预期与实际结果；页面问题附视口、主题和截图。

