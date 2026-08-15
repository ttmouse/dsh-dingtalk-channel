/**
 * Chat-native approval replies: decide whether a chat line answers a pending
 * approval question, and which way.
 * @module dsh-dingtalk-channel/approval-reply
 */
/**
 * Decide whether a chat line answers a pending approval.
 * @param text - the inbound message text.
 * @returns `'allow'`, `'reject'`, or undefined when the line is not an answer.
 */
export declare function matchApprovalDecision(text: string): 'allow' | 'reject' | undefined;
//# sourceMappingURL=approval-reply.d.ts.map