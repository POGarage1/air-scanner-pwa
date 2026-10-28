import {
  convert_canvas_to_luma,
  decode_multi,
  DecodeHintDictionary,
  DecodeHintTypes
} from "rxing-wasm";

const $ = (id) => document.getElementById(id);
const video = $("video");
const stage = $("camera-stage");
const placeholder = $("camera-placeholder");
const cameraError = $("camera-error");
const startButton = $("start-button");
const stopButton = $("stop-button");
const torchButton = $("torch-button");
const torchLabel = $("torch-label");
const scanStatus = $("scan-status");
const scanSubstatus = $("scan-substatus");
const cameraState = $("camera-state");
const statusDot = $("status-dot");
const formatBadge = $("format-badge");
const resultEmpty = $("result-empty");
const resultContent = $("result-content");
const resultText = $("result-text");
const resultTime = $("result-time");
const copyButton = $("copy-button");

let stream = null;
let running = false;
let torchOn = false;
let rafId = 0;
let lastValue = "";
let lastDecodedAt = 0;
let wasmReady = false;
let decoding = false;
let lastFrameAt = 0;
const canvas = document.createElement("canvas");
const context = canvas.getContext("2d", { willReadFrequently: true });

function setStatus(title = "", subtitle = "", active = false) {
  const scanStatus = document.getElementById("scan-status");
  const scanSubstatus = document.getElementById("scan-substatus");

  if (scanStatus) scanStatus.textContent = title;
  if (scanSubstatus) scanSubstatus.textContent = subtitle;

  const cameraState = document.getElementById("camera-state");
  const statusDot = document.getElementById("status-dot");
  const liveDot = document.querySelector(".live-pill i");

  if (cameraState) cameraState.textContent = "";
  if (statusDot) statusDot.classList.toggle("active", active);
  if (liveDot) liveDot.classList.toggle("active", active);
}

function showError(message) {
  cameraError.textContent = message;
  cameraError.hidden = false;
}
function clearError() {
  cameraError.hidden = true;
  cameraError.textContent = "";
}

async function loadWasm() {
  if (wasmReady) return;
  // rxing-wasm tự khởi tạo WebAssembly qua module đã được import.
  wasmReady = true;
}

function makeHints() {
  const hints = new DecodeHintDictionary();
  // Rxing-Wasm uses PossibleFormats as a comma-separated format list.
  hints.set_hint(DecodeHintTypes.PossibleFormats, "pdf417,itf");
  return hints;
}

async function startScanner() {
  clearError();
  if (!navigator.mediaDevices?.getUserMedia) {
    showError("Trình duyệt không hỗ trợ camera hoặc trang chưa chạy qua HTTPS. Hãy mở PWA qua HTTPS.");
    return;
  }
  startButton.disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    await loadWasm();
    
    video.srcObject = stream;
    await video.play();
    running = true;
    placeholder.hidden = true;
    video.classList.add("active");
    startButton.querySelector("span:last-child").textContent = "Đang quét…";
    stopButton.disabled = false;
    torchButton.disabled = !getVideoTrack()?.getCapabilities?.().torch;
    setStatus("Đang tìm mã vạch", "Giữ mã rõ nét trong khung camera", true);
    rafId = requestAnimationFrame(scanFrame);
  } catch (error) {
    startButton.disabled = false;
    startButton.querySelector("span:last-child").textContent = "Bắt đầu quét";
    const message = error?.name === "NotAllowedError"
      ? "Bạn chưa cấp quyền camera. Hãy cho phép camera trong cài đặt trình duyệt rồi thử lại."
      : error?.name === "NotFoundError"
      ? "Không tìm thấy camera trên thiết bị."
      : `Không thể khởi động máy quét: ${error?.message || "lỗi không xác định"}`;
    showError(message);
    setStatus("Không thể mở camera");
  }
}

function getVideoTrack() {
  return stream?.getVideoTracks?.()[0] || null;
}

async function toggleTorch() {
  const track = getVideoTrack();
  if (!track) return;
  const capabilities = track.getCapabilities?.();
  if (!capabilities?.torch) {
    showError("Thiết bị hoặc trình duyệt này không hỗ trợ điều khiển đèn pin.");
    return;
  }
  try {
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    torchButton.setAttribute("aria-pressed", String(torchOn));
    torchLabel.textContent = torchOn ? "Tắt đèn" : "Đèn pin";
  } catch {
    torchOn = false;
    torchButton.setAttribute("aria-pressed", "false");
    torchLabel.textContent = "Đèn pin";
    showError("Không thể bật đèn pin trên camera hiện tại.");
  }
}

function scanFrame(timestamp) {
  if (!running) return;
  rafId = requestAnimationFrame(scanFrame);
  if (decoding || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || timestamp - lastFrameAt < 140) return;
  lastFrameAt = timestamp;
  decoding = true;
  try {
    // Downscale the frame to reduce per-frame processing cost.
    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    const luma = convert_canvas_to_luma(canvas);
    const results = decode_multi(luma, width, height, makeHints(), false);
    if (results && results.length) {
      const allowed = results.find((result) => {
        const format = String(result.get_barcode_format?.() ?? result.get_format?.() ?? result.format ?? "").toLowerCase();
        return format.includes("pdf417") || format === "itf" || format.includes("interleaved");
      });
      if (allowed) {
        const value = allowed.get_text?.() ?? allowed.text ?? "";
        if (value && (value !== lastValue || Date.now() - lastDecodedAt > 1800)) {
          lastValue = value;
          lastDecodedAt = Date.now();
          showResult(value, allowed);
        }
      }
    }
  } catch {
    // A frame without a decodable barcode is normal; keep scanning.
  } finally {
    decoding = false;
  }
}

function showResult(value, result) {
  const formatRaw = String(result.get_barcode_format?.() ?? result.get_format?.() ?? result.format ?? "");
  const format = /pdf.?417/i.test(formatRaw) ? "PDF417" : /itf|interleaved/i.test(formatRaw) ? "ITF" : formatRaw.toUpperCase() || "BARCODE";
  resultEmpty.hidden = true;
  resultContent.hidden = false;
  resultText.textContent = value;
  formatBadge.textContent = format;
  resultTime.textContent = `ĐỌC THÀNH CÔNG · ${new Date().toLocaleTimeString("vi-VN")}`;
  setStatus("Đã đọc mã thành công", `Định dạng ${format}`, true);
  if (navigator.vibrate) navigator.vibrate(35);
}

async function stopScanner() {
  running = false;
  cancelAnimationFrame(rafId);
  const track = getVideoTrack();
  if (track && torchOn) {
    try { await track.applyConstraints({ advanced: [{ torch: false }] }); } catch {}
  }
  torchOn = false;
  torchButton.setAttribute("aria-pressed", "false");
  torchLabel.textContent = "Đèn pin";
  if (stream) stream.getTracks().forEach((trackItem) => trackItem.stop());
  stream = null;
  video.srcObject = null;
  video.classList.remove("active");
  placeholder.hidden = false;
  startButton.disabled = false;
  startButton.querySelector("span:last-child").textContent = "Bắt đầu quét";
  stopButton.disabled = true;
  torchButton.disabled = true;
  setStatus("Sẵn sàng quét");
}

startButton.addEventListener("click", startScanner);
stopButton.addEventListener("click", stopScanner);
torchButton.addEventListener("click", toggleTorch);
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultText.textContent);
    copyButton.textContent = "Đã sao chép";
    setTimeout(() => { copyButton.textContent = "Sao chép kết quả"; }, 1400);
  } catch {
    showError("Không thể sao chép tự động. Hãy chọn và sao chép kết quả thủ công.");
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && running) stopScanner();
});
window.addEventListener("pagehide", () => {
  if (running) stopScanner();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startScanner, { once: true });
} else {
  startScanner();
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
