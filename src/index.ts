/**
 * DingTalk IM bot channel for DeepSeek Harness: each chat drives its own
 * agent, committed assistant output returns as chat messages over the
 * Stream-mode long connection.
 * @module dsh-dingtalk-channel
 */

/** Cordis plugin name; keep this stable after publishing. */
export const name = 'dingtalk-channel'

/** Services that must exist before the plugin is applied. */
export const inject: string[] = ['agents']

export { Config } from './config.js'
export type { ResolvedConfig } from './config.js'
export { apply } from './runtime.js'
export type { ChannelConfig } from './runtime.js'
export type { InboundMessage, DingTalkPort } from './message.js'
