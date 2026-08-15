/**
 * DingTalk Stream-mode transport: owns the `dingtalk-stream` DWClient
 * long connection, normalizes robot messages for the bridge, and replies
 * through each conversation's session webhook with a cached access token.
 * @module dsh-dingtalk-channel/transport
 */
import { type DingTalkPort, type InboundMessage } from './message.js';
/** Request body for the robot emotion reply/recall endpoints. */
export interface EmotionBody {
    robotCode: string;
    openMsgId: string;
    openConversationId: string;
    emotionType: number;
    emotionName: string;
    textEmotion: {
        emotionId: string;
        emotionName: string;
        text: string;
        backgroundId: string;
    };
}
/**
 * Build the payload for {@link DingTalkPort.addEmotion} /
 * {@link DingTalkPort.recallEmotion}. `robotCode` is the app key: the
 * platform merged robots into applications, so the client id is the code.
 * @param robotCode - the app key (`ding…`).
 * @param chatId - the conversation id the message lives in.
 * @param messageId - the user message's open id.
 * @returns the JSON body the emotion endpoints accept.
 */
export declare function emotionBody(robotCode: string, chatId: string, messageId: string): EmotionBody;
/** Options for {@link createDingTalkTransport}. */
export interface DingTalkTransportOptions {
    /** DingTalk app key (ClientID). */
    readonly clientId: string;
    /** DingTalk app secret (ClientSecret). */
    readonly clientSecret: string;
    /** The bot's display name, for @mention stripping in groups. */
    readonly botName?: string;
    /** Operator-facing report line sink. */
    readonly notify: (line: string) => void;
}
/**
 * The DingTalk transport behind the bridge's port surface: a {@link DingTalkPort}
 * plus the connection lifecycle and the inbound message feed.
 */
export interface DingTalkTransport extends DingTalkPort {
    /** Open the long connection; resolves once the client is connected. */
    start(): Promise<void>;
    /**
     * Install the inbound message handler. Must be set before {@link start} so
     * no early event is dropped; the transport acks every delivery immediately
     * and the handler is responsible for deduplication.
     */
    setHandler(handler: (msg: InboundMessage) => void): void;
}
/**
 * Create the DingTalk transport behind the bridge's port surface.
 * @param options - credentials and the operator line sink.
 * @returns the transport, connected asynchronously via {@link DingTalkTransport.start}.
 */
export declare function createDingTalkTransport(options: DingTalkTransportOptions): DingTalkTransport;
//# sourceMappingURL=transport.d.ts.map