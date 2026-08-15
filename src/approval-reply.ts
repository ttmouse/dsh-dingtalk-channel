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
export function matchApprovalDecision(text: string): 'allow' | 'reject' | undefined {
  const t = text.trim().toLowerCase()
  if (t.length > 12) return undefined
  if (/^(允许一次|允许|同意|批准|approve|allow|yes|y)$/.test(t)) return 'allow'
  if (/^(拒绝|不同意|取消|reject|deny|no|n)$/.test(t)) return 'reject'
  return undefined
}
