/** Letter hints belong to letter games; keep the shared bank text unchanged. */
export function formatLadderQuestion(text: string): string {
  return text.replace(
    /([؟?!.])\s*(?:و\s*)?تبدأ\s+(?:(?:الإجابة|الاجابة|الإجابه|الاجابه)\s+)?ب(?:حرف|الحرف)\s*[(:«"']?\s*[\u0621-\u064a\u0671-\u06d3\u0640]{1,4}\s*[)»"']?\s*[.!؟?]*\s*$/u,
    '$1',
  ).trimEnd();
}
