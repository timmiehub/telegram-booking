import { supabase } from './supabase'
import { DEFAULT_THEME } from './theme'
import { isReservedGrowthStartParam } from './growthAttribution'

/**
 * Достаём slug мастера:
 * 1) ?master=anna
 * 2) Telegram start_param (t.me/bot?startapp=anna)
 */
export function resolveMasterSlug() {
  const search = window.location.search || ''

  // Обычный вид: ?master=demo
  const fromQuery = new URLSearchParams(search).get('master')
  if (fromQuery) return fromQuery.trim()

  // Cursor Simple Browser иногда кодирует «=» как %3D → ?master%3Ddemo
  const encoded = search.match(/[?&]master(%3D|=)([^&]*)/i)
  if (encoded?.[2]) {
    try {
      return decodeURIComponent(encoded[2]).trim() || null
    } catch {
      return encoded[2].trim() || null
    }
  }

  try {
    // start_param прокидывается Telegram при открытии Mini App
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param
    if (startParam) {
      const raw = String(startParam).trim()
      if (isReservedGrowthStartParam(raw) || /^(invite_|join_)/i.test(raw)) {
        return null
      }
      return raw
    }
  } catch {
    // игнорируем — вне Telegram
  }

  return null
}

/**
 * Загружаем профиль мастера + тему White Label из Supabase.
 * При отсутствии клиента/записи — DEFAULT_THEME.
 */
export async function fetchMasterTheme(slug) {
  if (!slug || !supabase) {
    return {
      theme: DEFAULT_THEME,
      master: null,
      source: slug ? 'fallback-no-supabase' : 'fallback-no-slug',
    }
  }

  const { data: master, error: masterError } = await supabase
    .from('profiles')
    .select('id, slug, business_name, avatar_url, full_name')
    .eq('slug', slug)
    .eq('role', 'master')
    .maybeSingle()

  if (masterError) {
    console.error('Ошибка загрузки профиля мастера:', masterError)
    return { theme: DEFAULT_THEME, master: null, source: 'error-profile' }
  }

  if (!master) {
    return { theme: DEFAULT_THEME, master: null, source: 'not-found' }
  }

  const { data: themeRow, error: themeError } = await supabase
    .from('themes')
    .select(
      [
        'primary_color',
        'secondary_color',
        'accent_color',
        'background_color',
        'surface_color',
        'text_color',
        'button_text_color',
        'button_style',
        'border_radius_px',
        'font_family',
        'logo_url',
        'cover_url',
      ].join(', '),
    )
    .eq('master_id', master.id)
    .maybeSingle()

  if (themeError) {
    console.error('Ошибка загрузки темы:', themeError)
  }

  return {
    master,
    theme: {
      ...DEFAULT_THEME,
      ...(themeRow ?? {}),
      business_name: master.business_name || master.full_name || DEFAULT_THEME.business_name,
      logo_url: themeRow?.logo_url ?? master.avatar_url ?? null,
    },
    source: themeRow ? 'supabase' : 'default-for-master',
  }
}
