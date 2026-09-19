'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui';
import { issueStampsAction, type StampActionState } from './actions';

const emptyStampState: StampActionState = { status: 'idle', message: '' };
export function IssueStampsForm() {
  const [state, formAction, pending] = useActionState(issueStampsAction, emptyStampState);
  return (
    <form action={formAction} className="stamps-issue-form" aria-label="إصدار أختام">
      <div className="stamps-issue-grid">
        <label>
          <span>الرتبة</span>
          <select name="planCode" defaultValue="KNIGHT">
            <option value="KNIGHT">الفارس</option>
            <option value="PRINCE">الأمير</option>
            <option value="SULTAN">السلطان</option>
          </select>
        </label>
        <label>
          <span>العدد</span>
          <input name="count" type="number" min={1} max={100} defaultValue={1} />
        </label>
        <label>
          <span>المدة بالأيام (اختياري)</span>
          <input name="durationDays" type="number" min={1} max={365} placeholder="حسب الرتبة" />
        </label>
        <label>
          <span>ملاحظة (اختياري)</span>
          <input name="note" type="text" maxLength={200} placeholder="مثال: دفعة أكتوبر" />
        </label>
      </div>
      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? 'يجري الإصدار…' : 'إصدار الأختام'}
      </Button>
      {state.status !== 'idle' && (
        <p role="status" data-status={state.status} className="stamps-action-message">
          {state.message}
        </p>
      )}
      {state.issuedCodes && state.issuedCodes.length > 0 && (
        <textarea
          className="stamps-issued-codes"
          readOnly
          rows={Math.min(10, state.issuedCodes.length)}
          value={state.issuedCodes.join('\n')}
          aria-label="رموز الأختام الصادرة"
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </form>
  );
}
