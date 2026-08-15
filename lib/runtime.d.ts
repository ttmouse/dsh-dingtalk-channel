/**
 * Runtime boundary and Cordis activation for the plugin.
 * @module dsh-dingtalk-channel/runtime
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.js';
import type { ResolvedConfig } from './config.js';
import { type DingTalkTransport } from './transport.js';
/** Resolved configuration whose credentials are present; the transport can be built. */
export type ChannelConfig = ResolvedConfig & {
    readonly clientId: string;
    readonly clientSecret: string;
};
/** Substitutable production boundaries; tests replace them with fakes. */
export declare const internals: {
    createTransport: (config: ChannelConfig) => DingTalkTransport;
    /** Operator console line; the default profile composes no logger printer. */
    notify: (line: string) => void;
};
/**
 * Apply the plugin to its Cordis context. Requires configured credentials: the
 * DingTalk developer console issues them when the app's Stream-mode robot is
 * created. A deployment WITHOUT the `settings` service still boots from entry
 * configuration alone.
 * @param ctx - Scoped plugin context; requires the `agents` service.
 * @param config - Configuration resolved by Cordis from the exported schema.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=runtime.d.ts.map