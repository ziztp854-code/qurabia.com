export function roomCodeAccessibilityLabel(code: string) {
  const normalized = code.trim().toUpperCase();
  return normalized ? `رمز الغرفة، ${Array.from(normalized).join('، ')}` : 'رمز الغرفة';
}
