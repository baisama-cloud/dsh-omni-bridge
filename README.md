# dsh-omni-bridge

Multi-channel message bridge for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) (DSH): route **WeChat (ClawBot/iLink)**, **QQ**, and **Feishu (Lark)** chat messages to a DSH agent, and relay the agent's replies back to the sender.

多通道桥接插件：把微信 ClawBot / QQ / 飞书的消息接入 DSH agent，并把回复回传给发消息的人。
远程操控Agent。
 
## Channels

| 通道 | 收消息 | 发消息 | 凭据 |
|------|--------|--------|------|
| 微信 ClawBot | iLink 拉模式 (`/ilink/bot/getupdates`) | `/ilink/bot/sendmessage`（带 `client_id` + `base_info` + 回传 `context_token`） | `botToken`（扫码登录） |
| QQ | 官方网关 WebSocket（长连接） | `POST /v2/users|groups/{openid}/messages`（被动消息带 `msg_id`） | `appId` + `secret` |
| 飞书 | 官方 SDK 长连接（`@larksuiteoapi/node-sdk`，订阅 `im.message.receive_v1`） | `tenant_access_token` + `im/v1/messages` | `appId` + `appSecret` |

- 微信/QQ：**无默认 openid** —— 谁发消息就回谁；群内 @机器人 就回群里（被动消息）。
- 飞书：群内默认需 @机器人 才回复（`requireMention`），私聊始终回复。
- 每个通道一个独立 DSH 会话（`omni-bridge-<channel>`），回复去重用 `sessionPersistence.readFrom` 水位（持久化 seq），解决「只有第一条回复」的问题。

## 形式说明

当前以 **DSH 持久化 bundle** 形式提供（host + client 打包进 profile，跨 DSH 重启生效）：

- `lib/index.js` —— host 半区：三个通道的收发 + 会话桥接 + 定时轮询，通过 `webServer` 路由对外提供 RPC（`/omni-bridge/*`）。
- `lib/client.js` —— client 半区：设置页（微信/QQ/飞书三张卡片），通过 `fetch` 调用 host 路由。
- `lib/feishu-ws.cjs` —— 飞书长连接子进程（由 host 用 `node` 拉起）。

## 安装（bundle）

**方式一：从 npm 安装（推荐）**

```bash
# 在 profile（如 ~/.dsh/profiles/web）目录执行
pnpm add dsh-omni-bridge
```

然后在 profile 的 `package.json` 的 `dsh.profile.bundles` 追加 `"dsh-omni-bridge"`，重启 DSH 生效。

**方式二：本地 tgz 安装**

1. `npm pack` 打包成 tgz（或直接用仓库目录）。
2. 在 profile（如 `~/.dsh/profiles/web`）的 `package.json`：
   - `dsh.profile.bundles` 追加 `"dsh-omni-bridge"`；
   - `dependencies` 追加 `"dsh-omni-bridge": "file:<tgz 路径>"`。
3. 在 profile 目录执行 `pnpm install`（会自动安装 `@larksuiteoapi/node-sdk` 依赖）。
4. 重启 DSH（bundle 层在启动时组合，需重启生效）。

## 依赖

飞书长连接依赖官方 SDK，由 bundle 的 `dependencies` 自动安装：

```bash
pnpm add @larksuiteoapi/node-sdk   # 或随 bundle 一起 pnpm install
```

`lib/feishu-ws.cjs` 通过 `require('@larksuiteoapi/node-sdk')` 加载 SDK，Node 从该脚本所在目录向上解析到 profile 的 `node_modules`。

## 配置

配置文件位于 `~/.dsh/omni-bridge-config.json`（写入时权限为 `0600`，目录 `0700`）：

```json
{
  "runtime": { "provider": "deepseek-official", "model": "deepseek-v4-flash" },
  "channels": {
    "weixin": { "enabled": true, "botToken": "...", "defaultTarget": "", "allowedUsers": [], "allowAll": false },
    "qq":      { "enabled": true, "appId": "...", "secret": "...", "allowedUsers": [], "allowAll": false },
    "feishu":  { "enabled": true, "appId": "cli_...", "appSecret": "...", "requireMention": true, "allowedUsers": [], "allowAll": false }
  }
}
```

### 发送者白名单（安全默认）

每个频道默认**拒绝所有入站消息**（`allowAll: false` 且 `allowedUsers` 为空时无人可用）。运营者二选一显式放行：

- `allowedUsers`: 允许的发送者 ID 数组。微信用 `from_user_id`（如 `xxx@im.wechat`），QQ 单聊/群聊用成员 `openid`，飞书用 `sender_open_id`。未授权消息会收到一条「未授权」提示，并在 host 日志打印 `[bridge] unauthorized <channel> sender=<id>`（可用它找到自己的 ID）。
- `allowAll: true`: 允许所有人（显式选择开放，不建议生产使用）。

设置页每个通道卡片也提供「允许的用户 ID（逗号分隔）」与「允许所有人」开关。

### 微信

1. 在设置页点「获取二维码」→ 手机扫码登录，自动回填 `botToken`。
2. `defaultTarget` 留空则回复私信者。

### QQ

1. [QQ 开放平台](https://bot.qq.com) 建机器人，拿 `appId` / `secret`。
2. 订阅「单聊消息」「群聊@消息」事件、开启被动消息权限。
3. 私信即回该用户；群里 @机器人 即回该用户。

### 飞书

1. [飞书开放平台](https://open.feishu.cn) 建「自建应用」，拿 App ID / App Secret。
2. 权限管理：添加 `im:message`（含 `im:message.group_at_msg`、`im:message.p2p_msg`、`im:message:send_as_bot`）。
3. 事件与回调：订阅方式选「使用长连接接收事件」，事件订阅添加 `im.message.receive_v1`。
4. 版本管理与发布：**创建版本并发布**（不发布权限和订阅不生效）。
5. 机器人加入会话/群。

## 使用

安装并重启后，设置页出现「远程桥接」卡片（微信/QQ/飞书三张配置卡）。

## 已知限制

- 飞书被动回复有时效（收到消息后有限时间内回复）。
- `weixin-qr` / `weixin-poll` 使用 iLink 扫码登录流程，`botToken` 会写入 `~/.dsh/omni-bridge-config.json`。

## License

MIT
