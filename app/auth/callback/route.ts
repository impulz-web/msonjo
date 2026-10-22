import { NextResponse, type NextRequest } from 'next/server';
import { getMsonjoSiteUrl } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const allowedDestinations = new Set(['/dashboard']);

export async function GET(request: NextRequest) {
  const configuredSiteUrl = process.env.MSONJO_SITE_URL;
  if (!configuredSiteUrl) {
    return NextResponse.json(
      { error: 'MSONJO authentication is not configured.' },
      { status: 503 },
    );
  }

  let siteUrl: string;
  try {
    siteUrl = getMsonjoSiteUrl();
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: 'MSONJO authentication has an invalid site URL configuration.' },
        { status: 503 },
      );
    }
    throw error;
  }

  const code = request.nextUrl.searchParams.get('code');
  const destination = request.nextUrl.searchParams.get('next');
  const safeDestination = destination && allowedDestinations.has(destination) ? destination : '/dashboard';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=confirmation', siteUrl));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/login?error=confirmation', siteUrl));
  }

  return NextResponse.redirect(new URL(safeDestination, siteUrl));
}
