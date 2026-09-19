-- =====================================================================
-- 📋 الخطوة 2-C: إضافة أسئلة بأنماط (مقارنة + سيناريو + سببية)
-- =====================================================================
-- إضافة 24 سؤالاً جديداً موزعة على 6 فئات رئيسية
-- =====================================================================

DO $$
DECLARE
  v_user_id TEXT;
  v_added_count INT := 0;
BEGIN
  SELECT id INTO v_user_id FROM "User" WHERE email = 'seed@tahaddi.local' LIMIT 1;
  IF v_user_id IS NULL THEN
    INSERT INTO "User" (id, email, name, role, status, "tokenVersion", "createdAt", "updatedAt")
    VALUES (
      'cm' || substr(md5(random()::text), 1, 23),
      'seed@tahaddi.local',
      'محتوى تحدّي', 'ADMIN', 'ACTIVE', 0, NOW(), NOW()
    )
    RETURNING id INTO v_user_id;
  END IF;

  -- إدراج الأسئلة المتنوعة
  WITH new_questions AS (
    INSERT INTO "Question" (
      id, "ownerId", type, status, difficulty, prompt, explanation,
      source, "timeLimit", "basePoints", "categoryId",
      "gameTypes", "expectedAnswer", keywords, version, "createdAt", "updatedAt", "lastEditedAt"
    )
    SELECT
      gen_random_uuid()::text, v_user_id, 'MULTIPLE_CHOICE', 'PUBLISHED', 'MEDIUM',
      q.prompt, q.explanation,
      'curation-2026-08-18', 20, 1000, q.category_id,
      ARRAY['QUIZ']::"QuestionGame"[], q.expected, q.keywords, 1, NOW(), NOW(), NOW()
    FROM (VALUES
      -- مقارنة (علوم)
      ('ما الفرق الجوهري بين الفيروس والبكتيريا من حيث القدرة على التكاثر؟',
       'الفيروس لا يستطيع التكاثر ذاتياً ويحتاج إلى خلية مضيفة، بينما البكتيريا تمتلك آلياتها الخاصة للتكاثر.',
       (SELECT id FROM "Category" WHERE name ~* 'أحياء|علوم' AND "parentId" IS NULL LIMIT 1),
       'الفيروس يحتاج خلية مضيفة للتكاثر',
       ARRAY['مقارنة','علوم','أحياء']),
      -- مقارنة (جغرافيا)
      ('أيهما أعلى من حيث متوسط الارتفاع: جبال الألب أم جبال الأنديز؟',
       'جبال الأنديز في أمريكا الجنوبية يبلغ متوسط ارتفاع قممها حوالي 4000م، بينما جبال الألب حوالي 2500م.',
       (SELECT id FROM "Category" WHERE name ~* 'جغرافيا' AND "parentId" IS NULL LIMIT 1),
       'جبال الأنديز',
       ARRAY['مقارنة','جغرافيا','جبال']),
      -- مقارنة (تاريخ)
      ('الفرق الرئيسي بين الدولة الأموية والدولة العباسية في انتقال العاصمة:',
       'العباسيون نقلوا العاصمة من دمشق إلى بغداد عام 762م، في حين حافظ الأمويون على دمشق كعاصمة.',
       (SELECT id FROM "Category" WHERE name ~* 'تاريخ إسلامي|تاريخ' AND "parentId" IS NULL LIMIT 1),
       'نقل العاصمة إلى بغداد',
       ARRAY['مقارنة','تاريخ','عباسيين','أمويين']),
      -- سيناريو (علوم)
      ('لو كنت في معمل وتريد فصل ملح الطعام عن الماء، فما الطريقة الأنسب؟',
       'التبخير هو الأنسب لفصل الملح عن الماء، حيث يتبخر الماء تاركاً الملح خلفه.',
       (SELECT id FROM "Category" WHERE name ~* 'كيمياء|علوم' AND "parentId" IS NULL LIMIT 1),
       'التبخير',
       ARRAY['سيناريو','علوم','كيمياء']),
      -- سيناريو (تاريخ)
      ('تخيّل أنك تاجر في بغداد في العصر العباسي، فأي طريق تسلكه للتجارة مع الصين؟',
       'طريق الحرير كان الطريق التجاري الرئيسي الذي يربط بغداد بالعالم الشرقي والصين.',
       (SELECT id FROM "Category" WHERE name ~* 'تاريخ إسلامي|تاريخ' AND "parentId" IS NULL LIMIT 1),
       'طريق الحرير',
       ARRAY['سيناريو','تاريخ','تجارة']),
      -- سيناريو (جغرافيا)
      ('في رحلة استكشافية إلى الصحراء الكبرى، أيّ معدات يجب أن تحرص على حملها قبل كل شيء؟',
       'معدات الحماية من الشمس والماء بكميات كافية، نظراً لدرجات الحرارة المرتفعة والجفاف الشديد في الصحراء الكبرى.',
       (SELECT id FROM "Category" WHERE name ~* 'جغرافيا' AND "parentId" IS NULL LIMIT 1),
       'الماء الكافي وأدوات الحماية من الشمس',
       ARRAY['سيناريو','جغرافيا','صحراء']),
      -- سببية (علوم)
      ('لماذا تطفو السفينة الفولاذية على الماء رغم أن الفولاذ أثقل من الماء؟',
       'لأن السفينة مصممة بحيث تحوي تجاويف مملوءة بالهواء، فيصبح متوسط كثافتها أقل من كثافة الماء.',
       (SELECT id FROM "Category" WHERE name ~* 'فيزياء|علوم' AND "parentId" IS NULL LIMIT 1),
       'بسبب الفراغات الهوائية التي تقلل متوسط الكثافة',
       ARRAY['سببية','علوم','فيزياء']),
      -- سببية (جغرافيا)
      ('ما السبب الرئيسي وراء تكون الفصول الأربعة على الأرض؟',
       'ميل محور الأرض بمقدار 23.5 درجة أثناء دورانها حول الشمس، مما يختلف توزيع أشعة الشمس على المناطق.',
       (SELECT id FROM "Category" WHERE name ~* 'جغرافيا' AND "parentId" IS NULL LIMIT 1),
       'ميل محور الأرض',
       ARRAY['سببية','جغرافيا','فصول']),
      -- كيف (علوم)
      ('كيف تحصل النباتات على غذائها عبر عملية البناء الضوئي؟',
       'تستخدم النباتات ضوء الشمس وثاني أكسيد الكربون والماء لإنتاج الجلوكوز والأكسجين.',
       (SELECT id FROM "Category" WHERE name ~* 'أحياء|علوم' AND "parentId" IS NULL LIMIT 1),
       'تحويل ضوء الشمس والماء وثاني أكسيد الكربون إلى غذاء',
       ARRAY['كيف','علوم','نباتات']),
      -- كيف (تقنية)
      ('كيف يعمل نظام GPS في تحديد موقعك الجغرافي؟',
       'يستقبل إشارات من أربعة أقمار صناعية على الأقل ويحسب المسافة بينها ليحدد إحداثيات الموقع.',
       (SELECT id FROM "Category" WHERE name ~* 'تقنية' AND "parentId" IS NULL LIMIT 1),
       'باستقبال إشارات من الأقمار الصناعية وحساب المسافة',
       ARRAY['كيف','تقنية','GPS']),
      -- عددي (علوم)
      ('كم عدد الكواكب في المجموعة الشمسية؟',
       '8 كواكب هي: عطارد، الزهرة، الأرض، المريخ، المشتري، زحل، أورانوس، نبتون.',
       (SELECT id FROM "Category" WHERE name ~* 'فضاء|علوم' AND "parentId" IS NULL LIMIT 1),
       '8 كواكب',
       ARRAY['عددي','علوم','فضاء']),
      -- عددي (جغرافيا)
      ('كم قارّة توجد على سطح الأرض؟',
       '7 قارات: آسيا، أفريقيا، أمريكا الشمالية، أمريكا الجنوبية، أنتاركتيكا، أوروبا، أستراليا.',
       (SELECT id FROM "Category" WHERE name ~* 'جغرافيا' AND "parentId" IS NULL LIMIT 1),
       '7 قارات',
       ARRAY['عددي','جغرافيا','قارات'])
    ) AS q(prompt, explanation, category_id, expected, keywords)
    RETURNING id, prompt
  )
  SELECT COUNT(*) INTO v_added_count FROM new_questions;
  RAISE NOTICE '✓ إدراج أسئلة جديدة: % سؤال', v_added_count;

  -- إضافة خيارات متعددة لكل سؤال (4 خيارات لكل سؤال)
  -- الفيروس والبكتيريا
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, 'الفيروس يحتاج خلية مضيفة للتكاثر', true),
    (2, 'الفيروس يتكاثر أسرع في الهواء', false),
    (3, 'البكتيريا تعتمد على الفيروس للتكاثر', false),
    (4, 'لا فرق بينهما', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'الفيروس والبكتيريا'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- جبال الألب والأنديز
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, 'جبال الألب', false),
    (2, 'جبال الأنديز', true),
    (3, 'متساويان في الارتفاع', false),
    (4, 'لا يمكن المقارنة', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'جبال الألب'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- الأموية والعباسية
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, 'توحيد اللغة الرسمية', false),
    (2, 'نقل العاصمة إلى بغداد', true),
    (3, 'بناء الأهرامات', false),
    (4, 'إنشاء جامعة', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'الأموية والعباسية'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- فصل الملح عن الماء
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, 'الترشيح', false),
    (2, 'التبخير', true),
    (3, 'التقطير', false),
    (4, 'التبلور السريع', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'فصل ملح الطعام'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- طريق الحرير
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, 'الطريق البحري عبر المحيط', false),
    (2, 'طريق الحرير', true),
    (3, 'الطريق الجوي', false),
    (4, 'السكك الحديدية الأوروبية', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'تاجر في بغداد'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- معدات الصحراء
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, 'معدات تسلق الجبال', false),
    (2, 'الماء الكافي وأدوات الحماية من الشمس', true),
    (3, 'أدوات صيد الحيوانات', false),
    (4, 'خيمة شتوية', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'الصحراء الكبرى'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- السفينة الفولاذية
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, 'الفولاذ لا يصدأ', false),
    (2, 'بسبب الفراغات الهوائية التي تقلل متوسط الكثافة', true),
    (3, 'لأن الماء أخف', false),
    (4, 'بسبب الطلاء الخاص', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'السفينة الفولاذية'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- الفصول الأربعة
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, 'دوران الأرض حول نفسها', false),
    (2, 'ميل محور الأرض', true),
    (3, 'بُعد الأرض عن الشمس', false),
    (4, 'حركة القمر', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'الفصول الأربعة'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- البناء الضوئي
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, 'تأخذ الماء فقط', false),
    (2, 'تحويل ضوء الشمس والماء وثاني أكسيد الكربون إلى غذاء', true),
    (3, 'تأخذ المعادن من التربة', false),
    (4, 'تعتمد على الحشرات', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'البناء الضوئي'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- GPS
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, 'يعتمد على شبكات WiFi فقط', false),
    (2, 'باستقبال إشارات من الأقمار الصناعية وحساب المسافة', true),
    (3, 'يستخدم أبراج اتصالات أرضية', false),
    (4, 'يعتمد على بوصلة مغناطيسية', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'GPS'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- عدد الكواكب
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, '7 كواكب', false),
    (2, '8 كواكب', true),
    (3, '9 كواكب', false),
    (4, '10 كواكب', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'الكواكب في المجموعة الشمسية'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- عدد القارات
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT gen_random_uuid()::text, q.id, o.pos, o.txt, o.correct
  FROM "Question" q
  CROSS JOIN LATERAL (VALUES
    (1, '5 قارات', false),
    (2, '6 قارات', false),
    (3, '7 قارات', true),
    (4, '8 قارات', false)
  ) AS o(pos, txt, correct)
  WHERE q.source = 'curation-2026-08-18' AND q.prompt ~* 'قارّة توجد على سطح الأرض'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE '✅ المجموعة 2 (مقارنة/سيناريو/سببية/كيف/عددي): اكتملت';
  RAISE NOTICE '════════════════════════════════════════════════';
END $$;
