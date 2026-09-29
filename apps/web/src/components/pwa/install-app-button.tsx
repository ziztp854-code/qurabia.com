'use client';

import { Download, Share, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/overlay';
import styles from './install-app-button.module.css';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscribeToDisplayMode(onChange: () => void) {
  const query = window.matchMedia('(display-mode: standalone)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function InstallAppButton() {
  const standalone = useSyncExternalStore(subscribeToDisplayMode, isStandalone, () => false);
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as InstallPromptEvent;
    };
    const markInstalled = () => {
      deferredPrompt.current = null;
      setInstalled(true);
      setOpen(false);
    };
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', markInstalled);
    return () => {
      mounted.current = false;
      deferredPrompt.current = null;
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', markInstalled);
    };
  }, []);

  async function install() {
    const prompt = deferredPrompt.current;
    setFailed(false);
    if (!prompt) {
      setOpen(true);
      return;
    }
    deferredPrompt.current = null;
    setLoading(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (!mounted.current) return;
      if (choice.outcome === 'accepted') setInstalled(true);
      else setOpen(true);
    } catch {
      if (!mounted.current) return;
      setFailed(true);
      setOpen(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  if (installed || standalone) return null;

  return (
    <div className={styles.install}>
      <Button
        variant="ghost"
        className={styles.trigger}
        type="button"
        loading={loading}
        onClick={install}
      >
        <Download size={18} aria-hidden="true" />
        تثبيت التطبيق
      </Button>
      <span className={styles.caption}>تحدّي على شاشة هاتفك</span>
      {open &&
        createPortal(
          <Dialog
            open={open}
            onOpenChange={setOpen}
            title="ثبّت تحدّي على جهازك"
            description="أضف تحدّي إلى الشاشة الرئيسية لفتحه مباشرةً مثل تطبيق."
            className={styles.dialog}
          >
            {failed && (
              <p className={styles.notice} role="alert">
                تعذّر فتح نافذة التثبيت. يمكنك استخدام الخطوات التالية.
              </p>
            )}
            <section className={styles.platform} aria-labelledby="install-apple-title">
              <h3 id="install-apple-title">
                <Smartphone size={20} aria-hidden="true" />
                <span dir="ltr">iPhone وiPad</span>
              </h3>
              <ol>
                <li>
                  افتح الموقع في <span dir="ltr">Safari</span>.
                </li>
                <li>
                  اضغط «مشاركة» <Share size={16} aria-hidden="true" /> ثم «إضافة إلى الشاشة
                  الرئيسية».
                </li>
                <li>فعّل «فتح كتطبيق ويب» إن ظهر، ثم اضغط «إضافة».</li>
              </ol>
            </section>
            <section className={styles.platform} aria-labelledby="install-android-title">
              <h3 id="install-android-title">
                <Smartphone size={20} aria-hidden="true" />
                <span dir="ltr">Android</span>
              </h3>
              <ol>
                <li>
                  افتح الموقع في <span dir="ltr">Chrome</span>.
                </li>
                <li>
                  افتح قائمة المتصفح ⋮ واختر «تثبيت التطبيق» أو «الإضافة إلى الشاشة الرئيسية».
                </li>
                <li>أكّد الإضافة من نافذة المتصفح.</li>
              </ol>
            </section>
            <p className={styles.connection}>الألعاب المباشرة تحتاج إلى اتصال بالإنترنت.</p>
            <Button variant="gold" type="button" fullWidth onClick={() => setOpen(false)}>
              فهمت
            </Button>
          </Dialog>,
          document.body,
        )}
    </div>
  );
}
