(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    input: $("photoInput"), canvas: $("canvas"), stage: $("stage"), empty: $("emptyState"),
    status: $("status"), loader: $("loader"), loaderText: $("loaderText"), badge: $("aiBadge"),
    detect: $("detectButton"), manual: $("manualButton"), reset: $("resetButton"), export: $("exportButton"),
    diagnostic: $("diagnosticButton"), dialog: $("diagnosticDialog"), closeDiagnostic: $("closeDiagnostic"),
    diagnosticOutput: $("diagnosticOutput"), copyDiagnostic: $("copyDiagnostic"),
    opacity: $("opacityRange"), width: $("widthRange"), landmarks: $("showLandmarks"),
    handles: $("showHandles"), learning: $("learningMode")
  };
  const ctx = els.canvas.getContext("2d");

  const state = {
    image: null, filename: "loomi-portrait", faceMesh: null, aiReady: false, aiLoading: false,
    aiError: null, faceLandmarks: null, guides: null, originalGuides: null,
    dragging: null, pointerId: null, manualMode: false, manualPoints: [],
    logs: [], lastDetectionAt: null,
    learningStep: 0
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
    const leftEyeOuter = P(lm[33]);
    const rightEyeOuter = P(lm[263]);
    const leftEyeInner = P(lm[133]);
    const rightEyeInner = P(lm[362]);
    const leftBrow = P(lm[70]);
    const rightBrow = P(lm[300]);
    const leftTempleRaw = P(lm[234]);
    const rightTempleRaw = P(lm[454]);
    const leftJaw = P(lm[172]);
    const rightJaw = P(lm[397]);
    const forehead = P(lm[10]);
    const chin = P(lm[152]);
    const nose = P(lm[1]);
    const noseBridge = P(lm[6]);
    const mouth = P(lm[13]);
    const leftCheek = P(lm[50]);
    const rightCheek = P(lm[280]);

    const eyeCenter = mid(mid(leftEyeOuter, leftEyeInner), mid(rightEyeOuter, rightEyeInner));
    const browCenter = mid(leftBrow, rightBrow);
    const eyeSpan = dist(leftEyeOuter, rightEyeOuter);
    const faceWidth = dist(leftTempleRaw, rightTempleRaw);
    const faceHeight = dist(forehead, chin);
    const angle = Math.atan2(
      rightEyeOuter.y - leftEyeOuter.y,
      rightEyeOuter.x - leftEyeOuter.x
    );

    const horizontalYaw = Math.max(-1, Math.min(1, (nose.x - eyeCenter.x) / Math.max(1, eyeSpan * 0.36)));
    const depthYaw = Math.max(-1, Math.min(1, ((lm[234]?.z || 0) - (lm[454]?.z || 0)) * 7.5));
    const yaw = Math.max(-1, Math.min(1, horizontalYaw * 0.72 + depthYaw * 0.28));

    const upper = dist(forehead, noseBridge);
    const lower = dist(noseBridge, chin);
    const pitch = Math.max(-0.65, Math.min(0.65, (upper / Math.max(1, lower) - 0.72) * 1.35));

    const center = {
      x: browCenter.x - yaw * faceWidth * 0.06 + (chin.x - forehead.x) * 0.025,
      y: browCenter.y - faceHeight * (0.035 + pitch * 0.018)
    };

    const rx = faceWidth * (0.515 - Math.abs(yaw) * 0.028);
    const ry = faceHeight * (0.435 + Math.abs(pitch) * 0.025);

    const c = Math.cos(angle), s = Math.sin(angle);
    const crown = {
      x: center.x + s * ry,
      y: center.y - c * ry
    };

    const inset = 0.055 + Math.abs(yaw) * 0.025;
    const leftTemple = {
      x: leftTempleRaw.x + (rightTempleRaw.x - leftTempleRaw.x) * inset,
      y: leftTempleRaw.y + (rightTempleRaw.y - leftTempleRaw.y) * inset
    };
    const rightTemple = {
      x: rightTempleRaw.x + (leftTempleRaw.x - rightTempleRaw.x) * inset,
      y: rightTempleRaw.y + (leftTempleRaw.y - rightTempleRaw.y) * inset
    };

    const browLineY = center.y + ry * (0.03 + pitch * 0.03);
    const eyeLineY = eyeCenter.y;

    return {
      center, crown, chin, leftTemple, rightTemple, nose, mouth,
      eyeCenter, browCenter, browLineY, eyeLineY,
      leftJaw, rightJaw, leftCheek, rightCheek,
      angle, yaw, pitch, rx, ry
    };
  }

  function buildManualGuides(points) {
    const [leftEye,rightEye,nose,chin,leftTemple,rightTemple] = points;
    const eyeCenter = mid(leftEye,rightEye);
    const angle = Math.atan2(rightEye.y-leftEye.y,rightEye.x-leftEye.x);
    const faceWidth = dist(leftTemple,rightTemple);
    const faceHeight = dist(eyeCenter,chin)*1.55;
    const yaw = Math.max(-1, Math.min(1, (nose.x-eyeCenter.x)/Math.max(1,dist(leftEye,rightEye)*.36)));
    const browCenter = {
      x: eyeCenter.x - Math.sin(angle)*faceHeight*.075,
      y: eyeCenter.y - Math.cos(angle)*faceHeight*.075
    };
    const center = {
      x: browCenter.x-yaw*faceWidth*.06+(chin.x-eyeCenter.x)*.025,
      y: browCenter.y-faceHeight*.035
    };
    const mouth = {
      x: nose.x+(chin.x-nose.x)*.48,
      y: nose.y+(chin.y-nose.y)*.48
    };
    const rx=faceWidth*.515, ry=faceHeight*.435;
    const crown = {
      x:center.x+Math.sin(angle)*ry,
      y:center.y-Math.cos(angle)*ry
    };
    const leftJaw={x:leftTemple.x+(chin.x-leftTemple.x)*.66,y:leftTemple.y+(chin.y-leftTemple.y)*.68};
    const rightJaw={x:rightTemple.x+(chin.x-rightTemple.x)*.66,y:rightTemple.y+(chin.y-rightTemple.y)*.68};
    const leftCheek={x:leftTemple.x+(chin.x-leftTemple.x)*.38,y:leftTemple.y+(chin.y-leftTemple.y)*.4};
    const rightCheek={x:rightTemple.x+(chin.x-rightTemple.x)*.38,y:rightTemple.y+(chin.y-rightTemple.y)*.4};
    return {
      center,crown,chin,leftTemple,rightTemple,nose,mouth,eyeCenter,browCenter,
      browLineY:browCenter.y,eyeLineY:eyeCenter.y,
      leftJaw,rightJaw,leftCheek,rightCheek,angle,yaw,pitch:0,rx,ry
    };
  }

  function drawImage() {
    if (!state.image) return;
    ctx.clearRect(0,0,els.canvas.width,els.canvas.height);
    ctx.drawImage(state.image,0,0,els.canvas.width,els.canvas.height);
  }

  function ellipsePoint(g,t) {
    const rx = Math.max(24, g.rx || dist(g.leftTemple,g.rightTemple)*0.515);
    const ry = Math.max(28, g.ry || dist(g.crown,g.chin)*0.49);
    const c=Math.cos(g.angle),s=Math.sin(g.angle),ct=Math.cos(t),st=Math.sin(t);
    return { x:g.center.x+rx*ct*c-ry*st*s, y:g.center.y+rx*ct*s+ry*st*c };
  }

  function drawLoomi() {
    const g=state.guides; if(!g) return;
    const opacity=Number(els.opacity.value)/100;
    const width=Number(els.width.value)*(els.canvas.width/1000+0.45);
    const yaw=g.yaw||0;
    const learning = els.learning.checked;
    ctx.save();
    ctx.lineWidth=width; ctx.lineCap="round"; ctx.lineJoin="round";
    ctx.shadowColor="rgba(0,0,0,.42)"; ctx.shadowBlur=3;

    const drawStroke = (color, alpha=opacity) => {
      ctx.strokeStyle=color.replace("ALPHA", alpha.toFixed(3));
    };

    // 1. Cranium
    if(!learning || state.learningStep >= 0){
      drawStroke(`rgba(255,238,205,ALPHA)`);
      ctx.beginPath();
      for(let i=0;i<=120;i++){
        const p=ellipsePoint(g,i/120*Math.PI*2);
        if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
      }
      ctx.closePath(); ctx.stroke();
    }

    const dirX=Math.cos(g.angle),dirY=Math.sin(g.angle);
    const normalX=-dirY,normalY=dirX;
    const headHalf=dist(g.leftTemple,g.rightTemple)*.5;

    // 2. Brow line, intentionally near the cranium midpoint.
    if(!learning || state.learningStep >= 1){
      drawStroke(`rgba(255,159,67,ALPHA)`);
      const browMid={
        x:g.center.x + normalX*(g.pitch||0)*10 - yaw*headHalf*.02,
        y:g.center.y + normalY*(g.pitch||0)*10
      };
      const a={x:browMid.x-dirX*headHalf*.98,y:browMid.y-dirY*headHalf*.98};
      const b={x:browMid.x+dirX*headHalf*.98,y:browMid.y+dirY*headHalf*.98};
      const cp={x:browMid.x+normalX*yaw*headHalf*.055,y:browMid.y+normalY*yaw*headHalf*.055};
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(cp.x,cp.y,b.x,b.y);ctx.stroke();
    }

    // 3. Eye line, distinct and lower than the brow line.
    if(!learning || state.learningStep >= 2){
      drawStroke(`rgba(78,143,255,ALPHA)`);
      const eyeMid=g.eyeCenter;
      const a={x:eyeMid.x-dirX*headHalf*.92,y:eyeMid.y-dirY*headHalf*.92};
      const b={x:eyeMid.x+dirX*headHalf*.92,y:eyeMid.y+dirY*headHalf*.92};
      const cp={x:eyeMid.x+normalX*yaw*headHalf*.045,y:eyeMid.y+normalY*yaw*headHalf*.045};
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(cp.x,cp.y,b.x,b.y);ctx.stroke();
    }

    // 4. Central axis.
    if(!learning || state.learningStep >= 3){
      drawStroke(`rgba(255,222,54,ALPHA)`);
      const top=ellipsePoint(g,-Math.PI/2);
      const upperControl={
        x:g.center.x+yaw*(g.rx||80)*.18,
        y:g.center.y+(g.ry||100)*.18
      };
      ctx.beginPath(); ctx.moveTo(top.x,top.y);
      ctx.bezierCurveTo(upperControl.x,upperControl.y,g.nose.x,g.nose.y,g.chin.x,g.chin.y);
      ctx.stroke();
    }

    // 5. Side plane.
    if(!learning || state.learningStep >= 4){
      drawStroke(`rgba(171,110,255,ALPHA)`);
      const recedingRight = yaw < 0;
      const sideTemple = recedingRight ? g.rightTemple : g.leftTemple;
      const sideSign = recedingRight ? 1 : -1;
      const planeR = (g.rx||headHalf) * (0.34-0.07*Math.min(1,Math.abs(yaw)));
      const planeCenter={
        x:sideTemple.x-Math.cos(g.angle)*sideSign*planeR*.28,
        y:sideTemple.y-Math.sin(g.angle)*sideSign*planeR*.28
      };
      ctx.beginPath();
      ctx.ellipse(planeCenter.x,planeCenter.y,planeR*(0.55+Math.abs(yaw)*0.18),planeR,g.angle,0,Math.PI*2);
      ctx.stroke();
    }

    // 6. Jaw.
    if(!learning || state.learningStep >= 5){
      drawStroke(`rgba(205,133,63,ALPHA)`);
      const nearIsRight = yaw > 0;
      const nearJaw = nearIsRight ? g.rightJaw : g.leftJaw;
      const farJaw = nearIsRight ? g.leftJaw : g.rightJaw;
      const nearTemple = nearIsRight ? g.rightTemple : g.leftTemple;
      const farTemple = nearIsRight ? g.leftTemple : g.rightTemple;
      const nearCheek = nearIsRight ? g.rightCheek : g.leftCheek;
      const farCheek = nearIsRight ? g.leftCheek : g.rightCheek;
      ctx.beginPath();
      ctx.moveTo(farTemple.x,farTemple.y);
      ctx.quadraticCurveTo(farCheek.x+(g.chin.x-farCheek.x)*.12,farCheek.y,farJaw.x+(g.chin.x-farJaw.x)*.08,farJaw.y);
      ctx.quadraticCurveTo(g.chin.x-(nearIsRight?1:-1)*Math.abs(yaw)*8,g.chin.y-4,g.chin.x,g.chin.y);
      ctx.quadraticCurveTo(nearJaw.x+(g.chin.x-nearJaw.x)*.05,nearJaw.y,nearCheek.x,nearCheek.y);
      ctx.quadraticCurveTo(nearTemple.x,nearTemple.y,nearTemple.x,nearTemple.y);
      ctx.stroke();
    }

    // 7. Nose, mouth and chin construction lines.
    if(!learning || state.learningStep >= 6){
      const contours=[
        [g.nose,1,`rgba(91,207,184,ALPHA)`],
        [g.mouth,.82,`rgba(244,143,177,ALPHA)`],
        [{x:(g.mouth.x+g.chin.x)/2,y:(g.mouth.y+g.chin.y)/2},.72,`rgba(255,66,84,ALPHA)`]
      ];
      ctx.setLineDash([9*Number(els.width.value),7*Number(els.width.value)]);
      for(const [p,m,color] of contours){
        drawStroke(color,opacity*.78);
        const a={x:p.x-dirX*headHalf*.8*m,y:p.y-dirY*headHalf*.8*m};
        const b={x:p.x+dirX*headHalf*.8*m,y:p.y+dirY*headHalf*.8*m};
        const cp={x:p.x+normalX*headHalf*yaw*.045,y:p.y+normalY*headHalf*yaw*.045};
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(cp.x,cp.y,b.x,b.y);ctx.stroke();
      }
      ctx.setLineDash([]);
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
    const keys=["crown","center","leftTemple","rightTemple","chin","nose","mouth","eyeCenter"],r=handleRadius();
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
    for(const key of ["crown","center","leftTemple","rightTemple","chin","nose","mouth","eyeCenter"]){const d=dist(p,state.guides[key]);if(d<threshold&&d<bestD){best=key;bestD=d;}}
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
      g.rx=dist(g.leftTemple,g.rightTemple)*.515;
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
  els.learning.addEventListener("change",()=>{
    state.learningStep = els.learning.checked ? 2 : 6;
    setStatus(
      els.learning.checked
        ? "Mode apprentissage activé : le crâne, la ligne des sourcils et la ligne des yeux sont affichés en priorité."
        : "Mode apprentissage désactivé.",
      "success"
    );
    draw();
  });

  window.addEventListener("error",(e)=>log("Erreur JavaScript globale",`${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection",(e)=>log("Promesse rejetée",e.reason?.stack||e.reason));

  if("serviceWorker" in navigator){
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js?v=3.0.0").then(()=>log("Service worker enregistré")).catch((e)=>log("Service worker non enregistré",e.message)));
  }

  initAI();
})();
