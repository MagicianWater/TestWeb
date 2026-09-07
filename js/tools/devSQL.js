/*!
 * devSQL.js —— 开发者数据库查询工具（临时调试用，后期不纳入正式项目）
 *
 * @sideWidget dev-SQL —— 可挂载于四边弹窗栏
 *
 * 功能：通过 Supabase query builder 查询表数据（受 RLS 限制）
 *   - 预设表快捷按钮
 *   - 表名 / 列 / limit / 简单 eq 过滤
 *   - 结果表格展示 + 行数 / 耗时
 *
 * 依赖：supabase.js（window.SupabaseClient）
 * 挂载点：#devSQLRoot
 */
(function(){
    'use strict';

    // ===== 注入自包含样式 =====
    (function injectStyle(){
        if(document.getElementById('ds-style')) return;
        var st = document.createElement('style');
        st.id = 'ds-style';
        st.textContent = [
            '#devSQLRoot{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;font-size:13px;color:#e2e8f0;font-family:inherit;}',
            '#devSQLRoot *{box-sizing:border-box;}',
            '#devSQLRoot .ds-head{display:flex;align-items:center;gap:6px;margin-bottom:8px;flex:none;}',
            '#devSQLRoot .ds-title{margin:0;flex:1;font-size:15px;color:#a78bfa;font-weight:600;}',
            '#devSQLRoot .ds-tag{font-size:10px;color:#f59e0b;border:1px solid #f59e0b;padding:1px 6px;border-radius:8px;flex:none;}',
            '#devSQLRoot .ds-presets{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;flex:none;}',
            '#devSQLRoot .ds-preset{padding:3px 10px;font-size:12px;color:#c4b5fd;background:#1e1b4b;border:1px solid #4c1d95;border-radius:3px;cursor:pointer;}',
            '#devSQLRoot .ds-preset:hover{background:#312e81;}',
            '#devSQLRoot .ds-form{display:flex;flex-direction:column;gap:6px;margin-bottom:8px;flex:none;}',
            '#devSQLRoot .ds-row{display:flex;gap:6px;align-items:center;}',
            '#devSQLRoot .ds-row label{flex:none;width:54px;font-size:12px;color:#94a3b8;}',
            '#devSQLRoot .ds-row input{flex:1;min-width:0;padding:5px 8px;font-size:13px;color:#e2e8f0;background:#1e293b;border:1px solid #475569;border-radius:4px;outline:none;}',
            '#devSQLRoot .ds-row input:focus{border-color:#a78bfa;}',
            '#devSQLRoot .ds-row input.ds-limit{flex:0 0 80px;}',
            '#devSQLRoot .ds-actions{display:flex;gap:6px;margin-bottom:6px;flex:none;}',
            '#devSQLRoot .ds-btn{padding:6px 16px;font-size:13px;border:none;border-radius:4px;cursor:pointer;color:#fff;background:#7c3aed;}',
            '#devSQLRoot .ds-btn:hover{background:#6d28d9;}',
            '#devSQLRoot .ds-btn:active{transform:translateY(1px);}',
            '#devSQLRoot .ds-btn.ds-secondary{color:#e2e8f0;background:#334155;border:1px solid #475569;}',
            '#devSQLRoot .ds-btn.ds-secondary:hover{background:#475569;}',
            '#devSQLRoot .ds-status{font-size:12px;color:#94a3b8;padding:4px 0;min-height:18px;flex:none;}',
            '#devSQLRoot .ds-status.ds-ok{color:#6ee7b7;}',
            '#devSQLRoot .ds-status.ds-err{color:#fca5a5;}',
            '#devSQLRoot .ds-result{flex:1;min-height:0;overflow:auto;border:1px solid #334155;border-radius:4px;background:#0f172a;}',
            '#devSQLRoot .ds-table{width:100%;border-collapse:collapse;font-size:12px;}',
            '#devSQLRoot .ds-table th{position:sticky;top:0;background:#1e293b;color:#a78bfa;padding:6px 8px;text-align:left;border-bottom:1px solid #475569;white-space:nowrap;z-index:1;}',
            '#devSQLRoot .ds-table td{padding:5px 8px;color:#e2e8f0;border-bottom:1px solid #1e293b;vertical-align:top;word-break:break-all;}',
            '#devSQLRoot .ds-table tr:hover td{background:#1e293b;}',
            '#devSQLRoot .ds-empty{padding:20px;text-align:center;color:#64748b;font-size:12px;}',
            '#devSQLRoot .ds-cell-null{color:#64748b;font-style:italic;}',
            '#devSQLRoot .ds-cell-obj{color:#22d3ee;font-family:monospace;white-space:pre-wrap;max-width:300px;}',
            // 弹窗栏标签状态：紫色强调（由 setSideTabState('devSQL','accent') 触发）
            '.side-tab.tab-accent{color:#c4b5fd !important;border-color:#8b5cf6 !important;background:rgba(139,92,246,.18);}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(st);
    })();

    // ===== 预设表 =====
    var PRESET_TABLES = ['profiles'];

    // ===== 构建界面 =====
    function buildUI(root){
        root.innerHTML = '';

        var head = document.createElement('div');
        head.className = 'ds-head';
        var title = document.createElement('h3');
        title.className = 'ds-title';
        title.textContent = 'dev-SQL';
        var tag = document.createElement('span');
        tag.className = 'ds-tag';
        tag.textContent = '调试';
        head.appendChild(title);
        head.appendChild(tag);
        root.appendChild(head);

        // 预设表
        var presets = document.createElement('div');
        presets.className = 'ds-presets';
        PRESET_TABLES.forEach(function(t){
            var btn = document.createElement('button');
            btn.className = 'ds-preset';
            btn.textContent = t;
            btn.onclick = function(){
                var el = document.getElementById('dsTable');
                if(el){ el.value = t; execute(); }
            };
            presets.appendChild(btn);
        });
        root.appendChild(presets);

        // 表单
        var form = document.createElement('div');
        form.className = 'ds-form';

        var rowTable = makeRow('表名', 'dsTable', 'profiles');
        form.appendChild(rowTable.wrap);

        var rowCols = makeRow('列', 'dsCols', '*');
        form.appendChild(rowCols.wrap);

        var rowLimit = makeRow('limit', 'dsLimit', '100', 'ds-limit');
        form.appendChild(rowLimit.wrap);

        var rowFilter = makeRow('过滤', 'dsFilter', '');
        rowFilter.input.placeholder = 'key=value,多个用逗号';
        form.appendChild(rowFilter.wrap);

        root.appendChild(form);

        // 操作按钮
        var actions = document.createElement('div');
        actions.className = 'ds-actions';
        var runBtn = document.createElement('button');
        runBtn.className = 'ds-btn';
        runBtn.textContent = '执行查询';
        runBtn.onclick = execute;
        var clearBtn = document.createElement('button');
        clearBtn.className = 'ds-btn ds-secondary';
        clearBtn.textContent = '清空';
        clearBtn.onclick = function(){
            var r = document.getElementById('dsResult');
            if(r) r.innerHTML = '<div class="ds-empty">已清空</div>';
            var s = document.getElementById('dsStatus');
            if(s){ s.textContent = ''; s.className = 'ds-status'; }
        };
        actions.appendChild(runBtn);
        actions.appendChild(clearBtn);
        root.appendChild(actions);

        // 状态栏
        var status = document.createElement('div');
        status.className = 'ds-status';
        status.id = 'dsStatus';
        root.appendChild(status);

        // 结果区
        var result = document.createElement('div');
        result.className = 'ds-result';
        result.id = 'dsResult';
        result.innerHTML = '<div class="ds-empty">点击「执行查询」查看数据</div>';
        root.appendChild(result);

        // 回车执行
        [rowTable.input, rowCols.input, rowLimit.input, rowFilter.input].forEach(function(el){
            el.addEventListener('keydown', function(e){
                if(e.key === 'Enter'){ e.preventDefault(); execute(); }
            });
        });
    }

    function makeRow(label, id, value, inputClass){
        var wrap = document.createElement('div');
        wrap.className = 'ds-row';
        var lab = document.createElement('label');
        lab.textContent = label;
        var input = document.createElement('input');
        input.type = 'text';
        input.id = id;
        input.value = value;
        if(inputClass) input.classList.add(inputClass);
        wrap.appendChild(lab);
        wrap.appendChild(input);
        return { wrap: wrap, input: input };
    }

    // ===== 执行查询 =====
    async function execute(){
        var table = (document.getElementById('dsTable').value || '').trim();
        var columns = (document.getElementById('dsCols').value || '').trim() || '*';
        var limitVal = parseInt(document.getElementById('dsLimit').value, 10);
        var filterText = (document.getElementById('dsFilter').value || '').trim();

        var status = document.getElementById('dsStatus');
        var result = document.getElementById('dsResult');

        if(!table){
            setStatus(status, '请输入表名', true);
            return;
        }
        if(isNaN(limitVal) || limitVal < 1) limitVal = 100;
        if(limitVal > 1000) limitVal = 1000;

        if(!window.SupabaseClient || !SupabaseClient.ready()){
            setStatus(status, 'Supabase 客户端未就绪', true);
            return;
        }

        var sb = SupabaseClient.get();
        var query = sb.from(table).select(columns).limit(limitVal);

        // 解析简单 eq 过滤：key=value,key2=value2
        if(filterText){
            var filters = filterText.split(',');
            for(var i = 0; i < filters.length; i++){
                var pair = filters[i].trim();
                if(!pair) continue;
                var idx = pair.indexOf('=');
                if(idx < 0){ setStatus(status, '过滤格式错误：' + pair + '（应为 key=value）', true); return; }
                var k = pair.slice(0, idx).trim();
                var v = pair.slice(idx + 1).trim();
                if(!k){ setStatus(status, '过滤键为空', true); return; }
                query = query.eq(k, v);
            }
        }

        setStatus(status, '查询中...', false);
        result.innerHTML = '<div class="ds-empty">查询中...</div>';

        var t0 = performance.now();
        try{
            var res = await query;
            var t1 = performance.now();
            var data = res.data;
            var error = res.error;
            if(error){
                setStatus(status, '错误：' + (error.message || '未知错误'), true);
                result.innerHTML = '<div class="ds-empty">查询失败</div>';
                return;
            }
            if(!data || data.length === 0){
                setStatus(status, '查询成功：0 行，耗时 ' + Math.round(t1 - t0) + 'ms', false);
                result.innerHTML = '<div class="ds-empty">无数据</div>';
                return;
            }
            renderTable(result, data);
            setStatus(status, '查询成功：' + data.length + ' 行，耗时 ' + Math.round(t1 - t0) + 'ms', false);
        }catch(e){
            setStatus(status, '异常：' + (e.message || e), true);
            result.innerHTML = '<div class="ds-empty">查询异常</div>';
        }
    }

    function setStatus(el, msg, isErr){
        if(!el) return;
        el.textContent = msg;
        el.className = 'ds-status' + (isErr ? ' ds-err' : (msg.indexOf('成功') >= 0 ? ' ds-ok' : ''));
    }

    // ===== 渲染结果表格 =====
    function renderTable(container, data){
        // 收集所有列（合并各行的键，保证列完整）
        var colSet = {};
        var colOrder = [];
        data.forEach(function(row){
            for(var k in row){
                if(Object.prototype.hasOwnProperty.call(row, k) && !(k in colSet)){
                    colSet[k] = true;
                    colOrder.push(k);
                }
            }
        });

        var table = document.createElement('table');
        table.className = 'ds-table';

        // 表头
        var thead = document.createElement('thead');
        var tr = document.createElement('tr');
        colOrder.forEach(function(k){
            var th = document.createElement('th');
            th.textContent = k;
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);

        // 表体
        var tbody = document.createElement('tbody');
        data.forEach(function(row){
            var r = document.createElement('tr');
            colOrder.forEach(function(k){
                var td = document.createElement('td');
                var val = row[k];
                if(val === null || val === undefined){
                    var span = document.createElement('span');
                    span.className = 'ds-cell-null';
                    span.textContent = 'null';
                    td.appendChild(span);
                }else if(typeof val === 'object'){
                    var span = document.createElement('span');
                    span.className = 'ds-cell-obj';
                    try{ span.textContent = JSON.stringify(val); }
                    catch(e){ span.textContent = String(val); }
                    td.appendChild(span);
                }else{
                    td.textContent = String(val);
                }
                r.appendChild(td);
            });
            tbody.appendChild(r);
        });
        table.appendChild(tbody);

        container.innerHTML = '';
        container.appendChild(table);
    }

    // ===== 初始化 =====
    function init(){
        var root = document.getElementById('devSQLRoot');
        if(!root) return;
        if(root.children.length === 0){
            buildUI(root);
        }
        // 设置弹窗栏标签为紫色强调（dev-SQL 调试工具标识）
        applyTabState();
    }

    // 设置弹窗栏标签为紫色强调（容器已挂载到弹窗栏后才生效）
    function applyTabState(){
        if(window.setSideTabState){
            window.setSideTabState('devSQL', 'accent');
        }
    }

    // 布局应用后（容器已就位）重新设置标签状态
    window.addEventListener('sideLayoutApplied', applyTabState);

    // 暴露给 mount.js 的 callComponentInit 调用
    window.DevSQL = { init: init };

    // 自动初始化（脚本加载即构建，容器由 mount.js 移动到对应弹窗栏）
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', init);
    }else{
        init();
    }
})();