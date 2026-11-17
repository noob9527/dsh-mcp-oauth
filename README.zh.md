# DSH MCP OAuth

为未经修改的官方 DeepSeek Harness 提供 OAuth MCP 工具接入。插件自行管理 MCP 连接，通过官方工具、凭据、授权及插件页面接口集成。

[English](README.md)

## 状态与兼容性

本项目是独立社区插件，并非 DeepSeek 官方产品。npm 0.1.0 仅支持本机回调；0.2.0-rc.2 新增远程个人实例回调和手动粘贴授权响应。

| 客户端 | 验证状态 |
| --- | --- |
| 官方 DSH 0.2.1-alpha.3 / 0.2.2-rc.1 Web，本机 macOS | 当前候选包：已验证浏览器 CIMD 授权和真实聊天调用 |
| 官方 Desktop | 计划支持，尚待验收 |
| 其他 DSH 版本 | 未声明兼容 |
| 远程个人 DSH，0.2.0-rc.2 | HTTPS 代理 fixture 已验证，实际部署仍需验收 |
| 多人共享 DSH | 不支持 |

0.2.0-rc.2 要求 DSH `>=0.2.1-alpha.3`。[17 版本兼容矩阵](docs/compatibility.md)中满足下限的 13 个已发布版本均通过自动化检查。范围允许安装后续版本，但不代表后续版本自动通过验收。0.1.0 保留原 rc.2 限制。

## 从 npm 安装

需要 Node 24.9+ 和满足 `>=0.2.1-alpha.3` 的未经修改官方 DSH。公开包名为 `@noob9527/dsh-mcp-oauth`。

`0.2.0-rc.2` 正在开发中，尚未发布到 npm。使用 `next` 安装已发布的预览版，或按下文从当前源码构建；`latest` 用于安装稳定版。

安装已发布的预览版：

```sh
dsh plugin --profile web add @noob9527/dsh-mcp-oauth@next
```

无 scope 的 `dsh-mcp-oauth` 属于其他项目。从本地旧包迁移时，先移除旧插件条目，再安装新包，不要同时启用两者。使用相同 DSH profile 和 home，以保留本机服务配置和授权记录。

## 从源码安装

需要 Node **24.9+**、pnpm **12.5.1**，以及满足 **`>=0.2.1-alpha.3`** 的未经修改官方 DSH。克隆本仓库后，在仓库目录运行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run typecheck
pnpm test
pnpm pack --pack-destination artifacts
dsh plugin --profile web add "$(pwd)/artifacts/noob9527-dsh-mcp-oauth-0.2.0-rc.2.tgz"
```

测试需要支持 `req -addext` 的 OpenSSL；自动化测试不需要模型 API Key 或业务 MCP 服务。DSH 提示需要重启时，重启后继续。如果使用自定义 `DSH_HOME`，安装插件和启动 DSH 时必须使用相同值。通过 npm 安装时，如无法解析包名，请检查 `npm config get registry`；公开 registry 为 `https://registry.npmjs.org/`。

Desktop 使用独立 profile，目前尚未完成其安装和 OAuth 验收。

## 登录

进入“Plugins → Built-in plugin settings → OAuth MCP”（当前官方扩展位把设置入口放在这个分组中），添加服务、保存并点击“登录”，随后打开授权页面。本机模式下，浏览器必须运行在 DSH 所在的电脑上；远程个人实例模式下，管理员配置 HTTPS 回调代理后，可在自己的浏览器登录。回调页只确认已收到授权响应；最终授权状态和工具连接状态分别显示在 DSH 中。

## 配置

开发版支持“本机”“远程个人实例”自动回调和“手动粘贴授权响应”三种回调方式。远程模式配置公网 HTTPS 回调 URL 和内部监听端口（默认 6274），监听地址固定为 `127.0.0.1`。代理必须与实例共享网络命名空间，每人拥有独立 Host、profile 和凭据存储。部署步骤、CIMD 模板及降级限制见[远程个人实例指南](docs/remote-personal-instances.zh.md)。

默认服务列表为空。文档中的 `https://mcp.example.com/mcp` 仅为占位地址。

- 自动模式优先使用已配置的预注册身份，其次使用服务端支持的 CIMD，最后尝试 DCR。
- 插件提供公共 CIMD 文档，声明 `127.0.0.1` 和 `localhost` 两种本机回调；用户仍可替换文档地址。
- 默认回调为 `http://127.0.0.1/oauth/callback`。本机模式未填写端口时，登录前由系统分配空闲端口，授权请求和 token 交换使用同一个实际地址；授权服务器须支持 RFC 8252 原生客户端 loopback 端口匹配。已有显式端口配置保持固定，冲突时仍报错；远程 HTTPS 回调和手动响应仍精确匹配。
- 客户端密钥单独保存；编辑表单留空表示保留已有值。清除授权会删除包含密钥的本机授权记录。
- 高级设置默认：连接超时 30 秒、授权超时 5 分钟、工具总时限 10 分钟、提前 60 秒刷新、最多重连 5 次且间隔不超过 30 秒。

无法反代回调时，可选择“手动粘贴授权响应”。浏览器授权后，将完整回调 URL 粘贴到该服务的待登录表单；插件不启动监听器，仍校验 PKCE、一次性 state 和已登记回调地址。详见[手动授权指南](docs/manual-authorization.zh.md)。

## 凭据与失败处理

服务配置保存在当前 profile 的 `mcp-oauth/servers.json`。授权信息通过 DSH 凭据服务保存，按 profile 的真实目录和服务标识区分。默认存储为本地文件，不是系统钥匙串。修改服务地址、客户端身份、权限范围或回调配置后需要重新授权。

停用保留凭据；清除授权断开连接并删除本机凭据；删除服务同时删除配置和凭据。这些操作不代表已在授权服务器撤销 token。卸载包保留持久化数据，如需清理，请先清除授权并删除服务。首版不支持多个 DSH 进程同时使用同一 profile。

刷新 token 不主动中断已受理的长调用。HTTP 401 最多触发一次 SDK 认证后重发；断线或超时不会自动重放工具调用。出现“结果未知”时，先核查服务端执行情况，再决定是否重试。

开发版支持本机及远程个人 Web 实例；Desktop 仍待验收。不支持多人共享 Host、旧版 SSE/stdio、MCP Tasks、资源浏览和提示词浏览。

## 升级与卸载

使用 `dsh plugin --profile web add @noob9527/dsh-mcp-oauth@<version>` 安装指定版本后重启 DSH。升级前先确认该版本声明的 DSH 兼容范围。

卸载命令为 `dsh plugin --profile web remove @noob9527/dsh-mcp-oauth`，完成后重启 DSH。若需同时清除本机服务配置和授权，请在卸载前通过插件设置页删除服务。以上操作始终使用相同 `DSH_HOME`。

## 开发与验收

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run typecheck
pnpm test
pnpm run build
pnpm pack
pnpm exec tsx tests/serve-fixture.ts
```

本地测试服务提供确定性搜索、延迟返回和调用计数。CIMD 测试启动独立 HTTPS 文档服务，授权服务器在同意授权前实际抓取并校验客户端身份和回调地址。OpenSSL 为每次测试生成临时证书，仅测试授权服务器显式信任，TLS 校验保持开启。运行 `pnpm exec tsx tests/serve-cimd.ts` 可进行浏览器验收；这不代表验证了公网托管或第三方授权服务器。官方客户端验收步骤和已完成项目见 [验收说明](docs/acceptance.md)。

## 贡献与发布

开发流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，敏感问题报告见 [SECURITY.md](SECURITY.md)，源码与包的发布步骤见[发布指南](docs/releasing.md)。GitHub CI 不需要模型凭据；CI 通过不代表完成 Desktop 或真实聊天验收。

认证恢复失败会注销受影响服务的工具并提示重新登录。响应丢失或超时会报告结果未知，不会自动重放 tools/call；重连仅重新初始化连接和发现工具。关闭连接会拒绝新调用并等待已受理工作结束。[故障验收矩阵](docs/acceptance.md#high--and-medium-priority-failure-acceptance)区分自动化测试与真实页面证据。

## 许可证

[MIT](LICENSE)。依赖保留各自的许可证。

### Host OAuth 诊断日志

OAuth 登录和刷新失败会向 Host 标准错误输出 JSON `mcp_oauth_failure` 记录。容器部署请查看 Host/容器日志，而非聊天记录。日志包含服务标识摘要、失败阶段，以及最多六层允许输出的错误分类、网络错误码和 HTTP 状态码。阶段包括 `callback_setup`、`resource_challenge`、`discovery_and_registration`、`authorization_callback`、`token_exchange`、`credential_persistence` 和 `refresh`；发现阶段包含 SDK 管理的客户端注册。未知错误保留为 `UnknownError`，未识别原因不表示成功。代理隧道拒绝状态从已识别的错误文本中提取，原始文本不会保留。

日志不包含原始消息、堆栈、URL、服务显示名称、请求或响应正文、请求头、授权码、state 或凭据，也不进入 Client 状态和会话事件。UI 错误码保持不变。服务标识摘要用于关联错误，不是访问凭据。

新增服务时，高级设置中的服务标识默认为空，占位文字展示根据显示名称生成的标识。保存时使用手动填写的标识，留空则使用自动生成值；清空手动填写的标识可恢复自动生成。非 ASCII 字母使用 Unicode 码点片段。标识重复时拒绝保存，请在高级设置中修改。已有服务保留原标识，编辑时不可修改，重命名也不会改变标识。

新增服务在 **Advanced → Client metadata document URL** 中预填[公开客户端元数据文档](https://noob9527.github.io/dsh-mcp-oauth/oauth/client-metadata.json)，允许修改或清空。已有服务保留原值，包括空值。该文档支持两种本机主机名、`/oauth/callback` 路径和动态端口；其他路径或远程回调需要使用匹配的文档。

Scopes（权限范围）位于高级设置，默认留空以自动发现；多个权限用空格分隔。已有配置的权限范围保持不变。

服务表单默认仅显示 Display name（显示名称）和 MCP URL，其余配置项均位于 Advanced（高级设置）。展开高级设置不会改变已有配置；高级字段校验失败时自动展开。

每个配置项旁都有说明按钮，支持悬停、键盘聚焦或点击查看中英文用途提示；点击外部或按 Escape 可关闭。

高级设置中的字段按注册模式显示：自动模式显示客户端 ID、客户端密钥和元数据文档 URL；CIMD 仅显示文档 URL；预注册显示客户端 ID 和密钥；DCR 隐藏这三项。切换模式时保留草稿值；保存 DCR 或预注册配置时清空不适用的元数据文档 URL，隐藏的客户端身份值保持不变。校验错误会列出有问题的字段。本机回调或当前注册身份使用默认托管文档时隐藏回调 URL，保留已保存的值。默认文档仅支持本机回调；远程或手动回调需要相匹配的客户端元数据和回调配置。
