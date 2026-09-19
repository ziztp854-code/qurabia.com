# باني بنك الأسئلة العربي لتحدّي

أداة محلية تنظف مصادر الأسئلة العربية، تحذف التكرار، وتبني ثلاثة خيارات خاطئة من إجابات موثوقة تنتمي إلى **نفس نمط السؤال**. لا تخترع الأداة معلومات؛ إذا لم تجد ثلاثة مشتتات مناسبة تنقل السؤال إلى `questions_review`.

## التشغيل على Windows

```powershell
cd tools\tahaddi_question_bank_builder
python -m pip install -r requirements.txt
python build_arabic_question_bank.py --sources-file sources.json --limit 50000 --output question_bank
```

يمكن تمرير ملف أو رابط مباشرة، وتكرار الخيار لأكثر من مصدر:

```powershell
python build_arabic_question_bank.py `
  --source data\questions.jsonl `
  --source https://example.org/open-questions.csv `
  --output question_bank
```

تحجب الأداة افتراضيًا روابط `localhost` والشبكات الخاصة، وتحذف بيانات الدخول والاستعلام من تقارير الأخطاء. للمصادر الداخلية الموثوقة فقط استخدم `--allow-private-network` صراحة.

إذا لم تمرر مصدرًا، تبحث الأداة عن `sources.json` ثم ملفات JSON وJSONL وCSV داخل مجلد `sources`.

## بنية المصدر

تقبل الأداة JSON أو JSONL أو CSV. الحقول الأساسية:

```json
{
  "prompt": "ما عاصمة المملكة العربية السعودية؟",
  "answer": "الرياض",
  "options": ["الرياض", "القاهرة", "عمّان", "الرباط"],
  "category": "جغرافيا",
  "difficulty": "EASY",
  "explanation": "الرياض هي عاصمة المملكة العربية السعودية.",
  "source": "اسم المصدر",
  "license": "CC BY 4.0",
  "time_limit": 20,
  "base_points": 1000
}
```

`options` اختياري. عند غيابه، تبحث الأداة عن إجابات أخرى من نفس العائلة، مثل أسئلة العواصم أو المؤلفين أو السنوات. تحفظ بيانات المصدر والترخيص في JSONL وCSV، وتدمجهما في حقل `source` داخل SQL.

الحقل `correct_option` صفري افتراضيًا مثل تطبيق تحدّي. للمصادر التي ترقّم الخيارات من 1، ضع `"correct_index_base": 1` في تعريف المصدر داخل `sources.json`.

## المخرجات

- `questions_ready.jsonl` و`questions_ready.csv`: أسئلة مكتملة بأربعة خيارات وإجابة صحيحة واحدة.
- `questions_review.jsonl` و`questions_review.csv`: أسئلة تحتاج مراجعة مع `review_reason`.
- `import_questions.sql`: إدخال PostgreSQL متوافق مع `Question` و`QuestionOption`.
- `report.json`: أعداد التحميل، التكرار، الجاهز، المراجعة، وأخطاء المصادر.
- `games/manifest.json`: توزيع موثق على جميع ألعاب المنصة.
- `games/*.jsonl`: صيغة مستقلة لكل لعبة تعتمد على الأسئلة.

توزع الأداة الأسئلة على العالم الموازي، الزمن المقلوب، الدخيل، لوحة الفئات، من سيربح المليون، شفرة الحروف، وتحدي الحروف. وتُدرج الشطرنج والبلوت وومضة الذاكرة وخدعة الألوان في manifest بحالة `not_applicable` لأنها ألعاب لوحية أو بطاقات أو سرعة لا تستهلك بنك أسئلة، فلا تُحقن فيها أسئلة مصطنعة.

## استيراد SQL

الملف لا يحتوي بيانات اتصال ولا ينشر الأسئلة. جميع الأسئلة تدخل بحالة `DRAFT` وتحتاج معرف مستخدم نشط موجود في قاعدة البيانات:

```powershell
psql $env:DATABASE_URL -v owner_id='USER_ID' -f question_bank\import_questions.sql
```

الإدخال داخل Transaction، والمعرّفات ثابتة، و`ON CONFLICT DO NOTHING` يمنع تكرار تشغيل الملف. راجع `questions_review` وعيّنة من `questions_ready` قبل الاستيراد.

يفشل الأمر إذا تعذر تحميل أي مصدر حتى لا ينتج بنكًا ناقصًا بصمت. استخدم `--allow-partial` فقط عندما تقبل صراحة بناء الناتج من المصادر السليمة المتبقية.

## الاختبارات

```powershell
python -m pytest -q
python -m ruff check build_arabic_question_bank.py tests
```
