'use client';

import { AlertTriangle, Lock, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  buildInvestigationDiscussionHint,
  type MafiaInvestigationRecord,
} from '@/lib/mafia/investigation';
import type { MafiaPhaseName } from '@/lib/mafia/guidance';
import { cn } from '@/lib/utils';

export function MafiaInvestigationDossier({
  investigations,
  phase,
  onPrepareClue,
}: {
  investigations: MafiaInvestigationRecord[];
  phase: MafiaPhaseName;
  onPrepareClue?: (hint: string) => void;
}) {
  const latest = investigations[0] ?? null;

  return (
    <section className="mafia-dossier" aria-labelledby="mafia-dossier-title">
      <header className="mafia-dossier-header">
        <div className="mafia-dossier-title-group">
          <span className="mafia-dossier-icon" aria-hidden="true">
            <Search />
          </span>
          <div>
            <h2 id="mafia-dossier-title">ملف التحقيق السري</h2>
            <p>نتائج موثوقة لك وحدك. استخدمها بحذر ولا تكشف دورك.</p>
          </div>
        </div>
        <span className="mafia-dossier-private">
          <Lock aria-hidden="true" />
          يظهر لك وحدك
        </span>
      </header>

      {latest ? (
        <div
          className={cn(
            'mafia-dossier-result',
            latest.resultIsKiller ? 'mafia-dossier-result-danger' : 'mafia-dossier-result-clear',
          )}
          role="status"
          aria-live="polite"
        >
          <span className="mafia-dossier-result-icon" aria-hidden="true">
            {latest.resultIsKiller ? <AlertTriangle /> : <ShieldCheck />}
          </span>
          <div>
            <span className="mafia-dossier-result-round">نتيجة الجولة {latest.round}</span>
            <strong>
              {latest.targetName} {latest.resultIsKiller ? 'هو القاتل' : 'ليس القاتل'}
            </strong>
            <p>
              {latest.resultIsKiller
                ? 'تم تأكيد الاشتباه. خطّط لكلامك كي لا يعرف القاتل هويتك.'
                : 'تم استبعاد هذا اللاعب من دائرة القتل، وقد تبقى له أدوار أخرى.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="mafia-dossier-empty">
          <Search aria-hidden="true" />
          <div>
            <strong>لم تفتح أي ملف بعد</strong>
            <p>في الليل اختر لاعبًا واحدًا، ثم ثبّت قرارك لكشف نتيجته.</p>
          </div>
        </div>
      )}

      {investigations.length > 0 && (
        <div className="mafia-dossier-history">
          <h3>سجل التحقيقات</h3>
          <ol>
            {investigations.map((investigation) => (
              <li key={investigation.id}>
                <span>الجولة {investigation.round}</span>
                <strong>
                  {investigation.targetName}{' '}
                  {investigation.resultIsKiller ? 'هو القاتل' : 'ليس القاتل'}
                </strong>
              </li>
            ))}
          </ol>
        </div>
      )}

      {latest && phase === 'DAY' && onPrepareClue && (
        <div className="mafia-dossier-clue">
          <p>سنجهز كلامًا غير مباشر في صندوق النقاش؛ راجعه قبل الإرسال.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => onPrepareClue(buildInvestigationDiscussionHint(latest))}
          >
            صياغة تلميح للنقاش
          </Button>
        </div>
      )}
    </section>
  );
}
