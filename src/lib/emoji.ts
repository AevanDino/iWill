/** Emoji offered in the tag picker. Anything else can be typed or pasted. */
export const EMOJI_GROUPS: { name: string; emoji: string[] }[] = [
  { name: 'Work', emoji: ['🧠', '💼', '💻', '📥', '📊', '📝', '📞', '🗣️', '📅', '🎯', '🛠️', '🚀'] },
  { name: 'Health', emoji: ['🏃', '🧘', '🏋️', '🚴', '🏊', '🥗', '💧', '😴', '🦷', '💊', '🩺', '🚶'] },
  { name: 'Home', emoji: ['🏡', '🧹', '🧺', '🍳', '🛒', '🪴', '🐶', '🐱', '👶', '🔧', '💡', '🛁'] },
  { name: 'Learning', emoji: ['📚', '🎓', '✏️', '🔬', '🧪', '🗺️', '🧩', '🎧', '📖', '🌍', '🔤', '🧮'] },
  { name: 'Social', emoji: ['☕', '🍻', '🍽️', '🎉', '💬', '❤️', '👋', '🤝', '👨‍👩‍👧', '💌', '🎁', '📸'] },
  { name: 'Fun', emoji: ['🎮', '🎸', '🎨', '🎬', '📺', '🎲', '⚽', '🎹', '🧶', '🎤', '🏖️', '✨'] },
  { name: 'Travel', emoji: ['✈️', '🚆', '🚗', '🚌', '🧳', '⛺', '🏔️', '🌅', '🌙', '⏰', '🧭', '📍'] },
]

const PICTURE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

/** The first emoji in `text` (one full grapheme, so 👩‍💻 or 👍🏽 stay whole), or null if it doesn't start with one. */
export function firstEmoji(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)[Symbol.iterator]().next().value?.segment
  return first && PICTURE.test(first) ? first : null
}
