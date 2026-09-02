/*!
 * terminal-fs.js —— 终端文件系统模块（数据树 + 路径解析 + 权限校验）
 * 依赖：terminal.js（需先加载，使用 window.TerminalCore）
 * 暴露：Core.resolvePath / findNode / cwdStr / canAccess / updatePrompt
 *
 * 说明：文件系统数据（FS_TREE）集中在本文件，后续可对此数据单独加密，
 *       以增强游戏安全性与趣味性（解密后挂载到 Core 即可）。
 */
(function(Core){
    'use strict';

    //===== 加解密工具：XOR + Base64，密钥置于闭包内，源码中不出现明文 =====
    const ENC_KEY = 'c0ns0leW3b';

    function xorTransform(s, k){
        const out = [];
        for(let i = 0; i < s.length; i++){
            out.push(String.fromCharCode(s.charCodeAt(i) ^ k.charCodeAt(i % k.length)));
        }
        return out.join('');
    }

    //解密：Base64 解码 → XOR 还原明文（兼容 Unicode）
    function decrypt(b64){
        try{
            const bin = atob(b64);
            const raw = xorTransform(bin, ENC_KEY);
            return decodeURIComponent(escape(raw));
        }catch(e){
            return '（内容解密失败）';
        }
    }

    //加密：明文 → UTF-8 字节串 → XOR → Base64（与 decrypt 互逆，兼容 Unicode）
    function encrypt(plain){
        const bin = unescape(encodeURIComponent(plain));
        const enc = xorTransform(bin, ENC_KEY);
        return btoa(enc);
    }

    //===== 文件系统：树形结构（支持多级目录） =====
    // type:'dir' 为目录，其余为文件类型（text/json/config/log/data 等）
    // owner: 文件所有者；root 可访问所有，其余用户仅可访问自己的文件
    // content: 加密后的文件内容（Base64 密文），/open 时实时解密显示
    const FS_TREE = {
        name:'/', type:'dir', children:[
            { name:'readme.txt',   size:1024, type:'text',   desc:'项目说明文档', owner:'user',
              content:'Xg1TTg1RWGoOX14NU04NUVhqDl9eDVNODVFYag5fXg1TTg1RWGoOX2kQTjBfAhY4Xwc0VQxT19ftsJjNhIPVlIvzRXoTisyEiOu+ivPQ1cPAOlNODVFYag5fXg1TTg1RWGoOX14NU04NUVhqDl9eDVNODVFYag5fXg1kedPs9bCA2YSL8ZSe7IHsuIHjoWRTEITaztX6zNTW89TUz7Gbw4W78VN8BQsiS0KEi+aUm8OCzbdCNFUMU9biwrK71Ia/3pCw7m93E4T3n4j/sYrz0NfZ1dfdyNfX+rKc3ou4xJCw7YLDm4Trh4jus4X8x9bq5Nbj0dPs5F0TQoW855qkwo35g4fepYrLvon06tfZx9TU19TW97Sz4Gk6jfOgidr82uL81Nb51uXutLPzaRBOm47/gNKWQkxYCx9ATEV3E0JDEE6Vr8mCy7iE6rCI77mJ6vjU9svV/87U18FdE0KLjv2WtclFeF8RQxBOUxBMRXcTQoa4+Za31oDqoIfqvYnononYwtX05NTVxTpMRb+N8Ya1y1MfDwF3VhYAEE5TEExFv4z5hrXLU1UYBnfU+c3V0+Y6TEW/jfGGtctTHwMVMl1CEVUPF10JSyNLFkMQiPqjidnX1f7P1vj01NfTXRNCi479lrXJRXhAF0NCARxETEV3E0KGuOmVvc6B74lCEV8BBxCL8f/V6tQ6TlPY0vaytsdDHx4EVExFdxNCQxBOU9bzwLCv6YaN/Za54Y3gnIfdtGR50+z1sa7hiqn+lb/8gvOJgeOhZFMQheb/1url193I19f6saXlh4vYnIzkBjhdBApXQBlDAwu0s+MQWA8XXxtFsJ7rjIzneRBMjMuzisWxTgFfAxF31f/g2ffj1uXov7Dfhbn9lozshtexaEMQis6Pi/H/E00QRU4BXwMRd9bq5Nbj0dX867K+0Ya/wZue04zAnYHjsmR50+z1vqnyi6fhlrbpgPmKgeOhZFMQi9bs1Nn81Nbe2Pvqsa/rh4jul4r3jMuzisWxTgFfAxF31f/g2ffj1/bhXRNChaXhlbTzg8G0htiGgc+8idXK28321ufN1eTVsorUhbn9lozsgPmwhticjfOyZm9qDl9eDVNODVFYag5fXg1TTg1RWGoOX14NU04NUVhqDl9eDVNODVFYXRNCThALHVRMCjETBApcC1MdZlhqDl9eDVNODVFYag5fXg1TTg1RWGoOX14NU04NUVhqDl9eDVNODVE=' },
            { name:'config.json',  size:256,  type:'json',   desc:'系统配置文件', owner:'root' },
            { name:'keymap.dat',    size:512,  type:'data',   desc:'按键映射表', owner:'root' },
            { name:'resource.log', size:2048, type:'log',    desc:'资源采集日志', owner:'user' },
            { name:'logo.svg',     size:768,  type:'config', desc:'矢量logo资源', owner:'user' },
            { name:'changelog.md', size:1536, type:'text',   desc:'版本更新记录', owner:'user' },
            { name:'etc', type:'dir', owner:'root', children:[
                { name:'hosts',        size:128,  type:'config', desc:'主机名解析表', owner:'root' },
                { name:'motd',         size:64,   type:'text',   desc:'登录欢迎信息', owner:'user' },
                { name:'sysctl.conf',  size:384,  type:'config', desc:'内核运行参数', owner:'root' },
                { name:'shadow',       size:256,  type:'config', desc:'用户密码哈希', owner:'root' }
            ]},
            { name:'var', type:'dir', owner:'root', children:[
                { name:'messages',    size:4096, type:'log',  desc:'系统消息日志', owner:'root' },
                { name:'audit', type:'dir', owner:'root', children:[
                    { name:'audit.log', size:2048, type:'log', desc:'审计日志', owner:'root' }
                ]}
            ]},
            { name:'home', type:'dir', owner:'root', children:[
                { name:'user', type:'dir', owner:'user', children:[
                    { name:'.bashrc',    size:512, type:'config', desc:'shell 初始化脚本', owner:'user' },
                    { name:'.profile',   size:256, type:'config', desc:'用户环境配置', owner:'user' },
                    { name:'notes.txt',  size:768, type:'text',   desc:'个人备忘录', owner:'user' },
                    { name:'secret.key', size:128, type:'data',   desc:'私密密钥文件', owner:'root' }
                ]}
            ]}
        ]
    };

    //===== 路径解析：将用户输入路径解析为规范化路径数组 =====
    // 支持：绝对路径 /a/b、相对路径 a/b、. 当前、.. 上级、/ 根
    Core.resolvePath = function(input){
        let parts;
        if(input === '/' || input === ''){
            return [];
        }
        if(input.charAt(0) === '/'){
            // 绝对路径：从根开始
            parts = input.split('/').filter(function(p){ return p !== ''; });
        }else{
            // 相对路径：从当前目录开始
            parts = Core.cwd.slice();
            input.split('/').filter(function(p){ return p !== ''; }).forEach(function(p){
                if(p === '.'){
                    // 当前目录，忽略
                }else if(p === '..'){
                    parts.pop();
                }else{
                    parts.push(p);
                }
            });
        }
        return parts;
    };

    //===== 根据路径数组查找节点，返回该节点或 null =====
    Core.findNode = function(pathArr){
        let node = FS_TREE;
        for(let i = 0; i < pathArr.length; i++){
            if(!node || node.type !== 'dir' || !node.children) return null;
            const next = node.children.find(function(c){ return c.name === pathArr[i]; });
            if(!next) return null;
            node = next;
        }
        return node;
    };

    //===== 格式化当前路径为显示字符串 =====
    Core.cwdStr = function(){
        return '/' + Core.cwd.join('/');
    };

    //===== 更新命令提示符：[user@host /path]$ =====
    Core.updatePrompt = function(){
        if(Core.termPrompt){
            const path = Core.cwdStr() === '' ? '/' : Core.cwdStr();
            Core.termPrompt.textContent = '[' + Core.currentUser + '@' + Core.HOSTNAME + ' ' + path + ']$';
        }
    };

    //===== 权限校验：当前用户是否有权访问该文件/目录 =====
    // root 可访问所有文件；其余用户仅可访问 owner 为自己或 owner 为空的文件
    Core.canAccess = function(node){
        if(!node) return false;
        if(Core.currentUser === 'root') return true;
        if(!node.owner) return true;
        return node.owner === Core.currentUser;
    };

    //===== 解密文件内容：对外暴露，供 /open 命令调用 =====
    Core.decryptContent = function(b64){
        return decrypt(b64);
    };

    //===== 加密文件内容：对外暴露，供编辑器保存时调用 =====
    Core.encryptContent = function(plain){
        return encrypt(plain);
    };

    //===== 向存档系统注册终端元数据（user、cwd） =====
    // 存档的收集/恢复/导出/载入统一由 GameSave 管理，终端仅声明可持久化字段
    if(window.GameSave){
        GameSave.register('user', function(){ return Core.currentUser; }, function(v){
            if(typeof v === 'string') Core.currentUser = v;
        });
        GameSave.register('cwd', function(){ return Core.cwd; }, function(v){
            if(Array.isArray(v)){
                const node = Core.findNode(v);
                if(node && node.type === 'dir') Core.cwd = v;
            }
        });
    }

})(window.TerminalCore);