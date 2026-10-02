# أصول قرية المماليك

العالم الحالي هو `village-oasis.webp` بحجم **1536 × 1024**؛ يبقى دون تغيير. جميع الإحداثيات أدناه داخل هذا العالم، وليست إحداثيات الشاشة. هذا سجل تكامل للأصول المطلوبة، وليس إثباتًا بأن الرسومات النهائية موجودة.

## حالة التكامل وقواعد الخادم

السجل يضم **30** مدخلاً: **11** مبنى مدعومًا في الخادم، **13** جزءًا بصريًا / مركبًا، و**6** مباني لعب مستقبلية. المصدر الملزم هو `Village.buildings` وإعدادات الخادم الحالية. لا يضيف السجل مستويات أو إنتاجًا أو سكانًا أو موارد أو وحدات أو متطلبات بناء.

الإسطبل قسم تفاعلي للفرسان ضمن `barracks`: مستوى الإسطبل البصري يأتي من مستوى الثكنة المؤكد، وتدريب `rider` يستخدم أمر التدريب وطابور الثكنة الحاليين. لا توجد قيمة `stable` جديدة في حالة الخادم. اختيار البرج يفتح لوحة الأسوار الحالية، والبوابة تحتفظ بالتنقل إلى خريطة العالم؛ كلاهما دون أوامر لعب مستقلة.

| Building | Gameplay | Server owner | Interactive | Scope |
|---|---|---|---|---|
| دار الحكم (`hall`) | A — موجود في الخادم | hall | نعم | إدارة المملكة وتوسيع القرى وفق القواعد الحالية |
| المزارع (`farm`) | A — موجود في الخادم | farm | نعم | إنتاج الغذاء وفق حالة الخادم |
| معسكر الأخشاب (`lumber`) | A — موجود في الخادم | lumber | نعم | إنتاج الخشب للبناء |
| المحجر (`quarry`) | A — موجود في الخادم | quarry | نعم | إنتاج الحجر للتحصينات |
| منجم الحديد (`mine`) | A — موجود في الخادم | mine | نعم | إنتاج الحديد للجيش |
| المخازن (`warehouse`) | A — موجود في الخادم | warehouse | نعم | سعة حفظ الموارد المشتركة كما يحددها الخادم |
| مخزن الغلال (`granary`) | B — بصري / مركب | warehouse | لا | جزء بصري من المخازن؛ لا يضيف سعة مستقلة |
| السوق (`market`) | A — موجود في الخادم | market | نعم | تبادل الموارد عبر السوق الحالي |
| خان القوافل (`caravanserai`) | B — بصري / مركب | market | لا | امتداد بصري للسوق دون تجارة أو موارد مستقلة |
| الحي السكني (`residential`) | B — بصري / مركب | hall | لا | حي بصري تابع لدار الحكم؛ لا يضيف نظام سكان |
| الثكنات (`barracks`) | A — موجود في الخادم | barracks | نعم | تدريب الوحدات التي يدعمها الخادم |
| الإسطبل (`stable`) | B — بصري / مركب | barracks | نعم | قسم الفرسان داخل الثكنة؛ المستوى والطابور مشتركان مع الثكنة |
| ميدان الرماية (`archery`) | C — لعب مستقبلي | — | لا | مبنى مستقبلي؛ لا يدعم الخادم رماة أو تدريبًا مستقلًا |
| دار الحدادة (`blacksmith`) | C — لعب مستقبلي | — | لا | مبنى مستقبلي دون أبحاث أو تحسينات للأسلحة |
| ورشة الحصار (`siege`) | C — لعب مستقبلي | — | لا | مبنى مستقبلي؛ لا توجد وحدات حصار في قواعد الخادم |
| ساحة التجمع (`rally`) | B — بصري / مركب | barracks | لا | ساحة بصرية تابعة للثكنات دون أوامر جيش جديدة |
| البيمارستان (`hospital`) | C — لعب مستقبلي | — | لا | مبنى مستقبلي دون علاج أو إعادة جنود |
| دار المعرفة (`knowledge`) | C — لعب مستقبلي | — | لا | مبنى مستقبلي دون نظام أبحاث |
| دار العهد (`embassy`) | A — موجود في الخادم | embassy | نعم | إدارة التحالف والعلاقات الحالية |
| دار الخزانة (`treasury`) | A — موجود في الخادم | treasury | نعم | إنتاج الذهب وفق قواعد الخادم |
| الأسوار (`wall`) | A — موجود في الخادم | wall | نعم | تعزيز دفاع القرية وفق المستوى المؤكد |
| أبراج المراقبة (`tower`) | B — بصري / مركب | wall | نعم | جزء بصري من الأسوار؛ اختيار البرج يفتح لوحة الأسوار دون دفاع إضافي |
| بوابة القرية (`gate`) | B — بصري / مركب | wall | نعم | بوابة الأسوار والتنقل إلى خريطة العالم |
| القلعة (`citadel`) | B — بصري / مركب | hall | لا | امتداد بصري لدار الحكم دون تحصين مستقل |
| المسجد (`mosque`) | B — بصري / مركب | hall | لا | معلم بصري تابع لدار الحكم دون تأثير على الموارد |
| المدرسة (`madrasa`) | B — بصري / مركب | hall | لا | معلم بصري دون أبحاث أو وحدات جديدة |
| دار القضاء (`courthouse`) | B — بصري / مركب | hall | لا | معلم بصري دون قواعد حكم مستقلة |
| الحمام (`hammam`) | B — بصري / مركب | hall | لا | معلم بصري دون نظام صحة أو سكان |
| خان التجار (`traders`) | B — بصري / مركب | market | لا | جزء بصري من السوق دون طابور تجارة مستقل |
| دار الصناعة (`industry`) | C — لعب مستقبلي | — | لا | مبنى مستقبلي دون موارد أو إنتاج جديد |

المستويات البصرية هي `clamp(floor(confirmedLevel), 0, 5)`. المستويات المؤكدة **5–20** تستعمل صورة L5؛ الحد الأقصى الحقيقي يبقى وفق إعدادات الخادم، ولم يُخفض إلى خمسة. المستوى صفر لا يرسم Overlay. المباني المستقبلية بلا مالك خادم تبقى صفرًا خارج معاينة التطوير. مستوى `village.build.level` المعلق لا يظهر كترقية مكتملة.

## عقد الأصول

تعرف `assetManifest.ts` لكل موضع: `id`, `src`, `filename`, `placeholder`, `worldRect`, `anchor`, `zIndex`, `alpha`, `animated`, `frames`, والوصف. الملفات المفقودة تحمل `src: null`, `placeholder: true`, `frames: []`؛ فلا يطلب المتصفح URLs غير موجودة.

كل أصل Overlay يحتاج خلفية شفافة حقيقية، دون مستطيل معتم أو أرضية بديلة أو أشجار تحجب الصورة الأصلية. Width وHeight أدناه هما حجم التركيب في العالم عند 1:1. يمكن تسليم صورة أكبر للحفاظ على التفاصيل مع نفس النسبة ثم عرضها بحجم `worldRect`. `anchor` نسبي داخل الأصل: المباني **0.5,1** (منتصف القاعدة)، والطرق والبيئة **0,0**. الموقع يحدد الركن العلوي الأيسر؛ العرض يعوض anchor داخل هذا المستطيل.

أسماء الملفات مقترحة للتسليم داخل `apps/web/public/game-art/kingdoms/village/`، مع مجلدات `buildings`, `npc`, `environment` عند وصول الأصول. إضافة filename وحده لا تنشط الرسم. بعد مراجعة أصل فعلي محلي، يحدد `src` إلى URL المحلي ويصبح `placeholder:false`. للأنيميشن، `frames` قائمة مرتبة من URLs محلية لصور إطارات جاهزة بنفس الأبعاد؛ اسم atlas في الجدول وصف حزمة التسليم، ولا يوجد تحليل atlas تلقائي من اسم الملف وحده.

المباني A تتفاعل عبر اللوحات الحالية. المركبات B لا تحصل على منطق لعب مستقل. المباني C لا ترسل أوامر ولا تُفتح كأنها ميزة موجودة؛ رسوماتها المحتملة للمعاينة فقط إلى أن يُعتمد دعم الخادم.

## قائمة مباني L1–L5

جميع **150** صورة مستقلة أدناه مفقودة حاليًا. الصورة الأصلية الحالية وقصاصاتها المعتمدة تبقى fallback. لا تُنشأ رسومات CSS/SVG أو صور مولدة لتعويضها، ولا تعني المواضع المحجوزة أن كل مبنى أصبح مرئيًا.

| Building | Level | Filename | Width | Height | WorldX | WorldY | Anchor | Zindex | Alpha | Static/Animated | Current status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| دار الحكم (`hall`) | L1 | palace-l1.webp | 474 | 294 | 548 | 206 | 0.5,1 | 500 | نعم | Static | MISSING |
| دار الحكم (`hall`) | L2 | palace-l2.webp | 474 | 294 | 548 | 206 | 0.5,1 | 500 | نعم | Static | MISSING |
| دار الحكم (`hall`) | L3 | palace-l3.webp | 474 | 294 | 548 | 206 | 0.5,1 | 500 | نعم | Static | MISSING |
| دار الحكم (`hall`) | L4 | palace-l4.webp | 474 | 294 | 548 | 206 | 0.5,1 | 500 | نعم | Static | MISSING |
| دار الحكم (`hall`) | L5 | palace-l5.webp | 474 | 294 | 548 | 206 | 0.5,1 | 500 | نعم | Static | MISSING |
| المزارع (`farm`) | L1 | farm-l1.webp | 373 | 214 | 1120 | 249 | 0.5,1 | 463 | نعم | Static | MISSING |
| المزارع (`farm`) | L2 | farm-l2.webp | 373 | 214 | 1120 | 249 | 0.5,1 | 463 | نعم | Static | MISSING |
| المزارع (`farm`) | L3 | farm-l3.webp | 373 | 214 | 1120 | 249 | 0.5,1 | 463 | نعم | Static | MISSING |
| المزارع (`farm`) | L4 | farm-l4.webp | 373 | 214 | 1120 | 249 | 0.5,1 | 463 | نعم | Static | MISSING |
| المزارع (`farm`) | L5 | farm-l5.webp | 373 | 214 | 1120 | 249 | 0.5,1 | 463 | نعم | Static | MISSING |
| معسكر الأخشاب (`lumber`) | L1 | lumbercamp-l1.webp | 290 | 192 | 748 | 84 | 0.5,1 | 276 | نعم | Static | MISSING |
| معسكر الأخشاب (`lumber`) | L2 | lumbercamp-l2.webp | 290 | 192 | 748 | 84 | 0.5,1 | 276 | نعم | Static | MISSING |
| معسكر الأخشاب (`lumber`) | L3 | lumbercamp-l3.webp | 290 | 192 | 748 | 84 | 0.5,1 | 276 | نعم | Static | MISSING |
| معسكر الأخشاب (`lumber`) | L4 | lumbercamp-l4.webp | 290 | 192 | 748 | 84 | 0.5,1 | 276 | نعم | Static | MISSING |
| معسكر الأخشاب (`lumber`) | L5 | lumbercamp-l5.webp | 290 | 192 | 748 | 84 | 0.5,1 | 276 | نعم | Static | MISSING |
| المحجر (`quarry`) | L1 | quarry-l1.webp | 286 | 145 | 76 | 284 | 0.5,1 | 429 | نعم | Static | MISSING |
| المحجر (`quarry`) | L2 | quarry-l2.webp | 286 | 145 | 76 | 284 | 0.5,1 | 429 | نعم | Static | MISSING |
| المحجر (`quarry`) | L3 | quarry-l3.webp | 286 | 145 | 76 | 284 | 0.5,1 | 429 | نعم | Static | MISSING |
| المحجر (`quarry`) | L4 | quarry-l4.webp | 286 | 145 | 76 | 284 | 0.5,1 | 429 | نعم | Static | MISSING |
| المحجر (`quarry`) | L5 | quarry-l5.webp | 286 | 145 | 76 | 284 | 0.5,1 | 429 | نعم | Static | MISSING |
| منجم الحديد (`mine`) | L1 | ironmine-l1.webp | 256 | 179 | 305 | 108 | 0.5,1 | 287 | نعم | Static | MISSING |
| منجم الحديد (`mine`) | L2 | ironmine-l2.webp | 256 | 179 | 305 | 108 | 0.5,1 | 287 | نعم | Static | MISSING |
| منجم الحديد (`mine`) | L3 | ironmine-l3.webp | 256 | 179 | 305 | 108 | 0.5,1 | 287 | نعم | Static | MISSING |
| منجم الحديد (`mine`) | L4 | ironmine-l4.webp | 256 | 179 | 305 | 108 | 0.5,1 | 287 | نعم | Static | MISSING |
| منجم الحديد (`mine`) | L5 | ironmine-l5.webp | 256 | 179 | 305 | 108 | 0.5,1 | 287 | نعم | Static | MISSING |
| المخازن (`warehouse`) | L1 | warehouse-l1.webp | 272 | 186 | 985 | 426 | 0.5,1 | 612 | نعم | Static | MISSING |
| المخازن (`warehouse`) | L2 | warehouse-l2.webp | 272 | 186 | 985 | 426 | 0.5,1 | 612 | نعم | Static | MISSING |
| المخازن (`warehouse`) | L3 | warehouse-l3.webp | 272 | 186 | 985 | 426 | 0.5,1 | 612 | نعم | Static | MISSING |
| المخازن (`warehouse`) | L4 | warehouse-l4.webp | 272 | 186 | 985 | 426 | 0.5,1 | 612 | نعم | Static | MISSING |
| المخازن (`warehouse`) | L5 | warehouse-l5.webp | 272 | 186 | 985 | 426 | 0.5,1 | 612 | نعم | Static | MISSING |
| مخزن الغلال (`granary`) | L1 | granary-l1.webp | 117 | 117 | 1130 | 456 | 0.5,1 | 573 | نعم | Static | MISSING |
| مخزن الغلال (`granary`) | L2 | granary-l2.webp | 117 | 117 | 1130 | 456 | 0.5,1 | 573 | نعم | Static | MISSING |
| مخزن الغلال (`granary`) | L3 | granary-l3.webp | 117 | 117 | 1130 | 456 | 0.5,1 | 573 | نعم | Static | MISSING |
| مخزن الغلال (`granary`) | L4 | granary-l4.webp | 117 | 117 | 1130 | 456 | 0.5,1 | 573 | نعم | Static | MISSING |
| مخزن الغلال (`granary`) | L5 | granary-l5.webp | 117 | 117 | 1130 | 456 | 0.5,1 | 573 | نعم | Static | MISSING |
| السوق (`market`) | L1 | market-l1.webp | 356 | 200 | 1020 | 589 | 0.5,1 | 789 | نعم | Static | MISSING |
| السوق (`market`) | L2 | market-l2.webp | 356 | 200 | 1020 | 589 | 0.5,1 | 789 | نعم | Static | MISSING |
| السوق (`market`) | L3 | market-l3.webp | 356 | 200 | 1020 | 589 | 0.5,1 | 789 | نعم | Static | MISSING |
| السوق (`market`) | L4 | market-l4.webp | 356 | 200 | 1020 | 589 | 0.5,1 | 789 | نعم | Static | MISSING |
| السوق (`market`) | L5 | market-l5.webp | 356 | 200 | 1020 | 589 | 0.5,1 | 789 | نعم | Static | MISSING |
| خان القوافل (`caravanserai`) | L1 | caravanserai-l1.webp | 130 | 95 | 1232 | 616 | 0.5,1 | 711 | نعم | Static | MISSING |
| خان القوافل (`caravanserai`) | L2 | caravanserai-l2.webp | 130 | 95 | 1232 | 616 | 0.5,1 | 711 | نعم | Static | MISSING |
| خان القوافل (`caravanserai`) | L3 | caravanserai-l3.webp | 130 | 95 | 1232 | 616 | 0.5,1 | 711 | نعم | Static | MISSING |
| خان القوافل (`caravanserai`) | L4 | caravanserai-l4.webp | 130 | 95 | 1232 | 616 | 0.5,1 | 711 | نعم | Static | MISSING |
| خان القوافل (`caravanserai`) | L5 | caravanserai-l5.webp | 130 | 95 | 1232 | 616 | 0.5,1 | 711 | نعم | Static | MISSING |
| الحي السكني (`residential`) | L1 | residential-l1.webp | 74 | 64 | 577 | 465 | 0.5,1 | 529 | نعم | Static | MISSING |
| الحي السكني (`residential`) | L2 | residential-l2.webp | 74 | 64 | 577 | 465 | 0.5,1 | 529 | نعم | Static | MISSING |
| الحي السكني (`residential`) | L3 | residential-l3.webp | 74 | 64 | 577 | 465 | 0.5,1 | 529 | نعم | Static | MISSING |
| الحي السكني (`residential`) | L4 | residential-l4.webp | 74 | 64 | 577 | 465 | 0.5,1 | 529 | نعم | Static | MISSING |
| الحي السكني (`residential`) | L5 | residential-l5.webp | 74 | 64 | 577 | 465 | 0.5,1 | 529 | نعم | Static | MISSING |
| الثكنات (`barracks`) | L1 | barracks-l1.webp | 356 | 196 | 291 | 406 | 0.5,1 | 602 | نعم | Static | MISSING |
| الثكنات (`barracks`) | L2 | barracks-l2.webp | 356 | 196 | 291 | 406 | 0.5,1 | 602 | نعم | Static | MISSING |
| الثكنات (`barracks`) | L3 | barracks-l3.webp | 356 | 196 | 291 | 406 | 0.5,1 | 602 | نعم | Static | MISSING |
| الثكنات (`barracks`) | L4 | barracks-l4.webp | 356 | 196 | 291 | 406 | 0.5,1 | 602 | نعم | Static | MISSING |
| الثكنات (`barracks`) | L5 | barracks-l5.webp | 356 | 196 | 291 | 406 | 0.5,1 | 602 | نعم | Static | MISSING |
| الإسطبل (`stable`) | L1 | stable-l1.webp | 111 | 67 | 454 | 516 | 0.5,1 | 583 | نعم | Static | MISSING |
| الإسطبل (`stable`) | L2 | stable-l2.webp | 111 | 67 | 454 | 516 | 0.5,1 | 583 | نعم | Static | MISSING |
| الإسطبل (`stable`) | L3 | stable-l3.webp | 111 | 67 | 454 | 516 | 0.5,1 | 583 | نعم | Static | MISSING |
| الإسطبل (`stable`) | L4 | stable-l4.webp | 111 | 67 | 454 | 516 | 0.5,1 | 583 | نعم | Static | MISSING |
| الإسطبل (`stable`) | L5 | stable-l5.webp | 111 | 67 | 454 | 516 | 0.5,1 | 583 | نعم | Static | MISSING |
| ميدان الرماية (`archery`) | L1 | archery-range-l1.webp | 104 | 67 | 350 | 435 | 0.5,1 | 502 | نعم | Static | MISSING |
| ميدان الرماية (`archery`) | L2 | archery-range-l2.webp | 104 | 67 | 350 | 435 | 0.5,1 | 502 | نعم | Static | MISSING |
| ميدان الرماية (`archery`) | L3 | archery-range-l3.webp | 104 | 67 | 350 | 435 | 0.5,1 | 502 | نعم | Static | MISSING |
| ميدان الرماية (`archery`) | L4 | archery-range-l4.webp | 104 | 67 | 350 | 435 | 0.5,1 | 502 | نعم | Static | MISSING |
| ميدان الرماية (`archery`) | L5 | archery-range-l5.webp | 104 | 67 | 350 | 435 | 0.5,1 | 502 | نعم | Static | MISSING |
| دار الحدادة (`blacksmith`) | L1 | blacksmith-l1.webp | 84 | 60 | 944 | 247 | 0.5,1 | 307 | نعم | Static | MISSING |
| دار الحدادة (`blacksmith`) | L2 | blacksmith-l2.webp | 84 | 60 | 944 | 247 | 0.5,1 | 307 | نعم | Static | MISSING |
| دار الحدادة (`blacksmith`) | L3 | blacksmith-l3.webp | 84 | 60 | 944 | 247 | 0.5,1 | 307 | نعم | Static | MISSING |
| دار الحدادة (`blacksmith`) | L4 | blacksmith-l4.webp | 84 | 60 | 944 | 247 | 0.5,1 | 307 | نعم | Static | MISSING |
| دار الحدادة (`blacksmith`) | L5 | blacksmith-l5.webp | 84 | 60 | 944 | 247 | 0.5,1 | 307 | نعم | Static | MISSING |
| ورشة الحصار (`siege`) | L1 | siege-workshop-l1.webp | 120 | 68 | 459 | 351 | 0.5,1 | 419 | نعم | Static | MISSING |
| ورشة الحصار (`siege`) | L2 | siege-workshop-l2.webp | 120 | 68 | 459 | 351 | 0.5,1 | 419 | نعم | Static | MISSING |
| ورشة الحصار (`siege`) | L3 | siege-workshop-l3.webp | 120 | 68 | 459 | 351 | 0.5,1 | 419 | نعم | Static | MISSING |
| ورشة الحصار (`siege`) | L4 | siege-workshop-l4.webp | 120 | 68 | 459 | 351 | 0.5,1 | 419 | نعم | Static | MISSING |
| ورشة الحصار (`siege`) | L5 | siege-workshop-l5.webp | 120 | 68 | 459 | 351 | 0.5,1 | 419 | نعم | Static | MISSING |
| ساحة التجمع (`rally`) | L1 | rally-square-l1.webp | 164 | 65 | 365 | 483 | 0.5,1 | 548 | نعم | Static | MISSING |
| ساحة التجمع (`rally`) | L2 | rally-square-l2.webp | 164 | 65 | 365 | 483 | 0.5,1 | 548 | نعم | Static | MISSING |
| ساحة التجمع (`rally`) | L3 | rally-square-l3.webp | 164 | 65 | 365 | 483 | 0.5,1 | 548 | نعم | Static | MISSING |
| ساحة التجمع (`rally`) | L4 | rally-square-l4.webp | 164 | 65 | 365 | 483 | 0.5,1 | 548 | نعم | Static | MISSING |
| ساحة التجمع (`rally`) | L5 | rally-square-l5.webp | 164 | 65 | 365 | 483 | 0.5,1 | 548 | نعم | Static | MISSING |
| البيمارستان (`hospital`) | L1 | bimaristan-l1.webp | 77 | 65 | 901 | 620 | 0.5,1 | 685 | نعم | Static | MISSING |
| البيمارستان (`hospital`) | L2 | bimaristan-l2.webp | 77 | 65 | 901 | 620 | 0.5,1 | 685 | نعم | Static | MISSING |
| البيمارستان (`hospital`) | L3 | bimaristan-l3.webp | 77 | 65 | 901 | 620 | 0.5,1 | 685 | نعم | Static | MISSING |
| البيمارستان (`hospital`) | L4 | bimaristan-l4.webp | 77 | 65 | 901 | 620 | 0.5,1 | 685 | نعم | Static | MISSING |
| البيمارستان (`hospital`) | L5 | bimaristan-l5.webp | 77 | 65 | 901 | 620 | 0.5,1 | 685 | نعم | Static | MISSING |
| دار المعرفة (`knowledge`) | L1 | knowledge-house-l1.webp | 46 | 60 | 936 | 360 | 0.5,1 | 420 | نعم | Static | MISSING |
| دار المعرفة (`knowledge`) | L2 | knowledge-house-l2.webp | 46 | 60 | 936 | 360 | 0.5,1 | 420 | نعم | Static | MISSING |
| دار المعرفة (`knowledge`) | L3 | knowledge-house-l3.webp | 46 | 60 | 936 | 360 | 0.5,1 | 420 | نعم | Static | MISSING |
| دار المعرفة (`knowledge`) | L4 | knowledge-house-l4.webp | 46 | 60 | 936 | 360 | 0.5,1 | 420 | نعم | Static | MISSING |
| دار المعرفة (`knowledge`) | L5 | knowledge-house-l5.webp | 46 | 60 | 936 | 360 | 0.5,1 | 420 | نعم | Static | MISSING |
| دار العهد (`embassy`) | L1 | embassy-l1.webp | 315 | 201 | 641 | 538 | 0.5,1 | 739 | نعم | Static | MISSING |
| دار العهد (`embassy`) | L2 | embassy-l2.webp | 315 | 201 | 641 | 538 | 0.5,1 | 739 | نعم | Static | MISSING |
| دار العهد (`embassy`) | L3 | embassy-l3.webp | 315 | 201 | 641 | 538 | 0.5,1 | 739 | نعم | Static | MISSING |
| دار العهد (`embassy`) | L4 | embassy-l4.webp | 315 | 201 | 641 | 538 | 0.5,1 | 739 | نعم | Static | MISSING |
| دار العهد (`embassy`) | L5 | embassy-l5.webp | 315 | 201 | 641 | 538 | 0.5,1 | 739 | نعم | Static | MISSING |
| دار الخزانة (`treasury`) | L1 | treasury-l1.webp | 261 | 145 | 294 | 625 | 0.5,1 | 770 | نعم | Static | MISSING |
| دار الخزانة (`treasury`) | L2 | treasury-l2.webp | 261 | 145 | 294 | 625 | 0.5,1 | 770 | نعم | Static | MISSING |
| دار الخزانة (`treasury`) | L3 | treasury-l3.webp | 261 | 145 | 294 | 625 | 0.5,1 | 770 | نعم | Static | MISSING |
| دار الخزانة (`treasury`) | L4 | treasury-l4.webp | 261 | 145 | 294 | 625 | 0.5,1 | 770 | نعم | Static | MISSING |
| دار الخزانة (`treasury`) | L5 | treasury-l5.webp | 261 | 145 | 294 | 625 | 0.5,1 | 770 | نعم | Static | MISSING |
| الأسوار (`wall`) | L1 | walls-l1.webp | 344 | 113 | 265 | 741 | 0.5,1 | 854 | نعم | Static | MISSING |
| الأسوار (`wall`) | L2 | walls-l2.webp | 344 | 113 | 265 | 741 | 0.5,1 | 854 | نعم | Static | MISSING |
| الأسوار (`wall`) | L3 | walls-l3.webp | 344 | 113 | 265 | 741 | 0.5,1 | 854 | نعم | Static | MISSING |
| الأسوار (`wall`) | L4 | walls-l4.webp | 344 | 113 | 265 | 741 | 0.5,1 | 854 | نعم | Static | MISSING |
| الأسوار (`wall`) | L5 | walls-l5.webp | 344 | 113 | 265 | 741 | 0.5,1 | 854 | نعم | Static | MISSING |
| أبراج المراقبة (`tower`) | L1 | watchtowers-l1.webp | 68 | 109 | 1361 | 590 | 0.5,1 | 699 | نعم | Static | MISSING |
| أبراج المراقبة (`tower`) | L2 | watchtowers-l2.webp | 68 | 109 | 1361 | 590 | 0.5,1 | 699 | نعم | Static | MISSING |
| أبراج المراقبة (`tower`) | L3 | watchtowers-l3.webp | 68 | 109 | 1361 | 590 | 0.5,1 | 699 | نعم | Static | MISSING |
| أبراج المراقبة (`tower`) | L4 | watchtowers-l4.webp | 68 | 109 | 1361 | 590 | 0.5,1 | 699 | نعم | Static | MISSING |
| أبراج المراقبة (`tower`) | L5 | watchtowers-l5.webp | 68 | 109 | 1361 | 590 | 0.5,1 | 699 | نعم | Static | MISSING |
| بوابة القرية (`gate`) | L1 | gate-l1.webp | 151 | 118 | 681 | 778 | 0.5,1 | 896 | نعم | Static | MISSING |
| بوابة القرية (`gate`) | L2 | gate-l2.webp | 151 | 118 | 681 | 778 | 0.5,1 | 896 | نعم | Static | MISSING |
| بوابة القرية (`gate`) | L3 | gate-l3.webp | 151 | 118 | 681 | 778 | 0.5,1 | 896 | نعم | Static | MISSING |
| بوابة القرية (`gate`) | L4 | gate-l4.webp | 151 | 118 | 681 | 778 | 0.5,1 | 896 | نعم | Static | MISSING |
| بوابة القرية (`gate`) | L5 | gate-l5.webp | 151 | 118 | 681 | 778 | 0.5,1 | 896 | نعم | Static | MISSING |
| القلعة (`citadel`) | L1 | citadel-l1.webp | 148 | 128 | 837 | 271 | 0.5,1 | 399 | نعم | Static | MISSING |
| القلعة (`citadel`) | L2 | citadel-l2.webp | 148 | 128 | 837 | 271 | 0.5,1 | 399 | نعم | Static | MISSING |
| القلعة (`citadel`) | L3 | citadel-l3.webp | 148 | 128 | 837 | 271 | 0.5,1 | 399 | نعم | Static | MISSING |
| القلعة (`citadel`) | L4 | citadel-l4.webp | 148 | 128 | 837 | 271 | 0.5,1 | 399 | نعم | Static | MISSING |
| القلعة (`citadel`) | L5 | citadel-l5.webp | 148 | 128 | 837 | 271 | 0.5,1 | 399 | نعم | Static | MISSING |
| المسجد (`mosque`) | L1 | mosque-l1.webp | 181 | 159 | 662 | 576 | 0.5,1 | 735 | نعم | Static | MISSING |
| المسجد (`mosque`) | L2 | mosque-l2.webp | 181 | 159 | 662 | 576 | 0.5,1 | 735 | نعم | Static | MISSING |
| المسجد (`mosque`) | L3 | mosque-l3.webp | 181 | 159 | 662 | 576 | 0.5,1 | 735 | نعم | Static | MISSING |
| المسجد (`mosque`) | L4 | mosque-l4.webp | 181 | 159 | 662 | 576 | 0.5,1 | 735 | نعم | Static | MISSING |
| المسجد (`mosque`) | L5 | mosque-l5.webp | 181 | 159 | 662 | 576 | 0.5,1 | 735 | نعم | Static | MISSING |
| المدرسة (`madrasa`) | L1 | madrasa-l1.webp | 69 | 62 | 861 | 573 | 0.5,1 | 635 | نعم | Static | MISSING |
| المدرسة (`madrasa`) | L2 | madrasa-l2.webp | 69 | 62 | 861 | 573 | 0.5,1 | 635 | نعم | Static | MISSING |
| المدرسة (`madrasa`) | L3 | madrasa-l3.webp | 69 | 62 | 861 | 573 | 0.5,1 | 635 | نعم | Static | MISSING |
| المدرسة (`madrasa`) | L4 | madrasa-l4.webp | 69 | 62 | 861 | 573 | 0.5,1 | 635 | نعم | Static | MISSING |
| المدرسة (`madrasa`) | L5 | madrasa-l5.webp | 69 | 62 | 861 | 573 | 0.5,1 | 635 | نعم | Static | MISSING |
| دار القضاء (`courthouse`) | L1 | courthouse-l1.webp | 147 | 101 | 1011 | 459 | 0.5,1 | 560 | نعم | Static | MISSING |
| دار القضاء (`courthouse`) | L2 | courthouse-l2.webp | 147 | 101 | 1011 | 459 | 0.5,1 | 560 | نعم | Static | MISSING |
| دار القضاء (`courthouse`) | L3 | courthouse-l3.webp | 147 | 101 | 1011 | 459 | 0.5,1 | 560 | نعم | Static | MISSING |
| دار القضاء (`courthouse`) | L4 | courthouse-l4.webp | 147 | 101 | 1011 | 459 | 0.5,1 | 560 | نعم | Static | MISSING |
| دار القضاء (`courthouse`) | L5 | courthouse-l5.webp | 147 | 101 | 1011 | 459 | 0.5,1 | 560 | نعم | Static | MISSING |
| الحمام (`hammam`) | L1 | hammam-l1.webp | 70 | 77 | 461 | 644 | 0.5,1 | 721 | نعم | Static | MISSING |
| الحمام (`hammam`) | L2 | hammam-l2.webp | 70 | 77 | 461 | 644 | 0.5,1 | 721 | نعم | Static | MISSING |
| الحمام (`hammam`) | L3 | hammam-l3.webp | 70 | 77 | 461 | 644 | 0.5,1 | 721 | نعم | Static | MISSING |
| الحمام (`hammam`) | L4 | hammam-l4.webp | 70 | 77 | 461 | 644 | 0.5,1 | 721 | نعم | Static | MISSING |
| الحمام (`hammam`) | L5 | hammam-l5.webp | 70 | 77 | 461 | 644 | 0.5,1 | 721 | نعم | Static | MISSING |
| خان التجار (`traders`) | L1 | merchants-khan-l1.webp | 130 | 90 | 1061 | 657 | 0.5,1 | 747 | نعم | Static | MISSING |
| خان التجار (`traders`) | L2 | merchants-khan-l2.webp | 130 | 90 | 1061 | 657 | 0.5,1 | 747 | نعم | Static | MISSING |
| خان التجار (`traders`) | L3 | merchants-khan-l3.webp | 130 | 90 | 1061 | 657 | 0.5,1 | 747 | نعم | Static | MISSING |
| خان التجار (`traders`) | L4 | merchants-khan-l4.webp | 130 | 90 | 1061 | 657 | 0.5,1 | 747 | نعم | Static | MISSING |
| خان التجار (`traders`) | L5 | merchants-khan-l5.webp | 130 | 90 | 1061 | 657 | 0.5,1 | 747 | نعم | Static | MISSING |
| دار الصناعة (`industry`) | L1 | industry-house-l1.webp | 104 | 89 | 580 | 186 | 0.5,1 | 275 | نعم | Static | MISSING |
| دار الصناعة (`industry`) | L2 | industry-house-l2.webp | 104 | 89 | 580 | 186 | 0.5,1 | 275 | نعم | Static | MISSING |
| دار الصناعة (`industry`) | L3 | industry-house-l3.webp | 104 | 89 | 580 | 186 | 0.5,1 | 275 | نعم | Static | MISSING |
| دار الصناعة (`industry`) | L4 | industry-house-l4.webp | 104 | 89 | 580 | 186 | 0.5,1 | 275 | نعم | Static | MISSING |
| دار الصناعة (`industry`) | L5 | industry-house-l5.webp | 104 | 89 | 580 | 186 | 0.5,1 | 275 | نعم | Static | MISSING |

## التدرج الفني المطلوب

هذه مواصفات للأصول القادمة؛ لا تضيف عدد وحدات أو تأثيرات اقتصادية إلى الخادم.

| Building | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| الإسطبل | إسطبل صغير لحصانين أو ثلاثة، حظيرة بسيطة | حظيرة حجرية أوسع وساحة رعاية | أقواس مملوكية ومرفق تدريب وخدمة | ساحة فرسان منظمة ورايات ملكية | مجمع فرسان ملكي، بوابة وزخارف وساحة واسعة |
| المزارع | حقول محدودة وأدوات بسيطة | قطع زراعية إضافية وسياج منخفض | ري ومخازن أدوات أوضح | حقول منظمة مع أكواخ خدمة | مزرعة كبيرة محاطة بملامح زراعية غنية |
| الثكنات | ساحة تدريب بسيطة | مساكن صغيرة وسقائف | ساحة منظمة وأقواس | مجمع عسكري محصن | ثكنة ملكية متعددة الأجنحة |
| السوق | أكشاك قليلة | مظلات وأكشاك أكثر | صفوف منتظمة وساحة تبادل | سوق مملوكي ذي أروقة | مجمع سوق غني مرتبط بخان القوافل |
| الأسوار | سور منخفض | سور حجري منتظم | شرافات وتحسين البوابة | أبراج وتفاصيل أوضح | تحصين مملوكي غني؛ لا دفاع إضافي خارج مستوى الخادم |
| دار الحكم | دار صغيرة | جناح إضافي | قصر بأقواس وفناء | قصر مملوكي واسع | دار حكم سلطانية غنية بالقباب والرايات |

لبقية المباني الخمسة مستويات تحفظ نفس الأرضية والاتجاه والمنظور ومركز القاعدة، مع تدرج التفاصيل والمساحة داخل المستطيل المحجوز. المباني المركبة تتبع مستوى مالكها في الجدول الأول، بينما الستة المستقبلية لا تتدرج من حالة لعب غير موجودة.

## NPCs ومسارات العرض

لا يوجد مدير NPC جديد؛ يستخدم التنفيذ طبقة Pixi الحالية. العدد حد بصري مشتق من الحالة المؤكدة، وليس تعداد سكان أو أمر تدريب. الفارس المقصوص تحت المفتاح `horse` هو فارس وراحلته من الصورة الأصلية، لا حصان مستقلًا مولدًا. يظهر فقط عند وجود `troops.rider` مؤكد، بحد عرض ثلاثة. عند اعتماد أطلس `cavalry` يستبدل هذه القصاصة ضمن العدد نفسه دون مضاعفة الفرسان. مسؤول الإسطبل مجهز كعرض واحد عند وجود ثكنة وأصل معتمد. الأطالس الجديدة المفقودة لا تخصص sprites فارغة أو تستهلك ميزانية NPC.

الأبعاد في الجدول حجم الإطار المركب الحالي. WorldX/Y في مواضع NPC تساوي صفرًا لأنها نسبية؛ المسار ينقل موضع كل شخصية، وanchor عند القدم.

| NPC | Filename | Frame Width × Height | WorldX/Y | Anchor | Zindex | Alpha | Static/Animated | Current status |
|---|---|---|---|---|---|---|---|---|
| worker | worker-atlas.webp | 9 × 18 | 0,0 | 0.5,1 | 18 | نعم | Animated | الأصل المستقل مفقود؛ قصاصات الأصل متاحة |
| farmer | farmer-atlas.webp | 9 × 18 | 0,0 | 0.5,1 | 18 | نعم | Animated | الأصل المستقل مفقود؛ قصاصات الأصل متاحة |
| merchant | merchant-atlas.webp | 8 × 18 | 0,0 | 0.5,1 | 18 | نعم | Animated | الأصل المستقل مفقود؛ قصاصات الأصل متاحة |
| guard | guard-atlas.webp | 9 × 18 | 0,0 | 0.5,1 | 18 | نعم | Animated | الأصل المستقل مفقود؛ قصاصات الأصل متاحة |
| soldier | soldier-atlas.webp | 9 × 18 | 0,0 | 0.5,1 | 18 | نعم | Animated | الأصل المستقل مفقود؛ قصاصات الأصل متاحة |
| horse | horse-atlas.webp | 19 × 17 | 0,0 | 0.5,1 | 17 | نعم | Animated | الأصل المستقل مفقود؛ قصاصات الأصل متاحة |
| cart | cart-atlas.webp | 24 × 17 | 0,0 | 0.5,1 | 17 | نعم | Animated | الأصل المستقل مفقود؛ قصاصات الأصل متاحة |
| stableMaster | stable-master-atlas.webp | 24 × 24 | 0,0 | 0.5,1 | 24 | نعم | Animated | MISSING؛ لا بديل مرسوم |
| cavalry | cavalry-atlas.webp | 24 × 24 | 0,0 | 0.5,1 | 24 | نعم | Animated | MISSING؛ لا بديل مرسوم |

المسارات ثابتة وحتمية: فارس **الإسطبل → ساحة التدريب → الإسطبل**، عربة **المزرعة → المخزن → السوق → العودة**، تاجر **السوق → البوابة → السوق**، حارس **البوابة → السور → برج المراقبة → العودة**. لا تغير المسارات الموارد أو الجيش أو السكان أو الوقت في المحاكاة. التوزيع بالتناوب يحفظ تمثيل الأنشطة عند خفض الجودة، مع حد الجودة الموجود ودون تضخم في DOM.

## الطرق والبيئة

الطرق بصرية غير تفاعلية. تبقى طرق الصورة الأصلية حتى يصل Overlay معتمد؛ نقاط المسارات أدناه معايرة للتكامل، ولا ترسم خطوطًا بديلة أو تغيّر حركة جيش الخادم.

| Route | Area | World points |
|---|---|---|
| `palace-market-gate` | hall → gate | 786,458 → 862,516 → 1124,724 → 1188,725 → 990,794 → 753,856 |
| `barracks-stable-rally` | barracks → rally | 387,516 → 449,536 → 510,550 → 438,513 |
| `farm-storage-market` | farm → market | 1274,469 → 1231,484 → 1188,579 → 1090,597 → 1188,647 → 1237,700 → 1188,725 |
| `mine-storage` | mine → warehouse | 552,249 → 614,242 → 1039,323 → 1170,417 → 1188,579 → 1090,597 |

| Overlay | Filename | Width × Height | WorldX/Y | Anchor | Zindex | Alpha | Static/Animated | Current status |
|---|---|---|---|---|---|---|---|---|
| roads | village-roads.webp | 1536 × 1024 | 0,0 | 0,0 | 0 | نعم | Static | MISSING؛ لا بديل مرسوم |
| waterfall | waterfall-atlas.webp | 275 × 337 | 0,0 | 0,0 | 337 | نعم | Animated | MISSING؛ لا بديل مرسوم |
| water | water-atlas.webp | 1536 × 233 | 0,791 | 0,0 | 1024 | نعم | Animated | MISSING؛ لا بديل مرسوم |
| flags | flags-atlas.webp | 14 × 44 | 836,345 | 0,0 | 389 | نعم | Animated | الأصل المستقل مفقود؛ قصاصات الأصل متاحة |
| fire | fire-atlas.webp | 199 × 145 | 647,735 | 0,0 | 880 | نعم | Animated | MISSING؛ لا بديل مرسوم |
| smoke | smoke-atlas.webp | 200 × 181 | 431,103 | 0,0 | 284 | نعم | Animated | MISSING؛ لا بديل مرسوم |
| trees | trees-atlas.webp | 343 × 206 | 1013,177 | 0,0 | 383 | نعم | Animated | MISSING؛ لا بديل مرسوم |
| palms | palms-atlas.webp | 343 × 206 | 1013,177 | 0,0 | 383 | نعم | Animated | MISSING؛ لا بديل مرسوم |
| birds | birds-atlas.webp | 200 × 70 | 1075,18 | 0,0 | 88 | نعم | Animated | MISSING؛ لا بديل مرسوم |
| dust | dust-atlas.webp | 352 × 187 | 279,411 | 0,0 | 598 | نعم | Animated | MISSING؛ لا بديل مرسوم |
| scaffold | scaffold.webp | 160 × 160 | 0,0 | 0.5,1 | 160 | نعم | Static | MISSING؛ لا بديل مرسوم |

`trees` موضع قديم محفوظ للتوافق، و`palms` تجهيز أصل النخيل؛ لا تسلم أو تفعل أصلين متطابقين فوق بعضهما. تبقى الأشجار الموجودة في الصورة دون حذف. حركات الشلال والماء والرايات والدخان والنار والنخيل والطيور والغبار خفيفة ومحدودة، وتوقف عند pause أو إخفاء المشهد وتحترم reduced motion. الملمس والإطارات تحمل مرة واحدة وتستخدم cache؛ لا توجد ثلاثون مكونًا متحركًا مستقلًا.

السقالة العامة **160 × 160** أصل شفاف قابل للتحجيم إلى مستطيل المبنى الفعلي فقط أثناء `village.build` المؤكد. لا تعرضها طبقة البيئة كعنصر دائم. انتهاء العد التنازلي وحده لا يغير مستوى الرسم؛ يتم استبدال L1–L5 بعد وصول المستوى المؤكد من الخادم.

## المعايرة والتفعيل

لوحة التطوير فقط تضبط `x`, `y`, `width`, `height`, `focusX`, `focusY`, `focusScale`, `zIndex` ومعاينة L1–L5 ثم Copy Config. قيم المواضع الأساسية في `coordinates.ts`. `focusX/Y` الافتراضيان مركز المستطيل؛ تعرض اللوحة مقياس التركيز المحسوب من منفذ الكاميرا الحالي، وتستخدم الكاميرا مقياس المعاينة عند override صريح فقط. تعديل العمق أو الموضع لا يضيف override للمقياس تلقائيًا. لا تطبق overrides أو مستويات preview في production.

عند تسليم أصل: تحقق من alpha والمنظور والأبعاد والمركز، ثم عيّن URL المحلي في manifest، وجرّب معاينة المستويات مع التفاعل القائم. استخدم CodeGraph للاستعلام عن المنطقة المتأثرة، ثم اختبارات Village الموجهة وPlaywright للمشروع المطلوب. قراءة مصدر الخادم والواجهة هي المرجع النهائي، والـGraph يساعد في التنقل واختيار الاختبارات.

يمكن تسليم إطار ثابت عبر `src` أو إطارات مستقلة عبر `frames`؛ لا يكفي وضع صورة atlas غير مقسمة داخل `frames`. يحمّل العارض الإطارات في cache، ويستخدم AnimatedSprite دون shared ticker، ويوقف الزمن مع pause وreduced motion وإخفاء المشهد. المسارات والإطارات بصرية فقط. إعادة استخدام حاويات وشخصيات NPC تتم داخل ميزانية الجودة القائمة؛ تحديث الموارد وحده لا يعيد إنشاء طبقات العالم.

## تحقق التكامل — 2026-10-02

- CodeGraph 1.6.1: اتصال MCP محلي واكتشاف الرموز الجديدة بعد auto-sync، دون إعادة `init`.
- `codegraph affected`: 14 اختبار Village بعد ترشيح المنطقة وعمق 2؛ أضيف `village-maps.test.tsx` و`village-scene.spec.ts` يدويًا لحدود تكامل اللوحة والمشهد.
- Vitest: **15 ملفًا / 62 اختبارًا PASS**. تشمل تأكيد المستوى، طابور التدريب الحقيقي، الأصول ذات الإطارات فقط، وصول الأصل بعد تحديث الموارد، pooling، المعايرة، وأداء NPC.
- تغطية `stable-panel.tsx`, `buildingRegistry.ts`, `npcRoutes.ts`: statements **97.82%**، branches **89.39%**، functions **96.77%**، lines **98.80%**. هذه تغطية الملفات الثلاثة المحددة، وليست تغطية التطبيق كاملًا.
- Playwright: **6/6 PASS** في `desktop-1920`. اختبار الإسطبل يتضمن إعادة ضبط المنفذ إلى **390 × 844**، بقاءه أعلى اللوحة، وhit test لمركز الثكنة الحقيقي. مصفوفة أجهزة الجوال لم تُشغّل.
- TypeScript: `pnpm --filter @tahaddi/web exec tsc --noEmit --pretty false` **PASS**.
- ESLint للملفات المعدلة **PASS**.
- بناء الويب وفحوصه اللاحقة: `pnpm --filter @tahaddi/web build` **PASS**؛ لا اعتماد runtime على CodeGraph.
- `git diff --check` **PASS**، صورة `village-oasis.webp` مطابقة لبصمتها قبل المهمة، وGit staging السابق محفوظ. لا commit أو push ضمن هذه المهمة.
- الأصول المعتمدة المفقودة: **150 building overlays + 9 NPC + 10 environment + 1 roads = 170**. الشكل النهائي للمباني الجديدة ينتظر هذه الأصول؛ لا رسم تلقائي أو بديل مولّد.

## الملفات المعدلة في هذه المهمة

الفرق التالي مقارنة بنسخ الملفات عند بدء المهمة، بما فيها ملفات القرية التي كانت غير متتبعة مسبقًا. التغييرات القديمة خارج النطاق محفوظة.

- `apps/web/src/components/kingdoms/village-panel.tsx`
- `apps/web/src/components/kingdoms/village/stable-panel.tsx`
- `apps/web/src/components/kingdoms/village/stable-panel.test.tsx`
- `apps/web/src/components/kingdoms/village/village-camera.ts`
- `apps/web/src/components/kingdoms/village/village-camera.test.ts`
- `apps/web/src/components/kingdoms/village/village-canvas.tsx`
- `apps/web/src/components/kingdoms/village/village-canvas.module.css`
- `apps/web/src/components/kingdoms/village/village-debug.tsx`
- `apps/web/src/components/kingdoms/village/village-debug.test.tsx`
- `apps/web/src/components/kingdoms/village/village-scene.tsx`
- `apps/web/src/components/kingdoms/village/village-layers.ts`
- `apps/web/src/components/kingdoms/village/village-layers.test.ts`
- `apps/web/src/components/kingdoms/village/village-renderer.ts`
- `apps/web/src/components/kingdoms/village/village-renderer.test.ts`
- `apps/web/src/lib/kingdoms/village/types.ts`
- `apps/web/src/lib/kingdoms/village/coordinates.ts`
- `apps/web/src/lib/kingdoms/village/assetManifest.ts`
- `apps/web/src/lib/kingdoms/village/buildingRegistry.ts`
- `apps/web/src/lib/kingdoms/village/buildingRegistry.test.ts`
- `apps/web/src/lib/kingdoms/village/cameraMath.ts`
- `apps/web/src/lib/kingdoms/village/npcRoutes.ts`
- `apps/web/src/lib/kingdoms/village/npcRoutes.test.ts`
- `apps/web/src/lib/kingdoms/village/quality.test.ts`
- `apps/web/e2e/village-scene.spec.ts`
- `docs/kingdoms-village-assets.md`
