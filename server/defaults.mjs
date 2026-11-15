export const DEFAULT_CONFIG = {
    appName: 'Long Vân', welcome: 'Mình nghe đây. Bạn muốn kể chuyện gì hôm nay?',
    chatModel: 'openrouter/free', ttsModel: 'fish-audio/s2.1-pro-free:free', ttsVoice: '', ttsEngine: 'openrouter',
    systemPrompt: 'Bạn là Long Vân, một người bạn rồng thân thiện nói tiếng Việt tự nhiên. Trả lời rõ ràng, ấm áp, thường từ 2 đến 5 câu. Khi cần, giải thích kỹ hơn. Không giả vờ là người thật hoặc đã thực hiện thao tác ngoài cuộc trò chuyện. Hạn chế Markdown vì câu trả lời có thể được đọc thành tiếng.',
    dailyQuota: 60, registrationOpen: true, ttsEnabled: true, freeOnly: true, maxTokens: 700,
};
export function publicUser(u) { return { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, quota: u.quota, createdAt: u.created_at, lastLogin: u.last_login }; }
export function publicConfig(c, ready) { return { appName: c.appName, welcome: c.welcome, ttsEnabled: c.ttsEnabled, ttsEngine: c.ttsEngine, ready, chatModel: c.chatModel, ttsModel: c.ttsModel }; }
