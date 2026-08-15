/**
 * DingTalk Stream-mode transport: owns the `dingtalk-stream` DWClient
 * long connection, normalizes robot messages for the bridge, and replies
 * through each conversation's session webhook with a cached access token.
 * @module dsh-dingtalk-channel/transport
 */

import { DWClient, EventAck, TOPIC_ROBOT, type RobotMessage } from 'dingtalk-stream'
import { normalizeMessage, failureDetail, type DingTalkPort, type InboundMessage } from './message.js'

/** One cached access token and the instant it expires. */
interface TokenCache {
  token: string
  expiresAt: number
}

/** Base URL for DingTalk OpenAPI v1.0 endpoints. */
const OPEN_API = 'https://api.dingtalk.com'

/** The emoji the bot attaches to a message it is about to process. */
const THINKING_EMOTION = '🤔思考中'

/** Request body for the robot emotion reply/recall endpoints. */
export interface EmotionBody {
  robotCode: string
  openMsgId: string
  openConversationId: string
  emotionType: number
  emotionName: string
  textEmotion: {
    emotionId: string
    emotionName: string
    text: string
    backgroundId: string
  }
}

/**
 * Build the payload for {@link DingTalkPort.addEmotion} /
 * {@link DingTalkPort.recallEmotion}. `robotCode` is the app key: the
 * platform merged robots into applications, so the client id is the code.
 * @param robotCode - the app key (`ding…`).
 * @param chatId - the conversation id the message lives in.
 * @param messageId - the user message's open id.
 * @returns the JSON body the emotion endpoints accept.
 */
export function emotionBody(robotCode: string, chatId: string, messageId: string): EmotionBody {
  return {
    robotCode,
    openMsgId: messageId,
    openConversationId: chatId,
    emotionType: 2,
    emotionName: THINKING_EMOTION,
    textEmotion: {
      emotionId: '2659900',
      emotionName: THINKING_EMOTION,
      text: THINKING_EMOTION,
      backgroundId: 'im_bg_1',
    },
  }
}

/**
 * Build the reply body for one message kind.
 * @param kind - the DingTalk message kind.
 * @param title - markdown card title; text messages ignore it.
 * @param body - the message body.
 * @returns the JSON-serializable payload for the session webhook.
 */
function replyBody(kind: 'text' | 'markdown', title: string, body: string): Record<string, unknown> {
  if (kind === 'markdown') {
    return { msgtype: 'markdown', markdown: { title, text: body } }
  }
  return { msgtype: 'text', text: { content: body } }
}

/** Options for {@link createDingTalkTransport}. */
export interface DingTalkTransportOptions {
  /** DingTalk app key (ClientID). */
  readonly clientId: string
  /** DingTalk app secret (ClientSecret). */
  readonly clientSecret: string
  /** The bot's display name, for @mention stripping in groups. */
  readonly botName?: string
  /** Operator-facing report line sink. */
  readonly notify: (line: string) => void
}

/**
 * The DingTalk transport behind the bridge's port surface: a {@link DingTalkPort}
 * plus the connection lifecycle and the inbound message feed.
 */
export interface DingTalkTransport extends DingTalkPort {
  /** Open the long connection; resolves once the client is connected. */
  start(): Promise<void>
  /**
   * Install the inbound message handler. Must be set before {@link start} so
   * no early event is dropped; the transport acks every delivery immediately
   * and the handler is responsible for deduplication.
   */
  setHandler(handler: (msg: InboundMessage) => void): void
}

/**
 * Create the DingTalk transport behind the bridge's port surface.
 * @param options - credentials and the operator line sink.
 * @returns the transport, connected asynchronously via {@link DingTalkTransport.start}.
 */
export function createDingTalkTransport(options: DingTalkTransportOptions): DingTalkTransport {
  const client = new DWClient({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
  })
  let token: TokenCache | undefined
  let disposed = false
  let handler: (msg: InboundMessage) => void = () => {}

  /**
   * The current access token, refreshed through the SDK when stale or absent.
   * @returns a bearer value for `x-acs-dingtalk-access-token`.
   */
  async function accessToken(): Promise<string> {
    const now = Date.now()
    if (token !== undefined && token.expiresAt > now) return token.token
    // The SDK resolves the token directly (a plain string), not an envelope.
    const value = await client.getAccessToken()
    if (typeof value !== 'string' || value === '') {
      throw new Error('dsh-dingtalk-channel: the platform returned no access token')
    }
    // Standard token TTL is 7200s; refresh slightly early.
    token = { token: value, expiresAt: now + 7200_000 - 60_000 }
    return value
  }

  /**
   * Deliver one reply through a conversation's session webhook.
   * @param webhook - the conversation's current webhook.
   * @param kind - text or markdown.
   * @param title - markdown card title.
   * @param body - the message body.
   */
  async function deliver(webhook: string, kind: 'text' | 'markdown', title: string, body: string): Promise<void> {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-acs-dingtalk-access-token': await accessToken(),
      },
      body: JSON.stringify(replyBody(kind, title, body)),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`dsh-dingtalk-channel: send failed (${response.status}): ${text.slice(0, 300)}`)
    }
  }

  /**
   * Attach or remove the 🤔 thinking emoji on a user message. Best-effort:
   * the caller swallows failures so the signal never blocks a turn.
   * @param chatId - the conversation id the message lives in.
   * @param messageId - the user message's open id.
   * @param action - `reply` attaches, `recall` removes.
   */
  async function emotion(chatId: string, messageId: string, action: 'reply' | 'recall'): Promise<void> {
    const response = await fetch(`${OPEN_API}/v1.0/robot/emotion/${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-acs-dingtalk-access-token': await accessToken(),
      },
      body: JSON.stringify(emotionBody(options.clientId, chatId, messageId)),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`dsh-dingtalk-channel: emotion ${action} failed (${response.status}): ${text.slice(0, 200)}`)
    }
  }

  client.registerCallbackListener(TOPIC_ROBOT, (res: { headers: { messageId: string }; data: string }) => {
    let msg: InboundMessage | undefined
    try {
      msg = normalizeMessage(JSON.parse(res.data) as RobotMessage, options.botName)
    } catch (error) {
      options.notify(`dsh-dingtalk-channel: dropping unparsable robot message: ${failureDetail(error)}`)
    }
    if (msg !== undefined) handler(msg)
    // Acknowledge every delivery immediately; the handler deduplicates by
    // message id, and agent turns run asynchronously after the ack. The ack
    // value is opaque — an empty object stands for "received, do not retry".
    client.socketCallBackResponse(res.headers.messageId, {})
  })
  client.registerAllEventListener(() => ({ status: EventAck.SUCCESS }))

  return {
    async start(): Promise<void> {
      await client.connect()
    },
    setHandler(next: (msg: InboundMessage) => void): void {
      handler = next
    },
    async sendText(chatId: string, webhook: string, text: string): Promise<void> {
      void chatId
      await deliver(webhook, 'text', '', text)
    },
    async sendMarkdown(chatId: string, webhook: string, title: string, markdown: string): Promise<void> {
      void chatId
      await deliver(webhook, 'markdown', title, markdown)
    },
    async addEmotion(chatId: string, messageId: string): Promise<void> {
      await emotion(chatId, messageId, 'reply')
    },
    async recallEmotion(chatId: string, messageId: string): Promise<void> {
      await emotion(chatId, messageId, 'recall')
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      client.disconnect()
    },
  }
}
