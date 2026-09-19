# المرحلة 4B: ربط Supabase PostgreSQL

## القرار

- Supabase يستخدم هنا كـ PostgreSQL مدار فقط.
- نظام المصادقة يبقى Auth.js/NextAuth، ولا ننتقل إلى Supabase Auth.
- لا تحفظ قيم `DATABASE_URL` أو `DIRECT_URL` أو `AUTH_SECRET` أو service-role key في Git.
- لا تشغّل `migrate reset` أو `db push --force-reset`.

## الاتصال

استخدم متغيرين مختلفين:

- `DATABASE_URL`: اتصال تشغيل التطبيق. على Vercel/serverless يفضّل Supabase Session/Transaction Pooler حسب إعداد المشروع، وغالبًا Transaction Pooler على المنفذ `6543` مع `pgbouncer=true` و`sslmode=require`.
- `DIRECT_URL`: اتصال مباشر للهجرات وأوامر Prisma CLI مثل `prisma migrate status` و`prisma migrate deploy`. لا تستخدم pooler للهجرات.

`prisma.config.ts` يستخدم `DIRECT_URL` إن توفر، ثم يرجع إلى `DATABASE_URL` فقط للتطوير المحلي.

## Vercel

اضبط مشروع Vercel كـ Node/Next.js:

- `DATABASE_URL`
- `DIRECT_URL`
- `AUTH_SECRET`
- `NEXTAUTH_URL`
- `AUTH_URL`

لا تضف أي متغيّر يطابق `NEXT_PUBLIC_SUPABASE_*KEY`؛ الوصول الحالي إلى Supabase خادمي فقط.

لا تضف `SUPABASE_SERVICE_ROLE_KEY` إلا إذا احتجته في مسار server-only واضح.

## الهجرات

الأوامر الآمنة:

```bash
pnpm db:generate
pnpm db:validate
pnpm exec prisma migrate status
pnpm db:migrate:deploy
```

لا تشغّل `pnpm db:migrate:deploy` على الإنتاج إلا بعد تأكيد صريح ومراجعة `migrate status`.

إذا كانت الجداول أُنشئت يدويًا من SQL Editor، فقد يعرض `prisma migrate status` أن migration غير مطبق لأن جدول Prisma `_prisma_migrations` لا يعرف التنفيذ اليدوي. لا تعالج ذلك تلقائيًا على الإنتاج. بعد فحص الجداول والتأكد أن SQL مطابق للملف، يمكن تشغيل `prisma migrate resolve --applied <migration_name>` بتأكيد صريح فقط.

- نقطة الاسترجاع المعتمدة: `2026-08-26T19:13:02Z`، الحجم `1,069,296` بايت، وSHA-256 هو `d9de7de6462203e90d71306728135520b6f29526f80472e55835bbd67b0cc30d`؛ يجب إنشاء نسخة جديدة مباشرة قبل أي كتابة إنتاجية لاحقة.
- نسخة ما بعد هجرة منشئ المسابقة: `2026-08-26T23:30:09Z`، الحجم `1,069,766` بايت، وSHA-256 هو `9c19a8ce73e95c884bb7ce934c0105d5adb0bf44e159a89ef1283b39fabfecc8`؛ حُفظت نسختان متطابقتان على وسيطين منفصلين واجتاز الأرشيف فحصي `pg_restore`.

## الاختبارات

- `pnpm test` يغطي اختبارات الوحدة الآمنة دون اتصال حقيقي.
- `pnpm --filter @tahaddi/web test:e2e` يغطي صفحات المصادقة وحماية `dashboard/profile`.
- اختبار التسجيل/الدخول/الخروج الحقيقي guarded ولا يعمل إلا عند `RUN_AUTH_E2E=true` ومع قاعدة اختبارية قابلة للرمي.

## مراجع

- Supabase connection modes: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase Prisma troubleshooting: https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting
- Prisma PgBouncer guidance: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer
