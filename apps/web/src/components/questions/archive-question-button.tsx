'use client';

import { Archive } from 'lucide-react';
import { useState } from 'react';
import { archiveQuestion } from '@/app/questions/actions';
import { AlertDialog, Button } from '@/components/ui';

export function ArchiveQuestionButton({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" variant="destructive" onClick={() => setOpen(true)}>
        <Archive />
        أرشفة
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={setOpen}
        title="أرشفة السؤال"
        description="سيُخفى السؤال من البنك الظاهر. يمكنك إيجاده لاحقًا عبر تصفية المؤرشف."
      >
        <form action={archiveQuestion} className="inline-between">
          <input type="hidden" name="id" value={questionId} />
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button type="submit" size="sm" variant="destructive">
            تأكيد الأرشفة
          </Button>
        </form>
      </AlertDialog>
    </>
  );
}
