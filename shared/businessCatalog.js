/**
 * Единый каталог категорий и словаря поиска (webapp + bot).
 */

export const BUSINESS_CATEGORIES = [
  {
    id: 'barbershop',
    label: 'Барбершоп',
    aliases: ['барбер', 'barber', 'парикмахер', 'стрижка', 'fade'],
  },
  {
    id: 'salon',
    label: 'Салон красоты',
    aliases: ['салон', 'красота', 'бьюти', 'beauty'],
  },
  {
    id: 'nails',
    label: 'Ногтевой сервис',
    aliases: ['ногти', 'маникюр', 'педикюр', 'шеллак', 'nail'],
  },
  {
    id: 'brows',
    label: 'Брови / ресницы',
    aliases: ['брови', 'ресницы', 'ламинирование', 'лами'],
  },
  {
    id: 'tattoo',
    label: 'Тату / пирсинг',
    aliases: ['тату', 'tattoo', 'tats', 'пирсинг', 'татуировка'],
  },
  {
    id: 'massage',
    label: 'Массаж / SPA',
    aliases: ['массаж', 'spa', 'спа', 'массажист'],
  },
  {
    id: 'cosmetology',
    label: 'Косметология',
    aliases: ['косметолог', 'косметология', 'пилинг', 'лицо'],
  },
  {
    id: 'makeup',
    label: 'Визаж / макияж',
    aliases: ['макияж', 'визаж', 'визажист', 'makeup'],
  },
  {
    id: 'epilation',
    label: 'Эпиляция',
    aliases: ['эпиляция', 'депиляция', 'шугаринг', 'воск'],
  },
  {
    id: 'tutor',
    label: 'Репетитор / школа',
    aliases: ['репетитор', 'урок', 'школа', 'учитель', 'tutor'],
  },
  {
    id: 'other',
    label: 'Другое',
    aliases: ['другое', 'other'],
  },
]

export const BUSINESS_TYPE_IDS = BUSINESS_CATEGORIES.map((c) => c.id)

export const TYPE_LABELS = Object.fromEntries(
  BUSINESS_CATEGORIES.map((c) => [c.id, c.label]),
)

/** Невидимые ключевые слова по типу (как будто прикреплены к карточке). */
export const TYPE_KEYWORDS = {
  barbershop: [
    'барбер',
    'барбершоп',
    'barber',
    'barbershop',
    'парикмах',
    'парикмахер',
    'парикмахерская',
    'стрижк',
    'стрижка',
    'fade',
    'фейд',
    'мужская стрижк',
    'бород',
    'укладк',
    'hair',
    'haircut',
  ],
  salon: [
    'салон',
    'салон красоты',
    'красот',
    'бьюти',
    'beauty',
  ],
  nails: [
    'маникюр',
    'педикюр',
    'ногти',
    'шеллак',
    'nail',
    'nails',
    'ноготки',
  ],
  brows: [
    'брови',
    'ресниц',
    'ламинир',
    'лами',
    'наращивание ресниц',
  ],
  tattoo: [
    'тату',
    'татуиров',
    'tattoo',
    'tats',
    'пирсинг',
    'piercing',
  ],
  massage: [
    'массаж',
    'массажист',
    'massage',
    'спа',
    'spa',
  ],
  cosmetology: [
    'косметолог',
    'косметология',
    'чистка лица',
    'пилинг',
    'пиллинг',
  ],
  makeup: [
    'макияж',
    'визаж',
    'визажист',
    'makeup',
  ],
  epilation: [
    'эпиляц',
    'эпиляция',
    'депиляц',
    'шугаринг',
    'воск',
  ],
  tutor: [
    'репетитор',
    'учитель',
    'урок',
    'занятие',
    'курс',
    'школа',
    'обучен',
    'консультац',
    'ментор',
    'коуч',
    'coach',
  ],
  other: [],
}

/**
 * Группы: канон услуги → термины + типы.
 * matchByType: true — добор заведений этих типов.
 * Не ставить сюда широкий type «salon»: иначе «маник» находит любой салон
 * (в т.ч. только брови/ресницы) без услуги в каталоге.
 */
export const SYNONYM_GROUPS = [
  {
    canon: 'барбер',
    terms: [
      'стрижк',
      'стрижка',
      'стрижки',
      'стрижку',
      'стрижкой',
      'барбер',
      'барбера',
      'барберу',
      'барберы',
      'барбершоп',
      'барбершопа',
      'barber',
      'barbershop',
      'парикмах',
      'парикмахер',
      'парикмахера',
      'парикмахерская',
      'парикмахерскую',
      'парикмахерской',
      'hair',
      'haircut',
      'fade',
      'фейд',
      'бород',
      'борода',
      'усы',
    ],
    businessTypes: ['barbershop'],
    matchByType: true,
  },
  {
    canon: 'ногти',
    terms: [
      'маникюр',
      'маникюра',
      'маникюру',
      'педикюр',
      'педикюра',
      'ногти',
      'ногтей',
      'ноготки',
      'шеллак',
      'маник',
      'nail',
      'nails',
      'гель',
      'наращивание ногт',
    ],
    businessTypes: ['nails'],
    matchByType: true,
  },
  {
    canon: 'массаж',
    terms: [
      'массаж',
      'массажа',
      'массажу',
      'массажем',
      'массажи',
      'массажный',
      'массажная',
      'массажное',
      'массажист',
      'массажиста',
      'massage',
      'спа',
      'spa',
      'тайский массаж',
      'классический массаж',
      'антицеллюлит',
    ],
    businessTypes: ['massage'],
    matchByType: true,
  },
  {
    canon: 'брови',
    terms: [
      'брови',
      'бровей',
      'бровь',
      'ресниц',
      'ресницы',
      'ламинир',
      'ламинирование',
      'бров',
      'архитектура бровей',
      'наращивание ресниц',
      'лами',
    ],
    businessTypes: ['brows'],
    matchByType: true,
  },
  {
    canon: 'тату',
    terms: [
      'тату',
      'татуиров',
      'татуировка',
      'tattoo',
      'tats',
      'пирсинг',
      'piercing',
      'перманент',
      'перманентный макияж',
      'микроблейдинг',
    ],
    businessTypes: ['tattoo'],
    matchByType: true,
  },
  {
    canon: 'косметология',
    terms: [
      'косметолог',
      'косметолога',
      'косметология',
      'чистка лица',
      'уход за лицом',
      'пиллинг',
      'пилинг',
      'лицо',
    ],
    businessTypes: ['cosmetology'],
    matchByType: true,
  },
  {
    canon: 'макияж',
    terms: ['макияж', 'визаж', 'визажист', 'makeup', 'свадебный макияж'],
    businessTypes: ['makeup'],
    matchByType: true,
  },
  {
    canon: 'эпиляция',
    terms: [
      'эпиляц',
      'эпиляция',
      'депиляц',
      'депиляция',
      'шугаринг',
      'воск',
      'лазерная эпиляция',
    ],
    businessTypes: ['epilation'],
    matchByType: true,
  },
  {
    canon: 'репетитор',
    terms: [
      'репетитор',
      'репетитора',
      'учитель',
      'урок',
      'уроки',
      'занятие',
      'занятия',
      'курс',
      'курсы',
      'школа',
      'обучен',
      'английский',
      'математика',
    ],
    businessTypes: ['tutor'],
    matchByType: true,
  },
  {
    canon: 'консультация',
    terms: [
      'консультация',
      'консультации',
      'консультац',
      'ментор',
      'коуч',
      'coach',
      'chatgpt',
      'gpt',
    ],
    patterns: [/\bии\b/i, /\bai\b/i, /по\s+ии/i, /искусственн\w*\s+интеллект/i],
    businessTypes: ['tutor', 'other'],
    matchByType: false,
  },
]

export const MAX_SEARCH_TAGS = 8
export const MAX_TAG_LEN = 24

export function isValidBusinessType(type) {
  return BUSINESS_TYPE_IDS.includes(type)
}

export function categoryLabel(type) {
  return TYPE_LABELS[type] || TYPE_LABELS.other
}

export function filterCategories(query, limit = 20) {
  const q = String(query || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()
  const list = !q
    ? BUSINESS_CATEGORIES
    : BUSINESS_CATEGORIES.filter((c) => {
        const hay = [c.label, c.id, ...(c.aliases || [])]
          .join(' ')
          .toLowerCase()
          .replace(/ё/g, 'е')
        return hay.includes(q) || q.includes(c.id)
      })
  return list.slice(0, limit)
}

export function normalizeSearchTag(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s+#.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAG_LEN)
}

export function normalizeSearchTags(list) {
  const out = []
  const seen = new Set()
  for (const item of list || []) {
    const t = normalizeSearchTag(item)
    if (t.length < 2) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= MAX_SEARCH_TAGS) break
  }
  return out
}
