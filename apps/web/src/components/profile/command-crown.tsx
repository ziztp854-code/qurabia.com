import Image from 'next/image';
import styles from './command-profile.module.css';

export function CommandCrown({ className }: { className?: string }) {
  return (
    <>
      <Image
        className={className ?? styles.crownArt}
        src="/profile/command-crown.png"
        alt="تاج تحدّي الذهبي وكلمة تحدي على الدرع"
        width={1536}
        height={1024}
        sizes="(max-width: 980px) 88vw, 38vw"
        priority
      />
      <span className="sr-only">تحدي</span>
    </>
  );
}
