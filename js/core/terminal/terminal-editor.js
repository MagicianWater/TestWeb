/*!
 * terminal-editor.js —— 记事本弹窗编辑器模块
 * 依赖：terminal.js（使用 window.TerminalCore）
 * 暴露：Core.openEditor(filename, content, onSave)
 *
 * 说明：/open 打开文本文件时弹出此编辑器，可编辑、可保存。
 *       保存时通过回调将明文传回调用方加密存储，本模块不涉及密文。
 */
(function(Core){
    'use strict';

    //===== 注入样式 =====
    const style = document.createElement('style');
    style.textContent = [
        '.term-editor-overlay{',
        '  position:fixed; inset:0; background:rgba(0,0,0,0.55);',
        '  display:none; z-index:9999;',
        '  align-items:center; justify-content:center;',
        '}',
        '.term-editor-overlay.show{ display:flex; }',
        '.term-editor{',
        '  width:580px; max-width:92vw; height:440px; max-height:82vh;',
        '  background:#1e293b; border:1px solid #475569; border-radius:6px;',
        '  display:flex; flex-direction:column; overflow:hidden;',
        '  box-shadow:0 12px 40px rgba(0,0,0,0.5);',
        '}',
        '.term-editor-head{',
        '  display:flex; align-items:center; justify-content:space-between;',
        '  padding:8px 12px; background:#0f172a; border-bottom:1px solid #334155;',
        '  cursor:move; user-select:none;',
        '}',
        '.term-editor-title{ color:#e2e8f0; font-size:13px; }',
        '.term-editor-close{',
        '  color:#94a3b8; cursor:pointer; font-size:18px; line-height:1;',
        '  background:none; border:none; padding:0 4px;',
        '}',
        '.term-editor-close:hover{ color:#f87171; }',
        '.term-editor-body{ flex:1; overflow:hidden; }',
        '.term-editor-text{',
        '  width:100%; height:100%; box-sizing:border-box;',
        '  background:#0f172a; color:#e2e8f0; border:none; outline:none;',
        '  padding:10px 12px; font-family:Consolas,"Courier New",monospace; font-size:13px;',
        '  resize:none; line-height:1.6; white-space:pre; overflow:auto;',
        '}',
        '.term-editor-foot{',
        '  display:flex; justify-content:flex-end; gap:8px;',
        '  padding:8px 12px; background:#0f172a; border-top:1px solid #334155;',
        '}',
        '.term-editor-btn{',
        '  padding:5px 18px; font-size:13px; border-radius:4px; cursor:pointer;',
        '  border:1px solid #475569; background:#334155; color:#e2e8f0;',
        '}',
        '.term-editor-btn:hover{ background:#475569; }',
        '.term-editor-btn.primary{ background:#2563eb; border-color:#2563eb; color:#fff; }',
        '.term-editor-btn.primary:hover{ background:#1d4ed8; }'
    ].join('\n');
    document.head.appendChild(style);

    //===== 创建弹窗 DOM =====
    const overlay = document.createElement('div');
    overlay.className = 'term-editor-overlay';
    overlay.innerHTML = [
        '<div class="term-editor">',
        '  <div class="term-editor-head">',
        '    <span class="term-editor-title">未命名</span>',
        '    <button class="term-editor-close" title="关闭">&times;</button>',
        '  </div>',
        '  <div class="term-editor-body">',
        '    <textarea class="term-editor-text" spellcheck="false"></textarea>',
        '  </div>',
        '  <div class="term-editor-foot">',
        '    <button class="term-editor-btn" data-act="cancel">取消</button>',
        '    <button class="term-editor-btn primary" data-act="save">保存</button>',
        '  </div>',
        '</div>'
    ].join('');
    document.body.appendChild(overlay);

    const editorEl = overlay.querySelector('.term-editor');
    const titleEl = overlay.querySelector('.term-editor-title');
    const textEl = overlay.querySelector('.term-editor-text');
    const closeBtn = overlay.querySelector('.term-editor-close');
    const cancelBtn = overlay.querySelector('[data-act="cancel"]');
    const saveBtn = overlay.querySelector('[data-act="save"]');
    const headEl = overlay.querySelector('.term-editor-head');

    let onSaveCallback = null;

    function closeEditor(){
        overlay.classList.remove('show');
        onSaveCallback = null;
    }

    //保存：调用回调传回编辑后内容
    saveBtn.addEventListener('click', function(){
        if(onSaveCallback) onSaveCallback(textEl.value);
        closeEditor();
    });
    cancelBtn.addEventListener('click', closeEditor);
    closeBtn.addEventListener('click', closeEditor);
    //点击遮罩空白处关闭
    overlay.addEventListener('mousedown', function(e){
        if(e.target === overlay) closeEditor();
    });
    //ESC 关闭
    document.addEventListener('keydown', function(e){
        if(!overlay.classList.contains('show')) return;
        if(e.key === 'Escape') closeEditor();
    });

    //===== 拖动弹窗 =====
    let dragging = false, offX = 0, offY = 0;
    headEl.addEventListener('mousedown', function(e){
        dragging = true;
        const rect = editorEl.getBoundingClientRect();
        offX = e.clientX - rect.left;
        offY = e.clientY - rect.top;
        e.preventDefault();
    });
    document.addEventListener('mousemove', function(e){
        if(!dragging) return;
        editorEl.style.position = 'fixed';
        editorEl.style.left = (e.clientX - offX) + 'px';
        editorEl.style.top = (e.clientY - offY) + 'px';
        editorEl.style.margin = '0';
    });
    document.addEventListener('mouseup', function(){ dragging = false; });

    //===== 对外接口：打开编辑器 =====
    // filename: 标题显示的文件名
    // content:  初始文本内容（明文）
    // onSave:   保存回调，参数为编辑后的明文
    Core.openEditor = function(filename, content, onSave){
        titleEl.textContent = filename || '未命名';
        textEl.value = content || '';
        onSaveCallback = onSave || null;
        //重置弹窗位置到居中
        editorEl.style.position = '';
        editorEl.style.left = '';
        editorEl.style.top = '';
        editorEl.style.margin = '';
        overlay.classList.add('show');
        textEl.focus();
    };

})(window.TerminalCore);