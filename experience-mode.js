/* UI modes. Never change registrations, filters, records or cloud state. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.PQC_EXPERIENCE=api;document.addEventListener('DOMContentLoaded',()=>api.mount(document,()=>root.localStorage));}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const KEY='pqc.experience-mode.v1';
  const MODES={
    simple:{name:'簡易',hint:'從「我的植物／陽台」記錄日常照顧；用藥仍可回到原登記查詢。'},
    standard:{name:'標準',hint:'作物查詢與藥劑反查直接顯示；多作物工具需要時再展開。'},
    complete:{name:'完整',hint:'直接展開所有查詢入口。不同作物、防治對象的原登記用法仍分開列示。'}
  };
  const normalize=value=>Object.prototype.hasOwnProperty.call(MODES,value)?value:'standard';
  const read=getStorage=>{try{return normalize(getStorage().getItem(KEY));}catch(_){return 'standard';}};
  const write=(getStorage,value)=>{try{getStorage().setItem(KEY,normalize(value));return true;}catch(_){return false;}};
  let refresh=()=>{};
  let select=()=>{};
  function mount(doc,getStorage){
    const picker=doc.getElementById('experienceMode');
    if(!picker)return;
    let mode=read(getStorage);
    const tools=doc.getElementById('queryTools');
    const multi=doc.getElementById('multiCropTools');
    const status=doc.getElementById('experienceStatus');
    function render(reset){
      doc.documentElement.dataset.useMode=mode;
      doc.getElementById('experienceLabel').textContent='查詢模式：'+MODES[mode].name;
      doc.getElementById('experienceHint').textContent=MODES[mode].hint;
      picker.querySelectorAll('[data-use-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.useMode===mode)));
      // Do not hide the active reverse-lookup context when switching modes.
      const agentActive=doc.getElementById('qmodeAgent').getAttribute('aria-selected')==='true';
      if(reset){tools.open=mode!=='simple'||agentActive;multi.open=mode==='complete';}
      else if(agentActive)tools.open=true;
    }
    select=value=>{
      mode=normalize(value);
      const persisted=write(getStorage,mode);
      render(true);
      status.textContent=persisted?'已切換為'+MODES[mode].name+'模式；原查詢與紀錄均保留。':'本次已切換模式；瀏覽器無法儲存偏好，重新開啟後可能恢復標準模式。';
      doc.dispatchEvent(new CustomEvent('pqc:experience-mode',{detail:{mode}}));
    };
    picker.querySelectorAll('[data-use-mode]').forEach(button=>button.addEventListener('click',()=>select(button.dataset.useMode)));
    refresh=()=>render(false);
    render(true);
  }
  return {KEY,normalize,read,write,mount,refresh:()=>refresh(),select:value=>select(value)};
});
