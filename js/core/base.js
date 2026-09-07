//===== 游戏核心数据 =====
let count = 0;
let perSecond = 10; // 默认增长速度
let cost = 10;
//资源显示名（名字待定，方便后续修改）
const RESOURCE_NAME = "词元";
//老板键状态
let isHide = false;
const gameTitle = "服务器运行监控";
const workTitle = "员工绩效统计表";
//快捷键配置：每项 { name, key, action }
//  action: 'toggle' 切换显示/隐藏，'hide' 收起弹窗栏
const DEFAULT_HOTKEYS = [
    { name: "切换", key: "",    action: "toggle" },
    { name: "收起", key: "NUM0", action: "hide"    }
];
let hotKeyList = DEFAULT_HOTKEYS.map(function(x){ return Object.assign({}, x); });
let enableEscBackup = true;
let enableNum0Backup = true;
//标题遮挡：默认开启（悬停标题栏才显示标签）
let disableTitleOcclusion = false;

//标签解锁状态：首页、白色、设置、账号默认开放
const tabStatus = {
    home: true,
    white: true,
    green: false,
    orange: false,
    red: false,
    purple: false,
    black: false,
    setting: true,
    account: true
};

//标签 → 面板标题
const panelTitles = {
    home: '系统资源监控面板',
    white: '白色面板',
    green: '绿色面板',
    orange: '橙色面板',
    red: '红色面板',
    purple: '紫色面板',
    black: '黑色面板',
    setting: '系统设置',
    account: '账号中心'
};

//标签 → logo颜色（与标签hover纯色一致）
const logoColors = {
    home: '#94a3b8',
    white: '#f1f5f9',
    green: '#22c55e',
    orange: '#f97316',
    red: '#ef4444',
    purple: '#a855f7',
    black: '#0a0a0a',
    setting: '#2563eb',
    account: '#ec4899'
};

//标签 → 组件文件映射
const componentMap = {
    white:   {html:'components/panels/componentUI1.html', css:'css/components/componentUI1.css', js:'js/components/componentUI1.js', obj:'ComponentUI1'},
    green:   {html:'components/panels/componentUI2.html', css:'css/components/componentUI2.css', js:'js/components/componentUI2.js', obj:'ComponentUI2'},
    orange:  {html:'components/panels/componentUI3.html', css:'css/components/componentUI3.css', js:'js/components/componentUI3.js', obj:'ComponentUI3'},
    red:     {html:'components/panels/componentUI4.html', css:'css/components/componentUI4.css', js:'js/components/componentUI4.js', obj:'ComponentUI4'},
    purple:  {html:'components/panels/componentUI5.html', css:'css/components/componentUI5.css', js:'js/components/componentUI5.js', obj:'ComponentUI5'},
    black:   {html:'components/panels/componentUI6.html', css:'css/components/componentUI6.css', js:'js/components/componentUI6.js', obj:'ComponentUI6'},
    setting: {html:'components/setting/setting.html',       css:'css/components/setting.css?v=20260907',       js:'js/components/setting.js?v=20260907',       obj:'SettingPanel'},
    account: {html:'components/account/account.html',      css:'css/components/account.css',      js:'js/components/account.js',      obj:'AccountPanel'}
};

//组件加载缓存
let currentCssLink = null;
const loadedJs = {};

//===== DOM元素引用 =====
const homeLine = document.getElementById('homeLine');
const logoSpin = document.querySelector('.logo-spin');
const logoText = document.querySelector('.logo-text');
const panelTitle = document.getElementById('panelTitle');
const normalView = document.getElementById('normalView');
const homeContent = document.getElementById('homeContent');
const componentContent = document.getElementById('componentContent');
const workPanel = document.getElementById('workPanel');


//===== 窗口尺寸检测（已迁移至 miniView.js，由 MiniView 模块独立管理） =====

//===== 四边抽屉切换 =====
// 初始化：确保所有弹窗栏默认收起（防止 CSS 过渡动画或缓存导致初始展开）
document.querySelectorAll('.side-wrap').forEach(wrap=>{
    wrap.classList.remove('open');
    wrap.style.zIndex = 900;
});
document.querySelectorAll('.side-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
        const currentWrap = tab.closest('.side-wrap');
        const isOpen = currentWrap.classList.contains('open');
        document.querySelectorAll('.side-wrap').forEach(wrap=>{
            wrap.classList.remove('open');
            wrap.style.zIndex = 900;
        });
        if(!isOpen){
            currentWrap.classList.add('open');
            currentWrap.style.zIndex = 1100;
        }
    });
});

//===== 四边抽屉拉伸（保持吸附浏览器边缘，默认最小，尺寸持久化） =====
// 尺寸持久化由 GameSave 统一管理，base.js 不再直接读写 localStorage。
const SIDE_MIN = {left:200, right:140, top:110, bottom:170};
const SIDE_MAX_RATIO = 0.9;
let sideSizes = {};
function loadSideSizes(){
    ['left','right','top','bottom'].forEach(side=>{
        const wrap = document.querySelector('.side-' + side);
        if(!wrap) return;
        const key = (side === 'left' || side === 'right') ? 'width' : 'height';
        const saved = parseFloat(sideSizes[side]);
        const container = wrap.offsetParent || wrap.parentElement || document.body;
        const maxSize = (key === 'width' ? container.clientWidth : container.clientHeight) * SIDE_MAX_RATIO;
        let size = (saved && saved >= SIDE_MIN[side]) ? saved : SIDE_MIN[side];
        if(size > maxSize) size = maxSize;
        wrap.style[key] = size + 'px';
    });
}
function saveSideSize(side, size){
    sideSizes[side] = Math.round(size);
    if(window.GameSave) GameSave._flushToStorage();
}
document.querySelectorAll('.side-resize').forEach(handle=>{
    handle.addEventListener('mousedown', e=>{
        e.preventDefault();
        const wrap = handle.closest('.side-wrap');
        if(!wrap) return;
        const side = wrap.classList.contains('side-left') ? 'left' :
                     wrap.classList.contains('side-right') ? 'right' :
                     wrap.classList.contains('side-top') ? 'top' : 'bottom';
        const container = wrap.offsetParent || wrap.parentElement || document.body;
        const isHoriz = (side === 'left' || side === 'right');
        const key = isHoriz ? 'width' : 'height';
        const startX = e.clientX, startY = e.clientY;
        const orig = wrap.getBoundingClientRect()[isHoriz ? 'width' : 'height'];
        const maxSize = (isHoriz ? container.clientWidth : container.clientHeight) * SIDE_MAX_RATIO;
        function onMove(ev){
            let size = orig;
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if(side === 'left') size = orig + dx;
            else if(side === 'right') size = orig - dx;
            else if(side === 'top') size = orig + dy;
            else if(side === 'bottom') size = orig - dy;
            size = Math.max(SIDE_MIN[side], Math.min(maxSize, size));
            wrap.style[key] = size + 'px';
        }
        function onUp(){
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            saveSideSize(side, wrap.getBoundingClientRect()[isHoriz ? 'width' : 'height']);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
});
loadSideSizes();


//===== 设置同步：值由 GameSave 统一恢复到全局变量，此处仅同步运行时 UI =====
function loadSettings(){
    applyTitleOverlay();
}

//===== 标题遮挡开关：关闭后标签常驻显示，不再悬停才出现 =====
function applyTitleOverlay(value){
    if(typeof value === 'boolean') disableTitleOcclusion = value;
    const bar = document.querySelector('.title-bar-tabbed');
    if(bar) bar.classList.toggle('tabs-always', disableTitleOcclusion);
}
window.applyTitleOverlay = applyTitleOverlay;
// 供设置面板保存后立即同步运行时配置
window.reloadSettings = loadSettings;

//===== 终端模块代理（terminal.js 提供实际实现，此处仅作占位/转发） =====
// terminal.js 在 base.js 之后加载，会覆盖 window.consoleWebAddLog；若 terminal.js 未加载则降级为空操作
function addLog(text){
    if(window.consoleWebAddLog) window.consoleWebAddLog(text);
}

//===== 占位：终端模块已迁移至 terminal.js =====

//===== 数字格式化：大数字用科学计数法 =====
function formatNumber(n){
    if(Math.abs(n) >= 1e12) return n.toExponential(2);
    return n.toFixed(2);
}

//===== 游戏循环（每帧实时刷新） =====
let lastFrameTime = performance.now();
let prevSecondCount = 0;        // 上一个测速时刻的资源值
let lastSecondGain = perSecond; // 上一秒合计增量（每秒实测）
let lastMeasureTime = performance.now();

function renderResource(){
    const line = RESOURCE_NAME + "：" + formatNumber(count) + "（+" + formatNumber(lastSecondGain) + "/s）";
    if(homeLine) homeLine.innerText = line;
    if(window.MiniView) MiniView.update(formatNumber(count), formatNumber(lastSecondGain));
}

//===== logo动画开关：默认无动画，/logotest on 开启，/logotest off 关闭 =====
let logoTestEnabled = false;
function setLogoAnimation(on){
    logoTestEnabled = on;
    if(logoSpin) logoSpin.style.animationPlayState = on ? 'running' : 'paused';
    if(logoText) logoText.style.animationPlayState = on ? 'running' : 'paused';
}
// 暴露给 terminal.js 的 /logotest 命令调用
window.setLogoAnimation = setLogoAnimation;

function gameLoop(now){
    const delta = now - lastFrameTime;
    lastFrameTime = now;
    count += perSecond * (delta / 1000);
    renderResource();
    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

//每1秒实测"上一秒合计"增量（与帧循环解耦，按实际耗时归一化，避免帧抖动/降频导致的测量偏差）
setInterval(function(){
    const now = performance.now();
    const elapsed = now - lastMeasureTime;
    if(elapsed > 0){
        lastSecondGain = (count - prevSecondCount) / (elapsed / 1000);
        prevSecondCount = count;
        lastMeasureTime = now;
    }
}, 1000);

//===== 升级逻辑已迁移至 js/core/index/upgrade.js =====

//===== 老板键伪装切换 =====
function toggleHide(){
    isHide = !isHide;
    if(isHide){
        normalView.style.display = 'none';
        workPanel.style.display = 'block';
        document.title = workTitle;
    }else{
        normalView.style.display = 'block';
        workPanel.style.display = 'none';
        document.title = gameTitle;
    }
}

//===== 收起所有已展开的弹窗栏 =====
function collapseAllSidePanels(){
    document.querySelectorAll('.side-wrap.open').forEach(wrap=>{
        wrap.classList.remove('open');
        wrap.style.zIndex = 900;
    });
}

//===== 快捷键动作：收起弹窗栏（无展开则先弹底部栏再收起） =====
function hideOnly(){
    const opened = document.querySelectorAll('.side-wrap.open');
    if(opened.length > 0){
        collapseAllSidePanels();
        return;
    }
    // 无展开：先弹出底部栏，0.3秒后收起
    const bottom = document.querySelector('.side-bottom');
    if(bottom){
        bottom.classList.add('open');
        bottom.style.zIndex = 1100;
        setTimeout(function(){
            bottom.classList.remove('open');
            bottom.style.zIndex = 900;
        }, 300);
    }
}

//===== 更新logo颜色为当前标签色 =====
function updateLogoColor(color){
    const c = logoColors[color] || '#38bdf8';
    const logoBox = document.querySelector('.logo-box');
    if(logoBox) logoBox.style.setProperty('--logo-color', c);
}

//===== 矢量logo点击闪烁效果 =====
(function(){
    const logoBox = document.querySelector('.logo-box');
    if(!logoBox) return;
    logoBox.addEventListener('click', function(){
        logoBox.classList.remove('flash');
        void logoBox.offsetWidth; // 强制重绘，保证连续点击可重新触发
        logoBox.classList.add('flash');
    });
    logoBox.addEventListener('animationend', function(){
        logoBox.classList.remove('flash');
    });
})();

//===== 切换面板：更新标题 + active标签 + 替换内容区 =====
function switchPanel(color){
    if(!tabStatus[color]) return;

    //更新标题
    panelTitle.textContent = panelTitles[color] || '';

    //更新active标签
    document.querySelectorAll('.tab-btn[data-color]').forEach(btn=>{
        btn.classList.toggle('active', btn.dataset.color === color);
    });

    //更新logo颜色为当前标签色
    updateLogoColor(color);

    if(color === 'home'){
        //回首页：显示首页内容，隐藏组件内容，卸载组件CSS，重新加载设置
        homeContent.style.display = 'block';
        componentContent.style.display = 'none';
        componentContent.innerHTML = '';
        if(currentCssLink){ currentCssLink.remove(); currentCssLink = null; }
        loadSettings();
    }else{
        //切换组件：隐藏首页内容，显示组件内容区，加载组件
        homeContent.style.display = 'none';
        componentContent.style.display = 'block';
        loadComponent(color);
    }
}

//===== 加载组件：隐藏iframe提取HTML + 动态CSS/JS =====
function loadComponent(color){
    const config = componentMap[color];
    if(!config) return;

    //加载CSS（移除旧的）
    if(currentCssLink){ currentCssLink.remove(); }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = config.css;
    document.head.appendChild(link);
    currentCssLink = link;

    //用隐藏iframe加载组件HTML，提取body内容注入
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.onload = function(){
        componentContent.innerHTML = iframe.contentDocument.body.innerHTML;
        document.body.removeChild(iframe);

        //加载或调用组件JS
        if(!loadedJs[color]){
            const script = document.createElement('script');
            script.src = config.js;
            script.onload = function(){
                callComponentInit(config.obj);
            };
            document.body.appendChild(script);
            loadedJs[color] = true;
        }else{
            callComponentInit(config.obj);
        }
    };
    iframe.src = config.html;
    document.body.appendChild(iframe);
}

function callComponentInit(objName){
    if(window[objName] && typeof window[objName].init === 'function'){
        window[objName].init();
    }
}

//===== 标签点击事件 =====
document.querySelectorAll('.tab-btn[data-color]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
        if(btn.classList.contains('active')) return;
        if(btn.classList.contains('locked')) return;
        switchPanel(btn.dataset.color);
    });
});

//===== 初始化标签锁定状态 =====
function initTabStatus(){
    document.querySelectorAll('.tab-btn[data-color]').forEach(btn=>{
        const c = btn.dataset.color;
        if(c && !tabStatus[c]) btn.classList.add('locked');
    });
}

//===== 键盘监听（快捷键） =====
// 统一按键名：小键盘按键识别为 NUM0~NUM9 等，避免 NumLock 状态影响
function normalizeKey(e){
    if(e.code && e.code.indexOf('Numpad') === 0){
        return 'NUM' + e.code.slice(6);
    }
    return (typeof e.key === 'string') ? e.key.toUpperCase() : '';
}
document.addEventListener('keydown', function(e){
    // 在快捷键输入框录制时，不触发快捷键动作
    if(e.target && e.target.tagName === 'INPUT' && e.target.classList.contains('hotkey-input')) return;
    let press = [];
    if(e.ctrlKey) press.push("Ctrl");
    if(e.altKey) press.push("Alt");
    if(e.shiftKey) press.push("Shift");
    const k = normalizeKey(e);
    if(k && !["CONTROL","ALT","SHIFT"].includes(k)){
        press.push(k);
    }
    const currentHot = press.join("+");

    // 遍历快捷键列表，匹配后按 action 分发
    for(let i = 0; i < hotKeyList.length; i++){
        const item = hotKeyList[i];
        if(item.key && item.key === currentHot){
            e.preventDefault();
            if(item.action === 'hide') hideOnly();
            else toggleHide();
            return;
        }
    }
    // 备用快捷键：ESC 切换、NUM0 收起（按键名与录制时一致）
    if(enableEscBackup && k === 'ESCAPE'){
        e.preventDefault();
        toggleHide();
        return;
    }
    if(enableNum0Backup && k === 'NUM0'){
        e.preventDefault();
        hideOnly();
        return;
    }
});

//窗口大小变化：交由 MiniView 模块检测
window.addEventListener('resize', function(){ if(window.MiniView) MiniView.checkSize(); });

//===== 持久化存档：统一注册到 GameSave，由 save.js 综合管理 =====
// 所有需要持久化的字段（核心数据、设置项、抽屉尺寸）均在此注册，
// 刷新后由 GameSave.restoreFromStorage() 一次性恢复，base.js 不再直接读写 localStorage。
// 注意：save.js 已在 base.js 之前加载，GameSave 此时可用。
if(window.GameSave){
    //核心游戏数据
    GameSave.register('count', function(){ return count; }, function(v){ if(typeof v === 'number') count = v; });
    GameSave.register('perSecond', function(){ return perSecond; }, function(v){ if(typeof v === 'number') perSecond = v; });
    GameSave.register('cost', function(){ return cost; }, function(v){ if(typeof v === 'number') cost = v; });
    //设置项（原 idleGameSettings，现由 GameSave 统一管理）
    GameSave.register('hotKeyList', function(){ return hotKeyList; }, function(v){
        if(!Array.isArray(v)) return;
        // 兼容旧格式：字符串数组 → 对象数组
        var restored = v.map(function(item){
            return typeof item === 'string'
                ? { name:"切换", key:item, action:"toggle" }
                : item;
        });
        // 以默认项为基础，用恢复数据覆盖同名项，保证默认快捷键始终存在
        hotKeyList = DEFAULT_HOTKEYS.map(function(def){
            var match = restored.find(function(r){ return r.name === def.name; });
            return match ? Object.assign({}, def, match) : Object.assign({}, def);
        });
    });
    GameSave.register('enableEscBackup', function(){ return enableEscBackup; }, function(v){ if(typeof v === 'boolean') enableEscBackup = v; });
    GameSave.register('enableNum0Backup', function(){ return enableNum0Backup; }, function(v){ if(typeof v === 'boolean') enableNum0Backup = v; });
    GameSave.register('disableTitleOcclusion', function(){ return disableTitleOcclusion; }, function(v){ if(typeof v === 'boolean') disableTitleOcclusion = v; });
    //四边抽屉尺寸（原 sideSizes，现由 GameSave 统一管理）
    GameSave.register('sideSizes', function(){ return sideSizes; }, function(v){ sideSizes = (v && typeof v === 'object') ? v : {}; loadSideSizes(); });
    //一次性恢复所有字段
    GameSave.restoreFromStorage();
    //恢复后刷新升级卡片显示（若已渲染）
    if(window.Upgrade && Upgrade.refresh) Upgrade.refresh();
    //启动自动存盘管理器（可配置周期 30s~5min、倒计时显示、存盘弹窗）
    GameSave.AutoSave.start();
}

//初始化（此时所有持久化字段已由 GameSave 恢复）
loadSettings();
initTabStatus();
updateLogoColor('home');

//===== 预载设置组件脚本 =====
// 小窗样式（miniView）的 CSS/JS 交由 setting 组件负责 import（见 setting.js 末尾）。
// 此处启动时预载 setting.js，使其立即载入 miniView，保证小窗降级在页面加载时即生效。
// 标记 loadedJs['setting'] 避免点击"设置"标签时 loadComponent 重复载入；
// 若用户在预载完成前已切到设置标签（HTML 已注入），则于预载完成后补执行 init。
(function(){
    if(loadedJs['setting']) return;
    loadedJs['setting'] = true;
    const s = document.createElement('script');
    s.src = componentMap.setting.js;
    s.onload = function(){
        if(window.SettingPanel && document.getElementById('titleOverlayBtn')){
            SettingPanel.init();
        }
    };
    document.body.appendChild(s);
})();

//===== 弹窗栏挂载系统已迁移至 js/core/mount.js（与 base.js 同级）=====
// 挂载组件注册、布局配置、动态加载、右键菜单等逻辑均由 mount.js 统一管理。
// 首页只需引入 mount.js，它会自动加载终端、脚本工具等挂载组件。