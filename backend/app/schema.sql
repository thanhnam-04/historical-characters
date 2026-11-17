CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active',
    password_hash TEXT, identity_id TEXT UNIQUE, quota INTEGER NOT NULL DEFAULT 60,
    created_at INTEGER NOT NULL, last_login INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bootstrap (slot INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL,
    model TEXT, status TEXT NOT NULL DEFAULT 'complete'
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS usage (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
    model TEXT NOT NULL, status TEXT NOT NULL, units INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS locks (user_id TEXT PRIMARY KEY REFERENCES users(id), request_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS conversations_owner ON conversations(user_id,updated_at);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,created_at);
CREATE INDEX IF NOT EXISTS usage_user_date ON usage(user_id,created_at);

CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, name TEXT NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL);
