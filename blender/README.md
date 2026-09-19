# Blender → Tahaddi 3D

المصدر داخل `blender/scenes`، والتصدير النهائي داخل `apps/web/public/models`. لا تعدّل ملفات `.blend` الثنائية بأدوات النص؛ افتحها في Blender أو غيّرها عبر سكربت `bpy`.

## التثبيت

يدعم المصدّر Blender 4.x و5.x؛ جرى تشغيله فعليًا على Blender 5.2.1 LTS.

- Windows: `winget install --exact --id BlenderFoundation.Blender`
- macOS: `brew install --cask blender`
- Linux: استخدم حزمة Blender الرسمية لتوزيعتك.

يكتشف `scripts/blender.mjs` Blender من PATH والمسارات المعتادة. عند الحاجة:

```powershell
$env:BLENDER_PATH = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
```

على macOS/Linux:

```bash
export BLENDER_PATH=/Applications/Blender.app/Contents/MacOS/Blender
```

## بطاقة تحدّي

إنشاء المصدر وتصديره لأول مرة:

```bash
pnpm blender:create:challenge-card
```

يرفض الأمر استبدال مصدر موجود. استخدم `pnpm blender:create:challenge-card -- --force` فقط إذا أردت إعادة إنشاء البطاقة وفقد تعديلات المصدر الحالي.

يستخدم السكربت خطًا عربيًا معروفًا من النظام. لتحديد خط آخر:

```powershell
$env:BLENDER_ARABIC_FONT = 'C:\path\to\ArabicFont.ttf'
```

يحوّل النص إلى mesh داخل المصدر وGLB؛ لا ينسخ ملف الخط من النظام إلى المشروع ولا يوزّع ملف الخط مع الموقع.

الناتج:

- المصدر: `blender/scenes/challenge-card.blend`
- الويب: `apps/web/public/models/challenge-card.glb`
- المعاينة: `http://localhost:3000/3d/`

## التصدير والتطوير

```bash
pnpm install
pnpm blender:export
pnpm blender:export -- my-model.blend
pnpm blender:export:all
pnpm blender:watch
pnpm blender:preview
pnpm dev:3d
```

`dev:3d` يشغّل خادم Next ومراقب Blender معًا. يمكن تحديد المنفذ عبر `pnpm dev:3d -- --port 3100`. يراقب ملفات `.blend` في المجلدات الفرعية أيضًا مع debounce قدره 500ms وتصدير متسلسل، لذلك لا تدخل ملفات GLB الناتجة في حلقة تصدير. إيقاف الأمر يوقف عملياته التابعة.

يتحقق Node من GLB مؤقت قبل نشر النسخة المستقرة ونسخة تحمل أول 16 حرفًا من SHA-256، ثم يحدّث `public/models/manifest.json` ذريًا. مثال السجل: `{"challenge-card":{"src":"/models/challenge-card.<hash>.glb","version":"<hash>"}}`. يراقب العارض manifest في التطوير، ويقرأه دون cache في الإنتاج؛ ملفات hash تصلح للتخزين الطويل غير القابل للتغيير. النسخ القديمة محفوظة كي تبقى الروابط السابقة صالحة. فشل Blender لا يستبدل آخر GLB ناجح.

## إضافة مجسم

1. احفظه باسم ويب آمن داخل `blender/scenes`.
2. ضع العناصر المطلوب تصديرها في Collection باسم `WEB_EXPORT`.
3. ضع الخامات والصور الأصلية عند الحاجة تحت `blender/textures` أو `blender/assets`، واستخدم مسارات Blender النسبية.
4. شغّل `pnpm blender:export -- model-name.blend`.
5. أضف سجلًا إلى `apps/web/src/config/models.ts`، ثم استخدم `<ModelViewer modelId="..." />`.

أسماء الملفات والمجلدات تستخدم أحرف ASCII الإنجليزية الصغيرة والأرقام و`-` و`_`. مثلًا `blender/scenes/ranks/knight.blend` يصدر إلى `public/models/ranks/knight.glb` ويستخدم مفتاح manifest باسم `ranks/knight`. لا يعيد المصدّر تسمية الملفات بصمت، ويتحقق من المسارات الحقيقية لمنع تجاوز المجلدات عبر symbolic links.

سجلات `viewer` و`knight` و`prince` و`sultan` محجوزة للمجسمات المستقبلية حسب الطلب؛ لا تتضمن الحزمة ملفات رتب جاهزة. صدّر ملفاتها قبل عرضها. المثال الفعلي المتاح هو `challenge-card`.

يحافظ المصدّر على PBR materials وUVs وtextures وanimations وarmatures وshape keys المتوافقة. لا يطبق modifiers/transforms تلقائيًا لأن ذلك قد يكسر shape keys؛ طبّق transforms المقصودة داخل ملف Blender واحفظ المصدر. تمرير `--include-cameras` أو `--include-lights` إلى `export_glb.py` متاح للمشاهد التي تحتاجهما.

## الخامات والحركة

- استخدم Principled BSDF لقنوات Base Color وMetallic وRoughness وNormal وAO وEmissive.
- يصغّر المصدّر الصور المستخدمة في مواد العناصر المحددة إلى 2048px كحد أقصى لأطول ضلع مع حفظ النسبة. المتغير `BLENDER_MAX_TEXTURE_SIZE` يقبل عددًا صحيحًا بين 256 و8192 (مثل 1024 للهاتف). التحجيم داخل ذاكرة عملية Blender فقط؛ لا يحفظ المصدر `.blend` أو الصور الأصلية أثناء التصدير.
- أسماء Animation Clips تصدر كما هي. يعرض `ModelViewer` الأسماء ويوفر `play`, `pause`, `stop`, `crossFade`, و`setLoop` عبر ref.
- يقبل `ModelViewer` الخاصية `textureUrl` لتبديل خامة واجهة البطاقة من React، وزر المعاينة يبدل لون الخامة الذهبية.
- الخاصية `environmentUrl` تقبل بيئة HDR؛ عند غيابها أو فشل تحميلها تُستخدم بيئة استوديو مولّدة محليًا. يخفض العارض الدقة والظلال للأجهزة الضعيفة والجوال ويحترم تقليل الحركة. لا توجد مؤثرات postprocessing مكلفة أو اعتماد إضافي.
- DRACO وKTX2 مدعومان عبر decoders تُنسخ من نسخة Three.js المثبتة أثناء `postinstall`. لتفعيل ضغط Draco في Blender استخدم `BLENDER_DRACO=1` (مستوى ضغط 6)؛ القيمة الافتراضية `0`. يفشل بوضوح إذا كان المصدّر لا يدعم خيارات الضغط المطلوبة. KTX2 مدعوم للتحميل؛ لا يقوم هذا المصدّر بترميز KTX2. البطاقة الافتراضية تصدر دون Draco، والضغط خيار للمشاهد التي تستفيد منه.

## التحقق والأخطاء

```bash
pnpm blender:export
pnpm test:blender
pnpm test:3d
pnpm --filter @tahaddi/web lint
pnpm --filter @tahaddi/web typecheck
pnpm --filter @tahaddi/web build
```

لاختبار مراقبة حقيقية باستخدام Blender المثبت على Windows: `$env:RUN_BLENDER_INTEGRATION='1'; pnpm test:blender`. الاختبار يغيّر وقت حفظ المصدر، يتحقق من تصديرين ومن غياب حلقة output، ثم يعيد وقت الملف الأصلي.

الأمر يرفض أي scene خارج `blender/scenes`، وأي output خارج `apps/web/public/models`، ويفشل بوضوح عند فقد Blender أو ملف scene أو texture مستخدمة في المواد المحددة أو عند فشل Python/GLB. يستدعي Blender مباشرة دون shell ويعطّل auto-execution لسكريبتات `.blend`. يفشل إذا لم يدعم إصدار المصدّر خيارات الحفظ المطلوبة بدل إسقاطها بصمت.
