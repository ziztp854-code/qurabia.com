import type { Metadata } from 'next';
import { FastestButtonRoom } from '@/components/games/fastest-button/fastest-button-room';
export const metadata: Metadata = {
  title: 'أسرع كبسة زر | تحدي',
  description:
    'مسابقة جماعية مباشرة: السرعة والإقصاء والنقاط، مع شاشة بث مستقلة. الخادم يثبت ترتيب الضغطات.',
};
export default function FastestButtonPage() {
  return <FastestButtonRoom role="player" />;
}
