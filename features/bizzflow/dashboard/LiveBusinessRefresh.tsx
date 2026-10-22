'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Database } from '@/lib/database.types';

export default function LiveBusinessRefresh({
  businessId,
  supabaseUrl,
  publishableKey,
}: {
  businessId: string;
  supabaseUrl?: string;
  publishableKey?: string;
}) {
  const router = useRouter();
  const hasConfig = Boolean(supabaseUrl && publishableKey);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'unavailable'>(
    hasConfig ? 'connecting' : 'unavailable',
  );

  useEffect(() => {
    if (!supabaseUrl || !publishableKey) return;

    const supabase = createBrowserClient<Database>(supabaseUrl, publishableKey);
    let refreshTimer: number | undefined;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => router.refresh(), 150);
    };
    const channel = supabase.channel(`msonjo-dashboard-${businessId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'products',
        filter: `business_id=eq.${businessId}`,
      }, refresh)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sales',
        filter: `business_id=eq.${businessId}`,
      }, refresh)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'stock_movements',
        filter: `business_id=eq.${businessId}`,
      }, refresh)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('connected');
          refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('unavailable');
        }
      });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearTimeout(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [businessId, publishableKey, router, supabaseUrl]);

  if (connection === 'connected') {
    return <p role="status" className="text-xs text-neutral-600">Live updates connected</p>;
  }
  if (connection === 'unavailable') {
    return <p role="status" className="text-xs text-neutral-600">Live updates unavailable. Refresh to fetch the latest data.</p>;
  }
  return <p role="status" className="text-xs text-neutral-600">Connecting to live updates…</p>;
}
