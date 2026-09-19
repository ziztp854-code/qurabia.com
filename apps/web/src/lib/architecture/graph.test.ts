import { describe, expect, it } from 'vitest';
import { buildArchitectureGraph, connectedNodeIds, type ArchitectureLiveData } from './graph';

const liveData: ArchitectureLiveData = {
  available: true,
  generatedAt: '2026-08-15T00:00:00.000Z',
  totals: { total: 12, published: 7, draft: 4, archived: 1, uncategorized: 0 },
  categories: [
    {
      id: 'sport-id',
      name: 'الرياضة',
      total: 12,
      published: 7,
      draft: 4,
      archived: 1,
      difficulty: { EASY: 3, MEDIUM: 5, HARD: 4 },
      games: ['QUIZ', 'CATEGORY_BOARD'],
    },
  ],
  health: [],
  letterCoverage: null,
  boardCoverage: null,
};

describe('architecture graph', () => {
  it('adds real category summaries only in the questions view', () => {
    expect(buildArchitectureGraph('overview', liveData).nodes.some((node) => node.id === 'category-sport-id')).toBe(false);

    const graph = buildArchitectureGraph('questions', liveData);
    const sport = graph.nodes.find((node) => node.id === 'category-sport-id');
    expect(sport?.data.label).toBe('الرياضة');
    expect(sport?.data.route).toBe('/admin/content?category=sport-id');
    expect(sport?.data.metrics).toContainEqual(['إجمالي الأسئلة', '12']);
  });

  it('traces dependencies and reverse impact from registered edges', () => {
    const graph = buildArchitectureGraph('overview', liveData);
    expect(connectedNodeIds('question-bank', graph.edges, 'impact')).toContain('game-engine');
    expect(connectedNodeIds('realtime', graph.edges, 'dependencies')).toContain('redis');
  });
});
