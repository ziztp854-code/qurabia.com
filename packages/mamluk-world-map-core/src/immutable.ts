/** Recursively freeze a newly constructed DTO; never call this on caller-owned records. */
export function freezeDto<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) freezeDto(nested);
    Object.freeze(value);
  }
  return value;
}
