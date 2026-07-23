\
import {
  FaceLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const photoInput = document.getElementById("photoInput");
const welcome = document.getElementById("welcome");
const loading = document.getElementById("loading");
const engineStatus = document.getElementById("engineStatus");
const resultLabel = document.getElementById("resultLabel");
const analyseBtn = document.getElementById("analyseBtn");
const toggleGuidesBtn = document.getElementById("toggleGuidesBtn");
const downloadBtn = document.getElementById("downloadBtn");
const widthRange = document.getElementById("widthRange");
const opacityRange = document.getElementById("opacityRange");

let faceLandmarker = null;
let image = null;
let landmarks = null;
let guidesVisible = true;
let drawBox = null;

async function initAI(){
  try{
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(vision,{
      baseOptions:{
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate:"GPU"
      },
      runningMode:"IMAGE",
      numFaces:1,
      outputFacialTransformationMatrixes:true
    });
    engineStatus.textContent = "IA prête";
    engineStatus.style.background = "#1f6d52";
    analyseBtn.disabled = !image;
  }catch(err){
    console.error(err);
    engineStatus.textContent = "IA indisponible";
    engineStatus.style.background = "#913c32";
    resultLabel.textContent = "Erreur de chargement";
  }
}
initAI();

photoInput.addEventListener("change", async (event)=>{
  const file = event.target.files?.[0];
  if(!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async ()=>{
    image = img;
    landmarks = null;
    welcome.classList.add("hidden");
    resizeCanvasForImage();
    render();
    analyseBtn.disabled = !faceLandmarker;
    toggleGuidesBtn.disabled = true;
    downloadBtn.disabled = true;
    resultLabel.textContent = "Photo chargée";
    URL.revokeObjectURL(url);
    if(faceLandmarker) await analyse();
  };
  img.src = url;
});

analyseBtn.addEventListener("click", analyse);
toggleGuidesBtn.addEventListener("click", ()=>{
  guidesVisible = !guidesVisible;
  toggleGuidesBtn.textContent = guidesVisible ? "Masquer les guides" : "Afficher les guides";
  render();
});
downloadBtn.addEventListener("click", ()=>{
  const a = document.createElement("a");
  a.download = "loomi-construction.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
});
widthRange.addEventListener("input", render);
opacityRange.addEventListener("input", render);

async function analyse(){
  if(!image || !faceLandmarker) return;
  loading.classList.remove("hidden");
  resultLabel.textContent = "Analyse…";
  await new Promise(r=>setTimeout(r,80));
  try{
    const result = faceLandmarker.detect(image);
    if(!result.faceLandmarks?.length){
      landmarks = null;
      resultLabel.textContent = "Aucun visage détecté";
      render();
      return;
    }
    landmarks = result.faceLandmarks[0];
    resultLabel.textContent = "Visage détecté";
    toggleGuidesBtn.disabled = false;
    downloadBtn.disabled = false;
    render();
  }catch(err){
    console.error(err);
    resultLabel.textContent = "Analyse impossible";
  }finally{
    loading.classList.add("hidden");
  }
}

function resizeCanvasForImage(){
  const maxSide = 1400;
  const scale = Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
  canvas.width = Math.round(image.naturalWidth*scale);
  canvas.height = Math.round(image.naturalHeight*scale);
  drawBox = {x:0,y:0,w:canvas.width,h:canvas.height};
}

function pt(i){
  const p = landmarks[i];
  return {x:p.x*canvas.width,y:p.y*canvas.height,z:p.z};
}
function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function rotateAround(p,c,a){
  const s=Math.sin(a),co=Math.cos(a),dx=p.x-c.x,dy=p.y-c.y;
  return{x:c.x+dx*co-dy*s,y:c.y+dx*s+dy*co};
}

function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(image) ctx.drawImage(image,0,0,canvas.width,canvas.height);
  if(landmarks && guidesVisible) drawLoomi();
}

function drawLoomi(){
  const leftEye = midpoint(pt(33),pt(133));
  const rightEye = midpoint(pt(362),pt(263));
  const nose = pt(1);
  const chin = pt(152);
  const forehead = pt(10);
  const leftTemple = pt(234);
  const rightTemple = pt(454);
  const leftJaw = pt(172);
  const rightJaw = pt(397);

  const eyeMid = midpoint(leftEye,rightEye);
  const faceCenter = midpoint(forehead,chin);
  const eyeAngle = Math.atan2(rightEye.y-leftEye.y,rightEye.x-leftEye.x);
  const faceWidth = dist(leftTemple,rightTemple);
  const faceHeight = dist(forehead,chin);
  const skullCenter = {
    x: faceCenter.x + (forehead.x-chin.x)*0.12,
    y: faceCenter.y + (forehead.y-chin.y)*0.12
  };
  const rx = faceWidth*0.61;
  const ry = faceHeight*0.54;

  ctx.save();
  ctx.strokeStyle = `rgba(35,201,239,${Number(opacityRange.value)/100})`;
  ctx.lineWidth = Number(widthRange.value);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Crâne incliné
  ctx.save();
  ctx.translate(skullCenter.x,skullCenter.y);
  ctx.rotate(eyeAngle);
  ctx.beginPath();
  ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);
  ctx.stroke();
  ctx.restore();

  // Ligne des yeux
  extendLine(leftEye,rightEye,0.22);

  // Axe courbe
  ctx.beginPath();
  ctx.moveTo(forehead.x,forehead.y-faceHeight*0.12);
  ctx.quadraticCurveTo(nose.x,eyeMid.y,nose.x,chin.y);
  ctx.stroke();

  // Ligne du nez
  const noseHalf = faceWidth*0.42;
  const nx = Math.cos(eyeAngle)*noseHalf;
  const ny = Math.sin(eyeAngle)*noseHalf;
  ctx.beginPath();
  ctx.moveTo(nose.x-nx,nose.y-ny);
  ctx.quadraticCurveTo(nose.x,nose.y+faceHeight*0.018,nose.x+nx,nose.y+ny);
  ctx.stroke();

  // Plan latéral du côté le plus visible
  const noseOffset = nose.x-eyeMid.x;
  const sideCenter = noseOffset >= 0 ? rightTemple : leftTemple;
  ctx.save();
  ctx.translate(sideCenter.x,sideCenter.y);
  ctx.rotate(eyeAngle);
  ctx.beginPath();
  ctx.ellipse(0,0,faceWidth*0.17,faceHeight*0.31,0,0,Math.PI*2);
  ctx.stroke();
  ctx.restore();

  // Mâchoire
  ctx.beginPath();
  ctx.moveTo(leftTemple.x,leftTemple.y);
  ctx.quadraticCurveTo(leftJaw.x,leftJaw.y,chin.x,chin.y);
  ctx.quadraticCurveTo(rightJaw.x,rightJaw.y,rightTemple.x,rightTemple.y);
  ctx.stroke();

  // Arc frontal / sourcils
  const browL=pt(70), browR=pt(300);
  ctx.beginPath();
  ctx.moveTo(browL.x,browL.y);
  ctx.quadraticCurveTo(nose.x,eyeMid.y-faceHeight*0.10,browR.x,browR.y);
  ctx.stroke();

  ctx.restore();
}

function extendLine(a,b,factor){
  const dx=b.x-a.x,dy=b.y-a.y;
  ctx.beginPath();
  ctx.moveTo(a.x-dx*factor,a.y-dy*factor);
  ctx.lineTo(b.x+dx*factor,b.y+dy*factor);
  ctx.stroke();
}
