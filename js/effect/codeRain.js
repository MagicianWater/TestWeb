/*!
 * codeRain.js —— 黑客帝国代码雨动画（独立模块，可嵌入任意网页）
 * by 魔法白开水/豆包/GLM-5/DeepSeek
 *
 * 用法：在任意页面引入 <script src="codeRain.js"></script> 即可。
 *   自动创建浮动弹窗（可拖动/收起/拉伸），内含动画画布与数值输入框。
 *   宿主也可提供挂载点 #codeRainRoot（内联模式，不浮动）。
 *
 * 渲染规则（词元值 token 驱动）：
 *   第 i 条存在于 token > i 时（i 从 0 起，对应第 i 个词元单位）
 *   第 i 条长度 = min(基础长度, floor((token - i) × 10))，实时随词元更新
 *     例：0.1→1条1字符；0.2→1条2字符；1.0→1条10字符；1.1→2条(10+1)
 *   token - i < 0.09 时该条不渲染（不满0.09不渲染）
 *   上限 maxColumns 条；超过后不再增条，改为提速
 *   每条独立 depth∈[0,1]：大=透明度高=快=近，小=透明度低=慢=远
 *   每次重置：x 位置与上次不同，大小与上次不同且全局唯一
 *   速度按时间(px/s)，最快也 >1秒穿越窗口
 *   尾巴字符出了窗口底部才消除整条并开始下一条
 *   字符超出窗口不绘制
 *
 * 对外API：window.CodeRain
 *   setValue(n) / getValue()       设置/获取词元值
 *   setRate(n) / getRate()          设置/获取自动增速（词元/秒）
 *   startAuto() / stopAuto()        开启/停止自动增长
 *   show() / hide()                 显示/隐藏弹窗
 *   start() / stop()                启停渲染
 *   getConfig() / setConfig(patch)  读取/修改配置
 */
(function () {
    'use strict';

    // ===== 可调配置区（方便调整与需求设置） =====
    var CONFIG = {
        maxColumns: 300,            // 上限渲染条数
        baseLength: 10,             // 每条基础字符长度（满条）
        charSet: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        renderThreshold: 0.09,     // 不满此值不渲染
        headColor: '#f0fff0',       // 头部高亮色
        tailColor: '#22c55e',      // 尾部绿色
        bgColor: '#0f172a',        // 背景色（与终端一致）
        opacityRange: [0.45, 1.0],  // 透明度区间（小→大，整体提高避免尾部过淡）
        fontSizeRange: [10, 18],    // 字号区间（小→大）
        speedRange: [18, 70],      // 速度区间 px/s（慢→快，最快也 >1s 穿窗）
        minSizeStep: 0.02,         // 字号去重粒度（保证全局大小不同）
        xChangeRatio: 0.05,        // 重置时 x 至少偏移窗口宽度的 5%
        tailFade: 0.55,            // 尾部最低保留透明度（避免末尾太淡）
        // 速度随词元数提升：超过 maxColumns 条后不再增条，而是提速
        speedScaleStart: 300,      // 开始提速的词元数（=maxColumns）
        speedScaleEnd: 1000,       // 提速封顶的词元数
        speedScaleMax: 3,          // 封顶倍率（词元≥1000 时整体 3 倍速）
        // 弹窗默认值
        defaultToken: 0,           // 初始词元值
        defaultRate: 1.2,          // 初始自动增速（词元/秒）
        panelWidth: 360,           // 浮动弹窗宽度
        canvasHeight: 220          // 画布高度
    };

    // ===== 注入自包含样式（不依赖宿主CSS） =====
    (function injectStyle() {
        if (document.getElementById('cr-style')) return;
        var st = document.createElement('style');
        st.id = 'cr-style';
        st.textContent = [
            '#codeRainRoot{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;font-size:13px;color:#e2e8f0;font-family:inherit;box-sizing:border-box;}',
            '#codeRainRoot *{box-sizing:border-box;}',
            '#codeRainRoot button,#codeRainRoot input,#codeRainRoot label,#codeRainRoot h3{margin:0;font:inherit;color:inherit;}',
            '#codeRainRoot button{background:none;border:none;}',
            '#codeRainRoot.cr-float{position:fixed;top:12px;right:12px;width:' + CONFIG.panelWidth + 'px;height:auto;z-index:99999;background:#0f172a;border:1px solid #334155;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.4);}',
            '#codeRainRoot.cr-float .cr-head{cursor:move;}',
            '#codeRainRoot .cr-head{display:flex;align-items:center;gap:6px;padding:8px 10px;user-select:none;flex:none;border-bottom:1px solid #1e293b;}',
            '#codeRainRoot .cr-title{margin:0;flex:1;font-size:14px;color:#e2e8f0;font-weight:600;}',
            '#codeRainRoot .cr-info{color:#6ee7b7;font-size:11px;font-variant-numeric:tabular-nums;background:#1e293b;border:1px solid #10b981;padding:1px 8px;border-radius:10px;white-space:nowrap;}',
            '#codeRainRoot .cr-collapse{display:none;color:#94a3b8;cursor:pointer;font-size:13px;padding:0 6px;line-height:1;border-radius:3px;}',
            '#codeRainRoot .cr-collapse:hover{color:#e2e8f0;background:#1e293b;}',
            '#codeRainRoot.cr-float .cr-collapse{display:inline-block;}',
            '#codeRainRoot .cr-close{display:none;color:#94a3b8;cursor:pointer;font-size:15px;padding:0 4px;line-height:1;border-radius:3px;}',
            '#codeRainRoot .cr-close:hover{color:#f87171;background:rgba(248,113,113,.15);}',
            '#codeRainRoot.cr-float .cr-close{display:inline-block;}',
            '#codeRainRoot.cr-mini .cr-body{display:none !important;}',
            '#codeRainRoot .cr-body{display:flex;flex-direction:column;flex:1;min-height:0;}',
            '#codeRainRoot .cr-canvas-wrap{position:relative;width:100%;height:' + CONFIG.canvasHeight + 'px;min-height:80px;background:' + CONFIG.bgColor + ';overflow:hidden;flex:none;}',
            '#codeRainRoot .cr-canvas-wrap canvas{display:block;width:100%;height:100%;}',
            '#codeRainRoot .cr-controls{display:flex;align-items:center;gap:8px;padding:8px 10px;flex-wrap:wrap;flex:none;border-top:1px solid #1e293b;}',
            '#codeRainRoot .cr-controls label{display:flex;align-items:center;gap:4px;font-size:12px;color:#94a3b8;}',
            '#codeRainRoot .cr-controls input[type="number"]{width:64px;padding:3px 5px;font-size:12px;color:#e2e8f0;background:#0f172a;border:1px solid #475569;border-radius:4px;outline:none;}',
            '#codeRainRoot .cr-controls input[type="number"]:focus{border-color:#2563eb;}',
            '#codeRainRoot .cr-controls input[type="number"]::-webkit-inner-spin-button{opacity:.4;}',
            '#codeRainRoot .cr-btn{padding:4px 10px;font-size:12px;border-radius:4px;cursor:pointer;color:#fff;background:#334155;transition:opacity .15s;white-space:nowrap;}',
            '#codeRainRoot .cr-btn.cr-on{background:#10b981;}',
            '#codeRainRoot .cr-btn:hover{opacity:.85;}',
            '#codeRainRoot .cr-resize{position:absolute;right:0;bottom:0;width:14px;height:14px;display:none;z-index:10;}',
            '#codeRainRoot.cr-float .cr-resize{display:block;cursor:nwse-resize;}',
            '#codeRainRoot .cr-resize::after{content:"";position:absolute;right:3px;bottom:3px;width:8px;height:8px;border-right:2px solid #475569;border-bottom:2px solid #475569;border-radius:0 0 3px 0;}',
            ''
        ].join('\n');
        (document.head || document.documentElement).appendChild(st);
    })();

    // ===== 状态 =====
    var root, box, canvas, ctx;
    var dpr = window.devicePixelRatio || 1;
    var cssW = 0, cssH = 0;
    var columns = [];            // 每条代码雨（按词元单位 i 索引，持久化）
    var sizeSet = {};            // 当前已用字号（去重后）→ true
    var rafId = null;
    var running = false;
    var lastTime = 0;

    // 词元内部状态（不再依赖宿主全局变量）
    var state = {
        token: CONFIG.defaultToken,   // 当前词元值
        rate: CONFIG.defaultRate,     // 自动增速（词元/秒）
        autoGrow: false              // 是否自动增长
    };

    // ===== 工具 =====
    function randChar() {
        var s = CONFIG.charSet;
        return s.charAt(Math.floor(Math.random() * s.length));
    }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function roundSize(fs) { return Math.round(fs / CONFIG.minSizeStep) * CONFIG.minSizeStep; }

    // 生成一个全局唯一且与 prev 不同的字号
    function genFontSize(prev) {
        var fs, key, tries = 0;
        do {
            var depth = Math.random();
            fs = lerp(CONFIG.fontSizeRange[0], CONFIG.fontSizeRange[1], depth);
            key = roundSize(fs);
            tries++;
        } while ((sizeSet[key] || (prev != null && Math.abs(fs - prev) < 0.5)) && tries < 80);
        sizeSet[key] = true;
        return fs;
    }
    function releaseFontSize(fs) { delete sizeSet[roundSize(fs)]; }

    // 生成与 prev 不同的 x 位置
    function genX(prev) {
        var x, tries = 0;
        var minDelta = cssW * CONFIG.xChangeRatio;
        do { x = Math.random() * cssW; tries++; }
        while (prev != null && Math.abs(x - prev) < minDelta && tries < 80);
        return x;
    }

    // 由字号反推 depth（用于 opacity/speed 映射）
    function depthFromSize(fs) {
        return (fs - CONFIG.fontSizeRange[0]) / (CONFIG.fontSizeRange[1] - CONFIG.fontSizeRange[0]);
    }

    // 全局速度倍率：词元超过 speedScaleStart 后线性提升，到 speedScaleEnd 封顶为 speedScaleMax
    function getSpeedScale(res) {
        if (res <= CONFIG.speedScaleStart) return 1;
        if (res >= CONFIG.speedScaleEnd) return CONFIG.speedScaleMax;
        return 1 + (res - CONFIG.speedScaleStart) / (CONFIG.speedScaleEnd - CONFIG.speedScaleStart) * (CONFIG.speedScaleMax - 1);
    }

    // ===== 创建一条代码雨 =====
    function makeColumn(i) {
        var fs = genFontSize(null);
        var depth = depthFromSize(fs);
        return {
            i: i,
            fontSize: fs,
            depth: depth,
            opacity: lerp(CONFIG.opacityRange[0], CONFIG.opacityRange[1], depth),
            speed: lerp(CONFIG.speedRange[0], CONFIG.speedRange[1], depth),
            x: genX(null),
            y: -fs * (1 + Math.random() * 2),   // 起始在顶部上方
            chars: [],
            prevX: null,
            prevFontSize: null
        };
    }

    // 调整字符数（在头部增/删，保持头部为最新字符）
    function setLength(col, len) {
        while (col.chars.length < len) col.chars.unshift(randChar());
        while (col.chars.length > len) col.chars.pop();
    }

    // 重置一条代码雨（尾巴出窗后调用）：换位置、换大小、回顶部、换字符
    function resetColumn(col) {
        releaseFontSize(col.fontSize);
        col.prevFontSize = col.fontSize;
        var fs = genFontSize(col.prevFontSize);
        col.fontSize = fs;
        col.depth = depthFromSize(fs);
        col.opacity = lerp(CONFIG.opacityRange[0], CONFIG.opacityRange[1], col.depth);
        col.speed = lerp(CONFIG.speedRange[0], CONFIG.speedRange[1], col.depth);
        col.prevX = col.x;
        col.x = genX(col.prevX);
        col.y = -fs * (1 + Math.random() * 2);
        col.chars.length = 0;                  // 清空，下一帧 reconcile 会重新填字
    }

    // ===== 尺寸适配（DPR） =====
    function resize() {
        if (!box) return;
        cssW = box.clientWidth;
        cssH = box.clientHeight;
        canvas.width = Math.max(1, Math.floor(cssW * dpr));
        canvas.height = Math.max(1, Math.floor(cssH * dpr));
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ===== 每帧 reconcile：按词元确定条数与每条长度 =====
    function reconcile(res) {
        // 计算目标：第 i 条长度
        var target = [];
        var i = 0;
        while (i < CONFIG.maxColumns) {
            var seg = res - i;
            if (seg < CONFIG.renderThreshold) break;
            var len = Math.min(CONFIG.baseLength, Math.floor(seg * 10));
            if (len < 1) break;                 // 不满0.1词元无字符，停止
            target.push(len);
            i++;
        }

        // 移除多余的列（词元减少或上限变化时）
        while (columns.length > target.length) {
            var removed = columns.pop();
            releaseFontSize(removed.fontSize);
        }
        // 新增不足的列
        while (columns.length < target.length) {
            columns.push(makeColumn(columns.length));
        }
        // 更新每条长度（实时随词元变化）
        for (var k = 0; k < columns.length; k++) {
            setLength(columns[k], target[k]);
        }
    }

    // ===== 渲染一帧 =====
    function frame(now) {
        if (!running) return;
        if (!lastTime) lastTime = now;
        var dt = (now - lastTime) / 1000;
        lastTime = now;
        if (dt > 0.05) dt = 0.05;               // 防止切回标签页后大跳

        // 自动增长：词元按增速累加
        if (state.autoGrow && state.rate > 0) {
            state.token += state.rate * dt;
            syncTokenInput();
        }

        var res = state.token;

        // 清屏
        ctx.fillStyle = CONFIG.bgColor;
        ctx.fillRect(0, 0, cssW, cssH);

        // 不满阈值不渲染
        if (res < CONFIG.renderThreshold) {
            rafId = requestAnimationFrame(frame);
            return;
        }

        reconcile(res);

        // 全局速度倍率：词元超过300后提速，1000时3倍封顶
        var speedScale = getSpeedScale(res);

        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        for (var ci = 0; ci < columns.length; ci++) {
            var col = columns[ci];
            // 下落（时间制，乘以全局速度倍率）
            col.y += col.speed * speedScale * dt;
            ctx.font = col.fontSize + 'px "Consolas","Microsoft Yahei",monospace';

            var len = col.chars.length;
            // 尾巴字符（最顶端）完全离开窗口底部 → 重置
            var tailTop = col.y - (len - 1) * col.fontSize;
            if (tailTop > cssH) {
                resetColumn(col);
                // 重置后长度由下一帧 reconcile 补回，本帧先按原长度补画
                setLength(col, len);
            }

            // 绘制：k=0 头部在 col.y，k 增大向顶部延伸
            for (var k = 0; k < col.chars.length; k++) {
                var fy = col.y - k * col.fontSize;
                if (fy + col.fontSize < 0) break;   // 已在窗口上方，后续更上，跳出
                if (fy > cssH) continue;            // 在窗口下方，跳过该字符（不绘制）
                if (k === 0) {
                    ctx.globalAlpha = col.opacity;
                    ctx.fillStyle = CONFIG.headColor;
                } else {
                    // 尾部从 opacity 平滑衰减到 tailFade，避免末尾过淡
                    var fade = 1 - k / col.chars.length;
                    ctx.globalAlpha = col.opacity * (CONFIG.tailFade + (1 - CONFIG.tailFade) * fade);
                    ctx.fillStyle = CONFIG.tailColor;
                }
                ctx.fillText(col.chars[k], col.x, fy);
            }
            ctx.globalAlpha = 1;
        }

        rafId = requestAnimationFrame(frame);
    }

    // ===== 启动 / 停止 =====
    function start() {
        if (running) return;
        running = true;
        lastTime = 0;
        rafId = requestAnimationFrame(frame);
    }
    function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
    }

    // ===== UI 同步 =====
    var tokenInput, rateInput, autoBtn, infoEl;
    function syncTokenInput() {
        if (tokenInput && document.activeElement !== tokenInput) {
            tokenInput.value = state.token.toFixed(2);
        }
        if (infoEl) infoEl.textContent = '词元 ' + state.token.toFixed(2);
    }
    function syncAutoBtn() {
        if (!autoBtn) return;
        if (state.autoGrow) {
            autoBtn.textContent = '停止增长';
            autoBtn.classList.add('cr-on');
        } else {
            autoBtn.textContent = '自动增长';
            autoBtn.classList.remove('cr-on');
        }
    }

    // ===== 构建弹窗面板 =====
    function buildPanel() {
        root = document.getElementById('codeRainRoot');
        if (!root) {
            root = document.createElement('div');
            root.id = 'codeRainRoot';
            root.className = 'cr-float';
            document.body.appendChild(root);
        }
        root.innerHTML = [
            '<div class="cr-head">',
                '<h3 class="cr-title">代码雨</h3>',
                '<span class="cr-info">词元 0.00</span>',
                '<button class="cr-collapse" title="收起/展开">—</button>',
                '<button class="cr-close" title="关闭">×</button>',
            '</div>',
            '<div class="cr-body">',
                '<div class="cr-canvas-wrap"><canvas></canvas></div>',
                '<div class="cr-controls">',
                    '<label>词元 <input type="number" id="crTokenInput" value="0" step="0.1" min="0"></label>',
                    '<label>增速/s <input type="number" id="crRateInput" value="' + CONFIG.defaultRate + '" step="0.1" min="0"></label>',
                    '<button class="cr-btn" id="crAutoBtn">自动增长</button>',
                '</div>',
            '</div>',
            '<div class="cr-resize" title="拖动调整大小"></div>'
        ].join('');

        box = root.querySelector('.cr-canvas-wrap');
        canvas = root.querySelector('canvas');
        ctx = canvas.getContext('2d');
        infoEl = root.querySelector('.cr-info');
        tokenInput = root.querySelector('#crTokenInput');
        rateInput = root.querySelector('#crRateInput');
        autoBtn = root.querySelector('#crAutoBtn');

        // 词元输入：实时设置
        tokenInput.addEventListener('input', function () {
            var v = parseFloat(tokenInput.value);
            state.token = isNaN(v) ? 0 : Math.max(0, v);
            infoEl.textContent = '词元 ' + state.token.toFixed(2);
        });
        // 增速输入：实时设置
        rateInput.addEventListener('input', function () {
            var v = parseFloat(rateInput.value);
            state.rate = isNaN(v) ? 0 : Math.max(0, v);
        });
        // 自动增长开关
        autoBtn.addEventListener('click', function () {
            state.autoGrow = !state.autoGrow;
            syncAutoBtn();
            if (state.autoGrow && !running) start();
        });

        syncTokenInput();
        syncAutoBtn();
    }

    // ===== 浮动面板：拖动 / 收起 / 拉伸（仅 cr-float 模式） =====
    function initFloatPanel() {
        if (!root.classList.contains('cr-float')) return;
        var head = root.querySelector('.cr-head');
        var resizeHandle = root.querySelector('.cr-resize');
        var collapseBtn = root.querySelector('.cr-collapse');
        var closeBtn = root.querySelector('.cr-close');
        var canvasWrap = root.querySelector('.cr-canvas-wrap');

        // 恢复上次位置 / 尺寸
        try {
            var pos = JSON.parse(localStorage.getItem('crFloatPos') || 'null');
            var sz = JSON.parse(localStorage.getItem('crFloatSize') || 'null');
            if (pos && pos.left) { root.style.left = pos.left; root.style.right = 'auto'; }
            if (pos && pos.top) root.style.top = pos.top;
            if (sz && sz.width) root.style.width = sz.width;
            if (sz && sz.height) root.style.height = sz.height;
            if (sz && sz.canvasHeight) canvasWrap.style.height = sz.canvasHeight;
        } catch (e) {}

        // 拖动（标题栏）
        head.addEventListener('mousedown', function (e) {
            if (e.target.closest('.cr-collapse')) return;
            if (e.target.closest('.cr-close')) return;
            e.preventDefault();
            var startX = e.clientX, startY = e.clientY;
            var origLeft = root.offsetLeft, origTop = root.offsetTop;
            root.style.right = 'auto';
            function onMove(ev) {
                root.style.left = (origLeft + ev.clientX - startX) + 'px';
                root.style.top = (origTop + ev.clientY - startY) + 'px';
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                try { localStorage.setItem('crFloatPos', JSON.stringify({ left: root.style.left, top: root.style.top })); } catch (e) {}
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        // 拉伸（右下角）：同时调画布高度
        resizeHandle.addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var startX = e.clientY;
            var ow = root.offsetWidth;
            var ohCanvas = canvasWrap.offsetHeight;
            function onMove(ev) {
                root.style.width = Math.max(240, ow + (ev.clientX - (root.getBoundingClientRect().left + ow))) + 'px';
                canvasWrap.style.height = Math.max(80, ohCanvas + ev.clientY - startX) + 'px';
                resize();
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                try { localStorage.setItem('crFloatSize', JSON.stringify({ width: root.style.width, canvasHeight: canvasWrap.style.height })); } catch (e) {}
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        // 收起 / 展开
        collapseBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var mini = root.classList.toggle('cr-mini');
            collapseBtn.textContent = mini ? '▢' : '—';
        });
        // 关闭弹窗（停止渲染并隐藏面板）
        if (closeBtn) {
            closeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                stop();
                root.style.display = 'none';
            });
        }
    }

    // ===== 显示 / 隐藏 =====
    function show() { if (root) { root.style.display = ''; if (!running) start(); } }
    function hide() { if (root) { stop(); root.style.display = 'none'; } }

    // ===== 初始化 =====
    function init() {
        buildPanel();
        initFloatPanel();
        resize();
        start();

        if (window.ResizeObserver) {
            new ResizeObserver(function () { resize(); }).observe(box);
        }
        window.addEventListener('resize', resize);

        // 对外API
        window.CodeRain = {
            setValue: function (n) { state.token = Math.max(0, +n || 0); syncTokenInput(); },
            getValue: function () { return state.token; },
            setRate: function (n) { state.rate = Math.max(0, +n || 0); if (rateInput) rateInput.value = state.rate; },
            getRate: function () { return state.rate; },
            startAuto: function () { state.autoGrow = true; syncAutoBtn(); if (!running) start(); },
            stopAuto: function () { state.autoGrow = false; syncAutoBtn(); },
            show: show,
            hide: hide,
            start: start,
            stop: stop,
            getConfig: function () { return CONFIG; },
            setConfig: function (patch) {
                for (var k in patch) {
                    if (Object.prototype.hasOwnProperty.call(patch, k)) CONFIG[k] = patch[k];
                }
            }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();