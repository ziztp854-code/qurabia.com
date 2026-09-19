# تحدّي

منصة عربية للمسابقات والألعاب والأسئلة المباشرة. يضم المستودع البنية التقنية ونظام تصميم عربي RTL، مع مصادقة، بنك أسئلة، منشئ مسابقات، وخدمة زمن حقيقي (Socket.IO) تشغّل عدة ألعاب مباشرة محفوظة في PostgreSQL.

> **التسمية:** اسم المنتج هو **تحدّي (Tahaddi)**. النطاق العام `qurabia.com` وحزمة المهارات `qurabia-*` في `.agents/skills` تشير إلى نفس المنتج.

## المتطلبات

- Node.js 20.19 أو 22.12 أو 24 فأحدث ضمن الإصدارات المدعومة من Prisma 7 (الإصدار المعتمد في `.nvmrc` هو 24).
- pnpm 11.
- Docker Desktop مع Docker Compose.

## بدء التشغيل محليًا

1. أنشئ ملف البيئة المحلي عبر `pnpm setup:env` أو انسخ `.env.example` إلى `.env` يدويًا.
2. ثبّت الحزم: `pnpm install`.
3. شغّل PostgreSQL وRedis: `pnpm infra:up`.
4. تحقق من Prisma: `pnpm db:validate` ثم `pnpm db:generate`.
5. شغّل التطبيقين: `pnpm dev`.

الواجهة تعمل افتراضيًا على `http://localhost:3000`، وفحص خدمة الزمن الحقيقي على `http://localhost:3001/health` مع بقاء المسار المسبق `http://localhost:3001/realtime/health` متاحًا.

صفحة مرجع الواجهة متاحة في `/design-system`. يبدأ مسار الجلسة المباشرة من `/host` بعد تسجيل دخول المضيف، ويفضّل Google OAuth عند توفره. ينضم اللاعب كزائر دون حساب من `/join` أو رابط دعوة مثل `/join/[code]`، ثم ينتقل إلى `/live/[sessionId]/play`.

## الأوامر

| الأمر                                 | الوظيفة                           |
| ------------------------------------- | --------------------------------- |
| `pnpm dev`                            | تشغيل الواجهة وخدمة الزمن الحقيقي |
| `pnpm build`                          | بناء جميع الحزم والتطبيقات        |
| `pnpm lint`                           | فحص ESLint دون تعديل الملفات      |
| `pnpm typecheck`                      | فحص TypeScript الصارم             |
| `pnpm test`                           | تشغيل الاختبارات الحالية          |
| `pnpm --filter @tahaddi/web test:e2e` | تشغيل اختبارات الواجهة الشاملة    |
| `pnpm format:check`                   | فحص تنسيق Prettier                |
| `pnpm db:validate`                    | التحقق من مخطط Prisma             |
| `pnpm db:generate`                    | توليد عميل Prisma                 |
| `pnpm infra:up`                       | تشغيل PostgreSQL وRedis           |
| `pnpm infra:down`                     | إيقاف الخدمات المحلية             |

## هيكل المستودع

```text
apps/
  web/          Next.js App Router وواجهة RTL (BFF وREST غير اللحظي)
  realtime/     NestJS + Socket.IO: الجلسات المباشرة، الوقت، النقاط
  desktop/      تطبيق سطح المكتب (Tauri) لشاشة المضيف والعرض
  mobile/       تطبيق الجوال
packages/
  config/       اسم المنتج والإعدادات المشتركة
  contracts/    عقود zod والأنواع وأسماء الأحداث بين الواجهة والخادم
  domain/       قواعد النطاق ومعادلات النقاط وانتقالات الحالة
  database/     Prisma Client ومحول PostgreSQL
prisma/         المخطط والمهاجرات وملف seed
scripts/        أدوات الصيانة (بنك الأسئلة، Blender، النشر)
tests/load/     اختبارات الحمل k6
docs/           الوثائق والتقارير والملاحظات
.agents/        مهارات وإعدادات أدوات الذكاء الاصطناعي للمطوّرين (ليست جزءًا من المنتج)
```

## ملاحظة عن الاعتماديات الجذرية

اعتماديات تشغيل خدمة الزمن الحقيقي (NestJS، Socket.IO، ioredis، Sentry) معلنة في `package.json` الجذري **عن قصد** حتى يراها مُحزّم دوال Vercel، ويحمي ذلك الاختبار `apps/realtime/src/deployment-config.spec.ts`. لا تنقلها إلى `apps/realtime` دون تعديل الاختبار وإعداد النشر.

## التكامل المستمر (CI)

- **GitLab CI:** `.gitlab-ci.yml` يشغّل على كل Merge Request وعلى الفرع الافتراضي مهام متوازية: التحقق من Prisma، ESLint، TypeScript، Prettier، الاختبارات، Playwright E2E، والبناء، إضافةً إلى قوالب GitLab للفحص الأمني (SAST، Secret Detection، Dependency Scanning).
- **تقارير الاختبارات:** نتائج vitest وPlaywright تُنشر بصيغة JUnit، وتغطية jest لخدمة realtime بصيغة Cobertura، فتظهر مباشرة في واجهة الـ Merge Request.
- **هجرات الإنتاج:** المهمة اليدوية `db:migrate:production` (على `main` فقط) تطبّق `prisma migrate deploy` على قاعدة الإنتاج باستخدام متغير CI المحمي `PRODUCTION_DATABASE_URL`. بناء Vercel للمعاينات (preview) لم يعد ينفّذ الهجرات إلا بضبط `RUN_DB_MIGRATE=1`.
- **GitHub Actions:** `.github/workflows/nextjs.yml` يشغّل نفس السلسلة عند استخدام المرآة على GitHub.

## نظام التصميم

- الهوية والنصوص المركزية: `apps/web/src/config/site.ts`.
- روابط التنقل: `apps/web/src/config/navigation.ts`.
- الألوان والمسافات والحواف والثيم: `apps/web/src/app/globals.css`.
- المكوّنات العامة: `apps/web/src/components/ui`.
- مكوّنات المسابقات: `apps/web/src/components/quiz`.
- الاتجاه البصري العام: `design.md`. الدليل الكامل وقواعد RTL والوصولية: `docs/design-system.md`.

لتغيير الهوية حدّث `site.ts`. لتغيير لون عدّل متغير CSS الدلالي في الوضعين الداكن والفاتح، ولا تستخدم لونًا ثابتًا داخل المكوّن. عند إضافة مكوّن جديد عرّف Props واضحة، أضف حالات الوصولية والاختبار، ثم اعرضه في `/design-system`.

## الخدمات المحلية

- PostgreSQL هو مصدر الحقيقة للبيانات الدائمة.
- Redis مخصص للحالة اللحظية والتنسيق، وليس سجل النتائج النهائي.
- لا يحتوي المستودع على أسرار. ملف `.env` محلي ومهمل من Git.

## حالة المراحل

- [x] المرحلة الأولى: التحليل والتخطيط.
- [x] المرحلة الثانية: تأسيس المشروع.
- [x] المرحلة الثالثة: نظام التصميم والواجهة الأساسية.
- [x] بنك الأسئلة ومنشئ المسابقات.
- [x] مصادقة البريد وكلمة المرور وتدفقات الحساب الأساسية.
- [x] شريحة MVP للجلسة المباشرة: فتح غرفة، انضمام لاعب، سؤال واحد، إجابة محفوظة، وترتيب أساسي.
- [x] بوابات Socket.IO للألعاب المباشرة: الإقصاء (elimination)، غرف المضيف للمخاطرة (risk)، الكلمات المبعثرة، الشطرنج، البلوت، والسلّم.
- [ ] التقارير الختامية الكاملة، لوحة الإدارة الموسّعة، وحزمة العامل الخلفي (worker) للمهام المؤجلة.

راجع `docs/product-requirements.md` للنطاق ومعايير القبول و`docs/architecture.md` للقرارات التقنية.
نتائج التنفيذ والتحقق موثقة في `docs/phase-2-report.md`، ومرجع المرحلة الثالثة في `docs/design-system.md`.
تقارير المراجعة في `docs/reviews/` وملاحظات العمل المؤقتة في `docs/notes/`.
