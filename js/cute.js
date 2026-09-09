// 마리오파티풍 "아기자기" 렌더링 공통 모듈
// 6종목이 같은 시각 언어(통통한 스티커 도형 · 두꺼운 남색 외곽선 · 아래로 떨어지는 3D 그림자 ·
// 반짝이는 별)를 쓰도록 그리기 함수를 여기 모아 둔다. 각 게임은 이 함수들만 호출한다.

export const CUTE = {
  ink: "#22305c",        // 모든 외곽선/글자에 쓰는 진한 남색
  cream: "#fffdf3",
  sun: "#ffcf3f", sunDark: "#e0a413",
  red: "#ff6b6b", redDark: "#d64545",
  blue: "#4dabf7", blueDark: "#2f7dc4",
  green: "#51cf66", greenDark: "#2f9e44",
  orange: "#ffa94d", orangeDark: "#e8720c",
  purple: "#da77f2", purpleDark: "#ae3ec9",
  cyan: "#3bc9db", cyanDark: "#0b9aad",
  pink: "#ff8fc7",
};

export const LANE_COLORS = [CUTE.red, CUTE.blue, CUTE.green, CUTE.purple, CUTE.orange];
export const LANE_DARK = [CUTE.redDark, CUTE.blueDark, CUTE.greenDark, CUTE.purpleDark, CUTE.orangeDark];

// 위아래로 통통 튀는 오프셋 — 화면 위 모든 것이 살아 있는 느낌을 준다
export function bob(speed = 1, amp = 4, phase = 0) {
  return Math.sin(performance.now() / (420 / speed) + phase) * amp;
}

// 눌렸다 튀어오르는 배율 (등장 연출)
export function pop(bornAt, dur = 320) {
  const t = Math.min(1, Math.max(0, (performance.now() - bornAt) / dur));
  const u = t - 1;
  return u * u * (2.70158 * u + 1.70158) + 1;
}

// ---------- 기본 도형 ----------

// 통통한 원형 스티커: 아래로 떨어지는 그림자 + 두꺼운 외곽선 + 위쪽 유광 하이라이트
export function drawSticker(ctx, x, y, r, fill, opts = {}) {
  if (r <= 0.5) return;
  const ink = opts.ink ?? CUTE.ink;
  const lw = opts.lineWidth ?? Math.max(3, r * 0.15);
  const drop = opts.drop ?? r * 0.16;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y + drop, r, 0, Math.PI * 2);
  ctx.fillStyle = opts.shadow ?? "rgba(34,48,92,0.28)"; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke();
  if (opts.gloss !== false) {
    ctx.save();
    // 작은 스티커(사라져 가는 반짝임 등)에서는 r - lw/2 가 음수가 되어 arc가 예외를 던진다
    ctx.beginPath(); ctx.arc(x, y, Math.max(0, r - lw * 0.5), 0, Math.PI * 2); ctx.clip();
    ctx.beginPath();
    ctx.ellipse(x - r * 0.26, y - r * 0.44, r * 0.46, r * 0.26, -0.45, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// 통통한 둥근 사각 스티커 (상자·카드·패널용)
export function drawStickerRect(ctx, x, y, w, h, radius, fill, opts = {}) {
  const ink = opts.ink ?? CUTE.ink;
  const lw = opts.lineWidth ?? Math.max(3, Math.min(w, h) * 0.07);
  const drop = opts.drop ?? Math.min(w, h) * 0.09;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2 + drop, w, h, radius);
  ctx.fillStyle = opts.shadow ?? "rgba(34,48,92,0.28)"; ctx.fill();
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, radius);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke();
  if (opts.gloss !== false) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, radius); ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(x - w / 2, y - h / 2, w, h * 0.36);
    ctx.restore();
  }
  ctx.restore();
}

// 두꺼운 외곽선 글자 — 배경이 뭐든(카메라 영상 포함) 또렷하게 읽힌다
export function drawChunkyText(ctx, text, x, y, size, fill, opts = {}) {
  ctx.save();
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = opts.baseline ?? "middle";
  ctx.font = `900 ${size}px sans-serif`;
  ctx.lineJoin = "round"; ctx.miterLimit = 2;
  ctx.lineWidth = opts.outlineWidth ?? Math.max(3, size * 0.22);
  ctx.strokeStyle = opts.outline ?? CUTE.ink;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// 동그란 눈 두 개 + 발그레한 볼 — 숫자 하나에도 표정이 붙으면 캐릭터가 된다
export function drawFace(ctx, x, y, r, opts = {}) {
  const eyeDx = r * 0.34, eyeDy = opts.eyeDy ?? -r * 0.1;
  const eyeR = r * (opts.happy ? 0.13 : 0.15);
  ctx.save();
  ctx.fillStyle = CUTE.ink;
  if (opts.happy) {
    // 감은 눈 (^ ^)
    ctx.lineWidth = Math.max(2, r * 0.1); ctx.strokeStyle = CUTE.ink; ctx.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + s * eyeDx, y + eyeDy + r * 0.06, r * 0.16, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(x + s * eyeDx, y + eyeDy, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.arc(x + s * eyeDx + eyeR * 0.32, y + eyeDy - eyeR * 0.34, eyeR * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.fillStyle = CUTE.ink;
    }
  }
  ctx.fillStyle = "rgba(255,138,161,0.55)";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * r * 0.56, y + r * 0.2, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- 반짝임 ----------

// 네 갈래 별 — 마리오파티에서 성공 순간마다 터지는 그 모양
export function drawSparkle(ctx, x, y, r, color = "#fff", rot = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const a2 = a + Math.PI / 4;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.quadraticCurveTo(0, 0, Math.cos(a2) * r * 0.22, Math.sin(a2) * r * 0.22);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function spawnSparkles(arr, x, y, count = 10, colors = ["#fff", CUTE.sun]) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 90 + Math.random() * 240;
    arr.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
      r: 5 + Math.random() * 11, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 9,
      life: 520 + Math.random() * 320, maxLife: 840,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}
export function updateSparkles(arr, dt) {
  for (const s of arr) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 420 * dt; s.rot += s.spin * dt; s.life -= dt * 1000; }
  return arr.filter((s) => s.life > 0);
}
export function drawSparkles(ctx, arr) {
  ctx.save();
  for (const s of arr) {
    const k = Math.max(0, s.life / s.maxLife);
    ctx.globalAlpha = k;
    drawSparkle(ctx, s.x, s.y, s.r * (0.4 + k * 0.8), s.color, s.rot);
  }
  ctx.restore();
}

// ---------- 배경 장식 ----------

// 화면을 떠다니는 옅은 별가루. 카메라 영상 위에 얹어도 방해되지 않을 만큼만 넣는다.
export function makeDrifters(count, w, h) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w, y: Math.random() * h,
    r: 5 + Math.random() * 9, sp: 8 + Math.random() * 18,
    rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 1.2,
    tw: Math.random() * Math.PI * 2,
  }));
}
export function drawDrifters(ctx, arr, dims, dt) {
  ctx.save();
  for (const d of arr) {
    d.y -= d.sp * dt; d.rot += d.spin * dt; d.tw += dt * 2.4;
    if (d.y < -20) { d.y = dims.h + 20; d.x = Math.random() * dims.w; }
    ctx.globalAlpha = 0.20 + Math.abs(Math.sin(d.tw)) * 0.28;
    drawSparkle(ctx, d.x, d.y, d.r, "#ffffff", d.rot);
  }
  ctx.restore();
}

// 위쪽에서 늘어진 삼각 깃발 — 한 줄만 그려도 단숨에 "파티장"이 된다
export function drawBunting(ctx, dims) {
  const { w, h } = dims;
  const n = Math.max(8, Math.round(w / 95));
  const sag = Math.min(46, h * 0.07);
  const top = -sag * 0.35;
  ctx.save();
  ctx.strokeStyle = "rgba(34,48,92,0.45)"; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.quadraticCurveTo(w / 2, top + sag, w, top);
  ctx.stroke();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t * w;
    const y = top + sag * 2 * t * (1 - t) * 2;
    const fw = Math.min(26, w / (n * 1.7));
    ctx.fillStyle = LANE_COLORS[i % LANE_COLORS.length];
    ctx.beginPath();
    ctx.moveTo(x - fw / 2, y); ctx.lineTo(x + fw / 2, y); ctx.lineTo(x, y + fw * 1.25);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(34,48,92,0.5)"; ctx.stroke();
  }
  ctx.restore();
}

// ---------- 커서 ----------

// 마리오파티의 하얀 장갑 손 커서. 잡는 중(active)이면 노랗게 달아오른다.
// 원점 (0,0) = 검지 손끝. 게임의 판정(히트테스트)이 항상 이 (x,y)를 기준으로 이루어지므로,
// 손끝이 원점과 맞아떨어져야 "화면에 보이는 손끝 위치 = 실제로 인식되는 지점"이 된다.
// (예전에는 손바닥 중앙이 원점이라, 마우스 좌표와 눈에 보이는 손끝이 어긋나 보였다.)
export function drawGloveCursor(ctx, x, y, size, opts = {}) {
  const s = size / 26;
  const active = opts.active;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(0, bob(1.6, 1.6));

  ctx.beginPath(); ctx.ellipse(1, 49, 15, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(34,48,92,0.22)"; ctx.fill();

  ctx.lineJoin = "round";
  ctx.lineWidth = 4; ctx.strokeStyle = CUTE.ink;
  ctx.fillStyle = active ? CUTE.sun : "#ffffff";

  // 손바닥 (검지 손끝이 원점(0,0) 근처에 오도록 그린다)
  ctx.beginPath();
  ctx.moveTo(-12, 27);
  ctx.quadraticCurveTo(-14, 43, -1, 45);
  ctx.quadraticCurveTo(14, 46, 15, 31);
  ctx.lineTo(15, 19);
  ctx.quadraticCurveTo(15, 13, 10, 14);
  ctx.lineTo(10, 17);
  ctx.lineTo(5, 3);
  ctx.quadraticCurveTo(2, -2, -2, 1);
  ctx.quadraticCurveTo(-5, 3, -3, 8);
  ctx.lineTo(0, 19);
  ctx.quadraticCurveTo(-3, 15, -8, 17);
  ctx.quadraticCurveTo(-13, 19, -12, 27);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // 소매 단추 두 개
  ctx.beginPath(); ctx.arc(-3, 40, 1.9, 0, Math.PI * 2);
  ctx.arc(4, 41, 1.9, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(34,48,92,0.5)"; ctx.fill();
  ctx.restore();
}

// ---------- HUD ----------

// 상단 문제 배너: 크림색 캔디 패널 + 굵은 테두리 + 양쪽 별 장식
// drawCuteBanner가 실제로 차지할 세로 높이(캔버스 맨 위 기준)를 미리 계산한다 —
// 배너 바로 아래에 다른 요소를 겹치지 않게 배치해야 할 때 쓴다. lines는 각 줄의
// size만 있으면 되고(텍스트 내용은 너비 계산에만 쓰이므로 여기선 필요 없다).
export function bannerHeight(dims, lines, fluidPx, opts = {}) {
  const padY = fluidPx(dims, 13, { min: 9, max: 19 });
  const gap = fluidPx(dims, 6, { min: 4, max: 10 });
  const top = opts.top ?? fluidPx(dims, 10, { min: 6, max: 18 });
  const sizes = lines.map((l) => fluidPx(dims, l.size ?? 22));
  const boxH = sizes.reduce((s, sz) => s + sz, 0) + gap * (sizes.length - 1) + padY * 2;
  return top + boxH;
}

export function drawCuteBanner(ctx, dims, lines, fluidPx, opts = {}) {
  const { w } = dims;
  const padX = fluidPx(dims, 26, { min: 16, max: 38 });
  const padY = fluidPx(dims, 13, { min: 9, max: 19 });
  const gap = fluidPx(dims, 6, { min: 4, max: 10 });
  const top = opts.top ?? fluidPx(dims, 10, { min: 6, max: 18 });

  ctx.save();
  const measured = lines.map((l) => {
    const size = fluidPx(dims, l.size ?? 22);
    ctx.font = `900 ${size}px sans-serif`;
    return { ...l, size, width: ctx.measureText(l.text).width };
  });
  const boxW = Math.min(w * 0.95, Math.max(...measured.map((m) => m.width)) + padX * 2.6);
  const boxH = measured.reduce((s, m) => s + m.size, 0) + gap * (measured.length - 1) + padY * 2;
  const cx = w / 2, cy = top + boxH / 2;
  const radius = fluidPx(dims, 22, { min: 14, max: 30 });

  drawStickerRect(ctx, cx, cy, boxW, boxH, radius, CUTE.cream, {
    lineWidth: fluidPx(dims, 5, { min: 3, max: 7 }),
    drop: fluidPx(dims, 6, { min: 4, max: 9 }),
  });

  // 양 끝 별 — 배너를 리본처럼 보이게 하는 작은 장치
  const starR = fluidPx(dims, 11, { min: 7, max: 15 });
  for (const s of [-1, 1]) {
    drawSparkle(ctx, cx + s * (boxW / 2 - starR * 1.5), cy - boxH / 2 + starR * 1.2, starR, CUTE.sun, 0.3);
  }

  let y = top + padY;
  for (const m of measured) {
    if (m.chunky) {
      drawChunkyText(ctx, m.text, cx, y + m.size / 2, m.size, m.color ?? CUTE.sun, {
        outline: CUTE.ink, outlineWidth: Math.max(3, m.size * 0.18),
      });
    } else {
      ctx.font = `${m.weight ?? "900"} ${m.size}px sans-serif`;
      ctx.fillStyle = m.color ?? CUTE.ink;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(m.text, cx, y + m.size / 2);
    }
    y += m.size + gap;
  }
  ctx.restore();
  return top + boxH;
}

// 남은 개수/수집 현황을 보여주는 동글동글한 점들
export function drawPips(ctx, dims, cx, cy, total, filled, fluidPx) {
  const r = fluidPx(dims, 13, { min: 9, max: 18 });
  const gap = r * 2.7;
  for (let i = 0; i < total; i++) {
    const x = cx + (i - (total - 1) / 2) * gap;
    drawSticker(ctx, x, y0(cy), r, i < filled ? CUTE.sun : "rgba(255,255,255,0.45)", {
      lineWidth: Math.max(2.5, r * 0.22), drop: r * 0.18,
    });
    if (i < filled) drawSparkle(ctx, x, y0(cy), r * 0.55, "#fff", 0.4);
  }
  function y0(v) { return v; }
}

// 난이도 별 뱃지 (우하단)
export function drawLevelStars(ctx, dims, level, fluidPx) {
  const r = fluidPx(dims, 12, { min: 8, max: 16 });
  const y = dims.h - r * 2.2;
  for (let i = 0; i < 3; i++) {
    const x = dims.w - r * 2.2 - (2 - i) * r * 2.4;
    ctx.save();
    ctx.globalAlpha = i < level ? 1 : 0.28;
    drawSparkle(ctx, x, y, r, i < level ? CUTE.sun : "#ffffff", 0.3);
    ctx.restore();
  }
}
