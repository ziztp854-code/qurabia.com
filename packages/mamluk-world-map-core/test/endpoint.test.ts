import { expect, it } from 'vitest';
import { createMapViewportHandler, parseViewportRequest } from '../src/viewport-endpoint';
import { WorldMapService } from '../src/service';
import { repository } from './fixtures';

const request = { url: '/api/mamluk/map?worldId=world&west=30&south=29&east=34&north=33' };
const ports = {
  authenticate: async () => ({ playerId: 'p1' }),
  allowRequest: async () => true,
  reportError: () => {},
};

it('delivers only filtered GeoJSON from a server-authenticated viewport endpoint', async () => {
  const output = await createMapViewportHandler(new WorldMapService(repository()), ports)(request);
  expect(output.status).toBe(200);
  expect(output.headers['Cache-Control']).toBe('private, no-store');
  expect(JSON.stringify(output.body)).not.toContain('secret');
});
it('refuses anonymous, rate-limited, forged identity and ambiguous coordinate requests', async () => {
  const service = new WorldMapService(repository());
  expect(
    (await createMapViewportHandler(service, { ...ports, authenticate: async () => null })(request))
      .status,
  ).toBe(401);
  expect(
    (
      await createMapViewportHandler(service, { ...ports, allowRequest: async () => false })(
        request,
      )
    ).status,
  ).toBe(429);
  for (const suffix of ['&playerId=enemy', '&west=31', '&other=secret']) {
    expect(
      (await createMapViewportHandler(service, ports)({ url: request.url + suffix })).status,
    ).toBe(400);
  }
  expect(() => parseViewportRequest('/?worldId=world&west=&south=0&east=1&north=1')).toThrow();
  expect(() => parseViewportRequest('x'.repeat(2049))).toThrow();
});
it('reports private errors server-side and returns generic failures to the caller', async () => {
  const errors: unknown[] = [];
  const service = new WorldMapService(
    {
      withSnapshot: async () => {
        throw new Error('internal-secret-id');
      },
    },
    {},
    (error) => errors.push(error),
  );
  const output = await createMapViewportHandler(service, {
    ...ports,
    reportError: (error) => errors.push(error),
  })(request);
  expect(output.status).toBe(503);
  expect(JSON.stringify(output.body)).not.toContain('internal-secret-id');
  expect(String(errors[0])).toContain('internal-secret-id');
});

it('keeps errors generic when a diagnostic callback itself fails', async () => {
  const broken = {
    withSnapshot: async () => {
      throw new Error('repository-secret');
    },
  };
  const callback = () => {
    throw new Error('logger-secret');
  };
  const service = new WorldMapService(broken, {}, callback);
  await expect(
    service.getViewport(
      { worldId: 'world', bounds: { west: 30, south: 29, east: 34, north: 33 } },
      { playerId: 'p1' },
    ),
  ).rejects.toThrow('Map viewport unavailable');
  const response = await createMapViewportHandler(service, { ...ports, reportError: callback })(
    request,
  );
  expect(response).toMatchObject({ status: 503, body: { error: 'Map viewport unavailable' } });
});
