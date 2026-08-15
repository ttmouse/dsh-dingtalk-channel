/**
 * Runtime boundary and Cordis activation for the plugin.
 * @module dsh-dingtalk-channel/runtime
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config, resolveConfig } from './config.js'
import type { ResolvedConfig } from './config.js'
import { installBridge } from './bridge.js'
import { createDingTalkTransport, type DingTalkTransport } from './transport.js'
import type { HostLoader, HostSettings } from './host.js'

/** Resolved configuration whose credentials are present; the transport can be built. */
export type ChannelConfig = ResolvedConfig & {
  readonly clientId: string
  readonly clientSecret: string
}

/** The user-settings namespace holding this plugin's section. */
const SETTINGS_NAMESPACE = 'dingtalk-channel'

/**
 * Narrow a resolved configuration to one carrying live credentials.
 * @param config - resolved plugin configuration.
 * @returns whether both credential fields are non-empty strings.
 */
function hasCredentials(config: ResolvedConfig): config is ChannelConfig {
  return typeof config.clientId === 'string' && config.clientId !== ''
    && typeof config.clientSecret === 'string' && config.clientSecret !== ''
}

/** Substitutable production boundaries; tests replace them with fakes. */
export const internals: {
  createTransport: (config: ChannelConfig) => DingTalkTransport
  /** Operator console line; the default profile composes no logger printer. */
  notify: (line: string) => void
} = {
  createTransport: (config) => createDingTalkTransport({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    botName: config.botName,
    notify: (line) => void process.stderr.write(`${line}\n`),
  }),
  notify: (line) => void process.stderr.write(`${line}\n`),
}

/**
 * Apply the plugin to its Cordis context. Requires configured credentials: the
 * DingTalk developer console issues them when the app's Stream-mode robot is
 * created. A deployment WITHOUT the `settings` service still boots from entry
 * configuration alone.
 * @param ctx - Scoped plugin context; requires the `agents` service.
 * @param config - Configuration resolved by Cordis from the exported schema.
 */
export function apply(ctx: Context, config: Config): void {
  let active = true
  let started = false
  ctx.effect(() => () => { active = false }, 'ding:lifetime')

  /**
   * Install the bridge once credentials are known, stating this channel's
   * reach on the console: who it serves is a security fact its operator must
   * see.
   */
  const start = (resolved: ChannelConfig): void => {
    if (!active || started) return
    started = true
    const transport = internals.createTransport(resolved)
    installBridge(ctx, resolved, transport, internals.notify)
  }

  const bootstrap = async (): Promise<void> => {
    // Loader siblings mount concurrently; whether the optional settings
    // service exists is only decided once the application settles.
    await (ctx.get('loader') as HostLoader | undefined)?.await()
    if (!active) return

    let resolved = resolveConfig(config)
    const settings = ctx.get('settings') as HostSettings | undefined
    if (settings !== undefined) {
      try {
        const scope = settings.register(SETTINGS_NAMESPACE, Config, { base: config })
        resolved = resolveConfig(scope.get() as Config)
      } catch (error) {
        ctx.logger.error(
          'settings registration failed; continuing with entry config only: %s',
          error instanceof Error ? error.message : error,
        )
      }
    }

    if (!hasCredentials(resolved)) {
      internals.notify(
        'dsh-dingtalk-channel: missing clientId/clientSecret — to obtain them:\n'
        + '  1) open https://open-dev.dingtalk.com/fe/app and sign in by scanning the QR with DingTalk\n'
        + '  2) create an internal app (H5 micro-app), copy AppKey and AppSecret from 凭证与基础信息\n'
        + '  3) enable 应用能力 → 机器人 (Stream mode)\n'
        + '  then set DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET (or the dingtalk-channel settings section) and restart dsh web',
      )
      return
    }
    start(resolved)
  }

  void bootstrap().catch((error: unknown) => {
    ctx.logger.error('dingtalk-channel bootstrap failed: %s', error instanceof Error ? error.message : error)
  })
}
