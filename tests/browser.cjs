const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {call,advance} = require('./backend-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}if(file===root||file.endsWith(path.sep))file=path.join(file,'index.html');try{const data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data)}catch{res.writeHead(404).end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const staticContext=await browser.newContext({javaScriptEnabled:false});const staticPage=await staticContext.newPage();await staticPage.goto('http://127.0.0.1:'+server.address().port);assert(await staticPage.locator('#site-password').isVisible(),'password form exists before JavaScript loads');assert(await staticPage.locator('.access-card button').isDisabled());await staticContext.close();
 const errors=[];let identity=0;
 async function player(){const context=await browser.newContext();const id='player-'+(++identity);const token=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.signature';
 await context.route('https://cqxpcuylnarobdkecbfo.supabase.co/**',async route=>{const req=route.request();if(req.method()==='OPTIONS'){await route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});return;}
 let result;if(req.url().includes('/auth/v1/'))result={status:200,body:{access_token:token,refresh_token:'refresh-'+id,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',is_anonymous:true}}};else result=await call(token,req.postDataJSON());
 await route.fulfill({status:result.status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result.body)});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);return page;}
 const alice=await player();
 await alice.locator('#site-password').fill('wrong');await alice.locator('.access-card button').click();await alice.getByText('Access denied. Check the site password.').waitFor();
 async function unlock(page){await page.locator('#site-password').fill('test-password');await page.locator('.access-card button').click();await page.locator('.access-gate').waitFor({state:'hidden'});}
 await unlock(alice);
 await alice.locator('#count').selectOption('1');await alice.locator('#difficulty').selectOption('0');await alice.locator('#betting').selectOption('no-limit');await alice.locator('#start').click();
 if(await alice.locator('#call').isEnabled()){await alice.locator('#raise-amount').fill('45');await alice.locator('#raise').click();}
 for(let i=0;i<100;i++){if(await alice.locator('#next').isVisible())break;if(await alice.locator('#call').isEnabled())await alice.locator('#call').click();await alice.waitForTimeout(150);}
 assert(await alice.locator('#next').isVisible(),'solo hand finishes');
 for(const lang of ['fr','ru','es','zh','de','ar','en']){await alice.locator('#language').selectOption(lang);assert.equal(await alice.evaluate(()=>tr('fold')),'Fold');assert.equal(await alice.evaluate(()=>tr('call')),'Call');assert.equal(await alice.evaluate(()=>tr('raise')),'Raise');assert.equal(await alice.evaluate(()=>tr('check')),'Check');}
 await alice.getByRole('button',{name:'Multiplayer',exact:true}).click();await alice.locator('#count').selectOption('1');await alice.locator('#mp-name').fill('Alice');await alice.locator('#mp-create').click();await alice.locator('#mp-copy').waitFor();
 const code=(await alice.locator('#mp-info').textContent()).split(' · ')[0];
 const bob=await player();await unlock(bob);await bob.getByRole('button',{name:'Multiplayer',exact:true}).click();await bob.locator('#mp-name').fill('Bob');await bob.locator('#mp-code').fill(code);await bob.locator('#mp-join').click();await bob.locator('#mp-copy').waitFor();
 await alice.waitForTimeout(3500);await alice.locator('#mp-deal').click();await alice.waitForTimeout(500);assert.equal(await alice.locator('.seat').count(),3,'two humans plus selected AI');
 await bob.waitForTimeout(3500);assert.equal(await bob.locator('.seat').count(),3);
 advance(46000);await alice.waitForTimeout(3500);await alice.getByText('Alice wins. Last player connected',{exact:true}).waitFor();
 await alice.setViewportSize({width:390,height:844});await alice.screenshot({path:process.env.SCREENSHOT_PATH||'/tmp/river-club-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: browser password denial/unlock; no-limit solo hand; seven-language action labels; two authenticated browser sessions; mixed AI room; disconnect victory; mobile render; no JavaScript errors.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
