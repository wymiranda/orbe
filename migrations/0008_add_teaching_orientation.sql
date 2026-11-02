-- Pedagogical orientation belongs to the platform: it links people and refers
-- to workspace-owned content without copying either the content or progress.
CREATE TABLE teacher_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE teaching_relationships (
  id TEXT PRIMARY KEY NOT NULL,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'ended')),
  access_scope TEXT NOT NULL DEFAULT 'assignment_progress',
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  ended_at TEXT,
  UNIQUE (teacher_id, student_id)
);
CREATE INDEX idx_teaching_relationships_teacher ON teaching_relationships(teacher_id, status);
CREATE INDEX idx_teaching_relationships_student ON teaching_relationships(student_id, status);

CREATE TABLE learning_objectives (
  id TEXT PRIMARY KEY NOT NULL,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  autonomy_mode TEXT NOT NULL CHECK (autonomy_mode IN ('niorb_guided', 'collaborative', 'teacher_directed')),
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_learning_objectives_teacher ON learning_objectives(teacher_id, updated_at DESC);

CREATE TABLE learning_objective_activities (
  id TEXT PRIMARY KEY NOT NULL,
  objective_id TEXT NOT NULL REFERENCES learning_objectives(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('introduce', 'review', 'verify')),
  skill TEXT NOT NULL,
  content_json TEXT NOT NULL,
  UNIQUE (objective_id, position)
);

CREATE TABLE learning_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  objective_id TEXT NOT NULL REFERENCES learning_objectives(id) ON DELETE RESTRICT,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_id TEXT NOT NULL REFERENCES teaching_relationships(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('assigned', 'started', 'completed', 'cancelled')),
  assigned_at TEXT NOT NULL,
  due_at TEXT,
  completed_at TEXT
);
CREATE INDEX idx_learning_assignments_student ON learning_assignments(student_id, status, assigned_at DESC);
CREATE INDEX idx_learning_assignments_teacher ON learning_assignments(teacher_id, status, assigned_at DESC);

CREATE TABLE learning_assignment_executions (
  id TEXT PRIMARY KEY NOT NULL,
  assignment_id TEXT NOT NULL REFERENCES learning_assignments(id) ON DELETE CASCADE,
  study_session_log_id TEXT REFERENCES user_study_session_logs(id) ON DELETE SET NULL,
  activity_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed')),
  result_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_learning_assignment_executions_assignment ON learning_assignment_executions(assignment_id, started_at DESC);
