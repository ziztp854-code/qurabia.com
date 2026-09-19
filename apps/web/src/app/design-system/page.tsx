'use client';

import { Bell, Check, Command, Info, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { SiteLayout } from '@/components/layout';
import { LiveStatus } from '@/components/quiz';
import { SoundSettings } from '@/components/sound-settings';
import { ThemeToggle } from '@/components/theme-toggle';
import { ChessBoardSpecimen } from '@/components/special-games/chess-board-specimen';
import { ChessPieceSpecimen } from '@/components/special-games/chess-piece-specimen';
import {
  Accordion,
  AchievementCard,
  Alert,
  BottomSheet,
  Button,
  CategoryCard,
  Checkbox,
  CompetitionCard,
  DataTable,
  DatePicker,
  Dialog,
  EmptyState,
  ErrorState,
  GameCard,
  Input,
  LoadingOverlay,
  MultiSelect,
  NumberInput,
  OtpInput,
  PasswordInput,
  PlayerCard,
  Popover,
  RadioGroup,
  RewardCard,
  SearchInput,
  Select,
  Separator,
  Skeleton,
  Slider,
  StatisticCard,
  Stepper,
  SuccessState,
  Switch,
  Tabs,
  Textarea,
  TimePicker,
  Tooltip,
} from '@/components/ui';

const swatches = [
  'background',
  'foreground',
  'card',
  'primary',
  'secondary',
  'accent',
  'success',
  'danger',
  'warning',
  'info',
  'gold',
  'quiz-option-a',
  'quiz-option-b',
  'quiz-option-c',
  'quiz-option-d',
];

export default function DesignSystemPage() {
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [enabled, setEnabled] = useState(true);
  return (
    <SiteLayout>
      <div className="design-page">
        <div className="container">
          <header className="design-header">
            <div>
              <span className="eyebrow">
                <Sparkles />
                مرجع داخلي
              </span>
              <h1>نظام تصميم تحدّي</h1>
              <p>الهوية البصرية والمكوّنات والحالات التي تبني جميع واجهات المنصة.</p>
            </div>
            <ThemeToggle />
          </header>
          <DesignSection
            title="الألوان الدلالية"
            description="تتبدل القيم تلقائيًا مع الوضعين الداكن والفاتح."
          >
            <div className="swatch-grid">
              {swatches.map((name) => (
                <div className="swatch" key={name}>
                  <span style={{ background: `var(--${name})` }} />
                  <code>--{name}</code>
                </div>
              ))}
            </div>
          </DesignSection>
          <DesignSection
            title="رقعة الشطرنج"
            description="مرجع بصري موحّد للرقعة والإطار والقطع على كل المقاسات."
          >
            <ChessBoardSpecimen />
          </DesignSection>
          <DesignSection
            title="مجموعة القطع"
            description="نظام موحّد لجميع القطع بألوانها وأحجامها على خلفيات فاتحة وداكنة."
          >
            <ChessPieceSpecimen />
          </DesignSection>
          <DesignSection title="الخط والنصوص">
            <div className="type-scale">
              <h1>عنوان عرض كبير</h1>
              <h2>عنوان قسم رئيسي</h2>
              <h3>عنوان بطاقة</h3>
              <p>نص عربي واضح ومريح للقراءة، مع دعم English و2026 دون اضطراب الاتجاه.</p>
              <small>نص مساعد للمعلومات الثانوية</small>
            </div>
          </DesignSection>
          <DesignSection title="الأزرار">
            <div className="component-row">
              {(
                [
                  'primary',
                  'secondary',
                  'outline',
                  'ghost',
                  'destructive',
                  'success',
                  'gold',
                  'link',
                ] as const
              ).map((variant) => (
                <Button key={variant} variant={variant}>
                  {variant === 'destructive' && <Trash2 />}
                  {variant}
                </Button>
              ))}
              <Button loading>جارٍ الحفظ</Button>
              <Button disabled>معطّل</Button>
              <Button size="icon" aria-label="الإشعارات">
                <Bell />
              </Button>
              <Button fullWidth>زر بعرض كامل</Button>
            </div>
          </DesignSection>
          <DesignSection title="الحقول">
            <div className="form-grid">
              <Input label="الاسم" placeholder="الاسم الظاهر للاعبين" />
              <Input label="البريد" placeholder="البريد المرتبط بالحساب" />
              <Input label="رمز الغرفة" error="أدخل الرمز الذي أرسله المضيف." />
              <PasswordInput label="كلمة المرور" />
              <SearchInput label="البحث" placeholder="ابحث في الأسئلة" />
              <NumberInput label="عدد الأسئلة" />
              <Select label="الفئة">
                <option>اختر فئة</option>
              </Select>
              <MultiSelect label="الفئات" options={[]} />
              <Textarea label="وصف المسابقة" />
              <DatePicker label="التاريخ" />
              <TimePicker label="الوقت" />
              <Slider label="مدة السؤال" min="0" max="100" />
              <RadioGroup label="الصعوبة" name="difficulty" options={['سهل', 'متوسط', 'صعب']} />
              <div>
                <Checkbox label="إظهار النتائج" />
                <Switch label="السماح للضيوف" checked={enabled} onChange={setEnabled} />
              </div>
              <OtpInput />
            </div>
          </DesignSection>
          <DesignSection title="البطاقات">
            <div className="card-grid four">
              <GameCard title="بطاقة لعبة" description="تُملأ من بيانات اللعبة المحفوظة." />
              <CompetitionCard
                title="بطاقة مسابقة"
                description="تُملأ من المسابقة المنشورة."
                meta="—"
              />
              <CategoryCard title="بطاقة فئة" description="—" icon={<Info />} />
              <PlayerCard title="لاعب متصل" description="تُعرض بيانات الجلسة الحية." meta="—" />
              <AchievementCard title="إنجاز" description="يظهر بعد تحقق شرط حقيقي." />
              <RewardCard title="مكافأة" description="تظهر عند ربطها ببيانات اللاعب." />
              <StatisticCard title="إحصائية" meta="—" description="تظهر بعد توفر بيانات." />
            </div>
          </DesignSection>
          <DesignSection title="النوافذ والعناصر العائمة">
            <div className="component-row">
              <Button onClick={() => setDialog(true)}>فتح Dialog</Button>
              <Button variant="outline" onClick={() => setSheet(true)}>
                فتح Bottom Sheet
              </Button>
              <Popover trigger="Popover">
                <p>معلومة سريعة داخل العنصر العائم.</p>
              </Popover>
              <Tooltip label="اختصار لوحة المفاتيح">
                <Button variant="ghost" size="icon" aria-label="الأوامر">
                  <Command />
                </Button>
              </Tooltip>
            </div>
            <Dialog
              open={dialog}
              onOpenChange={setDialog}
              title="إنشاء مسابقة"
              description="أدخل بيانات المسابقة الحقيقية قبل حفظها."
            >
              <Input label="اسم المسابقة" />
              <Button fullWidth onClick={() => setDialog(false)}>
                حفظ
              </Button>
            </Dialog>
            <BottomSheet open={sheet} onOpenChange={setSheet} title="خيارات الجوال">
              <p>يتحول هذا العنصر إلى لوحة سفلية ملائمة للمس.</p>
              <Button fullWidth onClick={() => setSheet(false)}>
                تم
              </Button>
            </BottomSheet>
          </DesignSection>
          <DesignSection title="الرسائل والحالات">
            <div className="state-grid">
              <Alert variant="info">
                <Info />
                رسالة معلومات
              </Alert>
              <Alert variant="success">
                <Check />
                تم الحفظ بنجاح
              </Alert>
              <Alert variant="warning">اقترب وقت النهاية</Alert>
              <Alert variant="danger">تعذر الاتصال</Alert>
              <LoadingOverlay />
              <EmptyState title="لا توجد مسابقات" />
              <ErrorState />
              <SuccessState />
            </div>
            <div className="skeleton-stack">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          </DesignSection>
          <DesignSection title="التنقل والبيانات">
            <Tabs tabs={['نظرة عامة', 'اللاعبون', 'الأسئلة']} />
            <Stepper steps={['البيانات', 'الأسئلة', 'المراجعة']} current={0} />
            <DataTable headers={['اللاعب', 'النقاط', 'الحالة']} rows={[]} />
            <EmptyState
              title="لا توجد صفوف حقيقية"
              description="تُملأ هذه المنطقة من بيانات الجلسة عند توفرها."
            />
            <Separator />
            <Accordion
              items={[
                {
                  title: 'كيف أضيف مكوّنًا؟',
                  content: 'ابدأ بالرموز الدلالية، ثم أضف الحالات والوصولية والاختبار.',
                },
              ]}
            />
          </DesignSection>
          <DesignSection title="مكوّنات المسابقات">
            <div className="state-grid">
              <LiveStatus status="offline" />
              <LiveStatus status="waiting" />
              <LiveStatus status="live" />
            </div>
            <EmptyState
              title="لا توجد غرفة نشطة"
              description="تظهر الرموز والنقاط والترتيب من جلسة حقيقية فقط."
            />
          </DesignSection>
          <DesignSection title="الصوت والحركة">
            <SoundSettings />
            <p className="muted">
              جميع الحركات تحترم إعداد تقليل الحركة في النظام، ويمكن تعطيلها على مستوى المكوّن.
            </p>
          </DesignSection>
        </div>
      </div>
    </SiteLayout>
  );
}

function DesignSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="design-section">
      <header>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <div className="design-canvas">{children}</div>
    </section>
  );
}
