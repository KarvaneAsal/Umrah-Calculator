/*
 * Karvan-e-Asal A1.0.69 — Customer / CRM Architecture
 * GitHub module; customer identity is embedded in existing Quote/Booking payloads.
 * No Supabase schema changes are required by this module.
 */
(function(){
  'use strict';
  const VERSION='A1.0.69';
  const SERVICE_LABELS={umrah:'Umrah',hajj:'Hajj',tourism:'Tourism',visaOnly:'Visa-Only',ticketOnly:'Ticket-Only'};
  const clone=o=>{try{return JSON.parse(JSON.stringify(o||{}))}catch(e){return {}}};
  const str=v=>String(v??'').trim();
  const esc=s=>str(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function norm(v){return str(v).toLowerCase().replace(/\s+/g,' ').replace(/[^a-z0-9+@._ -]/g,'').trim();}
  function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return ('00000000'+(h>>>0).toString(16)).slice(-8);}
  function profileOf(x){
    const p=(x&&x.customerProfile&&typeof x.customerProfile==='object')?x.customerProfile:{};
    return {
      name:str(p.name||x?.customer),
      phone:str(p.phone||x?.contact),
      whatsapp:str(p.whatsapp||x?.whatsapp),
      passportNumber:str(p.passportNumber),
      passportExpiry:str(p.passportExpiry),
      email:str(p.email||x?.email),
      address:str(p.address||x?.address)
    };
  }
  function identityOf(x){
    const p=profileOf(x);
    const passport=norm(p.passportNumber), phone=norm(p.phone||p.whatsapp), email=norm(p.email), name=norm(p.name), address=norm(p.address);
    let kind='name'; let key=name;
    if(passport){kind='passport';key=passport;}
    else if(phone){kind='phone';key=phone;}
    else if(email){kind='email';key=email;}
    else if(name&&address){kind='name-address';key=name+'|'+address;}
    if(!key) return {customerId:'',matchKeyType:'none'};
    return {customerId:'CUS-'+hash(kind+'|'+key).toUpperCase(),matchKeyType:kind};
  }
  function apply(x){
    if(!x||typeof x!=='object')return x;
    const p=profileOf(x), id=identityOf(x);
    x.customerProfile=Object.assign({},x.customerProfile||{},p);
    if(p.name)x.customer=x.customer||p.name;
    if(p.phone)x.contact=x.contact||p.phone;
    if(p.whatsapp)x.whatsapp=x.whatsapp||p.whatsapp;
    if(!x.customerId&&id.customerId)x.customerId=id.customerId;
    x.customerMatchKeyType=x.customerMatchKeyType||id.matchKeyType;
    x.customerModelVersion=VERSION;
    return x;
  }
  function records(){return Array.isArray(window.quotes)?window.quotes:[];}
  function customerIndex(includeQuotations=true){
    const map=new Map();
    records().forEach(x=>{
      if(!includeQuotations&&x.recordType==='quotation')return;
      const y=apply(clone(x)); if(!y.customerId)return;
      let c=map.get(y.customerId);
      if(!c){c={customerId:y.customerId,name:y.customerProfile?.name||y.customer||'',phone:y.customerProfile?.phone||y.contact||'',whatsapp:y.customerProfile?.whatsapp||y.whatsapp||'',passportNumber:y.customerProfile?.passportNumber||'',passportExpiry:y.customerProfile?.passportExpiry||'',email:y.customerProfile?.email||'',address:y.customerProfile?.address||'',bookings:0,quotations:0,passengers:0,lastActivity:y.updatedAt||y.createdAt||y.bookingDate||'' ,references:[],serviceTypes:new Set()};map.set(y.customerId,c);}
      const isQ=y.recordType==='quotation'; if(isQ)c.quotations++;else c.bookings++;
      c.passengers+=Number(y.adults||0)+Number(y.childBed||0)+Number(y.childNoBed||0)+Number(y.infants||0);
      const when=y.updatedAt||y.createdAt||y.bookingDate||''; if(String(when)>String(c.lastActivity))c.lastActivity=when;
      if(y.reference&&!c.references.includes(y.reference))c.references.push(y.reference);
      if(y.serviceType)c.serviceTypes.add(y.serviceType);
      if(!c.name&&y.customer)c.name=y.customer;
    });
    return Array.from(map.values()).map(c=>{c.serviceTypes=Array.from(c.serviceTypes).map(k=>SERVICE_LABELS[k]||k);return c}).sort((a,b)=>String(b.lastActivity).localeCompare(String(a.lastActivity)));
  }
  function history(customerId){
    return records().filter(x=>apply(clone(x)).customerId===customerId).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
  }
  function findCustomer(query){
    const q=norm(query); if(!q)return [];
    return customerIndex(true).filter(c=>[c.name,c.phone,c.whatsapp,c.email,c.customerId,...c.references].some(v=>norm(v).includes(q)));
  }
  function attachCurrentCustomer(){if(window.q)apply(window.q);return window.q;}
  function customerSummary(x){
    const y=apply(clone(x)); const h=history(y.customerId);
    return {customerId:y.customerId,profile:clone(y.customerProfile),bookings:h.filter(z=>z.recordType!=='quotation'),quotations:h.filter(z=>z.recordType==='quotation'),history:h};
  }
  function renderDashboard(){
    const root=document.getElementById('keaCrmBody'); if(!root)return;
    const all=customerIndex(true), bookings=all.reduce((n,c)=>n+c.bookings,0), quotations=all.reduce((n,c)=>n+c.quotations,0);
    root.innerHTML=`<div class="metrics"><div class="metric"><div class="k">Unique Customers</div><div class="v">${all.length}</div></div><div class="metric"><div class="k">Booking Links</div><div class="v">${bookings}</div></div><div class="metric"><div class="k">Quotation Links</div><div class="v">${quotations}</div></div></div><div class="field" style="margin-top:10px"><label>Find Customer</label><input id="keaCrmSearch" placeholder="Name, phone, email or customer ID" oninput="window.KEA_CRM.renderSearch(this.value)"></div><div id="keaCrmResults" style="margin-top:10px"></div>`;
    renderSearch('');
  }
  function renderSearch(query){
    const host=document.getElementById('keaCrmResults');if(!host)return;
    const rows=query?findCustomer(query):customerIndex(true).slice(0,8);
    host.innerHTML=rows.length?rows.map(c=>`<div class="service"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><b>${esc(c.name||'Unnamed customer')}</b><div class="muted">${esc(c.phone||c.whatsapp||'No contact')} • ${esc(c.customerId)}</div><div class="muted">${c.bookings} booking(s) • ${c.quotations} quotation(s) • ${c.passengers} passenger(s)</div></div><button class="btn outline" type="button" onclick="window.KEA_CRM.open('${esc(c.customerId)}')">History</button></div></div>`).join(''):'<div class="muted">No customer matches.</div>';
  }
  function open(id){
    const h=history(id), first=h[0]; if(!first)return;
    const c=customerSummary(first), p=c.profile||{};
    let card=document.getElementById('keaCrmHistoryCard');
    if(!card){card=document.createElement('div');card.id='keaCrmHistoryCard';card.className='card';const host=document.getElementById('dashboard');if(host)host.appendChild(card);}
    card.innerHTML=`<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Customer History</h3><div class="muted">${esc(p.name||'Customer')} • ${esc(id)}</div></div><button class="btn outline" type="button" onclick="this.closest('.card').remove()">Close</button></div><div class="grid2"><div><b>Contact</b><div class="muted">${esc(p.phone||'—')} ${p.whatsapp?'• WhatsApp '+esc(p.whatsapp):''}</div><div class="muted">${esc(p.email||'—')}</div></div><div><b>Passport</b><div class="muted">${esc(p.passportNumber||'—')} ${p.passportExpiry?'• Exp '+esc(p.passportExpiry):''}</div></div></div><h4 class="section-title" style="margin-top:13px">Linked Records</h4><div class="tablewrap"><table class="table"><thead><tr><th>Reference</th><th>Type</th><th>Service</th><th>Status</th><th>Date</th></tr></thead><tbody>${h.map(x=>`<tr><td>${esc(x.reference||'—')}</td><td>${x.recordType==='quotation'?'Quotation':'Booking'}</td><td>${esc(SERVICE_LABELS[x.serviceType]||x.serviceType||'—')}</td><td>${esc(x.status||'draft')}</td><td>${esc(x.updatedAt||x.createdAt||x.bookingDate||'—')}</td></tr>`).join('')}</tbody></table></div>`;
    card.scrollIntoView({behavior:'smooth',block:'start'});
  }
  window.KEA_CRM={version:VERSION,apply,profileOf,identityOf,customerIndex,findCustomer,history,customerSummary,attachCurrentCustomer,renderDashboard,renderSearch,open};
  window.keaCustomerId=x=>identityOf(x).customerId;
  window.keaCustomerHistory=id=>history(id);
  const oldSave=window.saveQuotes;
  if(typeof oldSave==='function'){
    window.saveQuotes=function(){
      const arr=Array.isArray(window.quotes)?window.quotes:[];
      arr.forEach(apply);
      window.quotes=arr;
      return oldSave.apply(this,arguments);
    };
  }
  const oldNew=window.newBooking;
  if(typeof oldNew==='function')window.newBooking=function(){const out=oldNew.apply(this,arguments);attachCurrentCustomer();return out;};
  const oldFinish=window.finishQuote;
  if(typeof oldFinish==='function')window.finishQuote=function(){attachCurrentCustomer();return oldFinish.apply(this,arguments);};
  function mount(){
    const dash=document.getElementById('dashboard');
    if(dash&&!document.getElementById('keaCrmCard')){
      const card=document.createElement('div');card.className='card';card.id='keaCrmCard';card.style.marginTop='13px';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Customer CRM</h3><div class="muted">Reusable customer profiles and linked booking / quotation history.</div></div></div><div id="keaCrmBody"></div>';dash.appendChild(card);
    }
    renderDashboard();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,250));else setTimeout(mount,250);
  window.PHASE1_A1069={version:VERSION,feature:'customer crm architecture',architecture:'github+supabase',storage:'existing quote booking payload',schemaChanges:false,identity:'deterministic customerId from available customer identifiers'};
})();
