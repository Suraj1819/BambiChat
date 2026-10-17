import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className
      )}
    >
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bambi-primary-light text-bambi-primary">
          <Icon className="h-7 w-7" strokeWidth={1.5} />
        </div>
      )}
      {title && (
        <h3 className="text-heading-3 text-bambi-text">{title}</h3>
      )}
      {description && (
        <p className="max-w-xs text-body-sm text-bambi-text-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
