-- =====================================================================
-- 📋 الخطوة 2-A: أرشفة الأسئلة الزائدة (تخفيض أنماط Wh إلى ≤50%)
-- =====================================================================
-- الإجراء: أرشفة الأسئلة المكررة بنمط "أين تقع / ما هي عاصمة" بحيث لا
-- يتجاوز أي نمط 50% من إجمالي أسئلة الفئة.
-- =====================================================================

DO $$
DECLARE
  v_user_id TEXT;
  v_archived_count INT := 0;
  v_geo_count INT;
  v_geo_archive_count INT;
  v_capital_count INT;
  v_capital_archive_count INT;
  v_history_count INT;
  v_history_archive_count INT;
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

  -- ============================================================
  -- المرحلة 1: أرشفة 50% من أسئلة "أين تقع" في الجغرافيا
  -- ============================================================
  -- الإحصاء قبل
  SELECT COUNT(*) INTO v_geo_count
  FROM "Question" q
  JOIN "Category" c ON c.id = q."categoryId"
  WHERE q.status='PUBLISHED'
    AND (q.prompt ~* 'أين (تقع|يقع|توجد|يوجد)' OR q.prompt ~* 'في أي (مدينة|بلد|دولة|قارة|منطقة)');

  v_geo_archive_count := CEIL(v_geo_count * 0.40);  -- أرشفة 40% للوصول إلى ~50% من الأنماط Wh

  WITH to_archive AS (
    SELECT q.id
    FROM "Question" q
    JOIN "Category" c ON c.id = q."categoryId"
    WHERE q.status='PUBLISHED'
      AND (q.prompt ~* 'أين (تقع|يقع|توجد|يوجد)' OR q.prompt ~* 'في أي (مدينة|بلد|دولة|قارة|منطقة)')
    ORDER BY q."lastEditedAt" DESC
    LIMIT v_geo_archive_count
  )
  UPDATE "Question" q
  SET status = 'ARCHIVED',
      "archivedAt" = NOW(),
      "lastEditedAt" = NOW()
  FROM to_archive
  WHERE q.id = to_archive.id;

  GET DIAGNOSTICS v_archived_count = ROW_COUNT;
  RAISE NOTICE '✓ جغرافيا: تم أرشفة % من % سؤال Wh', v_archived_count, v_geo_count;

  -- ============================================================
  -- المرحلة 2: أرشفة 30% من أسئلة "ما هي عاصمة" المكررة
  -- ============================================================
  SELECT COUNT(*) INTO v_capital_count
  FROM "Question" q
  WHERE q.status='PUBLISHED'
    AND q.prompt ~* 'عاصمة';

  v_capital_archive_count := CEIL(v_capital_count * 0.30);

  WITH to_archive AS (
    SELECT q.id
    FROM "Question" q
    WHERE q.status='PUBLISHED'
      AND q.prompt ~* 'عاصمة'
    ORDER BY q."lastEditedAt" DESC
    LIMIT v_capital_archive_count
  )
  UPDATE "Question" q
  SET status = 'ARCHIVED',
      "archivedAt" = NOW(),
      "lastEditedAt" = NOW()
  FROM to_archive
  WHERE q.id = to_archive.id;

  GET DIAGNOSTICS v_archived_count = ROW_COUNT;
  RAISE NOTICE '✓ عواصم: تم أرشفة % من % سؤال', v_archived_count, v_capital_count;

  -- ============================================================
  -- المرحلة 3: أرشفة 20% من أسئلة "متى ولد" في التاريخ
  -- ============================================================
  SELECT COUNT(*) INTO v_history_count
  FROM "Question" q
  JOIN "Category" c ON c.id = q."categoryId"
  WHERE q.status='PUBLISHED'
    AND c.name ~* 'تاريخ'
    AND (q.prompt ~* 'متى و?ل?د' OR q.prompt ~* 'في أي سنة و?ل?د');

  v_history_archive_count := CEIL(v_history_count * 0.20);

  WITH to_archive AS (
    SELECT q.id
    FROM "Question" q
    JOIN "Category" c ON c.id = q."categoryId"
    WHERE q.status='PUBLISHED'
      AND c.name ~* 'تاريخ'
      AND (q.prompt ~* 'متى و?ل?د' OR q.prompt ~* 'في أي سنة و?ل?د')
    ORDER BY q."lastEditedAt" DESC
    LIMIT v_history_archive_count
  )
  UPDATE "Question" q
  SET status = 'ARCHIVED',
      "archivedAt" = NOW(),
      "lastEditedAt" = NOW()
  FROM to_archive
  WHERE q.id = to_archive.id;

  GET DIAGNOSTICS v_archived_count = ROW_COUNT;
  RAISE NOTICE '✓ تواريخ الميلاد: تم أرشفة % من % سؤال', v_archived_count, v_history_count;

  RAISE NOTICE '════════════════════════════════════';
  RAISE NOTICE '✅ المرحلة 1 انتهت: أرشفة الأسئلة الزائدة';
  RAISE NOTICE '════════════════════════════════════';
END $$;
