import type { ApiRecord, ArchitectureNodeRecord } from './types';

const file = (label: string, path: string) => ({ label, path });

export const API_REGISTRY: ApiRecord[] = [
  {
    id: 'api-auth-get', method: 'GET', route: '/api/auth/[...nextauth]', group: 'Auth',
    consumer: 'صفحات تسجيل الدخول والجلسة', service: 'Auth.js', source: 'Prisma Adapter / JWT',
    auth: 'حسب تدفق Auth.js', file: 'apps/web/src/app/api/auth/[...nextauth]/route.ts',
  },
  {
    id: 'api-auth-post', method: 'POST', route: '/api/auth/[...nextauth]', group: 'Auth',
    consumer: 'Credentials وGoogle OAuth', service: 'Auth.js', source: 'User / Account / Session',
    auth: 'تحقق المزوّد وRate Limit', file: 'apps/web/src/app/api/auth/[...nextauth]/route.ts',
  },
  {
    id: 'api-live-room', method: 'POST', route: '/api/live/[sessionId]/room', group: 'Live',
    consumer: 'المضيف واللاعب في المسابقة المباشرة', service: 'HTTP Live Engine', source: 'PostgreSQL',
    auth: 'Host/Player access token مربوط بالجلسة', file: 'apps/web/src/app/api/live/[sessionId]/room/route.ts',
  },
  {
    id: 'api-live-tick', method: 'POST', route: '/api/live/[sessionId]/tick', group: 'Live',
    consumer: 'واجهة اللعب المباشر', service: 'Live Engine', source: 'LiveSession / LiveParticipant',
    auth: 'Origin نفس الموقع وRate Limit حسب IP؛ الحضور عبر هوية موثقة في room', file: 'apps/web/src/app/api/live/[sessionId]/tick/route.ts',
  },
  {
    id: 'api-mafia-tick', method: 'POST', route: '/api/mafia/[gameId]/tick', group: 'Games',
    consumer: 'لعبة القاتل', service: 'Mafia Engine', source: 'MafiaGame',
    auth: 'جلسة المضيف أو Cookie مشاركة محدود', file: 'apps/web/src/app/api/mafia/[gameId]/tick/route.ts',
  },
  {
    id: 'api-presence-heartbeat', method: 'POST', route: '/api/presence/heartbeat', group: 'Admin',
    consumer: 'نبض الزائر من كل صفحات الواجهة', service: 'Presence Store', source: 'Redis ZSET / HyperLogLog أو ذاكرة العملية',
    auth: 'Origin نفس الموقع وRate Limit حسب IP', file: 'apps/web/src/app/api/presence/heartbeat/route.ts',
  },
  {
    id: 'api-admin-audience', method: 'GET', route: '/api/admin/audience', group: 'Admin',
    consumer: 'رادار الجمهور للمدير والأدمن', service: 'Audience Snapshot', source: 'Presence Store + LiveParticipant + lastLoginAt',
    auth: 'OWNER أو ADMIN عبر الجلسة', file: 'apps/web/src/app/api/admin/audience/route.ts',
  },
];

export const ARCHITECTURE_REGISTRY: ArchitectureNodeRecord[] = [
  {
    id: 'qurabia', label: 'QURABIA · قرابيا', kind: 'System', status: 'ACTIVE',
    description: 'منصة مسابقات وألعاب عربية داخل Monorepo TypeScript.',
    views: ['overview'], dependencies: [], evidence: ['package.json', 'apps/web', 'apps/realtime'],
    files: [file('Workspace', 'package.json'), file('قرار البنية', 'docs/architecture.md')],
  },
  {
    id: 'web', label: 'الواجهة', kind: 'System', status: 'ACTIVE',
    description: 'Next.js App Router للواجهة وBFF وServer Actions.',
    views: ['overview', 'pages'], dependencies: ['auth', 'database'], evidence: ['apps/web/package.json', 'apps/web/src/app'],
    files: [file('App Router', 'apps/web/src/app'), file('Layout', 'apps/web/src/app/layout.tsx')],
  },
  {
    id: 'auth', label: 'الحساب والمصادقة', kind: 'Service', status: 'ACTIVE',
    description: 'Auth.js مع Credentials وGoogle عند تهيئته، وجلسات JWT مرتبطة بحالة المستخدم.',
    views: ['overview', 'pages', 'api', 'admin'], dependencies: ['database'], evidence: ['apps/web/src/lib/auth/options.ts'],
    route: '/auth/sign-in', files: [file('Auth options', 'apps/web/src/lib/auth/options.ts'), file('Session guards', 'apps/web/src/lib/auth/session.ts')],
  },
  {
    id: 'host', label: 'المضيف', kind: 'Page', status: 'ACTIVE',
    description: 'إدارة المسابقات وبدء الجلسات المباشرة.',
    views: ['overview', 'pages', 'realtime'], dependencies: ['auth', 'quiz-builder', 'live-engine'], evidence: ['apps/web/src/app/host/page.tsx'],
    route: '/host', files: [file('Page', 'apps/web/src/app/host/page.tsx'), file('Live actions', 'apps/web/src/app/live/actions.ts')],
  },
  {
    id: 'question-bank', label: 'بنك الأسئلة', kind: 'System', status: 'ACTIVE',
    description: 'مصدر مركزي للأسئلة والتصنيفات والصعوبة والحالة وملاءمة اللعبة.',
    views: ['overview', 'pages', 'questions', 'games', 'data', 'admin'], dependencies: ['database'], evidence: ['prisma/schema.prisma: Category, Question', 'apps/web/src/app/admin/(console)/content/page.tsx'],
    route: '/admin/content', files: [file('Admin page', 'apps/web/src/app/admin/(console)/content/page.tsx'), file('Filters', 'apps/web/src/lib/questions/admin-filters.ts')],
  },
  {
    id: 'question-engine', label: 'محرك الأسئلة', kind: 'Service', status: 'PARTIAL',
    description: 'اختيار الأسئلة المنشورة حسب التصنيف ووسم اللعبة منفذ للمسابقات؛ محركات الألعاب الثلاثة غير منفذة بعد.',
    views: ['overview', 'questions', 'games'], dependencies: ['question-bank'], evidence: ['buildPublishedGameQuestionWhere()', 'apps/web/src/app/quizzes/new/page.tsx'],
    files: [file('Query builder', 'apps/web/src/lib/questions/admin-filters.ts'), file('Quiz builder', 'apps/web/src/app/quizzes/new/page.tsx')],
  },
  {
    id: 'quiz-builder', label: 'منشئ المسابقة', kind: 'Page', status: 'ACTIVE',
    description: 'يختار الأسئلة المنشورة الموسومة QUIZ من البنك المركزي دون نسخها.',
    views: ['pages', 'questions', 'games'], dependencies: ['question-engine', 'auth'], evidence: ['apps/web/src/app/quizzes/new/page.tsx', 'apps/web/src/app/quizzes/actions.ts'],
    route: '/quizzes/new', files: [file('Page', 'apps/web/src/app/quizzes/new/page.tsx'), file('Action', 'apps/web/src/app/quizzes/actions.ts')],
  },
  {
    id: 'game-engine', label: 'محرك الألعاب', kind: 'Service', status: 'ACTIVE',
    description: 'حالة الغرف والجولات والمؤقت والنقاط والنتائج عبر محركات HTTP وSocket.IO الفعلية.',
    views: ['overview', 'games', 'realtime'], dependencies: ['question-bank', 'database', 'redis'], evidence: ['apps/realtime/src/game/game-engine.ts', 'apps/web/src/lib/live/engine.ts'],
    files: [file('Realtime engine', 'apps/realtime/src/game/game-engine.ts'), file('HTTP live engine', 'apps/web/src/lib/live/http-engine.ts')],
  },
  {
    id: 'live-engine', label: 'اللعب المباشر', kind: 'Service', status: 'ACTIVE',
    description: 'تشغيل LiveSession وقبول الإجابات والتقدم وإظهار الترتيب.',
    views: ['overview', 'pages', 'realtime'], dependencies: ['game-engine', 'database'], evidence: ['apps/web/src/lib/live/engine.ts', 'apps/web/src/lib/live/http-engine.ts'],
    files: [file('Engine', 'apps/web/src/lib/live/engine.ts'), file('HTTP Engine', 'apps/web/src/lib/live/http-engine.ts')],
  },
  {
    id: 'realtime', label: 'Realtime', kind: 'Realtime', status: 'ACTIVE',
    description: 'خدمة NestJS مستقلة تستخدم Socket.IO للغرف والأحداث والاستعادة باللقطات.',
    views: ['overview', 'games', 'realtime'], dependencies: ['redis', 'database'], evidence: ['apps/realtime/src/app.module.ts', 'apps/realtime/src/game/game.gateway.ts'],
    files: [file('Gateway', 'apps/realtime/src/game/game.gateway.ts'), file('Service', 'apps/realtime/src/game/game.service.ts')],
  },
  {
    id: 'socket-io', label: 'Socket.IO', kind: 'External', status: 'ACTIVE',
    description: 'نقل أحداث الغرف بين المضيف واللاعبين وخدمة العرض.',
    views: ['realtime'], dependencies: ['redis'], evidence: ['socket.io 4.8.3', 'apps/realtime/src/redis-io.adapter.ts'],
    files: [file('Adapter', 'apps/realtime/src/redis-io.adapter.ts')],
  },
  {
    id: 'redis', label: 'Redis', kind: 'Database', status: 'ACTIVE',
    description: 'حالة الغرف الساخنة والأقفال وRedis Streams Adapter؛ ليس مصدر النتائج الدائم.',
    views: ['overview', 'games', 'realtime', 'data'], dependencies: [], evidence: ['apps/realtime/src/game/redis.service.ts', 'apps/realtime/src/redis-io.adapter.ts'],
    files: [file('State store', 'apps/realtime/src/game/redis.service.ts'), file('Streams adapter', 'apps/realtime/src/redis-io.adapter.ts')],
  },
  {
    id: 'database', label: 'PostgreSQL', kind: 'Database', status: 'ACTIVE',
    description: 'مصدر الحقيقة الدائم للمستخدمين والأسئلة والمسابقات والجلسات والإجابات.',
    views: ['overview', 'questions', 'games', 'realtime', 'data', 'admin'], dependencies: [], evidence: ['prisma/schema.prisma'],
    files: [file('Schema', 'prisma/schema.prisma'), file('Client', 'packages/database/src/client.ts')],
  },
  {
    id: 'api', label: 'API', kind: 'System', status: 'ACTIVE',
    description: 'Route Handlers الفعلية للمصادقة واللعب المباشر والقاتل.',
    views: ['overview', 'api', 'realtime'], dependencies: ['auth', 'database'], evidence: API_REGISTRY.map((api) => api.file),
  },
  {
    id: 'admin', label: 'الإدارة', kind: 'Admin', status: 'ACTIVE',
    description: 'لوحة محمية بأدوار Prisma وصلاحيات خادمية وسجل تدقيق ورادار جمهور حي.',
    views: ['overview', 'pages', 'admin'], dependencies: ['auth', 'database', 'presence'], evidence: ['apps/web/src/lib/auth/authorization.ts', 'apps/web/src/app/admin/(console)'],
    route: '/admin', files: [file('Authorization', 'apps/web/src/lib/auth/authorization.ts'), file('Layout', 'apps/web/src/app/admin/(console)/layout.tsx')],
  },
  {
    id: 'presence', label: 'حضور الجمهور', kind: 'Service', status: 'ACTIVE',
    description: 'نبض صفحات مجهول الهوية يعد المتواجدين الآن والزوّار الفريدين اليوم دون أرقام تجريبية.',
    views: ['overview', 'admin', 'api'], dependencies: ['redis'], evidence: ['apps/web/src/lib/presence/presence-store.ts', 'apps/web/src/app/api/presence/heartbeat/route.ts'],
    route: '/admin/audience', files: [file('Store', 'apps/web/src/lib/presence/presence-store.ts'), file('Radar', 'apps/web/src/components/admin/audience-radar.tsx')],
  },
  ...[
    ['page-home', 'الرئيسية', '/', 'apps/web/src/app/page.tsx'],
    ['page-games', 'كتالوج الألعاب', '/games', 'apps/web/src/app/games/page.tsx'],
    ['page-questions', 'أسئلة المضيف', '/questions', 'apps/web/src/app/questions/page.tsx'],
    ['page-play', 'واجهة اللاعب', '/live/[sessionId]/play', 'apps/web/src/app/live/[sessionId]/play/page.tsx'],
    ['page-broadcast', 'شاشة البث', '/broadcast', 'apps/web/src/app/broadcast/page.tsx'],
    ['page-join', 'الانضمام', '/join/[code]', 'apps/web/src/app/join/[code]/page.tsx'],
  ].map(([id, label, route, path]) => ({
    id, label, route, kind: 'Page' as const, status: 'ACTIVE' as const,
    description: `مسار فعلي: ${route}`, views: ['pages' as const], dependencies: ['web'], evidence: [path], files: [file('Page', path)],
  })),
  ...[
    ['game-parallel', 'العالم الموازي', 'parallel-world', 'apps/realtime/src/special-games/special-games.service.ts'],
    ['game-reverse', 'الزمن المقلوب', 'reverse-time', 'apps/realtime/src/special-games/special-games.service.ts'],
    ['game-infiltrator', 'الدخيل', 'infiltrator', 'apps/realtime/src/special-games/special-games.service.ts'],
    ['game-chess', 'تحدي الشطرنج', 'chess', 'apps/realtime/src/chess/chess.gateway.ts'],
    ['game-memory', 'ومضة الذاكرة', 'memory-flash', 'apps/web/src/components/instant-games/instant-game-room.tsx'],
    ['game-word', 'شفرة الحروف', 'word-code', 'apps/web/src/components/instant-games/game-data.ts'],
    ['game-color', 'خدعة الألوان', 'color-rush', 'apps/web/src/components/instant-games/instant-game-room.tsx'],
  ].map(([id, label, slug, path], index) => ({
    id, label, route: `/games/${slug}`, kind: 'Game' as const, status: 'ACTIVE' as const,
    description: index < 4 ? 'لعبة غرفة مسجلة في SPECIAL_GAME_ORDER وتستخدم Realtime.' : 'لعبة فورية تعمل داخل المتصفح دون Realtime.',
    views: ['games' as const], dependencies: index < 4 ? ['realtime', 'redis'] : ['web'], evidence: [path, 'packages/domain/src/special-games.ts'], files: [file('Implementation', path)],
  })),
  {
    id: 'game-mafia', label: 'القاتل', kind: 'Game', status: 'ACTIVE', description: 'لعبة أدوار منفصلة بحالة دائمة وRoute tick محمي.',
    views: ['games', 'realtime', 'data'], dependencies: ['database', 'api'], evidence: ['apps/web/src/app/mafia', 'prisma/schema.prisma: MafiaGame'], route: '/mafia',
    files: [file('Page', 'apps/web/src/app/mafia/page.tsx'), file('Engine', 'apps/web/src/lib/mafia/engine.ts')],
  },
  {
    id: 'game-category-board', label: 'لوحة الفئات', kind: 'Game', status: 'PARTIAL',
    description: 'وسم CATEGORY_BOARD موجود في السؤال، لكن لا يوجد Route أو محرك Board Value منفذ.',
    views: ['overview', 'games', 'questions'], dependencies: ['question-engine'], evidence: ['prisma/schema.prisma: QuestionGame.CATEGORY_BOARD', 'لا يوجد /games/category-board في App Router'],
  },
  {
    id: 'game-letter-challenge', label: 'تحدي الحروف', kind: 'Game', status: 'PARTIAL',
    description: 'وسم LETTER_CHALLENGE موجود، لكن لا يوجد Route أو حقل Answer Letter أو محرك لعبة منفذ.',
    views: ['overview', 'games', 'questions'], dependencies: ['question-engine'], evidence: ['prisma/schema.prisma: QuestionGame.LETTER_CHALLENGE', 'لا يوجد /games/letter-challenge في App Router'],
  },
  {
    id: 'game-ladder', label: 'لعبة السلم', kind: 'Game', status: 'ACTIVE',
    description: 'غرفة Realtime تسحب أسئلة منشوره موسومة بـ LADDER من البنك المركزي بلا تكرار داخل الغرفة.',
    views: ['overview', 'games', 'questions', 'realtime'], dependencies: ['question-engine', 'realtime', 'redis'],
    evidence: ['prisma/schema.prisma: QuestionGame.LADDER', 'apps/realtime/src/ladder/ladder-question-bank.ts'],
    route: '/games/ladder',
  },
  {
    id: 'game-knowledge-tower', label: 'برج المعرفة', kind: 'Game', status: 'ACTIVE',
    description: 'لعبة تسلّق أسئلة عربية من 12 طابقاً مع أرواح ومحطات أمان.',
    views: ['overview', 'games'], dependencies: ['question-engine'], evidence: ['apps/web/src/app/games/knowledge-tower/page.tsx'],
  },
  ...API_REGISTRY.map((api) => ({
    id: api.id, label: `${api.method} ${api.route}`, kind: 'API' as const, status: 'ACTIVE' as const,
    description: `${api.service} · ${api.auth}`, views: ['api' as const], dependencies: api.group === 'Auth' ? ['auth', 'database'] : ['api', 'database'],
    evidence: [api.file], files: [file('Route Handler', api.file)], details: [
      ['المستهلك', api.consumer],
      ['الخدمة', api.service],
      ['مصدر البيانات', api.source],
      ['الحماية', api.auth],
    ] as Array<[string, string]>,
  })),
  ...[
    ['model-user', 'User', ['auth']], ['model-category', 'Category', ['question-bank']], ['model-question', 'Question', ['model-category']],
    ['model-option', 'QuestionOption', ['model-question']], ['model-quiz', 'Quiz', ['model-question']], ['model-live-session', 'LiveSession', ['model-quiz']],
    ['model-participant', 'LiveParticipant', ['model-live-session']], ['model-answer', 'LiveAnswer', ['model-participant', 'model-question']],
    ['model-mafia', 'MafiaGame', ['game-mafia']], ['model-audit', 'AuditLog', ['admin']],
  ].map(([id, label, dependencies]) => ({
    id: id as string, label: label as string, kind: 'Database' as const, status: 'ACTIVE' as const,
    description: `Prisma Model فعلي: ${label}`, views: ['data' as const], dependencies: dependencies as string[], evidence: [`prisma/schema.prisma: model ${label}`], files: [file('Schema', 'prisma/schema.prisma')],
  })),
  ...[
    ['admin-users', 'إدارة المستخدمين', '/admin/users', 'MANAGE_USERS', 'apps/web/src/app/admin/(console)/users/page.tsx'],
    ['admin-content', 'بنك الأسئلة الإداري', '/admin/content', 'MANAGE_CONTENT', 'apps/web/src/app/admin/(console)/content/page.tsx'],
    ['admin-rooms', 'إدارة الغرف', '/admin/rooms', 'MANAGE_ROOMS', 'apps/web/src/app/admin/(console)/rooms/page.tsx'],
    ['admin-reports', 'التقارير', '/admin/reports', 'VIEW_REPORTS', 'apps/web/src/app/admin/(console)/reports/page.tsx'],
    ['admin-audit', 'سجل التدقيق', '/admin/audit', 'VIEW_AUDIT', 'apps/web/src/app/admin/(console)/audit/page.tsx'],
    ['admin-permissions', 'مصفوفة الصلاحيات', '/admin/permissions', 'Admin console', 'apps/web/src/app/admin/(console)/permissions/page.tsx'],
  ].map(([id, label, route, permission, path]) => ({
    id, label, route, kind: 'Admin' as const, status: 'ACTIVE' as const, description: `مسار إداري محمي: ${permission}`,
    views: ['admin' as const], dependencies: ['admin'], evidence: [path, 'apps/web/src/lib/auth/authorization.ts'], files: [file('Page', path)],
  })),
  ...[
    ['rt-host', 'Host', 'المضيف يرسل أوامر السؤال والإنهاء.'], ['rt-player', 'Players', 'اللاعبون ينضمون ويرسلون الإجابات.'],
    ['rt-display', 'Display', 'شاشة البث تستقبل الحالة والترتيب.'], ['rt-snapshot', 'Game Snapshot', 'لقطة استعادة عند الانضمام وإعادة الاتصال.'],
  ].map(([id, label, description]) => ({
    id, label, description, kind: 'Realtime' as const, status: 'ACTIVE' as const, views: ['realtime' as const],
    dependencies: id === 'rt-host' || id === 'rt-player' ? ['socket-io'] : ['realtime'], evidence: ['apps/realtime/src/game/game.gateway.ts', 'packages/contracts/src/index.ts'],
  })),
];

export const REALTIME_EVENTS = [
  'game:join', 'game:snapshot', 'question:start', 'question:started', 'answer:submit',
  'answer:accepted', 'answer:rejected', 'question:stats', 'question:revealed',
  'leaderboard:shown', 'game:finish', 'game:finished', 'clock:ping', 'clock:pong',
] as const;
