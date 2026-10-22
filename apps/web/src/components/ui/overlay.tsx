'use client';

import { AnimatePresence, motion, useIsPresent, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { uiSpring, sheetSpring } from '@/lib/motion';
import { lockOverlayScroll } from '@/lib/overlay-scroll-lock';
import { cn } from '@/lib/utils';
import { Button } from './button';

type DialogProps = {
  open: boolean; onOpenChange: (open: boolean) => void; title: string;
  description?: string; children: ReactNode; className?: string; portal?: boolean;
};
const modalStack: HTMLElement[] = [];

function DialogSurface({ onOpenChange, title, description, children, className }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const backdropPressed = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const reduce = useReducedMotion();
  const change = useRef(onOpenChange);
  useLayoutEffect(() => { change.current = onOpenChange; }, [onOpenChange]);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const previous = document.activeElement as HTMLElement | null;
    const releaseScroll = lockOverlayScroll();
    modalStack.push(element);
    const items = () => [...element.querySelectorAll<HTMLElement>(
      'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    )].filter((item) => {
      if (item.matches(':disabled,[tabindex="-1"],[type="hidden"]') || item.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
      if (typeof item.checkVisibility === 'function') return item.checkVisibility({ checkVisibilityCSS: true });
      for (let ancestor: HTMLElement | null = item; ancestor && ancestor !== element; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    });
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
    const containFocus = (event: FocusEvent) => {
      if (modalStack.at(-1) === element && !element.contains(event.target as Node)) (items()[0] || element).focus();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', containFocus);
    const frame = requestAnimationFrame(() => (items()[0] || element).focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', containFocus);
      const index = modalStack.indexOf(element);
      if (index >= 0) modalStack.splice(index, 1);
      const foreground = modalStack.at(-1);
      releaseScroll();
      if (previous?.isConnected && (!foreground || foreground.contains(previous))) previous.focus();
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
      onPointerDown={(event) => { backdropPressed.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (backdropPressed.current && event.target === event.currentTarget) onOpenChange(false);
        backdropPressed.current = false;
      }}>
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
  const presence = <AnimatePresence>{props.open && <DialogSurface key="dialog" {...props} />}</AnimatePresence>;
  return props.portal ? (typeof document === 'undefined' ? null : createPortal(presence, document.body)) : presence;
}
export function AlertDialog(props: DialogProps) { return <Dialog {...props} className={cn('alert-dialog', props.className)} />; }
export function Drawer(props: DialogProps) { return <Dialog {...props} className={cn('drawer', props.className)} />; }
export function BottomSheet(props: DialogProps) { return <Dialog {...props} className={cn('bottom-sheet', props.className)} />; }

type FloatingPanelProps = HTMLMotionProps<'div'> & { anchorRef: RefObject<HTMLButtonElement | null> };
export const FloatingPanel = forwardRef<HTMLDivElement, FloatingPanelProps>(function FloatingPanel(
  { children, anchorRef, className, ...props }, forwardedRef,
) {
  const panel = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const present = useIsPresent();
  const assignRef = useCallback((node: HTMLDivElement | null) => {
    panel.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
  useLayoutEffect(() => {
    const update = () => {
      const box = panel.current?.getBoundingClientRect();
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!box || !anchor || !panel.current) return;
      panel.current.style.transformOrigin = `${Math.max(0, Math.min(panel.current.offsetWidth || box.width, anchor.x + anchor.width / 2 - box.x))}px 0px`;
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (panel.current) observer?.observe(panel.current);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef]);
  return <motion.div {...props} ref={assignRef} className={cn('floating-panel', className)}
    inert={!present} aria-hidden={!present || undefined}
    initial={{ opacity: 0, scale: reduce ? 1 : 0.98 }} animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: reduce ? 1 : 0.98 }} transition={reduce ? { duration: 0.12 } : uiSpring}>
    {children}
  </motion.div>;
});

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
    <AnimatePresence>{open && <FloatingPanel key="popover" anchorRef={button} role="dialog" aria-labelledby={labelId}>{children}</FloatingPanel>}</AnimatePresence>
  </div>;
}
export function Tooltip({ label, children }: { label: string; children: ReactNode }) { return <span className="tooltip" data-tooltip={label}>{children}</span>; }
export function DropdownMenu({ label, children }: { label: ReactNode; children: ReactNode }) { return <details className="dropdown"><summary>{label}</summary><div className="floating-panel" role="menu">{children}</div></details>; }
export const ContextMenu = DropdownMenu;
export function CommandMenu({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) { return <Dialog open={open} onOpenChange={onOpenChange} title="الأوامر السريعة"><input autoFocus placeholder="اكتب أمرًا أو ابحث…" aria-label="بحث الأوامر" />{children}</Dialog>; }
