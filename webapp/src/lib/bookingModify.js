import { supabase } from './supabase'
import { canModifyBooking, normalizeSettings } from './settings'

/**
 * Политика переноса/отмены по settings бизнеса на записи.
 */
export function bookingModifyPolicy(booking) {
  const settings = normalizeSettings(
    booking?.businesses?.settings || booking?.settings || null,
  )
  const hours = Number(settings.reschedule_min_hours) || 0
  const statusOk = ['pending', 'confirmed'].includes(booking?.status)
  const timeOk = canModifyBooking(booking?.starts_at, settings)
  return {
    settings,
    hours,
    allowed: Boolean(statusOk && timeOk),
    blockedByTime: Boolean(statusOk && !timeOk),
  }
}

export async function assertClientCanModifyBooking(
  bookingId,
  clientTelegramId = null,
) {
  if (!bookingId || !supabase) {
    return { ok: false, error: 'Нет id' }
  }
  let query = supabase
    .from('bookings')
    .select(
      'id, starts_at, status, master_id, business_id, client_telegram_id, services(title), businesses(settings, name)',
    )
    .eq('id', bookingId)
  if (clientTelegramId) query = query.eq('client_telegram_id', clientTelegramId)
  const { data: row, error } = await query.maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!row) return { ok: false, error: 'Запись не найдена' }
  if (!['pending', 'confirmed'].includes(row.status)) {
    return { ok: false, error: 'Эту запись уже нельзя менять' }
  }
  const policy = bookingModifyPolicy(row)
  if (!policy.allowed) {
    return {
      ok: false,
      code: 'TOO_LATE',
      error: `Отмена и перенос — не позже чем за ${policy.hours} ч до визита. Напишите исполнителю лично.`,
      hours: policy.hours,
      masterId: row.master_id,
      booking: row,
    }
  }
  return { ok: true, booking: row, settings: policy.settings }
}
