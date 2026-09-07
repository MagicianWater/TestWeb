/*!
 * chat-realtime.js —— 聊天实时订阅与收发子模块
 * 依赖：chat.js / chat-channels.js（需在它们之后加载）
 * 挂载到 ChatCore：sendMessage / loadChannelMessages / onAuthChange / subscribeChannel
 *
 * 使用 Supabase Realtime 订阅 chat_messages 表的 INSERT 事件，
 * 实现全服公用聊天的实时推送。
 */
(function(){
    'use strict';
    const Core = window.ChatCore;
    if(!Core) return;

    let subscription = null;
    let loadedChannels = {};  // 已加载历史消息的频道，避免重复拉取

    //===== 认证状态变化处理 =====
    Core.onAuthChange = function(session){
        const user = session ? session.user : null;
        Core.currentUser = user;
        // 切换登录态时清空聊天栏并重置已加载标记，避免残留旧消息与系统提示干扰判断
        Core.clearMessages();
        if(user){
            // 读取用户名（从 profiles 表）
            loadUsername(user.id);
            // 启用输入框
            enableInput(true);
            // 订阅当前频道
            subscribeChannel(Core.currentChannel);
            // 加载历史消息
            Core.loadChannelMessages(Core.currentChannel);
        }else{
            Core.username = '';
            enableInput(false);
            unsubscribe();
            Core.systemMessage('已登出，仅可查看历史消息');
        }
    };

    //===== 清空聊天栏并重置已加载标记（用于登录/登出切换） =====
    Core.clearMessages = function(){
        if(Core.msgList) Core.msgList.innerHTML = '';
        loadedChannels = {};
    };

    //===== 读取用户名 =====
    async function loadUsername(userId){
        if(!window.SupabaseClient) return;
        try{
            const profile = await SupabaseClient.getProfile();
            if(profile && profile.username){
                Core.username = profile.username;
            }else{
                // 档案无用户名时用邮箱前缀兜底
                const email = (Core.currentUser && Core.currentUser.email) || 'user';
                Core.username = email.split('@')[0];
            }
        }catch(e){
            console.error('[chat] 读取用户名失败:', e);
            Core.username = 'user';
        }
    }

    //===== 用户名变更：刷新本地缓存并就地更新自己历史消息的显示名 =====
    // 说明：chat_messages.username 为发送时快照，改名不会回写历史行；
    //       这里仅替换当前已渲染的"自己"消息 DOM，让用户自己看不出不一致，
    //       其他人看到的旧消息仍保留旧名（可接受的读优化妥协）。
    Core.onUsernameChanged = function(newName){
        if(!newName) return;
        Core.username = newName;
        if(!Core.msgList) return;
        const nodes = Core.msgList.querySelectorAll('.chat-msg-self .chat-msg-name');
        nodes.forEach(function(el){ el.textContent = newName; });
    };

    //===== 启用/禁用输入框 =====
    function enableInput(on){
        if(!Core.msgInput || !Core.sendBtn) return;
        Core.msgInput.disabled = !on;
        Core.sendBtn.disabled = !on;
        if(on) Core.msgInput.focus({ preventScroll: true }); // preventScroll: 收起时避免浏览器滚动 #mainWindow 破坏布局
    }

    //===== 加载某频道历史消息 =====
    Core.loadChannelMessages = async function(channelId){
        if(!window.SupabaseClient || !SupabaseClient.isLoggedIn()) return;
        if(loadedChannels[channelId]) return;
        const sb = SupabaseClient.get();
        if(!sb) return;
        try{
            const { data, error } = await sb.from('chat_messages')
                .select('id,username,content,created_at,user_id')
                .eq('channel', channelId)
                .order('created_at', {ascending:true})
                .limit(Core.MSG_MAX);
            if(error) throw error;
            if(data && data.length){
                const currentUserId = Core.currentUser ? Core.currentUser.id : null;
                data.forEach(function(row){
                    Core.appendMessage({
                        type: row.user_id === currentUserId ? 'self' : 'other',
                        username: row.username,
                        content: row.content,
                        created_at: row.created_at
                    });
                });
            }
            loadedChannels[channelId] = true;
        }catch(e){
            console.error('[chat] 加载历史消息失败:', e);
            Core.systemMessage('加载历史消息失败：' + (e.message || e));
        }
    };

    //===== 订阅频道实时消息 =====
    function subscribeChannel(channelId){
        unsubscribe();
        if(!window.SupabaseClient || !SupabaseClient.isLoggedIn()) return;
        const sb = SupabaseClient.get();
        if(!sb) return;
        try{
            // 订阅该频道的新消息（INSERT 事件）
            subscription = sb.channel('chat:' + channelId)
                .on('postgres_changes', {
                    event:'INSERT',
                    schema:'public',
                    table:'chat_messages',
                    filter:'channel=eq.' + channelId
                }, function(payload){
                    onNewMessage(payload.new);
                })
                .subscribe();
        }catch(e){
            console.error('[chat] 订阅失败:', e);
        }
    }
    Core.subscribeChannel = subscribeChannel;

    //===== 取消订阅 =====
    function unsubscribe(){
        if(subscription){
            try{
                if(window.SupabaseClient){
                    const sb = SupabaseClient.get();
                    if(sb) sb.removeChannel(subscription);
                }
            }catch(e){}
            subscription = null;
        }
    }

    //===== 处理新消息推送 =====
    function onNewMessage(row){
        if(!row) return;
        // 仅处理当前频道（切换频道时旧推送忽略）
        if(row.channel !== Core.currentChannel) return;
        const currentUserId = Core.currentUser ? Core.currentUser.id : null;
        Core.appendMessage({
            type: row.user_id === currentUserId ? 'self' : 'other',
            username: row.username,
            content: row.content,
            created_at: row.created_at
        });
    }

    //===== 发送消息 =====
    Core.sendMessage = async function(content){
        if(!window.SupabaseClient || !SupabaseClient.isLoggedIn()){
            throw new Error('未登录');
        }
        if(!Core.currentUser) throw new Error('用户信息缺失');
        const sb = SupabaseClient.get();
        if(!sb) throw new Error('客户端未初始化');
        // 确保用户名已加载
        if(!Core.username) await loadUsername(Core.currentUser.id);
        const { error } = await sb.from('chat_messages').insert({
            channel: Core.currentChannel,
            user_id: Core.currentUser.id,
            username: Core.username,
            content: content
        });
        if(error) throw error;
        // 消息会通过 Realtime 推送回来，无需本地主动追加
    };
})();