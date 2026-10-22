export function getMsonjoAuthEmail(username: string, supabaseUrl: string) {
  const host = new URL(supabaseUrl).hostname;
  const projectRef = host.endsWith('.supabase.co')
    ? host.slice(0, -'.supabase.co'.length)
    : host.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'local';

  return `${username}@msonjo-${projectRef}.com`;
}
