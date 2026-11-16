# DSH MCP OAuth

为未经修改的官方 DeepSeek Harness 提供 OAuth MCP 工具接入。插件自行管理 MCP 连接，通过官方工具、凭据、授权及插件页面接口集成。

[English](README.md)

## 安装与登录

首个目标版本为 DSH **0.2.2-rc.2**，Node **24.9+**。其他版本尚未声明兼容。使用本机 npm 配置接入私有 registry，不要提交 registry 凭据。

```sh
dsh plugin --profile web add dsh-mcp-oauth@0.1.0
```

Desktop 请通过其插件页面安装；它与 Web 使用不同 profile。DSH 提示需要重启时，重启后继续。

进入“插件 → OAuth MCP”，添加服务、保存并点击“登录”，随后打开授权页面。浏览器必须运行在 DSH 所在的电脑上。回调页只确认已收到授权响应；最终授权状态和工具连接状态分别显示在 DSH 中。

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
pnpm install --ignore-scripts
pnpm run typecheck
pnpm test
pnpm run build
pnpm pack
pnpm exec tsx tests/serve-fixture.ts
```

本地测试服务提供确定性搜索、延迟返回和调用计数。CIMD 测试启动独立 HTTPS 文档服务，授权服务器在同意授权前实际抓取并校验客户端身份和回调地址。OpenSSL 为每次测试生成临时证书，仅测试授权服务器显式信任，TLS 校验保持开启。运行 `pnpm exec tsx tests/serve-cimd.ts` 可进行浏览器验收；这不代表验证了公网托管或第三方授权服务器。官方客户端验收步骤和已完成项目见 [验收说明](docs/acceptance.md)。

私有发布前需配置 registry 和发布凭据，运行测试及打包。当前无 scope 的包名要求私有 registry 支持此类包；若使用 npmjs 私有包，需要组织 scope 并同步修改包与模块标识。项目不内置 registry 或业务服务信息。
