(function(){
  'use strict';
  /* A1.0.59 — shared Visa architecture.
   * Canonical visa data remains inside the existing booking payload so the
   * current Supabase persistence bridge continues to store it without schema
   * changes. Existing visaTypes/pricing remain authoritative.
   */
  const TYPES=['umrah','hajj','tourism','visaOnly','ticketOnly'];
  const esc=window.esc||function(v){return String(v??'').replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});};
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  function activeVisaTypes(){return Array.isArray(window.visaTypes)?window.visaTypes.filter(v=>v&&v.active!==false):[];}
  function findType(name){return activeVisaTypes().find(v=>String(v.name)===String(name))||null;}
  function durationFor(v,days){const ds=Array.isArray(v?.durations)?v.durations:[];return ds.find(d=>Number(d.days)===Number(days))||ds[0]||null;}
  function paxCount(q){return n(q.adults)+n(q.childBed)+n(q.childNoBed)+n(q.infants);}
  function visaRequired(type){return ['umrah','hajj','visaOnly'].includes(type);}
  function personVisa(old,i,p){const x=old&&typeof old==='object'?old:{};return {passengerId:String(x.passengerId||p.passengerId||('PAX-'+String(i+1).padStart(3,'0'))),sequence:i+1,visaNo:String(x.visaNo||p.visaNo||''),mofa:String(x.mofa||p.mofa||''),status:String(x.status||''),issuedAt:String(x.issuedAt||''),expiresAt:String(x.expiresAt||''),notes:String(x.notes||'')};}
  function normalize(q){
    if(!q||typeof q!=='object')return q;
    const type=TYPES.includes(String(q.serviceType))?String(q.serviceType):'umrah';
    const active=activeVisaTypes();
    if(type==='ticketOnly'){
      q.visaRecord=null;
      q.visaByPassenger=[];
      q.visaArchitectureVersion=1;
      return q;
    }
    let selected=findType(q.visa)||active[0]||null;
    if(selected){
      q.visa=String(selected.name);
      const d=durationFor(selected,q.visaDuration);
      q.visaDuration=n(d?.days)||30;
      q.visaCategory=String(q.visaCategory||'');
      q.visaSelection={type:q.visa,duration:q.visaDuration,category:q.visaCategory};
    }else if(q.visa){
      q.visaSelection={type:String(q.visa),duration:n(q.visaDuration)||30,category:String(q.visaCategory||'')};
    }else q.visaSelection=null;
    const old=Array.isArray(q.visaByPassenger)?q.visaByPassenger:[];
    const passengers=Array.isArray(q.passengers)?q.passengers:[];
    q.visaByPassenger=passengers.map((p,i)=>personVisa(old[i],i,p));
    q.visaArchitectureVersion=1;
    return q;
  }
  function price(q){
    normalize(q);
    if(!q||q.serviceType==='ticketOnly')return {valid:false,totalSar:0,totalPkr:0,ratePkr:0};
    const v=findType(q.visa),d=durationFor(v,q.visaDuration),fx=n(q.exchange_rate||window.fx||75)||75;
    const pkr=n(d?.pkr), adultChildren=n(q.adults)+n(q.childBed)+n(q.childNoBed), infants=n(q.infants);
    const totalPkr=adultChildren*pkr+infants*(n(d?.infantPkr)||n(d?.infant)||n(d?.infantPrice)||500*fx);
    return {valid:!!v&&!!d,totalSar:totalPkr/fx,totalPkr,ratePkr:pkr,duration:n(d?.days)||30};
  }
  function validate(q,finalSave){
    if(!q)return {valid:false,message:'No active booking.'};
    normalize(q);
    const type=String(q.serviceType||'umrah');
    if(!visaRequired(type))return {valid:true};
    if(finalSave&&!paxCount(q))return {valid:false,message:'At least 1 passenger is required before saving the booking.'};
    const v=findType(q.visa),d=durationFor(v,q.visaDuration);
    if(finalSave&&!v)return {valid:false,message:'An active visa type is required.'};
    if(finalSave&&!d)return {valid:false,message:'A valid visa duration/category is required.'};
    if(finalSave&&!String(q.visa||'').trim())return {valid:false,message:'Visa type is required.'};
    return {valid:true,price:price(q)};
  }
  const oldNormalize=window.normalizeQuote;
  if(typeof oldNormalize==='function')window.normalizeQuote=function(x){return normalize(oldNormalize(x));};
  const oldRender=window.renderWizard;
  if(typeof oldRender==='function')window.renderWizard=function(){if(window.q)normalize(window.q);return oldRender.apply(this,arguments);};
  const oldGo=window.goBookingStep;
  if(typeof oldGo==='function')window.goBookingStep=function(i){
    if(window.q){const type=String(window.q.serviceType||'umrah');const target=Number(i);const stages=window.KEA_SERVICE_CONTRACTS?.[type]?.stages||[];const visaIndex=stages.indexOf('Visa');if(visaIndex>=0&&target>visaIndex){const r=validate(window.q,false);if(!r.valid){alert(r.message);return;}}}
    return oldGo.apply(this,arguments);
  };
  const oldFinish=window.finishQuote;
  if(typeof oldFinish==='function')window.finishQuote=async function(){const r=validate(window.q,true);if(!r.valid){alert(r.message);return;}return oldFinish.apply(this,arguments);};
  const oldFinishOnly=window.finishServiceOnly;
  if(typeof oldFinishOnly==='function')window.finishServiceOnly=async function(){const r=validate(window.q,true);if(!r.valid){alert(r.message);return;}return oldFinishOnly.apply(this,arguments);};
  window.KEA_normalizeVisa=normalize;
  window.KEA_validateVisa=function(finalSave){return validate(window.q,!!finalSave);};
  window.KEA_getVisaPrice=function(){return price(window.q);};
  window.PHASE1_A1059={version:'A1.0.59',feature:'shared visa architecture',architecture:'github+supabase',storage:'booking payload',schemaChanges:false};
})();
