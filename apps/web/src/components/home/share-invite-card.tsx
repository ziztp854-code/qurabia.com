'use client';

import { AtSign, Check, Copy, Link2, MessageCircle, Send, Users } from 'lucide-react';
import { useState } from 'react';

export function ShareInviteCard({ inviteUrl }: { inviteUrl: string }) {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(inviteUrl);

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <aside className="share-invite-card" aria-labelledby="share-invite-heading">
      <div className="share-invite-heading">
        <Users aria-hidden="true" />
        <div>
          <span>شارك الدعوة</span>
          <h3 id="share-invite-heading">شارك رابط الدعوة</h3>
        </div>
      </div>
      <p>أرسل الرابط إلى أصدقائك للانضمام إلى الغرفة مباشرة.</p>
      <div className="share-invite-control">
        <input aria-label="رابط الدعوة" dir="ltr" value={inviteUrl} readOnly />
        <button type="button" onClick={copyInvite} aria-live="polite">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'تم النسخ' : 'نسخ الرابط'}
        </button>
      </div>
      <span className="share-invite-divider">أو شارك عبر</span>
      <div className="share-invite-socials" aria-label="خيارات مشاركة رابط الدعوة">
        <a
          href={`https://wa.me/?text=${encodedUrl}`}
          target="_blank"
          rel="noreferrer"
          aria-label="واتساب"
        >
          <MessageCircle />
        </a>
        <a
          href={`https://x.com/intent/post?url=${encodedUrl}`}
          target="_blank"
          rel="noreferrer"
          aria-label="إكس"
        >
          <AtSign />
        </a>
        <a
          href={`https://t.me/share/url?url=${encodedUrl}`}
          target="_blank"
          rel="noreferrer"
          aria-label="تيليجرام"
        >
          <Send />
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
          target="_blank"
          rel="noreferrer"
          aria-label="فيسبوك"
        >
          <Users />
        </a>
        <button type="button" onClick={copyInvite} aria-label="نسخ رابط الدعوة">
          <Link2 />
        </button>
      </div>
    </aside>
  );
}
