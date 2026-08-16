import { supabase } from './supabase'

const SERVICE_FIELDS_CORE =
  'id, title, duration_min, price_cents, currency, master_id, is_active, sort_order'
const SERVICE_FIELDS = `${SERVICE_FIELDS_CORE}, buffer_min`

function withBufferDefault(rows) {
  if (!rows) return rows
  if (Array.isArray(rows)) {
    return rows.map((s) => ({
      ...s,
      buffer_min: s.buffer_min ?? 0,
      sort_order: s.sort_order ?? 0,
    }))
  }
  return {
    ...rows,
    buffer_min: rows.buffer_min ?? 0,
    sort_order: rows.sort_order ?? 0,
  }
}

function isMissingBufferColumn(message) {
  return /buffer_min/i.test(String(message || ''))
}

function isMissingSortOrderColumn(message) {
  return /sort_order/i.test(String(message || ''))
}

async function selectServices(makeQuery) {
  let { data, error } = await makeQuery(SERVICE_FIELDS)
  if (error && isMissingBufferColumn(error.message)) {
    ;({ data, error } = await makeQuery(SERVICE_FIELDS_CORE))
  }
  if (error && isMissingSortOrderColumn(error.message)) {
    const coreNoSort = SERVICE_FIELDS_CORE.replace(', sort_order', '')
    ;({ data, error } = await makeQuery(`${coreNoSort}, buffer_min`))
    if (error && isMissingBufferColumn(error.message)) {
      ;({ data, error } = await makeQuery(coreNoSort))
    }
  }
  if (error) return { data: null, error }
  return { data: withBufferDefault(data), error: null }
}

function applyServiceOrder(query, { hasSortOrder = true } = {}) {
  if (hasSortOrder) {
    return query.order('sort_order', { ascending: true }).order('title')
  }
  return query.order('title')
}

function mapServiceError(message) {
  const msg = String(message || '')
  if (/permission|policy|row-level|42501|PGRST/i.test(msg)) {
    return 'Нет прав на изменение услуг. Выполните migration_services_manage.sql в Supabase.'
  }
  if (isMissingBufferColumn(msg)) {
    return 'Колонка buffer_min не найдена. Выполните migration_yclients_features.sql.'
  }
  if (isMissingSortOrderColumn(msg)) {
    return 'Колонка sort_order не найдена. Выполните migration_services_sort_order.sql в Supabase.'
  }
  return msg || 'Не удалось сохранить'
}

async function nextSortOrder({ businessId, masterId }) {
  if (!supabase) return 0
  let query = supabase.from('services').select('sort_order')
  if (businessId) query = query.eq('business_id', businessId)
  else if (masterId) query = query.eq('master_id', masterId)
  else return 0

  const { data, error } = await query
    .order('sort_order', { ascending: false })
    .limit(1)

  if (error && isMissingSortOrderColumn(error.message)) return 0
  return (data?.[0]?.sort_order ?? -1) + 1
}

/** Услуги бизнеса (или legacy master_id) */
export async function fetchBusinessServices({
  businessId,
  masterId,
  includeInactive = false,
}) {
  if (!supabase) return []

  const applyFilters = (query, hasSortOrder = true) => {
    let q = query
    if (!includeInactive) q = q.eq('is_active', true)
    return applyServiceOrder(q, { hasSortOrder })
  }

  if (businessId) {
    let { data, error } = await selectServices((fields) =>
      applyFilters(
        supabase.from('services').select(fields).eq('business_id', businessId),
      ),
    )
    if (error && isMissingSortOrderColumn(error.message)) {
      ;({ data, error } = await selectServices((fields) =>
        applyFilters(
          supabase.from('services').select(fields).eq('business_id', businessId),
          false,
        ),
      ))
    }
    if (!error && data) return data
    if (error) console.warn('services by business:', error.message)
  }

  if (masterId) {
    let { data, error } = await selectServices((fields) =>
      applyFilters(supabase.from('services').select(fields).eq('master_id', masterId)),
    )
    if (error && isMissingSortOrderColumn(error.message)) {
      ;({ data, error } = await selectServices((fields) =>
        applyFilters(
          supabase.from('services').select(fields).eq('master_id', masterId),
          false,
        ),
      ))
    }
    if (error) {
      console.error('Ошибка загрузки услуг:', error.message)
      return []
    }
    return data ?? []
  }

  return []
}

/** @deprecated use fetchBusinessServices */
export async function fetchMasterServices(masterId) {
  return fetchBusinessServices({ masterId })
}

export function formatPrice(priceCents, currency = 'RUB') {
  const value = (Number(priceCents) || 0) / 100
  if (currency === 'RUB') {
    return `${value.toLocaleString('ru-RU')} ₽`
  }
  return `${value.toLocaleString('ru-RU')} ${currency}`
}

export async function createService({
  businessId,
  masterId,
  title,
  durationMin = 30,
  priceCents = 0,
}) {
  if (!supabase || !masterId || !title?.trim()) {
    return { ok: false, error: 'Не хватает данных' }
  }
  const sortOrder = await nextSortOrder({ businessId, masterId })
  const row = {
    master_id: masterId,
    title: title.trim(),
    duration_min: Number(durationMin) || 30,
    price_cents: Math.max(0, Number(priceCents) || 0),
    currency: 'RUB',
    is_active: true,
    sort_order: sortOrder,
  }
  if (businessId) row.business_id = businessId

  const { data, error } = await selectServices((fields) =>
    supabase.from('services').insert(row).select(fields).single(),
  )
  if (error) return { ok: false, error: mapServiceError(error.message) }
  return { ok: true, service: data }
}

export async function updateService(id, patch) {
  if (!supabase || !id) return { ok: false, error: 'Нет id' }
  const body = {}
  if (patch.title != null) body.title = String(patch.title).trim()
  if (patch.duration_min != null) {
    const d = Number(patch.duration_min)
    if (!Number.isFinite(d) || d < 10) {
      return { ok: false, error: 'Укажите время оказания услуги' }
    }
    body.duration_min = Math.min(480, Math.round(d))
  }
  if (patch.price_cents != null) body.price_cents = Math.max(0, Number(patch.price_cents) || 0)
  if (patch.buffer_min != null) body.buffer_min = Math.max(0, Math.min(60, Number(patch.buffer_min) || 0))
  if (patch.is_active != null) body.is_active = Boolean(patch.is_active)
  if (patch.sort_order != null) body.sort_order = Math.max(0, Number(patch.sort_order) || 0)
  const { error } = await supabase.from('services').update(body).eq('id', id)
  if (error) return { ok: false, error: mapServiceError(error.message) }
  return { ok: true }
}

export async function reorderServices({ businessId, masterId, orderedIds }) {
  if (!supabase || !orderedIds?.length) {
    return { ok: false, error: 'Нет данных для сортировки' }
  }

  const updates = orderedIds.map((id, index) =>
    supabase.from('services').update({ sort_order: index }).eq('id', id),
  )

  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) {
    return { ok: false, error: mapServiceError(failed.error.message) }
  }
  return { ok: true }
}

export async function deactivateService(id) {
  return updateService(id, { is_active: false })
}

export async function reactivateService(id, { businessId, masterId } = {}) {
  const sortOrder = await nextSortOrder({ businessId, masterId })
  return updateService(id, { is_active: true, sort_order: sortOrder })
}
