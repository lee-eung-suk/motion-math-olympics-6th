// 스마트 수학 올림픽 - 공통 엔진 (v2.0)
// 카메라, 손 인식(MediaPipe Tasks Vision), 캔버스 합성, 손들기 시작, 자동 난이도,
// 지연 녹화(첫 정답 or 8초), 콤보 순간 사진, 파티클/이펙트, 사운드를 담당합니다.

import {
  HandLandmarker,
  GestureRecognizer,
  FaceLandmarker,
  PoseLandmarker,
  FilesetResolver,
} from "./vision_bundle.mjs";

const ROOT = new URL("../", import.meta.url); // project root
const WASM_DIR = new URL("wasm", ROOT).href;
const HAND_MODEL = new URL("models/hand_landmarker.task", ROOT).href;
const GESTURE_MODEL = new URL("models/gesture_recognizer.task", ROOT).href;
const FACE_MODEL = new URL("models/face_landmarker.task", ROOT).href;
const POSE_MODEL = new URL("models/pose_landmarker_lite.task", ROOT).href;

// -------------------- 기본 유틸 --------------------

export async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      const lock = await navigator.wakeLock.request("screen");
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible") {
          try { await navigator.wakeLock.request("screen"); } catch (e) {}
        }
      });
      return lock;
    }
  } catch (e) {}
  return null;
}

// 기록: { count, bestLevel, at } - count는 "개수" 기록, bestLevel은 다음 판 시작 난이도 결정에 사용
export const HighScore = {
  key(unit) { return `smo_highscore_${unit}`; },
  get(unit) {
    try { return JSON.parse(localStorage.getItem(this.key(unit))) || null; }
    catch (e) { return null; }
  },
  set(unit, value) {
    try { localStorage.setItem(this.key(unit), JSON.stringify(value)); }
    catch (e) {}
  },
};

export function formatFileTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function medalFor(count, thresholds) {
  if (count >= thresholds.gold) return { medal: "🥇", label: "금메달" };
  if (count >= thresholds.silver) return { medal: "🥈", label: "은메달" };
  if (count >= thresholds.bronze) return { medal: "🥉", label: "동메달" };
  return { medal: "🏅", label: "완주!" };
}

// -------------------- 입력 모드 (v3.0: 모션 / 터치 / 마우스) --------------------

export const InputMode = {
  KEY: "smo_input_mode",
  get() { return localStorage.getItem(InputMode.KEY) || "motion"; },
  set(mode) { localStorage.setItem(InputMode.KEY, mode); },
  label(mode) { return { motion: "📷 모션인식", touch: "👆 터치", mouse: "🖱️ 마우스" }[mode] || mode; },
};

// 터치/마우스 공통 포인터 입력: 캔버스 기준 로컬 좌표로 변환해 손 커서와 동일한 형태로 제공
export class PointerInput {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.points = [];
    this.down = false;
    this._justDown = false;
    this._bind();
  }
  _toLocal(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }
  _bind() {
    this.canvas.addEventListener("mousemove", (e) => { this.points = [this._toLocal(e.clientX, e.clientY)]; });
    this.canvas.addEventListener("mousedown", (e) => {
      this.down = true; this._justDown = true;
      this.points = [this._toLocal(e.clientX, e.clientY)];
    });
    window.addEventListener("mouseup", () => { this.down = false; });
    const onTouch = (e) => {
      e.preventDefault();
      if (e.touches.length > 0) { this.down = true; this._justDown = true; }
      this.points = [...e.touches].map((t) => this._toLocal(t.clientX, t.clientY));
      if (e.touches.length === 0) { this.down = false; this.points = []; }
    };
    this.canvas.addEventListener("touchstart", onTouch, { passive: false });
    this.canvas.addEventListener("touchmove", onTouch, { passive: false });
    this.canvas.addEventListener("touchend", onTouch, { passive: false });
    this.canvas.addEventListener("touchcancel", onTouch, { passive: false });
  }
  consumeJustDown() { const v = this._justDown; this._justDown = false; return v; }
}

// 모드에 따라 손 커서(모션) 또는 터치/마우스 포인터를 동일한 {x,y}[] 형태로 반환
export function getCursors(mode, handResult, w, h, videoEl, pointerInput) {
  if (mode === "motion") {
    if (!handResult || !handResult.landmarks) return [];
    return handResult.landmarks.map((lm) => toMirroredCanvas(lm[8], w, h, videoEl));
  }
  return pointerInput ? pointerInput.points.map((p) => ({ x: p.x, y: p.y })) : [];
}

// 시작 관문: 모션모드는 손들기 0.4초 유지, 터치/마우스는 화면을 누르는 즉시 시작
export class StartGate {
  constructor(mode, holdFillEl) {
    this.mode = mode;
    this.holdFillEl = holdFillEl;
    this.since = 0;
    this.ready = false;
  }
  update(tsMs, activeNow) {
    if (this.mode !== "motion") {
      if (activeNow) this.ready = true;
      if (this.holdFillEl) this.holdFillEl.style.width = this.ready ? "100%" : "0%";
      return this.ready;
    }
    if (activeNow) {
      if (this.since === 0) this.since = tsMs;
      const held = tsMs - this.since;
      if (this.holdFillEl) this.holdFillEl.style.width = Math.min(100, (held / 400) * 100) + "%";
      return held >= 400;
    }
    this.since = 0;
    if (this.holdFillEl) this.holdFillEl.style.width = "0%";
    return false;
  }
}

// 마리오파티풍 밝은 캔디 팔레트 — 6종목이 같은 색을 쓰도록 한곳에 모아둔다
export const PALETTE = {
  skyTop: "#7fd4ff", skyMid: "#bfeaff", skyLow: "#e9f8ff",
  snow: "#ffffff", snowShade: "#dceefc",
  ink: "#1d2b4d",        // 글자/외곽선용 진한 남색
  cream: "#fff8e7",      // 패널 바탕
  sun: "#ffd166",
  red: "#ff5d5d", blue: "#4cc9f0", green: "#3ddc84", pink: "#ff8fc7", purple: "#a78bfa",
};

// 카메라 화면이 없는 터치/마우스 모드용 대체 배경 — 밝고 귀여운 겨울 풍경
export function drawFallbackBackground(ctx, w, h) {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.55, PALETTE.skyMid);
  g.addColorStop(1, PALETTE.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 해
  ctx.fillStyle = "rgba(255,224,130,0.85)";
  ctx.beginPath(); ctx.arc(w * 0.86, h * 0.14, Math.min(w, h) * 0.07, 0, Math.PI * 2); ctx.fill();

  // 뭉게구름 (위치 고정 — 프레임마다 흔들리면 산만해진다)
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  const clouds = [[0.16, 0.16, 0.055], [0.38, 0.1, 0.04], [0.66, 0.2, 0.048]];
  for (const [fx, fy, fr] of clouds) {
    const cx = w * fx, cy = h * fy, r = Math.min(w, h) * fr;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.9, cy + r * 0.12, r * 0.78, 0, Math.PI * 2);
    ctx.arc(cx - r * 0.9, cy + r * 0.16, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // 눈 언덕 두 겹
  ctx.fillStyle = PALETTE.snowShade;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.quadraticCurveTo(w * 0.25, h * 0.62, w * 0.55, h * 0.76);
  ctx.quadraticCurveTo(w * 0.8, h * 0.86, w, h * 0.7);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

  ctx.fillStyle = PALETTE.snow;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.quadraticCurveTo(w * 0.3, h * 0.82, w * 0.62, h * 0.9);
  ctx.quadraticCurveTo(w * 0.85, h * 0.95, w, h * 0.86);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// 만화풍 외곽선 도형: 진한 테두리 + 밝은 채움 + 위쪽 하이라이트로 스티커처럼 보이게 한다
export function drawCartoonCircle(ctx, x, y, r, fill, opts = {}) {
  const outline = opts.outline ?? PALETTE.ink;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y + r * 0.08, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fill();          // 바닥 그림자
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = Math.max(3, r * 0.14); ctx.strokeStyle = outline; ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.42, r * 0.34, r * 0.2, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fill();     // 반짝 하이라이트
  ctx.restore();
}

// 축하 색종이 — 성공 순간에 뿌리면 단숨에 "파티" 느낌이 난다
export function spawnConfetti(arr, x, y, count = 26) {
  const colors = [PALETTE.red, PALETTE.blue, PALETTE.green, PALETTE.sun, PALETTE.pink, PALETTE.purple];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 180 + Math.random() * 280;
    arr.push({
      x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 180,
      rot: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 14,
      w: 7 + Math.random() * 7, h: 10 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 900 + Math.random() * 500, maxLife: 1400,
    });
  }
}
export function updateConfetti(arr, dtSec) {
  for (const c of arr) {
    c.x += c.vx * dtSec; c.y += c.vy * dtSec;
    c.vy += 900 * dtSec; c.vx *= 0.99;
    c.rot += c.rotSpeed * dtSec;
    c.life -= dtSec * 1000;
  }
  return arr.filter((c) => c.life > 0);
}
export function drawConfetti(ctx, arr) {
  ctx.save();
  for (const c of arr) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, c.life / 350);
    ctx.translate(c.x, c.y); ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h * (0.5 + Math.abs(Math.cos(c.rot)) * 0.5));
    ctx.restore();
  }
  ctx.restore();
}

// "1인칭으로 앞으로 나아가는" 느낌의 pseudo-3D 트랙: 소실점에서 뻗는 좌우 레일 +
// 화면 아래로 흘러나오며 점점 넓어지는 가로 타이(rung)로 "바닥이 나를 향해 흘러온다"는 착시를 준다.
// state는 호출부에서 유지하는 { phase: 0 } 형태의 참조 객체(스크롤 진행도 누적용).
export function drawForwardTrack(ctx, w, h, state, dt, opts = {}) {
  // 배경 연출은 부가 요소일 뿐이므로, 혹시라도 실패하더라도(예: 특정 브라우저의 캔버스 제약)
  // 게임 루프 자체가 멈추지 않도록 방어적으로 감싼다.
  try {
    const speed = opts.speed ?? 1;
    const vx = opts.vanishX ?? w * 0.5;
    const vy = opts.vanishY ?? h * 0.28;
    const railColor = opts.railColor ?? "rgba(255,255,255,0.35)";
    const tieColor = opts.tieColor ?? "rgba(255,255,255,0.28)";
    const railHalfWidth = opts.railWidth ?? w * 0.42;
    const tieCount = opts.tieCount ?? 6;

    state.phase = (state.phase ?? 0) + dt * 0.6 * speed;

    ctx.save();
    ctx.strokeStyle = railColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(vx, vy); ctx.lineTo(vx - railHalfWidth, h);
    ctx.moveTo(vx, vy); ctx.lineTo(vx + railHalfWidth, h);
    ctx.stroke();

    for (let i = 0; i < tieCount; i++) {
      const t = (state.phase + i / tieCount) % 1;
      const y = vy + (h - vy) * (t * t); // 가까울수록 빨리 넓어지도록 제곱 커브로 원근감을 준다
      const halfW = railHalfWidth * t;
      ctx.globalAlpha = t * 0.6;
      ctx.strokeStyle = tieColor;
      ctx.lineWidth = 2 + t * 3;
      ctx.beginPath();
      ctx.moveTo(vx - halfW, y); ctx.lineTo(vx + halfW, y);
      ctx.stroke();
    }
    ctx.restore();
  } catch (e) {
    try { ctx.restore(); } catch (e2) { /* ignore */ }
  }
}

// -------------------- 사운드 (오실레이터 기반, 외부 파일 불필요) --------------------

export class SoundKit {
  constructor() {
    this.ctx = null;
    this.dest = null; // MediaStreamAudioDestinationNode for recording
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.dest = this.ctx.createMediaStreamDestination();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }
  get audioStream() {
    this.ensure();
    return this.dest.stream;
  }
  tone(freq = 440, dur = 0.15, type = "sine", gainVal = 0.18, when = 0) {
    const ctx = this.ensure();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainVal, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.connect(this.dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }
  countBeep() { this.tone(520, 0.12, "square", 0.15); }
  go() { this.tone(880, 0.3, "square", 0.2); }
  correct() {
    this.tone(660, 0.12, "sine", 0.2, 0);
    this.tone(990, 0.16, "sine", 0.2, 0.1);
  }
  wrong() { this.tone(160, 0.25, "sawtooth", 0.15); }
  pop() {
    this.tone(1400, 0.05, "square", 0.16, 0);
    this.tone(700, 0.12, "triangle", 0.14, 0.03);
  }
  fizzle() { this.tone(220, 0.2, "sine", 0.1); }
  comboUp() {
    this.tone(784, 0.1, "square", 0.16, 0);
    this.tone(1046, 0.16, "square", 0.18, 0.09);
  }
  fever() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.16, "sawtooth", 0.14, i * 0.05));
  }
  success() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, "sine", 0.2, i * 0.11));
  }
  click() { this.tone(300, 0.05, "square", 0.08); }
  swoosh() { this.tone(1100, 0.07, "sine", 0.1, 0); this.tone(650, 0.1, "sine", 0.08, 0.05); }
  shot() { this.tone(140, 0.07, "square", 0.16, 0); this.tone(90, 0.12, "sawtooth", 0.12, 0.02); }
  hit(kind = "perfect") {
    if (kind === "perfect") { this.tone(880, 0.12, "sine", 0.2); this.tone(1318, 0.14, "sine", 0.16, 0.05); }
    else if (kind === "good") { this.tone(660, 0.1, "sine", 0.16); }
    else { this.tone(180, 0.18, "sawtooth", 0.12); }
  }
}

// -------------------- 배경음악 (실제 mp3 파일 재생) --------------------
// 브라우저 자동재생 정책 대응: 우선 즉시 재생을 시도하고, 차단되면
// 사용자의 첫 터치/클릭/키 입력 시점에 자동으로 이어서 재생합니다.
export class FileAudioLoop {
  constructor(src, volume = 0.35) {
    this.audio = new Audio(src);
    this.audio.loop = true;
    this.audio.volume = volume;
    this.audio.preload = "auto";
    this._armed = false;
    this._userMuted = false;
  }
  // 이번 브라우저 세션(다른 화면 포함)에서 이미 한 번이라도 소리 재생이 실제로 허용된 적이
  // 있으면 표시해둔다. 종목 화면으로 이동해도(예: 랜딩 → 게임 화면) 이 값을 참고해 곧바로
  // 소리 있는 재생을 시도할 수 있다.
  _markSessionUnlocked() {
    try { sessionStorage.setItem("smo_audio_unlocked", "1"); } catch (e) {}
  }
  _isSessionUnlocked() {
    try { return sessionStorage.getItem("smo_audio_unlocked") === "1"; } catch (e) { return false; }
  }
  // 소리 있는 자동재생은 브라우저가 막지만, 무음 자동재생은 항상 허용된다.
  // 그래서 페이지가 열리는 즉시 무음으로 재생을 시작해두고, 사용자의 첫 클릭/터치/키
  // 입력이 감지되는 순간 자동으로 무음을 풀어 자연스럽게 소리가 이어지도록 한다.
  // document 캡처 단계에서 감지하므로 다른 요소가 이벤트 전파를 막아도 놓치지 않는다.
  _armUnlock() {
    if (this._armed) return;
    this._armed = true;
    // iOS Safari는 touchstart를 유효한 재생 허용 제스처로 인정하지 않고 touchend/click만 인정하는 등
    // 브라우저마다 어떤 이벤트가 "제스처"로 인정되는지 다르다. 그래서 재생이 실제로 성공하기 전까지는
    // 리스너를 지우지 않고, 같은 제스처 도중 이어지는 다음 이벤트(touchstart 실패 → touchend/click 재시도)에서
    // 계속 재시도하도록 한다.
    const events = ["pointerdown", "touchstart", "touchend", "keydown", "click", "mousedown"];
    const detach = () => events.forEach((evt) => document.removeEventListener(evt, unlock, true));
    const unlock = () => {
      if (this._userMuted) { detach(); return; }
      this.audio.muted = false;
      const p = this.audio.play();
      if (p && p.then) p.then(() => { this._markSessionUnlocked(); detach(); }).catch(() => {});
      else { this._markSessionUnlocked(); detach(); }
    };
    events.forEach((evt) => document.addEventListener(evt, unlock, true));
  }
  // onStillMuted: 재생 시도 1.5초 후에도 여전히 무음 상태면(자동재생 정책에 막혀
  // 언락 리스너가 아직 안 걸린 경우) 한 번 호출된다 — 화면에 "탭해서 소리 켜기" 안내용.
  play(onStillMuted) {
    this._armUnlock();
    if (this._userMuted) return;
    // 이전 화면에서 이미 실제 소리 재생이 허용된 세션이면, 이번 화면에서도 곧바로
    // 소리 있는 재생을 시도한다. 브라우저가 거부하면(새 문서라 제스처가 없다고 판단한 경우)
    // 조용히 무음 재생으로 대체되고, 첫 상호작용에서 다시 소리가 켜진다.
    if (this._isSessionUnlocked()) {
      this.audio.muted = false;
      this.audio.play().catch(() => {
        this.audio.muted = true;
        this.audio.play().catch(() => {});
      });
    } else {
      this.audio.muted = true;
      this.audio.play().catch(() => {});
    }
    if (onStillMuted) {
      setTimeout(() => {
        if (!this._userMuted && this.audio.muted) onStillMuted();
      }, 1500);
    }
  }
  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }
  // 음소거 버튼 클릭 등 명시적인 사용자 조작에서 호출되므로, 그 자체가 유효한 사용자
  // 제스처라 바로 소리를 켜고 재생할 수 있다.
  setMuted(muted) {
    this._userMuted = muted;
    if (muted) {
      this.audio.pause();
    } else {
      this.audio.muted = false;
      this._markSessionUnlocked();
      this.audio.play().catch(() => {});
    }
  }
}

// 자동재생이 계속 막혀 있을 때(FileAudioLoop의 onStillMuted 콜백) 화면 하단에 짧게 띄우는 안내
export function showSoundHint(message = "🔊 소리가 안 들리면 화면을 한 번 눌러주세요") {
  let el = document.getElementById("soundHint");
  if (!el) {
    el = document.createElement("div");
    el.id = "soundHint";
    el.className = "sound-hint";
    document.body.appendChild(el);
  }
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add("show"));
  const events = ["pointerdown", "touchstart", "click", "keydown"];
  const hide = () => { el.classList.remove("show"); events.forEach((e) => document.removeEventListener(e, hide, true)); };
  events.forEach((e) => document.addEventListener(e, hide, true));
  setTimeout(hide, 6000);
}

// -------------------- 손 랜드마크 헬퍼 --------------------

const TIP = { index: 8, middle: 12, ring: 16, pinky: 20, thumb: 4 };
const PIP = { index: 6, middle: 10, ring: 14, pinky: 18 };

export function countExtendedFingers(landmarks) {
  let n = 0;
  for (const f of ["index", "middle", "ring", "pinky"]) {
    if (landmarks[TIP[f]].y < landmarks[PIP[f]].y) n++;
  }
  const pinkyMcp = landmarks[17];
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const dTip = Math.hypot(thumbTip.x - pinkyMcp.x, thumbTip.y - pinkyMcp.y);
  const dIp = Math.hypot(thumbIp.x - pinkyMcp.x, thumbIp.y - pinkyMcp.y);
  if (dTip > dIp * 1.05) n++;
  return n;
}

export function isFist(landmarks) { return countExtendedFingers(landmarks) <= 1; }
export function isOpenPalm(landmarks) { return countExtendedFingers(landmarks) >= 4; }

// 손목(랜드마크 0)이 화면 위쪽 thresholdFrac 안에 있으면 "손을 들었다"고 판정
export function isHandRaised(landmarks, thresholdFrac = 0.6) {
  return landmarks[0].y < thresholdFrac;
}

// 최근 N개 좌표의 이동평균 (손떨림 안정화)
export class SmoothedPoint {
  constructor(n = 7) { this.n = n; this.buf = []; }
  push(x, y) {
    this.buf.push({ x, y });
    if (this.buf.length > this.n) this.buf.shift();
    const sx = this.buf.reduce((s, p) => s + p.x, 0) / this.buf.length;
    const sy = this.buf.reduce((s, p) => s + p.y, 0) / this.buf.length;
    return { x: sx, y: sy };
  }
  reset() { this.buf = []; }
}

// 카메라 영상을 캔버스에 cover-fit으로 그릴 때의 위치/크기 계산 (미러링 그리기와 좌표 매핑이 동일 기준을 쓰도록 공유)
export function videoCoverRect(videoEl, canvasW, canvasH) {
  const vRatio = videoEl.videoWidth / videoEl.videoHeight;
  const cRatio = canvasW / canvasH;
  let dw, dh, dx, dy;
  if (vRatio > cRatio) {
    dh = canvasH; dw = dh * vRatio; dx = (canvasW - dw) / 2; dy = 0;
  } else {
    dw = canvasW; dh = dw / vRatio; dx = 0; dy = (canvasH - dh) / 2;
  }
  return { dx, dy, dw, dh };
}

// 정규화 좌표(0~1, 원본 비반전 프레임 기준) -> 미러링된 캔버스 좌표
// videoEl을 넘기면 cover-fit 크롭/스케일까지 반영해 화면에 보이는 미러 영상과 정확히 일치시킴
export function toMirroredCanvas(landmark, canvasW, canvasH, videoEl) {
  if (!videoEl) {
    return { x: (1 - landmark.x) * canvasW, y: landmark.y * canvasH };
  }
  const { dx, dy, dw, dh } = videoCoverRect(videoEl, canvasW, canvasH);
  return { x: dx + dw * (1 - landmark.x), y: dy + landmark.y * dh };
}

// -------------------- 카메라 --------------------

export async function startCamera(videoEl, opts = {}) {
  const constraints = {
    video: {
      width: { ideal: opts.width || 640 },
      height: { ideal: opts.height || 480 },
      facingMode: "user",
    },
    audio: false,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

// -------------------- HandLandmarker 래퍼 --------------------

export class HandTracker {
  constructor() { this.landmarker = null; this.lastResult = null; }
  async init(numHands = 2) {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands,
    });
  }
  detect(videoEl, timestampMs) {
    if (!this.landmarker) return null;
    this.lastResult = this.landmarker.detectForVideo(videoEl, timestampMs);
    return this.lastResult;
  }
  close() { if (this.landmarker) this.landmarker.close(); }
}

// -------------------- PoseLandmarker 래퍼 (전신) --------------------
// 손만 볼 때는 팔을 휘둘렀는지 뛰었는지 알 수 없다. 전신 33개 점을 보면
// 던지기·휘두르기·점프·몸 기울이기를 모두 판정할 수 있고, 손목 좌표도 함께 들어 있어
// 기존의 "손으로 겨냥"도 그대로 된다. 손과 동시에 돌리지 않으므로 부담도 늘지 않는다.
export class PoseTracker {
  constructor() { this.landmarker = null; this.lastResult = null; }
  async init() {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    this.landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }
  detect(videoEl, timestampMs) {
    if (!this.landmarker) return null;
    this.lastResult = this.landmarker.detectForVideo(videoEl, timestampMs);
    return this.lastResult;
  }
  close() { if (this.landmarker) this.landmarker.close(); }
}

// 전신 동작 판정기 — 손목·어깨의 최근 궤적을 화면 좌표로 담아 두고
// 휘두르기와 도약을 판정한다. 거리는 모두 "어깨 너비" 단위로 재므로
// 카메라에서 멀리 있든 가까이 있든, 화면이 크든 작든 같은 기준이 된다.
export class PoseMotion {
  constructor(windowMs = 450) { this.windowMs = windowMs; this.buf = []; }
  reset() { this.buf = []; }

  // 매 프레임 호출. 화면(미러링된 캔버스) 좌표로 저장하므로 좌우가 학생이 보는 대로다.
  push(now, lm, w, h, videoEl) {
    if (!poseVisible(lm)) { this.buf = []; return null; }
    const P = (i) => toMirroredCanvas(lm[i], w, h, videoEl);
    const ls = P(POSE.LSHOULDER), rs = P(POSE.RSHOULDER);
    const lh = P(POSE.LHIP), rh = P(POSE.RHIP);
    const unit = Math.max(24, Math.hypot(ls.x - rs.x, ls.y - rs.y));   // 어깨 너비 = 1단위
    const f = {
      t: now, unit,
      lw: P(POSE.LWRIST), rw: P(POSE.RWRIST),
      sc: { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 },
      hc: { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 },
      tiltDeg: (Math.atan2(rs.y - ls.y, rs.x - ls.x) * 180) / Math.PI,
    };
    this.buf.push(f);
    while (this.buf.length && now - this.buf[0].t > this.windowMs) this.buf.shift();
    return f;
  }

  get last() { return this.buf.length ? this.buf[this.buf.length - 1] : null; }

  // 지금으로부터 ms 이전의 프레임 (없으면 가장 오래된 것)
  _back(ms) {
    const last = this.last;
    if (!last) return null;
    for (let i = this.buf.length - 1; i >= 0; i--) if (last.t - this.buf[i].t >= ms) return this.buf[i];
    return this.buf[0];
  }

  // 더 빠르게 움직인 쪽 손목의 속도와 방향. speed 단위는 "어깨 너비 / 초"
  swing(ms = 180) {
    const last = this.last, o = this._back(ms);
    if (!last || !o || last.t <= o.t) return null;
    const dt = (last.t - o.t) / 1000;
    let best = null;
    for (const k of ["lw", "rw"]) {
      const dx = last[k].x - o[k].x, dy = last[k].y - o[k].y;
      const speed = Math.hypot(dx, dy) / last.unit / dt;
      if (!best || speed > best.speed) {
        best = { hand: k, speed, dx, dy, x: last[k].x, y: last[k].y, angle: Math.atan2(dy, dx) };
      }
    }
    return best;
  }

  // 도약 — 서서 뛰면 어깨가 솟고, 앉아서 하면 두 팔이 솟는다. 둘 중 큰 쪽을 세기로 삼아
  // 교실에서 서든 앉든 모두 인식되게 한다.
  jump(ms = 320) {
    const last = this.last, o = this._back(ms);
    if (!last || !o) return null;
    const bodyRise = (o.sc.y - last.sc.y) / last.unit;
    // 팔로 하는 도약은 "두 팔이 함께" 솟구쳐 어깨 위로 올라갔을 때만 인정한다.
    // 한 손만 드는 것은 겨냥하려는 동작이므로 도약과 반드시 구분해야 한다.
    const riseL = (o.lw.y - last.lw.y) / last.unit;
    const riseR = (o.rw.y - last.rw.y) / last.unit;
    const bothAboveShoulder = last.lw.y < last.sc.y && last.rw.y < last.sc.y;
    const armRise = bothAboveShoulder ? Math.min(riseL, riseR) : 0;
    return { bodyRise, armRise, power: Math.max(bodyRise * 1.6, armRise) };
  }
}

// 자주 쓰는 관절 번호 (MediaPipe Pose 33점)
export const POSE = {
  NOSE: 0,
  LSHOULDER: 11, RSHOULDER: 12,
  LELBOW: 13, RELBOW: 14,
  LWRIST: 15, RWRIST: 16,
  LHIP: 23, RHIP: 24,
  LKNEE: 25, RKNEE: 26,
  LANKLE: 27, RANKLE: 28,
};

// 결과에서 첫 사람의 랜드마크만 꺼낸다 (없으면 null)
export function posePoints(result) {
  if (!result || !result.landmarks || !result.landmarks.length) return null;
  return result.landmarks[0];
}

// 어깨와 엉덩이가 충분히 보이는지 — 얼굴만 잡히면 동작 판정이 엉망이 된다
export function poseVisible(lm, minVis = 0.4) {
  if (!lm) return false;
  const need = [POSE.LSHOULDER, POSE.RSHOULDER];
  return need.every((i) => lm[i] && (lm[i].visibility ?? 1) > minVis);
}

// 몸 크기(어깨 너비) — 카메라와의 거리에 상관없이 같은 기준으로 속도를 재려면 필요하다.
// 어깨가 잘 안 보이면 몸통 세로 길이로 대신한다.
export function poseScale(lm) {
  if (!lm) return 0.2;
  const a = lm[POSE.LSHOULDER], b = lm[POSE.RSHOULDER];
  const w = Math.hypot(a.x - b.x, a.y - b.y);
  if (w > 0.05) return w;
  const sc = midpoint(lm[POSE.LSHOULDER], lm[POSE.RSHOULDER]);
  const hc = midpoint(lm[POSE.LHIP], lm[POSE.RHIP]);
  const h = Math.abs(sc.y - hc.y);
  return Math.max(0.08, h * 0.7);
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1) };
}

// 손을 들었는가 — 손목이 어깨보다 위에 있으면 든 것으로 본다 (시작 관문용)
export function isArmRaised(lm) {
  if (!poseVisible(lm)) return false;
  const sy = midpoint(lm[POSE.LSHOULDER], lm[POSE.RSHOULDER]).y;
  return lm[POSE.LWRIST].y < sy || lm[POSE.RWRIST].y < sy;
}

export class GestureTracker {
  constructor() { this.recognizer = null; this.lastResult = null; }
  async init(numHands = 2) {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    this.recognizer = await GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: GESTURE_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands,
    });
  }
  detect(videoEl, timestampMs) {
    if (!this.recognizer) return null;
    this.lastResult = this.recognizer.recognizeForVideo(videoEl, timestampMs);
    return this.lastResult;
  }
  close() { if (this.recognizer) this.recognizer.close(); }
}

export class FaceTracker {
  constructor() { this.landmarker = null; this.lastResult = null; }
  async init(numFaces = 1) {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces,
    });
  }
  detect(videoEl, timestampMs) {
    if (!this.landmarker) return null;
    this.lastResult = this.landmarker.detectForVideo(videoEl, timestampMs);
    return this.lastResult;
  }
  close() { if (this.landmarker) this.landmarker.close(); }
}

// -------------------- 자동 난이도 --------------------
// 연속 3개 정답 -> 한 단계 상승, 연속 2개 실패 -> 한 단계 하락
export class AutoDifficulty {
  constructor(startLevel = 1, maxLevel = 3) {
    this.level = Math.min(maxLevel, Math.max(1, startLevel));
    this.maxLevel = maxLevel;
    this.streak = 0;
    this.failStreak = 0;
  }
  reportCorrect() {
    this.streak++; this.failStreak = 0;
    if (this.streak >= 3 && this.level < this.maxLevel) { this.level++; this.streak = 0; return true; }
    return false;
  }
  reportWrong() {
    this.failStreak++; this.streak = 0;
    if (this.failStreak >= 2 && this.level > 1) { this.level--; this.failStreak = 0; return true; }
    return false;
  }
  static startLevelFromHighScore(prev) {
    if (!prev || !prev.bestLevel) return 1;
    return Math.max(1, prev.bestLevel - 1);
  }
}

// 주소 끝에 ?level=1~3 을 붙이면 시작 난이도를 고정할 수 있다.
// 반 수준에 맞춰 수업을 시작하고 싶을 때 쓰며, 그 뒤로는 평소처럼 자동으로 오르내린다.
export function levelFromUrl(fallback) {
  const v = parseInt(new URLSearchParams(location.search).get("level"), 10);
  return Number.isFinite(v) && v >= 1 && v <= 3 ? v : fallback;
}

export function drawLevelBadge(ctx, w, h, level) {
  ctx.save();
  ctx.textAlign = "right";
  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#ffffffaa";
  ctx.shadowColor = "#000"; ctx.shadowBlur = 6;
  ctx.fillText("⭐".repeat(level), w - 16, h - 16);
  ctx.restore();
}

// -------------------- 3초 지연 녹화 (첫 정답 or 8초 경과) --------------------

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export class ClipRecorder {
  constructor(canvasEl, soundKit, fps = 24) {
    this.canvasEl = canvasEl;
    this.soundKit = soundKit;
    this.fps = fps;
    this.blob = null;
    this.mimeType = pickSupportedMimeType();
    this.supported = this.mimeType !== null;
    this.recorder = null;
    this.chunks = [];
  }
  buildStream() {
    const videoStream = this.canvasEl.captureStream(this.fps);
    if (this.soundKit) {
      const audioTrack = this.soundKit.audioStream.getAudioTracks()[0];
      if (audioTrack) videoStream.addTrack(audioTrack);
    }
    return videoStream;
  }
  // 게임 시작 시 미리 호출: 스트림 + MediaRecorder를 준비만 해둔다 (지연 최소화)
  prepare() {
    if (!this.supported) return false;
    try {
      const stream = this.buildStream();
      this.recorder = new MediaRecorder(stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    } catch (e) { this.supported = false; return false; }
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    return true;
  }
  // 실제 촬영 시작 (첫 정답 또는 8초 경과 시점에 호출)
  start(durationMs = 3000) {
    return new Promise((resolve) => {
      if (!this.recorder) { resolve(null); return; }
      this.recorder.onstop = () => {
        this.blob = new Blob(this.chunks, { type: this.mimeType || "video/webm" });
        resolve(this.blob);
      };
      try { this.recorder.start(); } catch (e) { resolve(null); return; }
      setTimeout(() => { if (this.recorder.state !== "inactive") this.recorder.stop(); }, durationMs);
    });
  }
  get extension() {
    if (!this.mimeType) return "webm";
    return this.mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  }
}

// 게임 시작 시 등록: 첫 정답(trigger 호출) 또는 fallbackMs 경과 중 먼저 오는 시점에 3초 녹화 시작
export function scheduleAutoRecording(recorder, { onStartVisual, onEndVisual, onDone, fallbackMs = 8000 } = {}) {
  let triggered = false;
  function trigger() {
    if (triggered) return;
    triggered = true;
    clearTimeout(timer);
    if (onStartVisual) onStartVisual();
    recorder.start(3000).then((blob) => {
      if (onEndVisual) onEndVisual();
      if (onDone) onDone(blob);
    });
  }
  const timer = setTimeout(trigger, fallbackMs);
  return { trigger, cancel: () => clearTimeout(timer) };
}

export function snapshotCanvas(canvasEl) {
  return new Promise((resolve) => canvasEl.toBlob((b) => resolve(b), "image/png"));
}

// -------------------- 이미지 에셋 프리로드 --------------------

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러올 수 없어요: " + src));
    img.src = src;
  });
}

export function loadImages(map) {
  const keys = Object.keys(map);
  return Promise.all(keys.map((k) => loadImage(map[k]))).then((imgs) => {
    const out = {};
    keys.forEach((k, i) => { out[k] = imgs[i]; });
    return out;
  });
}

// -------------------- 콤보 순간 사진 캡처 (오프스크린 복사) --------------------

export class ComboShot {
  constructor(canvasEl) {
    this.off = document.createElement("canvas");
    this.off.width = canvasEl.width;
    this.off.height = canvasEl.height;
    this.offCtx = this.off.getContext("2d");
    this.captured = false;
  }
  capture(canvasEl) {
    // 화면이 아직(또는 잠시) 비어 있으면 캡처를 건너뛴다 — 0 크기 캔버스를 그리면 예외가 난다
    if (!canvasEl.width || !canvasEl.height) return;
    // 태블릿을 돌려 화면 비율이 바뀌었으면 사진도 그 비율로 맞춘다 (안 그러면 찌그러진다)
    if (this.off.width !== canvasEl.width || this.off.height !== canvasEl.height) {
      this.off.width = canvasEl.width;
      this.off.height = canvasEl.height;
    }
    this.offCtx.clearRect(0, 0, this.off.width, this.off.height);
    this.offCtx.drawImage(canvasEl, 0, 0, this.off.width, this.off.height);
    this.captured = true;
  }
  toBlob(drawOverlay) {
    if (drawOverlay) drawOverlay(this.offCtx, this.off.width, this.off.height);
    return new Promise((resolve) => this.off.toBlob(resolve, "image/png"));
  }
}

export function drawPhotoOverlay(ctx, w, h, { title, record, medal }) {
  ctx.save();
  const bannerH = h * 0.13;
  ctx.fillStyle = "#0f1226cc";
  ctx.fillRect(0, h - bannerH, w, bannerH);
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${bannerH * 0.32}px sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(`🏅 ${title}`, 24, h - bannerH / 2);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffb703";
  ctx.font = `bold ${bannerH * 0.42}px sans-serif`;
  ctx.fillText(`${medal} ${record}`, w - 24, h - bannerH / 2);
  ctx.restore();
}

// -------------------- 화면 흔들림 --------------------

export class ScreenShake {
  constructor() { this.until = 0; this.amount = 0; }
  trigger(amount = 6, durationMs = 150) { this.amount = amount; this.until = performance.now() + durationMs; }
  apply(ctx) {
    const now = performance.now();
    if (now < this.until) {
      const dx = (Math.random() * 2 - 1) * this.amount;
      const dy = (Math.random() * 2 - 1) * this.amount;
      ctx.translate(dx, dy);
    }
  }
}

// -------------------- 파티클 / 팝업 텍스트 --------------------

// -------------------- 게임 느낌(주스) 공통 유틸 --------------------
// 6종목이 같은 연출 언어를 쓰도록 여기에 모아두고, 각 게임은 이 함수들만 호출한다.

export function easeOutBack(t, s = 1.70158) { const u = t - 1; return u * u * ((s + 1) * u + s) + 1; }
export function easeOutCubic(t) { const u = 1 - t; return 1 - u * u * u; }

// 등장 애니메이션: 태어난 시각을 넘기면 "톡" 튀어나오는 배율을 돌려준다
export function popScale(bornAt, dur = 300) {
  const t = Math.min(1, Math.max(0, (performance.now() - bornAt) / dur));
  return easeOutBack(t);
}

// 화면 가장자리를 부드럽게 눌러 시선을 가운데로 모은다 — 완성도가 확 올라가는 값싼 연출
export function drawVignette(ctx, w, h, strength = 0.4) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
}

// 상단 HUD: 글자만 떠 있으면 배경과 섞여 지저분해 보이므로 둥근 패널 위에 얹는다.
// lines = [{ text, font, color, size }] 형태.
export function drawHudBanner(ctx, dims, lines, opts = {}) {
  const { w } = dims;
  const padX = fluidPx(dims, 22, { min: 14, max: 32 });
  const padY = fluidPx(dims, 12, { min: 8, max: 18 });
  const gap = fluidPx(dims, 6, { min: 4, max: 10 });
  const top = opts.top ?? fluidPx(dims, 10, { min: 6, max: 18 });

  ctx.save();
  const measured = lines.map((l) => {
    const size = fluidPx(dims, l.size ?? 22);
    ctx.font = `${l.weight ?? "bold"} ${size}px sans-serif`;
    return { ...l, size, width: ctx.measureText(l.text).width };
  });
  const boxW = Math.min(w * 0.96, Math.max(...measured.map((m) => m.width)) + padX * 2);
  const boxH = measured.reduce((s, m) => s + m.size, 0) + gap * (measured.length - 1) + padY * 2;
  const x = w / 2 - boxW / 2;

  // 마리오파티풍 캔디 패널: 크림색 바탕 + 굵은 남색 테두리 + 아래로 떨어지는 그림자
  const radius = fluidPx(dims, 20, { min: 12, max: 28 });
  const lw = fluidPx(dims, 5, { min: 3, max: 7 });
  ctx.fillStyle = "rgba(29,43,77,0.30)";
  ctx.beginPath(); ctx.roundRect(x + lw * 0.6, top + lw * 1.2, boxW, boxH, radius); ctx.fill();
  ctx.fillStyle = opts.bg ?? PALETTE.cream;
  ctx.beginPath(); ctx.roundRect(x, top, boxW, boxH, radius); ctx.fill();
  ctx.strokeStyle = opts.border ?? PALETTE.ink; ctx.lineWidth = lw; ctx.stroke();
  // 위쪽 유광 하이라이트
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, top, boxW, boxH, radius); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillRect(x, top, boxW, boxH * 0.34);
  ctx.restore();

  ctx.textAlign = "center"; ctx.textBaseline = "top";
  let y = top + padY;
  for (const m of measured) {
    ctx.font = `${m.weight ?? "bold"} ${m.size}px sans-serif`;
    ctx.fillStyle = m.color ?? PALETTE.ink;
    ctx.fillText(m.text, w / 2, y);
    y += m.size + gap;
  }
  ctx.restore();
  return top + boxH; // 아래 콘텐츠가 겹치지 않게 배너 하단 y를 알려준다
}

export function spawnParticles(arr, x, y, opts = {}) {
  const { count = 12, colors = ["#fff"], speed = 220, life = 400, size = 5 } = opts;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = speed * (0.4 + Math.random() * 0.6);
    arr.push({
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 60,
      life, maxLife: life, color: colors[Math.floor(Math.random() * colors.length)], size,
    });
  }
}

export function updateParticles(arr, dtSec) {
  for (const p of arr) { p.x += p.vx * dtSec; p.y += p.vy * dtSec; p.vy += 480 * dtSec; p.life -= dtSec * 1000; }
  return arr.filter((p) => p.life > 0);
}

export function drawParticles(ctx, arr) {
  ctx.save();
  for (const p of arr) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function spawnPopup(arr, x, y, text, color = "#06d6a0") {
  arr.push({ x, y, text, color, life: 700, maxLife: 700 });
}
export function updatePopups(arr, dtSec) {
  for (const p of arr) { p.y -= 46 * dtSec; p.life -= dtSec * 1000; }
  return arr.filter((p) => p.life > 0);
}
export function drawPopups(ctx, arr) {
  ctx.save();
  ctx.textAlign = "center";
  for (const p of arr) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.font = "bold 28px sans-serif";
    ctx.shadowColor = "#000"; ctx.shadowBlur = 6;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

// -------------------- 거대 Floating Score 팝업 (명중/성공 시 공통 연출) --------------------
// 0.6초 동안 1.0배 → 1.3배로 확대되며 위로 떠오르다가 페이드아웃되는 대형(48pt+) 텍스트
export function spawnBigPopup(arr, x, y, text, color = "#ffd166") {
  arr.push({ x, y, text, color, life: 600, maxLife: 600 });
}
export function updateBigPopups(arr, dtSec) {
  for (const p of arr) { p.y -= 70 * dtSec; p.life -= dtSec * 1000; }
  return arr.filter((p) => p.life > 0);
}
export function drawBigPopups(ctx, arr) {
  ctx.save();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const p of arr) {
    const t = 1 - p.life / p.maxLife; // 0~1 진행도
    const scale = t < 0.35 ? 1 + (t / 0.35) * 0.3 : 1.3 - ((t - 0.35) / 0.65) * 0.15;
    const alpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.font = "900 52px sans-serif";
    ctx.lineWidth = 5; ctx.strokeStyle = "#00000090";
    ctx.shadowColor = "#000"; ctx.shadowBlur = 16;
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// -------------------- 캔버스 합성 (카메라 미러링 배경) --------------------

export function drawMirroredVideo(ctx, videoEl, canvasW, canvasH) {
  const { dx, dy, dw, dh } = videoCoverRect(videoEl, canvasW, canvasH);
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, -dx - dw, dy, dw, dh);
  ctx.restore();
}

// 앱 전환·화면 잠금 중에 resize가 오면 브라우저가 창 크기를 0으로 보고할 때가 있다.
// 그대로 받으면 캔버스가 0×0으로 굳어 화면이 빈 채 멈추고 사진 저장도 실패하므로,
// 0이 오면 직전 크기를 그대로 유지한다.
export function fitCanvasToScreen(canvasEl) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth || canvasEl.clientWidth || canvasEl.width / dpr || 1;
  const h = window.innerHeight || canvasEl.clientHeight || canvasEl.height / dpr || 1;
  canvasEl.width = w * dpr;
  canvasEl.height = h * dpr;
  const ctx = canvasEl.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, ctx };
}

// 캔버스에 그리는 텍스트(ctx.font) 크기를 화면 크기에 비례해 유동적으로 계산.
// basePx는 태블릿 가로모드(짧은 변 기준 800px)를 표준으로 튜닝한 값이며,
// 작은 휴대폰 가로화면부터 대형 모니터까지 min(w,h) 비율로 스케일하되 min/max로 과도한 축소·확대를 막는다.
export function fluidPx(dims, basePx, { min, max } = {}) {
  const scale = Math.min(dims.w, dims.h) / 800;
  const px = basePx * scale;
  const lo = min ?? basePx * 0.55;
  const hi = max ?? basePx * 1.8;
  return Math.round(Math.max(lo, Math.min(hi, px)));
}
