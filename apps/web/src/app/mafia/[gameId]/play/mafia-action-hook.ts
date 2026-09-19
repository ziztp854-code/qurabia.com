'use client';

import { useRef, useCallback } from 'react';

export function useMafiaServerAction(action: (formData: FormData) => void | Promise<void>) {
  const formRef = useRef<HTMLFormElement>(null);

  const submit = useCallback(
    (fields: Record<string, string>) => {
      const form = formRef.current;
      if (!form) return;
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        data.append(key, value);
      }
      action(data);
    },
    [action],
  );

  return { formRef, submit };
}
