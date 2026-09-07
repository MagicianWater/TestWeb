/*!
 * chat-channels.js —— 聊天频道管理子模块
 * 依赖：chat.js（需在 ChatCore 创建后加载）
 * 挂载到 ChatCore：initChannels / switchChannel / renderChannelTabs
 *
 * 频道数据结构：{ id, name, type }
 *   id    频道标识（对应 chat_messages.channel）
 *   name  显示名称
 *   type  'global' 全服 / 'private' 私聊 / 'system' 系统（预留）
 */
(function(){
    'use strict';
    const Core = window.ChatCore;
    if(!Core) return;

    //===== 频道定义（先只制作全服公用聊天） =====
    const CHANNEL_DEFS = [
        { id:'global', name:'全服', type:'global' }
    ];

    //===== 初始化频道 =====
    Core.initChannels = function(){
        Core.channels = CHANNEL_DEFS.map(function(c){ return Object.assign({}, c); });
        Core.currentChannel = Core.channels[0] ? Core.channels[0].id : 'global';
        renderChannelTabs();
    };

    //===== 渲染频道标签 =====
    function renderChannelTabs(){
        if(!Core.channelTabs) return;
        Core.channelTabs.innerHTML = '';
        Core.channels.forEach(function(ch){
            const tab = document.createElement('span');
            tab.className = 'chat-channel-tab' + (ch.id === Core.currentChannel ? ' active' : '');
            tab.textContent = ch.name;
            tab.dataset.channel = ch.id;
            tab.addEventListener('click', function(){
                Core.switchChannel(ch.id);
            });
            Core.channelTabs.appendChild(tab);
        });
    }
    Core.renderChannelTabs = renderChannelTabs;

    //===== 切换频道 =====
    Core.switchChannel = function(channelId){
        if(channelId === Core.currentChannel) return;
        Core.currentChannel = channelId;
        renderChannelTabs();
        // 清空当前消息列表，由 realtime 模块重新加载该频道历史
        if(Core.msgList) Core.msgList.innerHTML = '';
        Core.systemMessage('已切换到频道：' + (getChannelName(channelId) || channelId));
        // 通知 realtime 模块加载该频道消息
        if(Core.loadChannelMessages) Core.loadChannelMessages(channelId);
    };

    //===== 获取频道名称 =====
    function getChannelName(id){
        const ch = Core.channels.find(function(c){ return c.id === id; });
        return ch ? ch.name : null;
    }
    Core.getChannelName = getChannelName;
})();