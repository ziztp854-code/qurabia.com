# تدقيق إعادة الاستخدام: «حرب المماليك»

تاريخ الفحص: 2026-09-30. النطاق: Phase A، مقارنة مصدرية وترخيصية للمستودعات الخمسة المطلوبة قبل تنفيذ نظام القادة. لا يمثل هذا تدقيقًا أمنيًا شاملًا أو تصريحًا بإعادة توزيع أصول لم تُفحص. لم تُنسخ شيفرة أو رسوم أو خطوط أو أصوات من هذه المشاريع إلى Tahaddi.

## القرار التنفيذي

المصدر المعتمد للمنتج هو **محرك الممالك الحالي في Tahaddi/Qurabia**. وصف المرفق له بأنه Revana لا يطابق المصدر الموجود، كما أن المستخدم اختار سابقًا توسيع Tahaddi. نعيد استخدام حركة الجيوش والموارد والتقارير ومعاملات PostgreSQL الموجودة، ونضيف نظام قادة أصليًا داخل هذه العقود. لا نستبدل المحرك أو قاعدة البيانات بمرجع آخر.

ثلاثة مراجع تسمح MIT فيها بإعادة استخدام الشيفرة مع حفظ الإشعارات: Late-Eastern-Han-Dynasty، three-kingdoms-strategy، DeadKingdoms. لكن أشكال الحالة والتوقيت والخرائط تختلف؛ الأصغر والأوضح في Phase B هو تكييف مفاهيم القائد والتخصص والرتبة والتحقق من تكليف الجيش، مع كتابة امتداد متوافق مع Tahaddi. ترخيص Revana يمنع التحويل المطلوب دون إذن مكتوب؛ realm-war يعلن ISC في حزمة الخادم فقط دون ملف ترخيص عام في النسخة المفحوصة، لذلك لا ننقل منه العميل أو الأصول أو الشيفرة في هذا العمل.

لا توجد نسبة قياس موثقة لتغطية «70%» أو غيرها. الجدول أدناه يحدد الأنظمة الموجودة والفجوات بدل استخدام تقدير غير قابل لإعادة الفحص.

## طريقة الفحص والإصدارات المثبتة

تحققنا من وجود المستودعات ومراجع HEAD عبر Git، وقرأنا LICENSE قبل اختيار ملفات الشيفرة عندما كان موجودًا. استخدمنا شجرة GitHub المتكررة الكاملة للبحث عن الترخيص، وقرأنا الملفات المختارة عند commits مثبتة؛ لم نعتمد على اسم المشروع أو وصف README لإثبات وجود نظام. جميع الروابط التالية تربط الملف بالنسخة المفحوصة، ولا تشير إلى فرع متغير.

| المستودع | commit المفحوص | نتيجة التحقق |
|---|---|---|
| [unkownpr/Revana](https://github.com/unkownpr/Revana/tree/26b9e1d6f26f78510fae2728e0e2727c8ee98a95) | `26b9e1d6f26f78510fae2728e0e2727c8ee98a95` | موجود؛ ترخيص مخصص مقيد |
| [CtxPilot/Late-Eastern-Han-Dynasty](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/tree/5ab5d83a680c95e5f2d89834e9aa8460bafc8562) | `5ab5d83a680c95e5f2d89834e9aa8460bafc8562` | موجود؛ MIT وإشعارات أصول واعتماديات منفصلة |
| [cancleeric/three-kingdoms-strategy](https://github.com/cancleeric/three-kingdoms-strategy/tree/26e24124ee4ac6fcd5283da32dd9147990a2005d) | `26e24124ee4ac6fcd5283da32dd9147990a2005d` | موجود؛ MIT |
| [pjj-22/realm-war](https://github.com/pjj-22/realm-war/tree/a6e3fdbd72fbf3639a98e7bc3dee03f6a2b122fb) | `a6e3fdbd72fbf3639a98e7bc3dee03f6a2b122fb` | موجود؛ LICENSE غير موجود، وبيان ISC جزئي للخادم |
| [AlexanderHeffernan/DeadKingdoms](https://github.com/AlexanderHeffernan/DeadKingdoms/tree/aaa0c6710a42ccdb6b962d6a387ec6ff0f916ca0) | `aaa0c6710a42ccdb6b962d6a387ec6ff0f916ca0` | موجود؛ MIT للشيفرة مع شروط أصول مستقلة |

الـ 404 هنا خاص بطلب **ملف** `realm-war/LICENSE` عند commit المحدد؛ ليس ادعاء أن المستودع غير موجود. لا توجد أسماء LICENSE/COPYING/NOTICE في شجرته المتكررة المفحوصة. كذلك لا يوجد package.json في الجذر؛ للحزم ملفاتها تحت server وclient.

## مصفوفة الترخيص وإعادة الاستخدام

| المرجع | هل يسمح النص بنسخ/تعديل الشيفرة؟ | الإسناد وتوثيق التعديل | إلزام نشر المصدر | القرار الحالي |
|---|---|---|---|---|
| Revana | يمنع التعديل والتكييف والترجمة والأعمال المشتقة وإعادة التوزيع دون إذن مكتوب، مع السماح بالتشغيل والنشر بالشروط | حفظ الإشعارات وإسناد مرئي «Powered by Revana» للاستخدام المسموح | لا يمنح النص حق نشر نسخة مشتقة أصلًا؛ لا نفترض أن نشر المصدر يحل القيد | قراءة تقييمية فقط؛ لا استيراد أو تحويل أو توزيع |
| Late-Eastern-Han-Dynasty | MIT يسمح بالنسخ والتعديل والدمج والتوزيع والاستخدام التجاري | Copyright 2026 CtxPilot ونص الإذن في النسخ/الأجزاء المهمة؛ MIT لا يفرض سجل تعديلات، لكن نسجل أصل أي ملف معدل | لا يفرض MIT نشر مصدر Tahaddi | مفاهيم القادة والرتب والحصار؛ لا نقل ملفات في Phase B |
| three-kingdoms-strategy | MIT يسمح بالنسخ والتعديل والدمج والتوزيع والاستخدام التجاري | Copyright 2026 Eric Wang ونص الإذن؛ نسجل التعديلات إذا نقل ملف لاحقًا | لا يفرض MIT نشر مصدر Tahaddi | مفاهيم حدود تقدم البطل ودوال توقيت قابلة للاختبار؛ لا نقل محرك/واجهة |
| realm-war / HexNation | `server/package.json` يعلن ISC؛ لا ملف نص ترخيص عام أو بيان في حزمة العميل المفحوصة | لا نملأ إشعار ISC أو نطاقه تخمينًا؛ نحتاج توضيحًا ونصوص إشعارات صحيحة قبل نقل ملفات | لا توجد هنا قاعدة مثبتة تغطي المشروع كله؛ لا نفترض copyleft أو سماحًا شاملًا | مفاهيم خريطة H3 ورؤية خادمية فقط؛ لا نسخ شيفرة أو أصول |
| DeadKingdoms | MIT يسمح بإعادة استخدام الشيفرة | Copyright 2026 Persistent RTS Arena contributors ونص الإذن؛ شروط الأصول مستقلة | لا يفرض MIT نشر مصدر Tahaddi | مفاهيم ترشيح snapshots والرؤية وHP الأسوار؛ لا نقل الأصول |

مصادر الترخيص: [Revana LICENSE §1–3](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/LICENSE#L6)، [composer.json](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/composer.json#L5)، [CtxPilot LICENSE](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/LICENSE)، [Eric Wang LICENSE](https://github.com/cancleeric/three-kingdoms-strategy/blob/26e24124ee4ac6fcd5283da32dd9147990a2005d/LICENSE)، [realm-war server/package.json:13](https://github.com/pjj-22/realm-war/blob/a6e3fdbd72fbf3639a98e7bc3dee03f6a2b122fb/server/package.json#L13)، [client/package.json](https://github.com/pjj-22/realm-war/blob/a6e3fdbd72fbf3639a98e7bc3dee03f6a2b122fb/client/package.json)، [DeadKingdoms LICENSE](https://github.com/AlexanderHeffernan/DeadKingdoms/blob/aaa0c6710a42ccdb6b962d6a387ec6ff0f916ca0/LICENSE).

هذه حقائق من النصوص وقرار هندسي محافظ بشأن الملفات المختارة؛ ليست حكمًا قانونيًا بشأن كل مساهمة أو علامة تجارية أو أصل. ظهور المصدر علنًا أو وصفه بأنه open-source لا يوسع الإذن الوارد في الترخيص. تفاصيل قيد Revana ومراجعة مصدره السابقة موجودة في [تقرير Revana](docs/mamluk/revana-security-license.md).

### الأصول والاعتماديات

- يوضح [THIRD_PARTY_NOTICES في CtxPilot](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/THIRD_PARTY_NOTICES.md#L3) أن الاعتماديات والخطوط تحت تراخيص مستقلة؛ يذكر caniuse-lite تحت CC BY 4.0 وخطوط Noto Serif CJK SC وMa Shan Zheng تحت OFL 1.1، وإشعارات يجب أن تصاحب الخطوط إذا شُحنت. تعليمات تقرير الاعتماديات في هذه الوثيقة ليست إلزام نشر مصدر مستنتجًا من MIT.
- يذكر [README في DeadKingdoms:153–162](https://github.com/AlexanderHeffernan/DeadKingdoms/blob/aaa0c6710a42ccdb6b962d6a387ec6ff0f916ca0/README.md#L153) خطًا freeware وموسيقى Suno free/basic للاستخدام غير التجاري، ويستثني شروط الأصول من MIT. لا تُنقل هذه الموسيقى إلى المنتج التجاري، ولا نعتبر MIT تصريحًا عامًا للصور أو الخطوط.
- لا نأخذ النصوص التاريخية أو أسماء الواجهات أو خرائط أو بيانات أو أصوات أي مشروع بوصفها «أصولًا مفتوحة» دون فحص مستقل. الهوية العربية وبيانات قادة المماليك تُكتب محليًا.

## الأنظمة الموجودة فعليًا في المصادر

### 1. Revana: جنرال وخبرة وجيوش، لكنه غير قابل للتحويل بهذا الترخيص

يوجد نظام General داخل بيانات البلدة؛ [BattleService.php:105–124](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/app/Services/BattleService.php#L105) يمنح خبرة لجنرال المهاجم عند الانتصار، و[325–335](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/app/Services/BattleService.php#L325) يضيف أثر الجنرال في القوة. عدم وجود اسم Hero لا يعني غياب هذه الآلية.

إرسال الجيوش وتدريبها موجودان في [ArmyService.php:34–115](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/app/Services/ArmyService.php#L34)، وطابور الحركة في [ArmyQueue.php](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/app/Models/Queue/ArmyQueue.php#L17). الاستطلاع يكشف الموارد والمباني وفق أعداد الكشافة في [BattleService.php:133–149](https://github.com/unkownpr/Revana/blob/26b9e1d6f26f78510fae2728e0e2727c8ee98a95/app/Services/BattleService.php#L133). هذا تقرير استطلاع، وليس إثباتًا لخريطة fog ديناميكية أو مراحل siege supplies المطلوبة. لم نثبت في هذا النطاق نظام حصار تدريجي مطابقًا للمرفق أو ضابطًا يمنع تكرار خبرة PvP ضد الخصم نفسه.

**الملفات المختارة للنقل: لا شيء.** حتى هذه الآليات لا تُترجم أو تُنقل إلى منتج مشتق قبل استيفاء الإذن المذكور في LICENSE. PHP/Fat-Free وبياناته لا يطابقان مصدر Tahaddi الحالي أيضًا.

### 2. Late-Eastern-Han-Dynasty: المرجع الأغنى للقادة والحصار

| النظام | دليل مصدر مثبت | ما يفيد Tahaddi |
|---|---|---|
| القائد وخصائصه | [shared/types/officer.ts:91–117](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/shared/types/officer.ts#L91): خبرة، حالة، مهارات، merit ومسار/رتبة وstamina | فصل تعريف القائد عن الجيش؛ لا نقل العقد الضخم أو أسماء الرتب الصينية |
| قائد رئيسي ونواب وطعام الجيش | [shared/types/army.ts:6–20](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/shared/types/army.ts#L6) | معرف قائد مرتبط بجيش، وحالة مستقلة؛ الطعام والنواب لمرحلة لاحقة |
| منع التكليف المتعارض | [campaign.ts:330–336](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/server/src/engine/campaign.ts#L330) يتحقق من الفصيل والحالة والموقع والتكليف في جيش آخر | تحقق خادمي من الملكية والموقع وعدم استخدام القائد مرتين |
| رتبة مشتقة بسقف | [shared/merit.ts:45–85](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/shared/merit.ts#L45): جدول 20 رتبة ودالة اشتقاق وحدود | عتبات ولقب من config واحد؛ merit هنا منفصل عن Officer.experience |
| مدخل منح مركزي | [meritGrant.ts:22–37](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/server/src/engine/meritGrant.ts#L22)، [militaryMerit.ts:16–27](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/server/src/engine/militaryMerit.ts#L16) | منح من أحداث خادمية؛ وجود التحقق لا يثبت anti-farming أو idempotency في PvP |
| أثر القائد والخبرة في القوة | [campaign.ts:903–931](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/server/src/engine/campaign.ts#L903) | modifier محدود يصاغ وفق توازن Tahaddi، لا نقل معاملات المرجع عميانيًا |
| إمداد فعلي للجيش | [campaign.ts:366–367](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/server/src/engine/campaign.ts#L366)، [710–730](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/server/src/engine/campaign.ts#L710): حمل طعام واستهلاك وعقوبة نفاده | مرحلة supply لاحقة؛ حسابه بالدور يحتاج تحويلًا إلى الوقت الخادمي الحالي |
| حصار وتحمل الأسوار | [campaign.ts:119–128](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/server/src/engine/campaign.ts#L119): wall/gate durability، أدوار ومنشآت؛ [1320–1393](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/server/src/engine/campaign.ts#L1320): استسلام وهجوم؛ [2357](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/server/src/engine/campaign.ts#L2357): منشآت حصار | مراحل حصار مستقلة مستقبلًا؛ لا إدخال محرك الحملات الكامل |
| إخفاء بيانات ومعلومات استطلاع | [shared/commandery-fog.ts:53–92](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/shared/commandery-fog.ts#L53)، [mask-state.ts:186–216](https://github.com/CtxPilot/Late-Eastern-Han-Dynasty/blob/5ab5d83a680c95e5f2d89834e9aa8460bafc8562/shared/mask-state.ts#L186) | projection عند حد الخادم بدل إخفاء مرئي فقط |

**قرار الملفات:** صالح قانونيًا لاستيراد ملفات محددة بشروط MIT، لكن لا يوجد ملف نحتاج نسخه حاليًا. `campaign.ts` مرتبط بعشرات عقود الألعاب وسياسات الأدوار والحروب؛ نقل أجزاء منه مع adapters أوسع من إضافة القائد إلى Movement الحالي. التصميم يستفيد من مسؤولياته، لا من نسخ جسم محركه.

### 3. three-kingdoms-strategy: بطل وتقدم محدود ومعارك وجيوش سداسية مبسطة

تعريف [Hero وSquad في types.ts:90–115](https://github.com/cancleeric/three-kingdoms-strategy/blob/26e24124ee4ac6fcd5283da32dd9147990a2005d/engine/src/types.ts#L90) يضم خصائص، نجومًا، aptitude ومهارات وقائدًا رئيسيًا مع نائبين. **لا يحتوي تعريف Hero المفحوص level أو experience**. [advancement.ts:9–34](https://github.com/cancleeric/three-kingdoms-strategy/blob/26e24124ee4ac6fcd5283da32dd9147990a2005d/engine/src/advancement.ts#L9) يطبق تقدمًا محصورًا بين 0 و5 وتعزيز awakening؛ ليس نظام XP/مستوى 50 المطلوب.

حركة الهجوم تتم في [march.ts:25–92](https://github.com/cancleeric/three-kingdoms-strategy/blob/26e24124ee4ac6fcd5283da32dd9147990a2005d/engine/src/march.ts#L25) مع arriveAt، والحشد متعدد اللاعبين في [rally.ts:44–90](https://github.com/cancleeric/three-kingdoms-strategy/blob/26e24124ee4ac6fcd5283da32dd9147990a2005d/engine/src/rally.ts#L44). [worldmap.ts:11–41](https://github.com/cancleeric/three-kingdoms-strategy/blob/26e24124ee4ac6fcd5283da32dd9147990a2005d/engine/src/worldmap.ts#L11) يستخدم axial hex coordinates؛ ليس شبكة H3 جغرافية. [stamina.ts:23–38](https://github.com/cancleeric/three-kingdoms-strategy/blob/26e24124ee4ac6fcd5283da32dd9147990a2005d/engine/src/stamina.ts#L23) يحسب التعافي بوقت محقون وسقف، و[city.ts:125–144](https://github.com/cancleeric/three-kingdoms-strategy/blob/26e24124ee4ac6fcd5283da32dd9147990a2005d/engine/src/city.ts#L125) يحدد موعد البناء ويجمع المكتمل.

وجود troop type باسم apparatus وهجوم/حشد على هدف لا يثبت حصارًا متعدد المراحل مع wallHealth أو supply route أو fog؛ لم نثبت تلك الأنظمة في الملفات المختارة. لا نعتبر اسم الوحدة أو README تنفيذًا لها.

**قرار الملفات:** تكييف فكرة الدوال النقية والوقت المحقون وحدود التقدم. لا نقل `advancement.ts` لأنه نموذج نجوم/awakening مختلف، ولا `march.ts` لأن Tahaddi يملك حركات ومعاملات بالفعل. نسخ UI أو engine متعدد التكرارات سيضيف مصدر حقيقة ثانيًا دون فائدة.

### 4. realm-war / HexNation: H3 وMapLibre ورؤية خادمية

المشروع موجود واسمه أمام اللاعب HexNation وفق [README:1–11](https://github.com/pjj-22/realm-war/blob/a6e3fdbd72fbf3639a98e7bc3dee03f6a2b122fb/README.md#L1). اعتماديات [client/package.json:14–20](https://github.com/pjj-22/realm-war/blob/a6e3fdbd72fbf3639a98e7bc3dee03f6a2b122fb/client/package.json#L14) تثبت MapLibre وh3-js.

[server/visibility.js:11–25](https://github.com/pjj-22/realm-war/blob/a6e3fdbd72fbf3639a98e7bc3dee03f6a2b122fb/server/visibility.js#L11) يبني visible set من أراضي اللاعب والتحالف مع حلقة H3، و[48–50](https://github.com/pjj-22/realm-war/blob/a6e3fdbd72fbf3639a98e7bc3dee03f6a2b122fb/server/visibility.js#L48) يقرر كشف التفاصيل مع شرط الليل والملكية. هذا دليل على منطق رؤية خادمي؛ لا يثبت بمفرده أن كل endpoint يطبقه أو أن أمن المشروع قد اجتاز المراجعة.

[server/march.js:6–20](https://github.com/pjj-22/realm-war/blob/a6e3fdbd72fbf3639a98e7bc3dee03f6a2b122fb/server/march.js#L6) يقفل كمية القوات ثم ينقصها ويدخل حركة جيش؛ [server/reinforce.js:16](https://github.com/pjj-22/realm-war/blob/a6e3fdbd72fbf3639a98e7bc3dee03f6a2b122fb/server/reinforce.js#L16) يخطط التعزيز. لا يوجد دليل مختار على القائد ذي XP/مستوى أو حصار الجدار المرحلي المطلوب.

**قرار الملفات:** لا نقل أي ملفات. بيان ISC للخادم يحتاج تحديد نطاق وحفظ إشعارات قبل إعادة استخدام شيفرته؛ العميل والأصول غير مغطاة ببيان مثبت في هذه المراجعة. نكتب قواعد كشف أصلية إذا نفذنا fog لاحقًا، ونختار H3/MapLibre فقط إن كان تغيير تمثيل خريطة Tahaddi مبررًا، بعد فحص تراخيص الاعتماديات المختارة مباشرة.

### 5. DeadKingdoms: RTS وخادم للرؤية وكشافة وأبراج وأسوار HP

[src/shared/messages.ts:11–30](https://github.com/AlexanderHeffernan/DeadKingdoms/blob/aaa0c6710a42ccdb6b962d6a387ec6ff0f916ca0/src/shared/messages.ts#L11) يصنع snapshot ويرشح الكيانات بحسب رؤية اللاعب؛ [264–314](https://github.com/AlexanderHeffernan/DeadKingdoms/blob/aaa0c6710a42ccdb6b962d6a387ec6ff0f916ca0/src/shared/messages.ts#L264) يحسب visible/explored ويخزنها للدورة. عقود [types/visibility.ts](https://github.com/AlexanderHeffernan/DeadKingdoms/blob/aaa0c6710a42ccdb6b962d6a387ec6ff0f916ca0/src/shared/types/visibility.ts) تميز الحالي والمستكشف والdelta. التطبيق الفعلي أهم من رسم fog فوق معلومات مكشوفة.

توجد [ScoutUnit.ts:5–18](https://github.com/AlexanderHeffernan/DeadKingdoms/blob/aaa0c6710a42ccdb6b962d6a387ec6ff0f916ca0/src/shared/units/ScoutUnit.ts#L5) برؤية مخصصة، و[WatchTower.ts:3–15](https://github.com/AlexanderHeffernan/DeadKingdoms/blob/aaa0c6710a42ccdb6b962d6a387ec6ff0f916ca0/src/shared/buildings/definitions/WatchTower.ts#L3) برؤية ومدى هجوم، و[Wall.ts:3–12](https://github.com/AlexanderHeffernan/DeadKingdoms/blob/aaa0c6710a42ccdb6b962d6a387ec6ff0f916ca0/src/shared/buildings/definitions/Wall.ts#L3) بحد HP وصد الحركة. [world.ts:2176](https://github.com/AlexanderHeffernan/DeadKingdoms/blob/aaa0c6710a42ccdb6b962d6a387ec6ff0f916ca0/src/server/world.ts#L2176) يضبط rally point. هذه وحدات RTS وجدران قابلة للتضرر؛ لم نثبت نظام Commander XP أو siege preparations/breach/storm مطابقًا للمرفق.

**قرار الملفات:** تكييف فصل visible/explored وترشيح snapshot وحد HP، في مرحلة مستقبلية. لا نقل حلقة محاكاة RTS أو world.ts أو شيفرة الرسوم والأصول إلى حركة الجيوش الزمنية الحالية. استثناءات god/admin view الظاهرة في snapshot لا تُنسخ إلى سياسة رؤية اللاعبين في Tahaddi.

## مقارنة الفجوات مع محرك Tahaddi الحالي

خط الأساس هو commit `1be91a56d96a4d4084766142dd5cee64cac55340` في Qurabia، قبل إضافات القادة الجارية. الروابط تشير لهذا الخط الأساس؛ أرقام الأسطر في مساحة العمل قد تتغير أثناء التنفيذ.

| المجال | الموجود في خط الأساس | الفجوة المطلوبة | قرار التغيير |
|---|---|---|---|
| حالة الجيش وحركته | [types.ts](https://github.com/ziztp854-code/qurabia.com/blob/1be91a56d96a4d4084766142dd5cee64cac55340/apps/web/src/lib/kingdoms/types.ts) يعرّف القوات والمهمات وMovement بملكية ومصدر/هدف وموعد وصول | قائد مرتبط بالحركة، عدم التكرار، snapshot لآثاره | تمديد العقد الحالي؛ لا محرك جيوش ثانٍ |
| الوقت ومعاملات الحالة | [repository.ts:45](https://github.com/ziztp854-code/qurabia.com/blob/1be91a56d96a4d4084766142dd5cee64cac55340/apps/web/src/lib/kingdoms/repository.ts#L45) يقفل World؛ [271](https://github.com/ziztp854-code/qurabia.com/blob/1be91a56d96a4d4084766142dd5cee64cac55340/apps/web/src/lib/kingdoms/repository.ts#L271) يعالج الاستحقاق بقفل SKIP LOCKED | إدخال assignment/reward مع النتيجة في المعاملة نفسها | إعادة استخدام transaction/deadline، بلا timer مستقل أو ذاكرة محلية للنتيجة |
| قادة ومستويات | KingdomPlayer في [types.ts](https://github.com/ziztp854-code/qurabia.com/blob/1be91a56d96a4d4084766142dd5cee64cac55340/apps/web/src/lib/kingdoms/types.ts) لا يعرّف Commander | سجل لاعب وقادة وتخصص وخبرة ورتبة وسقوف | امتداد أصلي؛ المرجع الأغنى CtxPilot، والنموذج المقترح أبسط |
| القوة والتوازن | [simulation.ts](https://github.com/ziztp854-code/qurabia.com/blob/1be91a56d96a4d4084766142dd5cee64cac55340/apps/web/src/lib/kingdoms/simulation.ts) يحسب القوة والخسائر | أثر صغير محدود لا يلغي دور القوات والجدار | modifier من config مركزي مع اختبارات مقارنة |
| الإمداد | simulation.ts:144–154 يحسب upkeep لقوات القرية والغائبة | طعام مخزون لكل جيش وخط إمداد وانقطاع | مرحلة لاحقة مستقلة؛ upkeep لا يعادل supply system |
| الحصار | simulation.ts يستعمل مستوى الجدار كمضاعف دفاع | wallHealth/equipment/مراحل وقيود الإلغاء | مرحلة لاحقة؛ CtxPilot/DeadKingdoms أفكار مرجعية مختلفة |
| الاستطلاع والرؤية | [engine.ts](https://github.com/ziztp854-code/qurabia.com/blob/1be91a56d96a4d4084766142dd5cee64cac55340/apps/web/src/lib/kingdoms/engine.ts) يرشح حالة اللاعب وحركاته وتقاريره؛ simulation.ts:375–398 ينفذ تقرير الكشف | نطاق رؤية حالي/مستكشف وTTL للمعلومات وسياسة تحالف | توسيع projection خادمي؛ لا إرسال العالم الكامل ثم إخفاؤه بالـ CSS |
| خريطة العالم | القرى والإحداثيات الحالية داخل عقود Tahaddi | أقاليم/مناطق/أرض وسياسة رؤية | لا اعتماد H3 تلقائيًا؛ نحدد حاجة التمثيل قبل إعادة بناء الخريطة |

## عقد التكييف للمرحلة الأولى المنفذة

توجيهات المرحلة B التالية تستفيد من مفاهيم المراجع، وتُكتب وفق أنماط Tahaddi؛ ليست إثباتًا أن الميزات مكتملة بمجرد إعداد هذه الوثيقة:

1. تعريف Commander مملوك للاعب: id/playerId/name/level/experience/specialization وخصائص attack/defense/mobility/siege/logistics وحالة قابلة للتحقق. قيم البداية والرتب وسقف المستوى والتعزيزات من config واحد؛ حد المستوى 50 قيمة إعداد للمنتج، وليس قيمة مستوردة من مرجع.
2. مفاتيح التخصصات في العقد الحالي هي cavalry/infantry/archery/siege/defense/supply؛ يبقى اسم خاصية الإمداد العددية logistics. الفرسان والمشاة والدفاع تدعم القوات الموجودة بتعزيز محدود، وقدرات الرماة والحصار والإمداد محفوظة للمراحل اللاحقة. لا يضيف اسم التخصص وحدات غير موجودة أو نظام حصار/إمداد كاملًا.
3. أوامر التجنيد والتكليف وإخلاء التكليف وإرسال القائد تمر بهوية الخادم والتحقق من ملكية القرية والقائد وحالته وموقعه. لا يوجد أمر عميل لتطوير القائد؛ يرتفع مستواه تلقائيًا من خبرة يمنحها الخادم. فحص التكليف وخصم الكلفة وحفظ الحركة في معاملة World الحالية، لكي لا يأخذ طلبان متزامنان القائد أو الرصيد نفسه.
4. العميل يرسل النية ومعرّفاتها؛ لا يرسل XP أو stats أو نتائج أو موعد وصول موثوقًا. منح الخبرة يأتي من حدث قتالي/إنجاز فعلي، داخل التسوية الخادمية، مع منع منح الحدث ذاته مرتين وحدود مكافأة وقيود ضد تكرار المزارعة؛ لا ندعي أن المرجع MIT قدم هذه الضوابط جاهزة.
5. يعرض projection قادة اللاعب وآثارهم والتقارير المسموحة دون كشف roster الخصم أو نتائج سرية. معامل الحركة محسوب مرة عند الانطلاق وزمن الرحلة محفوظ في Movement؛ تشترك معاينة جمع الموارد وفحص حد الموسم والحساب الخادمي في helper واحد، فلا يغير رفع المستوى أثناء الطريق موعد الوصول بأثر رجعي.
6. البيانات القديمة بلا commanders تبقى قابلة للتحميل، والقائد بلا تكليف لا يغير المعركة القديمة. اختبارات مطلوبة: تكليف مزدوج، لاعب آخر، أرقام غير صالحة، سقف المستوى/الخصائص، إعادة تسوية الحدث، امتزاج بيانات قديمة، وتأثير القوة والحركة على الجيش الحقيقي.

## سجل النقل والالتزامات عند أي استيراد لاحق

**السجل الحالي:** صفر ملفات مصدر خارجية، صفر أصول خارجية، صفر snippets منسوخة. الروابط والوصف في هذا التدقيق هي مراجع؛ تنفيذ Phase B المقترح امتداد مستقل. لا نضيف نسبة اكتمال أو ملف attribution يوحي بأن مرجعًا أُدمج وهو لم يُدمج.

إذا تغير القرار إلى نقل شيفرة MIT، يُسجل لكل ملف repository وcommit والمسار والترخيص وحقوق المؤلف ونوع التعديل، ويحفظ إشعار الترخيص داخل الملف أو ملف إشعارات يصاحب الجزء المنقول. يراجع ترخيص كل dependency/asset جديد منفصلًا؛ لا ينقل مجلد public أو lockfile أو حزمة خادم كاملة. لا تُنقل ملفات Revana دون الإذن المكتوب، ولا ملفات realm-war غير واضحة النطاق. أي مراجعة أمنية كاملة أو اعتماد نشر للميزات الجديدة تأتي بعد وجود diff واختبارات فعلية، ولا تستنتج من هذه المقارنة الترخيصية.
