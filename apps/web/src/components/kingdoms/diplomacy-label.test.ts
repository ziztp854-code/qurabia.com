import { describe, expect, it } from 'vitest';
import { diplomacyLabel } from './diplomacy-label';

describe('diplomacy state labels', () => {
  it('never labels an absent or unilateral relationship as confirmed peace', () => {
    expect(diplomacyLabel(undefined, undefined)).toBe('حياد بلا عهد');
    expect(diplomacyLabel('peace', undefined)).toContain('بانتظار');
    expect(diplomacyLabel(undefined, 'ally')).toContain('واردة');
    expect(diplomacyLabel('ally', 'peace')).toContain('بانتظار');
  });
  it('requires reciprocity and gives unilateral war precedence', () => {
    expect(diplomacyLabel('peace', 'peace')).toBe('سلام مؤكد');
    expect(diplomacyLabel('ally', 'ally')).toBe('حلف مؤكد');
    expect(diplomacyLabel('ally', 'war')).toBe('حرب');
  });
});
