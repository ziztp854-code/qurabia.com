import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectionPanel } from './selection-panel';

describe('map selection panel', () => {
  it('scrolls to a new selection without resetting scroll during payload refresh', () => {
    const props = { features: [], onSelect: vi.fn(), onClose: vi.fn() };
    const key = { layer: 'cities' as const, id: 'cairo' };
    const selection = {
      ...key,
      title: 'القاهرة',
      kind: 'مدينة',
      coordinates: '31 / 30',
      details: [],
    };
    const view = render(<SelectionPanel {...props} selection={null} selectedKey={null} />);
    const panel = screen.getByRole('complementary', { name: 'تفاصيل الخريطة' });
    const scroll = vi.fn();
    panel.scrollTo = scroll;
    view.rerender(<SelectionPanel {...props} selection={selection} selectedKey={key} />);
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    view.rerender(<SelectionPanel {...props} selection={null} selectedKey={key} />);
    view.rerender(
      <SelectionPanel {...props} selection={{ ...selection }} selectedKey={{ ...key }} />,
    );
    expect(scroll).toHaveBeenCalledOnce();
  });
  it('expands and collapses the mobile sheet with an accessible control', () => {
    const onClose = vi.fn();
    render(<SelectionPanel selection={null} features={[]} onSelect={() => {}} onClose={onClose} />);
    const panel = screen.getByRole('complementary', { name: 'تفاصيل الخريطة' });
    expect(panel).toHaveAttribute('data-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'افتح تفاصيل الخريطة' }));
    expect(panel).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByRole('button', { name: 'اطوِ تفاصيل الخريطة' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'اطوِ تفاصيل الخريطة' }));
    expect(panel).toHaveAttribute('data-expanded', 'false');
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('shows an accessible empty state and keyboard feature selector', () => {
    const onSelect = vi.fn();
    render(
      <SelectionPanel
        selection={null}
        features={[{ layer: 'cities', id: 'cairo', label: 'القاهرة' }]}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('اختر موقعًا على الخريطة')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'القاهرة' }));
    expect(onSelect).toHaveBeenCalledWith({ layer: 'cities', id: 'cairo' });
  });
  it('renders approved text literally and dismisses through a labeled control', () => {
    const onClose = vi.fn();
    render(
      <SelectionPanel
        selection={{
          layer: 'cities',
          id: 'city',
          title: '<script>مدينة</script>',
          kind: 'مدينة',
          coordinates: '31.2357 / 30.0444',
          details: [{ label: 'التحصين', value: '٤' }],
        }}
        features={[]}
        onSelect={() => {}}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('heading', { name: '<script>مدينة</script>' })).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('31.2357 / 30.0444')).toHaveAttribute('dir', 'ltr');
    fireEvent.click(screen.getByRole('button', { name: 'أغلق تفاصيل الموقع' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
