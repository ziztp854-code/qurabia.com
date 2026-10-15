'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import admin from '@/components/admin/admin.module.css';
import styles from './openclaw.module.css';

type Proposal = {
  id: string;
  resourceId: string;
  result: 'PENDING' | 'EXECUTED' | 'REJECTED';
  createdAt: string;
  before: { status: string; version: number; lastEditedAt: string | null; prompt?: string };
  after: { status: 'DRAFT' | 'ARCHIVED'; reason: string };
};

const results = { PENDING: 'بانتظار موافقتك', EXECUTED: 'تم التنفيذ', REJECTED: 'مرفوض' };
const endpoint = '/api/admin/openclaw';

export function ApprovalPanel() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setConfirmed([]);
    try {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('load');
      const body = await response.json();
      if (!body.ok || !Array.isArray(body.proposals)) throw new Error('load');
      setProposals(body.proposals);
    } catch {
      setProposals([]);
      setError('تعذر تحميل الطلبات. تحقق من صلاحية جلستك ثم أعد المحاولة.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    if (busy || (decision === 'approve' && !confirmed.includes(id))) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error('decision');
      setMessage(decision === 'approve'
        ? 'تم تنفيذ التغيير الذي وافقت عليه.'
        : 'تم رفض الطلب دون تغيير السؤال.');
    } catch {
      setError('لم يكتمل القرار. قد يكون الطلب منتهيًا أو تغير السؤال أو صلاحية جلستك. راجع القائمة المحدثة.');
    } finally {
      await reload();
      setBusy(false);
    }
  }

  return (
    <div className={admin.section} aria-busy={loading || busy}>
      <header className={admin.sectionHeader}>
        <div>
          <h2>طلبات OpenClaw</h2>
          <p>راجع التغيير ثم وافق على تنفيذه. عرض الطلب لا ينفذه.</p>
        </div>
        <Button variant="outline" disabled={loading || busy} onClick={() => {
          setError(''); setMessage(''); void reload();
        }}>تحديث الطلبات</Button>
      </header>
      <p className={admin.notice}>
        الموافقة متاحة للمالك فقط، وتنتهي صلاحية الطلب بعد 15 دقيقة من إنشائه.
        يمكن تحويل السؤال إلى مسودة أو مؤرشف فقط. الأسئلة المرتبطة بمسابقة تحتاج مراجعة مستقلة.
      </p>
      {error && <p role="alert" className={admin.notice}>{error}</p>}
      {message && <p role="status">{message}</p>}
      {loading && <p role="status">جارٍ تحميل الطلبات…</p>}
      {!loading && !error && proposals.length === 0 && <p>لا توجد طلبات للمراجعة.</p>}
      {proposals.map((proposal) => (
        <section key={proposal.id} className={admin.panel} aria-label={`الطلب ${proposal.id}`}>
          <h3>{results[proposal.result]}</h3>
          {proposal.before.prompt && <p className={styles.text}>{proposal.before.prompt}</p>}
          <dl className={styles.details}>
            <div><dt>رقم السؤال</dt><dd dir="ltr">{proposal.resourceId}</dd></div>
            <div><dt>رقم الطلب</dt><dd dir="ltr">{proposal.id}</dd></div>
            <div><dt>الحالة السابقة</dt><dd>{proposal.before.status}</dd></div>
            <div><dt>الحالة المطلوبة</dt><dd>{proposal.after.status}</dd></div>
            <div><dt>إصدار السؤال</dt><dd>{proposal.before.version}</dd></div>
            <div><dt>آخر تعديل للسؤال (UTC)</dt><dd dir="ltr">{proposal.before.lastEditedAt || '—'}</dd></div>
            <div><dt>وقت إنشاء الطلب (UTC)</dt><dd dir="ltr">{proposal.createdAt}</dd></div>
            <div><dt>سبب التغيير المقترح</dt><dd className={styles.text}>{proposal.after.reason}</dd></div>
          </dl>
          {proposal.result === 'PENDING' && (
            <div className={styles.decision}>
              <label className={styles.confirm}>
                <input type="checkbox" checked={confirmed.includes(proposal.id)} disabled={busy || loading}
                  onChange={(event) => setConfirmed((previous) => event.target.checked
                    ? [...previous, proposal.id] : previous.filter((id) => id !== proposal.id))} />
                راجعت السؤال والحالتين وأوافق على تنفيذ هذا التغيير المحدد.
              </label>
              <div className={admin.tableActions}>
                <Button variant="gold" disabled={busy || loading || !confirmed.includes(proposal.id)}
                  onClick={() => void decide(proposal.id, 'approve')}>الموافقة وتنفيذ التغيير</Button>
                <Button variant="outline" disabled={busy || loading}
                  onClick={() => void decide(proposal.id, 'reject')}>رفض الطلب</Button>
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
