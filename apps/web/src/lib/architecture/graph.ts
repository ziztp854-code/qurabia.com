import { formatNumber } from '@/lib/utils';
import type { Edge, Node } from '@xyflow/react';
import { ARCHITECTURE_REGISTRY } from './registry';
import type {
  ArchitectureLiveData,
  ArchitectureNodeRecord,
  ArchitectureView,
} from './types';

export type { ArchitectureLiveData } from './types';

export type ArchitectureNodeData = ArchitectureNodeRecord & {
  metrics?: Array<[string, string]>;
};

function categoryNodes(liveData: ArchitectureLiveData): ArchitectureNodeRecord[] {
  return liveData.categories.map((category) => ({
    id: `category-${category.id}`,
    label: category.name,
    kind: 'Question Category',
    status: category.total === 0 ? 'ISSUE' : 'ACTIVE',
    description: `تصنيف فعلي من قاعدة البيانات، مرتبط بـ ${formatNumber(category.total)} سؤالًا.`,
    views: ['questions'],
    dependencies: ['question-bank'],
    route: `/admin/content?category=${encodeURIComponent(category.id)}`,
    evidence: ['Category.id from PostgreSQL', 'Question.categoryId aggregate'],
    details: [
      ['إجمالي الأسئلة', String(category.total)],
      ['منشور', String(category.published)],
      ['مسودة', String(category.draft)],
      ['مؤرشف', String(category.archived)],
      ['سهل', String(category.difficulty.EASY)],
      ['متوسط', String(category.difficulty.MEDIUM)],
      ['صعب', String(category.difficulty.HARD)],
      ['الألعاب الموسومة', category.games.join('، ') || 'لا توجد أسئلة منشورة موسومة'],
    ],
  }));
}

function layout(records: ArchitectureNodeRecord[], view: ArchitectureView): Node<ArchitectureNodeData>[] {
  const columns = view === 'questions' ? 4 : view === 'overview' ? 4 : 3;
  const width = view === 'questions' ? 270 : 320;
  const height = 160;
  return records.map((record, index) => {
    const isHub = record.id === 'qurabia';
    const categoryMetric = record.kind === 'Question Category'
      ? record.details?.find(([label]) => label === 'منشور')?.[1]
      : undefined;
    const categoryTotal = record.kind === 'Question Category'
      ? record.details?.find(([label]) => label === 'إجمالي الأسئلة')?.[1]
      : undefined;
    return {
      id: record.id,
      type: 'architecture',
      position: isHub
        ? { x: width * 1.5, y: 210 }
        : { x: (index % columns) * width, y: Math.floor(index / columns) * height },
      data: {
        ...record,
        ...(record.kind === 'Question Category'
          ? { metrics: [['إجمالي الأسئلة', categoryTotal ?? '0'], ['منشور', categoryMetric ?? '0']] }
          : {}),
      },
    };
  });
}

export function buildArchitectureGraph(view: ArchitectureView, liveData: ArchitectureLiveData) {
  const records = [
    ...ARCHITECTURE_REGISTRY.filter((node) => node.views.includes(view)),
    ...(view === 'questions' ? categoryNodes(liveData) : []),
  ];
  const ids = new Set(records.map((node) => node.id));
  const edges: Edge[] = records.flatMap((node) =>
    node.dependencies
      .filter((dependency) => ids.has(dependency))
      .map((dependency) => ({
        id: `${node.id}->${dependency}`,
        source: node.id,
        target: dependency,
        animated: false,
        type: 'smoothstep',
      })),
  );
  return { nodes: layout(records, view), edges };
}

export function connectedNodeIds(
  start: string,
  edges: Edge[],
  mode: 'dependencies' | 'impact' | 'direct',
) {
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of edges) {
      const next =
        mode === 'dependencies'
          ? edge.source === current ? edge.target : null
          : mode === 'impact'
            ? edge.target === current ? edge.source : null
            : edge.source === current ? edge.target : edge.target === current ? edge.source : null;
      if (next && !visited.has(next)) {
        visited.add(next);
        if (mode !== 'direct') queue.push(next);
      }
    }
    if (mode === 'direct') break;
  }
  return [...visited].filter((id) => id !== start);
}
