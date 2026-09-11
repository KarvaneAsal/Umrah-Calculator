/* Karvan-e-Asal A1.0.70 — Supplier / Vendor Architecture
 * Supplier master data is stored through the existing app_config key/value path.
 * Booking supplier links and frozen supplier costs remain embedded in the existing Quote/Booking payload.
 * No Supabase schema changes and no second financial calculation engine.
 */
(function(){
  'use strict';
  const VERSION='A1.0.70', CONFIG_KEY='suppliers', LOCAL_KEY='keaSuppliersV1';
  const TYPES=['Hotel','Airline','Transport','Visa Provider','Other'];
  const clone=o=>{try{return JSON.parse(JSON.stringify(o))}catch(e){return o}};
  const str=v=>String(v??'').trim();
  const esc=s=>str(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>Number.isFinite(Number(v))?Math.round(Number(v)*100)/100:0;
  function uid(){const r=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);return 'SUP-'+r.replace(/-/g,'').slice(0,12).toUpperCase();}
  function normSupplier(s){
    s=s&&typeof s==='object'?s:{};
    return {supplierId:str(s.supplierId)||uid(),name:str(s.name),type:TYPES.includes(s.type)?s.type:'Other',contact:str(s.contact),phone:str(s.phone),email:str(s.email),currency:str(s.currency||'SAR').toUpperCase(),active:s.active!==false,notes:str(s.notes),createdAt:str(s.createdAt)||new Date().toISOString(),updatedAt:str(s.updatedAt)||new Date().toISOString()};
  }
  function loadLocal(){try{const a=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');return Array.isArray(a)?a.map(normSupplier):[]}catch(e){return []}}
  let suppliers=loadLocal();
  function setSuppliers(a){suppliers=(Array.isArray(a)?a:[]).map(normSupplier);try{localStorage.setItem(LOCAL_KEY,JSON.stringify(suppliers))}catch(e){};window.suppliers=suppliers;return suppliers}
  setSuppliers(suppliers);
  function isAdmin(){return typeof isSuperAdmin==='function'&&isSuperAdmin()}
  function online(){return !!window.KARVAN_ONLINE?.enabled&&!!window.KARVAN_ONLINE.sb}
  async function remoteLoad(){
    if(!online())return;
    try{const {data,error}=await window.KARVAN_ONLINE.sb.from('app_config').select('value').eq('key',CONFIG_KEY).maybeSingle();if(error||data==null)return;let v=data.value;if(typeof v==='string'){try{v=JSON.parse(v)}catch(e){return}};if(Array.isArray(v))setSuppliers(v)}catch(e){console.warn('[Suppliers] remote load unavailable',e)}
  }
  async function persist(){
    setSuppliers(suppliers);
    if(!online()||!isAdmin())return true;
    try{const {data:{user}}=await window.KARVAN_ONLINE.sb.auth.getUser();if(!user)return false;const {error}=await window.KARVAN_ONLINE.sb.from('app_config').upsert({key:CONFIG_KEY,value:clone(suppliers),updated_by:user.id,updated_at:new Date().toISOString()});if(error){console.warn('[Suppliers] remote save unavailable',error);return false}return true}catch(e){console.warn('[Suppliers] remote save failed',e);return false}
  }
  function get(id){return suppliers.find(s=>s.supplierId===id)||null}
  function findByName(name,type){const n=str(name).toLowerCase();if(!n)return null;return suppliers.find(s=>s.active!==false&&(!type||s.type===type)&&s.name.toLowerCase()===n)||null}
  function refsForQuote(x){
    const out=[], add=(s,role,source)=>{if(s&&!out.some(r=>r.supplierId===s.supplierId&&r.role===role))out.push({supplierId:s.supplierId,role,name:s.name,type:s.type,source})};
    (x.stays||[]).forEach(s=>add(findByName(s.provider,'Hotel')||findByName(s.hotel,'Hotel'),'hotel',s.hotel||s.provider));
    (x.flightSegments||x.flights||[]).forEach(f=>add(findByName(f.airline,'Airline')||findByName(f.airlineCode,'Airline'),'airline',f.airline||f.airlineCode));
    (x.transportServices||[]).forEach(t=>add(findByName(t.name,'Transport'),'transport',t.name));
    (x.transport||[]).forEach(t=>add(findByName(t.name,'Transport'),'transport',t.name));
    (x.visaSelection&&x.visaSelection.provider? [x.visaSelection.provider]:[]).forEach(n=>add(findByName(n,'Visa Provider'),'visa',n));
    if(x.visaProvider)add(findByName(x.visaProvider,'Visa Provider'),'visa',x.visaProvider);
    return out;
  }
  function attach(x){
    if(!x||typeof x!=='object')return x;
    const refs=refsForQuote(x); if(refs.length)x.supplierRefs=refs; else if(!Array.isArray(x.supplierRefs))x.supplierRefs=[];
    if(!Array.isArray(x.supplierCosts))x.supplierCosts=[];
    x.supplierModelVersion=VERSION;
    return x;
  }
  function addCost(x,cost){
    if(!x||typeof x!=='object')return false; const s=get(cost?.supplierId); if(!s)return false;
    x.supplierCosts=Array.isArray(x.supplierCosts)?x.supplierCosts:[];
    x.supplierCosts.push({costId:cost.costId||uid(),supplierId:s.supplierId,supplierName:s.name,category:str(cost.category||'service'),description:str(cost.description),qty:Math.max(1,Number(cost.qty)||1),unitCost:money(cost.unitCost),currency:str(cost.currency||s.currency||'SAR').toUpperCase(),totalCost:money((Number(cost.qty)||1)*Number(cost.unitCost||0)),status:str(cost.status||'estimated'),frozenAt:new Date().toISOString(),notes:str(cost.notes)});
    return true;
  }
  function summary(x){const y=attach(clone(x||{}));const costs=Array.isArray(y.supplierCosts)?y.supplierCosts:[];return {supplierRefs:y.supplierRefs||[],supplierCosts:costs,totalSupplierCost:money(costs.reduce((a,c)=>a+(Number(c.totalCost)||0),0))};}
  function render(){
    const root=document.getElementById('keaSupplierBody');if(!root)return;
    root.innerHTML='<div class="notice">Suppliers are master records for operational linking. Supplier costs are informational/frozen procurement data and do not replace the booking financial engine.</div>'+
      '<div class="grid2" style="margin-top:10px"><div class="field"><label>Supplier Name</label><input id="keaSupName" placeholder="Hotel, airline, transport provider..." '+(isAdmin()?'':'disabled')+'></div><div class="field"><label>Type</label><select id="keaSupType" '+(isAdmin()?'':'disabled')+'>'+TYPES.map(t=>'<option>'+t+'</option>').join('')+'</select></div><div class="field"><label>Contact Person</label><input id="keaSupContact" '+(isAdmin()?'':'disabled')+'></div><div class="field"><label>Phone</label><input id="keaSupPhone" '+(isAdmin()?'':'disabled')+'></div><div class="field"><label>Email</label><input id="keaSupEmail" type="email" '+(isAdmin()?'':'disabled')+'></div><div class="field"><label>Currency</label><input id="keaSupCurrency" value="SAR" maxlength="3" '+(isAdmin()?'':'disabled')+'></div></div>'+
      (isAdmin()?'<div style="margin-top:8px"><button class="btn primary" type="button" onclick="window.KEA_SUPPLIERS.addFromForm()">+ Add Supplier</button></div>':'<div class="muted" style="margin-top:8px">Only Super Admin can create or edit supplier master records.</div>')+
      '<div class="tablewrap" style="margin-top:12px"><table class="table"><thead><tr><th>Supplier</th><th>Type</th><th>Contact</th><th>Currency</th><th>Status</th><th>Action</th></tr></thead><tbody>'+suppliers.map((s,i)=>'<tr><td><strong>'+esc(s.name||'Unnamed')+'</strong><div class="muted">'+esc(s.supplierId)+'</div></td><td>'+esc(s.type)+'</td><td>'+esc(s.phone||s.email||s.contact||'—')+'</td><td>'+esc(s.currency)+'</td><td>'+ (s.active?'Active':'Inactive')+'</td><td>'+(isAdmin()?'<button class="btn outline" type="button" onclick="window.KEA_SUPPLIERS.edit('+i+')">Edit</button> <button class="btn danger" type="button" onclick="window.KEA_SUPPLIERS.remove('+i+')">Delete</button>':'View only')+'</td></tr>').join('')+'</tbody></table></div>';
  }
  async function addFromForm(){if(!isAdmin())return alert('Only Super Admin can add suppliers.');const name=str(document.getElementById('keaSupName')?.value);if(!name)return alert('Supplier name is required.');if(suppliers.some(s=>s.name.toLowerCase()===name.toLowerCase()))return alert('A supplier with this name already exists.');suppliers.push(normSupplier({name,type:document.getElementById('keaSupType')?.value,contact:document.getElementById('keaSupContact')?.value,phone:document.getElementById('keaSupPhone')?.value,email:document.getElementById('keaSupEmail')?.value,currency:document.getElementById('keaSupCurrency')?.value||'SAR'}));if(!(await persist()))return alert('Supplier saved locally, but remote Supabase sync was unavailable.');render()}
  async function edit(i){if(!isAdmin())return;const s=suppliers[i];if(!s)return;const name=prompt('Supplier name',s.name);if(name===null)return;if(!str(name))return alert('Name is required.');const type=prompt('Type ('+TYPES.join(', ')+')',s.type);if(type===null||!TYPES.includes(str(type)))return alert('Invalid supplier type.');s.name=str(name);s.type=str(type);s.phone=str(prompt('Phone',s.phone)||'');s.email=str(prompt('Email',s.email)||'');s.currency=str(prompt('Currency',s.currency)||s.currency).toUpperCase();s.updatedAt=new Date().toISOString();if(!(await persist()))return alert('Supplier saved locally, but remote Supabase sync was unavailable.');render()}
  async function remove(i){if(!isAdmin())return;const s=suppliers[i];if(!s)return;if(!confirm('Delete supplier '+s.name+'? Existing booking supplier snapshots will remain unchanged.'))return;suppliers.splice(i,1);if(!(await persist()))return alert('Supplier removed locally, but remote Supabase sync was unavailable.');render()}
  function mount(){const settings=document.getElementById('settings');if(!settings||document.getElementById('keaSupplierCard'))return;const card=document.createElement('div');card.className='card';card.id='keaSupplierCard';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Supplier / Vendor Management</h3><div class="muted">Hotels, airlines, transport, visa providers and other service vendors.</div></div></div><div id="keaSupplierBody"></div>';const version=settings.querySelector('.software-version')?.closest('.card');if(version)settings.insertBefore(card,version);else settings.appendChild(card);render()}
  window.KEA_SUPPLIERS={version:VERSION,get,findByName,attach,refsForQuote,addCost,summary,render,addFromForm,edit,remove,list:()=>clone(suppliers)};
  window.keaAttachSupplierRefs=attach;
  const oldSave=window.saveQuotes;
  if(typeof oldSave==='function')window.saveQuotes=function(){(Array.isArray(window.quotes)?window.quotes:[]).forEach(attach);return oldSave.apply(this,arguments)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(mount,300);remoteLoad().then(render)});else{setTimeout(mount,300);remoteLoad().then(render)}
  window.PHASE1_A1070={version:VERSION,feature:'supplier vendor architecture',architecture:'github+supabase',masterStorage:'existing app_config key/value',recordStorage:'existing quote booking payload',schemaChanges:false,financialSourceOfTruth:'existing calculation engine'};
})();
