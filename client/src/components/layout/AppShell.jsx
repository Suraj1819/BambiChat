import { cn } from '@/lib/utils';

/**
 * Responsive application shell.
 * Desktop: sidebar + main panel side-by-side.
 * Mobile: one primary view at a time (controlled by showSidebar).
 */
export function AppShell({
  sidebar,
  children,
  showSidebar = true,
  className,
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full overflow-hidden bg-bambi-background',
        className
      )}
    >
      {/* Sidebar */}
      <aside
        className={cn(
          'flex h-full w-full flex-col border-r border-bambi-border bg-bambi-surface',
          'md:w-sidebar md:max-w-sidebar md:shrink-0',
          // Mobile: hide when a conversation is open
          showSidebar ? 'flex' : 'hidden md:flex'
        )}
      >
        {sidebar}
      </aside>

      {/* Main conversation panel */}
      <main
        className={cn(
          'flex h-full min-w-0 flex-1 flex-col bg-bambi-background',
          // Mobile: hide when showing list
          showSidebar ? 'hidden md:flex' : 'flex'
        )}
      >
        {children}
      </main>
    </div>
  );
}
