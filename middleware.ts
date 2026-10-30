import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { isLocalDashboardPreview } from '@/lib/bizzflow/local-preview';

const publicPaths = new Set([
  '/',
  '/login',
  '/auth/callback',
  '/configuration',
]);

function carryCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublicPath = publicPaths.has(pathname);
  if (pathname === '/dashboard' && isLocalDashboardPreview()) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-msonjo-pathname', pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const config = getSupabaseConfig();

  if (!config) {
    if (isPublicPath) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-msonjo-pathname', pathname);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    return NextResponse.redirect(new URL('/configuration', request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-msonjo-pathname', pathname);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const updatedRequestHeaders = new Headers(request.headers);
        updatedRequestHeaders.set('x-msonjo-pathname', pathname);
        response = NextResponse.next({ request: { headers: updatedRequestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error && !isPublicPath) {
    const configurationUrl = new URL('/configuration?issue=auth', request.url);
    return carryCookies(response, NextResponse.redirect(configurationUrl));
  }

  if (!user && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return carryCookies(response, NextResponse.redirect(loginUrl));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\..*).*)'],
};
