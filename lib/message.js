/**
 * DingTalk transport message shapes: normalization of the Stream-mode robot
 * message payload into the channel's own inbound message, and the narrow port
 * the bridge uses to send replies back through the session webhook.
 * @module dsh-dingtalk-channel/message
 */
/**
 * Normalize one raw robot message. Group-chat deliveries always address the
 * bot (the platform only forwards mentioned messages), so a leading `@…`
 * token is stripped; when `botName` is configured the first token must match
 * it before being stripped, so an @ of someone else stays visible to the model.
 * @param raw - the raw Stream-mode payload.
 * @param botName - the bot's configured display name, when known.
 * @returns the normalized inbound message.
 */
export function normalizeMessage(raw, botName) {
    const isGroup = raw.conversationType === '2';
    const content = raw.text?.content ?? '';
    const mention = /^@(\S+)/.exec(content);
    const atBot = mention !== null;
    let text = content;
    if (isGroup && mention !== null) {
        const [token, name] = mention;
        const strip = botName === undefined || botName === '' || name === botName;
        if (strip)
            text = content.slice(token.length).trimStart();
    }
    return {
        chatId: raw.conversationId,
        senderId: raw.senderId,
        senderNick: raw.senderNick,
        messageId: raw.msgId,
        text,
        isGroup,
        atBot,
        sessionWebhook: raw.sessionWebhook,
    };
}
/** One failed send, summarized for the operator. */
export function failureDetail(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=message.js.map