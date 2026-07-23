(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const input = $("photoInput");
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const stage = $("stage");
  const emptyState = $("emptyState");
  const statusEl = $("status");
  const loader = $("loader");
  const badge = $("aiBadge");
  const detectButton = $("detectButton");
  const resetButton = $("resetButton");
  const exportButton = $("exportButton");
  const opacityRange = $("opacityRange");
  const widthRange = $("widthRange");
  const showLandmarks = $("showLandmarks");
  const showHandles = $("showHandles");

  const state = {
    image: null,
    fileName: "loomi-portrait",
    faceLandmarker: null,
    aiReady: false,
    aiLoading: false,
    landmarks: null,
    originalGuides: null,
    guides: null,
    dragging: null,
    pointerId: null
  };

  const MEDIAPIPE_VERSION = "0.10.22";
  const MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm`;
  const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
  const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

  function setStatus(message, type = "") {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`.trim();
  }

  function setBadge(text, type) {
    badge.textContent = text;
    badge.className = `badge badge-${type}`;
  }

  async function loadAI() {
    if (state.aiReady || state.aiLoading) return;
    state.aiLoading = true;
    setBadge("Chargement IA…", "loading");

    try {
      const visionModule = await import(MODULE_URL);
      const { FaceLandmarker, FilesetResolver } = visionModule;
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);

      state.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "CPU"
        },
        runningMode: "IMAGE",
        numFaces: 1,
        minFaceDetectionConfidence: 0.45,
        minFacePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
        outputFacialTransformationMatrixes: true
      });

      state.aiReady = true;
      setBadge("IA prête", "ready");
      if (state.image) {
        setStatus("Photo chargée. L’IA est prête : détection automatique en cours…");
        await detectFace();
      } else {
        setStatus("IA prête. Choisis maintenant une photo.", "success");
      }
    } catch (error) {
      console.error("Loomi AI loading error:", error);
      setBadge("IA indisponible", "error");
      setStatus(
        "La photo peut toujours s’afficher, mais le module IA n’a pas pu se charger. Vérifie la connexion Internet, puis recharge la page.",
        "error"
      );
    } finally {
      state.aiLoading = false;
    }
  }

  function fitCanvasToImage(img) {
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
  }

  function loadPhoto(file) {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("Ce fichier n’est pas une image compatible.", "error");
      return;
    }

    state.fileName = file.name.replace(/\.[^.]+$/, "") || "loomi-portrait";
    const reader = new FileReader();

    reader.onerror = () => setStatus("Impossible de lire cette photo.", "error");
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        state.image = img;
        state.landmarks = null;
        state.guides = null;
        state.originalGuides = null;
        fitCanvasToImage(img);
        stage.classList.remove("empty");
        emptyState.classList.add("hidden");
        detectButton.disabled = false;
        resetButton.disabled = false;
        exportButton.disabled = false;
        draw();
        setStatus("Photo chargée correctement. Préparation de la détection…", "success");

        if (state.aiReady) {
          await detectFace();
        } else {
          loadAI();
        }
      };
      img.onerror = () => setStatus("Le navigateur n’arrive pas à décoder cette image.", "error");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function px(lm) {
    return { x: lm.x * canvas.width, y: lm.y * canvas.height, z: lm.z || 0 };
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointAt(center, angle, rx, ry, t) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const ct = Math.cos(t), st = Math.sin(t);
    return {
      x: center.x + rx * ct * c - ry * st * s,
      y: center.y + rx * ct * s + ry * st * c
    };
  }

  function buildGuides(landmarks) {
    // Stable MediaPipe landmark anchors.
    const leftEyeOuter = px(landmarks[33]);
    const rightEyeOuter = px(landmarks[263]);
    const leftTempleFace = px(landmarks[234]);
    const rightTempleFace = px(landmarks[454]);
    const forehead = px(landmarks[10]);
    const chin = px(landmarks[152]);
    const nose = px(landmarks[1]);
    const mouth = px(landmarks[13]);
    const eyeCenter = midpoint(leftEyeOuter, rightEyeOuter);

    const angle = Math.atan2(
      rightEyeOuter.y - leftEyeOuter.y,
      rightEyeOuter.x - leftEyeOuter.x
    );

    const faceWidth = distance(leftTempleFace, rightTempleFace);
    const faceHeight = distance(forehead, chin);
    const center = {
      x: eyeCenter.x + (chin.x - forehead.x) * 0.05,
      y: eyeCenter.y - faceHeight * 0.14
    };

    const rx = faceWidth * 0.57;
    const ry = Math.max(faceHeight * 0.48, rx * 1.02);
    const crown = pointAt(center, angle, rx, ry, -Math.PI / 2);

    return {
      center,
      crown,
      chin: { ...chin },
      leftTemple: { ...leftTempleFace },
      rightTemple: { ...rightTempleFace },
      nose: { ...nose },
      mouth: { ...mouth },
      eyeCenter,
      angle,
      rx,
      ry
    };
  }

  async function detectFace() {
    if (!state.image) return;
    if (!state.aiReady || !state.faceLandmarker) {
      setStatus("L’IA n’est pas encore prête. Attends quelques secondes puis appuie à nouveau.", "error");
      loadAI();
      return;
    }

    loader.classList.remove("hidden");
    detectButton.disabled = true;
    setStatus("Analyse du visage en cours…");

    try {
      // Let the loader paint before synchronous inference.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 20)));
      const result = state.faceLandmarker.detect(state.image);

      if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
        state.landmarks = null;
        state.guides = null;
        setStatus(
          "Aucun visage détecté. Essaie une photo plus nette, moins sombre et avec le visage davantage visible.",
          "error"
        );
        draw();
        return;
      }

      state.landmarks = result.faceLandmarks[0];
      state.guides = buildGuides(state.landmarks);
      state.originalGuides = JSON.parse(JSON.stringify(state.guides));
      setStatus(
        "Visage détecté et construction Loomi créée. Tu peux déplacer les poignées pour la corriger.",
        "success"
      );
      draw();
    } catch (error) {
      console.error("Loomi detection error:", error);
      setStatus(
        "La photo est bien chargée, mais l’analyse IA a rencontré une erreur. Recharge la page et réessaie.",
        "error"
      );
    } finally {
      loader.classList.add("hidden");
      detectButton.disabled = false;
    }
  }

  function drawImage() {
    if (!state.image) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);
  }

  function ellipsePoint(g, t) {
    const center = g.center;
    const rx = Math.max(20, distance(g.leftTemple, g.rightTemple) * 0.57);
    const faceH = distance(g.crown, g.chin);
    const ry = Math.max(24, faceH * 0.53);
    return pointAt(center, g.angle, rx, ry, t);
  }

  function traceEllipse(g) {
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      const p = ellipsePoint(g, t);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  function drawLoomi() {
    const g = state.guides;
    if (!g) return;

    const opacity = Number(opacityRange.value) / 100;
    const width = Number(widthRange.value);
    ctx.save();
    ctx.strokeStyle = `rgba(255, 232, 184, ${opacity})`;
    ctx.fillStyle = `rgba(255, 232, 184, ${opacity})`;
    ctx.lineWidth = width * (canvas.width / 1000 + 0.45);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 3;

    // Main cranium.
    traceEllipse(g);

    // Brow/eye axis.
    ctx.beginPath();
    ctx.moveTo(g.leftTemple.x, g.leftTemple.y);
    ctx.quadraticCurveTo(g.eyeCenter.x, g.eyeCenter.y, g.rightTemple.x, g.rightTemple.y);
    ctx.stroke();

    // Central facial axis.
    const top = ellipsePoint(g, -Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.bezierCurveTo(
      g.center.x, g.center.y,
      g.nose.x, g.nose.y,
      g.chin.x, g.chin.y
    );
    ctx.stroke();

    // Side plane, placed on the side toward which the nose is shifted.
    const eyeMid = g.eyeCenter;
    const sideSign = (g.nose.x - eyeMid.x) >= 0 ? 1 : -1;
    const sideTemple = sideSign > 0 ? g.rightTemple : g.leftTemple;
    const planeCenter = {
      x: sideTemple.x - Math.cos(g.angle) * sideSign * distance(g.leftTemple, g.rightTemple) * .055,
      y: sideTemple.y - Math.sin(g.angle) * sideSign * distance(g.leftTemple, g.rightTemple) * .055
    };
    const planeR = distance(g.leftTemple, g.rightTemple) * .155;
    ctx.beginPath();
    ctx.ellipse(planeCenter.x, planeCenter.y, planeR * .7, planeR, g.angle, 0, Math.PI * 2);
    ctx.stroke();

    // Jaw construction.
    const jawLeft = {
      x: g.leftTemple.x + (g.chin.x - g.leftTemple.x) * .62,
      y: g.leftTemple.y + (g.chin.y - g.leftTemple.y) * .68
    };
    const jawRight = {
      x: g.rightTemple.x + (g.chin.x - g.rightTemple.x) * .62,
      y: g.rightTemple.y + (g.chin.y - g.rightTemple.y) * .68
    };
    ctx.beginPath();
    ctx.moveTo(g.leftTemple.x, g.leftTemple.y);
    ctx.lineTo(jawLeft.x, jawLeft.y);
    ctx.lineTo(g.chin.x, g.chin.y);
    ctx.lineTo(jawRight.x, jawRight.y);
    ctx.lineTo(g.rightTemple.x, g.rightTemple.y);
    ctx.stroke();

    // Nose and mouth guide.
    const halfW = distance(g.leftTemple, g.rightTemple) * .43;
    const dirX = Math.cos(g.angle), dirY = Math.sin(g.angle);
    ctx.setLineDash([9 * width, 7 * width]);
    ctx.globalAlpha = .68;
    ctx.beginPath();
    ctx.moveTo(g.nose.x - dirX * halfW, g.nose.y - dirY * halfW);
    ctx.lineTo(g.nose.x + dirX * halfW, g.nose.y + dirY * halfW);
    ctx.moveTo(g.mouth.x - dirX * halfW * .82, g.mouth.y - dirY * halfW * .82);
    ctx.lineTo(g.mouth.x + dirX * halfW * .82, g.mouth.y + dirY * halfW * .82);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function drawPoints() {
    if (!showLandmarks.checked || !state.landmarks) return;
    ctx.save();
    ctx.fillStyle = "rgba(94, 226, 255, .72)";
    const r = Math.max(1.2, canvas.width / 850);
    for (const lm of state.landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function handleRadius() {
    return Math.max(9, canvas.width / 90);
  }

  function drawHandles() {
    if (!showHandles.checked || !state.guides) return;
    const entries = [
      ["crown", state.guides.crown],
      ["center", state.guides.center],
      ["leftTemple", state.guides.leftTemple],
      ["rightTemple", state.guides.rightTemple],
      ["chin", state.guides.chin],
      ["nose", state.guides.nose],
      ["mouth", state.guides.mouth]
    ];

    const r = handleRadius();
    ctx.save();
    ctx.lineWidth = Math.max(2, canvas.width / 500);
    for (const [, p] of entries) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(24, 20, 15, .78)";
      ctx.fill();
      ctx.strokeStyle = "#f2cf92";
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    drawImage();
    drawPoints();
    drawLoomi();
    drawHandles();
  }

  function canvasCoords(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function findHandle(p) {
    if (!state.guides || !showHandles.checked) return null;
    const keys = ["crown", "center", "leftTemple", "rightTemple", "chin", "nose", "mouth"];
    const threshold = handleRadius() * 1.7;
    let best = null;
    let bestD = Infinity;
    for (const key of keys) {
      const d = distance(p, state.guides[key]);
      if (d < threshold && d < bestD) {
        best = key;
        bestD = d;
      }
    }
    return best;
  }

  canvas.addEventListener("pointerdown", (event) => {
    const p = canvasCoords(event);
    const key = findHandle(p);
    if (!key) return;
    state.dragging = key;
    state.pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    const p = canvasCoords(event);
    const g = state.guides;
    const old = { ...g[state.dragging] };
    g[state.dragging] = p;

    if (state.dragging === "center") {
      const dx = p.x - old.x;
      const dy = p.y - old.y;
      for (const key of ["crown", "leftTemple", "rightTemple", "chin", "nose", "mouth", "eyeCenter"]) {
        g[key].x += dx;
        g[key].y += dy;
      }
    }

    if (state.dragging === "leftTemple" || state.dragging === "rightTemple") {
      g.eyeCenter = midpoint(g.leftTemple, g.rightTemple);
      g.angle = Math.atan2(
        g.rightTemple.y - g.leftTemple.y,
        g.rightTemple.x - g.leftTemple.x
      );
    }

    draw();
    event.preventDefault();
  });

  function stopDrag(event) {
    if (state.pointerId !== null && event.pointerId === state.pointerId) {
      state.dragging = null;
      state.pointerId = null;
    }
  }
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);

  function resetGuides() {
    if (state.originalGuides) {
      state.guides = JSON.parse(JSON.stringify(state.originalGuides));
      setStatus("Construction revenue au résultat automatique.", "success");
      draw();
    } else if (state.image) {
      state.landmarks = null;
      state.guides = null;
      setStatus("Photo conservée. Appuie sur « Détecter le visage » pour recommencer.");
      draw();
    }
  }

  function exportPNG() {
    if (!state.image) return;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext("2d");
    exportCtx.drawImage(canvas, 0, 0);

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `${state.fileName}-loomi.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Image Loomi exportée en PNG.", "success");
    }, "image/png");
  }

  input.addEventListener("change", () => loadPhoto(input.files?.[0]));
  detectButton.addEventListener("click", detectFace);
  resetButton.addEventListener("click", resetGuides);
  exportButton.addEventListener("click", exportPNG);
  opacityRange.addEventListener("input", draw);
  widthRange.addEventListener("input", draw);
  showLandmarks.addEventListener("change", draw);
  showHandles.addEventListener("change", draw);

  // The interface is usable immediately. AI loads independently in the background.
  loadAI();
})();
