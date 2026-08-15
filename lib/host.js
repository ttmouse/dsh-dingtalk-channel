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
/**
 * Narrow a session event to the assembled assistant message for one step.
 * @param event - any session event.
 * @returns whether `event.data` carries {@link AssistantMessageData}.
 */
export function isAssistantMessageEvent(event) {
    return event.type === 'assistant/message';
}
/**
 * Narrow a session event to a closed turn boundary.
 * @param event - any session event.
 * @returns whether `event.data` carries {@link TurnEndData}.
 */
export function isTurnEndEvent(event) {
    return event.type === 'turn/end';
}
/**
 * Narrow a session event to the opening of one step.
 * @param event - any session event.
 * @returns whether `event.data` carries {@link StepStartData}.
 */
export function isStepStartEvent(event) {
    return event.type === 'step/start';
}
/**
 * Narrow a session event to one completed tool call's result.
 * @param event - any session event.
 * @returns whether `event.data` carries {@link ToolResultData}.
 */
export function isToolResultEvent(event) {
    return event.type === 'tool/result';
}
/**
 * Narrow a session event to one model-requested tool invocation.
 * @param event - any session event.
 * @returns whether `event.data` carries {@link ToolCallData}.
 */
export function isToolCallEvent(event) {
    return event.type === 'tool/call';
}
/**
 * Join the text blocks of a committed assistant message.
 * @param data - the committed message payload.
 * @returns the concatenated text, empty when the step produced none.
 */
export function assistantText(data) {
    return data.message.content
        .filter(block => block.type === 'text' && block.text !== undefined && block.text !== '')
        .map(block => block.text)
        .join('');
}
/**
 * Render a failed turn's reason as one operator-readable line.
 * @param data - the closed turn payload.
 * @returns the error detail, empty when the turn did not fail.
 */
export function turnErrorDetail(data) {
    if (data.reason.kind !== 'error')
        return '';
    const error = data.reason.error;
    return error === undefined ? '' : `${error.code ?? 'error'}: ${error.message ?? ''}`.trimEnd();
}
//# sourceMappingURL=host.js.map