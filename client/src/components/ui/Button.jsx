import { cn } from '@/lib/utils';

const variants = {
  primary: 'bambi-btn-primary',
  secondary: 'bambi-btn-secondary',
  ghost: 'bambi-btn-ghost',
  danger: 'bambi-btn bg-bambi-error text-white hover:bg-bambi-error/90 px-4 py-2.5 text-label',
  icon: 'bambi-btn-icon',
};

const sizes = {
  sm: 'px-3 py-1.5 text-caption',
  md: '',
  lg: 'px-5 py-3 text-body',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
