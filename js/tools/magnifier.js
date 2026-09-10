/*!
 * magnifier.js — 独立放大镜工具（复刻老 Win10 放大镜：独立可拖动悬浮放大窗口）
 * by Doubao
 *
 * @sideWidget 放大镜 — 悬浮独立放大窗口，可拖动/调大小/三视图切换
 *
 * 原理：navigator.mediaDevices.getDisplayMedia() 捕获屏幕实时流，
 *       用 canvas 按倍率截取源区域并放大绘制到悬浮窗内，实现实时放大镜。
 *
 * 宿主可选挂载点：#magnifierRoot（缺失时自动创建右下角悬浮入口按钮）
 * 对外 API：window.ConsoleWebMagnifier
 *
 * 三个视图（快捷键与 Win11 放大镜保持一致）：
 *   Ctrl+Alt+L  镜头模式  悬浮窗跟随鼠标移动（默认）
 *   Ctrl+Alt+D  固定模式  悬浮窗固定视野，窗口内拖拽可平移视野
 *   Ctrl+Alt+F  全屏模式  覆盖整个页面视口，跟随鼠标
 *   Ctrl+Alt+M  循环切换三种模式
 *   Ctrl+Alt+= / Ctrl+Alt+-   放大 / 缩小（窗口内滚轮亦可）
 *
 * 浏览器安全限制（务必知晓）：
 *   1) 只能放大本页面所在浏览器里的可视内容，无法盖住/放大其他应用程序窗口；
 *   2) 首次启动需用户手动选择共享内容（建议选“整个屏幕”）；
 *   3) 需要 https 或 localhost 环境，且顶层页面可用 getDisplayMedia；
 *   4) 多显示器下坐标以主屏为准，副屏区域可能无法精确定位。
 */
(function(){
    'use strict';

    // ============ 常量 ============
    var NS = 'mg-';                 // 样式/元素命名前缀
    var MIN_ZOOM = 1;
    var MAX_ZOOM = 16;
    var ZOOM_STEP = 0.5;

    // ============ 运行时状态 ============
    var state = {
        opened: false,      // 面板是否打开
        running: false,     // 是否正在捕获/绘制
        mode: 'lens',       // 'lens' | 'fixed' | 'full'
        zoom: 2,
        pointer: { x: 0, y: 0 },   // 镜头跟随点（逻辑屏幕坐标）
        anchor: { x: 0, y: 0 },    // 固定模式视野中心（逻辑屏幕坐标）
        stream: null,
        video: null,
        raf: 0,
        dragging: false,    // 正在拖动窗口
        dragOff: { x: 0, y: 0 },
        panning: false,     // 固定模式下正在平移视野
        panStart: { x: 0, y: 0, ax: 0, ay: 0 }
    };

    // ============ DOM 引用（惰性构建） ============
    var rootEl, fabEl, panelEl, headEl, modeLabelEl, zoomLabelEl,
        canvasEl, barEl, dragHandleEl, fullMaskEl;

    // ============ 注入样式（不依赖宿主 CSS） ============
    (function injectStyle(){
        if (document.getElementById(NS + 'style')) return;
        var st = document.createElement('style');
        st.id = NS + 'style';
        st.textContent = [
            '#magnifierRoot{position:fixed;right:16px;bottom:16px;z-index:2147483000;font-size:13px;color:#e2e8f0;font-family:inherit;line-height:1.4;}',
            '#magnifierRoot *{box-sizing:border-box;margin:0;padding:0;}',
            /* 被 mount 挂载进四边弹窗栏时：改为普通流式布局 */
            '#magnifierRoot.mg-docked{position:static;right:auto;bottom:auto;z-index:auto;padding:8px;}',
            '#magnifierRoot.mg-docked #' + NS + 'fab{width:100%;justify-content:center;border-radius:6px;}',
            /* 悬浮入口按钮 */
            '#' + NS + 'fab{display:flex;align-items:center;gap:6px;padding:8px 14px;background:#0f172a;border:1px solid #334155;border-radius:20px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.45);user-select:none;transition:background .15s,transform .1s;}',
            '#' + NS + 'fab:hover{background:#1e293b;}',
            '#' + NS + 'fab:active{transform:translateY(1px);}',
            '#' + NS + 'fab .mg-ico{font-size:15px;}',
            '#' + NS + 'fab .mg-txt{font-size:12px;color:#94a3b8;}',
            /* 悬浮放大面板 */
            '#' + NS + 'panel{display:none;position:fixed;left:calc(50% - 210px);top:80px;width:420px;height:300px;min-width:240px;min-height:160px;background:#0f172a;border:1px solid #334155;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden;flex-direction:column;}',
            '#' + NS + 'panel.mg-open{display:flex;}',
            /* 标题栏（拖动手柄） */
            '#' + NS + 'panel .mg-head{display:flex;align-items:center;gap:6px;padding:6px 8px;background:#1e293b;cursor:move;flex:none;user-select:none;border-bottom:1px solid #334155;}',
            '#' + NS + 'panel .mg-mode{font-size:11px;color:#22d3ee;background:rgba(34,211,238,.12);border:1px solid #164e63;padding:1px 8px;border-radius:9px;flex:none;}',
            '#' + NS + 'panel .mg-title{flex:1;font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '#' + NS + 'panel .mg-zoom{font-size:12px;color:#e2e8f0;flex:none;font-variant-numeric:tabular-nums;min-width:44px;text-align:center;}',
            '#' + NS + 'panel .mg-hbtn{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;line-height:1;padding:2px 5px;border-radius:3px;flex:none;}',
            '#' + NS + 'panel .mg-hbtn:hover{color:#f87171;background:rgba(248,113,113,.15);}',
            /* 画布区 */
            '#' + NS + 'panel .mg-canvas-wrap{position:relative;flex:1;min-height:0;overflow:hidden;background:#020617;cursor:crosshair;}',
            '#' + NS + 'panel canvas{display:block;width:100%;height:100%;}',
            '#' + NS + 'panel .mg-hint{position:absolute;left:0;right:0;bottom:0;padding:4px 8px;font-size:11px;color:#94a3b8;background:rgba(2,6,23,.72);pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            /* 工具栏 */
            '#' + NS + 'panel .mg-bar{display:flex;align-items:center;gap:4px;padding:6px 8px;background:#1e293b;border-top:1px solid #334155;flex:none;flex-wrap:wrap;}',
            '#' + NS + 'panel .mg-btn{padding:4px 10px;font-size:12px;color:#e2e8f0;background:#334155;border:none;border-radius:4px;cursor:pointer;}',
            '#' + NS + 'panel .mg-btn:hover{background:#475569;}',
            '#' + NS + 'panel .mg-btn:active{transform:translateY(1px);}',
            '#' + NS + 'panel .mg-btn.mg-on{background:#0891b2;color:#fff;}',
            '#' + NS + 'panel .mg-btn.mg-go{background:#059669;}',
            '#' + NS + 'panel .mg-btn.mg-go:hover{background:#047857;}',
            '#' + NS + 'panel .mg-btn.mg-stop{background:#b91c1c;}',
            '#' + NS + 'panel .mg-btn.mg-stop:hover{background:#991b1b;}',
            '#' + NS + 'panel .mg-btn.mg-mini{padding:4px 8px;font-size:11px;color:#94a3b8;background:transparent;border:1px solid #475569;}',
            '#' + NS + 'panel .mg-btn.mg-mini:hover{color:#e2e8f0;border-color:#64748b;}',
            /* 全屏遮罩（全屏模式） */
            '#' + NS + 'full{display:none;position:fixed;inset:0;z-index:2147483001;background:#020617;flex-direction:column;overflow:hidden;}',
            '#' + NS + 'full.mg-open{display:flex;}',
            '#' + NS + 'full .mg-head{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#1e293b;cursor:move;flex:none;user-select:none;border-bottom:1px solid #334155;}',
            '#' + NS + 'full .mg-canvas-wrap{position:relative;flex:1;min-height:0;overflow:hidden;background:#020617;cursor:crosshair;}',
            '#' + NS + 'full canvas{display:block;width:100%;height:100%;}',
            '#' + NS + 'full .mg-hint{position:absolute;left:0;right:0;bottom:0;padding:5px 10px;font-size:12px;color:#94a3b8;background:rgba(2,6,23,.72);pointer-events:none;}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(st);
    })();

    // ============ 工具函数 ============
    function clamp(v, min, max){ return v < min ? min : (v > max ? max : v); }
    function el(tag, cls, html){
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html !== undefined) e.innerHTML = html;
        return e;
    }
    function isInsideMagnifier(t){
        while (t && t !== document){
            if (t === panelEl || t === fullMaskEl) return true;
            t = t.parentNode;
        }
        return false;
    }

    // ============ 构建 DOM ============
    function ensureDom(){
        if (rootEl) return;

        // 挂载点：优先 #magnifierRoot，缺失则自动创建（与 mount.js 注册表 sel 一致）
        rootEl = document.getElementById('magnifierRoot');
        if (!rootEl){
            rootEl = el('div', null, '');
            rootEl.id = 'magnifierRoot';
            document.body.appendChild(rootEl);
        }

        // 入口按钮（随容器挂载/隐藏，抽屉里作为启动入口）
        fabEl = el('button', '', '<span class="mg-ico">&#128269;</span><span class="mg-txt">放大镜</span>');
        fabEl.id = NS + 'fab';
        fabEl.title = '打开悬浮放大镜（Ctrl+Alt+M 可循环切换模式）';
        fabEl.addEventListener('click', toggleOpen);
        rootEl.appendChild(fabEl);

        // 悬浮面板（直接挂 body：fixed 定位不受抽屉挂载/祖先布局影响）
        panelEl = el('div', '', '');
        panelEl.id = NS + 'panel';
        panelEl.innerHTML = [
            '<div class="mg-head">',
            '  <span class="mg-mode">镜头</span>',
            '  <span class="mg-title">悬浮放大镜</span>',
            '  <span class="mg-zoom">2.0x</span>',
            '  <button class="mg-hbtn" data-act="close" title="关闭（Esc）">&times;</button>',
            '</div>',
            '<div class="mg-canvas-wrap">',
            '  <canvas></canvas>',
            '  <div class="mg-hint">滚轮缩放 · 拖动标题栏移动窗口</div>',
            '</div>',
            '<div class="mg-bar">',
            '  <button class="mg-btn mg-on" data-mode="lens">镜头</button>',
            '  <button class="mg-btn" data-mode="fixed">固定</button>',
            '  <button class="mg-btn" data-mode="full">全屏</button>',
            '  <button class="mg-btn mg-mini" data-act="zoomOut">-</button>',
            '  <button class="mg-btn mg-mini" data-act="zoomIn">+</button>',
            '  <button class="mg-btn mg-go" data-act="start">开始放大</button>',
            '</div>'
        ].join('');
        document.body.appendChild(panelEl);

        headEl = panelEl.querySelector('.mg-head');
        modeLabelEl = panelEl.querySelector('.mg-mode');
        zoomLabelEl = panelEl.querySelector('.mg-zoom');
        canvasEl = panelEl.querySelector('canvas');
        barEl = panelEl.querySelector('.mg-bar');
        dragHandleEl = headEl;

        // 全屏遮罩
        fullMaskEl = el('div', '', '');
        fullMaskEl.id = NS + 'full';
        fullMaskEl.innerHTML = [
            '<div class="mg-head">',
            '  <span class="mg-mode">全屏</span>',
            '  <span class="mg-title">全屏放大（跟随鼠标）</span>',
            '  <span class="mg-zoom">2.0x</span>',
            '  <button class="mg-hbtn" data-act="close" title="退出全屏（Esc）">&times;</button>',
            '</div>',
            '<div class="mg-canvas-wrap">',
            '  <canvas></canvas>',
            '  <div class="mg-hint">Ctrl+Alt+M 切换模式 · Ctrl+Alt+= / - 缩放 · 移动鼠标浏览 · Esc 退出</div>',
            '</div>'
        ].join('');
        document.body.appendChild(fullMaskEl);

        bindEvents();
        syncModeUI();
        syncZoomUI();
    }

    // ============ 事件绑定 ============
    function bindEvents(){
        // 工具栏按钮
        barEl.addEventListener('click', function(e){
            var btn = e.target.closest ? e.target.closest('.mg-btn') : null;
            if (!btn) return;
            e.stopPropagation(); // 避免冒泡到面板处理器被误判为“关闭”
            var act = btn.getAttribute('data-act');
            var mode = btn.getAttribute('data-mode');
            if (act === 'start'){ start(); }
            else if (act === 'stop'){ stop(); }
            else if (act === 'zoomIn'){ setZoom(state.zoom + ZOOM_STEP); }
            else if (act === 'zoomOut'){ setZoom(state.zoom - ZOOM_STEP); }
            else if (mode){ setMode(mode); }
        });

        // 面板头部按钮（仅头部区域生效）
        panelEl.addEventListener('click', function(e){
            if (!e.target.closest || !e.target.closest('.mg-head')) return;
            var b = e.target.closest('[data-act]');
            if (b && b.getAttribute('data-act') === 'close'){ close(); }
        });
        fullMaskEl.addEventListener('click', function(e){
            var b = e.target.closest ? e.target.closest('[data-act]') : null;
            if (!b) return;
            if (b.getAttribute('data-act') === 'close'){ setMode('lens'); }
        });

        // 拖动窗口（标题栏；全屏模式固定铺满，禁止拖动）
        [headEl, fullMaskEl.querySelector('.mg-head')].forEach(function(h){
            h.addEventListener('mousedown', function(e){
                if (e.button !== 0 || state.mode === 'full') return;
                state.dragging = true;
                state.dragOff.x = e.clientX - h.parentNode.getBoundingClientRect().left;
                state.dragOff.y = e.clientY - h.parentNode.getBoundingClientRect().top;
                e.preventDefault();
            });
        });

        // 固定模式：画布内平移视野
        [canvasEl, fullMaskEl.querySelector('canvas')].forEach(function(c){
            c.addEventListener('mousedown', function(e){
                if (e.button !== 0 || state.mode !== 'fixed') return;
                state.panning = true;
                state.panStart.x = e.clientX;
                state.panStart.y = e.clientY;
                state.panStart.ax = state.anchor.x;
                state.panStart.ay = state.anchor.y;
                e.preventDefault();
            });
        });

        // 画布滚轮缩放
        panelEl.addEventListener('wheel', function(e){
            e.preventDefault();
            setZoom(state.zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
        }, { passive: false });
        fullMaskEl.addEventListener('wheel', function(e){
            e.preventDefault();
            setZoom(state.zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
        }, { passive: false });

        // 全局：拖动 / 平移 / 指针跟随
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', function(){
            state.dragging = false;
            state.panning = false;
        });

        // 全局：快捷键
        document.addEventListener('keydown', onKeyDown);
    }

    function onMouseMove(e){
        // 拖动窗口
        if (state.dragging){
            var target = state.mode === 'full' ? fullMaskEl : panelEl;
            var left = e.clientX - state.dragOff.x;
            var top = e.clientY - state.dragOff.y;
            left = clamp(left, 8, window.innerWidth - 120);
            top = clamp(top, 8, window.innerHeight - 60);
            target.style.left = left + 'px';
            target.style.top = top + 'px';
            return;
        }
        // 固定模式平移视野
        if (state.panning){
            var dx = (e.clientX - state.panStart.x) / state.zoom;
            var dy = (e.clientY - state.panStart.y) / state.zoom;
            state.anchor.x = state.panStart.ax - dx;
            state.anchor.y = state.panStart.ay - dy;
            return;
        }
        // 记录镜头/全屏跟随点（面板内移动忽略，避免画面自激抖动）
        if (state.mode === 'full' || !isInsideMagnifier(e.target)){
            state.pointer.x = e.screenX;
            state.pointer.y = e.screenY;
        }
    }

    function onKeyDown(e){
        // Esc：先于 Ctrl+Alt 守卫处理
        if ((e.key || '') === 'Escape' && state.opened){
            e.preventDefault();
            if (state.mode === 'full'){ setMode('lens'); }
            else { close(); }
            return;
        }
        if (!state.opened) return;
        var tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (!e.ctrlKey || !e.altKey) return;

        var k = (e.key || '').toLowerCase();
        if (k === 'l'){ e.preventDefault(); setMode('lens'); }
        else if (k === 'd'){ e.preventDefault(); setMode('fixed'); }
        else if (k === 'f'){ e.preventDefault(); setMode('full'); }
        else if (k === 'm'){ e.preventDefault(); cycleMode(); }
        else if (k === '=' || k === '+'){ e.preventDefault(); setZoom(state.zoom + ZOOM_STEP); }
        else if (k === '-' || k === '_'){ e.preventDefault(); setZoom(state.zoom - ZOOM_STEP); }
    }

    // ============ 捕获与绘制 ============
    function start(){
        if (state.running) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){
            alert('当前环境不支持 getDisplayMedia（需 https 或 localhost 的浏览器）。');
            return;
        }
        navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 30, max: 60 } },
            audio: false
        }).then(function(stream){
            state.stream = stream;
            state.running = true;

            if (!state.video){
                state.video = document.createElement('video');
                state.video.muted = true;
                state.video.playsInline = true;
            }
            state.video.srcObject = stream;
            state.video.play().catch(function(){ /* 静音播放一般不会失败 */ });

            // 用户停止共享时自动清理
            var track = stream.getVideoTracks()[0];
            if (track){
                track.addEventListener('ended', stop);
            }

            // 初始锚点与跟随点：屏幕中心
            state.anchor.x = window.screenX + window.innerWidth / 2;
            state.anchor.y = window.screenY + window.innerHeight / 2;
            state.pointer.x = state.anchor.x;
            state.pointer.y = state.anchor.y;

            syncRunUI();
            loop();
        }).catch(function(err){
            var msg = (err && err.name) || '';
            if (msg === 'NotAllowedError' || msg === 'PermissionDeniedError'){
                alert('已取消屏幕共享，放大镜无法启动。再次点击“开始放大”并选择“整个屏幕”即可。');
            } else if (msg === 'NotReadableError' || msg === 'AbortError'){
                alert('未选择任何共享内容，放大镜未启动。');
            } else {
                alert('启动放大镜失败：' + (err && err.message ? err.message : err));
            }
            syncRunUI();
        });
    }

    function stop(){
        state.running = false;
        if (state.raf){ cancelAnimationFrame(state.raf); state.raf = 0; }
        if (state.stream){
            state.stream.getTracks().forEach(function(t){ t.stop(); });
            state.stream = null;
        }
        if (state.video){ state.video.srcObject = null; }
        clearCanvas();
        syncRunUI();
    }

    function loop(){
        if (!state.running) return;
        var vw = state.video && state.video.videoWidth;
        var vh = state.video && state.video.videoHeight;
        if (vw && vh){
            drawFrame(vw, vh);
        }
        state.raf = requestAnimationFrame(loop);
    }

    function drawFrame(vw, vh){
        var mask = state.mode === 'full' ? fullMaskEl : panelEl;
        var canvas = mask.querySelector('canvas');
        var wrap = mask.querySelector('.mg-canvas-wrap');
        var w = wrap.clientWidth;
        var h = wrap.clientHeight;
        if (!w || !h) return;

        // 视频像素 → 逻辑屏幕坐标 的比例（单屏场景）
        var scaleX = vw / screen.width;
        var scaleY = vh / screen.height;

        var srcW = w / state.zoom;
        var srcH = h / state.zoom;

        var cx, cy;
        if (state.mode === 'lens' || state.mode === 'full'){
            cx = state.pointer.x * scaleX;
            cy = state.pointer.y * scaleY;
        } else {
            cx = state.anchor.x * scaleX;
            cy = state.anchor.y * scaleY;
        }

        var sx = clamp(cx - srcW / 2, 0, Math.max(vw - srcW, 0));
        var sy = clamp(cy - srcH / 2, 0, Math.max(vh - srcH, 0));

        var dpr = window.devicePixelRatio || 1;
        var cw = Math.round(w * dpr);
        var ch = Math.round(h * dpr);
        if (canvas.width !== cw || canvas.height !== ch){
            canvas.width = cw;
            canvas.height = ch;
        }

        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, cw, ch);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(state.video, sx, sy, srcW, srcH, 0, 0, cw, ch);

        // 固定模式绘制十字准星
        if (state.mode === 'fixed'){
            drawCrosshair(ctx, cw, ch);
        }

        // 更新倍率标签
        var label = mask.querySelector('.mg-zoom');
        if (label && label.textContent !== state.zoom.toFixed(1) + 'x'){
            label.textContent = state.zoom.toFixed(1) + 'x';
        }
    }

    function drawCrosshair(ctx, cw, ch){
        var m = 10, len = 16;
        var x = cw / 2, y = ch / 2;
        // 四边中点短线 + 中心点，避免整条十字线遮挡画面
        ctx.strokeStyle = 'rgba(34,211,238,.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - m - len, y); ctx.lineTo(x - m, y);
        ctx.moveTo(x + m, y);      ctx.lineTo(x + m + len, y);
        ctx.moveTo(x, y - m - len); ctx.lineTo(x, y - m);
        ctx.moveTo(x, y + m);      ctx.lineTo(x, y + m + len);
        ctx.stroke();
        ctx.fillStyle = 'rgba(34,211,238,.9)';
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    function clearCanvas(){
        [panelEl, fullMaskEl].forEach(function(mask){
            var c = mask && mask.querySelector('canvas');
            if (c && c.getContext){
                var ctx = c.getContext('2d');
                ctx.clearRect(0, 0, c.width, c.height);
            }
        });
    }

    // ============ 状态与 UI 同步 ============
    // 同步抽屉挂载样式：被 mount 移入四边弹窗栏时切换为流式布局
    function syncDockStyle(){
        if (!rootEl) return;
        var parent = rootEl.parentElement;
        var docked = !!(parent && parent.classList && parent.classList.contains('side-inner'));
        rootEl.classList.toggle('mg-docked', docked);
    }
    window.addEventListener('sideLayoutApplied', syncDockStyle);

    // 未挂载（容器在 mount 隐藏仓库 widgetDock 内）时，把容器临时移到 body 供快捷键唤起使用
    function detachForUse(){
        if (!rootEl) return;
        var parent = rootEl.parentElement;
        if (parent && parent.id === 'widgetDock'){
            document.body.appendChild(rootEl);
            rootEl.style.display = '';
        }
    }

    function syncModeUI(){
        var names = { lens: '镜头', fixed: '固定', full: '全屏' };
        modeLabelEl.textContent = names[state.mode] || state.mode;
        fullMaskEl.querySelector('.mg-mode').textContent = names[state.mode] || state.mode;

        barEl.querySelectorAll('[data-mode]').forEach(function(b){
            b.classList.toggle('mg-on', b.getAttribute('data-mode') === state.mode);
        });

        // 全屏/面板切换显示
        var isFull = state.mode === 'full';
        panelEl.classList.toggle('mg-open', state.opened && !isFull);
        fullMaskEl.classList.toggle('mg-open', state.opened && isFull);
        if (isFull){
            // 全屏时面板隐藏，但保持打开状态
            fullMaskEl.style.left = '0px';
            fullMaskEl.style.top = '0px';
        } else {
            fullMaskEl.classList.remove('mg-open');
        }
        fabEl.style.display = state.opened ? 'none' : '';
    }

    function syncZoomUI(){
        zoomLabelEl.textContent = state.zoom.toFixed(1) + 'x';
        fullMaskEl.querySelector('.mg-zoom').textContent = state.zoom.toFixed(1) + 'x';
        var hint = state.mode === 'fixed'
            ? '滚轮缩放 · 画布内拖拽平移视野 · 拖动标题栏移动窗口'
            : '滚轮缩放 · 移动鼠标浏览 · 拖动标题栏移动窗口';
        panelEl.querySelector('.mg-hint').textContent = hint;
    }

    function syncRunUI(){
        var btn = barEl.querySelector('[data-act="start"]');
        if (!btn) return;
        if (state.running){
            btn.textContent = '停止';
            btn.classList.remove('mg-go');
            btn.classList.add('mg-stop');
            btn.setAttribute('data-act', 'stop');
        } else {
            btn.textContent = '开始放大';
            btn.classList.remove('mg-stop');
            btn.classList.add('mg-go');
            btn.setAttribute('data-act', 'start');
        }
    }

    // ============ 对外动作 ============
    function toggleOpen(){
        if (state.opened) close(); else open();
    }

    function open(){
        ensureDom();
        detachForUse();
        syncDockStyle();
        state.opened = true;
        syncModeUI();
    }

    function close(){
        state.opened = false;
        stop();
        panelEl.classList.remove('mg-open');
        fullMaskEl.classList.remove('mg-open');
        fabEl.style.display = '';
    }

    function setMode(mode){
        if (['lens', 'fixed', 'full'].indexOf(mode) === -1) return;
        ensureDom();
        state.mode = mode;
        syncModeUI();
        syncZoomUI();
    }

    function cycleMode(){
        var order = ['lens', 'fixed', 'full'];
        var i = order.indexOf(state.mode);
        setMode(order[(i + 1) % order.length]);
    }

    function setZoom(z){
        ensureDom();
        z = clamp(Number(z) || state.zoom, MIN_ZOOM, MAX_ZOOM);
        state.zoom = Math.round(z * 2) / 2;
        syncZoomUI();
    }

    // ============ 快捷键面板外快捷启动 ============
    // 在页面任意处按 Ctrl+Alt+M 也可唤出（与面板内一致），此处单独监听一次全局唤起
    document.addEventListener('keydown', function(e){
        if (state.opened) return;
        if (e.ctrlKey && e.altKey && ((e.key || '').toLowerCase() === 'm')){
            e.preventDefault();
            ensureDom();
            open();
        }
    });

    // ============ 对外 API ============
    window.ConsoleWebMagnifier = {
        open: open,
        close: close,
        start: start,
        stop: stop,
        setMode: setMode,
        cycleMode: cycleMode,
        setZoom: setZoom,
        getState: function(){ return {
            opened: state.opened,
            running: state.running,
            mode: state.mode,
            zoom: state.zoom
        }; }
    };

    // ============ 自启动 ============
    // mount.js 动态加载（脚本挂到 body 末尾）时 body 已存在，立即构建容器，
    // 确保 loadWidgetScripts 的 onDone → applySideLayout 能第一时间找到 #magnifierRoot。
    // 若被 <head> 中的静态 script 引用（body 尚不存在），则等 DOMContentLoaded。
    function boot(){
        if (document.body){ ensureDom(); }
        else if (document.readyState === 'loading'){
            document.addEventListener('DOMContentLoaded', ensureDom);
        } else {
            ensureDom();
        }
    }
    if (document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', function(){ boot(); syncDockStyle(); });
    } else {
        boot();
        syncDockStyle();
    }
})();
