# بناء Android واختباره لتحدّي

## نطاق العميل الأصلي

فرع الدمج `codex/android-native-v2` مخصص لعميل Expo/React Native داخل
`apps/mobile`، مع دمج المصادقة والغرف والصوت والدردشة عبر خدمات المنصة
الحقيقية. لا يكفي بناء APK أو ظهور شاشة تسجيل الدخول لإثبات عمل هذه الوظائف.

تعيد طبقات العميل استخدام عقود HTTP الحالية ونظام LiveKit للغرف الصوتية.
دردشة الصوت تُحفظ عبر HTTP وتستقبل تحديثات LiveKit مع مزامنة احتياطية؛
Socket.IO في المستودع يخدم مسارات ألعاب أخرى ولا يجوز افتراض نقله تلقائيًا
إلى هذا العميل. يجب مراجعة الميزات الموجودة فعلًا في مصدر الالتزام المبني،
وتوثيق أي شاشة أو لعبة أو وظيفة خادم لم تُنقل بدل إنشاء بديل شكلي.

المعرّف: `com.qurabia.tahaddi`. تُقرأ نسخة التطبيق من `app.json`،
والنسخة والأذونات ونسخ SDK الفعلية من تقرير `apk-badging.txt` بعد البناء.
يبني هذا المسار معمارتي `arm64-v8a` و`x86_64`؛ لا يثبت دعم أجهزة Android
ذات معمارية 32 بت.

## بناء Debug في GitHub Actions

المسار: `.github/workflows/android-debug.yml`.

يعمل حدث push على `codex/android-native-v2` والفرع السابق
`codex/android-apk-ci` للملفات المحددة، وكذلك pull_request. لا يعدّل Workflow
الفرع الرئيسي ولا يرفع إصدارًا إلى متجر أو استضافة.

الأدوات مثبتة: Ubuntu 24.04، Node 24.14.0، pnpm 11.26.0، Temurin Java 17.
إجراءات Actions مثبتة بمعرّفات commits. تُستخرج إصدارات compileSdk وBuild Tools
وNDK من `react-native/gradle/libs.versions.toml` في حزمة React Native المثبتة،
وتُثبت عبر sdkmanager. يأتي Gradle Wrapper من قالب Expo المولّد.

خطوات التحقق:

1. تثبيت اعتماديات الجوال وworkspace التابعة له باستخدام
   `--frozen-lockfile --ignore-scripts`؛ لا تُشغّل دورة تثبيت خادم Prisma.
   تبقى سياسة `minimumReleaseAge` مفعّلة دون استثناءات جديدة.
2. اختبار مساعدات إعداد Debug، وبناء domain، وفحص TypeScript.
3. تشغيل جميع ملفات `*.test.ts` داخل `apps/mobile/src` و`apps/mobile/tests`
   بما فيها المجلدات المتداخلة، ثم اختبارات Python لحماية أداة المحاكي.
4. حفظ خريطة Expo المثبت وتشغيل `EXPO_OFFLINE=1 expo install --check` في
   خطوة التحقق وحدها. يستمر فحص التوافق مقابل خريطة SDK المحلية؛ لا تُضاف
   توصيات API الأحدث، ولا يُستخدم `EXPO_NO_DEPENDENCY_VALIDATION`.
5. تصدير Metro والأصول، ثم `expo prebuild --platform android --no-install`.
   تُقبل فقط تغييرات سكربتي Expo المتوقعة في package.json ثم تُستعاد، ويُرفض
   أي تغيير غير متوقع في البيان أو ملف القفل.
6. تشغيل `prepare-android-debug.cjs` على ملفات Android المولدة فقط:
   تضمين JS والأصول في Debug وتعطيل Metro في React host.
7. بناء `:app:assembleDebug`، ثم فحص وجود JS، ومعرّف الحزمة، وعلامة
   debuggable، وصحة التوقيع باستخدام apksigner وaapt.
8. تثبيت APK وتشغيل `scripts/android-native-smoke.sh` على محاكي Android 36
   دون Metro، مع حفظ نتائج الاختبار والتشخيصات.
9. طلبا HTTPS من نوع GET فقط دون جلسة أو بيانات اعتماد:
   `/api/auth/session` متوقع أن يعيد 200 وكائن جلسة فارغًا،
   و`/api/voice/rooms` متوقع أن يعيد 401 وكائن خطأ للمستخدم غير المصادق.
   يسجل التقرير status وشكل JSON فقط؛ لا تُحفظ أجسام الردود أو Cookies أو Tokens.

تعديل Android المولّد ليس بديلًا عن كود المصدر. لا تشغّل مساعد Debug مرتين
على نفس المشروع المولّد؛ لإعادة المحاولة ولّد مشروعًا جديدًا بعد حفظ العمل
المحلي. لا تغيّر مفاتيح توقيع Release عند إعداد Debug.

## الملفات والأدلة

مسار APK بعد نجاح Gradle:

```text
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

يُرفع إلى artifact باسم `tahaddi-debug-RUN_ID-RUN_ATTEMPT` لمدة 14 يومًا.
يظهر رابط التنزيل في ملخص التشغيل. يظهر الحجم وSHA256 في سجل Actions،
وفي الملفين `apk-size.txt` و`apk-sha256.txt` ضمن artifact الأدلة.

يتضمن `android-reports-RUN_ID-RUN_ATTEMPT`:

- سجلات التثبيت وTypeScript واختبارات العميل وExpo وMetro وGradle.
- SDK والأذونات وشهادة Debug ومعرّف الالتزام والحجم وSHA256.
- تقارير المحاكي في `native/`، بحسب ما نفّذه اختبار QA فعلًا.
- `public-https-readonly.json` لفحص HTTPS غير المصادق فقط.
- `tahaddi-android-source.tar.gz`: أرشيف الملفات المتتبعة من نفس الالتزام،
  يشمل عميل Expo والحزم المشتركة وملف القفل وتعليمات البناء وWorkflow.
  لا يتضمن مفاتيح محلية أو node_modules أو مخرجات Android المولدة.

يُرفع APK قبل اختبار المحاكي؛ وجود رابط التنزيل لا يعني نجاح تشغيله.
قد تفشل خطوة بعد البناء، وتُحفظ الأدلة حتى عند الفشل. يجب قراءة نتيجة كل خطوة
والتقارير قبل وصف الإصدار بأنه اجتاز الاختبارات.

## الاختبارات وحدود القبول

لم تتوفر بيئة staging أو بيانات حساب اختبار معزول لهذه الدفعة. CI لا يسجّل
دخولًا إلى الإنتاج ولا ينشئ غرفًا أو رسائل أو هدايا عليه. فحص GET غير المصادق
يثبت حدود الوصول العامة وشكل الرد فقط؛ لا يثبت جلسة محفوظة أو اتصال LiveKit.

اختبار المحاكي الافتراضي يتحقق من تثبيت الواجهة الأصلية وظهور شاشة الدخول
والتحقق المحلي من الحقول، ويحفظ تشخيصات startup المتاحة. ملف الاختبار هو
المرجع الدقيق للسيناريوهات والأرقام المسجلة. بيانات dumpsys الخام ليست قياسًا
مقارنًا للأداء أو إثباتًا لعدم وجود تسرب ذاكرة.

يمكن لأداة QA تشغيل المسار المصادق فقط على أصل اختبار HTTPS معزول، وفق
ضوابطها، وبعد توفير الحساب خارج Git والسجلات. لا تضبط متغيرات هذا المسار
في Workflow الحالي ولا تستخدم حساب إنتاج لتجاوز غياب بيئة الاختبار.

تظل النتائج التالية غير مثبتة حتى تنفيذها فعليًا مع تسجيل الجهاز وإصدار Android:

- الدخول والخروج وتجديد الجلسة وبقاؤها بعد إغلاق التطبيق.
- إنشاء غرفة والانضمام والمقاعد وإدارة المضيف والكتم.
- الصوت بين جهازين، وتوجيه السماعات وBluetooth، والمكالمة الواردة.
- الخلفية وقفل الشاشة وإلغاء أذونات الميكروفون وقت التشغيل.
- انقطاع الشبكة وعودتها والتبديل بين Wi-Fi وبيانات الجوال.
- 100 رسالة مع إقرارات الخادم ومنع الفقد والتكرار؛ يجب احترام حدود الكتابة
  الحالية، ومنها 40 كتابة/60 ثانية وعدم إغراق الإنتاج.
- جلسة طويلة وقياسات RAM وCPU والبطارية وANR على جهاز فعلي.
- صور الحساب والإشعارات والألعاب والهدايا وكل ميزة لم يغطها اختبار قبول حي.

وجود اختبارات عقود أو اختبارات ببدائل شبكية لا يثبت السيناريوهات الحية السابقة.
دوّن `passed` و`failed` و`not_run` منفصلة، ولا تستبدل نتيجة فاشلة بوصف نجاح البناء.

## الصوت والأذونات

إضافة `plugins/withVoiceAndroid.cjs` تُجهّز تكامل Android للصوت. تشغيل خدمة
أمامية وإشعار وHeadless JS لا يضمن استمرار الاتصال تحت جميع قيود Android
أو إدارة البطارية الخاصة بالشركة المصنّعة.

يجب بدء جلسة الصوت من Activity في المقدمة بعد إذن المستخدم، واحترام شروط
Android للخدمة الأمامية من نوع microphone أو mediaPlayback. لا تعِد التشغيل
بعد قتل العملية أو فتح الميكروفون تلقائيًا عند العودة.

تشمل الأذونات المبررة بحسب التكامل النهائي: INTERNET وACCESS_NETWORK_STATE
وMODIFY_AUDIO_SETTINGS وRECORD_AUDIO، وBLUETOOTH_CONNECT عند الحاجة على
Android 12 فأحدث، وصلاحيات FOREGROUND_SERVICE ونوعي MICROPHONE وMEDIA_PLAYBACK،
وWAKE_LOCK وإشعارات Android 13 فأحدث. يجب مراجعة تقرير Manifest المدمج الفعلي،
وحالات رفض الأذونات، وعدم اعتبار إعلانها إثبات عمل الصوت أو إشعارات Push.
لا تحتاج مكتبة صور الحساب إلى افتراض صلاحية الكاميرا.

## التثبيت والبناء المحلي

بعد فك ضغط artifact:

```sh
adb install -r app-debug.apk
```

أو انقل APK إلى الهاتف واسمح بالتثبيت من المصدر المستخدم. شهادة Debug تجريبية
وقد تتغير بين تشغيلات CI؛ عند اختلافها يلزم إزالة النسخة القديمة مما يمسح
بياناتها. لا تستخدم شهادة Debug لتحديث تطبيق إنتاج منشور.

من جذر المصدر مع الأدوات نفسها:

```sh
pnpm --filter @tahaddi/mobile... install --frozen-lockfile --ignore-scripts
pnpm --filter @tahaddi/mobile exec tsc -p ../../packages/domain/tsconfig.json
pnpm --filter @tahaddi/mobile typecheck
EXPO_OFFLINE=1 pnpm --filter @tahaddi/mobile exec expo install --check
pnpm --filter @tahaddi/mobile exec expo prebuild --platform android --no-install
node apps/mobile/scripts/prepare-android-debug.cjs
cd apps/mobile/android
./gradlew :app:assembleDebug --no-daemon -PreactNativeArchitectures=arm64-v8a,x86_64
```

نفّذ اختبارات TypeScript وPython والمحاكي كما يحدد Workflow، ولا تكتفِ بهذه
الأوامر المختصرة. prebuild يغيّر سكربتي التشغيل المحليين؛ راجع الفرق واحفظ العمل
قبل إعادة التوليد. طبقات الجلسة تتصل بالخدمات عبر HTTPS ولا تحتاج أسرار الخادم
في APK. لا تنسخ ملفات .env أو Cookies أو رموز الدخول إلى تقارير البناء.

## Release APK وGoogle Play AAB والتحديثات

`eas.json` يعرّف `release-apk` و`release-aab` مع
`credentialsSource: local`. لا يشغّلهما Debug Workflow ولا ينشئ مفتاح إنتاج
بديلًا. يجب اختيار مشروع EAS الصحيح وتوفير التوقيع المعتمد خارج Git أولًا.
لا يثبت غياب المفاتيح من المستودع أن مالك التطبيق لا يملكها.

جهّز `apps/mobile/credentials.json` محليًا بصيغة EAS الرسمية ومسار المفتاح
وكلمات مروره والـalias، مع إبقاء الملفات والمفاتيح خارج Git وartifacts والسجلات.
ثم استخدم إصدار eas-cli مثبتًا ومعتمدًا:

```sh
eas build --platform android --profile release-apk --non-interactive
eas build --platform android --profile release-aab --non-interactive
```

هذه أوامر بناء وليست إذن نشر؛ لا تنفّذ `eas submit` أو أي رفع متجر أو استضافة.
قد يربط قالب Expo أمر assembleRelease المحلي بمفتاح Debug؛ نجاحه لا يثبت
توقيع إنتاج. افحص الشهادة وSHA256 وversionCode وtarget SDK والأذونات وتوافق
متطلبات المتجر الفعلية قبل التوزيع.

للتحديثات حافظ على Application ID والمفتاح المعتمد، وحدّث `expo.version`
والاعتماديات وملف القفل، وزد versionCode حسب مصدر إصدارات EAS البعيد.
لا يُستنتج versionCode البعيد من app.json. أعد البناء والاختبارات الحية
والمحاكي والجهاز الفعلي قبل الموافقة على توزيع الإصدار.

يجب الحفاظ على فصل أنواع React بين الويب والجوال كما هو موثّق في
`pnpm-workspace.yaml`، وتشغيل فحص أنواع كليهما بعد تغيير الاعتماديات المشتركة.
