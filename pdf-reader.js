/* Responsive PDF reader V2.0.20. Open-source PDF.js loads only in the PDF tab. */
const PDF_JS_CDN='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_WORKER_CDN='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let pdfJsPromise=null;
function ensurePdfJs(){
 if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
 if(pdfJsPromise)return pdfJsPromise;
 pdfJsPromise=new Promise((resolve,reject)=>{
  const s=document.createElement('script');s.src=PDF_JS_CDN;s.async=true;
  s.onload=()=>window.pdfjsLib?resolve(window.pdfjsLib):reject(Error('PDF.js kitabxanası yoxdur'));
  s.onerror=()=>reject(Error('PDF.js yüklənmədi'));
  document.head.append(s);
 }).catch(e=>{pdfJsPromise=null;throw e});
 return pdfJsPromise;
}
function renderPdfBookNew(view){
 const instance=++pdfRenderNumber;
 const root=el('section',undefined,'minimal-pdf');
 root.setAttribute('aria-label','PDF kitab');
 const alive=()=>instance===pdfRenderNumber&&mode==='PDF kitab'&&root.isConnected;
 const menu=el('div',undefined,'minimal-pdf-toolbar');
 const chapters=el('select');chapters.setAttribute('aria-label','Fəsillər');
 for(const [name,num] of PDF_CHAPTERS){const option=el('option',name);option.value=String(num);chapters.append(option)}
 const previous=btn('‹',()=>goto(pdfBookPage-1),'pdf-arrow');previous.setAttribute('aria-label','Əvvəlki səhifə');
 const pageNum=el('input');pageNum.type='number';pageNum.min='1';pageNum.max=String(PDF_TOTAL_PAGES);pageNum.className='pdf-number';pageNum.value=String(pdfBookPage);pageNum.setAttribute('aria-label','PDF səhifəsi');
 const count=el('span','/ '+PDF_TOTAL_PAGES,'pdf-total');
 const following=btn('›',()=>goto(pdfBookPage+1),'pdf-arrow');following.setAttribute('aria-label','Növbəti səhifə');
 const full=el('a','↗','pdf-full-link');full.href=PDF_PUBLIC_SOURCE;full.target='_blank';full.rel='noopener noreferrer';full.setAttribute('aria-label','PDF-ni ayrıca aç');
 menu.append(chapters,previous,pageNum,count,following,full);
 const screen=el('div',undefined,'minimal-pdf-body');
 screen.append(el('div','PDF açılır…','pdf-spinner'));
 const file=el('input');file.type='file';file.accept='.pdf,application/pdf';file.className='pdf-import-input';
 const choose=btn('PDF-ni cihazdan seç',()=>file.click(),'pdf-local-option');
 root.append(menu,screen,file);view.append(root);
 let pdf=null,drawTask=null,renderId=0,source=PDF_PUBLIC_SOURCE,available=false,nativeFrame=null;
 function reflect(){
  const max=pdf?.numPages||PDF_TOTAL_PAGES;
  pdfBookPage=Math.max(1,Math.min(max,Math.floor(Number(pdfBookPage)||1)));
  pageNum.value=String(pdfBookPage);count.textContent='/ '+max;
  chapters.value=String(PDF_CHAPTERS.reduce((v,row)=>row[1]<=pdfBookPage?row[1]:v,PDF_CHAPTERS[0][1]));
  previous.disabled=pdfBookPage===1;following.disabled=pdfBookPage>=max;
 }
 async function paint(){
  const run=++renderId;
  if(drawTask){try{drawTask.cancel()}catch{}drawTask=null}
  if(!alive()||!pdf)return;
  try{
   const page=await pdf.getPage(pdfBookPage);
   if(!alive()||run!==renderId)return;
   const base=page.getViewport({scale:1});
   const width=Math.max(220,Math.min(1024,screen.clientWidth||window.innerWidth));
   const scale=width/base.width;
   const ratio=Math.min(2,window.devicePixelRatio||1);
   const viewport=page.getViewport({scale:scale*ratio});
   const canvas=el('canvas');canvas.className='pdf-page-canvas';
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   canvas.style.width=width+'px';canvas.style.height=Math.round(viewport.height/ratio)+'px';
   screen.replaceChildren(canvas);
   drawTask=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport});
   await drawTask.promise;
  }catch(e){if(e?.name!=='RenderingCancelledException'&&alive())fallback()}
 }
 function goto(p){
  pdfBookPage=Math.max(1,Math.min(pdf?.numPages||PDF_TOTAL_PAGES,Math.floor(Number(p)||1)));
  reflect();full.href=source+'#page='+pdfBookPage;
  if(available)paint();
  else if(nativeFrame)nativeFrame.src=source+'#page='+pdfBookPage+'&toolbar=1&view=FitH';
 }
 chapters.onchange=()=>goto(chapters.value);
 pageNum.onchange=()=>goto(pageNum.value);
 pageNum.onkeydown=e=>{if(e.key==='Enter'){goto(pageNum.value);pageNum.blur()}};
 function fallback(){
  if(!alive())return;
  available=false;pdf=null;menu.hidden=false;
  const frame=el('iframe',undefined,'pdf-embed-fallback');
  frame.title='Begegnungen A1+ PDF kitab';
  frame.src=source+'#page='+pdfBookPage+'&toolbar=1&view=FitH';
  frame.setAttribute('allowfullscreen','');
  nativeFrame=frame;
  const wrap=el('div',undefined,'pdf-fallback-wrap');
  wrap.append(frame,choose);screen.replaceChildren(wrap);
  full.href=source+'#page='+pdfBookPage;
  reflect();
 }
 async function load(url){
  if(!alive())return;
  source=url;available=false;nativeFrame=null;menu.hidden=false;screen.replaceChildren(el('div','PDF açılır…','pdf-spinner'));full.href=url;
  try{
   const lib=await ensurePdfJs();
   if(!alive())return;
   lib.GlobalWorkerOptions.workerSrc=PDF_WORKER_CDN;
   const task=lib.getDocument({url,withCredentials:false});
   const documentPdf=await task.promise;
   if(!alive()){documentPdf.destroy();return}
   pdf=documentPdf;available=true;menu.hidden=false;reflect();await paint();
  }catch(e){if(alive())fallback()}
 }
 file.onchange=async()=>{
  const uploaded=file.files?.[0];if(!uploaded||uploaded.size>90*1024*1024)return;
  try{
   if((await uploaded.slice(0,5).text())!=='%PDF-')return;
   await load(pdfLocalLink(uploaded,uploaded.name));
   await saveLocalPdf(uploaded);
  }catch{}
 };
 let start=null;
 root.addEventListener('touchstart',e=>{if(e.touches.length===1)start=[e.touches[0].clientX,e.touches[0].clientY]},{passive:true});
 root.addEventListener('touchend',e=>{
  if(!available||!start||!e.changedTouches.length)return;
  const dx=e.changedTouches[0].clientX-start[0],dy=e.changedTouches[0].clientY-start[1];
  if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.7)goto(pdfBookPage+(dx<0?1:-1));
  start=null;
 },{passive:true});
 let delay=null;
 const resize=()=>{if(!alive()){window.removeEventListener('resize',resize);return}if(available){clearTimeout(delay);delay=setTimeout(()=>{if(alive())paint()},170)}};
 window.addEventListener('resize',resize,{passive:true});
 reflect();
 (async()=>{
  let saved=null;
  try{saved=await loadSavedPdf()}catch{}
  if(!alive())return;
  if(saved?.blob instanceof Blob){await load(pdfLocalLink(saved.blob,saved.name));return}
  let hosted=false;
  try{const r=await fetch(PDF_BOOK_FILE,{method:'HEAD',cache:'no-store'});hosted=r.ok&&(r.headers.get('content-type')||'').includes('pdf')}catch{}
  if(!alive())return;
  if(hosted)await load(PDF_BOOK_FILE);
  else{source=PDF_PUBLIC_SOURCE;fallback()}
 })();
}
