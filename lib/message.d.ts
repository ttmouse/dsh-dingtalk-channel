/**
 * DingTalk transport message shapes: normalization of the Stream-mode robot
 * message payload into the channel's own inbound message, and the narrow port
 * the bridge uses to send replies back through the session webhook.
 * @module dsh-dingtalk-channel/message
 */
/**
 * The message fields this channel reads from a Stream-mode robot message
 * (the payload of `res.data` on topic `/v1.0/im/bot/messages/get`), as
 * documented by the official `dingtalk-stream` SDK.
 */
export interface DingTalkRobotMessage {
    /** Conversation id: `cid…` for groups, a staff-id-like value for single chats. */
    readonly conversationId: string;
    /** '1' = single chat, '2' = group chat. */
    readonly conversationType: string;
    /** Stable message id, used for deduplication. */
    readonly msgId: string;
    /** The sending staff's user id. */
    readonly senderId: string;
    /** Display name of the sender. */
    readonly senderNick: string;
    /** Per-conversation reply webhook; the address replies go to. */
    readonly sessionWebhook: string;
    /** Message kind discriminator; this channel handles `text` today. */
    readonly msgtype: string;
    readonly text?: {
        readonly content?: string;
    };
}
/** The channel's normalized inbound chat message. */
export interface InboundMessage {
    /** Conversation id the message belongs to. */
    readonly chatId: string;
    /** Sender staff id. */
    readonly senderId: string;
    /** Sender display name. */
    readonly senderNick: string;
    /** Stable message id, for deduplication. */
    readonly messageId: string;
    /** Message text with the leading group @mention stripped. */
    readonly text: string;
    /** True when the message came from a group chat. */
    readonly isGroup: boolean;
    /** Whether the message addressed the bot with an @mention. */
    readonly atBot: boolean;
    /** The conversation's current reply webhook. */
    readonly sessionWebhook: string;
}
/**
 * Normalize one raw robot message. Group-chat deliveries always address the
 * bot (the platform only forwards mentioned messages), so a leading `@…`
 * token is stripped; when `botName` is configured the first token must match
 * it before being stripped, so an @ of someone else stays visible to the model.
 * @param raw - the raw Stream-mode payload.
 * @param botName - the bot's configured display name, when known.
 * @returns the normalized inbound message.
 */
export declare function normalizeMessage(raw: DingTalkRobotMessage, botName?: string): InboundMessage;
/** One reply sent to a conversation through its session webhook. */
export interface DingTalkPort {
    /**
     * Send a plain-text message.
     * @param chatId - conversation id (webhook key).
     * @param webhook - the conversation's session webhook.
     * @param text - the message body.
     */
    sendText(chatId: string, webhook: string, text: string): Promise<void>;
    /**
     * Send a markdown message.
     * @param chatId - conversation id (webhook key).
     * @param webhook - the conversation's session webhook.
     * @param title - the markdown card title shown on notification.
     * @param markdown - the markdown body.
     */
    sendMarkdown(chatId: string, webhook: string, title: string, markdown: string): Promise<void>;
    /**
     * Attach the 🤔 thinking emoji to a user message, the bot's "received,
     * processing" signal. Errors are tolerated by the caller; the signal must
     * never block the turn.
     * @param chatId - the conversation id the message lives in.
     * @param messageId - the user message's open id.
     */
    addEmotion(chatId: string, messageId: string): Promise<void>;
    /**
     * Remove the 🤔 thinking emoji added by {@link DingTalkPort.addEmotion}.
     * @param chatId - the conversation id the message lives in.
     * @param messageId - the user message's open id.
     */
    recallEmotion(chatId: string, messageId: string): Promise<void>;
    /** Tear the transport down; further sends are rejected. */
    dispose(): void;
}
/** One failed send, summarized for the operator. */
export declare function failureDetail(error: unknown): string;
//# sourceMappingURL=message.d.ts.map