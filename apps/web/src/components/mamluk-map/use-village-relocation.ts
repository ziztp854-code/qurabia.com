'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { request } from '@/components/kingdoms/use-kingdoms';

const longitude = z.number().finite().min(-180).max(180);
const latitude = z.number().finite().min(-90).max(90);
const eligibilitySchema = z.object({
  worldId: z.string(),
  villageId: z.string(),
  longitude,
  latitude,
  relocationUsed: z.boolean(),
  canRelocate: z.boolean(),
  reason: z.enum(['used', 'unavailable']).nullable(),
  bounds: z
    .object({ west: longitude, south: latitude, east: longitude, north: latitude })
    .refine((bounds) => bounds.west <= bounds.east && bounds.south <= bounds.north),
  revision: z.number().int().nonnegative(),
});
export type VillageRelocationEligibility = z.infer<typeof eligibilitySchema>;

export function useVillageRelocation(worldId: string, villageId: string) {
  const [eligibility, setEligibility] = useState<VillageRelocationEligibility | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [moveError, setMoveError] = useState('');
  const pending = useRef<{ longitude: number; latitude: number; idempotencyKey: string } | null>(
    null,
  );
  const mutation = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    const query = new URLSearchParams({ worldId, villageId });
    void request<unknown>(`/api/kingdoms/world-map/relocate/?${query}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then((result) => {
        const parsed = eligibilitySchema.parse(result);
        if (parsed.worldId !== worldId || parsed.villageId !== villageId)
          throw new Error('تعذر التحقق من إمكانية نقل القرية.');
        if (!controller.signal.aborted) setEligibility(parsed);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('تعذر التحقق من إمكانية نقل القرية.');
      });
    return () => {
      active.current = false;
      controller.abort();
      mutation.current?.abort();
    };
  }, [worldId, villageId, attempt]);
  const retry = () => {
    setError('');
    setEligibility(null);
    setAttempt((value) => value + 1);
  };
  const relocate = async (coordinates: { longitude: number; latitude: number }) => {
    if (mutation.current || !eligibility?.canRelocate || eligibility.relocationUsed) return null;
    const controller = new AbortController();
    mutation.current = controller;
    setSaving(true);
    setMoveError('');
    try {
      if (
        !pending.current ||
        pending.current.longitude !== coordinates.longitude ||
        pending.current.latitude !== coordinates.latitude
      )
        pending.current = { ...coordinates, idempotencyKey: crypto.randomUUID() };
      const result = eligibilitySchema.parse(
        await request<unknown>('/api/kingdoms/world-map/relocate/', {
          method: 'POST',
          credentials: 'same-origin',
          signal: controller.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ worldId, villageId, ...pending.current }),
        }),
      );
      if (
        result.worldId !== worldId ||
        result.villageId !== villageId ||
        !result.relocationUsed ||
        result.canRelocate ||
        result.longitude !== coordinates.longitude ||
        result.latitude !== coordinates.latitude
      )
        throw new Error('تعذر تأكيد نقل القرية. أعد المحاولة.');
      if (!active.current || controller.signal.aborted) return null;
      setEligibility(result);
      setSaved(true);
      return result;
    } catch (failure) {
      if (active.current && !controller.signal.aborted)
        setMoveError(
          failure instanceof Error &&
            !(failure instanceof z.ZodError) &&
            !(failure instanceof TypeError)
            ? failure.message
            : 'تعذر نقل القرية. أعد المحاولة.',
        );
      return null;
    } finally {
      mutation.current = null;
      if (active.current) setSaving(false);
    }
  };
  return { eligibility, error, retry, relocate, saving, saved, moveError };
}
