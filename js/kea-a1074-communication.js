/* A1.0.74 — Communication / Customer Contact Architecture */
(function(){
  'use strict';
  const VERSION='A1.0.74';
  const CHANNELS=['phone','whatsapp','email','internal'];
  const STATUSES=['planned','sent','received','completed','cancelled'];
  const esc=window.esc||function(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
  const str=v=>String(v??'').trim();
  const clone=v=>{try{return JSON.parse(JSON.stringify(v))}catch(e){return v}};
  const now=()=>new Date().toISOString();
  function normalizeEntry(e,i){
    e=e&&typeof e==='object'?e:{};
    return {contactId:str(e.contactId)||'COM-'+Date.now().toString(36).toUpperCase()+'-'+(i+1),channel:CHANNELS.includes(str(e.channel).toLowerCase())?str(e.channel).toLowerCase():'internal',direction:str(e.direction||'outbound')==='inbound'?'inbound':'outbound',subject:str(e.subject),message:str(e.message),status:STATUSES.includes(str(e.status).toLowerCase())?str(e.status).toLowerCase():'completed',at:str(e.at)||now(),dueAt:str(e.dueAt),actorId:str(e.actorId),actorUsername:str(e.actorUsername),customerId:str(e.customerId),reference:str(e.reference),notes:str(e.notes)};
  }
  function profile(q){return q?.customerProfile&&typeof q.customerProfile==='object'?q.customerProfile:{name:q?.customer||'',phone:q?.contact||'',whatsapp:q?.whatsapp||'',email:q?.email||''};}
  function ensure(q){
    if(!q||typeof q!=='object')return q;
    q.communication=q.communication&&typeof q.communication==='object'?q.communication:{};
    q.communication.version=VERSION;
    q.communication.contacts=Array.isArray(q.communication.contacts)?q.communication.contacts.map(normalizeEntry).slice(-100):[];
    return q;
  }
  function add(q,data){
    ensure(q); const p=profile(q); const e=normalizeEntry(Object.assign({},data,{customerId:data.customerId||q.customerId||'',reference:data.reference||q.reference||''}),q.communication.contacts.length);
    if(!e.subject)e.subject='Customer contact';
    q.communication.contacts.push(e);q.communication.contacts=q.communication.contacts.slice(-100);
    q.updatedAt=now();
    return e;
  }
  function history(qOrId){
    if(typeof qOrId==='object')return ensure(qOrId).communication.contacts||[];
    const id=str(qOrId), out=[];
    (Array.isArray(window.quotes)?window.quotes:[]).forEach(q=>{ensure(q);(q.communication.contacts||[]).forEach(e=>{if(!id||e.customerId===id)out.push(Object.assign({reference:q.reference||''},e));});});
    return out.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  }
  function quickChannel(q,channel){
    const p=profile(q), target=channel==='whatsapp'?p.whatsapp||p.phone:channel==='phone'?p.phone:channel==='email'?p.email:'';
    if(!target)return null;
    if(channel==='whatsapp'){const n=target.replace(/[^0-9]/g,'');return 'https://wa.me/'+(n.startsWith('0')?'92'+n.slice(1):n)}
    if(channel==='email')return 'mailto:'+target;
    if(channel==='phone')return 'tel:'+target;
    return null;
  }
  function openContact(q,channel){
    const url=quickChannel(q,channel); if(url)window.open(url,'_blank');
    add(q,{channel,direction:'outbound',status:'planned',subject:(channel==='whatsapp'?'WhatsApp':channel==='phone'?'Phone':channel==='email'?'Email':'Internal')+' contact'});
    window.saveQuotes?.(); render(); return url;
  }
  function customerContacts(){
    const map=new Map();
    (Array.isArray(window.quotes)?window.quotes:[]).forEach(q=>{ensure(q);const id=str(q.customerId);if(!id)return;const p=profile(q);let c=map.get(id);if(!c){c={customerId:id,name:p.name||q.customer||'',phone:p.phone||'',whatsapp:p.whatsapp||'',email:p.email||'',contacts:0,lastContact:''};map.set(id,c)};(q.communication.contacts||[]).forEach(e=>{c.contacts++;if(String(e.at)>String(c.lastContact))c.lastContact=e.at;});});
    return [...map.values()].sort((a,b)=>String(b.lastContact).localeCompare(String(a.lastContact)));
  }
  function render(){
    const root=document.getElementById('keaCommunicationBody');if(!root)return;
    const rows=customerContacts();
    root.innerHTML='<div class="metrics"><div class="metric"><div class="k">Customers with CRM</div><div class="v">'+rows.length+'</div></div><div class="metric"><div class="k">Contact Records</div><div class="v">'+rows.reduce((n,c)=>n+c.contacts,0)+'</div></div><div class="metric"><div class="k">WhatsApp Ready</div><div class="v">'+rows.filter(c=>c.whatsapp||c.phone).length+'</div></div><div class="metric"><div class="k">Email Ready</div><div class="v">'+rows.filter(c=>c.email).length+'</div></div></div>'+(rows.length?'<div class="tablewrap" style="margin-top:10px"><table class="table"><thead><tr><th>Customer</th><th>Contact</th><th>History</th><th>Action</th></tr></thead><tbody>'+rows.slice(0,20).map(c=>'<tr><td><b>'+esc(c.name||'Customer')+'</b><div class="muted">'+esc(c.customerId)+'</div></td><td>'+esc(c.phone||c.whatsapp||c.email||'—')+'</td><td>'+c.contacts+' record(s)</td><td><button class="btn outline" type="button" onclick="window.KEA_COMMUNICATION?.openHistory(\''+esc(c.customerId)+'\')">History</button></td></tr>').join('')+'</tbody></table></div>':'<div class="muted" style="margin-top:10px">No customer communication history yet.</div>');
  }
  function openHistory(id){
    const items=history(id), host=document.getElementById('dashboard');if(!host)return;
    let card=document.getElementById('keaCommunicationHistoryCard');if(!card){card=document.createElement('div');card.id='keaCommunicationHistoryCard';card.className='card';host.appendChild(card)}
    card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Communication History</h3><div class="muted">'+esc(id)+'</div></div><button class="btn outline" type="button" onclick="this.closest(\'.card\').remove()">Close</button></div>'+(items.length?'<div class="tablewrap"><table class="table"><thead><tr><th>Channel</th><th>Subject</th><th>Status</th><th>Date</th><th>Booking</th></tr></thead><tbody>'+items.map(e=>'<tr><td>'+esc(e.channel)+'</td><td><b>'+esc(e.subject||'Contact')+'</b><div class="muted">'+esc(e.message||'')+'</div></td><td>'+esc(e.status)+'</td><td>'+esc(e.at)+'</td><td>'+esc(e.reference||'—')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="muted">No communication records.</div>');
    card.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function attach(q){if(q)ensure(q);return q;}
  window.KEA_COMMUNICATION={version:VERSION,channels:CHANNELS.slice(),statuses:STATUSES.slice(),ensure,add,history,customerContacts,openContact,openHistory,render,attach,quickChannel};
  window.keaCommunicationAdd=(q,data)=>add(q||window.q,data||{});
  window.keaCommunicationHistory=history;
  const oldSave=window.saveQuotes;
  if(typeof oldSave==='function')window.saveQuotes=function(){(Array.isArray(window.quotes)?window.quotes:[]).forEach(ensure);if(window.q)ensure(window.q);return oldSave.apply(this,arguments)};
  const oldNew=window.newBooking;
  if(typeof oldNew==='function')window.newBooking=function(){const r=oldNew.apply(this,arguments);attach(window.q);return r};
  const oldFinish=window.finishQuote;
  if(typeof oldFinish==='function')window.finishQuote=function(){attach(window.q);return oldFinish.apply(this,arguments)};
  function mount(){
    const dash=document.getElementById('dashboard');if(dash&&!document.getElementById('keaCommunicationCard')){const card=document.createElement('div');card.id='keaCommunicationCard';card.className='card';card.style.marginTop='13px';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Customer Communication</h3><div class="muted">Phone, WhatsApp, email and internal contact history linked to existing CRM customers and bookings.</div></div><button class="btn outline" type="button" onclick="window.KEA_COMMUNICATION?.render()">Refresh</button></div><div id="keaCommunicationBody"></div>';dash.appendChild(card)}
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,350));else setTimeout(mount,350);
  window.PHASE1_A1074={version:VERSION,feature:'communication and customer contact architecture',architecture:'github+supabase',storage:'existing quote booking payload',schemaChanges:false,financialIntegrity:'preserved',customerSource:'existing CRM customer profile'};
})();
