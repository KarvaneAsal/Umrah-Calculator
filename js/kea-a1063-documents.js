/* Karvan e Asal — A1.0.63 Documents + Voucher/Invoice Architecture
 * GitHub module. Documents are derived from the saved booking payload.
 * Financial values are frozen from the authoritative costSnapshot/quotation snapshot.
 * No database schema changes; documents remain inside the existing Supabase payload.
 */
(function(){
  'use strict';
  const VERSION='A1.0.63', SCHEMA=1;
  const clone=v=>{try{return JSON.parse(JSON.stringify(v));}catch{return null}};
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const today=()=>new Date().toISOString();
  function financial(q){
    const s=q?.costSnapshot&&typeof q.costSnapshot==='object'?q.costSnapshot:{};
    const qs=q?.quotation&&typeof q.quotation==='object'?q.quotation:{};
    const grand=Number.isFinite(Number(s.grand))?Number(s.grand):Number(q?.total_sar??q?.total??qs.totalSar??0);
    const fx=Number.isFinite(Number(q?.exchange_rate))&&Number(q.exchange_rate)>0?Number(q.exchange_rate):Number(qs.exchangeRate)||Number(window.fx)||75;
    const components={
      visa:Number.isFinite(Number(qs.components?.visa))?Number(qs.components.visa):money(Number(s.av||0)+Number(s.cv||0)+Number(s.iv||0)),
      hotels:Number.isFinite(Number(qs.components?.hotels))?Number(qs.components.hotels):money(Number(s.hotel||0)+Number(s.adultHotel||0)+Number(s.childHotel||0)),
      flights:Number.isFinite(Number(qs.components?.flights))?Number(qs.components.flights):money(Number(s.at||0)+Number(s.ct||0)+Number(s.it||0)),
      transport:Number.isFinite(Number(qs.components?.transport))?Number(qs.components.transport):Number(s.trans||0),
      extras:Number.isFinite(Number(qs.components?.extras))?Number(qs.components.extras):Number(s.ex||0)
    };
    return {currency:'SAR',totalSar:money(grand),exchangeRate:money(fx),totalPkr:money(grand*fx),components,source: s.grand!==undefined?'costSnapshot':'quotation'};
  }
  function make(q,kind){
    q=q||window.q||{};
    const f=financial(q);
    const doc={schemaVersion:SCHEMA,architectureVersion:VERSION,documentType:kind||'booking',reference:String(q.reference||''),serviceType:String(q.serviceType||'umrah'),createdAt:today(),sourceUpdatedAt:String(q.updatedAt||q.createdAt||today()),financial:f};
    doc.customer=clone(q.customerProfile)||{name:String(q.customer||''),phone:String(q.contact||q.whatsapp||'')};
    doc.customerName=String(q.customer||doc.customer?.name||'');
    doc.contact=String(q.contact||q.whatsapp||doc.customer?.phone||'');
    doc.passengers=clone(q.passengers)||[];
    doc.journey=clone(q.journey)||{departure:q.departure||'',arrival:q.arrival||'',returnDate:q.returnDate||''};
    doc.stays=clone(q.stays)||[];
    doc.visaSelection=clone(q.visaSelection)||{type:q.visa||'',duration:q.visaDuration||0,category:''};
    doc.visaByPassenger=clone(q.visaByPassenger)||[];
    doc.flightSegments=clone(q.flightSegments)||clone(q.flights)||[];
    doc.transportServices=clone(q.transportServices)||clone(q.transport)||[];
    doc.extraItems=clone(q.extraItems)||clone(q.extras)||[];
    doc.payment={amountPaid:money(q.amount_paid),amountDue:money(q.amount_due),status:String(q.payment_status||'unpaid')};
    return doc;
  }
  function attach(q,force){
    if(!q)return q;
    const existing=q.documents&&typeof q.documents==='object'?q.documents:null;
    const docBase=make(q,'booking');
    const created=existing?.createdAt||docBase.createdAt;
    q.documents={schemaVersion:SCHEMA,architectureVersion:VERSION,createdAt:created,updatedAt:today(),reference:docBase.reference,serviceType:docBase.serviceType,
      invoice:Object.assign({},docBase,{documentType:'invoice',createdAt:existing?.invoice?.createdAt||created}),
      voucher:Object.assign({},docBase,{documentType:'voucher',createdAt:existing?.voucher?.createdAt||created})};
    q.documentArchitectureVersion=VERSION;
    return q;
  }
  function source(q,kind){
    const d=q?.documents?.[kind||'invoice'];
    if(d&&d.architectureVersion===VERSION)return clone(d);
    return make(q,kind||'invoice');
  }
  const oldFinish=window.finishQuote;
  if(typeof oldFinish==='function')window.finishQuote=async function(){
    const result=await oldFinish.apply(this,arguments);
    if(window.q && String(window.q.status||'')!=='draft')attach(window.q,false);
    return result;
  };
  const oldFinishOnly=window.finishServiceOnly;
  if(typeof oldFinishOnly==='function')window.finishServiceOnly=async function(){
    const result=await oldFinishOnly.apply(this,arguments);
    if(window.q && String(window.q.status||'')!=='draft')attach(window.q,false);
    return result;
  };
  const oldNormalize=window.normalizeQuote;
  if(typeof oldNormalize==='function')window.normalizeQuote=function(x){
    const out=oldNormalize.apply(this,arguments);
    if(out?.documents&&typeof out.documents==='object'){
      out.documents.schemaVersion=Number(out.documents.schemaVersion||SCHEMA);
      out.documents.architectureVersion=String(out.documents.architectureVersion||VERSION);
      ['invoice','voucher'].forEach(k=>{if(out.documents[k]?.financial){out.documents[k].financial.totalSar=money(out.documents[k].financial.totalSar);out.documents[k].financial.exchangeRate=money(out.documents[k].financial.exchangeRate||out.exchange_rate||75);out.documents[k].financial.totalPkr=money(out.documents[k].financial.totalPkr??out.documents[k].financial.totalSar*out.documents[k].financial.exchangeRate);}});
    }
    return out;
  };
  window.KEA_buildDocumentSnapshot=make;
  window.KEA_getDocumentSnapshot=source;
  window.KEA_attachDocuments=attach;
  window.PHASE1_A1063={version:VERSION,feature:'documents voucher invoice architecture',architecture:'github+supabase',storage:'booking payload',schemaChanges:false,financialSource:'frozen costSnapshot/quotation snapshot'};
})();
