import type { DatabaseClient } from '@tahaddi/database';
import type { AlfazaaState } from '../domain/types';

// Database boundary double only: these tests do not claim PostgreSQL lock proof.
export function database() {
  const states = new Map<string, { userId: string; state: AlfazaaState; revision: number }>();
  const receipts = new Map<string, { fingerprint: string; result: unknown }>();
  const users = new Map(
    ['alice', 'bob'].map((id) => [id, { id, role: 'USER', status: 'ACTIVE', tokenVersion: 0 }]),
  );
  let now = 100_000;
  const copy = <T>(value: T): T => structuredClone(value);
  const tx = {
    $executeRaw: async (query: TemplateStringsArray, userId: string, state: string) => {
      if (query.join('?').includes('DELETE')) {
        const expired = [...receipts.entries()]
          .filter(([key]) => key.startsWith(`${userId}:`))
          .sort(
            (a, b) =>
              (b[1].result as { revision: number }).revision -
              (a[1].result as { revision: number }).revision,
          )
          .slice(128);
        expired.forEach(([key]) => receipts.delete(key));
        return expired.length;
      }
      if (!states.has(userId))
        states.set(userId, { userId, state: JSON.parse(state), revision: 0 });
      return 1;
    },
    $queryRaw: async (query: TemplateStringsArray, ...values: unknown[]) => {
      const sql = query.join('?');
      if (sql.includes('"User"'))
        return users.has(String(values[0])) ? [copy(users.get(String(values[0])))] : [];
      if (sql.includes('clock_timestamp')) return [{ now: new Date(now) }];
      if (sql.includes('"AlfazaaWorld"')) return [];
      if (sql.includes('"AlfazaaState"'))
        return states.has(String(values[0])) ? [copy(states.get(String(values[0])))] : [];
      throw new Error('Unknown fixture query');
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => copy(users.get(where.id) ?? null),
    },
    alfazaaState: {
      update: async ({
        where,
        data,
      }: {
        where: { userId: string };
        data: { state: AlfazaaState; revision: number };
      }) => {
        const row = { userId: where.userId, ...copy(data) };
        states.set(where.userId, row);
        return row;
      },
    },
    alfazaaCommand: {
      findUnique: async ({ where }: { where: { userId_key: { userId: string; key: string } } }) =>
        copy(receipts.get(`${where.userId_key.userId}:${where.userId_key.key}`) ?? null),
      create: async ({
        data,
      }: {
        data: { userId: string; key: string; fingerprint: string; result: unknown };
      }) => {
        receipts.set(`${data.userId}:${data.key}`, copy(data));
        return data;
      },
    },
  };
  const db = {
    user: tx.user,
    $transaction: async <T>(work: (value: typeof tx) => Promise<T>) => {
      const beforeStates = copy(states);
      const beforeReceipts = copy(receipts);
      try {
        return await work(tx);
      } catch (error) {
        states.clear();
        beforeStates.forEach((value, key) => states.set(key, value));
        receipts.clear();
        beforeReceipts.forEach((value, key) => receipts.set(key, value));
        throw error;
      }
    },
  } as unknown as DatabaseClient;
  return {
    db,
    users,
    setNow: (value: number) => {
      now = value;
    },
  };
}
