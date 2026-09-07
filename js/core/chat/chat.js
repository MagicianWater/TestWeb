/*!
 * chat.js —— 聊天栏主入口
 * 动态加载子模块：chat-channels.js（频道管理）/ chat-realtime.js（实时订阅）
 * 依赖：base.js / supabase.js（需在本文件之前加载）
 * 暴露：window.ChatCore（共享对象）、window.ChatAPI（对外接口）
 *
 * @sideWidget 聊天 —— 可挂载于四边弹窗栏（上/下/左/右），未挂载时不产生悬浮窗
 *
 * 架构：创建 window.ChatCore 共享对象，子模块各自挂载功能到其上，
 *       跨模块调用通过 Core.xxx 完成。
 *
 * 数据表（Supabase）：
 *   chat_messages
 *     id          uuid PK
 *     channel     text    频道标识（如 'global'）
 *     user_id     uuid    发送者（auth.users.id）
 *     username    text    发送者用户名（冗余存储，避免联表）
 *     content     text    消息内容
 *     created_at  timestamptz  发送时间
 *   RLS：已登录用户可读全服频道，仅本人可写自己的消息
 */
(function(){
    'use strict';

    //===== 创建聊天核心对象，所有子模块共享此对象 =====
    const Core = window.ChatCore = {
        // DOM 元素引用（init 时填充）
        chatRoot: null,
        msgList: null,
        msgInput: null,
        sendBtn: null,
        channelTabs: null,
        // 共享状态
        currentChannel: 'global',
        channels: [],
        currentUser: null,
        username: '',
        isReady: false,
        // 消息缓冲上限（超出后裁剪旧消息 DOM）
        MSG_MAX: 200
    };

    //===== 构建 UI =====
    function buildUI(root){
        root.innerHTML = [
            '<div class="chat-head">',
                '<h3 class="chat-title">聊天</h3>',
                '<div class="chat-channels" id="chatChannelTabs"></div>',
            '</div>',
            '<div class="chat-msg-wrap" id="chatMsgWrap">',
                '<div class="chat-msg-list" id="chatMsgList"></div>',
            '</div>',
            '<div class="chat-input-row">',
                '<input type="text" id="chatInput" placeholder="输入消息，回车发送" autocomplete="off" spellcheck="false" disabled readonly>',
                '<button id="chatSendBtn" disabled>发送</button>',
            '</div>'
        ].join('');
        Core.chatRoot = root;
        Core.msgList = document.getElementById('chatMsgList');
        Core.msgInput = document.getElementById('chatInput');
        Core.sendBtn = document.getElementById('chatSendBtn');
        Core.channelTabs = document.getElementById('chatChannelTabs');
    }

    //===== 追加一条消息 DOM =====
    // type: 'self' | 'other' | 'system'
    Core.appendMessage = function(msg){
        if(!Core.msgList) return;
        const div = document.createElement('div');
        div.className = 'chat-msg chat-msg-' + msg.type;
        const time = new Date(msg.created_at || Date.now());
        const ts = time.toLocaleTimeString('zh-CN', {hour12:false});
        const name = document.createElement('span');
        name.className = 'chat-msg-name';
        name.textContent = (msg.type === 'system') ? 'System' : (msg.username || '匿名');
        const text = document.createElement('span');
        text.className = 'chat-msg-text';
        text.textContent = msg.content;
        const t = document.createElement('span');
        t.className = 'chat-msg-time';
        t.textContent = ts;
        div.appendChild(name);
        div.appendChild(text);
        div.appendChild(t);
        Core.msgList.appendChild(div);
        Core.trimMessages();
        // 自动滚到底部
        const wrap = document.getElementById('chatMsgWrap');
        if(wrap) wrap.scrollTop = wrap.scrollHeight;
    };

    //===== 裁剪消息缓冲 =====
    Core.trimMessages = function(){
        if(!Core.msgList) return;
        while(Core.msgList.children.length > Core.MSG_MAX){
            Core.msgList.removeChild(Core.msgList.firstChild);
        }
    };

    //===== 系统提示 =====
    Core.systemMessage = function(text){
        Core.appendMessage({type:'system', content:text, created_at:new Date().toISOString()});
    };

    //===== 动态加载子模块（按依赖顺序链式加载） =====
    function loadScript(src, onLoad, onError){
        const s = document.createElement('script');
        s.src = src;
        s.onload = onLoad;
        s.onerror = onError || function(){
            console.error('[chat] 子模块加载失败: ' + src);
        };
        document.head.appendChild(s);
    }

    const MODULES = [
        './js/core/chat/chat-channels.js',
        './js/core/chat/chat-realtime.js'
    ];

    function loadModules(idx, done){
        if(idx >= MODULES.length){ done(); return; }
        loadScript(MODULES[idx] + '?v=20260906', function(){
            loadModules(idx + 1, done);
        });
    }

    //===== 所有子模块加载完成后：绑定事件、初始化 =====
    function init(){
        const root = document.getElementById('chatRoot');
        if(!root) return;
        buildUI(root);
        // 等待子模块加载完毕
        loadModules(0, function(){
            Core.isReady = true;
            // 注册认证状态回调：登录/登出时更新输入框可用性
            if(window.SupabaseClient){
                SupabaseClient.onAuthStateChange(function(event, session){
                    Core.onAuthChange(session);
                });
                // 若认证已就绪，立即触发一次（处理页面加载前已登录的情况）
                if(SupabaseClient.isAuthReady()){
                    const user = SupabaseClient.getCurrentUser();
                    if(user){
                        Core.onAuthChange({user:user});
                    }
                }
            }
            // 绑定输入事件
            bindInput();
            // 初始化频道（子模块提供）
            if(Core.initChannels) Core.initChannels();
            Core.systemMessage('聊天已就绪，登录后可发送消息');
        });
    }

    //===== 绑定输入框事件 =====
    function bindInput(){
        if(!Core.msgInput || !Core.sendBtn) return;
        // 阻断浏览器自动填充：Edge 会把已保存的登录账号误填进聊天输入框（见 readonly 逻辑）。
        Core.msgInput.setAttribute('readonly', 'readonly');
        Core.msgInput.addEventListener('pointerdown', function(){ this.removeAttribute('readonly'); });
        Core.msgInput.addEventListener('keydown', function(){ this.removeAttribute('readonly'); });
        Core.msgInput.addEventListener('keydown', function(e){
            if(e.key === 'Enter' && !e.shiftKey){
                e.preventDefault();
                doSend();
            }
        });
        Core.sendBtn.addEventListener('click', function(){
            doSend();
        });
    }

    //===== 发送消息 =====
    async function doSend(){
        if(!Core.msgInput) return;
        const content = Core.msgInput.value.trim();
        if(!content) return;
        if(!window.SupabaseClient || !SupabaseClient.isLoggedIn()){
            Core.systemMessage('请先登录后再发送消息');
            return;
        }
        Core.msgInput.value = '';
        Core.msgInput.disabled = true;
        Core.sendBtn.disabled = true;
        try{
            if(Core.sendMessage){
                await Core.sendMessage(content);
            }
        }catch(e){
            console.error('[chat] 发送失败:', e);
            Core.systemMessage('发送失败：' + (e.message || e));
            // 恢复输入框内容，便于重试
            Core.msgInput.value = content;
        }finally{
            const canSend = window.SupabaseClient && SupabaseClient.isLoggedIn();
            Core.msgInput.disabled = !canSend;
            Core.sendBtn.disabled = !canSend;
            Core.msgInput.focus({ preventScroll: true }); // preventScroll: 与 enableInput 一致，避免收起时滚动 #mainWindow
        }
    }

    //===== 启动 =====
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', init);
    }else{
        init();
    }
})();