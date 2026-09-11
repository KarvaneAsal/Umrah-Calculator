/* Karvan-e-Asal A1.0.80 — Accounting Period / Closing Architecture
 * Period controls freeze management accounting periods without rewriting booking data.
 * Existing booking financial snapshots remain the customer-financial source of truth.
 */
(function(){
  'use strict';
  const VERSION='A1.0.80', STORAGE='keaAccountingPeriodsV1', REMOTE='accounting_periods', MAX=240;
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const arr=v=>Array.isArray(v)?v:[];
  const str=v=>String(v??'').trim();
  const esc=v=>str(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let periods=[];
  function actor(){return {actorId:str(window.currentUser?.id),actorUsername:str(window.currentUser?.username||window.currentUser?.name)}}
  function uid(){return 'PER-'+(globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,14).toUpperCase()}
  function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(str(v))}
  function normalize(p){
    const x={...p}; x.periodId=str(x.periodId)||uid(); x.name=str(x.name)||((x.startDate||'')+' to '+(x.endDate||''));
    x.startDate=str(x.startDate); x.endDate=str(x.endDate); x.status=x.status==='closed'?'closed':'open';
    x.closedAt=str(x.closedAt); x.closedBy=str(x.closedBy); x.closedByName=str(x.closedByName); x.notes=str(x.notes); x.createdAt=str(x.createdAt)||new Date().toISOString();
    return x;
  }
  function sort(){periods.sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate))||String(b.createdAt).localeCompare(String(a.createdAt)))}
  function saveLocal(){try{localStorage.setItem(STORAGE,JSON.stringify(periods.slice(0,MAX)))}catch(e){console.warn('[A1.0.80] local period save failed',e)}}
  async function saveRemote(){
    try{
      const online=!!window.KARVAN_ONLINE?.enabled&&!!window.KARVAN_ONLINE?.sb;
      if(!online||typeof window.isSuperAdmin!=='function'||!window.isSuperAdmin())return false;
      if(typeof window.upsertConfig==='function')return await window.upsertConfig(REMOTE,periods.slice(0,MAX));
      const {data:{user}}=await window.KARVAN_ONLINE.sb.auth.getUser();if(!user)return false;
      const r=await window.KARVAN_ONLINE.sb.from('app_config').upsert({key:REMOTE,value:periods.slice(0,MAX),updated_by:user.id,updated_at:new Date().toISOString()});
      return !r.error;
    }catch(e){console.warn('[A1.0.80] remote period save failed',e);return false}
  }
  async function load(){
    let local=[];try{local=json(localStorage.getItem(STORAGE))}catch(e){}
    if(Array.isArray(local))periods=local.map(normalize);
    try{
      const online=!!window.KARVAN_ONLINE?.enabled&&!!window.KARVAN_ONLINE?.sb;
      if(online){const r=await window.KARVAN_ONLINE.sb.from('app_config').select('value').eq('key',REMOTE).maybeSingle();if(!r.error&&Array.isArray(r.data?.value))periods=r.data.value.map(normalize)}
    }catch(e){console.warn('[A1.0.80] remote period load failed',e)}
    sort();saveLocal();render();
  }
  function json(v){try{return JSON.parse(v)}catch(e){return null}}
  function overlapDate(date,p){return validDate(date)&&validDate(p.startDate)&&validDate(p.endDate)&&date>=p.startDate&&date<=p.endDate}
  function findByDate(date){return periods.find(p=>overlapDate(str(date).slice(0,10),p))||null}
  function find(id){return periods.find(p=>String(p.periodId)===String(id))||null}
  function closedForDate(date){const p=findByDate(date);return p?.status==='closed'?p:null}
  function ensureNoOverlap(candidate,ignoreId){return !periods.some(p=>p.periodId!==ignoreId&&validDate(candidate.startDate)&&validDate(candidate.endDate)&&validDate(p.startDate)&&validDate(p.endDate)&&candidate.startDate<=p.endDate&&candidate.endDate>=p.startDate)}
  async function add(data){
    if(typeof window.isSuperAdmin!=='function'||!window.isSuperAdmin())throw new Error('Only Super Admin can manage accounting periods.');
    const p=normalize({...data,periodId:uid(),status:'open'});
    if(!validDate(p.startDate)||!validDate(p.endDate)||p.startDate>p.endDate)throw new Error('Enter a valid start and end date.');
    if(!ensureNoOverlap(p))throw new Error('This accounting period overlaps an existing period.');
    periods.push(p);sort();saveLocal();await saveRemote();render();return p;
  }
  async function close(id,notes){
    if(typeof window.isSuperAdmin!=='function'||!window.isSuperAdmin())throw new Error('Only Super Admin can close an accounting period.');
    const p=find(id);if(!p)throw new Error('Accounting period not found.');if(p.status==='closed')return p;
    p.status='closed';p.closedAt=new Date().toISOString();const a=actor();p.closedBy=a.actorId;p.closedByName=a.actorUsername;p.notes=str(notes||p.notes);p.summary=summaryForPeriod(p);
    saveLocal();await saveRemote();render();return p;
  }
  async function reopen(id){
    if(typeof window.isSuperAdmin!=='function'||!window.isSuperAdmin())throw new Error('Only Super Admin can reopen an accounting period.');
    const p=find(id);if(!p)throw new Error('Accounting period not found.');p.status='open';p.reopenedAt=new Date().toISOString();const a=actor();p.reopenedBy=a.actorId;p.reopenedByName=a.actorUsername;p.summary=null;saveLocal();await saveRemote();render();return p;
  }
  function rows(){return arr(window.quotes).filter(q=>q&&q.recordType!=='quotation'&&q.status!=='cancelled')}
  function qDate(q){return str(q?.bookingDate||q?.createdAt||'').slice(0,10)}
  function summaryForPeriod(p){
    const qs=rows().filter(q=>overlapDate(qDate(q),p));
    const revenue=money(qs.reduce((n,q)=>n+money(q.total_sar??q.total),0));
    const collected=money(qs.reduce((n,q)=>n+money(q.amount_paid),0));
    const expenses=money(qs.reduce((n,q)=>n+arr(q.expenses).filter(e=>e?.status!=='cancelled').reduce((s,e)=>s+Number(window.keaCurrencyExpenseBase?window.keaCurrencyExpenseBase(q,e):e.totalCost||0),0),0));
    const profit=money(revenue-expenses);
    return {periodId:p.periodId,startDate:p.startDate,endDate:p.endDate,bookings:qs.length,revenue,collections:collected,receivables:money(Math.max(0,revenue-collected)),expenses,profit,margin:revenue?money(profit/revenue*100):0,snapshotAt:new Date().toISOString()};
  }
  function summary(id){const p=find(id);return p?summaryForPeriod(p):null}
  function isLocked(q){return !!closedForDate(qDate(q))}
  function assertWritable(q){const p=closedForDate(qDate(q));if(p)throw new Error('Accounting period '+p.name+' is closed. Reopen the period before changing this booking.');return true}
  function render(){
    const root=document.getElementById('keaPeriodsBody');if(!root)return;
    const can=typeof window.isSuperAdmin==='function'&&window.isSuperAdmin();
    root.innerHTML='<div class="notice">Closed periods prevent saving changes to bookings dated inside the closed range. Closing never rewrites or deletes historical booking financial snapshots.</div>'+
      '<div class="savebar" style="margin-top:10px">'+(can?'<button class="btn primary" type="button" onclick="window.KEA_PERIODS?.promptAdd()">+ Add Accounting Period</button>':'<span class="muted">Only Super Admin can create or close periods.</span>')+'</div>'+
      (periods.length?'<div class="tablewrap" style="margin-top:10px"><table class="table"><thead><tr><th>Period</th><th>Status</th><th>Bookings</th><th>Revenue</th><th>Expenses</th><th>Profit</th><th>Action</th></tr></thead><tbody>'+periods.map(p=>{const s=summaryForPeriod(p);return '<tr><td><b>'+esc(p.name)+'</b><div class="muted">'+esc(p.startDate)+' → '+esc(p.endDate)+'</div></td><td><b>'+esc(p.status)+'</b>'+(p.closedAt?'<div class="muted">'+esc(p.closedAt.slice(0,10))+'</div>':'')+'</td><td>'+s.bookings+'</td><td>'+s.revenue.toFixed(2)+' SAR</td><td>'+s.expenses.toFixed(2)+' SAR</td><td><b>'+s.profit.toFixed(2)+' SAR</b></td><td>'+(can?(p.status==='open'?'<button class="btn outline" type="button" onclick="window.KEA_PERIODS?.promptClose(\''+esc(p.periodId)+'\')">Close</button>':'<button class="btn outline" type="button" onclick="window.KEA_PERIODS?.reopen(\''+esc(p.periodId)+'\')">Reopen</button>'):'—')+'</td></tr>'}).join('')+'</tbody></table></div>':'<div class="muted" style="margin-top:10px">No accounting periods configured yet.</div>');
  }
  function promptAdd(){const name=prompt('Period name (e.g. September 2026)','');if(name===null)return;const start=prompt('Start date (YYYY-MM-DD)','');if(start===null)return;const end=prompt('End date (YYYY-MM-DD)','');if(end===null)return;add({name,startDate:start,endDate:end}).catch(e=>alert(e.message))}
  function promptClose(id){const p=find(id);if(!p)return;const s=summaryForPeriod(p);if(!confirm('Close '+p.name+'? This will prevent booking changes dated '+p.startDate+' to '+p.endDate+'. Current management totals: '+s.profit.toFixed(2)+' SAR profit.'))return;const notes=prompt('Closing note (optional)','');close(id,notes).catch(e=>alert(e.message))}
  function mount(){
    const settings=document.getElementById('settings');
    if(settings&&!document.getElementById('keaPeriodsCard')){const card=document.createElement('div');card.id='keaPeriodsCard';card.className='card adminOnly';card.innerHTML='<h3 class="section-title">Accounting Periods & Closing</h3><p class="muted">Create controlled reporting periods and close them after review. Closing blocks booking edits inside the period without changing historical financial snapshots.</p><div id="keaPeriodsBody"></div>';const backup=settings.querySelector('.card:last-child');settings.insertBefore(card,backup||null)}
    const dash=document.getElementById('dashboard');if(dash&&!document.getElementById('keaPeriodsDashboardCard')){const card=document.createElement('div');card.id='keaPeriodsDashboardCard';card.className='card';card.style.marginTop='13px';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Accounting Periods</h3><div class="muted">Open/closed period status and management profitability.</div></div><button class="btn outline" type="button" onclick="window.KEA_PERIODS?.render()">Refresh</button></div><div id="keaPeriodsDashboardBody"></div>';dash.appendChild(card)}
    renderDashboard();render();
  }
  function renderDashboard(){const root=document.getElementById('keaPeriodsDashboardBody');if(!root)return;const open=periods.filter(p=>p.status==='open').length,closed=periods.filter(p=>p.status==='closed').length;root.innerHTML='<div class="metrics"><div class="metric"><div class="k">Open Periods</div><div class="v">'+open+'</div></div><div class="metric"><div class="k">Closed Periods</div><div class="v">'+closed+'</div></div><div class="metric"><div class="k">Configured Periods</div><div class="v">'+periods.length+'</div></div></div>'+(periods.length?'<div style="margin-top:10px">'+periods.slice(0,6).map(p=>{const s=summaryForPeriod(p);return '<div class="row"><span>'+esc(p.name)+' <small class="muted">'+esc(p.status)+'</small></span><b>'+s.profit.toFixed(2)+' SAR</b></div>'}).join('')+'</div>':'<div class="muted" style="margin-top:8px">No accounting periods configured.</div>')}
  function wrapSave(){
    const old=window.saveQuotes;if(typeof old!=='function'||old.__keaA1080)return;
    function save(){
      const touched=rows().filter(q=>q?.updatedAt&&q.updatedAt===window.q?.updatedAt); // harmless marker; actual guard below covers current and changed records.
      try{if(window.q&&isLocked(window.q))throw new Error('Accounting period is closed. Reopen it before saving this booking.');for(const q of arr(window.quotes)){if(q&&q.__keaPeriodWriteAttempt&&isLocked(q))throw new Error('Accounting period is closed. Reopen it before saving this booking.')}}catch(e){alert(e.message);return false}
      return old.apply(this,arguments);
    }
    save.__keaA1080=true;window.saveQuotes=save;
  }
  function wrapFinish(){const old=window.finishQuote;if(typeof old!=='function'||old.__keaA1080)return;function f(){try{if(window.q&&isLocked(window.q))throw new Error('Accounting period is closed. Reopen it before changing this booking.')}catch(e){alert(e.message);return}return old.apply(this,arguments)}f.__keaA1080=true;window.finishQuote=f}
  window.KEA_PERIODS={version:VERSION,list:()=>periods.slice(),find,findByDate,closedForDate,isLocked,assertWritable,add,close,reopen,summary,summaryForPeriod,render,promptAdd,promptClose,load};
  window.keaAccountingPeriodForDate=findByDate;window.keaAccountingPeriodClosed=isLocked;window.keaAssertAccountingWritable=assertWritable;
  wrapSave();wrapFinish();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(mount,650);setTimeout(load,900)});else{setTimeout(mount,650);setTimeout(load,900)}
  window.PHASE1_A1080={version:VERSION,feature:'accounting period and closing architecture',architecture:'github+supabase',storage:'existing Supabase app_config with local offline cache',schemaChanges:false,historicalFinancialSnapshots:'preserved',closedPeriodBehavior:'blocks booking edits within closed date range'};
})();
