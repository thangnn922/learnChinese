import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const c = await b.newContext({ viewport: { width: 360, height: 800 } });
const p = await c.newPage();
const errs=[]; p.on('console', m=>m.type()==='error'&&errs.push(m.text())); p.on('requestfailed',r=>errs.push('REQFAIL '+r.url()));
p.on('response', r=>{ if(r.status()>=400) errs.push('HTTP '+r.status()+' '+r.url()); });
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
console.log('errors:', errs);
await p.evaluate(()=>{document.body.style.zoom='2';});
await p.waitForTimeout(300);
const over = await p.evaluate(()=>{
  const de=document.documentElement; const out=[{doc:de.scrollWidth+'/'+de.clientWidth}];
  for(const el of document.querySelectorAll('*')){ const r=el.getBoundingClientRect();
    if(r.right > de.clientWidth+1) out.push(el.tagName+'.'+(el.className||'')+' right='+Math.round(r.right)+' w='+Math.round(r.width)); }
  return out.slice(0,12);
});
console.log(over);
await b.close();
