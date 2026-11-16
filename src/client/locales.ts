/** Locale-owned configuration and action labels. */
export const en = {
  title: 'OAuth MCP', description: 'Connect local DSH to OAuth-protected MCP tools.',
  add: 'Add service', edit: 'Edit', save: 'Save', discard: 'Cancel', login: 'Sign in', cancel: 'Cancel sign-in',
  reconnect: 'Reconnect', clear: 'Clear authorization', remove: 'Delete', enable: 'Enable', disable: 'Disable',
  open: 'Open authorization page', empty: 'No services configured.', loading: 'Loading…',
  failed: 'The operation failed. Check the service configuration and try again.',
  id: 'Service ID', label: 'Display name', url: 'MCP URL', mode: 'Registration mode',
  clientId: 'Client ID', metadataUrl: 'Client metadata document URL', redirectUrl: 'Loopback callback URL',
  scope: 'Scopes', secret: 'Client secret (blank keeps existing value)',
  advanced: 'Advanced', connectTimeoutMs: 'Connection timeout (ms)', authTimeoutMs: 'Sign-in timeout (ms)',
  toolTimeoutMs: 'Tool deadline (ms)', refreshSkewMs: 'Refresh lead time (ms)', reconnectAttempts: 'Reconnect attempts',
  reconnectMaxDelayMs: 'Maximum reconnect delay (ms)', auto: 'Automatic', cimd: 'CIMD', preregistered: 'Pre-registered', dcr: 'Dynamic registration',
  required: 'Sign-in required', authorizing: 'Waiting for authorization', authorized: 'Authorized',
  disabled: 'Disabled', disconnected: 'Disconnected', connecting: 'Connecting', connected: 'Connected', connectionFailed: 'Connection failed',
  tools: 'Tools', invalid: 'Check the highlighted configuration values. HTTPS is required except on loopback.',
  local: 'Local use only: open the authorization link on the computer running DSH.',
  deleteConfirm: 'Delete this service and its local authorization?', clearConfirm: 'Clear the local authorization and disconnect this service?',
} as const
export type Key = keyof typeof en
export const zh: Record<Key, string> = {
  title: 'OAuth MCP', description: '在本机 DSH 中连接需要 OAuth 授权的 MCP 工具。',
  add: '添加服务', edit: '编辑', save: '保存', discard: '取消', login: '登录', cancel: '取消登录',
  reconnect: '重新连接', clear: '清除授权', remove: '删除', enable: '启用', disable: '停用',
  open: '打开授权页面', empty: '尚未配置服务。', loading: '加载中…', failed: '操作失败，请检查服务配置后重试。',
  id: '服务标识', label: '显示名称', url: 'MCP URL', mode: '注册方式', clientId: '客户端 ID', metadataUrl: '客户端元数据文档 URL',
  redirectUrl: '本机回调 URL', scope: '权限范围', secret: '客户端密钥（留空保留原值）', advanced: '高级设置',
  connectTimeoutMs: '连接超时（毫秒）', authTimeoutMs: '登录超时（毫秒）', toolTimeoutMs: '工具调用时限（毫秒）',
  refreshSkewMs: '提前刷新时间（毫秒）', reconnectAttempts: '重连次数', reconnectMaxDelayMs: '最大重连间隔（毫秒）',
  auto: '自动', cimd: 'CIMD', preregistered: '预注册', dcr: '动态注册', required: '需要登录', authorizing: '等待授权', authorized: '已授权',
  disabled: '已停用', disconnected: '未连接', connecting: '连接中', connected: '已连接', connectionFailed: '连接失败', tools: '工具数',
  invalid: '请检查配置字段；除本机地址外必须使用 HTTPS。', local: '仅支持本机使用：请在运行 DSH 的电脑上打开授权链接。',
  deleteConfirm: '删除此服务及其本机授权？', clearConfirm: '清除本机授权并断开此服务？',
}
