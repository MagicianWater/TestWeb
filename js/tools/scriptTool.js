/*!
 * scriptTool.js —— 独立脚本录制 / 播放工具（可嵌入任意网页）
 * by 魔法白开水/豆包/GLM-5/DeepSeek
 *
 * @sideWidget 脚本工具 —— 可挂载于四边弹窗栏（上/下/左/右），未挂载时不产生悬浮窗
 *
 * 宿主可选钩子（不提供时回退到控制台）：
 *   window.consoleWebAddLog(text)           输出日志（如写入宿主终端）
 *   window.consoleWebHandleCommand(cmd)     执行命令（如宿主终端命令）
 * 宿主在用户提交命令时应通知：window.ScriptTool.recordCommand(cmd)
 *
 * 页面结构约定（均为可选）：
 *   #scriptToolRoot         工具面板挂载点；缺失时自动创建浮动面板
 *   [data-st-tab]           面板切换标签（带 data-st-side），点击会记录
 *   [data-st-ignore]        宿主忽略区域（如终端内部），点击不记录
 */
(function(){
    'use strict';

    // ===== 注入自包含样式（不依赖宿主CSS） =====
    (function injectStyle(){
        if(document.getElementById('st-style')) return;
        var st = document.createElement('style');
        st.id = 'st-style';
        st.textContent = [
            '#scriptToolRoot{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;font-size:13px;color:#e2e8f0;font-family:inherit;}',
            '#scriptToolRoot *{box-sizing:border-box;}',
            '#scriptToolRoot label,#scriptToolRoot button,#scriptToolRoot input,#scriptToolRoot select,#scriptToolRoot h3{margin:0;font:inherit;color:inherit;}',
            '#scriptToolRoot button{background:none;border:none;}',
            '#scriptToolRoot input[type="checkbox"]{padding:0;}',
            '#scriptToolRoot.st-float{position:fixed;top:12px;left:12px;width:280px;height:72vh;z-index:99999;background:#0f172a;border:1px solid #334155;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.4);}',
            '#scriptToolRoot .st-head{display:flex;align-items:center;gap:6px;margin-bottom:8px;user-select:none;flex:none;}',
            '#scriptToolRoot.st-float .st-head{cursor:move;}',
            '#scriptToolRoot .st-title{margin:0;flex:1;font-size:15px;color:#e2e8f0;font-weight:600;}',
            '#scriptToolRoot .st-runs{display:none;background:#1e293b;border:1px solid #10b981;color:#6ee7b7;font-size:11px;padding:1px 8px;border-radius:10px;white-space:nowrap;}',
            '#scriptToolRoot .st-paused{display:none;background:#1e293b;border:1px solid #f59e0b;color:#fcd34d;font-size:11px;padding:1px 8px;border-radius:10px;white-space:nowrap;}',
            '#scriptToolRoot .st-collapse{display:none;color:#94a3b8;cursor:pointer;font-size:13px;padding:0 6px;line-height:1;border-radius:3px;}',
            '#scriptToolRoot .st-collapse:hover{color:#e2e8f0;background:#1e293b;}',
            '#scriptToolRoot.st-float .st-collapse{display:inline-block;}',
            '#scriptToolRoot .st-close{display:none;color:#94a3b8;cursor:pointer;font-size:15px;padding:0 4px;line-height:1;border-radius:3px;}',
            '#scriptToolRoot .st-close:hover{color:#f87171;background:rgba(248,113,113,.15);}',
            '#scriptToolRoot.st-float .st-close{display:inline-block;}',
            '#scriptToolRoot.st-mini{height:auto !important;}',
            '#scriptToolRoot.st-mini .st-libview,#scriptToolRoot.st-mini #stEditView,#scriptToolRoot.st-mini .st-veil{display:none !important;}',
            '#scriptToolRoot .st-libview{display:flex;flex-direction:column;flex:1;min-height:0;}',
            '#scriptToolRoot .st-lib-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:4px;scrollbar-width:none;-ms-overflow-style:none;}',
            '#scriptToolRoot .st-lib-list::-webkit-scrollbar{width:0;height:0;display:none;}',
            '#scriptToolRoot .st-librow{display:flex;align-items:center;gap:8px;padding:7px 8px;background:#1e293b;border-radius:4px;font-size:12px;cursor:pointer;border-left:3px solid transparent;transition:background .15s;}',
            '#scriptToolRoot .st-librow:hover{background:#243244;}',
            '#scriptToolRoot .st-librow.st-running{border-left-color:#22d3ee;animation:stLibBreathe 1.1s ease-in-out infinite;}',
            '#scriptToolRoot .st-librow.st-paused{border-left-color:#f59e0b;background:rgba(245,158,11,.16);animation:stLibPaused 2.2s ease-in-out infinite;}',
            '#scriptToolRoot .st-librow.st-paused .st-librow-name{color:#fde68a;}',
            '#scriptToolRoot .st-librow.st-paused .st-librow-step{color:#fcd34d;}',
            '#scriptToolRoot .st-librow-name{flex:1;min-width:0;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '#scriptToolRoot .st-librow-step{display:none;color:#22d3ee;font-size:11px;flex:none;font-variant-numeric:tabular-nums;}',
            '#scriptToolRoot .st-librow.st-running .st-librow-step{display:inline-block;}',
            '#scriptToolRoot .st-librow.st-paused .st-librow-step{display:inline-block;}',
            '#scriptToolRoot .st-librow-meta{color:#64748b;font-size:11px;flex:none;}',
            '#scriptToolRoot .st-lib-del{background:transparent;border:none;color:#64748b;cursor:pointer;font-size:11px;padding:0 2px;line-height:1;flex:none;}',
            '#scriptToolRoot .st-lib-del:hover{color:#f87171;}',
            '#scriptToolRoot .st-lib-new.st-btn{margin-top:8px;flex:none;align-self:flex-start;padding:4px 12px;font-size:12px;background:#2563eb;}',
            '@keyframes stLibBreathe{0%,100%{opacity:1;}50%{opacity:.6;background:rgba(34,211,238,.22);}}',
            '@keyframes stLibPaused{0%,100%{opacity:1;}50%{opacity:.6;background:rgba(245,158,11,.24);}}',
            '#scriptToolRoot #stEditView{display:none;flex-direction:column;flex:1;min-height:0;}',
            '#scriptToolRoot .st-editbar{display:flex;gap:6px;margin-bottom:8px;flex:none;}',
            '#scriptToolRoot .st-tabs{display:flex;gap:4px;flex:none;overflow-x:auto;overflow-y:hidden;padding:2px 1px 6px;scrollbar-width:none;-ms-overflow-style:none;max-width:100%;}',
            '#scriptToolRoot .st-tabs::-webkit-scrollbar{width:0;height:0;display:none;}',
            '#scriptToolRoot .st-tab{display:inline-flex;align-items:center;gap:4px;flex:none;padding:3px 8px;font-size:11px;color:#94a3b8;background:#1e293b;border:1px solid #334155;border-radius:4px;cursor:pointer;max-width:120px;white-space:nowrap;}',
            '#scriptToolRoot .st-tab:hover{color:#e2e8f0;border-color:#475569;}',
            '#scriptToolRoot .st-tab.active{color:#e2e8f0;background:#2563eb;border-color:#2563eb;}',
            '#scriptToolRoot .st-tab.is-rec{color:#fecaca;border-color:#dc2626;background:rgba(220,38,38,.14);}',
            '#scriptToolRoot .st-tab.is-rec .st-tab-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#f87171;flex:none;}',
            '#scriptToolRoot .st-tab-name{overflow:hidden;text-overflow:ellipsis;flex:none;max-width:80px;}',
            '#scriptToolRoot .st-tab-close{color:#64748b;font-size:11px;line-height:1;padding:1px;border-radius:3px;cursor:pointer;flex:none;}',
            '#scriptToolRoot .st-tab-close:hover{color:#f87171;background:rgba(248,113,113,.15);}',
            '#scriptToolRoot .st-tab.active .st-tab-close{color:#bfdbfe;}',
            '#scriptToolRoot .st-rec-banner{display:flex;align-items:center;gap:6px;padding:7px 8px;font-size:12px;color:#fecaca;background:rgba(220,38,38,.16);border:1px dashed #dc2626;border-radius:4px;cursor:pointer;flex:none;}',
            '#scriptToolRoot .st-rec-banner:hover{background:rgba(220,38,38,.28);}',
            '#scriptToolRoot .st-rec-banner .st-tab-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#f87171;animation:stRecBlink 1s ease-in-out infinite;flex:none;}',
            '@keyframes stRecBlink{0%,100%{opacity:1;}50%{opacity:.35;}}',
            '#scriptToolRoot .st-rec-chip{display:none;align-items:center;gap:4px;background:rgba(220,38,38,.18);border:1px solid #dc2626;color:#fecaca;font-size:11px;padding:1px 8px;border-radius:10px;white-space:nowrap;cursor:pointer;}',
            '#scriptToolRoot .st-rec-chip.show{display:inline-flex;}',
            '#scriptToolRoot .st-rec-chip .st-tab-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#f87171;animation:stRecBlink 1s ease-in-out infinite;flex:none;}',
            '#scriptToolRoot .st-editbar .st-btn{flex:none;padding:4px 8px;font-size:12px;}',
            '#scriptToolRoot .st-name-input{flex:1;min-width:0;padding:4px 6px;font-size:12px;color:#e2e8f0;background:#0f172a;border:1px solid #475569;border-radius:4px;outline:none;}',
            '#scriptToolRoot .st-name-input:focus{border-color:#2563eb;}',
            '#scriptToolRoot .st-name-input::placeholder{color:#64748b;}',
            '#scriptToolRoot .st-resize{position:absolute;right:0;bottom:0;width:14px;height:14px;display:none;z-index:10;}',
            '#scriptToolRoot.st-float .st-resize{display:block;cursor:nwse-resize;}',
            '#scriptToolRoot .st-resize::after{content:"";position:absolute;right:3px;bottom:3px;width:8px;height:8px;border-right:2px solid #475569;border-bottom:2px solid #475569;border-radius:0 0 3px 0;}',
            '#scriptToolRoot .st-controls{display:flex;gap:6px;margin-bottom:8px;flex:none;}',
            '#scriptToolRoot .st-btn{flex:1;padding:6px 8px;font-size:13px;line-height:1.4;border:none;border-radius:4px;cursor:pointer;color:#fff;background:#334155;transition:opacity .15s;font-family:inherit;overflow:hidden;white-space:nowrap;}',
            '#scriptToolRoot .st-btn.st-rec{background:#2563eb;}',
            '#scriptToolRoot .st-btn.st-rec.active{background:#dc2626;}',
            '#scriptToolRoot .st-btn.st-stop{background:#dc2626;}',
            '#scriptToolRoot .st-btn.st-playb{background:#10b981;}',
            '#scriptToolRoot .st-btn.st-ghost{background:transparent;border:1px solid #475569;color:#94a3b8;}',
            '#scriptToolRoot .st-btn:disabled{opacity:.4;cursor:not-allowed;}',
            '#scriptToolRoot .st-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:4px;scrollbar-width:none;-ms-overflow-style:none;}',
            '#scriptToolRoot .st-list::-webkit-scrollbar{width:0;height:0;display:none;}',
            '#scriptToolRoot .st-scrollbar{position:absolute;right:2px;top:0;width:3px;border-radius:3px;background:rgba(148,163,184,.55);opacity:0;transition:opacity .45s ease;z-index:8;pointer-events:none;}',
            '#scriptToolRoot .st-scrollbar.show{opacity:1;}',
            '#scriptToolRoot .st-empty{color:#475569;font-size:12px;text-align:center;padding:24px 0;}',
            '#scriptToolRoot .st-row{display:flex;align-items:center;gap:6px;padding:4px 6px;background:#1e293b;border-radius:4px;font-size:12px;}',
            '#scriptToolRoot .st-row.st-marker{background:rgba(245,158,11,.16);border-left:3px solid #f59e0b;}',
            '#scriptToolRoot .st-row.st-rec{background:rgba(220,38,38,.18);border-left:3px solid #dc2626;}',
            '#scriptToolRoot .st-row.st-rec .st-text{color:#fecaca;}',
            '#scriptToolRoot .st-row.st-click{background:rgba(59,130,246,.14);border-left:3px solid #3b82f6;}',
            '#scriptToolRoot .st-row.st-click .st-text{color:#93c5fd;}',
            '#scriptToolRoot .st-row.st-cur{animation:stBreathe 1.1s ease-in-out infinite;}',
            '#scriptToolRoot .st-row.st-next{animation:stBreatheSlow 2.4s ease-in-out infinite;}',
            '@keyframes stBreathe{0%,100%{opacity:1;}50%{opacity:.55;background:rgba(34,211,238,.28);}}',
            '@keyframes stBreatheSlow{0%,100%{opacity:1;}50%{opacity:.72;}}',
            '#scriptToolRoot .st-row.st-skipped{opacity:.5;background:#141d2b;border-left:3px solid #475569;filter:grayscale(1);}',
            '#scriptToolRoot .st-row.st-skipped .st-text{color:#94a3b8;text-decoration:line-through;}',
            '#scriptToolRoot .st-idx{color:#64748b;flex:none;font-size:11px;}',
            '#scriptToolRoot .st-wait{color:#22d3ee;flex:none;font-size:11px;cursor:pointer;border-radius:3px;padding:0 2px;}',
            '#scriptToolRoot .st-wait:hover{background:rgba(34,211,238,.14);}',
            '#scriptToolRoot .st-wait[contenteditable="true"]{background:#0f172a;outline:1px solid #2563eb;cursor:text;white-space:nowrap;}',
            '#scriptToolRoot .st-text{flex:1;min-width:0;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}',
            '#scriptToolRoot .st-text.st-locked{cursor:default;}',
            '#scriptToolRoot .st-text[contenteditable="true"]{background:#0f172a;outline:1px solid #2563eb;white-space:pre-wrap;word-break:break-all;}',
            '',
            '#scriptToolRoot .st-ops{display:flex;gap:2px;flex:none;}',
            '#scriptToolRoot .sop{background:transparent;border:none;color:#64748b;cursor:pointer;font-size:11px;padding:0 2px;line-height:1;}',
            '#scriptToolRoot .sop:hover{color:#e2e8f0;}',
            '#scriptToolRoot .st-play{margin-top:8px;display:flex;align-items:center;gap:8px;font-size:12px;color:#94a3b8;flex-wrap:wrap;flex:none;}',
            '#scriptToolRoot .st-play-title{color:#64748b;}',
            '#scriptToolRoot .st-play label{display:flex;align-items:center;gap:3px;cursor:pointer;}',
            '#scriptToolRoot .st-play input[type="radio"]{accent-color:#2563eb;margin:0;width:auto;height:auto;}',
            '#scriptToolRoot .st-times{width:46px;padding:2px 4px;font-size:12px;color:#e2e8f0;background:#0f172a;border:1px solid #475569;border-radius:3px;}',
            '#scriptToolRoot .st-play-btns{display:flex;gap:6px;margin-top:6px;flex:none;}',
            '#scriptToolRoot .st-foot{margin-top:8px;display:flex;gap:6px;flex:none;}',
            '#scriptToolRoot .st-add-type{flex:1;min-width:0;padding:4px 6px;font-size:12px;color:#e2e8f0;background:#0f172a;border:1px solid #475569;border-radius:4px;outline:none;cursor:pointer;}',
            '#scriptToolRoot .st-foot .st-btn{flex:none;}',
            '#scriptToolRoot .st-switch{position:relative;display:inline-block;width:26px;height:14px;flex:none;cursor:pointer;gap:0;}',
            '#scriptToolRoot .st-switch-ph{width:26px;height:14px;flex:none;display:inline-block;gap:0;}',
            '#scriptToolRoot .st-switch input{opacity:0;width:0;height:0;}',
            '#scriptToolRoot .st-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#475569;border-radius:14px;transition:background .2s;}',
            '#scriptToolRoot .st-slider::before{content:"";position:absolute;width:10px;height:10px;left:2px;top:2px;background:#e2e8f0;border-radius:50%;transition:transform .2s;}',
            '#scriptToolRoot .st-switch input:checked + .st-slider{background:#10b981;}',
            '#scriptToolRoot .st-switch input:checked + .st-slider::before{transform:translateX(12px);}',
            '#scriptToolRoot .st-list-wrap{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;}',
            '#scriptToolRoot .st-veil{position:absolute;inset:0;background:rgba(15,23,42,.42);border:1px dashed rgba(34,211,238,.5);color:#a5f3fc;font-size:13px;letter-spacing:3px;display:none;align-items:center;justify-content:center;pointer-events:none;z-index:9;border-radius:4px;text-align:center;}',
            '#scriptToolRoot.st-paused .st-veil{border-color:rgba(245,158,11,.6);color:#fcd34d;}',
            '#scriptToolRoot .st-toast{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);background:#0f172a;border:1px solid #10b981;color:#a7f3d0;font-size:12px;padding:6px 12px;border-radius:6px;opacity:0;transition:opacity .25s;z-index:20;pointer-events:none;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.4);}',
            '#scriptToolRoot .st-toast.show{opacity:1;}',
            '#scriptToolRoot.st-float.st-playing{border-color:#22d3ee;box-shadow:0 0 0 1px rgba(34,211,238,.35),0 10px 30px rgba(0,0,0,.4);}',
            '#scriptToolRoot.st-float.st-paused{border-color:#f59e0b;box-shadow:0 0 0 1px rgba(245,158,11,.35),0 10px 30px rgba(0,0,0,.4);}',
            ''
        ].join('\n');
        (document.head || document.documentElement).appendChild(st);
    })();
    // ===== 状态 =====
    var scriptRecording = false;
    var scriptSteps = [];
    var scriptStartTime = 0;
    var playMode = 'loop';
    var playTimes = 1;
    var runSeq = 0;          // 运行实例序号
    var runs = [];           // 所有进行中的运行（每份独立上下文）
    var editorRun = null;    // 主面板（编辑器）的运行实例
    // ===== 宿主钩子（懒读取，随时可用） =====
    function log(text){
        if(window.consoleWebAddLog){ window.consoleWebAddLog(text); }
        else if(window.console && window.console.log){ window.console.log('[脚本工具] ' + text); }
    }
    function runCommand(cmd){
        if(window.consoleWebHandleCommand){ window.consoleWebHandleCommand(cmd); }
        else if(window.console && window.console.log){ window.console.log('[脚本工具] 执行命令: ' + cmd); }
    }
    // ===== DOM引用 =====
    var root, recBtn, stopBtn, clearBtn, list, playBtn, playStopBtn, timesInput, addBtn, addType, veil;
    var runsBadge, pausedBadge, nameInput, saveBtn, backBtn, newBtn, libList, libView, editView, toast;
    var currentLibId = null;      // 当前编辑器正在编辑的库脚本 id（null = 新建/未保存）
    var tabs = [];                // 打开的编辑页签：{key, name, steps, libId, isRec}
    var activeTab = null;         // 当前激活页签
    var recTab = null;            // 录制页签（录制中非空）
    var tabSeq = 0;               // 页签自增序号
    var tabsEl = null;
    var recChip = null;
    function updateRecChip(){
        if(!recChip) return;
        recChip.classList.toggle('show', !!scriptRecording);
    }
    // 录制按钮文案：录制中 / 已有脚本页→重新录制 / 其他→开始录制
    function updateRecBtn(){
        if(!recBtn) return;
        if(scriptRecording){ recBtn.textContent = '● 录制中'; return; }
        recBtn.textContent = (activeTab && activeTab.libId) ? '● 重新录制' : '● 开始录制';
    }
    var scrollbarEl, scrollbarTimer = null, toastTimer = null;
    function $(id){ return document.getElementById(id); }
    function escapeHtml(s){
        return String(s).replace(/[&<>"']/g, function(c){
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        });
    }
    // ===== 录制 =====
    function addScriptStep(type, text, sel){
        // 录制中 → 追加到录制页签（切换视图不中断）；否则追加到当前编辑页签
        var steps = (scriptRecording && recTab) ? recTab.steps : scriptSteps;
        var t = performance.now() - scriptStartTime;
        var delta = steps.length ? (t - steps[steps.length - 1].t) : 0;
        steps.push({t:t, delta:delta, type:type, text:text, sel:sel || '', skip:false});
        if(steps === scriptSteps) renderScriptList();
        if(scriptRecording && recTab){
            // 后台录制：实时刷新列表视图顶部录制横幅的步数
            var banner = libList ? libList.querySelector('.st-rec-banner') : null;
            if(banner && banner.dataset.rec){
                banner.innerHTML = '<span class="st-tab-dot"></span> 正在录制「' + escapeHtml(recTab.name) + '」（' + recTab.steps.length + ' 步）— 点击进入';
            }
        }
    }
    function startScriptRecording(){
        if(scriptRecording) return;
        typeTarget = null;                 // 清除上一会话残留的输入录制状态
        clearTimeout(typeTimer);
        // 当前为已有脚本页签 → 重新录制：清空该脚本步骤，录制目标=当前页签（保存即覆盖原脚本）
        var reRecord = !!(activeTab && activeTab.libId);
        if(reRecord){
            recTab = activeTab;
            recTab.steps.splice(0, recTab.steps.length);
            recTab.isRec = true;
            renderTabs();
        }else{
            // 新建录制页签：独立于当前视图，切换/返回不中断录制
            recTab = createTab('录制 ' + new Date().toLocaleTimeString(), [], null, true);
            switchTab(recTab.key);
        }
        scriptRecording = true;
        addScriptStep('marker', '【开始执行】');
        addScriptStep('rec', '点击 开始录制');
        recBtn.disabled = true;
        recBtn.classList.add('active');
        updateRecBtn();
        stopBtn.disabled = false;
        updateRecChip();
        log(reRecord ? ('重新录制开始（将覆盖「' + (activeTab ? activeTab.name : '') + '」）') : '脚本录制开始（后台录制中，可自由切换视图）');
    }
    function stopScriptRecording(){
        if(!scriptRecording) return;
        flushTypeRecord();                 // 停止前落盘最后一段输入
        addScriptStep('rec', '点击 结束录制');
        addScriptStep('marker', '【结束执行】');
        if(recTab){
            recTab.isRec = false;
            recTab = null;
            renderTabs();
        }
        scriptRecording = false;
        recBtn.disabled = false;
        recBtn.classList.remove('active');
        updateRecBtn();
        stopBtn.disabled = true;
        updateRecChip();
        log('脚本录制结束');
    }
    function forceStopRecording(){
        if(!scriptRecording) return;
        typeTarget = null;
        clearTimeout(typeTimer);
        if(recTab){
            recTab.isRec = false;
            recTab = null;
            renderTabs();
        }
        scriptRecording = false;
        recBtn.disabled = false;
        recBtn.classList.remove('active');
        updateRecBtn();
        stopBtn.disabled = true;
        updateRecChip();
    }
    // ===== 列表渲染 =====
    function isBoundaryMarker(s){
        return s.type === 'marker' && (s.text === '【开始执行】' || s.text === '【结束执行】');
    }
    function renderScriptList(){
        if(!list) return;
        if(!scriptSteps.length){
            list.innerHTML = '<div class="st-empty">暂无脚本，点击“开始录制”</div>';
            saveScript();
            return;
        }
        list.innerHTML = '';
        scriptSteps.forEach(function(s, i){
            var row = document.createElement('div');
            var cls = 'st-row';
            if(s.type === 'marker') cls += ' st-marker';
            else if(s.type === 'rec') cls += ' st-rec';
            else cls += ' st-click';   // 点击 / 终端命令：淡蓝色
            if(s.skip) cls += ' st-skipped';
            row.className = cls;
            row.dataset.i = i;
            var wait = (s.delta / 1000).toFixed(2) + 's';
            // 执行区间标签 / 录制按钮：系统步骤，文本不可修改（保持原本功能），但可移动；预留开关位置保持行对齐
            var isB = isBoundaryMarker(s);
            var textLocked = (s.type === 'rec' || isB);
            var switchHtml = isB ? '<span class="st-switch-ph"></span>' :
                '<label class="st-switch" title="启用/跳过"><input type="checkbox" class="st-skip"' + (s.skip ? '' : ' checked') + '><span class="st-slider"></span></label>';
            var delHtml = isB ? '' : '<button class="sop del" title="删除">✕</button>';
            var waitHtml = isB ? '<span class="st-wait">+0.00s</span>' :
                '<span class="st-wait" data-sec="' + (s.delta / 1000) + '" title="点击修改等待时间">+' + wait + '</span>';
            row.innerHTML =
                '<span class="st-idx">' + (i + 1).toString().padStart(2, '0') + '</span>' +
                switchHtml +
                waitHtml +
                '<span class="st-text' + (textLocked ? ' st-locked' : '') + '" title="' + (textLocked ? '系统步骤，不可修改' : '点击修改，Enter 保存') + '">' + escapeHtml(s.text) + '</span>' +
                '<span class="st-ops">' +
                    '<button class="sop up" title="上移">↑</button>' +
                    '<button class="sop down" title="下移">↓</button>' +
                    delHtml +
                '</span>';
            list.appendChild(row);
        });
        list.scrollTop = list.scrollHeight;
        saveScript();
        updatePlayHighlight();   // 重渲染后保持当前/下一个高亮
        updateScrollbar();
    }
    // ===== 迷你滑动指示条：隐藏原生滚动条，滑动时出现，空闲淡化隐藏 =====
    function updateScrollbar(){
        if(!list || !scrollbarEl) return;
        var sh = list.scrollHeight, ch = list.clientHeight;
        if(sh <= ch + 1){
            scrollbarEl.style.display = 'none';
            return;
        }
        scrollbarEl.style.display = 'block';
        var ratio = ch / sh;
        var h = Math.max(20, Math.round(ratio * ch));
        var maxTop = ch - h;
        var top = maxTop > 0 ? (list.scrollTop / (sh - ch)) * maxTop : 0;
        scrollbarEl.style.height = h + 'px';
        scrollbarEl.style.top = top + 'px';
        scrollbarEl.classList.add('show');
        clearTimeout(scrollbarTimer);
        scrollbarTimer = setTimeout(function(){
            scrollbarEl.classList.remove('show');
        }, 800);
    }
    function rebaseTimes(){
        var acc = 0;
        scriptSteps.forEach(function(s){ acc += Math.max(0, s.delta); s.t = acc; });
        renderScriptList();
    }
    // ===== 持久化 =====
    var SAVE_KEY = 'scriptToolSavedScript';
    var OLD_KEY = 'consoleWebSavedScript';
    function saveScript(){
        try{ localStorage.setItem(SAVE_KEY, JSON.stringify(scriptSteps)); }catch(e){}
        if(window.GameSave) GameSave._flushToStorage();
    }
    function loadScript(){
        try{
            var raw = localStorage.getItem(SAVE_KEY);
            if(raw === null) raw = localStorage.getItem(OLD_KEY);   // 旧键一次性迁移
            if(raw){
                var arr = JSON.parse(raw);
                if(Array.isArray(arr)){
                    scriptSteps = arr;
                    // 若来自旧键：复制到新键并删除旧键，避免“清空”后被旧键回填
                    if(localStorage.getItem(SAVE_KEY) === null && localStorage.getItem(OLD_KEY) !== null){
                        localStorage.setItem(SAVE_KEY, JSON.stringify(arr));
                        localStorage.removeItem(OLD_KEY);
                    }
                    renderScriptList();
                }
            }
        }catch(e){}
    }
    // ===== 列表事件（编辑提交：Enter / 点击其他区域 / blur 均可触发，不依赖 blur 事件） =====
    var editingEl = null;
    function saveEdit(el){   // 仅保存数据，不重渲染（用于切换编辑目标等场景）
        if(!el) return;
        var row = el.closest('.st-row');
        if(!row) return;
        var i = Number(row.dataset.i);
        if(i < 0 || i >= scriptSteps.length) return;
        if(el.classList.contains('st-text')){
            scriptSteps[i].text = el.innerText.trim() || scriptSteps[i].text;
        }else if(el.classList.contains('st-wait')){
            var val = parseFloat(el.innerText);
            if(isNaN(val) || val < 0) val = (scriptSteps[i].delta || 0) / 1000;   // 非法输入回退
            scriptSteps[i].delta = Math.round(val * 1000);
        }
    }
    function commitEdit(){   // 保存并重渲染（最终提交）
        if(!editingEl) return;
        saveEdit(editingEl);
        editingEl = null;
        rebaseTimes();
    }
    function startEdit(el, isWait){
        if(isWait){
            el.contentEditable = 'true';
            el.dataset.editing = '1';
            el.innerText = String(Number(el.dataset.sec) || 0);   // 编辑时显示纯秒数（无 +/s）
        }else{
            el.contentEditable = 'true';
        }
        el.focus();
        editingEl = el;
        var range = document.createRange();
        range.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
    function onListClick(e){
        var wait = e.target.closest('.st-wait');
        var txt = e.target.closest('.st-text');
        if(wait || txt){
            var t0 = wait || txt;
            var row0 = t0.closest('.st-row');
            if(!row0) return;
            var i0 = Number(row0.dataset.i);
            var st0 = scriptSteps[i0];
            if(wait && isBoundaryMarker(st0)) return;   // 边界标签时间不可改
            if(txt && (st0.type === 'rec' || isBoundaryMarker(st0))) return;   // 录制/执行系统步骤文本不可改
            if(editingEl && editingEl !== t0) saveEdit(editingEl);  // 切换目标：先保存上一个（不重渲染）
            editingEl = null;
            startEdit(t0, !!wait);
            return;
        }
        var row = e.target.closest('.st-row');
        if(!row) return;
        var i = Number(row.dataset.i);
        var btn = e.target.closest('.sop');
        if(!btn) return;
        if(editingEl) saveEdit(editingEl);   // 排序/删除前保存未提交编辑（随后随步骤一起移动/删除）
        editingEl = null;
        if(btn.classList.contains('up') && i > 0){
            var tmp = scriptSteps[i];
            scriptSteps[i] = scriptSteps[i - 1];
            scriptSteps[i - 1] = tmp;
            rebaseTimes();
        }else if(btn.classList.contains('down') && i < scriptSteps.length - 1){
            var t2 = scriptSteps[i];
            scriptSteps[i] = scriptSteps[i + 1];
            scriptSteps[i + 1] = t2;
            rebaseTimes();
        }else if(btn.classList.contains('del')){
            scriptSteps.splice(i, 1);
            rebaseTimes();
        }
    }
    function onListChange(e){
        var t = e.target;
        if(t.classList.contains('st-skip')){
            if(editingEl) saveEdit(editingEl);   // 切换开关前保存未提交编辑
            editingEl = null;
            var row = t.closest('.st-row');
            if(!row) return;
            var i = Number(row.dataset.i);
            scriptSteps[i].skip = !t.checked;
            renderScriptList();
        }
    }
    function onListKeydown(e){
        if(e.key === 'Enter' && editingEl){
            e.preventDefault();
            commitEdit();
        }
    }
    function onListBlur(e){
        if(e.target === editingEl) commitEdit();
    }
    // ===== 手动添加步骤 =====
    function addManualStep(){
        var type = addType.value;
        var text = '终端命令: ';
        if(type === 'click') text = '点击 「」';
        else if(type === 'hold') text = '长按 「」';
        else if(type === 'type') text = '输入 「」';
        else if(type === 'marker') text = '【标记】';
        var last = scriptSteps[scriptSteps.length - 1];
        var delta = last ? 500 : 0;
        var t = last ? (last.t + delta) : 0;
        scriptSteps.push({t:t, delta:delta, type:type, text:text, sel:'', skip:false});
        renderScriptList();
        var rows = list.querySelectorAll('.st-row');
        var lastRow = rows[rows.length - 1];
        if(lastRow){
            var txt = lastRow.querySelector('.st-text');
            txt.contentEditable = 'true';
            txt.focus();
            var range = document.createRange();
            range.selectNodeContents(txt);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
    function clearScript(){
        if(editorRun && editorRun.running) stopRun(editorRun);
        scriptSteps.splice(0, scriptSteps.length);   // 原地清空（保持指向当前页签的 steps）
        renderScriptList();
        try{ localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_KEY); }catch(e){}
        if(window.GameSave) GameSave._flushToStorage();
    }
    // ===== 点击目标描述与选择器 =====
    function describeTarget(el){
        var textEl = el.closest('button,a,input,select,textarea,label,[data-color],[onclick],[role="button"]') || el;
        var txt = (textEl.innerText || textEl.value || '').trim();
        if(txt && txt.length <= 24) return '「' + txt + '」';
        if(textEl.id) return '#' + textEl.id;
        var tag = (el.tagName || '').toLowerCase();
        if(el.classList && el.classList.length) return '<' + tag + '.' + el.classList[0] + '>';
        return '<' + tag + '>';
    }
    function getCssSelector(el){
        if(el.id) return '#' + CSS.escape(el.id);
        var sel = (el.tagName || 'div').toLowerCase();
        if(el.classList && el.classList.length){
            sel += '.' + Array.prototype.slice.call(el.classList, 0, 2).map(function(c){ return CSS.escape(c); }).join('.');
        }
        return sel;
    }
    // ===== 全局点击录制（capture阶段） =====
    // 只记页面内有效操作；不记鼠标轨迹；浏览器外操作天然收不到事件
    var suppressClickUntil = 0;   // 长按松开会触发 click，短时间抑制避免重复记录
    document.addEventListener('click', function(e){
        if(!scriptRecording) return;
        if(performance.now() < suppressClickUntil) return;
        var t = e.target;
        if(!t || t === document || t === document.body) return;
        // 面板切换标签（宿主标记 data-st-tab）→ 记录为面板切换
        var tabEl = t.closest('[data-st-tab]');
        if(tabEl){
            var side = tabEl.getAttribute('data-st-side') || '';
            var sideName = {left:'左', right:'右', top:'上', bottom:'下'}[side] || side;
            addScriptStep('click', '点击 ☰（' + sideName + '侧栏）', '[data-st-tab][data-st-side="' + side + '"]');
            return;
        }
        // 宿主忽略区域 / 工具自身面板
        if(t.closest('[data-st-ignore]')) return;
        if(t.closest('.st-root')) return;
        // 交互元素
        var interactive = t.closest('button,a,input,select,textarea,label,[onclick],[data-color],[role="button"],[tabindex]');
        if(!interactive){
            if(!t.classList || !t.classList.length) return;
            var cs = null;
            try{ cs = getComputedStyle(t); }catch(err){ return; }
            if(!cs || cs.cursor !== 'pointer') return;
        }
        addScriptStep('click', '点击 ' + describeTarget(t), getCssSelector(t));
    }, true);
    // ===== 长按录制（按下→按住→松开，capture阶段） =====
    // 按住超过阈值视为长按：记录 hold 步骤（含按住时长 dur），并抑制随之触发的 click
    var HOLD_THRESHOLD = 400;   // 毫秒：超过即算长按
    var pressTarget = null;
    var pressStart = 0;
    document.addEventListener('mousedown', function(e){
        if(!scriptRecording || e.button !== 0) return;
        var t = e.target;
        if(!t || t.nodeType !== 1) return;
        if(t.closest('.st-root')) return;
        if(t.closest('[data-st-ignore]')) return;
        if(t.closest('[data-st-tab]')) return;   // 面板切换标签由 click 记录
        pressTarget = t;
        pressStart = performance.now();
    }, true);
    document.addEventListener('mouseup', function(e){
        if(!scriptRecording || e.button !== 0) return;
        if(!pressTarget || !pressStart) return;
        var dur = performance.now() - pressStart;
        var t = pressTarget;
        pressTarget = null;
        pressStart = 0;
        if(dur < HOLD_THRESHOLD) return;                       // 普通点击，交给 click 记录
        if(!document.contains(t)) return;                      // 按住期间目标已脱离文档
        var desc = describeTarget(t);
        addScriptStep('hold', '长按 ' + desc, getCssSelector(t));
        scriptSteps[scriptSteps.length - 1].dur = Math.round(dur);
        suppressClickUntil = performance.now() + 300;          // 抑制长按松开触发的 click
    }, true);
    // ===== 命令记录（宿主在用户提交命令时调用） =====
    function recordCommand(cmd){
        if(scriptRecording) addScriptStep('cmd', '终端命令: ' + cmd);
    }
    // ===== 输入框打字录制（防抖：停止输入约0.5s或失焦后记录一次） =====
    var typeTimer = null;
    var typeTarget = null;
    function describeInput(el){
        if(el.id) return '#' + el.id;
        var ph = el.getAttribute && el.getAttribute('placeholder');
        if(ph && String(ph).trim()) return '「' + String(ph).trim() + '」';
        if(el.name) return '@' + el.name;
        return '<' + ((el.tagName || 'div')).toLowerCase() + '>';
    }
    function recordTypeInput(el){
        var val = '';
        try{
            if(el.isContentEditable) val = el.innerText || '';
            else val = el.value || '';
        }catch(err){ return; }
        var shown = val.length > 40 ? val.slice(0, 40) + '…' : val;
        var text = '输入「' + shown + '」 到 ' + describeInput(el);
        addScriptStep('type', text, getCssSelector(el));
        scriptSteps[scriptSteps.length - 1].val = val;
    }
    function flushTypeRecord(){
        if(typeTarget){
            clearTimeout(typeTimer);
            if(scriptRecording) recordTypeInput(typeTarget);
            typeTarget = null;
        }
    }
    document.addEventListener('input', function(e){
        if(!scriptRecording) return;
        var t = e.target;
        if(!t || t.nodeType !== 1) return;
        if(t.closest('.st-root')) return;          // 工具自身面板不录
        if(t.closest('[data-st-ignore]')) return;  // 宿主忽略区域（终端等）不录
        var tag = (t.tagName || '').toLowerCase();
        var isEditable = tag === 'input' || tag === 'textarea' || t.isContentEditable;
        if(!isEditable) return;
        var type = (t.type || '').toLowerCase();
        if(type === 'radio' || type === 'checkbox' || type === 'button' || type === 'submit' || type === 'reset' || type === 'range') return;
        typeTarget = t;
        clearTimeout(typeTimer);
        typeTimer = setTimeout(function(){
            if(scriptRecording && typeTarget) recordTypeInput(typeTarget);
            typeTarget = null;
        }, 500);
    }, true);
    document.addEventListener('blur', function(e){
        if(!scriptRecording) return;
        if(typeTarget && e.target === typeTarget) flushTypeRecord();
    }, true);
    // ===== 播放引擎（每份运行独立上下文，支持并发） =====
    function computePlayWindow(snap){
        var start = 0, end = snap.length;
        for(var i = 0; i < snap.length; i++){
            if(snap[i].type === 'marker' && snap[i].text === '【开始执行】'){ start = i + 1; break; }
        }
        for(var j = 0; j < snap.length; j++){
            if(snap[j].type === 'marker' && snap[j].text === '【结束执行】'){ end = j; break; }
        }
        if(start > end) start = end;
        return {start:start, end:end};
    }
    // 下一个非停用行索引
    function findNextIndex(ctx, from){
        var i = from;
        while(i < ctx.end && ctx.snap[i].skip) i++;
        return (i < ctx.end) ? i : -1;
    }
    // 该运行是否正被编辑器展示（进入运行中脚本的编辑器时，编辑器接管显示）
    function isActiveEditorRun(ctx){
        return !!ctx && ctx === editorRun;
    }
    // 按脚本名查找进行中的运行（编辑器与列表开关共享同一份运行）
    function findRunByLibName(name){
        for(var i = 0; i < runs.length; i++){
            if(runs[i].libName === name && runs[i].running) return runs[i];
        }
        return null;
    }
    // 创建一份运行实例（stepsArr 传入副本，互不影响）
    function createRun(stepsArr, opts){
        opts = opts || {};
        var snap = (Array.isArray(stepsArr) ? stepsArr : []).slice();
        if(!snap.length){ log('脚本为空，无法执行'); return null; }
        if(scriptRecording){ log('录制中，无法执行脚本'); return null; }
        var ctx = {
            id: ++runSeq,
            mytoken: 1,
            running: true,
            paused: false,
            snap: snap,
            mode: opts.mode || 'loop',
            times: opts.times || 1,
            count: 0,
            index: 0,
            start: 0, end: 0,
            curIdx: -1, nextIdx: -1,
            waitIdx: -1, waitFor: 0, waitStart: 0, elapsed: 0,
            timer: null,
            isEditor: !!opts.isEditor,
            logTag: opts.logTag || ('脚本#' + runSeq),
            libName: opts.libName || null
        };
        var win = computePlayWindow(snap);
        ctx.start = win.start;
        ctx.end = win.end;
        if(ctx.start >= ctx.end){
            log('[' + ctx.logTag + '] 执行区间为空（缺【开始执行】/【结束执行】标签），未执行');
            return null;
        }
        ctx.index = ctx.start;
        ctx.curIdx = -1;
        ctx.nextIdx = findNextIndex(ctx, ctx.start);
        runs.push(ctx);
        updateRunsBadge();
        return ctx;
    }
    function removeRun(ctx){
        var i = runs.indexOf(ctx);
        if(i >= 0) runs.splice(i, 1);
        updateRunsBadge();
    }
    // 停止所有进行中的运行（主面板 + 库脚本）
    function stopAllRuns(){
        var list2 = runs.slice();
        for(var i = 0; i < list2.length; i++){
            stopRun(list2[i]);
        }
        log('已停止全部运行（' + list2.length + ' 个）');
    }
    function updateRunsBadge(){
        var n = 0, p = 0;
        for(var k = 0; k < runs.length; k++){
            if(!runs[k].running) continue;
            if(runs[k].paused) p++; else n++;
        }
        if(runsBadge){
            runsBadge.style.display = n ? 'inline-block' : 'none';
            runsBadge.textContent = '运行中 ' + n;
        }
        if(pausedBadge){
            pausedBadge.style.display = p ? 'inline-block' : 'none';
            pausedBadge.textContent = '暂停中 ' + p;
        }
        // 同步脚本列表：运行中呼吸 / 暂停中黄色 / 开关状态与运行一致 + 当前步骤编号
        if(libList){
            var state = {};
            runs.forEach(function(ctx){ if(ctx.libName && ctx.running) state[ctx.libName] = ctx; });
            Array.prototype.forEach.call(libList.querySelectorAll('.st-librow'), function(row){
                var ctx = state[row.dataset.name] || null;
                var on = !!ctx;
                row.classList.toggle('st-running', on && !ctx.paused);
                row.classList.toggle('st-paused', on && ctx.paused);
                var chk = row.querySelector('.st-lib-run');
                if(chk && chk.checked !== on) chk.checked = on;
            });
        }
        updateLibProgress();
    }
    // 更新脚本列表行中的当前步骤编号（仅对运行中的库脚本）
    function updateLibProgress(){
        if(!libList) return;
        var byName = {};
        runs.forEach(function(ctx){
            if(ctx.libName && ctx.running){ byName[ctx.libName] = ctx; }
        });
        Array.prototype.forEach.call(libList.querySelectorAll('.st-librow'), function(row){
            var stepEl = row.querySelector('.st-librow-step');
            if(!stepEl) return;
            var ctx = byName[row.dataset.name];
            if(!ctx){ stepEl.textContent = ''; return; }
            var total = Math.max(1, ctx.end - ctx.start);
            var cur = ctx.curIdx >= 0 ? (ctx.curIdx - ctx.start + 1) : 0;
            if(cur < 1){ stepEl.textContent = '…'; return; }
            stepEl.textContent = '#' + Math.min(cur, total) + '/' + total;
        });
    }
    // 主面板执行当前脚本
    function startEditorPlayback(){
        if(scriptRecording){ log('录制中，无法执行脚本'); return; }
        if(!scriptSteps.length){ log('脚本为空，无法执行'); return; }
        if(editorRun && editorRun.running){
            if(editorRun.paused) resumeRun(editorRun);
            else pauseRun(editorRun);
            return;
        }
        if(playMode === 'times'){
            playTimes = Math.max(1, parseInt(timesInput.value, 10) || 1);
        }
        var ctx = createRun(scriptSteps, {mode:playMode, times:playTimes, isEditor:true, logTag:'主面板'});
        if(!ctx) return;
        editorRun = ctx;
        // 编辑已保存脚本时，运行关联到该脚本 → 外部脚本列表可见运行中
        if(currentLibId){
            var lib = loadLibrary();
            for(var i = 0; i < lib.length; i++){
                if(lib[i].id === currentLibId){ ctx.libName = lib[i].name; break; }
            }
        }
        updatePlayHighlight();
        log('主面板脚本开始执行（' + (playMode === 'loop' ? '循环播放' : '执行 ' + playTimes + ' 次') + '，区间 ' + (ctx.start + 1) + '~' + ctx.end + ' 步）');
        updatePlayUI();
        playStep(ctx);
    }
    // 播放主进度
    function playStep(ctx){
        if(!ctx.running || ctx.paused) return;
        if(!ctx.snap.length){ stopRun(ctx); return; }
        while(ctx.index < ctx.end && ctx.snap[ctx.index].skip) ctx.index++;
        if(ctx.index >= ctx.end){
            ctx.count++;
            if(ctx.mode === 'times' && ctx.count >= ctx.times){ finishRun(ctx); return; }
            ctx.index = ctx.start;
            while(ctx.index < ctx.end && ctx.snap[ctx.index].skip) ctx.index++;
            if(ctx.index >= ctx.end){ finishRun(ctx); return; }
        }
        var s = ctx.snap[ctx.index];
        var stepIdx = ctx.index;
        ctx.index++;
        ctx.waitIdx = stepIdx;
        ctx.nextIdx = stepIdx;      // 等待期：下一个 = 本次待执行（慢呼吸）
        if(isActiveEditorRun(ctx)) updatePlayHighlight();
        var delay = Math.max(0, s.delta || 0);
        ctx.waitFor = delay;
        ctx.waitStart = performance.now();
        ctx.timer = setTimeout(function(){
            ctx.timer = null;
            ctx.curIdx = stepIdx;   // 执行期：当前 = 本次（快呼吸），下一个 = 其后
            ctx.nextIdx = findNextIndex(ctx, ctx.index);
            if(isActiveEditorRun(ctx)) updatePlayHighlight();
            updateLibProgress();
            executeStep(s, ctx);
            playStep(ctx);
        }, delay);
    }
    function pauseRun(ctx){
        if(!ctx.running || ctx.paused) return;
        ctx.paused = true;
        if(ctx.timer){ clearTimeout(ctx.timer); ctx.timer = null; }
        ctx.elapsed = performance.now() - ctx.waitStart;
        ctx.nextIdx = -1;           // 暂停：保留“当前”，移除“下一个”
        if(isActiveEditorRun(ctx)) updatePlayHighlight();
        if(isActiveEditorRun(ctx)) updatePlayUI();
        updateRunsBadge();
        log('[' + ctx.logTag + '] 已暂停');
    }
    function resumeRun(ctx){
        if(!ctx.running || !ctx.paused) return;
        ctx.paused = false;
        updateRunsBadge();
        var remain = Math.max(0, ctx.waitFor - ctx.elapsed);
        var stepIdx = ctx.waitIdx;
        ctx.waitStart = performance.now();
        ctx.nextIdx = stepIdx;
        if(isActiveEditorRun(ctx)) updatePlayHighlight();
        if(isActiveEditorRun(ctx)) updatePlayUI();
        ctx.timer = setTimeout(function(){
            ctx.timer = null;
            ctx.curIdx = stepIdx;
            ctx.nextIdx = findNextIndex(ctx, ctx.waitIdx + 1);
            if(isActiveEditorRun(ctx)) updatePlayHighlight();
            updateLibProgress();
            executeStep(ctx.snap[stepIdx], ctx);
            playStep(ctx);
        }, remain);
        log('[' + ctx.logTag + '] 继续执行');
    }
    function finishRun(ctx){
        ctx.running = false;
        ctx.curIdx = -1;
        ctx.nextIdx = -1;
        if(isActiveEditorRun(ctx)){ updatePlayHighlight(); forceStopRecording(); }
        log('[' + ctx.logTag + '] 执行完成，共 ' + ctx.count + ' 轮');
        removeRun(ctx);
        if(isActiveEditorRun(ctx)){ editorRun = null; updatePlayUI(); }
        updateLibProgress();
    }
    function stopRun(ctx){
        if(!ctx.running) return;
        ctx.mytoken++;
        ctx.running = false;
        ctx.curIdx = -1;
        ctx.nextIdx = -1;
        if(ctx.timer){ clearTimeout(ctx.timer); ctx.timer = null; }
        if(isActiveEditorRun(ctx)){ updatePlayHighlight(); forceStopRecording(); }
        log('[' + ctx.logTag + '] 执行已停止');
        removeRun(ctx);
        if(isActiveEditorRun(ctx)){ editorRun = null; updatePlayUI(); }
        updateLibProgress();
    }
    function executeStep(s, ctx){
        if(!s) return;
        var tag = (ctx && ctx.logTag) ? ('[' + ctx.logTag + '] ') : '';
        if(s.type === 'marker') return;          // 执行区间标签为无操作提示
        if(s.type === 'rec'){
            var isStart = /开始录制/.test(s.text);
            var btn = isStart ? recBtn : stopBtn;
            if(btn){ btn.click(); log(tag + '脚本执行：' + s.text); }
            else{ log(tag + '脚本执行：未找到录制按钮，跳过 ' + s.text); }
            return;
        }
        if(s.type === 'cmd'){
            var cmd = String(s.text).replace(/^终端命令:\s*/, '');
            runCommand(cmd);
            return;
        }
        if(s.type === 'type'){
            var tel = null;
            if(s.sel){ try{ tel = document.querySelector(s.sel); }catch(err){} }
            if(!tel){
                // 手动添加的输入步骤无选择器：按描述中的「到 …」定位输入框
                var tm = /到\s*(#[^\s「」]+|「[^」]+」|<\w+(\.\w+)?>)/.exec(s.text);
                if(tm){
                    var ref = tm[1];
                    var cands2 = document.querySelectorAll('input,textarea,[contenteditable="true"]');
                    for(var j = 0; j < cands2.length; j++){
                        var lbl = '';
                        if(cands2[j].id && ('#' + cands2[j].id) === ref) lbl = '#' + cands2[j].id;
                        else if(('「' + (cands2[j].value || cands2[j].innerText || '') + '」') === ref) lbl = ref;
                        else if(cands2[j].tagName.toLowerCase() === ref.replace(/<|>/g, '').split('.')[0] && cands2[j].classList.contains((ref.match(/\.\w+/) || [''])[0].slice(1))) lbl = ref;
                        if(lbl){ tel = cands2[j]; break; }
                    }
                }
            }
            if(tel){
                var val = (typeof s.val === 'string') ? s.val : (/输入「([^」]*)」/.exec(s.text) || [,''])[1];
                try{
                    tel.focus();
                    if(tel.isContentEditable) tel.innerText = val;
                    else tel.value = val;
                    tel.dispatchEvent(new Event('input', {bubbles:true}));
                    tel.dispatchEvent(new Event('change', {bubbles:true}));
                }catch(err){}
                log(tag + '脚本执行：' + s.text);
            }else{
                log(tag + '脚本执行：未找到输入框，跳过 ' + s.text);
            }
            return;
        }
        if(s.type === 'click'){
            var el = null;
            if(s.sel){ try{ el = document.querySelector(s.sel); }catch(err){} }
            if(!el){
                // 手动添加的点击步骤无选择器：按描述中的「文本」查找可交互元素
                var m = /「([^」]+)」/.exec(s.text);
                if(m){
                    var target = m[1];
                    var cands = document.querySelectorAll('button,a,input,select,textarea,[onclick],[data-color]');
                    for(var i = 0; i < cands.length; i++){
                        var label = (cands[i].innerText || cands[i].value || '').trim();
                        if(label === target){ el = cands[i]; break; }
                    }
                }
            }
            if(el){ el.click(); log(tag + '脚本执行：' + s.text); }
            else{ log(tag + '脚本执行：未找到目标，跳过 ' + s.text); }
            return;
        }
        if(s.type === 'hold'){
            var hel = null;
            if(s.sel){ try{ hel = document.querySelector(s.sel); }catch(err){} }
            if(!hel){
                // 手动添加的长按步骤无选择器：按描述中的「文本」查找可交互元素
                var hm = /「([^」]+)」/.exec(s.text);
                if(hm){
                    var htarget = hm[1];
                    var hcands = document.querySelectorAll('button,a,input,select,textarea,[onclick],[data-color]');
                    for(var h = 0; h < hcands.length; h++){
                        var hlabel = (hcands[h].innerText || hcands[h].value || '').trim();
                        if(hlabel === htarget){ hel = hcands[h]; break; }
                    }
                }
            }
            if(hel){
                var hdur = Math.max(0, Number(s.dur) || 0);
                try{ hel.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, button:0})); }catch(err){}
                log(tag + '脚本执行：' + s.text + '（' + Math.round(hdur) + 'ms）');
                (function(el2, d){
                    setTimeout(function(){
                        try{ el2.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, button:0})); }catch(err){}
                    }, d);
                })(hel, hdur);
            }else{
                log(tag + '脚本执行：未找到目标，跳过 ' + s.text);
            }
            return;
        }
    }
    // 播放高亮（仅主面板运行）
    function updatePlayHighlight(){
        if(!list) return;
        var rows = list.querySelectorAll('.st-row');
        for(var i = 0; i < rows.length; i++){
            rows[i].classList.remove('st-cur', 'st-next');
        }
        if(!editorRun) return;
        var cur = editorRun.curIdx, next = editorRun.nextIdx;
        if(cur >= 0 && rows[cur]) rows[cur].classList.add('st-cur');
        if(next >= 0 && next !== cur && rows[next]) rows[next].classList.add('st-next');
    }
    function updatePlayUI(){
        var playing = !!(editorRun && editorRun.running);
        var paused = !!(editorRun && editorRun.running && editorRun.paused);
        playStopBtn.disabled = !playing;
        playBtn.disabled = false;
        if(!playing){
            playBtn.textContent = '▶ 执行脚本';
            root.classList.remove('st-playing', 'st-paused');
        }else if(paused){
            playBtn.textContent = '▶ 继续执行';
            root.classList.add('st-paused');
            root.classList.remove('st-playing');
        }else{
            playBtn.textContent = '⏸ 暂停执行';
            root.classList.add('st-playing');
            root.classList.remove('st-paused');
        }
        // 列表区淡色遮罩：主面板执行中显示，暂停/停止隐藏
        if(veil){
            veil.style.display = playing ? 'flex' : 'none';
            veil.innerText = paused ? '已暂停' : '正在执行…';
        }
    }
    // ===== 脚本库（多脚本存储 / 列表视图 / 开关执行） =====
    var LIB_KEY = 'scriptToolLibrary';
    function loadLibrary(){
        try{ return JSON.parse(localStorage.getItem(LIB_KEY) || '[]') || []; }catch(e){ return []; }
    }
    function saveLibrary(lib){
        try{ localStorage.setItem(LIB_KEY, JSON.stringify(lib)); }catch(e){}
        if(window.GameSave) GameSave._flushToStorage();
    }
    // 视图切换：lib = 脚本列表（默认），edit = 内部编辑界面
    function showView(view){
        if(libView && editView){
            libView.style.display = (view === 'lib') ? 'flex' : 'none';
            editView.style.display = (view === 'edit') ? 'flex' : 'none';
        }
    }
    // 渲染脚本列表视图
    function renderLibList(){
        if(!libList) return;
        var lib = loadLibrary();
        libList.innerHTML = '';
        // 后台录制进行中：顶部横幅，点击进入录制页签
        if(scriptRecording && recTab){
            var banner = document.createElement('div');
            banner.className = 'st-rec-banner';
            banner.dataset.rec = '1';
            banner.innerHTML = '<span class="st-tab-dot"></span> 正在录制「' + escapeHtml(recTab.name) + '」（' + recTab.steps.length + ' 步）— 点击进入';
            libList.appendChild(banner);
        }
        if(!lib.length){
            libList.innerHTML += '<div class="st-empty">暂无脚本<br>点击下方「＋ 新建脚本」开始录制</div>';
            return;
        }
        lib.forEach(function(item){
            var row = document.createElement('div');
            row.className = 'st-librow';
            row.dataset.id = item.id;
            row.dataset.name = item.name;
            row.innerHTML =
                '<span class="st-librow-name" title="点击进入编辑">' + escapeHtml(item.name) + '</span>' +
                '<span class="st-librow-step" title="当前步骤"></span>' +
                '<span class="st-librow-meta">' + item.steps.length + ' 步</span>' +
                '<button class="st-lib-del" title="删除脚本">✕</button>' +
                '<label class="st-switch" title="开始 / 停止执行该脚本">' +
                    '<input type="checkbox" class="st-lib-run"><span class="st-slider"></span>' +
                '</label>';
            libList.appendChild(row);
        });
        updateRunsBadge();
    }
    // 点击脚本行 → 进入该脚本的编辑界面
    function onLibRowClick(e){
        if(e.target.closest('.st-rec-banner')){ openRecTab(); return; }   // 录制横幅 → 进入录制页签
        if(e.target.closest('.st-switch')) return;   // 开关交给 change 事件
        if(e.target.closest('.st-lib-del')) return;  // 删除按钮交给 delete 事件
        var row = e.target.closest('.st-librow');
        if(!row) return;
        openLibEditor(row.dataset.name);
    }
    // 删除脚本库中的脚本（同时停止其运行）
    function onLibDelClick(e){
        var btn = e.target.closest('.st-lib-del');
        if(!btn) return;
        e.stopPropagation();
        var row = btn.closest('.st-librow');
        if(!row) return;
        var name = row.dataset.name;
        var lib = loadLibrary();
        var item = null;
        for(var i = 0; i < lib.length; i++){ if(lib[i].id === row.dataset.id){ item = lib[i]; break; } }
        if(!item) item = lib.filter(function(x){ return x.name === name; })[0] || null;
        if(!window.confirm('确定删除脚本「' + (item ? item.name : name) + '」？')) return;
        stopLibScript(name);
        if(editorRun && editorRun.libName === name){ editorRun = null; updatePlayUI(); }
        lib = lib.filter(function(x){ return !(x.id === row.dataset.id || x.name === name); });
        saveLibrary(lib);
        renderLibList();
        log('已删除脚本：' + name);
    }
    // ===== 编辑页签（多脚本编辑页快速切换） =====
    function createTab(name, steps, libId, isRec){
        var tab = {key: 'tab' + (++tabSeq), name: name || '未命名', steps: steps || [], libId: libId || null, isRec: !!isRec};
        tabs.push(tab);
        return tab;
    }
    function renderTabs(){
        if(!tabsEl) return;
        tabsEl.innerHTML = '';
        tabs.forEach(function(tab){
            var b = document.createElement('button');
            b.className = 'st-tab' + (tab === activeTab ? ' active' : '') + (tab.isRec ? ' is-rec' : '');
            b.dataset.key = tab.key;
            b.innerHTML = (tab.isRec ? '<span class="st-tab-dot"></span>' : '') +
                '<span class="st-tab-name">' + escapeHtml(tab.name) + '</span>' +
                '<span class="st-tab-close" title="关闭页签">✕</span>';
            tabsEl.appendChild(b);
        });
    }
    function findTabByLibId(libId){
        for(var i = 0; i < tabs.length; i++){ if(tabs[i].libId && tabs[i].libId === libId) return tabs[i]; }
        return null;
    }
    function findTabByKey(key){
        for(var i = 0; i < tabs.length; i++){ if(tabs[i].key === key) return tabs[i]; }
        return null;
    }
    function switchTab(key){
        var tab = findTabByKey(key);
        if(!tab) return;
        activeTab = tab;
        scriptSteps = tab.steps;
        currentLibId = tab.libId;
        if(nameInput) nameInput.value = tab.name;
        // 已保存脚本：读取其保存时的播放设置
        var item = null;
        if(tab.libId){
            var lib = loadLibrary();
            for(var j = 0; j < lib.length; j++){ if(lib[j].id === tab.libId){ item = lib[j]; break; } }
            if(item && item.mode){
                playMode = item.mode;
                var r = document.querySelector('input[name="stPlayMode"][value="' + item.mode + '"]');
                if(r) r.checked = true;
                playTimes = Math.max(1, item.times || 1);
                if(timesInput) timesInput.value = playTimes;
            }
        }
        // 若该脚本正在运行：编辑器接管显示（步骤呼吸 / 播放按钮反映运行态）
        editorRun = (item && findRunByLibName(item.name)) || null;
        renderScriptList();
        renderTabs();
        updatePlayUI();
        updateRecBtn();
    }
    function closeTab(key){
        var idx = -1;
        for(var i = 0; i < tabs.length; i++){ if(tabs[i].key === key){ idx = i; break; } }
        if(idx < 0) return;
        var tab = tabs[idx];
        if(tab.isRec) forceStopRecording();   // 关闭录制页签 → 停止后台录制
        tabs.splice(idx, 1);
        if(tabs.length === 0){
            activeTab = null;
            scriptSteps = [];
            currentLibId = null;
            editorRun = null;
            renderLibList();
            updatePlayUI();
            showView('lib');
            return;
        }
        if(activeTab === tab){
            activeTab = null;
            var next = tabs[Math.min(idx, tabs.length - 1)];
            switchTab(next.key);
        }else{
            renderTabs();
        }
        updateRecBtn();
    }
    function openRecTab(){
        if(recTab){ showView('edit'); switchTab(recTab.key); }
    }
    function onTabsClick(e){
        var tabEl = e.target.closest('.st-tab');
        if(!tabEl) return;
        var close = e.target.closest('.st-tab-close');
        if(close){ e.stopPropagation(); closeTab(tabEl.dataset.key); return; }
        switchTab(tabEl.dataset.key);
    }
    function openLibEditor(name){
        var lib = loadLibrary();
        var item = null;
        if(name){
            for(var i = 0; i < lib.length; i++){ if(lib[i].name === name){ item = lib[i]; break; } }
        }
        if(item){
            // 已有该脚本的页签 → 直接切换（录制不受影响）
            var exist = findTabByLibId(item.id);
            if(exist){ switchTab(exist.key); showView('edit'); log('进入编辑：' + item.name); return; }
            var tab = createTab(item.name, item.steps.map(function(s){ return Object.assign({}, s); }), item.id, false);
            switchTab(tab.key);
            showView('edit');
            log('进入编辑：' + item.name);
        }else{
            // 新建：尚无任何页签且存在恢复草稿时继承，否则从空开始
            var steps = (tabs.length === 0 && scriptSteps.length) ? scriptSteps.slice() : [];
            var t2 = createTab('未命名', steps, null, false);
            switchTab(t2.key);
            showView('edit');
            log('新建脚本');
        }
    }
    // 开关拨动 → 开始 / 停止执行对应脚本（可并发）
    function onLibToggleChange(e){
        var chk = e.target;
        if(!chk.classList || !chk.classList.contains('st-lib-run')) return;
        var row = chk.closest('.st-librow');
        if(!row) return;
        var id = row.dataset.id;
        var lib = loadLibrary();
        var item = null;
        for(var i = 0; i < lib.length; i++){ if(lib[i].id === id){ item = lib[i]; break; } }
        if(!item) item = lib.filter(function(x){ return x.name === row.dataset.name; })[0] || null;
        if(chk.checked){
            if(!item || !item.steps || !item.steps.length){
                log('脚本为空，无法执行');
                chk.checked = false;
                return;
            }
            if(scriptRecording){ log('录制中，无法执行脚本'); chk.checked = false; return; }
            var ctx = createRun(item.steps, {mode:item.mode || 'loop', times:item.times || 1, isEditor:false, logTag:item.name, libName:item.name});
            if(!ctx){ chk.checked = false; return; }
            log('[' + item.name + '] 开始执行（可与其他脚本并发）');
            playStep(ctx);
        }else{
            stopLibScript(item ? item.name : row.dataset.name);
        }
    }
    function stopLibScript(name){
        runs.slice().forEach(function(ctx){
            if(ctx.libName === name && ctx.running) stopRun(ctx);
        });
    }
    // 保存当前编辑器脚本到脚本库（保存后停留在编辑界面，带反馈）
    function saveToLibrary(){
        if(!scriptSteps.length){ showToast('当前脚本为空，无法保存'); return; }
        var name = (nameInput.value || '').trim() || ('脚本 ' + new Date().toLocaleTimeString());
        var lib = loadLibrary();
        var idx = -1;
        for(var i = 0; i < lib.length; i++){
            if(currentLibId && lib[i].id === currentLibId){ idx = i; break; }
        }
        if(idx < 0){
            for(var j = 0; j < lib.length; j++){ if(lib[j].name === name){ idx = j; break; } }
        }
        if(playMode === 'times') playTimes = Math.max(1, parseInt(timesInput.value, 10) || 1);
        var item = {
            id: idx >= 0 ? lib[idx].id : ('s' + Date.now() + '_' + Math.floor(Math.random() * 9999)),
            name: name,
            steps: scriptSteps.map(function(s){ return Object.assign({}, s); }),
            mode: playMode,
            times: playTimes,
            savedAt: Date.now()
        };
        if(idx >= 0) lib[idx] = item; else lib.push(item);
        saveLibrary(lib);
        currentLibId = item.id;
        if(activeTab){ activeTab.libId = item.id; activeTab.name = name; renderTabs(); }
        if(nameInput) nameInput.value = name;
        renderLibList();
        showToast('已保存「' + name + '」');
        log('已保存到脚本库：' + name);
    }
    // 底部提示（保存反馈）
    function showToast(msg){
        if(!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function(){ toast.classList.remove('show'); }, 1600);
    }
    // ===== 构建面板 =====
    function buildPanel(){
        root = document.getElementById('scriptToolRoot');
        if(!root){
            root = document.createElement('div');
            root.id = 'scriptToolRoot';
            root.className = 'st-float';
            document.body.appendChild(root);
        }
        root.classList.add('st-root');
        root.innerHTML = [
            '<div class="st-head">',
                '<h3 class="st-title">脚本工具</h3>',
                '<button class="st-rec-chip" id="stRecChip" title="录制进行中，点击进入录制页签"><span class="st-tab-dot"></span>录制中</button>',
                '<span class="st-runs" id="stRuns"></span>',
                '<span class="st-paused" id="stPaused"></span>',
                '<button class="st-collapse" title="收起/展开">—</button>',
                '<button class="st-close" title="关闭">×</button>',
            '</div>',
            // 脚本列表视图（默认）
            '<div class="st-libview" id="stLibView">',
                '<div class="st-lib-list" id="stLibList"></div>',
                '<button id="stNewBtn" class="st-btn st-rec st-lib-new">＋ 新建脚本</button>',
            '</div>',
            // 内部编辑视图（点击脚本 / 新建后进入；顶部页签可快速切换不同脚本编辑页）
            '<div id="stEditView">',
                '<div class="st-tabs" id="stTabs"></div>',
                '<div class="st-editbar">',
                    '<button id="stBackBtn" class="st-btn st-ghost">← 返回</button>',
                    '<input id="stNameInput" class="st-name-input" placeholder="脚本名称" autocomplete="off" spellcheck="false">',
                    '<button id="stSaveBtn" class="st-btn st-rec">保存</button>',
                '</div>',
                '<div class="st-controls">',
                    '<button id="stRecBtn" class="st-btn st-rec">● 开始录制</button>',
                    '<button id="stStopBtn" class="st-btn st-stop" disabled>■ 停止录制</button>',
                '</div>',
                '<div class="st-foot">',
                    '<select id="stAddType" class="st-add-type" title="手动添加步骤类型">',
                        '<option value="cmd">＋命令</option>',
                        '<option value="click">＋点击</option>',
                        '<option value="hold">＋长按</option>',
                        '<option value="type">＋输入</option>',
                        '<option value="marker">＋标记</option>',
                    '</select>',
                    '<button id="stAddBtn" class="st-btn st-ghost">添加</button>',
                    '<button id="stClearBtn" class="st-btn st-ghost">清空</button>',
                '</div>',
                '<div class="st-list-wrap">',
                    '<div class="st-list" id="stList"></div>',
                    '<div class="st-scrollbar" id="stScrollbar"></div>',
                    '<div class="st-veil" id="stVeil">正在执行…</div>',
                '</div>',
                '<div class="st-play">',
                    '<span class="st-play-title">播放</span>',
                    '<label title="循环播放"><input type="radio" name="stPlayMode" value="loop" checked> 循环</label>',
                    '<label title="执行指定次数"><input type="radio" name="stPlayMode" value="times"> 执行',
                        '<input type="number" id="stTimes" class="st-times" value="1" min="1"> 次</label>',
                '</div>',
                '<div class="st-play-btns">',
                    '<button id="stPlayBtn" class="st-btn st-playb">▶ 执行脚本</button>',
                    '<button id="stPlayStopBtn" class="st-btn st-stop" disabled>■ 停止执行</button>',
                '</div>',
            '</div>',
            '<div class="st-toast" id="stToast"></div>',
            '<div class="st-resize" title="拖动调整大小"></div>'
        ].join('');
        recBtn = $('stRecBtn');
        stopBtn = $('stStopBtn');
        clearBtn = $('stClearBtn');
        list = $('stList');
        playBtn = $('stPlayBtn');
        playStopBtn = $('stPlayStopBtn');
        timesInput = $('stTimes');
        addBtn = $('stAddBtn');
        addType = $('stAddType');
        veil = $('stVeil');
        scrollbarEl = $('stScrollbar');
        runsBadge = $('stRuns');
        pausedBadge = $('stPaused');
        nameInput = $('stNameInput');
        saveBtn = $('stSaveBtn');
        backBtn = $('stBackBtn');
        newBtn = $('stNewBtn');
        libList = $('stLibList');
        libView = $('stLibView');
        editView = $('stEditView');
        tabsEl = $('stTabs');
        toast = $('stToast');
        recChip = $('stRecChip');
        tabsEl.addEventListener('click', onTabsClick);
        if(recChip) recChip.addEventListener('click', openRecTab);
        list.addEventListener('scroll', updateScrollbar);
        libList.addEventListener('click', onLibRowClick);
        libList.addEventListener('click', onLibDelClick);
        libList.addEventListener('change', onLibToggleChange);
        recBtn.addEventListener('click', startScriptRecording);
        stopBtn.addEventListener('click', stopScriptRecording);
        clearBtn.addEventListener('click', clearScript);
        playBtn.addEventListener('click', startEditorPlayback);
        playStopBtn.addEventListener('click', function(){
            if(editorRun && editorRun.running) stopRun(editorRun);
        });
        backBtn.addEventListener('click', function(){
            // 返回列表：录制继续在后台进行（切换视图不中断）；不终止进行中的运行
            editorRun = null;        // 仅解除编辑器对该运行的显示
            updatePlayUI();
            renderLibList();
            showView('lib');
        });
        newBtn.addEventListener('click', function(){
            openLibEditor(null);
        });
        saveBtn.addEventListener('click', saveToLibrary);
        nameInput.addEventListener('keydown', function(e){
            if(e.key === 'Enter'){ e.preventDefault(); saveToLibrary(); }
        });
        addBtn.addEventListener('click', addManualStep);
        Array.prototype.forEach.call(document.querySelectorAll('input[name="stPlayMode"]'), function(r){
            r.addEventListener('change', function(){
                var c = document.querySelector('input[name="stPlayMode"]:checked');
                playMode = c ? c.value : 'loop';
            });
        });
        list.addEventListener('click', onListClick);
        list.addEventListener('change', onListChange);
        list.addEventListener('keydown', onListKeydown);
        list.addEventListener('blur', onListBlur, true);
        // 编辑中点击列表外区域 → 提交（不依赖 blur 事件；列表内由 onListClick 处理）
        document.addEventListener('click', function(e){
            if(!editingEl) return;
            if(list.contains(e.target)) return;
            commitEdit();
        });
    }
    // ===== 浮动面板：拖动 / 收起 / 拉伸（仅 st-float 模式） =====
    function initFloatPanel(){
        if(!root.classList.contains('st-float')) return;
        var head = root.querySelector('.st-head');
        var resize = root.querySelector('.st-resize');
        var collapseBtn = root.querySelector('.st-collapse');
        var closeBtn = root.querySelector('.st-close');
        // 恢复上次位置 / 尺寸
        try{
            var pos = JSON.parse(localStorage.getItem('stFloatPos') || 'null');
            var sz = JSON.parse(localStorage.getItem('stFloatSize') || 'null');
            if(pos && pos.left) root.style.left = pos.left;
            if(pos && pos.top) root.style.top = pos.top;
            if(sz && sz.width) root.style.width = sz.width;
            if(sz && sz.height) root.style.height = sz.height;
        }catch(e){}
        // 拖动（标题栏）
        head.addEventListener('mousedown', function(e){
            if(e.target.closest('.st-collapse')) return;
            if(e.target.closest('.st-close')) return;
            e.preventDefault();
            var startX = e.clientX, startY = e.clientY;
            var origLeft = root.offsetLeft, origTop = root.offsetTop;
            function onMove(ev){
                root.style.left = (origLeft + ev.clientX - startX) + 'px';
                root.style.top = (origTop + ev.clientY - startY) + 'px';
            }
            function onUp(){
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                try{ localStorage.setItem('stFloatPos', JSON.stringify({left:root.style.left, top:root.style.top})); }catch(e){}
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        // 拉伸（右下角）
        resize.addEventListener('mousedown', function(e){
            e.preventDefault();
            e.stopPropagation();
            var startX = e.clientX, startY = e.clientY;
            var ow = root.offsetWidth, oh = root.offsetHeight;
            function onMove(ev){
                root.style.width = Math.max(220, ow + ev.clientX - startX) + 'px';
                root.style.height = Math.max(200, oh + ev.clientY - startY) + 'px';
            }
            function onUp(){
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                try{ localStorage.setItem('stFloatSize', JSON.stringify({width:root.style.width, height:root.style.height})); }catch(e){}
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        // 收起 / 展开
        collapseBtn.addEventListener('click', function(e){
            e.stopPropagation();
            var mini = root.classList.toggle('st-mini');
            collapseBtn.textContent = mini ? '▢' : '—';
        });
        // 关闭弹窗（停止所有运行并隐藏面板）
        if(closeBtn){
            closeBtn.addEventListener('click', function(e){
                e.stopPropagation();
                stopAllRuns();
                root.style.display = 'none';
            });
        }
    }
    // ===== 初始化 =====
    function init(){
        buildPanel();
        // 接入存档系统：注册脚本库与当前编辑脚本，供 GameSave 统一导出/载入
        if(window.GameSave){
            GameSave.register('scriptLibrary', function(){
                return loadLibrary();
            }, function(lib){
                if(Array.isArray(lib)){
                    saveLibrary(lib);
                    renderLibList();
                }
            });
            GameSave.register('scriptCurrent', function(){
                return scriptSteps.map(function(s){ return Object.assign({}, s); });
            }, function(steps){
                if(Array.isArray(steps)){
                    scriptSteps = steps;
                    renderScriptList();
                }
            });
        }
        renderLibList();       // 默认显示脚本列表视图
        showView('lib');
        loadScript();
        updateRunsBadge();
        updateRecChip();
        updateRecBtn();
        initFloatPanel();
        // 对外API
        window.ScriptTool = {
            recordCommand: recordCommand,
            startRecording: startScriptRecording,
            stopRecording: stopScriptRecording,
            startPlayback: startEditorPlayback,     // 主面板执行当前脚本
            pausePlayback: function(){ if(editorRun) pauseRun(editorRun); },
            resumePlayback: function(){ if(editorRun) resumeRun(editorRun); },
            stopPlayback: function(){ if(editorRun) stopRun(editorRun); },
            runScript: function(name){              // 运行脚本库中指定名称的脚本（可并发）
                var lib = loadLibrary();
                var item = null;
                for(var i = 0; i < lib.length; i++){ if(lib[i].name === name){ item = lib[i]; break; } }
                if(!item || !item.steps || !item.steps.length){ log('未找到脚本或脚本为空：' + name); return null; }
                var ctx = createRun(item.steps, {mode:item.mode || 'loop', times:item.times || 1, isEditor:false, logTag:item.name, libName:item.name});
                if(ctx) playStep(ctx);
                return ctx;
            },
            stopAll: stopAllRuns,                    // 停止全部运行
            runSteps: function(stepsArr, opts){      // 外部宿主直接运行一组步骤
                var ctx = createRun(stepsArr, opts || {mode:'loop', times:1, isEditor:false, logTag:'外部'});
                if(ctx) playStep(ctx);
                return ctx;
            },
            getScript: function(){ return scriptSteps; },
            setScript: function(arr){
                if(Array.isArray(arr)){
                    if(activeTab){
                        scriptSteps.splice(0, scriptSteps.length);
                        Array.prototype.push.apply(scriptSteps, arr);
                    }else{
                        scriptSteps = arr;
                    }
                    renderScriptList();
                }
            },
            getLibrary: loadLibrary,
            saveScriptToLibrary: saveToLibrary,
            deleteLibraryScript: function(name){     // 删除脚本库中的脚本
                var lib = loadLibrary();
                var idx = -1;
                for(var i = 0; i < lib.length; i++){ if(lib[i].name === name || lib[i].id === name){ idx = i; break; } }
                if(idx < 0) return false;
                lib.splice(idx, 1);
                saveLibrary(lib);
                renderLibList();
                log('已删除脚本：' + name);
                return true;
            },
            getRuns: function(){ return runs.length; },
            show: function(){ if(root) root.style.display = ''; },
            hide: function(){
                if(root){
                    stopAllRuns();
                    root.style.display = 'none';
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