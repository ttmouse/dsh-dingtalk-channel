/**
 * Channel-level slash commands, handled without a model turn. Unknown
 * commands fall through to the host `commands` runtime when one is composed.
 * @module dsh-dingtalk-channel/commands
 */
/** The channel's built-in commands, keyed by name. */
export const CHAT_COMMANDS = new Map([
    ['ping', {
            name: 'ping',
            help: '连通性检查',
            run: async () => 'pong',
        }],
    ['help', {
            name: 'help',
            help: '列出可用命令',
            run: async () => {
                const lines = [...CHAT_COMMANDS.values()].map(c => `/${c.name} — ${c.help}`);
                return ['可用命令：', ...lines].join('\n');
            },
        }],
    ['status', {
            name: 'status',
            help: '会话与运行状态',
            run: async (_args, env) => env.status(),
        }],
    ['stop', {
            name: 'stop',
            help: '取消当前生成',
            run: async (_args, env) => {
                env.stop();
                return '已取消当前生成。';
            },
        }],
    ['new', {
            name: 'new',
            help: '开启新会话（历史保留）',
            run: async (_args, env) => {
                await env.reset();
                return '已开启新会话，下一条消息开始。';
            },
        }],
]);
/**
 * Parse a chat line's leading command.
 * @param line - the inbound message text.
 * @returns the command name and its argument string, or undefined when the
 * line does not begin with a command token.
 */
export function parseCommand(line) {
    const match = /^\/([a-zA-Z][\w-]*)(?:\s+([\s\S]*))?$/.exec(line.trim());
    if (match === null)
        return undefined;
    return { name: match[1].toLowerCase(), args: match[2] ?? '' };
}
//# sourceMappingURL=commands.js.map