# dsh-dingtalk-channel

> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的钉钉 IM 机器人 channel——每条单聊/群聊背后都是一个真正带工具的 agent，消息即入口，回复回到对话里。

通过钉钉官方 **Stream 模式**（WebSocket 长连接）把钉钉「机器人」接入 dsh。不需要公网回调地址、不需要服务器配置 webhook，机器人私聊或群里 @ 它即可驱动完整 agent（带 bash、read、edit、skills 等工具，按 preset 挂载）。

> 架构沿袭 [dsh-lark-channel](https://github.com/omdsh-dev/dsh-lark)（BSD-3-Clause）的 channel 设计：窄宿主契约 + 传输层端口 + 会话爬梯 + 事件渲染。

## ✨ 特性

- 🤖 **一会话一 agent**——会话 id 由会话键确定性派生（`ding-<chatId>`），跨重启稳定；`sessionScope: chat-sender` 可让共享群里每人一个 agent
- ⚡ **即时反馈**——每条消息先回执「🤔 已收到」，再流式到达最终答案（钉钉无打字指示，回执是唯一即时反馈）
- 🤫 **静默过程**——中间过程只在回执/思考表情里暗示，agent 调用 bash/read/edit 等工具不发聊天消息，只把最终答案发成 markdown
- 🛡️ **访问策略**——单聊/群聊各自 `senderAllowlist` / `groupAllowlist`，群聊 `requireMention`；审批按聊天回复「允许一次 / 拒绝」结算
- 📡 **长连接自愈**——SDK 自动重连，断线事件落在操作台
- 💬 **命令**——`/ping` `/help` `/status` `/stop` `/new`，未知 `/` 命令下传给宿主 `commands` 运行时（有 `/compact` 等时可用）
- 🩺 **可观测**——拒绝/失败/断线全部 notify 到进程 stderr + 宿主日志

## 🚀 快速开始

### 1. 钉钉侧准备（一次性）

1. 打开 [钉钉开发者后台](https://open-dev.dingtalk.com)，创建**企业内部应用**，记下 **ClientID（AppKey）** 与 **ClientSecret（AppSecret）**。
2. 应用能力 → **添加应用能力 → 机器人**，完善机器人信息，**消息接收模式选 Stream 模式**，发布应用。
3. 把机器人拉进目标群（或让成员私聊它）。群聊中机器人默认只收到 @ 它的消息。

### 2. 安装插件

```sh
# 从 npm
dsh plugin --profile web add dsh-dingtalk-channel

# 或从 GitHub（自动构建）
dsh plugin --profile web add github:ttmouse/dsh-dingtalk-channel

# 或从源码/本地目录（先 npm install && npm run build 产出 lib/）
dsh plugin --profile web add /绝对路径/dsh-dingtalk-channel
```

### 3. 配置凭证

`~/.dsh/profiles/web/cordis.patch.yml` 里覆盖该行（也可用 `!!js process.env.…` 走环境变量）：

```yaml
- id: dingtalk-channel
  name: 'dsh-dingtalk-channel'
  config:
    clientId: !!js process.env.DINGTALK_CLIENT_ID
    clientSecret: !!js process.env.DINGTALK_CLIENT_SECRET
    botName: 我的助手        # 用于剥离群消息 @ 前缀（不配则剥离首个 @… 词元）
    # preset: standard      # 挂进会话 agent 的 preset（部署组合了 roster 时）
    # cwd: /path/to/workspace   # 默认宿主进程 cwd
    # sessionScope: chat    # chat-sender 让共享群里每人一个 agent
    # sendReceipt: true
    # emotion: true          # 消息上贴 🤔思考中 表情，回复完成自动撤回（替代文字回执）
    requireMention: true
```

```sh
export DINGTALK_CLIENT_ID='ding...'
export DINGTALK_CLIENT_SECRET='...'
dsh web
```

`dsh web` 启动日志里出现 `dsh-dingtalk-channel` 的凭证校验通过（无缺凭证告警）后，私聊机器人发 `/ping` 应收到 `pong`。

## ⚙️ 配置

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `clientId` / `clientSecret` | — | 钉钉应用凭证（必填） |
| `botName` | — | 机器人昵称；配置后只在群消息首个 @ 匹配时才剥离 |
| `cwd` | 宿主 cwd | 会话 agent 工作目录 |
| `workspaceRoots` | `[]` | `/cd` 可达目录前缀（空=任意） |
| `provider` / `model` | 宿主默认 | 会话 agent 模型路由 |
| `preset` | roster 默认 | 会话 agent 挂载的 preset |
| `sessionScope` | `chat` | `chat` / `chat-thread`(=chat) / `chat-sender` |
| `sendReceipt` | `true` | 每条消息先发回执（`emotion` 开启时被替代） |
| `emotion` | `true` | 消息上贴 🤔思考中 表情表示已读/处理中，回复完成自动撤回 |
| `denyTools` | `[ask_user_question, exit_plan_mode]` | 会话 agent 禁用的工具 |
| `requireMention` | `true` | 群聊仅被 @ 时响应 |
| `senderAllowlist` | `[]` | 单聊 staffId 白名单（空=应用可见范围内任何人） |
| `groupAllowlist` | `[]` | 群会话白名单（空=任何群） |
| `approvers` | `[]` | 可回答审批的 staffId（空=能驱动该会话的人） |

## 💬 命令

| 命令 | 作用 |
| --- | --- |
| `/ping` | 连通性检查 |
| `/help` | 列出命令 |
| `/status` | 会话/目录/模型/运行状态 |
| `/stop` | 取消当前生成 |
| `/new` | 开启新会话（历史保留） |

## 🧠 审批

agent 需要批准时（`approval/request`），channel 在对话里发审批消息，回复「允许一次」放行一次、「拒绝」取消；abort 时结算为取消。默认 `denyTools` 已禁用 `ask_user_question` / `exit_plan_mode`（答案到不了本渠道的人类交互工具），模型会被引导直接在回复里提问。

## ⚠️ 已知限制

- **钉钉无思考过程/打字机卡片**：本 channel 故意不在聊天里发工具调用过程消息，只发最终答案（回执/思考表情作为唯一的即时反馈），比飞书原生 CoT 朴素。
- **图片/文件暂不转发**：`attachImages` 未实现（钉钉图片需先下载，v0.1 不做）。
- **无扫码注册**：凭证必须在开发者后台创建（钉钉无公开的扫码建应用流程）。
- **无 `/cd` / `/model use` / `/ws`**：工作区切换与模型热切换 v0.1 未实现（配置层字段已预留）。
- 群消息去 @：`botName` 配置后只在首个 @ 匹配时剥离；不配置则剥离首个 `@…` 词元。
- 审批与轮次并发：宿主 agent 自带排队；本 channel 每个会话最多一个待决审批。

## 🔐 权限说明

- **chat agent 与宿主会话同权限**：能执行 bash、读写文件（read/edit/write）、git、网络与技能（skills）——凡是你本地 `dsh` 会话能做的，聊天里都能做。请把机器人只加进可信的人/群。
- **访问收窄（只收窄不兜底）**：`senderAllowlist` 限单聊发送者、`groupAllowlist` 限群会话、`approvers` 限审批人；最终以钉钉应用的**可见范围**为准。
- **默认禁用** `ask_user_question` / `exit_plan_mode`（答案到不了本渠道的人类交互工具），审批改为对话内回复「允许一次 / 拒绝」。

## 🔌 关闭方式

- **停用**：从 profile 的 `dsh.profile.bundles` 移除 `dsh-dingtalk-channel`，重启 `dsh web` 即不再连接钉钉。
- **卸载**：`dsh plugin --profile web rm dsh-dingtalk-channel`（或 `pnpm remove dsh-dingtalk-channel`），重启。
- **彻底下线**：钉钉开发者后台删除该应用/机器人。

## 📄 许可证

MIT —— 见 [LICENSE](./LICENSE)。

## 开发

```sh
npm install
npm run typecheck   # tsc --noEmit
npm run build       # tsc → lib/
npm test            # vitest
```
