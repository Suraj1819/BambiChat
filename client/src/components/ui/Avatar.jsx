import { cn, getInitials } from '@/lib/utils';

const sizeMap = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

/**
 * User avatar with optional online indicator and image fallback to initials.
 */
export function Avatar({
  src,
  name = '',
  size = 'md',
  online,
  className,
  ...props
}) {
  const initials = getInitials(name);

  return (
    <div className={cn('relative inline-flex shrink-0', className)} {...props}>
      <div
        className={cn(
          'flex items-center justify-center overflow-hidden rounded-full bg-bambi-primary-light text-bambi-primary font-semibold',
          sizeMap[size] || sizeMap.md
        )}
      >
        {src ? (
          <img
            src={src}
            alt={name || 'Avatar'}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </div>
      {typeof online === 'boolean' && (
        <span
          className={cn(
            'absolute bottom-0 right-0 block rounded-full border-2 border-bambi-surface',
            online ? 'bg-bambi-success' : 'bg-bambi-text-secondary',
            size === 'xs' || size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'
          )}
          aria-label={online ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}
