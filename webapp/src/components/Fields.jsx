/**
 * Поля ввода: тёмная тема кабинета (токены бренда).
 * Inline style бьёт themeParams Telegram WebView.
 */

import { useEffect, useId, useState } from 'react'

export const FIELD_INLINE = {
  backgroundColor: 'var(--field-bg)',
  color: 'var(--field-text)',
  WebkitTextFillColor: 'var(--field-text)',
  caretColor: 'var(--field-caret)',
  border: '1px solid var(--field-border)',
  colorScheme: 'dark',
  opacity: 1,
  fontWeight: 500,
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
}

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder = '',
  maxLength,
  className = '',
  inputClassName = '',
  autoComplete = 'off',
  type = 'text',
  inputMode,
  pattern,
  endAdornment = null,
  disabled = false,
  autoFocus = false,
}) {
  return (
    <label className={`block ${className}`.trim()}>
      {label ? <span className="meta-label">{label}</span> : null}
      <div className={`field-row ${label ? 'mt-1' : ''}`.trim()}>
        <div className="field-row-input">
          <input
            className={`field ${inputClassName}`.trim()}
            style={disabled ? { ...FIELD_INLINE, opacity: 0.65 } : FIELD_INLINE}
            type={type}
            inputMode={inputMode}
            pattern={pattern}
            autoComplete={autoComplete}
            placeholder={placeholder}
            maxLength={maxLength}
            value={value ?? ''}
            disabled={disabled}
            autoFocus={autoFocus}
            onChange={(e) => onChange?.(e.target.value)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
          />
        </div>
        {endAdornment ? (
          <div className="field-row-end">{endAdornment}</div>
        ) : null}
      </div>
    </label>
  )
}

/** Только цифры; суффикс ₽; опционально кнопка сохранить */
export function MoneyField({
  label,
  value,
  onChange,
  onSave,
  saving = false,
  placeholder = '0',
  className = '',
  showSave = true,
}) {
  return (
    <label className={`block ${className}`.trim()}>
      {label ? <span className="meta-label">{label}</span> : null}
      <div className={`price-field ${label ? 'mt-1' : ''}`.trim()}>
        <input
          className="field field-price"
          style={FIELD_INLINE}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder={placeholder}
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, '')
            onChange?.(raw)
          }}
          onBlur={() => onSave?.()}
        />
        <span className="price-field-suffix">₽</span>
        {showSave && onSave ? (
          <button
            type="button"
            className="pressable price-field-save"
            disabled={saving}
            onClick={onSave}
          >
            OK
          </button>
        ) : null}
      </div>
    </label>
  )
}

/**
 * Целое число (минуты и т.п.).
 * Пустое поле разрешено при вводе; min не подставляется на лету —
 * иначе «4» сразу становится 10 и нельзя набрать 45.
 * type=text + inputMode=numeric — без системного «ползунка».
 */
export function NumberField({
  label,
  value,
  onChange,
  onBlur,
  placeholder = '',
  className = '',
  min = 0,
  max = 9999,
  suffix = '',
  error = '',
  hint = '',
}) {
  const reactId = useId()
  const errId = `${reactId}-err`
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (!error) return undefined
    setShake(true)
    const t = setTimeout(() => setShake(false), 420)
    return () => clearTimeout(t)
  }, [error])

  const display = value === '' || value == null ? '' : String(value)
  const hasError = Boolean(error)

  return (
    <label className={`field-wrap block ${className}`.trim()}>
      {label ? <span className="meta-label">{label}</span> : null}
      <div
        className={`number-field ${label ? 'mt-1' : ''} ${hasError ? 'is-invalid' : ''} ${shake ? 'is-shake' : ''}`.trim()}
      >
        <input
          className="field field-price"
          style={{
            ...FIELD_INLINE,
            ...(hasError
              ? {
                  borderColor:
                    'color-mix(in srgb, var(--brand-warning) 55%, var(--field-border))',
                }
              : null),
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder={placeholder}
          value={display}
          aria-invalid={hasError}
          aria-describedby={hasError ? errId : undefined}
          data-min={min}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, '')
            if (raw === '') {
              onChange?.('')
              return
            }
            const n = Number(raw)
            if (Number.isNaN(n)) {
              onChange?.('')
              return
            }
            if (n > max) {
              onChange?.(max)
              return
            }
            onChange?.(n)
          }}
          onBlur={onBlur}
        />
        {suffix ? <span className="price-field-suffix">{suffix}</span> : null}
      </div>
      {hasError ? (
        <p id={errId} className="field-hint field-hint--error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </label>
  )
}

/** Разбор минут из поля: null = пусто/не число */
export function parseMinutes(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n
}
