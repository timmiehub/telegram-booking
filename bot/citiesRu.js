/**
 * Известные города для разбора фраз в чате («массаж Волгоград»).
 * Согласовано с webapp/src/lib/cities.js — без импорта ESM из webapp.
 */
export const BOT_RU_CITIES = [
  'Москва',
  'Санкт-Петербург',
  'Новосибирск',
  'Екатеринбург',
  'Казань',
  'Нижний Новгород',
  'Челябинск',
  'Самара',
  'Омск',
  'Ростов-на-Дону',
  'Уфа',
  'Красноярск',
  'Воронеж',
  'Пермь',
  'Волгоград',
  'Краснодар',
  'Саратов',
  'Тюмень',
  'Тольятти',
  'Ижевск',
  'Барнаул',
  'Ульяновск',
  'Иркутск',
  'Хабаровск',
  'Ярославль',
  'Владивосток',
  'Махачкала',
  'Томск',
  'Оренбург',
  'Кемерово',
  'Новокузнецк',
  'Рязань',
  'Астрахань',
  'Пенза',
  'Липецк',
  'Киров',
  'Калининград',
  'Тула',
  'Курск',
  'Сочи',
  'Ставрополь',
  'Тверь',
  'Иваново',
  'Брянск',
  'Белгород',
  'Владимир',
  'Архангельск',
  'Смоленск',
  'Волжский',
  'Вологда',
  'Мурманск',
  'Кострома',
  'Новороссийск',
  'Таганрог',
  'Шахты',
  'Псков',
  'Великий Новгород',
]

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()
}

/** Стем для фильтра БД и матча словоформ. */
export function cityStem(city) {
  const c = norm(city)
  if (!c) return null
  if (c.startsWith('шахт')) return 'шахт'
  if (c.startsWith('москв')) return 'москв'
  if (c.includes('петербург') || c.includes('питер')) return 'петербург'
  if (c.endsWith('ске') && c.length > 5) return c.slice(0, -2)
  if (c.endsWith('ках') || c.endsWith('гах')) return c.slice(0, -2)
  if (c.endsWith('ах') && c.length > 4) return c.slice(0, -2)
  if (c.endsWith('ке') && c.length > 4) return c.slice(0, -1)
  if (c.endsWith('ом') && c.length > 4) return c.slice(0, -2)
  if ((c.endsWith('е') || c.endsWith('у') || c.endsWith('ы') || c.endsWith('и')) && c.length > 4) {
    return c.slice(0, -1)
  }
  if ((c.endsWith('а') || c.endsWith('я')) && c.length > 4) return c.slice(0, -1)
  return c
}

/** Город из известных: токен начинается со стема канона. */
export function matchKnownCityInText(text) {
  const tokens = norm(text)
    .split(/[^а-яa-z0-9\-]+/)
    .filter((t) => t.length >= 3)
  if (!tokens.length) return null

  const ranked = [...BOT_RU_CITIES].sort((a, b) => b.length - a.length)
  for (const city of ranked) {
    const stem = cityStem(city)
    if (!stem || stem.length < 3) continue
    for (const token of tokens) {
      if (token === norm(city)) return city
      if (token.startsWith(stem) && token.length <= stem.length + 4) return city
    }
  }
  return null
}

export function citiesMatch(a, b) {
  const sa = cityStem(a)
  const sb = cityStem(b)
  if (!sa || !sb) return false
  return sa === sb || sa.startsWith(sb) || sb.startsWith(sa)
}
