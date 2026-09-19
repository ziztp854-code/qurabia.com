-- =====================================================================
-- 📋 الخطوة 4: إعادة صياغة الأسئلة المتكررة (Wh → أنماط متنوعة)
-- =====================================================================
-- إعادة صياغة 15 سؤالاً من نوع "أين تقع" / "ما هي عاصمة" إلى أنماط
-- مقارنة/سيناريو/تعريف/سببية لتعزيز التنوع
-- =====================================================================

DO $$
DECLARE
  v_user_id TEXT;
  v_updated_count INT := 0;
  v_q RECORD;
BEGIN
  SELECT id INTO v_user_id FROM "User" WHERE email = 'seed@tahaddi.local' LIMIT 1;

  -- ============================================================
  -- إعادة صياغة 1: "أين تقع..." → "في أي قارة تقع..." (إضافة سياق)
  -- ============================================================
  FOR v_q IN
    SELECT q.id, q.prompt, q.explanation, q."expectedAnswer"
    FROM "Question" q
    WHERE q.status='PUBLISHED'
      AND q.prompt ~* 'أين تقع (المدينة|العاصمة|القرية|المدينة القديمة)'
    ORDER BY q."lastEditedAt" DESC
    LIMIT 5
  LOOP
    UPDATE "Question" SET
      prompt = regexp_replace(
        prompt,
        '^أين تقع',
        'في أي قارة تقع',
        'i'
      ),
      "lastEditedAt" = NOW()
    WHERE id = v_q.id;
    v_updated_count := v_updated_count + 1;
  END LOOP;
  RAISE NOTICE '✓ إعادة صياغة 1 (أين → في أي قارة): % سؤال', v_updated_count;

  -- ============================================================
  -- إعادة صياغة 2: "ما هي عاصمة..." → "اختر العاصمة الصحيحة ل..."
  -- ============================================================
  v_updated_count := 0;
  FOR v_q IN
    SELECT q.id, q.prompt
    FROM "Question" q
    WHERE q.status='PUBLISHED'
      AND q.prompt ~* '^ما هي عاصمة'
    ORDER BY q."lastEditedAt" DESC
    LIMIT 5
  LOOP
    UPDATE "Question" SET
      prompt = regexp_replace(
        prompt,
        '^ما هي عاصمة',
        'اختر العاصمة الصحيحة لـ',
        'i'
      ),
      "lastEditedAt" = NOW()
    WHERE id = v_q.id;
    v_updated_count := v_updated_count + 1;
  END LOOP;
  RAISE NOTICE '✓ إعادة صياغة 2 (ما هي عاصمة → اختر العاصمة): % سؤال', v_updated_count;

  -- ============================================================
  -- إعادة صياغة 3: "متى ولد..." → "في أي سنة وُلد..." (تنويع)
  -- ============================================================
  v_updated_count := 0;
  FOR v_q IN
    SELECT q.id, q.prompt
    FROM "Question" q
    WHERE q.status='PUBLISHED'
      AND q.prompt ~* '^متى و?ل?د'
    ORDER BY q."lastEditedAt" DESC
    LIMIT 5
  LOOP
    UPDATE "Question" SET
      prompt = regexp_replace(
        prompt,
        '^متى و?ل?د',
        'في أي سنة وُلد',
        'i'
      ),
      "lastEditedAt" = NOW()
    WHERE id = v_q.id;
    v_updated_count := v_updated_count + 1;
  END LOOP;
  RAISE NOTICE '✓ إعادة صياغة 3 (متى ولد → في أي سنة وُلد): % سؤال', v_updated_count;

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE '✅ المرحلة 4 (إعادة الصياغة): اكتملت';
  RAISE NOTICE '════════════════════════════════════════════════';
END $$;
