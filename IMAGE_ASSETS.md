# 🎨 종목 썸네일 6장 — 제작 프롬프트

6학년판(`motion-math-olympics-6th`) 랜딩의 종목 카드 그림입니다.
지금은 파일이 없어서 이모지로 자동 대체되고 있습니다.

---

## 📐 규격 — 왜 2:1인가

실제 화면에서 썸네일이 들어가는 칸을 재 봤습니다.

| 기기 | 썸네일 칸 (CSS px) | 가로:세로 |
|---|---|---|
| 아이패드 1180×820 (가로) | 329 × 162 | **2.03** |
| 아이패드 1024×768 (가로) | 277 × 140 | **1.97** |
| 노트북 1366×768 | 391 × 139 | 2.82 |

카드에 그림이 들어가면 이름·설명 글줄이 자동으로 숨겨져서, 칸이 **가로로 길쭉해집니다.**
5학년판 규격(1000×750, 4:3)을 그대로 쓰면 `object-fit: contain` 때문에 **좌우가 3분의 1씩 비고 그림만 작아집니다.**

| 항목 | 값 |
|---|---|
| **비율** | **2 : 1** (가로가 세로의 두 배) |
| **저장 크기** | **1200 × 600** |
| **용량** | 장당 **150KB 이하** (6장 합쳐 1MB 미만) |
| **형식·이름** | PNG · `assets/thumb1.png` ~ `thumb6.png` |

**왜 1200×600인가**: 가장 크게 뜨는 경우가 391 CSS px이고 화면 배율이 2배이니 실제로 필요한 건 **782px**입니다.
1200px면 여유가 충분하고, 그보다 크게 넣어봐야 용량만 늘고 선명해지지 않습니다.
**생성은 크게(2048×1024 이상) 하고 저장할 때 1200×600으로 줄이세요** — 그래야 선이 깔끔합니다.

> 잘라내지 않고 남는 자리를 비우는 방식이라 비율이 조금 달라도 깨지지는 않습니다.
> 다만 2:1에서 멀어질수록 그림이 작아 보입니다.

---

## 🎮 공통 스타일 (6개 프롬프트 앞에 그대로 붙이세요)

```
Nintendo-style game card illustration, in the spirit of Mario Party and Nintendo
Switch game select screens. Cute and playful, made for 12-year-old kids.

Style: chunky rounded shapes, glossy toy-like surfaces with soft specular
highlights, smooth cel shading with gentle gradients, THICK rounded dark-navy
outlines on everything, bright saturated candy colors. Crisp, polished,
high-detail finish like official Nintendo promotional art.

Character: one cute chibi Korean elementary student — big round head, small body,
large sparkling eyes with white light reflections, round rosy cheeks, joyful
open-mouth smile, simple hair. Bouncy exaggerated action pose with
squash-and-stretch energy and small motion streaks. Tiny star and sparkle accents.

Composition: WIDE 2:1 banner. The character occupies one side, the math element
floats on the other side, clearly separated so both read at a glance.
Everything important stays inside the middle 90% of the frame.
Clean flat background in the accent color's palest tint — no scenery,
no landscape, no gradient sky, no clutter.
Rounded-rectangle card frame around the whole image in the accent color.

Numbers and math symbols must be large, bold and perfectly clean.
Aspect ratio 2:1, wide banner, high resolution.
```

**네거티브 프롬프트** (넣을 수 있는 도구면 꼭 넣으세요)
```
blurry, muddy colors, flat lifeless shading, dull grey background, cluttered
background, busy scenery, extra limbs, deformed hands, watermark, photorealistic,
3d render, garbled text, tiny details, thin lines, low contrast
```

> **한 종목당 4장씩 뽑아 고르시길** 권합니다. 특히 손 모양과 숫자가 잘 나온 것을 고르세요.

---

## ✍️ 제목 글자 — 두 가지 길

그림 안에 종목 이름이 들어가면, 앱이 카드의 글자 제목을 자동으로 숨깁니다(5학년판과 같은 방식).

**A안 (5학년판과 동일 · 추천)** — 그림 왼쪽 위에 **알약 배지 `종목 N`** + 그 옆에 **종목 이름**을 넣습니다.
각 프롬프트 끝의 `[제목 글자]`를 프롬프트에 그대로 붙이세요.
한글을 잘 쓰는 생성기(Gemini / Nano Banana 계열)면 대체로 나옵니다. 깨지면 B안으로 가세요.

**B안** — 글자 없이 그림만 뽑고, 캔바·파워포인트에서 제목을 얹습니다.
글꼴은 굵은 고딕(주아체 계열), 배지는 액센트색 알약, 위치는 **왼쪽 위 모서리**.

> **C안도 가능합니다** — 그림에 글자를 전혀 안 넣고 싶으시면 말씀해 주세요.
> CSS 한 줄(`.card.has-thumb .card-name{display:none}`)만 지우면 앱이 종목 이름을 글자로 계속 보여줍니다.

---

## 🖼 종목별 프롬프트

액센트색은 랜딩 카드 테두리 색과 맞췄습니다. 그림 테두리를 같은 색으로 하면 카드와 하나처럼 보입니다.

---

### thumb1.png — 분수 코트 스매시 · 분수의 나눗셈 (액센트 `#ff6b6b` 코랄레드)

```
[공통 스타일]

Accent color: coral red #ff6b6b.

Right side: a cheerful chibi BOY with a bouncy hairstyle and a red headband,
white sports shirt and red shorts, leaping with his badminton racket raised high
overhead in a full smash swing, a glossy white shuttlecock blasting away from the
racket with a bright impact burst and speed streaks.

Left side: a wide horizontal number-line bar floating like a game HUD element,
glossy white with a thick dark-navy outline, marked "0" at its left end and "1" at
its right end, divided by four evenly spaced tick marks. One tick glows bright
coral with a shining landing marker on it. Above the bar floats a rounded plaque
showing the fraction division "3/4 ÷ 3" in big bold digits.

Coral red and warm pink accents.
```
`[제목 글자]` 왼쪽 위 알약 배지 **종목1** / 그 옆 제목 **분수 코트 스매시**

---

### thumb2.png — 소수점 사격장 · 소수의 나눗셈 (액센트 `#4dabf7` 하늘파랑)

```
[공통 스타일]

Accent color: sky blue #4dabf7.

Left side: a chibi GIRL with a short bob and blue safety goggles, standing in
profile in a steady shooting stance, one arm stretched straight forward with the
index finger pointing like a pretend gun, the other hand raised beside her chest,
one eye squinted in concentration, tiny focus sparks around her. A thin glowing
dashed aiming line runs from her fingertip across the frame.

Right side: three round shooting targets on small stands in a row, ALL EXACTLY THE
SAME shape and the same blue color, showing the numbers "0.21", "2.1", "21" in big
bold black digits — the aiming line points at the middle one. Above them floats a
rounded plaque with the division "8.4 ÷ 4 = ?".

Sky blue and cyan accents.
```
`[제목 글자]` 왼쪽 위 알약 배지 **종목2** / 그 옆 제목 **소수점 사격장**

> ⚠️ 표적 셋은 **반드시 같은 색·같은 모양**이어야 합니다. 색이 다르면 계산 안 하고 색으로 고릅니다.

---

### thumb3.png — 쌓기나무 관제탑 · 공간과 입체 (액센트 `#51cf66` 프레시그린)

```
[공통 스타일]

Accent color: fresh green #51cf66.

Left side: a chibi BOY with a green headset, swinging one arm wide across his body
in a big sweeping gesture, body leaning into the motion, excited grin. Two thick
curved green motion arrows arc around his swinging hand showing the sweep.

Right side: a glossy stack of pastel mint cube blocks — a staircase-shaped solid of
about six cubes, drawn in clean oblique projection with thick dark-navy outlines and
three visible faces per cube. Below the stack sit three small square panels in a row,
each a 3x3 grid; two panels have some squares filled dark green, the third panel is
empty with a glowing dashed outline and a question mark.

Fresh green and lime accents.
```
`[제목 글자]` 왼쪽 위 알약 배지 **종목3** / 그 옆 제목 **쌓기나무 관제탑**

---

### thumb4.png — 비례 스파이크 · 비례식과 비례배분 (액센트 `#ffa94d` 오렌지)

```
[공통 스타일]

Accent color: warm orange #ffa94d.

Left side: a chibi GIRL with a high ponytail and an orange sports headband, caught
at the very peak of a vertical jump, right arm swinging down hard in a volleyball
spike, a glossy volleyball blasting away with sharp impact lines. Small upward
motion arrows under her feet show how high she jumped.

Right side: a volleyball court floor tile seen at a slight angle, split into TWO
zones by one bright glowing divider line — the left zone clearly larger than the
right. The left zone shows a big bold "24", the right zone a big bold "16".
Above the court floats a rounded plaque with the ratio "3 : 2".

Orange and amber accents.
```
`[제목 글자]` 왼쪽 위 알약 배지 **종목4** / 그 옆 제목 **비례 스파이크**

---

### thumb5.png — 원 과녁 샤프슈터 · 원의 넓이 (액센트 `#da77f2` 퍼플)

```
[공통 스타일]

Accent color: purple #da77f2.

Left side: a chibi BOY in a white shirt and purple archery arm-guard, standing in
profile in a full archery stance — left arm stretched straight forward holding the
bow, right fist pulled all the way back beside his cheek, bowstring drawn taut and
bending the bow, one eye squinted, determined grin.

Right side: a large round archery target made of four concentric rings (white,
dark navy, blue, gold from outside in) with thick outlines between rings, standing
on a small tripod. One arrow with purple fletching is stuck in the second ring, a
thin dashed arc tracing its flight. A rounded plaque floats beside it reading
"20 x 20 x 3.14 = ?".

Purple and magenta accents.
```
`[제목 글자]` 왼쪽 위 알약 배지 **종목5** / 그 옆 제목 **원 과녁 샤프슈터**

---

### thumb6.png — 우주 화물 수송대 · 원기둥·원뿔·구 (액센트 `#3bc9db` 터콰이즈)

```
[공통 스타일]

Accent color: turquoise #3bc9db.

Left side: a chibi GIRL with twin buns in a turquoise space suit, facing forward in
a half-squat with knees bent, BOTH ARMS STRETCHED WIDE straight out to the sides,
big determined grin. A glossy translucent turquoise CYLINDER is overlaid on her
body like a hologram: its circular base spans exactly the width of her outstretched
arms, with a horizontal double-headed arrow labeled "r" across it, and its height
matches her squat with a vertical double-headed arrow labeled "h".

Right side: a rounded spaceship cargo panel showing "V = 3140" in big bold digits,
with two or three small glossy cargo crates and star sparkles floating around it.

Turquoise and mint accents.
```
`[제목 글자]` 왼쪽 위 알약 배지 **종목6** / 그 옆 제목 **우주 화물 수송대**

---

## 📥 만든 뒤 넣는 법

1. `assets/` 폴더에 **정확히 이 이름**으로 저장 — `thumb1.png` … `thumb6.png`
   (한글 파일명은 배포 후 404가 납니다. 반드시 영문)
2. **1200 × 600 으로 줄이고** 용량을 150KB 이하로 맞추세요. 맥에서 한 번에 처리하려면:

```bash
cd ~/Desktop/클로드/motion-math-olympics-6th/assets && for f in thumb*.png; do sips -Z 1200 "$f" --out "$f"; done && ls -lh thumb*.png
```

3. 파일만 넣으면 앱이 자동으로 이모지 대신 그림을 씁니다. 코드 수정은 필요 없습니다.
4. 저에게 말씀해 주시면 확인하고 배포까지 처리해 드립니다.

---

## 🧩 아직 안 만든 다른 그림 (급하지 않음)

| 파일 | 크기 | 상태 |
|---|---|---|
| `help1.png` `help2.png` | 926×730 | ⚠️ 5학년판 것이 들어 있음 — "두 손" 기준이라 온몸 기준으로 교체 필요 |
| `og-image.png` | 1200×630 | ❌ 없음 — 카톡·밴드 공유 미리보기 |
| `favicon.png` | 512×512 | ❌ 없음 — 탭 아이콘 |
| `button1~3.png` | 1024×1024 | ✅ 그대로 써도 됨 (아이콘만 있어 학년 무관) |

이 네 가지 프롬프트는 `../수학올림픽6학년_제안서.md` 7장에 있습니다.
