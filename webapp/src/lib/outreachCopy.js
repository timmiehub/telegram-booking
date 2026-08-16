import { BOT_USERNAME } from './inviteLinks'
import { FEEDBACK_TG } from './lifetimePro'

/** Готовые тексты от Тимура для VK / Instagram / лички / чатов. */

export function buildMasterStartLink(source = 'master') {
  const src = String(source || 'master').trim().toLowerCase() || 'master'
  return `https://t.me/${BOT_USERNAME}?start=${src}`
}

export function outreachVk() {
  return `Привет, я Тимур.

Собрал в Telegram бота «Моя запись» — чтобы мастерам не отвечать по 20 раз «а можно завтра?». Клиент сам берёт время по ссылке, вам приходит слот, перед визитом уходит напоминание.

Кабинет бесплатный. Если что — пишите мне @${FEEDBACK_TG}.

Попробовать: ${buildMasterStartLink('vk')}`
}

export function outreachIg() {
  return `Я Тимур, сделал бота записи в Telegram для мастеров — без переписки «можно завтра?». Кабинет бесплатный.
${buildMasterStartLink('ig')} · @${FEEDBACK_TG}`
}

export function outreachStories() {
  return `Сделал бота записи для мастеров в Telegram. Кабинет бесплатный.
${buildMasterStartLink('story')} · @${FEEDBACK_TG}`
}

/** Холодная личка: одно сообщение. */
export function outreachDmMaster() {
  return `Привет! Я Тимур, разработчик.

Делаю в Телеге штуку для записи: кидаешь клиенту ссылку — он сам выбирает услугу и время. Тебе приходит запись, перед визитом уходит напоминание. Чтобы не ловить весь день «а можно завтра?» в личке.

Бесплатно: кабинет, услуги, расписание, ссылка, напоминания. Платить ничего не нужно, чтобы начать.

Бот: @${BOT_USERNAME}

Сейчас ищу мастеров, кто просто попробует и напишет, что криво или чего не хватает. Я сам отвечаю, не бот. Если после теста ок — могу дать Pro на год за честный отзыв.

Если интересно — зайди в бота или напиши «хочу», разберёмся.`
}

/** Follow-up, только если мастер уже ответил. */
export function outreachDmFollowup() {
  return `Ок, спасибо)

Зайди в @${BOT_USERNAME}, там кабинет: услуги, окна, ссылка для клиентов. Если что-то непонятно или ломается — пиши сюда или @${FEEDBACK_TG}, я сам смотрю.

После теста скажи честно, что зашло / что нет. По отзыву потом подскажу про годовой Pro.`
}

/** Ультракороткий cold DM при большом объёме. */
export function outreachDmShort() {
  return `Привет, я Тимур — делаю запись клиентов в Телеге. Ссылка → клиент сам выбирает время → тебе слот и напоминание. Кабинет и напоминания бесплатно.

@${BOT_USERNAME}

Нужны живые отзывы: что бесит, чего не хватает. Я на связи сам. За отзыв после теста могу дать Pro на год. Напиши, если интересно.`
}

export function outreachChatPost() {
  return `Привет, я Тимур. Собрал бота «Моя запись» для тех, кто ведёт клиентов в Telegram: человек жмёт ссылку, выбирает услугу и окно, вам приходит слот, напоминание уходит само. Кабинет бесплатный: ${buildMasterStartLink('chat')}
Пишите @${FEEDBACK_TG}, если что.`
}

export function outreachPack() {
  return {
    vk: outreachVk(),
    ig: outreachIg(),
    stories: outreachStories(),
    dm: outreachDmMaster(),
    dmFollowup: outreachDmFollowup(),
    dmShort: outreachDmShort(),
    chat: outreachChatPost(),
    links: {
      master: buildMasterStartLink('master'),
      dm: buildMasterStartLink('dm'),
      vk: buildMasterStartLink('vk'),
      ig: buildMasterStartLink('ig'),
      chat: buildMasterStartLink('chat'),
      story: buildMasterStartLink('story'),
    },
  }
}
