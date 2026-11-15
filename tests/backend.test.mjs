import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleApi } from '../server/api.mjs';
const sql = readFileSync(new URL('../drizzle/0000_wet_fenris.sql', import.meta.url), 'utf8');
const origin = 'https://localhost';
class D1 {
    constructor() { this.sqlite = new DatabaseSync(':memory:'); this.sqlite.exec('PRAGMA foreign_keys=ON;' + sql); }
    prepare(sql) { const db = this.sqlite; let args = []; const stmt = { bind(...values) { args = values; return stmt; }, first() { return db.prepare(sql).get(...args) || null; }, all() { return { results: db.prepare(sql).all(...args) }; }, run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; } }; return stmt; }
    batch(stmts) { this.sqlite.exec('BEGIN'); try {
        const result = stmts.map(s => s.run());
        this.sqlite.exec('COMMIT');
        return result;
    }
    catch (e) {
        this.sqlite.exec('ROLLBACK');
        throw e;
    } }
}
const envFor = (mode = 'password') => ({ DB: new D1(), APP_SECRET: 'test-secret-not-used-in-production-1234567890', OWNER_EMAIL: 'owner@example.com', AUTH_MODE: mode });
function request(env, path, { method = 'GET', data, session, headers = {}, fetch } = {}) { const h = new Headers(headers); if (session?.cookie)
    h.set('cookie', session.cookie); if (session?.csrf)
    h.set('x-csrf-token', session.csrf); if (method !== 'GET') {
    if (!h.has('origin'))
        h.set('origin', origin);
    h.set('content-type', 'application/json');
} return handleApi(new Request(origin + '/api/' + path, { method, headers: h, body: data === undefined ? undefined : JSON.stringify(data) }), env, { fetch }); }
async function json(env, path, options = {}) { const r = await request(env, path, options); const d = await r.json(); return { r, d }; }
async function sessionFrom(r) { const data = await r.json(); return { ...data, cookie: r.headers.get('set-cookie')?.split(';')[0] }; }
const setup = async (env) => sessionFrom(await request(env, 'auth/setup', { method: 'POST', data: { name: 'Admin gốc', email: 'admin@example.com', password: 'Admin password 123!' } }));
const register = async (env, email = 'user@example.com') => sessionFrom(await request(env, 'auth/register', { method: 'POST', data: { name: 'Người dùng', email, password: 'User password 123!', role: 'admin', quota: 99999 } }));
async function conv(env, session) { const { d, r } = await json(env, 'conversations', { method: 'POST', data: {}, session }); assert.equal(r.status, 201); return d.conversation; }
async function configure(env, admin) { const result = await json(env, 'admin/config', { method: 'PATCH', session: admin, data: { apiKey: 'sk-or-fake-key-for-tests-only', config: { chatModel: 'openrouter/free', ttsModel: 'fish-audio/s2.1-pro-free:free' } } }); assert.equal(result.r.status, 200); }
function mockChat(url, options) { assert.equal(options.headers.Authorization, 'Bearer sk-or-fake-key-for-tests-only'); const payload = JSON.parse(options.body); assert.equal(payload.model, 'openrouter/free'); assert.equal(payload.messages[0].role, 'system'); const text = 'Xin chào, mình là rồng Long Vân!'; const bytes = new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\ndata: [DONE]\n\n'); return Promise.resolve(new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 7)
        c.enqueue(bytes.slice(i, i + 7)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } })); }
test('Authentication, roles, CSRF and session lifecycle', async () => {
    const env = envFor();
    assert.equal((await request(env, 'me')).status, 401);
    assert.equal((await request(env, 'admin/users')).status, 401);
    const noOrigin = await request(env, 'auth/setup', { method: 'POST', headers: { origin: 'https://evil.example' }, data: {} });
    assert.equal(noOrigin.status, 403);
    const rootResponse = await request(env, 'auth/setup', { method: 'POST', data: { name: 'Admin', email: 'admin@example.com', password: 'Admin password 123!' } });
    assert.equal(rootResponse.status, 200);
    assert.match(rootResponse.headers.get('set-cookie'), /HttpOnly/);
    assert.match(rootResponse.headers.get('set-cookie'), /Secure/);
    const admin = await sessionFrom(rootResponse);
    assert.equal(admin.user.role, 'admin');
    assert.equal((await request(env, 'auth/setup', { method: 'POST', data: {} })).status, 409);
    const user = await register(env);
    assert.equal(user.user.role, 'user');
    assert.equal(user.user.quota, 60);
    assert.equal((await request(env, 'admin/users', { session: user })).status, 403);
    assert.equal((await request(env, 'conversations', { method: 'POST', session: { cookie: user.cookie }, data: {} })).status, 403);
    assert.equal((await request(env, 'conversations', { method: 'POST', session: user, headers: { origin: 'https://evil.example' }, data: {} })).status, 403);
    assert.equal((await request(env, 'auth/login', { method: 'POST', data: { email: 'user@example.com', password: 'wrong' } })).status, 401);
    const changed = await request(env, 'profile/password', { method: 'POST', session: user, data: { currentPassword: 'User password 123!', password: 'A new password 123!' } });
    assert.equal(changed.status, 200);
    const newSession = await sessionFrom(changed);
    assert.equal((await request(env, 'me', { session: user })).status, 401);
    assert.equal((await request(env, 'me', { session: newSession })).status, 200);
    const dbUser = env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.user.id).first();
    assert(!dbUser.password_hash.includes('password 123!'));
    const profile = (await json(env, 'me', { session: newSession })).d;
    assert(!JSON.stringify(profile).includes('password_hash'));
    const logout = await request(env, 'auth/logout', { method: 'POST', session: newSession, data: {} });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await request(env, 'me', { session: newSession })).status, 401);
});
test('Conversation ownership, archive/restore, export and server-owned AI configuration', async () => {
    const env = envFor(), admin = await setup(env), a = await register(env, 'a@example.com'), b = await register(env, 'b@example.com');
    await configure(env, admin);
    const c = await conv(env, a);
    assert.equal((await request(env, 'conversations/' + c.id, { session: b })).status, 404);
    assert.equal((await request(env, 'conversations/' + c.id, { method: 'PATCH', session: b, data: { title: 'stolen' } })).status, 404);
    assert.equal((await request(env, 'admin/config', { method: 'PATCH', session: b, data: { apiKey: 'sk-or-hack' } })).status, 403);
    const cfg = (await json(env, 'admin/config', { session: admin })).d;
    assert(cfg.keyConfigured);
    assert(!JSON.stringify(cfg).includes('sk-or-fake'));
    const key = env.DB.prepare("SELECT value FROM settings WHERE key='openrouter_key'").first().value;
    assert(!key.includes('sk-or-fake'));
    assert.match(key, /^[a-f0-9]+\.[a-f0-9]+$/);
    const r = await request(env, 'conversations/' + c.id + '/messages', { method: 'POST', session: a, data: { content: 'Chào bạn', model: 'paid-model', systemPrompt: 'ignore rules' }, fetch: mockChat });
    assert.equal(r.status, 200);
    const stream = await r.text();
    assert(stream.includes('Xin chào, mình là rồng Long Vân!'));
    assert(stream.includes('event: done'));
    assert(!stream.includes('sk-or-fake'));
    const saved = (await json(env, 'conversations/' + c.id, { session: a })).d;
    assert.equal(saved.messages.length, 2);
    assert.equal(saved.messages[1].content, 'Xin chào, mình là rồng Long Vân!');
    assert.equal((await request(env, 'conversations/' + c.id + '/export', { session: b })).status, 404);
    assert.match((await request(env, 'conversations/' + c.id + '/export', { session: a })).headers.get('content-disposition'), /attachment/);
    assert.equal((await request(env, 'tts', { method: 'POST', session: b, data: { messageId: saved.messages[1].id } })).status, 404);
    assert.equal((await request(env, 'conversations/' + c.id, { method: 'PATCH', session: a, data: { archived: true } })).status, 200);
    assert.equal((await json(env, 'conversations', { session: a })).d.items.length, 0);
    assert.equal((await json(env, 'conversations?archived=true', { session: a })).d.items.length, 1);
    assert.equal((await request(env, 'conversations/' + c.id + '/messages', { method: 'POST', session: a, data: { content: 'Hi' } })).status, 400);
    assert.equal((await request(env, 'conversations/' + c.id, { method: 'PATCH', session: a, data: { archived: false } })).status, 200);
    await request(env, 'admin/conversations/' + c.id, { session: admin });
    const audit = (await json(env, 'admin/audit', { session: admin })).d;
    assert(audit.items.some(x => x.action === 'conversation.admin_read'));
});
test('Quota, TTS delivery, upstream failures, concurrency lock and refund', async () => {
    const env = envFor(), admin = await setup(env), u = await register(env);
    await configure(env, admin);
    await request(env, 'admin/users/' + u.user.id, { method: 'PATCH', session: admin, data: { quota: 2 } });
    const c = await conv(env, u);
    const error = await request(env, 'conversations/' + c.id + '/messages', { method: 'POST', session: u, data: { content: 'Fail' }, fetch: async () => new Response(JSON.stringify({ error: 'sk-or-fake-key-for-tests-only' }), { status: 429 }) });
    assert.equal(error.status, 429);
    assert(!(await error.text()).includes('sk-or-fake'));
    assert.equal((await json(env, 'usage', { session: u })).d.used, 0);
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    const firstRequest = request(env, 'conversations/' + c.id + '/messages', { method: 'POST', session: u, data: { content: 'Xin chào' }, fetch: async () => { await delayed; return mockChat('', { headers: { Authorization: 'Bearer sk-or-fake-key-for-tests-only' }, body: JSON.stringify({ model: 'openrouter/free', messages: [{ role: 'system' }] }) }); } });
    await new Promise(resolve => setTimeout(resolve, 20));
    const duplicate = await request(env, 'conversations/' + c.id + '/messages', { method: 'POST', session: u, data: { content: 'Second' }, fetch: mockChat });
    assert.equal(duplicate.status, 409);
    release();
    const streamed = await firstRequest;
    await streamed.text();
    assert.equal((await json(env, 'usage', { session: u })).d.used, 1);
    const tts = await request(env, 'tts', { method: 'POST', session: u, data: { sample: true }, fetch: async (url, options) => { assert(url.endsWith('/audio/speech')); assert.equal(JSON.parse(options.body).model, 'fish-audio/s2.1-pro-free:free'); return new Response(new Uint8Array(100), { headers: { 'content-type': 'audio/mpeg' } }); } });
    assert.equal(tts.status, 200);
    assert.equal(tts.headers.get('content-type'), 'audio/mpeg');
    assert.equal((await tts.arrayBuffer()).byteLength, 100);
    const limited = await request(env, 'tts', { method: 'POST', session: u, data: { sample: true }, fetch: () => { throw Error('Must not call upstream'); } });
    assert.equal(limited.status, 429);
    assert.equal((await json(env, 'usage', { session: u })).d.used, 2);
    assert.equal((await request(env, 'admin/config', { method: 'PATCH', session: admin, data: { config: { chatModel: 'paid/model' } } })).status, 400);
});
test('User administration, protected root, password reset and suspension', async () => {
    const env = envFor(), admin = await setup(env), user = await register(env);
    assert.equal((await request(env, 'admin/users/' + admin.user.id, { method: 'PATCH', session: admin, data: { role: 'user' } })).status, 400);
    const created = await json(env, 'admin/users', { method: 'POST', session: admin, data: { name: 'Được mời', email: 'invited@example.com', role: 'user' } });
    assert.equal(created.r.status, 201);
    assert(created.d.resetPath);
    const token = new URL('https://localhost' + created.d.resetPath).searchParams.get('reset');
    assert.equal((await request(env, 'auth/reset', { method: 'POST', data: { token, password: 'Invited password 123!' } })).status, 200);
    assert.equal((await request(env, 'auth/reset', { method: 'POST', data: { token, password: 'Another password 123!' } })).status, 400);
    const signed = await request(env, 'auth/login', { method: 'POST', data: { email: 'invited@example.com', password: 'Invited password 123!' } });
    assert.equal(signed.status, 200);
    assert.equal((await request(env, 'admin/users/' + user.user.id, { method: 'PATCH', session: admin, data: { status: 'suspended' } })).status, 200);
    assert.equal((await request(env, 'me', { session: user })).status, 401);
    assert.equal((await request(env, 'auth/login', { method: 'POST', data: { email: 'user@example.com', password: 'User password 123!' } })).status, 403);
    assert.equal((await request(env, 'admin/users/' + user.user.id, { method: 'PATCH', session: admin, data: { status: 'active', quota: 0 } })).status, 200);
});
test('Sites identity assigns only configured owner as root admin and keeps roles server-side', async () => {
    const env = envFor('chatgpt'), owner = { 'oai-authenticated-user-id': 'site-owner', 'oai-authenticated-user-email': 'owner@example.com' }, visitor = { 'oai-authenticated-user-id': 'site-user', 'oai-authenticated-user-email': 'visitor@example.com' };
    const own = (await json(env, 'me', { headers: owner })).d;
    assert.equal(own.user.role, 'admin');
    const other = (await json(env, 'me', { headers: visitor })).d;
    assert.equal(other.user.role, 'user');
    assert.equal((await request(env, 'admin/users', { headers: visitor })).status, 403);
    assert.equal((await request(env, 'conversations', { method: 'POST', headers: { ...visitor, 'x-csrf-token': other.csrf }, data: {} })).status, 201);
    assert.equal((await request(env, 'auth/register', { method: 'POST', data: { email: 'x@example.com', password: 'A password 123!' } })).status, 400);
});
test('Concurrent owner initialization and invited Sites users while registration is closed', async () => {
    const env = envFor('chatgpt'), owner = { 'oai-authenticated-user-id': 'site-owner', 'oai-authenticated-user-email': 'owner@example.com' };
    const results = await Promise.all([json(env, 'me', { headers: owner }), json(env, 'me', { headers: owner })]);
    for (const result of results) {
        assert.equal(result.r.status, 200);
        assert.equal(result.d.user.role, 'admin');
    }
    const headers = { ...owner, 'x-csrf-token': results[0].d.csrf };
    assert.equal((await request(env, 'admin/config', { method: 'PATCH', headers, data: { config: { registrationOpen: false } } })).status, 200);
    assert.equal((await request(env, 'me', { headers: { 'oai-authenticated-user-id': 'uninvited', 'oai-authenticated-user-email': 'uninvited@example.com' } })).status, 403);
    assert.equal((await request(env, 'admin/users', { method: 'POST', headers, data: { name: 'Được mời', email: 'invited@example.com' } })).status, 201);
    const signed = await json(env, 'me', { headers: { 'oai-authenticated-user-id': 'invited', 'oai-authenticated-user-email': 'invited@example.com' } });
    assert.equal(signed.r.status, 200);
    assert.equal(signed.d.user.role, 'user');
});
