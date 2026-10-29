# 可选：Flarum 配装记录接口

`src/BuildLibrary.php` 是配装记录的完整服务端处理器；`extend.php` 仅包含这四条配装接口。集成到 Flarum 1.x 的现有扩展时，配置 `AgentHub\\` 指向 `src/` 的 PSR-4 自动加载，保持 Flarum 自带会话认证与 CSRF 中间件。PHP 8.1+。

GET /api/builds：读取当前登录用户的记录。
POST /api/builds：新建，参数 name/document。
PATCH /api/builds：更新，参数 id/revision/name/document。
DELETE /api/builds：删除，参数 id/revision。

记录位于当前用户的 `agenthubBuildLibrary` preference；最多40条，使用 revision 检测并发更新。不接受调用者指定的用户ID。独立网页默认使用浏览器本地保存；接入此服务后再移除 standalone.js 中的 buildAccountRequest 适配。
