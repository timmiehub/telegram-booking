import { assetUrl } from './assets'

/** Тема по умолчанию — глубокий бордовый вместо дефолтного телеграм-синего */
export const DEFAULT_THEME = {
  primary_color: '#a8425a',
  secondary_color: '#e8eaed',
  accent_color: '#c9a15a',
  background_color: '#0c1016',
  surface_color: '#151b24',
  text_color: '#f4f6f8',
  button_text_color: '#fdf3f0',
  button_style: 'solid',
  border_radius_px: 14,
  font_family:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
  display_font_family:
    '"Manrope", -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif',
  logo_url: 'avatar-demo.svg',
  cover_url: 'cover-demo.svg',
  business_name: 'Запись',
}

export function applyThemeToDocument(theme) {
  const root = document.documentElement
  const merged = { ...DEFAULT_THEME, ...theme }
  const t = {
    ...merged,
    logo_url: assetUrl(merged.logo_url || DEFAULT_THEME.logo_url),
    cover_url: assetUrl(merged.cover_url || DEFAULT_THEME.cover_url),
  }

  root.style.setProperty('--brand-primary', t.primary_color)
  root.style.setProperty(
    '--brand-primary-deep',
    `color-mix(in srgb, ${t.primary_color} 72%, #0a3040)`,
  )
  root.style.setProperty('--brand-secondary', t.secondary_color)
  root.style.setProperty('--brand-accent', t.accent_color)
  root.style.setProperty('--brand-bg', t.background_color)
  root.style.setProperty('--brand-surface', t.surface_color)
  root.style.setProperty('--brand-text', t.text_color)
  root.style.setProperty('--brand-btn-text', t.button_text_color)
  root.style.setProperty('--brand-radius', `${t.border_radius_px}px`)
  root.style.setProperty('--radius-sm', '10px')
  root.style.setProperty('--radius-md', `${t.border_radius_px || 14}px`)
  root.style.setProperty('--radius-lg', '18px')
  root.style.setProperty('--brand-danger', '#e07070')
  root.style.setProperty('--brand-success', '#3dba8b')
  root.style.setProperty('--brand-warning', '#e0b45a')
  // Шрифты продукта фиксируем (white-label цвета остаются)
  root.style.setProperty('--brand-font', DEFAULT_THEME.font_family)
  root.style.setProperty('--brand-display', DEFAULT_THEME.display_font_family)
  root.style.fontFamily = DEFAULT_THEME.font_family
  if (typeof document !== 'undefined' && document.body) {
    document.body.style.fontFamily = DEFAULT_THEME.font_family
  }
  root.style.setProperty(
    '--brand-surface-2',
    'color-mix(in srgb, ' + t.surface_color + ' 70%, #000)',
  )
  root.style.setProperty(
    '--brand-muted',
    'color-mix(in srgb, ' + t.text_color + ' 58%, transparent)',
  )
  root.style.setProperty(
    '--brand-glow',
    'color-mix(in srgb, ' + t.primary_color + ' 22%, transparent)',
  )
  root.style.setProperty(
    '--shadow-btn',
    '0 10px 24px color-mix(in srgb, ' + t.primary_color + ' 32%, transparent)',
  )
  root.style.setProperty(
    '--brand-gradient',
    'radial-gradient(1200px 480px at 10% -10%, ' +
      'color-mix(in srgb, ' +
      t.primary_color +
      ' 22%, transparent), transparent 60%), ' +
      'radial-gradient(900px 420px at 100% 0%, ' +
      'color-mix(in srgb, ' +
      (t.accent_color || t.primary_color) +
      ' 12%, transparent), transparent 55%)',
  )

  return t
}

/** Класс главной CTA по стилю темы бизнеса */
export function buttonClassName(style = 'solid') {
  if (style === 'outline') return 'btn btn-outline w-full'
  if (style === 'soft') return 'btn btn-soft w-full'
  if (style === 'pill') return 'btn btn-primary btn-pill w-full'
  return 'btn btn-primary w-full'
}

export function themeFromRow(row) {
  if (!row) return { ...DEFAULT_THEME }
  return {
    ...DEFAULT_THEME,
    ...row,
    primary_color: row.primary_color || DEFAULT_THEME.primary_color,
    accent_color: row.accent_color || DEFAULT_THEME.accent_color,
    background_color: row.background_color || DEFAULT_THEME.background_color,
    surface_color: row.surface_color || DEFAULT_THEME.surface_color,
    text_color: row.text_color || DEFAULT_THEME.text_color,
    button_text_color: row.button_text_color || DEFAULT_THEME.button_text_color,
    logo_url: row.logo_url || DEFAULT_THEME.logo_url,
    cover_url: row.cover_url || DEFAULT_THEME.cover_url,
    business_name: row.business_name || DEFAULT_THEME.business_name,
  }
}
