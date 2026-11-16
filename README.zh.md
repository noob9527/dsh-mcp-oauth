# DSH MCP OAuth

为未经修改的官方 DeepSeek Harness 提供 OAuth MCP 工具接入。插件自行管理 MCP 连接，通过官方工具、凭据、授权及插件页面接口集成。

[English](README.md)

## 状态与兼容性

本项目是独立社区插件，并非 DeepSeek 官方产品。0.1.0 为初始预览版，目前尚未发布 npm 包。

| 客户端 | 验证状态 |
| --- | --- |
| 官方 DSH 0.2.2-rc.2 Web，本机 macOS | 已验证浏览器授权和真实聊天调用 |
| 官方 Desktop | 计划支持，尚待验收 |
| 其他 DSH 版本 | 未声明兼容 |
| 远程或多人共享 DSH | 不支持 |

## 从源码安装与登录

需要 Node **24.9+**、pnpm **12.5.1**，以及未经修改的官方 DSH **0.2.2-rc.2**。克隆本仓库后，在仓库目录运行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run typecheck
pnpm test
pnpm pack --pack-destination artifacts
dsh plugin --profile web add "$(pwd)/artifacts/dsh-mcp-oauth-0.1.0.tgz"
```

测试需要支持 `req -addext` 的 OpenSSL；自动化测试不需要模型 API Key 或业务 MCP 服务。DSH 提示需要重启时，重启后继续。如果使用自定义 `DSH_HOME`，安装插件和启动 DSH 时必须使用相同值。只有维护者将包发布到你配置的 registry 后，才能按包名安装；将源码发布到 GitHub 不会自动发布 npm 包。

Desktop 使用独立 profile，目前尚未完成其安装和 OAuth 验收。

进入“Plugins → Built-in plugin settings → OAuth MCP”（当前官方扩展位把设置入口放在这个分组中），添加服务、保存并点击“登录”，随后打开授权页面。浏览器必须运行在 DSH 所在的电脑上。回调页只确认已收到授权响应；最终授权状态和工具连接状态分别显示在 DSH 中。

## 配置

默认服务列表为空。文档中的 `https://mcp.example.com/mcp` 仅为占位地址。

- 自动模式优先使用已配置的预注册身份，其次使用服务端支持的 CIMD，最后尝试 DCR。
- CIMD 文档需由客户端运营者托管在 HTTPS 地址；本插件不提供公共文档托管。
- 默认回调为 `http://127.0.0.1:6274/oauth/callback`，必须与客户端允许的回调一致。端口占用时不会自动换端口。
- 客户端密钥单独保存；编辑表单留空表示保留已有值。清除授权会删除包含密钥的本机授权记录。
- 高级设置默认：连接超时 30 秒、授权超时 5 分钟、工具总时限 10 分钟、提前 60 秒刷新、最多重连 5 次且间隔不超过 30 秒。

## 凭据与失败处理

服务配置保存在当前 profile 的 `mcp-oauth/servers.json`。授权信息通过 DSH 凭据服务保存，按 profile 的真实目录和服务标识区分。默认存储为本地文件，不是系统钥匙串。修改服务地址、客户端身份、权限范围或回调配置后需要重新授权。

停用保留凭据；清除授权断开连接并删除本机凭据；删除服务同时删除配置和凭据。这些操作不代表已在授权服务器撤销 token。卸载包保留持久化数据，如需清理，请先清除授权并删除服务。首版不支持多个 DSH 进程同时使用同一 profile。

刷新 token 不主动中断已受理的长调用。HTTP 401 最多触发一次 SDK 认证后重发；断线或超时不会自动重放工具调用。出现“结果未知”时，先核查服务端执行情况，再决定是否重试。

首版只支持本机 Web/Desktop，不支持远程回调、旧版 SSE/stdio、MCP Tasks、资源浏览和提示词浏览。

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
