(function(){
  'use strict';
  /* A1.0.61 — shared Transport + Extras architecture.
   * GitHub domain module; Supabase continues to persist the existing booking payload.
   * Legacy q.transport / q.extras shapes are retained for compatibility.
   */
  const TYPES=['umrah','hajj','tourism'];
  const arr=v=>Array.isArray(v)?v:[];
  const money=v=>Math.round((Number(v)||0)*100)/100;
  const clean=v=>String(v??'').trim();
  const esc=window.esc||function(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))};
  function configTransport(name){return arr(window.transport).find(x=>clean(x&&x.name).toLowerCase()===clean(name).toLowerCase())||null;}
  function configExtra(name){return arr(window.extras).find(x=>clean(x&&x.name).toLowerCase()===clean(name).toLowerCase())||null;}
  function normalizeTransportItem(v,i){
    const x=typeof v==='string'?{name:v}:((v&&typeof v==='object')?v:{});
    const c=configTransport(x.name);
    return {serviceId:clean(x.serviceId)||('TRN-'+String(i+1).padStart(3,'0')),sequence:i+1,name:clean(x.name),qty:Math.max(1,Math.min(100,Math.floor(Number(x.qty)||1))),unit:clean(x.unit)||(c&&clean(c.unit))||'per service',price:money(x.price!=null?x.price:(c&&c.price)||0),active:c?c.active!==false:x.active!==false,from:clean(x.from),to:clean(x.to),date:clean(x.date),notes:clean(x.notes)};
  }
  function normalizeExtraItem(v,i){
    const x=typeof v==='string'?{name:v}:((v&&typeof v==='object')?v:{});
    const c=configExtra(x.name);
    return {extraId:clean(x.extraId)||('EXT-'+String(i+1).padStart(3,'0')),sequence:i+1,name:clean(x.name),qty:Math.max(1,Math.min(100,Math.floor(Number(x.qty)||1))),unit:clean(x.unit)||(c&&clean(c.unit))||'per item',price:money(x.price!=null?x.price:(c&&c.price)||0),active:c?c.active!==false:x.active!==false,passengerLinked:!!x.passengerLinked,notes:clean(x.notes)};
  }
  function normalize(q){
    if(!q||typeof q!=='object')return q;
    const type=clean(q.serviceType||'umrah');
    if(TYPES.indexOf(type)<0){q.transportArchitectureVersion=1;q.extrasArchitectureVersion=1;return q;}
    const ts=arr(q.transportServices).length?arr(q.transportServices):arr(q.transport);
    const es=arr(q.extraItems).length?arr(q.extraItems):arr(q.extras);
    q.transportServices=ts.map(normalizeTransportItem).filter(x=>x.name);
    q.extraItems=es.map(normalizeExtraItem).filter(x=>x.name);
    /* Keep the legacy persistence/calculation fields in their original shapes. */
    q.transport=q.transportServices.map(x=>({name:x.name,qty:x.qty}));
    q.extras=q.extraItems.map(x=>x.name);
    q.transportArchitectureVersion=1;
    q.extrasArchitectureVersion=1;
    q.transportRefs=q.transportServices.map(x=>({serviceId:x.serviceId,name:x.name,qty:x.qty}));
    q.extraRefs=q.extraItems.map(x=>({extraId:x.extraId,name:x.name,qty:x.qty}));
    return q;
  }
  function validate(q,finalSave){
    if(!q)return {valid:false,message:'No active booking.'};
    normalize(q);
    const type=clean(q.serviceType||'umrah');
    if(!finalSave)return {valid:true};
    if(TYPES.indexOf(type)<0)return {valid:true};
    for(const x of arr(q.transportServices)){
      const c=configTransport(x.name);
      if(!c)return {valid:false,message:'Selected transport is not present in the configured transport list.'};
      if(c.active===false)return {valid:false,message:'Selected transport is inactive.'};
      if(!(Number(x.qty)>0))return {valid:false,message:'Transport quantity must be greater than zero.'};
    }
    for(const x of arr(q.extraItems)){
      const c=configExtra(x.name);
      if(!c)return {valid:false,message:'Selected extra is not present in the configured extras list.'};
      if(c.active===false)return {valid:false,message:'Selected extra is inactive.'};
      if(!(Number(x.qty)>0))return {valid:false,message:'Extra quantity must be greater than zero.'};
    }
    return {valid:true};
  }
  function cost(q){
    normalize(q);
    const transport=arr(q&&q.transportServices).reduce((sum,x)=>sum+money(x.price*Number(x.qty||1)),0);
    const extras=arr(q&&q.extraItems).reduce((sum,x)=>sum+money(x.price*Number(x.qty||1)),0);
    return {transport:money(transport),extras:money(extras),total:money(transport+extras)};
  }
  const oldNormalize=window.normalizeQuote;
  if(typeof oldNormalize==='function')window.normalizeQuote=function(x){return normalize(oldNormalize(x));};
  const oldRender=window.renderWizard;
  if(typeof oldRender==='function')window.renderWizard=function(){if(window.q)normalize(window.q);return oldRender.apply(this,arguments);};
  const oldGo=window.goBookingStep;
  if(typeof oldGo==='function')window.goBookingStep=function(i){if(window.q)normalize(window.q);return oldGo.apply(this,arguments);};
  const oldFinish=window.finishQuote;
  if(typeof oldFinish==='function')window.finishQuote=async function(){const r=validate(window.q,true);if(!r.valid){alert(r.message);return;}return oldFinish.apply(this,arguments);};
  const oldFinishOnly=window.finishServiceOnly;
  if(typeof oldFinishOnly==='function')window.finishServiceOnly=async function(){if(window.q)normalize(window.q);return oldFinishOnly.apply(this,arguments);};
  window.KEA_normalizeTransportExtras=normalize;
  window.KEA_validateTransportExtras=function(finalSave){return validate(window.q,!!finalSave);};
  window.KEA_getTransportExtrasCost=function(){return cost(window.q);};
  window.PHASE1_A1061={version:'A1.0.61',feature:'shared transport and extras architecture',architecture:'github+supabase',storage:'booking payload',schemaChanges:false};
})();
