import { describe, expect, it } from 'vitest'
import { normalizeMessage, type DingTalkRobotMessage } from '../src/message.js'
import { conversationKey, sessionIdFor } from '../src/session.js'
import { parseCommand } from '../src/commands.js'
import { matchApprovalDecision } from '../src/approval-reply.js'
import { stripThinking } from '../src/renderer.js'
import { emotionBody } from '../src/transport.js'

function robot(overrides: Partial<DingTalkRobotMessage> = {}): DingTalkRobotMessage {
  return {
    conversationId: 'cid-1',
    conversationType: '1',
    msgId: 'msg-1',
    senderId: 'staff-1',
    senderNick: '张三',
    sessionWebhook: 'https://api.dingtalk.com/v1.0/im/bot/send?sessionWebhook=abc',
    msgtype: 'text',
    text: { content: '你好' },
    ...overrides,
  }
}

describe('normalizeMessage', () => {
  it('passes single-chat text through verbatim', () => {
    const msg = normalizeMessage(robot())
    expect(msg.chatId).toBe('cid-1')
    expect(msg.text).toBe('你好')
    expect(msg.isGroup).toBe(false)
    expect(msg.atBot).toBe(false)
    expect(msg.sessionWebhook).toContain('sessionWebhook=abc')
  })

  it('strips a leading @mention in group messages when botName matches', () => {
    const msg = normalizeMessage(robot({ conversationType: '2', text: { content: '@我的助手 你好' } }), '我的助手')
    expect(msg.isGroup).toBe(true)
    expect(msg.atBot).toBe(true)
    expect(msg.text).toBe('你好')
  })

  it('strips the first @token in groups when botName is unset', () => {
    const msg = normalizeMessage(robot({ conversationType: '2', text: { content: '@机器人 天气如何' } }))
    expect(msg.text).toBe('天气如何')
  })

  it('keeps the mention when it is not the configured bot', () => {
    const msg = normalizeMessage(robot({ conversationType: '2', text: { content: '@其他人 你好' } }), '我的助手')
    expect(msg.text).toBe('@其他人 你好')
  })

  it('keeps the text when no mention is present', () => {
    const msg = normalizeMessage(robot({ conversationType: '2', text: { content: '直接说话' } }))
    expect(msg.text).toBe('直接说话')
    expect(msg.atBot).toBe(false)
  })
})

describe('session identity', () => {
  it('derives a stable branded session id from the chat id', () => {
    expect(sessionIdFor('cid-1')).toBe('ding-cid-1')
    expect(conversationKey('chat', normalizeMessage(robot()))).toBe('cid-1')
  })

  it('splits chat-sender scope by sender', () => {
    const a = normalizeMessage(robot({ senderId: 'staff-a' }))
    const b = normalizeMessage(robot({ senderId: 'staff-b' }))
    expect(conversationKey('chat-sender', a)).not.toBe(conversationKey('chat-sender', b))
  })
})

describe('parseCommand', () => {
  it('parses a bare slash command', () => {
    expect(parseCommand('/ping')).toEqual({ name: 'ping', args: '' })
  })

  it('parses a command with arguments', () => {
    expect(parseCommand('/new  extra  ')).toEqual({ name: 'new', args: 'extra' })
  })

  it('rejects prose', () => {
    expect(parseCommand('你好 /ping')).toBeUndefined()
    expect(parseCommand('ping')).toBeUndefined()
  })
})

describe('matchApprovalDecision', () => {
  it('accepts allow and reject keywords', () => {
    expect(matchApprovalDecision('允许一次')).toBe('allow')
    expect(matchApprovalDecision('允许')).toBe('allow')
    expect(matchApprovalDecision('approve')).toBe('allow')
    expect(matchApprovalDecision('拒绝')).toBe('reject')
    expect(matchApprovalDecision('reject')).toBe('reject')
  })

  it('rejects long prose and unrelated text', () => {
    expect(matchApprovalDecision('允许一次然后继续做下一件事')).toBeUndefined()
    expect(matchApprovalDecision('随便')).toBeUndefined()
  })
})

describe('stripThinking', () => {
  it('removes a fenced think block at the start', () => {
    expect(stripThinking('<think>let me plan this\nstep by step</think>\n\n你好！')).toBe('你好！')
  })
  it('removes a think block in the middle', () => {
    expect(stripThinking('开头\n<think>private reasoning</think>\n结尾')).toBe('开头\n结尾')
  })
  it('drops a dangling open fence', () => {
    expect(stripThinking('<think>unclosed reasoning')).toBe('')
  })
  it('removes a stray close tag', () => {
    expect(stripThinking('text</think> more')).toBe('text more')
  })
  it('keeps plain text untouched', () => {
    expect(stripThinking('普通回复，无思考')).toBe('普通回复，无思考')
  })
})

describe('emotionBody', () => {
  it('builds the reply payload for the platform emotion endpoint', () => {
    const body = emotionBody('dingappkey', 'cid-1', 'msg-42')
    expect(body.robotCode).toBe('dingappkey')
    expect(body.openMsgId).toBe('msg-42')
    expect(body.openConversationId).toBe('cid-1')
    expect(body.emotionType).toBe(2)
    expect(body.textEmotion.emotionName).toBe('🤔思考中')
  })
})
