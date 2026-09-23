// Screenshots of a level from chosen camera positions, rendered by the real
// renderer, for reviewing geometry and dressing. Optional, like
// tools/test_browser.mjs: it needs Playwright (npm install --no-save playwright,
// or set NODE_PATH to a global install) and Chromium.
//   node tools/level_shots.mjs hoarfrost '[["camp",[-300,1000,12400],[-800,700,9000]]]'
// Each view is [name, camera [x,y,z], look-at [x,y,z], explorer [x,y,z]?]; the
// explorer stands at the look-at point unless given. Pickups are drawn.
// Writes build/level-shots/<world>-<name>.png.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),web=path.join(root,'web'),out=path.join(root,'build/level-shots');
const [kind='hoarfrost',json='[]']=process.argv.slice(2),views=JSON.parse(json);
assert.ok(views.length,'Pass at least one view: [[name,[camera],[look]]]');
mkdirSync(out,{recursive:true});
const makers={hoarfrost:['hoarfrost.js','createHoarfrost'],caldera:['caldera.js','createCaldera'],playground:['world.js','createWorld']};
const [file,maker]=makers[kind];
const viewer=`<!doctype html><html><head><style>html,body{margin:0;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style></head>
<body><canvas id="c"></canvas><script type="module">
import {PlaygroundRenderer} from './renderer.js';import {${maker}} from './${file}';
const world=${maker}(),r=new PlaygroundRenderer(document.getElementById('c'));r.load(world);r.intro=true;
const state=p=>({position:p,velocity:[0,0,0],speed:0,floor:p[1],yaw:32768,intended:0,action:0x0C400201,flags:0,tick:0,animation:197,frame:0,normal:[0,1,0],health:0x880,timer:0});
window.shot=(camera,look,player)=>{const s=state(player);
  for(let i=0;i<3;i++){r.camera.position.set(...camera);r.camera.lookAt(...look);r.draw(s,s,1,1/30,'ACT_IDLE','ACT_IDLE',{},4/3);}};
window.ready=true;
</script></body></html>`;
const server=createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name==='/__viewer.html'){res.setHeader('Content-Type','text/html');res.end(viewer);return;}
  const target=path.resolve(web,`.${name}`);
  if(!target.startsWith(web+path.sep)){res.writeHead(403);res.end();return;}
  try {res.setHeader('Content-Type',{'.js':'text/javascript','.json':'application/json'}[path.extname(target)]||'application/octet-stream');res.end(readFileSync(target));}
  catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  ...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
try {
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/__viewer.html`);
  await page.waitForFunction(()=>window.ready,null,{timeout:60000});
  for(const [name,camera,look,player=look] of views) {
    await page.evaluate(([c,l,p])=>window.shot(c,l,p),[camera,look,player]);
    const file=path.join(out,`${kind}-${name}.png`);await page.screenshot({path:file});console.log(`Wrote ${path.relative(root,file)}`);
  }
  assert.deepEqual(errors,[],'no page errors');
} finally {await browser.close();server.close();}
