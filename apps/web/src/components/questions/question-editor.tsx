'use client';

import { useActionState, useState } from 'react';
import { Button, Input, NumberInput, Select, Textarea } from '@/components/ui';
import { createQuestion } from '@/app/questions/actions';
import { QuestionImageField } from './question-image-field';
import { QuestionTaxonomyFields } from './question-taxonomy-fields';
import styles from './question-editor.module.css';

const labels = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
const initialQuestionActionState = { status: 'idle' as const, message: '' };

export function QuestionEditor({
  categories = [],
}: {
  categories?: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(createQuestion, initialQuestionActionState);
  const [type, setType] = useState<'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER'>(
    'MULTIPLE_CHOICE',
  );
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctOption, setCorrectOption] = useState(0);
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [categoryId, setCategoryId] = useState('');
  const [explanation, setExplanation] = useState('');

  const changeType = (nextType: typeof type) => {
    setType(nextType);
    setCorrectOption(0);
    setOptions(
      nextType === 'TRUE_FALSE'
        ? ['صح', 'خطأ']
        : nextType === 'SHORT_ANSWER'
          ? []
          : ['', '', '', ''],
    );
  };

  return (
    <div className={`question-editor-shell ${styles.workshop}`}>
      <form action={formAction} className={`form-grid question-editor ${styles.workshop}`}>
        <div className={styles.main}>
          <p className={styles.sectionTitle}>نص السؤال</p>
          <Select
            label="نوع السؤال"
            name="type"
            value={type}
            onChange={(event) => changeType(event.target.value as typeof type)}
          >
            <option value="MULTIPLE_CHOICE">اختيار من متعدد</option>
            <option value="TRUE_FALSE">صح أو خطأ</option>
            <option value="SHORT_ANSWER">إجابة قصيرة</option>
          </Select>
          <Textarea
            label="نص السؤال"
            name="prompt"
            required
            minLength={8}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="اكتب سؤالًا واضحًا ومباشرًا"
          />
          <QuestionImageField />
          {type === 'SHORT_ANSWER' ? (
            <Input
              label="الإجابة بكلمة واحدة"
              name="expectedAnswer"
              required
              maxLength={200}
              autoComplete="off"
              placeholder="مثال: الرياض"
            />
          ) : (
            <fieldset className={`field question-options ${styles.options}`}>
              <legend className="field-label">الخيارات والإجابة الصحيحة</legend>
              {options.map((value, index) => (
                <label className="question-option" key={index}>
                  <input
                    type="radio"
                    name="correctOption"
                    value={index}
                    checked={correctOption === index}
                    onChange={() => setCorrectOption(index)}
                    aria-label={`الإجابة الصحيحة للخيار ${labels[index]}`}
                  />
                  <input
                    name="options"
                    required
                    value={value}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((option, optionIndex) =>
                          optionIndex === index ? event.target.value : option,
                        ),
                      )
                    }
                    readOnly={type === 'TRUE_FALSE'}
                    placeholder={`الخيار ${labels[index]}`}
                  />
                </label>
              ))}
              {type === 'MULTIPLE_CHOICE' && (
                <div className="inline-between">
                  <small>يمكن إضافة من خيارين إلى ستة خيارات.</small>
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={options.length <= 2}
                      onClick={() => {
                        setOptions((current) => current.slice(0, -1));
                        setCorrectOption((current) => Math.min(current, options.length - 2));
                      }}
                    >
                      حذف خيار
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={options.length >= 6}
                      onClick={() => setOptions((current) => [...current, ''])}
                    >
                      إضافة خيار
                    </Button>
                  </div>
                </div>
              )}
            </fieldset>
          )}
        </div>
        <aside className={styles.rail} aria-label="التصنيف والإعدادات">
          <p className={styles.sectionTitle}>التصنيف والإعدادات</p>
          <Select
            label="الصعوبة"
            name="difficulty"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}
          >
            <option value="EASY">سهل</option>
            <option value="MEDIUM">متوسط</option>
            <option value="HARD">صعب</option>
          </Select>
          <QuestionTaxonomyFields
            categories={categories}
            categoryId={categoryId}
            onCategoryChange={setCategoryId}
          />
          <NumberInput
            label="الوقت بالثواني"
            name="timeLimit"
            defaultValue="20"
            min="5"
            max="300"
            required
          />
          <NumberInput
            label="النقاط الأساسية"
            name="basePoints"
            defaultValue="1000"
            min="100"
            max="10000"
            required
          />
        </aside>
        <div className={styles.footer}>
          <p className={styles.sectionTitle}>الشرح والمصدر</p>
          <Textarea
            label="الشرح بعد الإجابة (اختياري)"
            name="explanation"
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            placeholder="يوضح سبب صحة الإجابة"
          />
          <Input label="المصدر (اختياري)" name="source" placeholder="رابط أو مرجع موثوق" />
        </div>
        <div className={styles.saveBar}>
          {state.status !== 'idle' && (
            <p
              className={state.status === 'success' ? 'text-success' : 'text-danger'}
              role="status"
            >
              {state.message}
            </p>
          )}
          <Button type="submit" loading={pending} variant="gold">
            حفظ كمسودة
          </Button>
        </div>
      </form>
    </div>
  );
}
