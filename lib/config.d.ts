/**
 * Serializable configuration, schema, and direct-call defaults for the
 * DingTalk channel. Mirrors the lark-channel configuration surface so a
 * deployment moving between IM backends keeps the same mental model.
 * @module dsh-dingtalk-channel/config
 */
import z from '@deepseek-ai/schemastery';
import type { SessionScope } from './session.js';
/** Plugin configuration supplied by the profile composition. */
export interface Config {
    /** DingTalk app key (ClientID, `ding…`); required. */
    clientId?: string;
    /** DingTalk app secret (ClientSecret) paired with {@link clientId}. */
    clientSecret?: string;
    /**
     * The bot's display name, used to strip the platform's `@机器人` mention
     * prefix from group-chat messages. Optional: when absent, a leading `@…`
     * token is stripped from group messages instead.
     */
    botName?: string;
    /** Absolute workspace directory for chat-driven agents; defaults to the host process cwd. */
    cwd?: string;
    /**
     * Directory prefixes `/cd` may point a conversation at; empty allows any
     * existing directory. Narrows where chat users may aim the agent; the
     * platform already decides who can reach the bot at all.
     */
    workspaceRoots?: string[];
    /**
     * Managed state, not configuration: the workspace each conversation was
     * `/cd`-ed to, keyed by conversation id, written back through the settings
     * service. An empty-string value marks "explicitly the default".
     */
    chatWorkspaces?: Record<string, string>;
    /**
     * Managed state, not configuration: the `provider/model` route each
     * conversation asked for via `/model use`, keyed by conversation id.
     */
    chatModels?: Record<string, string>;
    /** Provider route override for chat agents; defaults to the host `agentDefaultModel` selection. */
    provider?: string;
    /** Model id override for chat agents; defaults to the host `agentDefaultModel` selection. */
    model?: string;
    /**
     * Agent preset chat agents join, when the deployment composes a roster.
     * Absent joins the roster default. A deployment WITH a roster keeps every
     * model-facing row on the agent plane, so joining nothing would reach the
     * model with no tools at all.
     */
    preset?: string;
    /**
     * Which conversation facet owns one agent session. The session id is derived
     * from that facet alone, so a restarted process reaches the conversation's
     * stored session instead of starting it over. DingTalk has no topic threads,
     * so `chat-thread` behaves as `chat`; `chat-sender` gives each person in a
     * shared chat their own agent.
     */
    sessionScope?: SessionScope;
    /**
     * Acknowledge every accepted message with a short receipt before the turn
     * runs. DingTalk offers no typing indicator for bots, so the receipt is the
     * only immediate feedback a chat gets.
     */
    sendReceipt?: boolean;
    /**
     * Attach a 🤔 thinking emoji to every accepted message and recall it when
     * the turn completes — the platform's typing indicator for bots. When on,
     * it replaces the text receipt.
     */
    emotion?: boolean;
    /** Tools chat agents may not call, denied per agent at execution. */
    denyTools?: string[];
    /**
     * In group chats, only respond when the bot is @-mentioned. DingTalk only
     * delivers group messages to a bot when it is mentioned, so this is
     * effectively always true on the platform; kept for parity and clarity.
     */
    requireMention?: boolean;
    /** Staff ids (`…`) allowed to send direct messages, when narrowing further. Empty serves anyone who can reach the bot. */
    senderAllowlist?: string[];
    /** When non-empty, only these group conversation ids (`cid…`) are served. Empty serves any group the bot is added to. */
    groupAllowlist?: string[];
    /**
     * Staff ids allowed to answer approval questions. Empty lets whoever may
     * drive that chat answer it too. Set this when an escalation should need a
     * named human.
     */
    approvers?: string[];
}
/** Configuration after defaults have been resolved. */
export interface ResolvedConfig {
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    botName?: string | undefined;
    cwd?: string | undefined;
    workspaceRoots: string[];
    chatWorkspaces: Record<string, string>;
    chatModels: Record<string, string>;
    provider?: string | undefined;
    model?: string | undefined;
    preset?: string | undefined;
    sessionScope: SessionScope;
    sendReceipt: boolean;
    emotion: boolean;
    denyTools: string[];
    requireMention: boolean;
    senderAllowlist: string[];
    groupAllowlist: string[];
    approvers: string[];
}
/** Loader-visible configuration schema and defaults. */
export declare const Config: z<Config>;
/**
 * Resolve the same defaults for direct callers that bypass Cordis Loader.
 * @param config - Serialized configuration with the required credentials.
 * @returns Configuration with all schema defaults applied.
 */
export declare function resolveConfig(config: Config): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map