export interface MafiaInvestigationRecord {
  id: string;
  round: number;
  targetId: string;
  targetName: string;
  resultIsKiller: boolean;
  createdAt: string;
}

export function getInvestigatedTargetIds(investigations: MafiaInvestigationRecord[]) {
  return [...new Set(investigations.map((investigation) => investigation.targetId))];
}

export function buildInvestigationDiscussionHint(investigation: MafiaInvestigationRecord) {
  return investigation.resultIsKiller
    ? `أقترح أن نراقب ${investigation.targetName} أكثر؛ لدي سبب يجعلني غير مرتاح لتحركاته.`
    : `أرى أن ${investigation.targetName} أقل إثارة للشك لدي الآن، لكن لا نستبعد أي احتمال.`;
}
