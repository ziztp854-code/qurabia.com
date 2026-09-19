import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  responses: vi.fn((id: string) => ({ id })),
}));

vi.mock('ai', () => ({
  generateText: mocks.generateText,
  Output: { object: vi.fn((value) => value) },
}));
vi.mock('@ai-sdk/xai', () => ({ xai: { responses: mocks.responses } }));

import {
  generateKnowledgeTower,
  KnowledgeTowerGenerationError,
  KNOWLEDGE_TOWER_FLOORS,
  type KnowledgeCategory,
} from './knowledge-tower-generation';

type Floor = {
  floor: number;
  fact: string;
  category: KnowledgeCategory;
  question: string;
  correctCategory: KnowledgeCategory;
  distractors: KnowledgeCategory[];
  clue: string;
};

function makeFloor(floor: number): Floor {
  return {
    floor,
    fact: 'هذه حقيقة عربية واضحة ومختصرة عن العلم والثقافة.',
    category: 'science',
    question: 'في أي فئة صنّفت هذه الحقيقة؟',
    correctCategory: 'science',
    distractors: ['history', 'culture', 'sport'],
    clue: 'تلميح قصير عن الفئة الصحيحة.',
  };
}

function makeTower() {
  return {
    floors: Array.from({ length: KNOWLEDGE_TOWER_FLOORS }, (_, index) => makeFloor(index + 1)),
  };
}

describe('generateKnowledgeTower', () => {
  beforeEach(() => {
    vi.stubEnv('XAI_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GEMINI_MODEL', '');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('AI_GATEWAY_MODEL', '');
    vi.stubEnv('AI_QUESTIONS_MODEL', '');
    vi.stubEnv('VERCEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('fails safely when no server key is configured', async () => {
    await expect(
      generateKnowledgeTower({ topic: 'العلوم' }),
    ).rejects.toBeInstanceOf(KnowledgeTowerGenerationError);
  });

  it('rejects towers with mismatched floor order', async () => {
    vi.stubEnv('XAI_API_KEY', 'xai-test');
    const tower = makeTower();
    tower.floors[0] = makeFloor(2);
    mocks.generateText.mockResolvedValue({ output: tower });

    await expect(
      generateKnowledgeTower({ topic: 'العلوم' }),
    ).rejects.toThrow();
  });

  it('rejects towers whose correctCategory does not match the fact category', async () => {
    vi.stubEnv('XAI_API_KEY', 'xai-test');
    const tower = makeTower();
    tower.floors[0]!.correctCategory = 'history';
    mocks.generateText.mockResolvedValue({ output: tower });

    await expect(
      generateKnowledgeTower({ topic: 'العلوم' }),
    ).rejects.toThrow();
  });

  it('rejects towers with non-unique category distractors', async () => {
    vi.stubEnv('XAI_API_KEY', 'xai-test');
    const tower = makeTower();
    tower.floors[0]!.distractors = ['history', 'history', 'culture'];
    mocks.generateText.mockResolvedValue({ output: tower });

    await expect(
      generateKnowledgeTower({ topic: 'العلوم' }),
    ).rejects.toThrow();
  });

  it('returns the tower when xAI is configured', async () => {
    vi.stubEnv('XAI_API_KEY', 'xai-test');
    const tower = makeTower();
    mocks.generateText.mockResolvedValue({ output: tower });

    await expect(
      generateKnowledgeTower({ topic: 'العلوم' }),
    ).resolves.toEqual(tower);

    expect(mocks.responses).toHaveBeenCalled();
  });
});
