-- =====================================================================
-- 📋 الخطوة 3: التقرير الإحصائي النهائي (قبل/بعد)
-- =====================================================================
-- ينشئ snapshot نهائي ويحسب نسب التحسن
-- =====================================================================

CREATE TABLE IF NOT EXISTS "_CurationReport" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  phase TEXT NOT NULL,                  -- 'before' | 'after'
  snapshotAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total INT NOT NULL,
  published INT NOT NULL,
  archived INT NOT NULL,
  byCategory JSONB NOT NULL,
  byPattern JSONB NOT NULL,
  byDomain JSONB NOT NULL,
  problematicCategories JSONB,
  newQuestionsAdded INT,
  archivedByThisRun INT
);

DO $$
DECLARE
  v_total INT;
  v_pub INT;
  v_arc INT;
  v_by_domain JSONB;
  v_by_category JSONB;
  v_by_pattern JSONB;
  v_problematic JSONB;
  v_new_added INT;
  v_archived_run INT;
BEGIN
  -- حساب الإحصائيات الحالية
  SELECT COUNT(*) INTO v_total FROM "Question";
  SELECT COUNT(*) INTO v_pub FROM "Question" WHERE status='PUBLISHED';
  SELECT COUNT(*) INTO v_arc FROM "Question" WHERE status='ARCHIVED';
  SELECT COUNT(*) INTO v_new_added FROM "Question" WHERE source = 'curation-2026-08-18';
  SELECT COUNT(*) INTO v_archived_run
    FROM "Question"
    WHERE "archivedAt" >= NOW() - INTERVAL '10 minutes';

  -- توزيع المجالات
  SELECT jsonb_agg(row_to_json(t) ORDER BY (t.total)::int DESC) INTO v_by_domain
  FROM (
    SELECT domain_name AS domain, COUNT(*)::int AS total
    FROM (
      SELECT
        q.id,
        COALESCE(parent.name, c.name, 'بدون فئة') AS domain_name
      FROM "Question" q
      LEFT JOIN "Category" c ON c.id = q."categoryId"
      LEFT JOIN "Category" parent ON parent.id = c."parentId"
      WHERE q.status='PUBLISHED'
    ) x
    GROUP BY domain_name
  ) t;

  -- توزيع الفئات
  SELECT jsonb_agg(row_to_json(t) ORDER BY (t.total)::int DESC) INTO v_by_category
  FROM (
    SELECT c.name AS category, COUNT(q.id)::int AS total
    FROM "Category" c
    LEFT JOIN "Question" q ON q."categoryId" = c.id AND q.status='PUBLISHED'
    GROUP BY c.name
    HAVING COUNT(q.id) > 0
  ) t;

  -- توزيع الأنماط
  WITH pattern_def(key, regex) AS (VALUES
    ('wh_location',  'أين (تقع|يقع|توجد|يوجد)'::text),
    ('wh_capital',   'عاصمة'::text),
    ('wh_birth',     'متى و?ل?د|في أي سنة و?ل?د'::text),
    ('wh_year',      'في أي (سنة|عام)'::text),
    ('wh_who',       '^من (هو|هي|هم|هن|صاحب|صاحبة|اكتشف|اخترع|بنى|أسس|قاد|كتب|رسم)'::text),
    ('wh_what',      '^ما (هو|هي|هم|هن|اسم|أصل|سبب|شكل|نوع|لون|حجم)'::text),
    ('wh_when',      '^متى '::text),
    ('wh_where',     '^أين '::text),
    ('wh_which',     '^(أي|أيّ) '::text),
    ('definition',   'ي?عرَّف|المقصود|معنى|تعريف|يقصد ب'::text),
    ('comparison',   'الفرق|قارن|المقارنة بين|أيهما أفضل|أيهما أقوى'::text),
    ('scenario',     'ت?خيَّل|ت?خيّل|في مشهد|لو كنت|في موقف|في رحلة|في ليلة|في صباح'::text),
    ('reason',       '^لماذا|^ما سبب|سبب|علل|ما السر'::text),
    ('how',          '^كيف|ما الطريقة|ما الخطوات'::text),
    ('count',        '^كم (عدد|مرة|سنة|يوم)|^ما عدد'::text),
    ('true_false',   '^هل |^صحيح أن'::text),
    ('odd_one',      'لا ينتمي|أيها لا|أيّها لا|الاستثناء'::text)
  ),
  classified AS (
    SELECT
      q.id,
      COALESCE((
        SELECT pd.key FROM pattern_def pd
        WHERE q.prompt ~ pd.regex
        ORDER BY array_position(ARRAY[
          'wh_location','wh_capital','wh_birth','wh_year','wh_who','wh_what',
          'wh_when','wh_where','wh_which','definition','comparison','scenario',
          'reason','how','count','true_false','odd_one'
        ], pd.key)
        LIMIT 1
      ), 'other') AS pattern_key
    FROM "Question" q
    WHERE q.status='PUBLISHED'
  )
  SELECT jsonb_agg(row_to_json(t) ORDER BY (t.total)::int DESC) INTO v_by_pattern
  FROM (
    SELECT pattern_key, COUNT(*)::int AS total FROM classified GROUP BY pattern_key
  ) t;

  -- الفئات الإشكالية
  WITH classified AS (
    SELECT
      q.id, c.name AS cat,
      (q.prompt ~* 'أين (تقع|يقع|توجد|يوجد)|عاصمة|متى و?ل?د|^من (هو|هي)|^ما (هو|هي)|^متى |^أين |في أي (سنة|عام)') AS is_wh
    FROM "Question" q
    JOIN "Category" c ON c.id = q."categoryId"
    WHERE q.status='PUBLISHED'
  )
  SELECT jsonb_agg(row_to_json(t) ORDER BY (t.wh_pct)::numeric DESC) INTO v_problematic
  FROM (
    SELECT cat, COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE is_wh)::int AS wh_count,
           ROUND(100.0 * COUNT(*) FILTER (WHERE is_wh) / COUNT(*), 1) AS wh_pct
    FROM classified
    GROUP BY cat
    HAVING COUNT(*) >= 10 AND 100.0 * COUNT(*) FILTER (WHERE is_wh) / COUNT(*) > 50
  ) t;

  -- إدراج التقرير
  INSERT INTO "_CurationReport" (
    phase, total, published, archived, byCategory, byPattern, byDomain,
    problematicCategories, newQuestionsAdded, archivedByThisRun
  ) VALUES (
    'after', v_total, v_pub, v_arc, v_by_category, v_by_pattern, v_by_domain,
    v_problematic, v_new_added, v_archived_run
  );

  -- إدراج الـ snapshot قبل (من الـ AnalysisSnapshot)
  INSERT INTO "_CurationReport" (
    phase, total, published, archived, byCategory, byPattern, byDomain,
    problematicCategories, newQuestionsAdded, archivedByThisRun
  )
  SELECT
    'before',
    (totalQuestions)::int,
    (publishedQuestions)::int,
    (archivedQuestions)::int,
    categoryDistribution,
    patternDistribution,
    domainDistribution,
    problematicCategories,
    0, 0
  FROM "_AnalysisSnapshot"
  WHERE notes = 'initial-snapshot-2026-08-18'
  LIMIT 1;

  RAISE NOTICE '════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '  📊  تقرير شامل: بعد المعالجة';
  RAISE NOTICE '════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '  إجمالي: % سؤال', v_total;
  RAISE NOTICE '  منشور: %', v_pub;
  RAISE NOTICE '  مؤرشف: %', v_arc;
  RAISE NOTICE '  أسئلة جديدة مضافة في هذه الجولة: %', v_new_added;
  RAISE NOTICE '  أسئلة مؤرشفة في هذه الجولة: %', v_archived_run;
  RAISE NOTICE '';
  RAISE NOTICE '  الفئات الإشكالية المتبقية: %', COALESCE(jsonb_array_length(v_problematic), 0);
  RAISE NOTICE '════════════════════════════════════════════════════════════════════';
END $$;
