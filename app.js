(() => {
"use strict";
const $=id=>document.getElementById(id);
const E={
 input:$("photoInput"),photo:$("photoCanvas"),preview:$("previewCanvas"),stage:$("stage"),empty:$("emptyState"),
 status:$("status"),badge:$("engineBadge"),loader:$("loader"),analyze:$("analyzeBtn"),manual:$("manualBtn"),
 reset:$("resetBtn"),export:$("exportBtn"),dialog:$("manualDialog"),prompt:$("manualPrompt"),
 cancelManual:$("cancelManual"),undoManual:$("undoManual"),yaw:$("yawOut"),pitch:$("pitchOut"),roll:$("rollOut"),
 sliders:["skullScale","skullHeight","sideDepth","jawWidth","chinLength","offsetX","offsetY","opacity","lineWidth"].reduce((o,k)=>(o[k]=$(k),o),{}),
 showHidden:$("showHidden"),showHandles:$("showHandles"),showMesh:$("showMesh")
};
const ctx=E.photo.getContext("2d"),pctx=E.preview.getContext("2d");
const COLORS={skull:"#f2eee4",side:"#9b6cff",brow:"#ff9c52",eyes:"#4db4ff",nose:"#51d19a",mouth:"#ff78a0",chin:"#ff4d4d",jaw:"#ff648f",axis:"#58d9ad",mesh:"#82919a"};
const state={image:null,name:"loomi",mesh:null,ready:false,landmarks:null,fit:null,manual:false,manualPoints:[],drag:null,groupDrag:null};
const MP="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI;

function status(t,type=""){E.status.textContent=t;E.status.className="status "+type}
function badge(t,type=""){E.badge.textContent=t;E.badge.className="badge "+type}
function settings(){
 return {
  skullScale:+E.sliders.skullScale.value/100, skullHeight:+E.sliders.skullHeight.value/100,
  sideDepth:+E.sliders.sideDepth.value/100, jawWidth:+E.sliders.jawWidth.value/100,
  chinLength:+E.sliders.chinLength.value/100, offsetX:+E.sliders.offsetX.value, offsetY:+E.sliders.offsetY.value, opacity:+E.sliders.opacity.value/100,
  lineWidth:+E.sliders.lineWidth.value, showHidden:E.showHidden.checked,
  showHandles:E.showHandles.checked,showMesh:E.showMesh.checked
 };
}
async function init(){
 try{
  let n=0;while(!window.FaceMesh&&n++<100)await new Promise(r=>setTimeout(r,100));
  if(!window.FaceMesh)throw Error("FaceMesh indisponible");
  state.mesh=new FaceMesh({locateFile:f=>MP+f});
  state.mesh.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:.45,minTrackingConfidence:.45});
  state.mesh.onResults(onResults);state.ready=true;badge("Moteur prêt","ready");
  if(state.image)analyze();
 }catch(e){badge("Mode manuel disponible","error");status("Le moteur automatique n’a pas chargé. Le calibrage manuel fonctionne sans IA.","error")}
}
function fitCanvas(img){
 const max=1700,s=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
 E.photo.width=Math.round(img.naturalWidth*s);E.photo.height=Math.round(img.naturalHeight*s);
}
function importImage(file){
 if(!file||!file.type.startsWith("image/"))return status("Choisis une image compatible.","error");
 const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{
  state.image=img;state.name=file.name.replace(/\.[^.]+$/,"")||"loomi";fitCanvas(img);
  state.fit=null;state.landmarks=null;E.sliders.offsetX.value=0;E.sliders.offsetY.value=0;E.stage.classList.remove("empty");E.empty.classList.add("hidden");
  [E.analyze,E.manual,E.reset,E.export].forEach(x=>x.disabled=false);draw();status("Photo chargée. Analyse automatique ou calibrage manuel.","success");
  if(state.ready)analyze();
 };img.src=r.result};r.readAsDataURL(file);
}
async function analyze(){
 if(!state.image)return;if(!state.ready)return status("Moteur automatique indisponible. Utilise le calibrage manuel.","error");
 E.loader.classList.remove("hidden");E.analyze.disabled=true;
 try{await state.mesh.send({image:state.image})}catch(e){E.loader.classList.add("hidden");E.analyze.disabled=false;status("Analyse impossible. Utilise le calibrage manuel.","error")}
}
function P(lm,i){return{x:lm[i].x*E.photo.width,y:lm[i].y*E.photo.height,z:lm[i].z||0}}
function onResults(r){
 E.loader.classList.add("hidden");E.analyze.disabled=false;
 if(!r.multiFaceLandmarks?.length){status("Aucun visage détecté. Essaie le calibrage manuel.","error");return}
 state.landmarks=r.multiFaceLandmarks[0];state.fit=fitFromLandmarks(state.landmarks);status("Tête géométrique reconstruite. Les poignées restent ajustables.","success");draw();
}
function fitFromLandmarks(lm){
 const eyeL=mid(P(lm,33),P(lm,133)),eyeR=mid(P(lm,362),P(lm,263)),nose=P(lm,1),chin=P(lm,152);
 const templeL=P(lm,234),templeR=P(lm,454),top=P(lm,10),mouth=P(lm,13);
 const eyes=mid(eyeL,eyeR),roll=Math.atan2(eyeR.y-eyeL.y,eyeR.x-eyeL.x);
 const eyeSpan=dist(eyeL,eyeR),faceW=dist(templeL,templeR),faceH=dist(top,chin);
 const yaw=clamp((nose.x-eyes.x)/(eyeSpan*.43),-.95,.95)*rad(42);
 const upper=dist(top,eyes),lower=dist(eyes,chin),pitch=clamp((upper/lower-.72)*.85,-.55,.55);
 const center={x:eyes.x-Math.sin(yaw)*faceW*.055,y:eyes.y-faceH*.22};
 const ry=faceH*.49;
 const rawEye=(eyes.y-center.y)/ry;
 const rawBrow=(mid(P(lm,70),P(lm,300)).y-center.y)/ry;
 const rawNose=(nose.y-center.y)/ry;
 const rawMouth=(mouth.y-center.y)/ry;
 const rawChin=(chin.y-center.y)/ry;
 return {center,rx:faceW*.53,ry,yaw,pitch,roll,
   eyeY:rawEye-.10,
   browY:Math.min(rawBrow-.15,rawEye-.20),
   noseY:rawNose-.03,
   mouthY:rawMouth,
   chinY:rawChin+.12,
   anchors:{eyeL,eyeR,nose,chin,templeL,templeR,top,mouth}};
}
function fitFromManual(p){
 const [eyeL,eyeR,nose,chin,templeL,templeR,top,mouth]=p,eyes=mid(eyeL,eyeR);
 const roll=Math.atan2(eyeR.y-eyeL.y,eyeR.x-eyeL.x),eyeSpan=dist(eyeL,eyeR),faceW=dist(templeL,templeR),faceH=dist(top,chin);
 const yaw=clamp((nose.x-eyes.x)/(eyeSpan*.43),-.95,.95)*rad(42),pitch=clamp((dist(top,eyes)/dist(eyes,chin)-.72)*.85,-.55,.55);
 const center={x:eyes.x-Math.sin(yaw)*faceW*.055,y:eyes.y-faceH*.22};
 const ry=faceH*.49;
 const rawEye=(eyes.y-center.y)/ry;
 const rawNose=(nose.y-center.y)/ry;
 const rawMouth=(mouth.y-center.y)/ry;
 const rawChin=(chin.y-center.y)/ry;
 return {center,rx:faceW*.53,ry,yaw,pitch,roll,
  eyeY:rawEye-.10,
  browY:rawEye-.25,
  noseY:rawNose-.03,
  mouthY:rawMouth,
  chinY:rawChin+.12,
  anchors:{eyeL,eyeR,nose,chin,templeL,templeR,top,mouth}};
}
function rotate(v,yaw,pitch,roll){
 let{x,y,z}=v;let c=Math.cos(yaw),s=Math.sin(yaw);[x,z]=[c*x+s*z,-s*x+c*z];
 c=Math.cos(pitch);s=Math.sin(pitch);[y,z]=[c*y-s*z,s*y+c*z];
 c=Math.cos(roll);s=Math.sin(roll);[x,y]=[c*x-s*y,s*x+c*y];return{x,y,z};
}
function projector(fit,preview=false){
 const set=settings(),rx=fit.rx*set.skullScale,ry=fit.ry*set.skullScale*set.skullHeight;
 const scale=preview?Math.min(E.preview.width/(rx*3.0),E.preview.height/(ry*3.0)):1;
 const center=preview?{x:E.preview.width/2,y:E.preview.height*.46}:{x:fit.center.x+set.offsetX,y:fit.center.y+set.offsetY};
 return {
  rx,ry,rz:rx*.91,center,scale,
  point(v){const q=rotate({x:v.x*rx,y:v.y*ry,z:v.z*rx*.91},fit.yaw,fit.pitch,fit.roll);return{x:center.x+q.x*scale,y:center.y+q.y*scale,z:q.z}},
  normal(v){return rotate(v,fit.yaw,fit.pitch,fit.roll)}
 };
}
function sampleCurve(fn,n=90){const a=[];for(let i=0;i<=n;i++)a.push(fn(i/n));return a}
function latitude(y,proj){
 const yy=clamp(y,-.96,.96),r=Math.sqrt(1-yy*yy);
 return sampleCurve(t=>{const a=t*Math.PI*2;return proj.point({x:r*Math.cos(a),y:yy,z:r*Math.sin(a)})});
}
function meridian(angle,proj){
 return sampleCurve(t=>{const a=(t-.5)*Math.PI;return proj.point({x:Math.sin(a)*Math.cos(angle),y:Math.cos(a),z:Math.sin(a)*Math.sin(angle)})});
}
function sideCircle(side,proj){
 const d=settings().sideDepth, x=side*d, r=Math.sqrt(Math.max(.05,1-d*d));
 return sampleCurve(t=>{const a=t*Math.PI*2;return proj.point({x,y:r*Math.cos(a),z:r*Math.sin(a)})});
}
function jawCurves(fit,proj){
 const s=settings(),side=Math.sin(fit.yaw)>=0?1:-1;
 const cheekY=clamp(fit.noseY+.12,-.05,.62);
 const chinY=clamp(fit.chinY+(s.chinLength-1)*1.15,.62,1.62);
 const jawTop=.74*s.jawWidth,angleX=.68*s.jawWidth;
 const front=[
  proj.point({x:-jawTop,y:cheekY,z:.18}),proj.point({x:-angleX,y:.70,z:.12}),
  proj.point({x:-.34,y:chinY*.96,z:.30}),proj.point({x:0,y:chinY,z:.34}),
  proj.point({x:.34,y:chinY*.96,z:.30}),proj.point({x:angleX,y:.70,z:.12}),proj.point({x:jawTop,y:cheekY,z:.18})
 ];
 const back=[
  proj.point({x:-jawTop,y:cheekY,z:-.16}),proj.point({x:-angleX,y:.70,z:-.12}),
  proj.point({x:0,y:chinY,z:-.25}),proj.point({x:angleX,y:.70,z:-.12}),proj.point({x:jawTop,y:cheekY,z:-.16})
 ];
 const chinGuide=[
   proj.point({x:-.30,y:chinY-.03,z:.31}),
   proj.point({x:-.16,y:chinY+.02,z:.34}),
   proj.point({x:0,y:chinY+.045,z:.36}),
   proj.point({x:.16,y:chinY+.02,z:.34}),
   proj.point({x:.30,y:chinY-.03,z:.31})
 ];
 return{front,back,chinGuide,side};
}
function drawSegmented(ctx,pts,color,width,hidden){
 ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.lineJoin="round";
 for(let i=1;i<pts.length;i++){const z=(pts[i-1].z+pts[i].z)/2,back=z<0;if(back&&!hidden)continue;ctx.setLineDash(back?[7,7]:[]);ctx.beginPath();ctx.moveTo(pts[i-1].x,pts[i-1].y);ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke()}
 ctx.restore();
}
function drawPolyline(c,pts,color,width,dash=[]){c.save();c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.lineCap="round";c.lineJoin="round";c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();c.restore()}
function geometry(c,fit,preview=false){
 const s=settings(),pr=projector(fit,preview),w=s.lineWidth*(preview?1.3:1);c.save();c.globalAlpha=s.opacity;
 if(s.showMesh){[-.7,-.35,0,.35,.7].forEach(y=>drawSegmented(c,latitude(y,pr),COLORS.mesh,w*.45,s.showHidden));[-1.1,-.55,0,.55,1.1].forEach(a=>drawSegmented(c,meridian(a,pr),COLORS.mesh,w*.4,s.showHidden))}
 drawSegmented(c,latitude(0,pr),COLORS.skull,w,s.showHidden);
 drawSegmented(c,meridian(Math.PI/2,pr),COLORS.skull,w,s.showHidden);
 const outline=sampleCurve(t=>{const a=t*Math.PI*2;return pr.point({x:Math.cos(a),y:Math.sin(a),z:0})});
 drawPolyline(c,outline,COLORS.skull,w);
 const side=Math.sin(fit.yaw)>=0?1:-1;drawSegmented(c,sideCircle(side,pr),COLORS.side,w,s.showHidden);
 drawSegmented(c,latitude(fit.browY,pr),COLORS.brow,w,s.showHidden);
 drawSegmented(c,latitude(fit.eyeY,pr),COLORS.eyes,w,s.showHidden);
 drawSegmented(c,latitude(fit.noseY,pr),COLORS.nose,w,s.showHidden);
 drawSegmented(c,latitude(fit.mouthY,pr),COLORS.mouth,w,s.showHidden);
 const axis=meridian(Math.PI/2,pr);drawSegmented(c,axis,COLORS.axis,w,s.showHidden);
 const jaw=jawCurves(fit,pr);
 drawPolyline(c,jaw.front,COLORS.jaw,w);
 drawPolyline(c,jaw.chinGuide,COLORS.chin,w);
 if(s.showHidden)drawPolyline(c,jaw.back,COLORS.jaw,w,[7,7]);
 c.restore();
 return pr;
}
function draw(){
 if(!state.image)return;ctx.clearRect(0,0,E.photo.width,E.photo.height);ctx.drawImage(state.image,0,0,E.photo.width,E.photo.height);
 pctx.clearRect(0,0,E.preview.width,E.preview.height);
 if(state.fit){geometry(ctx,state.fit,false);geometry(pctx,state.fit,true);updatePose();if(settings().showHandles)drawHandles()}
}
function updatePose(){E.yaw.textContent=Math.round(deg(state.fit.yaw))+"°";E.pitch.textContent=Math.round(deg(state.fit.pitch))+"°";E.roll.textContent=Math.round(deg(state.fit.roll))+"°"}
function handles(){if(!state.fit)return[];const a=state.fit.anchors;return Object.entries(a).map(([name,p])=>({name,p}))}
function drawHandles(){const s=settings();ctx.save();for(const h of handles()){ctx.fillStyle="#fff";ctx.strokeStyle="#222";ctx.lineWidth=2;ctx.beginPath();ctx.arc(h.p.x+s.offsetX,h.p.y+s.offsetY,7,0,Math.PI*2);ctx.fill();ctx.stroke()}ctx.restore()}
function canvasPoint(ev){const r=E.photo.getBoundingClientRect();return{x:(ev.clientX-r.left)*E.photo.width/r.width,y:(ev.clientY-r.top)*E.photo.height/r.height}}
function startManual(){
 state.manual=true;state.manualPoints=[];E.dialog.showModal();E.prompt.textContent=manualTexts[0];status("Calibrage manuel : pose les 8 points dans l’ordre.");
}
const manualTexts=["Clique sur l’œil gauche.","Clique sur l’œil droit.","Clique sur la pointe du nez.","Clique sur le bas du menton.","Clique sur la tempe gauche.","Clique sur la tempe droite.","Clique sur le sommet du crâne.","Clique au centre de la bouche."];
function manualClick(p){
 state.manualPoints.push(p);if(state.manualPoints.length===8){state.manual=false;E.dialog.close();state.fit=fitFromManual(state.manualPoints);status("Calibrage manuel terminé.","success");draw()}else E.prompt.textContent=manualTexts[state.manualPoints.length];
}
E.photo.addEventListener("pointerdown",ev=>{
 const p=canvasPoint(ev);
 if(state.manual){manualClick(p);return}
 if(!state.fit)return;

 if(settings().showHandles){
   let best=null,bd=18;
   for(const h of handles()){
     const hp={x:h.p.x+settings().offsetX,y:h.p.y+settings().offsetY};
     const d=dist(p,hp);
     if(d<bd){best=h;bd=d}
   }
   if(best){
     state.drag=best.name;
     E.photo.setPointerCapture(ev.pointerId);
     return;
   }
 }

 state.groupDrag={
   start:p,
   offsetX:+E.sliders.offsetX.value,
   offsetY:+E.sliders.offsetY.value
 };
 E.photo.style.cursor="grabbing";
 E.photo.setPointerCapture(ev.pointerId);
});
E.photo.addEventListener("pointermove",ev=>{
 const p=canvasPoint(ev);

 if(state.groupDrag){
   E.sliders.offsetX.value=clamp(state.groupDrag.offsetX+(p.x-state.groupDrag.start.x),-300,300);
   E.sliders.offsetY.value=clamp(state.groupDrag.offsetY+(p.y-state.groupDrag.start.y),-300,300);
   draw();
   return;
 }

 if(!state.drag||!state.fit)return;
 const s=settings();
 const local={x:p.x-s.offsetX,y:p.y-s.offsetY};
 state.fit.anchors[state.drag]=local;
 state.fit=fitFromManual([
   state.fit.anchors.eyeL,state.fit.anchors.eyeR,state.fit.anchors.nose,state.fit.anchors.chin,
   state.fit.anchors.templeL,state.fit.anchors.templeR,state.fit.anchors.top,state.fit.anchors.mouth
 ]);
 draw();
});
E.photo.addEventListener("pointerup",()=>{
 state.drag=null;
 state.groupDrag=null;
 E.photo.style.cursor="grab";
});
E.photo.addEventListener("pointercancel",()=>{
 state.drag=null;
 state.groupDrag=null;
 E.photo.style.cursor="grab";
});
E.input.addEventListener("change",e=>importImage(e.target.files[0]));E.analyze.addEventListener("click",analyze);E.manual.addEventListener("click",startManual);
E.cancelManual.addEventListener("click",()=>{state.manual=false;E.dialog.close()});E.undoManual.addEventListener("click",()=>{state.manualPoints.pop();E.prompt.textContent=manualTexts[state.manualPoints.length]});
E.reset.addEventListener("click",()=>{state.fit=null;state.manualPoints=[];E.sliders.offsetX.value=0;E.sliders.offsetY.value=0;draw();status("Construction réinitialisée.")});
E.export.addEventListener("click",()=>{draw();const a=document.createElement("a");a.download=state.name+"-loomi-v8.png";a.href=E.photo.toDataURL("image/png");a.click()});
[...Object.values(E.sliders),E.showHidden,E.showHandles,E.showMesh].forEach(el=>el.addEventListener("input",draw));
window.addEventListener("load",()=>{init();if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js?v=1.0.0").catch(()=>{})});
})();