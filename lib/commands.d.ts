/**
 * Channel-level slash commands, handled without a model turn. Unknown
 * commands fall through to the host `commands` runtime when one is composed.
 * @module dsh-dingtalk-channel/commands
 */
/** Environment a chat command runs against. */
export interface CommandEnv {
    /** One-line status description: workspace, model, session, run state. */
    status(): string;
    /** Reply to the calling chat. */
    reply(text: string): Promise<void>;
    /** Cancel the active turn of the bound agent. */
    stop(): void;
    /** Drop the conversation's session binding; the next message starts fresh. */
    reset(): Promise<void>;
}
/** One chat command. */
export interface ChatCommand {
    /** Lowercase name without the leading slash. */
    readonly name: string;
    /** One-line usage help. */
    readonly help: string;
    /** Run the command; the returned line is sent to the chat. */
    run(args: string, env: CommandEnv): Promise<string>;
}
/** The channel's built-in commands, keyed by name. */
export declare const CHAT_COMMANDS: ReadonlyMap<string, ChatCommand>;
/**
 * Parse a chat line's leading command.
 * @param line - the inbound message text.
 * @returns the command name and its argument string, or undefined when the
 * line does not begin with a command token.
 */
export declare function parseCommand(line: string): {
    name: string;
    args: string;
} | undefined;
//# sourceMappingURL=commands.d.ts.map