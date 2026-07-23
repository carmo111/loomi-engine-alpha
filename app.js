(() => {
'use strict';
const $=id=>document.getElementById(id);
const C=$('canvas'),ctx=C.getContext('2d'),MC=$('modelCanvas'),mctx=MC.getContext('2d');
const E={input:$('photoInput'),stage:$('stage'),empty:$('emptyState'),status:$('status'),badge:$('aiBadge'),detect:$('detectButton'),manual:$('manualButton'),reset:$('resetButton'),export:$('exportButton'),loader:$('loader'),diag:$('diagnosticButton'),dialog:$('diagnosticDialog'),close:$('closeDiagnostic'),diagOut:$('diagnosticOutput'),copy:$('copyDiagnostic'),opacity:$('opacityRange'),width:$('widthRange'),skull:$('skullRange'),sideDepth:$('sideDepthRange'),sideSize:$('sideSizeRange'),jaw:$('jawRange'),showSkull:$('showSkull'),showSide:$('showSide'),showJaw:$('showJaw'),showLevels:$('showLevels'),showBack:$('showBack'),showHandles:$('showHandles'),learning:$('learningMode'),yaw:$('yawValue'),pitch:$('pitchValue'),roll:$('rollValue'),pose:$('poseLabel')};
const S={image:null,name:'loomi-v7',mesh:null,ready:false,loading:false,error:null,lm:null,model:null,base:null,manual:false,manualPoints:[],drag:null,logs:[]};
const BASE='https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/';
const COL={bone:'#f4f0e6',violet:'#ae72ff',orange:'#ff9f43',blue:'#55b9ff',green:'#57e09b',pink:'#ff6f91',red:'#ff606b',muted:'#b9c0c4'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function log(x){S.logs.push(new Date().toLocaleTimeString()+' '+x);if(S.logs.length>80)S.logs.shift();console.log('[Loomi V7]',x)}
function status(x,t=''){E.status.textContent=x;E.status.className='status '+t}
function badge(x,t=''){E.badge.textContent=x;E.badge.className='badge '+t}
function waitGlobal(ms=14000){return new Promise((ok,no)=>{const started=Date.now();const timer=setInterval(()=>{if(window.FaceMesh){clearInterval(timer);ok(window.FaceMesh)}else if(Date.now()-started>ms){clearInterval(timer);no(new Error('FaceMesh absent'))}},100)})}
async function initAI(){if(S.ready||S.loading)return;S.loading=true;badge('Chargement du moteur','loading');try{const FaceMesh=await waitGlobal();S.mesh=new FaceMesh({locateFile:f=>BASE+f});S.mesh.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:.45,minTrackingConfidence:.45,selfieMode:false});S.mesh.onResults(onResults);S.ready=true;badge('Moteur prêt','ready');status(S.image?'Moteur prêt. Analyse en cours…':'Moteur prêt. Importe un portrait.','success');if(S.image)await detect()}catch(e){S.error=e;badge('Mode manuel disponible','error');status('Le moteur IA ne s’est pas chargé. Le mode manuel reste utilisable.','error');log(e.stack||String(e))}finally{S.loading=false}}
function fitImage(img){const q=Math.min(1,1900/Math.max(img.naturalWidth,img.naturalHeight));C.width=Math.round(img.naturalWidth*q);C.height=Math.round(img.naturalHeight*q)}
function importPhoto(file){if(!file||!file.type.startsWith('image/'))return status('Choisis un fichier image.','error');S.name=file.name.replace(/\.[^.]+$/,'');const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{S.image=img;S.lm=null;S.model=null;fitImage(img);E.stage.classList.remove('empty');E.empty.classList.add('hidden');[E.detect,E.manual,E.reset,E.export].forEach(b=>b.disabled=false);draw();status('Photo chargée.','success');S.ready?detect():initAI()};img.onerror=()=>status('Impossible de lire cette image.','error');img.src=reader.result};reader.readAsDataURL(file)}
async function detect(){if(!S.image)return;if(!S.ready){initAI();return}E.loader.classList.remove('hidden');E.detect.disabled=true;try{await S.mesh.send({image:S.image})}catch(e){S.error=e;status('Erreur pendant l’analyse. Essaie le mode manuel.','error');log(e.stack||String(e));E.loader.classList.add('hidden');E.detect.disabled=false}}
function onResults(r){E.loader.classList.add('hidden');E.detect.disabled=false;if(!r.multiFaceLandmarks?.length){status('Aucun visage détecté. Essaie une photo plus nette ou le mode manuel.','error');return}S.lm=r.multiFaceLandmarks[0];S.model=buildModel(S.lm);S.base=structuredCloneSafe(S.model);S.manual=false;status('Reconstruction V7 terminée. Les poignées blanches permettent une correction.','success');draw()}
function structuredCloneSafe(x){return JSON.parse(JSON.stringify(x))}
function P(l){return{x:l.x*C.width,y:l.y*C.height,z:l.z||0}}
function buildModel(l){
 const eyeL=mid(P(l[33]),P(l[133])),eyeR=mid(P(l[263]),P(l[362]));
 const eyeMid=mid(eyeL,eyeR),nose=P(l[1]),chin=P(l[152]),forehead=P(l[10]),templeL=P(l[234]),templeR=P(l[454]);
 const faceW=dist(templeL,templeR),eyeSpan=dist(eyeL,eyeR),faceH=dist(forehead,chin);
 const roll=Math.atan2(eyeR.y-eyeL.y,eyeR.x-eyeL.x);
 const yaw2d=clamp((nose.x-eyeMid.x)/Math.max(1,eyeSpan*.43),-1,1);
 const yawDepth=clamp((l[234].z-l[454].z)*8,-1,1);
 const yaw=(yaw2d*.72+yawDepth*.28)*.82;
 const upper=dist(forehead,P(l[6])),lower=dist(P(l[6]),chin);
 const pitch=clamp((upper/Math.max(1,lower)-.70)*1.15,-.55,.55);
 const center={x:eyeMid.x-yaw*faceW*.035,y:eyeMid.y-faceH*.285};
 return {center,eyeMid,nose,chin,templeL,templeR,rx:faceW*.50,ry:faceH*.39,rz:faceW*.43,yaw,pitch,roll,chinLocalY:faceH*.61,jawHalf:faceW*.355,browLevel:.08,eyeLevel:.22,noseLevel:.57,mouthLevel:.76,sideSign:yaw>=0?1:-1};
}
function manualStart(){if(!S.image)return;S.manual=true;S.manualPoints=[];S.model=null;status('Pose 6 points : œil gauche, œil droit, nez, menton, tempe gauche, tempe droite.');draw()}
function manualModel(a){const [eyeL,eyeR,nose,chin,templeL,templeR]=a,eyeMid=mid(eyeL,eyeR),faceW=dist(templeL,templeR),faceH=dist(eyeMid,chin)*1.48,roll=Math.atan2(eyeR.y-eyeL.y,eyeR.x-eyeL.x),yaw=clamp((nose.x-eyeMid.x)/Math.max(1,dist(eyeL,eyeR)*.43),-1,1)*.82;return{center:{x:eyeMid.x-yaw*faceW*.035,y:eyeMid.y-faceH*.285},eyeMid,nose,chin,templeL,templeR,rx:faceW*.5,ry:faceH*.39,rz:faceW*.43,yaw,pitch:0,roll,chinLocalY:faceH*.61,jawHalf:faceW*.355,browLevel:.08,eyeLevel:.22,noseLevel:.57,mouthLevel:.76,sideSign:yaw>=0?1:-1}}
function rotate(v,g){
 const cy=Math.cos(g.yaw),sy=Math.sin(g.yaw),cp=Math.cos(g.pitch),sp=Math.sin(g.pitch),cr=Math.cos(g.roll),sr=Math.sin(g.roll);
 let x=cy*v.x+sy*v.z,z=-sy*v.x+cy*v.z,y=v.y;
 const y2=cp*y-sp*z,z2=sp*y+cp*z;y=y2;z=z2;
 return{x:cr*x-sr*y,y:sr*x+cr*y,z};
}
function project(v,g){const q=rotate(v,g);return{x:g.center.x+q.x,y:g.center.y+q.y,z:q.z}}
function sampleCircle(kind,g,param=0,n=160){const pts=[];for(let i=0;i<=n;i++){const t=i/n*Math.PI*2;let v;if(kind==='horizontal'){const yn=param;const s=Math.sqrt(Math.max(.001,1-yn*yn));v={x:Math.cos(t)*g.rx*s,y:yn*g.ry,z:Math.sin(t)*g.rz*s}}else if(kind==='vertical'){v={x:0,y:Math.sin(t)*g.ry,z:Math.cos(t)*g.rz}}else if(kind==='side'){const cut=param.cut;const s=Math.sqrt(Math.max(.001,1-cut*cut));v={x:g.sideSign*g.rx*cut,y:Math.cos(t)*g.ry*s*param.size,z:Math.sin(t)*g.rz*s*param.size}}pts.push(project(v,g))}return pts}
function convexHull(points){const p=points.map(q=>({x:q.x,y:q.y,z:q.z})).sort((a,b)=>a.x===b.x?a.y-b.y:a.x-b.x);if(p.length<3)return p;const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);const lo=[];for(const q of p){while(lo.length>=2&&cross(lo.at(-2),lo.at(-1),q)<=0)lo.pop();lo.push(q)}const up=[];for(let i=p.length-1;i>=0;i--){const q=p[i];while(up.length>=2&&cross(up.at(-2),up.at(-1),q)<=0)up.pop();up.push(q)}lo.pop();up.pop();return lo.concat(up)}
function sphereSilhouette(g){const pts=[];for(let a=0;a<48;a++){const phi=-Math.PI/2+(a/47)*Math.PI;for(let b=0;b<96;b++){const th=b/96*Math.PI*2;const cp=Math.cos(phi);pts.push(project({x:g.rx*cp*Math.cos(th),y:g.ry*Math.sin(phi),z:g.rz*cp*Math.sin(th)},g))}}return convexHull(pts)}
function strokePath(c,pts,color,width,dash=[]){if(!pts||pts.length<2)return;c.save();c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.setLineDash(dash);c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);c.stroke();c.restore()}
function strokeClosed(c,pts,color,width,dash=[]){if(!pts?.length)return;c.save();c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.setLineDash(dash);c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);c.closePath();c.stroke();c.restore()}
function strokeVisibleCurve(c,pts,color,width,showBack){let seg=[],front=null;const flush=(isFront)=>{if(seg.length>1&&(isFront||showBack))strokePath(c,seg,color,isFront?width:Math.max(1,width*.65),isFront?[]:[6,7]);seg=[]};for(const q of pts){const f=q.z>=0;if(front===null)front=f;if(f!==front){flush(front);seg=[q];front=f}else seg.push(q)}flush(front)}
function localSettings(g){const scale=Number(E.skull.value)/100,cut=Number(E.sideDepth.value)/100,size=Number(E.sideSize.value)/100,jaw=Number(E.jaw.value)/100;return{...g,rx:g.rx*scale,ry:g.ry*scale,rz:g.rz*scale,cut,size,jaw}}
function jawGeometry(g){
 const cut=g.cut,s=Math.sqrt(Math.max(.001,1-cut*cut))*g.size;
 const sideX=g.sideSign*g.rx*cut;
 const sideBottom={x:sideX,y:g.ry*s*.66,z:0};
 const opposite={x:-g.sideSign*g.jawHalf*g.jaw,y:g.ry*.44,z:0};
 const nearAngle={x:g.sideSign*g.jawHalf*g.jaw,y:g.ry*.48,z:g.rz*.05};
 const chin={x:0,y:g.chinLocalY*g.jaw,z:g.rz*.09};
 return{sideBottom,opposite,nearAngle,chin};
}
function drawJaw(c,g,w){const j=jawGeometry(g),a=project(j.opposite,g),b=project(j.nearAngle,g),s=project(j.sideBottom,g),ch=project(j.chin,g);c.save();c.strokeStyle=COL.pink;c.lineWidth=w+1;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo((a.x+ch.x)/2,a.y+(ch.y-a.y)*.72,ch.x,ch.y);c.quadraticCurveTo((b.x+ch.x)/2,b.y+(ch.y-b.y)*.72,b.x,b.y);c.quadraticCurveTo((b.x+s.x)/2,(b.y+s.y)/2,s.x,s.y);c.stroke();c.restore()}
function drawAxis(c,g,w,showBack){const pts=[];for(let i=0;i<=120;i++){const t=-Math.PI/2+i/120*Math.PI;pts.push(project({x:0,y:Math.sin(t)*g.ry,z:Math.cos(t)*g.rz},g))}strokeVisibleCurve(c,pts,COL.green,w,showBack);const j=jawGeometry(g);strokePath(c,[project({x:0,y:g.ry*.72,z:g.rz*.05},g),project(j.chin,g)],COL.green,w)}
function drawLabels(c,g){const labels=[['Sourcils',g.browLevel,COL.orange],['Yeux',g.eyeLevel,COL.blue],['Base du nez',g.noseLevel,COL.bone],['Bouche',g.mouthLevel,COL.pink]];c.save();c.font='600 13px system-ui';c.textBaseline='middle';for(const [text,l,col] of labels){const p=project({x:-g.rx*.94,y:(l-.5)*g.ry*1.48,z:0},g);c.fillStyle='#0a0d0eee';const width=c.measureText(text).width+14;c.fillRect(p.x-width-8,p.y-10,width,20);c.fillStyle=col;c.fillText(text,p.x-width,p.y)}c.restore()}
function drawConstruction(c,base,preview=false){if(!base)return;const g=localSettings(base),alpha=Number(E.opacity.value)/100,w=Number(E.width.value),showBack=E.showBack.checked;c.save();c.globalAlpha=preview?1:alpha;
 if(E.showSkull.checked){strokeClosed(c,sphereSilhouette(g),COL.bone,w+1);drawAxis(c,g,w,showBack)}
 if(E.showLevels.checked){const levels=[[g.browLevel,COL.orange],[g.eyeLevel,COL.blue],[g.noseLevel,COL.bone],[g.mouthLevel,COL.pink]];for(const [l,col] of levels){const yn=(l-.5)*1.48;strokeVisibleCurve(c,sampleCircle('horizontal',g,yn),col,w,showBack)}}
 if(E.showSide.checked){strokeVisibleCurve(c,sampleCircle('side',g,{cut:g.cut,size:g.size}),COL.violet,w+1,showBack);const top=project({x:g.sideSign*g.rx*g.cut,y:-g.ry*Math.sqrt(1-g.cut*g.cut)*g.size,z:0},g),bottom=project({x:g.sideSign*g.rx*g.cut,y:g.ry*Math.sqrt(1-g.cut*g.cut)*g.size,z:0},g);strokePath(c,[top,bottom],COL.violet,Math.max(1,w*.65),[5,6])}
 if(E.showJaw.checked)drawJaw(c,g,w);
 if(E.learning.checked&&!preview)drawLabels(c,g);
 if(E.showHandles.checked&&!preview)drawHandles(c,base,w);
 c.restore();
}
function drawHandles(c,g,w){const handles={centre:g.center,menton:g.chin,tempeG:g.templeL,tempeD:g.templeR};for(const [name,p] of Object.entries(handles)){c.beginPath();c.fillStyle='#fff';c.strokeStyle='#111';c.lineWidth=2;c.arc(p.x,p.y,7+w*.25,0,Math.PI*2);c.fill();c.stroke();if(E.learning.checked){c.fillStyle='#fff';c.font='11px system-ui';c.fillText(name,p.x+11,p.y-10)}}}
function drawPreview(){mctx.clearRect(0,0,MC.width,MC.height);if(!S.model){mctx.fillStyle='#8d969b';mctx.font='15px system-ui';mctx.textAlign='center';mctx.fillText('Le modèle apparaîtra après analyse',MC.width/2,MC.height/2);return}const g=structuredCloneSafe(S.model),scale=Math.min(155/g.rx,155/g.ry);g.center={x:MC.width/2,y:MC.height/2-15};g.rx*=scale;g.ry*=scale;g.rz*=scale;g.chinLocalY*=scale;g.jawHalf*=scale;drawConstruction(mctx,g,true)}
function draw(){ctx.clearRect(0,0,C.width,C.height);if(S.image)ctx.drawImage(S.image,0,0,C.width,C.height);if(S.model)drawConstruction(ctx,S.model);if(S.manual&&S.manualPoints.length){ctx.save();ctx.fillStyle='#fff';ctx.font='bold 15px system-ui';S.manualPoints.forEach((q,i)=>{ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.fill();ctx.fillText(String(i+1),q.x+11,q.y-8)});ctx.restore()}updateMetrics();drawPreview()}
function updateMetrics(){const g=S.model;if(!g){E.yaw.textContent=E.pitch.textContent=E.roll.textContent='0°';E.pose.textContent='0° / 0°';return}const deg=x=>`${Math.round(x*180/Math.PI)}°`;E.yaw.textContent=deg(g.yaw);E.pitch.textContent=deg(g.pitch);E.roll.textContent=deg(g.roll);E.pose.textContent=`${deg(g.yaw)} / ${deg(g.pitch)}`}
function eventPoint(e){const r=C.getBoundingClientRect();return{x:(e.clientX-r.left)*C.width/r.width,y:(e.clientY-r.top)*C.height/r.height}}
C.addEventListener('pointerdown',e=>{const q=eventPoint(e);if(S.manual){S.manualPoints.push(q);if(S.manualPoints.length===6){S.model=manualModel(S.manualPoints);S.base=structuredCloneSafe(S.model);S.manual=false;status('Construction manuelle terminée.','success')}draw();return}if(!S.model)return;for(const k of ['center','chin','templeL','templeR'])if(dist(q,S.model[k])<25){S.drag=k;C.setPointerCapture(e.pointerId);break}});
C.addEventListener('pointermove',e=>{if(!S.drag||!S.model)return;const q=eventPoint(e),g=S.model;if(S.drag==='center'){const dx=q.x-g.center.x,dy=q.y-g.center.y;for(const k of ['center','eyeMid','nose','chin','templeL','templeR']){g[k].x+=dx;g[k].y+=dy}}else{g[S.drag]=q;if(S.drag==='chin')g.chinLocalY=dist(g.center,q)*.78;if(S.drag==='templeL'||S.drag==='templeR'){g.rx=dist(g.templeL,g.templeR)*.5;g.rz=g.rx*.86;g.jawHalf=g.rx*.71}}draw()});
C.addEventListener('pointerup',()=>S.drag=null);C.addEventListener('pointercancel',()=>S.drag=null);
function reset(){if(S.base){S.model=structuredCloneSafe(S.base);draw()}else{S.manualPoints=[];S.model=null;draw()}}
function exportPNG(){if(!S.image)return;const a=document.createElement('a');a.download=(S.name||'loomi')+'-v7.png';a.href=C.toDataURL('image/png');a.click()}
function diagnostics(){E.diagOut.textContent=['Loomi Engine V7','URL: '+location.href,'Navigateur: '+navigator.userAgent,'Canvas: '+C.width+'×'+C.height,'FaceMesh global: '+!!window.FaceMesh,'Moteur prêt: '+S.ready,'Photo: '+!!S.image,'Repères MediaPipe: '+(S.lm?.length||0),'Modèle géométrique: '+!!S.model,'Erreur: '+(S.error?.stack||S.error||'aucune'),'','Journal:',...S.logs].join('\n');E.dialog.showModal()}
E.input.addEventListener('change',e=>importPhoto(e.target.files[0]));E.detect.addEventListener('click',detect);E.manual.addEventListener('click',manualStart);E.reset.addEventListener('click',reset);E.export.addEventListener('click',exportPNG);E.diag.addEventListener('click',diagnostics);E.close.addEventListener('click',()=>E.dialog.close());E.copy.addEventListener('click',()=>navigator.clipboard?.writeText(E.diagOut.textContent));
for(const el of [E.opacity,E.width,E.skull,E.sideDepth,E.sideSize,E.jaw,E.showSkull,E.showSide,E.showJaw,E.showLevels,E.showBack,E.showHandles,E.learning])el.addEventListener('input',draw);
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=7.0.0').catch(e=>log('SW: '+e)));
drawPreview();initAI();
})();
