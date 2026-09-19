import { AlertCircle, CheckCircle2, Inbox, LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Alert({ variant = 'info', className, ...props }: HTMLAttributes<HTMLDivElement> & { variant?: 'info' | 'success' | 'warning' | 'danger' }) { return <div role="alert" className={cn('alert', `alert-${variant}`, className)} {...props} />; }
export function InlineError({ children }: { children: ReactNode }) { return <span className="inline-error" role="alert"><AlertCircle size={16} />{children}</span>; }
export function Spinner({ label = 'جارٍ التحميل' }: { label?: string }) { return <span className="spinner" role="status"><LoaderCircle className="spin" aria-hidden="true" /><span className="sr-only">{label}</span></span>; }
export function Skeleton({ className }: { className?: string }) { return <span className={cn('skeleton', className)} aria-hidden="true" />; }
export function LoadingOverlay({ label = 'نجهّز الجولة…' }: { label?: string }) { return <div className="state-card" role="status"><Spinner /><h3>{label}</h3></div>; }
export function EmptyState({ title = 'لا توجد بيانات', description = 'ستظهر العناصر هنا عند توفرها.' }: { title?: string; description?: string }) { return <div className="state-card"><Inbox /><h3>{title}</h3><p>{description}</p></div>; }
export function ErrorState({ title = 'تعذّر إكمال الطلب', description = 'تحقق من اتصالك وحاول مرة أخرى.' }: { title?: string; description?: string }) { return <div className="state-card"><AlertCircle className="text-danger" /><h3>{title}</h3><p>{description}</p><Button variant="outline"><RefreshCw />إعادة المحاولة</Button></div>; }
export function SuccessState({ title = 'تم بنجاح' }: { title?: string }) { return <div className="state-card"><CheckCircle2 className="text-success" /><h3>{title}</h3></div>; }
export function OfflineBanner() { return <div className="network-banner" role="status"><WifiOff size={18} />أنت غير متصل. سنحاول الاستعادة تلقائيًا.</div>; }
export function ReconnectingState() { return <div className="network-banner warning" role="status"><Spinner label="إعادة الاتصال" />نعيد الاتصال بالجولة…</div>; }
export const ConfirmationState = SuccessState;
