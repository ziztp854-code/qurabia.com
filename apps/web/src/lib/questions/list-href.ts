export type QuestionListQuery = Record<string, string | undefined>;

export function questionsListHref(params: QuestionListQuery) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/questions?${query}` : '/questions';
}
