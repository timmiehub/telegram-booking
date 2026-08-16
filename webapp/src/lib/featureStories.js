/**
 * Highlights / stories на экране выбора роли.
 * question — знакомая боль (?); answer — как решаем.
 */

export const STORIES_SEEN_KEY = 'feature_stories_seen_v1'

export const FEATURE_STORIES = [
  {
    id: 'client',
    label: 'Клиенту',
    ringImage: 'stories/ring-client.webp',
    accent: 'client',
    slides: [
      {
        id: 'client-intro',
        forWhom: 'Для клиентов',
        title: 'Запись без переписки',
        question: 'Устали писать «есть окошко?» и ждать ответ?',
        answer: 'Выберите мастера и время сами — за пару касаний.',
        image: 'stories/slide-client-chaos.webp',
      },
      {
        id: 'client-book',
        forWhom: 'Для клиентов',
        title: 'Найти и записаться',
        question: 'Ссылки теряются и непонятно, куда писать?',
        answer: 'Поиск по городу или ссылка от мастера — запись в одном месте.',
        image: 'stories/slide-client-book.webp',
      },
      {
        id: 'client-remind',
        forWhom: 'Для клиентов',
        title: 'Напомним сами',
        question: 'Легко забыть про визит или опоздать с отменой?',
        answer: 'Бот напомнит заранее. Перенос и отмена — в приложении.',
        image: 'stories/slide-client-remind.webp',
      },
      {
        id: 'client-list',
        forWhom: 'Для клиентов',
        title: 'Все визиты рядом',
        question: 'Не помните, куда уже записались?',
        answer: '«Мои записи» всегда под рукой. Дальше — выберите «Я клиент».',
        image: 'stories/slide-client-list.webp',
      },
    ],
  },
  {
    id: 'master',
    label: 'Мастеру',
    ringImage: 'stories/ring-master.webp',
    accent: 'master',
    slides: [
      {
        id: 'master-intro',
        forWhom: 'Для мастеров',
        title: 'Кабинет вместо хаоса',
        question: 'Записи размазаны по чатам и заметкам?',
        answer: 'Ссылка, день, услуги и клиенты — в одном кабинете.',
        image: 'stories/slide-master-cabinet.webp',
      },
      {
        id: 'master-day',
        forWhom: 'Для мастеров',
        title: 'Меньше одних и тех же вопросов',
        question: 'Клиенты снова спрашивают «когда свободно?»',
        answer: 'Они сами выбирают окно. Вы видите день и принимаете записи.',
        image: 'stories/slide-master-day.webp',
      },
      {
        id: 'master-link',
        forWhom: 'Для мастеров',
        title: 'Своя ссылка на запись',
        question: 'Сложно собрать запись в Telegram без путаницы?',
        answer: 'Отправьте ссылку — клиент запишется сам. Дальше — «Я мастер».',
        image: 'stories/slide-master-link.webp',
      },
    ],
  },
  {
    id: 'pro',
    label: 'Pro',
    ringImage: 'stories/ring-pro.webp',
    accent: 'pro',
    slides: [
      {
        id: 'pro-intro',
        forWhom: 'Pro · для мастеров',
        title: 'Больше записей, меньше рутины',
        question: 'Бесплатного кабинета мало, когда хотите расти?',
        answer: 'Pro поднимает вас в поиске и закрывает ежедневную рутину.',
        image: 'stories/slide-pro-intro.webp',
      },
      {
        id: 'pro-search',
        forWhom: 'Pro',
        title: 'Выше в поиске',
        question: 'Новые клиенты вас не находят?',
        answer: 'Кабинет выше в поиске по городу — больше записей без рекламы.',
        image: 'stories/slide-pro-search.webp',
      },
      {
        id: 'pro-ai',
        forWhom: 'Pro',
        title: 'ИИ и тексты по окнам',
        question: 'Однотипные ответы и рассылки отнимают время?',
        answer: 'Черновики по свободным слотам и ответы в чате мастера.',
        image: 'stories/slide-pro-ai.webp',
      },
      {
        id: 'pro-brand',
        forWhom: 'Pro',
        title: 'Свой бренд в кабинете',
        question: 'Кабинет выглядит как у всех?',
        answer: 'Цвет кнопки и кадр шапки — кабинет под ваш стиль.',
        image: 'stories/slide-pro-brand.webp',
      },
      {
        id: 'pro-winback',
        forWhom: 'Pro',
        title: 'Возврат и цифры',
        question: 'Не видно, кто пропал и как идёт месяц?',
        answer: 'Кто давно не был — текст «написать». Неделя в кабинете и отчёт в Telegram.',
        image: 'stories/slide-pro-winback.webp',
      },
      {
        id: 'pro-tools',
        forWhom: 'Pro',
        title: 'Инструменты на каждый день',
        question: 'Нужны чёрный список, свои тексты и несколько адресов?',
        answer: 'Всё это в Pro. Подробности — в кабинете после входа.',
        image: 'stories/slide-pro-tools.webp',
      },
    ],
  },
]

export function loadSeenStoryIds() {
  try {
    const raw = localStorage.getItem(STORIES_SEEN_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function markStorySeen(storyId) {
  try {
    const set = loadSeenStoryIds()
    set.add(storyId)
    localStorage.setItem(STORIES_SEEN_KEY, JSON.stringify([...set]))
  } catch {
    // ignore quota / private mode
  }
}

/** Все URL картинок сторис — для предзагрузки. */
export function storyImageUrls(stories = FEATURE_STORIES) {
  const urls = []
  for (const s of stories) {
    if (s.ringImage) urls.push(s.ringImage)
    for (const slide of s.slides || []) {
      if (slide.image) urls.push(slide.image)
    }
  }
  return urls
}
