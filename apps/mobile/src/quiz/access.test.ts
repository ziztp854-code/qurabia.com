import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldDismissQuiz } from './access';

test('guest quiz remains available without account authentication', () => {
  assert.equal(shouldDismissQuiz({authenticated:false,generation:0},{authenticated:false,generation:0}),false);
  assert.equal(shouldDismissQuiz({authenticated:false,generation:0},{authenticated:false,generation:1}),false);
});
test('account logout and generation changes dismiss the account quiz', () => {
  assert.equal(shouldDismissQuiz({authenticated:true,generation:1},{authenticated:false,generation:2}),true);
  assert.equal(shouldDismissQuiz({authenticated:true,generation:1},{authenticated:true,generation:2}),true);
  assert.equal(shouldDismissQuiz({authenticated:true,generation:1},{authenticated:true,generation:1}),false);
});
