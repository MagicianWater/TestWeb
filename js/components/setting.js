// setting - 系统设置面板
//
// 本文件按"功能区域"组织，每个区域对应 setting.html 中的一张卡片：
//
//   【区域1】快捷键设置      → 卡片"快捷键设置"（hotkeyList，含输入框 + 保留默认勾选框）
//   【区域2】标题栏显示      → 卡片"标题栏显示"（titleOverlayBtn）
//   【区域3】快捷栏挂载      → 卡片"快捷栏设置"（sideLayoutCfg）
//   【区域4】功能与脚本管理  → 卡片"功能与脚本管理"（widgetMgr）
//   【区域5】存档管理        → 卡片"存档管理"（exportSaveBtn / importSaveBtn / saveStatusTip）
//
// 各区域的状态字段、渲染函数、事件绑定均就近集中，便于维护。
var SettingPanel = {

    //===== 公共状态（跨区域共享） =====
    tempKey: {ctrl:false, alt:false, shift:false, key:""},
    _keydownBound: false,

    init: function(){
        this.bossKeyInit();
        this.renderAll();
        this.renderSideLayout();
        this.renderWidgetManager();
        this.bindEvents();
        this.initCollapsible();
    },

    //===== 公共：渲染所有区域 UI =====
    renderAll: function(){
        this.bossKeyRender();
        this.titleOverlayRender();
        this.miniViewRender();
    },

    //===== 公共：绑定所有区域事件 =====
    bindEvents: function(){
        this.bossKeyBind();
        this.titleOverlayBind();
        this.miniViewBind();
        this.sideLayoutBind();
        this.saveMgrBind();
    },

    //===== 公共：可折叠卡片初始化（默认收起） =====
    initCollapsible: function(){
        const self = this;
        document.querySelectorAll('.card-collapsible').forEach(function(card){
            const toggle = card.querySelector('.card-toggle');
            if(!toggle) return;
            // 默认收起
            card.classList.add('collapsed');
            const state = toggle.querySelector('.card-state');
            if(state) state.textContent = '展开';
            toggle.onclick = function(){
                const collapsed = card.classList.toggle('collapsed');
                if(state) state.textContent = collapsed ? '展开' : '收起';
            };
        });
    },

    //===== 公共：显示存档操作提示 =====
    _showSaveTip: function(msg){
        const tip = document.getElementById("saveStatusTip");
        if(tip) tip.textContent = msg;
    },

    /* ============================================================
     * 【区域1】快捷键设置
     *   对应卡片：快捷键设置
     *   元素：hotkeyList（快捷键行容器，每行含输入框 + 保留默认勾选框）
     *   持久化：hotKeyList（对象数组）/ enableEscBackup / enableNum0Backup（由 base.js 经 GameSave 管理）
     *   数据结构：hotKeyList = [{ name, key, action }, ...]
     *     action: 'toggle' 切换显示/隐藏，'hide' 收起弹窗栏
     *   备用键：toggle→ESC(enableEscBackup)，hide→NUM0(enableNum0Backup)
     *   冲突检测：重复自定义键→输入框标黄；自定义键与备用键冲突→勾选框标黄
     * ============================================================ */
    recordingIdx: -1,          // 正在录制的快捷键索引（-1 表示未录制）

    bossKeyInit: function(){
        this.recordingIdx = -1;
        this.bossKeyLoad();
    },

    // 从全局变量同步状态（值由 GameSave 恢复，渲染时直接读取全局）
    bossKeyLoad: function(){
    },

    // 渲染快捷键列表（多行）
    bossKeyRender: function(){
        const box = document.getElementById("hotkeyList");
        if(!box) return;
        const self = this;
        const list = Array.isArray(hotKeyList) ? hotKeyList : [];
        // 悬停浮现说明文字的文案（暂未启用，保留以备未来需要）
        // const tips = {
        //     'toggle': '点击录制，切换显示/隐藏浏览器',
        //     'hide':   '点击录制，直接收起（隐藏）浏览器'
        // };
        box.innerHTML = '';
        list.forEach(function(item, idx){
            const row = document.createElement('div');
            row.className = 'hotkey-row';

            const name = document.createElement('span');
            name.className = 'hotkey-name';
            name.textContent = item.name;
            row.appendChild(name);

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'hotkey-input';
            input.dataset.idx = idx;
            input.value = item.key || '';
            input.placeholder = '点击录制';
            input.readOnly = true;
            row.appendChild(input);

            // 保留默认（备用快捷键）勾选框
            const check = document.createElement('label');
            check.className = 'hotkey-check';
            check.title = '保留默认';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.idx = idx;
            cb.checked = self._isBackupEnabled(item.action);
            cb.onchange = function(){
                self._setBackupEnabled(item.action, cb.checked);
                self.bossKeySave();
                self.checkConflicts();
            };
            check.appendChild(cb);
            row.appendChild(check);

            // 悬停浮现说明文字（暂未启用，保留以备未来需要）
            // const tip = document.createElement('div');
            // tip.className = 'hotkey-tip';
            // tip.textContent = tips[item.action] || '点击录制快捷键';
            // row.appendChild(tip);

            box.appendChild(row);
        });
        // 列表重建后重新绑定输入框事件 + 冲突检测
        self.bossKeyBindInputs();
        self.checkConflicts();
    },

    // 构建组合键字符串（与小键盘识别保持一致）
    buildCombo: function(t){
        const name = [];
        if(t.ctrl) name.push("Ctrl");
        if(t.alt) name.push("Alt");
        if(t.shift) name.push("Shift");
        if(t.key) name.push(t.key);
        return name.join("+");
    },

    // 录制时统一按键名：小键盘 → NUM0~NUM9
    normalizeKey: function(e){
        if(e.code && e.code.indexOf('Numpad') === 0){
            return 'NUM' + e.code.slice(6);
        }
        return (typeof e.key === 'string') ? e.key.toUpperCase() : '';
    },

    // 根据动作获取备用快捷键是否启用
    _isBackupEnabled: function(action){
        if(action === 'toggle') return enableEscBackup;
        if(action === 'hide') return enableNum0Backup;
        return false;
    },

    // 根据动作设置备用快捷键启用状态
    _setBackupEnabled: function(action, val){
        if(action === 'toggle') enableEscBackup = val;
        else if(action === 'hide') enableNum0Backup = val;
    },

    // 获取已启用的备用快捷键按键名列表（用于冲突检测）
    _getEnabledBackupKeys: function(){
        const keys = [];
        if(enableEscBackup) keys.push('ESCAPE');
        if(enableNum0Backup) keys.push('NUM0');
        return keys;
    },

    // 冲突检测：输入框标黄（重复自定义键）、勾选框标黄（与默认键冲突）
    checkConflicts: function(){
        const box = document.getElementById("hotkeyList");
        if(!box) return;
        const list = Array.isArray(hotKeyList) ? hotKeyList : [];
        const backupKeys = this._getEnabledBackupKeys();
        const inputs = box.querySelectorAll('.hotkey-input');
        const checks = box.querySelectorAll('.hotkey-check');

        // 输入框：与其他项的自定义键重复 → 标黄
        inputs.forEach(function(input, idx){
            input.classList.remove('ds-warn');
            const key = (list[idx] && list[idx].key) || '';
            if(!key) return;
            for(let j = 0; j < list.length; j++){
                if(j !== idx && list[j].key === key){
                    input.classList.add('ds-warn');
                    break;
                }
            }
        });

        // 勾选框：自定义键与已启用的备用键冲突 → 标黄
        checks.forEach(function(check, idx){
            check.classList.remove('ds-warn');
            const key = (list[idx] && list[idx].key) || '';
            if(!key) return;
            if(backupKeys.indexOf(key) >= 0){
                check.classList.add('ds-warn');
            }
        });
    },

    // 保存快捷键配置到全局变量并持久化
    bossKeySave: function(){
        if(window.GameSave) GameSave._flushToStorage();
        if(window.reloadSettings) window.reloadSettings();
        console.log("[SettingPanel] 快捷键配置已保存");
    },

    // 绑定快捷键输入框的录制事件（列表重建后调用）
    bossKeyBindInputs: function(){
        const self = this;
        const box = document.getElementById("hotkeyList");
        if(!box) return;
        const inputs = box.querySelectorAll(".hotkey-input");
        inputs.forEach(function(input){
            input.onfocus = function(){
                self.recordingIdx = parseInt(input.dataset.idx, 10);
                self.tempKey = {ctrl:false, alt:false, shift:false, key:""};
                input.value = "";
                input.placeholder = "请按下快捷键组合...";
            };
            input.onblur = function(){
                const idx = self.recordingIdx;
                self.recordingIdx = -1;
                if(idx >= 0 && self.tempKey.key){
                    const combo = self.buildCombo(self.tempKey);
                    if(hotKeyList[idx]) hotKeyList[idx].key = combo;
                    input.value = combo;
                    self.bossKeySave();
                }else if(idx >= 0 && hotKeyList[idx]){
                    input.value = hotKeyList[idx].key || "";
                }
                input.placeholder = "点击录制";
                self.checkConflicts();
            };
        });
    },

    bossKeyBind: function(){
        const self = this;

        // 文档级录制监听：只绑定一次；按键时写入当前录制的输入框
        if(!this._keydownBound){
            this._keydownBound = true;
            document.addEventListener('keydown', function(e){
                if(self.recordingIdx < 0) return;
                e.preventDefault();
                const input = self._getRecordingInput();
                if(!input) return;
                if(e.key === 'Backspace'){
                    self.tempKey = {ctrl:false, alt:false, shift:false, key:""};
                    input.value = "";
                    return;
                }
                if(["Control","Alt","Shift"].includes(e.key)) return;
                self.tempKey.ctrl = e.ctrlKey;
                self.tempKey.alt = e.altKey;
                self.tempKey.shift = e.shiftKey;
                self.tempKey.key = self.normalizeKey(e);
                input.value = self.buildCombo(self.tempKey);
            });
        }

        // 绑定输入框录制事件
        this.bossKeyBindInputs();
    },

    // 获取当前正在录制的输入框
    _getRecordingInput: function(){
        const box = document.getElementById("hotkeyList");
        if(!box || this.recordingIdx < 0) return null;
        return box.querySelector('.hotkey-input[data-idx="' + this.recordingIdx + '"]');
    },

    /* ============================================================
     * 【区域2】样式设置
     *   对应卡片：样式设置
     *   元素：titleOverlayBtn（标题遮挡开关）、miniViewBtn（小窗样式开关）
     *         miniViewWRange/miniViewHRange（小窗尺寸阈值拖动条）
     *   持久化：disableTitleOcclusion（base.js）/ enableMiniView/miniViewMinW/miniViewMinH（miniView.js），均经 GameSave 管理
     * ============================================================ */
    disableTitleOcclusion: false,

    titleOverlayRender: function(){
        const btn = document.getElementById("titleOverlayBtn");
        if(btn) btn.checked = !this.disableTitleOcclusion;
    },

    titleOverlayBind: function(){
        const self = this;
        const titleBtn = document.getElementById("titleOverlayBtn");
        if(titleBtn){
            titleBtn.onchange = function(){
                self.disableTitleOcclusion = !titleBtn.checked;
                disableTitleOcclusion = self.disableTitleOcclusion;
                if(window.GameSave) GameSave._flushToStorage();
                if(window.applyTitleOverlay) window.applyTitleOverlay(self.disableTitleOcclusion);
                if(window.reloadSettings) window.reloadSettings();
                console.log("[SettingPanel] 标题遮挡配置已保存");
            };
        }
    },

    // 小窗样式开关：开启后窗口边长小于设定阈值时降级为紧凑小窗视图
    miniViewRender: function(){
        const btn = document.getElementById("miniViewBtn");
        if(btn) btn.checked = enableMiniView;
        const wRange = document.getElementById("miniViewWRange");
        const wVal = document.getElementById("miniViewWVal");
        if(wRange) wRange.value = miniViewMinW;
        if(wVal) wVal.textContent = miniViewMinW;
        const hRange = document.getElementById("miniViewHRange");
        const hVal = document.getElementById("miniViewHVal");
        if(hRange) hRange.value = miniViewMinH;
        if(hVal) hVal.textContent = miniViewMinH;
    },

    miniViewBind: function(){
        const btn = document.getElementById("miniViewBtn");
        if(btn){
            btn.onchange = function(){
                const newVal = btn.checked;
                enableMiniView = newVal;
                if(window.MiniView) MiniView.setEnabled(newVal);
                if(window.GameSave) GameSave._flushToStorage();
                if(window.SettingPanel) SettingPanel.miniViewRender();
                console.log("[SettingPanel] 小窗样式配置已保存");
            };
        }
        const wRange = document.getElementById("miniViewWRange");
        const wVal = document.getElementById("miniViewWVal");
        if(wRange){
            wRange.oninput = function(){
                miniViewMinW = parseInt(wRange.value, 10);
                if(wVal) wVal.textContent = miniViewMinW;
                if(window.MiniView) MiniView.checkSize();
                if(window.GameSave) GameSave._flushToStorage();
            };
        }
        const hRange = document.getElementById("miniViewHRange");
        const hVal = document.getElementById("miniViewHVal");
        if(hRange){
            hRange.oninput = function(){
                miniViewMinH = parseInt(hRange.value, 10);
                if(hVal) hVal.textContent = miniViewMinH;
                if(window.MiniView) MiniView.checkSize();
                if(window.GameSave) GameSave._flushToStorage();
            };
        }
    },

    /* ============================================================
     * 【区域3】快捷栏挂载
     *   对应卡片：快捷栏设置
     *   元素：sideLayoutCfg（四边下拉框容器）
     *   数据来源：mount.js 的 getSideLayout / setSideLayout / SIDE_LABELS
     * ============================================================ */

    // 渲染四边挂载配置下拉框
    renderSideLayout: function(){
        const box = document.getElementById('sideLayoutCfg');
        if(!box) return;
        const layout = window.getSideLayout ? window.getSideLayout() : {};
        const widgets = window.getSideWidgetList ? window.getSideWidgetList() : [];
        const labels = window.SIDE_LABELS || {};
        const order = ['top','bottom','left','right'];
        box.innerHTML = '';
        order.forEach(function(side){
            const row = document.createElement('div');
            row.className = 'side-layout-row';
            const lab = document.createElement('label');
            lab.textContent = labels[side] || side;
            const sel = document.createElement('select');
            sel.dataset.side = side;
            const opt0 = document.createElement('option');
            opt0.value = '';
            opt0.textContent = '无';
            sel.appendChild(opt0);
            widgets.forEach(function(w){
                const opt = document.createElement('option');
                opt.value = w.id;
                opt.textContent = w.name;
                sel.appendChild(opt);
            });
            sel.value = layout[side] || '';
            row.appendChild(lab);
            row.appendChild(sel);
            box.appendChild(row);
        });
    },

    // 下拉变更即时生效（去重：同一工具只保留最后选择的边）
    sideLayoutBind: function(){
        const cfgBox = document.getElementById('sideLayoutCfg');
        if(!cfgBox) return;
        cfgBox.onchange = function(e){
            const sel = e.target;
            if(sel.tagName !== 'SELECT') return;
            const val = sel.value || null;
            if(val){
                cfgBox.querySelectorAll('select').forEach(function(s){
                    if(s !== sel && s.value === val) s.value = '';
                });
            }
            const cfg = {};
            cfgBox.querySelectorAll('select').forEach(function(s){
                cfg[s.dataset.side] = s.value || null;
            });
            if(window.setSideLayout) window.setSideLayout(cfg);
        };
    },

    /* ============================================================
     * 【区域4】功能与脚本管理
     *   对应卡片：功能与脚本管理
     *   元素：widgetMgr（工具列表容器）
     *   数据来源：mount.js 的 getAllWidgets（含挂载组件 + 浮动窗）
     * ============================================================ */

    // 渲染工具与特效脚本列表
    renderWidgetManager: function(){
        const box = document.getElementById('widgetMgr');
        if(!box) return;
        const widgets = window.getAllWidgets ? window.getAllWidgets() : [];
        box.innerHTML = '';
        widgets.forEach(function(w){
            const row = document.createElement('div');
            row.className = 'wm-row';
            const info = document.createElement('div');
            info.className = 'wm-info';
            const name = document.createElement('span');
            name.className = 'wm-name';
            name.textContent = w.name;
            info.appendChild(name);
            const desc = document.createElement('span');
            desc.className = 'wm-desc';
            if(w.mode === 'side'){
                desc.textContent = '挂载：' + w.location;
            }else{
                desc.textContent = w.open ? '浮动窗·已打开' : '浮动窗·已关闭';
            }
            info.appendChild(desc);
            row.appendChild(info);
            const ctrl = document.createElement('div');
            ctrl.className = 'wm-ctrl';
            if(w.mode === 'float'){
                const btn = document.createElement('button');
                btn.className = 'wm-btn' + (w.open ? ' wm-on' : '');
                btn.textContent = w.open ? '关闭' : '打开';
                btn.onclick = function(){
                    if(window.setFloatOpen) window.setFloatOpen(w.id, !w.open);
                };
                ctrl.appendChild(btn);
            }else{
                const tag = document.createElement('span');
                tag.className = 'wm-tag';
                tag.textContent = w.location === '无' ? '未挂载' : '已挂载';
                ctrl.appendChild(tag);
            }
            row.appendChild(ctrl);
            box.appendChild(row);
        });
    },

    /* ============================================================
     * 【区域5】存档管理
     *   对应卡片：存档管理
     *   元素：exportSaveBtn / importSaveBtn / saveStatusTip
     *   数据来源：save.js 的 GameSave（导出/导入 JSON 存档）
     * ============================================================ */

    saveMgrBind: function(){
        const self = this;
        const exportBtn = document.getElementById("exportSaveBtn");
        const importBtn = document.getElementById("importSaveBtn");

        // 导出存档为 JSON 文件
        if(exportBtn){
            exportBtn.onclick = function(){
                if(!window.GameSave){ self._showSaveTip('存档模块未加载'); return; }
                const data = GameSave.exportToFile();
                const fileCount = Object.keys(data.files || {}).length;
                self._showSaveTip('存档已导出（已编辑文件 ' + fileCount + ' 个）');
            };
        }
        // 从 JSON 文件载入存档
        if(importBtn){
            importBtn.onclick = function(){
                if(!window.GameSave){ self._showSaveTip('存档模块未加载'); return; }
                self._showSaveTip('请选择存档文件...');
                GameSave.importFromFile(function(ok, data, err){
                    if(ok){
                        const fileCount = Object.keys(data.files || {}).length;
                        self._showSaveTip('存档载入成功（已编辑文件 ' + fileCount + ' 个）');
                        // 载入后同步终端提示符
                        if(window.TerminalCore && TerminalCore.updatePrompt) TerminalCore.updatePrompt();
                    }else{
                        self._showSaveTip('载入失败：' + (err || '未知错误'));
                    }
                });
            };
        }
    }
};

/* ============================================================
 * 挂载系统变更监听（跨区域3/4）
 *   mount.js 在布局/浮动窗状态变更后派发 sideLayoutChange / floatStateChange 事件；
 *   此处监听并重新渲染，使右键标签挂载等外部操作即时反映到设置界面。
 *   面板未打开时 renderSideLayout/renderWidgetManager 会因容器缺失直接返回，无副作用。
 * ============================================================ */
(function(){
    if(window.__settingMountSyncBound) return;
    window.__settingMountSyncBound = true;
    window.addEventListener('sideLayoutChange', function(){
        if(window.SettingPanel){
            SettingPanel.renderSideLayout();
            SettingPanel.renderWidgetManager();
        }
    });
    window.addEventListener('floatStateChange', function(){
        if(window.SettingPanel){
            SettingPanel.renderWidgetManager();
        }
    });
})();

/* ============================================================
 * 小窗样式模块载入（由设置组件负责 import）
 *   小窗样式（miniView）的 CSS / JS 为独立文件，便于未来桌面打包抽离。
 *   此处在 setting.js 解析时动态注入 miniView.css 与 miniView.js，
 *   miniView.js 载入后会自注册持久化字段、恢复存档值并自初始化。
 *   base.js 启动时会预载 setting.js，使小窗降级在页面加载时即生效。
 * ============================================================ */
(function(){
    if(window.__miniViewLoaded) return;
    window.__miniViewLoaded = true;
    // 载入小窗样式（独立 CSS 文件）
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './css/miniView.css?v=20260907';
    document.head.appendChild(link);
    // 载入小窗脚本（独立 JS 文件，自初始化）
    var script = document.createElement('script');
    script.src = './js/core/miniView.js?v=20260907';
    document.body.appendChild(script);
})();