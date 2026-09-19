import { ShieldX } from 'lucide-react';
import { ButtonLink, Card } from '@/components/ui';

export default function ForbiddenPage() {
  return (
    <main className="auth-page">
      <Card className="auth-card">
        <ShieldX aria-hidden="true" />
        <h1>لا تملك هذه الصلاحية</h1>
        <p>الحساب مسجّل، لكن دوره الحالي لا يسمح بفتح هذا القسم.</p>
        <ButtonLink href="/dashboard">العودة إلى لوحة التحكم</ButtonLink>
      </Card>
    </main>
  );
}
