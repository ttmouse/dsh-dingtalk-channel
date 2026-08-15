/**
 * DingTalk Stream-mode transport: owns the `dingtalk-stream` DWClient
 * long connection, normalizes robot messages for the bridge, and replies
 * through each conversation's session webhook with a cached access token.
 * @module dsh-dingtalk-channel/transport
 */
import { DWClient, EventAck, TOPIC_ROBOT } from 'dingtalk-stream';
import { normalizeMessage, failureDetail } from './message.js';
/** Base URL for DingTalk OpenAPI v1.0 endpoints. */
const OPEN_API = 'https://api.dingtalk.com';
/** The emoji the bot attaches to a message it is about to process. */
const THINKING_EMOTION = '🤔思考中';
/**
 * Build the payload for {@link DingTalkPort.addEmotion} /
 * {@link DingTalkPort.recallEmotion}. `robotCode` is the app key: the
 * platform merged robots into applications, so the client id is the code.
 * @param robotCode - the app key (`ding…`).
 * @param chatId - the conversation id the message lives in.
 * @param messageId - the user message's open id.
 * @returns the JSON body the emotion endpoints accept.
 */
export function emotionBody(robotCode, chatId, messageId) {
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
    };
}
/**
 * Build the reply body for one message kind.
 * @param kind - the DingTalk message kind.
 * @param title - markdown card title; text messages ignore it.
 * @param body - the message body.
 * @returns the JSON-serializable payload for the session webhook.
 */
function replyBody(kind, title, body) {
    if (kind === 'markdown') {
        return { msgtype: 'markdown', markdown: { title, text: body } };
    }
    return { msgtype: 'text', text: { content: body } };
}
/**
 * Create the DingTalk transport behind the bridge's port surface.
 * @param options - credentials and the operator line sink.
 * @returns the transport, connected asynchronously via {@link DingTalkTransport.start}.
 */
export function createDingTalkTransport(options) {
    const client = new DWClient({
        clientId: options.clientId,
        clientSecret: options.clientSecret,
    });
    let token;
    let disposed = false;
    let handler = () => { };
    /**
     * The current access token, refreshed through the SDK when stale or absent.
     * @returns a bearer value for `x-acs-dingtalk-access-token`.
     */
    async function accessToken() {
        const now = Date.now();
        if (token !== undefined && token.expiresAt > now)
            return token.token;
        // The SDK resolves the token directly (a plain string), not an envelope.
        const value = await client.getAccessToken();
        if (typeof value !== 'string' || value === '') {
            throw new Error('dsh-dingtalk-channel: the platform returned no access token');
        }
        // Standard token TTL is 7200s; refresh slightly early.
        token = { token: value, expiresAt: now + 7200_000 - 60_000 };
        return value;
    }
    /**
     * Deliver one reply through a conversation's session webhook.
     * @param webhook - the conversation's current webhook.
     * @param kind - text or markdown.
     * @param title - markdown card title.
     * @param body - the message body.
     */
    async function deliver(webhook, kind, title, body) {
        const response = await fetch(webhook, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-acs-dingtalk-access-token': await accessToken(),
            },
            body: JSON.stringify(replyBody(kind, title, body)),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`dsh-dingtalk-channel: send failed (${response.status}): ${text.slice(0, 300)}`);
        }
    }
    /**
     * Attach or remove the 🤔 thinking emoji on a user message. Best-effort:
     * the caller swallows failures so the signal never blocks a turn.
     * @param chatId - the conversation id the message lives in.
     * @param messageId - the user message's open id.
     * @param action - `reply` attaches, `recall` removes.
     */
    async function emotion(chatId, messageId, action) {
        const response = await fetch(`${OPEN_API}/v1.0/robot/emotion/${action}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-acs-dingtalk-access-token': await accessToken(),
            },
            body: JSON.stringify(emotionBody(options.clientId, chatId, messageId)),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`dsh-dingtalk-channel: emotion ${action} failed (${response.status}): ${text.slice(0, 200)}`);
        }
    }
    client.registerCallbackListener(TOPIC_ROBOT, (res) => {
        let msg;
        try {
            msg = normalizeMessage(JSON.parse(res.data), options.botName);
        }
        catch (error) {
            options.notify(`dsh-dingtalk-channel: dropping unparsable robot message: ${failureDetail(error)}`);
        }
        if (msg !== undefined)
            handler(msg);
        // Acknowledge every delivery immediately; the handler deduplicates by
        // message id, and agent turns run asynchronously after the ack. The ack
        // value is opaque — an empty object stands for "received, do not retry".
        client.socketCallBackResponse(res.headers.messageId, {});
    });
    client.registerAllEventListener(() => ({ status: EventAck.SUCCESS }));
    return {
        async start() {
            await client.connect();
        },
        setHandler(next) {
            handler = next;
        },
        async sendText(chatId, webhook, text) {
            void chatId;
            await deliver(webhook, 'text', '', text);
        },
        async sendMarkdown(chatId, webhook, title, markdown) {
            void chatId;
            await deliver(webhook, 'markdown', title, markdown);
        },
        async addEmotion(chatId, messageId) {
            await emotion(chatId, messageId, 'reply');
        },
        async recallEmotion(chatId, messageId) {
            await emotion(chatId, messageId, 'recall');
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            client.disconnect();
        },
    };
}
//# sourceMappingURL=transport.js.map