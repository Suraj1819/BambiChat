
import { useEffect, useState } from 'react';
import { cn, getInitials } from '@/lib/utils';

const sizeMap = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

function normalizeAvatarUrl(src) {
  if (typeof src !== 'string') return '';

  const value = src.trim();

  if (!value || value === 'null' || value === 'undefined') {
    return '';
  }

  // Allow relative paths and data/blob URLs.
  if (
    value.startsWith('/') ||
    value.startsWith('data:image/') ||
    value.startsWith('blob:')
  ) {
    return value;
  }

  try {
    const url = new URL(value);

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return value;
    }

    return '';
  } catch {
    return '';
  }
}

/**
 * User avatar with online indicator and initials fallback.
 * Falls back to initials when the image URL is missing or fails to load.
 */
export function Avatar({
  src,
  name = '',
  size = 'md',
  online,
  className,
  ...props
}) {
  const avatarUrl = normalizeAvatarUrl(src);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const initials = getInitials(name) || '?';
  const showImage = Boolean(avatarUrl) && !imageFailed;

  return (
    <div
      className={cn('relative inline-flex shrink-0', className)}
      {...props}
    >
      <div
        className={cn(
          'flex items-center justify-center overflow-hidden rounded-full bg-bambi-primary-light text-bambi-primary font-semibold',
          sizeMap[size] || sizeMap.md
        )}
      >
        {showImage ? (
          <img
            src={avatarUrl}
            alt={name || 'Avatar'}
            className="block h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span
            aria-label={`${name || 'User'} initials`}
            className="select-none"
          >
            {initials}
          </span>
        )}
      </div>

      {typeof online === 'boolean' && (
        <span
          className={cn(
            'absolute bottom-0 right-0 block rounded-full border-2 border-bambi-surface',
            online ? 'bg-bambi-success' : 'bg-bambi-text-secondary',
            size === 'xs' || size === 'sm'
              ? 'h-2 w-2'
              : 'h-2.5 w-2.5'
          )}
          role="img"
          aria-label={online ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}
