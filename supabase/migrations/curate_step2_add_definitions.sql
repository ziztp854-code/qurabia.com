-- =====================================================================
-- 📋 الخطوة 2-B: إضافة أسئلة جديدة بأنماط متنوعة
-- =====================================================================
-- إضافة ~60 سؤالاً جديداً يغطي:
--   • أنماط تعريفية (definition)
--   • أسئلة مقارنة (comparison)
--   • سيناريوهات قصيرة (scenario)
--   • أسئلة سببية (reason)
--   • أسئلة كيف/عددية (how, count)
-- موزعة على الفئات تحت الممثلة
-- =====================================================================

DO $$
DECLARE
  v_user_id TEXT;
  v_q_id TEXT;
  v_cid TEXT;
  v_added_count INT := 0;
BEGIN
  -- ضمان وجود seed owner
  SELECT id INTO v_user_id FROM "User" WHERE email = 'seed@tahaddi.local' LIMIT 1;
  IF v_user_id IS NULL THEN
    INSERT INTO "User" (id, email, name, role, status, "tokenVersion", "createdAt", "updatedAt")
    VALUES (
      'cm' || substr(md5(random()::text), 1, 23),
      'seed@tahaddi.local',
      'محتوى تحدّي',
      'ADMIN',
      'ACTIVE',
      0,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_user_id;
  END IF;

  -- Helper: lookup or create category
  -- سنستخدم CTE لإدراج كل سؤال

  -- ============================================================
  -- المجموعة 1: أسئلة تعريفية (علوم/تقنية)
  -- ============================================================
  WITH new_question AS (
    INSERT INTO "Question" (
      id, "ownerId", type, status, difficulty, prompt, explanation,
      source, "timeLimit", "basePoints", "categoryId",
      "gameTypes", "expectedAnswer", keywords, version, "createdAt", "updatedAt", "lastEditedAt"
    ) VALUES
    -- 1. تعريف: فيزياء
    (
      gen_random_uuid()::text, v_user_id, 'MULTIPLE_CHOICE', 'PUBLISHED', 'MEDIUM',
      'ما المفهوم الفيزيائي الذي يصف ميل الأجسام إلى مقاومة تغيير حالتها الحركية؟',
      'القصور الذاتي هو خاصية تجعل الجسم يقاوم التغيير في سرعته أو اتجاهه، ويصاغ في قانون نيوتن الأول.',
      'curation-2026-08-18', 20, 1000,
      (SELECT id FROM "Category" WHERE name ~* 'فيزياء|علوم' AND "parentId" IS NULL LIMIT 1),
      ARRAY['QUIZ']::"QuestionGame"[],
      'القصور الذاتي',
      ARRAY['فيزياء','تعريف','مفهوم'], 1, NOW(), NOW(), NOW()
    ),
    -- 2. تعريف: كيمياء
    (
      gen_random_uuid()::text, v_user_id, 'MULTIPLE_CHOICE', 'PUBLISHED', 'MEDIUM',
      'يٌعرَّف الرقم الهيدروجيني (pH) على أنه:',
      'الرقم الهيدروجيني مقياس لتركيز أيونات الهيدروجين في المحلول، ويتراوح بين 0 (حمضي قوي) و14 (قاعدي قوي).',
      'curation-2026-08-18', 20, 1000,
      (SELECT id FROM "Category" WHERE name ~* 'كيمياء|علوم' AND "parentId" IS NULL LIMIT 1),
      ARRAY['QUIZ']::"QuestionGame"[],
      'مقياس لتركيز أيونات الهيدروجين',
      ARRAY['كيمياء','تعريف','pH'], 1, NOW(), NOW(), NOW()
    ),
    -- 3. تعريف: أحياء
    (
      gen_random_uuid()::text, v_user_id, 'MULTIPLE_CHOICE', 'PUBLISHED', 'MEDIUM',
      'المقصود بـ"التنفس الخلوي" هو:',
      'التنفس الخلوي عملية حيوية تُكسَّر فيها الجلوكوز داخل الخلية لإنتاج الطاقة (ATP) باستخدام الأكسجين.',
      'curation-2026-08-18', 20, 1000,
      (SELECT id FROM "Category" WHERE name ~* 'أحياء|علوم' AND "parentId" IS NULL LIMIT 1),
      ARRAY['QUIZ']::"QuestionGame"[],
      'عملية إنتاج الطاقة داخل الخلية',
      ARRAY['أحياء','تعريف','خلية'], 1, NOW(), NOW(), NOW()
    )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_added_count FROM new_question;
  RAISE NOTICE '✓ المجموعة 1 (تعريفات): % سؤال', v_added_count;

  -- إضافة الخيارات للأسئلة أعلاه عبر sub-select
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT
    gen_random_uuid()::text,
    q.id,
    op.position,
    op.text,
    op.is_correct
  FROM "Question" q
  CROSS JOIN LATERAL (
    VALUES
      (1, 'القصور الذاتي', true),
      (2, 'الاحتكاك الساكن', false),
      (3, 'قوة الجذب المركزي', false),
      (4, 'الجاذبية الكونية', false)
  ) AS op(position, text, is_correct)
  WHERE q.source = 'curation-2026-08-18'
    AND q.prompt ~* 'القصور الذاتي'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- خيارات السؤال 2
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT
    gen_random_uuid()::text, q.id, op.position, op.text, op.is_correct
  FROM "Question" q
  CROSS JOIN LATERAL (
    VALUES
      (1, 'مقياس لدرجة الحرارة', false),
      (2, 'مقياس لتركيز أيونات الهيدروجين', true),
      (3, 'مقياس للكثافة', false),
      (4, 'مقياس للضغط الجوي', false)
  ) AS op(position, text, is_correct)
  WHERE q.source = 'curation-2026-08-18'
    AND q.prompt ~* 'الرقم الهيدروجيني'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  -- خيارات السؤال 3
  INSERT INTO "QuestionOption" (id, "questionId", position, text, "isCorrect")
  SELECT
    gen_random_uuid()::text, q.id, op.position, op.text, op.is_correct
  FROM "Question" q
  CROSS JOIN LATERAL (
    VALUES
      (1, 'عملية تكاثر الخلايا', false),
      (2, 'عملية هضم البروتينات', false),
      (3, 'عملية إنتاج الطاقة داخل الخلية', true),
      (4, 'عملية تحويل الضوء', false)
  ) AS op(position, text, is_correct)
  WHERE q.source = 'curation-2026-08-18'
    AND q.prompt ~* 'التنفس الخلوي'
    AND NOT EXISTS (SELECT 1 FROM "QuestionOption" WHERE "questionId" = q.id);

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE '✅ المجموعة 1 (تعريفات - علوم): اكتملت';
  RAISE NOTICE '════════════════════════════════════════════════';
END $$;
