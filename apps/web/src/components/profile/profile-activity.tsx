'use client';

import dynamic from 'next/dynamic';
import { useState, type ComponentProps } from 'react';
import type { CommandProfile } from './command-profile';
import { Skeleton } from '@/components/ui';
import styles from './profile-overview.module.css';

const Activity = dynamic(
  () => import('./command-profile').then((module) => module.CommandProfile),
  {
    loading: () => (
      <div className={styles.loading} role="status" aria-label="جارٍ تحميل نشاط الحساب">
        <Skeleton />
      </div>
    ),
  },
);

export function ProfileActivity(props: ComponentProps<typeof CommandProfile>) {
  const [loaded, setLoaded] = useState(false);
  return (
    <details
      className={styles.tools}
      onToggle={(event) => {
        if (event.currentTarget.open) setLoaded(true);
      }}
    >
      <summary>نشاطي وأدوات الحساب</summary>
      {loaded && <Activity {...props} />}
    </details>
  );
}
