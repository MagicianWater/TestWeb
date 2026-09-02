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

    window.GameSave = GameSave;
})();