/*!
 * terminal.js —— 底部终端主入口
 * 动态加载子模块：terminal-fs.js / terminal-keylog.js / terminal-commands.js
 * 依赖：base.js（需在 base.js 之后加载，调用 window.setLogoAnimation）
 * 暴露：window.consoleWebAddLog(text)、window.consoleWebHandleCommand(cmd)
 *
 * @sideWidget 终端 —— 可挂载于四边弹窗栏（上/下/左/右），未挂载时不产生悬浮窗
 *
 * 架构：创建 window.TerminalCore 共享对象，子模块各自挂载功能到其上，
 *       跨模块调用通过 Core.xxx 完成。
 */
(function(){
    'use strict';

    //===== 创建终端核心对象，所有子模块共享此对象 =====
    const Core = window.TerminalCore = {
        // DOM 元素引用
        termOut: document.getElementById('termOut'),
        termScrollbar: document.getElementById('termScrollbar'),
        termInput: document.getElementById('termInput'),
        termPrompt: document.getElementById('termPrompt'),
        termScrollbarTimer: null,
        // 共享状态
        currentUser: 'user',
        HOSTNAME: 'host',
        cwd: [],
        keylogEnabled: false,
        currentKeyLine: null,
        TERM_MAX_LINES: 1000,
        //历史命令
        history: [],
        historyIdx: -1,
        HISTORY_MAX: 10
    };

    //===== 核心输出函数（所有子模块共用） =====
    Core.trimTerminal = function(){
        while(Core.termOut && Core.termOut.children.length > Core.TERM_MAX_LINES){
            Core.termOut.removeChild(Core.termOut.firstChild);
        }
    };

    Core.updateTermScrollbar = function(){
        const termOut = Core.termOut, termScrollbar = Core.termScrollbar;
        if(!termOut || !termScrollbar) return;
        const sh = termOut.scrollHeight, ch = termOut.clientHeight;
        if(sh <= ch + 1){
            termScrollbar.style.display = 'none';
            return;
        }
        termScrollbar.style.display = 'block';
        const ratio = ch / sh;
        const h = Math.max(20, Math.round(ratio * ch));
        const maxTop = ch - h;
        const top = maxTop > 0 ? (termOut.scrollTop / (sh - ch)) * maxTop : 0;
        termScrollbar.style.height = h + 'px';
        termScrollbar.style.top = top + 'px';
        termScrollbar.classList.add('show');
        clearTimeout(Core.termScrollbarTimer);
        Core.termScrollbarTimer = setTimeout(function(){
            termScrollbar.classList.remove('show');
        }, 800);
    };

    //追加一行终端输出（日志/命令各自成行，不会与按键记录混行）
    Core.appendTermLine = function(cls, text){
        const div = document.createElement('div');
        div.className = 'term-line ' + cls;
        div.innerText = text;
        Core.termOut.appendChild(div);
        Core.currentKeyLine = null; // 新行之后按键记录另起一行
        Core.trimTerminal();
        Core.termOut.scrollTop = Core.termOut.scrollHeight;
        Core.updateTermScrollbar();
    };

    Core.addLog = function(text){
        Core.appendTermLine('term-log', '[' + new Date().toLocaleTimeString() + '] ' + text);
    };

    //命令回复：白色文字、无背景色（区别于带背景的系统日志）
    Core.reply = function(text){
        Core.appendTermLine('term-reply', text);
    };

    //===== 动态加载子模块（按依赖顺序链式加载，保证加载完成后再收尾） =====
    function loadScript(src, onLoad, onError){
        const s = document.createElement('script');
        s.src = src;
        s.onload = onLoad;
        s.onerror = onError || function(){
            console.error('终端子模块加载失败: ' + src);
        };
        document.head.appendChild(s);
    }

    const MODULES = [
        './js/core/terminal/terminal-fs.js',
        './js/core/terminal/terminal-keylog.js',
        './js/core/terminal/terminal-commands.js',
        './js/core/terminal/terminal-editor.js'
    ];

    function loadModules(idx, done){
        if(idx >= MODULES.length){ done(); return; }
        loadScript(MODULES[idx] + '?v=20260901', function(){
            loadModules(idx + 1, done);
        });
    }

    //===== 所有子模块加载完成后：绑定输入、暴露钩子、初始化 =====
    loadModules(0, function(){
        //终端滚动时更新迷你滑动指示条
        if(Core.termOut){
            Core.termOut.addEventListener('scroll', Core.updateTermScrollbar);
            Core.updateTermScrollbar();
        }
        //命令输入：回车触发 + ↑↓历史 + Tab补全
        if(Core.termInput){
            Core.termInput.addEventListener('keydown', function(e){
                if(e.key === 'Enter'){
                    e.preventDefault();
                    const cmd = Core.termInput.value.trim();
                    Core.termInput.value = '';
                    if(cmd){
                        //记录历史（去重：与最近一条相同则不重复记录）
                        if(Core.history[Core.history.length - 1] !== cmd){
                            Core.history.push(cmd);
                            if(Core.history.length > Core.HISTORY_MAX){
                                Core.history.shift();
                            }
                        }
                        Core.historyIdx = Core.history.length;
                        Core.handleCommand(cmd);
                    }
                }else if(e.key === 'ArrowUp'){
                    //翻阅上一条历史
                    e.preventDefault();
                    if(Core.history.length === 0) return;
                    if(Core.historyIdx > 0) Core.historyIdx--;
                    Core.termInput.value = Core.history[Core.historyIdx] || '';
                }else if(e.key === 'ArrowDown'){
                    //翻阅下一条历史
                    e.preventDefault();
                    if(Core.history.length === 0) return;
                    if(Core.historyIdx < Core.history.length) Core.historyIdx++;
                    if(Core.historyIdx >= Core.history.length){
                        Core.termInput.value = '';
                    }else{
                        Core.termInput.value = Core.history[Core.historyIdx] || '';
                    }
                }else if(e.key === 'Tab'){
                    //Tab 补全命令
                    e.preventDefault();
                    const val = Core.termInput.value;
                    if(!val) return;
                    const cmds = Core.getCommandList ? Core.getCommandList() : [];
                    //匹配以当前输入开头的命令
                    const matches = cmds.filter(function(c){ return c.indexOf(val) === 0; });
                    if(matches.length === 1){
                        //唯一匹配：直接补全
                        Core.termInput.value = matches[0] + ' ';
                    }else if(matches.length > 1){
                        //多个匹配：补全公共前缀，并提示所有候选
                        let prefix = matches[0];
                        for(let i = 1; i < matches.length; i++){
                            while(matches[i].indexOf(prefix) !== 0 && prefix.length > 0){
                                prefix = prefix.slice(0, -1);
                            }
                        }
                        if(prefix.length > val.length){
                            Core.termInput.value = prefix;
                        }
                        Core.reply('补全候选：' + matches.join('  '));
                    }
                }
            });
        }
        //暴露宿主钩子给 base.js / scriptTool.js 使用
        window.consoleWebAddLog = Core.addLog;
        window.consoleWebHandleCommand = Core.handleCommand;
        //初始化：从 localStorage 恢复存档（由 GameSave 统一管理），再更新提示符
        if(window.GameSave) GameSave.restoreFromStorage();
        Core.updatePrompt();
        Core.addLog("系统初始化成功，后台任务开始运行");
    });
})();