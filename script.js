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
  downloadButton: document.querySelector("#downloadButton"),
  emptyState: document.querySelector("#emptyState"),
  canvasFrame: document.querySelector("#canvasFrame"),
  canvas: document.querySelector("#resultCanvas"),
  statusText: document.querySelector("#statusText"),
};

const ctx = elements.canvas.getContext("2d");
const stampCache = new Map();

const state = {
  baseImage: null,
  baseFileName: "stamped-image",
  selectedStamp: stamps[0],
  selectedStampImage: null,
  scale: Number(elements.scaleInput.value),
};

let stampRequestId = 0;

function init() {
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

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    state.baseImage = image;
    state.baseFileName = getBaseFileName(file.name);
    elements.fileName.textContent = file.name;
    elements.emptyState.hidden = true;
    elements.canvasFrame.hidden = false;
    refreshStatus();
    URL.revokeObjectURL(objectUrl);
    drawComposite();
    updateDownloadState();
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    setStatus("圖片載入失敗");
  };

  image.src = objectUrl;
}

function drawComposite() {
  if (!state.baseImage || !state.selectedStampImage) return;

  const baseWidth = state.baseImage.naturalWidth;
  const baseHeight = state.baseImage.naturalHeight;

  elements.canvas.width = baseWidth;
  elements.canvas.height = baseHeight;
  ctx.clearRect(0, 0, baseWidth, baseHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(state.baseImage, 0, 0, baseWidth, baseHeight);

  const stampBox = getCenteredStampBox(baseWidth, baseHeight, state.selectedStampImage);
  ctx.drawImage(
    state.selectedStampImage,
    stampBox.x,
    stampBox.y,
    stampBox.width,
    stampBox.height,
  );
}

function getCenteredStampBox(baseWidth, baseHeight, stampImage) {
  const targetLongSide = Math.min(baseWidth, baseHeight) * (state.scale / 100);
  const aspectRatio = stampImage.naturalWidth / stampImage.naturalHeight;
  const dimensions =
    aspectRatio >= 1
      ? {
          width: targetLongSide,
          height: targetLongSide / aspectRatio,
        }
      : {
          width: targetLongSide * aspectRatio,
          height: targetLongSide,
        };

  return {
    ...dimensions,
    x: (baseWidth - dimensions.width) / 2,
    y: (baseHeight - dimensions.height) / 2,
  };
}

function downloadComposite() {
  if (!state.baseImage || !state.selectedStampImage) return;

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

init();
