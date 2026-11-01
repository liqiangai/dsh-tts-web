# dsh-tts-web

为 [DeepSeek Harness](https://github.com/deepseek-ai) Web 增加**文本转语音（TTS）**能力：左侧栏多一个「语音朗读」入口，每条助手回复旁边多一个朗读按钮，让给出的内容可以真正"说出来"。

支持两家语音服务，面板里一键切换：

| 服务商 | 接口 | 能力 |
| --- | --- | --- |
| **MiniMax Speech** | `POST {origin}/v1/t2a_v2` | 官方 300+ 系统音色、MP3/WAV、语速/音量/音高、`language_boost` |
| **小米 MiMo TTS** | `POST {base}/chat/completions` | 预置音色（冰糖、茉莉、苏打、白桦、Mia、Chloe、Milo、Dean）与音色设计模型 |

> MiMo 一路的请求方式参照 [ppy-web/dsh-plugin-xiaomi-mimo-tts](https://github.com/ppy-web/dsh-plugin-xiaomi-mimo-tts)，本仓库独立实现并新增了 MiniMax 合成、左侧栏面板、逐条朗读与自动朗读。

## 功能

- **左侧栏入口**：`sidebar.panellist` 新增图标，点开是完整设置面板（服务商、Key、模型、音色、语速、格式、开关）。
- **逐条朗读**：每条助手消息的工具行上有一个小喇叭，再点一次停止。
- **自动朗读**：打开「自动朗读新回复」后，助手每完成一条回复即自动播报——只播最新一条、每条只播一次，且不会打断你手动朗读的内容。
- **朗读最新回复**：面板里一键朗读当前会话最后一条助手消息。
- **长文本**：按句子切成 ≤1800 字（`maxCharsPerRequest`）的片段顺序播放，一次停止可中断整段。
- **朗读历史**：最近 30 条可重播、可清空（只存文本与元数据，不存音频）。
- **Key 不落明文**：优先使用 DSH 凭据库/进程环境中的 Key，面板只显示"已配置"。

## 前置要求

- 一个可运行的 DeepSeek Harness（Web 界面），node ≥ 20。
- 一路语音服务的 API Key：MiniMax 或小米 MiMo（任选，也可两个都配）。

## 安装

```bash
git clone https://github.com/liqiangai/dsh-tts-web.git
```

然后在 DSH 会话里让 Agent 安装这个本地 bundle：

```
plugin_manager  action: install_bundle  target: <克隆目录的绝对路径>
```

返回 `application: applied` 后，左侧栏立即出现**语音朗读**图标（bundle 以 `link:` 方式接入，改代码后重新加载即生效）。卸载：`plugin_manager` 的 `remove_bundle`，`target` 传 `dsh-tts-web`。

## 配置 API Key

两种方式任选，**推荐第一种**：

1. **DSH 凭据（推荐）**
   面板里「环境变量名」填一个名字，例如 `MINIMAX_CN_API_KEY`。插件每次合成时通过 DSH 的
   `credentials` 服务解析（先查凭据库，再查进程环境），面板显示「已配置」。
   MiniMax 中国站的 Key 通常已经以这个名字存好，直接可用。
2. **直接填写**
   在面板的 API Key 输入框写入，保存在插件自己的设置文件里（本机 600 权限，仅当前用户可读）。

小米 MiMo 默认读取 `XIAOMI_MIMO_API_KEY`；`tp-` 开头的 Token Plan Key 会自动切换到
`https://token-plan-cn.xiaomimimo.com/v1`。

## 使用

1. 打开左侧栏 **语音朗读**。
2. 选服务商 → 填 Key 或环境变量名 → 选模型/音色/语速 → **保存**。
3. 下方文本框可直接试听（朗读 / 停止），或点「朗读最新回复」。
4. 回到对话：每条助手回复的工具行有朗读按钮；需要连续播报就打开**自动朗读**。

### 自动朗读的工作方式

开启后，插件在每条助手消息的工具行里监听会话状态：当**最新一条**回复已经写完（会话不再 running）且播放器空闲时，延迟 400ms 自动合成并播放；同一条消息只播一次，手动点过喇叭的消息不会再被自动播报。

两点必须知道的限制：

- **需要停留在对话页**：自动朗读由消息行驱动，切到「语音朗读」面板或别的面板时对话已卸载，不会触发。
- **浏览器自动播放策略**：没有用户手势时，浏览器可能拒绝播放（`NotAllowedError`）。此时消息行会提示「浏览器拦截了自动播放，点一下喇叭即可」，点一下即可播放；页面上任意一次点击之后，后续自动朗读通常都会放行。


## 工作原理

插件由两部分组成，一行 patch 同时激活：

| 半边 | 文件 | 职责 |
| --- | --- | --- |
| Host | `index.js`、`lib/*.js` | `/plugins/dsh-tts-web/*` 同源路由、服务商调用、设置存储、凭据解析 |
| Web Client | `client.js` | 侧栏图标、设置面板、逐条朗读、音频播放（`window.__ModuleLoader__` 懒加载工厂，无构建步骤） |

浏览器半只注册三个 slot：`sidebar.panellist`（入口）、`main`（面板）、`conversation.chat.assistant-actions`（逐条朗读）。样式只使用 `--dsw-alias-*` 主题变量，深浅色随宿主。内部协议见 [docs/CONTRACT.md](docs/CONTRACT.md)。

### 本机 HTTP 接口

前缀 `/plugins/dsh-tts-web`：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/config` | 设置 + 凭据状态 + 可选模型/音色（不返回 Key） |
| POST | `/config` | 局部更新设置（省略 `apiKey` 保留旧值，空串清除） |
| POST | `/speak` | `{ text, provider?, voiceId?, model?, speed?, format? }` → 音频字节流 |
| GET | `/voices?provider=minimax` | 实时音色目录（缓存 10 分钟，失败回退内置列表） |
| GET / DELETE | `/history` | 朗读历史 / 清空 |

`/speak` 错误码：`api-key-not-configured`、`api-key-rejected`、`voice-required`、`no-text`、
`text-too-long`、`rate-limited`、`provider-timeout`、`provider-error`、`audio-too-large`、
`invalid-request`、`network`、`origin-rejected`、`disabled`。
带 `Origin` 头的跨站请求会被拒绝，第三方网页无法借用你的 Key 合成语音。

### 设置文件

```
%USERPROFILE%\.dsh\plugin-data\dsh-tts-web\settings.json    # 默认位置
%DSH_PROFILE_DIR%\plugin-data\dsh-tts-web\settings.json     # 以 profile 启动且导出该变量时
```

原子写入、权限 600；删除即恢复默认。

## 验证

```bash
node scripts/verify.mjs                                  # 27 项：设置/文本/凭据 + 本机路由 + 真实网关
node scripts/test-client.mjs                             # 14 项：无浏览器渲染 + 自动朗读行为
node scripts/verify.mjs http://127.0.0.1:57573           # 也可以只指定网关地址
```

本仓库在当前开发机上**在线核对**过的事实：

- 三个 slot 全部注册并 active：`dsh-tts-web`（侧栏）、`dsh-tts-web`（主面板）、`dsh-tts-web-read`（消息按钮）；
- 网关 `POST /plugins/dsh-tts-web/speak` 用 DSH 凭据库里的 MiniMax Key 返回 72 KB MP3（4.4 秒），
  `GET /voices` 返回 303 个系统音色，设置读写与历史记录在真实进程中生效，Key 不出现在任何响应里。

**已知限制（如实记录）**：

- 小米 MiMo 一路按官方 chat-completions 语音格式实现，但开发机上没有 MiMo Key，**未做联网实测**；
- 浏览器端验证了语法、清单、在线 slot 注册，并用无头 harness 跑通了「自动朗读只触发一次 / 关闭后不触发」；
  **视觉呈现（配色/间距/明暗）与真实浏览器里的自动播放策略未经截图确认**。

## 更新记录

- **0.2.0**：接通「自动朗读」——最新一条回复完成且播放器空闲时自动播报（每条一次，不打断手动朗读），
  被浏览器自动播放策略拦截时在消息行给出可点击提示；新增 `scripts/test-client.mjs` 无头回归测试。
- **0.1.0**：首个版本，左侧栏入口 + 设置面板 + 逐条朗读 + 朗读最新回复 + 历史，
  Host 侧同源合成接口（MiniMax t2a_v2 / 小米 MiMo chat-completions）。

## 目录结构

```
index.js           Host 入口：注册路由、初始化设置存储
lib/routes.js      同源 HTTP 接口与请求校验
lib/settings.js    默认值、校验、原子持久化、历史
lib/minimax.js     MiniMax t2a_v2 合成 + 音色目录
lib/xiaomi.js      小米 MiMo chat-completions 语音
lib/text.js        Markdown → 适合朗读的纯文本
lib/credentials.js Key 解析（内联 / DSH 凭据 / 进程环境）
client.js          浏览器半：侧栏入口、面板、逐条朗读
locale/            插件展示元数据（标题/描述）
docs/CONTRACT.md   Host/Client 协议与 slot 契约
scripts/verify.mjs 开发期验证脚本（Host 路由 + 真实网关，不随包安装）
scripts/test-client.mjs 开发期无头客户端测试（slot 注册 + 自动朗读，不随包安装）
```

## 开发

无需构建、无需依赖：改完直接 `node --check index.js client.js lib/*.js`，重新加载插件即可。提交前跑 `node scripts/verify.mjs` 和 `node scripts/test-client.mjs`。

浏览器半的改动需要**刷新页面**（或重启 `dsh web`）才会加载新的模块代际。

## 许可

[MIT](LICENSE)。MiniMax、小米 MiMo 及相关音色名称归各自权利方所有；本项目与两家公司无隶属关系。
