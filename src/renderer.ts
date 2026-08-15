/**
 * Chat rendering: translate host session events into DingTalk messages. The
 * committed assistant text becomes a markdown message; turn-end errors surface
 * as a short operator-readable line. Tool-call activity is intentionally
 * silent — per-tool `🔧 …` notifications were judged valueless noise on a
 * chat surface that has no typing indicator.
 * @module dsh-dingtalk-channel/renderer
 */

import type { DingTalkPort } from './message.js'
import {
  type HostSessionEvent,
  assistantText,
  isAssistantMessageEvent,
  isTurnEndEvent,
  turnErrorDetail,
} from './host.js'

/** The chat a renderer serves, and the webhook to reach it. */
export interface ChatTarget {
  readonly chatId: string
}

/**
 * Strip tool-call markup a model may have leaked into committed text, leaving
 * only what belongs in a chat message. Model-visible tool calls normally
 * surface through `tool/call` events instead of text, so this is a hygiene
 * pass, not the source of truth.
 * @param text - the committed assistant text.
 * @returns the text with fenced tool-call blocks removed.
 */
export function stripToolCallMarkup(text: string): string {
  return text
    .replace(/^\s*<tool_call>[\s\S]*?<\/tool_call>\s*$/gm, '')
    .replace(/^\s*<result>[\s\S]*?<\/result>\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Strip a model's private thinking from committed text. Some deployments
 * emit the reasoning inline (fenced as `<think>…</think>`) instead of through
 * the reasoning-delta event channel, so the channel must hide it before the
 * text reaches a chat surface.
 * @param text - the committed assistant text.
 * @returns the text without think fences (including a dangling close tag).
 */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .replace(/<\/think>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Create the renderer one chat's output goes through. Every committed
 * assistant text is sent as an ordinary markdown message; failed turns emit a
 * short error line. Tool calls are deliberately not surfaced.
 * @param port - the transport to send through.
 * @param target - the chat this renderer serves.
 * @param webhook - resolves the conversation's current reply webhook.
 * @param onFailure - send-failure sink shared with the bridge.
 * @returns the renderer for the configured output.
 */
export function createChatRenderer(
  port: DingTalkPort,
  target: ChatTarget,
  webhook: () => string | undefined,
  onFailure: (error: unknown) => void,
): {
  handle(event: HostSessionEvent): void
  close(): Promise<void>
} {
  const chatId = target.chatId

  const sendMarkdown = (text: string): void => {
    const current = webhook()
    if (current === undefined) {
      onFailure(new Error('no reply webhook cached for this conversation'))
      return
    }
    port.sendMarkdown(chatId, current, '助手', text).catch(onFailure)
  }
  const sendText = (text: string): void => {
    const current = webhook()
    if (current === undefined) {
      onFailure(new Error('no reply webhook cached for this conversation'))
      return
    }
    port.sendText(chatId, current, text).catch(onFailure)
  }

  return {
    handle(event: HostSessionEvent): void {
      if (isAssistantMessageEvent(event)) {
        const text = stripThinking(stripToolCallMarkup(assistantText(event.data)))
        if (text !== '') sendMarkdown(text)
        return
      }
      if (isTurnEndEvent(event)) {
        const detail = turnErrorDetail(event.data)
        if (detail !== '') sendText(`❌ ${detail}`)
      }
    },
    async close(): Promise<void> {
      // Nothing held open; kept for interface symmetry with streaming renderers.
    },
  }
}
