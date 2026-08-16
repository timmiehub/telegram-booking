import { supabase } from './supabase'

export async function fetchClientNote(masterId, clientTelegramId) {
  if (!masterId || !clientTelegramId || !supabase) return null

  const { data, error } = await supabase
    .from('client_notes')
    .select('id, note, no_show_count, display_name, is_blocked, updated_at')
    .eq('master_id', masterId)
    .eq('client_telegram_id', clientTelegramId)
    .maybeSingle()

  if (error) {
    if (/client_notes|is_blocked/i.test(String(error.message || ''))) {
      // fallback without is_blocked column
      const { data: legacy } = await supabase
        .from('client_notes')
        .select('id, note, no_show_count, display_name, updated_at')
        .eq('master_id', masterId)
        .eq('client_telegram_id', clientTelegramId)
        .maybeSingle()
      return legacy ? { ...legacy, is_blocked: false } : null
    }
    console.warn('client note:', error.message)
    return null
  }
  return data
}

export async function upsertClientNote(masterId, clientTelegramId, { note, displayName } = {}) {
  if (!masterId || !clientTelegramId || !supabase) {
    return { ok: false, error: 'Нет данных' }
  }

  const row = {
    master_id: masterId,
    client_telegram_id: clientTelegramId,
    updated_at: new Date().toISOString(),
  }
  if (note !== undefined) row.note = String(note).slice(0, 2000)
  if (displayName !== undefined) row.display_name = String(displayName).slice(0, 120) || null

  const { data, error } = await supabase
    .from('client_notes')
    .upsert(row, { onConflict: 'master_id,client_telegram_id' })
    .select('id, note, no_show_count, display_name, is_blocked')
    .single()

  if (error) {
    if (/client_notes/i.test(String(error.message || ''))) {
      return {
        ok: false,
        error: 'Таблица client_notes не найдена. Выполните migration_yclients_features.sql.',
      }
    }
    if (/is_blocked/i.test(String(error.message || ''))) {
      const { data: legacy, error: legErr } = await supabase
        .from('client_notes')
        .upsert(row, { onConflict: 'master_id,client_telegram_id' })
        .select('id, note, no_show_count, display_name')
        .single()
      if (legErr) return { ok: false, error: legErr.message }
      return { ok: true, note: { ...legacy, is_blocked: false } }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, note: data }
}

export async function setClientBlocked(masterId, clientTelegramId, blocked) {
  if (!masterId || !clientTelegramId || !supabase) {
    return { ok: false, error: 'Нет данных' }
  }
  const existing = await fetchClientNote(masterId, clientTelegramId)
  const { error } = await supabase.from('client_notes').upsert(
    {
      master_id: masterId,
      client_telegram_id: clientTelegramId,
      note: existing?.note || '',
      display_name: existing?.display_name || null,
      no_show_count: existing?.no_show_count || 0,
      is_blocked: Boolean(blocked),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'master_id,client_telegram_id' },
  )
  if (error) {
    if (/is_blocked/i.test(String(error.message || ''))) {
      return {
        ok: false,
        error: 'Нужна миграция: supabase/migration_pro_extras.sql',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, is_blocked: Boolean(blocked) }
}

export async function isClientBlocked(masterId, clientTelegramId) {
  if (!masterId || !clientTelegramId) return false
  const note = await fetchClientNote(masterId, clientTelegramId)
  return Boolean(note?.is_blocked)
}

export async function fetchBlockedClients(masterId) {
  if (!masterId || !supabase) return []
  const { data, error } = await supabase
    .from('client_notes')
    .select('client_telegram_id, display_name, note, updated_at')
    .eq('master_id', masterId)
    .eq('is_blocked', true)
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) {
    if (/is_blocked|client_notes/i.test(String(error.message || ''))) return []
    console.warn('blocked clients:', error.message)
    return []
  }
  return data || []
}

export async function incrementNoShow(masterId, clientTelegramId) {
  if (!masterId || !clientTelegramId || !supabase) return { ok: false }

  const existing = await fetchClientNote(masterId, clientTelegramId)
  const count = (existing?.no_show_count || 0) + 1

  const { error } = await supabase
    .from('client_notes')
    .upsert(
      {
        master_id: masterId,
        client_telegram_id: clientTelegramId,
        no_show_count: count,
        note: existing?.note || '',
        is_blocked: Boolean(existing?.is_blocked),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'master_id,client_telegram_id' },
    )

  if (error) {
    if (/client_notes/i.test(String(error.message || ''))) return { ok: false }
    return { ok: false, error: error.message }
  }
  return { ok: true, no_show_count: count }
}

export async function fetchClientStats(masterId, clientTelegramId) {
  if (!masterId || !clientTelegramId || !supabase) {
    return { visits: 0, lastVisit: null, note: null, no_show_count: 0, is_blocked: false }
  }

  const [noteRes, bookingsRes] = await Promise.all([
    fetchClientNote(masterId, clientTelegramId),
    supabase
      .from('bookings')
      .select('starts_at, status')
      .eq('master_id', masterId)
      .eq('client_telegram_id', clientTelegramId)
      .in('status', ['completed', 'confirmed', 'pending', 'no_show'])
      .order('starts_at', { ascending: false })
      .limit(50),
  ])

  const rows = bookingsRes.data ?? []
  const completed = rows.filter((r) => r.status === 'completed')
  return {
    visits: completed.length,
    lastVisit: completed[0]?.starts_at || rows[0]?.starts_at || null,
    note: noteRes?.note || '',
    no_show_count: noteRes?.no_show_count || 0,
    display_name: noteRes?.display_name || null,
    is_blocked: Boolean(noteRes?.is_blocked),
  }
}
