import { cn } from '@/lib/utils';

/**
 * DigitalVetri.AI wordmark.
 *
 * The PNG at /public/logo.png is the wordmark trimmed to its bounding box
 * (~3.4:1 aspect), so it can be sized by width without worrying about
 * surrounding whitespace.
 *
 * `size="sm"` is for the mobile top bar; `"md"` is for the desktop sidebar
 * and mobile drawer.
 */
export function Logo({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <img
      src="/logo.png"
      alt="DigitalVetri.AI"
      className={cn(
        'block h-auto',
        size === 'sm' ? 'w-28' : 'w-full max-w-[200px]',
        className,
      )}
    />
  );
}
