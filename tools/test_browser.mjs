// Optional end-to-end checks. Install Playwright separately; the game has no npm runtime dependencies.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),web=path.join(root,'web'),out=path.join(root,'build/browser-checks');
mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(web,`.${name==='/'?'/index.html':name}`);
  if(!file.startsWith(web+path.sep)){res.writeHead(403);res.end();return;}
  try {
    const data=readFileSync(file),ext=path.extname(file);
    res.setHeader('Content-Type',({'.js':'text/javascript','.wasm':'application/wasm','.css':'text/css','.html':'text/html','.json':'application/json','.mp3':'audio/mpeg'})[ext]||'application/octet-stream');res.end(data);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const options={headless:true,args:['--no-sandbox','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  ...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})};
const errors=[],browsers=[];
async function pageFor(context) {
  const browser=await chromium.launch(options);browsers.push(browser);
  const page=await browser.newPage(context);
  page.setDefaultTimeout(30000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  return page;
}
const ready=page=>page.waitForFunction(()=>!document.getElementById('start-level').disabled);
const openMenu=async page=>{await page.locator('#menu-button').click();await page.locator('#menu').waitFor({state:'visible'});};
const world=async(page,name)=>{await openMenu(page);await page.locator(`[data-mode="${name}"]`).click();await page.locator('#menu').waitFor({state:'hidden'});};
const destination=async(page,index)=>{await openMenu(page);await page.locator('#destinations').evaluate(el=>el.open=true);await page.locator(`[data-zone="${index}"]`).click();};
const count=async page=>Number(await page.locator('#coin-count').textContent());
try {
  const page=await pageFor({viewport:{width:1280,height:800}});
  // Record each sample the game starts (by duration) and count the music's
  // oscillator notes, without changing the game.
  await page.addInitScript(()=>{
    window.__sounds=[];const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){window.__sounds.push(Math.round(this.buffer.duration*1000));return start.apply(this,args);};
    window.__notes=0;const note=OscillatorNode.prototype.start;
    OscillatorNode.prototype.start=function(...args){window.__notes++;return note.apply(this,args);};
  });
  await page.goto(url);await ready(page);
  await page.screenshot({path:path.join(out,'welcome.png')});
  assert.equal(await page.evaluate(()=>window.__notes),0,'no music on the title screen');
  await page.keyboard.press('Space');await page.locator('#level-hud').waitFor();
  // The music begins with play and keeps scheduling notes.
  await page.waitForFunction(()=>window.__notes>20);
  assert.equal(await page.locator('#telemetry').isVisible(),false);assert.equal(await page.locator('#toolbar').isVisible(),false);
  assert.equal(await page.locator('#timer-hud').isVisible(),false);
  const {SAMPLES}=await import(pathToFileURL(path.join(web,'sounds.js')).href),{COIN_CHIME}=await import(pathToFileURL(path.join(web,'audio.js')).href);
  const ms=name=>Math.round(SAMPLES[name][1]*1000),steps=['step1','step2','step3','step4','step5','step6'].map(ms);
  await page.keyboard.down('a');
  await page.waitForFunction(()=>Number(document.getElementById('coin-count').textContent)>0);
  // Running plays the core's footsteps; the pickup chimes.
  await page.waitForFunction(([steps,coin])=>window.__sounds.filter(d=>steps.includes(d)).length>=2&&window.__sounds.includes(coin),
    [steps,Math.round(COIN_CHIME.seconds*1000)]);
  await page.keyboard.up('a');let savedCoins=await count(page);
  await page.screenshot({path:path.join(out,'caldera.png')});
  await openMenu(page);await page.locator('#setting-developer').check();await page.locator('#setting-timer').check();
  const tick=await page.locator('#tick').textContent();await page.waitForTimeout(250);
  assert.equal(await page.locator('#tick').textContent(),tick,'the menu freezes simulation');
  await page.locator('#menu-help').click();await page.locator('#help-done').focus();await page.keyboard.press('Space');
  await page.locator('#help').waitFor({state:'hidden'});assert.equal(await page.locator('#menu').evaluate(e=>e.open),true);
  assert.equal(await page.locator('#tick').textContent(),tick,'closing nested help stays paused');
  await page.locator('#resume-button').focus();await page.keyboard.press('Space');await page.locator('#menu').waitFor({state:'hidden'});
  assert.equal(await page.locator('#telemetry').isVisible(),true);
  assert.doesNotMatch(await page.locator('#action-name').textContent(),/jump|kick|pound/i,'menu Space must not queue a jump');
  await page.locator('#freeze-button').click();const frozen=Number(await page.locator('#tick').textContent());
  await page.locator('#step-button').click();await page.waitForTimeout(100);
  assert.equal(Number(await page.locator('#tick').textContent()),frozen+1,'step advances exactly one tick');
  for(const id of ['slow-button','wire-button','trail-button'])await page.locator('#'+id).click();
  await openMenu(page);await page.locator('#setting-developer').uncheck();await page.locator('#resume-button').click();
  for(const id of ['freeze-button','slow-button','wire-button','trail-button'])assert.equal(await page.locator('#'+id).getAttribute('aria-pressed'),'false');
  const time=await page.locator('#level-time').textContent();await page.keyboard.press('n');
  await page.waitForFunction(before=>document.getElementById('level-time').textContent!==before,time);
  console.log('PASS clean defaults, music, footstep and pickup sounds, modal input, nested help, developer gating, pause and exact stepping');

  await openMenu(page);savedCoins=await count(page);await page.locator('[data-mode="playground"]').click();assert.equal(await count(page),0);assert.equal(await page.locator('#shards-hud').isVisible(),false);
  assert.equal(await page.locator('#power-meter').isVisible(),true);
  await destination(page,9);await page.waitForFunction(()=>Number(document.getElementById('coin-count').textContent)>0);
  const practiceCoins=await count(page);
  await world(page,'caldera');assert.equal(await count(page),savedCoins);
  await world(page,'playground');assert.equal(await count(page),practiceCoins);
  assert.match(await page.locator('#checkpoint-name').textContent(),/Canopy/);
  await page.keyboard.press('r');assert.equal(await count(page),practiceCoins);
  await destination(page,10);await page.screenshot({path:path.join(out,'lava-practice.png')});
  await openMenu(page);await page.locator('#restart-world').click();assert.equal(await count(page),0);
  assert.match(await page.locator('#checkpoint-name').textContent(),/runway/);
  await world(page,'caldera');assert.equal(await count(page),savedCoins,'restarting practice leaves the adventure intact');
  // Hoarfrost Heights: its own HUD totals and objectives, and progress kept like the others.
  await world(page,'hoarfrost');assert.equal(await page.locator('#shard-max').textContent(),'/8');
  assert.match(await page.locator('#checkpoint-name').textContent(),/Frostmere Camp/);
  await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');
  await openMenu(page);assert.match(await page.locator('#objectives').textContent(),/Icefall Star.*Aurora Star.*Frost Shards.*Polar Star/);
  await page.locator('#menu').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'hoarfrost-menu.png')});
  await page.locator('#resume-button').click();await page.screenshot({path:path.join(out,'hoarfrost.png')});
  await world(page,'caldera');assert.equal(await count(page),savedCoins,'visiting the ice level leaves the adventure intact');
  // The Expanse: built on its first visit, with travel points out to its far corner.
  await world(page,'expanse');assert.equal(await page.locator('#coin-total').textContent(),'/156');
  assert.equal(await page.locator('#shards-hud').isVisible(),false);assert.match(await page.locator('#checkpoint-name').textContent(),/Crossroads/);
  await destination(page,7);assert.match(await page.locator('#checkpoint-name').textContent(),/Far Corner/);
  await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');
  await openMenu(page);assert.equal(await page.locator('#zones-title').textContent(),'Travel points');
  assert.match(await page.locator('#objective-summary').textContent(),/big open world/);
  await page.locator('#resume-button').click();await page.screenshot({path:path.join(out,'expanse.png')});
  await world(page,'caldera');assert.equal(await count(page),savedCoins,'visiting the Expanse leaves the adventure intact');
  await openMenu(page);await page.locator('#setting-developer').check();
  await page.locator('#setting-volume').fill('35');await page.locator('#setting-deadzone').fill('22');
  assert.equal(await page.locator('#volume-value').textContent(),'35%');
  // Music at 0% stops scheduling notes.
  await page.locator('#setting-music').fill('0');assert.equal(await page.locator('#music-value').textContent(),'Off');
  assert.equal(await page.locator('#setting-music').getAttribute('aria-valuetext'),'Off');
  await page.waitForTimeout(600);const quiet=await page.evaluate(()=>window.__notes);await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(()=>window.__notes),quiet,'no music at 0%');
  await page.reload();await ready(page);await page.locator('#start').click();assert.equal(await page.locator('#telemetry').isVisible(),true);
  await openMenu(page);assert.equal(await page.locator('#setting-developer').isChecked(),true);
  assert.equal(await page.locator('#setting-volume').inputValue(),'35');assert.equal(await page.locator('#deadzone-value').textContent(),'22%');
  assert.equal(await page.locator('#setting-music').inputValue(),'0');await page.locator('#setting-music').fill('50');
  await page.locator('#setting-developer').uncheck();await page.locator('#resume-button').click();
  await page.screenshot({path:path.join(out,'playground.png')});
  console.log('PASS world switching (four worlds), preserved pickups/checkpoints, independent restart and saved settings, volumes and dead zone');
  await page.context().browser().close();

  const touch=await pageFor({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await touch.goto(url);await ready(touch);await touch.locator('#start').tap();
  assert.equal(await touch.locator('.touch-ui').isVisible(),true);
  await touch.locator('[data-touch="1"]').tap();
  await touch.screenshot({path:path.join(out,'touch-play.png')});
  await openMenu(touch);assert.equal(await touch.locator('.touch-ui').isVisible(),false);
  await touch.locator('#setting-timer').check();
  const layout=await touch.locator('#menu').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
  assert.ok(layout.scroll<=layout.width&&layout.left>=0&&layout.right<=390,'mobile dialog fits without horizontal scrolling');
  await touch.locator('#menu').evaluate(el=>el.scrollTop=0);await touch.screenshot({path:path.join(out,'touch-menu.png')});
  await touch.locator('#resume-button').tap();
  const hud=await touch.locator('#level-hud').boundingBox();assert.ok(hud.x+hud.width<=390,'mobile HUD fits');
  await touch.context().browser().close();
  console.log('PASS touch controls, mobile HUD and scrollable pause menu');

  // A gamepad alone: pick a world, pause, change settings, read the guide, travel and resume.
  const pad=await pageFor({viewport:{width:1280,height:800}});
  await pad.addInitScript(()=>{
    const gamepad={mapping:'standard',connected:true,index:0,id:'Test pad',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
    window.__pad=gamepad;window.__polls=0;Object.defineProperty(navigator,'getGamepads',{value:()=>(window.__polls++,[gamepad])});
  });
  await pad.goto(url);await ready(pad);
  const [A,B,START,UP,DOWN,LEFT,RIGHT]=[0,1,9,12,13,14,15];
  // Hold each button until the game has polled it twice (software rendering runs at a few frames a second).
  const polled=()=>pad.evaluate(()=>window.__polls).then(from=>pad.waitForFunction(from=>window.__polls>=from+2,from));
  const press=async button=>{
    await pad.evaluate(b=>window.__pad.buttons[b].pressed=true,button);await polled();
    await pad.evaluate(b=>window.__pad.buttons[b].pressed=false,button);await polled();
  };
  const focused=()=>pad.evaluate(()=>document.activeElement?.id||document.activeElement?.dataset.mode||document.activeElement?.tagName);
  const reach=async(id,button)=>{for(let i=0;i<24&&await focused()!==id;i++)await press(button);assert.equal(await focused(),id);};
  await press(DOWN);assert.equal(await focused(),'start-level','the first press shows the focus');
  await press(DOWN);assert.equal(await focused(),'start-frost');
  assert.equal(await pad.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid','a visible focus ring');
  await press(A);await pad.locator('#level-hud').waitFor();assert.match(await pad.locator('#world-name').textContent(),/Hoarfrost/);
  await press(START);await pad.locator('#menu').waitFor({state:'visible'});assert.equal(await focused(),'resume-button');
  await reach('setting-timer',DOWN);await press(A);assert.equal(await pad.locator('#setting-timer').isChecked(),true,'A toggles a setting');
  await reach('setting-music',UP);await press(RIGHT);assert.equal(await pad.locator('#music-value').textContent(),'55%','right raises a slider');
  await reach('menu-help',DOWN);await press(RIGHT);assert.equal(await focused(),'restart-world');await press(LEFT);
  await press(A);await pad.locator('#help').waitFor({state:'visible'});
  await press(DOWN);assert.ok(await pad.locator('#help').evaluate(el=>el.scrollTop>0),'down scrolls the move guide');
  await press(B);await pad.locator('#help').waitFor({state:'hidden'});assert.equal(await pad.locator('#menu').evaluate(el=>el.open),true,'B closes only the guide');
  await reach('zones-title',UP);await press(A);assert.equal(await pad.locator('#destinations').evaluate(el=>el.open),true);
  await press(DOWN);assert.equal(await pad.evaluate(()=>document.activeElement.dataset.zone),'0');
  await press(A);await pad.locator('#menu').waitFor({state:'hidden'});
  assert.match(await pad.locator('#checkpoint-name').textContent(),/Frostmere Camp/);
  await press(START);await pad.locator('#menu').waitFor({state:'visible'});await press(B);await pad.locator('#menu').waitFor({state:'hidden'});
  assert.equal(await pad.locator('#timer-hud').isVisible(),true);
  await pad.screenshot({path:path.join(out,'gamepad.png')});
  await pad.context().browser().close();
  console.log('PASS gamepad menus: world choice, pause, settings, sliders, guide scrolling, travel and resume');

  const offline=path.join(root,'dist/Smooth64-Play.html');
  assert.ok(existsSync(offline),'run tools/package_browser.py before this check');
  const file=await pageFor({viewport:{width:1000,height:700}}),network=[];
  file.on('request',req=>{if(/^https?:/.test(req.url()))network.push(req.url());});
  await file.addInitScript(()=>{
    Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage unavailable');}});
    window.__notes=0;const note=OscillatorNode.prototype.start;
    OscillatorNode.prototype.start=function(...args){window.__notes++;return note.apply(this,args);};
  });
  await file.goto(pathToFileURL(offline).href);await ready(file);await file.locator('#start').click();
  assert.equal(await file.locator('#level-hud').isVisible(),true);assert.equal(await file.locator('#telemetry').isVisible(),false);
  await file.waitForFunction(()=>window.__notes>0);
  await openMenu(file);await file.locator('#setting-developer').check();await file.locator('#resume-button').click();
  assert.equal(await file.locator('#telemetry').isVisible(),true);assert.deepEqual(network,[],'offline build never requests network assets');
  console.log('PASS offline package with music, and unavailable storage');
  assert.deepEqual(errors,[],'no JavaScript or WebGL console errors');
  console.log('PASS no browser or WebGL errors');
} finally {
  await Promise.allSettled(browsers.map(browser=>browser.close()));server.close();
}
