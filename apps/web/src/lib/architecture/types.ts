export const ARCHITECTURE_VIEWS = [
  'overview',
  'pages',
  'games',
  'questions',
  'realtime',
  'api',
  'data',
  'admin',
] as const;

export type ArchitectureView = (typeof ARCHITECTURE_VIEWS)[number];
export type ArchitectureNodeKind =
  | 'Page'
  | 'Game'
  | 'System'
  | 'Service'
  | 'API'
  | 'Database'
  | 'Question Category'
  | 'Realtime'
  | 'Admin'
  | 'External';
export type ArchitectureStatus = 'ACTIVE' | 'PARTIAL' | 'PLANNED' | 'ISSUE' | 'UNKNOWN';

export type ArchitectureFile = { label: string; path: string };

export type ArchitectureNodeRecord = {
  id: string;
  label: string;
  kind: ArchitectureNodeKind;
  status: ArchitectureStatus;
  description: string;
  views: ArchitectureView[];
  dependencies: string[];
  evidence: string[];
  route?: string;
  files?: ArchitectureFile[];
  details?: Array<[string, string]>;
  searchTerms?: string[];
};

export type ApiRecord = {
  id: string;
  method: 'GET' | 'POST';
  route: string;
  group: 'Auth' | 'Live' | 'Games' | 'Admin';
  consumer: string;
  service: string;
  source: string;
  auth: string;
  file: string;
};

export type QuestionGameKey =
  | 'QUIZ'
  | 'LADDER'
  | 'CATEGORY_BOARD'
  | 'LETTER_CHALLENGE'
  | 'MILLIONAIRE';

export type CategoryArchitectureSummary = {
  id: string;
  name: string;
  total: number;
  published: number;
  draft: number;
  archived: number;
  difficulty: { EASY: number; MEDIUM: number; HARD: number };
  games: QuestionGameKey[];
};

export type ArchitectureHealth = {
  id: string;
  label: string;
  status: 'healthy' | 'review' | 'problem';
  message: string;
  evidence: string;
};

export type ArchitectureLiveData = {
  available: boolean;
  generatedAt: string;
  totals: {
    total: number;
    published: number;
    draft: number;
    archived: number;
    uncategorized: number;
  };
  categories: CategoryArchitectureSummary[];
  health: ArchitectureHealth[];
  letterCoverage: null;
  boardCoverage: null;
};
