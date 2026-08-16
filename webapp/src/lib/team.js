import { supabase } from './supabase'
import { canAddMember } from './pro'
import { fetchBusinessSettings } from './settings'

export async function countActiveMembers(businessId) {
  if (!businessId || !supabase) return 0
  const { count, error } = await supabase
    .from('business_members')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('is_active', true)
  if (error) {
    console.warn('count members:', error.message)
    return 0
  }
  return count || 0
}

/** Инвайты в команду отключены. */
export async function ensureTeamInvite() {
  return { ok: false, error: 'Команда недоступна' }
}

export async function rotateTeamInvite() {
  return { ok: false, error: 'Команда недоступна' }
}

export function buildTeamInviteBotLink(code) {
  const c = String(code || '').trim().toUpperCase()
  if (!c) return ''
  return `https://t.me/booking_inapp_bot?start=join_${c}`
}

/** Вступление в команду отключено. */
export async function joinBusinessByInvite() {
  return { ok: false, error: 'Команда недоступна. Создайте свой кабинет.' }
}

export async function teamStatus(businessId) {
  if (!businessId) return { ok: false, error: 'Нет business id' }
  const { settings } = await fetchBusinessSettings(businessId)
  const active = await countActiveMembers(businessId)
  return {
    ok: true,
    active,
    canAdd: canAddMember(settings, active),
    code: settings?.team_invite_code || null,
    teamEnabled: false,
  }
}
