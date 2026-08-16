import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import EmptyState from './EmptyState'
import Icon from './Icon'
import { TextField, MoneyField, NumberField, parseMinutes } from './Fields'
import { haptic } from '../hooks/useTelegramChrome'
import {
  deactivateService,
  formatPrice,
  reactivateService,
  reorderServices,
  updateService,
} from '../lib/services'

function sortServices(list) {
  return [...(list || [])].sort((a, b) => {
    const ao = Number(a.sort_order ?? 0)
    const bo = Number(b.sort_order ?? 0)
    if (ao !== bo) return ao - bo
    return String(a.title || '').localeCompare(String(b.title || ''), 'ru')
  })
}

function idsKey(list) {
  return (list || []).map((s) => s.id).join('|')
}

function ServiceRowSummary({ title, duration, priceLabel, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="truncate text-sm font-semibold text-[var(--brand-text)]">{title}</p>
      <p className="mt-0.5 text-xs text-[var(--brand-muted)]">
        {duration} мин · {priceLabel}
      </p>
    </div>
  )
}

function SortableServiceRow({
  service,
  expanded,
  onToggleExpand,
  busy,
  confirmHideId,
  editTitles,
  editDurations,
  editPrices,
  editBuffers,
  durationErrors,
  onEditTitle,
  onEditDuration,
  onEditPrice,
  onEditBuffer,
  onSaveField,
  onAskHide,
  onConfirmHide,
  onCancelHide,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: service.id,
    animateLayoutChanges: () => false,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  }

  const title = editTitles[service.id] ?? service.title
  const duration = editDurations[service.id] ?? service.duration_min ?? 30
  const priceLabel = formatPrice(service.price_cents, service.currency)

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`service-list-item card ${isDragging ? 'is-dragging' : ''} ${expanded ? 'is-expanded' : ''}`}
    >
      {confirmHideId === service.id ? (
        <div className="service-list-confirm mb-3">
          <p className="text-sm">Скрыть «{service.title}» из записи?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="pressable booking-secondary-btn flex-1 text-sm"
              disabled={busy === `rm-${service.id}`}
              onClick={onConfirmHide}
            >
              Да, скрыть
            </button>
            <button
              type="button"
              className="pressable flex-1 text-sm text-[var(--brand-muted)]"
              onClick={onCancelHide}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      <div className="service-list-row">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="service-list-handle pressable"
          aria-label="Перетащить услугу"
          {...attributes}
          {...listeners}
        >
          <Icon name="icon-grip" size={20} />
        </button>

        <button
          type="button"
          className="service-list-summary pressable min-w-0 flex-1 text-left"
          onClick={() => onToggleExpand(service.id)}
        >
          <ServiceRowSummary title={title} duration={duration} priceLabel={priceLabel} />
        </button>

        <button
          type="button"
          className="service-list-chevron pressable"
          aria-expanded={expanded}
          aria-label={expanded ? 'Свернуть' : 'Редактировать'}
          onClick={() => onToggleExpand(service.id)}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded ? (
        <div className="service-list-details">
          <TextField
            label="Название"
            value={editTitles[service.id] ?? service.title}
            onChange={(v) => onEditTitle(service.id, v)}
            onBlur={() => onSaveField(service, 'title')}
            maxLength={60}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <NumberField
              label="Минут"
              value={editDurations[service.id]}
              min={10}
              max={480}
              suffix="мин"
              placeholder="например 45"
              error={durationErrors[service.id] || ''}
              onChange={(v) => onEditDuration(service.id, v)}
              onBlur={() => onSaveField(service, 'duration')}
            />
            <MoneyField
              label="Цена"
              value={editPrices[service.id] ?? ''}
              onChange={(raw) => onEditPrice(service.id, raw)}
              saving={busy === `price-${service.id}`}
              onSave={() => onSaveField(service, 'price')}
            />
          </div>
          <label className="mt-2 block">
            <span className="meta-label">Перерыв после услуги</span>
            <select
              className="field mt-1 w-full"
              value={editBuffers[service.id] ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value)
                onEditBuffer(service.id, v)
                onSaveField({ ...service, buffer_min: v }, 'buffer')
              }}
            >
              {[0, 5, 10, 15, 20, 30].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'Нет' : `${m} мин`}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-[var(--brand-muted)]">
              Сохранено: {formatPrice(service.price_cents, service.currency)}
            </p>
            <button
              type="button"
              className="service-delete-btn shrink-0"
              disabled={busy === `rm-${service.id}`}
              onClick={() => onAskHide(service.id)}
            >
              Скрыть
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function DragPreview({ service, editTitles, editDurations }) {
  if (!service) return null
  const title = editTitles[service.id] ?? service.title
  const duration = editDurations[service.id] ?? service.duration_min ?? 30
  const priceLabel = formatPrice(service.price_cents, service.currency)

  return (
    <div className="service-list-item card service-list-drag-preview">
      <div className="service-list-row">
        <div className="service-list-handle" aria-hidden>
          <Icon name="icon-grip" size={20} />
        </div>
        <ServiceRowSummary title={title} duration={duration} priceLabel={priceLabel} className="flex-1" />
      </div>
    </div>
  )
}

export default function ServiceSortableList({
  services = [],
  masterId,
  businessId = null,
  busy = '',
  setBusy,
  setError,
  showToast,
  onServicesChange,
}) {
  const activeServices = useMemo(
    () => sortServices((services || []).filter((s) => s.is_active !== false)),
    [services],
  )
  const hiddenServices = useMemo(
    () => sortServices((services || []).filter((s) => s.is_active === false)),
    [services],
  )

  const [items, setItems] = useState(activeServices)
  const [activeDragId, setActiveDragId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [editPrices, setEditPrices] = useState({})
  const [editTitles, setEditTitles] = useState({})
  const [editDurations, setEditDurations] = useState({})
  const [durationErrors, setDurationErrors] = useState({})
  const [editBuffers, setEditBuffers] = useState({})
  const [confirmHideId, setConfirmHideId] = useState(null)
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [reorderBusy, setReorderBusy] = useState(false)
  const localOrderRef = useRef(idsKey(activeServices))
  const isDraggingRef = useRef(false)

  useEffect(() => {
    if (isDraggingRef.current) return

    const incomingKey = idsKey(activeServices)
    setItems((prev) => {
      if (incomingKey === idsKey(prev)) {
        return prev.map((row) => {
          const fresh = activeServices.find((s) => s.id === row.id)
          return fresh ? { ...row, ...fresh } : row
        })
      }
      if (incomingKey === localOrderRef.current) {
        return prev.map((row, index) => ({ ...row, sort_order: index }))
      }
      localOrderRef.current = incomingKey
      return activeServices
    })
  }, [activeServices])

  useEffect(() => {
    const prices = {}
    const titles = {}
    const durations = {}
    const buffers = {}
    for (const s of services || []) {
      prices[s.id] = String(Math.round((s.price_cents || 0) / 100))
      titles[s.id] = String(s.title || '')
      durations[s.id] = s.duration_min ?? 30
      buffers[s.id] = s.buffer_min ?? 0
    }
    setEditPrices(prices)
    setEditTitles(titles)
    setEditDurations(durations)
    setEditBuffers(buffers)
  }, [services])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const persistOrder = useCallback(
    async (orderedIds) => {
      setReorderBusy(true)
      const res = await reorderServices({
        businessId,
        masterId,
        orderedIds,
      })
      setReorderBusy(false)
      if (!res.ok) {
        setError?.(res.error || 'Порядок не сохранился')
        setItems(activeServices)
        localOrderRef.current = idsKey(activeServices)
        haptic('error')
        return
      }
      localOrderRef.current = orderedIds.join('|')
      haptic('success')
      onServicesChange?.()
    },
    [activeServices, businessId, masterId, onServicesChange, setError],
  )

  function onDragStart(event) {
    isDraggingRef.current = true
    setActiveDragId(String(event.active.id))
    setExpandedId(null)
    haptic('light')
  }

  function onDragEnd(event) {
    isDraggingRef.current = false
    setActiveDragId(null)

    const { active, over } = event
    if (!over || active.id === over.id) return

    let nextOrder = null
    setItems((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id)
      const newIndex = prev.findIndex((s) => s.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      const next = arrayMove(prev, oldIndex, newIndex)
      nextOrder = next.map((s) => s.id)
      localOrderRef.current = nextOrder.join('|')
      return next
    })

    if (nextOrder?.length) persistOrder(nextOrder)
  }

  function onDragCancel() {
    isDraggingRef.current = false
    setActiveDragId(null)
  }

  const dragService = activeDragId
    ? items.find((s) => String(s.id) === activeDragId)
    : null

  async function onSaveField(service, field) {
    if (field === 'price') {
      const rub = Number(editPrices[service.id] || 0)
      if (Number.isNaN(rub) || rub < 0) return
      setBusy?.(`price-${service.id}`)
      const res = await updateService(service.id, {
        price_cents: Math.round(rub * 100),
      })
      setBusy?.('')
      if (!res.ok) {
        setError?.(res.error || 'Не сохранилось')
        return
      }
      showToast?.('Цена сохранена')
    } else if (field === 'title') {
      const title = String(editTitles[service.id] || '').trim()
      if (!title || title === service.title) return
      setBusy?.(`title-${service.id}`)
      const res = await updateService(service.id, { title })
      setBusy?.('')
      if (!res.ok) {
        setError?.(res.error || 'Не сохранилось')
        return
      }
      showToast?.('Название сохранено')
    } else if (field === 'duration') {
      const dur = parseMinutes(editDurations[service.id])
      if (dur == null) {
        setDurationErrors((prev) => ({
          ...prev,
          [service.id]: 'Укажите время оказания услуги',
        }))
        haptic('error')
        return
      }
      if (dur < 10) {
        setDurationErrors((prev) => ({
          ...prev,
          [service.id]: 'Минимум 10 минут',
        }))
        haptic('error')
        return
      }
      if (dur > 480) {
        setDurationErrors((prev) => ({
          ...prev,
          [service.id]: 'Максимум 8 часов (480 мин)',
        }))
        haptic('error')
        return
      }
      setDurationErrors((prev) => {
        const next = { ...prev }
        delete next[service.id]
        return next
      })
      setBusy?.(`dur-${service.id}`)
      const res = await updateService(service.id, { duration_min: dur })
      setBusy?.('')
      if (!res.ok) {
        setError?.(res.error || 'Не сохранилось')
        return
      }
      showToast?.('Длительность сохранена')
    } else if (field === 'buffer') {
      const buf = Number(editBuffers[service.id] || 0)
      setBusy?.(`buf-${service.id}`)
      const res = await updateService(service.id, { buffer_min: buf })
      setBusy?.('')
      if (!res.ok) {
        setError?.(res.error || 'Не сохранилось')
        return
      }
      showToast?.('Перерыв сохранён')
    }
    haptic('success')
    onServicesChange?.()
  }

  function askHideService(id) {
    if (items.length <= 1) {
      setError?.('Нужна хотя бы одна активная услуга')
      return
    }
    setConfirmHideId(id)
    setError?.('')
  }

  async function onConfirmHide() {
    const id = confirmHideId
    if (!id) return
    setConfirmHideId(null)
    setBusy?.(`rm-${id}`)
    setError?.('')
    const res = await deactivateService(id)
    setBusy?.('')
    if (!res.ok) {
      setError?.(res.error || 'Не удалось скрыть')
      return
    }
    haptic('success')
    showToast?.('Услуга скрыта')
    onServicesChange?.()
  }

  async function onRestoreService(id) {
    setBusy?.(`restore-${id}`)
    setError?.('')
    const res = await reactivateService(id, { businessId, masterId })
    setBusy?.('')
    if (!res.ok) {
      setError?.(res.error || 'Не удалось вернуть')
      return
    }
    haptic('success')
    showToast?.('Услуга снова активна')
    onServicesChange?.()
  }

  if (items.length === 0) {
    return (
      <EmptyState
        imageSrc="empty-slots.svg"
        title="Нет услуг"
        text="Клиенты не смогут записаться. Добавьте хотя бы одну услугу."
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--brand-muted)]">
        Зажмите{' '}
        <span className="inline-flex align-middle text-[var(--brand-text)]">
          <Icon name="icon-grip" size={14} />
        </span>{' '}
        и потяните — такой же порядок у клиентов.
        {reorderBusy ? ' Сохраняю…' : ''}
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="service-list space-y-2">
            {items.map((s) => (
              <SortableServiceRow
                key={s.id}
                service={s}
                expanded={expandedId === s.id}
                onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
                busy={busy}
                confirmHideId={confirmHideId}
                editTitles={editTitles}
                editDurations={editDurations}
                editPrices={editPrices}
                editBuffers={editBuffers}
                durationErrors={durationErrors}
                onEditTitle={(id, v) => setEditTitles((prev) => ({ ...prev, [id]: v }))}
                onEditDuration={(id, v) => {
                  setEditDurations((prev) => ({ ...prev, [id]: v }))
                  if (durationErrors[id]) {
                    setDurationErrors((prev) => {
                      const next = { ...prev }
                      delete next[id]
                      return next
                    })
                  }
                }}
                onEditPrice={(id, raw) =>
                  setEditPrices((prev) => ({ ...prev, [id]: raw }))
                }
                onEditBuffer={(id, v) => setEditBuffers((prev) => ({ ...prev, [id]: v }))}
                onSaveField={onSaveField}
                onAskHide={askHideService}
                onConfirmHide={onConfirmHide}
                onCancelHide={() => setConfirmHideId(null)}
              />
            ))}
          </ul>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
          <DragPreview
            service={dragService}
            editTitles={editTitles}
            editDurations={editDurations}
          />
        </DragOverlay>
      </DndContext>

      {hiddenServices.length > 0 ? (
        <div className="border-t border-[color-mix(in_srgb,var(--brand-text)_8%,transparent)] pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-semibold"
            onClick={() => setHiddenOpen((v) => !v)}
          >
            <span>Скрытые услуги ({hiddenServices.length})</span>
            <span className="text-[var(--brand-muted)]">{hiddenOpen ? '▲' : '▼'}</span>
          </button>
          {hiddenOpen ? (
            <ul className="mt-2 space-y-2">
              {hiddenServices.map((s) => (
                <li key={s.id} className="service-hidden-row card px-3 py-3">
                  <ServiceRowSummary
                    title={s.title || 'Без названия'}
                    duration={s.duration_min ?? 30}
                    priceLabel={formatPrice(s.price_cents, s.currency)}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    className="pressable service-restore-btn"
                    disabled={busy === `restore-${s.id}`}
                    onClick={() => onRestoreService(s.id)}
                  >
                    {busy === `restore-${s.id}` ? '…' : 'Вернуть'}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
