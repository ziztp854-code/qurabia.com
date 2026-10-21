/** Same opaque wire format and free gifts as the existing voice API. */
export const VOICE_EMOJIS = [
  ['😀', 'ابتسامة'], ['😂', 'ضحك'], ['🥹', 'تأثر'], ['😍', 'إعجاب'],
  ['😎', 'ثقة'], ['🤔', 'تفكير'], ['😢', 'حزن'], ['😮', 'دهشة'],
  ['❤️', 'قلب'], ['👏', 'تصفيق'], ['🔥', 'حماس'], ['👍', 'ممتاز'],
  ['✨', 'بريق'], ['🎉', 'احتفال'], ['🤝', 'اتفاق'], ['👑', 'تاج'],
  ['🌹', 'وردة'], ['☕', 'قهوة'], ['🏆', 'فوز'], ['💪', 'قوة'],
] as const;
export const VOICE_GIFTS = [
  { id: 'rose', name: 'وردة', emoji: '🌹' },
  { id: 'applause', name: 'تصفيق', emoji: '👏' },
  { id: 'star', name: 'نجمة', emoji: '🌟' },
  { id: 'crown', name: 'تاج', emoji: '👑' },
] as const;
export type VoiceGiftId = (typeof VOICE_GIFTS)[number]['id'];
export type VoiceEmojiAsset = { id: string; label: string; animated: boolean };
export type VoiceEmojiPack = { id: string; name: string; enabled: boolean; emojis: VoiceEmojiAsset[] };
export const MAX_MESSAGE_EMOJIS = 12;
export const MAX_MESSAGE_LENGTH = 1000;
const idPattern = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const customPattern = () => new RegExp(':td_(' + idPattern + '):', 'g');
const validId = (id: string) => new RegExp('^' + idPattern + '$').test(id);
export function emojiToken(id: string) {
  if (!validId(id)) throw new Error('معرّف الفيس غير صالح.');
  return ':td_' + id + ':';
}
export function emojiAssetPath(id: string, still = false) {
  if (!validId(id)) throw new Error('معرّف الفيس غير صالح.');
  return '/api/voice/emojis/assets/' + id + (still ? '?still=1' : '');
}
export type EmojiSegment = { type: 'text'; text: string } | { type: 'emoji'; id: string };
export function tokenizeEmoji(text: string): EmojiSegment[] {
  const result: EmojiSegment[] = [];
  let start = 0;
  for (const match of text.matchAll(customPattern())) {
    if (match.index > start) result.push({ type: 'text', text: text.slice(start, match.index) });
    result.push({ type: 'emoji', id: match[1] });
    start = match.index + match[0].length;
  }
  if (start < text.length) result.push({ type: 'text', text: text.slice(start) });
  return result;
}

/** Match server grapheme counting where supported; server remains authoritative on older runtimes. */
export function messageEmojiCount(text: string) {
  const custom = [...text.matchAll(customPattern())].length;
  const unicode = text.replace(customPattern(), '');
  const Segmenter = Intl.Segmenter;
  if (typeof Segmenter === 'function') {
    return custom + [...new Segmenter('ar', { granularity: 'grapheme' }).segment(unicode)]
      .filter(({ segment }) => /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(segment)).length;
  }
  // No speculative code-point count: multi-code-point emoji would otherwise be rejected incorrectly.
  return custom;
}
export function validateMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('اكتب رسالة أولًا.');
  if (trimmed.length > MAX_MESSAGE_LENGTH) throw new Error('الحد الأقصى 1000 حرف للرسالة.');
  if (messageEmojiCount(trimmed) > MAX_MESSAGE_EMOJIS) throw new Error('الحد الأقصى 12 فيسًا للرسالة.');
  return trimmed;
}
export function validReaction(emoji: string) {
  return VOICE_EMOJIS.some(([value]) => value === emoji) ||
    new RegExp('^:td_(' + idPattern + '):$').test(emoji);
}
