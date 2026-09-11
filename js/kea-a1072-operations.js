/* A1.0.72 — Operations / Task Management Architecture */
(function(){
  'use strict';
  const VERSION='A1.0.72', KEY='operational_task_templates';
  const TYPES={umrah:'Umrah',hajj:'Hajj',tourism:'Tourism',visaOnly:'Visa Only',ticketOnly:'Ticket Only'};
  const DEFAULTS={
    umrah:[['Customer documents','customer','high'],['Visa processing','visa','high'],['Hotel confirmation','hotel','medium'],['Flight confirmation','flight','medium'],['Transport arrangement','transport','medium'],['Final customer confirmation','customer','high']],
    hajj:[['Customer documents','customer','high'],['Hajj visa / processing','visa','high'],['Hotel confirmation','hotel','medium'],['Flight confirmation','flight','medium'],['Transport arrangement','transport','medium'],['Final customer confirmation','customer','high']],
    tourism:[['Passport / customer documents','customer','high'],['Itinerary confirmation','journey','high'],['Hotel confirmation','hotel','medium'],['Flight confirmation','flight','medium'],['Transport arrangement','transport','medium'],['Final customer confirmation','customer','high']],
    visaOnly:[['Passport / visa documents','visa','high'],['Visa processing','visa','high'],['Customer delivery / confirmation','customer','medium']],
    ticketOnly:[['Passenger documents','customer','high'],['Flight confirmation','flight','high'],['Ticket issuance / delivery','flight','medium']]
  };
  const STATUS=['open','in_progress','blocked','completed','cancelled'];
  const PRIORITY=['low','medium','high','urgent'];
  const esc=window.esc||function(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const uid=p=>p+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  const iso=()=>new Date().toISOString();
  function normalizeTask(t,i){t=t&&typeof t==='object'?t:{};return {
    taskId:String(t.taskId||uid('TSK')), sequence:Number(t.sequence)||i+1, title:String(t.title||'Operational task'), category:String(t.category||'general'),
    status:STATUS.includes(t.status)?t.status:'open', priority:PRIORITY.includes(t.priority)?t.priority:'medium', ownerId:String(t.ownerId||''), ownerUsername:String(t.ownerUsername||''),
    dueDate:String(t.dueDate||''), notes:String(t.notes||''), createdAt:String(t.createdAt||iso()), updatedAt:String(t.updatedAt||iso()), completedAt:String(t.completedAt||''),
    source:String(t.source||'manual'), templateId:String(t.templateId||''), linkedCustomerId:String(t.linkedCustomerId||''), linkedSupplierId:String(t.linkedSupplierId||'')
  }}
  function taskList(q){return Array.isArray(q?.operations?.tasks)?q.operations.tasks.map(normalizeTask):[]}
  function setTasks(q,tasks){q.operations=q.operations&&typeof q.operations==='object'?q.operations:{};q.operations.modelVersion='1.0';q.operations.tasks=(tasks||[]).map(normalizeTask);return q.operations.tasks}
  function taskTemplates(){return window.KEA_TASK_TEMPLATES||clone(DEFAULTS)}
  function buildDefaultTasks(q){const type=String(q?.serviceType||'umrah');const templates=taskTemplates()[type]||[];const existing=taskList(q);if(existing.length)return existing;const customerId=String(q?.customerProfile?.customerId||q?.customerId||'');return templates.map((x,i)=>normalizeTask({taskId:uid('TSK'),sequence:i+1,title:x[0],category:x[1],priority:x[2],source:'template',templateId:type+'-'+i,linkedCustomerId:customerId,ownerId:'',ownerUsername:'',status:'open',createdAt:iso(),updatedAt:iso()},i))}
  function activeBooking(q){const s=String(q?.status||'draft');return s!=='cancelled'}
  function allTasks(){const out=[];(Array.isArray(window.quotes)?window.quotes:[]).forEach(q=>{if(!activeBooking(q))return;taskList(q).forEach(t=>out.push({task:t,booking:q}))});return out}
  function findBooking(ref){const r=String(ref||'').trim().toUpperCase();return (window.quotes||[]).find(q=>String(q?.reference||'').trim().toUpperCase()===r)}
  function saveTaskBooking(q,tasks){setTasks(q,tasks);q.updatedAt=iso();if(typeof window.saveQuotes==='function')window.saveQuotes();window.dashboard?.();window.renderRecords?.('invoice');return q}
  function currentActor(){return {id:String(window.currentUser?.id||''),username:String(window.currentUser?.username||window.currentUser?.name||'')}}

  window.KEA_TASK_STATUS=STATUS.slice(); window.KEA_TASK_PRIORITIES=PRIORITY.slice(); window.KEA_TASK_TEMPLATES=clone(DEFAULTS);
  window.keaNormalizeOperations=function(q){if(!q||typeof q!=='object')return q;const ts=taskList(q);if(ts.length)setTasks(q,ts);return q};
  window.keaEnsureOperationalTasks=function(q){if(!q||typeof q!=='object')return [];const ts=taskList(q);return ts.length?ts:buildDefaultTasks(q)};
  window.keaOperationalTasks=function(){return allTasks()};
  window.keaTaskSummary=function(){const a=allTasks().map(x=>x.task);return {total:a.length,open:a.filter(t=>t.status==='open').length,inProgress:a.filter(t=>t.status==='in_progress').length,blocked:a.filter(t=>t.status==='blocked').length,completed:a.filter(t=>t.status==='completed').length,overdue:a.filter(t=>t.dueDate&&t.status!=='completed'&&t.status!=='cancelled'&&t.dueDate<new Date().toISOString().slice(0,10)).length};};
  window.keaAddOperationalTask=function(reference,data){const q=findBooking(reference);if(!q)return {ok:false,message:'Booking not found.'};const actor=currentActor();const ts=taskList(q);const t=normalizeTask(Object.assign({},data,{taskId:uid('TSK'),sequence:ts.length+1,ownerId:data?.ownerId||actor.id,ownerUsername:data?.ownerUsername||actor.username,createdAt:iso(),updatedAt:iso(),source:data?.source||'manual'}),ts.length);ts.push(t);saveTaskBooking(q,ts);return {ok:true,task:t,booking:q};};
  window.keaUpdateOperationalTask=function(reference,taskId,patch){const q=findBooking(reference);if(!q)return {ok:false,message:'Booking not found.'};const ts=taskList(q),i=ts.findIndex(t=>String(t.taskId)===String(taskId));if(i<0)return {ok:false,message:'Task not found.'};const actor=currentActor();const n=normalizeTask(Object.assign({},ts[i],patch||{}, {updatedAt:iso()}),i);if(n.status==='completed'&&ts[i].status!=='completed')n.completedAt=iso();if(n.status!=='completed')n.completedAt='';if(!n.ownerId&&actor.id){n.ownerId=actor.id;n.ownerUsername=actor.username}ts[i]=n;saveTaskBooking(q,ts);return {ok:true,task:n,booking:q};};

  // Normalize every saved booking without creating a second persistence path.
  const oldSave=window.saveQuotes;
  if(typeof oldSave==='function'&&!oldSave.__a1072){
    const wrapped=function(){(window.quotes||[]).forEach(q=>{if(q&&typeof q==='object')window.keaNormalizeOperations(q)});return oldSave.apply(this,arguments)};wrapped.__a1072=true;window.saveQuotes=wrapped;
  }
  // Attach the operational task set at final booking save. Financial calculation remains untouched.
  const oldFinish=window.finishQuote;
  if(typeof oldFinish==='function'&&!oldFinish.__a1072){
    const wrapped=async function(){const q=window.q;if(q&&typeof q==='object'&&String(q.status||'draft')!=='cancelled')setTasks(q,window.keaEnsureOperationalTasks(q));return oldFinish.apply(this,arguments)};wrapped.__a1072=true;window.finishQuote=wrapped;
  }
  const oldServiceOnly=window.finishServiceOnly;
  if(typeof oldServiceOnly==='function'&&!oldServiceOnly.__a1072){
    const wrapped=async function(){const q=window.q;if(q&&typeof q==='object')setTasks(q,window.keaEnsureOperationalTasks(q));return oldServiceOnly.apply(this,arguments)};wrapped.__a1072=true;window.finishServiceOnly=wrapped;
  }

  function renderDashboardCard(){
    const root=document.getElementById('dashboard');if(!root||document.getElementById('keaOperationsCard'))return;
    const card=document.createElement('div');card.className='card';card.id='keaOperationsCard';card.style.marginTop='13px';
    card.innerHTML='<div class="pagehead" style="margin-bottom:8px"><div><h3 class="section-title" style="margin:0">Operations & Tasks</h3><div class="muted">Operational work linked directly to existing booking records.</div></div><button class="btn outline" type="button" onclick="window.keaRenderOperations?.()">Refresh</button></div><div id="keaOperationsSummary"></div><div id="keaOperationsList" style="margin-top:10px"></div>';
    root.appendChild(card);renderOperations();
  }
  function renderOperations(){
    const s=window.keaTaskSummary?.()||{};const se=document.getElementById('keaOperationsSummary'),list=document.getElementById('keaOperationsList');if(!se||!list)return;
    se.innerHTML='<div class="metrics" style="grid-template-columns:repeat(5,minmax(0,1fr))"><div class="metric"><div class="k">Open</div><div class="v">'+(s.open||0)+'</div></div><div class="metric"><div class="k">In Progress</div><div class="v">'+(s.inProgress||0)+'</div></div><div class="metric"><div class="k">Blocked</div><div class="v">'+(s.blocked||0)+'</div></div><div class="metric"><div class="k">Completed</div><div class="v">'+(s.completed||0)+'</div></div><div class="metric"><div class="k">Overdue</div><div class="v">'+(s.overdue||0)+'</div></div></div>';
    const rows=allTasks().filter(x=>x.task.status!=='completed'&&x.task.status!=='cancelled').sort((a,b)=>String(a.task.dueDate||'9999').localeCompare(String(b.task.dueDate||'9999'))).slice(0,12);
    if(!rows.length){list.innerHTML='<div class="muted">No active operational tasks.</div>';return;}
    list.innerHTML='<div class="tablewrap"><table class="table"><tr><th>Task</th><th>Booking</th><th>Category</th><th>Priority</th><th>Due</th><th>Status</th><th>Action</th></tr>'+rows.map(x=>{const t=x.task,q=x.booking,late=t.dueDate&&t.dueDate<new Date().toISOString().slice(0,10);return '<tr><td><b>'+esc(t.title)+'</b></td><td>'+esc(q.reference||'—')+'</td><td>'+esc(t.category)+'</td><td>'+esc(t.priority)+'</td><td style="'+(late?'font-weight:900':'')+'">'+esc(t.dueDate||'—')+'</td><td>'+esc(t.status)+'</td><td><button class="btn outline" type="button" onclick="window.keaTaskQuickComplete?.(\''+esc(q.reference||'').replace(/'/g,"\\'")+'\',\''+esc(t.taskId).replace(/'/g,"\\'")+'\')">Complete</button></td></tr>'}).join('')+'</table></div>';
  }
  window.keaRenderOperations=renderOperations;
  window.keaTaskQuickComplete=function(ref,id){const r=window.keaUpdateOperationalTask(ref,id,{status:'completed'});if(!r.ok)return alert(r.message);renderOperations()};

  function injectSettings(){
    const mg=document.getElementById('managementSettingsCard');if(!mg||document.getElementById('keaTaskTemplateCard'))return;
    const card=document.createElement('div');card.className='card adminOnly';card.id='keaTaskTemplateCard';card.innerHTML='<h3 class="section-title">Operational Task Templates</h3><p class="muted">Define the standard tasks automatically attached to new bookings. Templates affect future bookings only; existing task history is preserved.</p><div id="keaTaskTemplatesBody" style="margin-top:10px"></div>';
    mg.parentNode.insertBefore(card,mg.nextSibling);renderTemplates();
  }
  function renderTemplates(){const e=document.getElementById('keaTaskTemplatesBody');if(!e)return;const d=window.KEA_TASK_TEMPLATES||{};e.innerHTML=Object.keys(TYPES).map(type=>'<div class="card" style="margin:8px 0;padding:10px"><b>'+TYPES[type]+'</b><div style="margin-top:7px;display:grid;gap:6px">'+(d[type]||[]).map((x,i)=>'<div style="display:grid;grid-template-columns:1fr 130px 100px auto;gap:6px;align-items:center"><input value="'+esc(x[0])+'" onchange="window.keaEditTaskTemplate?.(\''+type+'\','+i+',0,this.value)"/><select onchange="window.keaEditTaskTemplate?.(\''+type+'\','+i+',1,this.value)">'+['customer','journey','visa','hotel','flight','transport','supplier','general'].map(v=>'<option value="'+v+'" '+(x[1]===v?'selected':'')+'>'+v+'</option>').join('')+'</select><select onchange="window.keaEditTaskTemplate?.(\''+type+'\','+i+',2,this.value)">'+PRIORITY.map(v=>'<option value="'+v+'" '+(x[2]===v?'selected':'')+'>'+v+'</option>').join('')+'</select><button class="btn outline" type="button" onclick="window.keaRemoveTaskTemplate?.(\''+type+'\','+i+')">Remove</button></div>').join('')+'</div><button class="btn outline" type="button" style="margin-top:7px" onclick="window.keaAddTaskTemplate?.(\''+type+'\')">+ Add Task</button></div>').join('')+'<button class="btn primary" type="button" onclick="window.keaSaveTaskTemplates?.()">Save Templates</button>'}
  window.keaEditTaskTemplate=function(type,i,k,v){if(!window.KEA_TASK_TEMPLATES[type])window.KEA_TASK_TEMPLATES[type]=[];if(window.KEA_TASK_TEMPLATES[type][i])window.KEA_TASK_TEMPLATES[type][i][k]=v};
  window.keaAddTaskTemplate=function(type){window.KEA_TASK_TEMPLATES[type]=window.KEA_TASK_TEMPLATES[type]||[];window.KEA_TASK_TEMPLATES[type].push(['New operational task','general','medium']);renderTemplates()};
  window.keaRemoveTaskTemplate=function(type,i){window.KEA_TASK_TEMPLATES[type].splice(i,1);renderTemplates()};
  window.keaSaveTaskTemplates=async function(){if(!(typeof isSuperAdmin==='function'&&isSuperAdmin()))return alert('Only Super Admin can change task templates.');const data=clone(window.KEA_TASK_TEMPLATES);localStorage.setItem('keaTaskTemplatesV1072',JSON.stringify(data));try{if(window.KARVAN_ONLINE?.enabled&&window.KARVAN_ONLINE.sb){const u=await window.KARVAN_ONLINE.sb.auth.getUser();if(u?.data?.user)await window.KARVAN_ONLINE.sb.from('app_config').upsert({key:KEY,value:data,updated_by:u.data.user.id,updated_at:iso()})}}catch(e){console.warn('[Karvan operations] Remote template save unavailable.',e)}alert('Operational task templates saved.')};
  async function loadTemplates(){try{let remote=null;if(window.KARVAN_ONLINE?.enabled&&window.KARVAN_ONLINE.sb){const r=await window.KARVAN_ONLINE.sb.from('app_config').select('value').eq('key',KEY).maybeSingle();if(!r.error)remote=r.data?.value}let d=remote||JSON.parse(localStorage.getItem('keaTaskTemplatesV1072')||'null');if(d&&typeof d==='object')window.KEA_TASK_TEMPLATES=d}catch(e){console.warn('[Karvan operations] Template load skipped.',e)}renderTemplates()}
  function boot(){renderDashboardCard();injectSettings();loadTemplates();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
  window.PHASE1_A1072={version:VERSION,feature:'operations and task management architecture',architecture:'github+supabase',storage:'existing booking payload + app_config task templates',schemaChanges:false,financialIntegrity:'preserved'};
})();
