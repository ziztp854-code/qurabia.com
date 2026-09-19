import { NextResponse } from 'next/server';

/**
 * Question-bank AI drafting was permanently retired.
 * Keep the route as an explicit 410 so old clients fail closed.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message: 'تم إيقاف توليد الأسئلة بالذكاء الاصطناعي من بنك الأسئلة نهائيًا.',
    },
    { status: 410 },
  );
}
