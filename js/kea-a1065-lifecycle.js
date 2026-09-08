/*
 * Karvan e Asal — A1.0.65
 * Booking Lifecycle + Status Architecture
 *
 * Purpose:
 * - Formalize the booking lifecycle without changing the Supabase schema.
 * - Preserve the existing status field and setQuoteStatus API.
 * - Keep payment status derived from the saved financial total.
 * - Add a small, payload-local lifecycle audit trail for status changes.
 * - Never recalculate or overwrite historical financial snapshots.
 */
(function(){
  'use strict';

  const VERSION='A1.0.65';
  const STATUS=['draft','confirmed','ongoing','completed','cancelled'];
  const LABELS={draft:'Draft',confirmed:'Confirmed',ongoing:'Ongoing',completed:'Completed',cancelled:'Cancelled'};
  const ORDER={draft:0,confirmed:1,ongoing:2,completed:3,cancelled:99};
  const TERMINAL=new Set(['completed','cancelled']);

  function now(){return new Date().toISOString();}
  function clean(v){return String(v==null?'':v).trim();}
  function money(v){const n=Number(v);return Number.isFinite(n)?n:0;}
  function clone(v){try{return JSON.parse(JSON.stringify(v));}catch{return v;}}
  function userId(){return clean(window.currentUser?.id)||null;}
  function username(){return clean(window.currentUser?.username)||clean(window.currentUser?.name)||null;}

  function ensureLifecycle(q){
    if(!q||typeof q!=='object')return q;
    const status=STATUS.includes(String(q.status||''))?String(q.status):'draft';
    q.status=status;
    if(!q.lifecycle||typeof q.lifecycle!=='object')q.lifecycle={};
    q.lifecycle.version=VERSION;
    q.lifecycle.status=status;
    if(!Array.isArray(q.lifecycle.history))q.lifecycle.history=[];
    if(!q.lifecycle.createdAt)q.lifecycle.createdAt=q.createdAt||now();
    if(!q.lifecycle.updatedAt)q.lifecycle.updatedAt=q.updatedAt||q.lifecycle.createdAt;
    return q;
  }

  function transitionAllowed(from,to){
    from=STATUS.includes(String(from||''))?String(from):'draft';
    to=String(to||'');
    if(!STATUS.includes(to))return false;
    if(from===to)return true;
    if(from==='cancelled')return false;
    if(to==='cancelled')return true;
    return ORDER[to]===ORDER[from]+1;
  }

  function transitionReason(q,to){
    const from=String(q?.status||'draft');
    if(!transitionAllowed(from,to))return `Invalid booking status transition: ${from} → ${to}`;
    if(to==='confirmed'){
      if(!clean(q.customer||q.customerProfile?.name))return 'Customer name is required before a booking can be confirmed.';
      const total=money(q.total_sar??q.total);
      if(total<=0)return 'A positive booking total is required before a booking can be confirmed.';
    }
    if(to==='ongoing' && from!=='confirmed')return 'Only a confirmed booking can become ongoing.';
    if(to==='completed' && from!=='ongoing')return 'Only an ongoing booking can be completed.';
    return '';
  }

  function recordHistory(q,from,to,source){
    ensureLifecycle(q);
    const entry={
      from,
      to,
      at:now(),
      actorId:userId(),
      actorUsername:username(),
      source:clean(source)||'status-change'
    };
    q.lifecycle.history.push(entry);
    // Keep the embedded audit trail bounded while retaining the latest changes.
    if(q.lifecycle.history.length>100)q.lifecycle.history=q.lifecycle.history.slice(-100);
    q.lifecycle.status=to;
    q.lifecycle.updatedAt=entry.at;
    q.updatedAt=entry.at;
    return entry;
  }

  const originalSet=window.setQuoteStatus||window.keaSetQuoteStatus;
  function setQuoteStatus(q,to,source){
    if(!q)throw new Error('Quote not found.');
    ensureLifecycle(q);
    const from=String(q.status||'draft');
    const error=transitionReason(q,to);
    if(error)throw new Error(error);

    // Same-state updates are harmless but do not create fake audit entries.
    if(from===to){
      if(typeof window.normalizePayment==='function')window.normalizePayment(q);
      return q;
    }

    // Delegate the actual status mutation to the existing lifecycle implementation
    // when available. This preserves its established API and payment normalization.
    if(typeof originalSet==='function')originalSet.call(window,q,to);
    else{
      q.status=to;
      if(typeof window.normalizePayment==='function')window.normalizePayment(q);
    }
    recordHistory(q,from,to,source||'booking-status');
    return q;
  }

  function lifecycleSummary(q){
    ensureLifecycle(q);
    return {
      status:q.status,
      label:LABELS[q.status]||q.status,
      terminal:TERMINAL.has(q.status),
      canCancel:q.status!=='cancelled',
      historyCount:q.lifecycle.history.length,
      updatedAt:q.lifecycle.updatedAt
    };
  }

  function validate(q,opts){
    opts=opts||{};
    ensureLifecycle(q);
    const to=opts.to==null?String(q.status||'draft'):String(opts.to);
    const error=transitionReason(q,to);
    if(error)return {valid:false,message:error};
    if(to==='completed' && opts.requirePaid===true && String(q.payment_status||'unpaid')!=='paid'){
      return {valid:false,message:'Payment must be fully paid before completion.'};
    }
    return {valid:true,status:to};
  }

  // Normalize historical records into the lifecycle shape without changing their
  // financial snapshot, total, payment amount, or reference.
  const originalNormalize=window.normalizeQuote;
  window.normalizeQuote=function(x){
    const out=typeof originalNormalize==='function'?originalNormalize.apply(this,arguments):x;
    return ensureLifecycle(out);
  };

  window.KEA_BOOKING_LIFECYCLE={
    version:VERSION,
    statuses:STATUS.slice(),
    labels:clone(LABELS),
    order:clone(ORDER),
    terminal:Array.from(TERMINAL),
    transitionAllowed,
    validate,
    ensure:ensureLifecycle,
    summary:lifecycleSummary,
    set:setQuoteStatus
  };
  window.keaValidLifecycleTransition=transitionAllowed;
  window.keaSetQuoteStatus=setQuoteStatus;
  window.setQuoteStatus=setQuoteStatus;
  window.PHASE1_A1065={version:VERSION,feature:'booking lifecycle + status architecture',architecture:'github+supabase',storage:'booking payload',schemaChanges:false,financialIntegrity:'preserved'};
})();
