/*!
 * mount.js —— 挂载管理器（统一注册、加载与挂载可挂载组件）
 *
 * 职责：
 *   1. 持有弹窗栏挂载逻辑（从 base.js 提取，base.js 不再关心挂载细节）
 *   2. 统一注册可挂载组件（终端、脚本工具……），新增组件只需在此登记一行
 *   3. 动态加载组件脚本——首页只需引入本文件，无需单独引入各组件
 *   4. 加载完成后应用布局配置（移动容器到对应弹窗栏）
 *
 * 依赖：base.js（需在 base.js 之后加载）
 * 对外 API（window）：
 *   getSideLayout / setSideLayout / getSideWidgetList / SIDE_LABELS / updateSideTabs
 *   setFloatOpen / getFloatOpen / setFloatWidgetEnabled / getAllWidgets
 */
(function(){
    'use strict';

    //===== 挂载组件注册表（统一注册入口） =====
    // 每项：{ id, sel, name, script }
    //   id     组件标识
    //   sel    容器选择器（挂载系统据此查找并移动容器）
    //   name   显示名称（用于弹窗栏标签、设置面板）
    //   script 组件脚本路径，由本文件动态加载
    const SIDE_WIDGETS = [
        { id:'terminal',   sel:'#termPanel',     name:'终端',     script:'./js/core/terminal/terminal.js?v=20260902' },
        { id:'scriptTool', sel:'#scriptToolRoot', name:'脚本工具', script:'./js/tools/scriptTool.js?v=20260902' }
    ];

    const SIDE_ORDER  = ['top','bottom','left','right'];
    const SIDE_LABELS = { top:'上方', bottom:'下方', left:'左侧', right:'右侧' };
    const DEFAULT_LAYOUT = { top:null, bottom:'terminal', left:null, right:'scriptTool' };
    let sideLayout = Object.assign({}, DEFAULT_LAYOUT);
    let widgetDock = null;

    //===== 识别某弹窗栏当前挂载的组件 =====
    function detectSideWidget(inner){
        if(!inner) return null;
        for(let i=0;i<SIDE_WIDGETS.length;i++){
            if(inner.querySelector(SIDE_WIDGETS[i].sel)) return SIDE_WIDGETS[i];
        }
        return null;
    }
    function updateSideTabs(){
        document.querySelectorAll('.side-wrap').forEach(function(wrap){
            const inner = wrap.querySelector('.side-inner');
            const tab = wrap.querySelector('.side-tab');
            if(!inner || !tab) return;
            const w = detectSideWidget(inner);
            tab.textContent = w ? w.name : '无';
            wrap.classList.toggle('side-empty', !w);
        });
    }

    //===== 加载/保存布局配置（localStorage） =====
    function loadSideLayout(){
        try{
            const cfg = JSON.parse(localStorage.getItem('sideLayout') || '{}');
            SIDE_ORDER.forEach(function(s){ if(cfg[s] !== undefined) sideLayout[s] = cfg[s]; });
        }catch(e){}
    }
    function saveSideLayout(){
        try{ localStorage.setItem('sideLayout', JSON.stringify(sideLayout)); }catch(e){}
    }

    //===== 应用布局：把组件容器移动到对应弹窗栏，未挂载的移入隐藏仓库 =====
    function applySideLayout(){
        if(!widgetDock){
            widgetDock = document.createElement('div');
            widgetDock.id = 'widgetDock';
            widgetDock.style.display = 'none';
            document.body.appendChild(widgetDock);
        }
        // 1. 先把所有工具容器移入仓库并隐藏（保留 DOM，绝不删除）
        SIDE_WIDGETS.forEach(function(w){
            const el = document.querySelector(w.sel);
            if(el){ widgetDock.appendChild(el); el.style.display = 'none'; }
        });
        // 2. 清理各弹窗栏的纯文本占位，保留元素节点（标题/输入框等）
        SIDE_ORDER.forEach(function(side){
            const inner = document.querySelector('.side-' + side + ' .side-inner');
            if(!inner) return;
            Array.prototype.slice.call(inner.childNodes).forEach(function(node){
                if(node.nodeType === 3 && node.nodeValue && node.nodeValue.trim()){
                    inner.removeChild(node);
                }
            });
        });
        // 3. 按布局把工具放回对应弹窗栏并显示
        SIDE_ORDER.forEach(function(side){
            const wid = sideLayout[side];
            if(!wid) return;
            const w = SIDE_WIDGETS.find(function(x){ return x.id === wid; });
            if(!w) return;
            const el = document.querySelector(w.sel);
            const inner = document.querySelector('.side-' + side + ' .side-inner');
            if(el && inner){ inner.appendChild(el); el.style.display = ''; }
        });
        updateSideTabs();
    }

    //===== 对外 API =====
    window.getSideLayout = function(){ return Object.assign({}, sideLayout); };
    window.setSideLayout = function(cfg){
        sideLayout = Object.assign({}, DEFAULT_LAYOUT, cfg || {});
        // 去重：同一工具只保留最后一次出现的边
        const seen = {};
        SIDE_ORDER.forEach(function(side){
            const wid = sideLayout[side];
            if(!wid) return;
            if(seen[wid]){ sideLayout[side] = null; }
            else seen[wid] = side;
        });
        saveSideLayout();
        applySideLayout();
    };
    window.getSideWidgetList = function(){
        return SIDE_WIDGETS.map(function(w){ return { id:w.id, name:w.name }; });
    };
    window.SIDE_LABELS = SIDE_LABELS;
    window.updateSideTabs = updateSideTabs;

    //===== 浮动窗组件注册表（仅浮动，不挂弹窗栏；通过各自 show/hide API 控制） =====
    // 注册项格式：{ id, sel, name, api:fn→返回组件对象, enabled:是否纳入管理（默认 false） }
    // effect 脚本默认不纳入管理列表；未来通过条件变量将 enabled 置 true 即可加入。
    const FLOAT_WIDGETS = [
        { id:'scene3d',  sel:'#scene3dRoot',  name:'3D场景', api:function(){ return window.Scene3D; },  enabled:false },
        { id:'codeRain', sel:'#codeRainRoot', name:'代码雨', api:function(){ return window.CodeRain; }, enabled:false }
    ];
    function managedFloatWidgets(){ return FLOAT_WIDGETS.filter(function(w){ return w.enabled; }); }
    let floatState = {};
    function loadFloatState(){
        let cfg = {};
        try{ cfg = JSON.parse(localStorage.getItem('floatState') || '{}'); }catch(e){}
        FLOAT_WIDGETS.forEach(function(w){ floatState[w.id] = !!cfg[w.id]; });
    }
    function saveFloatState(){
        try{ localStorage.setItem('floatState', JSON.stringify(floatState)); }catch(e){}
    }
    function applyFloatState(){
        managedFloatWidgets().forEach(function(w){
            const api = w.api();
            if(!api) return;
            if(floatState[w.id]){ if(api.show) api.show(); }
            else{ if(api.hide) api.hide(); }
        });
    }
    window.setFloatOpen = function(id, on){
        floatState[id] = !!on;
        saveFloatState();
        const w = FLOAT_WIDGETS.find(function(x){ return x.id === id; });
        if(w){
            const api = w.api();
            if(api){ on ? (api.show && api.show()) : (api.hide && api.hide()); }
        }
    };
    window.getFloatOpen = function(id){ return !!floatState[id]; };
    window.setFloatWidgetEnabled = function(id, enabled){
        const w = FLOAT_WIDGETS.find(function(x){ return x.id === id; });
        if(w) w.enabled = !!enabled;
    };
    // 统一组件清单（供设置面板"功能管理"使用）——仅含已启用的浮动窗
    window.getAllWidgets = function(){
        const result = [];
        SIDE_WIDGETS.forEach(function(w){
            let loc = '无';
            SIDE_ORDER.forEach(function(s){ if(sideLayout[s] === w.id) loc = SIDE_LABELS[s]; });
            result.push({ id:w.id, name:w.name, mode:'side', location:loc });
        });
        managedFloatWidgets().forEach(function(w){
            result.push({ id:w.id, name:w.name, mode:'float', open:!!floatState[w.id] });
        });
        return result;
    };

    //===== 动态加载挂载组件脚本 =====
    function loadWidgetScripts(){
        const scripts = SIDE_WIDGETS.map(function(w){ return w.script; });
        let pending = scripts.length;
        function onDone(){
            pending--;
            if(pending === 0){
                // 所有组件脚本加载完毕，应用布局（此时 #scriptToolRoot 等已创建）
                applySideLayout();
                updateSideTabs();
            }
        }
        scripts.forEach(function(src){
            const s = document.createElement('script');
            s.src = src;
            s.onload = onDone;
            s.onerror = function(){ console.error('[mount] 加载失败: ' + src); onDone(); };
            document.body.appendChild(s);
        });
    }

    //===== 弹窗栏标签右键菜单：直接选择挂载工具 =====
    (function(){
        function injectMenuStyle(){
            if(document.getElementById('side-ctx-style')) return;
            const st = document.createElement('style');
            st.id = 'side-ctx-style';
            st.textContent = [
                '#sideCtxMenu{position:fixed;z-index:99999;min-width:120px;background:#0f172a;border:1px solid #334155;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.45);padding:4px 0;font-size:13px;color:#e2e8f0;font-family:inherit;overflow:hidden;}',
                '#sideCtxMenu .sc-item{display:flex;align-items:center;gap:8px;padding:7px 14px;cursor:pointer;white-space:nowrap;}',
                '#sideCtxMenu .sc-item:hover{background:#1e293b;}',
                '#sideCtxMenu .sc-item.active{color:#60a5fa;}',
                '#sideCtxMenu .sc-item .sc-check{width:14px;color:#60a5fa;flex:none;}',
                '#sideCtxMenu .sc-sep{height:1px;background:#334155;margin:4px 0;}'
            ].join('\n');
            (document.head || document.documentElement).appendChild(st);
        }
        let menuEl = null;
        function closeMenu(){
            if(menuEl){ menuEl.remove(); menuEl = null; }
            document.removeEventListener('click', closeMenu);
            document.removeEventListener('contextmenu', closeMenu);
        }
        function openMenu(side, x, y){
            injectMenuStyle();
            closeMenu();
            menuEl = document.createElement('div');
            menuEl.id = 'sideCtxMenu';
            const layout = window.getSideLayout();
            const widgets = window.getSideWidgetList();
            const cur = layout[side];
            const noneItem = document.createElement('div');
            noneItem.className = 'sc-item' + (!cur ? ' active' : '');
            noneItem.innerHTML = '<span class="sc-check">' + (!cur ? '✓' : '') + '</span>无';
            noneItem.onclick = function(e){
                e.stopPropagation();
                const cfg = window.getSideLayout();
                cfg[side] = null;
                window.setSideLayout(cfg);
                closeMenu();
            };
            menuEl.appendChild(noneItem);
            const sep = document.createElement('div');
            sep.className = 'sc-sep';
            menuEl.appendChild(sep);
            widgets.forEach(function(w){
                const item = document.createElement('div');
                item.className = 'sc-item' + (cur === w.id ? ' active' : '');
                item.innerHTML = '<span class="sc-check">' + (cur === w.id ? '✓' : '') + '</span>' + w.name;
                item.onclick = function(e){
                    e.stopPropagation();
                    const cfg = window.getSideLayout();
                    cfg[side] = w.id;
                    window.setSideLayout(cfg);
                    closeMenu();
                };
                menuEl.appendChild(item);
            });
            menuEl.style.left = Math.min(x, window.innerWidth - 140) + 'px';
            menuEl.style.top = Math.min(y, window.innerHeight - menuEl.offsetHeight - 8) + 'px';
            document.body.appendChild(menuEl);
            menuEl.style.top = Math.min(y, window.innerHeight - menuEl.offsetHeight - 8) + 'px';
            setTimeout(function(){
                document.addEventListener('click', closeMenu);
                document.addEventListener('contextmenu', closeMenu);
            }, 0);
        }
        document.addEventListener('contextmenu', function(e){
            const tab = e.target.closest('.side-tab');
            if(!tab) return;
            e.preventDefault();
            const wrap = tab.closest('.side-wrap');
            if(!wrap) return;
            const side = ['top','bottom','left','right'].find(function(s){ return wrap.classList.contains('side-' + s); });
            if(!side) return;
            openMenu(side, e.clientX, e.clientY);
        });
    })();

    //===== 初始化 =====
    loadSideLayout();
    loadFloatState();
    // 先应用一次布局：终端容器 #termPanel 已在 HTML 中，立即就位；scriptTool 尚未创建会被跳过
    applySideLayout();
    // 动态加载组件脚本，全部就绪后再次应用布局（此时 #scriptToolRoot 已创建）
    loadWidgetScripts();
    // 浮动窗组件延迟应用开关状态（等各组件 DOMContentLoaded 监听执行完毕）
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', function(){ setTimeout(applyFloatState, 0); });
    }else{
        setTimeout(applyFloatState, 0);
    }
})();