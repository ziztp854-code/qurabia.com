/* Images are user-authored media served by the configured Supabase project. */
/* eslint-disable @next/next/no-img-element */

export function QuestionImage({
  src,
  alt = 'صورة توضيحية للسؤال',
  className = '',
  eager = false,
}: {
  src: string;
  alt?: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}
