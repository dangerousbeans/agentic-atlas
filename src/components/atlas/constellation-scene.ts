import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { ConstellationData } from '../../lib/constellation';

export function mount(host: HTMLElement, data: ConstellationData, opts: { focus?: string; baseHref: string }): () => void {
  const W = () => host.clientWidth, H = () => host.clientHeight;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W(), H());
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer(); labels.setSize(W(), H());
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  host.appendChild(labels.domElement);

  const focusFam = opts.focus ? data.families.find(f => f.slug === opts.focus) : undefined;
  const target = focusFam ? new THREE.Vector3(focusFam.x, focusFam.y, focusFam.z) : new THREE.Vector3(0, 0, 0);
  camera.position.copy(target).add(focusFam ? new THREE.Vector3(2.5, 1.5, 6.4) : new THREE.Vector3(3.5, 2.2, 12.5));
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, autoRotate: true, autoRotateSpeed: focusFam ? 0.2 : 0.35 });
  controls.target.copy(target);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W(), H()), 1.1, 0.6, 0.05));
  composer.addPass(new OutputPass());

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // background starfield
  {
    const n = 2500, pos = new Float32Array(n * 3);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) { const r = 30 + rnd() * 50, t = rnd() * Math.PI * 2, p = Math.acos(2 * rnd() - 1); pos.set([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p)], i * 3); }
    const g = track(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, track(new THREE.PointsMaterial({ color: 0x8a90b0, size: 0.09, transparent: true, opacity: 0.55 }))));
  }

  const dimOf = (fam: string) => (opts.focus && opts.focus !== fam ? 0.25 : 1);
  const starGeo = track(new THREE.SphereGeometry(0.07, 16, 16));
  const hitGeo = track(new THREE.SphereGeometry(0.35, 8, 8));
  const tokGeo = track(new THREE.SphereGeometry(0.035, 8, 8));
  const hitMat = track(new THREE.MeshBasicMaterial({ visible: false }));
  const tokMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4dc').multiplyScalar(2) }));
  const byslug = new Map<string, THREE.Vector3>();
  const hits: THREE.Mesh[] = [];
  const tokens: { mesh: THREE.Mesh; a: THREE.Vector3; b: THREE.Vector3; off: number; speed: number }[] = [];

  for (const f of data.families) {
    const el = document.createElement('div'); el.className = 'c-fam'; el.textContent = f.name;
    Object.assign(el.style, { font: "italic 400 19px 'Instrument Serif', serif", color: f.color, opacity: String(0.8 * dimOf(f.slug)), whiteSpace: 'nowrap' });
    const o = new CSS2DObject(el); o.position.set(f.x, f.y + 1.5, f.z); scene.add(o);
  }
  for (const s of data.stars) {
    const p = new THREE.Vector3(s.x, s.y, s.z); byslug.set(s.slug, p);
    const star = new THREE.Mesh(starGeo, track(new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color).multiplyScalar(2.2 * dimOf(s.family)) })));
    star.position.copy(p); scene.add(star);
    const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.copy(p); scene.add(hit);
    const el = document.createElement('div'); el.textContent = s.name;
    Object.assign(el.style, { font: "500 11px 'Inter Tight Variable', sans-serif", letterSpacing: '.06em', color: '#fff', opacity: '0', transition: 'opacity .2s', transform: 'translateY(-16px)', whiteSpace: 'nowrap' });
    const lo = new CSS2DObject(el); lo.position.copy(p); scene.add(lo);
    hit.userData = { slug: s.slug, star, el };
    hits.push(hit);
  }
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [a, b] of data.links) {
    const s = data.stars.find(x => x.slug === a)!;
    const pa = byslug.get(a)!, pb = byslug.get(b)!;
    const g = track(new THREE.BufferGeometry().setFromPoints([pa, pb]));
    scene.add(new THREE.Line(g, track(new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: opts.focus && opts.focus !== s.family ? 0.08 : 0.28 }))));
    if (!opts.focus || opts.focus === s.family) { const m = new THREE.Mesh(tokGeo, tokMat); scene.add(m); tokens.push({ mesh: m, a: pa, b: pb, off: rnd(), speed: 0.18 + rnd() * 0.15 }); }
  }

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(-9, -9);
  let hovered: THREE.Mesh | null = null;
  const onMove = (e: PointerEvent) => { const r = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  const onLeave = () => mouse.set(-9, -9);
  let downAt = 0;
  const onDown = () => (downAt = performance.now());
  const onClick = () => { if (hovered && performance.now() - downAt < 300) location.href = `${opts.baseHref}patterns/${hovered.userData.slug}/`; };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerleave', onLeave);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('click', onClick);
  const onResize = () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()); composer.setSize(W(), H()); labels.setSize(W(), H()); };
  addEventListener('resize', onResize);

  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting)); io.observe(host);
  const t0 = performance.now();
  renderer.setAnimationLoop(() => {
    if (!visible || document.hidden) return;
    const t = (performance.now() - t0) / 1000;
    for (const k of tokens) k.mesh.position.lerpVectors(k.a, k.b, (t * k.speed + k.off) % 1);
    ray.setFromCamera(mouse, camera);
    const h = (ray.intersectObjects(hits)[0]?.object as THREE.Mesh | undefined) ?? null;
    if (h !== hovered) {
      if (hovered) { (hovered.userData.el as HTMLElement).style.opacity = '0'; (hovered.userData.star as THREE.Mesh).scale.setScalar(1); }
      if (h) { (h.userData.el as HTMLElement).style.opacity = '1'; (h.userData.star as THREE.Mesh).scale.setScalar(2.2); }
      hovered = h; renderer.domElement.style.cursor = h ? 'pointer' : 'grab';
    }
    controls.update(); composer.render(); labels.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null); io.disconnect(); removeEventListener('resize', onResize);
    controls.dispose(); composer.dispose(); disposables.forEach(d => d.dispose()); renderer.dispose();
    renderer.domElement.remove(); labels.domElement.remove();
  };
}
