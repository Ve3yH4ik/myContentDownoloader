import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
const file=resolve(process.argv[2]??'release/UniversalDataDownloader-0.5.0-Portable.exe');
const data=await mkdtemp(join(tmpdir(),'udd-portable-'));
const server=createServer((_req,res)=>res.end('<title>Portable fixture</title><p>ready</p>'));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const processHandle=spawn(file,[`--user-data-dir=${data}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{windowsHide:true,stdio:'ignore',env:{...process.env,PATH:join(process.env.SystemRoot??'C:/Windows','System32')}});
let browser;
try {
  let connected=false;
  // Portable extracts Electron and Chromium before starting; allow a cold Windows disk scan.
  for(let i=0;i<600;i++){try{await fetch(`http://127.0.0.1:${port}/json/version`);connected=true;break;}catch{await delay(300);}}
  if(!connected)throw new Error('Portable app did not open');
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page=browser.contexts()[0].pages()[0];await page.getByRole('heading',{name:'Майстерня даних'}).waitFor();
  await page.evaluate(async url=>{const result=await window.downloader.service('http.run',{url});if(result.status!==200)throw new Error('HTTP failed');const snapshot=await window.downloader.service('browser.open',{url});if(!snapshot.html.includes('Portable fixture'))throw new Error('Bundled Chromium failed');await window.downloader.service('browser.close');},`http://127.0.0.1:${server.address().port}`);
  await page.screenshot({path:'test-results/portable-launch.png'});
  await page.evaluate(()=>window.close()).catch(()=>{});
  console.log('PASS: portable EXE opens; HTTP and bundled Chromium work with Node/npm absent from PATH');
} finally {
  if(browser)await browser.close().catch(()=>{});else processHandle.kill();
  server.closeAllConnections();await new Promise(r=>server.close(r));
  await rm(data,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
