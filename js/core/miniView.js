// miniView - 小窗样式模块（独立管理，由 setting 组件负责载入）
//
// 当窗口边长小于 450px 时，主界面降级为极简小窗视图，
// 仅显示资源数值，适合未来打包为桌面可执行文件时的紧凑展示。
//
// 本模块由 setting.js 动态载入（样式 miniView.css + 脚本 miniView.js 独立文件），
// 载入后自初始化：
//   - 注册 enableMiniView 到 GameSave，并主动再调用一次 restoreFromStorage 恢复存档值
//     （因本模块在 base.js 之后异步载入，base.js 首次 restoreFromStorage 时尚未注册本字段）
//   - MiniView.init() 获取 DOM 并首次检测尺寸
//   - base.js 游戏循环 / resize 通过 window.MiniView 调用 update / checkSize

// 小窗样式开关：开启后窗口边长 < 450 时显示降级小窗
var enableMiniView = true;

var MiniView = {
    // DOM 引用（init 时获取）
    _el: null,
    _countEl: null,
    _perSecEl: null,
    _mainEl: null,
    _ready: false,

    // 初始化：获取 DOM 并首次检测尺寸
    init: function(){
        this._el = document.getElementById('miniView');
        this._countEl = document.getElementById('miniCount');
        this._perSecEl = document.getElementById('miniPerSec');
        this._mainEl = document.getElementById('mainWindow');
        this._ready = !!(this._el && this._mainEl);
        this.checkSize();
    },

    // 检测视口尺寸：开启且边长 < 450 时降级为小窗，否则显示主窗口
    checkSize: function(){
        if(!this._ready) return;
        var w = window.innerWidth;
        var h = window.innerHeight;
        if(enableMiniView && (w < 450 || h < 450)){
            this._el.style.display = 'flex';
            this._mainEl.style.display = 'none';
        }else{
            this._el.style.display = 'none';
            this._mainEl.style.display = 'block';
        }
    },

    // 刷新小窗数值（由 base.js 游戏循环调用）
    update: function(count, perSec){
        if(this._countEl) this._countEl.innerText = count;
        if(this._perSecEl) this._perSecEl.innerText = perSec;
    },

    // 设置开关并立即生效
    setEnabled: function(val){
        enableMiniView = !!val;
        this.checkSize();
    },

    // 读取当前开关状态
    isEnabled: function(){
        return enableMiniView;
    }
};

window.MiniView = MiniView;

// 注册持久化字段，并恢复存档值（本模块异步载入，需主动再恢复一次以读取 enableMiniView）
if(window.GameSave){
    GameSave.register('enableMiniView',
        function(){ return enableMiniView; },
        function(v){ if(typeof v === 'boolean') enableMiniView = v; }
    );
    GameSave.restoreFromStorage();
}

// 自初始化（DOM 此时已就绪）
MiniView.init();