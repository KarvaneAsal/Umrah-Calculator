/* Karvan-e-Asal A1.0.85 — Supplier Aging & Payables Due Management
 * Aging is a settlement/reporting layer over A1.0.82 supplier payables.
 * It never creates a second expense engine and never changes customer financials.
 */
(function(){
  'use strict';
  const VERSION='A1.0.85';
  const DAY=86400000;
  const arr=v=>Array.isArray(v)?v:[];
  const str=v=>String(v??'').trim();
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const today=()=>new Date().toISOString().slice(0,10);
  const dateOnly=v=>{const s=str(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:''};
  const daysBetween=(a,b)=>Math.floor((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/DAY);
  const payableList=q=>typeof window.keaSupplierPayables==='function'?window.keaSupplierPayables(q):arr(q?.supplierPayables);
  const paid=p=>arr(p?.payments).filter(x=>str(x.status||'posted')!=='cancelled').reduce((n,x)=>n+Number(x.baseAmountSar??x.amount??0),0);
  const outstanding=p=>money(Math.max(0,Number(p?.baseAmountSar||0)-paid(p)));
  const supplierKey=p=>str(p?.supplierId)||('name:'+str(p?.supplierName).toLowerCase())||'unassigned';
  const supplierName=p=>str(p?.supplierName)||'Unassigned';
  function bucket(p,asOf){
    const out=outstanding(p); if(out<=0)return 'paid';
    const due=dateOnly(p?.dueDate);
    if(!due)return 'no_due_date';
    const age=daysBetween(due,asOf);
    if(age<0)return 'current';
    if(age<=30)return '1_30';
    if(age<=60)return '31_60';
    if(age<=90)return '61_90';
    return '90_plus';
  }
  function row(q,p,asOf){
    const due=dateOnly(p?.dueDate), out=outstanding(p), age=due?daysBetween(due,asOf):null;
    return {payableId:str(p?.payableId),supplierId:str(p?.supplierId),supplierName:supplierName(p),supplierType:str(p?.supplierType||'Other'),bookingReference:str(q?.reference||q?.id),description:str(p?.description||'Supplier payable'),amountSar:money(p?.baseAmountSar),paidSar:money(paid(p)),outstandingSar:out,currency:str(p?.currency||'SAR'),dueDate:due,ageDays:age,bucket:bucket(p,asOf),status:str(p?.status||'open')};
  }
  function rows(source,opts){
    const asOf=dateOnly(opts?.asOf)||today(), qs=Array.isArray(source)?source:arr(window.quotes), out=[];
    qs.forEach(q=>payableList(q).forEach(p=>{if(str(p?.status)==='cancelled')return;const r=row(q,p,asOf);if(r.outstandingSar>0)out.push(r)}));
    return out.sort((a,b)=>(b.ageDays??-1)-(a.ageDays??-1)||b.outstandingSar-a.outstandingSar);
  }
  function summary(source,opts){
    const asOf=dateOnly(opts?.asOf)||today(), rs=rows(source,{asOf}), b={current:0,'1_30':0,'31_60':0,'61_90':0,'90_plus':0,no_due_date:0,paid:0};
    rs.forEach(r=>{b[r.bucket]=(b[r.bucket]||0)+r.outstandingSar});
    const upcoming=(days)=>money(rs.filter(r=>r.dueDate&&r.ageDays<0&&r.ageDays>=-days).reduce((n,r)=>n+r.outstandingSar,0));
    const suppliers={};
    rs.forEach(r=>{const k=supplierKey(r);if(!suppliers[k])suppliers[k]={supplierId:r.supplierId,supplierName:r.supplierName,supplierType:r.supplierType,outstanding:0,overdue:0,current:0,buckets:{'1_30':0,'31_60':0,'61_90':0,'90_plus':0,no_due_date:0}};const s=suppliers[k];s.outstanding+=r.outstandingSar;if(r.ageDays!==null&&r.ageDays>=0)s.overdue+=r.outstandingSar;else if(r.ageDays!==null&&r.ageDays<0)s.current+=r.outstandingSar;if(s.buckets[r.bucket]!==undefined)s.buckets[r.bucket]+=r.outstandingSar});
    Object.values(suppliers).forEach(s=>{s.outstanding=money(s.outstanding);s.overdue=money(s.overdue);s.current=money(s.current);Object.keys(s.buckets).forEach(k=>s.buckets[k]=money(s.buckets[k]))});
    return {version:VERSION,asOf,totalOutstanding:money(rs.reduce((n,r)=>n+r.outstandingSar,0)),overdue:money(rs.filter(r=>r.ageDays!==null&&r.ageDays>=0).reduce((n,r)=>n+r.outstandingSar,0)),current:money(rs.filter(r=>r.ageDays!==null&&r.ageDays<0).reduce((n,r)=>n+r.outstandingSar,0)),noDueDate:money(rs.filter(r=>!r.dueDate).reduce((n,r)=>n+r.outstandingSar,0)),buckets:Object.fromEntries(Object.entries(b).map(([k,v])=>[k,money(v)])),upcoming7:upcoming(7),upcoming30:upcoming(30),payableCount:rs.length,suppliers:Object.values(suppliers).sort((a,b)=>b.outstanding-a.outstanding),rows:rs};
  }
  function supplierSummary(source,supplier,opts){const key=str(supplier);return summary(source,opts).suppliers.find(x=>supplierKey(x)===key||str(x.supplierId)===key||str(x.supplierName).toLowerCase()===key.toLowerCase())||null}
  function priority(r){if(r.bucket==='90_plus')return 'urgent';if(r.bucket==='61_90')return 'high';if(r.bucket==='31_60')return 'medium';if(r.bucket==='1_30')return 'normal';if(r.bucket==='current')return 'upcoming';return 'review';}
  function render(){const root=document.getElementById('keaSupplierAgingBody');if(!root)return;const s=summary();const names=s.suppliers.slice(0,10).map(x=>'<div class="row"><span>'+esc(x.supplierName)+' <small class="muted">('+x.overdue.toFixed(2)+' overdue)</small></span><b>'+x.outstanding.toFixed(2)+' SAR</b></div>').join('');root.innerHTML='<div class="metrics"><div class="metric"><div class="k">Outstanding</div><div class="v">'+s.totalOutstanding.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Overdue</div><div class="v">'+s.overdue.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Due ≤ 7 days</div><div class="v">'+s.upcoming7.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">90+ days</div><div class="v">'+s.buckets['90_plus'].toFixed(2)+' SAR</div></div></div><div class="row" style="margin-top:10px"><span>1–30 days</span><b>'+s.buckets['1_30'].toFixed(2)+' SAR</b></div><div class="row"><span>31–60 days</span><b>'+s.buckets['31_60'].toFixed(2)+' SAR</b></div><div class="row"><span>61–90 days</span><b>'+s.buckets['61_90'].toFixed(2)+' SAR</b></div><div class="row"><span>No due date</span><b>'+s.noDueDate.toFixed(2)+' SAR</b></div>'+(names?'<h4 style="margin:14px 0 7px">Settlement priority by supplier</h4>'+names:'<div class="muted" style="margin-top:9px">No outstanding supplier payables available.</div>')+'<div class="muted" style="margin-top:9px">Aging uses each payable’s frozen SAR settlement amount and due date. It does not alter expenses, customer receivables, customer payments or booking totals.</div>'}
  const esc=v=>str(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function mount(){const dash=document.getElementById('dashboard');if(!dash||document.getElementById('keaSupplierAgingCard'))return;const card=document.createElement('div');card.id='keaSupplierAgingCard';card.className='card';card.style.marginTop='13px';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Supplier Aging & Payables Due Management</h3><div class="muted">Aging buckets, upcoming settlements, overdue balances and supplier priority.</div></div><button class="btn outline" type="button" onclick="window.KEA_SUPPLIER_AGING?.render()">Refresh</button></div><div id="keaSupplierAgingBody"></div>';dash.appendChild(card);render()}
  window.KEA_SUPPLIER_AGING={version:VERSION,rows,summary,supplierSummary,priority,render};
  window.keaSupplierAging=(source,opts)=>summary(source,opts);
  window.keaSupplierAgingRows=(source,opts)=>rows(source,opts);
  window.keaSupplierAgingSupplier=(source,supplier,opts)=>supplierSummary(source,supplier,opts);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,1000));else setTimeout(mount,1000);
  window.PHASE1_A1085={version:VERSION,feature:'supplier aging and payables due management',architecture:'github+supabase',storage:'existing supplier payable/payment payloads',schemaChanges:false,financialIntegrity:'preserved',expenseAccounting:'unchanged',customerReceivables:'unchanged',currency:'frozen payable SAR snapshots'};
})();
