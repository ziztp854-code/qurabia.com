# المرحلة 4A: أساس المصادقة والهوية

## القرارات

- مكان المصادقة هو `apps/web` لأنه يعمل كواجهة وBFF لتدفقات الويب غير اللحظية.
- قاعدة الهوية في Prisma: `User`, `Account`, `Session`, `VerificationToken`, `Profile`.
- تسجيل البريد وكلمة المرور يستخدم Zod عند حدود الإدخال، وتجزيء `scrypt` من Node مع salt عشوائي.
- رسائل التسجيل والاستعادة عامة حتى لا تكشف إن كان البريد مسجلًا.
- Google OAuth مجهز عبر `AUTH_GOOGLE_ID` و`AUTH_GOOGLE_SECRET`. زر Google يظهر في الواجهة لكنه يبقى معطلًا حتى تتوفر المفاتيح.
- Supabase مدعوم عبر `DATABASE_URL` لقاعدة PostgreSQL، ومعه `NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` عند الحاجة للعميل. لا تُحفظ القيم الحقيقية في Git.
- `dashboard` و`profile` محميان على الخادم عبر جلسة Auth.js.

## النشر

المصادقة الديناميكية تحتاج نشر Next.js على Vercel أو خدمة Node:

1. وفر `DATABASE_URL`, `AUTH_SECRET`, وعنوان الموقع في `NEXTAUTH_URL`، وبيانات OAuth في منصة الأسرار. يستخدم المشروع NextAuth v4؛ يقبل `AUTH_URL` كاسم بديل عندما يغيب `NEXTAUTH_URL`، ويحتفظ بأولوية الأخير إذا وُجد الاثنان.
2. انشر `apps/web` على Vercel أو Node runtime.
3. أبق `apps/realtime` كخدمة Node طويلة التشغيل مستقلة.

### إعداد Google وتشخيص العودة إلى صفحة الدخول

- نوع العميل في Google Cloud هو Web application. استخدم `AUTH_GOOGLE_ID` و`AUTH_GOOGLE_SECRET` على الخادم فقط، دون بادئة `NEXT_PUBLIC_`.
- العنوان المحلي المعتاد هو `http://localhost:3000/api/auth/callback/google`، وعنوان الإنتاج على النطاق الأساسي هو `https://qurabia.com/api/auth/callback/google`. يجب أن يطابق عنوان redirect المسجل في Google عنوان التطبيق تمامًا؛ إذا استُخدم منفذ أو نطاق اختبار مختلف فسجّل callback الخاص به.
- هذا المسار يستخدم OAuth على الخادم ولا يستخدم Google JavaScript SDK؛ لا يحتاج Authorized JavaScript origins لإكماله. إذا أضيف SDK لاحقًا فالأصول المقابلة هي `http://localhost:3000` و`https://qurabia.com`.
- افصل إعدادات التطوير وPreview عن الإنتاج، وافحص المتغيرات في مشروع الاستضافة المرتبط فعليًا بالنطاق، لا المشروع الذي يحمل اسمًا مشابهًا. لا تجلب قيم الأسرار إلى تقارير التشخيص.
- تعرض صفحة الدخول أخطاء OAuth برسائل عامة. `OAuthAccountNotLinked` يعني استخدام طريقة الدخول الأصلية للحساب الموجود؛ لا تُحل المشكلة بتفعيل الربط التلقائي بالبريد. عند انتهاء صلاحية الجلسة، سجّل الدخول مجددًا.
- عند تعذّر إكمال OAuth، تحقق من رمز الخطأ غير السري، وحالة الحساب واتصال قاعدة البيانات، وعنوان callback. لا تسجل cookies أو رموز Google أو محتوى الجلسة في المتصفح.
- الاختبارات المعزولة لا تثبت نجاح تبادل Google الحقيقي؛ سجّل `LIVE GOOGLE E2E — NOT RUN` عندما لا يتوفر حساب وبيانات اختبار مناسبة.

مرجع مطابقة العنوان: [Google OAuth للويب](https://developers.google.com/identity/protocols/oauth2/web-server).

## اختبارات المرحلة

- `password.test.ts`: التجزئة والتحقق دون حفظ النص الصريح.
- `validation.test.ts`: تطبيع البريد، قوة كلمة المرور، ومدخل الاستعادة.
- يلزم لاحقًا إضافة E2E مع قاعدة اختبارية لتغطية التسجيل والدخول والخروج وحماية المسارات.
