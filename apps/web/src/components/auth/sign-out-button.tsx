'use client';

import { LogOut } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui';
const subscribe = () => () => {};

export function SignOutButton() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <Button variant="ghost" disabled={!hydrated} onClick={() => signOut({ callbackUrl: '/' })}>
      <LogOut />
      خروج
    </Button>
  );
}
