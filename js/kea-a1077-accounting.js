/* Karvan-e-Asal A1.0.77 — Accounting / Profitability Architecture
 * Management accounting derives from saved customer revenue, receivables/payments,
 * and operational/procurement expenses. It never rewrites the customer financial engine.
 */
(function(){
  'use strict';
  const VERSION='A1.0.77';
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const arr=v=>Array.isArray(v)?v:[];
  const serviceName=k=>({umrah:'Umrah',hajj:'Hajj',tourism:'Tourism',visaOnly:'Visa Only',ticketOnly:'Ticket Only'}[k]||k||'Other');
  function rows(source){return (Array.isArray(source)?source:arr(window.quotes)).filter(q=>q&&q.recordType!=='quotation'&&q.status!=='cancelled');}
  function revenue(q){return money(q?.total_sar??q?.total);}
  function expenseRows(q){return arr(q?.expenses).filter(e=>e&&e.status!=='cancelled');}
  function expense(q){return money(expenseRows(q).reduce((n,e)=>n+(window.keaCurrencyExpenseBase?window.keaCurrencyExpenseBase(q,e):Number(e.totalCost||0)),0));}
  function collected(q){return money(q?.amount_paid);}
  function due(q){return money(Math.max(0,revenue(q)-collected(q)));}
  function summary(source){
    const qs=rows(source);
    const revenueTotal=money(qs.reduce((n,q)=>n+revenue(q),0));
    const expenseTotal=money(qs.reduce((n,q)=>n+expense(q),0));
    const collectedTotal=money(qs.reduce((n,q)=>n+collected(q),0));
    const receivableTotal=money(qs.reduce((n,q)=>n+due(q),0));
    const grossProfit=money(revenueTotal-expenseTotal);
    const margin=revenueTotal?money(grossProfit/revenueTotal*100):0;
    return {bookings:qs.length,revenue:revenueTotal,expenses:expenseTotal,collected:collectedTotal,receivables:receivableTotal,profit:grossProfit,margin};
  }
  function byService(source){
    const out={};
    rows(source).forEach(q=>{const k=q.serviceType||'other';if(!out[k])out[k]={serviceType:k,label:serviceName(k),bookings:0,revenue:0,expenses:0,collected:0,receivables:0,profit:0};const x=out[k];x.bookings++;x.revenue+=revenue(q);x.expenses+=expense(q);x.collected+=collected(q);x.receivables+=due(q);});
    Object.values(out).forEach(x=>{x.revenue=money(x.revenue);x.expenses=money(x.expenses);x.collected=money(x.collected);x.receivables=money(x.receivables);x.profit=money(x.revenue-x.expenses);x.margin=x.revenue?money(x.profit/x.revenue*100):0});
    return Object.values(out).sort((a,b)=>b.revenue-a.revenue);
  }
  function supplierSpend(source){
    const map={};rows(source).forEach(q=>expenseRows(q).forEach(e=>{const key=e.supplierId||e.supplierName||'Unassigned';if(!map[key])map[key]={supplierId:e.supplierId||'',supplierName:e.supplierName||'Unassigned',amount:0,count:0};map[key].amount+=(window.keaCurrencyExpenseBase?window.keaCurrencyExpenseBase(q,e):Number(e.totalCost||0));map[key].count++}));return Object.values(map).map(x=>({...x,amount:money(x.amount)})).sort((a,b)=>b.amount-a.amount);
  }
  function render(){
    const root=document.getElementById('keaAccountingBody');if(!root)return;
    const s=summary();
    const service=byService();
    root.innerHTML='<div class="metrics"><div class="metric"><div class="k">Revenue</div><div class="v">'+s.revenue.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Expenses</div><div class="v">'+s.expenses.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Profit</div><div class="v">'+s.profit.toFixed(2)+' SAR</div></div><div class="metric"><div class="k">Margin</div><div class="v">'+s.margin.toFixed(1)+'%</div></div></div><div class="row" style="margin-top:10px"><span>Collected</span><b>'+s.collected.toFixed(2)+' SAR</b></div><div class="row"><span>Receivables</span><b>'+s.receivables.toFixed(2)+' SAR</b></div><h4 style="margin:14px 0 7px">Profitability by service</h4>'+(service.length?service.map(x=>'<div class="row"><span>'+x.label+' <small class="muted">('+x.bookings+')</small></span><b>'+x.profit.toFixed(2)+' SAR <small class="muted">('+x.margin.toFixed(1)+'%)</small></b></div>').join(''):'<div class="muted">No saved bookings yet.</div>')+'<div class="muted" style="margin-top:9px">Management view only. Customer totals remain sourced from the existing saved/frozen financial records; expenses are not added to customer charges.</div>';
  }
  function mount(){const dash=document.getElementById('dashboard');if(!dash||document.getElementById('keaAccountingCard'))return;const card=document.createElement('div');card.id='keaAccountingCard';card.className='card';card.style.marginTop='13px';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Accounting & Profitability</h3><div class="muted">Revenue, collections, procurement/operational expenses and management profit.</div></div><button class="btn outline" type="button" onclick="window.KEA_ACCOUNTING?.render()">Refresh</button></div><div id="keaAccountingBody"></div>';dash.appendChild(card);render()}
  const oldDash=window.dashboard;if(typeof oldDash==='function'&&!oldDash.__keaA1077){function d(){const r=oldDash.apply(this,arguments);setTimeout(render,0);return r}d.__keaA1077=true;window.dashboard=d}
  window.KEA_ACCOUNTING={version:VERSION,summary,byService,supplierSpend,render};
  window.keaAccountingSummary=summary;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,700));else setTimeout(mount,700);
  window.PHASE1_A1077={version:VERSION,feature:'accounting and profitability architecture',architecture:'github+supabase',storage:'derived from existing booking payload',schemaChanges:false,revenueSource:'existing saved/frozen customer financial totals',expenseSource:'A1.0.76 booking expenses',customerFinancialEngine:'unchanged'};
})();
