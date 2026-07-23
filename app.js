(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    input: $("photoInput"), canvas: $("canvas"), stage: $("stage"), empty: $("emptyState"),
    status: $("status"), loader: $("loader"), loaderText: $("loaderText"), badge: $("aiBadge"),
    detect: $("detectButton"), manual: $("manualButton"), reset: $("resetButton"), export: $("exportButton"),
    diagnostic: $("diagnosticButton"), dialog: $("diagnosticDialog"), closeDiagnostic: $("closeDiagnostic"),
    diagnosticOutput: $("diagnosticOutput"), copyDiagnostic: $("copyDiagnostic"),
    opacity: $("opacityRange"), width: $("widthRange"), landmarks: $("showLandmarks"), handles: $("showHandles")
  };
  const ctx = els.canvas.getContext("2d");

  const state = {
    image: null, filename: "loomi-portrait", faceMesh: null, aiReady: false, aiLoading: false,
    aiError: null, faceLandmarks: null, guides: null, originalGuides: null,
    dragging: null, pointerId: null, manualMode: false, manualPoints: [],
    logs: [], lastDetectionAt: null
  };

  const MP_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/";

  function log(message, data) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}${data ? ` | ${String(data)}` : ""}`;
    state.logs.push(line);
    if (state.logs.length > 80) state.logs.shift();
    console.log("[Loomi]", message, data ?? "");
  }

  function setStatus(message, type = "") {
    els.status.textContent = message;
    els.status.className = `status ${type}`.trim();
  }

  function setBadge(message, type) {
    els.badge.textContent = message;
    els.badge.className = `badge badge-${type}`;
  }

  function waitForFaceMeshGlobal(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (window.FaceMesh) {
          clearInterval(timer);
          resolve(window.FaceMesh);
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          reject(new Error("Le script MediaPipe FaceMesh n'est pas disponible dans window.FaceMesh."));
        }
      }, 100);
    });
  }

  async function initAI() {
    if (state.aiReady || state.aiLoading) return;
    state.aiLoading = true;
    setBadge("Chargement du moteur…", "loading");
    log("Initialisation du moteur FaceMesh");

    try {
      const FaceMeshClass = await waitForFaceMeshGlobal();
      const mesh = new FaceMeshClass({
        locateFile: (file) => `${MP_BASE}${file}`
      });

      mesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.45,
        minTrackingConfidence: 0.45,
        selfieMode: false
      });

      mesh.onResults((results) => {
        hideLoader();
        els.detect.disabled = false;
        state.lastDetectionAt = new Date().toISOString();

        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
          state.faceLandmarks = null;
          state.guides = null;
          setStatus("Aucun visage détecté. Essaie une photo plus nette, plus lumineuse ou davantage cadrée sur le visage.", "error");
          log("Détection terminée sans visage");
          draw();
          return;
        }

        state.faceLandmarks = results.multiFaceLandmarks[0];
        state.guides = buildGuides(state.faceLandmarks);
        state.originalGuides = JSON.parse(JSON.stringify(state.guides));
        state.manualMode = false;
        setStatus("Visage détecté. La construction Loomi est prête et peut être corrigée avec les poignées.", "success");
        log(`Visage détecté avec ${state.faceLandmarks.length} repères`);
        draw();
      });

      state.faceMesh = mesh;
      state.aiReady = true;
      state.aiError = null;
      setBadge("Moteur prêt", "ready");
      setStatus(state.image ? "Moteur prêt. Détection automatique en cours…" : "Moteur prêt. Choisis une photo.", "success");
      log("Moteur FaceMesh prêt");

      if (state.image) await detectFace();
    } catch (error) {
      state.aiError = error;
      setBadge("Moteur indisponible", "error");
      setStatus("Le moteur automatique n'a pas pu démarrer. La photo et le mode manuel restent disponibles. Ouvre le diagnostic pour voir la cause.", "error");
      log("Échec du chargement IA", error?.stack || error?.message || error);
    } finally {
      state.aiLoading = false;
    }
  }

  function showLoader(text) {
    els.loaderText.textContent = text;
    els.loader.classList.remove("hidden");
  }
  function hideLoader() { els.loader.classList.add("hidden"); }

  function fitCanvas(img) {
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    els.canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    els.canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  }

  function importPhoto(file) {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("Choisis un fichier image compatible.", "error");
      return;
    }
    state.filename = file.name.replace(/\.[^.]+$/, "") || "loomi-portrait";
    const reader = new FileReader();

    reader.onerror = () => setStatus("Impossible de lire ce fichier image.", "error");
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        state.image = img;
        state.faceLandmarks = null;
        state.guides = null;
        state.originalGuides = null;
        state.manualMode = false;
        state.manualPoints = [];
        fitCanvas(img);
        els.stage.classList.remove("empty");
        els.empty.classList.add("hidden");
        els.detect.disabled = false;
        els.manual.disabled = false;
        els.reset.disabled = false;
        els.export.disabled = false;
        draw();
        setStatus("Photo chargée correctement.", "success");
        log(`Photo chargée ${img.naturalWidth}×${img.naturalHeight}`);

        if (state.aiReady) await detectFace();
        else initAI();
      };
      img.onerror = () => setStatus("Le navigateur ne parvient pas à décoder cette image.", "error");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function detectFace() {
    if (!state.image) return;
    if (!state.aiReady || !state.faceMesh) {
      setStatus("Le moteur automatique n'est pas prêt. Tu peux utiliser le mode manuel ou ouvrir le diagnostic.", "error");
      initAI();
      return;
    }

    try {
      state.manualMode = false;
      state.manualPoints = [];
      els.detect.disabled = true;
      showLoader("Analyse du visage…");
      log("Envoi de l'image au moteur FaceMesh");
      await state.faceMesh.send({ image: state.image });
    } catch (error) {
      hideLoader();
      els.detect.disabled = false;
      state.aiError = error;
      setStatus("L'analyse a rencontré une erreur. Le mode manuel reste disponible.", "error");
      log("Erreur pendant la détection", error?.stack || error?.message || error);
    }
  }

  const P = (lm) => ({ x: lm.x * els.canvas.width, y: lm.y * els.canvas.height, z: lm.z || 0 });
  const mid = (a,b) => ({ x:(a.x+b.x)/2, y:(a.y+b.y)/2 });
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

  function buildGuides(lm) {
    const leftEye = P(lm[33]), rightEye = P(lm[263]);
    const leftTemple = P(lm[234]), rightTemple = P(lm[454]);
    const forehead = P(lm[10]), chin = P(lm[152]), nose = P(lm[1]), mouth = P(lm[13]);
    const eyeCenter = mid(leftEye, rightEye);
    const angle = Math.atan2(rightEye.y-leftEye.y, rightEye.x-leftEye.x);
    const faceWidth = dist(leftTemple,rightTemple);
    const faceHeight = dist(forehead,chin);
    const center = {
      x: eyeCenter.x + (chin.x-forehead.x)*0.05,
      y: eyeCenter.y - faceHeight*0.14
    };
    const crown = {
      x: center.x + Math.sin(angle)*faceHeight*0.47,
      y: center.y - Math.cos(angle)*faceHeight*0.47
    };
    return { center,crown,chin,leftTemple,rightTemple,nose,mouth,eyeCenter,angle };
  }

  function buildManualGuides(points) {
    const [leftEye,rightEye,nose,chin,leftTemple,rightTemple] = points;
    const eyeCenter = mid(leftEye,rightEye);
    const angle = Math.atan2(rightEye.y-leftEye.y,rightEye.x-leftEye.x);
    const faceHeight = dist(eyeCenter,chin)*1.55;
    const center = {
      x: eyeCenter.x + (chin.x-eyeCenter.x)*0.04,
      y: eyeCenter.y - faceHeight*0.16
    };
    const mouth = {
      x: nose.x + (chin.x-nose.x)*0.48,
      y: nose.y + (chin.y-nose.y)*0.48
    };
    const crown = {
      x: center.x + Math.sin(angle)*faceHeight*0.48,
      y: center.y - Math.cos(angle)*faceHeight*0.48
    };
    return { center,crown,chin,leftTemple,rightTemple,nose,mouth,eyeCenter,angle };
  }

  function drawImage() {
    if (!state.image) return;
    ctx.clearRect(0,0,els.canvas.width,els.canvas.height);
    ctx.drawImage(state.image,0,0,els.canvas.width,els.canvas.height);
  }

  function ellipsePoint(g,t) {
    const rx = Math.max(24,dist(g.leftTemple,g.rightTemple)*0.58);
    const ry = Math.max(28,dist(g.crown,g.chin)*0.55);
    const c=Math.cos(g.angle),s=Math.sin(g.angle),ct=Math.cos(t),st=Math.sin(t);
    return { x:g.center.x+rx*ct*c-ry*st*s, y:g.center.y+rx*ct*s+ry*st*c };
  }

  function drawLoomi() {
    const g=state.guides; if(!g) return;
    const opacity=Number(els.opacity.value)/100;
    const width=Number(els.width.value)*(els.canvas.width/1000+0.45);
    ctx.save();
    ctx.strokeStyle=`rgba(255,232,184,${opacity})`;
    ctx.fillStyle=`rgba(255,232,184,${opacity})`;
    ctx.lineWidth=width; ctx.lineCap="round"; ctx.lineJoin="round";
    ctx.shadowColor="rgba(0,0,0,.42)"; ctx.shadowBlur=3;

    ctx.beginPath();
    for(let i=0;i<=100;i++){const p=ellipsePoint(g,i/100*Math.PI*2); if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}
    ctx.closePath(); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(g.leftTemple.x,g.leftTemple.y);
    ctx.quadraticCurveTo(g.eyeCenter.x,g.eyeCenter.y,g.rightTemple.x,g.rightTemple.y);
    ctx.stroke();

    const top=ellipsePoint(g,-Math.PI/2);
    ctx.beginPath(); ctx.moveTo(top.x,top.y);
    ctx.bezierCurveTo(g.center.x,g.center.y,g.nose.x,g.nose.y,g.chin.x,g.chin.y);
    ctx.stroke();

    const sideSign=(g.nose.x-g.eyeCenter.x)>=0?1:-1;
    const sideTemple=sideSign>0?g.rightTemple:g.leftTemple;
    const planeR=dist(g.leftTemple,g.rightTemple)*.155;
    const planeCenter={
      x:sideTemple.x-Math.cos(g.angle)*sideSign*planeR*.36,
      y:sideTemple.y-Math.sin(g.angle)*sideSign*planeR*.36
    };
    ctx.beginPath(); ctx.ellipse(planeCenter.x,planeCenter.y,planeR*.72,planeR,g.angle,0,Math.PI*2); ctx.stroke();

    const jl={x:g.leftTemple.x+(g.chin.x-g.leftTemple.x)*.62,y:g.leftTemple.y+(g.chin.y-g.leftTemple.y)*.68};
    const jr={x:g.rightTemple.x+(g.chin.x-g.rightTemple.x)*.62,y:g.rightTemple.y+(g.chin.y-g.rightTemple.y)*.68};
    ctx.beginPath(); ctx.moveTo(g.leftTemple.x,g.leftTemple.y); ctx.lineTo(jl.x,jl.y); ctx.lineTo(g.chin.x,g.chin.y); ctx.lineTo(jr.x,jr.y); ctx.lineTo(g.rightTemple.x,g.rightTemple.y); ctx.stroke();

    const dirX=Math.cos(g.angle),dirY=Math.sin(g.angle),half=dist(g.leftTemple,g.rightTemple)*.43;
    ctx.setLineDash([9*Number(els.width.value),7*Number(els.width.value)]);
    ctx.globalAlpha=.68;
    for(const [p,m] of [[g.nose,1],[g.mouth,.82]]){
      ctx.beginPath();ctx.moveTo(p.x-dirX*half*m,p.y-dirY*half*m);ctx.lineTo(p.x+dirX*half*m,p.y+dirY*half*m);ctx.stroke();
    }
    ctx.restore();
  }

  function drawLandmarks() {
    if(!els.landmarks.checked||!state.faceLandmarks)return;
    ctx.save();ctx.fillStyle="rgba(93,226,255,.72)";
    const r=Math.max(1.2,els.canvas.width/850);
    for(const lm of state.faceLandmarks){ctx.beginPath();ctx.arc(lm.x*els.canvas.width,lm.y*els.canvas.height,r,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }

  function handleRadius(){return Math.max(9,els.canvas.width/90);}
  function drawHandles(){
    if(!els.handles.checked||!state.guides)return;
    const keys=["crown","center","leftTemple","rightTemple","chin","nose","mouth"],r=handleRadius();
    ctx.save();ctx.lineWidth=Math.max(2,els.canvas.width/500);
    for(const key of keys){const p=state.guides[key];ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle="rgba(24,20,15,.8)";ctx.fill();ctx.strokeStyle="#f2cf92";ctx.stroke();}
    ctx.restore();
  }

  function drawManualPoints(){
    if(!state.manualMode)return;
    const labels=["Œil gauche","Œil droit","Nez","Menton","Tempe gauche","Tempe droite"];
    ctx.save();ctx.font=`700 ${Math.max(13,els.canvas.width/70)}px system-ui`;
    state.manualPoints.forEach((p,i)=>{
      ctx.beginPath();ctx.arc(p.x,p.y,handleRadius(),0,Math.PI*2);ctx.fillStyle="rgba(30,25,19,.85)";ctx.fill();ctx.strokeStyle="#72e6ff";ctx.lineWidth=3;ctx.stroke();
      ctx.fillStyle="#fff";ctx.fillText(String(i+1),p.x+handleRadius()+4,p.y);
    });
    const next=labels[state.manualPoints.length];
    if(next)setStatus(`Mode manuel : touche le point ${state.manualPoints.length+1}/6, ${next}.`);
    ctx.restore();
  }

  function draw(){drawImage();drawLandmarks();drawLoomi();drawHandles();drawManualPoints();}

  function coords(e){const r=els.canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*els.canvas.width/r.width,y:(e.clientY-r.top)*els.canvas.height/r.height};}
  function findHandle(p){
    if(!state.guides||!els.handles.checked)return null;
    let best=null,bestD=Infinity;const threshold=handleRadius()*1.8;
    for(const key of ["crown","center","leftTemple","rightTemple","chin","nose","mouth"]){const d=dist(p,state.guides[key]);if(d<threshold&&d<bestD){best=key;bestD=d;}}
    return best;
  }

  els.canvas.addEventListener("pointerdown",(e)=>{
    const p=coords(e);
    if(state.manualMode){
      if(state.manualPoints.length<6){
        state.manualPoints.push(p);
        if(state.manualPoints.length===6){
          state.guides=buildManualGuides(state.manualPoints);
          state.originalGuides=JSON.parse(JSON.stringify(state.guides));
          state.manualMode=false;
          setStatus("Construction manuelle créée. Tu peux maintenant ajuster les poignées.","success");
        }
        draw();
      }
      return;
    }
    const key=findHandle(p);if(!key)return;
    state.dragging=key;state.pointerId=e.pointerId;els.canvas.setPointerCapture(e.pointerId);e.preventDefault();
  });

  els.canvas.addEventListener("pointermove",(e)=>{
    if(!state.dragging||e.pointerId!==state.pointerId)return;
    const p=coords(e),g=state.guides,old={...g[state.dragging]};g[state.dragging]=p;
    if(state.dragging==="center"){
      const dx=p.x-old.x,dy=p.y-old.y;
      for(const key of ["crown","leftTemple","rightTemple","chin","nose","mouth","eyeCenter"]){g[key].x+=dx;g[key].y+=dy;}
    }
    if(state.dragging==="leftTemple"||state.dragging==="rightTemple"){
      g.eyeCenter=mid(g.leftTemple,g.rightTemple);
      g.angle=Math.atan2(g.rightTemple.y-g.leftTemple.y,g.rightTemple.x-g.leftTemple.x);
    }
    draw();e.preventDefault();
  });
  function endDrag(e){if(e.pointerId===state.pointerId){state.dragging=null;state.pointerId=null;}}
  els.canvas.addEventListener("pointerup",endDrag);els.canvas.addEventListener("pointercancel",endDrag);

  function startManual(){
    if(!state.image)return;
    state.manualMode=true;state.manualPoints=[];state.faceLandmarks=null;state.guides=null;state.originalGuides=null;
    setStatus("Mode manuel : touche le point 1/6, l'œil gauche.");
    draw();
  }

  function reset(){
    state.manualMode=false;state.manualPoints=[];
    if(state.originalGuides){state.guides=JSON.parse(JSON.stringify(state.originalGuides));setStatus("Construction revenue à sa position initiale.","success");}
    else {state.guides=null;state.faceLandmarks=null;setStatus("Photo conservée. Relance la détection ou le mode manuel.");}
    draw();
  }

  function exportPNG(){
    if(!state.image)return;
    const out=document.createElement("canvas");out.width=els.canvas.width;out.height=els.canvas.height;
    out.getContext("2d").drawImage(els.canvas,0,0);
    out.toBlob((blob)=>{
      if(!blob)return;const a=document.createElement("a"),url=URL.createObjectURL(blob);
      a.href=url;a.download=`${state.filename}-loomi.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus("Image Loomi exportée en PNG.","success");
    },"image/png");
  }

  async function runDiagnostic(){
    let cdnStatus="non testé";
    try{
      const response=await fetch(`${MP_BASE}face_mesh.binarypb`,{method:"HEAD",cache:"no-store"});
      cdnStatus=`HTTP ${response.status} ${response.ok?"OK":"ÉCHEC"}`;
    }catch(error){cdnStatus=`ÉCHEC : ${error.message}`;}

    const info=[
      `Date : ${new Date().toLocaleString()}`,
      `Adresse : ${location.href}`,
      `En ligne : ${navigator.onLine}`,
      `Navigateur : ${navigator.userAgent}`,
      `Protocole sécurisé : ${window.isSecureContext}`,
      `FaceMesh global présent : ${typeof window.FaceMesh !== "undefined"}`,
      `Moteur initialisé : ${state.aiReady}`,
      `Chargement en cours : ${state.aiLoading}`,
      `Photo chargée : ${Boolean(state.image)}`,
      `Canvas : ${els.canvas.width}×${els.canvas.height}`,
      `Test ressource MediaPipe : ${cdnStatus}`,
      `Dernière détection : ${state.lastDetectionAt || "aucune"}`,
      `Dernière erreur : ${state.aiError?.stack || state.aiError?.message || state.aiError || "aucune"}`,
      "",
      "Journal :",
      ...state.logs
    ];
    els.diagnosticOutput.textContent=info.join("\n");
    els.dialog.showModal();
  }

  els.input.addEventListener("change",()=>importPhoto(els.input.files?.[0]));
  els.detect.addEventListener("click",detectFace);
  els.manual.addEventListener("click",startManual);
  els.reset.addEventListener("click",reset);
  els.export.addEventListener("click",exportPNG);
  els.diagnostic.addEventListener("click",runDiagnostic);
  els.closeDiagnostic.addEventListener("click",()=>els.dialog.close());
  els.copyDiagnostic.addEventListener("click",async()=>{
    await navigator.clipboard.writeText(els.diagnosticOutput.textContent);
    els.copyDiagnostic.textContent="Copié ✓";setTimeout(()=>els.copyDiagnostic.textContent="Copier le diagnostic",1400);
  });
  for(const el of [els.opacity,els.width,els.landmarks,els.handles])el.addEventListener("input",draw);

  window.addEventListener("error",(e)=>log("Erreur JavaScript globale",`${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection",(e)=>log("Promesse rejetée",e.reason?.stack||e.reason));

  if("serviceWorker" in navigator){
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js?v=3.0.0").then(()=>log("Service worker enregistré")).catch((e)=>log("Service worker non enregistré",e.message)));
  }

  initAI();
})();
