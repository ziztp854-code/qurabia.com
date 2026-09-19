import type { Metadata } from 'next';
import { QuestionWordHost } from './question-word-host';

export const metadata: Metadata = {
  title: 'شاشة مضيف كلمة وسؤال | تحدّي',
  description: 'شاشة المضيف وإدارة الأسئلة والتتويج للعبة كلمة وسؤال.',
};

export default function QuestionWordHostPage() {
  return <QuestionWordHost />;
}
