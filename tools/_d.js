const { spawn } = require('child_process');
const http=require('http'),os=require('os'),path=require('path');
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', PORT=9602;
const get=p=>new Promise((res,rej)=>http.get({host:'127.0.0.1',port:PORT,path:p},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--no-first-run',
    '--remote-debugging-port='+PORT,'--user-data-dir='+path.join(os.tmpdir(),'edge-d'+PORT),'--window-size=1400,1000','about:blank'],{stdio:'ignore'});
  let ws,id=0;const pending=new Map();const errs=[];
  const send=(m,p={})=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) return '❌ '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text).split('\n')[0]; return r.result.value;};
  try{
    let list=null;for(let i=0;i<60;i++){try{list=await get('/json/list');if(list.length)break;}catch(e){}await sleep(250);}
    ws=new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
      if(m.method==='Runtime.exceptionThrown'){const d=m.params.exceptionDetails;errs.push((d.exception?.description||d.text).split('\n')[0]+' @ '+(d.url||''));}
      if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result);}});
    await send('Page.enable');await send('Runtime.enable');
    await send('Page.navigate',{url:'http://localhost:8000/index.html'});await sleep(6000);
    console.log('CITY_DATA 城市:', await ev("typeof CITY_DATA!=='undefined' ? Object.keys(CITY_DATA).join(',') : '❌ CITY_DATA 未定义'"));
    console.log('S:', await ev("typeof S!=='undefined' ? S.screen : '❌ S 未定义'"));
    console.log('.hs-btn:', await ev("document.querySelectorAll('.hs-btn').length"));
    console.log('reasonPool:', await ev("typeof reasonPool"));
    console.log('广州 spots:', await ev("typeof CITY_DATA!=='undefined' ? Object.keys(CITY_DATA['广州'].spots).length : '-'"));
    console.log('reasonPool(广州/华南国家植物园):', await ev("typeof reasonPool==='function' ? JSON.stringify(reasonPool('up','spot',CITY_DATA['广州'].spots['华南国家植物园']).map(x=>x.r)) : '-'"));
    console.log('点击 .hs-btn →');
    console.log('  ', await ev("(function(){try{document.querySelector('.hs-btn').click(); return 'clicked';}catch(e){return '❌ '+e.message}})()"));
    await sleep(6000);
    console.log('  S.screen =', await ev("typeof S!=='undefined'?S.screen:'-'"), '| S1 卡数', await ev("document.querySelectorAll('[data-act=\"pick\"]').length"));
    console.log('异常:', errs.length?errs:'（无）');
  } finally { try{ws&&ws.close();}catch(e){} edge.kill(); }
})().catch(e=>{console.error('FAIL '+e.message);process.exit(1);});
