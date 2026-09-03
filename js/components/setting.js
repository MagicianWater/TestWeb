// setting - 系统设置面板
var SettingPanel = {
    bossHotKey: "",
    enableEscBackup: true,
    disableTitleOcclusion: false,
    isRecordingHotkey: false,
    tempKey: {ctrl:false, alt:false, shift:false, key:""},
    _keydownBound: false,

    init: function(){
        this.isRecordingHotkey = false;
        this.loadSettings();
        this.renderAll();
        this.renderSideLayout();
        this.renderWidgetManager();
        this.bindEvents();
    },

    loadSettings: function(){
        const save = localStorage.getItem("idleGameSettings");
        if(save){
            const cfg = JSON.parse(save);
            const list = cfg.hotKeyList || [];
            this.bossHotKey = Array.isArray(list) ? (list[0] || "") : "";
            this.enableEscBackup = cfg.enableEscBackup ?? true;
            this.disableTitleOcclusion = cfg.disableTitleOcclusion ?? false;
        }
        const el = document.getElementById("enableEsc");
        if(el) el.checked = this.enableEscBackup;
    },

    saveSettings: function(){
        const el = document.getElementById("enableEsc");
        if(el) this.enableEscBackup = el.checked;
        localStorage.setItem("idleGameSettings", JSON.stringify({
            hotKeyList: this.bossHotKey ? [this.bossHotKey] : [],
            enableEscBackup: this.enableEscBackup,
            disableTitleOcclusion: this.disableTitleOcclusion
        }));
        // 同步到运行时，老板键立即生效
        if(window.reloadSettings) window.reloadSettings();
        console.log("[SettingPanel] 配置已保存");
    },

    renderAll: function(){
        const input = document.getElementById("bossHotkeyInput");
        if(input) input.value = this.bossHotKey;
        this.updateTitleOverlayUI();
    },

    updateTitleOverlayUI: function(){
        const btn = document.getElementById("titleOverlayBtn");
        if(btn) btn.innerText = this.disableTitleOcclusion ? "开启标题遮挡" : "关闭标题遮挡";
    },

    buildCombo: function(t){
        const name = [];
        if(t.ctrl) name.push("Ctrl");
        if(t.alt) name.push("Alt");
        if(t.shift) name.push("Shift");
        if(t.key) name.push(t.key);
        return name.join("+");
    },

    bindEvents: function(){
        const self = this;

        // 文档级录制监听：只绑定一次；每次按键时按当前存在的输入框处理
        if(!this._keydownBound){
            this._keydownBound = true;
            document.addEventListener('keydown', function(e){
                if(!self.isRecordingHotkey) return;
                e.preventDefault();
                const input = document.getElementById("bossHotkeyInput");
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
                self.tempKey.key = e.key.toUpperCase();
                input.value = self.buildCombo(self.tempKey);
            });
        }

        // 每次进入面板重新绑定当前元素（组件内容每次进入都会重建）
        const input = document.getElementById("bossHotkeyInput");
        const titleBtn = document.getElementById("titleOverlayBtn");
        const escEl = document.getElementById("enableEsc");
        const exportBtn = document.getElementById("exportSaveBtn");
        const importBtn = document.getElementById("importSaveBtn");

        // ESC 备用老板键：勾选状态变化即自动保存
        if(escEl){
            escEl.onchange = function(){
                self.saveSettings();
            };
        }

        // 标题遮挡：单按钮左右切换
        if(titleBtn){
            titleBtn.onclick = function(){
                self.disableTitleOcclusion = !self.disableTitleOcclusion;
                self.updateTitleOverlayUI();
                self.saveSettings();
                if(window.applyTitleOverlay) window.applyTitleOverlay(self.disableTitleOcclusion);
            };
        }

        // 老板键：点击输入框自动开始录制
        if(input){
            input.onfocus = function(){
                self.isRecordingHotkey = true;
                self.tempKey = {ctrl:false, alt:false, shift:false, key:""};
                input.value = "";
                input.placeholder = "请按下快捷键组合...";
            };

            // 点击其他位置（失焦）自动结束录制并保存
            input.onblur = function(){
                self.isRecordingHotkey = false;
                if(self.tempKey.key){
                    self.bossHotKey = self.buildCombo(self.tempKey);
                    input.value = self.bossHotKey;
                    self.saveSettings();
                }else{
                    input.value = self.bossHotKey;
                }
                input.placeholder = "点击此处录制老板键";
            };
        }

        // 存档管理：导出 / 载入
        if(exportBtn){
            exportBtn.onclick = function(){
                if(!window.GameSave){ self._showSaveTip('存档模块未加载'); return; }
                const data = GameSave.exportToFile();
                const fileCount = Object.keys(data.files || {}).length;
                self._showSaveTip('存档已导出（已编辑文件 ' + fileCount + ' 个）');
            };
        }
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

        // 弹窗栏挂载设置：下拉变更即时生效
        const cfgBox = document.getElementById('sideLayoutCfg');
        if(cfgBox){
            cfgBox.onchange = function(e){
                const sel = e.target;
                if(sel.tagName !== 'SELECT') return;
                const val = sel.value || null;
                // 去重：若所选工具已挂在别的边，先把那边清空
                if(val){
                    cfgBox.querySelectorAll('select').forEach(function(s){
                        if(s !== sel && s.value === val) s.value = '';
                    });
                }
                // 收集当前所有选择并应用
                const cfg = {};
                cfgBox.querySelectorAll('select').forEach(function(s){
                    cfg[s.dataset.side] = s.value || null;
                });
                if(window.setSideLayout) window.setSideLayout(cfg);
            };
        }
    },

    // 渲染弹窗栏挂载配置下拉框
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

    // 渲染功能与脚本管理列表
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

    _showSaveTip: function(msg){
        const tip = document.getElementById("saveStatusTip");
        if(tip) tip.textContent = msg;
    }
};

//===== 监听挂载系统变更，实时同步设置界面 =====
// mount.js 在布局/浮动窗状态变更后派发 sideLayoutChange / floatStateChange 事件；
// 此处监听并重新渲染，使右键标签挂载等外部操作即时反映到设置界面。
// 面板未打开时 renderSideLayout/renderWidgetManager 会因容器缺失直接返回，无副作用。
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