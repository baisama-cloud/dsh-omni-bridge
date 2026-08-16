# dsh-omni-bridge

Multi-channel message bridge for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) (DSH): route **WeChat (ClawBot/iLink)**, **QQ**, and **Feishu (Lark)** chat messages to a DSH agent, and relay the agent's replies back to the sender.

多通道桥接插件：把微信 ClawBot / QQ / 飞书的消息接入 DSH agent，并把回复回传给发消息的人。

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

当前以 **DSH 动态 Cordis 插件**形式提供（通过 `cordis_define` / `cordis_run` 加载，进程级，DSH 重启会清空）：

- `host.js` —— host 半区：三个通道的收发 + 会话桥接 + 定时轮询。
- `client.js` —— client 半区：设置页（微信/QQ/飞书三张卡片）。
- `feishu-ws.cjs` —— 飞书长连接子进程（由 host 用 `node` 拉起）。

## 依赖

飞书长连接依赖官方 SDK：

```bash
npm install @larksuiteoapi/node-sdk
```

`feishu-ws.cjs` 通过 `require('@larksuiteoapi/node-sdk')` 加载 SDK；请确保 SDK 安装在一个能从该脚本目录向上解析到 `node_modules` 的位置。脚本内也内置了一个绝对路径回退（`D:/Document/DSH/工作区/node_modules/...`），实际部署时请按需改成你自己的路径。

## 配置

配置文件位于 `~/.dsh/omni-bridge-config.json`：

```json
{
  "runtime": { "provider": "deepseek-official", "model": "deepseek-v4-flash" },
  "channels": {
    "weixin": { "enabled": true, "botToken": "...", "defaultTarget": "" },
    "qq":      { "enabled": true, "appId": "...", "secret": "..." },
    "feishu":  { "enabled": true, "appId": "cli_...", "appSecret": "...", "requireMention": true }
  }
}
```

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

## 使用（动态插件）

在 DSH 中通过动态 Cordis 插件工具加载：

- `cordis_define`（kind `existing` 追加 Package，**host + client 必须同时提交**）→ `cordis_run`（`update`）。
- 加载后设置页出现「远程桥接」卡片。

## 已知限制

- 动态插件是进程级的，DSH 重启后需重新加载。
- host 使用动态插件特有的 `harness.handle(...)` 做前后端通信；若要做成持久化 bundle（`dsh` profile bundle），需改用 bundle 的 host-client RPC 机制。
- 飞书被动回复有时效（收到消息后有限时间内回复）。

## License

MIT
