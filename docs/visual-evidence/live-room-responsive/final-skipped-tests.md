# مراجعة الاختبارات الـ103 المتجاوزة

المراجع المستقل: `final_skips_audit`، بتاريخ 21 أكتوبر 2026.
المصدر العددي هو تشغيل `pnpm test --concurrency=2` المسجل في
`/workspace/scratch/live-room-full-tests.log`، ثم مراجعة شروط التجاوز وأجسام الاختبارات
في المصدر. لم يُعد تشغيل المجموعة الشاملة أثناء هذه المراجعة.

**النتيجة:** ليست الاختبارات الـ103 كلها خارج نطاق البث. يوجد **10 اختبارات ذات صلة
مباشرة بمخزن الغرفة الحالية أو هويتها**، و**7 اختبارات مشتركة للملف الشخصي والمظهر**،
و**86 اختبارًا خارج مسار غرفة LiveKit الحالية**. لا يُحسب أي اختبار متجاوز اختبارًا ناجحًا.

## الجرد الكامل

المسارات في الجدول نسبية إلى `apps/web` ما لم يذكر غير ذلك. الأعداد من تقرير التشغيل،
وتشمل توسيع حالات `it.each`؛ لذلك لا يعتمد الجرد على عد أسطر `it` وحدها.

| الملف / المجموعة | العدد | سبب التجاوز في المصدر | الصلة باعتماد شاشة `/voice` |
| --- | ---: | --- | --- |
| `src/lib/community/community.integration.test.ts` | 9 | غياب `COMMUNITY_VOICE_TEST_DATABASE_URL` | مختلط: اختباران مباشران لـLiveKit، أربعة للهوية والمظهر المشترك، وثلاثة لمسار mesh المستقل |
| `src/lib/voice/repository-quota.integration.test.ts` | 7 | غياب `VOICE_TEST_DATABASE_URL` | مباشرة؛ إنشاء الغرف والحضور وحجز صلاحيات الوسائط الحقيقي في PostgreSQL |
| `src/lib/profile/repository.database.integration.test.ts` | 4 | غياب `PROFILE_TEST_DATABASE_URL` المطابق لقاعدة اختبار محلية | اختبار مباشر لتحديث هوية الغرفة؛ ثلاثة للملف الشخصي المشترك |
| `src/lib/kingdoms/reports-repository.integration.test.ts` | 7 | غياب `KINGDOMS_TEST_DATABASE_URL` | أرشيف تقارير الممالك، خارج مسار الصوت الحالي |
| `src/lib/kingdoms/abandoned-repository.integration.test.ts` | 4 | غياب `KINGDOMS_TEST_DATABASE_URL` | قرى مهجورة وحركات جيوش، خارج النطاق |
| `src/lib/kingdoms/palace-garden.integration.test.ts` | 2 | غياب `KINGDOMS_TEST_DATABASE_URL` | حفظ حديقة القصر، خارج النطاق |
| `src/lib/kingdoms/repository.integration.test.ts` | 34 | غياب `KINGDOMS_TEST_DATABASE_URL` | تزامن أوامر اللعبة والموارد والإدارة، خارج النطاق |
| `src/lib/kingdoms/commander-migration.integration.test.ts` | 1 | غياب `KINGDOMS_TEST_DATABASE_URL` | ترحيل بيانات القادة، خارج النطاق |
| `src/lib/kingdoms/village-onboarding.integration.test.ts` | 3 | غياب `KINGDOMS_TEST_DATABASE_URL` | تهيئة القرية، خارج النطاق |
| `src/lib/mamluk-map/village-relocation-repository.integration.test.ts` | 5 | غياب `KINGDOMS_TEST_DATABASE_URL` | نقل موقع القرية، خارج النطاق |
| `src/lib/mamluk-map/repository.integration.test.ts` | 13 | غياب `KINGDOMS_TEST_DATABASE_URL` | استعلامات وملكية وجغرافيا الخريطة، خارج النطاق |
| `src/lib/openclaw-admin/database.integration.test.ts` | 2 | غياب `OPENCLAW_TEST_DATABASE_URL` | اعتماد أوامر بنك الأسئلة، خارج النطاق |
| `apps/realtime/src/fastest-button/fastest-button.integration.spec.ts` | 9 | غياب `FASTEST_TEST_REDIS_URL` | لعبة الزر الأسرع وتزامن Redis؛ ليست قناة صوت LiveKit |
| `apps/realtime/src/fastest-button/fastest-button.websocket.spec.ts` | 1 | غياب `FASTEST_TEST_REDIS_URL` | Socket.IO للعبة الزر الأسرع؛ لا يختبر reconnect الصوت |
| `scripts/blender-cli.test.mjs` — الاختباران الاختياريان الحقيقيان | 2 | `RUN_BLENDER_INTEGRATION !== '1'` | مراقبة تصدير Blender وضغط الخامات، خارج النطاق |
| **المجموع** | **103** | **91 web + 10 realtime + 2 Blender** | **10 مباشرة + 7 مشتركة + 86 خارج النطاق** |

## الاختبارات المباشرة المهمة

### مخزن الغرفة وصلاحيات الوسائط — 7 اختبارات

المصدر: `apps/web/src/lib/voice/repository-quota.integration.test.ts`.

| السطر | الاختبار | ما يبقى غير متحقق عند تجاوزه |
| ---: | --- | --- |
| 75 | `admits only one concurrent creation when the host already has four active rooms` | سلامة حد إنشاء الغرف تحت طلبين متزامنين |
| 128 | `rejects a sixth active room but admits a replacement after a room is closed` | تحرير حصة الغرفة بعد الإغلاق |
| 142 | `allows a different host to create while the first host creation is blocked` | عدم حبس مضيف آخر خلف قفل إنشاء غرفة |
| 196 | `rolls back a failed insert and releases the quota lock for another client` | rollback وتحرير القفل بعد فشل قيد قاعدة البيانات |
| 211 | `keeps repeated fresh presence reads off the room write lock` | أن polling الحضور لا يحتجز قفل كتابة الغرفة بلا حاجة |
| 231 | `does not invalidate user writes for scheduler-only checkpoints but versions real ledger changes` | تناسق revision الحقيقي مع سجل صلاحيات الوسائط |
| 260 | `skips busy periodic checks while forced permission work still waits for the shared lock` | أن الفحص الدوري يتجاوز القفل المشغول بينما تظل كتابة الصلاحيات الإلزامية محكومة بالقفل المشترك |

**الاختبارات الثلاثة الأخيرة مهمة خصوصًا لاعتماد تشغيل الغرفة**: تتناول التزامن
والحضور وسجل الصلاحيات الذي يعتمد عليه الكتم/الإذن بالمشاركة. لا يصح وصف هذا الملف
كحصة إنشاء غرف فقط. نجاح الاختبارات الوحدوية لا يثبت هذه الخواص بين عملاء PostgreSQL مستقلين.
الاختبارات الأربعة الأولى مهمة لدخول وإنشاء وإغلاق الغرفة، وإن كانت أقل اتصالًا بعرض CSS.

متطلبات التنفيذ: قاعدة **مجهزة مسبقًا** محلية باسم `voice_test_*`، مطبق عليها المخطط
المطلوب، و`VOICE_TEST_DATABASE_URL` دون query/hash. الملف يرفض القواعد العامة أو الخارجية،
ولا يعود إلى `DATABASE_URL`. ينشئ بيانات اختبار UUID ثم يحذف بيانات تشغيله؛ لا ينشئ المخطط.
الاختبار يستخدم قاعدة فعلية وعملاء مستقلين، لكنه لا يختبر صوتًا حيًا عبر SFU.

### الهوية القائمة داخل LiveKit — 3 اختبارات

| الملف والسطر | الاختبار | الأهمية |
| --- | --- | --- |
| `community/community.integration.test.ts:147` | `retains legacy rows and custom account-number semantics after both migrations` | حفظ غرفة LiveKit القائمة، revision وقيود الخصوصية والمفضلات والبلاغات والرسائل والأصول عند ترحيل الهوية |
| `community/community.integration.test.ts:493` | `refreshes granted display identity inside the existing SFU room without changing its roles` | انعكاس منح/سحب المظهر والشارات داخل غرفة `/voice` مع بقاء دور المستمع والغرفة دون استبدال |
| `profile/repository.database.integration.test.ts:100` | `refreshes an existing room host/participant identity from the edited profile without reconnecting` | تحديث اسم المضيف/المشارك في الغرفة دون reconnect |

الاختبار الأول يعتمد ترحيل قاعدة البيانات، والثاني والثالث يختبران تكامل الهوية الحقيقي
مع مستودع الغرفة؛ هي مخاطر إصدار/تكامل فعلية وإن لم تغيّر إصلاحات التجاوب هذه المسارات.

**تمييز ضروري:** اختبارات إنشاء mesh وreconnect/old-tab/suspension وحد 24 عضوًا في
`community.integration.test.ts:288,417,466` تستخدم `community-voice/repository`.
تجاوزها ليس دليلًا على تجاوز اختبار إعادة اتصال LiveKit؛ المساران مستقلان.

## الاختبارات المشتركة — 7 اختبارات

- `community.integration.test.ts:182,198,218,260`: سرية إعدادات الملف، خصوصية المتابعة،
  ملكية المظاهر والتدقيق، وانتهاء المنح والشارات الحساسة. تؤثر في الاسم والشارات والمظهر
  وأزرار المتابعة المشتركة، ولا تثبت إرسال صوت أو عمل الميكروفون.
- `profile/repository.database.integration.test.ts:46,49,85`: حساب المتابعات مع الحظر،
  حفظ الاسم والصورة وإزالتها، وحسم تنازع أسماء المستخدمين. مهمة لتكامل بيانات الحساب
  المعروضة في الغرفة؛ ليست عائقًا مثبتًا في تخطيط المقاعد أو الدردشة.

## ما نُفّذ في هذه المراجعة

فُحص حضور مفاتيح opt-in في بيئة التشغيل مع تحميل `.env` بالطريقة المعتادة، دون طباعة
أي قيم أو بيانات اعتماد. كانت المفاتيح السبعة التالية **غائبة**:
`VOICE_TEST_DATABASE_URL`, `COMMUNITY_VOICE_TEST_DATABASE_URL`,
`PROFILE_TEST_DATABASE_URL`, `KINGDOMS_TEST_DATABASE_URL`,
`OPENCLAW_TEST_DATABASE_URL`, `FASTEST_TEST_REDIS_URL`, `RUN_BLENDER_INTEGRATION`.

أُعيد استدعاء الاختبارات الصوتية الاختيارية بالطريقة المخصصة:

```sh
# من apps/web
node node_modules/vitest/vitest.mjs run --config vitest.voice-quota.config.ts
```

النتيجة الفعلية: **ملف واحد متجاوز، 7 اختبارات متجاوزة، 0 assertions منفذة**،
مدة 758ms، exit 0. هذا يؤكد عمل شرط الحماية؛ **ليس نجاحًا للاختبارات السبعة**.
لم تُضبط قيمة URL بديلة، ولم تُنشأ قاعدة أو يتغير مخطط أو إعداد خدمة.

لم تُشغّل بقية الاختبارات المتجاوزة. متطلبات القواعد المعزولة غير موفرة في جلسة
الاختبار، واختبار community ينفذ `DROP SCHEMA public CASCADE` ثم يعيد migrations داخل
قاعدة `community_voice_test` مخصصة. تشغيله يحتاج قاعدة اختبار قابلة للإتلاف معزولة
وموافقة منفصلة على هذا الإعداد؛ لا يُوجّه إلى بيانات التطبيق أو الإنتاج.
اختبار profile يتطلب قاعدة محلية `profile_test_*` مجهزة مسبقًا؛ ينشئ مستخدمين ثابتين
ولا ينظفهم، لذلك يحتاج قاعدة جديدة/قابلة للإتلاف لكل تشغيل مستقل.

## قرار الاعتماد وحدود النتيجة

- **التجاوزات التي يلزم إبرازها قبل اعتماد إنتاجي للصوت:** الاختبارات المباشرة العشرة،
  وبالأخص أقفال الوسائط وسجل الصلاحيات والحضور. يوصى بتنفيذها في قواعد محلية معزولة
  مجهزة، أو قبول مخاطر غياب هذا الدليل صراحةً؛ لم تُغلق بتدقيق المصدر وحده.
- **التجاوزات المشتركة السبعة:** يلزم إبقاؤها في سجل مخاطر تكامل الهوية والمظهر؛
  لا تُسوّى بالاختبارات البصرية المحاكية.
- **الـ86 الأخرى:** لا تمنع اعتماد إصلاح عرض `/voice` وحده، لكنها لا تمنح شهادة
  جاهزية للموقع أو الألعاب الأخرى.
- لا واحد من هذه الاختبارات الـ103 يثبت مرور صوت حقيقي بين جهازين أو فتح/إغلاق
  لوحة مفاتيح نظام على جوال حقيقي. هذه فحوص منفصلة **غير منفذة** ما لم يوفر تقرير
  الأجهزة دليلًا مباشرًا؛ لا يجوز إضافتها إلى عدد الاختبارات المتجاوزة أو الناجحة.
- يوجد دليل وحدوي سابق ناجح لمسار LiveKit: `audio-session` (16)، `livekit` (25)،
  `admission` (4)، `webhook` (5)، `voice-media-token` (2)، و`room-state` (23).
  يغطي سياسات وأحداثًا محاكية ولا يعوض التزامن الحقيقي أو الأجهزة أو SFU الحي.
- لا توصية بتغيير منطق الصوت أو تعطيل الحماية أو إزالة شروط skip. لم يُنفّذ Push أو نشر.
