const enc = new TextEncoder();
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
const toHex = bytes => Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
const fromHex = hex => Uint8Array.from(hex.match(/.{2}/g) || [], x => parseInt(x, 16));
export const digest = async (value) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
export async function sign(value, secret) { const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(value))); }
export function same(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length)
    return false; let difference = 0; for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0; }
export async function hashPassword(password, secret) { const salt = randomToken(); const peppered = await sign(password, secret); const key = await crypto.subtle.importKey('raw', enc.encode(peppered), 'PBKDF2', false, ['deriveBits']); const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(salt), iterations: 100000, hash: 'SHA-256' }, key, 256); return `pbkdf2$100000$${salt}$${toHex(result)}`; }
export async function verifyPassword(password, stored, secret) { const [type, count, salt, expected] = (stored || '').split('$'); if (type !== 'pbkdf2' || count !== '100000' || !salt || !expected)
    return false; const peppered = await sign(password, secret); const key = await crypto.subtle.importKey('raw', enc.encode(peppered), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(salt), iterations: 100000, hash: 'SHA-256' }, key, 256); return same(toHex(bits), expected); }
async function encryptionKey(secret) { const hash = await crypto.subtle.digest('SHA-256', enc.encode('long-van-api-key:' + secret)); return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function encrypt(value, secret) { const iv = crypto.getRandomValues(new Uint8Array(12)); const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret), enc.encode(value)); return toHex(iv) + '.' + toHex(bytes); }
export async function decrypt(value, secret) { const [iv, data] = value.split('.'); const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(iv) }, await encryptionKey(secret), fromHex(data)); return new TextDecoder().decode(bytes); }
