# حدود الميزات والفحص الموجّه

المشروع مقسّم إلى تطبيقات وحزم، لكن بعض الميزات تمتد عبر أكثر من حزمة. ابدأ بالمسارات الخاصة بالميزة، ثم تتبّع الاستدعاءات والعقود المشتركة قبل تعديلها؛ نقل الملفات وحده لا يجعل الميزة مستقلة.

| الميزة | الواجهة | الخدمة اللحظية | العقود وقواعد النطاق |
| --- | --- | --- | --- |
| السلّم | `apps/web/src/app/games/ladder`، `apps/web/src/components/games/ladder`، `apps/web/src/lib/ladder`، وصفحات الإدارة `apps/web/src/app/admin/(console)/ladder` | `apps/realtime/src/ladder` | `packages/contracts/src/ladder*.ts`، `packages/domain/src/ladder.ts` |
| الزر الأسرع | `apps/web/src/app/games/fastest-button`، `apps/web/src/components/games/fastest-button`، `apps/web/src/lib/fastest-button` | `apps/realtime/src/fastest-button` | `packages/contracts/src/fastest-button*.ts`، `packages/domain/src/fastest-button.ts` |

هذه نقاط بداية وليست قائمة حصرية: مثلًا اختيار أسئلة السلّم يستخدم أيضًا `apps/web/src/lib/ai/ladder-bank-selection.ts`، وقد تؤثر التغييرات المشتركة في ألعاب أخرى.

وحدة `apps/realtime/src/infrastructure` تتيح موفّري Redis وقاعدة البيانات للألعاب دون استيراد وحدة اللعبة الأساسية. عمليات Redis الخاصة بكل لعبة موجودة في ملف `*.store.ts` داخل مجلدها، وتستخدم اتصال Redis المشترك. تبقى إدارة الاتصال وتحديد المعدل الموزّع في `RedisService`؛ أي تغيير فيهما يستلزم فحص الألعاب المتأثرة. لاختبارات التخزين مقابل Redis محلي معزول، اضبط `FEATURE_STORES_TEST_REDIS_URL` وشغّل `pnpm --filter @tahaddi/realtime test --runInBand feature-stores`.

أدوات الاتصال المستخدمة عبر الألعاب توضع في `apps/realtime/src/common`؛ مثل محدّد معدل أحداث Socket.IO. لا تضع أداة عامة داخل مجلد لعبة تعتمد عليها ألعاب أخرى.

بعد تثبيت الاعتماديات، ابنِ الحزم المشتركة قبل أول فحص أو بعد تعديلها (ومنها توليد Prisma عند بناء حزمة قاعدة البيانات):

```sh
pnpm --filter @tahaddi/contracts build
pnpm --filter @tahaddi/domain build
pnpm --filter @tahaddi/config build
pnpm --filter @tahaddi/database build
```

يمكن بعدها تشغيل اختبارات الوحدة المرتبطة باسم الميزة من الجذر:

```sh
pnpm test:ladder
pnpm test:fastest-button
```

تبحث هذه الأوامر عن اسم الميزة في مسارات اختبارات Vitest وJest؛ لذلك قد تشمل اختبارات إضافية تطابق الاسم، ولا تضمن اكتشاف اختبار لا يحمل الاسم. وهي لا تشغّل اختبارات Playwright أو فحوص الأنواع والبناء. عند تعديل عقد مشترك أو بنية قاعدة البيانات أو سلوك مشترك، شغّل الفحوص الأوسع ذات الصلة، بما فيها `pnpm test` و`pnpm typecheck` و`pnpm build` عند الحاجة. تعتمد بعض اختبارات الخدمة اللحظية على خدمات أو متغيرات بيئة؛ راجع الاختبار قبل تشغيله.

للميزات الأخرى، يمكن تضييق الفحص مؤقتًا دون تغيير الإعدادات، مثل `pnpm --filter @tahaddi/web test <اسم-الميزة>` أو `pnpm --filter @tahaddi/realtime test --runInBand <اسم-الميزة>`. عند إضافة ميزة، اجمع مكوناتها واختباراتها حسب المجال، وضع العقد المشترك في `packages/contracts` وقواعد النطاق الخالصة في `packages/domain`، وتجنب الاعتماد المباشر على تفاصيل ميزة أخرى. حدّث هذه الخريطة عندما تصبح حدود ميزة أخرى واضحة.
