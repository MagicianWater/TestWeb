/*!
 * upgrade.js —— 升级模块（采集速度升级）
 * 依赖：base.js（需在 base.js 之后加载，读写全局 count / perSecond / cost / addLog）
 * 暴露：window.Upgrade
 *
 * 升级规则：消耗当前 cost 词元，perSecond ×1.5，cost ×1.8（向下取整）
 * UI 挂载点：#upgradeModule（首页卡片），缺失时静默忽略
 */
(function(){
    'use strict';

    const MODULE_KEY = 'upgradeModule';
    let btn = null;
    let costLabel = null;

    //===== 渲染升级卡片到 #upgradeModule =====
    function render(){
        const box = document.getElementById('upgradeModule');
        if(!box) return;
        box.innerHTML =
            '<h3 style="margin:0 0 8px;font-size:15px;color:#60a5fa;">采集模块升级</h3>' +
            '<p style="margin:0 0 10px;font-size:13px;color:#94a3b8;">当前产出：<span id="upgPerSec" style="color:#6ee7b7;">' + perSecond.toFixed(2) + '/s</span></p>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
                '<button id="upgradeBtn" style="padding:6px 18px;font-size:13px;color:#fff;background:#2563eb;border:none;border-radius:4px;cursor:pointer;">升级</button>' +
                '<span style="font-size:13px;color:#cbd5e1;">消耗：<span id="cost" style="color:#fcd34d;">' + cost + '</span> 词元</span>' +
            '</div>';
        btn = document.getElementById('upgradeBtn');
        costLabel = document.getElementById('cost');
        if(btn) btn.onclick = doUpgrade;
    }

    //===== 执行升级 =====
    function doUpgrade(){
        if(count >= cost){
            count -= cost;
            perSecond *= 1.5;
            cost = Math.floor(cost * 1.8);
            if(costLabel) costLabel.innerText = cost;
            addLog('采集模块已完成升级');
            updatePerSec();
        }else{
            addLog('词元不足，等待采集完成');
        }
    }

    //===== 刷新产出显示 =====
    function updatePerSec(){
        const el = document.getElementById('upgPerSec');
        if(el) el.innerText = perSecond.toFixed(2) + '/s';
    }

    //===== 对外 API =====
    window.Upgrade = {
        render: render,
        refresh: updatePerSec
    };

    //===== 初始化 =====
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', render);
    }else{
        render();
    }
})();