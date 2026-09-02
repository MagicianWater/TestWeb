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
//快捷键配置
let hotKeyList = [];
let enableEscBackup = true;
//标题遮挡：默认开启（悬停标题栏才显示标签）
let disableTitleOcclusion = false;

//标签解锁状态：首页、白色、设置默认开放
const tabStatus = {
    home: true,
    white: true,
    green: false,
    orange: false,
    red: false,
    purple: false,
    black: false,
    setting: true
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
    setting: '系统设置'
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
    setting: '#2563eb'
};

//标签 → 组件文件映射
const componentMap = {
    white:   {html:'components/panels/componentUI1.html', css:'css/components/componentUI1.css', js:'js/components/componentUI1.js', obj:'ComponentUI1'},
    green:   {html:'components/panels/componentUI2.html', css:'css/components/componentUI2.css', js:'js/components/componentUI2.js', obj:'ComponentUI2'},
    orange:  {html:'components/panels/componentUI3.html', css:'css/components/componentUI3.css', js:'js/components/componentUI3.js', obj:'ComponentUI3'},
    red:     {html:'components/panels/componentUI4.html', css:'css/components/componentUI4.css', js:'js/components/componentUI4.js', obj:'ComponentUI4'},
    purple:  {html:'components/panels/componentUI5.html', css:'css/components/componentUI5.css', js:'js/components/componentUI5.js', obj:'ComponentUI5'},
    black:   {html:'components/panels/componentUI6.html', css:'css/components/componentUI6.css', js:'js/components/componentUI6.js', obj:'ComponentUI6'},
    setting: {html:'components/setting/setting.html',       css:'css/components/setting.css',       js:'js/components/setting.js',       obj:'SettingPanel'}
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
const miniView = document.getElementById('miniView');
const miniCount = document.getElementById('miniCount');
const miniPerSec = document.getElementById('miniPerSec');
const mainWindow = document.getElementById('mainWindow');


//===== 窗口尺寸检测 =====
function checkViewportSize(){
    const w = window.innerWidth;
    const h = window.innerHeight;
    if(w < 450 || h < 450){
        miniView.style.display = 'flex';
        mainWindow.style.display = 'none';
    }else{
        miniView.style.display = 'none';
        mainWindow.style.display = 'block';
    }
}

//===== 四边抽屉切换 =====
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
const SIDE_MIN = {left:200, right:140, top:110, bottom:170};
const SIDE_MAX_RATIO = 0.9;
function loadSideSizes(){
    let cfg = {};
    try{ cfg = JSON.parse(localStorage.getItem('sideSizes') || '{}'); }catch(e){}
    ['left','right','top','bottom'].forEach(side=>{
        const wrap = document.querySelector('.side-' + side);
        if(!wrap) return;
        const key = (side === 'left' || side === 'right') ? 'width' : 'height';
        const saved = parseFloat(cfg[side]);
        const container = wrap.offsetParent || wrap.parentElement || document.body;
        const maxSize = (key === 'width' ? container.clientWidth : container.clientHeight) * SIDE_MAX_RATIO;
        let size = (saved && saved >= SIDE_MIN[side]) ? saved : SIDE_MIN[side];
        if(size > maxSize) size = maxSize;
        wrap.style[key] = size + 'px';
    });
}
function saveSideSize(side, size){
    let cfg = {};
    try{ cfg = JSON.parse(localStorage.getItem('sideSizes') || '{}'); }catch(e){}
    cfg[side] = Math.round(size);
    try{ localStorage.setItem('sideSizes', JSON.stringify(cfg)); }catch(e){}
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


//===== 本地存储读取设置 =====
function loadSettings(){
    const save = localStorage.getItem("idleGameSettings");
    if(save){
        const cfg = JSON.parse(save);
        hotKeyList = cfg.hotKeyList || [];
        enableEscBackup = cfg.enableEscBackup ?? true;
        disableTitleOcclusion = cfg.disableTitleOcclusion ?? false;
    }
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
    miniCount.innerText = formatNumber(count);
    miniPerSec.innerText = formatNumber(lastSecondGain);
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

//===== 键盘监听（老板键） =====
document.addEventListener('keydown', function(e){
    // 在老板键输入框录制快捷键时，不触发老板键
    if(e.target && e.target.tagName === 'INPUT' && e.target.id === 'bossHotkeyInput') return;
    let press = [];
    if(e.ctrlKey) press.push("Ctrl");
    if(e.altKey) press.push("Alt");
    if(e.shiftKey) press.push("Shift");
    if(!["Control","Alt","Shift"].includes(e.key)){
        press.push(e.key.toUpperCase());
    }
    const currentHot = press.join("+");

    if(hotKeyList.includes(currentHot)){
        e.preventDefault();
        toggleHide();
        return;
    }
    if(e.key === 'Escape' && enableEscBackup){
        e.preventDefault();
        toggleHide();
    }
});

//窗口大小变化
window.addEventListener('resize', checkViewportSize);

//初始化
loadSettings();
checkViewportSize();
initTabStatus();
updateLogoColor('home');

//===== 弹窗栏挂载系统已迁移至 js/core/mount.js（与 base.js 同级）=====
// 挂载组件注册、布局配置、动态加载、右键菜单等逻辑均由 mount.js 统一管理。
// 首页只需引入 mount.js，它会自动加载终端、脚本工具等挂载组件。