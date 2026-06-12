// ── DATA ──────────────────────────────────────────────────────
const KEY = 'flowra_v2';

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2)}

function initState(){
  try{const r=localStorage.getItem(KEY);if(r)return JSON.parse(r);}catch(e){}
  return{ user:null, plants:[] };   // user:null -> Willkommens-Screen
}

let S=initState();
function persist(){localStorage.setItem(KEY,JSON.stringify(S));}

// ── DATES ─────────────────────────────────────────────────────
function today(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function parseD(s){if(!s)return null;const d=new Date(s);return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function nextDate(last,interval){if(!last||!interval)return null;const d=parseD(last);return d?addDays(d,interval):null;}
function fmtD(s){if(!s)return'—';const d=parseD(s);return d?d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';}
function fmtObj(d){return d?d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';}
function todayISO(){return new Date().toISOString().split('T')[0];}

function status(next){
  if(!next)return{lbl:'—',cls:'b-none',u:99};
  const diff=Math.round((next-today())/86400000);
  if(diff<0)return{lbl:'⚠️ Fällig!',cls:'b-over',u:0};
  if(diff===0)return{lbl:'🔔 Heute!',cls:'b-today',u:1};
  if(diff<=2)return{lbl:'🔜 Bald',cls:'b-soon',u:2};
  return{lbl:'✅ OK',cls:'b-ok',u:3};
}

function urgency(p){
  return Math.min(
    status(nextDate(p.lastWatered,p.wateringInterval)).u,
    status(nextDate(p.lastFertilized,p.fertilizingInterval)).u
  );
}

// ── PHOTO DB (IndexedDB) ──────────────────────────────────────
let _db;
function openDB(){
  return new Promise((res,rej)=>{
    if(_db)return res(_db);
    const r=indexedDB.open('flowra_photos',1);
    r.onupgradeneeded=e=>e.target.result.createObjectStore('p');
    r.onsuccess=e=>{_db=e.target.result;res(_db);};
    r.onerror=rej;
  });
}
async function dbPut(k,v){const d=await openDB();return new Promise(res=>{const t=d.transaction('p','readwrite');t.objectStore('p').put(v,k);t.oncomplete=res;});}
async function dbGet(k){const d=await openDB();return new Promise(res=>{const r=d.transaction('p','readonly').objectStore('p').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);});}
async function dbDel(k){const d=await openDB();return new Promise(res=>{const t=d.transaction('p','readwrite');t.objectStore('p').delete(k);t.oncomplete=res;});}
async function dbAll(){const d=await openDB();return new Promise(res=>{const out={};const t=d.transaction('p','readonly').objectStore('p');const r=t.openCursor();r.onsuccess=e=>{const c=e.target.result;if(c){out[c.key]=c.value;c.continue();}else res(out);};r.onerror=()=>res({});});}

function resizeImg(file){
  return new Promise(res=>{
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>{
      let{width:w,height:h}=img,M=1200;
      if(w>M||h>M){if(w>h){h=h*M/w;w=M;}else{w=w*M/h;h=M;}}
      const c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',.78));
    };img.src=url;
  });
}

// ── NAVIGATION ────────────────────────────────────────────────
let currentPlantId=null;

function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  ['home','settings'].forEach(n=>{
    const el=document.getElementById('nb-'+n);
    if(el)el.classList.toggle('active',n===name);
  });
  if(name==='home')renderList();
  if(name==='settings')renderSettings();
}

// ── PLANT LIST ────────────────────────────────────────────────
function renderList(){
  const c=document.getElementById('plant-list');
  const mine=S.plants;
  if(!mine.length){
    c.innerHTML=`<div class="empty"><div class="empty-icon">🌱</div><h3>Noch keine Pflanzen</h3><p>Tippe unten auf <b>+</b>, um deine erste Pflanze hinzuzufügen.</p></div>`;
    return;
  }
  const sorted=[...mine].sort((a,b)=>urgency(a)-urgency(b));
  const need=sorted.filter(p=>urgency(p)<=1);
  const soon=sorted.filter(p=>urgency(p)===2);
  const ok=sorted.filter(p=>urgency(p)>=3);
  const groups=[
    {title:'Handlungsbedarf',items:need},
    {title:'Bald fällig',items:soon},
    {title:'Alles gut',items:ok},
  ];
  let html=`<div class="summary">
    <div class="sum-item sum-need"><div class="sum-num">${need.length}</div><div class="sum-lbl">Fällig</div></div>
    <div class="sum-item sum-soon"><div class="sum-num">${soon.length}</div><div class="sum-lbl">Bald</div></div>
    <div class="sum-item sum-ok"><div class="sum-num">${ok.length}</div><div class="sum-lbl">Alles gut</div></div>
  </div>`;
  groups.forEach(g=>{
    if(!g.items.length)return;
    html+=`<div class="sec">${g.title}</div>`;
    g.items.forEach(p=>{
      const ws=status(nextDate(p.lastWatered,p.wateringInterval));
      const fs=status(nextDate(p.lastFertilized,p.fertilizingInterval));
      html+=`<div class="plant-card" onclick="showPlant('${p.id}')">
        <div class="p-thumb" id="th-${p.id}">🌿</div>
        <div class="p-info">
          <div class="p-name">${esc(p.name)}</div>
          <div class="p-loc">${esc(p.currentLocation||'—')}</div>
          <div class="p-badges">
            <span class="badge ${ws.cls}">💧 ${ws.lbl}</span>
            <span class="badge ${fs.cls}">🌱 ${fs.lbl}</span>
          </div>
        </div>
        <div class="p-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>`;
    });
  });
  c.innerHTML=html;
  // async load first photo thumbnails
  mine.forEach(async p=>{
    if(p.photos&&p.photos.length){
      const data=await dbGet(p.photos[0]);
      if(data){const el=document.getElementById('th-'+p.id);if(el)el.innerHTML=`<img src="${data}" alt="">`;}
    }
  });
}

// ── PLANT DETAIL ──────────────────────────────────────────────
async function showPlant(id){
  currentPlantId=id;
  const p=S.plants.find(x=>x.id===id);if(!p)return;
  document.getElementById('d-name').textContent=p.name;
  document.getElementById('d-loc').textContent=p.currentLocation||'';
  const wn=nextDate(p.lastWatered,p.wateringInterval);
  const fn=nextDate(p.lastFertilized,p.fertilizingInterval);
  const ws=status(wn),fs=status(fn);
  document.getElementById('detail-body').innerHTML=`
    <div class="care-row">
      <div class="care-card">
        <div class="care-title">💧 Gießen</div>
        <div class="care-status">${ws.lbl}</div>
        <div class="care-dates">Letztes: ${fmtD(p.lastWatered)}<br>Nächstes: ${fmtObj(wn)}<br>Alle ${p.wateringInterval||'—'} Tage</div>
        <button class="care-btn" onclick="markWatered('${p.id}')">✔ Jetzt gegossen</button>
      </div>
      <div class="care-card">
        <div class="care-title">🌱 Düngen</div>
        <div class="care-status">${fs.lbl}</div>
        <div class="care-dates">Letztes: ${fmtD(p.lastFertilized)}<br>Nächstes: ${fmtObj(fn)}<br>Alle ${p.fertilizingInterval||'—'} Tage</div>
        <button class="care-btn" onclick="markFertilized('${p.id}')">✔ Jetzt gedüngt</button>
      </div>
    </div>
    <div class="info-card">
      <div class="info-row"><span class="info-lbl">Bester Standort</span><span class="info-val">${esc(p.bestLocation||'—')}</span></div>
      <div class="info-row"><span class="info-lbl">Aktueller Standort</span><span class="info-val">${esc(p.currentLocation||'—')}</span></div>
      <div class="info-row"><span class="info-lbl">Gekauft / Umgetopft</span><span class="info-val">${fmtD(p.purchasedDate)}</span></div>
      ${p.notes?`<div class="info-row"><span class="info-lbl">Notizen</span><span class="info-val">${esc(p.notes)}</span></div>`:''}
    </div>
    <div class="sec" style="margin-top:4px">Fotos</div>
    <div class="info-card" style="padding:12px 14px">
      <div class="photos-grid" id="pgrid"></div>
    </div>
    <button class="btn btn-primary" onclick="openAddPlant('${p.id}')">Bearbeiten</button>
    <button class="btn btn-danger" onclick="deletePlant('${p.id}')">Löschen</button>
  `;
  showView('detail');
  document.getElementById('nb-home').classList.add('active');
  await renderPhotos(p);
}

async function renderPhotos(p){
  const grid=document.getElementById('pgrid');if(!grid)return;
  let html='';
  for(const pid of(p.photos||[])){
    const d=await dbGet(pid);
    if(d)html+=`<div class="photo-wrap"><img src="${d}" onclick="previewImg('${pid}')" alt=""><button class="photo-del" onclick="removePhoto('${p.id}','${pid}')">✕</button></div>`;
  }
  html+=`<label class="add-photo" for="photo-input"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="4"/></svg>Foto</label>`;
  grid.innerHTML=html;
}

// ── CARE ACTIONS ──────────────────────────────────────────────
function markWatered(id){
  const p=S.plants.find(x=>x.id===id);if(!p)return;
  p.lastWatered=todayISO();persist();showPlant(id);toast('💧 Gegossen!');
}
function markFertilized(id){
  const p=S.plants.find(x=>x.id===id);if(!p)return;
  p.lastFertilized=todayISO();persist();showPlant(id);toast('🌱 Gedüngt!');
}

// ── ADD / EDIT PLANT ──────────────────────────────────────────
let _editId=null;

function openAddPlant(id){
  _editId=id||null;
  document.getElementById('form-title').textContent=id?'Pflanze bearbeiten':'Neue Pflanze';
  const p=id?S.plants.find(x=>x.id===id):null;
  document.getElementById('f-name').value=p?p.name:'';
  document.getElementById('f-loc').value=p?p.currentLocation||'':'';
  document.getElementById('f-bloc').value=p?p.bestLocation||'':'';
  document.getElementById('f-wi').value=p?p.wateringInterval||'':'';
  document.getElementById('f-lw').value=p?p.lastWatered||'':'';
  document.getElementById('f-fi').value=p?p.fertilizingInterval||'':'';
  document.getElementById('f-lf').value=p?p.lastFertilized||'':'';
  document.getElementById('f-pur').value=p?p.purchasedDate||'':'';
  document.getElementById('f-notes').value=p?p.notes||'':'';
  document.getElementById('ov-plant').classList.add('open');
}

function savePlant(){
  const name=document.getElementById('f-name').value.trim();
  if(!name){toast('Bitte einen Namen eingeben.');return;}
  const d={
    name,
    currentLocation:document.getElementById('f-loc').value.trim(),
    bestLocation:document.getElementById('f-bloc').value.trim(),
    wateringInterval:parseInt(document.getElementById('f-wi').value)||null,
    lastWatered:document.getElementById('f-lw').value||null,
    fertilizingInterval:parseInt(document.getElementById('f-fi').value)||null,
    lastFertilized:document.getElementById('f-lf').value||null,
    purchasedDate:document.getElementById('f-pur').value||null,
    notes:document.getElementById('f-notes').value.trim(),
  };
  if(_editId){const p=S.plants.find(x=>x.id===_editId);if(p)Object.assign(p,d);}
  else{S.plants.push({...d,id:uid(),photos:[]});}
  persist();
  document.getElementById('ov-plant').classList.remove('open');
  if(_editId){showPlant(_editId);toast('Gespeichert!');}
  else{showView('home');toast('Pflanze hinzugefügt!');}
}

function deletePlant(id){
  const p=S.plants.find(x=>x.id===id);if(!p)return;
  if(!confirm(`"${p.name}" wirklich löschen?`))return;
  S.plants=S.plants.filter(x=>x.id!==id);
  persist();showView('home');toast('Pflanze gelöscht.');
}

// ── PHOTOS ────────────────────────────────────────────────────
document.getElementById('photo-input').addEventListener('change',async function(e){
  if(!currentPlantId)return;
  const p=S.plants.find(x=>x.id===currentPlantId);if(!p)return;
  for(const f of Array.from(e.target.files)){
    const data=await resizeImg(f);
    const pid=uid();
    p.photos=[...(p.photos||[]),pid];
    await dbPut(pid,data);
  }
  this.value='';persist();
  await renderPhotos(p);toast('Foto hinzugefügt!');
});

async function removePhoto(plantId,photoId){
  if(!confirm('Foto löschen?'))return;
  const p=S.plants.find(x=>x.id===plantId);if(!p)return;
  p.photos=(p.photos||[]).filter(x=>x!==photoId);
  await dbDel(photoId);persist();
  await renderPhotos(p);
}

async function previewImg(photoId){
  const data=await dbGet(photoId);if(!data)return;
  document.getElementById('img-prev-src').src=data;
  document.getElementById('img-prev').classList.add('open');
}
function closeImgPreview(){document.getElementById('img-prev').classList.remove('open');}

// ── WILLKOMMEN (Name beim ersten Start) ───────────────────────
function showWelcome(){
  document.getElementById('gate').classList.remove('hidden');
  setTimeout(()=>{const i=document.getElementById('gate-name');if(i)i.focus();},300);
}

function finishWelcome(){
  const inp=document.getElementById('gate-name');
  const name=inp.value.trim();
  if(!name){inp.classList.add('err');inp.focus();setTimeout(()=>inp.classList.remove('err'),450);return;}
  S.user={name,avatar:'🌱'};persist();renderChip();
  document.getElementById('gate').classList.add('hidden');
  showView('home');toast('Willkommen, '+name+'! 🌿');
}

// ── PROFIL (ein Profil pro Gerät) ─────────────────────────────
function renderChip(){
  const u=S.user;if(!u)return;
  document.getElementById('user-chip').textContent=(u.avatar||'🌱')+' '+u.name;
  const g=document.getElementById('greet-name');
  if(g)g.textContent='Hallo, '+u.name;
}

function renameUser(){
  const name=prompt('Wie heißt du?',S.user?S.user.name:'');
  if(name===null||!name.trim())return;
  S.user.name=name.trim();persist();renderChip();
  if(document.getElementById('view-settings').classList.contains('active'))renderSettings();
  toast('Name geändert');
}

// ── SETTINGS ──────────────────────────────────────────────────
function renderSettings(){
  document.getElementById('settings-body').innerHTML=`
    <div class="sec">Profil</div>
    <div class="s-section">
      <div class="s-item" onclick="renameUser()">
        <span>${S.user?S.user.avatar+' '+esc(S.user.name):'—'}</span>
        <span class="s-val">Name ändern →</span>
      </div>
    </div>
    <div class="sec">Daten</div>
    <div class="s-section">
      <div class="s-item" onclick="exportData()"><span>Daten exportieren</span><span class="s-val">Teilen →</span></div>
      <div class="s-item" onclick="importData()"><span>Daten importieren</span><span class="s-val">Einfügen →</span></div>
    </div>
    <div class="sec">Info</div>
    <div class="s-section">
      <div class="s-item"><span>Pflanzen</span><span class="s-val">${S.plants.length}</span></div>
      <div class="s-item"><span>Version</span><span class="s-val">2.0</span></div>
    </div>
    <p style="font-size:12px;color:var(--text-muted);text-align:center;padding:16px 0;line-height:1.6">
      Daten werden lokal auf diesem Gerät gespeichert.<br>
      Nutze Export/Import zum Übertragen auf ein anderes Gerät.
    </p>
  `;
}

async function exportData(){
  const photos=await dbAll();
  const payload=JSON.stringify({...S,_photos:photos});
  if(navigator.share){
    try{await navigator.share({text:payload,title:'Flowra Pflanzendaten'});return;}catch(e){}
  }
  try{await navigator.clipboard.writeText(payload);toast('Daten in Zwischenablage kopiert!');}
  catch(e){
    const ta=document.createElement('textarea');ta.value=payload;
    document.body.appendChild(ta);ta.select();document.execCommand('copy');
    document.body.removeChild(ta);toast('Daten in Zwischenablage kopiert!');
  }
}

async function importData(){
  const txt=prompt('Exportierte Daten hier einfügen:');
  if(!txt)return;
  try{
    const parsed=JSON.parse(txt);
    if(!parsed.plants||!parsed.user)throw new Error('Ungültiges Format');
    const photos=parsed._photos||{};
    delete parsed._photos;
    S=parsed;persist();
    for(const[k,v]of Object.entries(photos))await dbPut(k,v);
    renderChip();
    document.getElementById('gate').classList.add('hidden');
    showView('home');toast('Daten importiert!');
  }catch(e){alert('Fehler: '+e.message);}
}

// ── OVERLAY / UTILS ───────────────────────────────────────────
function closeOverlay(id,e){
  if(e&&e.target!==document.getElementById(id))return;
  document.getElementById(id).classList.remove('open');
}

function esc(s){
  if(!s)return'';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _toastT;
function toast(msg){
  const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');
  clearTimeout(_toastT);_toastT=setTimeout(()=>el.classList.remove('show'),2200);
}

// ── INIT ──────────────────────────────────────────────────────
renderChip();
if(S.user){
  document.getElementById('gate').classList.add('hidden');
  renderList();
}else{
  showWelcome();
}
