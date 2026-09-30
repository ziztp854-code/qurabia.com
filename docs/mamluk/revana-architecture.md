# Revana: جرد بنية المصدر المرجعي

النسخة المفحوصة: `26b9e1d6f26f78510fae2728e0e2727c8ee98a95`. المصدر المحلي `_mamluk/revana` مطابق للأصل. اختار المستخدم توسيع محرك تحدي؛ هذا التقرير مرجع دراسة فقط، دون نقل كود أو تحويل Revana.

## البنية والتدفقات

- `index.php` و`routes.ini`: تحميل Composer وFat-Free Framework وإعداد PHP session واتصال DB وحراس المصادقة وCSRF ومسارات وحدات التحكم.
- 24 Controller و34 Service، مع SQL مباشر وModels. `revana.sql` يحتوي 28 جدولًا أساسيًا؛ `MigrationService` يضيف جداول الميزات اللاحقة.
- المدينة تخزّن موارد وإنتاجًا ومباني وجيشًا وترقيات وقائدًا في حقول نصية ذات فهارس مفصولة، وليس في JSON ذي مفاتيح دلالية.
- البناء: Controller → c_queue → QueueService → تحديث المدينة والمكافآت. التدريب والصناعة والترقيات لها طوابير مستقلة.
- الجيش: ArmyController → حساب المسافة وسرعة أبطأ وحدة → a_queue وخصم القوات → معالجة الوصول على الخادم → BattleService أو BarbarianService → طور العودة وتسليم الناجين والغنائم.
- الزمن: تحديث موارد حسب الوقت المنقضي، ومعالجة أثناء الطلبات أو `bin/cron.php` مع GameTickService.
- العرض: قوالب HTML وخدمات JavaScript وAlpine من CDN؛ سبعة ملفات لغة دون العربية.

[المصدر المثبت](https://github.com/unkownpr/Revana/tree/26b9e1d6f26f78510fae2728e0e2727c8ee98a95)، [المخطط](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/revana.sql)، [الطوابير](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/app/Services/QueueService.php).

## جرد الميزات الموجودة في المصدر

| النظام | ملفات الأصل | السلوك الملحوظ |
|---|---|---|
| الحسابات | AuthService، UserService، UserRole | كلمة مرور bcrypt، أدوار، حقول قفل دخول |
| المدن والخريطة | TownService، MapService | ملكية وعاصمة وسكان وإحداثيات واستيطان ومسافات |
| الموارد | ResourceService | غذاء/خشب/حجر/حديد/ذهب، مخازن وإعاشة وإنتاج |
| المباني | BuildingService، buildings، c_queue | تعريفات بحسب الفصيل ومتطلبات وترقية مؤجلة |
| الوحدات | ArmyService، units، weapons | تدريب وصناعة سلاح وترقيات |
| القتال | BattleService، reports | تشكيلات وخسائر وغنائم واستطلاع |
| القائد | towns.general، ArmyController | ترقية وحدة إلى قائد بمستوى وخبرة وثلاث تشكيلات |
| الحصار | BattleService | خفض مستوى مبنى عشوائي بعد انتصار؛ لا حصار متدرج |
| الحلف والدبلوماسية | AllianceService، AllianceWarService | عضوية واتفاقات وحروب موقوتة ومساهمات |
| السوق | TradeService، t_queue | عروض ونقل وتجارة NPC وتوافر تجار |
| التقدم | MissionService، WeeklyMissionService، AchievementService | خبرة لاعب ومهام ومكافآت وإنجازات |
| العالم | SeasonService، BarbarianService، BotService | مواسم وترتيب ومعسكرات وبوتات |

`users.level` يمثل صلاحية الحساب، وليس مستوى الخبرة؛ مستوى اللاعب ومستوى القائد مفهومان منفصلان.

## قيود ملحوظة وليست نتائج تشغيل

1. المثبت يتحقق من `devana.sql`، لكن المنشور هو `revana.sql`. `config.example.ini` المذكور في README مفقود.
2. الجداول الاقتصادية الأساسية MyISAM وlatin1؛ المعاملات الموجودة في الخدمات لا تجعل تلك الجداول ذرية. العربية تحتاج معالجة تخزين فعلية.
3. لا lock للاعتماديات ولا إعداد اختبار آلي ظاهر في البحث المحدود.
4. القائد يُرفق بلقطة الحملة، لكن خصم القوات لا يحجزه؛ يجب اختبار الإرسال المتزامن قبل الاعتماد على ذلك التصميم.
5. إرسال الحملة يضع ترقيات صفرية؛ استعلام الطابور لا يقرأ تلك اللقطات، فيعود القتال إلى ترقيات المدينة الحالية.
6. تقدم مهمة الغارة يُزاد عند الإرسال وعند انتصار الوصول، ما يستدعي تحديد حدث مؤهل واحد.
7. tickDueQueues يعود مبكرًا عند عدم وجود مدن ذات أحداث مستحقة، قبل فحوص نهاية الموسم والحرب وإعادة المعسكرات.

[المثبت](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/app/Controllers/InstallController.php)، [الجيش](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/app/Services/ArmyService.php)، [القتال](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/app/Services/BattleService.php)، [التوقيت](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/app/Services/GameTickService.php).

الفحص شمل README والترخيص والمخطط والأجزاء المعنية من bootstrap/controllers/services/cron/layout. لم يشمل كل الشاشات أو حقوق الصور، ولم ينفذ تدفقات Revana. تقرير الأمان مستقل، وخطة التنفيذ تعتمد تحدي.
