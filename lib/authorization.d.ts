/**
 * Authorization: allowlists narrow who a deployment serves; the platform's
 * app visibility already decides who can reach the bot at all. Refusals stay
 * silent in the chat (answering would turn the bot into an oracle for who is
 * authorized) and are reported on the operator console instead.
 * @module dsh-dingtalk-channel/authorization
 */
import type { InboundMessage } from './message.js';
import type { ResolvedConfig } from './config.js';
/** Resolved authorization decisions, derived once from configuration. */
export interface Authorization {
    /** Staff ids allowed to send direct messages; empty = anyone who can DM the bot. */
    readonly directSenders: ReadonlySet<string>;
    /** Group conversation ids served; empty = any group the bot is added to. */
    readonly groups: ReadonlySet<string>;
    /** Staff ids allowed to answer approval questions; empty = whoever drives the chat. */
    readonly approvers: ReadonlySet<string>;
}
/**
 * Resolve the authorization sets from configuration.
 * @param config - resolved plugin configuration.
 * @returns the resolved authorization.
 */
export declare function resolveAuthorization(config: ResolvedConfig): Authorization;
/**
 * Decide whether one inbound message may start a turn. The check runs before
 * anything else: a message here starts a shell-capable agent.
 * @param authorization - the resolved authorization.
 * @param config - resolved plugin configuration (mention policy).
 * @param msg - the normalized inbound message.
 * @returns a refusal reason, or undefined when the message is allowed.
 */
export declare function refuseMessage(authorization: Authorization, config: ResolvedConfig, msg: InboundMessage): string | undefined;
/**
 * Decide whether a sender may answer one pending approval. With an empty
 * approver list, whoever may drive the chat may approve it too.
 * @param authorization - the resolved authorization.
 * @param senderId - the replying sender's staff id.
 * @param chatId - the chat the approval was published to.
 * @param approverChatId - the chat the pending approval belongs to.
 * @returns a refusal reason, or undefined when the sender may answer.
 */
export declare function refuseApproval(authorization: Authorization, senderId: string, chatId: string, approverChatId: string): string | undefined;
//# sourceMappingURL=authorization.d.ts.map