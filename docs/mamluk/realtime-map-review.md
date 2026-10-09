# مراجعة الاتصال الفوري لخريطة تحدي المماليك

تاريخ المراجعة: 2026-10-09. النسخة المحلية المعزولة: D:\Codex\qurabia-mamluk-20261009، على أساس c18148c3604aa16aae4f743bb724573192261270. هذه مراجعة تنفيذ محلي وبروتوكول تحقق؛ لا Push أو PR أو دمج أو نشر.

اعتمد المستخدم تحسين الاتصال الفوري أثناء تنفيذ المشروع. أرقام الاقتصاد وتخصصات الأكاديمية والحداد وسياسة المزرعة الصحيحة ما زالت قرارات مستقلة؛ مشكلة Library الرسمية HTTP 403 وملفات replay الناقصة لم تتغير.

## حالة المصدر والإنتاج

| السطح | الدليل المتاح | ما يثبته | ما لا يثبته |
| --- | --- | --- | --- |
| المصدر الأساسي | قراءة git show للالتزام c18148c مباشرة | العقد السابق والمعادلات والمسارات الفعلية | اكتمال الفهرس أو تطابق تعديلات محلية لاحقة |
| CodeGraph | استعلامات KingdomsGateway/watchMapRevisions المسجلة في المهمة الأم أعادت نسخًا داخل .codex-build | الفهرس يتضمن مخرجات بناء لا تصلح مرجعًا وحيدًا | لا يُستنتج منه مسار التنفيذ الحالي؛ عادت المراجعة إلى المصدر النظيف |
| Vercel web | فحص القراءة المسجل في المهمة الأم: SHA الإنتاج c18148c | إصدار واجهة الويب الذي جرى التحقق منه | نشر هذه التغييرات المحلية |
| Render realtime | GET [realtime.qurabia.com/health](https://realtime.qurabia.com/health) = 200، commit في الجسم 23748aaa | الخدمة تستجيب وتعلن بادئة التزامها | إعدادات KINGDOMS أو صحة المسار الجديد أو زمن ظهور جيش إنتاجي |
| التزام Render الكامل | ربط المهمة الأم للبادئة بـ 23748aaaf89f21a07e419921749d017cadd40d1e، بتاريخ 2026-09-29 | إصدار خدمة الاتصال الفوري مختلف عن إصدار الويب، ويتضمن إصلاح endpoint العامل canonical | لا تكفي بادئة health وحدها لإثبات بقية التهيئة |
| إعدادات الإنتاج | لم تُقرأ أسرار أو قيم بيئة الإنتاج في هذا المسار | لا كشف لأسرار ولا تغيير لتهيئة المستخدم | وجود وتطابق KINGDOMS_WORKER_SECRET وعنوان العامل والمسار العكسي في الإنتاج غير مؤكد |

مصدر health يقتطع RENDER_GIT_COMMIT إلى أول ثمانية أحرف. لا نخلط ذلك مع SHA كامل أُعيد من endpoint. لا نساوي استجابة 200 مع اكتمال تجربة اللاعب.

## المشكلة المثبتة في c18148c

[KingdomsGateway](../../apps/realtime/src/kingdoms/kingdoms.gateway.ts) يستخدم Socket.IO namespace /kingdoms. حدث kingdoms:revision يحمل worldId وrevision فقط. تفاصيل العالم الخاصة تأتي من [viewport API](../../apps/web/src/app/api/kingdoms/world-map/viewport/route.ts) بمصادقة على الخادم وCache-Control: private, no-store.

العميل السابق يعيد القراءة عند connect وعند revision جديد، ويبقي تحديث viewport كل 5 ثوانٍ. ACK القديم success:true يثبت الانضمام إلى غرفة، ولا يثبت عاملًا سليمًا أو مسار إشعار من خدمة الويب. العامل المركزي ينفذ tick كل 5 ثوانٍ للأحداث المستحقة، بينما معاملات أوامر العالم الأساسية لم تكن تُصدر إشعارًا بعد commit. لذلك قد يُقبل أمر الجيش ويظهر في جواب الأمر قبل أن تلتقطه الخريطة في طلبها التالي.

بطء قبول HTTP، وتأخر إعادة قراءة الخريطة، وزمن السفر المحفوظ ثلاثة مقاييس منفصلة. لا يُنسب تأخر الرسم إلى التدريب أو تغيير سرعة الوحدة. [مراجعة زمن الجيش](army-travel-review.md) توثق معامل 0.45 المصرح للمراجعة المحلية وعقود السفر، وهو لا يجعل حركة الرسم هي مصدر حالة اللعبة.

أُكمل إصلاح تعافي إشعار بعد commit مفقود في العقد المحلي النهائي: watchedWorldIds فريدة بسقف 512 لكل عملية Gateway، واستعلام مركزي مجمع لحقلي id/revision، وrevisions array مع probe ناجح شرطان للجاهزية. نتائج الخادم النهائية أدناه تخص هذا الإصلاح أيضًا.

## العقد المحلي المنفّذ

### الإشعار بعد نجاح الحفظ

[repository.ts](../../apps/web/src/lib/kingdoms/repository.ts) يجمع worldId وrevision وnextEventAt داخل المعاملة، ثم يمررها إلى [realtime-notifications.ts](../../apps/web/src/lib/kingdoms/realtime-notifications.ts) بعد نجاح commit. يستخدم helper دورة Next after للإرسال دون ربط نجاح أمر محفوظ بنجاح الشبكة.

المسار الأساسي يشمل أوامر العالم وإنشاءه وتعديله الإداري عبر repository المذكور. ليس ذلك إعلانًا بأن كل API مستقل في المشروع صار يرسل إشعارات؛ أي مسار مالي أو ورشة أو ترحيل جغرافيا مستقل يحتاج التحقق من نقطته الخاصة. التجديد المصرح والـ worker يظلان وسيلة استعادة.

الإشعار الداخلي POST إلى /realtime/kingdoms/revision/، بجسم صارم worldId/revision/nextEventAt وبـ Bearer KINGDOMS_WORKER_SECRET الموجود أصلًا. يستخدم العنوان الحالي NEXT_PUBLIC_REALTIME_URL بعد التحقق من origin دون معلومات دخول أو query/hash/path إضافي، وHTTPS في الإنتاج. لا أسرار إنتاج جديدة ولا خدمة مدفوعة جديدة.

الإرسال محدود بثانية واحدة، دون redirects ودون تسجيل URL أو الجسم أو السر. فشله أو انتهاء مهلته لا يُرجع أمرًا ناجحًا على أنه مرفوض. الطلب المرفوض أو المعاملة المتراجعة لا يصدران إشعارًا نجاحًا؛ تكرار إيصال الأمر نفسه لا ينشئ revision جديدًا.

### إثبات الجاهزية والـ probe

[KingdomsController](../../apps/realtime/src/kingdoms/kingdoms.controller.ts) يقبل أيضًا body صارمًا capability: revision-push-v1 وprobe: true على المسار المحمي نفسه، ويرد success وcapability. لا يقرأ probe قاعدة البيانات ولا يعدل cache أو مؤقتًا ولا يبث إلى غرف.

يجري tick المركزي probe من الويب إلى خدمة الاتصال الفوري في مدة ≤ 1 ثانية. metadata باسم notificationsConfigured تصبح true فقط عند نجاح endpoint والسر والقدرة المتوقعة، لا لمجرد وجود نص عنوان أو سر في config. بذلك يفحص المسار العكسي الحقيقي، مع بقاء قياس زمن اللعب الإنتاجي مهمة أخرى.

### العامل والمؤقت المركزي

[KingdomsWorker](../../apps/realtime/src/kingdoms/kingdoms.worker.ts) يعيد استخدام tick المحمي الحالي، دوريًا كل 5 ثوانٍ، مع مهلة طلب 10 ثوانٍ ومنع التداخل. يرسل worker body باسم limit:10 وwatchedWorldIds للعوالم المشاهدة الفريدة. يعيد tick الأحداث المنفذة وأقرب nextEventAt عام محفوظ، وdata.revisions من استعلام واحد مجمع يقرأ id وrevision فقط لما يصل إلى 512 عالمًا. بعد بث worlds المستحقة يبث catch-up revisions ثم heartbeat. يستعيد ذلك أمرًا محفوظًا ضاع إشعاره الأول خلال فترة العامل المركزية 5 ثوانٍ مضافًا إليها كمون upstream عندما يكون المسار سليمًا؛ هذه قاعدة تصميم وليست latency إنتاجية مقاسة. استعلام الطابور المستحق واستعلام الموعد الأقرب ودفعة metadata مركزيون، لا استعلام لكل مستخدم أو قوات خاصة.

يوجد مؤقت تسريع واحد للموعد الأقرب. إشعار أحدث أثناء tick لا يسمح لرد متأخر باستبدال موعد أقرب. الموعد الماضي يُعاد بعد 1 ثانية لتجنب حلقة انشغال، والانتظار الطويل يراعي حد Node البالغ 2,147,483,647 ميلي ثانية ثم يعيد التسليح. الطابور المحفوظ في قاعدة البيانات يبقى المرجع؛ المؤقت لا يحمل قرار قتال أو حالة جيش.

عند نجاح tick وإثبات probe ووجود data.revisions الصالحة، حتى المصفوفة الفارغة، تُجدد صحة العامل. الاستجابة القديمة التي لا تحمل هذه المصفوفة لا تمنح live. عند فشله تُسحب الجاهزية. heartbeat يستخدم cache أرقام الإصدارات وغرف watch المحلية فقط، وليس استعلامًا خاصًا لكل مشترك. عدد watchedWorldIds الفريدة محدود بـ 512 لكل عملية Gateway؛ الاشتراك الذي يتجاوز الحد يُرفض ويبقى عميله في fallback. الاشتراكات المتعددة للعالم نفسه لا تضاعف قراءة metadata. هذا الحد مستقل عن cache المحدود بـ 1,024 عالمًا، مع ترتيب تحديث لطرد أقدم إدخال. رقم 0 عند غياب cache لا يحل محل snapshot مصرح. توقف الخدمة ينظف المؤقتات والطلب الجاري.

### ACK وصحة العميل

ACK الموثق لحدث kingdoms:watch يضم:

| الحقل | القيمة المطلوبة للاتصال الجاهز |
| --- | --- |
| success | true |
| worldId | العالم المطلوب نفسه |
| capability | revision-push-v1 |
| live | true |
| heartbeatIntervalMs | 5,000 |
| heartbeatTimeoutMs | 20,000 |

[watchMapRevisions](../../apps/web/src/components/mamluk-map/map-revisions.ts) ينتظر ACK حتى 5 ثوانٍ، ويتحقق من الحقول والجيل الحالي للاتصال. legacy ACK أو live:false أو worldId خاطئ لا يوقف التحديث الاحتياطي. إعادة watch تتدرج 5/10/20/30 ثانية؛ إعادة اتصال Socket.IO تتدرج من 1 إلى 30 ثانية. رفض namespace قد يجعل socket.active=false ويوقف إعادة الاتصال التلقائية، لذلك تستعيده محاولة connect صريحة متدرجة 5/10/20/30 ثانية وتنظف عند dispose. لا توجد حلقة طلبات بلا حد زمني.

بعد ACK live:true، يجدد revision صحيح للعالم نفسه صحة الاتصال حتى إذا كان heartbeat مكررًا. لا يؤدي التكرار إلى fetch جديد. إذا انتهت مهلة 20 ثانية يعود العميل إلى fallback. ACK live:false لا يُرقّى بنبضة وحدها؛ يحتاج ACK صالحًا لاحقًا. تتغير generation/watchSequence عند الانفصال لتجاهل الردود القديمة، وتُنظف المؤقتات والمستمعات عند dispose.

رقم الإصدار يُقارن مع آخر notification ومع snapshot مطبق، باستخدام BigInt عند مقارنة نص revision في payload. حدث قديم أو مكرر أو غير صحيح أو من عالم آخر لا يبدل الحالة.

### إعادة القراءة والـ TTL

[ViewportLoader](../../packages/mamluk-maplibre-adapter/src/viewport-loader.ts) يعتبر الاتصال ready فقط مع صحة socket وsnapshot API مصرح لم تنته صلاحيته. heartbeat لا يجدد صلاحية رؤية اللاعب.

صلاحية snapshot الخاصة الأساسية 15,000 ميلي ثانية، وقد تكون أقل بسبب منطقة الرؤية. تُحسب مدة وصول HTTP من الصلاحية؛ لا يعاد منح عمر كامل لجواب وصل متأخرًا. عندما يكون live سليمًا يتوقف poll الأساسي كل 5 ثوانٍ، وتبقى القراءات اللازمة لصلاحية المصادقة، وpan/zoom، والعودة من تبويب/انقطاع، وأقرب وصول/عودة لرحلة يملكها اللاعب.

مرشح polling في fallback يتدرج 5/10/20/30 ثانية، لكنه يُقيد بموعد انتهاء صلاحية snapshot. لذلك لا يصح وصفه بأنه 30 ثانية دائمًا أو بأن healthy يساوي صفر طلبات. أخطاء HTTP تستخدم backoff المحدود الموجود: أساس ثانية، سقف 30 ثانية، jitter بنسبة 25%، ومهلة الطلب 20 ثانية. إخفاق التفويض يوقف retry ويلغي العرض الخاص.

عند وصول عدة revisions أثناء fetch يُحفظ أعلى pendingRevision واحد، دون abort لكل حدث. إذا وصل snapshot أقدم من revision المطلوب لا يُقبل كاستعادة مكتملة؛ يتبع retry المقيّد. يفرض reconnect قراءة مصرحًا بها حتى مع revision مكرر. عند الخمول أو offline تتوقف قراءات viewport، ويعيد resume المزامنة.

حدث mamluk:command-accepted داخل الصفحة يحمل worldId وrevision دون قوات أو تفاصيل مالية؛ يُستخدم بعد جواب أمر مقبول لطلب snapshot جديد فورًا عبر مسار revision المجمّع نفسه، حتى لا يكرر GET إذا وصل إشعار Socket.IO للإصدار نفسه أولًا. لا يُرسل عند رفض الأمر ولا ينتج نجاحًا متفائلًا. حركة الموضع الناعمة تستعمل المسار والوقت المصرح بهما؛ عند الموعد المتوقع يُطلب قرار الخادم ولا يُعلن نصر/حصاد/عودة محلية.

[useKingdoms](../../apps/web/src/components/kingdoms/use-kingdoms.ts) مستهلك مستقل للوحة اللعبة. يبقى poll اللوحة كل 15 ثانية، ولا يدخل ضمن تخفيض poll الـ viewport. يجمع أعلى revision واحد أثناء GET، ويتجاهل الحدث المكرر بعد snapshot ناجح، ولا يعتبر revision قد عولج إذا تخطى الطلب بسبب mutation جارٍ أو فشل GET أو وصل عالم أقدم. يمكن لنبضة لاحقة إعادة محاولة ذلك الإصدار دون حلقة retry فورية. العالم والجيل يقيدان إيصال قبول أمر متأخر حتى لا يعيد مزامنة عالم انتقل عنه المستخدم.

### رسم المهمات والتوافق مع العملاء القدامى

يرسل [map-session](../../apps/web/src/components/mamluk-map/map-session.ts) رأس X-Mamluk-Army-Missions: 1 لطلب حقل mission الإضافي ضمن schema v1. تضيف استجابة viewport هذا الرأس إلى Vary. لا يغيّر الرأس صلاحيات الرؤية: يُحتفظ بالحقل لمسار جيش يملكه اللاعب فقط، ويُحذف للعميل القديم وللأطلس العام وللمسار الأجنبي. بذلك يستمر محلل v1 القديم الذي يرفض الحقول غير المعروفة في قراءة DTO السابق.

[KingdomMapProjection](../../apps/web/src/lib/mamluk-map/kingdom-projection.ts) يرسم الرحلة إلى قرية مهجورة والعودة منها حين يحمل view.abandonedVillages المصرح به مرساة longitude/latitude صالحة، وتطابق targetId وworldId وإحداثيات الشبكة المحفوظة في abandonedGather. لا تستبدل إحداثيات الشبكة بإحداثيات الأطلس. الرحلة العائدة القديمة دون originX/originY محفوظين، ومواقع الموارد العادية دون WGS84 مصرح به، تظل خارج رسم المسار الجغرافي وتبقى في قائمة المهمات وETA. قوافل النقل بين القرى تُرسم من المرساة المصرح بها لكل طرف وبموعدها المحفوظ. لا تضم طبقة المسار تفاصيل قوات أو حمولة أو جيش خصم مخفي.

كشف screenshot مزدحم بـ 11 جيشًا تداخل نصوص ETA، ثم ثبت أن setData بتردد 20Hz يعيد fade للنص قبل اكتمال 300 ms. الحل المجمد في [adapter.ts](../../packages/mamluk-maplibre-adapter/src/adapter.ts) يفصل مصدر army-timer-labels للنص بتردد 1Hz عن دوائر الجيش ورمز المهمة والاتجاه المتحركة بتردد 20Hz، داخل الخريطة والكاميرا نفسيهما. لا يغير fadeDuration العام. [styles.ts](../../packages/mamluk-maplibre-adapter/src/styles.ts) يعيد استخدام placement وcollision في MapLibre: text-variable-anchor بأربعة اتجاهات، text-radial-offset=2، وtext-allow-overlap=false وtext-ignore-placement=false للمؤقت فقط. قد تُخفي الكثافة نصًا متصادمًا؛ تبقى دوائر الجيش والمسارات وحالة الخادم كما هي.

مصدر النص يستعمل العرض المصرح نفسه: helper لا يضيف __mamlukTraveling إلا لجيش own=true ومسار صالح، ثم تُرشح هذه الرحلات لمصدر النص. snapshot جديد يفلش التغيير دون انتظار ثانية؛ وتُجمع الكتابة المعلقة دون إسقاط snapshot أحدث. TTL وclear/reset/dispose يلغون المصدر والكتابة/المؤقتات المملوكة. اللقطتان المتحركتان 1 و3 أظهرتا 4 ETA مقروءة مع تقدم الموضع والعداد لـ11 دائرة؛ لا يُدَّعى ظهور 11 نصًا متزامنًا مع collision.

## حدود الأمان والاستمرارية

- البث العام يظل worldId وrevision فقط. لا troops أو commander أو loot أو إحداثيات خصم مخفية أو nextEventAt في حدث Socket.IO العام.
- الانضمام إلى غرفة invalidation ليس إذنًا لقراءة العالم؛ المصادقة وtokenVersion والعضوية والرؤية يعاد فحصها في viewport API.
- لا SSE لكل عميل، ولا DB poll لكل اتصال، ولا محرك خريطة جديد. تبقى الكاميرا والطبقات والقرى الحالية.
- لا تمدد حركة الرسم TTL الخاصة. بعد expiry أو رفض التفويض تزال المعلومات الخاصة، ويُحتفظ فقط بطبقات عامة ثبت إذنها.
- هدف لا يملك مرساة جغرافية مصرحًا بها يبقى في قائمة المهمات والمؤقت؛ لا يُختلق له مكان على الأطلس. الرحلة القديمة ذات أصل مفقود لا تُرسم بأصل مخمن.
- reduced motion وخمول التبويب ينظمان العرض ولا يغيران موعد وصول الخادم.
- هذه الجولة محلية. لا أوامر لعب على حساب إنتاج، ولا إيقاف خدمات أو عمليات مستخدم أخرى.

## بروتوكول قياس قابل لإعادة التشغيل

الغرض قياس ظهور الجيش وطلبات viewport، لا استنتاج أداء الإنتاج من عدد اختبارات أو صور. يُرفق بكل run ملف JSON وبيئة التجربة وأوامر تشغيلها، دون أسرار أو بيانات حساب إنتاج.

### بيانات كل run

المطلوب: generatedAt بتوقيت UTC، baseSha، بصمة patch/ملفات التنفيذ، اسم السيناريو، عدد العينات، إصدار Node/المتصفح، Desktop أو جهاز Mobile المحدد، أبعاد viewport، إصدار fixture وعقد ACK، latency/artificial delays المستخدمة، مدة warmup والقياس، وهل الشبكة Socket.IO فعلية أم mock. يُذكر صراحةً هل API والمحرك والمصادقة حقيقية أو synthetic.

للمقارنة مع c18148c يجب تشغيل الأساس والمقترح بالتسلسل على fixture وكمون وأجهزة ونطاق خريطة متماثلة. يمنع تحويل زمن poll الاسمي إلى p50/p95 مقاس، أو تقديم نسبة تخفيض دون baseline تجريبي مطابق.

### نقاط القياس

| المقياس | بداية ونهاية صريحتان | تفسيره |
| --- | --- | --- |
| commandHttpMs | إرسال HTTP → استلام جواب أمر مقبول | قبول الطلب ونقل الرد؛ مستقل عن الرسم |
| acceptedResponseToSnapshotMs | استلام جواب مقبول → تطبيق أول viewport مصرح يحمل armyId المطلوب | تأخر تحديث البيانات في المتصفح |
| acceptedResponseToVisibleMs | الجواب المقبول → أول تحقق من renderer بجيش armyId ظاهر، مع إطار render مسجل | تجربة الخريطة بعد الرد؛ لا يكفي وصول JSON أو setData وحده |
| commandStartToVisibleMs | إرسال الأمر → التحقق السابق | زمن التجربة الكلي حيث يدعم fixture الأمر |
| commitToPublishMs | commit → إرسال Gateway، بساعة مشتركة أو spans مترابطة | لا تطرح ساعتَي Vercel وRender الخام دون مزامنة |
| reconnectToFreshSnapshotMs | إعادة اتصال صحي مع ACK صالح → snapshot API جديد | زمن التعافي |
| arrivalToAuthoritativeStateMs | deadline المعروف → snapshot يثبت الوصول/العودة | لا يُحسب نجاح من interpolation المحلي |
| viewportRequestCount | جميع GET إلى /world-map/viewport خلال نافذة ثابتة | يشمل الطلبات الملغاة أو الفاشلة، مع تفصيل نجاح/فشل/abort |
| socketTransportCount | handshake/polling/upgrade/reconnect منفصلًا | ليس ضمن عدد viewport |
| otherApiCount | API الأوامر/الإدارة/overview وغيرها منفصلًا | لا يُنسب تخفيض viewport إلى جميع طلبات التطبيق |

إذا ظهر الجيش قبل استلام جواب الأمر بسبب نشر بعد commit، يسجّل visibleBeforeResponse:true ويُعرض ذلك، ولا تُحَوَّل قيمة سالبة إلى تأخر زائف. تُستعمل performance.now في المتصفح للمدد المحلية؛ serverNow يفسر الحالة ولا يستبدل الساعة الرتيبة.

p50/p95 تُحسب من العينات الفعلية مع ذكر N وطريقة quantile. إذا لا توجد عينات كافية أو baseline مطابق يبقى الحقل غير مقاس، ويُعرض الخام وحدوده. Fixture بلا محرك لعبة أو مصادقة حقيقية يثبت النقل والعرض المحليين فقط. queryRenderedFeatures وعدّ features لا يثبتان وحدهما ظهور كل glyph لنص ETA؛ يحتاج النص screenshot أو فيديو أثناء حركة setData ومع collision، مع الحفاظ على assertions الحالية دون خفض عددها أو شروطها.

### السيناريوهات

| السيناريو | تنفيذ مضبوط | دليل النجاح |
| --- | --- | --- |
| idle healthy | snapshot صالح، ACK جاهز، لا pan/zoom أو وصول أثناء نافذة القياس | heartbeat المكرر لا يولد fetch؛ تبقى طلبات TTL فقط، ولا طلب صفري مزعوم |
| legacy/unready | ACK قديم أو live:false أو probe مرفوض | fallback محدود مستمر، لا شارة healthy كاذبة |
| accepted command | أمر واحد ثم bursts بمفاتيح مختلفة ومكررة، مع جيش اختبار ذي مرساة مصرح بها | ظهور بعد القبول فقط، request coalescing، وتكرار المفتاح لا يكرر الجيش |
| lost notify recovery | ينجح commit ويُسقط POST الأول، ثم ترجع metadata revision أعلى في tick التالي | يستعيد publisher/viewport التحديث دون كتابة DB جديدة أو استعلام لكل مشترك |
| watch capacity | أكثر من 512 عالمًا فريدًا واتصالات متعددة بالعالم نفسه | cap للـ unique world IDs، رفض الزائد إلى fallback، ودفعة قراءة واحدة |
| delayed viewport | revision أعلى يصل أثناء fetch أبطأ من النبضات | أعلى revision واحد معلق، لا abort storm أو snapshot قديم نهائي |
| disconnect/reconnect | فصل socket ثم network/offline ثم إعادة الاتصال | تنظيف الجيل القديم، snapshot جديد، ولا تفاصيل خاصة بعد انتهاء الإذن |
| live:false → ready | يبدأ worker غير جاهز ثم ينجح tick/probe | يبقى fallback حتى ACK جديد صالح؛ heartbeat وحده لا يكفي |
| web/render مختلطان | old/new في الاتجاهين، وسر/عنوان ناقص أو endpoint محجوب | قبول أمر محفوظ لا يفشل بسبب notify، والعميل لا يتوقف عن الاستعادة |
| rollback/after-commit failure | المعاملة تفشل، أو الإشعار يتأخر/يفشل بعد commit | لا نجاح قبل الحفظ ولا إعادة خصم بسبب عطل البث |
| arrival/return | بداية الرحلة والموعد والعودة بأصل محفوظ | قرار الخادم عند الانتقال، لا تغيير travelMs محفوظ |
| Desktop/Mobile | نفس السيناريو على Desktop وMobile مع pan/zoom/tab/reduced motion | الكاميرا والرؤية تبقيان صحيحتين وتزال listeners/timers بعد الإغلاق |

تبقى شروط FPS والنجاح الموجودة كما هي. قياس RTT المحلي ليس بديلًا عن مراجعة الأداء أو الأمان أو التكامل مع قاعدة بيانات حقيقية.

## نتائج متاحة وحدودها

| مجموعة الدليل | النتيجة المتاحة حاليًا | حدودها |
| --- | --- | --- |
| backend gateway/controller/worker | 31/31 حالة: worker 15، gateway 10، controller 6؛ typecheck وESLint المستهدف وdiff check وnest build ناجحة وفق تسليم الكاتب المسؤول | تشمل إصلاح watched recovery؛ build واحد فقط، لا خدمة إنتاج أو بناء ثقيل شغّله كاتب الوثيقة |
| تغطية الخادم | Bearer/config/input، probe بلا آثار، revisions monotonic، cache/heartbeat وwatch cap، deadline/overlap/catch-up recovery، وتنظيف الخدمة وتعارض watch | تفاصيل الجولة النهائية في تسليم الوكيل؛ ليست شهادة نشر |
| web بعد commit وtick | اختبارات producer وAPI ضمن الجولة النهائية 868/868 وفق المهمة الأم | تغطي بعد commit وrollback والرفض والتكرار وقراءة بلا بث وprobe/body ودفعة watched revisions؛ لا تُقدم نتيجة مرحلة سابقة كأنها بصمة نهائية |
| اختبارات الخريطة والاتصال | 103/103 في map-session.test.ts وuse-world-map.test.tsx وmamluk-world-map.test.tsx وmap-revisions.test.ts وmap-session.continuity.test.ts وmap-session.stability.test.ts؛ منها protocol 10/10 وفق تسليم الكاتب | 6 ملفات بعد الحل المجمد؛ مستقلة عن useKingdoms؛ source count المتوقع 10 مع مصدر النص الجديد |
| استمرارية المتصفح الكاملة | 20/20 على Desktop وPixel 5، 6.4 دقيقة، بعد تجميد المصدر الوظيفي وفق الكاتب المسؤول | الجولة السابقة 19/20 تأثرت بـ Vite HMR أثناء الكتابة؛ أعيدت كاملة ونجحت دون كتابة مصدر أو build بالتوازي؛ collision اللاحق له تحقق بصري موجه |
| adapter ومزامنة اللوحة | adapter 83/83 مع typecheck/lint/build، وuseKingdoms 16/16 منفصل وفق أحدث تسليم؛ 60 نبضة مكررة دون GET إضافي، وتجميع burst في GET اثنين، وإعادة محاولة عند تخطي mutation أو فشل GET | poll اللوحة 15 ثانية محفوظ؛ لا يجمع العددان كأنهما ملف واحد |
| التحقق البصري بعد إصلاح النص | 4/4 سيناريوهات الجيش على Desktop/Pixel 5، وصور crowded mobile أثناء الحركة وفق الكاتب المسؤول | assertions المؤقتات السبعة محفوظة؛ 6 حالات adapter إضافية تغطي cadence وown-only وpending clear/reset/dispose وTTL/queue/retry |
| إسقاط المسارات والتفاوض HTTP | projection 8/8 وviewport route 13/13 وفق أحدث تسليم المهمة الأم | تشمل مرساة abandonedGather المصرح بها وmission header والعملاء القدامى والأطلس العام والمسارات الأجنبية |
| التحقق الواسع قبل فصل مصدر النص | 868/868 في 98 ملفًا؛ coverage: statements 94.6%، branches 86.75%، functions 94.18%، lines 96.35% وفق التسليم النهائي للمهمة الأم | عتبة 80% محفوظة؛ بعد فصل مصدر النص أُجريت 83 حالة adapter و103 واجهة و4 سيناريوهات بصرية موجهة، وليس إعادة نسبة المرحلة السابقة إلى بصمة المصدر المعدلة |
| لوحات اللعبة | 291/291 في 47 ملفًا وفق التسليم النهائي للمهمة الأم | مجموعة منفصلة عن اختبارات browser وadapter؛ لا تُجمع الأعداد لتضخيم نطاق التغطية |
| متصفح مع قاعدة معزولة | 6 حالات anonymous و4 authenticated وحالتا abandoned نجحت وفق تسليم المهمة الأم | PostgreSQL معزول؛ لا أوامر على حسابات إنتاج |
| بناء الويب النهائي | Next Turbopack وTypeScript وتوليد الصفحات وفحص Supabase public exposure وCSS hex budget نجحت exit 0 وفق المهمة الأم | يشمل مصدر النص المجمد؛ local build ID: s2Kwdj4sHIN0AlXpNxAAF؛ لا نشر أو رفع Sentry |
| Socket.IO fixture وlatency/requests | 2/2 على Desktop وPixel 5؛ JSON خام، N=8 لكل جهاز، والجدول أدناه وفق nearest-rank | Gateway وSocket.IO وMapLibre فعلية؛ ledger وAPI وDTO وcentral tick والمصادقة اصطناعية؛ baseline غير مقاس |
| أداء الإنتاج | غير مقاس، والتغييرات غير منشورة | لا ادعاء زمن وصول أو FPS أو استهلاك طلبات إنتاجي |

### القياس المحلي الفعلي

الأرقام التالية تخص تجربة Socket.IO النهائية 2/2 بعد فصل مصدر النص، على المصدر المجمد في الجدول أدناه. يحفظ التقرير العينات كما سُلّمت، وتطابقت العينات في JSON المجمّع مع الملف الخام المستقل لكل جهاز.

[العينات الخام](<C:/Users/tkssy/Documents/Codex/2026-10-09/task/artifacts/mamluk-review/local-fixture-realtime-metrics.json>) يحمل JSON المجمّع recordedUtc=2026-10-09T10:34:09.524069Z، على أساس c18148c. تحمل بصمة Gateway المجمّع SHA256: 0684BAB295B96F435EF69E300406E203196E471A33A031087F1FAE363330327C. هذه بصمة ملف dist المستخدم وليست SHA التزام جديد. أعادت مراجعة الوثيقة حساب p50/p95 من العينات الخام وتطابقت مع الملخص. بصمة JSON بعد إضافة metadata النهائية: 5A7CF3FEF7D4C4A7F95CBB3591520158059AEDBFE198E07C4359F929401BA4E1.

بيئة run: Windows، Node v25.9.0، Playwright 1.63.0، وChromium headless shell 153.0.8010.12 revision 1243 كما أثبته executable المثبت. Desktop بحجم viewport ‏1366×900؛ Mobile محاكاة Pixel 5 بواجهة Android 11، viewport ‏393×727 وscreen ‏393×851، DPR ‏2.75 وtouch. يعمل Chromium headless مع SwiftShader وMapLibre workers فعلية، بلا بناء ثقيل أو متصفح المهمة الأم بالتوازي أثناء مراحل القياس. هذه محاكاة هاتف على Windows وليست قياس جهاز Pixel 5 ماديًا.

استخدمت التجربة المتصفح وMapLibre وعماله وSocket.IO websocket وKingdomsGateway المجمّع الفعلي. سجل قبول الأوامر وviewport DTO وبيانات الإذن كلها synthetic، بلا محرك أو قاعدة بيانات أو مصادقة إنتاج حقيقية. centralTicks في هذا bench مؤقت fixture كل 5 ثوانٍ يقرأ ledger الاصطناعي وينشر عبر Gateway؛ لم يُشغّل KingdomsWorker أو Web tick أو probe الفعلي في هذا القياس. إثبات عقود تلك الأجزاء يأتي من اختبارات الخادم والـ API المنفصلة.

| المقياس المحلي | Desktop | Android / Pixel 5 |
| --- | --- | --- |
| N للاتصال السليم | 8 | 8 |
| commandStart → أول جيش في renderer، p50 | 56.9 ms | 73.2 ms |
| commandStart → أول جيش في renderer، p95 | 133.5 ms | 184.3 ms |
| المدى لنفس المقياس | 32.0–133.5 ms | 33.1–184.3 ms |
| الفرق الموقّع من جواب HTTP → renderer | −71.2 إلى +27.6 ms | −69.5 إلى +80.6 ms |
| عدد العينات التي رُسمت قبل اكتمال جواب HTTP | 7/8 | 6/8 |
| إشعار مفقود: commandStart → renderer، عينة واحدة | 4,603.1 ms | 218.4 ms |
| fallback: commandStart → renderer، عينة واحدة | 5,019.3 ms | 5,051.1 ms |
| استعادة الاتصال → ازدياد عداد viewport، عينة واحدة | 364 ms | 117 ms |
| أمر بعد الاتصال المستعاد → renderer، عينة واحدة | 56.9 ms | 74.5 ms |

الـ quantile هو nearest rank: ترتيب تصاعدي ثم الرتبة ceil(p×N) بدءًا من 1. مع N=8 يساوي p95 أكبر عينة. هذه أرقام وصفية محلية؛ لا تقدير لتوزيع اللاعبين أو SLA أو نسبة تحسن مقابل c18148c.

أخّر fixture رد HTTP السليم 100 ms عمدًا، بعد قبول الأمر في ledger وبث revision، لاختبار عدم تكرار GET حين يصل Socket.IO قبل حدث القبول في الصفحة. لذلك ظهرت قيم سالبة بالنسبة للرد؛ لم تُحذف أو تُحوّل إلى صفر. ردود missed/fallback/reconnect بلا هذا التأخير. لا يقيس الرقم السالب نجاحًا متفائلًا من العميل ولا زمن حفظ DB حقيقية.

قياس reconnect يبدأ من إعادة mode الخدمة المحلية إلى live حتى ملاحظة ازدياد عداد viewport عبر stats، بساعة Date.now وpolling الاختبار. ليس ذلك ACK → snapshot أو ACK → renderer مقاسًا، ولا يثبت بمفرده قبول snapshot النهائي أو زمن استعادة إنتاجي. نجحت بعده عينة رسم جيش ونافذة idle جديدة. نتيجتا 364 ms و117 ms عينتان فقط؛ زمن recovery يتأثر بطور retry، فلا تبرران quantile أو وعدًا بحد أقصى.

| مرحلة العدّ | نافذة القياس | GET viewport Desktop / Android | أوامر Desktop / Android | centralTicks Desktop / Android |
| --- | --- | --- | --- | --- |
| idle healthy | جواب viewport جديد + 500 ms استقرار، ثم 6,000 ms | 0 / 0 | 0 / 0 | 1 / 1 |
| healthy commands | قبل/بعد 8 أوامر متتابعة ورسمها | 8 / 8 | 8 / 8 | 1 / 0 |
| missed notify repair | قبل/بعد أمر ضاع إشعاره وحدث قبوله المحلي | 1 / 1 | 1 / 1 | 1 / 1 |
| fallback | فصل غرفة الاتصال، ثم أمر وأول رسم، ثم 11,000 ms | 2 / 2 | 1 / 1 | 3 / 3 |
| reconnected idle | جواب viewport جديد + 500 ms استقرار، ثم 6,000 ms | 0 / 0 | 0 / 0 | 1 / 1 |

عدادات المراحل مأخوذة قبل/بعد كل مرحلة من /__globe_test/stats على خادم fixture. تحصي الطلبات التي وصلت إليه، ولا يقدم هذا JSON تفصيلًا مستقلًا لمحاولات المتصفح الملغاة قبل الوصول أو HTTP failures/aborts. لا نساويها بإحصاء شامل لكل محاولة شبكة عميل كما يطلب البروتوكول الأوسع.

صلاحية الإذن الاصطناعية 15,000 ms؛ نافذة idle ذات 6 ثوانٍ أقصر منها. لذلك يثبت الصفر منع GET المكرر في النافذة، ولا يثبت توقف التجديد طوال جلسة. مرحلتا fallback مختلفتان في طول نافذتهما الكلي بنحو زمن أول رسم، وليستا معدل طلبات لكل دقيقة.

سجل run كامل 4 اتصالات websocket لكل جهاز، و17 frame يحمل kingdoms:revision على Desktop و16 على Android. هذه أعداد اتصالات/frames، وليست عدد طلبات Engine.IO/HTTP منفصلة مقاسًا. overview صفر في هذه المراحل، وpanelApiRequests صفر لأن useKingdoms واللوحات غير مركبة في fixture؛ لا يُنسب ذلك إلى خفض استهلاك لوحة اللعبة.

المقارنة التجريبية مع baseline c18148c لم تُشغّل. protocol المختلط وwatch capacity وتفاصيل DB والـ probe تُغطى باختبارات موجهة منفصلة؛ لا تدّعي حالتا المتصفح تغطية كل صف في مصفوفة البروتوكول وحدهما. لم يُقس زمن رحلة جيش إنتاجي أو FPS إنتاجي.

الملفان الخامان المستقلان: [Desktop raw JSON](<C:/Users/tkssy/Documents/Codex/2026-10-09/task/artifacts/mamluk-review/local-fixture-realtime-desktop-raw.json>)، SHA256: C4E536CB2812235E9DC831D5FD1DA98CE2AC2F6F298BB196479E43097721260A؛ و[Mobile raw JSON](<C:/Users/tkssy/Documents/Codex/2026-10-09/task/artifacts/mamluk-review/local-fixture-realtime-mobile-raw.json>)، SHA256: 90C7FC6CC3FD36C39D685F9A9492EF8711BDF8A5FBED4382D500A59175CF347D. لم يعدل كاتب الوثيقة أي JSON.

أدلة ETA أثناء تقدم الحركة: [اللقطة 1](<C:/Users/tkssy/Documents/Codex/2026-10-09/task/artifacts/mamluk-review/local-fixture-crowded-mobile-moving-1.png>)، [اللقطة 2](<C:/Users/tkssy/Documents/Codex/2026-10-09/task/artifacts/mamluk-review/local-fixture-crowded-mobile-moving-2.png>)، [اللقطة 3](<C:/Users/tkssy/Documents/Codex/2026-10-09/task/artifacts/mamluk-review/local-fixture-crowded-mobile-moving-3.png>). أكدت المراجعة البصرية للمهمة الأم قراءة أربعة مؤقتات في 1 و3 مع 11 دائرة جيش، وفق collision؛ الصورة وحدها لا تثبت وضوح كل label في كل إطار.

### بصمة المصدر المجمد

أكد الكاتب تجميد هذه الملفات بعد إصلاح نص ETA وقبل إعادة Socket.IO النهائية. هذه SHA256 لمحتوى الملف الفعلي، بما فيه line endings، وليست Git commit. تربط الوثيقة المصدر بدليل القياس دون تعديل JSON الخام. gateway dist يحمل بصمته المستقلة داخل JSON.

| الملف | SHA256 |
| --- | --- |
| [packages/mamluk-maplibre-adapter/src/adapter.ts](../../packages/mamluk-maplibre-adapter/src/adapter.ts) | F85434A3DFABCEFD63CF48C2DC520A2636F8C066FFD34DAC976D2D8D03382AAA |
| [packages/mamluk-maplibre-adapter/src/army-motion.ts](../../packages/mamluk-maplibre-adapter/src/army-motion.ts) | 4E23D82B41874D505FD7879B6136115A1636C01ACFF24F56A4B66855773F3088 |
| [packages/mamluk-maplibre-adapter/src/styles.ts](../../packages/mamluk-maplibre-adapter/src/styles.ts) | 4967692F58D4B1F599FD94082F5D2B99B0951E34237145351EAAE631BA0EB536 |
| [packages/mamluk-maplibre-adapter/src/viewport-loader.ts](../../packages/mamluk-maplibre-adapter/src/viewport-loader.ts) | B25AE370E180E5051559D95523E3FAA66ADFA7ACFA0FF55308E8228109BA2569 |
| [apps/web/src/components/mamluk-map/map-session.ts](../../apps/web/src/components/mamluk-map/map-session.ts) | F80CF06B11134A146D006E1ABE42602938686AEA3D764DC9AA0D280D8695C511 |
| [apps/web/src/components/mamluk-map/map-revisions.ts](../../apps/web/src/components/mamluk-map/map-revisions.ts) | 22F3CF6369A1DF16DF3EA6E430B6EF92362ACA2431D4F736332BD9CBEFA32AE8 |
| [apps/web/src/components/mamluk-map/use-world-map.ts](../../apps/web/src/components/mamluk-map/use-world-map.ts) | 9FB808CE3844BC98EEC3816D7E9C4A45B3B3D3C8D9C20C4F1B3F333D49324E59 |
| [apps/web/src/lib/mamluk-map/kingdom-projection.ts](../../apps/web/src/lib/mamluk-map/kingdom-projection.ts) | 0106D9F7ED1F36054BEC5086E2784F80D4DFF0266991DA08727D4E31809CF199 |
| [apps/web/src/app/api/kingdoms/world-map/viewport/route.ts](../../apps/web/src/app/api/kingdoms/world-map/viewport/route.ts) | 489419BB021F071FC6DD1F1248EA6B9AC2A9C3F0712BBD37D8BF85687CB3C91C |
| [apps/web/e2e/fixtures/globe-scene-server.ts](../../apps/web/e2e/fixtures/globe-scene-server.ts) | 1E792FB35099A86097C75BDE088ED2D0449ECC1E8F5FF24FC11F13A9FB7FBB16 |
| [apps/web/e2e/mamluk-map-realtime.spec.ts](../../apps/web/e2e/mamluk-map-realtime.spec.ts) | 058EEB19D8E5C70A9110A4DC9AA82885F142C08FF47C8C159212266244BB8C3B |
| [apps/web/playwright.mamluk-realtime.config.ts](../../apps/web/playwright.mamluk-realtime.config.ts) | 65EC4AD60AA6E770E8F7F063B838083544140FC15CF0187AF19E2AFCBBAEA6BB |

### إعادة تشغيل تجربة النقل

المصدر: [config](../../apps/web/playwright.mamluk-realtime.config.ts)، [اختبار المتصفح](../../apps/web/e2e/mamluk-map-realtime.spec.ts)، و[fixture الاختياري](../../apps/web/e2e/fixtures/globe-scene-server.ts). يشغّل config عامل متصفح واحدًا، Desktop بحجم 1366×900 وPixel 5، وChromium بإعداد SwiftShader، ويضبط MAMLUK_REALTIME_FIXTURE=1 وRUN_MAMLUK_REALTIME_E2E=1. لا يفعّل الخادم المصطنع في إعداد اللعب العادي.

من جذر النسخة المعزولة، يحتاج checkout جديد أو dist قديم بناء realtime أولًا، ثم الاختبار. لا يحتاج البناء الناجح للبصمة نفسها إلى إعادة هنا:

```powershell
pnpm --filter @tahaddi/realtime build
pnpm --filter @tahaddi/web exec playwright test --config playwright.mamluk-realtime.config.ts
```

أدلة النقل الجديدة: [Desktop PNG](<C:/Users/tkssy/Documents/Codex/2026-10-09/task/artifacts/mamluk-review/local-fixture-realtime-desktop.png>)، [Desktop WebM](<C:/Users/tkssy/Documents/Codex/2026-10-09/task/artifacts/mamluk-review/local-fixture-realtime-desktop.webm>)، [Mobile PNG](<C:/Users/tkssy/Documents/Codex/2026-10-09/task/artifacts/mamluk-review/local-fixture-realtime-mobile.png>)، [Mobile WebM](<C:/Users/tkssy/Documents/Codex/2026-10-09/task/artifacts/mamluk-review/local-fixture-realtime-mobile.webm>). كلها fixtures محلية.

أدلة مرحلة الحركة المحلية الموجودة في C:\Users\tkssy\Documents\Codex\2026-10-09\task\artifacts\mamluk-review:

- local-fixture-journeys-desktop.png وlocal-fixture-journeys-desktop.webm.
- local-fixture-journeys-mobile.png وlocal-fixture-journeys-mobile.webm.
- local-fixture-reconnect-desktop.png وlocal-fixture-reconnect-desktop.webm.
- local-fixture-reconnect-mobile.png وlocal-fixture-reconnect-mobile.webm.

هذه أدلة مرحلة الحركة قبل تقرير النقل أعلاه، وليست صور حساب إنتاج. تبقى المقارنة مع baseline غير مقاسة ما لم يُشغّل الأساس بالشروط نفسها.

## بوابة المراجعة النهائية

اكتمل تحديث التقرير من تسليم army_map/army_rules وweb، مع المصدر المجمد وJSON النهائي وبناء الويب الأخير الناجح. فُصل نطاق الجولة الوظيفية الكاملة عن التحقق الموجه بعد مصدر النص، ولم تتغير عتبات التغطية أو شروط FPS أو assertions المؤقتات. لا يُعاد بناء ثقيل نجح على البصمة نفسها دون سبب جديد، ولا يُشغل بناءان ثقيلان معًا.

قبل أي تفعيل إنتاجي يحتاج المستخدم موافقة منفصلة للنشر. بعد تلك الموافقة فقط يُتحقق من إصدار Vercel وRender كلًا على حدة، وحضور الإعدادات دون عرض قيمها، وprobe وACK في عالم اختبار معزول، ثم command → publish → viewport → renderer والتعافي بالقياس نفسه. فشل الإشعار لا يسمح بتجاوز القفل أو صلاحيات viewport أو تغيير نتيجة المحرك.

دراسة الاقتصاد محفوظة في مساحة مراجعة مستقلة وخارج حزمة إصدار الجيش والخريطة. نتائج fixture لا تصدق أي توازن اقتصادي غير معتمد.

## تحقق حزمة الإصدار المنفصلة

هذه الوثيقة تسجل أدلة محلية سابقة. فصل الإصدار يتطلب تحققًا على ملفات الحزمة وبصمتها الفعلية، ثم CI وpreview وإثبات SHA المنشور لكل خدمة؛ نجاح health وحده لا يثبت تفعيل realtime.

لا migration أو dependency أو سر جديد ضمن الحزمة. ترتيب الخدمات المختلط يستخدم fallback إلى أن يثبت العميل capability/probe/revisions، مع الحفاظ على مواعيد الجيش المحفوظة. يتطلب التشغيل الكامل وجود أسماء الإعدادات الحالية وتطابقها؛ لا تغيّر الأسرار أو الحسابات لتجاوز رفض صلاحية.
