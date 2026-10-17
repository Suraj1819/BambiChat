import { cn } from '@/lib/utils';

export function Input({
  className,
  type = 'text',
  error,
  ...props
}) {
  return (
    <input
      type={type}
      className={cn(
        'bambi-input',
        error && 'border-bambi-error focus:border-bambi-error focus:ring-bambi-error/20',
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, error, ...props }) {
  return (
    <textarea
      className={cn(
        'bambi-input min-h-[80px] resize-none',
        error && 'border-bambi-error focus:border-bambi-error focus:ring-bambi-error/20',
        className
      )}
      {...props}
    />
  );
}
