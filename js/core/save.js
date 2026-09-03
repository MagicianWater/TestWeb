/*!
 * save.js —— 游戏存档系统（独立通用模块）
 * 不依赖终端，供所有功能模块使用（终端文件编辑、设置面板等）
 * 暴露：window.GameSave
 *
 * 持久化策略：
 *   1. localStorage 自动缓存（刷新页面后恢复）
 *   2. 导出 JSON 文件（清浏览器数据后的最终保障）
 */
(function(){
    'use strict';

    const LS_KEY = 'consoleWeb_save_v1';
    const SAVE_VERSION = 1;

    //===== 内存中的编辑覆盖表：{ 文件名: 密文 } =====
    let editedFiles = {};
    //===== 存档元数据：当前用户、当前目录等（由各模块注册写入） =====
    let metaData = {};

    //===== 注册元数据字段：各功能模块可注册自己的可持久化状态 =====
    // 例如终端注册 { user:'user', cwd:[] }，设置面板注册自己的配置
    const registeredGetters = {};   // key → function() 返回当前值
    const registeredSetters = {};    // key → function(value) 应用值

    const GameSave = {
        //===== 注册可持久化字段 =====
        // key: 字段名（如 'user'、'cwd'）
        // getter: function() 返回当前值
        // setter: function(value) 应用存档值
        register: function(key, getter, setter){
            registeredGetters[key] = getter;
            registeredSetters[key] = setter;
        },

        //===== 保存单个文件内容（密文）到内存 + localStorage =====
        saveFileContent: function(name, cipher){
            editedFiles[name] = cipher;
            this._flushToStorage();
        },

        //===== 读取单个文件内容密文（无则返回 null） =====
        loadFileContent: function(name){
            return Object.prototype.hasOwnProperty.call(editedFiles, name) ? editedFiles[name] : null;
        },

        //===== 获取所有已编辑文件（深拷贝） =====
        getEditedFiles: function(){
            return JSON.parse(JSON.stringify(editedFiles));
        },

        //===== 收集当前完整存档数据 =====
        collectSaveData: function(){
            const data = {
                version: SAVE_VERSION,
                exportTime: new Date().toISOString(),
                files: this.getEditedFiles()
            };
            //收集所有注册的元数据
            Object.keys(registeredGetters).forEach(function(key){
                try{
                    data[key] = registeredGetters[key]();
                }catch(e){}
            });
            return data;
        },

        //===== 应用存档数据 =====
        applySaveData: function(data){
            if(!data || data.version !== SAVE_VERSION) return false;
            try{
                editedFiles = data.files ? JSON.parse(JSON.stringify(data.files)) : {};
                //应用所有注册的元数据
                Object.keys(registeredSetters).forEach(function(key){
                    if(data[key] !== undefined){
                        try{ registeredSetters[key](data[key]); }catch(e){}
                    }
                });
                this._flushToStorage();
                return true;
            }catch(e){
                return false;
            }
        },

        //===== 导出存档为 JSON 文件并触发下载 =====
        exportToFile: function(){
            const data = this.collectSaveData();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], {type:'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'consoleWeb_save_' + new Date().toISOString().slice(0,10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return data;
        },

        //===== 从用户选择的 JSON 文件载入存档 =====
        // onDone(success, data): 载入完成回调
        importFromFile: function(onDone){
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', function(e){
                const file = e.target.files && e.target.files[0];
                if(!file){
                    document.body.removeChild(input);
                    if(onDone) onDone(false, null, '未选择文件');
                    return;
                }
                const reader = new FileReader();
                reader.onload = function(ev){
                    try{
                        const data = JSON.parse(ev.target.result);
                        if(GameSave.applySaveData(data)){
                            if(onDone) onDone(true, data, null);
                        }else{
                            if(onDone) onDone(false, null, '文件格式不正确或版本不兼容');
                        }
                    }catch(err){
                        if(onDone) onDone(false, null, '无法解析文件');
                    }
                    document.body.removeChild(input);
                };
                reader.onerror = function(){
                    if(onDone) onDone(false, null, '读取文件出错');
                    document.body.removeChild(input);
                };
                reader.readAsText(file);
            });
            input.click();
        },

        //===== 写入 localStorage（内部） =====
        _flushToStorage: function(){
            try{
                const data = this.collectSaveData();
                localStorage.setItem(LS_KEY, JSON.stringify(data));
            }catch(e){
                //localStorage 不可用时静默降级
            }
        },

        //===== 从 localStorage 恢复（启动时调用） =====
        restoreFromStorage: function(){
            try{
                const raw = localStorage.getItem(LS_KEY);
                if(!raw) return;
                const data = JSON.parse(raw);
                if(data && data.version === SAVE_VERSION){
                    this.applySaveData(data);
                }
            }catch(e){
                //存档损坏时静默忽略
            }
        }
    };

    //===== 自动存盘管理器（可配置周期 30s~5min，倒计时显示 + 存盘弹窗） =====
    const AUTOSAVE_LS_KEY = 'consoleWeb_autosave_interval';
    const MIN_INTERVAL = 30;          // 最小 30 秒
    const MAX_INTERVAL = 300;         // 最大 5 分钟
    const DEFAULT_INTERVAL = 30;

    let autoSaveInterval = DEFAULT_INTERVAL;
    let autoSaveCountdown = autoSaveInterval;
    let autoSaveTimer = null;
    let countdownEl = null;
    let toastEl = null;
    let toastHideTimer = null;

    function clampInterval(v){
        v = Math.floor(Number(v));
        if(isNaN(v)) return DEFAULT_INTERVAL;
        if(v < MIN_INTERVAL) return MIN_INTERVAL;
        if(v > MAX_INTERVAL) return MAX_INTERVAL;
        return v;
    }
    function loadIntervalSetting(){
        try{
            const v = parseInt(localStorage.getItem(AUTOSAVE_LS_KEY), 10);
            if(!isNaN(v)) autoSaveInterval = clampInterval(v);
        }catch(e){}
    }
    function saveIntervalSetting(){
        try{ localStorage.setItem(AUTOSAVE_LS_KEY, String(autoSaveInterval)); }catch(e){}
    }

    //创建倒计时与弹窗 DOM（动态注入，避免污染 index.html）
    function ensureUI(){
        if(!countdownEl){
            countdownEl = document.createElement('div');
            countdownEl.id = 'saveCountdown';
            countdownEl.textContent = String(autoSaveCountdown);
            document.body.appendChild(countdownEl);
        }
        if(!toastEl){
            toastEl = document.createElement('div');
            toastEl.id = 'saveToast';
            toastEl.textContent = '存档已保存';
            document.body.appendChild(toastEl);
        }
    }
    function updateCountdownDisplay(){
        if(countdownEl) countdownEl.textContent = String(Math.max(0, autoSaveCountdown));
    }
    function showToast(){
        if(!toastEl) return;
        toastEl.classList.add('show');
        if(toastHideTimer) clearTimeout(toastHideTimer);
        toastHideTimer = setTimeout(function(){
            toastEl.classList.remove('show');
        }, 1500);
    }
    function doSave(reason){
        try{
            GameSave._flushToStorage();
            showToast();
            if(typeof window.addLog === 'function') window.addLog('存档已自动保存');
        }catch(e){}
    }
    function tick(){
        autoSaveCountdown--;
        if(autoSaveCountdown <= 0){
            doSave('定时');
            autoSaveCountdown = autoSaveInterval;
        }
        updateCountdownDisplay();
    }

    GameSave.AutoSave = {
        //启动自动存盘（恢复设置 → 创建 UI → 启动定时器）
        start: function(){
            loadIntervalSetting();
            autoSaveCountdown = autoSaveInterval;
            ensureUI();
            updateCountdownDisplay();
            if(autoSaveTimer) clearInterval(autoSaveTimer);
            autoSaveTimer = setInterval(tick, 1000);
            document.addEventListener('visibilitychange', function(){
                if(document.visibilityState === 'hidden'){
                    doSave('离开页面');
                    autoSaveCountdown = autoSaveInterval;
                    updateCountdownDisplay();
                }
            });
        },
        //设置存盘周期（秒），自动钳制到 [30, 300] 并持久化
        setInterval: function(seconds){
            autoSaveInterval = clampInterval(seconds);
            saveIntervalSetting();
            autoSaveCountdown = autoSaveInterval;
            updateCountdownDisplay();
        },
        getInterval: function(){ return autoSaveInterval; },
        getMinInterval: function(){ return MIN_INTERVAL; },
        getMaxInterval: function(){ return MAX_INTERVAL; },
        //立即存盘一次（手动触发）
        saveNow: function(){
            doSave('手动');
            autoSaveCountdown = autoSaveInterval;
            updateCountdownDisplay();
        }
    };

    window.GameSave = GameSave;
})();