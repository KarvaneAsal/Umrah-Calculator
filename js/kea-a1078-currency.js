/* Karvan-e-Asal A1.0.78 — Multi-Currency / Currency Accounting Architecture
 * Currency metadata and historical conversion snapshots without changing customer totals.
 * Base customer financial currency remains SAR; PKR is the normal presentation/settlement view.
 */
(function(){
  'use strict';
  const VERSION='A1.0.78', BASE='SAR', DISPLAY='PKR', MAX=20;
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const str=v=>String(v??'').trim().toUpperCase();
  const arr=v=>Array.isArray(v)?v:[];
  function rateFor(q,currency){
    const cur=str(currency||BASE), fallback=Number(q?.exchange_rate);
    if(cur===BASE)return 1;
    const table=q?.currencyModel?.rates||{};
    const direct=Number(table[cur]);
    if(Number.isFinite(direct)&&direct>0)return direct;
    if(cur===DISPLAY&&Number.isFinite(fallback)&&fallback>0)return fallback;
    return null;
  }
  function ensure(q){
    if(!q||typeof q!=='object')return q;
    const historical=Number(q.exchange_rate);
    const rate=Number.isFinite(historical)&&historical>0?historical:Number(window.fx)||75;
    if(!q.currencyModel||typeof q.currencyModel!=='object')q.currencyModel={};
    q.currencyModel.version=VERSION;
    q.currencyModel.baseCurrency=BASE;
    q.currencyModel.displayCurrency=str(q.currencyModel.displayCurrency||DISPLAY);
    q.currencyModel.historicalExchangeRate=rate;
    q.currencyModel.rateSource='booking.exchange_rate';
    q.currencyModel.rates={...(q.currencyModel.rates||{}),PKR:rate,SAR:1};
    q.currencyModel.snapshotAt=q.currencyModel.snapshotAt||q.updatedAt||q.createdAt||new Date().toISOString();
    // Normalize existing expense records with a frozen conversion snapshot, without changing totalCost.
    arr(q.expenses).forEach(e=>{
      const cur=str(e.currency||BASE); const fx=Number(e.fxToSar);
      const resolved=Number.isFinite(fx)&&fx>0?fx:rateFor(q,cur);
      if(!e.currency) e.currency=BASE;
      if(resolved){e.fxToSar=money(resolved);e.baseAmountSar=money(Number(e.totalCost||0)*resolved);e.fxSource=e.fxSource||'booking.currencyModel';}
    });
    // Payment history remains SAR because amount_paid/amount_due are SAR-authoritative.
    arr(q.paymentHistory).forEach(p=>{if(!p.currency)p.currency=BASE;if(!p.baseAmountSar)p.baseAmountSar=money(p.amount);if(!p.fxToSar)p.fxToSar=1;});
    return q;
  }
  function toBase(q,amount,currency){const fx=rateFor(ensure(q),currency);if(!fx)return null;return money(Number(amount||0)*fx)}
  function fromBase(q,amount,currency){const fx=rateFor(ensure(q),currency);if(!fx)return null;return money(Number(amount||0)/fx)}
  function display(q,sar){const rate=rateFor(ensure(q),DISPLAY)||75;return money(Number(sar||0)*rate)}
  function expenseBase(q,e){if(!e)return 0;const cur=str(e.currency||BASE);if(Number.isFinite(Number(e.baseAmountSar)))return money(e.baseAmountSar);return toBase(q,Number(e.totalCost||0),cur)||money(e.totalCost)}
  function currencySummary(source){
    const rows=Array.isArray(source)?source:arr(window.quotes); const out={};
    rows.forEach(q=>{ensure(q); const cur=str(q.currencyModel?.baseCurrency||BASE);out[cur]=(out[cur]||0)+Number(q.total_sar??q.total??0);arr(q.expenses).forEach(e=>{const c=str(e.currency||BASE);if(!out[c])out[c]=0;});});
    return Object.keys(out).sort().map(c=>({currency:c,baseCurrency:BASE,amount:money(out[c]),rate:c===BASE?1:rateFor(rows.find(q=>str(q.currencyModel?.displayCurrency||DISPLAY)===DISPLAY),c)}));
  }
  function render(){
    const root=document.getElementById('keaCurrencyBody');if(!root)return;
    const rows=arr(window.quotes); const sar=money(rows.reduce((n,q)=>n+Number(q.total_sar??q.total??0),0));
    const q=rows[0]; const rate=q?rateFor(q,DISPLAY):Number(window.fx)||75;
    root.innerHTML='<div class="metrics"><div class="metric"><div class="k">Base Currency</div><div class="v">SAR</div></div><div class="metric"><div class="k">Display Currency</div><div class="v">PKR</div></div><div class="metric"><div class="k">Current View Rate</div><div class="v">1 SAR = '+money(rate||75).toFixed(2)+' PKR</div></div><div class="metric"><div class="k">Saved Revenue</div><div class="v">'+sar.toFixed(2)+' SAR</div></div></div><div class="muted" style="margin-top:9px">Historical bookings retain their own frozen exchange rate. Currency conversion is a reporting/presentation layer and does not rewrite saved customer totals.</div>';
  }
  function mount(){const dash=document.getElementById('dashboard');if(!dash||document.getElementById('keaCurrencyCard'))return;const card=document.createElement('div');card.id='keaCurrencyCard';card.className='card';card.style.marginTop='13px';card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Multi-Currency Accounting</h3><div class="muted">SAR base ledger with frozen booking FX and PKR presentation.</div></div><button class="btn outline" type="button" onclick="window.KEA_CURRENCY?.render()">Refresh</button></div><div id="keaCurrencyBody"></div>';dash.appendChild(card);render()}
  const oldSave=window.saveQuotes;
  if(typeof oldSave==='function'&&!oldSave.__keaA1078){function save(){arr(window.quotes).forEach(ensure);if(window.q)ensure(window.q);return oldSave.apply(this,arguments)}save.__keaA1078=true;window.saveQuotes=save}
  const oldNew=window.newBooking;if(typeof oldNew==='function'&&!oldNew.__keaA1078){function n(){const r=oldNew.apply(this,arguments);ensure(window.q);return r}n.__keaA1078=true;window.newBooking=n}
  window.KEA_CURRENCY={version:VERSION,baseCurrency:BASE,displayCurrency:DISPLAY,ensure,rateFor,toBase,fromBase,display,expenseBase,currencySummary,render};
  window.keaCurrencyToBase=toBase;window.keaCurrencyExpenseBase=expenseBase;window.keaCurrencyDisplay=display;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,650));else setTimeout(mount,650);
  window.PHASE1_A1078={version:VERSION,feature:'multi-currency and currency accounting architecture',architecture:'github+supabase',baseCurrency:BASE,displayCurrency:DISPLAY,historicalFx:'frozen per booking from existing exchange_rate',storage:'existing booking payload',schemaChanges:false,financialIntegrity:'customer totals unchanged; conversions are reporting/procurement snapshots'};
})();
