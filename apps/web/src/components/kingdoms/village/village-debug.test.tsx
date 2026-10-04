import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import type { VillageDebugOptions } from '@/lib/kingdoms/village/types';
import { VillageDebug } from './village-debug';

const now = 1800000000000;
const view = { ...projectWorld(executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now), 'p', now),
  worldId: 'test', worldName: 'اختبار', paused: false, revision: 0 };
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function Harness() {
  const [options, onChange] = useState<VillageDebugOptions>({ building: 'stable' });
  return <VillageDebug view={view} options={options} onChange={onChange} />;
}

describe('village development calibration', () => {
  it('calibrates stable placement and copies its configuration without changing server levels', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const original = JSON.stringify(view.villages[0]);
    render(<Harness />);
    fireEvent.click(screen.getByText('معايرة مشهد القرية — وضع التطوير'));
    expect(screen.getByLabelText('المبنى للمعايرة').querySelectorAll('option')).toHaveLength(30);
    fireEvent.change(screen.getByLabelText('focusX'), { target: { value: '530' } });
    fireEvent.change(screen.getByLabelText('focusScale'), { target: { value: '2.2' } });
    fireEvent.change(screen.getByLabelText('zIndex'), { target: { value: '600' } });
    fireEvent.change(screen.getByLabelText('المستوى المرئي التجريبي'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy Config' }));
    expect(await screen.findByRole('status')).toHaveTextContent('تم نسخ إعدادات المبنى');
    expect(JSON.parse(writeText.mock.calls[0][0])).toMatchObject({
      id: 'stable', x: 1000, y: 472.5, width: 480, height: 144,
      focusX: 530, focusScale: 2.2, zIndex: 600, visualLevel: 5,
    });
    expect(JSON.stringify(view.villages[0])).toBe(original);
  });

  it('does not expose calibration controls in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { container } = render(<Harness />);
    expect(container).toBeEmptyDOMElement();
  });
});
