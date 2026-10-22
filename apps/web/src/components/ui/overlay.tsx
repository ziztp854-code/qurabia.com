'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { uiSpring, sheetSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Button } from './button';

type DialogProps = {
  open: boolean; onOpenChange: (open: boolean) => void; title: string;
  description?: string; children: ReactNode; className?: string;
};
const modalStack: HTMLElement[] = [];
let originalOverflow = '';

function DialogSurface({ onOpenChange, title, description, children, className }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const reduce = useReducedMotion();
  const change = useRef(onOpenChange);
  useLayoutEffect(() => { change.current = onOpenChange; }, [onOpenChange]);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!modalStack.length) originalOverflow = document.body.style.overflow;
    modalStack.push(element);
    const items = () => [...element.querySelectorAll<HTMLElement>(
      'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    )].filter((item) => !item.matches(':disabled,[tabindex="-1"],[type="hidden"],[hidden]'));
    const handleKey = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== element) return;
      if (event.key === 'Escape') { event.preventDefault(); change.current(false); }
      if (event.key !== 'Tab') return;
      const controls = items();
      const first = controls[0]; const last = controls.at(-1);
      if (!first) { event.preventDefault(); element.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    const frame = requestAnimationFrame(() => (items()[0] || element).focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKey);
      modalStack.splice(modalStack.indexOf(element), 1);
      if (!modalStack.length) document.body.style.overflow = originalOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const isSheet = className?.includes('bottom-sheet');
  const isDrawer = className?.split(' ').includes('drawer');
  const hidden = reduce ? { opacity: 0 } : isSheet ? { y: '100%', opacity: 1 }
    : isDrawer ? { x: '100%', opacity: 1 } : { scale: 0.98, opacity: 0 };
  return (
    <motion.div className="dialog-backdrop" role="presentation"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onClick={(event) => { if (event.target === event.currentTarget) onOpenChange(false); }}>
      <motion.div ref={panel} className={cn('dialog', className)} role="dialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}
        initial={hidden} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} exit={hidden}
        transition={reduce ? { duration: 0.12 } : isSheet || isDrawer ? sheetSpring : uiSpring}>
        <div className="dialog-header"><div><h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}</div>
          <Button variant="ghost" size="icon" aria-label="إغلاق النافذة" onClick={() => onOpenChange(false)}><X /></Button>
        </div><div className="dialog-content">{children}</div>
      </motion.div>
    </motion.div>
  );
}

export function Dialog(props: DialogProps) {
  return <AnimatePresence>{props.open && <DialogSurface key="dialog" {...props} />}</AnimatePresence>;
}
export function AlertDialog(props: DialogProps) { return <Dialog {...props} className={cn('alert-dialog', props.className)} />; }
export function Drawer(props: DialogProps) { return <Dialog {...props} className={cn('drawer', props.className)} />; }
export function BottomSheet(props: DialogProps) { return <Dialog {...props} className={cn('bottom-sheet', props.className)} />; }

function PopoverPanel({ children, trigger, labelId }: { children: ReactNode; trigger: RefObject<HTMLButtonElement | null>; labelId: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useLayoutEffect(() => {
    const update = () => {
      const box = panel.current?.getBoundingClientRect();
      const anchor = trigger.current?.getBoundingClientRect();
      if (!box || !anchor || !panel.current) return;
      panel.current.style.transformOrigin = `${Math.max(0, Math.min(box.width, anchor.x + anchor.width / 2 - box.x))}px 0px`;
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [trigger]);
  return <motion.div ref={panel} className="floating-panel" role="dialog" aria-labelledby={labelId}
    initial={{ opacity: 0, scale: reduce ? 1 : 0.98 }} animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: reduce ? 1 : 0.98 }} transition={reduce ? { duration: 0.12 } : uiSpring}>
    {children}
  </motion.div>;
}
export function Popover({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className="popover"><button ref={button} id={labelId} type="button" className="button button-ghost button-md"
    aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>{trigger}</button>
    <AnimatePresence>{open && <PopoverPanel key="popover" trigger={button} labelId={labelId}>{children}</PopoverPanel>}</AnimatePresence>
  </div>;
}
export function Tooltip({ label, children }: { label: string; children: ReactNode }) { return <span className="tooltip" data-tooltip={label}>{children}</span>; }
export function DropdownMenu({ label, children }: { label: ReactNode; children: ReactNode }) { return <details className="dropdown"><summary>{label}</summary><div className="floating-panel" role="menu">{children}</div></details>; }
export const ContextMenu = DropdownMenu;
export function CommandMenu({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) { return <Dialog open={open} onOpenChange={onOpenChange} title="الأوامر السريعة"><input autoFocus placeholder="اكتب أمرًا أو ابحث…" aria-label="بحث الأوامر" />{children}</Dialog>; }
