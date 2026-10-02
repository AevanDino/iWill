import { describe, expect, it } from 'vitest'
import { firstEmoji } from './emoji'

describe('firstEmoji', () => {
  it('keeps multi-codepoint emoji whole', () => {
    expect(firstEmoji('👩‍💻')).toBe('👩‍💻')
    expect(firstEmoji('👍🏽 nice')).toBe('👍🏽')
    expect(firstEmoji('🇸🇪')).toBe('🇸🇪')
    expect(firstEmoji('  🧠🧠')).toBe('🧠')
  })

  it('rejects text that does not start with an emoji', () => {
    expect(firstEmoji('')).toBeNull()
    expect(firstEmoji('abc')).toBeNull()
    expect(firstEmoji('1')).toBeNull()
  })
})
