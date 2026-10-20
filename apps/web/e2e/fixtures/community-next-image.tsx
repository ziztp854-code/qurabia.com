/* eslint-disable @next/next/no-img-element -- Local fixture adapter intentionally renders native images. */
// Production uses next/image; this adapter keeps its presentation in Vite fixtures.
import type { ImgHTMLAttributes } from 'react';
type Props = ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  quality?: number;
  loader?: unknown;
};
export default function FixtureImage(props: Props) {
  const fill = props.fill;
  const attributes = { ...props };
  delete attributes.fill;
  delete attributes.priority;
  delete attributes.unoptimized;
  delete attributes.quality;
  delete attributes.loader;
  return (
    <img
      {...attributes}
      alt={props.alt ?? ''}
      style={
        fill
          ? {
              position: 'absolute',
              inset: 0,
              inlineSize: '100%',
              blockSize: '100%',
              objectFit: 'cover',
              ...props.style,
            }
          : props.style
      }
    />
  );
}
