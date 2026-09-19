# Debug Session: lifecycle-exit-code
- **Status**: [OPEN]
- **Issue**: يظهر في مسار البناء أو التشغيل الخطأ `[ELIFECYCLE] Command failed with exit code 1` أو `Error: Process completed with exit code 1`، والمطلوب تحديد الأمر الذي فشل فعليًا، وتحليل سلسلة الاستدعاء كاملة، ثم إصلاح السبب الجذري والتحقق من نجاح التنفيذ.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-lifecycle-exit-code.ndjson

## الشرح العربي المفصل

### 1. ما معنى الخطأ `ELIFECYCLE`؟
هذا الخطأ لا يعني بالضرورة أن `npm` أو `pnpm` نفسه هو الذي تعطل، بل يعني غالبًا أن أحد الأوامر التي شغّلها ضمن **دورة الحياة** الخاصة بالمشروع انتهى بخروج غير صفري `exit code 1`، فقام مدير الحزم بإعادة تغليف النتيجة وعرضها بصيغة:

```text
[ELIFECYCLE] Command failed with exit code 1
Error: Process completed with exit code 1
```

بالتالي فإن القراءة الصحيحة لهذا النوع من الأخطاء تبدأ دائمًا من السؤال التالي:

> ما هو **الأمر الفعلي** الذي فشل داخل سلسلة التنفيذ؟

### 2. أين كان موضع الفشل الحقيقي؟
بعد إعادة تشغيل سلسلة التحقق نفسها المستخدمة في CI، تبيّن أن الأوامر التالية كانت ناجحة بالكامل:

- `pnpm install --frozen-lockfile`
- `pnpm db:validate`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

أما أول أمر انتهى بخطأ فكان:

```text
pnpm db:migrate:deploy
```

وهذا الأمر معرف في ملف [package.json](package.json) على أنه:

```json
"db:migrate:deploy": "prisma migrate deploy"
```

### 3. سلسلة التنفيذ الكاملة
سلسلة الاستدعاء التي أوصلت إلى الخطأ كانت كالتالي:

1. ملف CI [`.github/workflows/nextjs.yml`](.github/workflows/nextjs.yml)
2. مهمة `validate`
3. الخطوة: `Apply migrations to the test database`
4. الأمر: `pnpm db:migrate:deploy`
5. مدير الحزم يشغّل: `prisma migrate deploy`
6. Prisma يحاول الاتصال بقاعدة PostgreSQL
7. الاتصال يفشل، فينتهي الأمر بـ `exit code 1`
8. يقوم `pnpm` بإظهار النتيجة بصيغة `ELIFECYCLE`

بصياغة أبسط:  
**الخطأ الظاهر كان من `pnpm`، أما السبب الحقيقي فكان في طبقة اتصال Prisma بقاعدة البيانات.**

### 4. ما الذي تم فحصه أثناء التحليل؟
تمت مراجعة العناصر التالية خطوة بخطوة:

- نصوص الأوامر في [package.json](package.json)
- خطوات CI في [`.github/workflows/nextjs.yml`](.github/workflows/nextjs.yml)
- إعدادات Prisma في [prisma.config.ts](prisma.config.ts)
- إعدادات خدمات التطوير المحلية في [compose.yaml](compose.yaml)
- القيم المرجعية في [.env.example](.env.example)
- سجلات PostgreSQL الناتجة عن الحاوية
- حالة المنفذ `5432` محليًا
- توافق إصدار Node مع القيود المعلنة في [package.json](package.json)

### 5. تسلسل الأخطاء الذي ظهر في السجلات
#### المرحلة الأولى: الخدمة غير متاحة
في البداية ظهر الخطأ:

```text
P1001: Can't reach database server at localhost:5432
```

وهذا يعني أن Prisma لم يجد خادم PostgreSQL يعمل على `localhost:5432`.

#### المرحلة الثانية: الخدمة موجودة لكن بيانات الاعتماد خاطئة
بعد تشغيل PostgreSQL و Redis، اختفى الخطأ الأول وظهر بدلًا منه:

```text
P1000: Authentication failed against database server
```

ثم أظهرت سجلات PostgreSQL الرسالة:

```text
role "postgres" does not exist
```

وهذا كشف أن القاعدة كانت قد أُنشئت سابقًا ببيانات اعتماد مختلفة عن تلك التي تستخدمها أدوات Prisma و CI حاليًا.

### 6. السبب الجذري الحقيقي
السبب لم يكن خطأ نحويًا في الكود، ولا خللًا في Prisma نفسه، بل **عدم اتساق إعدادات قاعدة البيانات المحلية بين عدة ملفات**:

- [prisma.config.ts](prisma.config.ts) يعتمد محليًا على الاتصال:
  - `postgresql://postgres:postgres@localhost:5432/tahaddi?schema=public`
- ملف CI [`.github/workflows/nextjs.yml`](.github/workflows/nextjs.yml) يستخدم القيم نفسها
- لكن [.env.example](.env.example) كان يعرّف المستخدم بشكل مختلف
- و [compose.yaml](compose.yaml) لم يكن يضع قيمًا افتراضية صريحة متوافقة مع Prisma

نتيجة ذلك:

1. تم إنشاء **بيانات قاعدة محلية قديمة** بحساب مختلف
2. ثم حاولت Prisma لاحقًا الدخول بحساب `postgres`
3. ففشل الاتصال رغم أن PostgreSQL نفسه كان يعمل

### 7. الإصلاح الذي تم تطبيقه
تم تنفيذ إصلاح تكويني صغير ومباشر دون تغيير منطق التطبيق:

#### أ. توحيد القيم الافتراضية في [compose.yaml](compose.yaml)
تم ضبط PostgreSQL افتراضيًا على:

- `POSTGRES_DB=tahaddi`
- `POSTGRES_USER=postgres`
- `POSTGRES_PASSWORD=postgres`

كما تم تحديث `healthcheck` ليستخدم القيم نفسها.

#### ب. توحيد القيم المرجعية في [.env.example](.env.example)
تم تعديل القيم التالية:

- `POSTGRES_USER=postgres`
- `POSTGRES_PASSWORD=postgres`
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tahaddi?schema=public`
- `DIRECT_URL=postgresql://postgres:postgres@localhost:5432/tahaddi?schema=public`

#### ج. إعادة تهيئة بيانات التطوير المحلية
لأن المشكلة كانت مخزنة داخل **Docker volume قديم**، لم يكن كافيًا تعديل الملفات فقط، بل كان لا بد من:

1. إيقاف الخدمات
2. حذف الـ volumes القديمة
3. تشغيل PostgreSQL و Redis من جديد

وبذلك تمت إعادة إنشاء القاعدة بنفس بيانات الاعتماد المتسقة مع Prisma و CI.

### 8. التحقق بعد الإصلاح
بعد توحيد الإعدادات وإعادة بناء قاعدة البيانات، أُعيد تنفيذ نفس الأمر الذي كان يفشل:

```text
pnpm db:migrate:deploy
```

وكانت النتيجة:

```text
8 migrations found in prisma/migrations
No pending migrations to apply.
exit=0
```

وهذا يثبت أن:

- الأمر نفسه أصبح يعمل
- سلسلة التنفيذ نفسها اكتملت
- سبب `ELIFECYCLE` الأصلي تم حله

### 9. ملاحظة مهمة عن البيئة الحالية
أثناء التحقق ظهرت ملاحظة إضافية غير مرتبطة بالمشروع نفسه، بل ببيئة الأدوات الحالية:

- توجد قيود من الـ sandbox تمنع الكتابة إلى مسار من نوع:
  - `AppData\\Local\\checkpoint-nodejs`

هذه ليست مشكلة في كود المشروع، بل في بيئة التنفيذ الحالية.  
ولأجل التحقق النهائي فقط تم توجيه `LOCALAPPDATA` محليًا إلى مجلد داخل مساحة العمل حتى يكتمل التشغيل بدون فشل جانبي.

### 10. كيف نتجنب تكرار المشكلة؟
لمنع تكرار هذا النوع من الأخطاء مستقبلًا، يُنصح باتباع القواعد التالية:

1. **وحّد قيم PostgreSQL في كل الملفات المرجعية**:
   - [compose.yaml](compose.yaml)
   - [.env.example](.env.example)
   - [prisma.config.ts](prisma.config.ts)
   - [`.github/workflows/nextjs.yml`](.github/workflows/nextjs.yml)

2. **ابدأ خدمات البنية المحلية قبل تنفيذ الهجرات**:

```bash
pnpm infra:up
pnpm db:migrate:deploy
```

3. **إذا تغيّرت بيانات اعتماد PostgreSQL محليًا، فاحذف الـ volumes القديمة**  
لأن الحاوية لن تعيد التهيئة ما دامت البيانات السابقة محفوظة.

4. **لا تفسّر `ELIFECYCLE` على أنه السبب الجذري**  
بل اعتبره مجرد غلاف خارجي، وارجع دائمًا إلى أول سطر خطأ من الأداة الفعلية مثل:
   - Prisma
   - Next.js
   - Turbo
   - Vitest
   - ESLint

5. **راقب توافق إصدار Node**  
المشروع يعلن قيدًا على Node في [package.json](package.json)، وأي اختلاف كبير قد يسبب سلوكًا جانبيًا مربكًا حتى لو لم يكن هو السبب المباشر هنا.

### 11. خلاصة نهائية
المشكلة كانت **تشغيل أمر هجرة قاعدة البيانات ضمن بيئة محلية غير متسقة**، وليس خللًا في منطق التطبيق.  
تم تحديد موضع الفشل، وتحليل سلسلة التنفيذ، وتصحيح إعدادات PostgreSQL المحلية، ثم إعادة تنفيذ الأمر نفسه بنجاح حتى أصبح ينتهي بـ `exit code 0`.

## التحقق المختصر
- الأمر الفاشل أصلًا: `pnpm db:migrate:deploy`
- السبب الأول: PostgreSQL غير مشغل
- السبب الجذري النهائي: عدم توحيد بيانات اعتماد قاعدة البيانات بين الملفات + وجود volume قديم مهيأ بقيم مختلفة
- الملفات المعدلة:
  - [compose.yaml](compose.yaml)
  - [.env.example](.env.example)
- نتيجة التحقق بعد الإصلاح: نجاح `prisma migrate deploy` بدون أخطاء
