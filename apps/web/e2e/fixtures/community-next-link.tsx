// Browser fixture adapter. Public voice links use native anchors in production too.
import type { AnchorHTMLAttributes } from 'react';
export default function FixtureLink(
  props: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean },
) {
  const attributes = { ...props };
  delete attributes.prefetch;
  return <a {...attributes} />;
}
