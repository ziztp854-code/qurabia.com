import { expect, it } from 'vitest';
import { canonicalAccountNumber, PUBLIC_ACCOUNT_NUMBER_PATTERN } from './account-number';
it('accepts the reserved IDs and canonical nine-digit public IDs only', () => {
  for (const value of ['1', '2', '78', '123456789', '999999999'])
    expect(PUBLIC_ACCOUNT_NUMBER_PATTERN.test(value)).toBe(true);
  for (const value of ['0', '3', '01', '02', '078', '79', '-2', '1e8', '1000000000', ' 2'])
    expect(PUBLIC_ACCOUNT_NUMBER_PATTERN.test(value)).toBe(false);
});
it('keeps the retired profile number linked to the same account without remapping others', () => {
  expect(canonicalAccountNumber(123456800)).toBe(2);
  expect(canonicalAccountNumber(123456821)).toBe(78);
  for (const value of [1, 2, 78, 123456789, 123456801])
    expect(canonicalAccountNumber(value)).toBe(value);
});
