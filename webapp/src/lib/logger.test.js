import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import logger from './logger.js'

describe('Logger', () => {
  beforeEach(() => {
    // Мокаем console методы
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logger.error должен вызывать console.error в dev режиме', () => {
    logger.error('Test error')
    expect(console.error).toHaveBeenCalled()
  })

  it('logger.warn должен вызывать console.warn в dev режиме', () => {
    logger.warn('Test warning')
    expect(console.warn).toHaveBeenCalled()
  })

  it('logger.info должен вызывать console.info в dev режиме', () => {
    logger.info('Test info')
    expect(console.info).toHaveBeenCalled()
  })

  it('logger.debug должен вызывать console.log в dev режиме', () => {
    logger.debug('Test debug')
    expect(console.log).toHaveBeenCalled()
  })

  it('logger должен форматировать сообщения с timestamp', () => {
    const testMessage = 'Test message'
    logger.info(testMessage)
    
    const callArgs = console.info.mock.calls[0]
    const formattedMessage = callArgs[0]
    
    expect(formattedMessage).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
    expect(formattedMessage).toContain('[INFO]')
    expect(formattedMessage).toContain(testMessage)
  })
})