
import { cn } from '@/lib/utils';

export function AppShell({
  sidebar,
  children,
  showSidebar = true,
  className,
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full overflow-hidden',
        'bg-bambi-background',
        className
      )}
    >
      <aside
        className={cn(
          'min-h-0 shrink-0 flex-col overflow-hidden',
          'border-r border-bambi-border bg-bambi-surface',
          'w-full md:!flex md:w-[320px] lg:w-[360px] xl:w-[400px]',
          showSidebar ? 'flex' : 'hidden'
        )}
      >
        {sidebar}
      </aside>

      <main
        className={cn(
          'min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          'bg-bambi-background',
          showSidebar ? 'hidden md:flex' : 'flex'
        )}
      >
        {children}
      </main>
    </div>
  );
}
