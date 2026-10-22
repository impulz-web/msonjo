export function getSupabaseConfig() {
  const url = process.env.MSONJO_SUPABASE_URL;
  const key = process.env.MSONJO_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  if (!isSupabasePublishableKey(key)) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  if (
    parsedUrl.username
    || parsedUrl.password
    || parsedUrl.pathname !== '/'
    || parsedUrl.search
    || parsedUrl.hash
    || !isSecureOrigin(parsedUrl)
  ) {
    return null;
  }

  return { url, key };
}

function isSecureOrigin(url: URL) {
  return url.protocol === 'https:'
    || (
      url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    );
}

export function isSupabasePublishableKey(key: string) {
  if (key.startsWith('sb_publishable_')) {
    return key.length > 'sb_publishable_'.length;
  }

  if (key.startsWith('sb_secret_')) {
    return false;
  }

  if (!key.includes('.')) {
    return false;
  }

  const parts = key.split('.');
  if (parts.length !== 3) {
    return false;
  }

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload)) as { role?: unknown };
    return claims.role === 'anon';
  } catch {
    return false;
  }
}

export function getMsonjoSiteUrl() {
  const value = process.env.MSONJO_SITE_URL;

  if (!value) {
    throw new Error('MSONJO_SITE_URL is required for authentication email links.');
  }

  const url = new URL(value);
  if (
    url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || !isSecureOrigin(url)
  ) {
    throw new Error('MSONJO_SITE_URL must be an HTTPS origin (or a local development origin).');
  }

  return url.origin;
}
