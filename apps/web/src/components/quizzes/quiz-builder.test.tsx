import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizBuilder } from './quiz-builder';
import { createQuiz } from '@/app/quizzes/actions';
import { createEmptyQuizDraft, QUIZ_DRAFT_STORAGE_KEY } from '@/lib/quizzes/quiz-draft';

vi.mock('@/app/quizzes/actions', () => ({
  createQuiz: vi.fn(),
  listQuizBuilderQuestions: vi.fn(),
  pickOpenClawQuizBuilderQuestions: vi.fn(),
  pickRandomQuizBuilderQuestions: vi.fn(),
}));

vi.mock('@/app/questions/actions', () => ({
  createQuestion: vi.fn().mockResolvedValue({ status: 'success', message: 'تم الحفظ.' }),
}));

describe('QuizBuilder', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('continues through the stages when local storage cannot be read', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    const user = userEvent.setup();
    render(<QuizBuilder />);
    await screen.findByText('تعذّر استرجاع المسودة المحلية. يمكنك متابعة إنشاء المسابقة.');
    await user.click(screen.getByRole('button', { name: 'التالي: اختيار الأسئلة' }));
    expect(screen.getByRole('heading', { name: 'اختيار الأسئلة' })).toBeInTheDocument();
  });

  it('shows invalid question settings in preview and prevents publishing them', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      QUIZ_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...createEmptyQuizDraft(),
        title: 'مسابقة الاختبار',
        roundName: 'الجولة الأولى',
        questions: [
          { id: 'q1', prompt: 'سؤال المعاينة', category: 'علوم', duration: 20, points: 1000 },
        ],
      }),
    );
    render(<QuizBuilder />);
    await screen.findByText('استُعيدت المسودة المحلية المحفوظة.');
    for (const name of ['اختيار الأسئلة', 'الإعدادات', 'المعاينة']) {
      await user.click(screen.getByRole('button', { name: `التالي: ${name}` }));
    }
    expect(screen.getByText('الجولة الأولى')).toBeInTheDocument();
    const duration = screen.getByLabelText('الوقت (ثوانٍ)');
    await user.clear(duration);
    await user.type(duration, '301');
    expect(duration).toHaveValue(301);
    expect(duration).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('وقت السؤال يجب أن يكون بين 5 و300 ثانية.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'التالي: النشر' }));
    expect(screen.getByRole('button', { name: 'نشر المسابقة' })).toBeDisabled();
    expect(createQuiz).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'مراجعة الأخطاء' }));
    expect(screen.getByRole('heading', { name: 'اختيار الأسئلة' })).toBeInTheDocument();
    expect(document.activeElement).toHaveAttribute('data-stage', '2');
  });

  it('does not apply out-of-range bulk question settings', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      QUIZ_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...createEmptyQuizDraft(),
        title: 'مسابقة الاختبار',
        questions: [
          { id: 'q1', prompt: 'سؤال الاختبار', category: '', duration: 20, points: 1000 },
        ],
      }),
    );
    render(<QuizBuilder />);
    await screen.findByText('استُعيدت المسودة المحلية المحفوظة.');
    for (const name of ['اختيار الأسئلة', 'الإعدادات']) {
      await user.click(screen.getByRole('button', { name: `التالي: ${name}` }));
    }
    const playerLimit = screen.getByLabelText('حد اللاعبين');
    await user.clear(playerLimit);
    await user.type(playerLimit, '75');
    expect(playerLimit).toHaveValue(75);
    const duration = screen.getByLabelText('وقت موحد للأسئلة');
    await user.clear(duration);
    await user.type(duration, '999');
    expect(duration).toHaveValue(999);
    expect(screen.getAllByRole('button', { name: 'تطبيق على كل الأسئلة' })[0]).toBeDisabled();
    expect(screen.getByText('أدخل عددًا صحيحًا بين 5 و300 ثانية.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'التالي: المعاينة' }));
    expect(screen.getByLabelText('الوقت (ثوانٍ)')).toHaveValue(20);
  });

  it('shows a successful publish without errors for the cleared draft and starts a new quiz', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      QUIZ_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...createEmptyQuizDraft(),
        title: 'مسابقة الاختبار',
        questions: [
          { id: 'q1', prompt: 'سؤال الاختبار', category: '', duration: 20, points: 1000 },
        ],
      }),
    );
    vi.mocked(createQuiz).mockResolvedValue({
      status: 'success',
      quizId: 'quiz-1',
      roomCode: '123456',
    });
    render(<QuizBuilder />);
    await screen.findByText('استُعيدت المسودة المحلية المحفوظة.');
    for (const name of ['اختيار الأسئلة', 'الإعدادات', 'المعاينة', 'النشر']) {
      await user.click(screen.getByRole('button', { name: `التالي: ${name}` }));
    }
    expect(screen.getAllByRole('button', { name: 'حفظ المسودة محليًا' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'نشر المسابقة' }));
    await screen.findByRole('heading', { name: 'نُشرت المسابقة بنجاح' });
    expect(screen.queryByText(/سبب تعطيل النشر/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'شغّل بهذه الحزمة' })).toBeInTheDocument();
    expect(createQuiz).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'إنشاء مسابقة جديدة' }));
    expect(screen.getByLabelText('عنوان المسابقة')).toHaveValue('');
  });

  it('keeps the draft and returns to the rejected questions so only those can be removed', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      QUIZ_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...createEmptyQuizDraft(),
        title: 'مسابقة محفوظة',
        questions: [
          { id: 'valid', prompt: 'سؤال صالح', category: '', duration: 20, points: 1000 },
          { id: 'missing', prompt: 'سؤال قديم', category: '', duration: 20, points: 1000 },
        ],
      }),
    );
    vi.mocked(createQuiz).mockResolvedValue({
      status: 'error',
      message: 'راجع الأسئلة',
      unavailableQuestionIds: ['missing'],
    });
    render(<QuizBuilder />);
    await screen.findByText('استُعيدت المسودة المحلية المحفوظة.');
    for (const name of ['اختيار الأسئلة', 'الإعدادات', 'المعاينة', 'النشر']) {
      await user.click(screen.getByRole('button', { name: `التالي: ${name}` }));
    }
    await user.click(screen.getByRole('button', { name: 'نشر المسابقة' }));
    await screen.findByRole('heading', { name: 'اختيار الأسئلة' });
    expect(screen.getByText(/سؤال قديم/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'إزالة الأسئلة غير المتاحة' }));
    expect(screen.queryByText(/سؤال قديم/)).not.toBeInTheDocument();
    expect(screen.getByText(/سؤال صالح/)).toBeInTheDocument();
  });

  it('يحفظ المسودة الحالية على الجهاز', async () => {
    const user = userEvent.setup();
    render(<QuizBuilder />);

    const title = screen.getByLabelText('عنوان المسابقة');
    await user.clear(title);
    await user.type(title, 'مسابقة محفوظة');
    await user.click(screen.getByRole('button', { name: 'حفظ المسودة محليًا' }));

    expect(JSON.parse(localStorage.getItem('tahaddi:quiz-builder:draft:v1') ?? '{}')).toMatchObject(
      {
        version: 5,
        title: 'مسابقة محفوظة',
        gameMode: 'QUIZ',
        autoLockAnswers: true,
        autoAdvance: false,
        speedScoring: true,
      },
    );
    expect(screen.getByRole('status')).toHaveTextContent('حُفظت المسودة محليًا على هذا الجهاز.');
  });

  it('لا يضيف نص السؤال نفسه مرتين من سجلين مختلفين', async () => {
    const user = userEvent.setup();
    render(
      <QuizBuilder
        availableQuestions={[
          {
            id: 'first',
            prompt: 'ما عاصمة السعودية؟',
            category: 'جغرافيا',
            duration: 20,
            points: 1000,
          },
          {
            id: 'duplicate',
            prompt: 'مَا عَاصِمَةُ السُّعُودِيَّة ؟',
            category: 'عام',
            duration: 20,
            points: 1000,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'التالي: اختيار الأسئلة' }));
    await user.click(screen.getAllByRole('button', { name: 'إضافة' })[0]!);
    await user.click(screen.getByRole('button', { name: 'إضافة' }));

    expect(screen.getByText(/الأسئلة المُجلَبة مضافة مسبقًا/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /إزالة السؤال/ })).toHaveLength(1);
  });

  it('يبحث في الأسئلة المتاحة بالعنوان أو الفئة', async () => {
    const user = userEvent.setup();
    render(
      <QuizBuilder
        availableQuestions={[
          {
            id: 'history-1',
            prompt: 'من هو أول الخلفاء الراشدين؟',
            category: 'تاريخ إسلامي',
            duration: 25,
            points: 1200,
          },
          {
            id: 'science-1',
            prompt: 'ما العنصر الكيميائي الذي رمزه O؟',
            category: 'علوم',
            duration: 20,
            points: 1100,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'التالي: اختيار الأسئلة' }));
    await user.type(screen.getByRole('searchbox', { name: 'ابحث في بنك الأسئلة' }), 'علوم');

    await waitFor(() =>
      expect(screen.queryByText('من هو أول الخلفاء الراشدين؟')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('ما العنصر الكيميائي الذي رمزه O؟')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '1 سؤالًا مطابقًا' })).toHaveTextContent(
      '1 سؤالًا مطابقًا',
    );
  });

  it('يرتب الأسئلة تصاعدياً حسب الصعوبة والنقاط', async () => {
    const user = userEvent.setup();
    render(
      <QuizBuilder
        availableQuestions={[
          {
            id: 'q-hard',
            prompt: 'سؤال صعب جداً',
            category: 'علوم',
            duration: 30,
            points: 1500,
          },
          {
            id: 'q-easy',
            prompt: 'سؤال سهل ومباشر',
            category: 'جغرافيا',
            duration: 15,
            points: 500,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'التالي: اختيار الأسئلة' }));
    const addButtons = screen.getAllByRole('button', { name: 'إضافة' });
    await user.click(addButtons[0]);
    await user.click(addButtons[1]);

    const sortButton = screen.getByRole('button', { name: /ترتيب تدرج الصعوبة/ });
    await user.click(sortButton);

    expect(
      screen.getByText('تم ترتيب الأسئلة تصاعديًا من الأسهل إلى الأصعب لتدرج حماسي.'),
    ).toBeInTheDocument();
  });

  it('يفلتر البنك حسب وضع اللعب المختار', async () => {
    const user = userEvent.setup();
    render(
      <QuizBuilder
        availableQuestions={[
          {
            id: 'quiz-only',
            prompt: 'سؤال مسابقة فقط',
            category: 'علوم',
            duration: 20,
            points: 1000,
            gameTypes: ['QUIZ'],
          },
          {
            id: 'ladder-q',
            prompt: 'سؤال سلم فقط',
            category: 'علوم',
            duration: 20,
            points: 1000,
            gameTypes: ['LADDER'],
          },
          {
            id: 'letters-q',
            prompt: 'سؤال تحدي حروف',
            category: 'أدب',
            duration: 25,
            points: 900,
            gameTypes: ['LETTER_CHALLENGE'],
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'التالي: اختيار الأسئلة' }));
    expect(screen.getByText('سؤال مسابقة فقط')).toBeInTheDocument();
    expect(screen.queryByText('سؤال سلم فقط')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'الخطوة السابقة' }));
    const ladderMode = screen.getByRole('radio', { name: 'السلم' });
    expect(ladderMode).toHaveAttribute('type', 'radio');
    expect(ladderMode).toHaveAccessibleDescription('تقدّم على السلم بإجاباتك الصحيحة.');
    await user.click(ladderMode);
    expect(ladderMode).toBeChecked();
    expect(screen.getByRole('radio', { name: 'المسابقات' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'التالي: اختيار الأسئلة' }));
    expect(screen.getByText('سؤال سلم فقط')).toBeInTheDocument();
    expect(screen.queryByText('سؤال مسابقة فقط')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'الخطوة السابقة' }));
    await user.click(screen.getByRole('radio', { name: 'تحدي الحروف' }));
    await user.click(screen.getByRole('button', { name: 'التالي: اختيار الأسئلة' }));
    expect(screen.getByText('سؤال تحدي حروف')).toBeInTheDocument();
    expect(screen.queryByText('سؤال سلم فقط')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'بنك الأسئلة' })).toBeInTheDocument();
  });

  it('ينقل المستخدم عبر خطوات البيانات والأسئلة والإعدادات والمعاينة والنشر', async () => {
    const user = userEvent.setup();
    render(<QuizBuilder />);

    expect(screen.getByRole('heading', { name: 'البيانات الأساسية' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByLabelText('المرحلة الحالية: البيانات')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'التالي: اختيار الأسئلة' }));
    expect(screen.getByRole('heading', { name: 'اختيار الأسئلة' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'التالي: الإعدادات' }));
    expect(screen.getByRole('heading', { name: 'إعدادات الجولة' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'التالي: المعاينة' }));
    expect(screen.getByRole('heading', { name: 'معاينة المسابقة' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'التالي: النشر' }));
    expect(screen.getByRole('heading', { name: 'نشر المسابقة' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByLabelText('المرحلة الحالية: النشر')).toBeInTheDocument();
  });

  it('يؤجل البحث ثم يطلب صفحة مصفحة من الخادم', async () => {
    const user = userEvent.setup();
    const loadQuestionPage = vi.fn().mockResolvedValue({
      status: 'success',
      questions: [],
      categories: [],
      page: 1,
      pageCount: 1,
      total: 0,
    });
    render(
      <QuizBuilder
        initialBank={{
          status: 'success',
          questions: [],
          categories: [],
          page: 1,
          pageCount: 1,
          total: 0,
        }}
        loadQuestionPage={loadQuestionPage}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'التالي: اختيار الأسئلة' }));
    await user.type(screen.getByRole('searchbox', { name: 'ابحث في بنك الأسئلة' }), 'علوم');

    await waitFor(() =>
      expect(loadQuestionPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: 'علوم', page: 1 }),
      ),
    );
  });

  it('يفتح محرر السؤال السريع داخل منشئ المسابقة دون مغادرة الصفحة', async () => {
    const user = userEvent.setup();
    render(<QuizBuilder canAddQuestions />);

    await user.click(screen.getByRole('button', { name: 'التالي: اختيار الأسئلة' }));
    await user.click(screen.getByText('إضافة سؤال جديد'));

    expect(screen.getByLabelText('نص السؤال')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'إضافة سؤال سريع' })).not.toBeInTheDocument();
  });
});
