import type { Metadata } from 'next';
import Link from 'next/link';
import { ChallengeCardPreview } from '@/components/3d/challenge-card-preview';
import styles from '@/components/3d/model-viewer.module.css';

export const metadata: Metadata = {
  title: 'مختبر المجسمات | تحدّي',
  description: 'معاينة مجسمات Blender التفاعلية داخل منصة تحدّي.',
};

export default function Models3dPage() {
  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/">العودة إلى الرئيسية ←</Link>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>BLENDER → WEBGL</p>
        <h1>بطاقة تحدّي</h1>
        <p>اسحب البطاقة لتدويرها، قرّبها، وشغّل الحركة المصدّرة من Blender.</p>
      </header>
      <ChallengeCardPreview />
    </main>
  );
}
