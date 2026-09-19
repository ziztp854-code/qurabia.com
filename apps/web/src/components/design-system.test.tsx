import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnswerOption, LeaderboardItem, QuizTimer, RoomCode } from '@/components/quiz';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button, ButtonLink, Dialog, Input, Select, Textarea } from '@/components/ui';

describe('Button', () => {
  it('يعرض التحميل والتعطيل وينفذ الحدث', async () => {
    const click = vi.fn();
    const { rerender } = render(<Button onClick={click}>ابدأ</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'ابدأ' }));
    expect(click).toHaveBeenCalledOnce();
    rerender(<Button loading>حفظ</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
  it('يعرض رابط الإجراء بنفس نمط الزر', () => {
    render(<ButtonLink href="/quizzes">أنشئ مسابقة</ButtonLink>);
    expect(screen.getByRole('link', { name: 'أنشئ مسابقة' })).toHaveAttribute('href', '/quizzes');
  });
});
describe('Input', () => {
  it('يربط الوصف والخطأ بالحقل', () => {
    render(<Input label="الاسم" error="الاسم مطلوب" />);
    const input = screen.getByLabelText('الاسم');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('الاسم مطلوب');
  });
  it('يربط وصف حقول النص والاختيار برمجيًا', () => {
    render(
      <>
        <Textarea label="الوصف" description="وصف مختصر" />
        <Select label="النوع" error="اختر النوع">
          <option>اختيار متعدد</option>
        </Select>
      </>,
    );
    expect(screen.getByLabelText('الوصف')).toHaveAccessibleDescription('وصف مختصر');
    expect(screen.getByLabelText('النوع')).toHaveAccessibleDescription('اختر النوع');
    expect(screen.getByLabelText('النوع')).toHaveAttribute('aria-invalid', 'true');
  });
});
describe('Dialog', () => {
  it('يغلق عبر Escape ويعلن نفسه كنافذة', () => {
    const close = vi.fn();
    render(
      <Dialog open onOpenChange={close} title="نافذة الاختبار">
        <Button>إجراء</Button>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledWith(false);
  });
});
describe('QuizTimer', () => {
  it('يعرض الوقت والنسبة دون حساب زمني داخلي', () => {
    render(<QuizTimer total={20} remaining={4} mode="horizontal" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByText('4s')).toBeInTheDocument();
  });
});
describe('AnswerOption', () => {
  it('يدعم الاختيار بلوحة المفاتيح والحالات', () => {
    const select = vi.fn();
    render(<AnswerOption label="B" text="الجزائر" state="selected" onSelect={select} />);
    const button = screen.getByRole('button', { name: /B: الجزائر/ });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(select).toHaveBeenCalledOnce();
  });
});
describe('LeaderboardItem', () => {
  it('يعرض الرتبة والنقاط وحالة الاتصال', () => {
    render(
      <LeaderboardItem
        rank={1}
        initials="س ع"
        name="سارة"
        score={9840}
        change={2}
        streak={8}
        online
      />,
    );
    expect(screen.getByText('سارة')).toBeInTheDocument();
    expect(screen.getByText('متصل')).toBeInTheDocument();
    expect(screen.getByText(/9,840/)).toBeInTheDocument();
  });
});
describe('RoomCode', () => {
  it('يعرض رمز QR يحمل رابط الانضمام الكامل', async () => {
    render(<RoomCode code="582914" url="/join/582914" />);
    const qrCode = await screen.findByRole('img', {
      name: 'رمز QR للانضمام إلى الغرفة 582914',
    });
    expect(qrCode).toContainElement(screen.getByTitle('امسح الرمز للانضمام إلى الغرفة 582914'));
    expect(screen.getByText('http://localhost:3000/join/582914')).toBeInTheDocument();
  });
  it('ينسخ رمز الغرفة ويؤكد العملية', async () => {
    render(<RoomCode code="582914" />);
    await userEvent.click(screen.getByRole('button', { name: 'نسخ الرمز' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('582914');
    expect(await screen.findByText('تم النسخ')).toBeInTheDocument();
  });
  it('ينسخ رابط الدعوة الكامل', async () => {
    render(<RoomCode code="582914" url="/join/582914" />);
    await userEvent.click(screen.getByRole('button', { name: 'نسخ الدعوة' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:3000/join/582914');
    expect(await screen.findByText('نُسخ الرابط')).toBeInTheDocument();
  });
});
describe('ThemeToggle', () => {
  it('يبدل الوضع ويحفظ الاختيار', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const trigger = screen.getByRole('button', { name: /المظهر الحالي/ });
    expect(trigger.closest('.theme-menu')).toBeInTheDocument();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: 'فاتح' }));
    expect(localStorage.getItem('tahaddi-theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
