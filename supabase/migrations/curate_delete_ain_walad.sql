-- =====================================================================
-- 🗑️  حذف (أرشفة) أسئلة "أين وُلد" و"متى وُلد"
-- =====================================================================

DO $$
DECLARE
  v_user_id TEXT;
  v_count_ain INT := 0;
  v_count_mata INT := 0;
  v_total INT := 0;
BEGIN
  SELECT id INTO v_user_id FROM "User" WHERE email = 'seed@tahaddi.local' LIMIT 1;

  -- 1) أرشفة "أين وُلد / أين ولد"
  WITH archived AS (
    UPDATE "Question" q
    SET status = 'ARCHIVED',
        "archivedAt" = NOW(),
        "lastEditedAt" = NOW()
    WHERE q.status = 'PUBLISHED'
      AND (q.prompt ~* 'أين و?ل?د|أين و?لدت|أين و?لدوا')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count_ain FROM archived;
  RAISE NOTICE '✓ أرشفة "أين وُلد": % سؤال', v_count_ain;

  -- 2) أرشفة "متى وُلد / متى ولد"
  WITH archived AS (
    UPDATE "Question" q
    SET status = 'ARCHIVED',
        "archivedAt" = NOW(),
        "lastEditedAt" = NOW()
    WHERE q.status = 'PUBLISHED'
      AND (q.prompt ~* '^متى و?ل?د|^متى و?لدت|^متى و?لدوا|في أي سنة و?ل?د')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count_mata FROM archived;
  RAISE NOTICE '✓ أرشفة "متى وُلد": % سؤال', v_count_mata;

  v_total := v_count_ain + v_count_mata;
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '✅ إجمالي الأسئلة المؤرشفة: %', v_total;
  RAISE NOTICE '════════════════════════════════════════';
END $$;

-- إحصائيات نهائية
DO $$
DECLARE
  v_published INT;
  v_archived INT;
  v_remaining_ain INT;
  v_remaining_mata INT;
BEGIN
  SELECT COUNT(*) INTO v_published FROM "Question" WHERE status='PUBLISHED';
  SELECT COUNT(*) INTO v_archived FROM "Question" WHERE status='ARCHIVED';
  SELECT COUNT(*) INTO v_remaining_ain
    FROM "Question" WHERE status='PUBLISHED'
      AND prompt ~* 'أين و?ل?د|أين و?لدت|أين و?لدوا';
  SELECT COUNT(*) INTO v_remaining_mata
    FROM "Question" WHERE status='PUBLISHED'
      AND prompt ~* '^متى و?ل?د|^متى و?لدت|في أي سنة و?ل?د';

  RAISE NOTICE '';
  RAISE NOTICE '┌──────────────────────────────────────────┐';
  RAISE NOTICE '│  📊  الحالة بعد الحذف                   │';
  RAISE NOTICE '├──────────────────────────────────────────┤';
  RAISE NOTICE '│  منشور: %                              │', v_published;
  RAISE NOTICE '│  مؤرشف: %                              │', v_archived;
  RAISE NOTICE '│  "أين وُلد" المتبقي في المنشور: %     │', v_remaining_ain;
  RAISE NOTICE '│  "متى وُلد" المتبقي في المنشور: %     │', v_remaining_mata;
  RAISE NOTICE '└──────────────────────────────────────────┘';
END $$;
