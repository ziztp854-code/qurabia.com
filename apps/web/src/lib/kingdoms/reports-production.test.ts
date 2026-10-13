import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand, advanceWorld, projectWorld } from './engine';
import { resources } from './config';
import { resourceKeys } from './types';
import { capacity } from './simulation';
const at = 1800000000000;
const founded = () =>
  executeCommand(createWorld(at), 'owner', { type: 'found', name: 'المملكة' }, at);
describe('aggregated authoritative production reports', () => {
  it('records actual credited production after capacity and never a report for each short tick', () => {
    let w = founded();
    const id = Object.keys(w.villages)[0];
    const before = { ...w.villages[id].resources };
    for (let n = 1; n <= 6; n++) w = advanceWorld(w, at + n * 3600000);
    const reports = w.reports.filter((r) => r.event?.key === 'production.summary');
    expect(reports).toHaveLength(1);
    expect(reports[0].at).toBe(at + 6 * 3600000);
    expect(reports[0].event?.resources?.received).toEqual(
      Object.fromEntries(
        resourceKeys.map((k) => [k, Math.max(0, w.villages[id].resources[k] - before[k])]),
      ),
    );
    expect(projectWorld(w, 'enemy', w.updatedAt).reports).toHaveLength(0);
    expect(
      advanceWorld(w, at + 6 * 3600000).reports.filter(
        (r) => r.event?.key === 'production.summary',
      ),
    ).toHaveLength(1);
  });
  it('persists the partial aggregate through JSON reload and resets it on ownership change', () => {
    const partial = advanceWorld(founded(), at + 3 * 3600000);
    const restored = JSON.parse(JSON.stringify(partial));
    const completed = advanceWorld(restored, at + 6 * 3600000);
    expect(completed.reports.filter((r) => r.event?.key === 'production.summary')).toHaveLength(1);
    const changed = advanceWorld(founded(), at + 3 * 3600000);
    const v = Object.values(changed.villages)[0];
    v.ownerId = 'new-owner';
    v.resources = resources();
    const next = advanceWorld(changed, at + 6 * 3600000);
    expect(next.reports.some((r) => r.event?.key === 'production.summary')).toBe(false);
    expect(next.villages[v.id].productionReport?.ownerId).toBe('new-owner');
  });
  it('never emits repeated empty summaries when stores are full', () => {
    const initial = founded();
    const v = Object.values(initial.villages)[0];
    const cap = capacity(initial, v);
    v.resources = resources(cap, cap, cap, cap, cap);
    const w = advanceWorld(initial, at + 6 * 3600000);
    const next = advanceWorld(w, at + 12 * 3600000);
    expect(next.reports.filter((r) => r.event?.key === 'production.summary')).toHaveLength(0);
  });
});
