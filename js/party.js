// 마리오파티풍 "파티 레이어" — 6학년판 공통 모듈 (5학년판에서 이어받음)
//
// 3학년판은 종목 6개가 각자 60초를 돌고 끝나서 종목끼리 이어지는 재미가 없었다.
// 여기서는 마리오파티처럼 (1) 마스코트가 룰을 설명하고 (2) 정답마다 코인이 튀어 오르고
// (3) 콤보가 쌓이면 피버 타임이 오고 (4) 끝나면 시상대에서 코인이 별로 환산되는
// 흐름을 6종목이 똑같이 쓰도록 한곳에 모아 둔다. 각 게임은 자기 문제·판정만 짜면 된다.

import {
  CUTE, drawSticker, drawStickerRect, drawChunkyText,
} from "./cute.js";
import { SmoothedPoint } from "./engine.js";

// 기존 CUTE 팔레트에 파티용 3색을 더한다
export const PARTY = {
  gold: "#ffd43b", goldDark: "#e8a90c",
  mint: "#63e6be", mintDark: "#0ca678",
  sky: "#a5d8ff", skyDeep: "#74c0fc",
  grass: "#8ce99a", grassDark: "#40c057",
};

// ---------------------------------------------------------------------------
// 마스코트 6마리 — 종목마다 담당 캐릭터가 룰 설명·응원·아쉬움을 다 표현한다.
// 이모지 기반이라 이미지 파일 없이 바로 동작하고, 나중에 그림으로 교체할 수 있다.
// ---------------------------------------------------------------------------
// 종목별 아이콘과 색.
// 예전에는 종목마다 동물 캐릭터(🦅 셔틀 · 🐨 돌리 …)가 있어서 룰카드에서 말을 걸고
// 경기 중에도 화면 구석에 떠 있었다. 게임 내용과 아무 상관이 없어 화면만 어지럽혔다.
// 이제는 <그 종목의 운동 아이콘>만 쓴다.
export const UNIT_THEME = {
  n1: { icon: "🏸", color: CUTE.red },
  n2: { icon: "🎯", color: CUTE.blue },
  n3: { icon: "🧊", color: CUTE.green },
  n4: { icon: "🪢", color: CUTE.orange },
  n5: { icon: "⭕", color: CUTE.purple },
  n6: { icon: "🛢️", color: CUTE.cyan },
};

// 표정 5종 — 캐릭터 아래에 작게 붙는 기분 뱃지

// ---------------------------------------------------------------------------
// 양손 입력 — 이 학년판의 핵심.
//
// 6종목 중 절반이 "두 손 사이의 간격/자리"로 답을 만들기 때문에, 어느 쪽이 왼손이고
// 어느 쪽이 오른손인지가 프레임마다 흔들리면 안 된다. x좌표로 갈라 항상 같은 쪽에
// 배정하고, 이동평균으로 떨림을 줄인다.
//
// 모드별 대체 수단:
//  - motion: 실제 두 손
//  - touch : 두 손가락 멀티터치
//  - mouse : 손이 하나뿐이므로 각 게임이 알아서 대체한다(가까운 쪽 잡기·자동 미러 등)
// ---------------------------------------------------------------------------
export class HandPair {
  constructor(n = 6) {
    this.ls = new SmoothedPoint(n);
    this.rs = new SmoothedPoint(n);
    this.left = null;
    this.right = null;
    this.both = false;
    this.missingSince = performance.now();
  }
  update(cursors) {
    if (cursors.length >= 2) {
      const s = [...cursors].sort((a, b) => a.x - b.x);
      const a = s[0], b = s[s.length - 1];
      this.left = this.ls.push(a.x, a.y);
      this.right = this.rs.push(b.x, b.y);
      this.both = true;
      this.missingSince = 0;
    } else {
      // 한 손만 잡히면 즉시 끊지 않고 잠깐 마지막 위치를 유지한다 —
      // 인식이 한두 프레임 깜빡였다고 만들던 게이트가 무너지면 아이가 억울하다
      if (this.both && this.missingSince === 0) this.missingSince = performance.now();
      if (this.missingSince && performance.now() - this.missingSince > 400) {
        this.both = false;
        this.ls.reset(); this.rs.reset();
        this.left = null; this.right = null;
      }
    }
    return this;
  }
  get width() { return this.both ? Math.abs(this.right.x - this.left.x) : 0; }
  reset() {
    this.ls.reset(); this.rs.reset();
    this.left = null; this.right = null; this.both = false;
    this.missingSince = performance.now();
  }
}

// "두 손을 보여주세요" 안내 — 양손 종목에서 한 손만 잡힐 때 화면 가운데에 띄운다
export function drawTwoHandHint(ctx, dims, fluidPx) {
  const { w, h } = dims;
  const size = fluidPx(dims, 26, { min: 18, max: 34 });
  ctx.save();
  ctx.globalAlpha = 0.55 + Math.sin(performance.now() / 320) * 0.25;
  drawChunkyText(ctx, "🙌 두 손을 보여주세요!", w / 2, h * 0.52, size, "#fff", {
    outline: CUTE.ink, outlineWidth: Math.max(4, size * 0.22),
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 배경 — 파스텔 하늘 + 뭉게구름 + 잔디 언덕
// 터치/마우스 모드에서 카메라 영상 대신 깔린다. 모션 모드에서는 쓰지 않는다.
// ---------------------------------------------------------------------------
export function drawPartyBackdrop(ctx, dims) {
  const { w, h } = dims;
  const t = performance.now() / 1000;
  ctx.save();
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#cdeafd");
  sky.addColorStop(0.55, "#e7f5ff");
  sky.addColorStop(1, "#fff4e6");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 뭉게구름 — 원 세 개를 겹쳐 그린 단순한 형태가 제일 아기자기하다
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 4; i++) {
    const cw = w * (0.12 + i * 0.02);
    const cx = ((t * (6 + i * 3) + i * w * 0.31) % (w + cw * 3)) - cw * 1.5;
    const cy = h * (0.1 + i * 0.055);
    ctx.beginPath();
    ctx.arc(cx, cy, cw * 0.34, 0, Math.PI * 2);
    ctx.arc(cx + cw * 0.32, cy - cw * 0.1, cw * 0.26, 0, Math.PI * 2);
    ctx.arc(cx - cw * 0.3, cy + cw * 0.04, cw * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  // 잔디 언덕 두 겹
  for (const [k, col] of [[0.86, "#b2f2bb"], [0.92, PARTY.grass]]) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * k);
    ctx.quadraticCurveTo(w * 0.3, h * (k - 0.05), w * 0.55, h * k);
    ctx.quadraticCurveTo(w * 0.8, h * (k + 0.04), w, h * (k - 0.02));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 관중석 — 화면 맨 위에 작은 얼굴들이 줄지어 앉아 좌우로 흔들며 응원한다.
// 정답 순간 cheerUntil을 미래로 밀면 다 같이 만세를 부른다.
// ---------------------------------------------------------------------------
const CROWD_COLORS = [CUTE.red, CUTE.blue, CUTE.green, CUTE.purple, CUTE.orange, CUTE.cyan, CUTE.pink];

export function drawCrowd(ctx, dims, cheerUntil = 0) {
  const { w, h } = dims;
  // 상단은 코인·시간 알약과 문제 배너가 쓰는 자리라, 관중은 맨 위에 얇은 띠로만 앉힌다
  const r = Math.max(5, Math.min(11, w / 88));
  const y = h * 0.042;
  const n = Math.ceil(w / (r * 2.7));
  const now = performance.now();
  const cheering = now < cheerUntil;
  ctx.save();
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (w / n);
    const sway = Math.sin(now / 380 + i * 0.9) * r * 0.35;
    const jump = cheering ? Math.abs(Math.sin(now / 110 + i)) * r * 1.5 : 0;
    const col = CROWD_COLORS[i % CROWD_COLORS.length];
    drawSticker(ctx, x + sway, y - jump, r, col, { lineWidth: Math.max(2, r * 0.2), drop: r * 0.14, gloss: false });
    // 눈 두 개만 찍어도 관중처럼 보인다
    ctx.fillStyle = CUTE.ink;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + sway + s * r * 0.32, y - jump - r * 0.05, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    if (cheering) {
      ctx.font = `${r * 1.1}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("🙌", x + sway, y - jump - r * 1.5);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 코인 — 마리오파티의 그 코인. 정답 시 튀어 올랐다가 상단 카운터로 빨려 들어간다.
// ---------------------------------------------------------------------------
export function drawCoin(ctx, x, y, r, spin = 0) {
  // 회전하는 동전처럼 보이도록 가로 폭만 줄인다
  const sx = Math.abs(Math.cos(spin));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.max(0.12, sx), 1);
  ctx.beginPath(); ctx.arc(0, r * 0.16, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(34,48,92,0.25)"; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = PARTY.gold; ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.17); ctx.strokeStyle = PARTY.goldDark; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = Math.max(1.5, r * 0.13); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 판정 텍스트 — 반응이 빠를수록 좋은 말이 나온다
// ---------------------------------------------------------------------------
const JUDGE = {
  perfect: { text: "퍼펙트!", color: PARTY.gold },
  nice: { text: "나이스!", color: PARTY.mint },
  good: { text: "굿!", color: CUTE.sky ?? PARTY.sky },
};
export function judgeKind(elapsedMs) {
  if (elapsedMs < 2200) return "perfect";
  if (elapsedMs < 4200) return "nice";
  return "good";
}

// ---------------------------------------------------------------------------
// Party — 게임 한 판의 파티 상태(코인·콤보·피버·연출)를 통째로 맡는 클래스.
// 각 게임은 correct()/wrong()만 불러 주면 나머지 연출이 알아서 따라온다.
// ---------------------------------------------------------------------------
export class Party {
  constructor({ unit, sound, isMuted }) {
    this.unit = unit;
    this.sound = sound;
    this.isMuted = isMuted || (() => false);
    this.reset();
  }

  reset() {
    this.coins = 0;
    this.shownCoins = 0;   // 카운터에 실제로 표시되는 값(코인이 도착할 때마다 오른다)
    this.combo = 0;
    this.maxCombo = 0;
    this.feverUntil = 0;
    this.cheerUntil = 0;
    this.moodUntil = 0;
    this.mood = "idle";
    this.flyers = [];      // 날아가는 코인
    this.judges = [];      // 판정 텍스트
    this.hudCoinPos = { x: 0, y: 0 };
  }

  get fever() { return performance.now() < this.feverUntil; }

  setMood(mood, ms = 900) { this.mood = mood; this.moodUntil = performance.now() + ms; }

  currentMood(remainMs) {
    if (performance.now() < this.moodUntil) return this.mood;
    if (this.fever) return "combo";
    if (remainMs !== undefined && remainMs < 10000) return "hurry";
    return "idle";
  }

  // 정답 — 코인을 뿌리고 콤보를 올린다. base는 이 종목의 정답 1회당 기본 코인.
  correct(x, y, { base = 10, elapsedMs = 3000 } = {}) {
    const kind = judgeKind(elapsedMs);
    const bonus = kind === "perfect" ? 5 : kind === "nice" ? 2 : 0;
    const mult = this.fever ? 2 : 1;
    const gain = (base + bonus) * mult;

    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.coins += gain;
    this.cheerUntil = performance.now() + 1100;
    this.setMood("happy", 1000);
    this.judges.push({ x, y, ...JUDGE[kind], born: performance.now(), life: 900, mult });

    // 코인 여러 개로 쪼개서 뿌리면 훨씬 푸짐해 보인다 (최대 8개)
    const n = Math.min(8, Math.max(3, Math.round(gain / 4)));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 180 + Math.random() * 260;
      this.flyers.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        born: performance.now(), phase: "burst", spin: Math.random() * Math.PI,
        value: Math.round(gain / n),
      });
    }

    // 콤보 5에서 피버 — 8초 동안 코인 2배
    if (this.combo > 0 && this.combo % 5 === 0) {
      this.feverUntil = performance.now() + 8000;
      this.judges.push({
        x, y: y - 46, text: "🔥 피버 타임!", color: CUTE.orange,
        born: performance.now(), life: 1200, mult: 1,
      });
      if (!this.isMuted()) this.sound.fever();
    }
    if (!this.isMuted()) { this.sound.correct(); setTimeout(() => { if (!this.isMuted()) this.sound.pop(); }, 90); }
    return gain;
  }

  // 정답·오답 판정과 상관없는 짧은 안내를 띄운다 (빗나감, 퍼펙트 보너스 같은 것).
  // 콤보나 기분에는 손대지 않는다.
  judge(x, y, text, color = PARTY.gold) {
    this.judges.push({ x, y, text, color, born: performance.now(), life: 900, mult: 1 });
  }

  // 오답 — 점수를 깎지 않는다. 콤보만 끊고 캐릭터가 아쉬워한다.
  wrong(x, y, message = "괜찮아!") {
    this.combo = 0;
    this.feverUntil = 0;
    this.setMood("sad", 900);
    this.judges.push({ x, y, text: message, color: CUTE.red, born: performance.now(), life: 900, mult: 1 });
    if (!this.isMuted()) this.sound.fizzle();
  }

  update(dt) {
    const now = performance.now();
    const target = this.hudCoinPos;
    for (const f of this.flyers) {
      const age = now - f.born;
      f.spin += dt * 9;
      if (f.phase === "burst") {
        f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 900 * dt;
        if (age > 420) { f.phase = "fly"; f.flyFrom = { x: f.x, y: f.y }; f.flyAt = now; }
      } else {
        // 상단 카운터로 빨려 들어가기 (0.42초)
        const t = Math.min(1, (now - f.flyAt) / 420);
        const e = t * t * (3 - 2 * t);
        f.x = f.flyFrom.x + (target.x - f.flyFrom.x) * e;
        f.y = f.flyFrom.y + (target.y - f.flyFrom.y) * e;
        if (t >= 1) { f.done = true; this.shownCoins += f.value; }
      }
    }
    this.flyers = this.flyers.filter((f) => !f.done);
    this.judges = this.judges.filter((j) => now - j.born < j.life);
    // 코인이 도중에 사라져도 카운터는 결국 실제 값을 따라잡게 한다
    if (this.flyers.length === 0 && this.shownCoins !== this.coins) this.shownCoins = this.coins;
  }

  drawFx(ctx, dims) {
    const now = performance.now();
    const r = Math.max(9, Math.min(18, dims.w / 52));
    for (const f of this.flyers) drawCoin(ctx, f.x, f.y, r, f.spin);
    for (const j of this.judges) {
      const t = (now - j.born) / j.life;
      const scale = t < 0.3 ? 0.6 + (t / 0.3) * 0.6 : 1.2 - (t - 0.3) * 0.25;
      ctx.save();
      ctx.globalAlpha = t > 0.72 ? Math.max(0, 1 - (t - 0.72) / 0.28) : 1;
      ctx.translate(j.x, j.y - t * 42);
      ctx.scale(scale, scale);
      const size = Math.max(20, Math.min(46, dims.w / 20));
      drawChunkyText(ctx, j.mult > 1 ? `${j.text} ×2` : j.text, 0, 0, size, j.color, {
        outline: CUTE.ink, outlineWidth: Math.max(4, size * 0.2),
      });
      ctx.restore();
    }
  }

  // 피버 중에는 화면 테두리에 무지개 광선이 흐른다
  drawFeverFrame(ctx, dims) {
    if (!this.fever) return;
    const { w, h } = dims;
    const t = performance.now() / 420;
    const lw = Math.max(6, Math.min(16, w / 90));
    const g = ctx.createLinearGradient(0, 0, w, h);
    for (let i = 0; i <= 6; i++) {
      g.addColorStop(i / 6, `hsl(${(t * 40 + i * 60) % 360} 95% 62%)`);
    }
    ctx.save();
    ctx.globalAlpha = 0.75 + Math.sin(t * 3) * 0.2;
    ctx.strokeStyle = g;
    ctx.lineWidth = lw;
    ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
    ctx.restore();
  }

  // 좌상단 코인 알약 + 우상단 시계 알약. 가운데는 각 게임의 문제 배너 자리로 비워 둔다.
  drawHud(ctx, dims, { remainMs = 0, count = 0, suffix = "" } = {}) {
    const { w, h } = dims;
    // 맨 위 관중 띠를 피해서 그 아래에 앉힌다
    const padY = Math.max(8, h * 0.078);
    const fs = Math.max(13, Math.min(24, Math.min(w, h) / 34));
    const pillH = fs * 2.1;
    const rad = pillH / 2;

    // 왼쪽: 🪙 코인 · 🔥 콤보
    const leftText = `${this.shownCoins}${this.combo >= 2 ? `   🔥${this.combo}` : ""}`;
    ctx.save();
    ctx.font = `900 ${fs}px sans-serif`;
    const lw = ctx.measureText(leftText).width + pillH * 1.9;
    const lx = padY + lw / 2, ly = padY + pillH / 2;
    drawStickerRect(ctx, lx, ly, lw, pillH, rad, this.fever ? PARTY.gold : CUTE.cream, {
      lineWidth: Math.max(3, fs * 0.2), drop: fs * 0.22,
    });
    drawCoin(ctx, lx - lw / 2 + pillH * 0.62, ly, fs * 0.62, performance.now() / 240);
    ctx.fillStyle = CUTE.ink;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(leftText, lx - lw / 2 + pillH * 1.15, ly);
    this.hudCoinPos = { x: lx - lw / 2 + pillH * 0.62, y: ly };

    // 오른쪽: ⏱ 남은 시간 (10초 이하면 빨갛게 두근거린다)
    const sec = Math.ceil(remainMs / 1000);
    const urgent = sec <= 10;
    const rText = `⏱ ${sec}초${suffix ? `   🏅 ${count}${suffix}` : ""}`;
    ctx.font = `900 ${fs}px sans-serif`;
    const rw = ctx.measureText(rText).width + pillH * 1.1;
    const rx = w - padY - rw / 2, ry = padY + pillH / 2;
    const puls = urgent ? 1 + Math.sin(performance.now() / 130) * 0.05 : 1;
    ctx.save();
    ctx.translate(rx, ry); ctx.scale(puls, puls); ctx.translate(-rx, -ry);
    drawStickerRect(ctx, rx, ry, rw, pillH, rad, urgent ? CUTE.red : CUTE.cream, {
      lineWidth: Math.max(3, fs * 0.2), drop: fs * 0.22,
    });
    ctx.fillStyle = urgent ? "#fff" : CUTE.ink;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(rText, rx, ry);
    ctx.restore();
    ctx.restore();

    return padY * 2 + pillH; // 배너를 이 아래에 두면 겹치지 않는다
  }
}

// ---------------------------------------------------------------------------
// 룰카드 — 게임 시작 전 조작법을 보여 준다.
// 모션 모드에서는 아이가 화면에서 떨어져 있을 수 있어 7초 뒤 자동으로 넘어간다.
// ---------------------------------------------------------------------------
export function showRuleCard({ unit, title, lines, autoMs = 7000 }) {
  return new Promise((resolve) => {
    const theme = UNIT_THEME[unit];
    const panel = document.getElementById("rulePanel");
    if (!panel) { resolve(); return; }
    panel.querySelector(".rule-char").textContent = theme.icon;
    panel.querySelector(".rule-title").textContent = title;
    const ul = panel.querySelector(".rule-list");
    ul.innerHTML = "";
    for (const l of lines) {
      const li = document.createElement("li");
      li.innerHTML = l;
      ul.appendChild(li);
    }
    panel.style.display = "flex";

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      panel.style.display = "none";
      resolve();
    };
    const timer = setTimeout(finish, autoMs);
    panel.querySelector(".rule-go").onclick = finish;
    panel.onclick = (e) => { if (e.target === panel) finish(); };

    // 자동 진행까지 남은 시간을 게이지로 보여 준다
    const bar = panel.querySelector(".rule-timer-fill");
    if (bar) {
      bar.style.transition = "none";
      bar.style.width = "100%";
      requestAnimationFrame(() => {
        bar.style.transition = `width ${autoMs}ms linear`;
        bar.style.width = "0%";
      });
    }
  });
}

// ---------------------------------------------------------------------------
// 시상대 결과 — 코인이 하나씩 세어지며 별로 환산되는 마리오파티식 결과 발표
// ---------------------------------------------------------------------------
export function renderPodium({ unit, medal, label, coins, maxCombo, count, suffix, best }) {
  const theme = UNIT_THEME[unit];
  const host = document.getElementById("podium");
  if (!host) return;

  // 코인 10개 = 별 1개
  const stars = Math.floor(coins / 10);
  const earnedStar = medal !== "🏅";

  // 칭호 — 메달만으로는 "잘했다"는 느낌이 약해서, 코인에 따라 등급을 하나 더 준다.
  // 아무리 못해도 🌱 새싹은 받으므로 빈손으로 끝나는 일이 없다.
  const RANKS = [
    { min: 0,   emoji: "🌱", name: "새싹 선수",   line: "출발이 좋아! 다음엔 더 잘할 수 있어" },
    { min: 40,  emoji: "🏃", name: "도전자",     line: "몸이 잘 풀렸는걸?" },
    { min: 90,  emoji: "🔥", name: "에이스",     line: "오늘 컨디션 최고인데!" },
    { min: 160, emoji: "🌟", name: "슈퍼스타",   line: "관중석이 난리 났어!" },
    { min: 250, emoji: "👑", name: "챔피언",     line: "이건 전설이다…!" },
  ];
  const rank = RANKS.reduce((a, r) => (coins >= r.min ? r : a), RANKS[0]);

  host.innerHTML = `
    <div class="podium-stage">
      <div class="podium-char">${theme.icon}</div>
      <div class="podium-block">
        <div class="podium-medal">${medal}</div>
        <div class="podium-label">${label}</div>
      </div>
    </div>
    <div class="podium-coins">
      <span class="pc-coin">🪙</span>
      <span class="pc-num" id="pcNum">0</span>
      <span class="pc-arrow">→</span>
      <span class="pc-stars" id="pcStars"></span>
    </div>
    <div class="podium-rank"><span class="pr-emoji">${rank.emoji}</span><span class="pr-name">${rank.name}</span></div>
    <div class="podium-line">${rank.line}</div>
  `;

  // 코인 카운트업 — 숫자가 다 올라가면 별이 하나씩 톡톡 뜬다
  const numEl = host.querySelector("#pcNum");
  const starEl = host.querySelector("#pcStars");
  const dur = 900;
  const t0 = performance.now();
  (function tick() {
    const t = Math.min(1, (performance.now() - t0) / dur);
    numEl.textContent = Math.round(coins * (1 - (1 - t) * (1 - t)));
    if (t < 1) requestAnimationFrame(tick);
    else {
      for (let i = 0; i < Math.min(stars, 12); i++) {
        setTimeout(() => {
          const s = document.createElement("span");
          s.className = "pc-star";
          s.textContent = "⭐";
          starEl.appendChild(s);
        }, i * 110);
      }
      if (stars === 0) starEl.textContent = "—";
    }
  })();

  return { stars, earnedStar, rank };
}

// 별 모양 화면 전환 (아이리스 와이프) — 종목을 오갈 때 마리오파티처럼 팍 닫혔다 열린다
export function irisTransition(onMidpoint) {
  const el = document.createElement("div");
  el.className = "iris-wipe";
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("closing"));
  setTimeout(() => { if (onMidpoint) onMidpoint(); }, 420);
}
