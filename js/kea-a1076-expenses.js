/* Karvan-e-Asal A1.0.76 — Expense / Procurement Architecture
 * Operational procurement and expense records stay separate from customer revenue.
 * Uses existing Quote/Booking payload; no new Supabase tables or financial engine.
 */
(function(){
  'use strict';
  const VERSION='A1.0.76', MAX=200;
  const TYPES=['procurement','operational','refund','other'];
  const STATUSES=['estimated','approved','paid','cancelled'];
  const METHODS=['cash','bank_transfer','card','online','other'];
  const arr=v=>Array.isArray(v)?v:[];
  const str=v=>String(v??'').trim();
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const esc=v=>str(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function uid(){const r=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);return 'EXP-'+r.replace(/-/g,'').slice(0,14).toUpperCase()}
  function ensure(q){
    if(!q||typeof q!=='object')return q;
    if(!q.expenseArchitecture)q.expenseArchitecture={version:VERSION};
    if(!Array.isArray(q.expenses))q.expenses=[];
    q.expenses=q.expenses.slice(-MAX);
    q.expenseArchitecture.version=VERSION;
    return q;
  }
  function actor(){return {actorId:str(window.currentUser?.id),actorUsername:str(window.currentUser?.username||window.currentUser?.name)}}
  function add(q,data){
    q=ensure(q||window.q);if(!q)throw new Error('Booking not found.');
    const d=data||{}, qty=Math.max(1,Number(d.qty)||1), unit=money(d.unitCost??d.amount);
    if(unit<=0)throw new Error('Expense amount must be greater than zero.');
    const e={expenseId:str(d.expenseId)||uid(),supplierId:str(d.supplierId),supplierName:str(d.supplierName),category:TYPES.includes(str(d.category))?str(d.category):'operational',description:str(d.description||d.name),qty,unitCost:unit,totalCost:money(qty*unit),currency:str(d.currency||'SAR').toUpperCase(),status:STATUSES.includes(str(d.status))?str(d.status):'estimated',method:METHODS.includes(str(d.method))?str(d.method):'other',reference:str(d.reference),expenseDate:d.expenseDate||new Date().toISOString().slice(0,10),paidAt:d.paidAt||'',notes:str(d.notes),createdAt:new Date().toISOString(),...actor()};
    q.expenses.push(e);q.expenses=q.expenses.slice(-MAX);q.updatedAt=new Date().toISOString();return e;
  }
  function update(q,id,patch){q=ensure(q||window.q);const e=arr(q?.expenses).find(x=>String(x.expenseId)===String(id));if(!e)return null;Object.assign(e,patch||{});if(patch&&('qty'in patch||'unitCost'in patch))e.totalCost=money(Math.max(1,Number(e.qty)||1)*Number(e.unitCost||0));if(patch?.status==='paid'&&!e.paidAt)e.paidAt=new Date().toISOString();e.updatedAt=new Date().toISOString();return e}
  function list(q){return arr(ensure(q||window.q)?.expenses).slice().sort((a,b)=>String(b.expenseDate||b.createdAt).localeCompare(String(a.expenseDate||a.createdAt)))}
  function summary(q){const rows=list(q), paid=rows.filter(x=>x.status==='paid');return {count:rows.length,total:money(rows.reduce((n,x)=>n+Number(x.totalCost||0),0)),paid:money(paid.reduce((n,x)=>n+Number(x.totalCost||0),0)),unpaid:money(rows.filter(x=>x.status!=='paid'&&x.status!=='cancelled').reduce((n,x)=>n+Number(x.totalCost||0),0)),procurement:money(rows.filter(x=>x.category==='procurement').reduce((n,x)=>n+Number(x.totalCost||0),0)),operational:money(rows.filter(x=>x.category==='operational').reduce((n,x)=>n+Number(x.totalCost||0),0))}}
  function allSummary(source){const rows=(Array.isArray(source)?source:arr(window.quotes)).flatMap(q=>list(q).map(e=>({...e,bookingReference:q.reference||'',serviceType:q.serviceType||''})));return {count:rows.length,total:money(rows.reduce((n,x)=>n+Number(x.totalCost||0),0)),paid:money(rows.filter(x=>x.status==='paid').reduce((n,x)=>n+Number(x.totalCost||0),0)),unpaid:money(rows.filter(x=>x.status!=='paid'&&x.status!=='cancelled').reduce((n,x)=>n+Number(x.totalCost||0),0)),procurement:money(rows.filter(x=>x.category==='procurement').reduce((n,x)=>n+Number(x.totalCost||0),0)),operational:money(rows.filter(x=>x.category==='operational').reduce((n,x)=>n+Number(x.totalCost||0),0))}}
  function render(){
    const root=document.getElementById('keaExpensesBody');if(!root)return;
    const s=allSummary();
    root.innerHTML='<div class="metrics"><div class="metric"><div class="k">Total Expenses</div><div class="v">'+s.total.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Paid</div><div class="v">'+s.paid.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Unpaid</div><div class="v">'+s.unpaid.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Procurement</div><div class="v">'+s.procurement.toFixed(2)+' SAR</div></div></div><div class="muted" style="margin-top:8px">Expenses are operational/procurement records only. They do not alter customer quotations, booking totals, frozen costs, or receivables.</div>';
  }
  function mount(){const dash=document.getElementById('dashboard');if(!dash||document.getElementById('keaExpensesCard'))return;const card=document.createElement('div');card.id='keaExpensesCard';card.className='card';card.style.marginTop='13px';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Expenses & Procurement</h3><div class="muted">Operational supplier/procurement expenses separated from customer revenue.</div></div><button class="btn outline" type="button" onclick="window.KEA_EXPENSES?.render()">Refresh</button></div><div id="keaExpensesBody"></div>';dash.appendChild(card);render()}
  const oldSave=window.saveQuotes;
  if(typeof oldSave==='function'&&!oldSave.__keaA1076){function save(){arr(window.quotes).forEach(ensure);if(window.q)ensure(window.q);return oldSave.apply(this,arguments)}save.__keaA1076=true;window.saveQuotes=save}
  const oldNew=window.newBooking;if(typeof oldNew==='function'&&!oldNew.__keaA1076){function n(){const r=oldNew.apply(this,arguments);ensure(window.q);return r}n.__keaA1076=true;window.newBooking=n}
  window.KEA_EXPENSES={version:VERSION,types:TYPES.slice(),statuses:STATUSES.slice(),methods:METHODS.slice(),ensure,add,update,list,summary,allSummary,render};
  window.keaAddExpense=(q,data)=>add(q||window.q,data||{});window.keaExpenseSummary=summary;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,500));else setTimeout(mount,500);
  window.PHASE1_A1076={version:VERSION,feature:'expense and procurement architecture',architecture:'github+supabase',storage:'existing booking payload',schemaChanges:false,financialSourceOfTruth:'existing customer financial calculation and frozen snapshots',separation:'operational procurement expenses do not alter customer revenue'};
})();
