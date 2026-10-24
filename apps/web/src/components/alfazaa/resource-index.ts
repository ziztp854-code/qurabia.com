export interface ResourceImage {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  category: string;
  aliases?: string[];
}
export function filterResources(
  items: readonly ResourceImage[],
  query: string,
  category: string,
  requestedPage: number,
  pageSize = 60,
) {
  const term = query.trim().toLocaleLowerCase();
  const matches = items.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      (!term ||
        [item.name, ...(item.aliases || [])].some((name) =>
          name.toLocaleLowerCase().includes(term),
        )),
  );
  const size = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 60;
  const pages = Math.max(1, Math.ceil(matches.length / size));
  const page = Math.max(
    1,
    Math.min(pages, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1),
  );
  return {
    items: matches.slice((page - 1) * size, page * size),
    total: matches.length,
    pages,
    page,
  };
}
