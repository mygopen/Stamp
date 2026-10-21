const stamps = [
  {
    id: "wrong",
    name: "Wrong",
    src: "https://ik.imagekit.io/mygopen/stamp/wrong.png?updatedAt=1780969422997",
  },
  {
    id: "thief",
    name: "Thief",
    src: "https://ik.imagekit.io/mygopen/stamp/thief.png?updatedAt=1780969422927",
  },
  {
    id: "pass",
    name: "Pass",
    src: "https://ik.imagekit.io/mygopen/stamp/pass.png?updatedAt=1780969422881",
  },
  {
    id: "careful",
    name: "Careful",
    src: "https://ik.imagekit.io/mygopen/stamp/careful.png?updatedAt=1780969422753",
  },
  {
    id: "care",
    name: "Care",
    src: "https://ik.imagekit.io/mygopen/stamp/care.png?updatedAt=1780969422657",
  },
];

const elements = {
  fileInput: document.querySelector("#fileInput"),
  fileName: document.querySelector("#fileName"),
  dropZone: document.querySelector("#dropZone"),
  uploadTriggers: document.querySelectorAll("[data-upload-trigger]"),
  stampGrid: document.querySelector("#stampGrid"),
  scaleInput: document.querySelector("#scaleInput"),
  scaleValue: document.querySelector("#scaleValue"),
  rotationInput: document.querySelector("#rotationInput"),
  rotationValue: document.querySelector("#rotationValue"),
  opacityInput: document.querySelector("#opacityInput"),
  opacityValue: document.querySelector("#opacityValue"),
  downloadButton: document.querySelector("#downloadButton"),
  emptyState: document.querySelector("#emptyState"),
  canvasFrame: document.querySelector("#canvasFrame"),
  canvas: document.querySelector("#resultCanvas"),
  statusText: document.querySelector("#statusText"),
};

["brightnessInput", "brightnessValue", "resetBrightness", "mosaicToggle", "mosaicSize", "mosaicSizeValue", "undoEdit", "clearMosaic", "regionCount", "selectionBox", "regionSelect", "deselectRegion", "mosaicSizeLabel"].forEach((id) => {
  elements[id] = document.getElementById(id);
});
const baseCanvas = document.createElement("canvas");
const baseCtx = baseCanvas.getContext("2d");
let baseDirty = true;
let selection = null;
let fileRequestId = 0;
const history = [];
let pendingEdit = null;
const ctx = elements.canvas.getContext("2d");
const stampCache = new Map();

const state = {
  baseImage: null,
  brightness: 100,
  mosaicSize: 20,
  regions: [],
  selectedRegion: -1,
  mosaicMode: false,
  baseFileName: "stamped-image",
  selectedStamp: stamps[0],
  selectedStampImage: null,
  scale: Number(elements.scaleInput.value),
  rotation: Number(elements.rotationInput.value),
  opacity: Number(elements.opacityInput.value),
};

let stampRequestId = 0;

function init() {
  bindBaseEdits();
  renderStampOptions();
  bindEvents();
  selectStamp(state.selectedStamp.id);
  refreshIcons();
}

function bindEvents() {
  elements.uploadTriggers.forEach((button) => {
    button.addEventListener("click", () => elements.fileInput.click());
  });

  elements.fileInput.addEventListener("change", (event) => {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  });

  elements.stampGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".stamp-option");
    if (!button) return;
    selectStamp(button.dataset.stampId);
  });

  elements.scaleInput.addEventListener("input", () => {
    state.scale = Number(elements.scaleInput.value);
    elements.scaleValue.textContent = `${state.scale}%`;
    drawComposite();
  });

  elements.rotationInput.addEventListener("input", () => {
    state.rotation = Number(elements.rotationInput.value);
    elements.rotationValue.textContent = `${state.rotation}°`;
    drawComposite();
  });

  elements.opacityInput.addEventListener("input", () => {
    state.opacity = Number(elements.opacityInput.value);
    elements.opacityValue.textContent = `${state.opacity}%`;
    drawComposite();
  });

  elements.downloadButton.addEventListener("click", downloadComposite);

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragover");
    });
  });

  elements.dropZone.addEventListener("drop", (event) => {
    handleFile(event.dataTransfer.files?.[0]);
  });
}

function renderStampOptions() {
  const fragment = document.createDocumentFragment();

  stamps.forEach((stamp) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stamp-option";
    button.dataset.stampId = stamp.id;
    button.setAttribute("aria-pressed", String(stamp.id === state.selectedStamp.id));
    button.innerHTML = `
      <span class="stamp-art">
        <img src="${stamp.src}" alt="${stamp.name}" crossorigin="anonymous" decoding="async" />
      </span>
      <span class="stamp-name">${stamp.name}</span>
    `;
    fragment.append(button);
  });

  elements.stampGrid.replaceChildren(fragment);
}

async function selectStamp(stampId) {
  const stamp = stamps.find((item) => item.id === stampId);
  if (!stamp) return;

  const requestId = ++stampRequestId;
  state.selectedStamp = stamp;
  state.selectedStampImage = null;
  drawComposite();
  updateStampSelection();
  refreshStatus();
  updateDownloadState();

  try {
    const image = await loadStamp(stamp);
    if (requestId !== stampRequestId) return;
    state.selectedStampImage = image;
    drawComposite();
    updateDownloadState();
  } catch (error) {
    if (requestId !== stampRequestId) return;
    state.selectedStampImage = null;
    drawComposite();
    updateDownloadState();
    setStatus("印章載入失敗");
    console.error(error);
  }
}

function updateStampSelection() {
  elements.stampGrid.querySelectorAll(".stamp-option").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.stampId === state.selectedStamp.id),
    );
  });
}

function loadStamp(stamp) {
  if (stampCache.has(stamp.id)) {
    return Promise.resolve(stampCache.get(stamp.id));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      stampCache.set(stamp.id, image);
      resolve(image);
    };
    image.onerror = () => reject(new Error(`Could not load ${stamp.name}`));
    image.src = stamp.src;
  });
}

function handleFile(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus("請選擇圖片檔");
    return;
  }

  const requestId = ++fileRequestId;
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    if (requestId !== fileRequestId) return;
    cancelSelection();
    history.length = 0;
    pendingEdit = null;
    state.brightness = 100;
    state.regions = [];
    state.selectedRegion = -1;
    baseDirty = true;
    state.baseImage = image;
    state.baseFileName = getBaseFileName(file.name);
    elements.fileName.textContent = file.name;
    elements.emptyState.hidden = true;
    elements.canvasFrame.hidden = false;
    refreshStatus();
    drawComposite();
    updateDownloadState();
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    if (requestId === fileRequestId) setStatus("圖片載入失敗");
  };

  image.src = objectUrl;
}

function drawComposite() {
  if (!state.baseImage) return;
  const baseWidth = state.baseImage.naturalWidth;
  const baseHeight = state.baseImage.naturalHeight;
  if (baseDirty) renderBase();
  if (elements.canvas.width !== baseWidth || elements.canvas.height !== baseHeight) {
    elements.canvas.width = baseWidth;
    elements.canvas.height = baseHeight;
  }
  ctx.clearRect(0, 0, baseWidth, baseHeight);
  ctx.drawImage(baseCanvas, 0, 0);
  if (!state.selectedStampImage) return;

  const stampBox = getStampDimensions(baseWidth, baseHeight, state.selectedStampImage);
  ctx.save();
  ctx.globalAlpha = state.opacity / 100;
  ctx.translate(baseWidth / 2, baseHeight / 2);
  ctx.rotate(degreesToRadians(state.rotation));
  ctx.drawImage(
    state.selectedStampImage,
    -stampBox.width / 2,
    -stampBox.height / 2,
    stampBox.width,
    stampBox.height,
  );
  ctx.restore();
}

function getStampDimensions(baseWidth, baseHeight, stampImage) {
  const targetLongSide = Math.min(baseWidth, baseHeight) * (state.scale / 100);
  const aspectRatio = stampImage.naturalWidth / stampImage.naturalHeight;

  return aspectRatio >= 1
    ? {
        width: targetLongSide,
        height: targetLongSide / aspectRatio,
      }
    : {
        width: targetLongSide * aspectRatio,
        height: targetLongSide,
      };
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function downloadComposite() {
  if (!state.baseImage || !state.selectedStampImage) return;

  cancelSelection();
  drawComposite();
  try {
    elements.canvas.toBlob((blob) => {
      if (!blob) {
        setStatus("下載失敗");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${state.baseFileName}-stamped.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  } catch (error) {
    setStatus("下載失敗");
    console.error(error);
  }
}

function updateDownloadState() {
  syncBaseControls();
  elements.downloadButton.disabled = !(state.baseImage && state.selectedStampImage);
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function refreshStatus() {
  if (!state.baseImage) {
    setStatus("尚未上傳圖片");
    return;
  }

  setStatus(`${elements.fileName.textContent} · ${state.selectedStamp.name}`);
}

function getBaseFileName(fileName) {
  const cleanName = fileName.trim().replace(/\.[^/.]+$/, "");
  return cleanName || "stamped-image";
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function snapshot() {
  return { selectedRegion: state.selectedRegion, brightness: state.brightness, mosaicSize: state.mosaicSize, regions: state.regions.map((r) => ({ ...r })) };
}
function remember(before = snapshot()) {
  history.push(before);
  if (history.length > 50) history.shift();
}
function changedBase() {
  baseDirty = true;
  syncBaseControls();
  drawComposite();
}
function syncBaseControls() {
  const disabled = !state.baseImage;
  ["brightnessInput", "resetBrightness", "mosaicToggle", "mosaicSize"].forEach((id) => { elements[id].disabled = disabled; });
  elements.undoEdit.disabled = disabled || history.length === 0;
  elements.clearMosaic.disabled = disabled || state.regions.length === 0;
  elements.brightnessInput.value = state.brightness;
  elements.brightnessValue.textContent = `${state.brightness}%`;
  const current = state.regions[state.selectedRegion];
  const size = current ? current.size : state.mosaicSize;
  elements.mosaicSize.value = size;
  elements.mosaicSizeValue.textContent = `${size} px`;
  elements.mosaicSizeLabel.textContent = current ? `區域 ${state.selectedRegion + 1} 格子大小（原圖像素）` : "新區域格子大小（原圖像素）";
  elements.regionSelect.replaceChildren(new Option("未選取區域", "-1"), ...state.regions.map((r, i) => new Option(`區域 ${i + 1}（${r.size} px）`, String(i))));
  elements.regionSelect.value = String(state.selectedRegion);
  elements.regionSelect.disabled = disabled || !state.regions.length;
  elements.deselectRegion.disabled = disabled || (!current && !selection);
  updateSelectionBox();
  elements.regionCount.textContent = state.regions.length ? `已框選 ${state.regions.length} 個區域` : "尚未框選區域";
  elements.mosaicToggle.setAttribute("aria-pressed", String(state.mosaicMode));
  elements.canvas.classList.toggle("mosaic-mode", state.mosaicMode);
}
function renderBase() {
  const w = state.baseImage.naturalWidth, h = state.baseImage.naturalHeight;
  baseCanvas.width = w;
  baseCanvas.height = h;
  baseCtx.drawImage(state.baseImage, 0, 0);
  // Explicit pixel math also works on mobile browsers without Canvas filter support.
  if (state.brightness !== 100) {
    const pixels = baseCtx.getImageData(0, 0, w, h);
    const factor = state.brightness / 100;
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] *= factor;
      pixels.data[i + 1] *= factor;
      pixels.data[i + 2] *= factor;
    }
    baseCtx.putImageData(pixels, 0, 0);
  }
  if (state.regions.length) {
    const source = document.createElement("canvas");
    source.width = w; source.height = h;
    source.getContext("2d").drawImage(baseCanvas, 0, 0);
    const sizes = new Map();
    // Every region samples the same brightened original, including overlaps.
    state.regions.forEach((r) => {
      let small = sizes.get(r.size);
      if (!small) {
        small = document.createElement("canvas");
        small.width = Math.ceil(w / r.size); small.height = Math.ceil(h / r.size);
        small.getContext("2d").drawImage(source, 0, 0, small.width, small.height);
        sizes.set(r.size, small);
      }
      baseCtx.save(); baseCtx.beginPath();
      baseCtx.rect(r.x, r.y, r.width, r.height); baseCtx.clip();
      baseCtx.clearRect(r.x, r.y, r.width, r.height);
      baseCtx.imageSmoothingEnabled = false;
      baseCtx.drawImage(small, 0, 0, w, h);
      baseCtx.restore();
    });
  }
  baseDirty = false;
}
function imagePoint(event) {
  const rect = elements.canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(elements.canvas.width, (event.clientX - rect.left) * elements.canvas.width / rect.width)),
    y: Math.max(0, Math.min(elements.canvas.height, (event.clientY - rect.top) * elements.canvas.height / rect.height)),
  };
}
function selectionRect(a, b) {
  const x = Math.floor(Math.min(a.x, b.x)), y = Math.floor(Math.min(a.y, b.y));
  return { x, y, width: Math.ceil(Math.max(a.x, b.x)) - x, height: Math.ceil(Math.max(a.y, b.y)) - y };
}
function updateSelectionBox(rect = selection?.rect || state.regions[state.selectedRegion]) {
  if (!rect || !state.baseImage) { elements.selectionBox.hidden = true; return; }
  const canvasRect = elements.canvas.getBoundingClientRect();
  const frameRect = elements.canvasFrame.getBoundingClientRect();
  Object.assign(elements.selectionBox.style, {
    left: `${canvasRect.left - frameRect.left - elements.canvasFrame.clientLeft + elements.canvasFrame.scrollLeft + rect.x * canvasRect.width / elements.canvas.width}px`,
    top: `${canvasRect.top - frameRect.top - elements.canvasFrame.clientTop + elements.canvasFrame.scrollTop + rect.y * canvasRect.height / elements.canvas.height}px`,
    width: `${rect.width * canvasRect.width / elements.canvas.width}px`,
    height: `${rect.height * canvasRect.height / elements.canvas.height}px`,
  });
  elements.selectionBox.hidden = false;
}
// Cancel only the unfinished gesture; a committed selection remains visible.
function cancelSelection() {
  const previous = selection;
  selection = null;
  if (previous && elements.canvas.hasPointerCapture(previous.id)) elements.canvas.releasePointerCapture(previous.id);
  updateSelectionBox();
}
function deselectRegion() {
  cancelSelection(); state.selectedRegion = -1; syncBaseControls();
}
function bindBaseEdits() {
  [["brightnessInput", "brightness"], ["mosaicSize", "mosaicSize"]].forEach(([id, key]) => {
    elements[id].addEventListener("input", () => {
      if (!state.baseImage) return;
      if (!pendingEdit) pendingEdit = snapshot();
      const value = Number(elements[id].value);
      if (key === "mosaicSize" && state.regions[state.selectedRegion]) state.regions[state.selectedRegion].size = value;
      else state[key] = value;
      changedBase();
    });
    elements[id].addEventListener("change", () => {
      if (pendingEdit && JSON.stringify(pendingEdit) !== JSON.stringify(snapshot())) remember(pendingEdit);
      pendingEdit = null;
      syncBaseControls();
    });
  });
  elements.resetBrightness.addEventListener("click", () => {
    if (state.brightness === 100) return;
    remember(); state.brightness = 100; changedBase();
  });
  elements.clearMosaic.addEventListener("click", () => {
    cancelSelection(); remember(); state.regions = []; state.selectedRegion = -1; changedBase();
  });
  elements.undoEdit.addEventListener("click", () => {
    cancelSelection();
    const previous = history.pop();
    if (previous) Object.assign(state, previous);
    changedBase();
  });
  elements.mosaicToggle.addEventListener("click", () => {
    cancelSelection(); state.mosaicMode = !state.mosaicMode; syncBaseControls();
  });
  elements.canvas.addEventListener("pointerdown", (event) => {
    if (!state.baseImage || !state.mosaicMode || selection || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    selection = { id: event.pointerId, start: imagePoint(event) };
    elements.canvas.setPointerCapture(event.pointerId);
  });
  elements.canvas.addEventListener("pointermove", (event) => {
    if (!selection || event.pointerId !== selection.id) return;
    selection.rect = selectionRect(selection.start, imagePoint(event));
    updateSelectionBox();
  });
  elements.canvas.addEventListener("pointerup", (event) => {
    if (!selection || event.pointerId !== selection.id) return;
    const end = imagePoint(event), start = selection.start;
    const r = selectionRect(start, end);
    cancelSelection();
    if (Math.abs(end.x - start.x) < 1 || Math.abs(end.y - start.y) < 1) {
      state.selectedRegion = state.regions.findLastIndex((region) => end.x >= region.x && end.x <= region.x + region.width && end.y >= region.y && end.y <= region.y + region.height);
      syncBaseControls(); return;
    }
    remember(); state.regions.push({ ...r, size: state.mosaicSize });
    state.selectedRegion = state.regions.length - 1; changedBase();
  });
  ["pointercancel", "lostpointercapture"].forEach((name) => elements.canvas.addEventListener(name, cancelSelection));
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") deselectRegion(); });
  elements.deselectRegion.addEventListener("click", deselectRegion);
  elements.regionSelect.addEventListener("change", () => {
    cancelSelection(); state.selectedRegion = Number(elements.regionSelect.value); syncBaseControls();
  });
  new ResizeObserver(() => updateSelectionBox()).observe(elements.canvas);
  elements.canvasFrame.addEventListener("scroll", () => updateSelectionBox());
  window.addEventListener("resize", cancelSelection);
}

init();
