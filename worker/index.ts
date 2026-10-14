export default {
  fetch(request: Request): Response {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return Response.json({ status: 'ok' })
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler
