/*!
 * supabase.js —— Supabase 客户端封装（统一连接入口 + 认证 + 用户档案）
 * 依赖：js/lib/supabase.min.js（需在本文件之前加载）
 * 暴露：window.SupabaseClient
 *
 * 认证策略：
 *   邮箱+密码账户体系。页面加载仅恢复已有会话，不自动登录。
 *   游客（未登录）可浏览页面、玩单机采集；聊天/市场等联机功能必须登录后才能用。
 *   各功能模块通过 isLoggedIn() / onAuthStateChange() 自行决定是否放行。
 *
 * 会话持久化说明：
 *   supabase-js 通过 persistSession:true 将会话存入 localStorage，刷新自动恢复。
 *   与 GameSave 职责互补不重叠：
 *     - GameSave  → 客户端游戏状态（词元、产出、布局等）
 *     - Supabase  → 服务端权威数据（档案、道具、市场、聊天）
 *
 * 安全说明：此处仅使用 publishable key；service_role key 仅用于 Edge Function。
 */
(function () {
    'use strict';

    const SUPABASE_URL = 'https://gzavnnebbtuuxpnnwate.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_9LLguicE2HfPg-OGE7lEdQ_nqGvAe7Q';

    let client = null;
    let currentUser = null;     // 当前登录用户对象（auth.users 行），未登录时为 null
    let authReady = false;       // 认证初始化是否完成
    const authListeners = [];   // 外部注册的认证状态回调

    //===== 获取/初始化客户端 =====
    function getClient() {
        if (client) return client;
        if (!window.supabase) {
            console.error('[supabase] supabase-js 未加载，请检查 js/lib/supabase.min.js 是否引入');
            return null;
        }
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: true, autoRefreshToken: true }
        });
        return client;
    }

    //===== 通知所有认证状态监听者 =====
    function notifyAuthListeners(event, session) {
        authListeners.forEach(function (fn) {
            try { fn(event, session); } catch (e) { console.error('[supabase] auth listener error', e); }
        });
    }

    //===== 邮箱密码注册 =====
    // 返回 { user, error }
    async function signUp(email, password) {
        const sb = getClient();
        if (!sb) return { user: null, error: { message: '客户端未初始化' } };
        const { data, error } = await sb.auth.signUp({ email: email, password: password });
        if (error) return { user: null, error: error };
        // 注意：Supabase 默认可能开启邮箱确认，此时 data.user 已创建但 session 为 null，
        // 需用户点击确认邮件后才算登录。是否需要确认取决于控制台 Auth 设置。
        return { user: data.user, error: null };
    }

    //===== 邮箱密码登录 =====
    // 返回 { user, error }
    async function signInWithPassword(email, password) {
        const sb = getClient();
        if (!sb) return { user: null, error: { message: '客户端未初始化' } };
        const { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
        if (error) return { user: null, error: error };
        return { user: data.user, error: null };
    }

    //===== 登出 =====
    async function signOut() {
        const sb = getClient();
        if (!sb) return;
        await sb.auth.signOut();
        currentUser = null;
    }

    //===== 初始化认证：仅监听状态 + 恢复已有会话（不自动登录） =====
    async function initAuth() {
        const sb = getClient();
        if (!sb) return;
        // 统一通过此回调感知认证状态变化（含初始会话、登录、登出、令牌刷新）
        sb.auth.onAuthStateChange(function (event, session) {
            currentUser = session ? session.user : null;
            authReady = true;
            console.log('[supabase] auth:', event, currentUser ? currentUser.id : '(游客)');
            notifyAuthListeners(event, session);
        });
        // 触发一次 INITIAL_SESSION：有会话则恢复，无则保持游客（不自动登录）
        await sb.auth.getSession();
    }

    //===== 读取当前用户档案 =====
    async function getProfile() {
        const sb = getClient();
        if (!sb || !currentUser) return null;
        const { data, error } = await sb.from('profiles')
            .select('*').eq('id', currentUser.id).single();
        if (error) {
            console.error('[supabase] 读取档案失败:', error.message);
            return null;
        }
        return data;
    }

    //===== 更新当前用户档案（仅 username 等非保护字段；balance 受触发器保护） =====
    async function updateProfile(updates) {
        const sb = getClient();
        if (!sb || !currentUser) return null;
        const { data, error } = await sb.from('profiles')
            .update(updates).eq('id', currentUser.id).select().single();
        if (error) {
            console.error('[supabase] 更新档案失败:', error.message);
            return null;
        }
        return data;
    }

    //===== 对外 API =====
    window.SupabaseClient = {
        get: getClient,
        ready: function () { return !!getClient(); },

        // 认证
        signUp: signUp,
        signInWithPassword: signInWithPassword,
        signOut: signOut,
        getCurrentUser: function () { return currentUser; },
        isLoggedIn: function () { return !!currentUser; },
        isAuthReady: function () { return authReady; },
        onAuthStateChange: function (fn) {
            authListeners.push(fn);
            return function () {
                const i = authListeners.indexOf(fn);
                if (i >= 0) authListeners.splice(i, 1);
            };
        },

        // 档案
        getProfile: getProfile,
        updateProfile: updateProfile
    };

    //===== 启动：页面加载即初始化认证（仅恢复会话，不自动登录） =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuth);
    } else {
        initAuth();
    }
})();