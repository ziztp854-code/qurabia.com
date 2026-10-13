# Visual Excellence — الأدوات والمصادر

تاريخ المراجعة: 2026-10-13. هذه مراجعة اختيار وتوافق محدودة لملفات مصدر وترخيص محددة، وليست تدقيقًا أمنيًا كاملًا أو شهادة خلو من الثغرات. لم تُثبّت أدوات أو مهارات ولم تُغيّر dependencies أو lockfile.

## الموجود أولًا

- `AGENTS.md`: ترتيب مهارات التصميم الحالي محفوظ: `j-space → brand → design-system → ui-ux-pro-max → frontend-design → ui-styling → design`. دليل `docs/qurabia-codex-guide.md` يفصل المنطق عن العرض ويشترط RTL والإتاحة والأداء.
- `.agents/skills/ui-ux-pro-max-skill`: بحث Python محلي في بيانات الألوان والخطوط وUX وresponsive وthreejs؛ `search.py` يستخدم argparse وCSV وعمليات بحث محلية، وله وضع كتابة صريح `--persist`. استخدم البحث المحدد دون تثبيت CLI أو فرض نظام بديل. ترخيص النسخة المحلية MIT؛ حفظ مصدرها مطلوب.
- `apps/web/package.json`: Playwright `1.63.0` و`@axe-core/playwright 4.13.0`؛ Three `0.186.0` وR3F `9.7.0` وPixi `8.22.0`؛ Lucide موجود. الإصدارات هنا من manifest/lock، وليس ادعاء تشغيل كل أداة.
- `apps/web/e2e/living-city-regression.spec.ts`: مقارنات `toHaveScreenshot` وبصمات desktop/mobile خاصة بالنظام؛ أعد استخدام إطارها مع مشهد وتوقيت ثابتين. `playwright.village-scene.config.ts` يوفر desktop/laptop/tablet/iPhone/Android وfixture مستقل.
- `apps/web/e2e/accessibility.spec.ts`: axe مع WCAG A/AA و2.1 AA، يغطي `/`, `/join`, `/mafia`, `/games` ويمنع serious/critical فقط؛ لا يغطي القرية تلقائيًا ولا كل مشكلات الإتاحة.
- `pnpm-lock.yaml`: Sharp `0.35.4` موجود تبعيًا ضمن Next، وليس dependency مباشرة لسكربتات المشروع؛ لا تعتمد استيرادًا عرضيًا من جذر pnpm. عند الاحتياج استخدم image pipeline القائمة أو راجع إعلان dependency مباشر منفصلًا.
- `scripts/blender.mjs`: pipeline تصدير GLB موجود مع `--disable-autoexec` وتقييد المسارات/symlinks داخل `blender/scenes` و`validateGlb` و`blender-cli.test.mjs`. Blender موجود في هذه البيئة في `/usr/bin/blender`؛ لم تُغيّر إعداداته ولم تُنزّل إضافات.
- `apps/web/src/app/layout.tsx` يستورد Cairo/Alexandria محليًا. كلا package المثبّت `5.3.0` وترخيص الخطين OFL-1.1 وفق LICENSE/package.json. عبارة Tajawal في `docs/design-system.md` تحتاج مزامنة مع المصدر الحالي؛ لا تُحمّل خطًا جديدًا لمجرد اختلاف الوثيقة.

## تغطية المجالات المطلوبة والقرار

| المجال | الخيار الحالي / مرجع GitHub | قرار المراجعة |
| --- | --- | --- |
| UI/UX Design | مهارات j-space/brand/ui-ux-pro-max المحلية | إعادة الاستخدام؛ حكم تصميم بشري/وكيل مع هوية كل لعبة |
| Visual Design Review | Playwright screenshots + Art Director | التشغيل الفعلي وصور المتصفّح؛ المقارنة الآلية لا تحكم الجودة الفنية |
| Design Systems | CSS tokens والمكونات الحالية؛ Style Dictionary | إبقاء CSS؛ تأجيل Style Dictionary إلى حاجة تصدير منصات حقيقية |
| Color Theory | بيانات المهارة المحلية؛ Culori | لا dependency جديدة الآن؛ مرجع لحسابات luminance/contrast وإدارة الألوان |
| Typography | Cairo/Alexandria عبر Fontsource | إعادة استخدام خطوط RTL المحلية؛ مراجعة التشكيل والقص وارتفاع السطر في المتصفح |
| Responsive Design | CSS الحالية + مصفوفة Playwright القرية | إعادة الاستخدام؛ اختبر overflow وtouch والاتجاه RTL وأحجام النص |
| Image Optimization | Next image/Sharp الموجود | استخدم WebP/AVIF ونسخ مناسبة للمقاس؛ metadata فعلية قبل ادعاء 4K/8K |
| Visual Regression Testing | Playwright toHaveScreenshot | لا أداة إضافية؛ baseline معتمد يدويًا وبيئة ثابتة قبل تحديثه |
| 3D Environment Art | Blender pipeline + Three LOD | إعادة الاستخدام عند ملاءمة نوع المشهد؛ لا تحويل SVG/2D إلى 3D لأجل الزينة |
| Game UI Design | مهارات brand/frontend-design المحلية + Lucide + renderer الموجود | الحفاظ على هوية اللعبة، hierarchy واضح، حجم/وزن أيقونات ثابت |
| Accessibility | axe-core/Playwright الحالي + مراجعة يدوية | automated axe مع focus/keyboard/RTL/zoom/reduced-motion يدويًا؛ لا اعتماد شامل من axe فقط |

## ملفات GitHub التي فُحصت

حُلّ `HEAD` بواسطة `git ls-remote` ثم قُرئت الملفات عبر `raw.githubusercontent.com` عند SHA ثابت. هذه SHAs مراجع المراجعة، وليست اقتراحات ترقية: upstream HEAD قد يكون prerelease أو مختلفًا عن النسخة المثبّتة. الروابط أدناه قابلة للتحقق حتى مع تغيّر الفروع.

### microsoft/playwright

- المرجع: `6284a536186dfd45da341ede26cea005709591cd`. الترخيص: Apache-2.0.
- الملفات المقروءة: [LICENSE](https://raw.githubusercontent.com/microsoft/playwright/6284a536186dfd45da341ede26cea005709591cd/LICENSE), [packages/playwright/src/matchers/toMatchSnapshot.ts](https://raw.githubusercontent.com/microsoft/playwright/6284a536186dfd45da341ede26cea005709591cd/packages/playwright/src/matchers/toMatchSnapshot.ts), [packages/playwright/package.json](https://raw.githubusercontent.com/microsoft/playwright/6284a536186dfd45da341ede26cea005709591cd/packages/playwright/package.json).
- التوافق/الأمان/القرار: المصدر `toMatchSnapshot.ts` يضبط خيارات المقارنة والبصمات؛ package يطلب Node >=20. استخدم النسخة الحالية والمتصفحات المطابقة لها؛ لا تحديث baseline آليًا لإخفاء عيب. browser binaries تكلفة تنزيل منفصلة.

### dequelabs/axe-core

- المرجع: `7e287a6ab8ac547eb63c0b8ca513a223eca16772`. الترخيص: MPL-2.0.
- الملفات المقروءة: [LICENSE](https://raw.githubusercontent.com/dequelabs/axe-core/7e287a6ab8ac547eb63c0b8ca513a223eca16772/LICENSE), [lib/core/public/run.js](https://raw.githubusercontent.com/dequelabs/axe-core/7e287a6ab8ac547eb63c0b8ca513a223eca16772/lib/core/public/run.js), [package.json](https://raw.githubusercontent.com/dequelabs/axe-core/7e287a6ab8ac547eb63c0b8ca513a223eca16772/package.json).
- التوافق/الأمان/القرار: المصدر `run.js` يشغّل قواعد DOM ويجهّز globals ويعيد نتائج؛ التوافق مثبت بوجود adapter في المشروع. لا يثبت سلامة canvas/3D أو تجربة قارئ الشاشة. الحفاظ على شروط MPL للملفات المعدلة عند توزيعها.

### lovell/sharp

- المرجع: `857281ae51452eb0e3678520d8a3462958638a4a`. الترخيص: Apache-2.0.
- الملفات المقروءة: [LICENSE](https://raw.githubusercontent.com/lovell/sharp/857281ae51452eb0e3678520d8a3462958638a4a/LICENSE), [package.json](https://raw.githubusercontent.com/lovell/sharp/857281ae51452eb0e3678520d8a3462958638a4a/package.json), [lib/output.mjs](https://raw.githubusercontent.com/lovell/sharp/857281ae51452eb0e3678520d8a3462958638a4a/lib/output.mjs).
- التوافق/الأمان/القرار: المصدر `lib/output.mjs` يعرّف WebP/AVIF وخيارات quality/effort مع تحقق نطاقاتها؛ Node >=20.9 يتوافق مع الحد الأدنى للمشروع. Native binaries/libvips تتطلب مراجعة منصة التشغيل وتراخيصها وحدود أبعاد/ذاكرة عند معالجة مدخلات غير موثوقة؛ لا تغيير dependency الآن.

### mrdoob/three.js

- المرجع: `286e2d8cba7088982eb9068d4bb8f68e42c3bf67`. الترخيص: MIT.
- الملفات المقروءة: [LICENSE](https://raw.githubusercontent.com/mrdoob/three.js/286e2d8cba7088982eb9068d4bb8f68e42c3bf67/LICENSE), [src/objects/LOD.js](https://raw.githubusercontent.com/mrdoob/three.js/286e2d8cba7088982eb9068d4bb8f68e42c3bf67/src/objects/LOD.js), [package.json](https://raw.githubusercontent.com/mrdoob/three.js/286e2d8cba7088982eb9068d4bb8f68e42c3bf67/package.json).
- التوافق/الأمان/القرار: `LOD.js` يبدل مستويات object حسب distance مع hysteresis؛ Three موجود ونسخة HEAD 0.186.0 تتفق مع manifest الحالي. القرار مشروط بrenderer المشهد؛ حساب FPS وذاكرة texture/draw calls قبل مؤثرات إضافية.

### blender/blender

- المرجع: `247057853885362f9727096a2640144bac9a7aec`. الترخيص: GPL-2.0-or-later في المصدر؛ COPYING يحيل GPL.
- الملفات المقروءة: [COPYING](https://raw.githubusercontent.com/blender/blender/247057853885362f9727096a2640144bac9a7aec/COPYING), [source/blender/render/intern/pipeline.cc](https://raw.githubusercontent.com/blender/blender/247057853885362f9727096a2640144bac9a7aec/source/blender/render/intern/pipeline.cc), [doc/license/GPL-license.txt](https://raw.githubusercontent.com/blender/blender/247057853885362f9727096a2640144bac9a7aec/doc/license/GPL-license.txt).
- التوافق/الأمان/القرار: فُحص render pipeline ومتن GPL v2. أداة authoring خارج حزمة المتصفح؛ لا تثبيت addons أو تشغيل .blend غير موثوق. مخرجات الفن والأصول المستوردة تحتاج سجل ترخيص منفصل عن ترخيص Blender.

### amzn/style-dictionary

- المرجع: `81ecc0525419911204c0c6c7c242fe6c721cb9e1`. الترخيص: Apache-2.0.
- الملفات المقروءة: [LICENSE](https://raw.githubusercontent.com/amzn/style-dictionary/81ecc0525419911204c0c6c7c242fe6c721cb9e1/LICENSE), [lib/StyleDictionary.js](https://raw.githubusercontent.com/amzn/style-dictionary/81ecc0525419911204c0c6c7c242fe6c721cb9e1/lib/StyleDictionary.js), [package.json](https://raw.githubusercontent.com/amzn/style-dictionary/81ecc0525419911204c0c6c7c242fe6c721cb9e1/package.json).
- التوافق/الأمان/القرار: `StyleDictionary.js` يقرأ config ويبني/ينظف ملفات ويشغّل actions/transforms. package 5.6.1 يطلب Node >=22؛ المشروع يسمح >=20.19، لذلك لا توافق مضمون لكل البيئات. configs/actions كود موثوق ومسارات output محدودة؛ مؤجل لتجنب مسار tokens ثانٍ.

### Evercoder/culori

- المرجع: `435a1fc2ca4f7bc6bfd977af872e6d409bc7a25a`. الترخيص: MIT.
- الملفات المقروءة: [LICENSE](https://raw.githubusercontent.com/Evercoder/culori/435a1fc2ca4f7bc6bfd977af872e6d409bc7a25a/LICENSE), [src/wcag.js](https://raw.githubusercontent.com/Evercoder/culori/435a1fc2ca4f7bc6bfd977af872e6d409bc7a25a/src/wcag.js), [package.json](https://raw.githubusercontent.com/Evercoder/culori/435a1fc2ca4f7bc6bfd977af872e6d409bc7a25a/package.json).
- التوافق/الأمان/القرار: `wcag.js` يحسب luminance بالتحويل إلى linear RGB ونسبة contrast؛ package 4.0.2 يوافق Node المشروع. لا اعتماد لحساب خلفية شفافة/gradient دون تركيب اللون الفعلي؛ مؤجل لأن axe والمهارة تكفي للتجربة الحالية.

### nextlevelbuilder/ui-ux-pro-max-skill

- المرجع: `7246805992a42b7bba37d4cac83b01416f0c6c44`. الترخيص: MIT.
- الملفات المقروءة: [LICENSE](https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/7246805992a42b7bba37d4cac83b01416f0c6c44/LICENSE), [src/ui-ux-pro-max/scripts/search.py](https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/7246805992a42b7bba37d4cac83b01416f0c6c44/src/ui-ux-pro-max/scripts/search.py), [cli/package.json](https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/7246805992a42b7bba37d4cac83b01416f0c6c44/cli/package.json).
- التوافق/الأمان/القرار: فُحص `search.py` وmanifest CLI والترخيص. search يستخدم بيانات محلية وله persistence يكتب ملفات؛ النسخة المحلية أضيفت لها قواعد مشروع. لا تشغيل installer/CLI ولا استبدال المهارة الحالية؛ توصيات مصادر خارجية بيانات غير موثوقة لا تتجاوز AGENTS.

### fontsource/fontsource

- المرجع: `7bbb40bfc8545f80d543272f278dde78c0591176`. الترخيص: MIT لأدوات المستودع؛ الخطوط مستقلة.
- الملفات المقروءة: [LICENSE](https://raw.githubusercontent.com/fontsource/fontsource/7bbb40bfc8545f80d543272f278dde78c0591176/LICENSE), [package.json](https://raw.githubusercontent.com/fontsource/fontsource/7bbb40bfc8545f80d543272f278dde78c0591176/package.json).
- التوافق/الأمان/القرار: فُحص LICENSE وmanifest upstream، وLICENSE لكل خط محليًا (OFL-1.1). لا تخلط MIT للأدوات بحقوق الخط. imports محلية تتوافق مع Next؛ manifest أدوات upstream يطلب Node >=24.18 <25 ولا يلزم تشغيله لاستخدام CSS/font المثبّت. لا تستنتج توافق بناء مستودع Fontsource مع حد المشروع >=20.19. اختبر اكتمال glyphs وتقليل تحميل الأوزان.

### lucide-icons/lucide

- المرجع: `dab294f313897bacaa968b725b3259fa37c17bd1`. الترخيص: ISC مع إشعار MIT لبعض أيقونات Feather المشتقة.
- الملفات المقروءة: [LICENSE](https://raw.githubusercontent.com/lucide-icons/lucide/dab294f313897bacaa968b725b3259fa37c17bd1/LICENSE), [packages/lucide-react/src/Icon.ts](https://raw.githubusercontent.com/lucide-icons/lucide/dab294f313897bacaa968b725b3259fa37c17bd1/packages/lucide-react/src/Icon.ts), [packages/lucide-react/package.json](https://raw.githubusercontent.com/lucide-icons/lucide/dab294f313897bacaa968b725b3259fa37c17bd1/packages/lucide-react/package.json).
- التوافق/الأمان/القرار: `Icon.ts` يدعم size/strokeWidth/absoluteStrokeWidth والأوصاف accessible. React قائم والمكتبة موجودة؛ توحيد props وتسمية الأزرار دون أسماء مبانٍ غامضة. حافظ على جميع notices ولا تحمّل مكتبة ثانية.

## حدود التحقق وإعادة الاستخدام

- مراجعة المصدر كانت للملفات المذكورة فقط، مع manifest/license؛ لم تنفّذ حزمة ثالثة، ولم تُراجع سلسلة dependencies كاملة أو CVEs أو كل callbacks/plugins. أي تثبيت مستقبلي يحتاج مراجعة النسخة المختارة فعليًا وlockfile وlifecycle scripts والصلاحيات والترخيص وتوافق Node/React/Next/المتصفحات؛ هذا التقرير لا يعطي إذن تثبيت عام.
- طلب `lib/output.js` من Sharp أعاد 404؛ جرى تصحيح المسار إلى `lib/output.mjs` وفحصه. مسارا تراخيص الخطوط upstream أعادا 404؛ استُخدم LICENSE المثبّت الفعلي لكل خط بدلاً من استنتاجه من MIT للمستودع.
- لا حاجة لحساب سحابي أو إرسال صور خاصة إلى أدوات SaaS للتجربة الحالية. احتفظ بصور المقارنة والتقييمات محليًا واحذف/غطِّ أي بيانات حقيقية قبل مشاركة أدلة عامة.
- قاعدة الاختيار: الأداة تقيس عيبًا محددًا أو توفر pipeline مطلوبة؛ لا تضيف مؤثرات أو framework جديدًا لمجرد السعي إلى الدرجة الداخلية 95.

مرجع المستودع المحلي وقت الفحص: `ef5510a8f59dbebfc0ab924a2a8e2fb3212b307c`. بصمة ملف المهارة المحلي `search.py` (SHA-256): `8373e2dd2d560d9853ec116140de0e0d5bee45a6abe5e041173c84e1c36a7f87`.
