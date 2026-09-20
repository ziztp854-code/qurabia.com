# إصدار تطبيق تحدّي على iOS

هذا الدليل يخص تطبيق Expo الموجود في `apps/mobile`. لا ينشئ مشروعًا جديدًا ولا
يغيّر خادم الويب أو قاعدة البيانات.

## القيم المطلوبة

- `APPLE_TEAM_ID` في بيئة نشر `apps/web`: معرّف فريق Apple Developer العام،
  ويتكوّن من 10 أحرف وأرقام كبيرة. لا تضع Apple ID أو كلمة مرور أو مفتاح App
  Store Connect في المستودع.
- `EXPO_PUBLIC_API_URL`: عنوان HTTPS العام للويب، والقيمة الإنتاجية المعتادة
  `https://qurabia.com`.
- `EXPO_PUBLIC_REALTIME_URL`: عنوان HTTPS لخدمة Socket.IO، والقيمة الإنتاجية
  المعتادة `https://realtime.qurabia.com`.
- `EXPO_ACCESS_TOKEN`: رمز وصول Expo خادمي تستخدمه `apps/realtime` لإرسال
  الإشعارات عند تفعيل Enhanced Push Security. اتركه خارج EAS Build وتطبيق
  الجوال وبيئة `apps/web`، ولا تسمّه باسم يبدأ بـ `EXPO_PUBLIC_`.

قيم `EXPO_PUBLIC_*` تُضمّن داخل حزمة التطبيق ويمكن لأي مستخدم قراءتها؛ لا تضع
فيها رموز وصول أو مفاتيح API أو أي سر. ترتبط ملفات البناء في `eas.json`
صراحةً ببيئات EAS المسماة `development` و`preview` و`production` حتى لا يلتقط
البناء قيم بيئة أخرى بالخطأ.

يحمل تطبيق iOS معرّف الحزمة `com.qurabia.tahaddi` ونطاق
`applinks:qurabia.com`. لا تضف `owner` أو `extra.eas.projectId` إلى
`apps/mobile/app.json` حتى ينشئ مالك حساب Expo المشروع الحقيقي عبر `eas init`؛
لا يجوز تخمين هذه القيم.

بعد أن ينفذ مالك حساب Expo الأمر `eas init`، تحقق أن Expo أضاف
`extra.eas.projectId` الحقيقي إلى إعداد التطبيق. يحتاج تسجيل Expo Push Token
هذا المعرّف؛ إبقاؤه غائبًا قبل تهيئة المشروع مقصود، وسيعرض التطبيق رسالة إعداد
واضحة بدل استخدام قيمة مخمّنة.

## إعداد بيئات EAS

بعد `eas init`، أنشئ القيم العامة نفسها في بيئتي Preview وProduction وتحقق
منها قبل البناء:

```bash
eas env:set --environment preview --visibility plaintext --name EXPO_PUBLIC_API_URL --value https://qurabia.com
eas env:set --environment preview --visibility plaintext --name EXPO_PUBLIC_REALTIME_URL --value https://realtime.qurabia.com
eas env:set --environment production --visibility plaintext --name EXPO_PUBLIC_API_URL --value https://qurabia.com
eas env:set --environment production --visibility plaintext --name EXPO_PUBLIC_REALTIME_URL --value https://realtime.qurabia.com
eas env:list --environment preview
eas env:list --environment production
```

للتطوير المحلي، أنشئ `apps/mobile/.env.local` غير المتتبع أو نفّذ
`eas env:pull --environment development`. لا تضف ملف البيئة الناتج إلى Git.

## تفعيل Enhanced Push Security

لتفعيل الحماية دون قطع الإشعارات القائمة:

1. أنشئ رمز وصول من حساب Expo المالك للمشروع. فضّل Robot User محدود الصلاحيات
   عندما يكون المشروع تابعًا لمنظمة، وتعامل مع الرمز ككلمة مرور قابلة للإلغاء.
2. خزّن الرمز باسم `EXPO_ACCESS_TOKEN` في مخزن أسرار بيئة `apps/realtime` فقط،
   ثم أعد نشر خدمة realtime. ترسل الخدمة الرمز في ترويسة `Authorization` ولا
   تحتاجه نسخة الويب أو حزمة الجوال.
3. من EAS Dashboard للمشروع، فعّل Enhanced Push Security بعد التأكد أن نسخة
   realtime التي تحمل الرمز أصبحت فعالة. بعد التفعيل يرفض Expo أي طلب إرسال
   بلا رمز صالح بخطأ `UNAUTHORIZED`.
4. اختبر بدء لعبة على جهاز فعلي وراقب سجلات realtime دون طباعة الرمز. عند
   التدوير، أضف الرمز الجديد وأعد نشر realtime أولًا، ثم ألغِ القديم من Expo.

لا تستخدم `EXPO_TOKEN` الخاص بأوامر EAS بدل اسم المتغير الذي تقرؤه الخدمة، ولا
تضع `EXPO_ACCESS_TOKEN` ضمن بيئات EAS الخاصة ببناء التطبيق.

## تفعيل Universal Links

1. اضبط `APPLE_TEAM_ID` في Production وPreview للويب، ثم أعد النشر.
2. تحقق أن الطلب التالي يعيد HTTP 200 مباشرة، دون redirect، وبنوع
   `application/json`:

   ```bash
   curl -i https://qurabia.com/.well-known/apple-app-site-association
   ```

3. يجب أن يحتوي الرد تطبيقًا واحدًا بالصيغة
   `<APPLE_TEAM_ID>.com.qurabia.tahaddi`، ومسارًا واحدًا فقط هو `/join/*`.
4. ابنِ نسخة iOS جديدة بعد تثبيت Associated Domains؛ النسخ المثبتة قبل إضافة
   entitlement لا تكتسبه من تحديث الخادم وحده.
5. اختبر على جهاز أو Simulator بعد تثبيت البناء:

   ```bash
   xcrun simctl openurl booted https://qurabia.com/join/ABC234
   ```

غياب `APPLE_TEAM_ID` أو عدم صلاحيته يجعل endpoint يعيد 503 مع
`Cache-Control: no-store` بدل نشر ملف AASA خاطئ.

## EAS وApp Store

من `apps/mobile`:

```bash
eas init
eas build --platform ios --profile preview
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

- الإصدار الحالي مخصص لـ iPhone فقط (`ios.supportsTablet: false`) لأن خطة QA
  لا تغطي iPad بعد؛ لا تفعّل دعمه قبل إضافة اختبارات الواجهة والتدفقات على iPad.
- ملف `development` الحالي يبني نسخة Simulator لاختبار الواجهة والروابط؛
  Simulator لا يثبت جاهزية APNs ولا تسجيل Expo Push Token.
- لاختبار الإشعارات عن بعد، سجّل جهاز iPhone عبر `eas device:create` ثم استخدم
  بناء `preview` الداخلي وثبته على الجهاز الحقيقي.
- تحقق من بيانات Push Notifications الخاصة بـ iOS عبر
  `eas credentials --platform ios` قبل بناء Preview أو Production. لا تحفظ
  مفتاح APNs بصيغة `.p8` داخل المستودع.
- إضافة أو تغيير plugin مثل `expo-notifications` يتطلب بناء native جديدًا؛
  تحديث JavaScript وحده لا يضيف entitlement أو إعدادًا أصليًا.

إصدار ميزة الجوال وحدة نشر متعددة الأجزاء، وليس بناء iOS وحده. طبّق migration
الخاصة بتسجيل أجهزة Push أولًا، ثم انشر `apps/web` لتسجيل الأجهزة ومصادقة
الجوال، وانشر `apps/realtime` لإرسال إشعار بدء اللعبة، وبعدها اختبر التطبيق.
في بيئة الويب الإنتاجية اضبط زوج بيانات اعتماد Redis الموزع
`UPSTASH_REDIS_REST_URL` و`UPSTASH_REDIS_REST_TOKEN` (أو الزوج المدعوم
`KV_REST_API_URL` و`KV_REST_API_TOKEN`)، واضبط `RATE_LIMIT_HMAC_SECRET`
بقيمة عشوائية مستقلة؛ هذه القيم خادمية ولا تدخل
حزمة الجوال. لا تعتبر الإصدار مكتملًا إذا نُشر web أو realtime أو migration
بمعزل عن الجزأين الآخرين.

نفّذ `eas submit` فقط بعد إدخال بيانات App Store Connect في مخزن أسرار EAS أو
اعتماد تسجيل Apple التفاعلي. لا تحفظ مفاتيح `.p8` أو كلمات المرور أو معرّفات
خاصة داخل Git.

## فحص محلي قبل البناء

```bash
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile test
pnpm --dir apps/mobile exec expo config --type public
pnpm --dir apps/mobile exec expo config --type introspect
```

تحقق أيضًا أن أيقونة `apps/mobile/assets/app-icon.png` مربعة وغير شفافة، وأن
Splash يستخدم الخلفية الداكنة الأساسية، وأن مظهر iOS مضبوط على الوضع الداكن
داخل `ios.userInterfaceStyle`. لا يوضع إعداد المظهر العام على مستوى Expo لأن
ذلك يتطلب `expo-system-ui` على Android. تحقق كذلك أن `expo-notifications` يحدد القناة الافتراضية
`default` نفسها التي ينشئها التطبيق على Android. خيار
`enableBackgroundRemoteNotifications` مضبوط على `false` عمدًا لأن التطبيق لا
ينفذ معالجة Push صامتة في الخلفية حاليًا.

## Android App Links

يحتوي إعداد Expo الحالي على Intent Filter لـ `https://qurabia.com/join/*`، لكن
التحقق الآلي يتطلب ملف
`https://qurabia.com/.well-known/assetlinks.json` ببصمة SHA-256 الحقيقية لشهادة
توقيع Android. لم يُضف الملف لأن بصمة EAS/Play App Signing غير متاحة بعد. بعد
إنشاء شهادة الإنتاج، استخرج البصمة من EAS أو Play Console، راجعها يدويًا، ثم
أضف `assetlinks.json` في تغيير مستقل؛ لا تستخدم بصمة تجريبية أو مخمّنة.
