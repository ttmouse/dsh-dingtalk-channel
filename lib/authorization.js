/**
 * Authorization: allowlists narrow who a deployment serves; the platform's
 * app visibility already decides who can reach the bot at all. Refusals stay
 * silent in the chat (answering would turn the bot into an oracle for who is
 * authorized) and are reported on the operator console instead.
 * @module dsh-dingtalk-channel/authorization
 */
/**
 * Resolve the authorization sets from configuration.
 * @param config - resolved plugin configuration.
 * @returns the resolved authorization.
 */
export function resolveAuthorization(config) {
    return {
        directSenders: new Set(config.senderAllowlist),
        groups: new Set(config.groupAllowlist),
        approvers: new Set(config.approvers),
    };
}
/**
 * Decide whether one inbound message may start a turn. The check runs before
 * anything else: a message here starts a shell-capable agent.
 * @param authorization - the resolved authorization.
 * @param config - resolved plugin configuration (mention policy).
 * @param msg - the normalized inbound message.
 * @returns a refusal reason, or undefined when the message is allowed.
 */
export function refuseMessage(authorization, config, msg) {
    void config;
    if (msg.isGroup) {
        if (authorization.groups.size > 0 && !authorization.groups.has(msg.chatId)) {
            return `group ${msg.chatId} is not served`;
        }
        // Mention policy is enforced by the platform: DingTalk only delivers group
        // messages to a bot when it was @-mentioned, so `requireMention` is
        // effectively always true there and needs no text-level gate (some
        // deliveries strip the mention text from the content).
        return undefined;
    }
    if (authorization.directSenders.size > 0 && !authorization.directSenders.has(msg.senderId)) {
        return `sender ${msg.senderId} is not served`;
    }
    return undefined;
}
/**
 * Decide whether a sender may answer one pending approval. With an empty
 * approver list, whoever may drive the chat may approve it too.
 * @param authorization - the resolved authorization.
 * @param senderId - the replying sender's staff id.
 * @param chatId - the chat the approval was published to.
 * @param approverChatId - the chat the pending approval belongs to.
 * @returns a refusal reason, or undefined when the sender may answer.
 */
export function refuseApproval(authorization, senderId, chatId, approverChatId) {
    if (chatId !== approverChatId)
        return 'approval answered from another chat';
    if (authorization.approvers.size > 0 && !authorization.approvers.has(senderId)) {
        return `sender ${senderId} is not an approver`;
    }
    return undefined;
}
//# sourceMappingURL=authorization.js.map