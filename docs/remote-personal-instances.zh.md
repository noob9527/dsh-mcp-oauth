# 远程个人实例

[English](remote-personal-instances.md)

远程回调需要尚未发布的 0.2.0-rc.1 或后续支持该功能的版本；npm 0.1.0 仅支持本机回调。在支持远程模式的版本发布前，请安装经过检查的 tarball 安装包。此模式无需修改官方 DSH。

如果无法配置回调代理，可使用[手动粘贴授权响应](manual-authorization.zh.md)。下述代理要求仅适用于远程自动回调。

## 部署要求

每位用户必须拥有独立的 DSH Host 进程、profile 目录和凭据存储。经过认证的 DSH Web 连接必须代表该实例的所有者。仅有不同的 URL 前缀不能证明实例已隔离。不支持多人共享 Host、单个实例运行多个副本或共享凭据文件。不要为了绕过访问失败而放宽插件仅允许所有者访问的 Remote API 策略。

使用固定的 HTTPS 回调地址，例如 `https://dsh.example.com/u/alice/oauth/mcp/callback`。管理员将这个精确路径转发到插件位于 `127.0.0.1:6274` 的 HTTP 回调接收器。代理必须与 DSH 进程运行在同一主机和网络命名空间中。在 Kubernetes 中，可以使用同一个 Pod 内的代理 sidecar；其他 Pod 无法访问此回环监听地址。插件不会监听所有网络接口。同一网络命名空间内的其他服务必须可信。

回调监听器仅在登录过程中运行。登录前或完成后访问回调地址返回 502 属于预期情况。同一个端口一次只能用于一项登录。同一主机网络中的独立进程需要使用不同端口；处于不同 Pod 网络命名空间中的实例可以复用相同端口。端口被占用时会报错，不会静默切换回调地址。

## 代理路由

以下 Nginx 配置片段应放入已有的 HTTPS 虚拟主机中，该虚拟主机须使用有效证书。配置保留完整路径，并显式传递配置中的外部 Host；它不会把 DSH 的应用路由开放为匿名访问。

```nginx
location = /u/alice/oauth/mcp/callback {
    proxy_pass http://127.0.0.1:6274;
    proxy_set_header Host dsh.example.com;
    proxy_set_header X-Forwarded-Host "";
    proxy_set_header X-Forwarded-Proto "";
    proxy_cache off;
    access_log off;
}
```

插件根据配置中的 HTTPS 回调 URL 校验 Host 和路径，不使用转发头推断外部地址。代理必须保留 OAuth 响应的查询参数。如果公网 URL 使用非默认端口，转发的 Host 也必须包含该端口。不要将用户专属路径改写成共享回调路径，也不要根据查询参数选择上游实例。共用的外层 Ingress 必须将每位用户的回调路由到正确的个人实例。

用户浏览器必须能够访问 HTTPS 回调地址，必要时需要连接 VPN。授权服务器负责获取 CIMD 文档，并不代替浏览器发起回调请求。回调接口可以不依赖 DSH Web 会话 Cookie：一次性 state 和 PKCE 将响应绑定到所有者发起的待完成登录。如果网关对回调请求执行登录认证，必须确保认证跳转前后保留 OAuth 响应查询参数。任何匿名访问例外都只能覆盖精确的回调路径，不能覆盖整个 DSH 实例。

每一层代理的访问日志、错误日志、链路追踪和分析记录都应排除 OAuth 回调查询参数、授权码和 state。示例仅关闭此回调路径的访问日志；其他诊断功能也需要配置为不记录原始请求。回调响应使用 `no-store`、`no-referrer` 和严格的内容安全策略，不加载第三方资源，也不回显响应参数。

## CIMD 文档与插件设置

托管一份授权服务器能够通过 HTTPS 获取的客户端元数据文档。每个实例使用独立文档，可以明确限定各自的回调列表。也可以共用文档，但必须在列表中维护每个精确的回调地址，不能使用通配符重定向 URL。

```json
{
  "client_id": "https://metadata.example.com/oauth/dsh/alice.json",
  "client_name": "DSH MCP OAuth",
  "redirect_uris": ["https://dsh.example.com/u/alice/oauth/mcp/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

进入 Plugins → Built-in plugin settings → OAuth MCP → 添加服务：

- 在“回调方式”中选择“远程个人实例”。
- 将“OAuth 回调 URL”设置为文档中完整、精确的公网 HTTPS 地址。
- 将“内部 loopback 监听端口”设置为代理上游使用的端口，例如 `6274`。
- 注册方式选择 CIMD，填写客户端元数据文档 URL；预注册客户端 ID 和密钥留空。
- 配置 MCP 服务地址和所需权限范围，保存后点击“登录”，在自己的浏览器中打开授权页面。

浏览器完成授权后跳转到远程回调地址。实例校验待处理的授权响应，使用内存中的 PKCE verifier 换取 token，将授权信息保存到凭据存储，再连接 MCP。回调页面只确认收到响应；使用工具前，需要在 DSH 中确认状态为“已授权”和“已连接”。Token 和 PKCE verifier 不会通过设置界面传递。

## 恢复与兼容性

错误的 state、重复参数、错误的 Host 或路径，以及重复提交的响应都会被拒绝。拒绝的回调不会为其他实例完成授权。取消、超时、停用、清除授权和插件关闭都会释放监听器。进程重启会丢弃待完成登录的 state 和 verifier，此时需要重新发起登录。已持久化的授权在身份绑定仍匹配时可以于重启后复用。修改外部回调 URL 需要重新授权；仅修改内部端口不会改变 OAuth 客户端身份。

旧服务配置默认使用本机模式。本机回调继续使用其 HTTP 回调 URL 中的端口；远程模式使用单独配置的内部端口，并要求专用的 HTTPS 路径。升级前请在仓库外备份 profile 配置：新回调字段保存后，旧插件的严格解析器无法读取这些字段。降级前必须恢复兼容的配置。

## 验证

自动化 HTTPS Ingress fixture 为每次运行生成证书，并由测试客户端显式信任对应 CA，不关闭 TLS 校验。测试覆盖 CIMD 文档获取、PKCE 换票、回调拒绝、取消与超时、刷新，以及重启后复用授权并执行 MCP 搜索。本地 fixture 通过不代表公司的 Ingress、所有者会话映射或真实授权服务器已经验收。部署前应通过真实 DSH 界面验证这些环节，并确认一个实例的回调无法完成另一个实例的登录。

实际部署 URL、包含内部主机名的 Ingress 配置、凭据和真实联调证据应保存在此公开仓库之外。本文示例仅使用保留域名。
