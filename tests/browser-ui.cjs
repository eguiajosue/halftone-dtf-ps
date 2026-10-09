const fs=require('fs'),path=require('path'),assert=require('assert');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const screenshots=process.env.UI_SCREENSHOT_DIR||path.join(root,'dist/ui-preview');fs.mkdirSync(screenshots,{recursive:true});

async function browserExecutable(){
 // Offline browser from a dev-only npm package. No browser is shipped in the CCX.
 const os=require('os'),zlib=require('zlib');
 const chromiumPackage=path.dirname(require.resolve('@sparticuz/chromium'));
 const source=path.resolve(chromiumPackage,'../../bin/chromium.br');
 const destination=path.join(os.tmpdir(),'halftone-dtf-ui-chromium-138');
 if(!fs.existsSync(destination)){fs.writeFileSync(destination,zlib.brotliDecompressSync(fs.readFileSync(source)));fs.chmodSync(destination,0o755);}
 return destination;
}

(async()=>{
 const executablePath=process.env.UI_BROWSER_PATH||await browserExecutable();
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:340,height:840},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const html=fs.readFileSync(root+'/plugin/index.html','utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace('<link href="styles.css" rel="stylesheet">','<style>'+fs.readFileSync(root+'/plugin/styles.css','utf8')+'</style>');
 await page.route('http://plugin-ui.test/**',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('http://plugin-ui.test/');await page.addScriptTag({content:fs.readFileSync(root+'/plugin/vendor/spectrum.js','utf8')});
 const sources={};for(const file of fs.readdirSync(root+'/plugin'))if(file.endsWith('.js'))sources['./'+file.slice(0,-3)]=fs.readFileSync(root+'/plugin/'+file,'utf8');
 sources['./manifest.json']=JSON.parse(fs.readFileSync(root+'/plugin/manifest.json'));sources['./distribution.json']=JSON.parse(fs.readFileSync(root+'/plugin/distribution.json'));
 await page.evaluate(sources=>{
  window.fetch=undefined;window.calls=[];
  // Browser-only stand-in for Spectrum's native UXP slider.
  class NativeSlider extends HTMLElement{
   constructor(){super();this.attachShadow({mode:'open'});this.shadowRoot.innerHTML='<style>:host{display:block;height:24px}input{width:100%;margin:0;height:22px;accent-color:#bbb}</style><input type="range">';}
   connectedCallback(){const input=this.shadowRoot.querySelector('input');for(const key of ['min','max','step','value'])if(this.hasAttribute(key))input.setAttribute(key,this.getAttribute(key));}
   get value(){return this.shadowRoot.querySelector('input').value;}set value(v){this.shadowRoot.querySelector('input').value=v;}
   get disabled(){return this.shadowRoot.querySelector('input').disabled;}set disabled(v){this.shadowRoot.querySelector('input').disabled=v;}
  }
  customElements.define('sp-slider',NativeSlider);
  const src={width:32,height:32,data:new Uint8Array(32*32*4)};const stats={inkPixels:600,coveragePercent:58.6};
  const size={width:2953,height:3543,widthCM:25,heightCM:30};const preview={src,result:src,size,stats,exact:true};
  const host={info:()=>({documentID:7,name:'Arte.psd',width:1500,height:1800,dpi:300,widthCM:12.7}),
   beginSession:async(_,o)=>{calls.push(['begin',o]);return{documentID:20,source:src.data,size,stats,preview};},
   updateSession:async(s,o,ctx,paint)=>{ctx.check();calls.push(['update',o]);await paint(preview,ctx);},
   workspaceView:async(s,mode,o)=>calls.push(['workspace',mode]),renderPreview:async()=>'',releaseSession:()=>{},cancelSession:async()=>{},exportPNG:async()=>{}};
  const directory={name:'output',getEntries:async()=>[]},storageFS={getFileForSaving:async()=>null,getFileForOpening:async()=>null,getFolder:async()=>directory};
  const cache={};function require(name){
   if(name==='uxp')return{entrypoints:{setup:()=>{}},storage:{localFileSystem:storageFS,formats:{binary:'binary'}}};
   if(name==='./host')return host;if(name==='photoshop')return{app:{version:'25.0.0'}};
   name=name.replace(/\.js$/,'');if(cache[name])return cache[name].exports;if(!sources[name])throw Error('Missing module '+name);
   if(typeof sources[name]==='object')return sources[name];const module={exports:{}};cache[name]=module;
   new Function('require','module','exports',sources[name])(require,module,module.exports);return module.exports;
  }require('./main');
 },sources);
 await page.waitForFunction(()=>document.getElementById('next').disabled===false);
 for(const width of [300,340]){await page.setViewportSize({width,height:840});const overflow=await page.evaluate(()=>({client:document.querySelector('main').clientWidth,scroll:document.querySelector('main').scrollWidth}));assert(overflow.scroll<=overflow.client,JSON.stringify({width,overflow}));}
 await page.setViewportSize({width:340,height:840});
 await page.locator('#sizeMode').selectOption('preset');assert.equal(await page.locator('#shirtSize').inputValue(),'M');assert.equal(await page.locator('#widthCM').inputValue(),'27.00');
 await page.locator('#sizeMode').selectOption('custom');
 await page.locator('#widthCM').fill('25');await page.locator('#widthCM').dispatchEvent('input');assert.equal(await page.locator('#heightCM').inputValue(),'30.00');
 await page.screenshot({path:path.join(screenshots,'UI-PREPARAR-0.6.4.png')});
 await page.locator('#next').click();await page.waitForSelector('#editStage:not(.hidden)');
 assert.equal(await page.locator('#knockoutEdit').evaluate(el=>el.checked),true);
 await page.locator('#knockoutEdit').click();assert.equal(await page.locator('#knockout').evaluate(el=>el.checked),false);await page.locator('#knockoutEdit').click();
 await page.locator('#viewTransparent').click();assert.equal(await page.locator('#viewTransparent').evaluate(el=>el.selected),true);
 await page.locator('#viewGarment').click();
 await page.locator('#cleanupHigh').click();assert.equal(await page.locator('#cleanup').inputValue(),'high');
 await page.locator('#toggleOutput').click();await page.locator('#outputWhite').fill('160');await page.locator('#outputWhite').dispatchEvent('input');
 await page.locator('#toggleOutput').click();assert.equal(await page.locator('#outputWhite').inputValue(),'160');
 // Test real SWC shadow-input event propagation and HEX value synchronization.
 await page.locator('#tabColor').click();const input=page.locator('#keyEdit input');await input.fill('#334455');await input.dispatchEvent('input');
 assert.equal(await page.locator('#key').evaluate(el=>el.value),'#334455');assert.equal(await page.locator('#keyHexCaption').innerText(),'#334455');
 await page.locator('#tabColor').click();
 for(const width of [300,340]){await page.setViewportSize({width,height:840});const overflow=await page.evaluate(()=>({client:document.querySelector('main').clientWidth,scroll:document.querySelector('main').scrollWidth}));assert(overflow.scroll<=overflow.client,JSON.stringify({width,overflow}));}
 await page.setViewportSize({width:300,height:450});const actionBounds=await page.locator('#apply').boundingBox();assert(actionBounds.y>=0&&actionBounds.y+actionBounds.height<=450,'Primary action hidden on minimum panel');
 await page.setViewportSize({width:340,height:840});await page.waitForFunction(()=>document.getElementById('liveState').textContent==='Vista y lienzo sincronizados');await page.evaluate(()=>{document.querySelector('main').scrollTop=0;document.getElementById('editContent').scrollTop=0;});
 await page.screenshot({path:path.join(screenshots,'UI-AJUSTAR-0.6.4.png')});
 await page.locator('#apply').click();await page.waitForSelector('#resultStage:not(.hidden)');assert.equal(await page.locator('#export').evaluate(el=>el.disabled),false);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({registered:await page.evaluate(()=>['sp-theme','sp-button','sp-action-button','sp-checkbox','sp-textfield'].every(tag=>!!customElements.get(tag))),pageErrors:errors,widths:[300,340],checks:10}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
