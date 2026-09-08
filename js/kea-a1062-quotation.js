/* Karvan e Asal — A1.0.62 Calculator + Quotation Architecture
 * GitHub module. Existing totals/financial snapshot remain authoritative.
 * No database schema changes; quotation data lives inside the existing booking payload.
 */
(function(){
  'use strict';
  const TYPES=['umrah','hajj','tourism','visaOnly','ticketOnly'];
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const pax=q=>Number(q?.adults||0)+Number(q?.childBed||0)+Number(q?.childNoBed||0)+Number(q?.infants||0);
  function calculate(source){
    const q=source||window.q||{};
    const type=String(q.serviceType||'umrah');
    let raw={grand:0,av:0,cv:0,iv:0,adultHotel:0,childHotel:0,at:0,ct:0,it:0,trans:0,ex:0,adult:0,child:0,infant:0,hotel:0};
    if(typeof window.keaV3Calculate==='function') raw=window.keaV3Calculate(q)||raw;
    else if(typeof window.totals==='function') raw=window.totals(q)||raw;
    const grand=money(raw.grand??raw.total_sar??0);
    const fx=money(q.exchange_rate||window.fx||75);
    const components={
      visa:money(Number(raw.av||0)+Number(raw.cv||0)+Number(raw.iv||0)),
      hotels:money(raw.hotel||Number(raw.adultHotel||0)+Number(raw.childHotel||0)),
      flights:money(Number(raw.at||0)+Number(raw.ct||0)+Number(raw.it||0)),
      transport:money(raw.trans||0),
      extras:money(raw.ex||0)
    };
    // Service-only records use their existing dedicated calculation; expose it as a
    // single component rather than attempting to reconstruct rates here.
    if(type==='visaOnly'||type==='ticketOnly'){
      components.visa=type==='visaOnly'?grand:0;
      components.flights=type==='ticketOnly'?grand:0;
      components.hotels=components.transport=components.extras=0;
    }
    const componentTotal=money(Object.values(components).reduce((a,b)=>a+b,0));
    return {
      schemaVersion:1, serviceType:type, passengerCount:pax(q),
      exchangeRate:fx, currency:'SAR', components,
      componentTotal, grand, totalSar:grand, totalPkr:money(grand*fx),
      balanced:Math.abs(componentTotal-grand)<0.011,
      calculatedAt:new Date().toISOString()
    };
  }
  function attach(q,calc){
    if(!q)return q;
    q.quotation={
      schemaVersion:calc.schemaVersion, serviceType:calc.serviceType,
      passengerCount:calc.passengerCount, currency:calc.currency,
      exchangeRate:calc.exchangeRate, components:JSON.parse(JSON.stringify(calc.components)),
      componentTotal:calc.componentTotal, totalSar:calc.totalSar, totalPkr:calc.totalPkr,
      balanced:calc.balanced
    };
    q.quotationArchitectureVersion=1;
    return q;
  }
  const oldCalc=window.keaV3Calculate;
  if(typeof oldCalc==='function')window.keaV3Calculate=function(source){
    const raw=oldCalc.apply(this,arguments)||{};
    const c=calculate(source||window.q);
    return Object.assign({},raw,{quotation:c});
  };
  const oldFinish=window.finishQuote;
  if(typeof oldFinish==='function')window.finishQuote=async function(){
    if(window.q){const c=calculate(window.q);if(!c.balanced)return alert('Quotation calculation is unbalanced. Please review the booking components before saving.');attach(window.q,c);}
    return oldFinish.apply(this,arguments);
  };
  const oldFinishOnly=window.finishServiceOnly;
  if(typeof oldFinishOnly==='function')window.finishServiceOnly=async function(){
    if(window.q)attach(window.q,calculate(window.q));
    return oldFinishOnly.apply(this,arguments);
  };
  const oldNormalize=window.normalizeQuote;
  if(typeof oldNormalize==='function')window.normalizeQuote=function(x){
    const out=oldNormalize.apply(this,arguments);
    if(out&&out.quotation&&typeof out.quotation==='object'){
      out.quotation.schemaVersion=Number(out.quotation.schemaVersion||1);
      out.quotation.exchangeRate=money(out.quotation.exchangeRate||out.exchange_rate||window.fx||75);
      out.quotation.totalSar=money(out.quotation.totalSar??out.total_sar??out.total??0);
      out.quotation.totalPkr=money(out.quotation.totalPkr??out.total_pkr??out.quotation.totalSar*out.quotation.exchangeRate);
    }
    return out;
  };
  window.KEA_calculateQuotation=calculate;
  window.KEA_attachQuotation=attach;
  window.KEA_getQuotationComponents=function(){return calculate(window.q);};
  window.PHASE1_A1062={version:'A1.0.62',feature:'calculator and quotation architecture',architecture:'github+supabase',storage:'booking payload',schemaChanges:false};
})();
