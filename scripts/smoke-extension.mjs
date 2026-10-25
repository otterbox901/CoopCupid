// Isolated, offline Chrome smoke test. Never attaches to a user's browser/profile.
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

function samplePdf() {
  const text = 'Python React SQL developer with experience building reliable software applications using Linux Git Docker and testing production systems.';
  const stream = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf).toString('base64');
}
const mock = `
const ids = new Set(); let page = 1, submits = 0;
const jobs = [
 {id:'101',board:'test',title:'Software Developer',org:'Employer A',jdText:'Python React SQL Linux Git Docker',competition:{applicantCount:10,openings:3}},
 {id:'102',board:'test',title:'Accounting Assistant',org:'Employer B',jdText:'Accounting bookkeeping Excel financial analysis',competition:{applicantCount:100,openings:1}}
];
const snapshot = () => ({postings:[{...jobs[page-1],jdText:''}],filters:['Location: Remote'],filterKey:'remote',page:String(page),hasNext:page===1,countLabel:'1–1 of 2'});
globalThis.chrome = {runtime:{getURL:path=>location.origin+'/'+path},tabs:{query:async()=>[{id:1,url:'https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm'}],get:async()=>({status:'complete',url:'https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm'}),create:async()=>({id:2}),remove:async()=>{}},scripting:{executeScript:async({args:[command,payload]})=>{
 let value;
 if(command==='snapshot')value=snapshot();
 if(command==='navigate'){page=payload.direction==='first'?1:2;value=snapshot();}
 if(command==='ensureFolder')value={id:'9',name:'coopcupid'};
 if(command==='folder')value={id:'9',name:'coopcupid',ids:[...ids]};
 if(command==='detail')value={...jobs.find(j=>j.id===payload.id),application:{verified:true,canApply:true,requirementsText:'Resume and transcript'}};
 if(command==='add'){ids.add(payload.id);value={id:'9',name:'coopcupid'};}
 if(command==='remove'){ids.delete(payload.id);value={id:'9',name:'coopcupid'};}
 if(command==='applicationForm')value={ready:true,fields:{action:'mock',postingId:payload.id}};
 if(command==='launch')value=true;
 if(command==='inspect'||command==='prepare')value={ready:true};
 if(command==='submit'){submits++;value={confirmed:true};}
 return [{result:{ok:true,value}}];
}}};
const errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
addEventListener('DOMContentLoaded',async()=>{
 const wait=async check=>{for(let i=0;i<300;i++){if(check())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+document.getElementById('status').textContent);};
 try{
  await wait(()=>document.getElementById('filters').textContent.includes('Remote'));
  await document.fonts.ready;
  if(!document.fonts.check('400 16px "Rubik Bubbles"')||!document.fonts.check('600 16px Montserrat'))throw Error('Local fonts did not load');
  const bytes=Uint8Array.from(atob('${samplePdf()}'),c=>c.charCodeAt(0));
  const transfer=new DataTransfer();transfer.items.add(new File([bytes],'sample-resume.pdf',{type:'application/pdf'}));
  const input=document.getElementById('resumeFile');input.files=transfer.files;input.dispatchEvent(new Event('change'));
  await wait(()=>document.getElementById('resumeText').value.includes('Python')&&!document.getElementById('search').disabled);
  document.getElementById('search').click();
  await wait(()=>document.getElementById('status').textContent.includes('Search complete'));
  if(document.getElementById('resultCount').textContent!=='2')throw Error('Did not scan all pages');
  if(!document.querySelector('.job h3').textContent.includes('Software'))throw Error('Incorrect ranking');
  if (${process.env.EXTENSION_PREVIEW === '1'}) {
    document.querySelector('.intro').hidden=true;
    document.querySelector('.resume-card').hidden=true;
    document.querySelector('.search-card').hidden=true;
    document.querySelector('.status-wrap').hidden=true;
    document.getElementById('bulkArea').hidden=true;
    document.body.dataset.smokeStatus='passed'; return;
  }
  let flights=0, flightDuration;
  const observer=new MutationObserver(records=>{for(const record of records)for(const el of record.addedNodes)if(el.classList?.contains('cupid-flight')){flights++;flightDuration=el.getAnimations()[0]?.effect.getTiming().duration;}});
  observer.observe(document.body,{childList:true});
  document.querySelector('.job-actions .secondary').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
  await wait(()=>document.getElementById('folderCount').textContent==='1'&&!document.getElementById('folderTab').disabled);
  if(flights!==1)throw Error('Save did not shoot Cupid arrow');
  if(flightDuration!==(matchMedia('(prefers-reduced-motion: reduce)').matches?160:240))throw Error('Incorrect motion preference');
  observer.disconnect();
  document.querySelector('.job-actions .secondary').click();
  await wait(()=>document.getElementById('folderCount').textContent==='0'&&!document.getElementById('search').disabled);
  if(document.querySelector('.job-actions .secondary').textContent!=='Add to CoopCupid')throw Error('Remove did not restore save button');
  const topScore=parseInt(document.querySelector('.interview strong').textContent,10);
  const threshold=document.getElementById('bulkThreshold');
  threshold.value=String(topScore);threshold.dispatchEvent(new Event('input'));
  if(!document.getElementById('bulkSave').disabled)throw Error('Threshold included an equal score');
  threshold.value=String(topScore-1);threshold.dispatchEvent(new Event('input'));
  document.getElementById('bulkSave').click();
  await wait(()=>document.getElementById('status').textContent.includes('Saving complete')&&!document.getElementById('search').disabled);
  if(document.getElementById('folderCount').textContent!=='1')throw Error('Bulk save included the wrong jobs');
  document.querySelector('.job-actions .secondary').click();
  await wait(()=>document.getElementById('folderCount').textContent==='0'&&!document.getElementById('search').disabled);
  const automatic=document.getElementById('autoSave');automatic.checked=true;automatic.dispatchEvent(new Event('change'));
  document.getElementById('search').click();
  await wait(()=>document.getElementById('status').textContent.includes('Saving complete')&&!document.getElementById('search').disabled);
  if(document.getElementById('folderCount').textContent!=='1')throw Error('Automatic save after search failed');
  document.getElementById('folderTab').click();
  await wait(()=>document.getElementById('folderTab').getAttribute('aria-pressed')==='true');
  if(document.querySelectorAll('.job').length!==1)throw Error('Folder did not filter jobs');
  if(document.getElementById('autoApply').disabled)throw Error('Auto apply is unavailable for saved jobs');
  document.getElementById('autoApply').click();
  await wait(()=>document.getElementById('applyDialog').open);
  if(!document.getElementById('batchSummary').textContent.includes('sample-resume.pdf'))throw Error('Missing selected resume confirmation');
  document.getElementById('confirmApply').click();
  await wait(()=>document.getElementById('status').textContent.includes('Batch complete'));
  if(submits!==1)throw Error('Expected exactly one mock submission');
  if(document.documentElement.scrollWidth>innerWidth)throw Error('Horizontal overflow');
  document.getElementById('clear').click();
  if(!document.getElementById('clearDialog').open)throw Error('Clear data did not ask for confirmation');
  document.getElementById('cancelClear').click();
  if(document.getElementById('resumeName').textContent!=='sample-resume.pdf')throw Error('Cancelling cleared the resume');
  document.getElementById('clear').click();
  document.getElementById('confirmClear').click();
  await wait(()=>document.getElementById('status').textContent.includes('data cleared')&&!document.getElementById('search').disabled);
  if(document.getElementById('resumeName').textContent!=='Choose a PDF résumé')throw Error('Confirmed clear kept the resume');
  if(document.querySelectorAll('.job').length)throw Error('Confirmed clear kept matching results');
  if(document.documentElement.scrollWidth>innerWidth)throw Error('Empty state horizontal overflow');
  if(errors.length)throw Error(errors.join('; '));
  document.body.dataset.smokeStatus='passed';
 }catch(error){document.body.dataset.smokeStatus='failed';document.body.dataset.smokeError=error.message;}
 finally{await fetch('/done');}
});`;
let loadGate;
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/hold') { loadGate = response; return; }
    if (request.url === '/done') { loadGate?.writeHead(204).end(); response.writeHead(204).end(); return; }
    if (request.url === '/smoke.js') { response.setHeader('content-type', 'text/javascript'); response.end(mock); return; }
    const path = request.url === '/' ? 'panel.html' : request.url.slice(1);
    if (!/^(?:fonts\/)?[a-zA-Z0-9._-]+$/.test(path)) { response.writeHead(404).end(); return; }
    let content = await readFile(`dist/extension/${path}`);
    if (path === 'panel.html') content = content.toString().replace('<script type="module"', '<img hidden src="/hold" alt=""><script src="smoke.js"></script><script type="module"');
    response.setHeader('content-type', path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : path.endsWith('.ttf') ? 'font/ttf' : 'text/javascript');
    response.end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = await mkdtemp(join(tmpdir(), 'coopcupid-chrome-'));
const panelWidth = Number(process.env.PANEL_WIDTH || 420);
const screenshot = process.env.EXTENSION_PREVIEW === '1' ? join(process.cwd(), 'surfaces/site/assets/extension-preview.png') : join(tmpdir(), `coopcupid-panel-${panelWidth}.png`);
try {
  const browser = spawn('google-chrome', ['--headless', ...(process.env.REDUCED_MOTION === '1' ? ['--force-prefers-reduced-motion'] : []), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--user-data-dir=${profile}`, `--window-size=${panelWidth},${process.env.EXTENSION_PREVIEW === '1' ? 760 : 1400}`, '--timeout=30000', `--screenshot=${screenshot}`, '--dump-dom', `http://127.0.0.1:${server.address().port}/`]);
  let output = '', errors = '';
  browser.stdout.on('data', data => output += data); browser.stderr.on('data', data => errors += data);
  const timer = setTimeout(() => browser.kill(), 45000);
  const code = await new Promise(resolve => browser.on('exit', resolve)); clearTimeout(timer);
  assert.equal(code, 0, errors.slice(-1200));
  assert.ok(/data-smoke-status="passed"/.test(output), output.match(/data-smoke-error="([^"]*)"/)?.[1] || errors.slice(-1500));
  console.log(process.env.EXTENSION_PREVIEW === '1' ? `Extension preview saved: ${screenshot}` : `Chrome smoke passed: PDF extraction, all-page scan, folder save/removal, Cupid arrow and motion preference, strict bulk cutoff, automatic saving after search, folder view, one mock application, and cancel/confirm data clearing. Screenshot: ${screenshot}`);
} finally { server.close(); await rm(profile, { recursive: true, force: true }); }
