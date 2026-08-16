// Простой logger для webapp
// В development выводит в console, в production можно расширить

const isDev = import.meta.env.DEV

const levels = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
}

function formatMessage(level, message, ...args) {
  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`
  return `${prefix} ${message}`
}

const logger = {
  error: (message, ...args) => {
    if (isDev) {
      console.error(formatMessage(levels.error, message), ...args)
    }
  },
  warn: (message, ...args) => {
    if (isDev) {
      console.warn(formatMessage(levels.warn, message), ...args)
    }
  },
  info: (message, ...args) => {
    if (isDev) {
      console.info(formatMessage(levels.info, message), ...args)
    }
  },
  debug: (message, ...args) => {
    if (isDev) {
      console.log(formatMessage(levels.debug, message), ...args)
    }
  },
}

export default logger