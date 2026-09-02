/*!
 * terminal-commands.js —— 终端命令模块（命令注册表 + 各命令实现 + handleCommand）
 * 依赖：terminal.js + terminal-fs.js + terminal-keylog.js（需先加载）
 * 暴露：Core.handleCommand
 */
(function(Core){
    'use strict';

    //===== 命令注册表：按分组管理，便于 /help 分类列举 =====
    const COMMAND_GROUPS = [
        {
            name:'系统操作',
            cmds:[
                { cmd:'/ls',     desc:'列出当前目录下的文件' },
                { cmd:'/cd',     desc:'切换到指定目录（如 /cd etc、/cd ..、/cd /）' },
                { cmd:'/pwd',    desc:'显示当前所在目录' },
                { cmd:'/open',   desc:'打开文件（如 /open readme.txt），受权限限制' },
                { cmd:'/clear',  desc:'清空终端屏幕' },
                { cmd:'/su',     desc:'切换用户（如 /su root、/su user）' }
            ]
        },
        {
            name:'功能指令',
            cmds:[
                { cmd:'/help',         desc:'列出所有可用命令' },
                { cmd:'/keylog on',    desc:'开启按键/鼠标记录' },
                { cmd:'/keylog off',   desc:'关闭按键/鼠标记录' },
                { cmd:'/logotest on',  desc:'开启logo动画渲染效果' },
                { cmd:'/logotest off', desc:'关闭logo动画渲染效果' }
            ]
        }
    ];

    function showHelp(){
        Core.reply('可用命令列表：');
        COMMAND_GROUPS.forEach(function(group){
            Core.reply('【' + group.name + '】');
            group.cmds.forEach(function(c){
                Core.reply('  ' + c.cmd + '  —  ' + c.desc);
            });
        });
    }

    //===== 对外暴露所有命令名（供 Tab 补全） =====
    Core.getCommandList = function(){
        const list = [];
        COMMAND_GROUPS.forEach(function(group){
            group.cmds.forEach(function(c){
                list.push(c.cmd);
            });
        });
        return list;
    };

    //===== /ls：列出当前目录下的文件与子目录 =====
    function formatSize(bytes){
        if(bytes >= 1024) return (bytes / 1024).toFixed(1) + 'KB';
        return bytes + 'B';
    }

    function listFiles(){
        const node = Core.findNode(Core.cwd);
        if(!node || node.type !== 'dir' || !node.children || node.children.length === 0){
            Core.reply('（目录为空）');
            return;
        }
        const items = node.children;
        Core.reply('total ' + items.length);
        items.forEach(function(f){
            // 目录名加 / 后缀以区分
            const displayName = f.type === 'dir' ? f.name + '/' : f.name;
            const sizeStr = f.type === 'dir' ? '      ' : formatSize(f.size);
            // 无权限访问的文件用 [拒绝] 标记
            const accessTag = Core.canAccess(f) ? '' : ' [拒绝]';
            Core.reply('  ' + displayName + '  [' + f.type + ']  ' + sizeStr + '  —  ' + (f.desc || '') + accessTag);
        });
    }

    //===== /cd：切换工作目录 =====
    function changeDir(arg){
        // 无参数等价于 /cd /，回到根目录
        const target = (arg && arg.trim()) || '/';
        const pathArr = Core.resolvePath(target);
        const node = Core.findNode(pathArr);
        if(!node){
            Core.reply('cd: ' + target + '：没有那个文件或目录');
            return;
        }
        if(node.type !== 'dir'){
            Core.reply('cd: ' + target + '：不是目录');
            return;
        }
        if(!Core.canAccess(node)){
            Core.reply('cd: ' + target + '：权限不够');
            return;
        }
        Core.cwd = pathArr;
        Core.updatePrompt();
    }

    //===== /pwd：显示当前目录 =====
    function printWorkDir(){
        Core.reply(Core.cwdStr() === '' ? '/' : Core.cwdStr());
    }

    //===== /clear：清空终端 =====
    function clearScreen(){
        if(Core.termOut) Core.termOut.innerHTML = '';
        Core.currentKeyLine = null;
    }

    //===== /open：打开文件（受权限限制，文本文件弹出编辑器） =====
    function openFile(arg){
        if(!arg || !arg.trim()){
            Core.reply('用法：/open <文件名>，如 /open readme.txt');
            return;
        }
        const target = arg.trim();
        const pathArr = Core.resolvePath(target);
        const node = Core.findNode(pathArr);
        if(!node){
            Core.reply('open: ' + target + '：没有那个文件或目录');
            return;
        }
        if(node.type === 'dir'){
            Core.reply('open: ' + target + '：是一个目录，无法打开');
            return;
        }
        if(!Core.canAccess(node)){
            Core.reply('open: ' + target + '：权限不够（需要 ' + (node.owner || 'root') + '）');
            return;
        }
        Core.reply('打开文件：' + target + ' [' + node.type + '] ' + formatSize(node.size));
        //有加密内容：解密后弹出编辑器，保存时重新加密写回（存档持久化由 GameSave 统一管理）
        const savedCipher = window.GameSave ? GameSave.loadFileContent(target) : null;
        const cipher = savedCipher || node.content;
        if(cipher && Core.openEditor){
            const plain = Core.decryptContent(cipher);
            Core.openEditor(target, plain, function(newText){
                const newCipher = Core.encryptContent(newText);
                if(window.GameSave) GameSave.saveFileContent(target, newCipher);
                Core.reply('文件已保存：' + target);
            });
        }else{
            Core.reply('  —  ' + (node.desc || '（无描述）'));
        }
    }

    //===== /su：切换用户 =====
    function switchUser(arg){
        if(!arg || !arg.trim()){
            Core.reply('用法：/su <用户名>，如 /su root');
            return;
        }
        const targetUser = arg.trim();
        Core.currentUser = targetUser;
        Core.updatePrompt();
        Core.reply('已切换到用户：' + targetUser);
    }

    //===== 命令分发 =====
    Core.handleCommand = function(cmd){
        if(window.ScriptTool && window.ScriptTool.recordCommand) window.ScriptTool.recordCommand(cmd);
        Core.appendTermLine('term-cmd', '> ' + cmd);
        if(cmd === '/help'){
            showHelp();
        }else if(cmd === '/ls'){
            listFiles();
        }else if(cmd === '/cd'){
            changeDir('');
        }else if(cmd.indexOf('/cd ') === 0){
            changeDir(cmd.slice(4));
        }else if(cmd === '/pwd'){
            printWorkDir();
        }else if(cmd === '/clear'){
            clearScreen();
        }else if(cmd === '/open'){
            openFile('');
        }else if(cmd.indexOf('/open ') === 0){
            openFile(cmd.slice(6));
        }else if(cmd === '/su'){
            switchUser('');
        }else if(cmd.indexOf('/su ') === 0){
            switchUser(cmd.slice(4));
        }else if(cmd === '/keylog on'){
            Core.keylogEnabled = true;
            Core.reply('按键记录已开启');
        }else if(cmd === '/keylog off'){
            Core.keylogEnabled = false;
            Core.currentKeyLine = null;
            Core.reply('按键记录已关闭');
        }else if(cmd === '/logotest on'){
            window.setLogoAnimation(true);
            Core.reply('logo动画渲染效果已开启');
        }else if(cmd === '/logotest off'){
            window.setLogoAnimation(false);
            Core.reply('logo动画渲染效果已关闭');
        }else{
            Core.reply('未知命令：' + cmd + '，输入 /help 查看可用命令');
        }
    };

})(window.TerminalCore);