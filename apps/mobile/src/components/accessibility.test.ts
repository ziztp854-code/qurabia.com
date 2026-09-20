import assert from 'node:assert/strict';
import test from 'node:test';
import { roomCodeAccessibilityLabel } from './accessibility';

test('spells a mixed room code in logical LTR order for screen readers', () => {
  assert.equal(roomCodeAccessibilityLabel(' ab23cd '), 'رمز الغرفة، A، B، 2، 3، C، D');
});

test('keeps an empty room-code field label meaningful', () => {
  assert.equal(roomCodeAccessibilityLabel('  '), 'رمز الغرفة');
});
