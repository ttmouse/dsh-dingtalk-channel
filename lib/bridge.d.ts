/**
 * The bridge: authorization, deduplication, channel commands, session
 * acquisition, agent turns, event rendering, and chat-native approvals. Every
 * registration is owned by the bridge's Cordis fiber; disposal disconnects the
 * transport, disposes every agent this channel owns, and settles pending
 * approvals as `'cancelled'`.
 *
 * Architecture note: this bridge follows the dsh-lark-channel design
 * (BSD-3-Clause, omdsh-dev) — session ladder, event rendering, approval
 * waterfall — adapted to DingTalk's Stream-mode transport and chat replies.
 * @module dsh-dingtalk-channel/bridge
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from './config.js';
import type { InboundMessage } from './message.js';
import type { HostUserMessage } from './host.js';
import type { DingTalkTransport } from './transport.js';
/**
 * Create an identified user message from one chat input. Group messages carry
 * the sender so the model can tell voices apart; direct messages stay verbatim.
 * @param msg - normalized inbound chat message.
 * @returns a frozen user message for `agent.followup()`.
 */
export declare function chatUserMessage(msg: InboundMessage): HostUserMessage;
/** Decide whether a chat line answers a pending approval. */
/**
 * Install the bridge on a scoped plugin context.
 * @param ctx - scoped plugin context carrying the `agents` service.
 * @param config - resolved plugin configuration (credentials already present).
 * @param transport - the DingTalk transport; connected by this bridge's last effect.
 * @param notify - operator console line sink.
 * @param persistState - persist a managed-state patch through the host settings service.
 */
export declare function installBridge(ctx: Context, config: ResolvedConfig, transport: DingTalkTransport, notify: (line: string) => void, persistState?: (patch: object) => Promise<boolean>): void;
//# sourceMappingURL=bridge.d.ts.map