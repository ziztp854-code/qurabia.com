import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand } from './engine';
import { resources } from './config';
import { publicReport } from './report-events';
import { advanceCaravan, capacity } from './simulation';
describe('economic reports reflect authoritative credits', () => {
  it('records actual trade credits after storage limits without changing trade rules', () => {
    const at = 1800000000000;
    let w = executeCommand(createWorld(at), 'seller', { type: 'found', name: 'البائع' }, at);
    w = executeCommand(w, 'buyer', { type: 'found', name: 'المشتري' }, at);
    const seller = Object.values(w.villages).find((v) => v.ownerId === 'seller')!;
    const buyer = Object.values(w.villages).find((v) => v.ownerId === 'buyer')!;
    seller.buildings.market = buyer.buildings.market = 1;
    seller.resources = resources(1000, capacity(w, seller) - 5, 0, 0, 0);
    buyer.resources = resources(capacity(w, buyer) - 10, 1000, 0, 0, 0);
    w = executeCommand(
      w,
      'seller',
      { type: 'tradeOffer', villageId: seller.id, give: resources(100), want: resources(0, 50) },
      at,
    );
    w = executeCommand(
      w,
      'buyer',
      { type: 'tradeAccept', villageId: buyer.id, offerId: w.offers[0].id },
      at,
    );
    const report = w.reports.find((r) => r.event?.key === 'trade.completed')!;
    expect(publicReport(report, 'buyer')?.event?.resources).toEqual({
      sent: resources(0, 50),
      received: resources(10),
    });
    expect(publicReport(report, 'seller')?.event?.resources).toEqual({
      sent: resources(100),
      received: resources(0, 5),
    });
    expect(w.villages[buyer.id].resources.wood).toBe(capacity(w, w.villages[buyer.id]));
    expect(w.villages[seller.id].resources.stone).toBe(capacity(w, w.villages[seller.id]));
  });
  it('records one caravan receipt with only the actual resources delivered', () => {
    const at = 1800000000000;
    const w = executeCommand(createWorld(at), 'owner', { type: 'found', name: 'المملكة' }, at);
    const v = Object.values(w.villages)[0];
    v.resources.wood = capacity(w, v) - 7;
    w.caravans = [
      {
        id: 'cv1',
        ownerId: 'owner',
        originVillageId: v.id,
        targetVillageId: v.id,
        resources: resources(100),
        departsAt: at,
        arrivesAt: at + 1000,
        status: 'traveling',
        route: [{ x: v.x, y: v.y }],
        exposed: false,
      },
    ];
    advanceCaravan(w, at + 2000);
    advanceCaravan(w, at + 3000);
    const reports = w.reports.filter((r) => r.event?.key === 'caravan.arrived');
    expect(reports).toHaveLength(1);
    expect(reports[0].at).toBe(at + 1000);
    expect(reports[0].event?.resources?.received).toEqual(resources(7));
    expect(w.caravans[0].resources).toEqual(resources());
  });
});
