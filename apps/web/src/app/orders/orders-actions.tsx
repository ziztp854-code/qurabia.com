'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui';
import { claimLoyaltyAction, redeemStampAction, type OrdersActionState } from './actions';
import styles from './page.module.css';

const emptyOrdersState: OrdersActionState = { status: 'idle', message: '' };

export function RedeemStampForm() {
  const [state, formAction, pending] = useActionState(redeemStampAction, emptyOrdersState);
  return (
    <form action={formAction} className={styles['orders-redeem-form']} aria-label="تفعيل ختم دخول">
      <label className={styles['orders-redeem-label']} htmlFor="stamp-code">
        رمز الختم الذهبي
      </label>
      <div className={styles['orders-redeem-row']}>
        <input
          id="stamp-code"
          name="code"
          type="text"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          placeholder="THD-KNT-XXXX-XXXX"
          required
        />
        <Button type="submit" variant="gold" disabled={pending}>
          {pending ? 'يجري التحقق…' : 'تفعيل الختم'}
        </Button>
      </div>
      {state.status !== 'idle' && (
        <p role="status" data-status={state.status} className={styles['orders-action-message']}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function LoyaltyClaimForm({
  hostedCount,
  needed,
}: {
  hostedCount: number;
  needed: number;
}) {
  const [state, formAction, pending] = useActionState(
    async () => claimLoyaltyAction(),
    emptyOrdersState,
  );
  const eligible = hostedCount >= needed;
  return (
    <form action={formAction} className={styles['orders-loyalty-form']} aria-label="مطالبة ختم الوفاء">
      <p className={styles['orders-loyalty-progress']}>
        استضفت <b>{hostedCount}</b> من <b>{needed}</b> جولات مكتملة خلال آخر 30 يومًا
      </p>
      <Button type="submit" variant={eligible ? 'gold' : 'secondary'} disabled={pending || !eligible}>
        {pending ? 'يجري الفحص…' : eligible ? 'المطالبة بختم الوفاء' : 'أكمل الجولات لتستحق الختم'}
      </Button>
      {state.status !== 'idle' && (
        <p role="status" data-status={state.status} className={styles['orders-action-message']}>
          {state.message}
        </p>
      )}
    </form>
  );
}
