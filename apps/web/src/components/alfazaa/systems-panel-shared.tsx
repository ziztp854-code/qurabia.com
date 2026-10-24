/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';
import type { AlfazaaState, Command } from '@/lib/alfazaa/domain/types';
import type { GameplayContext, GameplaySnapshot, Reward } from '@/lib/alfazaa/realm/common';
import { systemsCatalog } from '@/lib/alfazaa/realm/systems-catalog';
import { transact } from '@/lib/alfazaa/realm/systems-utils';
import styles from './systems-panel.module.css';
export type SystemsTab =
  'quests' | 'research' | 'troops' | 'bag' | 'craft' | 'shop' | 'progress' | 'events';
export interface SystemsPanelProps {
  state: AlfazaaState;
  send: (command: Command) => Promise<unknown>;
  busy: boolean;
  world?: GameplaySnapshot['world'];
  initialTab?: SystemsTab;
}
export interface SystemsViewProps extends SystemsPanelProps {
  context: GameplayContext;
  query: string;
  page: number;
  setPage: (n: number) => void;
}
const names = new Map(systemsCatalog.items.map((r) => [r.id, r]));
export const quantity = (n: number) =>
  new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 }).format(n);
export const sourceText = (text: string) =>
  text
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ');
export const resourceName = (id: number) =>
  names.get(id)?.name ?? systemsCatalog.arms.find((r) => r.id === id)?.name ?? `عنصر ${id}`;
export const canPay = (balances: Record<string, number>, cost: Reward, count = 1) => {
  try {
    transact(balances, cost, [], count);
    return true;
  } catch {
    return false;
  }
};
export function Resources({ entries, label = 'الموارد' }: { entries: Reward; label?: string }) {
  return (
    <div className={styles.resources} aria-label={label}>
      {entries.length ? (
        entries.map(([id, count], i) => (
          <span key={`${id}:${i}`} title={resourceName(id)}>
            {names.get(id)?.image ? (
              <img src={names.get(id)!.image} width={26} height={26} alt="" loading="lazy" />
            ) : null}
            <b>{quantity(count)}</b>
            <small>{resourceName(id)}</small>
          </span>
        ))
      ) : (
        <small>دون تكلفة موارد</small>
      )}
    </div>
  );
}
export function Action({
  children,
  busy,
  disabled = false,
  onClick,
  label,
}: {
  children: ReactNode;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      className={styles.action}
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
  );
}
export function Pages({
  total,
  page,
  setPage,
}: {
  total: number;
  page: number;
  setPage: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 12)),
    current = Math.min(page, pages - 1);
  return (
    <nav className={styles.pages} aria-label="صفحات النتائج">
      <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>
        السابق
      </button>
      <span>
        {quantity(current + 1)} / {quantity(pages)} · {quantity(total)} نتيجة
      </span>
      <button type="button" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>
        التالي
      </button>
    </nav>
  );
}
export const pageRows = <T,>(rows: T[], page: number) =>
  rows.slice(
    Math.min(page, Math.max(0, Math.ceil(rows.length / 12) - 1)) * 12,
    Math.min(page, Math.max(0, Math.ceil(rows.length / 12) - 1)) * 12 + 12,
  );
export const matches = (query: string, ...values: (string | number)[]) =>
  !query.trim() ||
  values.some((value) =>
    String(value).toLocaleLowerCase('ar').includes(query.trim().toLocaleLowerCase('ar')),
  );
export function Count({
  value,
  setValue,
  label = 'العدد',
}: {
  value: number;
  setValue: (n: number) => void;
  label?: string;
}) {
  return (
    <label className={styles.field}>
      {label}
      <input
        type="number"
        min={1}
        max={100}
        value={value}
        onChange={(e) =>
          setValue(Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))))
        }
      />
    </label>
  );
}
