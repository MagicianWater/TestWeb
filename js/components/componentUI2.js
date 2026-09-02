// componentUI2 - 绿色面板
var ComponentUI2 = {
    staticData: { label: "绿色", items: ["功能一", "功能二", "功能三"] },
    init: function(){
        console.log("[ComponentUI2] 绿色面板初始化");
        this.renderItems();
    },
    renderItems: function(){
        const listEl = document.getElementById('ui2-item-list');
        if(listEl){
            listEl.innerHTML = this.staticData.items.map(item =>
                `<div class="card theme-accent"><p>${item}</p></div>`
            ).join('');
        }
    }
};
