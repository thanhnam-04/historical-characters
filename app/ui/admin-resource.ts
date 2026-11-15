export type AdminResource = {
    key: string;
    status: 'loading' | 'ready' | 'error';
    data: any;
    error: string | null;
};

export function adminResourceKey(tab: string, query: string, offset: number, revision: number) {
    return JSON.stringify([tab, query, offset, revision]);
}

export function validAdminData(tab: string, data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    if (tab === 'config') {
        const config = data.config;
        return !!config && typeof config === 'object'
            && typeof data.keyConfigured === 'boolean'
            && ['appName', 'welcome', 'chatModel', 'ttsModel', 'ttsVoice', 'ttsEngine', 'systemPrompt']
                .every(key => typeof config[key] === 'string')
            && ['dailyQuota', 'maxTokens'].every(key => Number.isFinite(config[key]))
            && ['registrationOpen', 'ttsEnabled', 'freeOnly'].every(key => typeof config[key] === 'boolean');
    }
    if (tab === 'overview') {
        return !!data.stats && Array.isArray(data.daily) && Array.isArray(data.recent)
            && ['users', 'activeUsers', 'conversations', 'messages', 'requestsToday', 'errorsToday']
                .every(key => Number.isFinite(data.stats[key]));
    }
    return ['users', 'conversations', 'audit'].includes(tab) && Array.isArray(data.items);
}

export function loadedAdminResource(key: string, tab: string, data: any): AdminResource {
    if (!validAdminData(tab, data)) {
        return { key, status: 'error', data: null, error: 'Dữ liệu quản trị chưa hợp lệ. Bấm Thử lại để tải lại đúng nội dung.' };
    }
    return { key, status: 'ready', data, error: null };
}

export function selectAdminResource(resource: AdminResource | null, key: string) {
    // The render caused by a new tab runs before useEffect can clear old state.
    // Never expose an earlier request's payload to the new tab's component.
    if (!resource || resource.key !== key) return { data: null, loading: true, error: null };
    return {
        data: resource.status === 'ready' ? resource.data : null,
        loading: resource.status === 'loading',
        error: resource.error,
    };
}
