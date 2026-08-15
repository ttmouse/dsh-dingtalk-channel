/**
 * Narrow local contracts for the DSH host services and events this plugin
 * consumes. Keeping these structural copies (instead of importing host source
 * packages) lets the package build self-contained; a composed DSH profile
 * supplies the real implementations at runtime. Field shapes mirror
 * `@deepseek-ai/dsh-agent` and `@deepseek-ai/dsh-session` as of dsh
 * 0.1.0-rc.6.
 *
 * Architecture note: this channel follows the dsh-lark-channel design
 * (BSD-3-Clause, omdsh-dev) — a narrow host contract plus a transport port —
 * adapted to the DingTalk Stream-mode API.
 * @module dsh-dingtalk-channel/host
 */
import type { Context } from '@deepseek-ai/cordis';
/** The live session a host agent drives; only the identity is read here. */
export interface HostSession {
    /** The session id shared by the agent registry and session log. */
    readonly id: string;
}
/** One model-facing content block this plugin produces. */
export type HostContentBlock = {
    readonly type: 'text';
    readonly text: string;
};
/** A user-role message accepted by {@link HostAgent.followup}. */
export interface HostUserMessage {
    /** Stable message identity; a fresh UUID per message. */
    readonly id: string;
    readonly role: 'user';
    /** Model-facing content blocks: the chat's text. */
    readonly content: readonly HostContentBlock[];
    /** Producer tag: chat input is a direct human prompt. */
    readonly source: {
        readonly kind: 'user';
    };
}
/** Public live-agent handle (subset of the host `Agent` interface). */
export interface HostAgent {
    /** The single identity shared with {@link session}. */
    readonly id: string;
    readonly session: HostSession;
    /** Queue an ordinary follow-up turn and wake the driver. */
    followup(message: HostUserMessage): void;
    /**
     * Clear queued work and abort the active turn. A no-op when nothing is
     * active, so a chat may offer it unconditionally.
     */
    cancel(cause: string): void;
}
/** An owned agent plus its teardown capability, from `agents.create()`. */
export interface HostAgentHandle {
    readonly agent: HostAgent;
    dispose(): Promise<void>;
}
/** Per-agent provider/model routing accepted by {@link HostAgentRegistry.create}. */
export interface HostAgentOptions {
    readonly provider?: string | undefined;
    readonly model?: string | undefined;
}
/** The `agents` registry service (subset of the host `AgentRegistry`). */
export interface HostAgentRegistry {
    /**
     * The live agent published on one session id, if any owner has one.
     * @param sessionId - the branded session id.
     * @returns the live agent, or undefined when nothing runs on that id.
     */
    get(sessionId: string): HostAgent | undefined;
    /**
     * Reopen a persisted session as a live agent, replaying its history.
     * @throws when no session is stored under the id, or its log cannot be read.
     */
    resume(options: {
        readonly resumeSessionId: string;
        readonly agentOptions?: HostAgentOptions;
        readonly setup?: (agentCtx: Context) => Promise<void>;
    }): Promise<HostAgentHandle>;
    /**
     * Create a fresh agent on this id. The `setup` callback composes the agent's
     * scoped world (preset mounting, tool guards, prompt sections) and is
     * awaited before the session and agent are published; a rejection rolls the
     * whole creation back.
     */
    create(options: {
        readonly sessionId: string;
        readonly meta?: {
            readonly cwd?: string;
            readonly agentPreset?: string;
        };
        readonly agentOptions?: HostAgentOptions;
        readonly setup?: (agentCtx: Context) => Promise<void>;
    }): Promise<HostAgentHandle>;
}
/** The `tools` registry, as this plugin's per-agent composition uses it. */
export interface HostTools {
    /**
     * Register a monotonic execution guard. Registered through an agent's scoped
     * context it applies to that agent alone; returning a string denies the call
     * with that reason, and no other guard can force-allow what one denied.
     */
    guard(guard: (execution: {
        readonly name: string;
    }) => string | undefined): () => void;
}
/** One command this deployment offers, from {@link HostCommands.list}. */
export interface HostCommandDescriptor {
    /** Lowercase name without the leading slash. */
    readonly name: string;
    /** Human-readable summary used in discovery surfaces. */
    readonly description: string;
}
/** One settled command execution (subset of the host `CommandExecution`). */
export interface HostCommandExecution {
    readonly result: {
        readonly kind: 'success';
        readonly text?: string;
    } | {
        readonly kind: 'error';
        readonly text: string;
    };
}
/**
 * The `commands` runtime: slash commands dispatched WITHOUT a model turn,
 * which is why a chat must route them here instead of letting the model read a
 * literal `/clear` as prose.
 */
export interface HostCommands {
    /** Commands available to one agent, for discovery. */
    list(agent: HostAgent): readonly HostCommandDescriptor[];
    /**
     * Run one complete slash-command line. Resolves `undefined` when the syntax
     * or the name does not resolve, distinguishing an unknown command from one
     * that ran and failed.
     */
    execute(agent: HostAgent, line: string, signal: AbortSignal): Promise<HostCommandExecution | undefined>;
}
/** The `systemPrompt` assembler, as this plugin's per-agent composition uses it. */
export interface HostSystemPrompt {
    /**
     * Register one ordered prompt section in the calling context's scope layer.
     * Tool guidance uses orders 100–199; a duplicate name throws.
     */
    section(section: {
        name: string;
        order: number;
        text: string;
    }): () => void;
}
/** The `agentPresets` roster (subset of the host `AgentPresets`). */
export interface HostAgentPresets {
    /**
     * Resolve a preset id, or the roster default when absent.
     * @throws when the roster supplies no such preset.
     */
    resolve(id?: string): Promise<{
        readonly id: string;
    }>;
    /**
     * Join one agent's scope to a preset's standing composition. Call from the
     * agent factory's `setup(agentCtx)`.
     */
    mount(agentCtx: Context, id?: string): Promise<unknown>;
}
/** The `agentDefaultModel` service (subset of `AgentDefaultModelConfig`). */
export interface HostDefaultModel {
    /** The deployment's current default provider/model selection. */
    currentSelection(): HostAgentOptions;
}
/** The Cordis loader service; awaited so agents never see a half-composed tree. */
export interface HostLoader {
    await(): Promise<unknown>;
}
/** One registered namespace's owner scope (subset of the host `SettingsScope`). */
export interface HostSettingsScope {
    /** The resolved value: schema defaults, then composition base, then the user document. */
    get(): unknown;
    /** Deep-merge a patch into the user section and persist it through the provider. */
    update(patch: object): Promise<unknown>;
}
/** The `settings` user-settings service (subset of `SettingsProvider`). */
export interface HostSettings {
    /**
     * Register a namespace schema; the registration is an effect on the calling
     * fiber. Duplicate namespaces and stored sections the schema rejects fail loud.
     */
    register(ns: string, schema: unknown, options?: {
        base?: unknown;
    }): HostSettingsScope;
}
/** One immutable entry in the host session log; narrowed via the guards below. */
export interface HostSessionEvent {
    readonly type: string;
    readonly data: unknown;
}
/** The `assistant/message` payload fields this plugin renders. */
export interface AssistantMessageData {
    readonly turn: number;
    readonly message: {
        readonly content: readonly {
            readonly type: string;
            readonly text?: string;
        }[];
    };
}
/** The `turn/end` payload fields this plugin reports. */
export interface TurnEndData {
    readonly turn: number;
    readonly reason: {
        readonly kind: string;
        readonly error?: {
            readonly code?: string;
            readonly message?: string;
        };
    };
}
/** The `step/start` payload fields this plugin uses to mark a turn active. */
export interface StepStartData {
    readonly turn: number;
    readonly step: number;
}
/** The `tool/result` payload fields a thinking process reports. */
export interface ToolResultData {
    readonly turn: number;
    readonly message: {
        readonly source?: {
            readonly callId?: string;
        };
        readonly content: readonly {
            readonly type: string;
            readonly toolCallId?: string;
            readonly content?: readonly {
                readonly type: string;
                readonly text?: string;
            }[];
        }[];
    };
    readonly error?: {
        readonly name: string;
        readonly code: string;
    };
}
/** The `tool/call` payload fields this plugin surfaces as activity. */
export interface ToolCallData {
    readonly turn: number;
    readonly callId: string;
    readonly name: string;
    /** Raw arguments JSON exactly as the model produced it (unparsed, untrusted). */
    readonly arguments: string;
}
/**
 * Narrow a session event to the assembled assistant message for one step.
 * @param event - any session event.
 * @returns whether `event.data` carries {@link AssistantMessageData}.
 */
export declare function isAssistantMessageEvent(event: HostSessionEvent): event is HostSessionEvent & {
    readonly data: AssistantMessageData;
};
/**
 * Narrow a session event to a closed turn boundary.
 * @param event - any session event.
 * @returns whether `event.data` carries {@link TurnEndData}.
 */
export declare function isTurnEndEvent(event: HostSessionEvent): event is HostSessionEvent & {
    readonly data: TurnEndData;
};
/**
 * Narrow a session event to the opening of one step.
 * @param event - any session event.
 * @returns whether `event.data` carries {@link StepStartData}.
 */
export declare function isStepStartEvent(event: HostSessionEvent): event is HostSessionEvent & {
    readonly data: StepStartData;
};
/**
 * Narrow a session event to one completed tool call's result.
 * @param event - any session event.
 * @returns whether `event.data` carries {@link ToolResultData}.
 */
export declare function isToolResultEvent(event: HostSessionEvent): event is HostSessionEvent & {
    readonly data: ToolResultData;
};
/**
 * Narrow a session event to one model-requested tool invocation.
 * @param event - any session event.
 * @returns whether `event.data` carries {@link ToolCallData}.
 */
export declare function isToolCallEvent(event: HostSessionEvent): event is HostSessionEvent & {
    readonly data: ToolCallData;
};
/**
 * Join the text blocks of a committed assistant message.
 * @param data - the committed message payload.
 * @returns the concatenated text, empty when the step produced none.
 */
export declare function assistantText(data: AssistantMessageData): string;
/**
 * Render a failed turn's reason as one operator-readable line.
 * @param data - the closed turn payload.
 * @returns the error detail, empty when the turn did not fail.
 */
export declare function turnErrorDetail(data: TurnEndData): string;
/** Closed outcome of a host approval question; `'allowed-once'` is the only grant. */
export type HostApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
/** Readonly same-process permission question (subset of `ApprovalRequest`). */
export interface HostApprovalRequest {
    /** The agent on whose behalf the question is asked; routes the question. */
    readonly agent: HostAgent;
    /** The tool the question is about (presentation and audit). */
    readonly toolName: string;
    /** The exact tool call being decided, when the asker has one. */
    readonly callId?: string;
    /** The asker's human-readable explanation of WHY it is asking. */
    readonly reason?: string;
    /** Aborting withdraws the question; a late answer is discarded. */
    readonly signal?: AbortSignal;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The host agent registry; required via `inject`. */
        agents: HostAgentRegistry;
    }
    interface Events {
        /** Durable session facts broadcast by the host session store. */
        'session/event'(session: HostSession, event: HostSessionEvent): void;
        /** Waterfall permission question; answer only for owned agents, else delegate via `next()`. */
        'approval/request'(request: HostApprovalRequest, next: () => Promise<HostApprovalOutcome>): Promise<HostApprovalOutcome>;
    }
}
//# sourceMappingURL=host.d.ts.map