import { currentUser } from '../../auth.js'
import { loadChineseSentences } from '../chinese/sentence-corpus.js'

type TeachingEnv = { DB: D1Database; CHINESE_DB: D1Database }
type AutonomyMode = 'niorb_guided' | 'collaborative' | 'teacher_directed'
type ActivityInput = { workspaceId?: unknown; moduleId?: unknown; mode?: unknown; skill?: unknown; contentIds?: unknown }

const modes = new Set<AutonomyMode>(['niorb_guided', 'collaborative', 'teacher_directed'])
const activityModes = new Set(['introduce', 'review', 'verify'])
const skills = new Set(['exposure', 'recognition', 'comprehension', 'production', 'retention'])

function invalid(message: string) { return Response.json({ error: message }, { status: 400 }) }
async function teacherFor(request: Request, env: TeachingEnv) {
  const user = await currentUser(request, env)
  if (!user) return null
  if (user.role === 'admin') return user
  const teacher = await env.DB.prepare('SELECT 1 FROM teacher_profiles WHERE user_id = ?').bind(user.id).first()
  return teacher ? user : null
}

export async function handleTeachingRequest(request: Request, env: TeachingEnv): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/teaching')) return null
  const teacher = await teacherFor(request, env)
  if (!teacher) return Response.json({ error: 'Acesso restrito a professores.' }, { status: 403 })

  // Niorb's sentence library, inactive sentences included, for teachers to organise.
  if (url.pathname === '/api/teaching/sentences' && request.method === 'GET') return Response.json(await loadChineseSentences(env.CHINESE_DB, { includeInactive: true }))

  if (url.pathname === '/api/teaching/students' && request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT relationships.id, relationships.status, relationships.student_id, users.email, users.display_name
      FROM teaching_relationships relationships JOIN users ON users.id = relationships.student_id
      WHERE relationships.teacher_id = ? ORDER BY users.display_name COLLATE NOCASE, users.email COLLATE NOCASE`).bind(teacher.id).all()
    return Response.json(results)
  }

  if (url.pathname === '/api/teaching/students' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as { email?: unknown } | null
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email) return invalid('Informe o e-mail do aluno.')
    const student = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>()
    if (!student) return Response.json({ error: 'Nenhum aluno com esse e-mail foi encontrado.' }, { status: 404 })
    if (student.id === teacher.id) return invalid('Professor e aluno precisam ser pessoas diferentes.')
    const now = new Date().toISOString()
    await env.DB.prepare(`INSERT INTO teaching_relationships (id, teacher_id, student_id, status, created_at, accepted_at)
      VALUES (?, ?, ?, 'active', ?, ?)
      ON CONFLICT(teacher_id, student_id) DO UPDATE SET status = 'active', accepted_at = excluded.accepted_at, ended_at = NULL`).bind(crypto.randomUUID(), teacher.id, student.id, now, now).run()
    return Response.json({ ok: true }, { status: 201 })
  }

  if (url.pathname === '/api/teaching/objectives' && request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT objectives.id, objectives.title, objectives.language, objectives.autonomy_mode, objectives.description, objectives.updated_at,
      COUNT(activities.id) AS activity_count FROM learning_objectives objectives
      LEFT JOIN learning_objective_activities activities ON activities.objective_id = objectives.id
      WHERE objectives.teacher_id = ? GROUP BY objectives.id ORDER BY objectives.updated_at DESC`).bind(teacher.id).all()
    return Response.json(results)
  }

  if (url.pathname === '/api/teaching/objectives' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as { title?: unknown; language?: unknown; autonomyMode?: unknown; description?: unknown; activities?: unknown } | null
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const language = typeof body?.language === 'string' ? body.language.trim() : ''
    const autonomyMode = body?.autonomyMode
    const description = typeof body?.description === 'string' ? body.description.trim() : null
    const activities = Array.isArray(body?.activities) ? body.activities as ActivityInput[] : []
    if (!title || title.length > 120 || !language || !modes.has(autonomyMode as AutonomyMode) || !activities.length) return invalid('Preencha título, idioma, modalidade e ao menos uma atividade.')
    const parsed = activities.map((activity) => ({
      workspaceId: typeof activity.workspaceId === 'string' ? activity.workspaceId.trim() : '',
      moduleId: typeof activity.moduleId === 'string' ? activity.moduleId.trim() : '',
      mode: activity.mode,
      skill: activity.skill,
      contentIds: Array.isArray(activity.contentIds) && activity.contentIds.length <= 100 && activity.contentIds.every((id) => typeof id === 'string' && id.trim()) ? activity.contentIds : null,
    }))
    if (parsed.some((activity) => !activity.workspaceId || !activity.moduleId || !activityModes.has(activity.mode as string) || !skills.has(activity.skill as string) || !activity.contentIds)) return invalid('Uma atividade possui configuração incompatível.')
    const id = crypto.randomUUID(); const now = new Date().toISOString()
    await env.DB.batch([
      env.DB.prepare('INSERT INTO learning_objectives (id, teacher_id, title, language, autonomy_mode, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, teacher.id, title, language, autonomyMode, description || null, now, now),
      ...parsed.map((activity, position) => env.DB.prepare('INSERT INTO learning_objective_activities (id, objective_id, position, workspace_id, module_id, mode, skill, content_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, position, activity.workspaceId, activity.moduleId, activity.mode, activity.skill, JSON.stringify(activity.contentIds))),
    ])
    return Response.json({ id }, { status: 201 })
  }

  if (url.pathname === '/api/teaching/assignments' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as { objectiveId?: unknown; relationshipId?: unknown; dueAt?: unknown } | null
    const objectiveId = typeof body?.objectiveId === 'string' ? body.objectiveId : ''
    const relationshipId = typeof body?.relationshipId === 'string' ? body.relationshipId : ''
    const dueAt = typeof body?.dueAt === 'string' && Number.isFinite(Date.parse(body.dueAt)) ? body.dueAt : null
    const relationship = await env.DB.prepare("SELECT student_id FROM teaching_relationships WHERE id = ? AND teacher_id = ? AND status = 'active'").bind(relationshipId, teacher.id).first<{ student_id: string }>()
    const objective = await env.DB.prepare('SELECT id FROM learning_objectives WHERE id = ? AND teacher_id = ?').bind(objectiveId, teacher.id).first()
    if (!relationship || !objective) return invalid('Aluno ou objetivo não está disponível para atribuição.')
    const now = new Date().toISOString(); const id = crypto.randomUUID()
    await env.DB.prepare("INSERT INTO learning_assignments (id, objective_id, teacher_id, student_id, relationship_id, status, assigned_at, due_at) VALUES (?, ?, ?, ?, ?, 'assigned', ?, ?)").bind(id, objectiveId, teacher.id, relationship.student_id, relationshipId, now, dueAt).run()
    return Response.json({ id }, { status: 201 })
  }

  if (url.pathname === '/api/teaching/dashboard' && request.method === 'GET') {
    const [students, assignments] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM teaching_relationships WHERE teacher_id = ? AND status = 'active'").bind(teacher.id).first<{ count: number }>(),
      env.DB.prepare("SELECT status, COUNT(*) AS count FROM learning_assignments WHERE teacher_id = ? GROUP BY status").bind(teacher.id).all<{ status: string; count: number }>(),
    ])
    return Response.json({ students: students?.count ?? 0, assignments: Object.fromEntries(assignments.results.map((row) => [row.status, row.count])) })
  }

  return Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
}
