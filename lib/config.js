/**
 * Serializable configuration, schema, and direct-call defaults for the
 * DingTalk channel. Mirrors the lark-channel configuration surface so a
 * deployment moving between IM backends keeps the same mental model.
 * @module dsh-dingtalk-channel/config
 */
import z from '@deepseek-ai/schemastery';
/**
 * Human-interaction tools whose answer cannot reach a chat: both ask through
 * `ctx.userQuestions`, whose single provider belongs to whichever UI registered
 * it first. Denied per chat agent so the model asks in the chat instead — a
 * reply is an ordinary message this bridge turns into the next turn.
 */
const DEFAULT_DENY_TOOLS = ['ask_user_question', 'exit_plan_mode'];
/** Loader-visible configuration schema and defaults. */
export const Config = z.object({
    clientId: z.string(),
    clientSecret: z.string().role('secret'),
    botName: z.string(),
    cwd: z.string(),
    workspaceRoots: z.array(String),
    chatWorkspaces: z.dict(String).default({}),
    chatModels: z.dict(String).default({}),
    provider: z.string(),
    model: z.string(),
    preset: z.string(),
    sessionScope: z.union(['chat', 'chat-thread', 'chat-sender']).default('chat'),
    sendReceipt: z.boolean().default(true),
    emotion: z.boolean().default(true),
    denyTools: z.array(String).default([...DEFAULT_DENY_TOOLS]),
    requireMention: z.boolean().default(true),
    senderAllowlist: z.array(String),
    groupAllowlist: z.array(String),
    approvers: z.array(String),
});
/**
 * Resolve the same defaults for direct callers that bypass Cordis Loader.
 * @param config - Serialized configuration with the required credentials.
 * @returns Configuration with all schema defaults applied.
 */
export function resolveConfig(config) {
    return {
        ...config,
        workspaceRoots: config.workspaceRoots ?? [],
        chatWorkspaces: config.chatWorkspaces ?? {},
        chatModels: config.chatModels ?? {},
        sessionScope: config.sessionScope ?? 'chat',
        sendReceipt: config.sendReceipt ?? true,
        emotion: config.emotion ?? true,
        denyTools: config.denyTools ?? [...DEFAULT_DENY_TOOLS],
        requireMention: config.requireMention ?? true,
        senderAllowlist: config.senderAllowlist ?? [],
        groupAllowlist: config.groupAllowlist ?? [],
        approvers: config.approvers ?? [],
    };
}
//# sourceMappingURL=config.js.map