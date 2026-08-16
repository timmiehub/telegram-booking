/** Пресеты услуг по типу заведения — без AI */
export const SERVICE_PRESETS = {
  barbershop: [
    { title: 'Стрижка', duration_min: 45, price_rub: 1500 },
    { title: 'Стрижка + борода', duration_min: 60, price_rub: 2200 },
    { title: 'Борода', duration_min: 30, price_rub: 900 },
    { title: 'Детская стрижка', duration_min: 30, price_rub: 1000 },
    { title: 'Камуфляж седины', duration_min: 30, price_rub: 800 },
    { title: 'Укладка', duration_min: 20, price_rub: 600 },
  ],
  salon: [
    { title: 'Стрижка женская', duration_min: 60, price_rub: 2500 },
    { title: 'Окрашивание', duration_min: 120, price_rub: 4500 },
    { title: 'Укладка', duration_min: 40, price_rub: 1800 },
    { title: 'Маникюр', duration_min: 60, price_rub: 2000 },
    { title: 'Брови', duration_min: 30, price_rub: 900 },
    { title: 'Консультация', duration_min: 20, price_rub: 0 },
  ],
  nails: [
    { title: 'Маникюр', duration_min: 60, price_rub: 2000 },
    { title: 'Педикюр', duration_min: 60, price_rub: 2500 },
    { title: 'Снятие покрытия', duration_min: 20, price_rub: 500 },
    { title: 'Наращивание', duration_min: 120, price_rub: 3500 },
  ],
  brows: [
    { title: 'Оформление бровей', duration_min: 40, price_rub: 1200 },
    { title: 'Ламинирование бровей', duration_min: 60, price_rub: 2500 },
    { title: 'Наращивание ресниц', duration_min: 90, price_rub: 3500 },
    { title: 'Ламинирование ресниц', duration_min: 60, price_rub: 2800 },
  ],
  tattoo: [
    { title: 'Консультация', duration_min: 30, price_rub: 0 },
    { title: 'Сеанс тату', duration_min: 120, price_rub: 5000 },
    { title: 'Коррекция', duration_min: 60, price_rub: 2500 },
    { title: 'Пирсинг', duration_min: 30, price_rub: 2000 },
  ],
  massage: [
    { title: 'Классический массаж', duration_min: 60, price_rub: 3000 },
    { title: 'Массаж спины', duration_min: 40, price_rub: 2200 },
    { title: 'Антицеллюлитный', duration_min: 60, price_rub: 3500 },
    { title: 'SPA-уход', duration_min: 90, price_rub: 4500 },
  ],
  cosmetology: [
    { title: 'Чистка лица', duration_min: 60, price_rub: 3500 },
    { title: 'Пилинг', duration_min: 45, price_rub: 3000 },
    { title: 'Уход за лицом', duration_min: 60, price_rub: 4000 },
    { title: 'Консультация', duration_min: 20, price_rub: 0 },
  ],
  makeup: [
    { title: 'Дневной макияж', duration_min: 45, price_rub: 2500 },
    { title: 'Вечерний макияж', duration_min: 60, price_rub: 3500 },
    { title: 'Свадебный макияж', duration_min: 90, price_rub: 6000 },
  ],
  epilation: [
    { title: 'Шугаринг ноги', duration_min: 45, price_rub: 2000 },
    { title: 'Шугаринг подмышки', duration_min: 20, price_rub: 800 },
    { title: 'Лазерная эпиляция', duration_min: 40, price_rub: 3500 },
  ],
  tutor: [
    { title: 'Урок 45 мин', duration_min: 45, price_rub: 1500 },
    { title: 'Урок 60 мин', duration_min: 60, price_rub: 2000 },
    { title: 'Пробный урок', duration_min: 30, price_rub: 0 },
    { title: 'Домашнее задание / разбор', duration_min: 30, price_rub: 800 },
  ],
  other: [
    { title: 'Консультация', duration_min: 30, price_rub: 1000 },
    { title: 'Основная услуга', duration_min: 60, price_rub: 2000 },
    { title: 'Экспресс', duration_min: 20, price_rub: 700 },
  ],
}

export function presetsForType(type) {
  return SERVICE_PRESETS[type] || SERVICE_PRESETS.other
}
