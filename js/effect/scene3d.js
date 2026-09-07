/*!
 * scene3d.js —— 3D 渲染场景工具（独立模块，可嵌入任意网页）
 * 风格与 scriptTool.js / codeRain.js 一致：IIFE 自注入、零外部依赖。
 *
 * 用法：在任意页面引入 <script src="scene3d.js"></script> 即可。
 *   自动创建浮动弹窗（可拖动/收起/拉伸），内含 3D 渲染画布与视角控制。
 *   宿主也可提供挂载点 #scene3dRoot（内联模式，不浮动）。
 *
 * 场景：低多边形 3D 场景 —— 中央旋转立方体 + 轨道星体 + 网格地面 + 悬浮粒子 + 星空背景。
 * 相机：默认自动缓慢环绕；在画布内按住鼠标右键拖拽可手动旋转视野（Yaw/Pitch）。
 *       暂不实现移动（WASD 等第一人称位移）。
 *
 * 对外API：window.Scene3D
 *   show() / hide()             显示/隐藏窗口
 *   start() / stop()            启停渲染
 *   setAutoRotate(on) / getAutoRotate()   自动环绕开关
 *   resetView()                 重置视角
 *   getYaw()/setYaw(a) / getPitch()/setPitch(a)   读写视角（弧度）
 *   getConfig() / setConfig(patch)
 */
(function(){
    'use strict';

    // ===== 可调配置区 =====
    var CONFIG = {
        camDist: 5.2,            // 相机距离（透视深度基准）
        focalScale: 0.9,         // 焦距 = 画布高度 × 该系数
        autoRotate: true,        // 默认自动环绕
        autoSpeed: 0.12,         // 自动环绕角速度 rad/s
        dragSpeed: 0.008,        // 右键拖拽灵敏度 rad/px
        pitchMin: -1.35,         // 俯仰角上下限（弧度）
        pitchMax: 1.35,
        // 场景元素开关
        showCube: true,          // 中央立方体
        showOrbit: true,         // 轨道星体
        showGrid: true,          // 网格地面
        showParticles: true,     // 悬浮粒子
        showStars: true,         // 星空背景
        // 弹窗默认值
        panelWidth: 440,
        canvasHeight: 300,
        // 右键拖拽方向：false=相对于自身（第一人称：右拖→视野右转）；true=相对于环境（旋转台：右拖→场景右转）
        dragInvert: false
    };

    // ===== 注入自包含样式 =====
    (function injectStyle(){
        if(document.getElementById('sd-style')) return;
        var st = document.createElement('style');
        st.id = 'sd-style';
        st.textContent = [
            '#scene3dRoot{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;font-size:13px;color:#e2e8f0;font-family:inherit;box-sizing:border-box;}',
            '#scene3dRoot *{box-sizing:border-box;}',
            '#scene3dRoot button,#scene3dRoot input,#scene3dRoot label,#scene3dRoot h3{margin:0;font:inherit;color:inherit;}',
            '#scene3dRoot button{background:none;border:none;}',
            '#scene3dRoot.sd-float{position:fixed;top:12px;left:12px;width:' + CONFIG.panelWidth + 'px;height:auto;z-index:99998;background:#0f172a;border:1px solid #334155;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.4);}',
            '#scene3dRoot.sd-float .sd-head{cursor:move;}',
            '#scene3dRoot .sd-head{display:flex;align-items:center;gap:6px;padding:8px 10px;user-select:none;flex:none;border-bottom:1px solid #1e293b;}',
            '#scene3dRoot .sd-title{margin:0;flex:1;font-size:14px;color:#e2e8f0;font-weight:600;}',
            '#scene3dRoot .sd-hint{color:#64748b;font-size:11px;white-space:nowrap;}',
            '#scene3dRoot .sd-collapse{display:none;color:#94a3b8;cursor:pointer;font-size:13px;padding:0 6px;line-height:1;border-radius:3px;}',
            '#scene3dRoot .sd-collapse:hover{color:#e2e8f0;background:#1e293b;}',
            '#scene3dRoot.sd-float .sd-collapse{display:inline-block;}',
            '#scene3dRoot .sd-close{display:none;color:#94a3b8;cursor:pointer;font-size:15px;padding:0 4px;line-height:1;border-radius:3px;}',
            '#scene3dRoot .sd-close:hover{color:#f87171;background:rgba(248,113,113,.15);}',
            '#scene3dRoot.sd-float .sd-close{display:inline-block;}',
            '#scene3dRoot.sd-mini .sd-body{display:none !important;}',
            '#scene3dRoot .sd-body{display:flex;flex-direction:column;flex:1;min-height:0;}',
            '#scene3dRoot .sd-canvas-wrap{position:relative;width:100%;height:' + CONFIG.canvasHeight + 'px;min-height:120px;background:#0b1220;overflow:hidden;flex:none;cursor:grab;}',
            '#scene3dRoot .sd-canvas-wrap.sd-drag{cursor:grabbing;}',
            '#scene3dRoot .sd-canvas-wrap canvas{display:block;width:100%;height:100%;}',
            '#scene3dRoot .sd-ctrl{display:flex;align-items:center;gap:8px;padding:7px 10px;flex-wrap:wrap;flex:none;border-top:1px solid #1e293b;}',
            '#scene3dRoot .sd-btn{padding:4px 10px;font-size:12px;border-radius:4px;cursor:pointer;color:#fff;background:#334155;transition:opacity .15s;white-space:nowrap;}',
            '#scene3dRoot .sd-btn.sd-on{background:#10b981;}',
            '#scene3dRoot .sd-btn:hover{opacity:.85;}',
            '#scene3dRoot .sd-resize{position:absolute;right:0;bottom:0;width:14px;height:14px;display:none;z-index:10;}',
            '#scene3dRoot.sd-float .sd-resize{display:block;cursor:nwse-resize;}',
            '#scene3dRoot .sd-resize::after{content:"";position:absolute;right:3px;bottom:3px;width:8px;height:8px;border-right:2px solid #475569;border-bottom:2px solid #475569;border-radius:0 0 3px 0;}',
            ''
        ].join('\n');
        (document.head || document.documentElement).appendChild(st);
    })();

    // ===== 状态 =====
    var root, box, canvas, ctx;
    var dpr = window.devicePixelRatio || 1;
    var cssW = 0, cssH = 0;
    var rafId = null;
    var running = false;
    var lastTime = 0;

    // 视角
    var view = { yaw: 0.5, pitch: 0.25 };

    // 右键拖拽
    var dragging = false, dragStartX = 0, dragStartY = 0, dragBaseYaw = 0, dragBasePitch = 0;

    // 场景数据
    var cubeVerts = [];      // 主立方体 8 顶点（世界坐标）
    var cubeFaces = [];      // 主立方体 6 面（顶点索引）
    var orbitSeeds = [];     // 轨道星体参数
    var particles = [];      // 悬浮粒子
    var stars = [];          // 星空（屏幕 2D）

    // ===== 场景生成 =====
    function buildScene(){
        var h = 0.62;   // 主立方体半边长
        var V = [
            [-h,-h,-h],[ h,-h,-h],[ h,-h, h],[-h,-h, h],
            [-h, h,-h],[ h, h,-h],[ h, h, h],[-h, h, h]
        ];
        cubeVerts = V;
        cubeFaces = [
            [0,1,2,3],   // 底
            [4,5,6,7],   // 顶
            [0,1,5,4],   // 前(-z)
            [2,3,7,6],   // 后(+z)
            [1,2,6,5],   // 右(+x)
            [0,3,7,4]    // 左(-x)
        ];
        // 轨道星体：多个半径/高度/初相
        orbitSeeds = [];
        var os = [[2.6, 0.35, 0], [3.3, -0.4, 2.1], [3.9, 0.5, 4.2], [2.1, 0.0, 5.0], [3.1, 0.25, 1.2]];
        for(var i = 0; i < os.length; i++){
            orbitSeeds.push({ r: os[i][0], y: os[i][1], phase: os[i][2], speed: 0.35 + i * 0.06, size: 0.10 + (i % 3) * 0.03 });
        }
        // 悬浮粒子
        particles = [];
        for(var j = 0; j < 70; j++){
            particles.push({
                x: (Math.random() * 2 - 1) * 5.2,
                y: (Math.random() * 2 - 1) * 3.0,
                z: (Math.random() * 2 - 1) * 5.2,
                r: 0.9 + Math.random() * 1.6,
                drift: (Math.random() * 2 - 1) * 0.12
            });
        }
    }
    function buildStars(){
        stars = [];
        var n = Math.max(60, Math.floor(cssW * cssH / 4500));
        for(var i = 0; i < n; i++){
            stars.push({ x: Math.random() * cssW, y: Math.random() * cssH, r: Math.random() * 1.2 + 0.3, a: 0.35 + Math.random() * 0.6 });
        }
    }

    // ===== 3D 数学：世界点 → 相机空间 → 屏幕 =====
    // 输入 [x,y,z]（世界），写入 out [sx,sy,depth]
    function project(p, out){
        var x = p[0], y = p[1], z = p[2];
        // pitch：绕 X 轴
        var cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
        var yA = y * cp - z * sp;
        var zA = y * sp + z * cp;
        // yaw：绕 Y 轴
        var cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
        var xB = x * cy + zA * sy;
        var zB = -x * sy + zA * cy;
        var d = zB + CONFIG.camDist;    // 相机前向深度（>0 在前）
        if(d < 0.2) d = 0.2;
        var f = cssH * CONFIG.focalScale;
        out[0] = cssW / 2 + xB * f / d;
        out[1] = cssH / 2 - yA * f / d;
        out[2] = d;
        return out;
    }
    // 面法线（由旋转后顶点计算，用于简单光照）
    function faceNormal(a, b, c){
        var ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
        var vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
        var nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
        var len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
        return [nx/len, ny/len, nz/len];
    }

    // ===== 渲染一帧 =====
    function frame(now){
        if(!running) return;
        if(!lastTime) lastTime = now;
        var dt = (now - lastTime) / 1000;
        lastTime = now;
        if(dt > 0.05) dt = 0.05;

        if(CONFIG.autoRotate && !dragging){
            view.yaw += CONFIG.autoSpeed * dt;
        }

        var t = now / 1000;
        var ctx2 = ctx;

        // 清屏（星空背景）
        ctx2.fillStyle = '#0b1220';
        ctx2.fillRect(0, 0, cssW, cssH);
        if(CONFIG.showStars){
            ctx2.fillStyle = '#dbeafe';
            for(var si = 0; si < stars.length; si++){
                var st = stars[si];
                var sy2 = st.y + t * 6 % cssH;
                if(sy2 > cssH) sy2 -= cssH;
                ctx2.globalAlpha = st.a;
                ctx2.fillRect(st.x, sy2, st.r, st.r);
            }
            ctx2.globalAlpha = 1;
        }

        // 收集可绘制对象（painter：按深度从远到近）
        var draws = [];
        var tmp = [0,0,0], tmp2 = [0,0,0];

        // 网格地面（线框）
        if(CONFIG.showGrid){
            var gy = -1.55, span = 4.4, step = 0.55;
            for(var gx = -span; gx <= span + 0.01; gx += step){
                var A = [gx, gy, -span], B = [gx, gy, span];
                project(A, tmp); project(B, tmp2);
                draws.push({ d: Math.max(tmp[2], tmp2[2]), k: 'line', x1: tmp[0], y1: tmp[1], x2: tmp2[0], y2: tmp2[1], c: 'rgba(34,211,238,0.22)' });
                var C = [-span, gy, gx], D = [span, gy, gx];
                project(C, tmp); project(D, tmp2);
                draws.push({ d: Math.max(tmp[2], tmp2[2]), k: 'line', x1: tmp[0], y1: tmp[1], x2: tmp2[0], y2: tmp2[1], c: 'rgba(34,211,238,0.22)' });
            }
        }

        // 中央立方体（填充面 + 光照）
        if(CONFIG.showCube){
            // 立方体自转
            var ax = 0.4 * t, ay = 0.6 * t;
            var cax = Math.cos(ax), sax = Math.sin(ax);
            var cay = Math.cos(ay), say = Math.sin(ay);
            var worldV = [];
            for(var vi = 0; vi < cubeVerts.length; vi++){
                var vx = cubeVerts[vi][0], vy = cubeVerts[vi][1], vz = cubeVerts[vi][2];
                var y1 = vy * cax - vz * sax, z1 = vy * sax + vz * cax;
                var x2 = vx * cay + z1 * say, z2 = -vx * say + z1 * cay;
                worldV.push([x2, y1, z2]);
            }
            for(var fi = 0; fi < cubeFaces.length; fi++){
                var f = cubeFaces[fi];
                var pts = [];
                var cx = 0, cy = 0, cz = 0;
                for(var q = 0; q < 4; q++){
                    var P = project(worldV[f[q]], tmp);
                    pts.push([P[0], P[1]]);
                    cx += P[0]; cy += P[1]; cz += P[2];
                }
                cx /= 4; cy /= 4; cz /= 4;
                var n = faceNormal(worldV[f[0]], worldV[f[1]], worldV[f[2]]);
                var bright = Math.max(0.12, (n[0] * -0.45 + n[1] * -0.65 + n[2] * 0.62));
                var col = 'rgba(' + Math.round(56 + 60 * bright) + ',' + Math.round(90 + 90 * bright) + ',' + Math.round(160 + 70 * bright) + ',0.82)';
                draws.push({ d: cz, k: 'face', pts: pts, fill: col, stroke: 'rgba(148,197,255,0.55)' });
            }
        }

        // 轨道星体（线框小立方体，绕 Y 公转 + 自转）
        if(CONFIG.showOrbit){
            for(var oi = 0; oi < orbitSeeds.length; oi++){
                var o = orbitSeeds[oi];
                var ang = t * o.speed + o.phase;
                var ox = Math.cos(ang) * o.r;
                var oz = Math.sin(ang) * o.r;
                var hs = o.size;
                var verts = [
                    [ox-hs,o.y-hs,oz-hs],[ox+hs,o.y-hs,oz-hs],[ox+hs,o.y-hs,oz+hs],[ox-hs,o.y-hs,oz+hs],
                    [ox-hs,o.y+hs,oz-hs],[ox+hs,o.y+hs,oz-hs],[ox+hs,o.y+hs,oz+hs],[ox-hs,o.y+hs,oz+hs]
                ];
                var edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
                for(var ei = 0; ei < edges.length; ei++){
                    var e0 = verts[edges[ei][0]], e1 = verts[edges[ei][1]];
                    project(e0, tmp); project(e1, tmp2);
                    var dd = (tmp[2] + tmp2[2]) / 2;
                    var alpha = 0.35 + 0.4 * Math.max(0, 1 - dd / 9);
                    draws.push({ d: dd, k: 'line', x1: tmp[0], y1: tmp[1], x2: tmp2[0], y2: tmp2[1], c: 'rgba(94,234,212,' + alpha + ')' });
                }
            }
        }

        // 悬浮粒子
        if(CONFIG.showParticles){
            for(var pi = 0; pi < particles.length; pi++){
                var pt = particles[pi];
                var px = pt.x, py = pt.y + Math.sin(t * 0.5 + pt.drift * 10) * 0.15, pz = pt.z;
                project([px, py, pz], tmp);
                var fade = Math.max(0, 1 - tmp[2] / 9.5);
                if(fade <= 0.02) continue;
                draws.push({ d: tmp[2], k: 'pt', x: tmp[0], y: tmp[1], r: pt.r * (0.6 + fade) * (cssH / 300), c: 'rgba(125,211,252,' + (0.55 * fade) + ')' });
            }
        }

        // 深度排序（远→近）并绘制
        draws.sort(function(a, b){ return b.d - a.d; });
        for(var di = 0; di < draws.length; di++){
            var dr = draws[di];
            if(dr.k === 'face'){
                ctx2.fillStyle = dr.fill;
                ctx2.strokeStyle = dr.stroke;
                ctx2.lineWidth = 1;
                ctx2.beginPath();
                ctx2.moveTo(dr.pts[0][0], dr.pts[0][1]);
                for(var pj = 1; pj < dr.pts.length; pj++) ctx2.lineTo(dr.pts[pj][0], dr.pts[pj][1]);
                ctx2.closePath();
                ctx2.fill();
                ctx2.stroke();
            }else if(dr.k === 'line'){
                ctx2.strokeStyle = dr.c;
                ctx2.lineWidth = 1;
                ctx2.beginPath();
                ctx2.moveTo(dr.x1, dr.y1);
                ctx2.lineTo(dr.x2, dr.y2);
                ctx2.stroke();
            }else if(dr.k === 'pt'){
                ctx2.fillStyle = dr.c;
                ctx2.beginPath();
                ctx2.arc(dr.x, dr.y, dr.r, 0, Math.PI * 2);
                ctx2.fill();
            }
        }
        ctx2.globalAlpha = 1;

        rafId = requestAnimationFrame(frame);
    }

    // ===== 尺寸适配 =====
    function resize(){
        if(!box || !canvas) return;
        cssW = box.clientWidth;
        cssH = box.clientHeight;
        canvas.width = Math.max(1, Math.floor(cssW * dpr));
        canvas.height = Math.max(1, Math.floor(cssH * dpr));
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildStars();
    }

    // ===== 启停 =====
    function start(){
        if(running) return;
        running = true;
        lastTime = 0;
        rafId = requestAnimationFrame(frame);
    }
    function stop(){
        running = false;
        if(rafId) cancelAnimationFrame(rafId);
        rafId = null;
    }

    // ===== 视角 =====
    function resetView(){ view.yaw = 0.5; view.pitch = 0.25; }

    // ===== 右键拖拽旋转视野（仅画布内，拖动中跟随） =====
    function initDrag(){
        if(!canvas || !box) return;
        canvas.addEventListener('mousedown', function(e){
            if(e.button !== 2) return;          // 仅右键
            e.preventDefault();
            dragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragBaseYaw = view.yaw;
            dragBasePitch = view.pitch;
            box.classList.add('sd-drag');
        });
        document.addEventListener('mousemove', function(e){
            if(!dragging) return;
            var sgn = CONFIG.dragInvert ? -1 : 1;
            view.yaw = dragBaseYaw + (e.clientX - dragStartX) * CONFIG.dragSpeed * sgn;
            view.pitch = Math.max(CONFIG.pitchMin, Math.min(CONFIG.pitchMax,
                dragBasePitch + (e.clientY - dragStartY) * CONFIG.dragSpeed * sgn));
        });
        document.addEventListener('mouseup', function(){
            if(!dragging) return;
            dragging = false;
            box.classList.remove('sd-drag');
        });
        // 阻止画布内右键菜单
        canvas.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    }

    // ===== 构建面板 =====
    var autoBtn, dirBtn, hintEl;
    function syncAutoBtn(){
        if(!autoBtn) return;
        if(CONFIG.autoRotate){ autoBtn.textContent = '自动旋转：开'; autoBtn.classList.add('sd-on'); }
        else { autoBtn.textContent = '自动旋转：关'; autoBtn.classList.remove('sd-on'); }
    }
    function syncDirBtn(){
        if(!dirBtn) return;
        if(CONFIG.dragInvert){ dirBtn.textContent = '方向：环境'; dirBtn.classList.add('sd-on'); }
        else { dirBtn.textContent = '方向：自身'; dirBtn.classList.remove('sd-on'); }
    }
    function buildPanel(){
        root = document.getElementById('scene3dRoot');
        if(!root){
            root = document.createElement('div');
            root.id = 'scene3dRoot';
            root.className = 'sd-float';
            document.body.appendChild(root);
        }
        root.innerHTML = [
            '<div class="sd-head">',
                '<h3 class="sd-title">3D 场景</h3>',
                '<span class="sd-hint">右键拖拽旋转视野</span>',
                '<button class="sd-collapse" title="收起/展开">—</button>',
                '<button class="sd-close" title="关闭">×</button>',
            '</div>',
            '<div class="sd-body">',
                '<div class="sd-canvas-wrap"><canvas></canvas></div>',
                '<div class="sd-ctrl">',
                    '<button class="sd-btn sd-on" id="sdAutoBtn">自动旋转：开</button>',
                    '<button class="sd-btn" id="sdResetBtn">重置视角</button>',
                    '<button class="sd-btn" id="sdDirBtn" title="切换右键拖拽方向：相对于自身 / 相对于环境">方向：自身</button>',
                '</div>',
            '</div>',
            '<div class="sd-resize" title="拖动调整大小"></div>'
        ].join('');

        box = root.querySelector('.sd-canvas-wrap');
        canvas = root.querySelector('canvas');
        ctx = canvas.getContext('2d');
        autoBtn = root.querySelector('#sdAutoBtn');
        var resetBtn = root.querySelector('#sdResetBtn');
        dirBtn = root.querySelector('#sdDirBtn');

        autoBtn.addEventListener('click', function(){
            CONFIG.autoRotate = !CONFIG.autoRotate;
            syncAutoBtn();
        });
        resetBtn.addEventListener('click', resetView);
        dirBtn.addEventListener('click', function(){
            CONFIG.dragInvert = !CONFIG.dragInvert;
            try{ localStorage.setItem('sdDragInvert', CONFIG.dragInvert ? '1' : '0'); }catch(e){}
            syncDirBtn();
        });
    }

    // ===== 浮动面板：拖动 / 收起 / 拉伸 =====
    function initFloatPanel(){
        if(!root.classList.contains('sd-float')) return;
        var head = root.querySelector('.sd-head');
        var resizeHandle = root.querySelector('.sd-resize');
        var collapseBtn = root.querySelector('.sd-collapse');
        var closeBtn = root.querySelector('.sd-close');
        var canvasWrap = root.querySelector('.sd-canvas-wrap');

        try{
            var pos = JSON.parse(localStorage.getItem('sdFloatPos') || 'null');
            var sz = JSON.parse(localStorage.getItem('sdFloatSize') || 'null');
            if(pos && pos.left){ root.style.left = pos.left; root.style.right = 'auto'; }
            if(pos && pos.top) root.style.top = pos.top;
            if(sz && sz.width) root.style.width = sz.width;
            if(sz && sz.canvasHeight) canvasWrap.style.height = sz.canvasHeight;
        }catch(e){}

        head.addEventListener('mousedown', function(e){
            if(e.target.closest('.sd-collapse')) return;
            if(e.target.closest('.sd-close')) return;
            e.preventDefault();
            var startX = e.clientX, startY = e.clientY;
            var origLeft = root.offsetLeft, origTop = root.offsetTop;
            root.style.right = 'auto';
            function onMove(ev){
                root.style.left = (origLeft + ev.clientX - startX) + 'px';
                root.style.top = (origTop + ev.clientY - startY) + 'px';
            }
            function onUp(){
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                try{ localStorage.setItem('sdFloatPos', JSON.stringify({ left: root.style.left, top: root.style.top })); }catch(e){}
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        resizeHandle.addEventListener('mousedown', function(e){
            e.preventDefault();
            e.stopPropagation();
            var startX = e.clientX;
            var ow = root.offsetWidth;
            var ohCanvas = canvasWrap.offsetHeight;
            function onMove(ev){
                root.style.width = Math.max(260, ow + (ev.clientX - (root.getBoundingClientRect().left + ow))) + 'px';
                canvasWrap.style.height = Math.max(120, ohCanvas + ev.clientY - startX) + 'px';
                resize();
            }
            function onUp(){
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                try{ localStorage.setItem('sdFloatSize', JSON.stringify({ width: root.style.width, canvasHeight: canvasWrap.style.height })); }catch(e){}
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        collapseBtn.addEventListener('click', function(e){
            e.stopPropagation();
            var mini = root.classList.toggle('sd-mini');
            collapseBtn.textContent = mini ? '▢' : '—';
        });
        if(closeBtn){
            closeBtn.addEventListener('click', function(e){
                e.stopPropagation();
                stop();
                root.style.display = 'none';
            });
        }
    }

    // ===== 显示 / 隐藏 =====
    function show(){ if(root){ root.style.display = ''; if(!running) start(); } }
    function hide(){ if(root){ stop(); root.style.display = 'none'; } }

    // ===== 初始化 =====
    function init(){
        // 恢复右键拖拽方向偏好
        try{
            var dir = localStorage.getItem('sdDragInvert');
            if(dir !== null) CONFIG.dragInvert = (dir === '1');
        }catch(e){}
        buildPanel();
        buildScene();
        initFloatPanel();
        initDrag();
        resize();
        syncAutoBtn();
        syncDirBtn();
        start();

        if(window.ResizeObserver){
            new ResizeObserver(function(){ resize(); }).observe(box);
        }
        window.addEventListener('resize', resize);

        window.Scene3D = {
            show: show,
            hide: hide,
            start: start,
            stop: stop,
            setAutoRotate: function(on){ CONFIG.autoRotate = !!on; syncAutoBtn(); },
            getAutoRotate: function(){ return CONFIG.autoRotate; },
            setDragInvert: function(on){ CONFIG.dragInvert = !!on; try{ localStorage.setItem('sdDragInvert', CONFIG.dragInvert ? '1' : '0'); }catch(e){} syncDirBtn(); },
            getDragInvert: function(){ return CONFIG.dragInvert; },
            resetView: resetView,
            getYaw: function(){ return view.yaw; },
            setYaw: function(a){ view.yaw = +a || 0; },
            getPitch: function(){ return view.pitch; },
            setPitch: function(a){ view.pitch = Math.max(CONFIG.pitchMin, Math.min(CONFIG.pitchMax, +a || 0)); },
            getConfig: function(){ return CONFIG; },
            setConfig: function(patch){
                for(var k in patch){
                    if(Object.prototype.hasOwnProperty.call(patch, k)) CONFIG[k] = patch[k];
                }
            }
        };
    }

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', init);
    }else{
        init();
    }
})();
