/** Wire values are text/opaque IDs, never user supplied HTML or asset URLs. */
export const VOICE_EMOJIS = [
  ['😀', 'ابتسامة'],
  ['😂', 'ضحك'],
  ['🥹', 'تأثر'],
  ['😍', 'إعجاب'],
  ['😎', 'ثقة'],
  ['🤔', 'تفكير'],
  ['😢', 'حزن'],
  ['😮', 'دهشة'],
  ['❤️', 'قلب'],
  ['👏', 'تصفيق'],
  ['🔥', 'حماس'],
  ['👍', 'ممتاز'],
  ['✨', 'بريق'],
  ['🎉', 'احتفال'],
  ['🤝', 'اتفاق'],
  ['👑', 'تاج'],
  ['🌹', 'وردة'],
  ['☕', 'قهوة'],
  ['🏆', 'فوز'],
  ['💪', 'قوة'],
] as const;
export const MAX_MESSAGE_EMOJIS = 12;
export const CUSTOM_EMOJI_PATTERN =
  /:td_([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):/g;
export const emojiToken = (id: string) => `:td_${id}:`;
export const customEmojiIds = (text: string) =>
  [...text.matchAll(CUSTOM_EMOJI_PATTERN)].map((m) => m[1]);
export const isUnicodeReaction = (text: string) => VOICE_EMOJIS.some(([value]) => value === text);
export const isCustomReaction = (text: string) =>
  customEmojiIds(text).length === 1 && emojiToken(customEmojiIds(text)[0]) === text;
export type VoiceEmojiAsset = { id: string; label: string; animated: boolean };
export type VoiceEmojiPack = {
  id: string;
  name: string;
  enabled: boolean;
  emojis: VoiceEmojiAsset[];
};

// Count extended pictographic sequences rather than UTF-16 code units or ZWJ components.
export function messageEmojiCount(text: string) {
  const segments = new Intl.Segmenter('ar', {
    granularity: 'grapheme',
  }).segment(text.replace(CUSTOM_EMOJI_PATTERN, ''));
  return (
    customEmojiIds(text).length +
    [...segments].filter((s) =>
      /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(s.segment),
    ).length
  );
}
