/* A1.0.73 — Notifications & Alerts Architecture */
(function(){
  'use strict';
  const VERSION='A1.0.73', DISMISS_KEY='keaNotificationDismissedV1073';
  const TYPES=['task_overdue','task_due','payment_due','booking_status','lifecycle','inventory'];
  const PRIORITY=['info','warning','urgent'];
  const esc=window.esc||function(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
  const iso=()=>new Date().toISOString();
  const today=()=>new Date().toISOString().slice(0,10);
  const clone=v=>JSON.parse(JSON.stringify(v));
  function readDismissed(){try{const a=JSON.parse(localStorage.getItem(DISMISS_KEY)||'[]');return Array.isArray(a)?a:[]}catch(e){return []}}
  function writeDismissed(a){try{localStorage.setItem(DISMISS_KEY,JSON.stringify(a.slice(-500)))}catch(e){}}
  function nid(parts){let s=parts.join('|'),h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return 'NTF-'+(h>>>0).toString(16).toUpperCase()}
  function add(out,type,priority,title,message,q,extra){const ref=String(q?.reference||'');const id=nid([type,ref,extra?.key||'',extra?.date||'',title]);out.push({notificationId:id,type,priority,title,message,reference:ref,serviceType:String(q?.serviceType||''),at:iso(),read:false,dismissed:false,details:extra||{}})}
  function active(q){return String(q?.status||'draft')!=='cancelled'}
  function collect(){
    const out=[], todayStr=today(), quotes=Array.isArray(window.quotes)?window.quotes:[];
    quotes.forEach(q=>{
      if(!q||!active(q))return;
      const ref=String(q.reference||'—');
      const due=Number(q.amount_due??0);
      if(due>0){add(out,'payment_due',due>0?'warning':'info','Payment due',ref+' has an outstanding balance of '+(window.sar?window.sar(due):due.toFixed(2)),q,{key:'payment',date:String(q.updatedAt||'')})}
      const status=String(q.status||'draft');
      if(status==='confirmed'&&String(q.updatedAt||'').slice(0,10)===todayStr)add(out,'booking_status','info','Booking confirmed',ref+' was confirmed today.',q,{key:'confirmed',date:todayStr});
      const tasks=window.keaNormalizeOperations&&Array.isArray(q.operations?.tasks)?q.operations.tasks:(Array.isArray(q.operations?.tasks)?q.operations.tasks:[]);
      tasks.forEach(t=>{
        if(!t||['completed','cancelled'].includes(t.status)||!t.dueDate)return;
        const late=t.dueDate<todayStr, same=t.dueDate===todayStr;
        if(late)add(out,'task_overdue','urgent','Overdue task',String(t.title||'Task')+' is overdue for '+ref+'.',q,{key:String(t.taskId||t.title),date:t.dueDate});
        else if(same)add(out,'task_due','warning','Task due today',String(t.title||'Task')+' is due today for '+ref+'.',q,{key:String(t.taskId||t.title),date:t.dueDate});
      });
      const inv=window.keaInventoryAvailability?.(q);
      if(inv&&Array.isArray(inv.warnings))inv.warnings.forEach((w,i)=>add(out,'inventory','warning','Availability alert',String(w),q,{key:'inv-'+i,date:todayStr}));
    });
    return out;
  }
  function notifications(){
    const dismissed=new Set(readDismissed());
    return collect().map(n=>{n.dismissed=dismissed.has(n.notificationId);n.read=dismissed.has('read:'+n.notificationId);return n}).filter(n=>!n.dismissed);
  }
  function summary(){const a=notifications();return {total:a.length,unread:a.filter(x=>!x.read).length,urgent:a.filter(x=>x.priority==='urgent').length,warning:a.filter(x=>x.priority==='warning').length,info:a.filter(x=>x.priority==='info').length}}
  function dismiss(id){const a=readDismissed();if(!a.includes(id))a.push(id);writeDismissed(a);render();}
  function markRead(id){const a=readDismissed(),k='read:'+id;if(!a.includes(k))a.push(k);writeDismissed(a);render();}
  function clearAll(){const a=readDismissed();notifications().forEach(n=>{if(!a.includes(n.notificationId))a.push(n.notificationId)});writeDismissed(a);render();}
  function render(){
    const root=document.getElementById('keaNotificationsBody');if(!root)return;
    const s=summary(), a=notifications().sort((x,y)=>({urgent:0,warning:1,info:2}[x.priority]-({urgent:0,warning:1,info:2}[y.priority])));
    root.innerHTML='<div class="metrics" style="grid-template-columns:repeat(4,minmax(0,1fr))"><div class="metric"><div class="k">Total</div><div class="v">'+s.total+'</div></div><div class="metric"><div class="k">Unread</div><div class="v">'+s.unread+'</div></div><div class="metric"><div class="k">Urgent</div><div class="v">'+s.urgent+'</div></div><div class="metric"><div class="k">Warnings</div><div class="v">'+s.warning+'</div></div></div>'+(a.length?'<div class="tablewrap" style="margin-top:10px"><table class="table"><tr><th>Alert</th><th>Booking</th><th>Priority</th><th>Action</th></tr>'+a.slice(0,20).map(n=>'<tr><td><b>'+esc(n.title)+'</b><div class="muted">'+esc(n.message)+'</div></td><td>'+esc(n.reference||'—')+'</td><td>'+esc(n.priority)+'</td><td><button class="btn outline" type="button" onclick="window.keaNotificationRead?.(\''+esc(n.notificationId)+'\')">Read</button> <button class="btn outline" type="button" onclick="window.keaNotificationDismiss?.(\''+esc(n.notificationId)+'\')">Dismiss</button></td></tr>').join('')+'</table></div><div style="margin-top:8px"><button class="btn outline" type="button" onclick="window.keaNotificationClearAll?.()">Dismiss all</button></div>':'<div class="muted" style="margin-top:10px">No active notifications.</div>');
  }
  window.KEA_NOTIFICATION_TYPES=TYPES.slice();window.KEA_NOTIFICATION_PRIORITIES=PRIORITY.slice();
  window.keaNotifications=notifications;window.keaNotificationSummary=summary;window.keaRenderNotifications=render;
  window.keaNotificationDismiss=dismiss;window.keaNotificationRead=markRead;window.keaNotificationClearAll=clearAll;
  window.keaNotificationRefresh=function(){render();return notifications()};
  // Keep alerts derived from current records. No second persistence path and no financial mutation.
  const oldDashboard=window.dashboard;
  if(typeof oldDashboard==='function'&&!oldDashboard.__a1073){const w=function(){const r=oldDashboard.apply(this,arguments);setTimeout(render,0);return r};w.__a1073=true;window.dashboard=w}
  function boot(){render()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
  window.PHASE1_A1073={version:VERSION,feature:'notifications and alerts architecture',architecture:'github+supabase',storage:'derived from existing booking payload; local dismissed/read state',schemaChanges:false,financialIntegrity:'preserved'};
})();
