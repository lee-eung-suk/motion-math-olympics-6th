// 수학 체육올림픽 4학년판 - 온몸 포즈 인식 모듈
//
// 1~3학년판은 "태블릿을 책상에 놓고 앉아서 손만" 쓰는 전제라 손 인식(HandLandmarker)만 썼다.
// 4학년 체육은 「동작 도전(체조·매트·균형)」과 「영역형 경쟁(공간 침범·패스)」이라 팔·다리 각도와
// 몸통 회전이 필요해서, MediaPipe PoseLandmarker를 이 파일에서만 따로 얹는다.
// engine.js는 다른 학년판과 똑같이 두어 시리즈 공통 부분이 갈라지지 않게 했다.

import { PoseLandmarker, FilesetResolver } from "./vision_bundle.mjs";
import { toMirroredCanvas } from "./engine.js";

const ROOT = new URL("../", import.meta.url);
const WASM_DIR = new URL("wasm", ROOT).href;
const POSE_MODEL = new URL("models/pose_landmarker_lite.task", ROOT).href;

// MediaPipe Pose 33점 중 이 게임에서 쓰는 관절만 이름을 붙여둔다.
// l/r은 "화면 기준"이 아니라 "그 사람의 왼쪽/오른쪽"이다.
export const PL = {
  nose: 0,
  lShoulder: 11, rShoulder: 12,
  lElbow: 13, rElbow: 14,
  lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24,
  lKnee: 25, rKnee: 26,
  lAnkle: 27, rAnkle: 28,
};

export class PoseTracker {
  constructor() { this.landmarker = null; this.lastResult = null; }
  async init() {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    this.landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    });
  }
  detect(videoEl, timestampMs) {
    if (!this.landmarker) return null;
    this.lastResult = this.landmarker.detectForVideo(videoEl, timestampMs);
    return this.lastResult;
  }
  close() { if (this.landmarker) this.landmarker.close(); }
}

// -------------------- 각도 계산 --------------------

const DEG = 180 / Math.PI;

// 세 점이 이루는 각 ABC(꼭짓점 B)의 크기를 도(°)로 돌려준다
export function jointAngle(a, b, c) {
  if (!a || !b || !c) return null;
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
  if (n1 < 1e-6 || n2 < 1e-6) return null;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return Math.acos(cos) * DEG;
}

// 두 벡터(중심 o에서 p, q로) 사이의 각
export function spreadAngle(o, p, q) { return jointAngle(p, o, q); }

export function midPoint(a, b) {
  if (!a || !b) return a || b || null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// -------------------- 관절 좌표 --------------------

// 인식 결과를 미러링된 캔버스 좌표의 관절 묶음으로 바꾼다.
// 화면 밖으로 나갔거나 확신이 낮은 관절은 null이 되므로, 쓰는 쪽에서 항상 null 검사를 해야 한다.
export function poseJoints(result, w, h, videoEl, minVis = 0.45) {
  if (!result || !result.landmarks || !result.landmarks.length) return null;
  const lm = result.landmarks[0];
  const j = {};
  for (const name in PL) {
    const p = lm[PL[name]];
    if (!p || (p.visibility !== undefined && p.visibility < minVis)) { j[name] = null; continue; }
    const c = toMirroredCanvas(p, w, h, videoEl);
    j[name] = { x: c.x, y: c.y, vis: p.visibility === undefined ? 1 : p.visibility };
  }
  j.shoulderMid = midPoint(j.lShoulder, j.rShoulder);
  j.hipMid = midPoint(j.lHip, j.rHip);
  return j;
}

// 관절 좌표를 부드럽게 — 포즈 인식은 손 인식보다 떨림이 커서 각도가 잘 튄다
export class JointSmoother {
  constructor(alpha = 0.35) { this.alpha = alpha; this.prev = {}; }
  apply(j) {
    if (!j) { this.prev = {}; return null; }
    const out = {};
    for (const k in j) {
      const cur = j[k];
      if (!cur) { out[k] = null; this.prev[k] = null; continue; }
      const p = this.prev[k];
      const s = p ? { x: p.x + (cur.x - p.x) * this.alpha, y: p.y + (cur.y - p.y) * this.alpha, vis: cur.vis } : { ...cur };
      out[k] = s; this.prev[k] = s;
    }
    return out;
  }
}

// -------------------- 통합 입력(BodyInput) --------------------
//
// 게임 코드가 모션/터치/마우스를 매번 갈라 쓰지 않도록, 세 모드를 같은 얼굴로 감싼다.
// 터치·마우스 모드에서는 화면 아래쪽 받침점을 어깨로 삼은 "가상 몸"을 만들어,
// 포인터를 끌면 양팔이 대칭으로 벌어지도록 한다(각도 미션을 앉아서도 할 수 있게).

const VPIVOT = { xf: 0.5, yf: 0.76 }; // 가상 몸의 어깨 중심 위치(화면 비율)

export class BodyInput {
  constructor(mode) {
    this.mode = mode;
    this.joints = null;       // 모션 모드에서만 채워진다
    this.smoother = new JointSmoother(0.35);
    this.pointers = [];
    this.dims = { w: 0, h: 0 };
    this._turn = 0;           // 몸통 회전 신호 -1(왼쪽) ~ +1(오른쪽)
    this._lastPx = null;
  }

  update(result, w, h, videoEl, pointerInput) {
    this.dims = { w, h };
    if (this.mode === "motion") {
      this.joints = this.smoother.apply(poseJoints(result, w, h, videoEl));
      this.pointers = [];
    } else {
      this.joints = null;
      this.pointers = pointerInput ? pointerInput.points.map((p) => ({ x: p.x, y: p.y })) : [];
    }
  }

  get tracked() { return this.mode !== "motion" ? this.pointers.length > 0 : !!(this.joints && this.joints.shoulderMid); }

  // 손목(모션) 또는 포인터(터치/마우스). 짚기·잡기 종목은 전부 이걸 쓴다.
  cursors() {
    if (this.mode !== "motion") return this.pointers;
    const j = this.joints;
    if (!j) return [];
    const out = [];
    if (j.lWrist) out.push({ x: j.lWrist.x, y: j.lWrist.y, side: "l" });
    if (j.rWrist) out.push({ x: j.rWrist.x, y: j.rWrist.y, side: "r" });
    return out;
  }

  pivot() { return { x: this.dims.w * VPIVOT.xf, y: this.dims.h * VPIVOT.yf }; }

  // 양팔 사이의 각도(어깨 중심에서 양 손목까지). 0°=양팔을 위로 모음, 180°=양팔을 옆으로 쫙.
  // 터치/마우스에서는 포인터가 한쪽 팔이 되고 반대쪽 팔이 거울처럼 따라붙어, 각도가 2배로 벌어진다.
  armSpread() {
    if (this.mode !== "motion") {
      const p = this.pointers[0];
      if (!p) return null;
      const o = this.pivot();
      const half = Math.abs(Math.atan2(p.x - o.x, -(p.y - o.y))) * DEG;
      return Math.max(0, Math.min(180, half * 2));
    }
    const j = this.joints;
    if (!j || !j.shoulderMid || !j.lWrist || !j.rWrist) return null;
    return spreadAngle(j.shoulderMid, j.lWrist, j.rWrist);
  }

  // 팔꿈치 각도(펴면 180°, 접으면 작아짐). 두 팔 중 잘 보이는 쪽 평균.
  elbowAngle() {
    const j = this.joints;
    if (!j) return null;
    const a = jointAngle(j.lShoulder, j.lElbow, j.lWrist);
    const b = jointAngle(j.rShoulder, j.rElbow, j.rWrist);
    if (a == null) return b;
    if (b == null) return a;
    return (a + b) / 2;
  }

  // 두 다리 사이의 각도(엉덩이 중심에서 양 발목까지)
  legSpread() {
    const j = this.joints;
    if (!j || !j.hipMid || !j.lAnkle || !j.rAnkle) return null;
    return spreadAngle(j.hipMid, j.lAnkle, j.rAnkle);
  }

  // 몸통 회전 신호(-1 왼쪽 ~ +1 오른쪽).
  // 모션: 어깨선이 기울어진 정도. 터치/마우스: 포인터의 좌우 위치.
  torsoTurn() {
    if (this.mode !== "motion") {
      const p = this.pointers[0];
      if (!p) return 0;
      return Math.max(-1, Math.min(1, (p.x - this.dims.w / 2) / (this.dims.w * 0.32)));
    }
    const j = this.joints;
    if (!j || !j.lShoulder || !j.rShoulder) return 0;
    const dx = j.lShoulder.x - j.rShoulder.x;
    const dy = j.lShoulder.y - j.rShoulder.y;
    if (Math.abs(dx) < 1e-6) return 0;
    const tilt = Math.atan2(dy, dx) * DEG; // 어깨선 기울기
    return Math.max(-1, Math.min(1, tilt / 28));
  }

  // 시작 관문: 양 손목이 어깨보다 위로 올라오면 준비 완료
  isReady() {
    if (this.mode !== "motion") return false;
    const j = this.joints;
    if (!j || !j.shoulderMid) return false;
    const up = (wrist) => wrist && wrist.y < j.shoulderMid.y - this.dims.h * 0.02;
    return up(j.lWrist) || up(j.rWrist);
  }
}

// -------------------- 각도 버티기 --------------------
//
// "제시된 각도를 만들어 N초 버티기". 범위 안에 있으면 게이지가 차고, 벗어나면 천천히 샌다.
// 완전히 0으로 되돌리지 않는 건, 인식이 한두 프레임 튀었다고 처음부터 다시 하면 너무 억울하기 때문이다.
export class AngleHold {
  constructor(holdMs = 1500, tolerance = 13) {
    this.holdMs = holdMs;
    this.tolerance = tolerance;
    this.progress = 0; // 0~1
    this.inRange = false;
  }
  reset() { this.progress = 0; this.inRange = false; }
  // 현재 각도와 목표 각도를 넣으면 게이지를 갱신하고, 다 찼는지 돌려준다
  update(current, target, dtMs) {
    if (current == null) { this.inRange = false; this.progress = Math.max(0, this.progress - dtMs / (this.holdMs * 2.2)); return false; }
    this.inRange = Math.abs(current - target) <= this.tolerance;
    if (this.inRange) this.progress = Math.min(1, this.progress + dtMs / this.holdMs);
    else this.progress = Math.max(0, this.progress - dtMs / (this.holdMs * 1.6));
    return this.progress >= 1;
  }
}

// -------------------- 그리기 --------------------

const BONES = [
  ["lShoulder", "rShoulder"], ["lShoulder", "lElbow"], ["lElbow", "lWrist"],
  ["rShoulder", "rElbow"], ["rElbow", "rWrist"],
  ["lShoulder", "lHip"], ["rShoulder", "rHip"], ["lHip", "rHip"],
  ["lHip", "lKnee"], ["lKnee", "lAnkle"], ["rHip", "rKnee"], ["rKnee", "rAnkle"],
];

// 카메라 영상 위에 뼈대를 얹는다 — 자기 몸이 어떻게 인식되고 있는지 보여야 각도를 맞출 수 있다
export function drawSkeleton(ctx, j, opts = {}) {
  if (!j) return;
  const color = opts.color || "#ffd166";
  const lw = opts.lineWidth || 7;
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(29,43,77,0.55)";
  ctx.lineWidth = lw + 5;
  for (const [a, b] of BONES) {
    if (!j[a] || !j[b]) continue;
    ctx.beginPath(); ctx.moveTo(j[a].x, j[a].y); ctx.lineTo(j[b].x, j[b].y); ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  for (const [a, b] of BONES) {
    if (!j[a] || !j[b]) continue;
    ctx.beginPath(); ctx.moveTo(j[a].x, j[a].y); ctx.lineTo(j[b].x, j[b].y); ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(29,43,77,0.75)";
  ctx.lineWidth = 3;
  for (const k in PL) {
    const p = j[k];
    if (!p) continue;
    ctx.beginPath(); ctx.arc(p.x, p.y, lw * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// 터치·마우스 모드의 "가상 몸" — 포인터를 끌면 양팔이 거울처럼 대칭으로 벌어진다.
// 각도 미션을 앉아서도 똑같이 체험할 수 있게 만든 대체 조작이다.
export function drawVirtualBody(ctx, body, opts = {}) {
  const o = body.pivot();
  const { w, h } = body.dims;
  const armLen = Math.min(w, h) * 0.24;
  const spread = body.armSpread();
  const half = ((spread == null ? 90 : spread) / 2) * Math.PI / 180;
  const color = opts.color || "#ffd166";
  const pts = [
    { x: o.x + Math.sin(half) * armLen, y: o.y - Math.cos(half) * armLen },
    { x: o.x - Math.sin(half) * armLen, y: o.y - Math.cos(half) * armLen },
  ];
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  // 몸통 + 다리
  const legLen = armLen * 0.85;
  const body2 = [
    [o, { x: o.x, y: o.y + armLen * 0.7 }],
    [{ x: o.x, y: o.y + armLen * 0.7 }, { x: o.x - legLen * 0.45, y: o.y + armLen * 0.7 + legLen }],
    [{ x: o.x, y: o.y + armLen * 0.7 }, { x: o.x + legLen * 0.45, y: o.y + armLen * 0.7 + legLen }],
    [o, pts[0]], [o, pts[1]],
  ];
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? "rgba(29,43,77,0.5)" : color;
    ctx.lineWidth = pass === 0 ? 16 : 11;
    for (const [a, b] of body2) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  }
  // 머리
  ctx.beginPath(); ctx.arc(o.x, o.y - armLen * 0.3, armLen * 0.19, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = "rgba(29,43,77,0.6)"; ctx.stroke();
  // 손
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "rgba(29,43,77,0.7)"; ctx.lineWidth = 4;
  for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, armLen * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  ctx.restore();
  return { pivot: o, hands: pts };
}

// 목표 각도와 현재 각도를 겹쳐 보여주는 각도기.
// 숫자만 띄우면 얼마나 벌려야 하는지 감이 안 와서, 부채꼴로 "이만큼"을 눈에 보이게 그린다.
export function drawProtractor(ctx, cx, cy, radius, targetDeg, currentDeg, opts = {}) {
  const ok = opts.ok;
  const toRad = (d) => (d / 2) * Math.PI / 180;
  ctx.save();
  ctx.translate(cx, cy);

  // 목표 부채꼴 (위쪽을 중심으로 좌우 대칭)
  const tt = toRad(targetDeg);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, radius, -Math.PI / 2 - tt, -Math.PI / 2 + tt);
  ctx.closePath();
  ctx.fillStyle = ok ? "rgba(6,214,160,0.30)" : "rgba(255,209,102,0.22)";
  ctx.fill();
  ctx.strokeStyle = ok ? "#06d6a0" : "#ffd166";
  ctx.lineWidth = Math.max(3, radius * 0.035);
  ctx.setLineDash([radius * 0.12, radius * 0.09]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 현재 각도 두 팔
  if (currentDeg != null) {
    const ct = toRad(currentDeg);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(3, radius * 0.045);
    ctx.lineCap = "round";
    for (const s of [-1, 1]) {
      const a = -Math.PI / 2 + ct * s;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius); ctx.stroke();
    }
  }
  ctx.restore();
}
