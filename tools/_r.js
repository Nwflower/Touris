const { spawn } = require('child_process');
const http=require('http'),os=require('os'),path=require('path'),fs=require('fs');
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', PORT=9601;
const get=p=>new Promise((res,rej)=>http.get({host:'127.0.0.1',port:PORT,path:p},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--no-first-run',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edge-r'+PORT),'--window-size=1400,1000','about:blank'],{stdio:'ignore'});
  let ws,id=0;const pending=new Map();const errs=[];
  const send=(m,p={})=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) return '❌ '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text).split('\n')[0]; return r.result.value;};
  const shot=async(f,clip)=>{const a=clip.split(',').map(Number);const p=await send('Page.captureScreenshot',{format:'png',clip:{x:a[0],y:a[1],width:a[2],height:a[3],scale:2},captureBeyondViewport:true});fs.writeFileSync(f,Buffer.from(p.data,'base64'));};
  try{
    let list=null;for(let i=0;i<60;i++){try{list=await get('/json/list');if(list.length)break;}catch(e){}await sleep(250);}
    ws=new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
      if(m.method==='Runtime.exceptionThrown'){const d=m.params.exceptionDetails;errs.push((d.exception?.description||d.text).split('\n')[0]);}
      if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result);}});
    await send('Page.enable');await send('Runtime.enable');
    await send('Page.navigate',{url:'http://localhost:8000/index.html'});await sleep(5000);

    await ev("(function(){const d=document.getElementById('home-dest'); d.value='广州'; const y=document.getElementById('home-days'); y.value='7 天';})()");
    await ev("document.querySelector('.hs-btn').click()"); await sleep(6000);
    await ev("document.querySelector('[data-act=\"pick\"]').click()"); await sleep(700);
    await ev("document.querySelector('[data-act=\"pick\"]').click()"); await sleep(2000);
    console.log('screen =', await ev('S.screen'), '| 广州景点条数', await ev("document.querySelectorAll('.tl-item.spot').length"));

    /* 每处景点：点👍，读理由池 */
    const names = await ev("JSON.stringify([...document.querySelectorAll('.tl-item.spot .it-title .nm')].map(x=>x.innerText))");
    console.log('行程里的景点:', names);
    for (const nm of JSON.parse(names).slice(0, 8)) {
      const r = await ev(`(function(){
        const el=[...document.querySelectorAll('.tl-item.spot')].find(x=>x.querySelector('.it-title .nm').innerText===${JSON.stringify(nm)});
        if(!el) return null;
        el.querySelector('.thumb.up').click();
        const box=el.querySelector('.reasons');
        return JSON.stringify([...box.querySelectorAll('.rchip')].map(c=>c.dataset.r));
      })()`);
      await sleep(400);
      console.log('  👍 ' + nm.padEnd(14) + ' → ' + r);
    }
    await sleep(300);
    console.log('\n页面异常:', errs.length?errs:'（无）');
  } finally { try{ws&&ws.close();}catch(e){} edge.kill(); }
})().catch(e=>{console.error('FAIL '+e.message);process.exit(1);});
