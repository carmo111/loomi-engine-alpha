(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const empty = document.getElementById('empty');
  const floating = document.getElementById('floating');
  const instruction = document.getElementById('instruction');
  const statusBadge = document.getElementById('statusBadge');
  const modeTitle = document.getElementById('modeTitle');
  const startBtn = document.getElementById('startBtn');
  const undoPointBtn = document.getElementById('undoPointBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const editBtn = document.getElementById('editBtn');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const hideHandlesBtn = document.getElementById('hideHandlesBtn');
  const editActions = document.getElementById('editActions');
  const settings = document.getElementById('settings');
  const widthRange = document.getElementById('widthRange');
  const opacityRange = document.getElementById('opacityRange');
  const photoInput = document.getElementById('photoInput');
  const stepDots = document.getElementById('stepDots');

  const pointLabels = [
    'Touchez le centre de l’œil gauche de la photo',
    'Touchez le centre de l’œil droit de la photo',
    'Touchez la base du nez',
    'Touchez le bas du menton',
    'Touchez la tempe gauche',
    'Touchez la tempe droite'
  ];

  let img = new Image();
  let hasImage = false;
  let mode = 'idle';
  let guidePoints = [];
  let model = null;
  let originalModel = null;
  let showHandles = true;
  let activeHandle = null;
  let imageRect = {x:0,y:0,w:canvas.width,h:canvas.height};

  function deepCopy(o){ return JSON.parse(JSON.stringify(o)); }

  function fitCanvasToImage(image){
    const maxW = 1100;
    const ratio = image.naturalHeight / image.naturalWidth;
    canvas.width = maxW;
    canvas.height = Math.round(maxW * ratio);
    imageRect = {x:0,y:0,w:canvas.width,h:canvas.height};
  }

  function drawImage(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(hasImage) ctx.drawImage(img, imageRect.x,imageRect.y,imageRect.w,imageRect.h);
  }

  function lineStyle(){
    ctx.strokeStyle = `rgba(35,199,243,${Number(opacityRange.value)/100})`;
    ctx.lineWidth = Number(widthRange.value) * (canvas.width/900);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function rotatePoint(p,c,a){
    const dx=p.x-c.x, dy=p.y-c.y, ca=Math.cos(a), sa=Math.sin(a);
    return {x:c.x+dx*ca-dy*sa, y:c.y+dx*sa+dy*ca};
  }

  function localToWorld(lx,ly,m=model){
    return rotatePoint({x:m.center.x+lx,y:m.center.y+ly},m.center,m.angle);
  }

  function drawEllipse(cx,cy,rx,ry,angle){
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle);
    ctx.beginPath(); ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2); ctx.stroke(); ctx.restore();
  }

  function drawCurve(points){
    if(points.length<2) return;
    ctx.beginPath(); ctx.moveTo(points[0].x,points[0].y);
    if(points.length===2){ctx.lineTo(points[1].x,points[1].y)}
    else{
      for(let i=1;i<points.length-1;i++){
        const mx=(points[i].x+points[i+1].x)/2;
        const my=(points[i].y+points[i+1].y)/2;
        ctx.quadraticCurveTo(points[i].x,points[i].y,mx,my);
      }
      const n=points.length;
      ctx.quadraticCurveTo(points[n-2].x,points[n-2].y,points[n-1].x,points[n-1].y);
    }
    ctx.stroke();
  }

  function computeModel(p){
    const [eyeL,eyeR,nose,chin,templeL,templeR]=p;
    const eyeMid={x:(eyeL.x+eyeR.x)/2,y:(eyeL.y+eyeR.y)/2};
    const templeMid={x:(templeL.x+templeR.x)/2,y:(templeL.y+templeR.y)/2};
    const angle=Math.atan2(eyeR.y-eyeL.y,eyeR.x-eyeL.x);
    const eyeDist=Math.hypot(eyeR.x-eyeL.x,eyeR.y-eyeL.y);
    const templeDist=Math.hypot(templeR.x-templeL.x,templeR.y-templeL.y);
    const faceW=Math.max(eyeDist*2.0, templeDist*1.04);
    const eyeToChin=Math.hypot(chin.x-eyeMid.x,chin.y-eyeMid.y);
    const rx=faceW*0.53;
    const ry=Math.max(rx*1.14, eyeToChin*0.83);
    const center={
      x: templeMid.x - Math.sin(angle)*ry*0.12,
      y: templeMid.y - Math.cos(angle)*ry*0.19
    };

    const noseOffset = ((nose.x-eyeMid.x)*Math.cos(angle)+(nose.y-eyeMid.y)*Math.sin(angle));
    const yaw = Math.max(-0.72,Math.min(0.72,noseOffset/(eyeDist*0.52)));
    const side = yaw>=0 ? 1 : -1;
    const sideCx = side*rx*(0.48+Math.abs(yaw)*0.13);
    const sideRx = rx*(0.25-Math.abs(yaw)*0.05);
    const sideRy = ry*0.48;

    return {
      center,rx,ry,angle,yaw,
      browY:(eyeMid.y-center.y)*Math.cos(angle)-(eyeMid.x-center.x)*Math.sin(angle)-ry*0.08,
      eyeY:(eyeMid.y-center.y)*Math.cos(angle)-(eyeMid.x-center.x)*Math.sin(angle),
      noseY:(nose.y-center.y)*Math.cos(angle)-(nose.x-center.x)*Math.sin(angle),
      chinY:(chin.y-center.y)*Math.cos(angle)-(chin.x-center.x)*Math.sin(angle),
      sideCx,sideRx,sideRy,
      jawL:{x:-rx*.78,y:ry*.49},
      jawR:{x: rx*.78,y:ry*.49},
      chin:{x:((chin.x-center.x)*Math.cos(angle)+(chin.y-center.y)*Math.sin(angle)),y:((chin.y-center.y)*Math.cos(angle)-(chin.x-center.x)*Math.sin(angle))},
      axisTop:{x:-yaw*rx*.14,y:-ry*.95},
      axisMid:{x:-yaw*rx*.06,y:0},
      axisBottom:{x:((chin.x-center.x)*Math.cos(angle)+(chin.y-center.y)*Math.sin(angle)),y:((chin.y-center.y)*Math.cos(angle)-(chin.x-center.x)*Math.sin(angle))}
    };
  }

  function drawGuides(){
    if(!model) return;
    lineStyle();
    drawEllipse(model.center.x,model.center.y,model.rx,model.ry,model.angle);

    const browL=localToWorld(-model.rx*.96,model.browY);
    const browR=localToWorld(model.rx*.96,model.browY);
    ctx.beginPath(); ctx.moveTo(browL.x,browL.y); ctx.lineTo(browR.x,browR.y); ctx.stroke();

    const axis=[localToWorld(model.axisTop.x,model.axisTop.y),localToWorld(model.axisMid.x,model.axisMid.y),localToWorld(model.axisBottom.x,model.axisBottom.y)];
    drawCurve(axis);

    const sideCenter=localToWorld(model.sideCx,0);
    drawEllipse(sideCenter.x,sideCenter.y,model.sideRx,model.sideRy,model.angle);

    const topJawL=localToWorld(-model.rx*.79,model.ry*.38);
    const topJawR=localToWorld(model.rx*.79,model.ry*.38);
    const jawL=localToWorld(model.jawL.x,model.jawL.y);
    const jawR=localToWorld(model.jawR.x,model.jawR.y);
    const chin=localToWorld(model.chin.x,model.chin.y);
    drawCurve([topJawL,jawL,chin]);
    drawCurve([topJawR,jawR,chin]);

    const noseL=localToWorld(-model.rx*.55,model.noseY);
    const noseR=localToWorld(model.rx*.55,model.noseY);
    ctx.save(); ctx.globalAlpha=.55;
    ctx.beginPath();ctx.moveTo(noseL.x,noseL.y);ctx.lineTo(noseR.x,noseR.y);ctx.stroke();ctx.restore();

    if(showHandles && mode==='edit') drawHandles();
  }

  function handles(){
    return [
      {id:'center',...model.center},
      {id:'scaleX',...localToWorld(model.rx,0)},
      {id:'scaleY',...localToWorld(0,-model.ry)},
      {id:'rotate',...localToWorld(0,-model.ry-70*(canvas.width/900))},
      {id:'axisMid',...localToWorld(model.axisMid.x,model.axisMid.y)},
      {id:'jawL',...localToWorld(model.jawL.x,model.jawL.y)},
      {id:'jawR',...localToWorld(model.jawR.x,model.jawR.y)},
      {id:'chin',...localToWorld(model.chin.x,model.chin.y)},
      {id:'side',...localToWorld(model.sideCx,0)}
    ];
  }

  function drawHandles(){
    const scale=canvas.width/900;
    for(const h of handles()){
      ctx.beginPath();
      ctx.fillStyle=h.id==='rotate' ? '#f1cb59' : '#fff';
      ctx.strokeStyle='#222';
      ctx.lineWidth=2*scale;
      ctx.arc(h.x,h.y,9*scale,0,Math.PI*2);
      ctx.fill();ctx.stroke();
    }
  }

  function render(){
    drawImage();
    if(mode==='placing'){
      const scale=canvas.width/900;
      guidePoints.forEach((p,i)=>{
        ctx.beginPath();ctx.fillStyle=i===guidePoints.length-1?'#f1cb59':'#fff';
        ctx.strokeStyle='#222';ctx.lineWidth=2*scale;ctx.arc(p.x,p.y,9*scale,0,Math.PI*2);ctx.fill();ctx.stroke();
      });
    }
    if(model && (mode==='result'||mode==='edit')) drawGuides();
  }

  function canvasPoint(ev){
    const r=canvas.getBoundingClientRect();
    return {x:(ev.clientX-r.left)*canvas.width/r.width,y:(ev.clientY-r.top)*canvas.height/r.height};
  }

  function updateDots(){
    stepDots.innerHTML='';
    for(let i=0;i<6;i++){
      const d=document.createElement('span');d.className='dot';
      if(i<guidePoints.length)d.classList.add('done');
      if(i===guidePoints.length && mode==='placing')d.classList.add('current');
      stepDots.appendChild(d);
    }
  }

  function setPlacingUI(){
    mode='placing';guidePoints=[];model=null;
    floating.classList.remove('hidden');stepDots.classList.remove('hidden');
    instruction.textContent=pointLabels[0];
    statusBadge.textContent='Analyse guidée en cours';
    modeTitle.textContent='Pose les 6 repères';
    startBtn.classList.add('hidden');
    undoPointBtn.classList.remove('hidden');cancelBtn.classList.remove('hidden');
    editBtn.classList.add('hidden');saveBtn.classList.add('hidden');
    editActions.classList.add('hidden');settings.classList.add('hidden');
    updateDots();render();
  }

  function finishAnalysis(){
    model=computeModel(guidePoints); originalModel=deepCopy(model); mode='result';
    floating.classList.remove('hidden');
    instruction.textContent='Construction générée. Tu peux maintenant l’ajuster.';
    statusBadge.textContent='Construction générée';
    modeTitle.textContent='Résultat Loomi';
    undoPointBtn.classList.add('hidden');cancelBtn.classList.add('hidden');
    editBtn.classList.remove('hidden');saveBtn.classList.remove('hidden');
    startBtn.classList.add('hidden');stepDots.classList.add('hidden');
    settings.classList.remove('hidden');
    render();
  }

  canvas.addEventListener('pointerdown',ev=>{
    const p=canvasPoint(ev);
    if(mode==='placing'){
      guidePoints.push(p); updateDots();
      if(guidePoints.length<6) instruction.textContent=pointLabels[guidePoints.length];
      else finishAnalysis();
      render(); return;
    }
    if(mode==='edit'){
      const threshold=32*(canvas.width/900);
      activeHandle=handles().find(h=>Math.hypot(h.x-p.x,h.y-p.y)<threshold)?.id||null;
      if(activeHandle) canvas.setPointerCapture(ev.pointerId);
    }
  });

  canvas.addEventListener('pointermove',ev=>{
    if(mode!=='edit'||!activeHandle||!model)return;
    const p=canvasPoint(ev);
    const dx=p.x-model.center.x,dy=p.y-model.center.y;
    const ca=Math.cos(-model.angle),sa=Math.sin(-model.angle);
    const lx=dx*ca-dy*sa,ly=dx*sa+dy*ca;
    if(activeHandle==='center'){model.center=p}
    else if(activeHandle==='scaleX'){model.rx=Math.max(70,Math.abs(lx))}
    else if(activeHandle==='scaleY'){model.ry=Math.max(90,Math.abs(ly))}
    else if(activeHandle==='rotate'){model.angle=Math.atan2(p.y-model.center.y,p.x-model.center.x)+Math.PI/2}
    else if(activeHandle==='axisMid'){model.axisMid={x:lx,y:ly}}
    else if(activeHandle==='jawL'){model.jawL={x:lx,y:ly}}
    else if(activeHandle==='jawR'){model.jawR={x:lx,y:ly}}
    else if(activeHandle==='chin'){model.chin={x:lx,y:ly};model.axisBottom={x:lx,y:ly}}
    else if(activeHandle==='side'){model.sideCx=lx}
    render();
  });
  canvas.addEventListener('pointerup',()=>activeHandle=null);
  canvas.addEventListener('pointercancel',()=>activeHandle=null);

  photoInput.addEventListener('change',e=>{
    const f=e.target.files?.[0]; if(!f)return;
    const url=URL.createObjectURL(f);
    img.onload=()=>{
      fitCanvasToImage(img);hasImage=true;empty.classList.add('hidden');
      mode='idle';guidePoints=[];model=null;originalModel=null;
      startBtn.disabled=false;startBtn.classList.remove('hidden');
      floating.classList.add('hidden');stepDots.classList.add('hidden');
      editBtn.classList.add('hidden');saveBtn.classList.add('hidden');
      editActions.classList.add('hidden');settings.classList.add('hidden');
      statusBadge.textContent='Photo chargée';
      modeTitle.textContent='Prêt pour l’analyse';
      render();URL.revokeObjectURL(url);
    };
    img.src=url;
  });

  startBtn.addEventListener('click',setPlacingUI);
  undoPointBtn.addEventListener('click',()=>{
    if(guidePoints.length){guidePoints.pop();instruction.textContent=pointLabels[guidePoints.length];updateDots();render();}
  });
  cancelBtn.addEventListener('click',()=>{
    mode='idle';guidePoints=[];model=null;floating.classList.add('hidden');stepDots.classList.add('hidden');
    startBtn.classList.remove('hidden');undoPointBtn.classList.add('hidden');cancelBtn.classList.add('hidden');
    statusBadge.textContent='Analyse annulée';modeTitle.textContent='Prêt pour l’analyse';render();
  });
  editBtn.addEventListener('click',()=>{
    mode='edit';floating.classList.add('hidden');editBtn.classList.add('hidden');
    editActions.classList.remove('hidden');statusBadge.textContent='Mode ajustement';
    modeTitle.textContent='Déplace les poignées';render();
  });
  resetBtn.addEventListener('click',()=>{if(originalModel){model=deepCopy(originalModel);render();}});
  hideHandlesBtn.addEventListener('click',()=>{
    showHandles=!showHandles;hideHandlesBtn.textContent=showHandles?'Masquer les poignées':'Afficher les poignées';render();
  });
  widthRange.addEventListener('input',render);
  opacityRange.addEventListener('input',render);
  saveBtn.addEventListener('click',()=>{
    const oldMode=mode,oldHandles=showHandles;showHandles=false;mode='result';render();
    const a=document.createElement('a');a.download='loomi-construction.png';a.href=canvas.toDataURL('image/png');a.click();
    mode=oldMode;showHandles=oldHandles;render();
  });

  drawImage();
})();