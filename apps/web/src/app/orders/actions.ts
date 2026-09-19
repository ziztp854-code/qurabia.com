'use server';

import { revalidatePath } from 'next/cache';
import { planDefinition } from '@tahaddi/domain';
import { requireActiveUser } from '@/lib/auth/session';
import { claimLoyaltyReward, redeemStamp } from '@/lib/subscription/entitlements';

export type OrdersActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

export async function redeemStampAction(
  _previousState: OrdersActionState,
  formData: FormData,
): Promise<OrdersActionState> {
  const user = await requireActiveUser('/orders');
  const code = String(formData.get('code') ?? '');
  if (!code.trim()) {
    return { status: 'error', message: 'أدخل رمز الختم أولًا.' };
  }
  const result = await redeemStamp(user.id, code);
  if (!result.ok) {
    return { status: 'error', message: result.message };
  }
  revalidatePath('/orders');
  return {
    status: 'success',
    message: `رُقّيت إلى رتبة «${planDefinition(result.planCode).name}» حتى ${result.expiresAt.toLocaleDateString('ar')}. أهلًا بك في البلاط!`,
  };
}

export async function claimLoyaltyAction(): Promise<OrdersActionState> {
  const user = await requireActiveUser('/orders');
  const result = await claimLoyaltyReward(user.id);
  revalidatePath('/orders');
  if (!result.ok) {
    return { status: 'error', message: result.message };
  }
  return {
    status: 'success',
    message: `نالوفاءك جائزته: ختم «${planDefinition(result.planCode).name}» مجاني حتى ${result.expiresAt.toLocaleDateString('ar')}.`,
  };
}
