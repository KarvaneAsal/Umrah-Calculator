/* Karvan-e-Asal A1.0.82 — Supplier Settlement / Payables Architecture
 * Supplier settlement obligations are separate from customer receivables and A1.0.76 expenses.
 * Payables use frozen supplier amounts/FX snapshots and live only inside the existing booking payload.
 * No new Supabase tables/schema and no replacement financial engine.
 */
(function(){
  'use strict';
  const VERSION='A1.0.82', MAX=200, PMAX=100;
  const STATUSES=['open','approved','partially_paid','paid','cancelled'];
  const METHODS=['cash','bank_transfer','card','online','other'];
  const arr=v=>Array.isArray(v)?v:[];
  const str=v=>String(v??'').trim();
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const esc=v=>str(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function uid(prefix){const r=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);return prefix+'-'+r.replace(/-/g,'').slice(0,14).toUpperCase()}
  function actor(){return {actorId:str(window.currentUser?.id),actorUsername:str(window.currentUser?.username||window.currentUser?.name)}}
  function ensure(q){
    if(!q||typeof q!=='object')return q;
    if(!Array.isArray(q.supplierPayables))q.supplierPayables=[];
    q.supplierPayables=q.supplierPayables.slice(-MAX);
    if(!Array.isArray(q.supplierPaymentHistory))q.supplierPaymentHistory=[];
    q.supplierPaymentHistory=q.supplierPaymentHistory.slice(-PMAX);
    q.supplierPayables.forEach(p=>{if(!Array.isArray(p.payments))p.payments=[];p.payments=p.payments.slice(-PMAX);normalizePayable(p)});
    q.supplierPayablesModelVersion=VERSION;
    return q;
  }
  function fx(q,currency){
    const cur=str(currency||'SAR').toUpperCase();
    if(cur==='SAR')return 1;
    const direct=Number(q?.currencyModel?.rates?.[cur]);
    if(Number.isFinite(direct)&&direct>0)return direct;
    const fallback=Number(q?.exchange_rate);
    return Number.isFinite(fallback)&&fallback>0?fallback:null;
  }
  function normalizePayable(p){
    if(!p||typeof p!=='object')return p;
    p.status=STATUSES.includes(str(p.status))?str(p.status):'open';
    p.currency=str(p.currency||'SAR').toUpperCase();
    if(!Number.isFinite(Number(p.amount))||Number(p.amount)<0)p.amount=0; else p.amount=money(p.amount);
    if(!Number.isFinite(Number(p.fxToSar))||Number(p.fxToSar)<=0)p.fxToSar=1;
    p.baseAmountSar=money(Number(p.baseAmountSar??p.amount)*Number(p.fxToSar||1));
    p.createdAt=str(p.createdAt)||new Date().toISOString();p.updatedAt=str(p.updatedAt)||p.createdAt;
    if(!Array.isArray(p.payments))p.payments=[];
    return p;
  }
  function paidFor(q,p){
    const rows=arr(p?.payments).filter(x=>str(x.status||'posted')!=='cancelled');
    return money(rows.reduce((n,x)=>n+Number(x.baseAmountSar??x.amount??0),0));
  }
  function outstandingFor(q,p){return money(Math.max(0,Number(p?.baseAmountSar||0)-paidFor(q,p)))}
  function syncStatus(q,p){
    normalizePayable(p);const out=outstandingFor(q,p), paid=paidFor(q,p), total=Number(p.baseAmountSar||0);
    if(p.status==='cancelled')return p;
    p.status=out<=0&&total>0?'paid':paid>0?'partially_paid':(p.status==='approved'?'approved':'open');
    p.outstandingBaseSar=out;p.paidBaseSar=paid;p.updatedAt=new Date().toISOString();return p;
  }
  function findSupplier(data){
    const id=str(data?.supplierId), name=str(data?.supplierName);
    const s=id&&window.KEA_SUPPLIERS?.get?.(id); if(s)return s;
    return name&&window.KEA_SUPPLIERS?.findByName?.(name,data?.supplierType||undefined)||null;
  }
  function add(q,data){
    q=ensure(q||window.q);if(!q)throw new Error('Booking not found.');
    const d=data||{}, supplier=findSupplier(d), supplierId=str(d.supplierId||supplier?.supplierId), supplierName=str(d.supplierName||supplier?.name);
    if(!supplierId&&!supplierName)throw new Error('Supplier is required for a payable.');
    const amount=money(d.amount), currency=str(d.currency||supplier?.currency||'SAR').toUpperCase();
    if(amount<=0)throw new Error('Supplier payable amount must be greater than zero.');
    const rate=Number(d.fxToSar)>0?Number(d.fxToSar):fx(q,currency);
    if(!rate)throw new Error('No frozen exchange rate is available for '+currency+'.');
    const now=new Date().toISOString();
    const p={payableId:str(d.payableId)||uid('PAY'),supplierId,supplierName:supplierName||'Unassigned',supplierType:str(d.supplierType||supplier?.type||'Other'),category:str(d.category||'supplier_settlement'),description:str(d.description||d.name||'Supplier settlement'),amount,currency,fxToSar:money(rate),baseAmountSar:money(amount*rate),status:STATUSES.includes(str(d.status))?str(d.status):'open',dueDate:str(d.dueDate),reference:str(d.reference),createdAt:now,updatedAt:now,notes:str(d.notes),...actor(),payments:[]};
    syncStatus(q,p);q.supplierPayables.push(p);q.supplierPayables=q.supplierPayables.slice(-MAX);q.updatedAt=now;
    return p;
  }
  function recordPayment(q,payableId,data){
    q=ensure(q||window.q);if(!q)throw new Error('Booking not found.');
    const p=arr(q.supplierPayables).find(x=>str(x.payableId)===str(payableId));if(!p)throw new Error('Supplier payable not found.');
    normalizePayable(p);if(p.status==='cancelled')throw new Error('Cancelled supplier payable cannot receive payment.');
    const d=data||{}, amount=money(d.amount), currency=str(d.currency||p.currency).toUpperCase();if(amount<=0)throw new Error('Supplier payment amount must be greater than zero.');
    const rate=Number(d.fxToSar)>0?Number(d.fxToSar):fx(q,currency);if(!rate)throw new Error('No frozen exchange rate is available for '+currency+'.');
    const payment={paymentId:str(d.paymentId)||uid('SPM'),payableId:p.payableId,amount,currency,fxToSar:money(rate),baseAmountSar:money(amount*rate),method:METHODS.includes(str(d.method))?str(d.method):'other',reference:str(d.reference),paidAt:str(d.paidAt)||new Date().toISOString(),status:'posted',...actor(),notes:str(d.notes)};
    if(payment.baseAmountSar>outstandingFor(q,p)+0.005)throw new Error('Supplier payment exceeds the outstanding payable.');
    p.payments.push(payment);p.payments=p.payments.slice(-PMAX);q.supplierPaymentHistory.push(payment);q.supplierPaymentHistory=q.supplierPaymentHistory.slice(-PMAX);syncStatus(q,p);q.updatedAt=new Date().toISOString();return payment;
  }
  function list(q){return arr(ensure(q||window.q)?.supplierPayables).map(p=>syncStatus(q,p)).slice().sort((a,b)=>String(b.dueDate||b.createdAt).localeCompare(String(a.dueDate||a.createdAt)))}
  function summary(q){
    const rows=list(q), active=rows.filter(p=>p.status!=='cancelled');
    const total=money(active.reduce((n,p)=>n+Number(p.baseAmountSar||0),0)), paid=money(active.reduce((n,p)=>n+paidFor(q,p),0)), outstanding=money(active.reduce((n,p)=>n+outstandingFor(q,p),0));
    const today=new Date().toISOString().slice(0,10), overdue=money(active.filter(p=>outstandingFor(q,p)>0&&p.dueDate&&p.dueDate<today).reduce((n,p)=>n+outstandingFor(q,p),0));
    const bySupplier={};active.forEach(p=>{const k=p.supplierId||p.supplierName||'Unassigned';if(!bySupplier[k])bySupplier[k]={supplierId:p.supplierId||'',supplierName:p.supplierName||'Unassigned',payables:0,paid:0,outstanding:0};const x=bySupplier[k];x.payables++;x.paid+=paidFor(q,p);x.outstanding+=outstandingFor(q,p)});
    return {count:active.length,total,paid,outstanding,overdue,bySupplier:Object.values(bySupplier).map(x=>({...x,paid:money(x.paid),outstanding:money(x.outstanding)})).sort((a,b)=>b.outstanding-a.outstanding)};
  }
  function allSummary(source){const qs=Array.isArray(source)?source:arr(window.quotes), out={count:0,total:0,paid:0,outstanding:0,overdue:0,bySupplier:{}};qs.forEach(q=>{const s=summary(q);out.count+=s.count;out.total+=s.total;out.paid+=s.paid;out.outstanding+=s.outstanding;out.overdue+=s.overdue;s.bySupplier.forEach(x=>{const k=x.supplierId||x.supplierName;if(!out.bySupplier[k])out.bySupplier[k]={supplierId:x.supplierId,supplierName:x.supplierName,payables:0,paid:0,outstanding:0};out.bySupplier[k].payables+=x.payables;out.bySupplier[k].paid+=x.paid;out.bySupplier[k].outstanding+=x.outstanding})});out.total=money(out.total);out.paid=money(out.paid);out.outstanding=money(out.outstanding);out.overdue=money(out.overdue);out.bySupplier=Object.values(out.bySupplier).map(x=>({...x,paid:money(x.paid),outstanding:money(x.outstanding)})).sort((a,b)=>b.outstanding-a.outstanding);return out}
  function render(){
    const root=document.getElementById('keaPayablesBody');if(!root)return;const s=allSummary();
    root.innerHTML='<div class="metrics"><div class="metric"><div class="k">Total Payables</div><div class="v">'+s.total.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Paid to Suppliers</div><div class="v">'+s.paid.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Outstanding</div><div class="v">'+s.outstanding.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Overdue</div><div class="v">'+s.overdue.toFixed(2)+' SAR</div></div></div>'+(s.bySupplier.length?'<h4 style="margin:14px 0 7px">Supplier balances</h4>'+s.bySupplier.slice(0,12).map(x=>'<div class="row"><span>'+esc(x.supplierName)+' <small class="muted">('+x.payables+')</small></span><b>'+x.outstanding.toFixed(2)+' SAR</b></div>').join(''):'<div class="muted" style="margin-top:9px">No supplier payables recorded yet.</div>')+'<div class="muted" style="margin-top:9px">Settlement view only. Supplier payments do not reduce customer receivables or alter booking totals, and payables are not added again as expenses.</div>';
  }
  function mount(){const dash=document.getElementById('dashboard');if(!dash||document.getElementById('keaPayablesCard'))return;const card=document.createElement('div');card.id='keaPayablesCard';card.className='card';card.style.marginTop='13px';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Supplier Settlement & Payables</h3><div class="muted">Amounts owed to hotels, airlines, transport, visa providers and other suppliers.</div></div><button class="btn outline" type="button" onclick="window.KEA_PAYABLES?.render()">Refresh</button></div><div id="keaPayablesBody"></div>';dash.appendChild(card);render()}
  const oldSave=window.saveQuotes;if(typeof oldSave==='function'&&!oldSave.__keaA1082){function save(){arr(window.quotes).forEach(ensure);if(window.q)ensure(window.q);return oldSave.apply(this,arguments)}save.__keaA1082=true;window.saveQuotes=save}
  const oldNew=window.newBooking;if(typeof oldNew==='function'&&!oldNew.__keaA1082){function n(){const r=oldNew.apply(this,arguments);ensure(window.q);return r}n.__keaA1082=true;window.newBooking=n}
  window.KEA_PAYABLES={version:VERSION,statuses:STATUSES.slice(),methods:METHODS.slice(),ensure,add,recordPayment,list,summary,allSummary,paidFor,outstandingFor,render};
  window.keaAddSupplierPayable=(q,data)=>add(q||window.q,data||{});
  window.keaRecordSupplierPayment=(q,id,data)=>recordPayment(q||window.q,id,data||{});
  window.keaSupplierPayables=q=>list(q||window.q);
  window.keaSupplierPayableSummary=(q)=>summary(q||window.q);
  window.keaSupplierOutstanding=(q)=>summary(q||window.q).outstanding;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,800));else setTimeout(mount,800);
  window.PHASE1_A1082={version:VERSION,feature:'supplier settlement and payables architecture',architecture:'github+supabase',storage:'existing booking payload',schemaChanges:false,customerReceivables:'separate',expenseAccounting:'no double-counting',financialIntegrity:'customer totals and receivables unchanged',fx:'frozen per payable from booking currency model'};
})();
