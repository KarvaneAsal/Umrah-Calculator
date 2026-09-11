/* Karvan-e-Asal A1.0.71 — Inventory / Availability Architecture
 * Availability is an operational layer. It derives reservations from existing quote records
 * and stores optional resource capacity in the existing app_config key/value path.
 * It never replaces the financial engine and never creates a second booking store.
 */
(function(){
  'use strict';
  const VERSION='A1.0.71', CONFIG_KEY='inventory_resources', LOCAL_KEY='keaInventoryV1';
  const TYPES=['Hotel Room','Flight','Transport','Visa','Extra','General'];
  const clone=o=>{try{return JSON.parse(JSON.stringify(o))}catch(e){return o}};
  const str=v=>String(v??'').trim();
  const esc=s=>str(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const uid=()=>{const r=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);return 'INV-'+r.replace(/-/g,'').slice(0,12).toUpperCase()};
  const key=v=>str(v).toLowerCase().replace(/\s+/g,' ').trim();
  function stableKey(type,name,extra){return key([type,name,extra||''].join('|'))}
  function normResource(r){
    r=r&&typeof r==='object'?r:{};
    const capacity=(r.capacity===null||r.capacity===undefined||r.capacity==='')?null:Math.max(0,num(r.capacity));
    return {inventoryId:str(r.inventoryId)||uid(),type:TYPES.includes(r.type)?r.type:'General',name:str(r.name),resourceKey:str(r.resourceKey)||stableKey(r.type||'General',r.name,r.context),capacity,unit:str(r.unit||'unit'),active:r.active!==false,context:str(r.context),notes:str(r.notes),createdAt:str(r.createdAt)||new Date().toISOString(),updatedAt:str(r.updatedAt)||new Date().toISOString()};
  }
  function loadLocal(){try{const a=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');return Array.isArray(a)?a.map(normResource):[]}catch(e){return []}}
  let resources=loadLocal();
  function setResources(a){resources=(Array.isArray(a)?a:[]).map(normResource);try{localStorage.setItem(LOCAL_KEY,JSON.stringify(resources))}catch(e){};window.KEA_INVENTORY_RESOURCES=resources;return resources}
  setResources(resources);
  const isAdmin=()=>typeof isSuperAdmin==='function'&&isSuperAdmin();
  const online=()=>!!window.KARVAN_ONLINE?.enabled&&!!window.KARVAN_ONLINE.sb;
  async function remoteLoad(){
    if(!online())return;
    try{const {data,error}=await window.KARVAN_ONLINE.sb.from('app_config').select('value').eq('key',CONFIG_KEY).maybeSingle();if(error||data==null)return;let v=data.value;if(typeof v==='string'){try{v=JSON.parse(v)}catch(e){return}};if(Array.isArray(v))setResources(v)}catch(e){console.warn('[Inventory] remote load unavailable',e)}
  }
  async function persist(){
    setResources(resources);if(!online()||!isAdmin())return true;
    try{const {data:{user}}=await window.KARVAN_ONLINE.sb.auth.getUser();if(!user)return false;const {error}=await window.KARVAN_ONLINE.sb.from('app_config').upsert({key:CONFIG_KEY,value:clone(resources),updated_by:user.id,updated_at:new Date().toISOString()});if(error){console.warn('[Inventory] remote save unavailable',error);return false}return true}catch(e){console.warn('[Inventory] remote save failed',e);return false}
  }
  function get(id){return resources.find(r=>r.inventoryId===id)||null}
  function find(type,resourceKey){const k=key(resourceKey);return resources.find(r=>r.active!==false&&r.type===type&&key(r.resourceKey)===k)||null}
  function resource(type,name,context){const k=stableKey(type,name,context);return find(type,k)||null}
  function ensure(type,name,context,unit){
    if(!str(name))return null;let r=resource(type,name,context);if(r)return r;
    r=normResource({type,name,context,unit,resourceKey:stableKey(type,name,context),capacity:null});resources.push(r);setResources(resources);return r;
  }
  function passengerCount(x){return Math.max(0,num(x?.adults)+num(x?.childBed)+num(x?.childNoBed)+num(x?.infants))}
  function dateOverlap(aStart,aEnd,bStart,bEnd){
    if(!aStart||!bStart)return true;
    const a=new Date(aStart), b=new Date(aEnd||aStart), c=new Date(bStart), d=new Date(bEnd||bStart);
    if([a,b,c,d].some(x=>Number.isNaN(x.getTime())))return false;
    return a<=d&&c<=b;
  }
  function bookingState(x){return ['confirmed','ongoing','completed'].includes(key(x?.status))}
  function usageFor(r,quotes){
    const list=Array.isArray(quotes)?quotes:[];let used=0, entries=[];
    list.forEach(x=>{
      if(!x||!bookingState(x)||String(x.status).toLowerCase()==='cancelled')return;
      const add=(qty,start,end,source)=>{if(qty<=0)return;if(r.type==='Hotel Room'&&r.context&&source.context&&!dateOverlap(start,end,source.start,source.end))return;used+=qty;entries.push({reference:x.reference||'',qty,start:start||'',end:end||'',source:source.label||source.name||''})};
      if(r.type==='Hotel Room'){
        (x.stays||[]).forEach(s=>{const name=s.hotel||'',ctx=[s.city||'',s.room||s.roomType||''].join('|');if(stableKey(r.type,name,ctx)!==r.resourceKey)return;add(Math.max(0,num(s.rooms)||0),s.checkIn||s.in,s.checkOut||s.out,{label:name,context:{start:s.checkIn||s.in,end:s.checkOut||s.out},start:s.checkIn||s.in,end:s.checkOut||s.out})});
      }else if(r.type==='Flight'){
        (x.flightSegments||x.flights||[]).forEach(f=>{const name=f.flightNumber||f.flight||f.airlineCode||f.airline||'',ctx=[f.fromAirport||f.from||'',f.toAirport||f.to||'',f.date||''].join('|');if(stableKey(r.type,name,ctx)!==r.resourceKey)return;add(passengerCount(x),f.date,f.date,{label:name})});
      }else if(r.type==='Transport'){
        (x.transportServices||x.transport||[]).forEach(t=>{const name=t.name||'';if(stableKey(r.type,name,'')!==r.resourceKey)return;add(Math.max(0,num(t.qty)||1),t.date,t.date,{label:name})});
      }else if(r.type==='Visa'){
        const name=x.visaSelection?.type||x.visa||'';if(stableKey(r.type,name,'')===r.resourceKey)add(passengerCount(x),'','',{label:name});
      }else if(r.type==='Extra'){
        const arr=Array.isArray(x.extraItems)?x.extraItems:(x.extras||[]).map(n=>({name:n,qty:1}));arr.forEach(t=>{const name=t.name||t;if(stableKey(r.type,name,'')!==r.resourceKey)return;add(Math.max(0,num(t.qty)||1),'','',{label:name})});
      }
    });
    return {used,entries};
  }
  function availability(r,quotes){
    r=typeof r==='string'?get(r):r;if(!r)return {configured:false,capacity:null,used:0,available:null,status:'unknown',entries:[]};
    const u=usageFor(r,quotes||window.quotes);const configured=r.capacity!==null&&r.capacity!==undefined;
    const available=configured?Math.max(0,num(r.capacity)-u.used):null;
    return {configured,capacity:configured?num(r.capacity):null,used:u.used,available,status:!r.active?'inactive':!configured?'unlimited':available<=0?'full':available<=Math.max(1,num(r.capacity)*0.1)?'low':'available',entries:u.entries};
  }
  function checkQuote(x){
    const issues=[];if(!x)return {valid:true,issues};
    const add=(r,qty,label)=>{if(!r||r.capacity===null||r.capacity===undefined)return;const a=availability(r,(window.quotes||[]).filter(z=>z!==x));if(a.used+qty>num(r.capacity))issues.push(label+': availability exceeded ('+(a.used+qty)+' / '+r.capacity+').')};
    (x.stays||[]).forEach(s=>{const r=resource('Hotel Room',s.hotel||'',[(s.city||''),(s.room||s.roomType||'')].join('|'));add(r,Math.max(0,num(s.rooms)||0),'Hotel '+(s.hotel||'room'))});
    (x.flightSegments||x.flights||[]).forEach(f=>{const r=resource('Flight',f.flightNumber||f.flight||f.airlineCode||f.airline||'',[f.fromAirport||f.from||'',f.toAirport||f.to||'',f.date||''].join('|'));add(r,passengerCount(x),'Flight '+(f.flightNumber||f.flight||'segment'))});
    (x.transportServices||x.transport||[]).forEach(t=>{const r=resource('Transport',t.name||'', '');add(r,Math.max(0,num(t.qty)||1),'Transport '+(t.name||''))});
    const vn=x.visaSelection?.type||x.visa||'';if(vn)add(resource('Visa',vn,''),passengerCount(x),'Visa '+vn);
    const ex=Array.isArray(x.extraItems)?x.extraItems:(x.extras||[]).map(n=>({name:n,qty:1}));ex.forEach(t=>{const n=t.name||t;add(resource('Extra',n,''),Math.max(0,num(t.qty)||1),'Extra '+n)});
    return {valid:issues.length===0,issues};
  }
  function syncQuote(x){
    if(!x||typeof x!=='object')return x;
    const refs=[];const add=(r,role,source)=>{if(r&&!refs.some(v=>v.inventoryId===r.inventoryId&&v.role===role&&v.source===source))refs.push({inventoryId:r.inventoryId,role,source,name:r.name,type:r.type})};
    (x.stays||[]).forEach(s=>add(resource('Hotel Room',s.hotel||'',[(s.city||''),(s.room||s.roomType||'')].join('|')),'hotel',s.hotel||''));
    (x.flightSegments||x.flights||[]).forEach(f=>add(resource('Flight',f.flightNumber||f.flight||f.airlineCode||f.airline||'',[f.fromAirport||f.from||'',f.toAirport||f.to||'',f.date||''].join('|')),'flight',f.flightNumber||f.flight||''));
    (x.transportServices||x.transport||[]).forEach(t=>add(resource('Transport',t.name||'', ''),'transport',t.name||''));
    const vn=x.visaSelection?.type||x.visa||'';if(vn)add(resource('Visa',vn,''),'visa',vn);
    const ex=Array.isArray(x.extraItems)?x.extraItems:(x.extras||[]).map(n=>({name:n}));ex.forEach(t=>add(resource('Extra',t.name||'', ''),'extra',t.name||''));
    x.inventoryRefs=refs;x.inventoryModelVersion=VERSION;return x;
  }
  function rebuildCatalog(){
    const add=(type,name,context,unit)=>{if(str(name))ensure(type,name,context,unit)};
    const roomTypes=['Sharing','Double','Triple','Quad','Quint','Full Room'];(window.hotels||[]).forEach(h=>roomTypes.forEach(rt=>add('Hotel Room',h?.[1]||'',[(h?.[0]||''),rt].join('|'),'room')));
    (window.airlines||[]).forEach(a=>add('General',a?.[0]||'','airline','resource'));
    (window.transport||[]).forEach(t=>add('Transport',t?.name||'','',t?.unit||'unit'));
    (window.extras||[]).forEach(e=>add('Extra',e?.name||'','',e?.unit||'unit'));
    (window.visaTypes||[]).forEach(v=>add('Visa',v?.name||'','passenger','passenger'));
    setResources(resources);render();return resources.length;
  }
  function render(){
    const root=document.getElementById('keaInventoryBody');if(!root)return;
    const rows=resources.map((r,i)=>{const a=availability(r);return '<tr><td><strong>'+esc(r.name||'Unnamed')+'</strong><div class="muted">'+esc(r.inventoryId)+'</div></td><td>'+esc(r.type)+'</td><td>'+esc(r.context||'—')+'</td><td>'+esc(r.capacity===null?'Unlimited':String(r.capacity))+'</td><td>'+esc(String(a.used))+'</td><td>'+esc(a.available===null?'—':String(a.available))+'</td><td>'+esc(a.status)+'</td><td>'+(isAdmin()?'<button class="btn outline" type="button" onclick="window.KEA_INVENTORY.edit('+i+')">Edit</button> <button class="btn danger" type="button" onclick="window.KEA_INVENTORY.remove('+i+')">Delete</button>':'View only')+'</td></tr>'}).join('');
    root.innerHTML='<div class="notice">Availability is operational only. Confirmed/Ongoing/Completed bookings consume configured capacity; Draft and Cancelled records do not. Unlimited resources remain non-blocking. Financial totals are never recalculated here.</div><div class="grid2" style="margin-top:10px"><div class="field"><label>Resource Name</label><input id="keaInvName" placeholder="Hotel room, flight, transport..." '+(isAdmin()?'':'disabled')+'></div><div class="field"><label>Type</label><select id="keaInvType" '+(isAdmin()?'':'disabled')+'>'+TYPES.map(t=>'<option>'+t+'</option>').join('')+'</select></div><div class="field"><label>Capacity</label><input id="keaInvCapacity" type="number" min="0" placeholder="Leave empty = unlimited" '+(isAdmin()?'':'disabled')+'></div><div class="field"><label>Unit</label><input id="keaInvUnit" value="unit" '+(isAdmin()?'':'disabled')+'></div><div class="field" style="grid-column:span 2"><label>Context / Resource Key Hint</label><input id="keaInvContext" placeholder="Optional route, city, room type or other context" '+(isAdmin()?'':'disabled')+'></div></div>'+(isAdmin()?'<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" onclick="window.KEA_INVENTORY.addFromForm()">+ Add Resource</button><button class="btn outline" type="button" onclick="window.KEA_INVENTORY.rebuildCatalog()">Sync Existing Catalogs</button></div>':'<div class="muted" style="margin-top:8px">Only Super Admin can create or edit availability capacity.</div>')+'<div class="tablewrap" style="margin-top:12px"><table class="table"><thead><tr><th>Resource</th><th>Type</th><th>Context</th><th>Capacity</th><th>Used</th><th>Available</th><th>Status</th><th>Action</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }
  async function addFromForm(){
    if(!isAdmin())return alert('Only Super Admin can add inventory resources.');
    const name=str(document.getElementById('keaInvName')?.value),type=str(document.getElementById('keaInvType')?.value)||'General',context=str(document.getElementById('keaInvContext')?.value),unit=str(document.getElementById('keaInvUnit')?.value)||'unit',cap=document.getElementById('keaInvCapacity')?.value;
    if(!name)return alert('Resource name is required.');const r=normResource({name,type,context,unit,capacity:cap===''?null:Math.max(0,num(cap)),resourceKey:stableKey(type,name,context)});if(resources.some(x=>x.resourceKey===r.resourceKey&&x.type===r.type))return alert('This inventory resource already exists.');resources.push(r);if(!(await persist()))return alert('Resource saved locally, but remote Supabase sync was unavailable.');render();
  }
  async function edit(i){
    if(!isAdmin())return;const r=resources[i];if(!r)return;const name=prompt('Resource name',r.name);if(name===null)return;const cap=prompt('Capacity (leave blank for unlimited)',r.capacity===null?'':String(r.capacity));if(cap===null)return;const active=prompt('Active? (yes/no)',r.active?'yes':'no');if(active===null)return;r.name=str(name)||r.name;r.capacity=str(cap)===''?null:Math.max(0,num(cap));r.active=!/^no|false|0$/i.test(str(active));r.updatedAt=new Date().toISOString();r.resourceKey=stableKey(r.type,r.name,r.context);if(!(await persist()))return alert('Resource saved locally, but remote Supabase sync was unavailable.');render();
  }
  async function remove(i){if(!isAdmin())return;const r=resources[i];if(!r)return;if(!confirm('Delete '+r.name+'? Existing booking inventory snapshots/refs remain unchanged.'))return;resources.splice(i,1);if(!(await persist()))return alert('Resource removed locally, but remote Supabase sync was unavailable.');render()}
  function mount(){const settings=document.getElementById('settings');if(!settings||document.getElementById('keaInventoryCard'))return;const card=document.createElement('div');card.className='card';card.id='keaInventoryCard';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Inventory / Availability Management</h3><div class="muted">Track capacity and live operational usage without changing booking financials.</div></div></div><div id="keaInventoryBody"></div>';const supplier=document.getElementById('keaSupplierCard');if(supplier)supplier.insertAdjacentElement('afterend',card);else{const version=settings.querySelector('.software-version')?.closest('.card');if(version)settings.insertBefore(card,version);else settings.appendChild(card)}render()}
  window.KEA_INVENTORY={version:VERSION,get,find,resource,ensure,availability,checkQuote,syncQuote,rebuildCatalog,render,addFromForm,edit,remove,list:()=>clone(resources)};
  window.keaInventoryCheck=checkQuote;
  const oldSave=window.saveQuotes;
  if(typeof oldSave==='function')window.saveQuotes=function(){(Array.isArray(window.quotes)?window.quotes:[]).forEach(syncQuote);return oldSave.apply(this,arguments)};
  const oldFinish=window.finishQuote;
  if(typeof oldFinish==='function')window.finishQuote=async function(){
    const x=window.q;const v=checkQuote(x);
    if(!v.valid){alert('Availability check failed:\n\n'+v.issues.join('\n'));return;}
    return oldFinish.apply(this,arguments);
  };
  const oldFinishService=window.finishServiceOnly;
  if(typeof oldFinishService==='function')window.finishServiceOnly=async function(){const v=checkQuote(window.q);if(!v.valid){alert('Availability check failed:\n\n'+v.issues.join('\n'));return;}return oldFinishService.apply(this,arguments)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(mount,350);remoteLoad().then(render)});else{setTimeout(mount,350);remoteLoad().then(render)}
  window.PHASE1_A1071={version:VERSION,feature:'inventory availability architecture',architecture:'github+supabase',masterStorage:'existing app_config key/value',recordStorage:'existing quote booking payload',schemaChanges:false,availabilitySource:'derived from existing booking records',financialSourceOfTruth:'existing calculation engine'};
})();
