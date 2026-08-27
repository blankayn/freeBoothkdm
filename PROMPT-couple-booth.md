# Build prompt: two-person photobooth with partner face-stretching

You are working in `make-a-moment`, an existing React 18 + TypeScript + Vite browser photobooth.
Read the codebase before writing anything. The relevant existing pieces:

- `src/lib/booth/BoothEngine.ts` — single owner of the RAF loop. Pipeline is
  `camera -> WebGL filter -> particles -> stickers -> 2D canvas`. `capture()` reruns that
  *exact same* `drawPass` at 1080×1350. Do not create a second export path.
- `src/lib/filters/FilterEngine.ts` — WebGL**1** (`getContext('webgl')`), one fullscreen quad,
  one fragment shader per `FilterId`, uniforms `u_texture/u_intensity/u_time/u_center/u_aspect/
  u_radius/u_mirror/u_srcOffset/u_srcScale`. `coverCrop()` does object-fit:cover in texture space.
- `src/lib/filters/CanvasFilterRenderer.ts` — the no-WebGL fallback renderer.
- `src/lib/mediapipe/FaceTracker.ts` — MediaPipe FaceLandmarker, `numFaces: 1`, GPU delegate,
  self-throttling (70ms → 220ms) with a `isDegraded` flag. `FACE_LANDMARK` names the indices in use.
- `src/lib/mediapipe/attachments.ts` — `toFrameSpace()` reprojects video-space landmarks through
  the crop + mirror into frame space. **Reuse this. Do not reinvent it.**
- `src/state/photoboothStore.ts` — zustand store. `src/types/photobooth.ts` — `FRAME_WIDTH=1080`,
  `FRAME_HEIGHT=1350`, `SHOT_COUNT=4`, strip layout/style types.

## What we're building

Two people in different places open the same booth. Each sees both faces. **You can grab your
partner's face and stretch it in real time — and they see it happening to themselves.** A shared
countdown fires the shot on both screens at the same instant, mid-stretch. The strip has both of you.

Ship this in two phases. Phase 1 must be fully working and merged before Phase 2 starts.

---

# Phase 1 — Shared room, partner video, synced shutter

## 1.1 Signaling server

New `server/` directory. Node + `ws`, nothing else. Stateless, in-memory.

- `Map<roomCode, Set<WebSocket>>`, max 2 peers per room, evict rooms after 30 min idle.
- Room codes: 5 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no O/0/I/1 — people read these aloud).
- Relays only: `offer`, `answer`, `ice`, `peer-joined`, `peer-left`. It never sees media.
- The first peer in the room is the **impolite** peer, the second is **polite**.

## 1.2 WebRTC

- Use the **perfect negotiation** pattern (polite/impolite + `makingOffer`/`ignoreOffer`) so
  simultaneous offers don't deadlock. Do not hand-roll glare handling.
- STUN: `stun:stun.l.google.com:19302`. **TURN is not optional** — roughly 1 in 6 connections
  needs a relay. Wire `VITE_TURN_URL/VITE_TURN_USER/VITE_TURN_CRED` and document that shipping
  without it means some couples simply never connect.
- Media: `getUserMedia({ video: { width: 1280, height: 720 }, audio: true })`. Audio matters —
  they're on a date, they need to hear each other laugh.
- Two DataChannels:
  - `control` — ordered, reliable. Clock sync, countdown scheduling, shot exchange, presets.
  - `warp` — ordered, reliable. Stroke deltas (see Phase 2). Reliable because warp state is an
    *accumulation*; a dropped packet desyncs the two views permanently.

## 1.3 Clock sync and the shared shutter

This is the feature. Getting it wrong makes the whole product feel broken.

Do **not** send "capture now". Instead:

1. NTP-style handshake over `control`: send `ping{t0}`, peer replies `pong{t0,t1,t2}`, receiver
   notes `t3`. `offset = ((t1 - t0) + (t2 - t3)) / 2`, `rtt = (t3 - t0) - (t2 - t1)`.
2. Take ~10 samples, keep the offset from the **lowest-RTT** sample. Re-sync every 30s.
3. To start a shot, the initiator picks `fireAt = sharedNow() + 3000` and broadcasts it.
   Both clients run their own countdown against `sharedNow()` and capture at `fireAt`.

Target: both shutters within 30ms. Add a `?debug=sync` overlay showing measured offset and RTT.

## 1.4 BoothEngine → two sources

`BoothEngine` currently hardcodes `this.camera.video`. Refactor to a source-agnostic shape:

```ts
interface BoothSource {
  video: HTMLVideoElement;
  isLocal: boolean;
  faceSpace: FaceSpace | null;   // Phase 2
  deformers: Deformer[];         // Phase 2 — warps applied TO this face
}
```

`BoothEngine` holds `local: BoothSource` and `remote: BoothSource | null`.

**Hard constraints:**

- **One WebGL context.** Browsers cap live contexts and `FilterEngine.destroy()` already fights
  for them. Render source A through the single `FilterEngine`, `drawImage` its canvas into region
  A of the 2D canvas, then reuse the same engine for source B. This composes naturally with the
  existing architecture — do not instantiate a second `FilterEngine`.
- **`remote === null` must render byte-identically to today.** The solo booth is shipped; this
  work is purely additive. Add a regression test or golden-image check that proves it.
- Keep the one-`drawPass`-for-preview-and-capture invariant.

Layout: side-by-side on landscape, stacked on portrait. Each source keeps its own `coverCrop`
against its own region aspect.

## 1.5 Capture and strip composition

The remote video is compressed and downscaled — **never capture your partner's face from the
received stream.** Instead:

1. At `fireAt`, *each* client captures its **own** camera at full `FRAME_WIDTH × FRAME_HEIGHT`
   through `drawPass`, with whatever deformers its partner authored already applied.
2. Encode as JPEG q0.85 (~150–300KB), chunk into 16KB frames over `control`, exchange.
3. Both clients now hold two HD frames per shot and can compose locally.

Extend `StripLayout` in `src/types/photobooth.ts` with a slot count so a cell can hold two faces:
add `cellSlots: 1 | 2` and a `duo` layout. `StripRenderer` handles the pairing.

## Phase 1 done when

Two tabs (or two devices) join with a code, see and hear each other, and a countdown produces a
4-shot strip with both faces in it. Solo mode unchanged.

---

# Phase 2 — Grab your partner's face

New directory `src/lib/warp/`.

## 2.1 The key architectural insight

Naive design: run MediaPipe on the remote video too. **Don't.** `FaceTracker` is already the most
expensive thing in the booth and it self-throttles under load — doubling it will tank the frame rate.

Instead: **each client tracks only its own face, and broadcasts a tiny face-space transform.**

```ts
interface FaceSpace {
  ox: number; oy: number;   // eye midpoint, frame space
  scale: number;            // interocular distance
  rot: number;              // eye-line angle
  t: number;                // sample time, for interpolation
}
```

Four floats at 20Hz ≈ 320 B/s, versus ~5.6KB per frame for 478 landmarks. Build it from
`FACE_LANDMARK.RIGHT_EYE_OUTER` (33), `LEFT_EYE_OUTER` (263), `CHIN` (152), after running the
points through the existing `toFrameSpace()`. Interpolate between packets so it doesn't stutter.

Warp geometry is stored **in face space, not screen space.** This is what stops the effect from
sliding off when someone turns their head — the single most common way this feature looks cheap.

## 2.2 Deformers

Don't build a Photoshop-style ping-pong displacement map. WebGL1 float textures need
`OES_texture_float` + `WEBGL_color_buffer_float` and are unreliable on mobile. Use a **fixed
uniform array of deformers** — simpler, deterministic, and the array *is* the wire format.

```ts
interface Deformer {
  type: 0 | 1;        // 0 = drag (translate), 1 = radial (bulge/pinch)
  cx: number; cy: number;   // center, FACE SPACE
  dx: number; dy: number;   // drag delta (type 0) / strength in dx (type 1)
  radius: number;           // face-space units
  bornAt: number;
}
```

- A drag gesture = **one** deformer whose center is pinned at drag-start in face space and whose
  `dx/dy` accumulates as the finger moves. Not one deformer per pointermove event.
- Cap the array. Query `gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)` and set
  `MAX_DEFORMERS = clamp(Math.floor((max - 16) / 2), 4, 32)`. The GLES2 spec floor is 16 vectors;
  real devices give 224+, but check rather than assume.
- Over the cap: oldest deformer decays out over 400ms and is dropped.

## 2.3 Shader

Compose warp with the existing colour filters in a **single pass** — do not add an FBO pass.
Inspect `src/lib/filters/shaders/index.ts` and inject a shared GLSL chunk into every fragment
shader that transforms the sampling UV before the existing filter logic reads the texture.

```glsl
// aspect-correct so falloff is circular on screen, not elliptical
vec2 warpUV(vec2 uv) {
  vec2 asp = vec2(u_aspect, 1.0);
  for (int i = 0; i < DEFORMER_COUNT; i++) {
    vec4 a = u_deformA[i];          // cx, cy, radius, type
    vec4 b = u_deformB[i];          // dx, dy, _, _
    vec2  d = (uv - a.xy) * asp;
    float dist = length(d);
    float f = 1.0 - smoothstep(0.0, a.z, dist);
    f = f * f;                      // squared falloff reads much softer
    if (a.w < 0.5) {
      uv -= b.xy * f;               // drag
    } else {
      uv -= normalize(d + 1e-6) / asp * b.x * f * dist;  // radial
    }
  }
  return uv;
}
```

- GLSL ES 1.00 requires **constant loop bounds**. Compile program variants with
  `#define DEFORMER_COUNT n` bucketed to {4, 8, 16, 32} and pick the smallest that fits the active
  count. Don't rely on dynamic `break` — old drivers choke on it.
- Deformer centers arrive in face space; convert to frame UV on the CPU each frame using the
  current `FaceSpace`, then upload. Never do the face-space transform in the shader.
- The existing texture setup already uses `CLAMP_TO_EDGE + LINEAR`, which is exactly what lets
  displaced samples run past the rim without wrapping. Keep it.

## 2.4 Who warps whom, and where it renders

**Only your partner can warp your face.** This is the whole game — it stops both people fighting
over one face, and halves the state.

So for a warp you author on your partner:

- **You** see it instantly, applied locally to the received remote video. Zero latency.
- **They** see it applied to their own local camera feed once the deformer arrives (~RTT/2).
- Both sides evaluate the same deformer list, so the two views agree.
- **Capture uses their local HD feed**, so the strip gets a clean 1080px warped face, not a
  re-warped compressed stream.

Send a full-state checkpoint every 2s on `warp` so a late joiner or a hiccup resyncs.

## 2.5 Presets — the "random shit" button

Presets anchor to specific landmarks (mouth corners, chin, irises) that only the *owner* of the
face has. So don't expand them on the author's side. Send `{ preset: 'wide-mouth', seed, strength }`
and let the owner expand it into deformers locally using their own landmarks. Tiny wire format,
and it stays correct as their head moves.

Build at least: `bulge-eyes` (irises), `balloon-head`, `tiny-face`, `wide-mouth` (61/291 pulled
apart), `long-chin` (152 down), `potato-nose` (1, radial), `alien` (forehead 10 up, cheeks 234/454 in).

A **Chaos** button picks 3–5 presets with randomized params and fires them at once.

Note: `FaceTracker`'s comment says 468 points, but `face_landmarker.task` returns **478** with
irises at 468–477. Verify `landmarks.length` at runtime and degrade the iris presets if it's 468.

## 2.6 Interaction

- Pointer/touch drag directly on the partner's pane. Brush-size slider. Preset chips. Chaos button.
- Show a small ghost cursor of what your partner is doing to *your* face — seeing the grab coming
  is half the fun.
- `Reset my face` auto-decays all deformers over 20s rather than snapping, with a 10s cooldown so
  it can't just be spammed away.
- Haptics on grab (`navigator.vibrate`), reuse `src/lib/utils/feedback.ts`.

## 2.7 Degradation

- No WebGL (`CanvasFilterRenderer` path): hide warp UI entirely, don't half-ship it.
- `looksLowPowered()` already exists in `src/lib/mediapipe/config.ts` — clamp `MAX_DEFORMERS` to 8
  and drop `FaceSpace` broadcast to 10Hz on those devices.
- If `FaceTracker.isDegraded`, freeze the last good `FaceSpace` rather than letting warps jitter.

---

# Guardrails

- **Do not break solo mode.** Every change is additive; `remote === null` is the existing product.
- One WebGL context. One `drawPass`. One capture path.
- No new client dependencies — WebRTC is native. `ws` on the server is the only addition.
- Must pass `npm run typecheck` and `npm run lint` (`--max-warnings=0`) and match `.prettierrc`.
- `src/lib/mediapipe/config.ts` already has env hooks for self-hosting the wasm + models. Before
  shipping, self-host them — a date night shouldn't depend on a CDN.
- Comment in the register the codebase already uses: explain *why*, not *what*. Match the tone of
  the existing docstrings (e.g. the "sunglasses drift off the face" note in `attachments.ts`).

# Build order

1. Signaling server + room join UI, no media. Prove two peers see each other connect.
2. WebRTC media, two-pane `BoothEngine`. Solo regression check here.
3. Clock sync + shared countdown + frame exchange + duo strip. **Phase 1 ships.**
4. `FaceSpace` extraction and broadcast, with a `?debug=warp` overlay drawing the face-space axes.
5. Deformer array + shader injection, local-only (warp your own face to prove the math).
6. Network the deformers, add ownership rule.
7. Presets + chaos.

Do not skip step 4's debug overlay. Face-space bugs are invisible until you draw the axes.
