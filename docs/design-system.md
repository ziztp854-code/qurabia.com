# نظام تصميم تحدّي

## فلسفة التصميم

نظام تحدّي واجهة عربية RTL موجهة للمسابقات الحية. يجمع بين خلفية بنفسجية عميقة، والبنفسجي الكهربائي للإجراء، والبرتقالي الدافئ للإنجاز والقرارات المهمة. جميع المكوّنات دلالية، قابلة لإعادة الاستخدام، وتعمل في الوضعين الداكن والفاتح.

## الخط

الخط الأساسي **Tajawal** ويُحمّل عبر `next/font` بأوزان 400 و700 و800 مع `display: swap`. المتغير `--font-arabic` يربط الخط بـ`--font-sans`، مع بديل نظامي آمن. تستخدم النصوص وزن 400، والعناوين 800، والتأكيدات 700.

## الألوان

توجد الرموز في `apps/web/tokens.css` وتستهلكها `src/app/globals.css`. لا تستخدم قيمة لون مباشرة داخل مكوّن. أهم المجموعات:

- الأسطح: `--background`, `--card`, `--popover`, `--muted`.
- النصوص: `--foreground` ونظائر `*-foreground`.
- الأفعال والحالات: `--primary`, `--success`, `--danger`, `--warning`, `--info`, `--gold`.
- المسابقة: `--quiz-option-a` حتى `--quiz-option-d`، و`--quiz-correct`, `--quiz-wrong`، وحالات المؤقت.

يكون الوضع الداكن افتراضيًا. يدعم `ThemeProvider` الوضع الفاتح ووضع النظام، يحفظ الاختيار في `localStorage`، ويستخدم سكربتًا مبكرًا في `<head>` لمنع الوميض.

## المسافات والحواف والظلال

السلم من `--space-1` إلى `--space-20`. أنصاف الأقطار `sm/md/lg/xl/full`. الارتفاع التفاعلي الافتراضي 44px على الأقل، والكبير 54px. تستخدم الظلال `--shadow-sm` و`--shadow-lg`، والحاوية `--container`، وطبقات العرض `--z-*`.

## RTL والنص المختلط

- يضبط التخطيط الجذري `lang="ar" dir="rtl"`.
- تستخدم الأنماط `inline-size`, `margin-inline`, `padding-inline`, و`inset-inline`.
- توضع الأرقام والرموز التي يجب أن تبقى مستقرة داخل `dir="ltr"`.
- لا تُعكس أيقونات التشغيل والإيقاف. أسهم الانتقال اختيرت وفق سياق الواجهة العربية.

## الوصولية

- لكل حقل Label ورسائل مرتبطة بـ`aria-describedby`.
- الأزرار ذات الأيقونة فقط تحمل `aria-label`.
- `Dialog` يغلق بـEscape، يحجز التركيز، ويعيده إلى العنصر السابق.
- خيارات الإجابة تعمل بالنقر وEnter والمسافة، وتكشف حالتها بـ`aria-pressed`.
- الحالات لا تعتمد على اللون وحده؛ تستخدم نصًا وأيقونة وحالة دلالية.
- جميع الحركات تحترم `prefers-reduced-motion`، وتقبل المكوّنات المهمة تعطيل الحركة صراحة.

## الحركة

القيم المركزية في `src/lib/motion.ts`: مدد fast/normal/slow/countdown، ومنحنيات موحدة، وVariants للصفحة والبطاقة والنقاط والعد التنازلي. استخدم Framer Motion عند تغير الحالة المهم فقط؛ انتقالات hover الصغيرة تنفذ عبر CSS.

## الاستخدام

```tsx
import { Button, Input } from '@/components/ui';
import { AnswerOption, QuizTimer } from '@/components/quiz';

<Input label="رمز الغرفة" inputMode="numeric" />
<Button variant="gold" size="lg">ابدأ الجولة</Button>
<QuizTimer total={20} remaining={12} mode="horizontal" />
<AnswerOption label="B" text="الجزائر" state="selected" />
```

## المكوّنات

المكوّنات العامة منظمة في `components/ui`: Button، الحقول، البطاقات، Dialog/Drawer/BottomSheet والعناصر العائمة، رسائل النظام، Table، Badge، Avatar، Progress، Tabs، Pagination، Stepper، Accordion، Timeline وSkeleton. مكوّنات المسابقات في `components/quiz`: QuizTimer، QuestionCard، AnswerOption، LeaderboardItem، PlayerJoinCard، RoomCode، ScoreDisplay، CountdownOverlay، WinnerPodium، LiveStatus وQuestionProgress.

## إضافة مكوّن جديد

1. اختر مجلد المجال الصحيح واسم PascalCase للمكوّن وkebab-case للملف.
2. عرّف Props صريحة دون `any`، ومرر `className` للمكوّنات القابلة للتنسيق.
3. استخدم الرموز الدلالية وخصائص CSS المنطقية فقط.
4. غطِّ الحالات: العادي، التركيز، التعطيل، التحميل والخطأ عند انطباقها.
5. أضف التصدير المركزي واختبار العرض والتفاعل وARIA ولوحة المفاتيح.
6. أضف عينة إلى `/design-system` ووثّق أي قرار جديد.

## المسارات المرجعية

- `/design-system`: معرض المكوّنات والثيم.
- `/dashboard`: تخطيط لوحة التحكم.
- `/host`: تخطيط مقدم المسابقة.
- `/broadcast`: تخطيط 16:9 للشاشات والبث.
