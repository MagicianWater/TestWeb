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
    }
};
