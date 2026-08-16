/** Pro-план заведения на стороне бота (settings jsonb). */

export function isProPlan(settings) {
  if (!settings || typeof settings !== 'object') return false
  if (settings.plan !== 'pro') return false
  if (!settings.pro_until) return true
  const until = new Date(settings.pro_until).getTime()
  if (Number.isNaN(until)) return true
  return until > Date.now()
}

export function isBusinessPro(businessOrSettings) {
  const settings =
    businessOrSettings?.settings && typeof businessOrSettings.settings === 'object'
      ? businessOrSettings.settings
      : businessOrSettings
  return isProPlan(settings)
}
