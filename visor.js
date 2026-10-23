// HERMES · visor web de revisión (three.js, sin dependencias de internet)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const T0 = performance.now();
const $ = (id) => document.getElementById(id);
const Z2 = 4.10;            // piso del nivel 2
const OJO = 1.70;           // altura de los ojos al caminar
const CORTE_MAX = 12;       // valor del deslizador que equivale a «sin corte»
const CORTE_N1 = 3.35, CORTE_N2 = Z2 + 3.35;

const TACTIL = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || /[?&]tactil=1/.test(location.search);
const H = (window.HERMES = { cargadoMs: null, modo: 'orbita', errores: [], listo: false });
window.addEventListener('error', (e) => H.errores.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => H.errores.push(String(e.reason)));

// --- render --------------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
$('lienzo').appendChild(renderer.domElement);
const lienzo = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe5ea);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8d877c, 1.25));
const sol = new THREE.DirectionalLight(0xfff3e2, 1.5);
sol.position.set(-30, 60, 40);
scene.add(sol);

const persp = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 3000);
const orto = new THREE.OrthographicCamera(-30, 30, 20, -20, 0.1, 3000);
let cam = persp;
const controls = new OrbitControls(persp, lienzo);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.screenSpacePanning = true;
controls.maxDistance = 400;

let pedido = true;                                   // render bajo demanda
const pide = () => { pedido = true; };
controls.addEventListener('change', pide);

// --- corte ----------------------------------------------------------------------------------------
const planoCorte = new THREE.Plane(new THREE.Vector3(0, -1, 0), CORTE_MAX);
let corte = CORTE_MAX;
function aplicarCorte(h) {
  corte = Math.min(CORTE_MAX, Math.max(0.3, +h));
  $('corte').value = corte;
  if (corte >= CORTE_MAX - 1e-6) {
    renderer.clippingPlanes = [];
    $('corte-valor').textContent = 'sin corte';
  } else {
    planoCorte.constant = corte;
    renderer.clippingPlanes = [planoCorte];
    const nivel = corte >= Z2 ? `nivel 2 + ${(corte - Z2).toFixed(2)}` : 'nivel 1';
    $('corte-valor').textContent = `${corte.toFixed(2)} m · ${nivel}`;
  }
  pide();
}
$('corte').addEventListener('input', (e) => aplicarCorte(e.target.value));
document.querySelectorAll('[data-corte]').forEach((b) => b.addEventListener('click', () => aplicarCorte(b.dataset.corte)));

// --- carga ------------------------------------------------------------------------------------------
const draco = new DRACOLoader().setDecoderPath('./lib/addons/libs/draco/gltf/');
draco.setDecoderConfig({ type: 'wasm' });
draco.preload();
const loader = new GLTFLoader().setDRACOLoader(draco);

const relojCarga = setInterval(() => {
  $('carga-tiempo').textContent = `${((performance.now() - T0) / 1000).toFixed(1)} s`;
}, 100);

// carga progresiva (v14): el modelo viene partido por nivel y zona (partes.json); cada parte se descarga, se cuelga
// del árbol Nivel → zona → espacio que ya exista (mismo nombre) y se dibuja en cuanto llega
const raiz = new THREE.Group();
raiz.name = 'modelo';
scene.add(raiz);
function injerta(dst, src) {
  for (const c of [...src.children]) {
    const igual = !c.isMesh && dst.children.find((d) => !d.isMesh && d.name === c.name);
    if (igual) { injerta(igual, c); } else { dst.add(c); }
  }
}
function cargaParte(p, avance) {
  return new Promise((ok, mal) => loader.load(`partes/${p.archivo}`, ok, (ev) => avance(ev.loaded), mal));
}
let datos, partes;
try {
  [datos, partes] = await Promise.all([fetch('espacios.json').then((r) => r.json()), fetch('partes.json').then((r) => r.json())]);
} catch (e) {
  clearInterval(relojCarga);
  $('carga-texto').textContent = 'No se pudo cargar el modelo: ' + e;
  throw e;
}
const totalB = partes.reduce((s, p) => s + p.bytes, 0);
const bajado = new Array(partes.length).fill(0);
let listas = 0;
H.partes = { total: partes.length, cargadas: 0, mb: +(totalB / 1e6).toFixed(1) };
function barra() {
  const f = Math.min(1, bajado.reduce((a, b) => a + b, 0) / totalB);
  $('carga-barra').style.width = `${(f * 100).toFixed(0)}%`;
  $('carga-texto').textContent = `Cargando ${listas} de ${partes.length} partes · ${(f * totalB / 1e6).toFixed(1)} de ${(totalB / 1e6).toFixed(1)} MB`;
}
let primera = true;
async function trabajador(cola) {
  while (cola.length) {
    const i = cola.shift();
    const g = await cargaParte(partes[i], (b) => { bajado[i] = Math.min(b, partes[i].bytes); barra(); });
    bajado[i] = partes[i].bytes;
    g.scene.updateMatrixWorld(true);
    injerta(raiz, g.scene);
    listas++; H.partes.cargadas = listas;
    barra();
    if (primera) {                                     // con la primera parte (muros) se ve el edificio detrás de la barra
      primera = false;
      $('carga').classList.add('parcial');
      VISTAS_INI();
    }
    pide();
    renderer.render(scene, cam);
  }
}
const cola = partes.map((_, i) => i);
const VISTAS_INI = () => { controls.target.set(0, 3, 0); persp.position.set(95 * Math.cos(0.52) * Math.sin(0.70), 3 + 95 * Math.sin(0.52), 95 * Math.cos(0.52) * Math.cos(0.70)); controls.update(); };
try {
  await Promise.all([trabajador(cola), trabajador(cola), trabajador(cola)]);   // tres descargas a la vez
} catch (e) {
  clearInterval(relojCarga);
  $('carga').classList.remove('parcial');
  $('carga-texto').textContent = 'No se pudo cargar el modelo: ' + e;
  throw e;
}
$('carga-texto').textContent = 'Preparando escena…';
await new Promise((r) => setTimeout(r, 0));
raiz.updateMatrixWorld(true);
$('fuente').textContent = `${datos.fuente} · ${datos.fecha || ''}`;

const nombreDe = (o) => o.userData.name || o.name;
const porNombre = new Map();
raiz.traverse((o) => { const n = nombreDe(o); if (n && !porNombre.has(n)) porNombre.set(n, o); });

const colecciones = new Set();
(function plano(lista) { for (const c of lista) { colecciones.add(c.nombre); plano(c.hijos); } })(datos.colecciones);
const LOSAS = ['Losa N1', 'Losa N2'];
const esDueno = (o) => (colecciones.has(nombreDe(o)) && !o.isMesh) || LOSAS.includes(nombreDe(o));

// materiales: dos caras (el corte deja ver el interior de los muros) y vidrios sin escribir profundidad
const materiales = new Set();
raiz.traverse((o) => { if (o.isMesh) [].concat(o.material).forEach((m) => materiales.add(m)); });
for (const m of materiales) {
  m.side = THREE.DoubleSide;
  if (m.transparent) m.depthWrite = false;
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) if (m[k]) m[k].anisotropy = 8;
}

// datos de espacio y objeto de cada malla
function infoDe(o) {
  let esp = null, obj = null, p = o;
  while (p && p !== raiz) {
    if (p.userData && p.userData.nombre !== undefined && p.userData.m2 !== undefined) { esp = p.userData; break; }
    p = p.parent;
  }
  p = o;
  while (p && p.parent && p.parent !== raiz) {
    const padre = p.parent;
    if ((padre.userData && padre.userData.m2 !== undefined) || esDueno(padre)) { obj = nombreDe(p); break; }
    p = padre;
  }
  return { esp, obj: obj || nombreDe(o) };
}
function duenoDe(o) {
  let p = o.parent;
  while (p && p !== raiz) { if (esDueno(p)) return p; p = p.parent; }
  return raiz;
}

// mobiliario repetido → InstancedMesh por (capa, malla, material): menos llamadas de dibujo, mismas instancias del .blend
function instanciar() {
  const grupos = new Map();
  raiz.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || LOSAS.includes(nombreDe(o))) return;
    const d = duenoDe(o);
    const k = `${d.uuid}|${o.geometry.uuid}|${o.material.uuid}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push({ o, d });
  });
  const m = new THREE.Matrix4();
  let n = 0, quitadas = 0;
  for (const lista of grupos.values()) {
    if (lista.length < 3) continue;
    const { o: o0, d } = lista[0];
    const im = new THREE.InstancedMesh(o0.geometry, o0.material, lista.length);
    const inv = d.matrixWorld.clone().invert();
    lista.forEach((e, i) => { m.multiplyMatrices(inv, e.o.matrixWorld); im.setMatrixAt(i, m); });
    im.userData.fuentes = lista.map((e) => infoDe(e.o));
    im.name = `instancias · ${nombreDe(o0)}`;
    im.computeBoundingSphere();
    d.add(im);
    im.updateMatrixWorld(true);
    for (const e of lista) e.o.parent.remove(e.o);
    n++; quitadas += lista.length;
  }
  return { grupos: n, mallas: quitadas };
}
H.instancias = instanciar();
let llamadas = 0;
raiz.traverse((o) => { if (o.isMesh) llamadas++; });
H.llamadas = llamadas;

// --- capas ------------------------------------------------------------------------------------------
const capas = {};
const chk = {};
function etiqueta(nombre) {
  return nombre.replace(/^N[12] · /, '').replace(/^Estructura$/, 'Muros y estructura');
}
function colorZona(nombre) {
  const z = datos.zonas && datos.zonas[etiqueta(nombre)];
  return z ? z.fill : null;
}
function casilla(cont, clave, texto, obj, color) {
  const l = document.createElement('label');
  const c = document.createElement('input');
  c.type = 'checkbox'; c.checked = true; c.dataset.capa = clave;
  l.append(c);
  if (color) { const s = document.createElement('span'); s.className = 'muestra'; s.style.background = color; l.append(s); }
  l.append(document.createTextNode(texto));
  cont.append(l);
  chk[clave] = c;
  capas[clave] = obj;
  c.addEventListener('change', visibilidad);
  return c;
}
function visibilidad() {
  for (const [k, o] of Object.entries(capas)) if (o) o.visible = chk[k].checked;
  const az = capas['Azotea'];
  if (az) az.visible = chk['Azotea'].checked && chk['Nivel 2'].checked;
  pide();
}
(function armaCapas() {
  const cont = $('capas');
  for (const nivel of ['Nivel 1', 'Nivel 2']) {
    const c = datos.colecciones.find((x) => x.nombre === nivel);
    if (!c) continue;
    const k = nivel.endsWith('1') ? 1 : 2;
    const det = document.createElement('details');
    det.open = true;
    const sum = document.createElement('summary');
    det.append(sum);
    casilla(sum, nivel, nivel, porNombre.get(nivel));
    const hijos = document.createElement('div');
    hijos.className = 'hijos';
    casilla(hijos, `Losa N${k}`, k === 1 ? 'Losa de piso' : 'Losa de entrepiso (piso del nivel 2)', porNombre.get(`Losa N${k}`));
    casilla(hijos, `N${k} · Plafones`, 'Plafones y luminarias', porNombre.get(`N${k} · Plafones`));
    if (k === 2) casilla(hijos, 'Azotea', 'Azotea (losa y equipos)', porNombre.get('Azotea'));
    const g = document.createElement('div'); g.className = 'grupo'; g.textContent = 'Zonas'; hijos.append(g);
    for (const z of c.hijos) {
      if (z.nombre.endsWith('Plafones')) continue;
      casilla(hijos, z.nombre, etiqueta(z.nombre), porNombre.get(z.nombre), colorZona(z.nombre));
    }
    det.append(hijos);
    cont.append(det);
  }
  if (porNombre.get('Exterior')) casilla(cont, 'Exterior', 'Exterior y terreno', porNombre.get('Exterior'));
})();

// --- cámaras y vistas -------------------------------------------------------------------------------
const CENTRO = new THREE.Vector3(0, 0, 0);
function ajustaOrto(ancho, alto) {
  const a = innerWidth / innerHeight;
  const libre = (innerWidth - anchoPanel()) / innerHeight;
  const h = Math.max(alto / 2, ancho / 2 / libre);
  orto.left = -h * a; orto.right = h * a; orto.top = h; orto.bottom = -h;
  orto.zoom = 1;
  orto.updateProjectionMatrix();
}
// el panel lateral tapa la izquierda: el centro de la vista se corre a la derecha (salvo al caminar, por la mira)
const anchoPanel = () => $('panel').getBoundingClientRect().right + 12;
function desplazaVista() {
  const w = innerWidth, h = innerHeight, dx = H.modo === 'caminar' ? 0 : -anchoPanel() / 2;
  for (const c of [persp, orto]) { if (dx) c.setViewOffset(w, h, dx, 0, w, h); else c.clearViewOffset(); }
  pide();
}
function usarCamara(c) {
  if (cam === c) return;
  cam = c;
  controls.object = c;
  pide();
}
function animaA(pos, objetivo, ms = 650) {
  const p0 = cam.position.clone(), t0 = controls.target.clone(), ini = performance.now();
  return new Promise((ok) => {
    function paso() {
      const f = Math.min(1, (performance.now() - ini) / ms);
      const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      cam.position.lerpVectors(p0, pos, e);
      controls.target.lerpVectors(t0, objetivo, e);
      controls.update();
      pide();
      if (f < 1) requestAnimationFrame(paso); else ok();
    }
    paso();
  });
}
const VISTAS = {
  planta1() {
    salirCaminar();
    usarCamara(orto); ajustaOrto(60, 40);
    aplicarCorte(CORTE_N1);
    controls.target.set(0, 0, 0); orto.position.set(0, 120, 0.01); controls.update();
  },
  planta2() {
    salirCaminar();
    usarCamara(orto); ajustaOrto(60, 40);
    aplicarCorte(CORTE_N2);
    controls.target.set(0, Z2, 0); orto.position.set(0, 120, 0.01); controls.update();
  },
  iso() {
    salirCaminar();
    usarCamara(persp); persp.fov = 40; persp.updateProjectionMatrix();
    aplicarCorte(CORTE_MAX);
    const d = 95, el = THREE.MathUtils.degToRad(30), az = THREE.MathUtils.degToRad(40);
    controls.target.set(0, 3, 0);
    persp.position.set(d * Math.cos(el) * Math.sin(az), 3 + d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    controls.update();
  },
  sur() {
    salirCaminar();
    usarCamara(persp); persp.fov = 40; persp.updateProjectionMatrix();
    aplicarCorte(CORTE_MAX);
    controls.target.set(0, 4, 15);
    persp.position.set(0, 4.5, 15 + 72);
    controls.update();
  },
};
document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => { VISTAS[b.dataset.vista](); pide(); }));

// --- selección y ficha ------------------------------------------------------------------------------
const marco = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0xd99a1e));
marco.visible = false;
marco.material.depthTest = false;
marco.renderOrder = 10;
scene.add(marco);
let seleccion = null;

const pisoNivel = (n) => (n === 2 ? Z2 : 0);
function cajaEspacio(e) {
  const [x, y, w, h] = e.rect;
  const z0 = pisoNivel(e.nivel);
  return new THREE.Box3(new THREE.Vector3(x - 25, z0 + 0.02, y - 15), new THREE.Vector3(x + w - 25, z0 + 3.2, y + h - 15));
}
function espacioEnPunto(p) {
  const nivel = p.y >= Z2 - 0.05 ? 2 : 1;
  const px = p.x + 25, py = p.z + 15;
  let mejor = null;
  for (const e of datos.espacios) {
    if (e.nivel !== nivel || !e.rect) continue;
    const [x, y, w, h] = e.rect;
    if (px >= x - 0.08 && px <= x + w + 0.08 && py >= y - 0.08 && py <= y + h + 0.08 && (!mejor || w * h < mejor.rect[2] * mejor.rect[3])) mejor = e;
  }
  return mejor;
}
const espacioPorExtras = (u) => datos.espacios.find((e) => e.nodo === u.name || (e.nombre === u.nombre && e.nivel === u.nivel)) || null;
const limpio = (n) => (n || '').replace(/(\.\d{3})+$/, '').replace(/·m$/, '');

function seleccionar(e, objeto) {
  seleccion = e;
  if (!e) { $('ficha').hidden = true; marco.visible = false; pide(); return; }
  marco.box.copy(cajaEspacio(e));
  marco.visible = true;
  $('ficha').hidden = false;
  $('f-zona').textContent = `${e.zona} · Nivel ${e.nivel}`;
  $('f-nombre').textContent = e.nombre;
  $('f-datos').textContent = `${e.m2.toFixed(1)} m²` + (e.dims ? ` · ${e.dims} m` : '');
  $('f-objeto').textContent = objeto ? `Objeto: ${limpio(objeto)}` : '';
  pintaNotas();
  pide();
}
$('ficha-cerrar').addEventListener('click', () => seleccionar(null));

const ray = new THREE.Raycaster();
function visibleCadena(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
function elegir(ndc) {
  ray.setFromCamera(ndc, cam);
  for (const h of ray.intersectObject(raiz, true)) {
    if (renderer.clippingPlanes.length && h.point.y > corte + 1e-3) continue;
    if (!visibleCadena(h.object)) continue;
    const m = h.object.material;
    if (m.transparent && m.opacity < 0.5) continue;
    const info = h.object.isInstancedMesh ? h.object.userData.fuentes[h.instanceId] : infoDe(h.object);
    const e = (info.esp && espacioPorExtras(info.esp)) || espacioEnPunto(h.point);
    return { e, objeto: info.obj, punto: h.point.clone() };
  }
  return null;
}
function clicEn(x, y) {
  const r = lienzo.getBoundingClientRect();
  const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  const res = elegir(ndc);
  if (res && res.e) seleccionar(res.e, res.objeto);
  else if (res) { seleccionar(null); aviso(`${limpio(res.objeto)} · fuera de los espacios del plano`); }
  return res;
}
let abajo = null;
lienzo.addEventListener('pointerdown', (ev) => { abajo = { x: ev.clientX, y: ev.clientY, b: ev.button }; });
lienzo.addEventListener('pointerup', (ev) => {
  if (!abajo || abajo.b !== 0) return;
  const mov = Math.hypot(ev.clientX - abajo.x, ev.clientY - abajo.y);
  abajo = null;
  if (mov > 5) return;
  if (H.modo === 'caminar') {
    if (bloqueado || ev.pointerType === 'touch') { const r = lienzo.getBoundingClientRect(); clicEn(r.left + r.width / 2, r.top + r.height / 2); }
    else lienzo.requestPointerLock?.();
    return;
  }
  clicEn(ev.clientX, ev.clientY);
});

// --- buscador ---------------------------------------------------------------------------------------
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let encontrados = [], marcado = 0;
function busca(q) {
  const t = norm(q).split(/\s+/).filter(Boolean);
  // primero el nombre que empieza con la búsqueda, luego una palabra que empieza con ella, luego el resto;
  // lo que solo coincide por zona va al final y, a igualdad, el nombre más corto
  const puntos = (e) => {
    const n = norm(e.nombre);
    const inicio = n.startsWith(t[0]) ? 0 : n.split(/[\s,·]+/).some((w) => w.startsWith(t[0])) ? 1 : 2;
    return 10 * t.filter((p) => !n.includes(p)).length + inicio + n.length / 1000;
  };
  encontrados = t.length ? datos.espacios.filter((e) => t.every((p) => norm(`${e.nombre} ${e.zona}`).includes(p)))
    .sort((a, b) => puntos(a) - puntos(b)).slice(0, 12) : [];
  marcado = 0;
  const ul = $('resultados');
  ul.innerHTML = '';
  encontrados.forEach((e, i) => {
    const li = document.createElement('li');
    li.innerHTML = `${e.nombre}<small>${e.zona} · Nivel ${e.nivel} · ${e.m2.toFixed(1)} m²</small>`;
    if (i === marcado) li.className = 'sel';
    li.addEventListener('click', () => irA(e));
    ul.append(li);
  });
}
$('buscar').addEventListener('input', (ev) => busca(ev.target.value));
$('buscar').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && encontrados[marcado]) irA(encontrados[marcado]);
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    marcado = (marcado + (ev.key === 'ArrowDown' ? 1 : -1) + encontrados.length) % Math.max(1, encontrados.length);
    [...$('resultados').children].forEach((li, i) => (li.className = i === marcado ? 'sel' : ''));
    ev.preventDefault();
  }
});
async function irA(e) {
  salirCaminar();
  if (e.nivel === 1 && corte > CORTE_N1) aplicarCorte(CORTE_N1);
  if (e.nivel === 2 && (corte > CORTE_N2 || corte < Z2 + 0.5)) aplicarCorte(CORTE_N2);
  if (e.nivel === 2 && chk['Nivel 2'] && !chk['Nivel 2'].checked) { chk['Nivel 2'].checked = true; visibilidad(); }
  seleccionar(e);
  const b = cajaEspacio(e), c = b.getCenter(new THREE.Vector3());
  c.y = pisoNivel(e.nivel) + 0.8;
  const [, , w, h] = e.rect;
  if (cam === orto) {
    controls.target.copy(c);
    orto.position.set(c.x, c.y + 100, c.z + 0.01);
    orto.zoom = Math.min(8, 60 / (Math.max(w, h) + 4));
    orto.updateProjectionMatrix();
    controls.update(); pide();
    return;
  }
  const d = Math.max(w, h) * 1.25 + 6;
  const dir = cam.position.clone().sub(controls.target).setY(0);
  if (dir.lengthSq() < 1e-6) dir.set(0.6, 0, 0.8);
  dir.normalize().multiplyScalar(d * 0.62);
  await animaA(c.clone().add(dir).add(new THREE.Vector3(0, d * 0.78, 0)), c);
}

// --- modo caminar -----------------------------------------------------------------------------------
let bloqueado = false, yaw = 0, pitch = 0, nivelPaseo = 1, arrastre = null, corteAntes = CORTE_MAX;
const teclas = new Set();
function entrarCaminar(conRaton = true) {
  if (H.modo === 'caminar') return;
  H.modo = 'caminar';
  $('b-caminar').classList.add('activo'); $('b-orbita').classList.remove('activo');
  usarCamara(persp);
  controls.enabled = false;
  corteAntes = corte;
  aplicarCorte(CORTE_MAX);
  const e = seleccion || datos.espacios.find((x) => x.nombre.startsWith('Lobby'));
  const c = cajaEspacio(e).getCenter(new THREE.Vector3());
  nivelPaseo = e.nivel;
  const dir = c.clone().sub(persp.position).setY(0);
  persp.position.set(c.x, pisoNivel(nivelPaseo) + OJO, c.z);
  yaw = dir.lengthSq() > 1e-6 ? Math.atan2(-dir.x, -dir.z) : 0;
  pitch = 0;
  persp.fov = 70; persp.updateProjectionMatrix();
  persp.rotation.set(pitch, yaw, 0, 'YXZ');
  desplazaVista();
  $('mira').hidden = false; $('aviso-caminar').hidden = TACTIL;
  $('tactil').hidden = !TACTIL;
  document.body.classList.toggle('caminando-tactil', TACTIL);
  if (conRaton) lienzo.requestPointerLock?.();
  pide();
}
function salirCaminar() {
  if (H.modo !== 'caminar') return;
  H.modo = 'orbita';
  if (document.pointerLockElement) document.exitPointerLock();
  $('b-orbita').classList.add('activo'); $('b-caminar').classList.remove('activo');
  $('mira').hidden = true; $('aviso-caminar').hidden = true;
  $('tactil').hidden = true;
  document.body.classList.remove('caminando-tactil');
  teclas.clear();
  persp.fov = 50; persp.updateProjectionMatrix();
  desplazaVista();
  const fr = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  controls.target.copy(persp.position).addScaledVector(fr, 4).setY(pisoNivel(nivelPaseo) + 1.0);
  controls.enabled = true;
  controls.update();
  if (corteAntes < CORTE_MAX) aplicarCorte(corteAntes);
  pide();
}
$('b-caminar').addEventListener('click', () => { document.body.classList.remove('panel-abierto'); entrarCaminar(!TACTIL); });
$('b-orbita').addEventListener('click', () => salirCaminar());
document.addEventListener('pointerlockchange', () => {
  const antes = bloqueado;
  bloqueado = document.pointerLockElement === lienzo;
  $('aviso-caminar').textContent = bloqueado ? 'W A S D para moverte · Shift corre · R/F cambia de nivel · G atraviesa muros · Esc para salir'
                                             : 'Clic en la vista para mirar con el ratón · W A S D para moverte · Esc para salir';
  if (antes && !bloqueado && H.modo === 'caminar') salirCaminar();     // Esc
});
document.addEventListener('pointerlockerror', () => { bloqueado = false; });
document.addEventListener('mousemove', (ev) => {
  if (H.modo !== 'caminar') return;
  let dx = 0, dy = 0;
  if (bloqueado) { dx = ev.movementX; dy = ev.movementY; }
  else if (arrastre) { dx = ev.clientX - arrastre.x; dy = ev.clientY - arrastre.y; arrastre = { x: ev.clientX, y: ev.clientY }; }
  else return;
  yaw -= dx * 0.0022;
  pitch = Math.max(-1.45, Math.min(1.45, pitch - dy * 0.0022));
  persp.rotation.set(pitch, yaw, 0, 'YXZ');
  pide();
});
lienzo.addEventListener('mousedown', (ev) => { if (H.modo === 'caminar' && !bloqueado) arrastre = { x: ev.clientX, y: ev.clientY }; });
document.addEventListener('mouseup', () => { arrastre = null; });
const escribiendo = (ev) => ['INPUT', 'TEXTAREA'].includes(ev.target.tagName);
document.addEventListener('keydown', (ev) => {
  if (escribiendo(ev)) return;
  if (H.modo !== 'caminar') return;
  const k = ev.code;
  if (k === 'Escape') { salirCaminar(); return; }
  if (k === 'KeyG') { fantasma = !fantasma; aviso(fantasma ? 'Atravesar muros: activado (G)' : 'Atravesar muros: desactivado (G)'); return; }
  if (k === 'KeyR' || k === 'KeyF') {
    nivelPaseo = k === 'KeyR' ? 2 : 1;
    persp.position.y = pisoNivel(nivelPaseo) + OJO;
    pide();
    return;
  }
  teclas.add(k);
});
document.addEventListener('keyup', (ev) => teclas.delete(ev.code));
window.addEventListener('blur', () => teclas.clear());

const adelante = new THREE.Vector3(), derecha = new THREE.Vector3();
// se choca con los muros y con los vidrios fijos (fachada, mamparas, barandales); las puertas quedan libres
const muros = [];
for (const n of ['Muros N1', 'Muros N2']) porNombre.get(n)?.traverse((o) => { if (o.isMesh) muros.push(o); });
const puertas = ['N1 · Puertas', 'N2 · Puertas'].map((n) => porNombre.get(n)).filter(Boolean);
const enPuertas = (o) => { for (let p = o; p; p = p.parent) if (puertas.includes(p)) return true; return false; };
raiz.traverse((o) => {
  if (o.isMesh && !muros.includes(o) && /^vidrio(?!_auto)/.test(o.material.name || '') && !enPuertas(o)) muros.push(o);
});
H.colisionadores = muros.length;
let fantasma = false;                       // G: atravesar muros
const rayoPaso = new THREE.Raycaster();
function libre(delta) {
  if (fantasma || !muros.length) return true;
  const d = delta.length();
  if (d < 1e-6) return true;
  const dir = delta.clone().divideScalar(d);
  for (const alto of [0.45, 1.3]) {
    rayoPaso.set(new THREE.Vector3(persp.position.x, pisoNivel(nivelPaseo) + alto, persp.position.z), dir);
    rayoPaso.far = d + 0.28;
    if (rayoPaso.intersectObjects(muros, false).some((h) => visibleCadena(h.object))) return false;
  }
  return true;
}
// --- pantalla táctil (v14): palanca virtual para moverse, arrastre con un dedo para mirar --------------
const joy = { x: 0, y: 0, id: null };
const mirada = { id: null, x: 0, y: 0, mov: 0 };
function palanca(ev) {
  const r = $('palanca').getBoundingClientRect();
  const R = r.width / 2;
  let dx = ev.clientX - (r.left + R), dy = ev.clientY - (r.top + R);
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  joy.x = dx / R; joy.y = dy / R;
  $('palanca-perilla').style.transform = `translate(${dx}px, ${dy}px)`;
  pide();
}
$('palanca').addEventListener('pointerdown', (ev) => { joy.id = ev.pointerId; $('palanca').setPointerCapture(ev.pointerId); palanca(ev); ev.preventDefault(); });
$('palanca').addEventListener('pointermove', (ev) => { if (ev.pointerId === joy.id) palanca(ev); });
const suelta = (ev) => { if (ev.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; $('palanca-perilla').style.transform = ''; };
$('palanca').addEventListener('pointerup', suelta);
$('palanca').addEventListener('pointercancel', suelta);
lienzo.addEventListener('pointerdown', (ev) => {
  if (H.modo !== 'caminar' || ev.pointerType !== 'touch' || mirada.id !== null) return;
  Object.assign(mirada, { id: ev.pointerId, x: ev.clientX, y: ev.clientY, mov: 0 });
});
lienzo.addEventListener('pointermove', (ev) => {
  if (ev.pointerId !== mirada.id) return;
  const dx = ev.clientX - mirada.x, dy = ev.clientY - mirada.y;
  mirada.x = ev.clientX; mirada.y = ev.clientY; mirada.mov += Math.abs(dx) + Math.abs(dy);
  yaw -= dx * 0.005;
  pitch = Math.max(-1.45, Math.min(1.45, pitch - dy * 0.005));
  persp.rotation.set(pitch, yaw, 0, 'YXZ');
  pide();
});
const finMirada = (ev) => { if (ev.pointerId === mirada.id) mirada.id = null; };
lienzo.addEventListener('pointerup', finMirada);
lienzo.addEventListener('pointercancel', finMirada);
$('t-sube').addEventListener('click', () => { nivelPaseo = 2; persp.position.y = pisoNivel(2) + OJO; pide(); });
$('t-baja').addEventListener('click', () => { nivelPaseo = 1; persp.position.y = pisoNivel(1) + OJO; pide(); });
$('t-salir').addEventListener('click', () => salirCaminar());
$('b-panel').addEventListener('click', () => { document.body.classList.toggle('panel-abierto'); });

function paseo(dt) {
  if (H.modo !== 'caminar' || (!teclas.size && !joy.x && !joy.y)) return;
  const v = (teclas.has('ShiftLeft') || teclas.has('ShiftRight') || Math.hypot(joy.x, joy.y) > 0.95 ? 3.6 : 1.4) * dt;
  adelante.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  derecha.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const f = (teclas.has('KeyW') || teclas.has('ArrowUp') ? 1 : 0) - (teclas.has('KeyS') || teclas.has('ArrowDown') ? 1 : 0) - joy.y;
  const s = (teclas.has('KeyD') || teclas.has('ArrowRight') ? 1 : 0) - (teclas.has('KeyA') || teclas.has('ArrowLeft') ? 1 : 0) + joy.x;
  if (Math.abs(f) < 0.05 && Math.abs(s) < 0.05) return;
  const delta = adelante.clone().multiplyScalar(f * v).addScaledVector(derecha, s * v);
  if (libre(delta)) persp.position.add(delta);
  else {                                     // se desliza a lo largo del muro
    const dx = new THREE.Vector3(delta.x, 0, 0), dz = new THREE.Vector3(0, 0, delta.z);
    if (libre(dx)) persp.position.add(dx); else if (libre(dz)) persp.position.add(dz);
  }
  persp.position.y = pisoNivel(nivelPaseo) + OJO;
  pide();
}

// --- notas de auditoría -----------------------------------------------------------------------------
let notas = [];
const dos = (n) => String(n).padStart(2, '0');
function ahora() {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
function cuenta() {
  $('n-cuenta').textContent = `${notas.length} observaci${notas.length === 1 ? 'ón' : 'ones'}`;
}
function pintaNotas() {
  const ol = $('f-notas');
  ol.innerHTML = '';
  if (!seleccion) return;
  for (const n of notas.filter((x) => x.espacio === seleccion.nombre && x.nivel === seleccion.nivel)) {
    const li = document.createElement('li');
    const s = document.createElement('small'); s.textContent = n.fecha;
    li.append(s, document.createTextNode(n.comentario));
    ol.append(li);
  }
}
function agregar() {
  const t = $('f-texto').value.trim();
  if (!t || !seleccion) return false;
  notas.push({ fecha: ahora(), espacio: seleccion.nombre, zona: seleccion.zona, nivel: seleccion.nivel, m2: seleccion.m2, comentario: t });
  $('f-texto').value = '';
  pintaNotas(); cuenta();
  return true;
}
function aMarkdown() {
  const L = ['# Notas de auditoría · HERMES', '',
    `Modelo: ${datos.fuente} · visor exportado ${datos.fecha || ''} · ${notas.length} observaciones`, ''];
  for (const n of [...notas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    L.push(`## ${n.fecha} · ${n.espacio}`, '', `- Zona: ${n.zona} · Nivel ${n.nivel}${n.m2 ? ` · ${(+n.m2).toFixed(1)} m²` : ''}`, '', n.comentario.trim(), '');
  }
  return L.join('\n');
}
function desdeMarkdown(txt) {
  const r = [];
  const bloques = txt.replace(/\r/g, '').split(/^## /m).slice(1);
  for (const b of bloques) {
    const lineas = b.split('\n');
    const m = lineas[0].match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (.+)$/);
    if (!m) continue;
    const n = { fecha: m[1], espacio: m[2].trim(), zona: '', nivel: 1, m2: 0, comentario: '' };
    const cuerpo = [];
    for (const l of lineas.slice(1)) {
      const z = l.match(/^- Zona: (.+?) · Nivel (\d)(?: · ([\d.]+) m²)?$/);
      if (z && !cuerpo.length) { n.zona = z[1]; n.nivel = +z[2]; n.m2 = z[3] ? +z[3] : 0; continue; }
      cuerpo.push(l);
    }
    n.comentario = cuerpo.join('\n').trim();
    if (n.comentario) r.push(n);
  }
  return r;
}
function mezcla(nuevas) {
  const ya = new Set(notas.map((n) => `${n.fecha}|${n.espacio}|${n.comentario}`));
  let k = 0;
  for (const n of nuevas) if (!ya.has(`${n.fecha}|${n.espacio}|${n.comentario}`)) { notas.push(n); k++; }
  pintaNotas(); cuenta();
  return k;
}
async function guardar() {
  agregar();
  const md = aMarkdown();
  try {
    const r = await fetch('guardar-notas', { method: 'POST', headers: { 'Content-Type': 'text/markdown; charset=utf-8' }, body: md });
    if (!r.ok) throw new Error(r.status);
    aviso(`Guardado en visor/notas_auditoria.md (${notas.length} observaciones)`);
  } catch {
    const a = document.createElement('a');                        // sin servidor: descarga del navegador
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = 'notas_auditoria.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    aviso('Descargado notas_auditoria.md (guárdalo en la carpeta visor)');
  }
  return md;
}
$('b-agregar').addEventListener('click', agregar);
$('b-guardar').addEventListener('click', guardar);
$('b-cargar').addEventListener('click', () => $('archivo-notas').click());
$('archivo-notas').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const k = mezcla(desdeMarkdown(await f.text()));
  aviso(`${k} observaci${k === 1 ? "ón cargada" : "ones cargadas"} de ${f.name}`);
  ev.target.value = '';
});
if (/^(localhost|127.0.0.1)$/.test(location.hostname)) fetch('notas_auditoria.md', { cache: 'no-store' }).then((r) => (r.status === 200 ? r.text() : '')).then((t) => { if (t) mezcla(desdeMarkdown(t)); }).catch(() => {});
cuenta();

let tAviso;
function aviso(t) {
  const el = $('toast');
  el.textContent = t; el.hidden = false;
  clearTimeout(tAviso);
  tAviso = setTimeout(() => (el.hidden = true), 3200);
}

// --- bucle ------------------------------------------------------------------------------------------
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  persp.aspect = innerWidth / innerHeight; persp.updateProjectionMatrix();
  const h = (orto.top - orto.bottom) / 2;
  orto.left = -h * persp.aspect; orto.right = h * persp.aspect; orto.updateProjectionMatrix();
  desplazaVista();
});
let tPrev = performance.now();
const fps = { cuadros: 0, t: performance.now(), valor: 0 };
function bucle(t) {
  const dt = Math.min(0.1, (t - tPrev) / 1000);
  tPrev = t;
  paseo(dt);
  if (H.modo === 'orbita' && controls.update()) pedido = true;
  if (pedido || H.forzar) {
    pedido = false;
    renderer.render(scene, cam);
    fps.cuadros++;
  }
  if (t - fps.t > 1000) { fps.valor = (fps.cuadros * 1000) / (t - fps.t); fps.cuadros = 0; fps.t = t; H.fps = fps.valor; }
  requestAnimationFrame(bucle);
}

desplazaVista();
VISTAS.iso();
renderer.compile(scene, cam);
renderer.render(scene, cam);
clearInterval(relojCarga);
H.cargadoMs = performance.now() - T0;
H.desdeNavegacion = performance.now();
$('carga').hidden = true;
$('fuente').textContent += ` · cargado en ${(H.cargadoMs / 1000).toFixed(1)} s`;
H.listo = true;
requestAnimationFrame(bucle);

// ganchos para la prueba automática (scripts/prueba_visor.py)
H.api = {
  vista: (v) => { VISTAS[v](); pide(); },
  corte: aplicarCorte,
  caminar: () => entrarCaminar(false),
  orbita: salirCaminar,
  mirar: (y, p) => { if (y !== null) yaw = y; pitch = p; persp.rotation.set(pitch, yaw, 0, 'YXZ'); pide(); },
  camara: () => ({ pos: cam.position.toArray(), objetivo: controls.target.toArray(), modo: H.modo, orto: cam === orto, yaw, pitch }),
  clicEn,
  irA: (n) => irA(datos.espacios.find((e) => e.nombre.startsWith(n))),
  seleccion: () => seleccion,
  notas: () => notas,
  markdown: aMarkdown,
  desdeMarkdown,
  pantalla: (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); const r = lienzo.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
  tactil: () => TACTIL,
  joy: (x, y) => { joy.x = x; joy.y = y; },
  info: () => ({ gpu: (() => { const g = renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })(),
    llamadas: H.llamadas, instancias: H.instancias, tris: renderer.info.render.triangles, calls: renderer.info.render.calls }),
  capas: () => Object.fromEntries(Object.entries(chk).map(([k, c]) => [k, c.checked])),
};
