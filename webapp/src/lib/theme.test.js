import { describe, it, expect } from 'vitest'
import { DEFAULT_THEME, buttonClassName } from './theme.js'

describe('Theme', () => {
  it('DEFAULT_THEME должен содержать обязательные поля', () => {
    expect(DEFAULT_THEME).toBeDefined()
    expect(DEFAULT_THEME).toHaveProperty('background_color')
    expect(DEFAULT_THEME).toHaveProperty('text_color')
    expect(DEFAULT_THEME).toHaveProperty('primary_color')
  })

  it('buttonClassName должен возвращать строку', () => {
    const className = buttonClassName('primary')
    expect(typeof className).toBe('string')
  })

  it('buttonClassName должен обрабатывать разные стили', () => {
    const primary = buttonClassName('primary')
    const secondary = buttonClassName('secondary')
    const ghost = buttonClassName('ghost')

    expect(typeof primary).toBe('string')
    expect(typeof secondary).toBe('string')
    expect(typeof ghost).toBe('string')
  })
})