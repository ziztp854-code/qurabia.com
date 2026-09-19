-- =====================================================================
-- 📋 الخطوة 2: تنظيم بنك الأسئلة (بعد تأكيد أسماء الجداول من diag-question-bank.sql)
-- =====================================================================
-- الإصلاح: يكتشف أسماء الجداول تلقائياً قبل كل عملية
--   • User / users
--   • Question / questions
--   • Category / categories
--   • QuestionOption / question_options
-- =====================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 0. اكتشاف الجداول + تجهيز seed owner
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_user_tbl      TEXT;
  v_question_tbl  TEXT;
  v_category_tbl  TEXT;
  v_option_tbl    TEXT;
  v_owner_id      TEXT;
  v_sql           TEXT;
BEGIN
  -- اكتشاف تلقائي مع تفضيل المفرد على الجمع
  SELECT table_name INTO v_user_tbl
    FROM information_schema.tables
   WHERE table_schema='public' AND LOWER(table_name) IN ('user','users')
   ORDER BY LENGTH(table_name) ASC LIMIT 1;

  SELECT table_name INTO v_question_tbl
    FROM information_schema.tables
   WHERE table_schema='public' AND LOWER(table_name) IN ('question','questions')
   ORDER BY LENGTH(table_name) ASC LIMIT 1;

  SELECT table_name INTO v_category_tbl
    FROM information_schema.tables
   WHERE table_schema='public' AND LOWER(table_name) IN ('category','categories')
   ORDER BY LENGTH(table_name) ASC LIMIT 1;

  SELECT table_name INTO v_option_tbl
    FROM information_schema.tables
   WHERE table_schema='public' AND LOWER(table_name) IN ('questionoption','question_options')
   ORDER BY LENGTH(table_name) ASC LIMIT 1;

  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE 'الجداول المُكتشفة:';
  RAISE NOTICE '  user     = %', COALESCE(v_user_tbl, '❌');
  RAISE NOTICE '  question = %', COALESCE(v_question_tbl, '❌');
  RAISE NOTICE '  category = %', COALESCE(v_category_tbl, '❌');
  RAISE NOTICE '  option   = %', COALESCE(v_option_tbl, '❌');
  RAISE NOTICE '════════════════════════════════════════════';

  IF v_user_tbl IS NULL OR v_question_tbl IS NULL
     OR v_category_tbl IS NULL OR v_option_tbl IS NULL THEN
    RAISE EXCEPTION 'جدول ناقص — شغّل diag-question-bank.sql أولاً';
  END IF;

  -- ضمان وجود seed owner (يحاول camelCase ثم snake_case)
  v_sql := format('SELECT id FROM %I WHERE email = $1 LIMIT 1', v_user_tbl);
  EXECUTE v_sql INTO v_owner_id USING 'seed@tahaddi.local';

  IF v_owner_id IS NULL THEN
    BEGIN
      EXECUTE format(
        'INSERT INTO %I (id, email, name, role, status, "tokenVersion", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 0, NOW(), NOW())
         RETURNING id',
        v_user_tbl
      ) INTO v_owner_id
        USING 'seed@tahaddi.local', 'محتوى تحدّي', 'ADMIN', 'ACTIVE';
    EXCEPTION WHEN OTHERS THEN
      EXECUTE format(
        'INSERT INTO %I (id, email, name, role, status, token_version, created_at, updated_at)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 0, NOW(), NOW())
         RETURNING id',
        v_user_tbl
      ) INTO v_owner_id
        USING 'seed@tahaddi.local', 'محتوى تحدّي', 'ADMIN', 'ACTIVE';
    END;
  END IF;

  -- خزّن النتائج في temp table لتستخدمها DO blocks اللاحقة
  CREATE TEMP TABLE _meta (user_tbl TEXT, question_tbl TEXT, category_tbl TEXT, option_tbl TEXT, owner_id TEXT)
    ON COMMIT DROP;
  INSERT INTO _meta VALUES (v_user_tbl, v_question_tbl, v_category_tbl, v_option_tbl, v_owner_id);

  RAISE NOTICE 'seed owner_id = %', v_owner_id;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 1. أرشفة 4 أسئلة جغرافيا (القطع بنسبة 80%)
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  m RECORD;
  v_sql TEXT;
  v_p TEXT;
  v_archived INT := 0;
BEGIN
  SELECT * INTO m FROM _meta;

  FOREACH v_p IN ARRAY ARRAY[
    'ما هي أكبر دولة عربية من حيث المساحة الإجمالية؟',
    'ما هو أطول نهر في العالم؟',
    'العراق دولة تطلّ على البحر الأبيض المتوسط.',
    'ما المضيق الذي يفصل بين قارة إفريقيا وقارة أوروبا ويربط البحر المتوسط بالمحيط الأطلسي؟'
  ]
  LOOP
    v_sql := format(
      'UPDATE %I SET status = $1, "archivedAt" = NOW(), "lastEditedAt" = NOW()
       WHERE "ownerId" = $2 AND prompt = $3 AND status <> $4',
      m.question_tbl
    );
    EXECUTE v_sql USING 'ARCHIVED', m.owner_id, v_p, 'ARCHIVED';
    GET DIAGNOSTICS v_archived = v_archived + ROW_COUNT;
  END LOOP;

  RAISE NOTICE '✅ القسم 1 — أرشفة جغرافيا: تم أرشفة % سؤال', v_archived;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 2. إعادة صياغة 8 أسئلة
-- ────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _rewrites (
  old_prompt TEXT PRIMARY KEY,
  new_prompt TEXT NOT NULL,
  new_explanation TEXT NOT NULL,
  new_difficulty TEXT NOT NULL,
  options JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO _rewrites VALUES
('ما هي عاصمة المملكة العربية السعودية؟',
 'في قلب نجد، تتوسط أرض الجزيرة العربية عاصمةٌ كبرى هي مقرّ الحكم ودارة القرار منذ تأسيس الدولة السعودية الأولى عام 1727م. ما اسم هذه العاصمة؟',
 'الرياض هي العاصمة وأكبر مدن المملكة العربية السعودية، ومركزها الإداري والمالي منذ الدولة السعودية الأولى.',
 'EASY',
 '[{"text":"الرياض","isCorrect":true},{"text":"جدة","isCorrect":false},{"text":"الدمام","isCorrect":false},{"text":"مكة المكرمة","isCorrect":false}]'::jsonb),
('في أي مدينة سعودية يقع حي الطريف التاريخي المسجل في قائمة التراث العالمي؟',
 'على ضفاف وادي حنيفة، يحتضن حيٌّ تاريخيٌّ أبنيتُه من الطين جدران قصرٍ بُني ليكون قاعدة حكم «آل سعود» الأولى. ما اسم هذا الحيّ المدرجة أبنيته على قائمة اليونسكو للتراث العالمي؟',
 'يقع حي الطريف التاريخي في الدرعية، عاصمة الدولة السعودية الأولى، وهو أحد مواقع التراث العالمي لليونسكو منذ عام 2010م.',
 'MEDIUM',
 '[{"text":"حي الطريف في الدرعية","isCorrect":true},{"text":"حي المعلا في مكة","isCorrect":false},{"text":"حي الروشن في جدة","isCorrect":false},{"text":"حي الثعالبة في الأحساء","isCorrect":false}]'::jsonb),
('ما أول سورة نزلت آياتها الأولى على رسول الله ﷺ؟',
 'في غار حراء، نزلت خمس آياتٍ بليغاتٍ على النبي ﷺ لتكون فاتحة الوحي والرسالة الخاتمة. ما اسم هذه السورة الكريمة؟',
 'نزلت الآيات الخمس الأولى من سورة العلق (اقرأ باسم ربك الذي خلق) في غار حراء، وكانت فاتحة الوحي.',
 'EASY',
 '[{"text":"سورة العلق","isCorrect":true},{"text":"سورة الفاتحة","isCorrect":false},{"text":"سورة المدثر","isCorrect":false},{"text":"سورة القلم","isCorrect":false}]'::jsonb),
('من هو أول خليفة في الإسلام بعد وفاة النبي ﷺ؟',
 'يُلقَّب بـ«الصديق» لأنه أوّل من آمن بالنبي ﷺ من الرجال الأحرار، ورافقه في رحلة الهجرة إلى المدينة، واختبأ معه في غار ثور. من هو هذا الصحابي الجليل؟',
 'أبو بكر الصديق رضي الله عنه تولى الخلافة الراشدة في السنة 11 للهجرة بعد وفاة النبي ﷺ.',
 'MEDIUM',
 '[{"text":"أبو بكر الصديق","isCorrect":true},{"text":"عمر بن الخطاب","isCorrect":false},{"text":"عثمان بن عفان","isCorrect":false},{"text":"علي بن أبي طالب","isCorrect":false}]'::jsonb),
('في أي سنة هجرية وقعت غزوة بدر الكبرى (يوم الفرقان)؟',
 'في رمضان من السنة الثانية للهجرة، التقى ثلاثمئة وثلاثة عشر من المسلمين بجمعٍ من قريش يقوده أبو جهل، لتكون أوّل مواجهة فاصلة في تاريخ الإسلام. ما اسم هذه الغزوة المباركة؟',
 'وقعت غزوة بدر الكبرى (يوم الفرقان) في 17 رمضان من السنة الثانية للهجرة (2هـ)، وكانت نقطة تحوّل في تاريخ الدعوة.',
 'HARD',
 '[{"text":"غزوة بدر الكبرى","isCorrect":true},{"text":"غزوة أحد","isCorrect":false},{"text":"غزوة الخندق","isCorrect":false},{"text":"فتح مكة","isCorrect":false}]'::jsonb),
('ما هو أكبر كوكب في المجموعة الشمسية حجماً وكتلة؟',
 'في مجموعتنا الشمسية، يتفوّق كوكبٌ بكتلةٍ تزيد على ضعف كتلة جميع الكواكب مجتمعة، ويحيط به أكثر من تسعين قمراً معروفاً. ما اسم هذا العملاق الغازي؟',
 'المشتري هو أكبر كواكب المجموعة الشمسية حجماً وكتلة، ويبلغ قطره نحو 11 ضعف قطر الأرض.',
 'EASY',
 '[{"text":"المشتري","isCorrect":true},{"text":"زحل","isCorrect":false},{"text":"الأرض","isCorrect":false},{"text":"نبتون","isCorrect":false}]'::jsonb),
('من هو الروائي العربي الحائز على جائزة نوبل في الآداب عام 1988م؟',
 'في عام 1988م، حصل كاتبٌ عربي على أرفع جائزةٍ أدبية في العالم، ليصبح بذلك أول أديب عربي يفوز بها عبر تاريخها الطويل. من هو هذا الروائي؟',
 'نجيب محفوظ هو الأديب العربي الوحيد الفائز بجائزة نوبل في الأدب عام 1988م عن مجمل أعماله الروائية.',
 'EASY',
 '[{"text":"نجيب محفوظ","isCorrect":true},{"text":"طه حسين","isCorrect":false},{"text":"توفيق الحكيم","isCorrect":false},{"text":"محمود درويش","isCorrect":false}]'::jsonb),
('ما هي الدولة الأكثر تتويجاً بلقب بطولة كأس العالم لكرة القدم عبر التاريخ؟',
 'على مدار تاريخ كأس العالم منذ نسخته الأولى عام 1930م، حقّقت دولةٌ في أمريكا الجنوبية اللقب خمس مرات، كان آخرها في كوريا واليابان 2002. ما اسم هذه الدولة؟',
 'البرازيل تحمل الرقم القياسي العالمي برصيد 5 بطولات لكأس العالم (1958، 1962، 1970، 1994، 2002).',
 'MEDIUM',
 '[{"text":"البرازيل (5 ألقاب)","isCorrect":true},{"text":"ألمانيا (4 ألقاب)","isCorrect":false},{"text":"إيطاليا (4 ألقاب)","isCorrect":false},{"text":"الأرجنتين (3 ألقاب)","isCorrect":false}]'::jsonb);

DO $$
DECLARE
  m RECORD;
  r RECORD;
  v_qid TEXT;
  v_sql TEXT;
  v_rewritten INT := 0;
  opt JSONB;
  v_idx INT;
BEGIN
  SELECT * INTO m FROM _meta;

  FOR r IN SELECT * FROM _rewrites LOOP
    v_sql := format(
      'SELECT id FROM %I WHERE "ownerId" = $1 AND prompt = $2 AND status <> $3 LIMIT 1',
      m.question_tbl
    );
    EXECUTE v_sql INTO v_qid USING m.owner_id, r.old_prompt, 'ARCHIVED';

    IF v_qid IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'UPDATE %I SET prompt = $1, explanation = $2, difficulty = $3,
                     version = version + 1, "lastEditedAt" = NOW() WHERE id = $4',
      m.question_tbl
    ) USING r.new_prompt, r.new_explanation, r.new_difficulty, v_qid;

    EXECUTE format('DELETE FROM %I WHERE "questionId" = $1', m.option_tbl) USING v_qid;

    v_idx := 0;
    FOR opt IN SELECT * FROM jsonb_array_elements(r.options) LOOP
      EXECUTE format(
        'INSERT INTO %I (id, "questionId", position, text, "isCorrect")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4)',
        m.option_tbl
      ) USING v_qid, v_idx, opt->>'text', (opt->>'isCorrect')::boolean;
      v_idx := v_idx + 1;
    END LOOP;

    v_rewritten := v_rewritten + 1;
    RAISE NOTICE '  ✓ أُعيدت صياغة: %', left(r.new_prompt, 55);
  END LOOP;

  RAISE NOTICE '✅ القسم 2 — إعادة الصياغة: تم % سؤال', v_rewritten;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 3. إدخال 4 أسئلة جديدة
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  m RECORD;
BEGIN
  SELECT * INTO m FROM _meta;
  -- ضمان الفئات
  BEGIN
    EXECUTE format(
      'INSERT INTO %I (id, name, slug, "isActive", position, "createdAt", "updatedAt")
       SELECT gen_random_uuid()::text, c.name, lower(regexp_replace(c.name, ''\s+'', ''-'', ''g'')),
              true, 100, NOW(), NOW()
       FROM (VALUES ($1),($2),($3),($4)) c(name)
       WHERE NOT EXISTS (SELECT 1 FROM %I WHERE name = c.name)',
      m.category_tbl, m.category_tbl
    ) USING 'ثقافة عامة','رياضيات','منطق','تقنية';
  EXCEPTION WHEN OTHERS THEN
    -- نسخة snake_case
    EXECUTE format(
      'INSERT INTO %I (id, name, slug, is_active, position, created_at, updated_at)
       SELECT gen_random_uuid()::text, c.name, lower(regexp_replace(c.name, ''\s+'', ''-'', ''g'')),
              true, 100, NOW(), NOW()
       FROM (VALUES ($1),($2),($3),($4)) c(name)
       WHERE NOT EXISTS (SELECT 1 FROM %I WHERE name = c.name)',
      m.category_tbl, m.category_tbl
    ) USING 'ثقافة عامة','رياضيات','منطق','تقنية';
  END;
  RAISE NOTICE '✓ تم ضمان الفئات الأربع';
END $$;

CREATE TEMP TABLE _new_questions (
  prompt TEXT PRIMARY KEY,
  explanation TEXT NOT NULL,
  category_name TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  time_limit INT NOT NULL,
  base_points INT NOT NULL,
  options JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO _new_questions VALUES
('في الثالث والعشرين من أبريل من كل عام، يحتفي العالم بيومٍ أقرّته منظمة اليونسكو تقديراً للكتاب والمؤلفين. ما الاسم الرسمي لهذا اليوم؟',
 'اليوم العالمي للكتاب وحقوق المؤلف يصادف 23 أبريل، ويحيي ذكرى وفاة كل من شكسبير وسيرفانتس وآخرين، ويشجع القراءة وحماية الملكية الفكرية.',
 'ثقافة عامة','EASY',15,800,
 '[{"text":"اليوم العالمي للكتاب وحقوق المؤلف","isCorrect":true},{"text":"اليوم العالمي للمعرفة","isCorrect":false},{"text":"يوم القراءة العربي","isCorrect":false},{"text":"يوم التراث العالمي","isCorrect":false}]'::jsonb),
('اشترى أحمد 3 أقلام ودفتراً واحداً بمبلغ إجمالي 27 ريالاً، فإذا كان سعر الدفتر 9 ريالات. فما سعر القلم الواحد؟',
 'ثمن الأقلام = 27 − 9 = 18 ريالاً، وعلى 3 أقلام يكون سعر القلم = 18 ÷ 3 = 6 ريالات.',
 'رياضيات','MEDIUM',20,1000,
 '[{"text":"6 ريالات","isCorrect":true},{"text":"5 ريالات","isCorrect":false},{"text":"4 ريالات","isCorrect":false},{"text":"8 ريالات","isCorrect":false}]'::jsonb),
('أيُّ العبارتين أقوى منطقياً: «كل القطط حيوانات» أم «بعض الحيوانات قطط»؟ ولماذا؟',
 'العبارة الأولى (كل القطط حيوانات) أقوى لأنها قضية كليّة لا استثناء فيها، بينما الثانية جزئية ولا تنفي وجود حيوانات ليست قططاً.',
 'منطق','MEDIUM',25,1000,
 '[{"text":"العبارة الأولى: «كل القطط حيوانات»","isCorrect":true},{"text":"العبارة الثانية: «بعض الحيوانات قطط»","isCorrect":false},{"text":"متساويتان في القوة المنطقية","isCorrect":false},{"text":"لا يمكن المقارنة بينهما","isCorrect":false}]'::jsonb),
('بفضل تقنيةٍ حديثة، يستطيع الحاسوب الترجمة الفورية والتعرّف على الكلام، والتعلّم من البيانات دون برمجة صريحة. ما اسم هذه التقنية التي أحدثت ثورة في الذكاء الاصطناعي؟',
 'تعلّم الآلة (Machine Learning) هو الفرع الذي يُمكّن الحاسوب من التعلّم من البيانات وتحسين أدائه دون برمجة صريحة لكل حالة.',
 'تقنية','MEDIUM',20,1000,
 '[{"text":"تعلّم الآلة (Machine Learning)","isCorrect":true},{"text":"الحوسبة السحابية (Cloud Computing)","isCorrect":false},{"text":"البرمجة الكائنية (OOP)","isCorrect":false},{"text":"قواعد البيانات العلائقية (RDBMS)","isCorrect":false}]'::jsonb);

DO $$
DECLARE
  m RECORD;
  r RECORD;
  v_qid TEXT;
  v_cat_id TEXT;
  v_sql TEXT;
  v_created INT := 0;
  opt JSONB;
  v_idx INT;
BEGIN
  SELECT * INTO m FROM _meta;

  FOR r IN SELECT * FROM _new_questions LOOP
    v_sql := format(
      'SELECT id FROM %I WHERE "ownerId" = $1 AND prompt = $2 AND status <> $3 LIMIT 1',
      m.question_tbl
    );
    EXECUTE v_sql INTO v_qid USING m.owner_id, r.prompt, 'ARCHIVED';
    IF v_qid IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_sql := format('SELECT id FROM %I WHERE name = $1 LIMIT 1', m.category_tbl);
    EXECUTE v_sql INTO v_cat_id USING r.category_name;
    IF v_cat_id IS NULL THEN
      RAISE NOTICE '  ○ فئة % غير موجودة — تخطّي', r.category_name;
      CONTINUE;
    END IF;

    v_qid := 'c' || replace(gen_random_uuid()::text, '-', '');
    BEGIN
      v_sql := format(
        'INSERT INTO %I (id, "ownerId", type, status, difficulty, prompt, explanation,
                        "categoryId", "gameTypes", source, "timeLimit", "basePoints",
                        version, "lastEditedAt", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,NOW(),NOW(),NOW())',
        m.question_tbl
      );
      EXECUTE v_sql USING
        v_qid, m.owner_id, 'MULTIPLE_CHOICE', 'PUBLISHED', r.difficulty,
        r.prompt, r.explanation, v_cat_id,
        ARRAY['QUIZ','LADDER','CATEGORY_BOARD','MILLIONAIRE']::text[],
        'curation-2026-08-18', r.time_limit, r.base_points;
    EXCEPTION WHEN OTHERS THEN
      -- snake_case
      v_sql := format(
        'INSERT INTO %I (id, owner_id, type, status, difficulty, prompt, explanation,
                        category_id, game_types, source, time_limit, base_points,
                        version, last_edited_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,NOW(),NOW(),NOW())',
        m.question_tbl
      );
      EXECUTE v_sql USING
        v_qid, m.owner_id, 'MULTIPLE_CHOICE', 'PUBLISHED', r.difficulty,
        r.prompt, r.explanation, v_cat_id,
        ARRAY['QUIZ','LADDER','CATEGORY_BOARD','MILLIONAIRE']::text[],
        'curation-2026-08-18', r.time_limit, r.base_points;
    END;

    v_idx := 0;
    FOR opt IN SELECT * FROM jsonb_array_elements(r.options) LOOP
      EXECUTE format(
        'INSERT INTO %I (id, "questionId", position, text, "isCorrect")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4)',
        m.option_tbl
      ) USING v_qid, v_idx, opt->>'text', (opt->>'isCorrect')::boolean;
      v_idx := v_idx + 1;
    END LOOP;

    v_created := v_created + 1;
    RAISE NOTICE '  ✓ أُضيف [%]: %', r.category_name, left(r.prompt, 50);
  END LOOP;

  RAISE NOTICE '✅ القسم 3 — أسئلة جديدة: تم %', v_created;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 4. التقرير الإحصائي النهائي
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  m RECORD;
BEGIN
  SELECT * INTO m FROM _meta;

  -- 4.1 توزيع الفئات
  EXECUTE format(
    'SELECT string_agg(
       c.name || E''\n   منشور='' || cnt_pub || '' مؤرشف='' || cnt_arc || '' إجمالي='' || cnt_all,
       E''\n'' ORDER BY cnt_pub DESC)
     FROM (
       SELECT c.id, c.name,
              COUNT(q.id) FILTER (WHERE q.status=''PUBLISHED'') AS cnt_pub,
              COUNT(q.id) FILTER (WHERE q.status=''ARCHIVED'')  AS cnt_arc,
              COUNT(q.id) AS cnt_all
       FROM %I c
       LEFT JOIN %I q ON q."categoryId" = c.id
       GROUP BY c.id, c.name
       HAVING COUNT(q.id) > 0
     ) c',
    m.category_tbl, m.question_tbl
  ) INTO m.question_tbl;  -- reuse
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE 'توزيع بنك الأسئلة بعد التطبيق:';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '%', m.question_tbl;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────────────
-- ✅ انتهى. للتقرير الكامل، شغّل diag-question-bank.sql في استعلام منفصل.
-- ────────────────────────────────────────────────────────────────────
