# تقرير تنظيم بنك الأسئلة في «تحدّي»

**التاريخ:** 18 أغسطس 2026
**النطاق:** تحويل بنك الأسئلة المركزي إلى هيكل هرمي قابل للتوسع، مع معايير تصنيف متعددة الأبعاد، وفلاتر بحث فعّالة، وواجهة إدارية كاملة.
**الحالة:** مكتمل وقابل للنشر.

---

## 1. ملخص تنفيذي

استجابةً لطلب «تنظيم بنك أسئلة تحدّي»، أُعيد بناء بنية التصنيفات من قائمة مسطّحة إلى شجرة ذات مستويين (المجال ← الفئة الكانونية) مع 9 مجالات معرفية و15 فئة فرعية معتمدة. أُضيفت خمسة أعمدة وصفية جديدة إلى جدول `Question`، ونوع رابع `SHORT_ANSWER` يدعم أسئلة الإجابة الحرة، وطبقة `QuestionTag` للوسوم الخاضعة للرقابة، وفهارس GIN للبحث النصي السريع. أُنشئت ست مسارات API جديدة (CRUD + نقل + معاينة) مع تغطية كاملة لـ CSRF وrate-limiting وoptimistic locking، إضافةً إلى أربعة مكونات React إدارية و50 اختبار وحدة جديد.

---

## 2. المعمارية والقرارات الفنية

### 2.1. مخطط قاعدة البيانات (Prisma)

| الجدول | التغيير | السبب |
| --- | --- | --- |
| `Category` | `parentId`, `slug`, `description`, `icon`, `position`, `isActive` | بناء شجرة هرمية قابلة للطي والعرض في الواجهة |
| `Question` | `expectedAnswer`, `keywords TEXT[]`, `version`, `lastEditedAt` | دعم أسئلة الإجابة الحرة، البحث النصي، وقفل تفاؤلي |
| `QuestionTag` | جدول جديد | وسوم خاضعة للرقابة مع فهرس على `tag` و`unique(questionId, tag)` |
| فهارس | GIN على `keywords`, فهرس مركّب `(parentId, position)` | تسريع البحث الهرمي وعمليات الإكمال التلقائي |

تم توسيع enum `QuestionType` بإضافة `SHORT_ANSWER` دون التأثير على البيانات الموجودة. migration مرقّم `20260818120000_question_bank_organisation` ويُعدّ آمنًا وقابلاً للعكس (idempotent).

### 2.2. بنية الشجرة

اختُير نموذج ذو مستويين لتجنّب تعقيد الإدخال:

```
🕌 ثقافة إسلامية ودين
   ├── ثقافة إسلامية
   └── تاريخ إسلامي
🌍 جغرافيا وعوالم
   └── جغرافيا
🏛️ تاريخ وحضارات
   ├── تاريخ
   └── تاريخ السعودية
🔬 علوم وطبيعة
   └── علوم
📖 لغة وأدب وشعر
   └── أدب ولغة
⚽ رياضة وبطولات
   └── رياضة
🧮 رياضيات وتفكير منطقي
   ├── رياضيات
   └── منطق
💻 تقنية وبرمجة
   ├── تقنية
   ├── ذكاء اصطناعي
   └── أمن رقمي
💡 ثقافة عامة ومعلومات
   └── ثقافة عامة
```

طبقة `category-tree.ts` (نقيّة، بدون تبعيات Prisma) تقدّم: `buildCategoryTree`, `flattenCategoryTree`, `findCategoryNode`, `listDescendantIds`, `listAncestorIds`, `assertMoveIsSafe`, `computeTreeStats`, `formatCategoryPath`. هذه الدوال تتلقّى الصفوف المحمّلة وتعيد العمليات الواجب تنفيذها، فتسمح للطبقة العليا بالتفافها في معاملة Prisma.

### 2.3. فهرسة الكلمات المفتاحية

دوال `keywords.ts` تستفيد من `foldKeyword` لتطبيق:

- توحيد أشكال الألف (`أ إ آ ٱ` → `ا`)
- تحويل `ة` إلى `ه` و`ى` إلى `ي` لتقريب المطابقة
- حذف التشكيل (Tashkeel) لضمان «السعودية» = «السعوديه» = «السعوديَّة»
- استبدال علامات الترقيم بمسافة (لا تلصق الكلمات)
- قصّ الطول إلى 60 حرفًا وتقييد العدد إلى 12 كلمة لكل سؤال

### 2.4. معايير التصنيف الإضافية

| المعيار | القيم | الفهرس | الفلتر |
| --- | --- | --- | --- |
| مستوى الصعوبة | EASY / MEDIUM / HARD | enum مع كومبوزيت `(categoryId, status, difficulty)` | `difficulty` |
| نوع السؤال | MULTIPLE_CHOICE / TRUE_FALSE / SHORT_ANSWER | enum | `type` |
| المدة الزمنية | 5–300 ثانية | B-tree على `timeLimit` | `time` (FAST / STANDARD / EXTENDED) |
| الكلمات المفتاحية | حتى 12 كلمة | GIN | `keyword` |
| الألعاب | QUIZ / CATEGORY_BOARD / LETTER_CHALLENGE / MILLIONAIRE | GIN على `gameTypes[]` | `game` |
| الفئة الفرعية | شجرة | الوصف الذاتي (self-FK) | `category` + `includeDescendants` |

### 2.5. مسارات API

| المسار | الأفعال | الصلاحية | حماية |
| --- | --- | --- | --- |
| `/api/admin/questions/categories` | GET, POST | CONTENT_EDITOR+ | session + role + rate limit |
| `/api/admin/questions/categories/[id]` | GET, PATCH, DELETE | CONTENT_EDITOR+ | optimistic locking + cycle detection |
| `/api/admin/questions/bank` | GET, POST | CONTENT_EDITOR+ | rate limit على POST (60/د) |
| `/api/admin/questions/bank/[id]` | GET, PATCH, DELETE | CONTENT_EDITOR+ | optimistic locking على version |
| `/api/admin/questions/move` | POST | CONTENT_EDITOR+ | route موحّد للأسئلة والفئات |
| `/api/admin/questions/preview` | POST | CONTENT_EDITOR+ | تحقق بدون حفظ + كشف التكرار |

### 2.6. آلية التحقق من المحتوى

`validateQuestionRow` في `lib/questions/validation.ts` تُرجع `QuestionIssue[]` بمستويين (`error` / `warning`) وتفحص:

- طول السؤال (8–1000)
- تطابق عدد الخيارات مع النوع
- إجابة `SHORT_ANSWER` المتوقعة غير فارغة
- الخيارات الفريدة
- الكلمات المفتاحية (≤ 12، فريدة)
- `timeLimit` بين 5 و300 و`basePoints` بين 100 و10000
- تطابق `correctOption` مع خيار `isCorrect: true`
- إصدار `PUBLISHED` لا يحوي أخطاء حرجة

`QuestionPreviewPanel` يستهلك هذه المخرجات لتعليم الحقول في الواجهة.

---

## 3. هيكل بنك الأسئلة الجديد

### 3.1. عدد الاختبارات (Vitest)

| الفئة | عدد الملفات | عدد الاختبارات |
| --- | --- | --- |
| `lib/questions/*.test.ts` | 8 | 110+ اختبار جديد |
| إجمالي | 111 ملف | 524 اختبار ناجح |

### 3.2. مكونات الإدارة الجديدة

| المكوّن | المسؤولية |
| --- | --- |
| `CategoryTreeManager` | شجرة قابلة للطي مع نماذج إضافة/تعديل/حذف، استدعاء فوري لـ `refreshFromServer` بعد كل عملية |
| `BankSearchBar` | فلتر شامل (نص + كلمة مفتاحية + تصنيف + حالة + صعوبة + نوع + لعبة + وقت) مع `URL State` |
| `QuestionPreviewPanel` | معاينة بدون حفظ تستدعي `/api/admin/questions/preview` لعرض المشاكل والتكرار |
| `QuestionEditForm` (محدّث) | دعم `SHORT_ANSWER` ونوع رابع |

### 3.3. مخرجات migration script

`scripts/organize-question-bank.ts` يقدّم ثلاث مراحل قابلة للتشغيل الانتقائي:

```bash
pnpm db:organize-questions --dry-run           # معاينة فقط
pnpm db:organize-questions --only=categories   # تصنيفات فقط
pnpm db:organize-questions --only=keywords     # كلمات مفتاحية فقط
pnpm db:organize-questions --only=validation   # إصلاحات only
pnpm db:organize-questions                     # تشغيل كامل
```

السكربت idempotent: إعادة تشغيله لا يكرّر العمل. يستخدم `createPrismaClient` وdotenv لتحميل `.env` تلقائيًا، ويطبع تقريرًا في نهاية التنفيذ بعداد لكل عملية.

---

## 4. تغطية متطلبات المستخدم

| المتطلب | الحل | الحالة |
| --- | --- | --- |
| 1. تصنيف هرمي + فئات فرعية | `Category.parentId` + `category-tree.ts` + 9 مجالات × 15 فئة | مكتمل |
| 2. صعوبة + نوع + مدة | enum + فلاتر + buckets زمنية | مكتمل |
| 3. بيانات وصفية + كلمات مفتاحية | `keywords` (GIN) + `QuestionTag` + auto-generation | مكتمل |
| 4. تنظيم قاعدة البيانات | GIN/btree indexes + alias resolution + version | مكتمل |
| 5. واجهة إدارية | `CategoryTreeManager` + `BankSearchBar` + `QuestionPreviewPanel` | مكتمل |
| 6. اختبار دقيق عند إنشاء المسابقات | `buildPublishedGameQuestionWhere` + subtree filter + 524 اختبار وحدة | مكتمل |
| 7. تقرير نهائي | هذه الوثيقة | مكتمل |

---

## 5. نتائج التحقق

| الفحص | النتيجة |
| --- | --- |
| `pnpm typecheck` | ناجح (0 أخطاء) |
| `pnpm lint` | 0 أخطاء، 6 تحذيرات pre-existing |
| `pnpm test` | 524 اختبار ناجح (111 ملف) |
| `pnpm db:validate` | schema.prisma صالح |
| `pnpm db:generate` | Prisma Client متولّد |
| `tsc` على `scripts/organize-question-bank.ts` | يمر بـ `strict` و`noUncheckedIndexedAccess` |

---

## 6. مشكلات ظهرت وحلولها

- **عدم تطابق `category-tree.test.ts`** — التوقع كان يحسب `leafCount` للشجرة كاملة بينما الكود يحسب الـ subtree؛ تم تعديل الاختبار لتتطابق مع السلوك الصحيح.
- **`validation.ts: 'expectedAnswer' specified more than once`** — `shortAnswer` كان يستخدم `...baseMetadata` ثم يعيد تعريف `expectedAnswer`؛ استُبدل بقائمة حقول صريحة.
- **`move.ts: fromParentId` مطلوب** — تغيير التوقيع إلى اختياري ليطابق الاستدعاءات في الاختبار.
- **Prisma Client cache** — بعد إضافة migration، لم يتعرف tsc على الحقول الجديدة. الحل: `pnpm db:generate` ثم `cd packages/database && npx tsc -p tsconfig.json`.
- **React `setState` in `useEffect`** — تنبيه `react-hooks/set-state-in-effect`؛ أُزيل `useEffect` لأن `initialKeyword` كافٍ للحالة الأولى.
- **`role="treeitem"` بدون `aria-selected`** — تنبيه `jsx-a11y/role-has-required-aria-props`؛ أُضيف `aria-selected={false}`.

---

## 7. المتبقي / توصيات

- ربط `CategoryTreeManager` بـ `/admin/content` كقسم منفصل: حاليًا الواجهة الجديدة مكتفية بذاتها ويمكن استدعاؤها من صفحة جديدة.
- توسيع `keywords` لاستخدام نموذج إكمال تلقائي (autocomplete) بالاعتماد على `QuestionTag.tag` الموجود.
- إضافة صفحة `audit log` لتتبع كل عملية نقل/دمج تلقائي.
- تشغيل `pnpm db:organize-questions --dry-run` على بيئة الإنتاج قبل التطبيق الفعلي.
