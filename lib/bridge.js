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
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { failureDetail } from './message.js';
import { ConversationSessions, conversationKey } from './session.js';
import { isStepStartEvent, isToolCallEvent, isTurnEndEvent } from './host.js';
import { CHAT_COMMANDS, parseCommand } from './commands.js';
import { matchApprovalDecision } from './approval-reply.js';
import { resolveAuthorization, refuseApproval, refuseMessage } from './authorization.js';
import { createChatRenderer } from './renderer.js';
/** How long a seen message id is remembered, mirroring the platform's retry horizon. */
const DEDUP_WINDOW_MS = 30 * 60 * 1000;
/** How many seen ids are kept before the oldest are pruned. */
const DEDUP_MAX_IDS = 2000;
/** How much of a tool's arguments an approval prompt may carry. */
const APPROVAL_ARGS_MAX_CHARS = 800;
/**
 * Bound one untrusted value to what an approval prompt may carry.
 * @param text - raw tool arguments as the model produced them.
 * @returns the value, ellipsized when it exceeds the prompt's budget.
 */
function boundArgs(text) {
    return text.length <= APPROVAL_ARGS_MAX_CHARS
        ? text
        : `${text.slice(0, APPROVAL_ARGS_MAX_CHARS - 1)}…`;
}
/**
 * Compose the parts of a chat agent's world this channel owns: the tools it
 * must not call, and the prompt sentence that tells the model what to do
 * instead. Both registrations are scoped to this one agent.
 * @param agentCtx - the agent's scope context, inside creation `setup`.
 * @param config - resolved plugin configuration.
 */
function composeChatAgent(agentCtx, config) {
    if (config.denyTools.length === 0)
        return;
    const denied = new Set(config.denyTools);
    agentCtx.get('tools')?.guard(execution => denied.has(execution.name)
        ? `${execution.name} is unavailable in this chat channel: its answer would surface on a `
            + 'different interface. Ask the user directly in your reply instead, and continue when they answer.'
        : undefined);
    const prompt = agentCtx.get('systemPrompt');
    prompt?.section({
        name: 'dingtalk-channel:interaction',
        order: 150,
        text: 'You are talking to the user in a chat. To ask a question or seek approval for a plan, '
            + 'write it in your reply — their next message is the answer. '
            + `These tools are unavailable here: ${[...denied].join(', ')}.`,
    });
}
/**
 * Create an identified user message from one chat input. Group messages carry
 * the sender so the model can tell voices apart; direct messages stay verbatim.
 * @param msg - normalized inbound chat message.
 * @returns a frozen user message for `agent.followup()`.
 */
export function chatUserMessage(msg) {
    const spoken = msg.isGroup
        ? `${msg.senderNick || msg.senderId}: ${msg.text}`
        : msg.text;
    return Object.freeze({
        id: randomUUID(),
        role: 'user',
        content: Object.freeze([{ type: 'text', text: spoken }]),
        source: Object.freeze({ kind: 'user' }),
    });
}
/** Decide whether a chat line answers a pending approval. */
/**
 * Install the bridge on a scoped plugin context.
 * @param ctx - scoped plugin context carrying the `agents` service.
 * @param config - resolved plugin configuration (credentials already present).
 * @param transport - the DingTalk transport; connected by this bridge's last effect.
 * @param notify - operator console line sink.
 * @param persistState - persist a managed-state patch through the host settings service.
 */
export function installBridge(ctx, config, transport, notify, persistState = async () => false) {
    void persistState;
    /** Renderer binding per live session id. */
    const bySession = new Map();
    /** Reply webhook per chat, refreshed on every inbound message. */
    const webhooks = new Map();
    /** The chat each live session serves, for approval routing. */
    const chatBySession = new Map();
    /** Pending chat approvals by id. */
    const pendingApprovals = new Map();
    /** Tool-call arguments by call id, for the approval prompt. */
    const pendingCallArguments = new Map();
    /** Whether each live session is inside a turn right now, for `/status`. */
    const runningBySession = new Map();
    // The user message whose 🤔 emoji is currently attached, per session; the
    // turn-end hook recalls it once the reply lands.
    const emotionBySession = new Map();
    /** Seen message ids, for deduplication across the ack/redelivery horizon. */
    const seenMessages = new Map();
    /** Model route per session id, from `/model use`. */
    const routeBySession = new Map();
    const defaultCwd = resolve(config.cwd ?? process.cwd());
    /** The resolved authorization; derived once from configuration. */
    const authorization = resolveAuthorization(config);
    const rememberMessage = (messageId) => {
        const now = Date.now();
        if (seenMessages.size >= DEDUP_MAX_IDS) {
            for (const [id, at] of seenMessages) {
                if (now - at > DEDUP_WINDOW_MS)
                    seenMessages.delete(id);
            }
            if (seenMessages.size >= DEDUP_MAX_IDS) {
                const oldest = [...seenMessages.entries()].sort((a, b) => a[1] - b[1]).slice(0, DEDUP_MAX_IDS / 4);
                for (const [id] of oldest)
                    seenMessages.delete(id);
            }
        }
        seenMessages.set(messageId, now);
    };
    // Operator-facing, so it goes to the process stream as well as the logger:
    // a silently swallowed outbound failure is indistinguishable from a hung chat.
    const reportSendFailure = (error) => {
        const detail = failureDetail(error);
        notify(`dsh-dingtalk-channel: outbound send failed: ${detail}`);
        ctx.logger.warn('outbound send failed: %s', detail);
    };
    /** Resolve the provider/model for a new chat agent; config overrides the host default. */
    const modelSelection = () => {
        if (config.provider !== undefined || config.model !== undefined) {
            return { provider: config.provider, model: config.model };
        }
        const defaults = ctx.get('agentDefaultModel');
        if (defaults === undefined) {
            throw new Error('dsh-dingtalk-channel: no model configured — set config.provider/model or compose the agentDefaultModel service');
        }
        return defaults.currentSelection();
    };
    /** The deployment default's display form; `/status` must not throw where creation may. */
    const deploymentRoute = () => {
        try {
            const route = modelSelection();
            return route.provider === undefined && route.model === undefined
                ? '未配置'
                : [route.provider, route.model].filter(Boolean).join('/');
        }
        catch {
            return '未配置';
        }
    };
    const composeAgent = async () => {
        // Loader siblings mount concurrently; await the complete application so a
        // first message arriving during boot never sees a half-composed agent world.
        await ctx.get('loader')?.await();
        const presets = ctx.get('agentPresets');
        const presetId = presets === undefined ? undefined : (await presets.resolve(config.preset)).id;
        return {
            setup: async (agentCtx) => {
                if (presets !== undefined && presetId !== undefined)
                    await presets.mount(agentCtx, presetId);
                composeChatAgent(agentCtx, config);
            },
        };
    };
    /** One composition per session id, shared by the resume attempt and the create that follows it. */
    const compositions = new Map();
    const compositionFor = (sessionId) => {
        let pending = compositions.get(sessionId);
        if (pending === undefined) {
            pending = composeAgent();
            compositions.set(sessionId, pending);
            // A rejected composition is not replayed: the next message may arrive
            // after the roster it named was fixed.
            pending.catch(() => { compositions.delete(sessionId); });
        }
        return pending;
    };
    const sessionIdForKey = (key) => {
        const id = `ding-${key}`;
        const route = config.chatModels[key];
        if (route === undefined || route === '')
            routeBySession.delete(id);
        else
            routeBySession.set(id, splitRoute(route));
        return id;
    };
    const ladder = {
        lookup: (sessionId) => {
            const agent = ctx.agents.get(sessionId);
            // An agent another owner published is theirs to dispose.
            return agent === undefined ? undefined : { agent, dispose: () => Promise.resolve() };
        },
        resume: async (sessionId) => {
            const composition = await compositionFor(sessionId);
            return ctx.agents.resume({
                resumeSessionId: sessionId,
                agentOptions: routeBySession.get(sessionId) ?? modelSelection(),
                setup: composition.setup,
            });
        },
        create: async (sessionId) => {
            const composition = await compositionFor(sessionId);
            const presetId = config.preset;
            return ctx.agents.create({
                sessionId,
                meta: {
                    cwd: defaultCwd,
                    ...presetId === undefined ? {} : { agentPreset: presetId },
                },
                agentOptions: routeBySession.get(sessionId) ?? modelSelection(),
                setup: composition.setup,
            });
        },
        // A rejected resume is the registry's only existence probe, and an
        // unreadable session log looks exactly like a chat nobody ever messaged, so
        // the ladder's handled failures are reported rather than swallowed.
        report: (line) => { ctx.logger.info(line); },
    };
    const sessions = new ConversationSessions(config.sessionScope, ladder, sessionIdForKey);
    /** Resolve the reply webhook for a chat, or undefined before any inbound message. */
    const webhookFor = (chatId) => webhooks.get(chatId);
    const sendMarkdown = async (chatId, text) => {
        const webhook = webhookFor(chatId);
        if (webhook === undefined)
            throw new Error('no reply webhook cached for this conversation');
        await transport.sendMarkdown(chatId, webhook, '助手', text);
    };
    const sendText = async (chatId, text) => {
        const webhook = webhookFor(chatId);
        if (webhook === undefined)
            throw new Error('no reply webhook cached for this conversation');
        await transport.sendText(chatId, webhook, text);
    };
    /** Aborts in-flight host command executions when this bridge unwinds. */
    const commands = new AbortController();
    ctx.effect(() => () => { commands.abort(); }, 'ding:commands');
    const commandSignal = () => commands.signal;
    /** Run a non-channel command line through the host `commands` runtime. */
    const runHostCommandLine = async (command, agent) => {
        const hosted = ctx.get('commands');
        if (hosted === undefined)
            return `未知命令 /${command.name}（/help 查看可用命令）`;
        const known = hosted.list(agent).some(descriptor => descriptor.name === command.name);
        if (!known)
            return `未知命令 /${command.name}（/help 查看可用命令）`;
        const outcome = await hosted.execute(agent, `/${command.name} ${command.args}`.trim(), commandSignal());
        if (outcome === undefined)
            return `未知命令 /${command.name}`;
        return outcome.result.kind === 'success'
            ? outcome.result.text ?? ''
            : `⚠️ ${outcome.result.text}`;
    };
    /** Settle one pending approval and confirm in its chat. */
    const settleApproval = (id, outcome, decidedBy) => {
        const pending = pendingApprovals.get(id);
        if (pending === undefined)
            return false;
        pendingApprovals.delete(id);
        pending.settle(outcome);
        const by = decidedBy === undefined ? '' : `（${decidedBy}）`;
        if (outcome === 'allowed-once') {
            void sendText(pending.chatId, `✅ 已允许执行一次${by}`).catch(reportSendFailure);
        }
        else if (outcome === 'rejected') {
            void sendText(pending.chatId, `已拒绝${by}`).catch(reportSendFailure);
        }
        else {
            void sendText(pending.chatId, '该审批已取消').catch(reportSendFailure);
        }
        return true;
    };
    /** Ask one approval question in the chat that drives the agent. */
    const askViaChat = async (request, next) => {
        const chatId = chatBySession.get(request.agent.session.id);
        if (chatId === undefined)
            return next();
        // One open question per chat: a second escalation while the first waits
        // would race the same reply stream.
        for (const pending of pendingApprovals.values()) {
            if (pending.chatId === chatId)
                return next();
        }
        const id = randomUUID();
        const args = request.callId === undefined ? undefined : pendingCallArguments.get(request.callId);
        try {
            await sendMarkdown(chatId, '⚠️ **需要批准才能继续**\n\n'
                + `**工具**：\`${request.toolName}\`\n`
                + (request.reason === undefined ? '' : `**原因**：${request.reason}\n`)
                + (args === undefined ? '' : `**参数**：\n\`\`\`\n${boundArgs(args)}\n\`\`\`\n`)
                + '\n回复「允许一次」继续，或「拒绝」取消。');
        }
        catch (error) {
            // With no question in front of a human, let the next composed answerer decide.
            reportSendFailure(error);
            return next();
        }
        return new Promise((resolveOutcome) => {
            pendingApprovals.set(id, {
                chatId,
                toolName: request.toolName,
                reason: request.reason,
                settle: resolveOutcome,
            });
            request.signal?.addEventListener('abort', () => { settleApproval(id, 'cancelled'); }, { once: true });
        });
    };
    /** Try to settle a pending approval from an inbound reply; true when consumed. */
    const trySettleApproval = async (msg) => {
        const decision = matchApprovalDecision(msg.text);
        if (decision === undefined)
            return false;
        for (const [id, pending] of [...pendingApprovals]) {
            if (pending.chatId !== msg.chatId)
                continue;
            const refusal = refuseApproval(authorization, msg.senderId, msg.chatId, pending.chatId);
            if (refusal !== undefined) {
                notify(`dsh-dingtalk-channel: rejected an approval answer: ${refusal}`);
                await sendText(msg.chatId, '⚠️ 你无权批准此操作').catch(reportSendFailure);
                return true;
            }
            settleApproval(id, decision === 'allow' ? 'allowed-once' : 'rejected', msg.senderNick);
            return true;
        }
        return false;
    };
    const handleMessage = async (msg) => {
        // The webhook is refreshed even for deduplicated or refused traffic: a
        // rotated conversation webhook must never silently go stale.
        webhooks.set(msg.chatId, msg.sessionWebhook);
        if (seenMessages.has(msg.messageId))
            return;
        rememberMessage(msg.messageId);
        // An approval answer consumes the message instead of starting a turn.
        if (await trySettleApproval(msg))
            return;
        // Authorization before anything else: a message here starts a
        // shell-capable agent. Refusals stay silent in the chat and name the
        // sender on the operator console, which is also how an owner finds
        // their own id.
        const refusal = refuseMessage(authorization, config, msg);
        if (refusal !== undefined) {
            notify(`dsh-dingtalk-channel: ignored a message in ${msg.chatId}: ${refusal}`);
            return;
        }
        // An @-only ping carries no text; starting a turn on an empty prompt
        // spends a turn for nothing.
        if (msg.text.trim() === '')
            return;
        const command = parseCommand(msg.text);
        // Channel-owned commands need no agent, so they run BEFORE acquisition: a
        // `/status` must answer before a first message exists, and `/new` must not
        // create the session it is about to drop.
        if (command !== undefined && CHAT_COMMANDS.has(command.name)) {
            const key = conversationKey(config.sessionScope, msg);
            const sessionId = sessionIdForKey(key);
            const chatCommand = CHAT_COMMANDS.get(command.name);
            const env = {
                status: () => {
                    const route = routeBySession.get(sessionId);
                    return [
                        `会话：${sessionId}`,
                        `目录：${defaultCwd}`,
                        `模型：${route === undefined ? deploymentRoute() : [route.provider, route.model].filter(Boolean).join('/')}`,
                        `状态：${runningBySession.get(sessionId) === true ? '运行中' : '空闲'}`,
                        `绑定：${sessions.keyOf(sessionId) !== undefined ? '是' : '否'}`,
                    ].join('\n');
                },
                reply: (text) => sendMarkdown(msg.chatId, text),
                stop: () => {
                    const live = ctx.agents.get(sessionId);
                    if (live !== undefined)
                        live.cancel('user');
                },
                reset: async () => {
                    runningBySession.delete(sessionId);
                    await sessions.release(key);
                },
            };
            try {
                const reply = await chatCommand.run(command.args, env);
                if (reply !== '')
                    await sendMarkdown(msg.chatId, reply).catch(reportSendFailure);
            }
            catch (error) {
                notify(`dsh-dingtalk-channel: /${command.name} command failed in ${msg.chatId}: ${failureDetail(error)}`);
                await sendText(msg.chatId, `⚠️ 命令执行失败：${failureDetail(error)}`).catch(reportSendFailure);
            }
            return;
        }
        try {
            const opened = await sessions.acquire(msg);
            const sessionId = opened.handle.agent.session.id;
            let renderer = bySession.get(sessionId);
            if (renderer === undefined) {
                renderer = createChatRenderer(transport, { chatId: msg.chatId }, () => webhookFor(msg.chatId), reportSendFailure);
                bySession.set(sessionId, renderer);
                chatBySession.set(sessionId, msg.chatId);
            }
            // A slash line is a control, not a prompt: the host runs it without a
            // model turn, so it must not be handed to the model as text.
            if (command !== undefined) {
                const reply = await runHostCommandLine(command, opened.handle.agent);
                await sendMarkdown(msg.chatId, reply).catch(reportSendFailure);
                return;
            }
            if (config.emotion) {
                // The emoji IS the receipt: it marks the message as read and working
                // without spamming the chat, and the turn-end hook recalls it.
                emotionBySession.set(sessionId, msg.messageId);
                void transport.addEmotion(msg.chatId, msg.messageId).catch(reportSendFailure);
            }
            else if (config.sendReceipt) {
                await sendText(msg.chatId, '🤔 已收到，正在处理…').catch(reportSendFailure);
            }
            opened.handle.agent.followup(chatUserMessage(msg));
        }
        catch (error) {
            notify(`dsh-dingtalk-channel: agent creation failed for chat ${msg.chatId}: ${failureDetail(error)}`);
            ctx.logger.warn('agent creation failed for chat %s: %s', msg.chatId, error);
            await sendText(msg.chatId, `⚠️ 无法启动会话：${failureDetail(error)}`).catch(reportSendFailure);
        }
    };
    // Inbound events. The handler is installed before connect so no early event
    // is dropped; the transport acks every delivery and this side deduplicates.
    ctx.effect(() => {
        transport.setHandler((msg) => { void handleMessage(msg); });
        return () => { transport.setHandler(() => { }); };
    }, 'ding:on(message)');
    // Outbound: the owned chat's renderer decides what reaches the chat. The
    // bridge additionally remembers each call's arguments for the approval
    // prompt, and forgets the turn's calls once it closes.
    ctx.on('session/event', (session, event) => {
        const renderer = bySession.get(session.id);
        if (renderer === undefined)
            return;
        if (isToolCallEvent(event)) {
            pendingCallArguments.set(event.data.callId, event.data.arguments);
        }
        else if (isTurnEndEvent(event)) {
            pendingCallArguments.clear();
            runningBySession.set(session.id, false);
            const pending = emotionBySession.get(session.id);
            if (pending !== undefined) {
                emotionBySession.delete(session.id);
                void transport.recallEmotion(chatBySession.get(session.id) ?? '', pending).catch(reportSendFailure);
            }
        }
        else if (isStepStartEvent(event)) {
            runningBySession.set(session.id, true);
        }
        renderer.handle(event);
    });
    // Approval questions for owned agents become chat questions; everything else
    // delegates. PREPEND is load-bearing: a host answerer may claim every
    // audited request rather than only the sessions its own clients own, so a
    // chat-driven approval would otherwise surface in a browser nobody is
    // watching while the chat waits forever.
    ctx.on('approval/request', (request, next) => {
        if (bySession.get(request.agent.session.id) === undefined)
            return next();
        return askViaChat(request, next);
    }, { prepend: true });
    // Owned live state unwinds with the fiber: agents down, open questions
    // closed. The session store owns the agents, so it does the disposing — and
    // it leaves an adopted one running for its owner.
    ctx.effect(() => () => {
        for (const [id, pending] of [...pendingApprovals]) {
            pendingApprovals.delete(id);
            pending.settle('cancelled');
        }
        bySession.clear();
        compositions.clear();
        pendingCallArguments.clear();
        runningBySession.clear();
        emotionBySession.clear();
        return sessions.close().then(() => undefined);
    }, 'ding:agents');
    // Registered last so disposal disconnects the transport first.
    ctx.effect(() => {
        transport.start().catch((error) => {
            notify(`dsh-dingtalk-channel: connect failed: ${failureDetail(error)}`);
            ctx.logger.error('dingtalk channel connect failed: %s', error);
        });
        return () => transport.dispose();
    }, 'ding:connect');
}
/** Split a `provider/model` string back into route options. */
function splitRoute(route) {
    const slash = route.indexOf('/');
    if (slash < 0)
        return { model: route };
    return { provider: route.slice(0, slash), model: route.slice(slash + 1) };
}
//# sourceMappingURL=bridge.js.map