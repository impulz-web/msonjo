export function isLocalDashboardPreview() {
  return process.env.NODE_ENV === 'development'
    && process.env.MSONJO_LOCAL_DASHBOARD_PREVIEW === 'true';
}
