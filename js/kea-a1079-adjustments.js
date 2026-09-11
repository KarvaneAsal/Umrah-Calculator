/* Karvan-e-Asal A1.0.79 — Tax / Discount / Adjustment Architecture
 * Controlled commercial adjustments with immutable historical snapshots.
 * This layer reports and records adjustments; it does not rewrite the authoritative
 * booking calculation or frozen customer financial totals.
 */
(function(){
  'use strict';
  const VERSION='A1.0.79', MAX=100;
  const TYPES=['discount','tax','surcharge','refund','manual'];
  const STATUSES=['pending','approved','applied','reversed','cancelled'];
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const arr=v=>Array.isArray(v)?v:[];
  const str=v=>String(v??'').trim();
  const esc=v=>str(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function uid(){const r=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);return 'ADJ-'+r.replace(/-/g,'').slice(0,14).toUpperCase()}
  function actor(){return {actorId:str(window.currentUser?.id),actorUsername:str(window.currentUser?.username||window.currentUser?.name)}}
  function ensure(q){
    if(!q||typeof q!=='object')return q;
    if(!q.adjustmentArchitecture||typeof q.adjustmentArchitecture!=='object')q.adjustmentArchitecture={};
    q.adjustmentArchitecture.version=VERSION;
    q.adjustmentArchitecture.historicalTotalsFrozen=true;
    if(!Array.isArray(q.adjustments))q.adjustments=[];
    q.adjustments=q.adjustments.slice(-MAX);
    return q;
  }
  function add(q,data){
    q=ensure(q||window.q);if(!q)throw new Error('Booking not found.');
    const d=data||{}, type=TYPES.includes(str(d.type))?str(d.type):'manual';
    const amount=money(Math.abs(Number(d.amount)||0));if(amount<=0)throw new Error('Adjustment amount must be greater than zero.');
    const direction=type==='discount'||type==='refund'?'decrease':(type==='tax'||type==='surcharge'?'increase':(d.direction==='decrease'?'decrease':'increase'));
    const a={adjustmentId:str(d.adjustmentId)||uid(),type,direction,amount,currency:str(d.currency||'SAR').toUpperCase(),description:str(d.description||d.reason),reference:str(d.reference),status:STATUSES.includes(str(d.status))?str(d.status):'pending',effectiveDate:d.effectiveDate||new Date().toISOString().slice(0,10),approvedAt:d.approvedAt||'',reversedAt:d.reversedAt||'',notes:str(d.notes),source:str(d.source||'manual'),...actor(),createdAt:new Date().toISOString()};
    q.adjustments.push(a);q.adjustments=q.adjustments.slice(-MAX);q.updatedAt=new Date().toISOString();return a;
  }
  function update(q,id,patch){q=ensure(q||window.q);const a=arr(q?.adjustments).find(x=>String(x.adjustmentId)===String(id));if(!a)return null;Object.assign(a,patch||{});if(a.status==='approved'&&!a.approvedAt)a.approvedAt=new Date().toISOString();if(a.status==='reversed'&&!a.reversedAt)a.reversedAt=new Date().toISOString();a.updatedAt=new Date().toISOString();return a}
  function list(q,opts){const rows=arr(ensure(q||window.q)?.adjustments);if(opts?.includeCancelled)return rows.slice();return rows.filter(a=>a.status!=='cancelled')}
  function applied(q){return list(q).filter(a=>a.status==='approved'||a.status==='applied')}
  function summary(q){const rows=applied(q);return {count:rows.length,discounts:money(rows.filter(a=>a.direction==='decrease'&&a.type==='discount').reduce((n,a)=>n+a.amount,0)),refunds:money(rows.filter(a=>a.direction==='decrease'&&a.type==='refund').reduce((n,a)=>n+a.amount,0)),increases:money(rows.filter(a=>a.direction==='increase').reduce((n,a)=>n+a.amount,0)),decreases:money(rows.filter(a=>a.direction==='decrease').reduce((n,a)=>n+a.amount,0)),net:money(rows.reduce((n,a)=>n+(a.direction==='increase'?a.amount:-a.amount),0))}}
  function allSummary(source){const qs=(Array.isArray(source)?source:arr(window.quotes)).filter(q=>q&&q.recordType!=='quotation');const rows=qs.flatMap(q=>applied(q));return {bookings:qs.length,count:rows.length,discounts:money(rows.filter(a=>a.direction==='decrease'&&a.type==='discount').reduce((n,a)=>n+a.amount,0)),refunds:money(rows.filter(a=>a.direction==='decrease'&&a.type==='refund').reduce((n,a)=>n+a.amount,0)),taxes:money(rows.filter(a=>a.type==='tax'&&a.direction==='increase').reduce((n,a)=>n+a.amount,0)),surcharges:money(rows.filter(a=>a.type==='surcharge'&&a.direction==='increase').reduce((n,a)=>n+a.amount,0)),increases:money(rows.filter(a=>a.direction==='increase').reduce((n,a)=>n+a.amount,0)),decreases:money(rows.filter(a=>a.direction==='decrease').reduce((n,a)=>n+a.amount,0)),net:money(rows.reduce((n,a)=>n+(a.direction==='increase'?a.amount:-a.amount),0))}}
  function historicalSnapshot(q){
    if(!q)return null;
    const total=Number(window.quoteStoredTotal?.(q)??q.total_sar??q.total??0)||0;
    return {baseTotalSar:money(total),snapshotAt:q.updatedAt||q.createdAt||new Date().toISOString(),source:'existing frozen booking total',notRecalculated:true};
  }
  function proposed(q){
    const s=historicalSnapshot(q), a=summary(q);return s?{...s,netAdjustmentSar:a.net,proposedAdjustedTotalSar:money(s.baseTotalSar+a.net),disclaimer:'Proposed management adjustment only; authoritative saved customer total remains unchanged.'}:null;
  }
  function render(){
    const root=document.getElementById('keaAdjustmentsBody');if(!root)return;const s=allSummary();
    root.innerHTML='<div class="metrics"><div class="metric"><div class="k">Discounts</div><div class="v">'+s.discounts.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Taxes</div><div class="v">'+s.taxes.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Surcharges</div><div class="v">'+s.surcharges.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Refunds</div><div class="v">'+s.refunds.toFixed(2)+' SAR</div></div></div><div class="muted" style="margin-top:8px">Adjustments are controlled records and management proposals. Frozen historical booking totals are never silently rewritten.</div>';
  }
  function mount(){const dash=document.getElementById('dashboard');if(!dash||document.getElementById('keaAdjustmentsCard'))return;const card=document.createElement('div');card.id='keaAdjustmentsCard';card.className='card';card.style.marginTop='13px';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Tax / Discount / Adjustments</h3><div class="muted">Controlled commercial adjustments with historical-total protection.</div></div><button class="btn outline" type="button" onclick="window.KEA_ADJUSTMENTS?.render()">Refresh</button></div><div id="keaAdjustmentsBody"></div>';dash.appendChild(card);render()}
  const oldSave=window.saveQuotes;
  if(typeof oldSave==='function'&&!oldSave.__keaA1079){function save(){arr(window.quotes).forEach(ensure);if(window.q)ensure(window.q);return oldSave.apply(this,arguments)}save.__keaA1079=true;window.saveQuotes=save}
  const oldNew=window.newBooking;if(typeof oldNew==='function'&&!oldNew.__keaA1079){function n(){const r=oldNew.apply(this,arguments);ensure(window.q);return r}n.__keaA1079=true;window.newBooking=n}
  window.KEA_ADJUSTMENTS={version:VERSION,types:TYPES.slice(),statuses:STATUSES.slice(),ensure,add,update,list,applied,summary,allSummary,historicalSnapshot,proposed,render};
  window.keaAddAdjustment=(q,data)=>add(q||window.q,data||{});window.keaAdjustmentSummary=summary;window.keaProposedAdjustedTotal=proposed;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,700));else setTimeout(mount,700);
  window.PHASE1_A1079={version:VERSION,feature:'tax discount and adjustment architecture',architecture:'github+supabase',storage:'existing booking payload',schemaChanges:false,financialIntegrity:'historical customer totals remain frozen; adjustments are controlled records and reporting proposals'};
})();
