'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Dialog({ open, onOpenChange, title, description, children, className }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
      if (event.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>('button,a,input,select,textarea,[tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.body.style.overflow = 'hidden'; document.addEventListener('keydown', handleKey);
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('button,input,[tabindex="0"]')?.focus());
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [open, onOpenChange]);
  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={() => onOpenChange(false)}><div ref={panel} className={cn('dialog', className)} role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby={description ? 'dialog-description' : undefined} onMouseDown={(event) => event.stopPropagation()}><div className="dialog-header"><div><h2 id="dialog-title">{title}</h2>{description && <p id="dialog-description">{description}</p>}</div><Button variant="ghost" size="icon" aria-label="إغلاق النافذة" onClick={() => onOpenChange(false)}><X /></Button></div><div className="dialog-content">{children}</div></div></div>;
}

export function AlertDialog(props: Parameters<typeof Dialog>[0]) { return <Dialog {...props} className={cn('alert-dialog', props.className)} />; }
export function Drawer(props: Parameters<typeof Dialog>[0]) { return <Dialog {...props} className={cn('drawer', props.className)} />; }
export function BottomSheet(props: Parameters<typeof Dialog>[0]) { return <Dialog {...props} className={cn('bottom-sheet', props.className)} />; }

export function Popover({ trigger, children }: { trigger: ReactNode; children: ReactNode }) { const [open, setOpen] = useState(false); return <div className="popover"><button type="button" className="button button-ghost button-md" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>{trigger}</button>{open && <div className="floating-panel" role="dialog">{children}</div>}</div>; }
export function Tooltip({ label, children }: { label: string; children: ReactNode }) { return <span className="tooltip" data-tooltip={label}>{children}</span>; }
export function DropdownMenu({ label, children }: { label: ReactNode; children: ReactNode }) { return <details className="dropdown"><summary>{label}</summary><div className="floating-panel" role="menu">{children}</div></details>; }
export const ContextMenu = DropdownMenu;
export function CommandMenu({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) { return <Dialog open={open} onOpenChange={onOpenChange} title="الأوامر السريعة"><input autoFocus placeholder="اكتب أمرًا أو ابحث…" aria-label="بحث الأوامر" />{children}</Dialog>; }
