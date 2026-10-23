/* Simple-mode plant home. Uses existing record forms; photos are local-only IndexedDB. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const safe = value => esc(String(value == null ? '' : value));
  const leaf = '<svg viewBox="0 0 100 108" fill="none" aria-hidden="true"><path d="M48 73V30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M48 57C24 58 19 38 21 29C42 29 50 43 48 57Z" fill="currentColor" opacity=".3"/><path d="M49 43C48 20 66 13 79 15C78 34 67 44 49 43Z" fill="currentColor" opacity=".65"/><path d="M29 73H69L63 99H35L29 73Z" fill="#cf8e64"/><path d="M27 73H71" stroke="#ad6845" stroke-width="4" stroke-linecap="round"/></svg>';
  let selected = '', locationFilter = '', returnFocus = null, photoEpoch = 0, photoToken = 0;
  const photoURLs = [], dialogURLs = [];
  const host = document.createElement('main'); host.id = 'balconyHome'; host.hidden = true;
  const returnButton = document.createElement('button'); returnButton.id = 'balconyReturn';
  returnButton.textContent = '回到我的植物'; returnButton.hidden = true;
  const dialog = document.createElement('dialog'); dialog.id = 'balconyDialog';
  dialog.setAttribute('aria-labelledby', 'balconyDialogTitle');
  document.body.append(host, returnButton, dialog);
  function release(urls){while(urls.length)URL.revokeObjectURL(urls.pop());}
  function photoScope(){
    const user=window.PQC_ACCOUNT&&PQC_ACCOUNT.getUser();
    return PQC_PLANT_PHOTOS.scope(user&&user.uid||'',store.get('syncOwnerUid')||'');
  }
  async function hydratePhotos(){
    const epoch=++photoEpoch,scope=photoScope();release(photoURLs);
    if(!scope)return;
    for(const target of host.querySelectorAll('[data-photo-plant]')){
      try{
        const blob=await PQC_PLANT_PHOTOS.get(scope,target.dataset.photoPlant);
        if(epoch!==photoEpoch||scope!==photoScope()||!target.isConnected)return;
        if(blob){const url=URL.createObjectURL(blob);photoURLs.push(url);const img=document.createElement('img');img.src=url;img.alt='植物照片';target.replaceChildren(img);}
      }catch(_){const note=$('balPhotoNote');if(note)note.textContent='本機照片目前無法讀取；植物與照顧紀錄不受影響。';return;}
    }
  }
  function setValue(id, value) { if ($(id)) $(id).value = value; }
  function localPersisted(key, expected) {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      return Array.isArray(saved) && saved.length === expected.length && expected.every(item => {
        const actual = saved.find(r => r.id === item.id);
        // The shared storage layer adds updatedAt to a copy. Compare content, not its timestamp.
        return window.PQC_SYNC ? PQC_SYNC.sameContent(actual,item) : JSON.stringify(actual) === JSON.stringify(item);
      });
    } catch (_) { return false; }
  }
  function notify(message) { $('balconyStatus').textContent = message; }
  function describe(record) {
    if(record.type==='cultivation' && record.details && record.details.activity==='灌溉' && !record.details.method) return '澆水';
    if(record.type==='cultivation' && record.details && record.details.activity==='其他' && record.details.method==='觀察') return '觀察';
    return PQC_FARM.summary(record);
  }
  function launch() {
    if(document.documentElement.dataset.useMode!=='simple'||$('onboard').classList.contains('open'))return false;
    document.body.classList.add('balcony-open'); host.hidden = false; returnButton.hidden = true;
    render(); window.scrollTo(0, 0);
    return true;
  }
  function leave(){
    closeDialog(); ++photoEpoch;release(photoURLs);
    document.body.classList.remove('balcony-open');host.hidden=true;
    returnButton.hidden=document.documentElement.dataset.useMode!=='simple'||$('onboard').classList.contains('open');
  }
  function originalScreen(section) {
    leave(); go(section);
  }
  function card(plot) {
    const history = farmRecords.filter(r => r.plotId === plot.id).sort((a,b) => b.date.localeCompare(a.date));
    const last = history[0];
    const recent = last ? safe(last.date) + ' · ' + safe(describe(last)) : '還沒記錄照顧，從今天開始就好。';
    return '<article class="bal-plant"><div class="bal-plant-top"><div><span class="bal-location">'+safe(plot.tag || '未設定位置')+'</span><h2>'+safe(plot.crop || plot.name)+'</h2>'
      +(plot.variety ? '<p>'+safe(plot.variety)+'</p>' : '')+'</div><button type="button" class="bal-photo-button" data-action="photo" data-id="'+safe(plot.id)+'" aria-label="管理'+safe(plot.crop||plot.name)+'的照片"><span class="bal-illustration" data-photo-plant="'+safe(plot.id)+'">'+leaf+'</span><span class="bal-photo-caption">植物照片</span></button></div>'
      +'<p class="bal-latest">'+recent+'</p><div class="bal-card-actions"><button class="bal-primary" data-action="care" data-id="'+safe(plot.id)+'">記一筆</button><button class="bal-text" data-action="history" data-id="'+safe(plot.id)+'">查看紀錄 <span aria-hidden="true">→</span></button></div></article>';
  }
  function render() {
    const locations = [...new Set(fieldPlots.map(p => p.tag || '未設定位置'))];
    if (locationFilter && !locations.includes(locationFilter)) locationFilter = '';
    const plots = fieldPlots.filter(p => !locationFilter || (p.tag || '未設定位置') === locationFilter);
    host.innerHTML = '<div class="bal-shell"><header class="bal-header"><a href="#" data-action="home" class="bal-brand"><img src="./brand-logo-transparent.png" alt="">噴前查<span>簡易模式</span></a><button class="bal-text" data-action="original">切回原本介面</button></header>'
      +'<div class="bal-prototype-note">日常照顧用簡單的方式記，完整功能也都還在。</div>'
      +'<section class="bal-hero"><span class="bal-eyebrow">我的植物／陽台</span><h1>把陽台的小事，<br>慢慢記下來。</h1><p>今天澆水了嗎？葉子有什麼變化？<br>選一株，把剛剛做的事留一筆。</p><div class="bal-hero-line"></div></section>'
      +'<div class="bal-section-title"><h2>我的植物 <span>'+fieldPlots.length+'</span></h2><button class="bal-add" data-action="add">＋ 新增植物</button></div>'
      +'<div class="bal-filters" aria-label="依位置篩選"><button data-action="filter" data-location="" aria-pressed="'+(!locationFilter)+'">全部</button>'+locations.map(tag => '<button data-action="filter" data-location="'+safe(tag)+'" aria-pressed="'+(locationFilter===tag)+'">'+safe(tag)+'</button>').join('')+'</div>'
      +'<div class="bal-plants">'+(plots.length ? plots.map(card).join('') : '<section class="bal-empty"><div class="bal-illustration">'+leaf+'</div><h2>先從一株開始。</h2><p>不用填一整份表單。<br>植物名稱、放的位置，就能開始記錄。</p><button class="bal-primary" data-action="add">新增我的第一株植物</button></section>')+'</div>'
      +'<aside class="bal-help"><b>葉子被咬了，想查一查？</b><p>先確認作物與病蟲害，再看原登記用法。</p><button class="bal-text" data-action="search">前往用藥查詢 →</button></aside>'
      +'<p class="bal-footnote" id="balPhotoNote">照片只存這個瀏覽器，不會雲端同步，也不包含在紀錄備份檔。切換帳號不共用照片；清除網站資料前請先逐張下載留存。</p><button class="bal-text" data-action="profile">帳號、備份與顯示設定 →</button>'
      +'<p class="bal-footnote">照顧紀錄不是健康診斷；沒有用藥紀錄，也不代表已確認可以採收。沿用原本的種植批次與作業紀錄。</p><div id="balconyStatus" role="status" aria-live="polite"></div></div>';
    hydratePhotos();
  }
  function openDialog(title, content) {
    ++photoToken;release(dialogURLs);
    returnFocus = document.activeElement;
    dialog.innerHTML = '<div class="bal-dialog-head"><h2 id="balconyDialogTitle">'+safe(title)+'</h2><button type="button" class="bal-close" data-action="close" aria-label="關閉">×</button></div>'+content;
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog() { ++photoToken;release(dialogURLs);dialog.close(); if (returnFocus && returnFocus.isConnected) returnFocus.focus(); }
  function error(message) { const el = $('balFormError'); if(el) el.textContent = message; }
  function addPlant() {
    openDialog('新增一株植物', '<form id="balPlantForm"><label>種什麼？<input id="balCrop" required maxlength="80" list="balCropOptions" placeholder="例：蔥、番茄"><datalist id="balCropOptions">'+Object.keys(DATA).sort().map(c=>'<option value="'+safe(c)+'"></option>').join('')+'</datalist></label>'
      +'<label>放在哪裡？<input id="balLocation" maxlength="80" placeholder="例：廚房窗邊、陽台"></label>'
      +'<details class="bal-more"><summary>品種與種植日期（選填）</summary><label>品種<input id="balVariety" maxlength="80" placeholder="不確定可以留白"></label><label>種植日期<input id="balPlantDate" type="date"></label></details>'
      +'<p class="bal-form-note">沒填種植日期時，以今天作為這批植物的起始紀錄日。找不到登記作物的名稱會保留為自訂植物，不會自動對應用藥。</p><p class="bal-error" id="balFormError" role="alert"></p><button class="bal-primary bal-full" type="submit">加入我的植物</button></form>');
  }
  function savePlant(event) {
    event.preventDefault();
    const crop = $('balCrop').value.trim();
    if (!crop) return error('請先填寫植物名稱。');
    const date = $('balPlantDate').value || todayIso();
    if (!validDate(date)) return error('請填寫有效日期。');
    renderPlotRecordBox();
    const input = $('plotCrop'); input.value = crop; input.dataset.crop = Object.hasOwn(DATA,crop) ? crop : ''; input.dataset.custom = Object.hasOwn(DATA,crop) ? '0':'1';
    setValue('plotPlantDate',date); setValue('plotVariety',$('balVariety').value.trim()); setValue('plotTag',$('balLocation').value.trim());
    const count = fieldPlots.length; addFieldPlot();
    if (fieldPlots.length !== count+1) return error('未能新增，請確認內容。');
    closeDialog(); locationFilter = ''; render();
    notify(localPersisted('fieldPlots',fieldPlots) ? '已加入我的植物；也能在原本的種植紀錄查看。' : '僅暫存在本頁，瀏覽器儲存失敗；請勿關閉頁面，改由原本介面匯出備份。');
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value+'T00:00:00Z');
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === value;
  }
  function care(id) {
    const plot = plotById(id); if (!plot) return;
    selected = id;
    openDialog('今天照顧了 '+(plot.crop || plot.name), '<p class="bal-subtitle">'+safe(plot.tag || '未設定位置')+' · 選擇實際做過的事</p><div class="bal-activities">'
      +[['water','澆水','留個日期，不猜用水量'],['fertilizer','施肥','記下資材與實際用量'],['observe','觀察','葉片、蟲害或生長變化']].map(([key,title,hint])=>'<button type="button" data-action="activity" data-kind="'+key+'"><b>'+title+'</b><span>'+hint+'</span><i aria-hidden="true">→</i></button>').join('')
      +'</div><div class="bal-secondary-actions"><button class="bal-text" data-action="plot-search">查用藥／記用藥 →</button><button class="bal-text" data-action="harvest">記採收 →</button></div><p class="bal-form-note">用藥從原登記查詢結果加入；採收仍使用原本的安全採收檢查。</p>');
  }
  function activity(kind) {
    if (!['water','fertilizer','observe'].includes(kind) || !plotById(selected)) return;
    const title = {water:'記一次澆水',fertilizer:'記一次施肥',observe:'記下今天的觀察'}[kind];
    openDialog(title, '<p class="bal-subtitle">'+safe(plotById(selected).crop)+' · '+safe(plotById(selected).tag || '未設定位置')+'</p><form id="balCareForm" data-kind="'+kind+'"><label>日期<input id="balDate" type="date" required value="'+todayIso()+'"></label>'
      +(kind==='fertilizer' ? '<label>用了什麼？<input id="balMaterial" required maxlength="120" placeholder="填包裝上的肥料名稱"></label><div class="bal-two"><label>實際用量<input id="balQuantity" type="number" min="0.001" step="any" required placeholder="填實際數量"></label><label>單位<select id="balUnit"><option>g</option><option>mL</option><option>kg</option><option>L</option></select></label></div><p class="bal-form-note">這裡只記錄，不推薦施用量；不會依盆數換算用量。</p>':'')
      +'<label>'+(kind==='observe'?'看到什麼？':'補充一下（選填）')+'<textarea id="balNotes" maxlength="1000" '+(kind==='observe'?'required':'')+' placeholder="'+(kind==='observe'?'例：新葉長出來了，葉背有小蟲':'例：今天只澆了靠外側的盆')+'"></textarea></label><p class="bal-error" id="balFormError" role="alert"></p><button class="bal-primary bal-full" type="submit">儲存這筆紀錄</button></form>');
  }
  function saveCare(event) {
    event.preventDefault();
    if (!plotById(selected)) return error('這株植物已不存在，請回到首頁重新選擇。');
    const kind = event.target.dataset.kind, date = $('balDate').value, notes = $('balNotes').value.trim();
    if (!validDate(date)) return error('請填寫有效日期。');
    if (kind==='observe' && !notes) return error('請寫下觀察內容。');
    if (kind==='fertilizer' && (!$('balMaterial').value.trim() || !(Number($('balQuantity').value)>0))) return error('請填寫肥料名稱與大於 0 的實際用量。');
    renderFarmRecordBox(); setValue('farmPlot',selected); setValue('farmType',kind==='fertilizer'?'fertilizer':'cultivation'); renderFarmDetailFields();
    setValue('farmDate',date); setValue('farmNotes',notes); setValue('farmOperator','');
    if (kind==='fertilizer') {
      setValue('farmMaterialName',$('balMaterial').value.trim()); setValue('farmQuantity',$('balQuantity').value); setValue('farmUnit',$('balUnit').value);
    } else { setValue('farmActivity',kind==='water'?'灌溉':'其他'); setValue('farmMethod',kind==='observe'?'觀察':''); }
    const count = farmRecords.length; addFarmRecord();
    if (farmRecords.length !== count+1) return error('未儲存成功，請檢查日期及必填欄位。');
    closeDialog(); render();
    const persisted = localPersisted('farmRecords',farmRecords);
    const message = persisted ? '已儲存。這筆也會出現在原本的作業紀錄。' : '僅暫存在本頁，瀏覽器儲存失敗；請勿關閉頁面，先到原本介面匯出備份。';
    notify(message);
    history(selected);
    const feedback = document.createElement('p'); feedback.className = persisted ? 'bal-form-note':'bal-error';
    feedback.setAttribute('role',persisted?'status':'alert'); feedback.textContent=message;
    dialog.querySelector('.bal-dialog-head').after(feedback);
  }
  function history(id) {
    const plot = plotById(id); if (!plot) return; selected = id;
    const list = farmRecords.filter(r=>r.plotId===id).sort((a,b)=>b.date.localeCompare(a.date));
    const pesticides = recordsForPlot(plot);
    openDialog((plot.crop || plot.name)+'的照顧紀錄', '<p class="bal-subtitle">'+safe(plot.tag || '未設定位置')+' · '+list.length+' 筆日常作業</p><div class="bal-timeline">'+(list.length ? list.map(r=>'<article><time>'+safe(r.date)+'</time><h3>'+safe(describe(r))+'</h3>'+(r.notes?'<p>'+safe(r.notes)+'</p>':'')+'</article>').join(''):'<p>還沒有日常作業紀錄，照顧後再回來記一筆。</p>')+'</div><p class="bal-form-note">另有 '+pesticides.length+' 筆關聯用藥紀錄；請至完整紀錄核對安全採收資訊。沒有紀錄不代表可以採收。</p><button class="bal-primary bal-full" data-action="care" data-id="'+safe(id)+'">再記一筆</button><button class="bal-text bal-full" data-action="full-records">查看完整紀錄與採收資訊 →</button>');
  }
  function searchSelected() {
    const plot = plotById(selected);
    if (!plot || plotCropLinkState(plot).custom) {
      openDialog('請先確認登記作物', '<p>這株使用自訂名稱，尚未連結登記作物。請自行確認正確作物，不會自動把相關植物視為相同登記。</p><button class="bal-primary bal-full" data-action="search">開啟查詢，自行選擇</button>'); return;
    }
    activePlotId = plot.id; plotSaveState(); originalScreen('search'); setQueryMode('crop'); pickCrop(plot.crop);
  }
  async function photo(id){
    const plot=plotById(id),scope=photoScope();if(!plot)return;
    if(!scope){openDialog('照片帳號保護','<p>目前紀錄屬於另一個帳號。請先回到個人頁核對帳號歸屬，再管理照片。</p><button class="bal-primary" data-action="profile">前往個人頁</button>');return;}
    openDialog((plot.crop||plot.name)+'的照片','<div id="balPhotoPreview" class="bal-photo-preview">讀取本機照片中…</div><p class="bal-form-note">照片僅存本機，不會上傳或包含在紀錄備份。儲存時會縮小並轉成 JPG，移除原檔 EXIF 資訊；不做植物辨識。</p><label>選擇照片<input id="balPhotoInput" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="bal-form-note">JPG／PNG／WebP，原檔上限 12 MB；每張壓縮後最多 400 KB，本機總量上限 30 MB。</p><p id="balPhotoStatus" role="status" aria-live="polite"></p><button id="balPhotoSave" class="bal-primary bal-full" disabled>儲存照片</button><div class="bal-secondary-actions"><button id="balPhotoDownload" class="bal-text" disabled>下載已儲存照片</button><button id="balPhotoRemove" class="bal-text" disabled>移除已儲存照片</button></div>');
    const token=photoToken,preview=$('balPhotoPreview'),input=$('balPhotoInput'),save=$('balPhotoSave'),status=$('balPhotoStatus'),download=$('balPhotoDownload'),remove=$('balPhotoRemove');
    let current=null,pending=null,busy=false,selection=0;
    const valid=()=>token===photoToken&&scope===photoScope()&&!!plotById(id)&&dialog.open;
    const show=blob=>{release(dialogURLs);if(!blob){preview.textContent='還沒有照片，選一張自己的植物照片吧。';return;}const url=URL.createObjectURL(blob);dialogURLs.push(url);const img=document.createElement('img');img.src=url;img.alt='所選植物照片預覽';preview.replaceChildren(img);};
    const lock=value=>{busy=value;input.disabled=value;save.disabled=value||!pending;remove.disabled=value||!current;download.disabled=value||!current;};
    try{current=await PQC_PLANT_PHOTOS.get(scope,id);if(!valid())return;show(current);lock(false);}
    catch(e){if(!valid())return;preview.textContent='照片讀取失敗';status.textContent=e.message;input.disabled=true;return;}
    input.addEventListener('change',async()=>{
      if(busy||!valid())return;const file=input.files[0];if(!file)return;const seq=++selection;
      pending=null;lock(true);status.textContent='正在縮小照片，尚未儲存…';
      try{const blob=await PQC_PLANT_PHOTOS.prepare(file);if(!valid()||seq!==selection)return;pending=blob;show(blob);status.textContent='預覽已準備好；按「儲存照片」才會取代原照片。';}
      catch(e){if(valid()){show(current);status.textContent=e.message;}}
      finally{if(valid())lock(false);}
    });
    save.addEventListener('click',async()=>{
      if(busy||!pending||!valid())return;lock(true);
      try{await PQC_PLANT_PHOTOS.put(scope,id,pending);if(!valid())return;current=pending;pending=null;input.value='';status.textContent='照片已存入這個瀏覽器，未上傳雲端。';hydratePhotos();}
      catch(e){if(valid())status.textContent=e.message;}
      finally{if(valid())lock(false);}
    });
    download.addEventListener('click',()=>{
      if(busy||!current||!valid())return;const url=URL.createObjectURL(current),a=document.createElement('a');a.href=url;a.download='searchbefore-plant-'+id+'.jpg';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    });
    remove.addEventListener('click',async()=>{
      if(busy||!current||!valid()||!confirm('要永久移除這株植物在此瀏覽器的照片嗎？建議先下載留存。植物與照顧紀錄不會刪除。'))return;
      if(!valid())return;lock(true);
      try{await PQC_PLANT_PHOTOS.remove(scope,id);if(!valid())return;current=null;pending=null;input.value='';show(null);status.textContent='照片已移除，照顧紀錄保留。';render();}
      catch(e){if(valid())status.textContent=e.message;}
      finally{if(valid())lock(false);}
    });
  }
  function action(event) {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const id = button.dataset.id, kind = button.dataset.kind;
    switch(button.dataset.action) {
      case 'home': event.preventDefault(); launch(); break;
      case 'add': addPlant(); break;
      case 'close': closeDialog(); break;
      case 'filter': locationFilter=button.dataset.location; render(); break;
      case 'care': care(id); break;
      case 'activity': activity(kind); break;
      case 'history': history(id); break;
      case 'search': originalScreen('search'); break;
      case 'plot-search': searchSelected(); break;
      case 'original': PQC_EXPERIENCE.select('standard'); originalScreen('search'); break;
      case 'profile': originalScreen('profile'); break;
      case 'photo': photo(id); break;
      case 'full-records': originalScreen('records'); openRecordHub('plots'); openPlotDetail(selected); break;
      case 'harvest':
        originalScreen('records'); renderFarmRecordBox(); setValue('farmPlot',selected); setValue('farmType','harvest'); renderFarmDetailFields(); updateFarmRecordRequirements(); renderHarvestSafetyBanner(); openRecordHub('farm'); break;
    }
  }
  host.addEventListener('click',action); dialog.addEventListener('click',action);
  dialog.addEventListener('submit',e=>{if(e.target.id==='balPlantForm')savePlant(e);else if(e.target.id==='balCareForm')saveCare(e);});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
  returnButton.addEventListener('click',launch);
  dialog.addEventListener('cancel',()=>{++photoToken;release(dialogURLs);});
  function refresh(){++photoEpoch;if(!host.hidden&&!dialog.open)render();}
  window.PQC_BALCONY={home:launch,leave,refresh};
  document.addEventListener('pqc:experience-mode',event=>{if(event.detail.mode==='simple')launch();else leave();});
  let lastPhotoScope=photoScope();
  function scopeChanged(){
    const next=photoScope();if(next===lastPhotoScope)return;lastPhotoScope=next;
    closeDialog();++photoEpoch;release(photoURLs);if(!host.hidden)render();
  }
  if(window.PQC_ACCOUNT)PQC_ACCOUNT.onUser(scopeChanged);
  if(window.PQC_SYNC)PQC_SYNC.onStatus(scopeChanged);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',launch,{once:true});else launch();
})();
