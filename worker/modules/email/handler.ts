import { currentUser } from '../../auth.js'
import { emailConfigurationError, sendTransactionalEmail } from './service.js'

type EmailEnv = {
  DB: D1Database
  BREVO_API_KEY?: string
  EMAIL_FROM?: string
  EMAIL_SENDER_NAME?: string
  EMAIL_REPLY_TO?: string
}

// This route deliberately only sends to the authenticated administrator. It is
// a configuration check, not a general-purpose mail relay.
export async function handleEmailRequest(request: Request, env: EmailEnv): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== '/api/email/test') return null
  if (request.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405 })

  const user = await currentUser(request, env)
  if (!user || user.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })

  const configurationError = emailConfigurationError(env)
  if (configurationError) return Response.json({ error: configurationError }, { status: 503 })

  try {
    const result = await sendTransactionalEmail(env, {
      to: user.email,
      subject: 'Teste de e-mail do Niorb',
      text: 'A integração do Niorb com a Brevo está funcionando.',
      tags: ['configuration-test'],
    })
    return Response.json({ ok: true, messageId: result.messageId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível enviar o e-mail de teste.'
    return Response.json({ error: message }, { status: 502 })
  }
}
