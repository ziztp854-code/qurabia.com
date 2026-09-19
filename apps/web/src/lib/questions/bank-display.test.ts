import { describe, expect, it } from 'vitest';
import { fillPercent, parseBankView } from './bank-display';
import { questionsListHref } from './list-href';

describe('parseBankView', () => {
  it('defaults to stage and only accepts list as the compact mode', () => {
    expect(parseBankView(undefined)).toBe('stage');
    expect(parseBankView('stage')).toBe('stage');
    expect(parseBankView('cards')).toBe('stage');
    expect(parseBankView('list')).toBe('list');
  });
});

describe('fillPercent', () => {
  it('returns a clamped percentage for inventory meters', () => {
    expect(fillPercent(25, 100)).toBe(25);
    expect(fillPercent(0, 100)).toBe(0);
    expect(fillPercent(12, 0)).toBe(0);
    expect(fillPercent(150, 100)).toBe(100);
  });
});

describe('questionsListHref', () => {
  it('omits empty values and keeps the compact view in the query', () => {
    expect(questionsListHref({ q: 'نجد', view: undefined })).toBe('/questions?q=%D9%86%D8%AC%D8%AF');
    expect(questionsListHref({ view: 'list', page: '2' })).toBe('/questions?view=list&page=2');
    expect(questionsListHref({})).toBe('/questions');
  });
});
