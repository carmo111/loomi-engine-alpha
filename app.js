\
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
let currentObjectUrl = null;

// The UI and image import are registered BEFORE loading the AI.
// This guarantees that a photo can always be displayed.
photoInput.addEventListener("change", handlePhoto);
analyseBtn.addEventListener("click", analyse);
toggleGuidesBtn.addEventListener("click", () => {
  guidesVisible = !guidesVisible;
  toggleGuidesBtn.textContent = guidesVisible
    ? "Masquer les guides"
    : "Afficher les guides";
  render();
});
downloadBtn.addEventListener("click", () => {
  if (!image) return;
  const a = document.createElement("a");
  a.download = "loomi-construction.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
});
widthRange.addEventListener("input", render);
opacityRange.addEventListener("input", render);

async function initAI() {
  try {
    const visionModule = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs"
    );

    const { FaceLandmarker, FilesetResolver } = visionModule;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
      },
      runningMode: "IMAGE",
      numFaces: 1,
      outputFacialTransformationMatrixes: true
    });

    engineStatus.textContent = "IA prête";
    engineStatus.style.background = "#1f6d52";
    analyseBtn.disabled = !image;

    if (image) {
      await analyse();
    }
  } catch (error) {
    console.error("Chargement IA impossible :", error);
    engineStatus.textContent = "Photo prête · IA indisponible";
    engineStatus.style.background = "#8a5a24";
    resultLabel.textContent = image ? "Photo affichée" : "IA non chargée";
  }
}

async function handlePhoto(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    resultLabel.textContent = "Fichier non reconnu";
    return;
  }

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  currentObjectUrl = URL.createObjectURL(file);
  const img = new Image();

  img.onload = async () => {
    image = img;
    landmarks = null;
    welcome.classList.add("hidden");
    resizeCanvasForImage();
    render();

    resultLabel.textContent = "Photo affichée";
    analyseBtn.disabled = !faceLandmarker;
    toggleGuidesBtn.disabled = true;
    downloadBtn.disabled = false;

    if (faceLandmarker) {
      await analyse();
    }
  };

  img.onerror = () => {
    resultLabel.textContent = "Impossible d’ouvrir cette photo";
  };

  img.src = currentObjectUrl;
}

async function analyse() {
  if (!image) return;

  if (!faceLandmarker) {
    resultLabel.textContent = "Photo affichée · IA en chargement";
    return;
  }

  loading.classList.remove("hidden");
  resultLabel.textContent = "Analyse…";

  await new Promise(resolve => setTimeout(resolve, 80));

  try {
    const result = faceLandmarker.detect(image);

    if (!result.faceLandmarks || !result.faceLandmarks.length) {
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
  } catch (error) {
    console.error("Analyse impossible :", error);
    resultLabel.textContent = "Photo affichée · analyse impossible";
    landmarks = null;
    render();
  } finally {
    loading.classList.add("hidden");
  }
}

function resizeCanvasForImage() {
  const maxSide = 1400;
  const scale = Math.min(
    1,
    maxSide / Math.max(image.naturalWidth, image.naturalHeight)
  );

  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
}

function point(index) {
  const p = landmarks[index];
  return {
    x: p.x * canvas.width,
    y: p.y * canvas.height,
    z: p.z
  };
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (image) {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  if (landmarks && guidesVisible) {
    drawLoomi();
  }
}

function drawLoomi() {
  const leftEye = midpoint(point(33), point(133));
  const rightEye = midpoint(point(362), point(263));
  const nose = point(1);
  const chin = point(152);
  const forehead = point(10);
  const leftTemple = point(234);
  const rightTemple = point(454);
  const leftJaw = point(172);
  const rightJaw = point(397);

  const eyeMid = midpoint(leftEye, rightEye);
  const faceCenter = midpoint(forehead, chin);
  const eyeAngle = Math.atan2(
    rightEye.y - leftEye.y,
    rightEye.x - leftEye.x
  );
  const faceWidth = distance(leftTemple, rightTemple);
  const faceHeight = distance(forehead, chin);

  const skullCenter = {
    x: faceCenter.x + (forehead.x - chin.x) * 0.12,
    y: faceCenter.y + (forehead.y - chin.y) * 0.12
  };

  const radiusX = faceWidth * 0.61;
  const radiusY = faceHeight * 0.54;

  ctx.save();
  ctx.strokeStyle =
    `rgba(35,201,239,${Number(opacityRange.value) / 100})`;
  ctx.lineWidth = Number(widthRange.value);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.save();
  ctx.translate(skullCenter.x, skullCenter.y);
  ctx.rotate(eyeAngle);
  ctx.beginPath();
  ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  extendLine(leftEye, rightEye, 0.22);

  ctx.beginPath();
  ctx.moveTo(forehead.x, forehead.y - faceHeight * 0.12);
  ctx.quadraticCurveTo(nose.x, eyeMid.y, nose.x, chin.y);
  ctx.stroke();

  const noseHalf = faceWidth * 0.42;
  const nx = Math.cos(eyeAngle) * noseHalf;
  const ny = Math.sin(eyeAngle) * noseHalf;

  ctx.beginPath();
  ctx.moveTo(nose.x - nx, nose.y - ny);
  ctx.quadraticCurveTo(
    nose.x,
    nose.y + faceHeight * 0.018,
    nose.x + nx,
    nose.y + ny
  );
  ctx.stroke();

  const noseOffset = nose.x - eyeMid.x;
  const sideCenter = noseOffset >= 0 ? rightTemple : leftTemple;

  ctx.save();
  ctx.translate(sideCenter.x, sideCenter.y);
  ctx.rotate(eyeAngle);
  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    faceWidth * 0.17,
    faceHeight * 0.31,
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(leftTemple.x, leftTemple.y);
  ctx.quadraticCurveTo(leftJaw.x, leftJaw.y, chin.x, chin.y);
  ctx.quadraticCurveTo(rightJaw.x, rightJaw.y, rightTemple.x, rightTemple.y);
  ctx.stroke();

  const browLeft = point(70);
  const browRight = point(300);

  ctx.beginPath();
  ctx.moveTo(browLeft.x, browLeft.y);
  ctx.quadraticCurveTo(
    nose.x,
    eyeMid.y - faceHeight * 0.10,
    browRight.x,
    browRight.y
  );
  ctx.stroke();

  ctx.restore();
}

function extendLine(a, b, factor) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  ctx.beginPath();
  ctx.moveTo(a.x - dx * factor, a.y - dy * factor);
  ctx.lineTo(b.x + dx * factor, b.y + dy * factor);
  ctx.stroke();
}

initAI();
