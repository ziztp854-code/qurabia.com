type Relation = 'war' | 'peace' | 'ally' | undefined;

export function diplomacyLabel(ours: Relation, theirs: Relation): string {
  if (ours === 'war' || theirs === 'war') return 'حرب';
  if (ours === 'ally' && theirs === 'ally') return 'حلف مؤكد';
  if (ours === 'peace' && theirs === 'peace') return 'سلام مؤكد';
  if (ours === 'ally') return 'اقتراح حلف بانتظار الموافقة';
  if (ours === 'peace') return 'اقتراح سلام بانتظار الموافقة';
  if (theirs === 'ally') return 'دعوة واردة للحلف';
  if (theirs === 'peace') return 'دعوة واردة للسلام';
  return 'حياد بلا عهد';
}
