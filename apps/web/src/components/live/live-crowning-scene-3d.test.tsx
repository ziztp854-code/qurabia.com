import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveCrowningScene3D } from './live-crowning-scene-3d';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ frameloop }: { frameloop: string }) => (
    <div data-frameloop={frameloop} data-testid="crowning-canvas" />
  ),
  useFrame: vi.fn(),
}));

describe('LiveCrowningScene3D', () => {
  it('stops continuous rendering when reduced motion is requested', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    render(<LiveCrowningScene3D activeRank={1} />);

    await waitFor(() => expect(screen.getByTestId('crowning-canvas')).toHaveAttribute('data-frameloop', 'demand'));
  });
});
