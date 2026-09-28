'use client';

import type { ReactNode, FormEvent } from 'react';
import { Button, Input } from '@/components/ui';
import {
  resourceKeys,
  type Resources,
  type KingdomsView,
  type Village,
} from '@/lib/kingdoms/types';
import type { KingdomsCommand } from '@/lib/kingdoms/commands';
import styles from './kingdoms.module.css';

export type WorldView = KingdomsView & {
  worldId: string;
  worldName: string;
  revision: number;
  paused: boolean;
};
export type GameProps = {
  view: WorldView;
  village: Village;
  busy: boolean;
  send: (command: KingdomsCommand) => Promise<void>;
};
export const labels = { wood: 'خشب', stone: 'حجر', iron: 'حديد', food: 'غذاء', gold: 'ذهب' };
export const number = (value: number) => Math.floor(value).toLocaleString('ar-SA');
export const date = (value: number) =>
  new Date(value).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' });
export const value = (form: FormData, key: string) => Number(form.get(key) || 0);
export const amounts = (form: FormData, prefix: string): Resources => ({
  wood: value(form, `${prefix}wood`),
  stone: value(form, `${prefix}stone`),
  iron: value(form, `${prefix}iron`),
  food: value(form, `${prefix}food`),
  gold: value(form, `${prefix}gold`),
});

export function ResourceText({ resources }: { resources: Resources }) {
  return (
    <span className={styles.cost}>
      {resourceKeys
        .filter((key) => resources[key] > 0)
        .map((key) => `${number(resources[key])} ${labels[key]}`)
        .join(' · ') || 'لا موارد'}
    </span>
  );
}
export function ResourceFields({ prefix, title }: { prefix: string; title: string }) {
  return (
    <fieldset className={styles.panel}>
      <legend>{title}</legend>
      <div className={styles.grid}>
        {resourceKeys.map((key) => (
          <Input
            key={key}
            label={labels[key]}
            name={`${prefix}${key}`}
            type="number"
            min="0"
            max="1000000000"
            step="1"
            defaultValue="0"
            required
            dir="ltr"
          />
        ))}
      </div>
    </fieldset>
  );
}
export function CommandForm({
  children,
  onSubmit,
  busy,
  label,
}: {
  children: ReactNode;
  onSubmit: (data: FormData) => void;
  busy: boolean;
  label: string;
}) {
  return (
    <form
      className={styles.stack}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <fieldset
        disabled={busy}
        className={styles.stack}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        {children}
        <Button type="submit" loading={busy}>
          {label}
        </Button>
      </fieldset>
    </form>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
