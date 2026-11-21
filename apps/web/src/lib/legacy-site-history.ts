export const LEGACY_SITE_BACK_ENTRY = '__qurabiaSiteBackEntry';

// Run before Next.js installs its history handlers so it delegates to these wrappers.
// Keep the marker on the current browser entry across Next.js replaceState calls.
export const legacySiteHistoryBootstrap = `(() => {
  if (window.navigation) return;
  const history = window.history;
  const key = ${JSON.stringify(LEGACY_SITE_BACK_ENTRY)};
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);

  function mark(data, hasBack) {
    if (data == null) return hasBack ? { [key]: true } : data;
    if (typeof data !== 'object' || Object.getPrototypeOf(data) !== Object.prototype) return data;
    return { ...data, [key]: hasBack };
  }

  history.pushState = (data, title, url) => push(mark(data, true), title, url);
  history.replaceState = (data, title, url) =>
    replace(mark(data, history.state?.[key] === true), title, url);
})();`;
