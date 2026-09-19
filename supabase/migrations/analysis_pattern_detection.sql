-- =====================================================================
-- 📊 تحليل بنك الأسئلة الشامل (قبل المعالجة)
-- =====================================================================

-- 1. خريطة الأنماط
CREATE TEMP TABLE _patterns ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('wh_location',  'أين (تقع|يقع|توجد|يوجد)',                 'موقع جغرافي'),
  ('wh_capital',   'عاصمة',                                    'سؤال عاصمة'),
  ('wh_birth',     'متى و?ل?د|من هو صاحب ال?ميلاد',           'سؤال تاريخ ميلاد'),
  ('wh_year',      'في أي (سنة|عام)',                          'سؤال بتأريخ سنوي'),
  ('wh_who',       '^من (هو|هي|هم|هن|صاحب|صاحبة|اكتشف|اخترع|بنى|أسس|قاد|كتب|رسم)', 'سؤال من هو/هي'),
  ('wh_what',      '^ما (هو|هي|هم|هن|اسم|أصل|سبب|شكل|نوع|لون|حجم)', 'سؤال ما هو/هي'),
  ('wh_when',      '^متى ',                                    'سؤال متى عام'),
  ('wh_where',     '^أين ',                                    'سؤال أين عام'),
  ('wh_which',     '^(أي|أيّ) ',                              'سؤال أي'),
  ('definition',   'ي?عرَّف|المقصود|معنى|تعريف|يقصد ب',       'سؤال تعريف/مصطلح'),
  ('comparison',   'الفرق|قارن|المقارنة بين|أيهما أفضل|أيهما أقوى', 'سؤال مقارنة'),
  ('scenario',     'ت?خيَّل|ت?خيّل|في مشهد|لو كنت|في موقف|في رحلة|في ليلة|في صباح', 'سؤال سيناريو'),
  ('reason',       '^لماذا|^ما سبب|سبب|علل|ما السر',         'سؤال سببية'),
  ('how',          '^كيف|ما الطريقة|ما الخطوات',             'سؤال كيف'),
  ('count',        '^كم (عدد|مرة|سنة|يوم)|^ما عدد',           'سؤال عددي'),
  ('true_false',   '^هل |^صحيح أن',                          'سؤال صح/خطأ'),
  ('odd_one',      'لا ينتمي|أيها لا|أيّها لا|الاستثناء',   'سؤال الشاذ')
) AS t(key, regex, description);

-- 2. تصنيف نمط كل سؤال منشور
CREATE TEMP TABLE _question_pattern ON COMMIT DROP AS
SELECT
  q.id,
  q."categoryId",
  c.name AS category_name,
  q.prompt,
  COALESCE((
    SELECT p.key FROM _patterns p
    WHERE q.prompt ~ p.regex
    ORDER BY array_position(ARRAY[
      'wh_location','wh_capital','wh_birth','wh_year','wh_who','wh_what',
      'wh_when','wh_where','wh_which','definition','comparison','scenario',
      'reason','how','count','true_false','odd_one'
    ], p.key)
    LIMIT 1
  ), 'other') AS pattern_key
FROM "Question" q
LEFT JOIN "Category" c ON c.id = q."categoryId"
WHERE q.status = 'PUBLISHED';

-- 3. التقرير الإحصائي
DO $$
DECLARE
  r RECORD;
  v_total INT;
  v_pub INT;
  v_arc INT;
  v_total_patterns INT;
  v_pct NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_total FROM "Question";
  SELECT COUNT(*) INTO v_pub FROM "Question" WHERE status='PUBLISHED';
  SELECT COUNT(*) INTO v_arc FROM "Question" WHERE status='ARCHIVED';
  SELECT COUNT(*) INTO v_total_patterns FROM _question_pattern;

  RAISE NOTICE '════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '  تقرير شامل لبنك أسئلة تحدّي (قبل المعالجة)';
  RAISE NOTICE '════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '  إجمالي: % سؤال', v_total;
  RAISE NOTICE '  منشور: %', v_pub;
  RAISE NOTICE '  مؤرشف: %', v_arc;
  RAISE NOTICE '  مصنّف: %', v_total_patterns;
  RAISE NOTICE '';

  -- 3.1 توزيع المجالات المعرفية (المجال = parent name)
  RAISE NOTICE '────────────────────────────────────────────────────────────────────';
  RAISE NOTICE '  توزيع المجالات المعرفية';
  RAISE NOTICE '────────────────────────────────────────────────────────────────────';
  FOR r IN
    SELECT
      domain_name,
      COUNT(qp.id) AS total
    FROM (
      SELECT
        qp.id,
        COALESCE(parent.name, c.name, 'بدون فئة') AS domain_name
      FROM _question_pattern qp
      LEFT JOIN "Category" c ON c.id = qp."categoryId"
      LEFT JOIN "Category" parent ON parent.id = c."parentId"
    ) qp
    GROUP BY domain_name
    ORDER BY total DESC
  LOOP
    RAISE NOTICE '  % : % سؤال', RPAD(r.domain_name, 32), r.total;
  END LOOP;
  RAISE NOTICE '';

  -- 3.2 الفئات التي تتجاوز فيها أنماط "أين/متى/ما هي عاصمة" 50%
  RAISE NOTICE '────────────────────────────────────────────────────────────────────';
  RAISE NOTICE '  الفئات الإشكالية (نمط Wh أكبر من 50)';
  RAISE NOTICE '────────────────────────────────────────────────────────────────────';
  FOR r IN
    SELECT
      c.name AS category_name,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE qp.pattern_key IN ('wh_location','wh_capital','wh_birth','wh_year','wh_when','wh_where','wh_what','wh_who')) AS wh_count
    FROM _question_pattern qp
    JOIN "Category" c ON c.id = qp."categoryId"
    GROUP BY c.name
    HAVING COUNT(*) >= 10
  LOOP
    v_pct := ROUND(100.0 * r.wh_count / r.total, 1);
    IF v_pct > 50 THEN
      RAISE NOTICE '  % : % من %  (نسبة %)', RPAD(r.category_name, 28), r.wh_count, r.total, v_pct;
    END IF;
  END LOOP;
  RAISE NOTICE '';

  -- 3.3 التوزيع التفصيلي للأنماط حسب الفئة
  RAISE NOTICE '────────────────────────────────────────────────────────────────────';
  RAISE NOTICE '  التوزيع التفصيلي للأنماط (الفئة / النمط / العدد / النسبة)';
  RAISE NOTICE '────────────────────────────────────────────────────────────────────';
  FOR r IN
    SELECT
      c.name AS category_name,
      qp.pattern_key,
      COUNT(*) AS cnt,
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY c.name), 1) AS pct
    FROM _question_pattern qp
    JOIN "Category" c ON c.id = qp."categoryId"
    GROUP BY c.name, qp.pattern_key
    HAVING COUNT(*) >= 3
    ORDER BY c.name, cnt DESC
  LOOP
    RAISE NOTICE '  %  ·  %  :  %  (نسبة %)', RPAD(r.category_name, 24), RPAD(r.pattern_key, 16), r.cnt, r.pct;
  END LOOP;
  RAISE NOTICE '';

  -- 3.4 ملخص الأنماط على مستوى البنك
  RAISE NOTICE '────────────────────────────────────────────────────────────────────';
  RAISE NOTICE '  ملخص الأنماط (البنك ككل)';
  RAISE NOTICE '────────────────────────────────────────────────────────────────────';
  FOR r IN
    SELECT
      pattern_key,
      COUNT(*) AS cnt,
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
    FROM _question_pattern
    GROUP BY pattern_key
    ORDER BY cnt DESC
  LOOP
    RAISE NOTICE '  % : % سؤال  (نسبة %)', RPAD(r.pattern_key, 18), r.cnt, r.pct;
  END LOOP;
  RAISE NOTICE '';
END $$;
