/* Karvan e Asal — A1.0.64 Document Templates + Print/PDF Layout
 * GitHub module. Customer-facing documents use the saved A1.0.63 snapshot.
 * Browser Print / Save PDF is the PDF mechanism; no server or DB schema change.
 */
(function(){
  'use strict';
  const VERSION='A1.0.64';
  const clone=v=>{try{return JSON.parse(JSON.stringify(v));}catch{return null}};
  const esc=v=>typeof window.esc==='function'?window.esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const serviceLabel=t=>({umrah:'Umrah',hajj:'Hajj',tourism:'Tourism',visaOnly:'Visa Only',ticketOnly:'Ticket Only'}[String(t||'').toLowerCase()]||String(t||'Booking'));
  const money=v=>Math.round((Number(v)||0)*100)/100;
  function snapshot(kind){
    const q=window.q||{};
    if(typeof window.KEA_getDocumentSnapshot==='function')return window.KEA_getDocumentSnapshot(q,kind);
    return clone(q)||{};
  }
  function style(){
    if(document.getElementById('kea-a1064-print-style'))return;
    const s=document.createElement('style');s.id='kea-a1064-print-style';
    s.textContent=`
      .keaDocToolbar{display:flex;justify-content:flex-end;gap:7px;flex-wrap:wrap;margin:0 0 10px}
      .keaDocTemplateMeta{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:7px 10px;margin:0 0 10px;border:1px solid var(--border);background:var(--surface-2);font-size:9px;color:var(--text-muted);border-radius:8px}
      .keaDocTemplateMeta b{color:var(--text-primary)}
      .keaDocFooter{margin-top:14px;padding-top:8px;border-top:1px solid var(--border);font-size:8px;color:var(--text-muted);display:flex;justify-content:space-between;gap:10px}
      @media print{
        @page{size:A4;margin:10mm}
        body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
        .keaDocToolbar,.keaDocTemplateMeta{display:none!important}
        .invoice,.voucher{box-shadow:none!important;break-inside:auto}
        .invoice h3,.voucher .vsectionTitle{break-after:avoid}
        .invoice .table,.voucher .vtable{break-inside:auto}
        .invoice .row,.voucherSection{break-inside:avoid}
        .keaDocFooter{display:flex!important;color:#666!important}
      }`;
    document.head.appendChild(s);
  }
  function toolbar(target,kind){
    const old=target.querySelector('.keaDocToolbar'); if(old)old.remove();
    const bar=document.createElement('div');bar.className='keaDocToolbar no-print';
    bar.innerHTML=`<button type="button" class="btn gold" onclick="KEA_printDocument('${kind}')">Print / Save PDF</button><button type="button" class="btn outline" onclick="KEA_downloadDocument('${kind}')">Save HTML</button>`;
    target.prepend(bar);
  }
  function decorateInvoice(){
    const el=document.getElementById('invoice');if(!el)return;const d=snapshot('invoice');
    el.classList.add('keaDocTemplate','keaInvoiceTemplate');
    const h=el.querySelector('.invoiceBrand .muted');if(h)h.textContent=serviceLabel(d.serviceType)+' • Booking Invoice';
    const meta=document.createElement('div');meta.className='keaDocTemplateMeta';meta.innerHTML=`<span><b>Document:</b> Booking Invoice</span><span><b>Service:</b> ${esc(serviceLabel(d.serviceType))}</span><span><b>Reference:</b> ${esc(d.reference||'—')}</span>`;el.prepend(meta);
    const foot=document.createElement('div');foot.className='keaDocFooter';foot.innerHTML=`<span>Karvan e Asal • ${esc(serviceLabel(d.serviceType))}</span><span>Reference: ${esc(d.reference||'—')} • Generated from saved record</span>`;el.appendChild(foot);
    const page=el.closest('.page');if(page){toolbar(page.querySelector('.pagehead')||page,'invoice');}
  }
  function decorateVoucher(){
    const el=document.getElementById('voucherBody');if(!el)return;const d=snapshot('voucher');
    el.classList.add('keaDocTemplate','keaVoucherTemplate');
    const title=el.querySelector('.voucherSampleTitle');if(title)title.textContent=d.serviceType==='tourism'?'Travel Voucher':'Hotel Voucher';
    const foot=document.createElement('div');foot.className='keaDocFooter';foot.innerHTML=`<span>Karvan e Asal • ${esc(serviceLabel(d.serviceType))}</span><span>Reference: ${esc(d.reference||'—')} • Generated from saved record</span>`;el.appendChild(foot);
    const page=el.closest('.page');if(page){toolbar(page.querySelector('.pagehead')||page,'voucher');}
  }
  function content(kind){return kind==='voucher'?document.getElementById('voucherBody'):document.getElementById('invoice');}
  function documentHtml(kind){
    const el=content(kind);if(!el)return '';
    const d=snapshot(kind), title=kind==='voucher'?(d.serviceType==='tourism'?'Travel Voucher':'Hotel Voucher'):'Booking Invoice';
    const node=el.cloneNode(true);node.querySelectorAll('.no-print').forEach(x=>x.remove());
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} ${esc(d.reference||'')}</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;background:#fff;margin:0}.invoice,.voucher{background:#fff;padding:16px;border:1px solid #d8c27d}.invoicehead{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:12px;border-bottom:2px solid #061a3a;padding-bottom:12px}.invoiceLogo,.voucherLogo{object-fit:contain;display:block}.invoiceLogo{width:72px;height:72px}.voucherLogo{width:62px;height:62px}.invoiceBrand,.voucherBrand{display:flex;align-items:flex-start;gap:12px}.table,.vtable{width:100%;border-collapse:collapse}.table{font-size:10px}.table th,.table td{padding:8px 6px;border-bottom:1px solid #dfe4ec;text-align:left}.vtable{font-size:8.5px;margin-top:7px}.vtable th,.vtable td{border:1px solid #999;padding:4px 3px}.vtable th{background:#f1f3f6}.voucherHead{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:8px;align-items:center;border-bottom:1px solid #999;padding-bottom:7px}.voucherGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.vsectionTitle{background:#061a3a;color:#fff;font-weight:900;text-align:center;padding:4px;margin-top:8px}.row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #dfe4ec}.grand{font-size:16px;font-weight:900}.totalbox{border:1px solid #d8c27d;padding:10px;margin-top:10px}.muted,.vsmall{color:#667085;font-size:9px}.keaDocFooter{margin-top:14px;padding-top:8px;border-top:1px solid #ddd;font-size:8px;color:#666;display:flex;justify-content:space-between}.keaDocTemplateMeta,.keaDocToolbar{display:none}@media(max-width:650px){.invoicehead,.voucherHead,.voucherGrid{grid-template-columns:1fr}.table,.vtable{font-size:7px}}</style></head><body>${node.outerHTML}</body></html>`;
  }
  function print(kind){
    const html=documentHtml(kind);if(!html)return alert('Document preview is not available.');
    const w=window.open('','_blank','noopener,noreferrer');if(!w)return alert('Please allow pop-ups to print the document.');
    w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),150);
  }
  function download(kind){
    const html=documentHtml(kind);if(!html)return alert('Document preview is not available.');
    const d=snapshot(kind);const name=kind==='voucher'?'Voucher':'Booking-Invoice';const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download=`Karvan-e-Asal-${name}-${d.reference||'document'}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  const oldInvoice=window.renderInvoice;
  if(typeof oldInvoice==='function')window.renderInvoice=function(){const r=oldInvoice.apply(this,arguments);style();decorateInvoice();return r;};
  const oldVoucher=window.renderVoucher;
  if(typeof oldVoucher==='function')window.renderVoucher=function(){const r=oldVoucher.apply(this,arguments);style();decorateVoucher();return r;};
  window.KEA_printDocument=print;window.KEA_downloadDocument=download;
  window.PHASE1_A1064={version:VERSION,feature:'document templates and print pdf layout',architecture:'github+supabase',storage:'saved booking payload',schemaChanges:false,financialSource:'A1.0.63 frozen document snapshot'};
})();
