# 数据与资源说明

## 运行数据与参考数据分开看

- `web/assets/db/geardb.lean.json`：页面 `build.app.js` 的 `load()` 实际读取的配装库。
- `web/assets/db/geardb.json`：完整装备数据快照，保留用于核对精简库与原始字段；不是第二份手工维护的数据真值。
- `web/assets/db/enemy_coeffs.json`：`build.params.js` 读取的敌人系数。
- `web/assets/db/spec/index.json` 与同目录专长分片：`build.specialization.js` 按需加载。
- `web/assets/db/specializations.json`：保留完整专长快照作参考，页面加载分片；不要同时修改两份再让它们漂移。
- `web/assets/db/mono_icons.json`：参考快照；当前 `build.data.js` 从装备库的 `_meta.mono_icons` 建立单色图标名单。

仓库不含数据重建脚本；更新数据时需同步完整库与精简库、专长完整库与分片。

## 为什么图片文件多

`web/assets/db/img/` 按物品类型存放图标。装备和技能会从 JSON 字段及运行时代码拼接路径，不能因为 HTML 没直接引用就删除。`web/assets/fonts/` 是字体及许可文件，`web/assets/vendor/` 是分享导出依赖。

`web/assets/img/` 等共用目录可能包含冗余素材，尚未裁剪。删除前需核对 JSON 路径、动态拼接、CSS、导出和回退图标。

`ASSET-INVENTORY.json` 按目录记录文件数和体积。重建命令：

```sh
python scripts/check_snapshot.py --report docs/ASSET-INVENTORY.json
```
