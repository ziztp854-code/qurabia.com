'use client';
import { formatNumber } from '@/lib/utils';

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Command,
  ExternalLink,
  FileCode2,
  GitBranch,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildArchitectureGraph,
  connectedNodeIds,
  type ArchitectureNodeData,
} from '@/lib/architecture/graph';
import { ARCHITECTURE_REGISTRY, REALTIME_EVENTS } from '@/lib/architecture/registry';
import type { ArchitectureLiveData, ArchitectureView } from '@/lib/architecture/types';
import { ArchitectureNode } from './architecture-node';
import styles from './architecture.module.css';

const views: Array<{ id: ArchitectureView; label: string }> = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'pages', label: 'الصفحات' },
  { id: 'games', label: 'الألعاب' },
  { id: 'questions', label: 'الأسئلة' },
  { id: 'realtime', label: 'Realtime' },
  { id: 'api', label: 'واجهات API' },
  { id: 'data', label: 'البيانات' },
  { id: 'admin', label: 'الإدارة' },
];

const nodeTypes = { architecture: ArchitectureNode };
const statusLabels = { ACTIVE: 'فعّال', PARTIAL: 'جزئي', PLANNED: 'مخطط', ISSUE: 'مشكلة', UNKNOWN: 'غير مؤكد' } as const;

function searchable(node: ArchitectureNodeData, query: string) {
  const haystack = [node.label, node.kind, node.description, node.route, ...(node.searchTerms ?? []), ...node.evidence]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ar');
  return haystack.includes(query.trim().toLocaleLowerCase('ar'));
}

function MapCanvas({ liveData }: { liveData: ArchitectureLiveData }) {
  const [view, setView] = useState<ArchitectureView>('overview');
  const [selectedId, setSelectedId] = useState<string>('qurabia');
  const [query, setQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [traceMode, setTraceMode] = useState<'off' | 'dependencies' | 'impact'>('off');
  const paletteInput = useRef<HTMLInputElement>(null);
  const { fitView } = useReactFlow();
  const graph = useMemo(() => buildArchitectureGraph(view, liveData), [liveData, view]);
  const activeSelectedId = graph.nodes.some((node) => node.id === selectedId)
    ? selectedId
    : (graph.nodes[0]?.id ?? '');
  const selected = graph.nodes.find((node) => node.id === activeSelectedId)?.data as ArchitectureNodeData | undefined;
  const visibleIds = useMemo(() => {
    if (query.trim()) return new Set(graph.nodes.filter((node) => searchable(node.data, query)).map((node) => node.id));
    if (traceMode !== 'off' && activeSelectedId) {
      return new Set([activeSelectedId, ...connectedNodeIds(activeSelectedId, graph.edges, traceMode)]);
    }
    return null;
  }, [activeSelectedId, graph.edges, graph.nodes, query, traceMode]);

  const displayNodes = useMemo<Node<ArchitectureNodeData>[]>(() => graph.nodes.map((node) => ({
    ...node,
    selected: node.id === activeSelectedId,
    style: { opacity: visibleIds && !visibleIds.has(node.id) ? 0.16 : 1, transition: 'opacity 160ms ease' },
  })), [activeSelectedId, graph.nodes, visibleIds]);
  const displayEdges = useMemo<Edge[]>(() => graph.edges.map((edge) => ({
    ...edge,
    animated: Boolean(visibleIds?.has(edge.source) && visibleIds?.has(edge.target)),
    style: { opacity: visibleIds && (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) ? 0.08 : 0.55 },
  })), [graph.edges, visibleIds]);

  const allNodes = useMemo<ArchitectureNodeData[]>(() => [
    ...ARCHITECTURE_REGISTRY,
    ...buildArchitectureGraph('questions', liveData).nodes
      .filter((node) => node.data.kind === 'Question Category')
      .map((node) => node.data),
  ], [liveData]);
  const paletteResults = useMemo(() => query.trim() ? allNodes.filter((node) => searchable(node, query)).slice(0, 12) : allNodes.slice(0, 12), [allNodes, query]);

  const selectNode = useCallback((node: ArchitectureNodeData) => {
    const nextView = node.views.includes(view) ? view : node.views[0];
    setView(nextView);
    setSelectedId(node.id);
    setPaletteOpen(false);
    setQuery('');
    window.setTimeout(() => void fitView({ nodes: [{ id: node.id }], duration: 500, maxZoom: 1.25 }), 80);
  }, [fitView, view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (paletteOpen) window.setTimeout(() => paletteInput.current?.focus(), 0);
  }, [paletteOpen]);

  return (
    <main className={styles.shell} dir="rtl">
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> خريطة محمية · قراءة فقط</span>
          <h1>بنية قرابيا التفاعلية</h1>
          <p>من الكود إلى البيانات واللعب المباشر — الأدلة الفعلية أولًا.</p>
        </div>
        <div className={styles.heroStats}>
          <span><b>{formatNumber(liveData.totals.total)}</b> سؤال</span>
          <span><b>{formatNumber(liveData.categories.length)}</b> تصنيف</span>
          <span className={liveData.available ? styles.live : styles.offline}>{liveData.available ? 'بيانات حية' : 'البيانات غير متاحة'}</span>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="طبقات الخريطة">
        {views.map((item) => (
          <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => { setView(item.id); setQuery(''); setTraceMode('off'); }}>
            {item.label}
          </button>
        ))}
      </nav>

      <section className={styles.toolbar} aria-label="أدوات الخريطة">
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <span className="sr-only">ابحث في الطبقة الحالية</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في العقد والمسارات…" />
          <kbd>Ctrl K</kbd>
        </label>
        <div className={styles.traceButtons}>
          <button type="button" aria-pressed={traceMode === 'dependencies'} onClick={() => setTraceMode((mode) => mode === 'dependencies' ? 'off' : 'dependencies')}>
            <GitBranch aria-hidden="true" /> الاعتماديات
          </button>
          <button type="button" aria-pressed={traceMode === 'impact'} onClick={() => setTraceMode((mode) => mode === 'impact' ? 'off' : 'impact')}>
            <CircleAlert aria-hidden="true" /> نطاق التأثير
          </button>
          <button type="button" onClick={() => void fitView({ duration: 450, padding: 0.15 })}>ملاءمة الخريطة</button>
        </div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.canvas} aria-label={`خريطة ${views.find((item) => item.id === view)?.label}`}>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            fitView
            fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
            minZoom={0.2}
            maxZoom={1.8}
            nodesDraggable
            nodesConnectable={false}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(206,173,91,.24)" />
            <MiniMap pannable zoomable className={styles.minimap} nodeColor={(node) => node.id === activeSelectedId ? '#00d4ff' : '#cead5b'} />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        </section>
        <aside className={styles.details} aria-live="polite">
          {selected ? (
            <>
              <div className={styles.detailsHeader}>
                <span>{selected.kind}</span>
                <b data-status={selected.status.toLowerCase()}>{statusLabels[selected.status]}</b>
              </div>
              <h2>{selected.label}</h2>
              <p>{selected.description}</p>
              {selected.route && (
                <Link href={selected.route} className={styles.routeLink}>
                  فتح المسار <ExternalLink aria-hidden="true" />
                </Link>
              )}
              {selected.details?.length ? (
                <dl className={styles.definitionList}>
                  {selected.details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                </dl>
              ) : null}
              {selected.files?.length ? (
                <section className={styles.evidence}>
                  <h3><FileCode2 aria-hidden="true" /> ملفات التنفيذ</h3>
                  {selected.files.map((item) => <code key={item.path} title={item.label}>{item.path}</code>)}
                </section>
              ) : null}
              <section className={styles.evidence}>
                <h3><CheckCircle2 aria-hidden="true" /> دليل الحالة</h3>
                <ul>{selected.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
            </>
          ) : <p>اختر عقدة لعرض تفاصيلها.</p>}
        </aside>
      </div>

      {view === 'questions' && (
        <section className={styles.healthSection}>
          <div>
            <span className={styles.eyebrow}>جودة بنك الأسئلة</span>
            <h2>فحوصات مباشرة وآمنة</h2>
          </div>
          <div className={styles.healthGrid}>
            {liveData.health.map((check) => (
              <article key={check.id} data-health={check.status}>
                {check.status === 'healthy' ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
                <div><strong>{check.label}</strong><p>{check.message}</p><small>{check.evidence}</small></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {view === 'realtime' && (
        <section className={styles.eventStrip}>
          <span>أحداث مثبتة في العقود</span>
          <div>{REALTIME_EVENTS.map((event) => <code key={event}>{event}</code>)}</div>
        </section>
      )}

      <footer className={styles.footer}>
        <span>آخر تجميع: {new Date(liveData.generatedAt).toLocaleString('ar-SA-u-nu-latn')}</span>
        <Link href="/admin">العودة للإدارة <ArrowLeft aria-hidden="true" /></Link>
      </footer>

      {paletteOpen && (
        <div className={styles.paletteBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaletteOpen(false); }}>
          <section className={styles.palette} role="dialog" aria-modal="true" aria-label="البحث الشامل في الخريطة">
            <header><Command aria-hidden="true" /><input ref={paletteInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="صفحة، لعبة، API، Model…" /><button type="button" aria-label="إغلاق" onClick={() => setPaletteOpen(false)}><X /></button></header>
            <div>
              {paletteResults.map((node) => (
                <button type="button" key={node.id} onClick={() => selectNode(node)}>
                  <span><strong>{node.label}</strong><small>{node.kind} · {statusLabels[node.status]}</small></span>
                  <ArrowLeft aria-hidden="true" />
                </button>
              ))}
              {!paletteResults.length && <p>لا توجد نتيجة مطابقة.</p>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export function ArchitectureMap({ liveData }: { liveData: ArchitectureLiveData }) {
  return <ReactFlowProvider><MapCanvas liveData={liveData} /></ReactFlowProvider>;
}
