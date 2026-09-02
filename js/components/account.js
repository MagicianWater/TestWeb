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
        const saveNameBtn = document.getElementById('acctSaveNameBtn');

        if(loginBtn){
            loginBtn.onclick = function(){ self.handleLogin(); };
        }
        if(signupBtn){
            signupBtn.onclick = function(){ self.handleSignup(); };
        }
        if(logoutBtn){
            logoutBtn.onclick = function(){ self.handleLogout(); };
        }
        if(saveNameBtn){
            saveNameBtn.onclick = function(){ self.handleSaveName(); };
        }
        // 回车提交登录
        const pwdInput = document.getElementById('acctPassword');
        if(pwdInput){
            pwdInput.onkeydown = function(e){
                if(e.key === 'Enter') self.handleLogin();
            };
        }
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

    //===== 保存用户名 =====
    handleSaveName: async function(){
        const input = document.getElementById('acctNewName');
        const newName = input ? input.value.trim() : '';
        const tip = document.getElementById('acctNameMsg');
        if(!newName){ if(tip) tip.textContent = '请输入新用户名'; return; }
        if(newName.length > 16){ if(tip) tip.textContent = '用户名最多16个字符'; return; }
        if(tip) tip.textContent = '保存中...';
        const updated = await window.SupabaseClient.updateProfile({ username: newName });
        if(updated){
            if(tip) tip.textContent = '保存成功';
            if(input) input.value = '';
            this.loadProfile();
        }else{
            if(tip) tip.textContent = '保存失败';
        }
    },

    //===== 显示登录/注册提示 =====
    _showMsg: function(msg){
        const tip = document.getElementById('acctMsg');
        if(tip) tip.textContent = msg;
    }
};