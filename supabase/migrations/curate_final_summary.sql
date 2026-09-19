-- =====================================================================
-- 📊 التقرير النهائي الشامل (قبل/بعد)
-- =====================================================================
-- استعلام موحّد يعرض نتائج المعالجة بتنسيق واضح
-- =====================================================================

DO $$
DECLARE
  r RECORD;
  v_before INT;
  v_after INT;
  v_archived_diff INT;
  v_total INT;
BEGIN
  -- 1) ملخص الأرقام الرئيسية
  SELECT
    (SELECT total FROM "_CurationReport" WHERE phase='before' LIMIT 1),
    (SELECT total FROM "_CurationReport" WHERE phase='after' LIMIT 1)
  INTO v_before, v_after;
  v_archived_diff := v_after - v_before;

  RAISE NOTICE '';
  RAISE NOTICE '╔═══════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║         التقرير النهائي لتنظيم بنك أسئلة تحدّي              ║';
  RAISE NOTICE '╠═══════════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║  قبل:  % أسئلة                                              ║', v_before;
  RAISE NOTICE '║  بعد:  % أسئلة                                              ║', v_after;
  RAISE NOTICE '║  صافي التغيير: % أسئلة (مؤرشفة + جديدة)                   ║', v_archived_diff;
  RAISE NOTICE '╚═══════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';

  -- 2) ملخص قبل
  RAISE NOTICE '┌──────────────────────────────────────────────────────────────┐';
  RAISE NOTICE '│  📊  الحالة قبل المعالجة                                    │';
  RAISE NOTICE '└──────────────────────────────────────────────────────────────┘';
  FOR r IN
    SELECT
      (total)::int AS total,
      (published)::int AS pub,
      (archived)::int AS arc,
      (newQuestionsAdded)::int AS new_add,
      (archivedByThisRun)::int AS arc_run
    FROM "_CurationReport" WHERE phase='before' LIMIT 1
  LOOP
    RAISE NOTICE '  إجمالي: % | منشور: % | مؤرشف: %', r.total, r.pub, r.arc;
  END LOOP;
  RAISE NOTICE '';

  -- 3) ملخص بعد
  RAISE NOTICE '┌──────────────────────────────────────────────────────────────┐';
  RAISE NOTICE '│  ✨  الحالة بعد المعالجة                                    │';
  RAISE NOTICE '└──────────────────────────────────────────────────────────────┘';
  FOR r IN
    SELECT
      (total)::int AS total,
      (published)::int AS pub,
      (archived)::int AS arc,
      (newQuestionsAdded)::int AS new_add,
      (archivedByThisRun)::int AS arc_run
    FROM "_CurationReport" WHERE phase='after' LIMIT 1
  LOOP
    RAISE NOTICE '  إجمالي: % | منشور: % | مؤرشف: %', r.total, r.pub, r.arc;
    RAISE NOTICE '  ✓ أسئلة جديدة في هذه الجولة: %', r.new_add;
    RAISE NOTICE '  ✓ أسئلة مؤرشفة في هذه الجولة: %', r.arc_run;
  END LOOP;
  RAISE NOTICE '';

  -- 4) توزيع المجالات المعرفية بعد
  RAISE NOTICE '┌──────────────────────────────────────────────────────────────┐';
  RAISE NOTICE '│  🌐  توزيع المجالات المعرفية (بعد)                          │';
  RAISE NOTICE '└──────────────────────────────────────────────────────────────┘';
  FOR r IN
    SELECT
      (elem->>'domain')::text AS domain,
      (elem->>'total')::int AS total
    FROM "_CurationReport",
         jsonb_array_elements("bydomain") AS elem
    WHERE phase='after'
  LOOP
    RAISE NOTICE '  % : % سؤال', RPAD(r.domain, 32), r.total;
  END LOOP;
  RAISE NOTICE '';

  -- 5) توزيع الأنماط (بعد)
  RAISE NOTICE '┌──────────────────────────────────────────────────────────────┐';
  RAISE NOTICE '│  📈  توزيع أنماط الصياغة (بعد)                              │';
  RAISE NOTICE '└──────────────────────────────────────────────────────────────┘';
  FOR r IN
    SELECT
      (elem->>'pattern_key')::text AS pkey,
      (elem->>'total')::int AS total
    FROM "_CurationReport",
         jsonb_array_elements("bypattern") AS elem
    WHERE phase='after'
  LOOP
    RAISE NOTICE '  % : % سؤال', RPAD(r.pkey, 18), r.total;
  END LOOP;
  RAISE NOTICE '';

  -- 6) الفئات الإشكالية المتبقية
  RAISE NOTICE '┌──────────────────────────────────────────────────────────────┐';
  RAISE NOTICE '│  ⚠️   الفئات الإشكالية المتبقية (Wh أكبر من 50)              │';
  RAISE NOTICE '└──────────────────────────────────────────────────────────────┘';
  FOR r IN
    SELECT
      (elem->>'cat')::text AS cat,
      (elem->>'total')::int AS total,
      (elem->>'wh_count')::int AS wh_count,
      (elem->>'wh_pct')::numeric AS wh_pct
    FROM "_CurationReport",
         jsonb_array_elements("problematiccategories") AS elem
    WHERE phase='after'
  LOOP
    RAISE NOTICE '  % : % Wh من % (نسبة %)', RPAD(r.cat, 30), r.wh_count, r.total, r.wh_pct;
  END LOOP;
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅  تم إنجاز المعالجة بنجاح. استعلم عن _CurationReport للتفاصيل.';
  RAISE NOTICE '════════════════════════════════════════════════════════════════════';
END $$;

-- تحديث التقرير بعد
UPDATE "_CurationReport" r_after
SET
  total = (SELECT COUNT(*) FROM "Question")::int,
  published = (SELECT COUNT(*) FROM "Question" WHERE status='PUBLISHED')::int,
  archived = (SELECT COUNT(*) FROM "Question" WHERE status='ARCHIVED')::int,
  newQuestionsAdded = (SELECT COUNT(*) FROM "Question" WHERE source = 'curation-2026-08-18')::int,
  archivedByThisRun = (SELECT COUNT(*) FROM "Question" WHERE "archivedAt" >= NOW() - INTERVAL '1 hour')::int,
  snapshotAt = NOW()
WHERE r_after.phase = 'after';
