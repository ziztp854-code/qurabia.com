import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizBuilder } from './quiz-builder';

vi.mock('@/app/questions/actions', () => ({
  createQuestion: vi.fn().mockResolvedValue({ status: 'success', message: 'تم الحفظ.' }),
}));

describe('QuizBuilder', () => {
  beforeEach(() => {
    localStorage.clear();
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
    await user.click(screen.getByRole('button', { name: 'التالي: اختيار الأسئلة' }));
    expect(screen.getByRole('heading', { name: 'اختيار الأسئلة' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'التالي: الإعدادات' }));
    expect(screen.getByRole('heading', { name: 'إعدادات الجولة' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'التالي: المعاينة' }));
    expect(screen.getByRole('heading', { name: 'معاينة المسابقة' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'التالي: النشر' }));
    expect(screen.getByRole('heading', { name: 'نشر المسابقة' })).toBeInTheDocument();
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
