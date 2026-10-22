# تسليم مراجعة واجهة تحدي لايف

الفرع: `feat/tahaddi-live-reference-ui`. تم اعتماد الرفع والنشر صراحةً في طلب المستخدم اللاحق. هذه نسخة الواجهة التي اجتازت فحوص الإصدار المحلية؛ لا تعني ادعاء مطابقة بكسلات كاملة أو إضافة نظام فيديو غير موجود. تُسجّل نتيجة الرفع ورابط الإنتاج في رسالة التسليم النهائية.

## النتيجة

- توحيد أسطح تحدي لايف على كحلي داكن وذهب هادئ، مع البنفسجي لحالات التفاعل.
- ضبط الغرفة للجوال والكمبيوتر: مقاعد دائرية، شبكة متجاوبة، دردشة مستقلة وأدوات تحكم يمكن الوصول إليها.
- إظهار المقاعد الشاغرة افتراضيًا، وإتاحة تسعة مقاعد كافتراضي في نموذج إنشاء غرفة جديدة؛ لا تغيير في إعدادات الغرف الموجودة أو مخطط البيانات.
- تبويبات الاكتشاف تعمل على ترتيب البيانات الحقيقية حسب الحالة/النشاط/الحداثة؛ الاحتفاظ بالبحث والمفضلة والصلاحيات.
- تسجيل دخول خاص بسياق `/voice`، وصقل الملف العام دون تغيير المصادقة أو بيانات المتابعة.
- محرر دردشة مستقل، تركيز على الرد، حصر التركيز بلوحة الفيسات وإعادته عند الإغلاق، واحترام تقليل الحركة.
- بناءً على توجيهك الأخير: إزالة رسومات الكأس والتاج والأفاتار المكبر والخلفيات الزخرفية. الغلاف الافتراضي المرسوم لا يظهر في بطاقات الاكتشاف؛ تظهر صورة المضيف/الغلاف المرفوع إن وجد، وإلا أحرف الاسم. لم تُنشأ صور أشخاص وهمية. وفي المراجعة اللاحقة ضُغطت البطاقات واللافتة والإحصائيات لتقريب الكثافة من المرجع، مع تصحيح القص عند تكبير النص.

## الصور الفعلية

| السطح | الجوال | الكمبيوتر |
| --- | --- | --- |
| قبل الغرفة | [390×844](visual-evidence/tahaddi-live/before-390x844.png) | [1440×900](visual-evidence/tahaddi-live/before-1440x900.png) |
| بعد الغرفة | [390×844](visual-evidence/tahaddi-live/after-390x844.png) | [1440×900](visual-evidence/tahaddi-live/after-1440x900.png) |
| الاكتشاف | [390×844](visual-evidence/tahaddi-surfaces/lobby-390.png) | [1440×900](visual-evidence/tahaddi-surfaces/lobby-1440.png) |
| الملف الشخصي | [390×844](visual-evidence/tahaddi-surfaces/profile-390.png) | [1440×900](visual-evidence/tahaddi-surfaces/profile-1440.png) |
| الدخول | [390×844](visual-evidence/tahaddi-surfaces/login-390.png) | [1440×900](visual-evidence/tahaddi-surfaces/login-1440.png) |

توجد أيضًا صور 430×932 و1920×1080 وخرج جوال 1080×1920 من نافذة CSS بحجم 360×640 وDPR=3. صور الأسطح الكاملة قد تتجاوز ارتفاع نافذة الاختبار. صور الغرفة قبل/بعد متاحة؛ لم تُصطنع صور قبل للاكتشاف/الدخول/الملف.

## التحقق

- **100 اختبار وحدة نجح** عبر 13 ملفًا: الصوت وديمومة الجلسة والدردشة وعزل الكتابة والفيسات والهدايا والدخول والرموز. بعد تعديل بطاقات الصور الأخير أُعيد ملف الواجهة فقط: **18/18 نجح**.
- **5 اختبارات Playwright جديدة للغرفة نجحت**: RTL، المقاسات المطلوبة، عدم تجاوز العرض، أهداف 44×44، تسعة مقاعد دون تداخل، إرسال الرد مرة واحدة، عدم إرسال طلبات أثناء الكتابة، رجوع التركيز، لوحة مفاتيح محاكاة، وتكبير النص.
- **ثلاثة اختبارات للأسطح** تشمل الجوال والكمبيوتر، ترتيب الغرف، المتابعة التجريبية وحقول الدخول، مع اختبار إضافي لعرض 320 بكسل وتكبير النص إلى 200% يتحقق من بقاء زر الدخول داخل النافذة، وعدم تداخل عناوين البطاقات مع أعداد المستمعين، واحتواء بديل الصورة والإحصائيات وحقول الكتابة.
- **اختبارات الاستجابة القائمة: 5 نجحت**، واختبار المرحلة النهائية الذي يُتخطى في التشغيل الافتراضي **نجح منفردًا** بعد ذلك. عُدّلت تهيئة الاختبار لتقبل ظهور المقاعد افتراضيًا دون تغيير توقعات السلامة.
- ESLint المستهدف بلا أخطاء، و`git diff --check` وفحص ميزانية ألوان CSS نجحت.
- فحص TypeScript والبناء المحلي الكامل نجحا بعد إعادة بناء جميع الحزم، بما فيها حزمتا الخريطة. اتضح أن العائق السابق سببه مخرجات أنواع قديمة؛ لم يتطلب تعديل منطق الخريطة. نجح البناء النهائي المحلي أيضًا بعد تصحيحات الواجهة والوصولية.

الأوامر القابلة للإعادة والتفاصيل في [أدلة الغرفة](visual-evidence/tahaddi-live/README.md) و[أدلة الأسطح](visual-evidence/tahaddi-surfaces/README.md). الاختبارات تستخدم مكونات الإنتاج مع بيانات HTTP ومحول صوت تجريبي؛ ليست إثباتًا لاتصال SFU/ميكروفون فعلي أو تسجيل دخول إلى الإنتاج.

كانت ذاكرة البيئة تفتقد LiveKit وsharp وتحتوي مخرجات Prisma/حزم مشتركة قديمة؛ جُهزت الاعتماديات المعلنة محليًا وأعيد توليد المخرجات دون هجرة قاعدة بيانات أو تعديل manifest/lockfile. Next المثبت في الذاكرة 16.3.8 بينما manifest يطلب 16.4.2؛ هذه ليست بيئة اعتماد إصدار إنتاج مطابق تمامًا.

## المطابقة والفروقات

[المراجعة البصرية المستقلة](tahaddi-live-visual-review.md) تصنف النتيجة كمرحلة جزئية، بتقييم داخلي محافظ مقابل **كامل** الطلب، وليس نسبة تشابه بكسلات. المراجعة مرتبطة بالصور النهائية وتتضمن قيود الفيديو والأصول غير المتاحة. أبرز المتبقي:

1. المسار الحالي صوتي؛ لا يوجد فيه مصدر فيديو أو منافسة ثنائية/نقاط/مؤقت أو معرض فيديوهات للملف. لم تُصطنع هذه الوظائف ولم يُستبدل بروتوكول الصوت. استكمالها يحتاج تكاملًا وظيفيًا محددًا منفصلًا.
2. الصور البشرية الأصلية في المرجع غير متاحة كأصول للمشروع؛ بقيت بدائل صادقة عند غياب الصور.
3. أُعيد شريط التنقل والحساب على الكمبيوتر، وضُغطت المقاعد، وأصبحت رسائل الدردشة ظاهرة في أول نافذة للجوال. ما زال عمود توصيات البث المرئي في المرجع غير منفذ لغياب بيانات البث المرئي في هذا المسار.
4. ملف PNG الأصلي غير موجود في بيئة العمل؛ لذلك الألوان مستنتجة بصريًا ولا يوجد SSIM أو Pixel Difference موثق مع الأصل. مقارنة لقطة صفحة بالصورة المركبة كلها ستكون غير صالحة.
5. لا يوجد إثبات أداء أجهزة فعلية أو اختبار صوت/مصادقة/بيانات إنتاج، وصور قبل للأسطح الثلاثة الأخرى غير متوفرة.

توجيه عدم استخدام الرسومات الأخير مقدم على تفاصيل التاج والكأس الزخرفية في المرجع. لم تُعد هذه الرسومات لتحسين التشابه العددي.

## المستودعات والتراخيص

[فحص المصادر الستة](tahaddi-live-reference-audit.md) يوثق الوجود والالتزامات والتراخيص والتوافق. لم يُنسخ كود ولم تُضف مكتبة جديدة للمشروع: ChatCN وCord وQuetalcast مرخصة MIT؛ Semaphore مرخص AGPL-3.0؛ مثالا LiveKit وVideoSDK لا يعلنان ترخيصًا صالحًا للنسخ في الملفات التي فُحصت. استُخدمت كمراجع فقط.

## الملفات المعدلة والمضافة

- `apps/web/e2e/fixtures/tahaddi-surfaces-data.ts`
- `apps/web/e2e/fixtures/tahaddi-surfaces-harness.tsx`
- `apps/web/e2e/fixtures/tahaddi-surfaces-layout.tsx`
- `apps/web/e2e/fixtures/tahaddi-surfaces-server.ts`
- `apps/web/e2e/live-room-responsive.spec.ts`
- `apps/web/e2e/tahaddi-reference.spec.ts`
- `apps/web/e2e/tahaddi-surfaces.spec.ts`
- `apps/web/playwright.tahaddi-reference.config.ts`
- `apps/web/playwright.tahaddi-surfaces.config.ts`
- `apps/web/src/app/auth/sign-in/page.test.tsx`
- `apps/web/src/app/auth/sign-in/page.tsx`
- `apps/web/src/components/auth/auth-live.module.css`
- `apps/web/src/components/auth/auth-shell.tsx`
- `apps/web/src/components/community/profile-live.module.css`
- `apps/web/src/components/community/profile-view.tsx`
- `apps/web/src/components/voice/create-room.tsx`
- `apps/web/src/components/voice/emoji-picker.test.tsx`
- `apps/web/src/components/voice/emoji-picker.tsx`
- `apps/web/src/components/voice/emoji.module.css`
- `apps/web/src/components/voice/live-room-desktop.module.css`
- `apps/web/src/components/voice/live-room-mobile.module.css`
- `apps/web/src/components/voice/live-room.module.css`
- `apps/web/src/components/voice/use-voice-overlay.ts`
- `apps/web/src/components/voice/voice-chat.tsx`
- `apps/web/src/components/voice/voice-lobby.module.css`
- `apps/web/src/components/voice/voice-lobby.tsx`
- `apps/web/src/components/voice/voice-room.tsx`
- `apps/web/src/components/voice/voice-ui.test.tsx`
- `apps/web/src/components/voice/voice-ui.tsx`
- `apps/web/tokens.css`
- `docs/tahaddi-live-reference-audit.md`
- `docs/tahaddi-live-visual-review.md`

أدلة الصور والقياسات وتقاريرها تحت `docs/visual-evidence/tahaddi-live/` و`docs/visual-evidence/tahaddi-surfaces/`. هذا التقرير نفسه مضاف أيضًا.
