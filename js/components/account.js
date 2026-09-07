// account - 账号中心面板
var AccountPanel = {
    _authUnsub: null,

    init: function(){
        this.bindEvents();
        this.render();
        // 订阅认证状态变化，登录/登出时自动刷新视图
        if(window.SupabaseClient && !this._authUnsub){
            const self = this;
            this._authUnsub = window.SupabaseClient.onAuthStateChange(function(){
                // 仅当账号面板当前可见时才刷新，避免无谓请求
                if(document.getElementById('accountUserView') || document.getElementById('accountGuestView')){
                    self.render();
                }
            });
        }
    },

    //===== 根据登录状态渲染对应视图 =====
    render: function(){
        const guestView = document.getElementById('accountGuestView');
        const userView = document.getElementById('accountUserView');
        if(!guestView || !userView) return;
        const loggedIn = window.SupabaseClient && window.SupabaseClient.isLoggedIn();
        if(loggedIn){
            guestView.style.display = 'none';
            userView.style.display = '';
            this.loadProfile();
        }else{
            // 登出/未登录时清理可能残留的用户名编辑态
            this.cancelEditName();
            guestView.style.display = '';
            userView.style.display = 'none';
        }
    },

    //===== 加载并显示档案 =====
    loadProfile: async function(){
        const user = window.SupabaseClient.getCurrentUser();
        if(!user) return;
        const emailEl = document.getElementById('acctUserEmail');
        if(emailEl) emailEl.textContent = user.email || '—';
        const profile = await window.SupabaseClient.getProfile();
        if(!profile) return;
        const nameEl = document.getElementById('acctUsername');
        const balEl = document.getElementById('acctBalance');
        const createdEl = document.getElementById('acctCreatedAt');
        if(nameEl) nameEl.textContent = profile.username || '—';
        if(balEl) balEl.textContent = profile.balance != null ? profile.balance : '—';
        if(createdEl && profile.created_at){
            createdEl.textContent = new Date(profile.created_at).toLocaleString('zh-CN');
        }
    },

    //===== 绑定事件 =====
    bindEvents: function(){
        const self = this;
        const loginBtn = document.getElementById('acctLoginBtn');
        const signupBtn = document.getElementById('acctSignupBtn');
        const logoutBtn = document.getElementById('acctLogoutBtn');
        const nameEl = document.getElementById('acctUsername');
        const nameInput = document.getElementById('acctUsernameEdit');

        if(loginBtn){
            loginBtn.onclick = function(){ self.handleLogin(); };
        }
        if(signupBtn){
            signupBtn.onclick = function(){ self.handleSignup(); };
        }
        if(logoutBtn){
            logoutBtn.onclick = function(){ self.handleLogout(); };
        }
        // 用户名行内编辑：点击进入编辑态
        if(nameEl){
            nameEl.onclick = function(){ self.startEditName(); };
        }
        if(nameInput){
            nameInput.onkeydown = function(e){
                if(e.key === 'Enter'){ e.preventDefault(); self.handleSaveName(); }
                else if(e.key === 'Escape'){ e.preventDefault(); self.cancelEditName(); }
            };
            // 失焦保存（靠 editNameActive 标志防重入）
            nameInput.onblur = function(){ self.handleSaveName(); };
        }
        // 回车提交登录
        const pwdInput = document.getElementById('acctPassword');
        if(pwdInput){
            pwdInput.onkeydown = function(e){
                if(e.key === 'Enter') self.handleLogin();
            };
        }
    },

    //===== 进入用户名编辑态 =====
    editNameActive: false,
    startEditName: function(){
        if(this.editNameActive) return;
        const span = document.getElementById('acctUsername');
        const input = document.getElementById('acctUsernameEdit');
        if(!span || !input) return;
        const current = span.textContent.trim() === '—' ? '' : span.textContent.trim();
        input.value = current;
        span.style.display = 'none';
        input.style.display = '';
        input.focus();
        input.select();
        this.editNameActive = true;
        const tip = document.getElementById('acctNameMsg');
        if(tip) tip.textContent = '按 Enter 保存，Esc 取消';
    },

    //===== 退出用户名编辑态（不保存） =====
    cancelEditName: function(){
        this.editNameActive = false;
        const span = document.getElementById('acctUsername');
        const input = document.getElementById('acctUsernameEdit');
        if(span) span.style.display = '';
        if(input){ input.style.display = 'none'; input.value = ''; }
        const tip = document.getElementById('acctNameMsg');
        if(tip) tip.textContent = '';
    },

    //===== 处理登录 =====
    handleLogin: async function(){
        const email = document.getElementById('acctEmail').value.trim();
        const password = document.getElementById('acctPassword').value;
        if(!email || !password){ this._showMsg('请输入邮箱和密码'); return; }
        this._showMsg('登录中...');
        const { user, error } = await window.SupabaseClient.signInWithPassword(email, password);
        if(error){
            this._showMsg('登录失败：' + (error.message || '未知错误'));
            return;
        }
        this._showMsg('登录成功');
        document.getElementById('acctPassword').value = '';
        this.render();
    },

    //===== 处理注册 =====
    handleSignup: async function(){
        const email = document.getElementById('acctEmail').value.trim();
        const password = document.getElementById('acctPassword').value;
        if(!email || !password){ this._showMsg('请输入邮箱和密码'); return; }
        if(password.length < 6){ this._showMsg('密码至少6位'); return; }
        this._showMsg('注册中...');
        const { user, error } = await window.SupabaseClient.signUp(email, password);
        if(error){
            this._showMsg('注册失败：' + (error.message || '未知错误'));
            return;
        }
        // 若控制台关闭了邮箱确认，注册即登录，onAuthStateChange 会触发 render
        if(user && !window.SupabaseClient.isLoggedIn()){
            this._showMsg('注册成功，请前往邮箱点击确认链接后登录');
        }else{
            this._showMsg('注册成功，已自动登录');
            document.getElementById('acctPassword').value = '';
            this.render();
        }
    },

    //===== 处理登出 =====
    handleLogout: async function(){
        await window.SupabaseClient.signOut();
        this.render();
    },

    //===== 保存用户名（行内编辑） =====
    handleSaveName: async function(){
        // 非编辑态直接返回，避免失焦回调重复触发
        if(!this.editNameActive) return;
        const input = document.getElementById('acctUsernameEdit');
        const newName = input ? input.value.trim() : '';
        const tip = document.getElementById('acctNameMsg');
        if(!newName){ if(tip) tip.textContent = '用户名不能为空'; return; }
        if(newName.length > 16){ if(tip) tip.textContent = '用户名最多16个字符'; return; }
        // 先退出编辑态，避免保存期间失焦再次触发
        this.editNameActive = false;
        if(tip) tip.textContent = '保存中...';
        const updated = await window.SupabaseClient.updateProfile({ username: newName });
        if(updated){
            if(tip) tip.textContent = '用户名已更新';
            this.cancelEditName();
            this.loadProfile();
            // 通知聊天模块刷新本地用户名缓存，并就地更新自己历史消息的显示名
            if(window.ChatCore && typeof window.ChatCore.onUsernameChanged === 'function'){
                window.ChatCore.onUsernameChanged(newName);
            }
            const tipRef = tip;
            setTimeout(function(){ if(tipRef && tipRef.textContent === '用户名已更新') tipRef.textContent = ''; }, 2000);
        }else{
            // 失败：恢复编辑态让用户重试
            this.editNameActive = true;
            if(input){ input.focus(); }
            if(tip) tip.textContent = '保存失败，请重试';
        }
    },

    //===== 显示登录/注册提示 =====
    _showMsg: function(msg){
        const tip = document.getElementById('acctMsg');
        if(tip) tip.textContent = msg;
    }
};