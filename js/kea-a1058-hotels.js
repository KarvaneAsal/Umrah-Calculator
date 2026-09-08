(function(){
  'use strict';
  /* A1.0.58 — shared Hotel + Date + Room architecture.
   * Canonical stay data remains inside q.stays and is persisted by the existing
   * GitHub/Supabase booking payload path. Legacy in/out/room fields are retained.
   */
  const TYPES=['umrah','hajj','tourism'];
  const ROOM_CAP={Double:2,Triple:3,Quad:4,Quint:5};
  const clampInt=n=>Math.max(0,Math.min(100,Math.floor(Number(n)||0)));
  const dateOnly=v=>String(v||'').slice(0,10);
  function validDate(v){
    const x=dateOnly(v); if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
    const d=new Date(x+'T00:00:00');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;
  }
  function nights(inDate,outDate){
    if(!validDate(inDate)||!validDate(outDate))return 0;
    return Math.max(0,Math.round((new Date(dateOnly(outDate)+'T00:00:00')-new Date(dateOnly(inDate)+'T00:00:00'))/86400000));
  }
  function paxCount(q){return Math.max(0,Number(q?.adults)||0)+Math.max(0,Number(q?.childBed)||0);}
  function normalizeAllocation(a){
    const r=a&&typeof a==='object'?a:{};
    return {adults:clampInt(r.adults),childBed:clampInt(r.childBed),occupantIds:Array.isArray(r.occupantIds)?r.occupantIds.map(x=>Number(x)).filter(Number.isInteger):[]};
  }
  function normalizeStay(s,index,q){
    const x=s&&typeof s==='object'?s:{};
    x.stayId=String(x.stayId||('STAY-'+String(index+1).padStart(2,'0')));
    x.sequence=index+1;
    x.city=String(x.city|| (index%2?'Madinah':'Makkah'));
    x.provider=String(x.provider||'');
    x.hotel=String(x.hotel||'');
    x.checkIn=dateOnly(x.checkIn||x.in);
    x.checkOut=dateOnly(x.checkOut||x.out);
    x.in=x.checkIn; x.out=x.checkOut;
    x.nights=nights(x.checkIn,x.checkOut);
    x.roomType=String(x.roomType||x.room||'Sharing');
    x.room=x.roomType;
    if(x.roomType==='Sharing'){
      x.rooms=0;x.allocationMode='notAssigned';x.roomAllocations=[];
    }else{
      x.rooms=Math.max(1,clampInt(x.rooms)||1);
      x.allocationMode=x.allocationMode==='assigned'?'assigned':'notAssigned';
      x.roomAllocations=Array.isArray(x.roomAllocations)?x.roomAllocations.map(normalizeAllocation).slice(0,x.rooms):[];
      while(x.roomAllocations.length<x.rooms)x.roomAllocations.push(normalizeAllocation());
      if(x.rooms<=1)x.allocationMode='notAssigned';
    }
    x.occupancyRequired=paxCount(q);
    x.hotelStayModelVersion=1;
    return x;
  }
  function normalize(q){
    if(!q||typeof q!=='object')return q;
    if(!Array.isArray(q.stays))q.stays=[];
    q.stays=q.stays.map((s,i)=>normalizeStay(s,i,q));
    while(q.stays.length<4)q.stays.push(normalizeStay({city:q.stays.length%2?'Madinah':'Makkah',hotel:'',room:'Sharing',in:'',out:''},q.stays.length,q));
    q.hotelStayModelVersion=1;
    return q;
  }
  function journeyBounds(q){
    const j=q?.journey||{};
    return {start:dateOnly(j.arrivalDate||j.departureDate),end:dateOnly(j.returnDate)};
  }
  function validateStay(s,index,q){
    if(!s)return {valid:false,index,message:'Hotel stay '+(index+1)+' is missing.'};
    const any=!!s.hotel||!!s.in||!!s.out;
    if(!any)return {valid:true,index};
    if(!s.hotel)return {valid:false,index,message:'Hotel stay '+(index+1)+': select a hotel or clear the dates.'};
    if(!validDate(s.in)||!validDate(s.out))return {valid:false,index,message:'Hotel stay '+(index+1)+': valid Check-in and Check-out dates are required.'};
    if(s.nights<=0)return {valid:false,index,message:'Hotel stay '+(index+1)+': Check-out must be after Check-in.'};
    const b=journeyBounds(q);
    if(b.start&&s.in<b.start)return {valid:false,index,message:'Hotel stay '+(index+1)+': Check-in cannot be before the journey arrival/departure date.'};
    if(b.end&&s.out>b.end)return {valid:false,index,message:'Hotel stay '+(index+1)+': Check-out cannot be after the journey return date.'};
    if(s.roomType==='Quint'){
      const h=window.hotelObj?.(s),max=Number(h?.[10]?.maxOccupancy);
      if(max===4)return {valid:false,index,message:'Hotel stay '+(index+1)+': Quint is not available at this hotel.'};
    }
    if(ROOM_CAP[s.roomType]){
      const required=paxCount(q),rooms=Number(s.rooms)||0;
      if(required!==rooms*ROOM_CAP[s.roomType])return {valid:false,index,message:'Hotel stay '+(index+1)+': '+s.roomType+' requires exactly '+(rooms*ROOM_CAP[s.roomType])+' hotel occupants.'};
    }
    if(s.roomType==='Full Room'){
      const h=window.hotelObj?.(s),max=Number(h?.[10]?.maxOccupancy)===4?4:5,rooms=Number(s.rooms)||0;
      if(rooms<1)return {valid:false,index,message:'Hotel stay '+(index+1)+': Full Room requires at least 1 room.'};
      if(requiredExceeds(q,rooms*max))return {valid:false,index,message:'Hotel stay '+(index+1)+': room capacity is exceeded. Increase rooms or choose another accommodation.'};
      if(s.allocationMode==='assigned'){
        const entered=(s.roomAllocations||[]).reduce((n,r)=>n+Number(r.adults||0)+Number(r.childBed||0),0);
        if(entered!==paxCount(q))return {valid:false,index,message:'Hotel stay '+(index+1)+': assigned room occupants must equal '+paxCount(q)+'.'};
      }
    }
    if(typeof window.keaValidateHotelBooking==='function'){
      /* The existing hotel-rate/availability engine remains authoritative. */
      const old=window.keaValidateHotelBooking;
      if(old.__a1058Wrapped)return {valid:true,index};
    }
    return {valid:true,index};
  }
  function requiredExceeds(q,cap){return paxCount(q)>cap;}
  function validate(q){
    if(!q)return {valid:false,message:'No active booking.'};
    normalize(q);
    for(let i=0;i<q.stays.length;i++){const r=validateStay(q.stays[i],i,q);if(!r.valid)return r;}
    return {valid:true};
  }
  const oldNormalize=window.normalizeBooking;
  if(typeof oldNormalize==='function')window.normalizeBooking=function(){const r=oldNormalize.apply(this,arguments);return normalize(r||window.q);};
  const oldHotelValidate=window.keaValidateHotelBooking;
  if(typeof oldHotelValidate==='function'){
    const wrapped=function(){
      normalize(window.q);
      const a=validate(window.q); if(!a.valid)return a;
      return oldHotelValidate.apply(this,arguments);
    };
    wrapped.__a1058Wrapped=true;
    window.keaValidateHotelBooking=wrapped;
  }
  const oldHotelCost=window.hotelCost;
  if(typeof oldHotelCost==='function')window.hotelCost=function(s){if(s)normalizeStay(s,Number(s.sequence||1)-1,window.q||{});return oldHotelCost.apply(this,arguments);};
  window.KEA_normalizeHotelStays=normalize;
  window.KEA_validateHotelArchitecture=function(){return validate(window.q);};
  window.KEA_hotelNights=function(inDate,outDate){return nights(inDate,outDate);};
  window.PHASE1_A1058={version:'A1.0.58',feature:'hotel-date-room architecture',architecture:'github+supabase',storage:'booking payload'};
})();
