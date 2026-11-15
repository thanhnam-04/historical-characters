import { randomToken, digest, sign, same, hashPassword, verifyPassword, encrypt, decrypt } from './crypto.mjs';
import { DEFAULT_CONFIG, publicUser, publicConfig } from './defaults.mjs';
class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const response = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
const uid = () => crypto.randomUUID();
const safeEmail = v => typeof v === 'string' ? v.trim().toLowerCase() : '';
const validEmail = v => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const cleanText = (v, max = 100) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const now = () => Date.now();
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || [];
const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
const setting = async (db, key) => { const s = await first(db, 'SELECT value FROM settings WHERE key=?', key); return s?.value; };
const config = async (db) => ({ ...DEFAULT_CONFIG, ...JSON.parse(await setting(db, 'config') || '{}') });
const saveSetting = (db, key, value) => run(db, 'INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at', key, value, now());
const log = (db, actor, action, target = null, detail = {}) => run(db, 'INSERT INTO audit(id,actor_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?,?)', uid(), actor, action, target, JSON.stringify(detail), now());
function checkOrigin(req) { const url = new URL(req.url), origin = req.headers.get('Origin'); if (!origin || origin !== url.origin)
    fail(403, 'Yêu cầu không cùng nguồn với trang web.'); }
async function body(req, max = 14000) { const length = Number(req.headers.get('content-length') || 0); if (length > max)
    fail(413, 'Nội dung quá dài.'); if (!(req.headers.get('content-type') || '').includes('application/json'))
    fail(415, 'Yêu cầu phải dùng JSON.'); const text = await req.text(); if (text.length > max)
    fail(413, 'Nội dung quá dài.'); try {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== 'object')
        throw Error();
    return value;
}
catch {
    fail(400, 'Nội dung JSON không hợp lệ.');
} }
function password(value) { if (typeof value !== 'string' || value.length < 12 || value.length > 128)
    fail(400, 'Mật khẩu cần từ 12 đến 128 ký tự.'); return value; }
async function rate(db, key, max, seconds) { const expires = now() + seconds * 1000; const row = await first(db, 'INSERT INTO limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING count', key, expires, now(), now()); if (row.count > max)
    fail(429, 'Bạn thao tác quá nhanh. Hãy đợi một lúc rồi thử lại.'); }
function cookie(req, token, age = 604800) { return `longvan_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`; }
async function createSession(db, req, user) { const token = randomToken(), csrf = randomToken(); await run(db, 'INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)', await digest(token), user.id, csrf, now() + 604800000); return response({ user: publicUser(user), csrf }, 200, { 'Set-Cookie': cookie(req, token) }); }
async function authenticated(req, env) {
    const db = env.DB;
    if (env.AUTH_MODE === 'password') {
        const token = req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('longvan_session='))?.slice(16);
        if (!token || !/^[a-f0-9]{64}$/.test(token))
            return null;
        const row = await first(db, 'SELECT users.*,sessions.csrf,sessions.token_hash FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?', await digest(token), now());
        return row || null;
    }
    const identity = req.headers.get('oai-authenticated-user-id'), email = safeEmail(req.headers.get('oai-authenticated-user-email'));
    if (!identity || !validEmail(email))
        return null;
    let user = await first(db, 'SELECT * FROM users WHERE identity_id=?', identity);
    if (!user) {
        const c = await config(db), owner = email === safeEmail(env.OWNER_EMAIL);
        const existing = await first(db, 'SELECT * FROM users WHERE email=?', email);
        if (!c.registrationOpen && !owner && !existing)
            fail(403, 'Trang đang tạm dừng tiếp nhận người dùng mới.');
        const name = (() => { try {
            return decodeURIComponent(req.headers.get('oai-authenticated-user-full-name') || '').slice(0, 80) || email.split('@')[0];
        }
        catch {
            return email.split('@')[0];
        } })();
        if (existing) {
            await run(db, 'UPDATE users SET identity_id=?,last_login=? WHERE id=?', identity, now(), existing.id);
            user = await first(db, 'SELECT * FROM users WHERE id=?', existing.id);
        }
        else {
            const id = uid();
            await run(db, 'INSERT OR IGNORE INTO users(id,email,name,role,status,identity_id,quota,created_at,last_login) VALUES(?,?,?,\'user\',\'active\',?,?,?,?)', id, email, name, identity, c.dailyQuota, now(), now());
            user = await first(db, 'SELECT * FROM users WHERE identity_id=? OR email=?', identity, email);
        }
    }
    if (email === safeEmail(env.OWNER_EMAIL)) {
        const claims = await db.batch([db.prepare('INSERT OR IGNORE INTO bootstrap(slot,user_id) VALUES(1,?)').bind(user.id), db.prepare('UPDATE users SET role=\'admin\' WHERE id=? AND EXISTS(SELECT 1 FROM bootstrap WHERE slot=1 AND user_id=?)').bind(user.id, user.id)]);
        if (claims[0].meta.changes)
            await log(db, user.id, 'admin.bootstrap', user.id);
        user = await first(db, 'SELECT * FROM users WHERE id=?', user.id);
    }
    return { ...user, csrf: await sign('csrf:' + identity, env.APP_SECRET) };
}
async function requireUser(req, env, write = false) { const user = await authenticated(req, env); if (!user)
    fail(401, 'Vui lòng đăng nhập để tiếp tục.'); if (user.status !== 'active')
    fail(403, 'Tài khoản đang bị khóa. Liên hệ quản trị viên.'); if (write) {
    checkOrigin(req);
    if (!same(req.headers.get('x-csrf-token'), user.csrf))
        fail(403, 'Phiên làm việc đã thay đổi. Tải lại trang rồi thử lại.');
} return user; }
const requireAdmin = user => { if (user.role !== 'admin')
    fail(403, 'Bạn không có quyền quản trị.'); };
async function ownerConversation(db, id, user, admin = false) { const c = await first(db, 'SELECT * FROM conversations WHERE id=?', id); if (!c || (!admin && c.user_id !== user.id))
    fail(404, 'Không tìm thấy cuộc trò chuyện.'); return c; }
const dayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
async function dailyUsed(db, id) { const row = await first(db, 'SELECT count FROM limits WHERE key=?', 'daily:' + id + ':' + dayKey()); return row?.count || 0; }
async function reserve(db, user, kind, model) {
    const id = uid();
    const lock = await first(db, 'INSERT INTO locks(user_id,request_id,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET request_id=excluded.request_id,expires_at=excluded.expires_at WHERE locks.expires_at<? RETURNING request_id', user.id, id, now() + 120000, now());
    if (!lock)
        fail(409, 'Đang có một yêu cầu AI khác. Đợi xong hoặc bấm dừng trước khi gửi tiếp.');
    try {
        if (user.quota <= 0)
            fail(429, 'Tài khoản đã hết hạn mức AI.');
        const key = 'daily:' + user.id + ':' + dayKey();
        const used = await first(db, 'INSERT INTO limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE limits.count<? RETURNING count', key, now() + 172800000, user.quota);
        if (!used)
            fail(429, 'Bạn đã dùng hết hạn mức AI hôm nay.');
        await run(db, 'INSERT INTO usage(id,user_id,kind,model,status,units,created_at) VALUES(?,?,?,?,\'pending\',0,?)', id, user.id, kind, model, now());
        return { id, key };
    }
    catch (e) {
        await run(db, 'DELETE FROM locks WHERE user_id=? AND request_id=?', user.id, id);
        throw e;
    }
}
async function finishUsage(db, user, job, status, units = 0) { await db.batch([db.prepare('UPDATE usage SET status=?,units=? WHERE id=?').bind(status, units, job.id), db.prepare('DELETE FROM locks WHERE user_id=? AND request_id=?').bind(user.id, job.id), ...(status === 'error' ? [db.prepare('UPDATE limits SET count=MAX(0,count-1) WHERE key=?').bind(job.key)] : [])]); }
async function apiKey(env) { const stored = await setting(env.DB, 'openrouter_key'); return stored ? decrypt(stored, env.APP_SECRET) : env.OPENROUTER_API_KEY || ''; }
async function ready(env) { return !!(await setting(env.DB, 'openrouter_key') || env.OPENROUTER_API_KEY); }
function checkModel(c, model) { if (!model || model.length > 160)
    fail(400, 'Chưa chọn model AI.'); if (c.freeOnly && model !== 'openrouter/free' && !model.endsWith(':free'))
    fail(400, 'Chế độ hiện tại chỉ cho phép model miễn phí.'); }
async function routerError(r) { const safe = { 400: 'Model không chấp nhận yêu cầu. Admin cần kiểm tra model hoặc mã giọng.', 401: 'API key OpenRouter không hợp lệ. Liên hệ quản trị viên.', 402: 'OpenRouter yêu cầu kiểm tra số dư hoặc hạn mức của tài khoản.', 403: 'OpenRouter từ chối yêu cầu với model này.', 404: 'Model hiện không có sẵn. Admin cần chọn model khác.', 429: 'Model đang giới hạn lượt dùng. Hãy thử lại sau.' }; return new HttpError(r.status === 429 ? 429 : 502, safe[r.status] || 'Dịch vụ AI đang gặp sự cố. Hãy thử lại sau.'); }
const routerHeaders = key => ({ 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'X-OpenRouter-Title': 'Long Van Fullstack' });
async function streamChat(req, env, user, conversation, data, upstreamFetch) {
    const db = env.DB, c = await config(db), key = await apiKey(env);
    if (!key)
        fail(503, 'Admin chưa kết nối OpenRouter. Bạn vẫn có thể xem lại hội thoại.');
    if (conversation.deleted_at)
        fail(400, 'Khôi phục hội thoại trước khi gửi tin nhắn.');
    const content = cleanText(data.content, 4001);
    if (!content || content.length > 4000)
        fail(400, 'Tin nhắn cần từ 1 đến 4.000 ký tự.');
    checkModel(c, c.chatModel);
    await rate(db, 'send:' + user.id, 15, 60);
    const job = await reserve(db, user, 'chat', c.chatModel);
    const id = uid(), created = now();
    try {
        await db.batch([db.prepare('INSERT INTO messages(id,conversation_id,role,content,created_at,status) VALUES(?,?,\'user\',?,?,\'complete\')').bind(id, conversation.id, content, created), db.prepare('UPDATE conversations SET title=CASE WHEN title=\'Cuộc trò chuyện mới\' THEN ? ELSE title END,updated_at=? WHERE id=?').bind(content.slice(0, 65), created, conversation.id)]);
        const rows = (await all(db, 'SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC,rowid DESC LIMIT 24', conversation.id)).reverse();
        const abort = new AbortController();
        const stop = () => abort.abort();
        req.signal.addEventListener('abort', stop, { once: true });
        const timeout = setTimeout(stop, 90000);
        let upstream;
        try {
            upstream = await upstreamFetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: routerHeaders(key), body: JSON.stringify({ model: c.chatModel, messages: [{ role: 'system', content: c.systemPrompt }, ...rows], max_tokens: c.maxTokens, stream: true }), signal: abort.signal });
            if (!upstream.ok)
                throw await routerError(upstream);
            if (!upstream.body)
                throw new HttpError(502, 'AI không trả về nội dung.');
        }
        catch (e) {
            clearTimeout(timeout);
            req.signal.removeEventListener('abort', stop);
            throw e;
        }
        let closed = false;
        const encoder = new TextEncoder();
        const stream = new ReadableStream({ async start(controller) {
                let reply = '', status = 'success';
                const send = (type, value) => { if (!closed)
                    controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`)); };
                try {
                    send('meta', { userMessageId: id });
                    const reader = upstream.body.getReader(), decoder = new TextDecoder();
                    let buffer = '';
                    const packet = line => { if (!line.startsWith('data:'))
                        return; const raw = line.slice(5).trim(); if (!raw || raw === '[DONE]')
                        return; let p; try {
                        p = JSON.parse(raw);
                    }
                    catch {
                        return;
                    } if (p.error)
                        throw new HttpError(502, 'Model gặp lỗi trong lúc tạo câu trả lời.'); const text = p.choices?.[0]?.delta?.content; if (typeof text === 'string' && text) {
                        reply += text;
                        if (reply.length > 18000)
                            throw new HttpError(502, 'Câu trả lời vượt giới hạn độ dài.');
                        send('delta', { text });
                    } };
                    if ((upstream.headers.get('content-type') || '').includes('application/json')) {
                        const raw = await new Response(upstream.body).json();
                        reply = raw.choices?.[0]?.message?.content || '';
                        if (typeof reply !== 'string')
                            reply = '';
                        send('delta', { text: reply });
                    }
                    else {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done)
                                break;
                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop();
                            for (const line of lines)
                                packet(line.replace(/\r$/, ''));
                        }
                        buffer += decoder.decode();
                        if (buffer.trim())
                            packet(buffer.trim());
                    }
                    if (!reply.trim())
                        throw new HttpError(502, 'Model chưa trả lời bằng chữ. Hãy thử lại hoặc liên hệ admin.');
                }
                catch (e) {
                    status = abort.signal.aborted ? 'cancelled' : 'error';
                    send('error', { error: abort.signal.aborted ? 'Đã dừng tạo câu trả lời.' : e instanceof HttpError ? e.message : 'Kết nối AI bị gián đoạn.' });
                }
                try {
                    let message = null;
                    if (reply.trim()) {
                        message = { id: uid(), role: 'assistant', content: reply, created_at: now(), model: c.chatModel, status: status === 'success' ? 'complete' : 'interrupted' };
                        await db.batch([db.prepare('INSERT INTO messages(id,conversation_id,role,content,created_at,model,status) VALUES(?,?,?,?,?,?,?)').bind(message.id, conversation.id, message.role, message.content, message.created_at, message.model, message.status), db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').bind(message.created_at, conversation.id)]);
                    }
                    await finishUsage(db, user, job, status, reply.length);
                    send('done', { message, used: await dailyUsed(db, user.id) });
                }
                catch {
                    send('error', { error: 'Chưa lưu được câu trả lời. Hãy tải lại hội thoại.' });
                    await run(db, 'DELETE FROM locks WHERE user_id=? AND request_id=?', user.id, job.id).catch(() => { });
                }
                finally {
                    clearTimeout(timeout);
                    req.signal.removeEventListener('abort', stop);
                    if (!closed) {
                        closed = true;
                        controller.close();
                    }
                }
            }, cancel() { closed = true; abort.abort(); } });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Content-Type-Options': 'nosniff' } });
    }
    catch (e) {
        await finishUsage(db, user, job, 'error');
        if (e.name === 'AbortError')
            fail(504, 'AI phản hồi quá lâu. Hãy thử lại.');
        throw e;
    }
}
async function speech(req, env, user, data, upstreamFetch) {
    const db = env.DB, c = await config(db);
    if (!c.ttsEnabled || c.ttsEngine !== 'openrouter')
        fail(400, 'Giọng đọc OpenRouter đang tắt.');
    const key = await apiKey(env);
    if (!key)
        fail(503, 'Admin chưa kết nối OpenRouter.');
    checkModel(c, c.ttsModel);
    let input = 'Xin chào! Mình là Long Vân, người bạn rồng của bạn. Hôm nay bạn muốn kể cho mình nghe điều gì?';
    if (!data.sample) {
        const m = await first(db, 'SELECT messages.* FROM messages JOIN conversations ON conversations.id=messages.conversation_id WHERE messages.id=? AND conversations.user_id=? AND messages.role=\'assistant\' AND conversations.deleted_at IS NULL', cleanText(data.messageId), user.id);
        if (!m)
            fail(404, 'Không tìm thấy câu trả lời để đọc.');
        input = m.content;
    }
    input = input.replace(/```[\s\S]*?```/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#*`_>]/g, '').slice(0, 5000);
    await rate(db, 'speech:' + user.id, 10, 60);
    const job = await reserve(db, user, 'tts', c.ttsModel);
    try {
        const payload = { model: c.ttsModel, input, response_format: 'mp3' };
        if (c.ttsVoice)
            payload.voice = c.ttsVoice;
        const r = await upstreamFetch('https://openrouter.ai/api/v1/audio/speech', { method: 'POST', headers: routerHeaders(key), body: JSON.stringify(payload), signal: AbortSignal.any([req.signal, AbortSignal.timeout(60000)]) });
        if (!r.ok)
            throw await routerError(r);
        const bytes = await r.arrayBuffer();
        if (bytes.byteLength < 20 || bytes.byteLength > 15 * 1024 * 1024)
            fail(502, 'Âm thanh trả về không hợp lệ.');
        await finishUsage(db, user, job, 'success', input.length);
        return new Response(bytes, { headers: { 'Content-Type': r.headers.get('content-type') || 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    catch (e) {
        await finishUsage(db, user, job, 'error');
        if (e.name === 'TimeoutError' || e.name === 'AbortError')
            fail(504, 'Đã dừng hoặc tạo giọng nói quá lâu.');
        throw e;
    }
}
export async function handleApi(req, env, { fetch: upstreamFetch = fetch } = {}) {
    try {
        const url = new URL(req.url), path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, ''), method = req.method, db = env.DB;
        if (path === 'health')
            return response({ ok: !!db, service: 'long-van', version: '2.0.0' });
        if (!db)
            fail(503, 'Database chưa sẵn sàng.');
        if (!env.APP_SECRET || env.APP_SECRET.length < 32)
            fail(503, 'Máy chủ chưa có APP_SECRET hợp lệ.');
        const mode = env.AUTH_MODE === 'password' ? 'password' : 'chatgpt';
        if (path === 'auth/status' && method === 'GET') {
            const c = await config(db);
            return response({ mode, setupRequired: !(await first(db, 'SELECT slot FROM bootstrap WHERE slot=1')), registrationOpen: c.registrationOpen });
        }
        if (path === 'auth/setup' && method === 'POST') {
            checkOrigin(req);
            if (mode !== 'password')
                fail(400, 'Dùng đăng nhập ChatGPT để khởi tạo admin.');
            if (await first(db, 'SELECT slot FROM bootstrap WHERE slot=1'))
                fail(409, 'Hệ thống đã có quản trị viên.');
            const host = url.hostname, hostedOwner = safeEmail(req.headers.get('oai-authenticated-user-email')) === safeEmail(env.OWNER_EMAIL) && !!env.OWNER_EMAIL;
            if (!['localhost', '127.0.0.1', '[::1]'].includes(host) && !hostedOwner)
                fail(403, 'Chỉ chủ Site được khởi tạo admin trên bản hosted.');
            const data = await body(req), email = safeEmail(data.email), name = cleanText(data.name, 80);
            if (!validEmail(email) || !name)
                fail(400, 'Nhập tên và email hợp lệ.');
            const hash = await hashPassword(password(data.password), env.APP_SECRET);
            const id = uid(), c = await config(db);
            try {
                await db.batch([db.prepare('INSERT INTO users(id,email,name,role,status,password_hash,quota,created_at,last_login) VALUES(?,?,?,\'admin\',\'active\',?,?,?,?)').bind(id, email, name, hash, c.dailyQuota, now(), now()), db.prepare('INSERT INTO bootstrap(slot,user_id) VALUES(1,?)').bind(id)]);
            }
            catch {
                fail(409, 'Hệ thống đã được khởi tạo hoặc email đã tồn tại.');
            }
            await log(db, id, 'admin.bootstrap', id);
            return createSession(db, req, await first(db, 'SELECT * FROM users WHERE id=?', id));
        }
        if (['auth/register', 'auth/login', 'auth/reset'].includes(path) && method === 'POST') {
            checkOrigin(req);
            if (mode !== 'password')
                fail(400, 'Trang đang dùng đăng nhập ChatGPT.');
            const data = await body(req), ip = req.headers.get('cf-connecting-ip') || 'local';
            await rate(db, 'auth-ip:' + await digest(ip), 25, 900);
            if (path === 'auth/reset') {
                const token = cleanText(data.token, 128), hash = await digest(token), r = await first(db, 'SELECT * FROM resets WHERE token_hash=? AND expires_at>?', hash, now());
                if (!r)
                    fail(400, 'Link đặt mật khẩu không hợp lệ hoặc đã hết hạn.');
                const ph = await hashPassword(password(data.password), env.APP_SECRET);
                await db.batch([db.prepare('UPDATE users SET password_hash=? WHERE id=? AND EXISTS(SELECT 1 FROM resets WHERE token_hash=? AND expires_at>?)').bind(ph, r.user_id, hash, now()), db.prepare('DELETE FROM resets WHERE user_id=?').bind(r.user_id), db.prepare('DELETE FROM sessions WHERE user_id=?').bind(r.user_id)]);
                await log(db, r.user_id, 'auth.password_reset', r.user_id);
                return response({ ok: true });
            }
            const email = safeEmail(data.email);
            if (!validEmail(email))
                fail(400, 'Email không hợp lệ.');
            await rate(db, 'auth-email:' + await digest(email), 10, 900);
            if (path === 'auth/register') {
                if (!await first(db, 'SELECT slot FROM bootstrap WHERE slot=1'))
                    fail(409, 'Admin cần khởi tạo hệ thống trước.');
                const c = await config(db);
                if (!c.registrationOpen)
                    fail(403, 'Trang đang tạm đóng đăng ký.');
                const name = cleanText(data.name, 80);
                if (!name)
                    fail(400, 'Hãy nhập tên hiển thị.');
                const ph = await hashPassword(password(data.password), env.APP_SECRET);
                const id = uid();
                try {
                    await run(db, 'INSERT INTO users(id,email,name,role,status,password_hash,quota,created_at,last_login) VALUES(?,?,?,\'user\',\'active\',?,?,?,?)', id, email, name, ph, c.dailyQuota, now(), now());
                }
                catch {
                    fail(409, 'Email đã được sử dụng.');
                }
                await log(db, id, 'auth.register', id);
                return createSession(db, req, await first(db, 'SELECT * FROM users WHERE id=?', id));
            }
            const user = await first(db, 'SELECT * FROM users WHERE email=?', email);
            const dummy = 'pbkdf2$100000$' + '0'.repeat(64) + '$' + '0'.repeat(64);
            const valid = await verifyPassword(typeof data.password === 'string' ? data.password.slice(0, 128) : '', user?.password_hash || dummy, env.APP_SECRET);
            if (!user || !valid)
                fail(401, 'Email hoặc mật khẩu chưa đúng.');
            if (user.status !== 'active')
                fail(403, 'Tài khoản đang bị khóa. Liên hệ admin.');
            await run(db, 'UPDATE users SET last_login=? WHERE id=?', now(), user.id);
            return createSession(db, req, user);
        }
        const write = !['GET', 'HEAD'].includes(method), user = await requireUser(req, env, write);
        if (path === 'me' && method === 'GET') {
            const c = await config(db);
            return response({ user: publicUser(user), csrf: user.csrf, mode, config: publicConfig(c, await ready(env)), used: await dailyUsed(db, user.id) });
        }
        if (path === 'auth/logout' && method === 'POST') {
            if (user.token_hash)
                await run(db, 'DELETE FROM sessions WHERE token_hash=?', user.token_hash);
            return response({ ok: true, redirect: mode === 'chatgpt' ? '/signout-with-chatgpt?return_to=/login' : '/login' }, 200, { 'Set-Cookie': cookie(req, '', 0) });
        }
        if (path === 'profile' && method === 'PATCH') {
            const data = await body(req), name = cleanText(data.name, 80);
            if (!name)
                fail(400, 'Tên hiển thị không được để trống.');
            await run(db, 'UPDATE users SET name=? WHERE id=?', name, user.id);
            return response({ user: { ...publicUser(user), name } });
        }
        if (path === 'profile/password' && method === 'POST') {
            if (mode !== 'password')
                fail(400, 'Mật khẩu được quản lý bằng tài khoản ChatGPT.');
            const data = await body(req);
            if (!await verifyPassword(data.currentPassword || '', user.password_hash, env.APP_SECRET))
                fail(400, 'Mật khẩu hiện tại chưa đúng.');
            const ph = await hashPassword(password(data.password), env.APP_SECRET);
            await db.batch([db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(ph, user.id), db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)]);
            await log(db, user.id, 'auth.password_change', user.id);
            return createSession(db, req, user);
        }
        if (path === 'conversations' && method === 'GET') {
            const archived = url.searchParams.get('archived') === 'true';
            return response({ items: await all(db, `SELECT id,title,created_at,updated_at,deleted_at FROM conversations WHERE user_id=? AND deleted_at IS ${archived ? 'NOT ' : ''}NULL ORDER BY updated_at DESC LIMIT 100`, user.id) });
        }
        if (path === 'conversations' && method === 'POST') {
            const data = await body(req), id = uid(), title = cleanText(data.title, 100) || 'Cuộc trò chuyện mới', t = now();
            await rate(db, 'conversation:' + user.id, 30, 60);
            await run(db, 'INSERT INTO conversations(id,user_id,title,created_at,updated_at) VALUES(?,?,?,?,?)', id, user.id, title, t, t);
            return response({ conversation: { id, title, created_at: t, updated_at: t, deleted_at: null } }, 201);
        }
        const cm = path.match(/^conversations\/([^/]+)(?:\/(messages|export))?$/);
        if (cm) {
            const conv = await ownerConversation(db, cm[1], user);
            if (method === 'GET') {
                const messages = await all(db, 'SELECT id,role,content,created_at,model,status FROM messages WHERE conversation_id=? ORDER BY created_at,rowid LIMIT 1000', conv.id);
                if (cm[2] === 'export')
                    return response({ conversation: conv, messages }, 200, { 'Content-Disposition': 'attachment; filename="long-van-conversation.json"' });
                return response({ conversation: conv, messages });
            }
            if (method === 'PATCH') {
                const data = await body(req);
                if (typeof data.archived === 'boolean')
                    await run(db, 'UPDATE conversations SET deleted_at=?,updated_at=? WHERE id=?', data.archived ? now() : null, now(), conv.id);
                else {
                    const title = cleanText(data.title, 100);
                    if (!title)
                        fail(400, 'Tên hội thoại không được để trống.');
                    await run(db, 'UPDATE conversations SET title=?,updated_at=? WHERE id=?', title, now(), conv.id);
                }
                return response({ ok: true });
            }
            if (method === 'DELETE') {
                await run(db, 'UPDATE conversations SET deleted_at=?,updated_at=? WHERE id=?', now(), now(), conv.id);
                return response({ ok: true });
            }
            if (method === 'POST' && cm[2] === 'messages')
                return await streamChat(req, env, user, conv, await body(req), upstreamFetch);
        }
        if (path === 'tts' && method === 'POST')
            return await speech(req, env, user, await body(req), upstreamFetch);
        if (path === 'usage' && method === 'GET')
            return response({ used: await dailyUsed(db, user.id), quota: user.quota, items: await all(db, 'SELECT kind,model,status,units,created_at FROM usage WHERE user_id=? ORDER BY created_at DESC LIMIT 50', user.id) });
        if (path.startsWith('admin/')) {
            requireAdmin(user);
            if (path === 'admin/overview' && method === 'GET') {
                const start = now() - 86400000;
                return response({ stats: { users: (await first(db, 'SELECT COUNT(*) n FROM users')).n, activeUsers: (await first(db, 'SELECT COUNT(*) n FROM users WHERE status=\'active\'')).n, conversations: (await first(db, 'SELECT COUNT(*) n FROM conversations WHERE deleted_at IS NULL')).n, messages: (await first(db, 'SELECT COUNT(*) n FROM messages')).n, requestsToday: (await first(db, 'SELECT COUNT(*) n FROM usage WHERE created_at>?', start)).n, errorsToday: (await first(db, 'SELECT COUNT(*) n FROM usage WHERE created_at>? AND status=\'error\'', start)).n }, daily: await all(db, "SELECT date(created_at/1000,'unixepoch','+7 hours') day,COUNT(*) total,SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) errors FROM usage WHERE created_at>? GROUP BY day ORDER BY day", now() - 7 * 86400000), recent: await all(db, 'SELECT audit.*,users.name actor_name FROM audit LEFT JOIN users ON users.id=audit.actor_id ORDER BY audit.created_at DESC LIMIT 8'), ready: await ready(env) });
            }
            if (path === 'admin/users' && method === 'GET') {
                const q = '%' + cleanText(url.searchParams.get('q'), 100) + '%', offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset')) || 0));
                return response({ items: (await all(db, 'SELECT users.*,(SELECT COUNT(*) FROM conversations c WHERE c.user_id=users.id AND c.deleted_at IS NULL) conversations FROM users WHERE email LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT 51 OFFSET ?', q, q, offset)).map(u => ({ ...publicUser(u), conversations: u.conversations })), ownerId: (await first(db, 'SELECT user_id FROM bootstrap WHERE slot=1'))?.user_id });
            }
            if (path === 'admin/users' && method === 'POST') {
                const data = await body(req), email = safeEmail(data.email), name = cleanText(data.name, 80);
                if (!validEmail(email) || !name)
                    fail(400, 'Tên và email không hợp lệ.');
                const role = data.role === 'admin' ? 'admin' : 'user', c = await config(db), id = uid();
                try {
                    await run(db, 'INSERT INTO users(id,email,name,role,status,quota,created_at,last_login) VALUES(?,?,?,?,\'active\',?,?,?)', id, email, name, role, c.dailyQuota, now(), now());
                }
                catch {
                    fail(409, 'Email đã được sử dụng.');
                }
                await log(db, user.id, 'user.create', id, { role });
                let resetPath = null;
                if (mode === 'password') {
                    const token = randomToken();
                    await run(db, 'INSERT INTO resets(token_hash,user_id,expires_at) VALUES(?,?,?)', await digest(token), id, now() + 3600000);
                    resetPath = '/login?reset=' + token;
                }
                return response({ user: publicUser(await first(db, 'SELECT * FROM users WHERE id=?', id)), resetPath }, 201);
            }
            const um = path.match(/^admin\/users\/([^/]+)(?:\/(reset|sessions))?$/);
            if (um) {
                const target = await first(db, 'SELECT * FROM users WHERE id=?', um[1]);
                if (!target)
                    fail(404, 'Không tìm thấy tài khoản.');
                if (method === 'PATCH') {
                    const data = await body(req), root = (await first(db, 'SELECT user_id FROM bootstrap WHERE slot=1'))?.user_id;
                    if ((target.id === root || target.id === user.id) && ((data.role && data.role !== 'admin') || (data.status && data.status !== 'active')))
                        fail(400, 'Không thể hạ quyền hoặc khóa admin gốc hay chính bạn.');
                    const role = data.role ?? target.role, status = data.status ?? target.status, quota = data.quota ?? target.quota;
                    if (!['admin', 'user'].includes(role) || !['active', 'suspended'].includes(status) || !Number.isInteger(quota) || quota < 0 || quota > 10000)
                        fail(400, 'Vai trò, trạng thái hoặc hạn mức không hợp lệ.');
                    await db.batch([db.prepare('UPDATE users SET role=?,status=?,quota=? WHERE id=?').bind(role, status, quota, target.id), ...(status === 'suspended' ? [db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id)] : [])]);
                    await log(db, user.id, 'user.update', target.id, { role, status, quota });
                    return response({ ok: true });
                }
                if (method === 'POST' && um[2] === 'sessions') {
                    await run(db, 'DELETE FROM sessions WHERE user_id=?', target.id);
                    await log(db, user.id, 'user.revoke_sessions', target.id);
                    return response({ ok: true });
                }
                if (method === 'POST' && um[2] === 'reset') {
                    if (mode !== 'password')
                        fail(400, 'Mật khẩu thuộc tài khoản ChatGPT.');
                    const token = randomToken();
                    await db.batch([db.prepare('DELETE FROM resets WHERE user_id=?').bind(target.id), db.prepare('INSERT INTO resets(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await digest(token), target.id, now() + 3600000)]);
                    await log(db, user.id, 'user.reset_link', target.id);
                    return response({ resetPath: '/login?reset=' + token, expiresIn: 3600 });
                }
            }
            if (path === 'admin/config' && method === 'GET') {
                const c = await config(db);
                return response({ config: c, keyConfigured: await ready(env), mode });
            }
            if (path === 'admin/config' && method === 'PATCH') {
                const data = await body(req, 20000), c = await config(db), p = data.config || {};
                const next = { ...c };
                for (const [k, max] of Object.entries({ appName: 80, welcome: 400, chatModel: 160, ttsModel: 160, ttsVoice: 160, systemPrompt: 6000 }))
                    if (k in p) {
                        if (typeof p[k] !== 'string')
                            fail(400, 'Cấu hình không hợp lệ.');
                        next[k] = p[k].trim().slice(0, max);
                    }
                for (const k of ['registrationOpen', 'ttsEnabled', 'freeOnly'])
                    if (k in p) {
                        if (typeof p[k] !== 'boolean')
                            fail(400, 'Cấu hình không hợp lệ.');
                        next[k] = p[k];
                    }
                for (const [k, min, max] of [['dailyQuota', 1, 10000], ['maxTokens', 50, 2000]])
                    if (k in p) {
                        if (!Number.isInteger(p[k]) || p[k] < min || p[k] > max)
                            fail(400, 'Hạn mức hoặc độ dài câu trả lời không hợp lệ.');
                        next[k] = p[k];
                    }
                if (p.ttsEngine !== undefined) {
                    if (!['browser', 'openrouter', 'off'].includes(p.ttsEngine))
                        fail(400, 'Chọn giọng đọc hợp lệ.');
                    next.ttsEngine = p.ttsEngine;
                }
                if (!next.appName || !next.systemPrompt)
                    fail(400, 'Tên ứng dụng và hướng dẫn AI không được để trống.');
                checkModel(next, next.chatModel);
                if (next.ttsEnabled && next.ttsEngine === 'openrouter')
                    checkModel(next, next.ttsModel);
                const statements = [db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(\'config\',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(JSON.stringify(next), now())];
                if (data.apiKey) {
                    if (typeof data.apiKey !== 'string' || !data.apiKey.startsWith('sk-or-') || data.apiKey.length > 512)
                        fail(400, 'API key OpenRouter chưa đúng định dạng.');
                    statements.push(db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(\'openrouter_key\',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(await encrypt(data.apiKey, env.APP_SECRET), now()));
                }
                if (data.clearKey === true)
                    statements.push(db.prepare('DELETE FROM settings WHERE key=\'openrouter_key\''));
                await db.batch(statements);
                await log(db, user.id, 'config.update', null, { fields: Object.keys(p), keyChanged: !!data.apiKey || data.clearKey === true });
                return response({ ok: true, keyConfigured: await ready(env) });
            }
            if (path === 'admin/models' && method === 'GET') {
                const r = await upstreamFetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(12000) });
                if (!r.ok)
                    fail(502, 'Chưa tải được danh sách model.');
                const payload = await r.json();
                return response({ items: (payload.data || []).filter(m => m.id === 'openrouter/free' || m.id.endsWith(':free')).map(m => ({ id: m.id, name: m.name, output: m.architecture?.output_modalities || ['text'], voices: m.supported_voices || [], expires: m.expiration_date || null })).filter(m => !m.expires || new Date(m.expires) > new Date()) });
            }
            if (path === 'admin/conversations' && method === 'GET') {
                const q = '%' + cleanText(url.searchParams.get('q'), 100) + '%';
                return response({ items: await all(db, 'SELECT c.*,u.email,u.name,(SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) message_count FROM conversations c JOIN users u ON u.id=c.user_id WHERE c.title LIKE ? OR u.email LIKE ? ORDER BY c.updated_at DESC LIMIT 100', q, q) });
            }
            const ac = path.match(/^admin\/conversations\/([^/]+)$/);
            if (ac && method === 'GET') {
                const conv = await ownerConversation(db, ac[1], user, true);
                await log(db, user.id, 'conversation.admin_read', conv.id);
                return response({ conversation: conv, messages: await all(db, 'SELECT id,role,content,created_at,model,status FROM messages WHERE conversation_id=? ORDER BY created_at,rowid LIMIT 1000', conv.id) });
            }
            if (path === 'admin/audit' && method === 'GET')
                return response({ items: await all(db, 'SELECT audit.*,users.name actor_name,users.email actor_email FROM audit LEFT JOIN users ON users.id=audit.actor_id ORDER BY audit.created_at DESC LIMIT 100') });
        }
        fail(404, 'Không tìm thấy API.');
    }
    catch (e) {
        if (e instanceof HttpError)
            return response({ error: e.message }, e.status);
        return response({ error: 'Máy chủ gặp sự cố. Hãy thử lại hoặc liên hệ admin.' }, 500);
    }
}
