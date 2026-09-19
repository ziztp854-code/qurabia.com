# تطبيق المهارات على مشروع تحدّي

## الهدف

هذه الوثيقة تحول نتائج تحليل مستودعي `skills-main` و`claude-code-main` إلى قرارات عملية تناسب مشروع `tahaddi-platform` بدل التعامل معها كقوائم عامة منفصلة عن الواقع التقني للمشروع.

## ملخص تنفيذي

- مشروع تحدّي الحالي يعتمد على:
  - `Next.js` للواجهة وBFF
  - `NestJS + Socket.IO` للزمن الحقيقي
  - `PostgreSQL`
  - `Redis`
  - `Prisma`
  - توثيق وتشغيل موجهين أكثر نحو `Supabase PostgreSQL` و`Vercel`
- لذلك:
  - **مهارات `skills-main` لا تطبق مباشرة كما هي** لأنها موجهة أساسًا إلى Google Cloud وAgent Platform.
  - **يمكن الاستفادة منها كأطر تشغيل ومعمارية وتقييم جاهزية** إذا قرر المشروع استخدام GCP لاحقًا.
  - **مهارات `claude-code-main` أقرب للتطبيق الفوري** على سير تطوير المشروع نفسه، خاصة في الواجهة والتصميم والتنظيم.

## ما تم فهمه عن المشروع قبل المواءمة

بناءً على:

- [README.md](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/README.md)
- [docs/architecture.md](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/docs/architecture.md)
- [design.md](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/design.md)
- [docs/design-system.md](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/docs/design-system.md)
- [docs/phase-4b-supabase-integration.md](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/docs/phase-4b-supabase-integration.md)

فإن مشروع تحدّي:

- منتج عربي RTL بهوية بصرية واضحة وليست واجهة SaaS عامة.
- ما زال في طور تطوير MVP موسع مع تركيز على الجلسات المباشرة.
- يحتاج الانضباط في:
  - جودة الواجهة
  - موثوقية الزمن الحقيقي
  - جاهزية النشر
  - حراسة القرارات المعمارية أثناء التطوير

## المهارات القابلة للتطبيق الآن مباشرة

### 1) `frontend-design`

المصدر:

- [frontend-design / SKILL.md](file:///c:/Users/tkssy/Documents/trae_projects/claude-code-main/plugins/frontend-design/skills/frontend-design/SKILL.md)

سبب الملاءمة:

- المشروع يملك أصلًا هوية تصميم قوية في [design.md](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/design.md).
- هذه المهارة تدعم فكرة الاتجاه البصري الواضح وتمنع إنتاج واجهات عامة أو باهتة.

طريقة التطبيق على تحدّي:

- عند تطوير أي صفحة جديدة في `apps/web` يجب ربطها صراحة بالاتجاه البصري الحالي:
  - Prestige Split
  - Control Deck
  - Live Stage
  - Ceremony Stage
- مراجعة أي مكوّن جديد على أساس:
  - هل يحافظ على RTL من الأصل؟
  - هل يستخدم الـ tokens الحالية بدل ألوان ثابتة؟
  - هل يعبّر عن هوية "تحدّي" بدل مظهر SaaS عام؟

### 2) مهارات الانضباط التطويري الموجودة محليًا في `.claude/skills`

المصادر:

- [explore-codebase](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/.claude/skills/explore-codebase/SKILL.md)
- [review-changes](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/.claude/skills/review-changes/SKILL.md)
- [refactor-safely](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/.claude/skills/refactor-safely/SKILL.md)
- [debug-issue](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/.claude/skills/debug-issue/SKILL.md)

سبب الملاءمة:

- هذه المهارات أصلاً جزء من المشروع، وهي أنسب من نقل مهارات خارجية لا تطابق البنية الحالية.
- تغطي أكثر أربع حاجات متكررة في تحدّي:
  - فهم المناطق المتأثرة
  - مراجعة أثر التعديلات
  - إعادة الهيكلة بأقل أثر جانبي
  - تشخيص أخطاء `ELIFECYCLE` أو الزمن الحقيقي

طريقة التطبيق على تحدّي:

- استخدم `explore-codebase` قبل أي تغيير كبير في `apps/web` أو `apps/realtime`.
- استخدم `review-changes` قبل اعتماد تغييرات تمس `Prisma`, `Socket.IO`, أو طبقة العقود المشتركة.
- استخدم `refactor-safely` عند إعادة تسمية العقود أو نقل المنطق بين `packages/domain` و`packages/contracts`.
- استخدم `debug-issue` عند ظهور أعطال بناء أو مشاكل تدفق حي.

## المهارات التي تصلح كمرجع تكيفي لا كتطبيق مباشر

### 3) مهارات Well-Architected في `skills-main`

المهارات:

- `google-cloud-waf-security`
- `google-cloud-waf-reliability`
- `google-cloud-waf-cost-optimization`
- `google-cloud-waf-operational-excellence`
- `google-cloud-waf-performance-optimization`
- `google-cloud-waf-sustainability`

سبب الملاءمة:

- هذه المهارات ليست مرتبطة بكود معين فقط، بل بمنهجية تقييم.
- يمكن استخدامها كعدسة مراجعة معمارية حتى لو كان النشر الحالي ليس على GCP.

طريقة التكييف على تحدّي:

- **Security**:
  - مراجعة الأسرار والاتصالات بين `DATABASE_URL` و`DIRECT_URL`
  - تأكيد عدم تسريب مفاتيح الحساسة إلى العميل
  - مراجعة صلاحيات صفحات المضيف والإدارة
- **Reliability**:
  - توثيق fallback عند انقطاع Redis أو تأخر PostgreSQL
  - اختبار استعادة الاتصال في Socket.IO
  - مراجعة idempotency في `commandId` و`submissionId`
- **Operational Excellence**:
  - تثبيت مسار تشغيل موحد للبناء والهجرات
  - توحيد خطوات التحقق قبل النشر
- **Performance**:
  - مراجعة أحجام الـ payload في البث الحي
  - تخفيف أي استعلامات مكلفة على لوحات الترتيب
- **Cost**:
  - مفيد لاحقًا إذا توسع النشر السحابي وتعددت الخدمات

### 4) `gcloud` + `cloud-run-basics` + `gke-basics`

سبب الملاءمة:

- ليست مناسبة الآن طالما أن المشروع موثق حول `Vercel` و`Supabase PostgreSQL`.
- لكنها تصبح مفيدة إذا تقرر نقل:
  - `apps/web` إلى Cloud Run
  - `apps/realtime` إلى Cloud Run أو GKE
  - الخدمات الخلفية إلى بيئة GCP كاملة

متى تُستخدم:

- فقط عند وجود قرار صريح بترحيل البنية إلى Google Cloud.

### 5) `cloud-sql-basics`

سبب الملاءمة:

- مناسب فقط إذا قرر الفريق استبدال Supabase PostgreSQL بـ Cloud SQL.
- لا أنصح باستخدامه الآن لأن الوثائق الحالية مبنية أصلًا على Supabase.

## مهارات لا أوصي بتطبيقها حاليًا على تحدّي

### 6) مهارات Agent Platform / Gemini المتقدمة

مثل:

- `agent-platform-deploy`
- `agent-platform-inference`
- `agent-platform-tuning`
- `agent-platform-model-registry`
- `agent-platform-prompt-management`
- `gemini-api`
- `gemini-agents-api`

السبب:

- لا توجد في المشروع الحالي طبقة إنتاجية خاصة بوكلاء Gemini أو Vertex AI.
- إدخالها الآن سيخلق عبئًا تشغيليًا أكبر من الفائدة العملية.

يمكن إعادة فتحها لاحقًا فقط إذا أضيف إلى تحدّي:

- مولد أسئلة ذكي
- مساعد للمضيف
- تقييم تلقائي للأسئلة أو الأداء
- نظام توصيات معتمد على نماذج خارجية

## قرار تطبيقي مقترح للمشروع

### المسار المناسب الآن

1. الاعتماد الفوري على `frontend-design` كعدسة تطوير واجهات.
2. الاعتماد على مهارات `.claude/skills` المحلية في الفهم والمراجعة والتشخيص.
3. استخدام مهارات WAF من `skills-main` كقائمة مراجعة معمارية دورية.
4. تأجيل مهارات GCP التشغيلية إلى حين وجود قرار ترحيل سحابي فعلي.

### المسار غير المناسب الآن

1. إدخال `gcloud` وCloud Run وGKE في سير العمل الحالي بلا قرار بنيوي.
2. استبدال Supabase أو Vercel فقط لأن المهارات موجودة.
3. إدخال Gemini/Agent Platform في المشروع قبل وجود حالة استخدام منتجية واضحة.

## ترجمة عملية إلى مناطق المشروع

### الواجهة `apps/web`

- طبّق مبادئ `frontend-design` على:
  - صفحات الانضمام
  - صفحات المضيف
  - صفحات اللعب المباشر
  - الشاشات الاحتفالية والنتائج
- ارجع دائمًا إلى:
  - [design.md](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/design.md)
  - [docs/design-system.md](file:///c:/Users/tkssy/Documents/trae_projects/tahaddi-platform-main/tahaddi-platform-main/tahaddi-platform/docs/design-system.md)

### الزمن الحقيقي `apps/realtime`

- استخدم عقلية `Reliability` و`Operational Excellence` لمراجعة:
  - state recovery
  - reconnect behavior
  - idempotent commands
  - broadcast consistency

### البيانات والبنية

- استمر على `Prisma + PostgreSQL + Redis` كما هو موثق الآن.
- لا تستخدم مهارات قواعد بيانات GCP إلا مع قرار واضح لتغيير المنصة.

## Checklist مقترحة قبل أي توسعة كبيرة

- هل التغيير يحافظ على الهوية البصرية العربية الحالية؟
- هل يعتمد على بنية المشروع الحالية بدل إدخال منصة سحابية جديدة بلا حاجة؟
- هل تم توثيق أثره على `web` و`realtime` و`packages/contracts`؟
- هل توجد خطة فشل واضحة لو تعطلت Redis أو تأخرت قاعدة البيانات؟
- هل التغيير مناسب للـ MVP الحالي أم يضيف تعقيد منصة مبكرًا؟

## النتيجة

تم "تطبيق" المهارات على مشروع تحدّي على مستوى القرار الهندسي كالتالي:

- **تطبيق مباشر الآن**: `frontend-design` + مهارات `.claude/skills` المحلية.
- **تطبيق تكيفي كمراجعة**: مهارات WAF في `skills-main`.
- **تطبيق مؤجل**: مهارات GCP التشغيلية وAgent Platform.

القاعدة العملية هنا: نأخذ من المهارات ما يخدم تحدّي الآن، لا ما يفرض على المشروع منصة أو تعقيدًا لا يحتاجه.
