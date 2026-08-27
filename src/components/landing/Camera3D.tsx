import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function Camera3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 1.25, 4.2);

    // Lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a33, 0.9));
    const dir = new THREE.DirectionalLight(0xfff0e6, 2.2);
    dir.position.set(3.5, 5, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 20;
    dir.shadow.camera.left = -4;
    dir.shadow.camera.right = 4;
    dir.shadow.camera.top = 4;
    dir.shadow.camera.bottom = -4;
    dir.shadow.bias = -0.0005;
    scene.add(dir);

    const rim = new THREE.PointLight(0xff3b6b, 6, 8);
    rim.position.set(-2.5, 2, -1.5);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.7);
    fill.position.set(-3, 2.5, 2);
    scene.add(fill);

    // Ground catcher (soft contact shadow)
    const groundGeo = new THREE.CircleGeometry(2.2, 64);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.22 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.85;
    ground.receiveShadow = true;
    scene.add(ground);

    // Subtle ground gradient disk
    const gradCanvas = document.createElement('canvas');
    gradCanvas.width = 256;
    gradCanvas.height = 256;
    const gctx = gradCanvas.getContext('2d')!;
    const grad = gctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,59,107,0.18)');
    grad.addColorStop(0.45, 'rgba(139,92,246,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 256, 256);
    const gradTex = new THREE.CanvasTexture(gradCanvas);
    gradTex.colorSpace = THREE.SRGBColorSpace;
    const gradMat = new THREE.MeshBasicMaterial({ map: gradTex, transparent: true, depthWrite: false });
    const gradMesh = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), gradMat);
    gradMesh.rotation.x = -Math.PI / 2;
    gradMesh.position.y = -0.84;
    scene.add(gradMesh);

    // Camera rig
    const rig = new THREE.Group();
    scene.add(rig);

    // Tilt rig slightly for photogenic angle
    rig.rotation.x = 0.08;

    const cameraGroup = new THREE.Group();
    rig.add(cameraGroup);

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x16151a,
      roughness: 0.55,
      metalness: 0.08,
    });
    const bodyMatDark = new THREE.MeshStandardMaterial({
      color: 0x0f0e12,
      roughness: 0.7,
      metalness: 0.05,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xff3b6b,
      roughness: 0.35,
      metalness: 0.15,
    });
    const silverMat = new THREE.MeshStandardMaterial({
      color: 0xe8e6e3,
      roughness: 0.3,
      metalness: 0.45,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a2339,
      roughness: 0.12,
      metalness: 0.0,
      transmission: 0.0,
      transparent: true,
      opacity: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    });
    const lensGlassInner = new THREE.MeshPhysicalMaterial({
      color: 0x1a4a6e,
      roughness: 0.06,
      metalness: 0.0,
      transmission: 0.35,
      thickness: 0.2,
      ior: 1.5,
      transparent: true,
      opacity: 0.95,
      clearcoat: 1,
    });

    // Main body
    const bodyGeo = new THREE.BoxGeometry(2.2, 1.45, 1.0);
    // Bevel edges via secondary smaller box? Keep simple.
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    cameraGroup.add(body);

    // Front plate inset
    const frontPlate = new THREE.Mesh(new THREE.BoxGeometry(2.18, 1.43, 0.06), bodyMatDark);
    frontPlate.position.z = 0.48;
    frontPlate.castShadow = true;
    cameraGroup.add(frontPlate);

    // Top plate
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 1.02), new THREE.MeshStandardMaterial({ color: 0x1e1c22, roughness: 0.5 }));
    topPlate.position.y = 0.73;
    topPlate.castShadow = true;
    cameraGroup.add(topPlate);

    // Viewfinder hump
    const hump = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 0.85), bodyMatDark);
    hump.position.set(0, 0.9, -0.05);
    hump.castShadow = true;
    cameraGroup.add(hump);

    const humpTop = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.06, 0.87), silverMat);
    humpTop.position.set(0, 1.06, -0.05);
    humpTop.castShadow = true;
    cameraGroup.add(humpTop);

    // Hot shoe
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), new THREE.MeshStandardMaterial({ color: 0x111015, roughness: 0.6 }));
    shoe.position.set(0, 1.12, -0.05);
    cameraGroup.add(shoe);

    // Shutter button
    const shutterBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 24), accentMat);
    shutterBtn.position.set(0.75, 0.82, -0.15);
    shutterBtn.castShadow = true;
    cameraGroup.add(shutterBtn);
    const shutterRing = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 24), silverMat);
    shutterRing.position.set(0.75, 0.78, -0.15);
    cameraGroup.add(shutterRing);

    // Dial
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 24), bodyMatDark);
    dial.position.set(-0.75, 0.82, -0.15);
    dial.castShadow = true;
    cameraGroup.add(dial);
    const dialTop = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 24), silverMat);
    dialTop.position.set(-0.75, 0.88, -0.15);
    cameraGroup.add(dialTop);

    // Lens mount - outer ring
    const mountGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.18, 48);
    const mount = new THREE.Mesh(mountGeo, silverMat);
    mount.rotation.x = Math.PI / 2;
    mount.position.set(0, -0.05, 0.62);
    mount.castShadow = true;
    cameraGroup.add(mount);

    const mountRing = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.04, 48), new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4 }));
    mountRing.rotation.x = Math.PI / 2;
    mountRing.position.set(0, -0.05, 0.54);
    cameraGroup.add(mountRing);

    // Lens barrel 1
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.58, 0.42, 48), bodyMat);
    barrel1.rotation.x = Math.PI / 2;
    barrel1.position.set(0, -0.05, 0.88);
    barrel1.castShadow = true;
    cameraGroup.add(barrel1);

    // Focus ring - knurled look via accent ring
    const focusRing = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.14, 48), new THREE.MeshStandardMaterial({ color: 0x25242b, roughness: 0.65 }));
    focusRing.rotation.x = Math.PI / 2;
    focusRing.position.set(0, -0.05, 0.9);
    cameraGroup.add(focusRing);

    // Barrel front
    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.56, 0.18, 48), bodyMatDark);
    barrel2.rotation.x = Math.PI / 2;
    barrel2.position.set(0, -0.05, 1.12);
    barrel2.castShadow = true;
    cameraGroup.add(barrel2);

    // Front accent ring
    const frontRing = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.045, 48), accentMat);
    frontRing.rotation.x = Math.PI / 2;
    frontRing.position.set(0, -0.05, 1.215);
    frontRing.castShadow = true;
    cameraGroup.add(frontRing);

    // Lens glass
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.02, 48), glassMat);
    glass.rotation.x = Math.PI / 2;
    glass.position.set(0, -0.05, 1.23);
    cameraGroup.add(glass);

    const innerGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.02, 32), lensGlassInner);
    innerGlass.rotation.x = Math.PI / 2;
    innerGlass.position.set(0, -0.05, 1.22);
    cameraGroup.add(innerGlass);

    // Glass reflection highlight (fake)
    const highlightGeo = new THREE.CircleGeometry(0.11, 16);
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 });
    const highlight = new THREE.Mesh(highlightGeo, highlightMat);
    highlight.position.set(0.14, 0.07, 1.24);
    highlight.lookAt(0, 0.07, 4);
    cameraGroup.add(highlight);

    // Strap lugs
    const lugGeo = new THREE.BoxGeometry(0.18, 0.14, 0.22);
    const lugMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30 });
    const lugL = new THREE.Mesh(lugGeo, lugMat);
    lugL.position.set(-1.08, 0.35, 0);
    cameraGroup.add(lugL);
    const lugR = new THREE.Mesh(lugGeo, lugMat);
    lugR.position.set(1.08, 0.35, 0);
    cameraGroup.add(lugR);

    // Branding text plate (canvas texture)
    const brandCanvas = document.createElement('canvas');
    brandCanvas.width = 512;
    brandCanvas.height = 128;
    const bctx = brandCanvas.getContext('2d')!;
    bctx.fillStyle = '#16151A';
    bctx.fillRect(0, 0, 512, 128);
    bctx.fillStyle = '#F5F3EF';
    bctx.font = '700 34px "Bricolage Grotesque", sans-serif';
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    bctx.fillText('MAKE A MOMENT', 256, 50);
    bctx.fillStyle = 'rgba(245,243,239,0.62)';
    bctx.font = '600 18px Inter, sans-serif';
    bctx.letterSpacing = '6px';
    // @ts-ignore - letterSpacing not in 2d context types in some TS
    bctx.fillText('PHOTOBOOTH  •  35MM', 256, 85);
    const brandTex = new THREE.CanvasTexture(brandCanvas);
    brandTex.colorSpace = THREE.SRGBColorSpace;
    brandTex.anisotropy = 4;
    const brandMat = new THREE.MeshBasicMaterial({ map: brandTex, transparent: true });
    const brandPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.275), brandMat);
    brandPlane.position.set(0, -0.45, 0.515);
    cameraGroup.add(brandPlane);

    // Tiny red dot + text on front
    const dotGeo = new THREE.CircleGeometry(0.045, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xff3b6b });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(-0.82, 0.42, 0.515);
    cameraGroup.add(dot);

    // AF assist window
    const afWin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.02), new THREE.MeshStandardMaterial({ color: 0x111015 }));
    afWin.position.set(0.82, 0.42, 0.515);
    cameraGroup.add(afWin);

    // Flash burst plane (hidden, flashes on click)
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const flashPlane = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), flashMat);
    flashPlane.position.set(0, 0.3, 1.6);
    cameraGroup.add(flashPlane);

    // Floating stray sparkle particles (photobooth vibe)
    const sparkles: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const sGeo = new THREE.OctahedronGeometry(0.06 + Math.random() * 0.04, 0);
      const sMat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0xff3b6b : 0x8b5cf6,
        emissive: i % 2 === 0 ? 0xff2a5f : 0x7c4dff,
        emissiveIntensity: 0.6,
        roughness: 0.3,
      });
      const s = new THREE.Mesh(sGeo, sMat);
      const ang = (i / 6) * Math.PI * 2;
      s.position.set(Math.cos(ang) * 1.7, Math.sin(ang * 0.7) * 0.6 + 0.2, Math.sin(ang) * 1.2);
      s.userData = { baseY: s.position.y, phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 0.6 };
      sparkles.push(s);
      scene.add(s);
    }

    // Sizing
    function resize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }

    // Interaction state
    let autoSpin = !prefersReduced;
    let isDragging = false;
    let startX = 0;
    let startRotY = 0;
    let targetRotY = 0;
    let currentRotY = 0;
    let velocity = 0;
    let lastX = 0;
    let lastTime = 0;
    let idleTimeout: number | null = null;
    let flashTimeout: number | null = null;

    const damp = (a: number, b: number, lambda: number, dt: number) => THREE.MathUtils.damp(a, b, lambda, dt);

    function setAutoSpin(v: boolean) {
      autoSpin = v && !prefersReduced;
    }

    function onPointerDown(e: PointerEvent) {
      isDragging = true;
      setAutoSpin(false);
      startX = e.clientX;
      lastX = e.clientX;
      lastTime = performance.now();
      startRotY = targetRotY;
      (e.target as Element).setPointerCapture(e.pointerId);
      canvas!.style.cursor = 'grabbing';
      if (idleTimeout) window.clearTimeout(idleTimeout);
    }

    function onPointerMove(e: PointerEvent) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      targetRotY = startRotY + dx * 0.008;

      // velocity for inertia
      const now = performance.now();
      const dt = Math.max(0.001, (now - lastTime) / 1000);
      velocity = (e.clientX - lastX) / dt / 1000; // px per sec normalized
      lastX = e.clientX;
      lastTime = now;
    }

    function onPointerUp(e: PointerEvent) {
      if (!isDragging) return;
      isDragging = false;
      canvas!.style.cursor = 'grab';
      // inertia
      targetRotY += velocity * 0.35;
      velocity = 0;
      try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
      if (idleTimeout) window.clearTimeout(idleTimeout);
      idleTimeout = window.setTimeout(() => setAutoSpin(true), 1200);
    }

    function onClick() {
      if (isDragging) return;
      // flash + shutter anim
      flashMat.opacity = 0.85;
      if (flashTimeout) window.clearTimeout(flashTimeout);
      flashTimeout = window.setTimeout(() => (flashMat.opacity = 0), 120);
      // lens punch
      cameraGroup.scale.set(1.02, 1.02, 1.02);
      window.setTimeout(() => cameraGroup.scale.set(1, 1, 1), 120);
      shutterBtn.position.y = 0.78;
      window.setTimeout(() => (shutterBtn.position.y = 0.82), 120);
    }

    function onEnter() {
      setAutoSpin(false);
      container!.style.setProperty('--cam-scale', '1.02');
    }
    function onLeave() {
      if (!isDragging) setAutoSpin(true);
      container!.style.setProperty('--cam-scale', '1');
    }

    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('click', onClick);
    container.addEventListener('mouseenter', onEnter);
    container.addEventListener('mouseleave', onLeave);

    // Observe resize
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    let raf = 0;
    let last = performance.now();

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!isDragging) {
        if (autoSpin) targetRotY += dt * 0.45; // ~26 deg/sec
        // normalize angles to avoid float creep
        if (targetRotY > Math.PI * 4) {
          targetRotY -= Math.PI * 4;
          currentRotY -= Math.PI * 4;
        }
      }

      // smooth follow
      const lambda = isDragging ? 24 : 3.5;
      currentRotY = damp(currentRotY, targetRotY, lambda, dt);
      rig.rotation.y = currentRotY;

      // subtle breathing
      const breathe = Math.sin(now * 0.0011) * 0.018;
      cameraGroup.position.y = breathe;
      // slight tilt wobble when spinning fast
      rig.rotation.z = Math.sin(now * 0.0006) * 0.015;

      // sparkles
      for (const s of sparkles) {
        s.rotation.y += dt * s.userData.speed;
        s.rotation.x += dt * s.userData.speed * 0.6;
        s.position.y = s.userData.baseY + Math.sin(now * 0.001 * s.userData.speed + s.userData.phase) * 0.18;
        // orbit slightly
        s.position.x += Math.sin(now * 0.0004 + s.userData.phase) * dt * 0.02;
      }

      // flash fade
      if (flashMat.opacity > 0) {
        flashMat.opacity = THREE.MathUtils.damp(flashMat.opacity, 0, 12, dt);
        if (flashMat.opacity < 0.01) flashMat.opacity = 0;
      }

      renderer.render(scene, camera);
    }

    // Respect reduced motion: still render one frame
    if (prefersReduced) {
      renderer.render(scene, camera);
      // allow drag even without auto spin
      raf = requestAnimationFrame(tick);
    } else {
      raf = requestAnimationFrame(tick);
    }

    // Pause when offscreen
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries[0]?.isIntersecting ?? true;
        if (!vis && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        } else if (vis && !raf) {
          last = performance.now();
          raf = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.01 },
    );
    io.observe(container);

    // Visibility
    const onVis = () => {
      if (document.hidden && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!document.hidden && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('click', onClick);
      container.removeEventListener('mouseenter', onEnter);
      container.removeEventListener('mouseleave', onLeave);
      if (idleTimeout) window.clearTimeout(idleTimeout);
      if (flashTimeout) window.clearTimeout(flashTimeout);
      // dispose
      renderer.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        if ((obj as THREE.Mesh).material) {
          const m = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
      gradTex.dispose();
      brandTex.dispose();
      groundMat.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="camera3d"
      role="img"
      aria-label="Interactive 3D vintage photobooth camera — drag to spin 360, click to flash"
      title="Drag to spin • Click to flash"
    >
      <canvas ref={canvasRef} className="camera3d__canvas" aria-hidden />
      <span className="camera3d__hint" aria-hidden>
        <span className="camera3d__hint-dot" /> Drag to spin • Click to flash
      </span>
    </div>
  );
}
