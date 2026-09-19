import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ArchitectureLiveData } from '@/lib/architecture/types';

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => null,
  Handle: () => null,
  MiniMap: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
  ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
  useReactFlow: () => ({ fitView: vi.fn() }),
  ReactFlow: ({ nodes, onNodeClick }: { nodes: Array<{ id: string; data: { label: string } }>; onNodeClick: (event: unknown, node: { id: string }) => void }) => (
    <div data-testid="map">
      {nodes.map((node) => <button type="button" key={node.id} onClick={() => onNodeClick({}, node)}>{node.data.label}</button>)}
    </div>
  ),
}));

import { ArchitectureMap } from './architecture-map';

const liveData: ArchitectureLiveData = {
  available: true,
  generatedAt: '2026-08-15T12:00:00.000Z',
  totals: { total: 12, published: 10, draft: 2, archived: 0, uncategorized: 0 },
  categories: [{
    id: 'sport', name: 'الرياضة', total: 12, published: 10, draft: 2, archived: 0,
    difficulty: { EASY: 4, MEDIUM: 5, HARD: 3 }, games: ['QUIZ'],
  }],
  health: [{ id: 'categories', label: 'ربط التصنيفات', status: 'healthy', message: 'تصنيف حقيقي.', evidence: 'Category → Question.categoryId' }],
  letterCoverage: null,
  boardCoverage: null,
};

describe('ArchitectureMap', () => {
  it('switches to the questions layer and exposes live category data', () => {
    render(<ArchitectureMap liveData={liveData} />);
    fireEvent.click(screen.getByRole('button', { name: 'الأسئلة' }));
    expect(screen.getByRole('button', { name: 'الرياضة' })).toBeInTheDocument();
    expect(screen.getByText('فحوصات مباشرة وآمنة')).toBeInTheDocument();
    expect(screen.getByText('تصنيف حقيقي.')).toBeInTheDocument();
  });

  it('opens the global command palette with Ctrl+K', async () => {
    render(<ArchitectureMap liveData={liveData} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'البحث الشامل في الخريطة' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText('صفحة، لعبة، API، Model…')).toHaveFocus());
  });
});
