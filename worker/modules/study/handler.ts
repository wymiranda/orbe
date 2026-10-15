type StudyEnv = { DB: D1Database }

// Deck definitions are shared content. Cards, review history and vocabulary status
// remain on each device in the Chinese workspace.
export async function handleStudyRequest(request: Request, env: StudyEnv): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname === '/api/study/decks' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, name, description FROM study_decks ORDER BY name COLLATE NOCASE').all()
    return Response.json(results)
  }
  return null
}
