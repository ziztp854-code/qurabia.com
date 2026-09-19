'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Boxes,
  CircleDot,
  Database,
  FileCode2,
  Gamepad2,
  Gauge,
  Globe2,
  Radio,
  ServerCog,
  ShieldCheck,
} from 'lucide-react';
import type { ArchitectureNodeData } from '@/lib/architecture/graph';
import styles from './architecture.module.css';

const kindIcons = {
  Page: Globe2,
  Game: Gamepad2,
  System: Boxes,
  Service: ServerCog,
  API: FileCode2,
  Database,
  'Question Category': CircleDot,
  Realtime: Radio,
  Admin: ShieldCheck,
  External: Gauge,
} as const;

const statusLabels = {
  ACTIVE: 'فعّال',
  PARTIAL: 'جزئي',
  PLANNED: 'مخطط',
  ISSUE: 'مشكلة',
  UNKNOWN: 'غير مؤكد',
} as const;

export function ArchitectureNode({ data, selected }: NodeProps) {
  const node = data as ArchitectureNodeData;
  const Icon = kindIcons[node.kind];
  return (
    <article
      className={`${styles.node} ${selected ? styles.nodeSelected : ''}`}
      data-status={node.status.toLowerCase()}
      dir="rtl"
    >
      <Handle type="target" position={Position.Top} className={styles.handle} />
      <div className={styles.nodeHeader}>
        <span className={styles.nodeIcon}><Icon aria-hidden="true" /></span>
        <span className={styles.status}>{statusLabels[node.status]}</span>
      </div>
      <strong>{node.label}</strong>
      <small>{node.kind}</small>
      {node.metrics && (
        <div className={styles.nodeMetrics}>
          {node.metrics.map(([label, value]) => (
            <span key={label}><b>{value}</b>{label}</span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </article>
  );
}
