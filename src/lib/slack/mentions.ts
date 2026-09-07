/**
 * IDs de Slack del equipo, en un solo lugar.
 *
 * El bot manda por incoming webhook, que está atado a un canal fijo: no se
 * pueden mandar DMs. Lo que sí funciona es mencionar a la persona con el
 * formato `<@Uxxxx>`, que le dispara la notificación personal aunque el
 * mensaje vaya al canal de siempre. Ojo: escribir "@Nombre" como texto plano
 * NO notifica a nadie.
 */
export const SLACK_USERS = {
  marcelo: 'U05E1HSENUX',
  eze: 'U04NYTTLP8Q',
  maru: 'U07CG1QEV19',
  angela: 'U086ZR5411T',
} as const

export type SlackUserKey = keyof typeof SLACK_USERS

/** `mention('marcelo')` → `<@U05E1HSENUX>` */
export function mention(user: SlackUserKey): string {
  return `<@${SLACK_USERS[user]}>`
}

/** `mentions(['marcelo', 'eze'])` → `<@U05E1HSENUX> <@U04NYTTLP8Q>` */
export function mentions(users: SlackUserKey[]): string {
  return users.map(mention).join(' ')
}
