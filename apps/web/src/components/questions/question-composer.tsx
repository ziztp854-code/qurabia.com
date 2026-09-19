'use client';

import { Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import pageStyles from './question-bank-page.module.css';

export function QuestionComposer({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const openComposer = () => setOpen(true);
    const onHash = () => {
      if (window.location.hash === '#question-editor') openComposer();
    };
    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest('a[href="#question-editor"]');
      if (!target) return;
      openComposer();
    };

    onHash();
    window.addEventListener('hashchange', onHash);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <details
      className={pageStyles.composer}
      id="question-editor"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Plus aria-hidden="true" size={18} />
        إضافة سؤال جديد
      </summary>
      <div className={pageStyles.composerBody}>{children}</div>
    </details>
  );
}
