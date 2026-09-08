(function(){
  'use strict';
  /* A1.0.60 — shared Flight / Airport / Airline architecture.
   * Canonical flight legs remain inside the existing booking payload so the
   * current GitHub + Supabase persistence bridge continues without schema changes.
   */
  const TYPES=['umrah','hajj','tourism','ticketOnly'];
  const LEG_TYPES=['Outbound','Transit','Return'];
  const esc=window.esc||function(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))};
  const arr=v=>Array.isArray(v)?v:[];
  const cleanCode=v=>String(v||'').trim().toUpperCase();
  const airportMap=()=>arr(window.airports||[]);
  const airlineMap=()=>arr(window.airlines||[]);
  function airport(code){const c=cleanCode(code);return airportMap().find(a=>cleanCode(a?.[1])===c)||null;}
  function airline(name){const s=String(name||'').trim().toLowerCase();return airlineMap().find(a=>String(a?.[0]||'').trim().toLowerCase()===s||String(a?.[1]||'').trim().toLowerCase()===s)||null;}
  function paxCount(q){return Math.max(0,Number(q?.adults)||0)+Math.max(0,Number(q?.childBed)||0)+Math.max(0,Number(q?.childNoBed)||0)+Math.max(0,Number(q?.infants)||0);}
  function normalizeLeg(old,i){
    const f=old&&typeof old==='object'?old:{};
    const type=LEG_TYPES.includes(String(f.type))?String(f.type):(i===0?'Outbound':'Return');
    const from=cleanCode(f.from),to=cleanCode(f.to);
    const a=airline(f.airline);
    return {
      flightId:String(f.flightId||('FLT-'+String(i+1).padStart(3,'0'))), sequence:i+1,
      type, from, to, fromAirport:from, toAirport:to,
      date:String(f.date||''), timeOut:String(f.timeOut||''), timeIn:String(f.timeIn||''),
      flight:String(f.flight||''), flightNumber:String(f.flightNumber||f.flight||''),
      airline:a?String(a[0]):String(f.airline||''), airlineCode:a?String(a[2]||''):String(f.airlineCode||''),
      via:String(f.via||'Direct'), status:String(f.status||''), notes:String(f.notes||'')
    };
  }
  function normalize(q){
    if(!q||typeof q!=='object')return q;
    const type=String(q.serviceType||'umrah');
    if(!TYPES.includes(type)){q.flightArchitectureVersion=1;return q;}
    const source=Array.isArray(q.flightSegments)&&q.flightSegments.length?q.flightSegments:(Array.isArray(q.flights)?q.flights:[]);
    q.flightSegments=source.map(normalizeLeg);
    q.flights=q.flightSegments.map(x=>Object.assign({},x));
    q.flightArchitectureVersion=1;
    q.airportRefs=q.flightSegments.map(x=>({flightId:x.flightId,from:x.from,to:x.to}));
    q.airlineRefs=q.flightSegments.map(x=>({flightId:x.flightId,name:x.airline,code:x.airlineCode}));
    return q;
  }
  function validate(q,finalSave){
    if(!q)return {valid:false,message:'No active booking.'};
    normalize(q);
    if(!paxCount(q))return {valid:false,message:'At least 1 passenger is required.'};
    if(!finalSave)return {valid:true};
    const type=String(q.serviceType||'umrah');
    if(type==='visaOnly')return {valid:true};
    const fs=arr(q.flightSegments);
    if(!fs.length)return {valid:false,message:'At least one flight leg is required.'};
    if(type==='ticketOnly'&&!fs.some(f=>f.type==='Outbound'||f.type==='Transit'))return {valid:false,message:'Ticket-Only booking requires an outbound flight leg.'};
    for(const f of fs){
      if(!cleanCode(f.from)||!airport(f.from))return {valid:false,message:'Each flight leg must have a valid From airport.'};
      if(!cleanCode(f.to)||!airport(f.to))return {valid:false,message:'Each flight leg must have a valid To airport.'};
      if(f.from===f.to)return {valid:false,message:'Flight From and To airports cannot be the same.'};
      if(f.airline&&!airline(f.airline))return {valid:false,message:'Selected airline is not present in the configured airline list.'};
    }
    const dates=fs.filter(f=>f.date).map(f=>new Date(f.date+'T00:00:00').getTime()).filter(Number.isFinite);
    for(let i=1;i<dates.length;i++)if(dates[i]<dates[i-1])return {valid:false,message:'Flight leg dates must be in chronological order.'};
    return {valid:true};
  }
  function price(q){normalize(q);return {valid:true,segments:arr(q?.flightSegments).length};}
  const oldNormalize=window.normalizeQuote;
  if(typeof oldNormalize==='function')window.normalizeQuote=function(x){return normalize(oldNormalize(x));};
  const oldRender=window.renderWizard;
  if(typeof oldRender==='function')window.renderWizard=function(){if(window.q)normalize(window.q);return oldRender.apply(this,arguments);};
  const oldGo=window.goBookingStep;
  if(typeof oldGo==='function')window.goBookingStep=function(i){if(window.q){const r=validate(window.q,false);if(!r.valid){alert(r.message);return;}}return oldGo.apply(this,arguments);};
  const oldFinish=window.finishQuote;
  if(typeof oldFinish==='function')window.finishQuote=async function(){const r=validate(window.q,true);if(!r.valid){alert(r.message);return;}return oldFinish.apply(this,arguments);};
  const oldFinishOnly=window.finishServiceOnly;
  if(typeof oldFinishOnly==='function')window.finishServiceOnly=async function(){const r=validate(window.q,true);if(!r.valid){alert(r.message);return;}return oldFinishOnly.apply(this,arguments);};
  window.KEA_normalizeFlights=normalize;
  window.KEA_validateFlights=function(finalSave){return validate(window.q,!!finalSave);};
  window.KEA_getFlightSummary=function(){return price(window.q);};
  window.PHASE1_A1060={version:'A1.0.60',feature:'shared flight airport airline architecture',architecture:'github+supabase',storage:'booking payload',schemaChanges:false};
})();
