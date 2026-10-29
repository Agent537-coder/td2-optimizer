# 数据与资源说明

## 运行数据与参考数据分开看

- `web/assets/db/geardb.lean.json`：页面 `build.app.js` 的 `load()` 实际读取的配装库。
- `web/assets/db/geardb.json`：完整装备数据快照，保留用于核对精简库与原始字段；不是第二份手工维护的数据真值。
- `web/assets/db/enemy_coeffs.json`：`build.params.js` 读取的敌人系数。
- `web/assets/db/spec/index.json` 与同目录专长分片：`build.specialization.js` 按需加载。
- `web/assets/db/specializations.json`：保留完整专长快照作参考，页面加载分片；不要同时修改两份再让它们漂移。
- `web/assets/db/mono_icons.json`：参考快照；当前 `build.data.js` 从装备库的 `_meta.mono_icons` 建立单色图标名单。

这份仓库是运行和评审快照，没有带入主站完整解包与重烘流水线。本次整理未重生成、合并或修改游戏数据。修数据时先确认上游来源及完整库／精简库、专长完整库／分片的生成关系。

## 为什么图片文件多

`web/assets/db/img/` 按物品类型存放图标。装备和技能会从 JSON 字段及运行时代码拼接路径，不能因为 HTML 没直接引用就删除。`web/assets/fonts/` 是字体及许可文件，`web/assets/vendor/` 是分享导出依赖。

`web/assets/img/` 等共用目录保留提取时的资源，其中可能有配装器没有用到的素材。本轮不把静态字符串搜索当成完整依赖闭包，也不宣称所有文件均被使用。后续裁剪需同时覆盖数据路径、动态拼接、样式、主题／语言、导出与失败回退。

查看 `ASSET-INVENTORY.json` 可按目录定位体积来源；它是清单，不是“未使用资源”删除名单。运行以下命令可重建：

```sh
python scripts/check_snapshot.py --report docs/ASSET-INVENTORY.json
```

## 提交反馈需要什么

算法问题提供优化输入 JSON、预算、完整配装导出、预期公式依据和实际结果。页面问题提供操作步骤、视口、主题、截图与控制台错误。不要提交个人账号或浏览器存储内容。
