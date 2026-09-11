/*
 * Karvan-e-Asal A1.0.68 — Dashboard + Reporting Architecture
 * GitHub module; derives operational reports from the existing Quote / Booking payload.
 * No Supabase schema changes. Financial totals remain sourced from saved financial data.
 */
(function(){
  'use strict';
  const VERSION='A1.0.68';
  const ACTIVE_STATUSES=['confirmed','ongoing','completed'];
  const SERVICE_LABELS={umrah:'Umrah',hajj:'Hajj',tourism:'Tourism',visaOnly:'Visa Only',ticketOnly:'Ticket Only'};
  const moneyNum=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const paxOf=x=>moneyNum(x?.adults)+moneyNum(x?.childBed)+moneyNum(x?.childNoBed)+moneyNum(x?.infants);
  const totalOf=x=>{try{return moneyNum(window.quoteStoredTotal?.(x));}catch(e){return moneyNum(x?.total_sar??x?.total);}};
  const rateOf=x=>{const r=moneyNum(x?.exchange_rate);return r>0?r:moneyNum(window.fx)||75;};
  const dateOf=x=>{const raw=String(x?.bookingDate||x?.createdAt||'').slice(0,10);const d=new Date(raw+'T12:00:00');return Number.isFinite(d.getTime())?d:null;};
  function records(){return Array.isArray(window.quotes)?window.quotes.map(x=>typeof window.normalizeQuote==='function'?window.normalizeQuote(x):x).filter(Boolean):[];}
  function service(x){const t=String(x?.serviceType||'umrah');return SERVICE_LABELS[t]||t;}
  function inPeriod(x,from,to){const d=dateOf(x);return !!d&&d>=from&&d<=to;}
  function periodRange(key){
    const now=new Date(); let from,to=new Date(now);
    if(key==='today'){from=new Date(now.getFullYear(),now.getMonth(),now.getDate());}
    else if(key==='week'){const day=now.getDay();from=new Date(now.getFullYear(),now.getMonth(),now.getDate()-day);}
    else if(key==='year'){from=new Date(now.getFullYear(),0,1);}
    else {from=new Date(now.getFullYear(),now.getMonth(),1);}
    to.setHours(23,59,59,999); return {from,to};
  }
  function build(key='month'){
    const all=records(), range=periodRange(key), active=all.filter(x=>ACTIVE_STATUSES.includes(String(x.status||''))), rows=active.filter(x=>inPeriod(x,range.from,range.to));
    const serviceMap={},statusMap={},paymentMap={unpaid:0,partial:0,paid:0,other:0};
    let sar=0,pkr=0,pax=0,paid=0,due=0;
    rows.forEach(x=>{
      const label=service(x); if(!serviceMap[label])serviceMap[label]={bookings:0,pax:0,sar:0,pkr:0};
      const total=totalOf(x), r=rateOf(x), paidAmt=Math.min(total,Math.max(0,moneyNum(x.amount_paid)));
      serviceMap[label].bookings++;serviceMap[label].pax+=paxOf(x);serviceMap[label].sar+=total;serviceMap[label].pkr+=total*r;
      sar+=total;pkr+=total*r;pax+=paxOf(x);paid+=paidAmt;due+=Math.max(0,total-paidAmt);
      const st=String(x.status||'draft');statusMap[st]=(statusMap[st]||0)+1;
      const ps=String(x.payment_status||'unpaid');paymentMap[ps]=(paymentMap[ps]||0)+1;
    });
    const statusAll={draft:0,confirmed:0,ongoing:0,completed:0,cancelled:0};all.forEach(x=>{const st=String(x.status||'draft');statusAll[st]=(statusAll[st]||0)+1;});
    return {key,from:range.from,to:range.to,rows,all,active,serviceMap,statusMap,statusAll,paymentMap,sar,pkr,pax,paid,due,allTimeSar:active.reduce((n,x)=>n+totalOf(x),0),allTimePax:active.reduce((n,x)=>n+paxOf(x),0)};
  }
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=n=>{try{return typeof window.sar==='function'?window.sar(n):'SAR '+moneyNum(n).toFixed(2);}catch(e){return 'SAR '+moneyNum(n).toFixed(2);}};
  const fmtPkr=n=>{try{return typeof window.pkr==='function'?window.pkr(n):'PKR '+Math.round(moneyNum(n)).toLocaleString();}catch(e){return 'PKR '+Math.round(moneyNum(n)).toLocaleString();}};
  function render(){
    const host=document.getElementById('keaReportingBody'); if(!host)return;
    const sel=document.getElementById('dashboardPeriod');
    let key=sel?.value||'monthly'; if(key==='3month'||key==='6month'||key==='all'||key==='yearly'){
      // Reuse the dashboard's selected period semantics through explicit ranges.
      const now=new Date(); let from=new Date(now.getFullYear(),now.getMonth(),1);
      if(key==='3month')from=new Date(now.getFullYear(),now.getMonth()-2,1);
      else if(key==='6month')from=new Date(now.getFullYear(),now.getMonth()-5,1);
      else if(key==='yearly')from=new Date(now.getFullYear(),0,1);
      else from=new Date(2000,0,1);
      const to=new Date(now);to.setHours(23,59,59,999);
      const base=build('month'); base.from=from;base.to=to;base.rows=base.active.filter(x=>inPeriod(x,from,to));
      // Rebuild aggregates for the selected range.
      const fresh=buildFrom(base.rows,base.all); draw(fresh,host);
    } else draw(build(key==='today'?'today':'month'),host);
  }
  function buildFrom(rows,all){
    const serviceMap={},statusMap={},paymentMap={unpaid:0,partial:0,paid:0,other:0};let sar=0,pkr=0,pax=0,paid=0,due=0;
    rows.forEach(x=>{const label=service(x),total=totalOf(x),r=rateOf(x),pa=Math.min(total,Math.max(0,moneyNum(x.amount_paid)));if(!serviceMap[label])serviceMap[label]={bookings:0,pax:0,sar:0,pkr:0};serviceMap[label].bookings++;serviceMap[label].pax+=paxOf(x);serviceMap[label].sar+=total;serviceMap[label].pkr+=total*r;sar+=total;pkr+=total*r;pax+=paxOf(x);paid+=pa;due+=Math.max(0,total-pa);const st=String(x.status||'draft');statusMap[st]=(statusMap[st]||0)+1;const ps=String(x.payment_status||'unpaid');paymentMap[ps]=(paymentMap[ps]||0)+1;});
    const statusAll={draft:0,confirmed:0,ongoing:0,completed:0,cancelled:0};all.forEach(x=>{const st=String(x.status||'draft');statusAll[st]=(statusAll[st]||0)+1;});
    return {rows,all,serviceMap,statusMap,statusAll,paymentMap,sar,pkr,pax,paid,due,allTimeSar:all.filter(x=>ACTIVE_STATUSES.includes(String(x.status||''))).reduce((n,x)=>n+totalOf(x),0),allTimePax:all.filter(x=>ACTIVE_STATUSES.includes(String(x.status||''))).reduce((n,x)=>n+paxOf(x),0)};
  }
  function draw(r,host){
    const svc=Object.entries(r.serviceMap).sort((a,b)=>b[1].sar-a[1].sar);
    const status=['confirmed','ongoing','completed','cancelled','draft'].map(k=>`<span class="btn outline" style="padding:5px 8px;font-size:9px">${esc(k)}: <b>${r.statusAll?.[k]||0}</b></span>`).join(' ');
    host.innerHTML=`<div class="metrics"><div class="metric"><div class="k">Period Sales — SAR</div><div class="v">${fmt(r.sar)}</div></div><div class="metric"><div class="k">Period Sales — PKR</div><div class="v">${fmtPkr(r.pkr)}</div></div><div class="metric"><div class="k">Bookings</div><div class="v">${r.rows.length}</div></div><div class="metric"><div class="k">Passengers</div><div class="v">${r.pax}</div></div><div class="metric"><div class="k">Collected</div><div class="v">${fmt(r.paid)}</div></div><div class="metric"><div class="k">Outstanding</div><div class="v">${fmt(r.due)}</div></div></div><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">${status}</div><div class="grid2" style="margin-top:13px"><div><h4 class="section-title">Service Performance</h4><div class="tablewrap"><table class="table"><thead><tr><th>Service</th><th>Bookings</th><th>Pax</th><th>Sales SAR</th><th>Sales PKR</th></tr></thead><tbody>${svc.length?svc.map(([k,v])=>`<tr><td><strong>${esc(k)}</strong></td><td>${v.bookings}</td><td>${v.pax}</td><td>${fmt(v.sar)}</td><td>${fmtPkr(v.pkr)}</td></tr>`).join(''):'<tr><td colspan="5" class="muted">No booking data for this period.</td></tr>'}</tbody></table></div></div><div><h4 class="section-title">Payment & Operational Status</h4><div class="tablewrap"><table class="table"><tbody><tr><td>Paid bookings</td><td>${r.paymentMap.paid||0}</td></tr><tr><td>Partial bookings</td><td>${r.paymentMap.partial||0}</td></tr><tr><td>Unpaid bookings</td><td>${r.paymentMap.unpaid||0}</td></tr><tr><td>All-time active sales</td><td>${fmt(r.allTimeSar)}</td></tr><tr><td>All-time active pax</td><td>${r.allTimePax}</td></tr></tbody></table></div></div></div>`;
  }
  function exportCSV(){
    const r=buildFrom(records().filter(x=>ACTIVE_STATUSES.includes(String(x.status||''))),records());
    const lines=[['Service','Bookings','Passengers','Sales SAR','Sales PKR'],...Object.entries(r.serviceMap).map(([k,v])=>[k,v.bookings,v.pax,v.sar.toFixed(2),v.pkr.toFixed(2)])];
    const csv=lines.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='Karvan-e-Asal-Operational-Report.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  window.KEA_REPORTING={version:VERSION,build,render,exportCSV,serviceLabels:SERVICE_LABELS};
  window.PHASE1_A1068={version:VERSION,feature:'dashboard reporting architecture',architecture:'github+supabase',schemaChanges:false,financialSource:'saved financial totals'};
  const oldDashboard=window.dashboard;
  window.dashboard=function(){const out=typeof oldDashboard==='function'?oldDashboard.apply(this,arguments):undefined;try{render();}catch(e){console.warn('[A1.0.68] dashboard report render failed',e);}return out;};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(render,200));else setTimeout(render,200);
})();
