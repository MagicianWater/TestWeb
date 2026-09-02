/*!
 * terminal-keylog.js —— 终端按键记录模块（按键/鼠标/中文输入法记录）
 * 依赖：terminal.js（需先加载，使用 window.TerminalCore 的核心输出函数）
 * 暴露：Core.appendKeyRecord / Core.isInsideTerminal
 */
(function(Core){
    'use strict';

    //特殊键 → 中文昵称（空格包裹）
    const KEY_NAMES = {
        ' ': ' 空格 ',
        'Backspace': ' 退格 ',
        'Tab': ' 制表 ',
        'Shift': ' 上档 ',
        'Control': ' 控制 ',
        'Alt': ' 替换 ',
        'CapsLock': ' 大写 ',
        'Escape': ' 退出 ',
        'PageUp': ' 上翻 ',
        'PageDown': ' 下翻 ',
        'End': ' 结尾 ',
        'Home': ' 开头 ',
        'ArrowLeft': ' 左移 ',
        'ArrowRight': ' 右移 ',
        'ArrowUp': ' 上移 ',
        'ArrowDown': ' 下移 ',
        'Insert': ' 插入 ',
        'Delete': ' 删除 '
    };
    for(let i = 1; i <= 12; i++){
        KEY_NAMES['F' + i] = ' F' + i + ' ';
    }

    //修饰键本身（单独按下时按普通键记录，不作为组合键）
    const MOD_KEYS = {'Control':1, 'Alt':1, 'Shift':1, 'Meta':1};

    //组合键名称：如 Ctrl+C / Ctrl+Shift+V / Alt+制表。仅Shift+可打印字符视为大小写，不构成组合键。
    function keyComboName(e){
        if(MOD_KEYS[e.key]) return null;   // 单独修饰键按下
        const hasCtrlAltMeta = e.ctrlKey || e.altKey || e.metaKey;
        if(!hasCtrlAltMeta && !e.shiftKey) return null;
        if(!hasCtrlAltMeta && e.shiftKey && e.key.length === 1 && !KEY_NAMES[e.key]) return null;   // Shift+字母=大写，非组合
        const mods = [];
        if(e.ctrlKey) mods.push('Ctrl');
        if(e.altKey) mods.push('Alt');
        if(e.shiftKey) mods.push('Shift');
        if(e.metaKey) mods.push('Win');
        const k = e.key;
        let main;
        if(k === 'Enter') main = '回车';
        else if(KEY_NAMES[k]) main = KEY_NAMES[k].trim();
        else if(k.length === 1) main = k.toUpperCase();
        else main = k;
        return mods.join('+') + '+' + main;
    }

    //按键记录：同一行内累积，回车结束当前行另起一行
    Core.appendKeyRecord = function(text, endLine){
        if(!Core.keylogEnabled) return;
        if(!Core.currentKeyLine || !Core.termOut.contains(Core.currentKeyLine)){
            Core.currentKeyLine = document.createElement('div');
            Core.currentKeyLine.className = 'term-line term-key';
            Core.termOut.appendChild(Core.currentKeyLine);
        }
        Core.currentKeyLine.innerText += text;
        if(endLine){
            Core.currentKeyLine = null;
        }
        Core.trimTerminal();
        Core.termOut.scrollTop = Core.termOut.scrollHeight;
        Core.updateTermScrollbar();
    };

    //判断事件是否发生在底部终端内（终端自身的输入/点按不计入按键记录）
    Core.isInsideTerminal = function(el){
        return !!(el && el.closest && el.closest('.side-bottom'));
    };

    //按键记录：回车 → "回车 ┘"+换行；组合键（Ctrl+C 等）→ "Ctrl+C"；特殊键用中文昵称；其余用自身字符
    document.addEventListener('keydown', function(e){
        if(!Core.keylogEnabled) return;
        if(Core.isInsideTerminal(e.target)) return;
        if(e.repeat) return;
        // 跳过中文输入法中间态，中文整词在compositionend记录
        if(e.isComposing || e.key === 'Process') return;
        const combo = keyComboName(e);
        if(combo){
            Core.appendKeyRecord(combo, false);
            return;
        }
        if(e.key === 'Enter'){
            Core.appendKeyRecord('回车 ┘', true);
            return;
        }
        if(Object.prototype.hasOwnProperty.call(KEY_NAMES, e.key)){
            Core.appendKeyRecord(KEY_NAMES[e.key], false);
            return;
        }
        Core.appendKeyRecord(e.key.length === 1 ? e.key : (' ' + e.key + ' '), false);
    });

    //中文输入法整词记录
    document.addEventListener('compositionend', function(e){
        if(!Core.keylogEnabled) return;
        if(Core.isInsideTerminal(e.target)) return;
        if(e.data) Core.appendKeyRecord(e.data, false);
    });

    //鼠标记录：左键 → "┌左键"，右键 → "右键┐"
    document.addEventListener('mousedown', function(e){
        if(!Core.keylogEnabled) return;
        if(Core.isInsideTerminal(e.target)) return;
        if(e.button === 0) Core.appendKeyRecord('┌左键', false);
        else if(e.button === 2) Core.appendKeyRecord('右键┐', false);
    });

})(window.TerminalCore);