export type User = {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
    status: string;
    quota: number;
    createdAt: number;
    lastLogin: number;
    conversations?: number;
};
export type AppConfig = {
    appName: string;
    welcome: string;
    ttsEnabled: boolean;
    ttsEngine: string;
    ready: boolean;
    chatModel: string;
    ttsModel: string;
};
export type Me = {
    user: User;
    csrf: string;
    mode: string;
    config: AppConfig;
    used: number;
};
export type Conversation = {
    id: string;
    title: string;
    created_at: number;
    updated_at: number;
    deleted_at: number | null;
    name?: string;
    email?: string;
    message_count?: number;
};
export type Message = {
    id: string;
    role: string;
    content: string;
    created_at: number;
    status?: string;
    model?: string;
};
export const date = (t: number) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(t);
export async function api(path: string, options: RequestInit = {}, csrf = ''): Promise<any> { const headers = new Headers(options.headers); if (options.body)
    headers.set('Content-Type', 'application/json'); if (csrf)
    headers.set('X-CSRF-Token', csrf); const res = await fetch('/api/' + path, { ...options, headers, credentials: 'same-origin' }); const data: any = await res.json().catch(() => ({ error: 'Máy chủ chưa trả về dữ liệu hợp lệ.' })); if (!res.ok)
    throw Object.assign(new Error(data.error || 'Yêu cầu không thành công.'), { status: res.status }); return data; }
export const write = (path: string, data: unknown, csrf: string, method = 'POST') => api(path, { method, body: JSON.stringify(data) }, csrf);
