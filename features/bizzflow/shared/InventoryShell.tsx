'use client';

import {
  BarChart3,
  Home,
  Menu,
  Package,
  Plus,
  Settings,
  ShoppingCart,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { signOutAction } from '@/app/actions';

const navigation = [
  { label: 'Overview', href: '/dashboard', icon: Home },
  { label: 'Products', href: '/products', icon: Package },
  { label: 'New sale', href: '/sales/new', icon: Plus },
  { label: 'Sales history', href: '/sales', icon: ShoppingCart },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  { label: 'Settings', href: '/settings', icon: Settings },
];

function isCurrentPage(pathname: string, href: string) {
  if (href === '/sales') {
    return pathname === href
      || (/^\/sales\/[^/]+(?:\/edit)?$/.test(pathname) && pathname !== '/sales/new');
  }
  return href === '/dashboard'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function InventoryShell({
  children,
  activeBusinessName,
  userEmail,
  canManageUsers,
}: Readonly<{
  children: React.ReactNode;
  activeBusinessName: string;
  userEmail: string;
  canManageUsers: boolean;
}>) {
  const pathname = usePathname();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const currentPage = navigation.find(({ href }) => isCurrentPage(pathname, href))
    ?? (pathname === '/setup'
      ? { label: 'Workspace setup', href: '/setup', icon: Settings }
      : undefined);
  const CurrentIcon = currentPage?.icon ?? Home;

  return (
    <div className="msonjo-app flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <Link
          href="/dashboard"
          className="flex min-h-16 items-center gap-3 border-b border-neutral-200 px-5 text-[#252525] no-underline"
        >
          <span className="flex size-9 items-center justify-center rounded bg-[#E31E24] text-sm font-bold text-white">
            M
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold">MSONJO GAS &amp; HOUSE HOLD</span>
            <span className="text-xs text-neutral-600">Inventory management</span>
          </span>
        </Link>
        <nav aria-label="Inventory navigation" className="flex-1 space-y-1 p-3">
          {[...navigation, ...(canManageUsers
            ? [{ label: 'Staff & users', href: '/staff', icon: Users }]
            : [])].map(({ label, href, icon: Icon }) => {
            const active = isCurrentPage(pathname, href);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-10 items-center gap-3 rounded px-3 text-sm no-underline ${
                  active
                    ? 'bg-[#E31E24] font-semibold !text-white hover:!text-white'
                    : 'text-neutral-700 hover:bg-neutral-100 hover:text-[#252525]'
                }`}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-neutral-200 p-4">
          <p className="text-xs font-medium text-[#252525]">{activeBusinessName}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label={mobileNavigationOpen ? 'Close navigation' : 'Open navigation'}
                aria-expanded={mobileNavigationOpen}
                aria-controls="inventory-mobile-navigation"
                onClick={() => setMobileNavigationOpen((open) => !open)}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded border border-neutral-300 text-[#252525] md:hidden"
              >
                {mobileNavigationOpen ? (
                  <X aria-hidden="true" className="size-5" />
                ) : (
                  <Menu aria-hidden="true" className="size-5" />
                )}
              </button>
              <div className="flex min-w-0 items-center gap-2">
                <CurrentIcon aria-hidden="true" className="hidden size-4 shrink-0 text-[#E31E24] sm:block" />
                <h1 className="truncate text-base font-semibold text-[#252525]">
                  {currentPage?.label ?? 'Inventory'}
                </h1>
              </div>
            </div>
            <div
              aria-label="Account"
              className="flex min-w-0 shrink-0 items-center gap-3 text-xs text-neutral-600 sm:text-sm"
            >
              <span className="hidden max-w-48 truncate sm:inline">{userEmail}</span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="min-h-9 rounded border border-neutral-300 px-3 text-xs font-medium text-[#252525] hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E31E24]"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <nav
            id="inventory-mobile-navigation"
            aria-label="Inventory navigation"
            hidden={!mobileNavigationOpen}
            className="inventory-mobile-nav border-t border-neutral-200 bg-white p-3 md:hidden"
          >
            <div className="space-y-1">
              {[...navigation, ...(canManageUsers
                ? [{ label: 'Staff & users', href: '/staff', icon: Users }]
                : [])].map(({ label, href, icon: Icon }) => {
                const active = isCurrentPage(pathname, href);

                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMobileNavigationOpen(false)}
                    className={`flex min-h-11 items-center gap-3 rounded px-3 text-sm no-underline ${
                      active
                        ? 'bg-[#E31E24] font-semibold !text-white hover:!text-white'
                        : 'text-neutral-700 hover:bg-neutral-100 hover:text-[#252525]'
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </header>
        <main className="w-full flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
