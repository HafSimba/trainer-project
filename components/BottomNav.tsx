'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, NotebookText, UserRound } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: House },
  { href: '/diary', label: 'Diario', icon: NotebookText },
  { href: '/profile', label: 'Profilo', icon: UserRound },
];

function isRouteActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="shrink-0 border-t border-border/80 bg-card/96 pb-[max(0.3rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_25px_-18px_rgba(15,40,28,0.55)]">
      <ul className="grid grid-cols-3 px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = isRouteActive(pathname, href);

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                    isActive ? 'bg-primary/15 text-primary' : 'bg-surface-soft/80 text-muted-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-semibold tracking-wide">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
