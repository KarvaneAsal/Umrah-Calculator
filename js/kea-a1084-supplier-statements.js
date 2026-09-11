/* Karvan-e-Asal A1.0.84 — Supplier Statement & Settlement Reporting Architecture
 * Builds supplier statements from A1.0.82 payables and A1.0.83 reconciliation records.
 * This is a reporting/settlement view only: it does not create a second expense engine,
 * alter customer receivables, or rewrite historical booking financial snapshots.
 */
(function(){
  'use strict';
  const VERSION='A1.0.84', TOL=0.01;
  const arr=v=>Array.isArray(v)?v:[];
  const str=v=>String(v??'').trim();
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const esc=v=>str(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const isoDate=v=>str(v).slice(0,10);
  function payables(q){return typeof window.keaSupplierPayables==='function'?window.keaSupplierPayables(q):arr(q?.supplierPayables)}
  function paidRows(p){return arr(p?.payments).filter(x=>str(x.status||'posted')!=='cancelled')}
  function supplierKey(p){return str(p?.supplierId)||('name:'+str(p?.supplierName).toLowerCase())||'unassigned'}
  function supplierName(p){return str(p?.supplierName)||'Unassigned'}
  function normalizeRange(opts){const o=opts||{};return {from:isoDate(o.from),to:isoDate(o.to)}}
  function inRange(date,range){const d=isoDate(date);return (!range.from||d>=range.from)&&(!range.to||d<=range.to)}
  function rowsForSupplier(source,key){
    const qs=Array.isArray(source)?source:arr(window.quotes), rows=[];
    qs.forEach(q=>payables(q).forEach(p=>{
      if(str(p.status)==='cancelled'||supplierKey(p)!==key)return;
      const ref=str(q.reference||q.id), base=money(p.baseAmountSar||0), date=isoDate(p.dueDate||p.createdAt);
      rows.push({kind:'payable',date,reference:ref,payableId:str(p.payableId),description:str(p.description||'Supplier payable'),debit:base,credit:0,balanceDelta:base,currency:str(p.currency||'SAR'),supplierId:str(p.supplierId),supplierName:supplierName(p),bookingRef:ref});
      paidRows(p).forEach(x=>{const paid=money(x.baseAmountSar??x.amount??0), pd=isoDate(x.paidAt||x.createdAt||p.createdAt);rows.push({kind:'payment',date:pd,reference:str(x.reference||ref),payableId:str(p.payableId),paymentId:str(x.paymentId),description:'Supplier payment',debit:0,credit:paid,balanceDelta:-paid,currency:str(x.currency||p.currency||'SAR'),supplierId:str(p.supplierId),supplierName:supplierName(p),bookingRef:ref})});
    }));
    return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind)||a.reference.localeCompare(b.reference));
  }
  function supplierIndex(source){const qs=Array.isArray(source)?source:arr(window.quotes), map={};qs.forEach(q=>payables(q).forEach(p=>{if(str(p.status)==='cancelled')return;const k=supplierKey(p);if(!map[k])map[k]={supplierId:str(p.supplierId),supplierName:supplierName(p),supplierType:str(p.supplierType||'Other')};}));return Object.values(map).sort((a,b)=>a.supplierName.localeCompare(b.supplierName));}
  function statement(source,key,opts){
    const range=normalizeRange(opts), all=rowsForSupplier(source,key), prior=all.filter(r=>range.from&&r.date<range.from), period=all.filter(r=>inRange(r.date,range));
    const opening=money(prior.reduce((n,r)=>n+r.balanceDelta,0));
    const obligations=money(period.filter(r=>r.kind==='payable').reduce((n,r)=>n+r.debit,0));
    const payments=money(period.filter(r=>r.kind==='payment').reduce((n,r)=>n+r.credit,0));
    const closing=money(opening+obligations-payments);
    const info=supplierIndex(source).find(x=>supplierKey({supplierId:x.supplierId,supplierName:x.supplierName})===key)||{};
    const overdue=money(all.filter(r=>r.kind==='payable'&&r.date<new Date().toISOString().slice(0,10)).reduce((n,r)=>n+r.debit,0)-all.filter(r=>r.kind==='payment'&&r.date<=new Date().toISOString().slice(0,10)).reduce((n,r)=>n+r.credit,0));
    return {version:VERSION,supplierId:str(info.supplierId),supplierName:info.supplierName||'Unassigned',supplierType:info.supplierType||'Other',from:range.from,to:range.to,openingBalanceSar:opening,newObligationsSar:obligations,paymentsSar:payments,closingBalanceSar:closing,overdueBalanceSar:Math.max(0,overdue),rows:period};
  }
  function allStatements(source,opts){return supplierIndex(source).map(s=>statement(source,supplierKey(s),opts))}
  function summary(source,opts){const ss=allStatements(source,opts);return {suppliers:ss.length,opening:money(ss.reduce((n,s)=>n+s.openingBalanceSar,0)),obligations:money(ss.reduce((n,s)=>n+s.newObligationsSar,0)),payments:money(ss.reduce((n,s)=>n+s.paymentsSar,0)),closing:money(ss.reduce((n,s)=>n+s.closingBalanceSar,0)),overdue:money(ss.reduce((n,s)=>n+s.overdueBalanceSar,0)),statements:ss}}
  function reconciliationSummary(source){
    const qs=Array.isArray(source)?source:arr(window.quotes), map={};
    qs.forEach(q=>arr(q?.supplierReconciliations).forEach(r=>{if(str(r.state)==='closed')return;const k=str(r.supplierId)||('name:'+str(r.supplierName).toLowerCase());if(!map[k])map[k]={supplierId:str(r.supplierId),supplierName:str(r.supplierName)||'Unassigned',variance:0,count:0};map[k].variance+=Number(r.varianceBaseSar||0);map[k].count++}));
    return Object.values(map).map(x=>({...x,variance:money(x.variance)}));
  }
  function render(){
    const root=document.getElementById('keaSupplierStatementsBody');if(!root)return;
    const s=summary();
    root.innerHTML='<div class="metrics"><div class="metric"><div class="k">Suppliers</div><div class="v">'+s.suppliers+'</div></div><div class="metric"><div class="k">New Obligations</div><div class="v">'+s.obligations.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Supplier Payments</div><div class="v">'+s.payments.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Closing Payables</div><div class="v">'+s.closing.toFixed(2)+' SAR</div></div></div>'+(s.statements.length?'<h4 style="margin:14px 0 7px">Supplier statements</h4>'+s.statements.slice(0,12).map(x=>'<div class="row"><span>'+esc(x.supplierName)+' <small class="muted">('+x.newObligationsSar.toFixed(2)+' obligations)</small></span><b>'+x.closingBalanceSar.toFixed(2)+' SAR</b></div>').join(''):'<div class="muted" style="margin-top:9px">No supplier statement data available.</div>')+'<div class="muted" style="margin-top:9px">Statement balances are derived from supplier payables and supplier settlement payments. Customer receivables and expense accounting are unchanged.</div>';
  }
  function mount(){const dash=document.getElementById('dashboard');if(!dash||document.getElementById('keaSupplierStatementsCard'))return;const card=document.createElement('div');card.id='keaSupplierStatementsCard';card.className='card';card.style.marginTop='13px';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Supplier Statements & Settlement Reporting</h3><div class="muted">Opening balance, obligations, supplier payments and closing balance by supplier.</div></div><button class="btn outline" type="button" onclick="window.KEA_SUPPLIER_STATEMENTS?.render()">Refresh</button></div><div id="keaSupplierStatementsBody"></div>';dash.appendChild(card);render()}
  window.KEA_SUPPLIER_STATEMENTS={version:VERSION,statement,allStatements,summary,reconciliationSummary,render};
  window.keaSupplierStatement=(source,key,opts)=>statement(source,key,opts);
  window.keaSupplierStatements=(source,opts)=>allStatements(source,opts);
  window.keaSupplierStatementSummary=summary;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,1000));else setTimeout(mount,1000);
  window.PHASE1_A1084={version:VERSION,feature:'supplier statement and settlement reporting',architecture:'github+supabase',storage:'existing supplier payable/payment payloads',schemaChanges:false,financialIntegrity:'preserved',customerReceivables:'unchanged',expenseAccounting:'unchanged',source:['A1.0.82 supplier payables','A1.0.83 supplier reconciliation']};
})();
