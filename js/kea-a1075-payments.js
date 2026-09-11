/* A1.0.75 — Payment / Receivables Architecture */
(function(){
  'use strict';
  const VERSION='A1.0.75';
  const STATUSES=['unpaid','partial','paid','refunded'];
  const METHODS=['cash','bank_transfer','card','online','other'];
  const MAX=100;
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const arr=v=>Array.isArray(v)?v:[];
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function ensure(q){
    if(!q||typeof q!=='object')return q;
    if(!q.paymentArchitecture)q.paymentArchitecture={version:VERSION};
    if(!Array.isArray(q.paymentHistory))q.paymentHistory=[];
    q.paymentHistory=q.paymentHistory.slice(-MAX);
    if(typeof window.normalizePayment==='function')window.normalizePayment(q);
    return q;
  }
  function actor(){return {actorId:String(window.currentUser?.id||''),actorUsername:String(window.currentUser?.username||window.currentUser?.name||'')};}
  function add(q,data){
    q=ensure(q||window.q); if(!q)throw new Error('Booking not found.');
    const before=money(q.amount_paid), total=money(q.total_sar??q.total);
    const requested=money(data?.amount??data?.amount_paid??0);
    if(requested<=0)throw new Error('Payment amount must be greater than zero.');
    if(before+requested>total+0.005)throw new Error('Payment exceeds the outstanding balance.');
    q.amount_paid=money(before+requested);
    if(typeof window.normalizePayment==='function')window.normalizePayment(q);
    const a=actor();
    const entry={paymentId:'PAY-'+(globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,8)),amount:requested,currency:'SAR',method:METHODS.includes(String(data?.method))?String(data.method):'other',reference:String(data?.reference||'').trim(),receivedAt:data?.receivedAt||new Date().toISOString(),notes:String(data?.notes||'').trim(),status:'received',...a};
    q.paymentHistory.push(entry);q.paymentHistory=q.paymentHistory.slice(-MAX);q.updatedAt=new Date().toISOString();
    return entry;
  }
  function outstanding(q){q=ensure(q);return Math.max(0,money(q?.total_sar??q?.total)-money(q?.amount_paid));}
  function history(q){return arr(ensure(q)?.paymentHistory).slice().sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt)));}
  function receivables(source){
    const rows=(Array.isArray(source)?source:(Array.isArray(window.quotes)?window.quotes:[])).map(ensure);
    return rows.map(q=>({reference:q.reference||'',serviceType:q.serviceType||'',customer:q.customerProfile?.name||q.customer||'',total:money(q.total_sar??q.total),paid:money(q.amount_paid),due:outstanding(q),status:q.payment_status||'unpaid',bookingStatus:q.status||'draft',updatedAt:q.updatedAt||''})).filter(x=>x.due>0).sort((a,b)=>b.due-a.due);
  }
  function summary(source){
    const rows=(Array.isArray(source)?source:(Array.isArray(window.quotes)?window.quotes:[])).map(ensure);
    return {bookings:rows.length,total:money(rows.reduce((n,q)=>n+money(q.total_sar??q.total),0)),paid:money(rows.reduce((n,q)=>n+money(q.amount_paid),0)),due:money(rows.reduce((n,q)=>n+outstanding(q),0)),unpaid:rows.filter(q=>q.payment_status==='unpaid'&&outstanding(q)>0).length,partial:rows.filter(q=>q.payment_status==='partial').length,paidBookings:rows.filter(q=>q.payment_status==='paid').length};
  }
  function render(){
    const root=document.getElementById('keaPaymentsBody');if(!root)return;
    const s=summary(), r=receivables();
    root.innerHTML='<div class="metrics"><div class="metric"><div class="k">Receivables</div><div class="v">'+money(s.due).toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Collected</div><div class="v">'+money(s.paid).toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Unpaid</div><div class="v">'+s.unpaid+'</div></div><div class="metric"><div class="k">Partial</div><div class="v">'+s.partial+'</div></div></div>'+(r.length?'<div class="tablewrap" style="margin-top:10px"><table class="table"><thead><tr><th>Reference</th><th>Customer</th><th>Status</th><th>Due</th><th>History</th></tr></thead><tbody>'+r.slice(0,25).map(x=>'<tr><td><b>'+esc(x.reference)+'</b><div class="muted">'+esc(x.serviceType)+'</div></td><td>'+esc(x.customer||'Customer')+'</td><td>'+esc(x.status)+'</td><td><b>'+money(x.due).toFixed(2)+' SAR</b></td><td><button class="btn outline" type="button" onclick="window.KEA_PAYMENTS?.openHistory(\''+esc(x.reference)+'\')">Payments</button></td></tr>').join('')+'</tbody></table></div>':'<div class="muted" style="margin-top:10px">No outstanding receivables.</div>');
  }
  function openHistory(ref){
    const q=arr(window.quotes).find(x=>String(x?.reference)===String(ref)); if(!q)return;
    const items=history(q), host=document.getElementById('dashboard');if(!host)return;
    let card=document.getElementById('keaPaymentHistoryCard');if(!card){card=document.createElement('div');card.id='keaPaymentHistoryCard';card.className='card';host.appendChild(card)}
    card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Payment History</h3><div class="muted">'+esc(ref)+' • Paid '+money(q.amount_paid).toFixed(2)+' SAR • Due '+outstanding(q).toFixed(2)+' SAR</div></div><button class="btn outline" type="button" onclick="this.closest(\'.card\').remove()">Close</button></div>'+(items.length?'<div class="tablewrap"><table class="table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Received By</th></tr></thead><tbody>'+items.map(e=>'<tr><td>'+esc(e.receivedAt)+'</td><td>'+money(e.amount).toFixed(2)+' SAR</td><td>'+esc(e.method)+'</td><td>'+esc(e.reference||'—')+'</td><td>'+esc(e.actorUsername||'—')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="muted">No payment transactions recorded yet. Existing amount-paid values remain preserved as the booking financial state.</div>');
    card.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function wrapSave(){
    const old=window.saveQuotes;if(typeof old!=='function'||old.__keaA1075)return;
    function save(){
      const before=new Map(arr(window.quotes).map(q=>[String(q.reference),money(q.amount_paid)]));
      arr(window.quotes).forEach(ensure);if(window.q)ensure(window.q);
      arr(window.quotes).forEach(q=>{const ref=String(q.reference||'');const prev=before.get(ref);const now=money(q.amount_paid);if(prev!=null&&now>prev){const delta=money(now-prev);const h=history(q);const already=h.some(e=>money(e.amount)===delta&&String(e.notes||'').includes('Synchronized from existing Amount Paid'));if(!already){q.paymentHistory.push({paymentId:'PAY-SYNC-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),amount:delta,currency:'SAR',method:'other',reference:'',receivedAt:q.updatedAt||new Date().toISOString(),notes:'Synchronized from existing Amount Paid field',status:'received',...actor()});q.paymentHistory=q.paymentHistory.slice(-MAX);}}});
      return old.apply(this,arguments);
    }
    save.__keaA1075=true;window.saveQuotes=save;
  }
  function wrapNew(){const old=window.newBooking;if(typeof old==='function'&&!old.__keaA1075){function n(){const r=old.apply(this,arguments);ensure(window.q);return r}n.__keaA1075=true;window.newBooking=n;}}
  function mount(){
    const dash=document.getElementById('dashboard');if(dash&&!document.getElementById('keaPaymentsCard')){const card=document.createElement('div');card.id='keaPaymentsCard';card.className='card';card.style.marginTop='13px';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Payments & Receivables</h3><div class="muted">Payment transactions and outstanding balances derived from the existing Quote / Booking financial source.</div></div><button class="btn outline" type="button" onclick="window.KEA_PAYMENTS?.render()">Refresh</button></div><div id="keaPaymentsBody"></div>';dash.appendChild(card)}
    render();
  }
  window.KEA_PAYMENTS={version:VERSION,statuses:STATUSES.slice(),methods:METHODS.slice(),ensure,add,history,outstanding,receivables,summary,render,openHistory};
  window.keaAddPayment=(q,data)=>add(q||window.q,data||{});
  window.keaPaymentHistory=history;window.keaOutstanding=outstanding;window.keaReceivables=receivables;
  wrapSave();wrapNew();
  const oldFinish=window.finishQuote;if(typeof oldFinish==='function'&&!oldFinish.__keaA1075){function f(){ensure(window.q);return oldFinish.apply(this,arguments)}f.__keaA1075=true;window.finishQuote=f;}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,450));else setTimeout(mount,450);
  window.PHASE1_A1075={version:VERSION,feature:'payment and receivables architecture',architecture:'github+supabase',storage:'existing quote booking payload',schemaChanges:false,financialSourceOfTruth:'existing normalized payment and frozen financial totals',historyLimit:MAX};
})();
