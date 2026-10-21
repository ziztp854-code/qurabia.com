/** Public IDs: owner 1, explicitly reserved accounts 2 and 78, otherwise nine digits. */
export const PUBLIC_ACCOUNT_NUMBER_PATTERN = /^(?:[12]|78|[1-9]\d{8})$/;
export const PUBLIC_ACCOUNT_NUMBER_INPUT_PATTERN = '[12]|78|[1-9][0-9]{8}';

/** Retired numbers remain link aliases; the database never allocates them again. */
export function canonicalAccountNumber(value: number): number {
  if (value === 123456800) return 2;
  if (value === 123456821) return 78;
  return value;
}
