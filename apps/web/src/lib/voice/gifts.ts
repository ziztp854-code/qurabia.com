/** Free trial gifts only: no wallet, prices, purchases or account rewards. */
export const VOICE_GIFTS = [
  { id: 'rose', name: 'وردة', emoji: '🌹' },
  { id: 'applause', name: 'تصفيق', emoji: '👏' },
  { id: 'star', name: 'نجمة', emoji: '🌟' },
  { id: 'crown', name: 'تاج', emoji: '👑' },
] as const;
export type VoiceGiftId = (typeof VOICE_GIFTS)[number]['id'];
export const VOICE_GIFT_INTERVAL = 5000;
export function voiceGift(id: string) {
  return VOICE_GIFTS.find((gift) => gift.id === id);
}
