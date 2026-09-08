/*
 * Karvan e Asal — A1.0.66
 * Audit Trail + Activity Architecture
 *
 * Payload-local activity history. No database/schema changes.
 * Financial snapshots are never edited by this layer.
 */
(function(){
  'use strict';
  const VERSION='A1.0.66';
  const MAX=200;
  const ACTIONS={
    created:'Booking created',
    saved:'Booking updated',
    status:'Status changed',
    payment:'Payment updated',
    document:'Document action',
    deleted:'Booking moved to recycle bin',
    recovered:'Booking recovered',
    calculator:'Quotation saved'
  };
  function now(){return new Date().toISOString();}
  function clean(v){return String(v==null?'':v).trim();}
  function uid(){return clean(window.currentUser?.id)||null;}
  function uname(){return clean(window.currentUser?.username)||clean(window.currentUser?.name)||null;}
  function clone(v){try{return JSON.parse(JSON.stringify(v));}catch{return v;}}
  function key(q){return clean(q?.reference)||clean(q?.id)||clean(q?.bookingId)||'UNREFERENCED';}
  function stable(q){
    const x=clone(q)||{};
    delete x.auditTrail;
    delete x._editIndex;
    delete x._financialFingerprint;
    return JSON.stringify(x);
  }
  function ensure(q){
    if(!q||typeof q!=='object')return q;
    if(!Array.isArray(q.auditTrail))q.auditTrail=[];
    q.auditTrailVersion=VERSION;
    if(q.auditTrail.length>MAX)q.auditTrail=q.auditTrail.slice(-MAX);
    return q;
  }
  function add(q,action,details,source){
    if(!q||typeof q!=='object')return null;
    ensure(q);
    const e={
      id:'ACT-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),
      action:clean(action)||'saved',
      label:ACTIONS[action]||clean(action)||'Activity',
      at:now(),
      actorId:uid(),
      actorUsername:uname(),
      source:clean(source)||'application',
      details:clone(details||{})
    };
    q.auditTrail.push(e);
    if(q.auditTrail.length>MAX)q.auditTrail=q.auditTrail.slice(-MAX);
    q.updatedAt=q.updatedAt||e.at;
    return e;
  }
  function latest(q){ensure(q);return q.auditTrail[q.auditTrail.length-1]||null;}
  function summary(q){
    ensure(q);
    return q.auditTrail.map(function(e){return {label:e.label,at:e.at,actorUsername:e.actorUsername,source:e.source,details:e.details};});
  }
  function esc(v){return typeof window.esc==='function'?window.esc(v):String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}
  function render(q){
    ensure(q);
    const rows=q.auditTrail.slice().reverse().map(function(e){
      const who=e.actorUsername||e.actorId||'System';
      const detail=Object.keys(e.details||{}).map(function(k){return esc(k)+': '+esc(e.details[k])}).join(' • ');
      return '<div style="padding:8px 0;border-bottom:1px solid var(--border)"><b>'+esc(e.label)+'</b><div class="muted">'+esc(new Date(e.at).toLocaleString())+' • '+esc(who)+' • '+esc(e.source)+'</div>'+(detail?'<div class="muted">'+detail+'</div>':'')+'</div>';
    }).join('');
    return '<div class="card" style="margin-top:12px"><h3 class="section-title">Activity History</h3>'+(rows||'<div class="muted">No activity recorded.</div>')+'</div>';
  }

  const originalNormalize=window.normalizeQuote;
  window.normalizeQuote=function(x){
    const out=typeof originalNormalize==='function'?originalNormalize.apply(this,arguments):x;
    return ensure(out);
  };

  // Save wrapper records meaningful changes in the same payload that is already
  // persisted by the existing Supabase bridge. It does not create a second save path.
  const originalSave=window.saveQuotes;
  const previous={};
  window.saveQuotes=function(){
    const arr=Array.isArray(window.quotes)?window.quotes:[];
    arr.forEach(function(q){
      if(!q||q.recordType==='quotation')return;
      ensure(q);
      const k=key(q), sig=stable(q), old=previous[k];
      if(!old){
        add(q,'created',{reference:k,serviceType:q.serviceType||'umrah'},'save');
      }else if(old!==sig){
        const paidBefore=Number(previous[k+'_paid']||0), paidNow=Number(q.amount_paid||0);
        if(paidBefore!==paidNow)add(q,'payment',{from:paidBefore,to:paidNow,paymentStatus:q.payment_status||'unpaid'},'save');
        else add(q,'saved',{reference:k},'save');
      }
      previous[k]=stable(q);
      previous[k+'_paid']=Number(q.amount_paid||0);
    });
    const result=typeof originalSave==='function'?originalSave.apply(this,arguments):undefined;
    return result;
  };

  function logStatus(q,from,to){add(q,'status',{from:from,to:to},'lifecycle');}

  const originalSet=window.setQuoteStatus;
  if(typeof originalSet==='function'){
    window.setQuoteStatus=function(q,to){
      const from=String(q?.status||'draft');
      const result=originalSet.apply(this,arguments);
      if(result&&from!==String(result.status||to))logStatus(result,from,String(result.status||to));
      else if(result&&from!==String(to))logStatus(result,from,String(to));
      return result;
    };
    window.keaSetQuoteStatus=window.setQuoteStatus;
  }

  function wrapDocument(name,kind){
    const original=window[name]; if(typeof original!=='function')return;
    window[name]=function(){
      const ref=clean(window.q?.reference)||clean(window.quotes?.[arguments[0]]?.reference)||'';
      const result=original.apply(this,arguments);
      if(window.q&&ref) add(window.q,'document',{kind:kind,reference:ref},'document');
      return result;
    };
  }
  wrapDocument('KEA_printDocument','print');
  wrapDocument('KEA_downloadDocument','download');

  // Existing record preview gains a read-only activity section.
  const originalPreview=window.openRecordPreview;
  if(typeof originalPreview==='function'){
    window.openRecordPreview=function(){
      const result=originalPreview.apply(this,arguments);
      try{
        const box=document.getElementById('recordPreview');
        const item=window.q;
        if(box&&item){
          const existing=document.getElementById('keaActivityPreview');
          if(existing)existing.remove();
          const holder=document.createElement('div');holder.id='keaActivityPreview';holder.innerHTML=render(item);box.appendChild(holder);
        }
      }catch(e){console.warn('[Audit preview]',e);}
      return result;
    };
  }

  window.KEA_AUDIT={version:VERSION,actions:clone(ACTIONS),ensure:ensure,add:add,latest:latest,summary:summary,render:render,key:key};
  window.keaRecordActivity=function(q,action,details,source){return add(q,action,details,source);};
  window.PHASE1_A1066={version:VERSION,feature:'audit trail + activity architecture',architecture:'github+supabase',storage:'booking payload',schemaChanges:false,financialIntegrity:'preserved'};
})();
