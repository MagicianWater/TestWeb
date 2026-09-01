// componentUI5 - 紫色面板
var ComponentUI5 = {
    staticData: { label: "紫色", items: ["功能一", "功能二", "功能三"] },
    init: function(){
        console.log("[ComponentUI5] 紫色面板初始化");
        this.renderItems();
    },
    renderItems: function(){
        const listEl = document.getElementById('ui5-item-list');
        if(listEl){
            listEl.innerHTML = this.staticData.items.map(item =>
                `<div class="card theme-accent"><p>${item}</p></div>`
            ).join('');
        }
    }
};
