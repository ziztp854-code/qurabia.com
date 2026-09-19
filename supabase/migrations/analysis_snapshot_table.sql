-- =====================================================================
-- 📊 جدول نتائج التحليل للاستعلام
-- =====================================================================
-- يخزّن تقرير التحليل في جدول دائم يمكن استرجاعه لاحقاً
-- =====================================================================

CREATE TABLE IF NOT EXISTS "_AnalysisSnapshot" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  snapshotAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  totalQuestions INT NOT NULL,
  publishedQuestions INT NOT NULL,
  archivedQuestions INT NOT NULL,
  domainDistribution JSONB NOT NULL,
  patternDistribution JSONB NOT NULL,
  categoryDistribution JSONB NOT NULL,
  problematicCategories JSONB NOT NULL,
  notes TEXT
);

-- حذف snapshot سابق إن وُجد
DELETE FROM "_AnalysisSnapshot" WHERE notes = 'initial-snapshot-2026-08-18';

-- بناء snapshot جديد
INSERT INTO "_AnalysisSnapshot" (
  totalQuestions, publishedQuestions, archivedQuestions,
  domainDistribution, patternDistribution, categoryDistribution,
  problematicCategories, notes
)
WITH
  totals AS (
    SELECT
      (SELECT COUNT(*) FROM "Question") AS total,
      (SELECT COUNT(*) FROM "Question" WHERE status='PUBLISHED') AS pub,
      (SELECT COUNT(*) FROM "Question" WHERE status='ARCHIVED') AS arc
  ),
  domain_data AS (
    SELECT jsonb_agg(row_to_json(t)) AS data
    FROM (
      SELECT domain_name AS domain, COUNT(*) AS total
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
      ORDER BY total DESC
    ) t
  ),
  category_data AS (
    SELECT jsonb_agg(row_to_json(t)) AS data
    FROM (
      SELECT
        c.name AS category,
        COUNT(q.id) AS total,
        COUNT(*) FILTER (WHERE q.status='PUBLISHED') AS published,
        COUNT(*) FILTER (WHERE q.status='ARCHIVED') AS archived
      FROM "Category" c
      LEFT JOIN "Question" q ON q."categoryId" = c.id
      GROUP BY c.name
      HAVING COUNT(q.id) > 0
      ORDER BY total DESC
    ) t
  ),
  pattern_data AS (
    WITH pattern_def(key, regex) AS (VALUES
      ('wh_location',  'أين (تقع|يقع|توجد|يوجد)'::text),
      ('wh_capital',   'عاصمة'::text),
      ('wh_birth',     'متى و?ل?د|من هو صاحب ال?ميلاد'::text),
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
    SELECT jsonb_agg(row_to_json(t)) AS data
    FROM (
      SELECT pattern_key, COUNT(*) AS total
      FROM classified
      GROUP BY pattern_key
      ORDER BY total DESC
    ) t
  ),
  problematic AS (
    WITH pattern_def(key, regex) AS (VALUES
      ('wh',  '(أين (تقع|يقع)|عاصمة|متى و?ل?د|في أي (سنة|عام)|^من (هو|هي)|^ما (هو|هي)|^متى |^أين )'::text)
    ),
    classified AS (
      SELECT
        q.id,
        q."categoryId",
        c.name AS category_name,
        (q.prompt ~ (SELECT regex FROM pattern_def WHERE key='wh')) AS is_wh
      FROM "Question" q
      JOIN "Category" c ON c.id = q."categoryId"
      WHERE q.status='PUBLISHED'
    )
    SELECT jsonb_agg(row_to_json(t)) AS data
    FROM (
      SELECT
        category_name,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_wh) AS wh_count,
        ROUND(100.0 * COUNT(*) FILTER (WHERE is_wh) / COUNT(*), 1) AS wh_pct
      FROM classified
      GROUP BY category_name
      HAVING COUNT(*) >= 10 AND 100.0 * COUNT(*) FILTER (WHERE is_wh) / COUNT(*) > 50
      ORDER BY wh_pct DESC
    ) t
  )
SELECT
  t.total, t.pub, t.arc,
  d.data AS domainDistribution,
  p.data AS patternDistribution,
  c.data AS categoryDistribution,
  pr.data AS problematicCategories,
  'initial-snapshot-2026-08-18' AS notes
FROM totals t, domain_data d, pattern_data p, category_data c, problematic pr;
