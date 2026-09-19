import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn, formatNumber } from '@/lib/utils';
import { Button } from './button';

export function Avatar({ initials, className }: { initials: string; className?: string }) { return <span className={cn('avatar', className)} aria-label={`الصورة الرمزية: ${initials}`}>{initials}</span>; }
export function AvatarGroup({ values }: { values: string[] }) { return <div className="avatar-group" aria-label={`${formatNumber(values.length)} لاعبين`}>{values.map((value) => <Avatar key={value} initials={value} />)}</div>; }
export function Progress({ value, label = 'التقدم' }: { value: number; label?: string }) { return <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><span style={{ inlineSize: `${Math.min(100, Math.max(0, value))}%` }} /></div>; }
export function Separator() { return <hr className="separator" />; }
export function Accordion({ items }: { items: { title: string; content: ReactNode }[] }) { return <div className="accordion">{items.map((item) => <details key={item.title}><summary>{item.title}</summary><div>{item.content}</div></details>)}</div>; }
export function Timeline({ items }: { items: { title: string; time: string }[] }) { return <ol className="timeline">{items.map((item) => <li key={item.title}><span /><div><strong>{item.title}</strong><small>{item.time}</small></div></li>)}</ol>; }
export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) { return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} data-label={headers[cellIndex]}>{cell}</td>)}</tr>)}</tbody></table></div>; }
export const DataTable = Table;
export function Pagination() { return <nav className="pagination" aria-label="التنقل بين الصفحات"><Button variant="outline" size="icon" aria-label="الصفحة السابقة"><ChevronRight /></Button><Button aria-current="page">1</Button><Button variant="ghost">2</Button><Button variant="ghost">3</Button><Button variant="outline" size="icon" aria-label="الصفحة التالية"><ChevronLeft /></Button></nav>; }
export function Tabs({ tabs, active = 0 }: { tabs: string[]; active?: number }) { return <div className="tabs" role="tablist">{tabs.map((tab, index) => <button key={tab} role="tab" aria-selected={index === active}>{tab}</button>)}</div>; }
export function Stepper({ steps, current }: { steps: string[]; current: number }) { return <ol className="stepper">{steps.map((step, index) => <li key={step} className={index <= current ? 'active' : ''}><span>{index + 1}</span>{step}</li>)}</ol>; }
export function Toast({ children }: { children: ReactNode }) { return <div className="toast" role="status">{children}</div>; }
