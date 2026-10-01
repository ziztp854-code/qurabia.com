export function parseCoordinate(draft: string): number | null {
  const normalized = draft
    .trim()
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code - (code <= 0x0669 ? 0x0660 : 0x06f0));
    })
    .replace(/[٫,]/g, '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
