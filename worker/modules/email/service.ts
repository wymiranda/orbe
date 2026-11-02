type EmailEnv = {
  BREVO_API_KEY?: string
  EMAIL_FROM?: string
  EMAIL_SENDER_NAME?: string
  EMAIL_REPLY_TO?: string
}

export type TransactionalEmail = {
  to: string
  subject: string
  text: string
  html?: string
  tags?: string[]
}

const validAddress = (value: string) => /^\S+@\S+\.\S+$/.test(value)
const trim = (value: string | undefined) => value?.trim() ?? ''

export function emailConfigurationError(env: EmailEnv) {
  if (!trim(env.BREVO_API_KEY)) return 'BREVO_API_KEY não está configurada.'
  if (!validAddress(trim(env.EMAIL_FROM))) return 'EMAIL_FROM precisa ser um e-mail válido.'
  if (trim(env.EMAIL_REPLY_TO) && !validAddress(trim(env.EMAIL_REPLY_TO))) return 'EMAIL_REPLY_TO precisa ser um e-mail válido.'
  return null
}

export async function sendTransactionalEmail(env: EmailEnv, email: TransactionalEmail) {
  const configurationError = emailConfigurationError(env)
  if (configurationError) throw new Error(configurationError)
  if (!validAddress(email.to)) throw new Error('Destinatário de e-mail inválido.')
  if (!email.subject.trim() || !email.text.trim()) throw new Error('Assunto e texto do e-mail são obrigatórios.')

  const sender = { email: trim(env.EMAIL_FROM), ...(trim(env.EMAIL_SENDER_NAME) ? { name: trim(env.EMAIL_SENDER_NAME) } : {}) }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'api-key': trim(env.BREVO_API_KEY) },
    body: JSON.stringify({
      sender,
      to: [{ email: email.to }],
      ...(trim(env.EMAIL_REPLY_TO) ? { replyTo: { email: trim(env.EMAIL_REPLY_TO) } } : {}),
      subject: email.subject,
      textContent: email.text,
      ...(email.html ? { htmlContent: email.html } : {}),
      ...(email.tags?.length ? { tags: email.tags.slice(0, 5) } : {}),
    }),
  })

  if (!response.ok) {
    // Do not log the recipient, content, or API key. Those are personal data/secrets.
    throw new Error(`Brevo recusou o envio (HTTP ${response.status}).`)
  }
  const result = await response.json().catch(() => null) as { messageId?: string } | null
  return { messageId: result?.messageId ?? null }
}

export async function sendInactivityDataWarning(env: EmailEnv, to: string) {
  return sendTransactionalEmail(env, {
    to,
    subject: 'Seu progresso no Niorb será removido em breve',
    text: 'Você está há algum tempo sem acessar o Niorb. Para manter o progresso dos seus cards, basta entrar novamente. Caso contrário, ele poderá ser removido conforme nossa política de retenção.',
    tags: ['inactivity-warning'],
  })
}
