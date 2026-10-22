const $ = id => document.getElementById(id);
const fmt = n => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-EC', { maximumFractionDigits: 2 }));

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

const norm = s => String(s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function textoRegistro(r) {
  const u = r.ubicacion || {}, rec = r.recoleccion || {}, i = r.indicadores || {}, c = r.clasificacion || {};
  return [
    r.anio, r.mes, r.trimestre, r.periodo_datos,
    u.administracion_zonal, u.zona, u.provincia, u.canton,
    rec.tipo, rec.frecuencia,
    i.toneladas_generadas_kg, i.denuncias_atendidas, i.porcentaje_cumplimiento, i.buenas_resenas,
    i.toneladas_mensuales, i.denuncias_mensuales,
    c.categoria_toneladas, c.nivel_cumplimiento
  ].filter(v => v != null).map(v => typeof v === 'number' ? v.toLocaleString('es-EC', { maximumFractionDigits: 2 }) + ' ' + v : v).join(' ');
}

const ICONOS = {
  registros: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  basura: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  denuncia: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  zonales: '<path d="M12 21s-7-5.7-7-11a7 7 0 0 1 14 0c0 5.3-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  estrella: '<path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.8 6.2 21l1.1-6.5L2.6 9.8l6.5-.9z"/>',
  ok: '<path d="M20 6L9 17l-5-5"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};

const iconoSvg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

let registros = [];
let registrosCtl = null;
let statsCtl = null;
let opciones = { zonales: [], tipos: [], frecuencias: [] };

/* ---------------- API + Auth ---------------- */
const CLIENT_ID = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const TOKEN_KEY = 'token_admin';
const CORREO_KEY = 'correo_admin';

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
function esAdmin() { return !!getToken(); }
function sesionCorreo() {
  try { return localStorage.getItem(CORREO_KEY); } catch (e) { return null; }
}
function cerrarSesionLocal() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(CORREO_KEY); } catch (e) {}
}

async function api(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Client-Id': CLIENT_ID };
  const tok = getToken();
  if (tok) headers['Authorization'] = 'Bearer ' + tok;
  const r = await fetch(url, { headers: { ...headers, ...(opts.headers || {}) }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) {
    cerrarSesionLocal();
    pintarAuth();
    if (!/\/registros\.html(\?|$)/.test(location.pathname) && !/login\.html$/.test(location.pathname)) {
      toast('Su sesión expiró, inicie sesión nuevamente', 'info');
    }
  }
  if (!r.ok) throw new Error(d.error || 'Error');
  return d;
}

function pintarAuth() {
  const box = document.getElementById('auth-box');
  if (!box) return;
  if (esAdmin()) {
    box.innerHTML =
      `<span class="pill" title="Sesión de administrador">${escapeHtml(sesionCorreo() || 'Administrador')}</span>` +
      `<button id="btn-salir" class="btn btn--ghost" type="button">Cerrar sesión</button>`;
    const b = document.getElementById('btn-salir');
    if (b) b.onclick = async () => {
      try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
      cerrarSesionLocal();
      pintarAuth();
      toast('Sesión cerrada', 'info');
      if (/registros\.html$/.test(location.pathname)) location.replace('index.html');
    };
  } else {
    box.innerHTML = `<a class="btn btn--ghost" href="login.html">Iniciar sesión</a>`;
  }
}

function params(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, v); });
  return p;
}

/* ---------------- Tema ---------------- */
function aplicarTema(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('tema', t); } catch (e) {}
}
$('btn-tema').addEventListener('click', () => {
  const actual = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  aplicarTema(actual);
});

/* ---------------- Toasts ---------------- */
function toast(msg, tipo = 'ok') {
  const icono = tipo === 'error' ? ICONOS.error : tipo === 'info' ? ICONOS.info : ICONOS.ok;
  const clase = tipo === 'error' ? ' toast--error' : tipo === 'info' ? ' toast--info' : '';
  const el = document.createElement('div');
  el.className = 'toast' + clase;
  el.innerHTML = `<span class="toast__icon">${iconoSvg(icono)}</span><span class="toast__msg">${escapeHtml(msg)}</span>`;
  $('toasts').appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 3600);
}

/* ---------------- Confirmación ---------------- */
function confirmar(msg, { titulo = 'Confirmar', texto = 'Aceptar', peligro = true } = {}) {
  return new Promise(resolve => {
    const dlg = $('confirm');
    $('confirm-titulo').textContent = titulo;
    $('confirm-msg').textContent = msg;
    const si = $('confirm-si');
    si.textContent = texto;
    si.className = 'btn ' + (peligro ? 'btn--danger' : 'btn--primary');
    const cerrar = ok => { dlg.close(); limpiar(); resolve(ok); };
    const onSi = () => cerrar(true);
    const onNo = () => cerrar(false);
    function limpiar() {
      si.removeEventListener('click', onSi);
      $('confirm-no').removeEventListener('click', onNo);
      dlg.removeEventListener('cancel', onNo);
    }
    si.addEventListener('click', onSi);
    $('confirm-no').addEventListener('click', onNo);
    dlg.addEventListener('cancel', onNo);
    dlg.showModal();
  });
}

/* ---------------- Filtros / selects ---------------- */
async function cargarFiltros() {
  try {
    const f = await api('/api/filtros');
    const z = $('f-zonal');
    if (z) {
      const v = z.value;
      while (z.options.length > 1) z.options.remove(1);
      f.zonales.forEach(x => z.add(new Option(x, x)));
      if (v) z.value = v;
    }
    const a = $('f-anio');
    if (a) {
      const v = a.value;
      while (a.options.length > 1) a.options.remove(1);
      f.anios.forEach(x => a.add(new Option(x, x)));
      if (v) a.value = v;
    }
  } catch (e) { toast('No se pudieron cargar filtros', 'error'); }
}

function llenarSelect(sel, valores, placeholder, valor) {
  sel.innerHTML = '';
  if (placeholder != null) sel.add(new Option(placeholder, ''));
  valores.forEach(x => sel.add(new Option(x, x)));
  if (valor != null && valor !== '' && valores.includes(valor)) sel.value = valor;
}

async function cargarOpciones() {
  opciones = await api('/api/opciones');
  const selZonal = $('zonal');
  if (selZonal) llenarSelect(selZonal, opciones.zonales, 'Seleccione una administración zonal');
  const selTipo = $('tipo');
  if (selTipo) llenarSelect(selTipo, opciones.tipos, 'Seleccione un tipo de recolección');
  const selFrec = $('frecuencia');
  if (selFrec) llenarSelect(selFrec, opciones.frecuencias, 'Seleccione una frecuencia');
}

/* ---------------- Tabla de registros ---------------- */
const SKELETON = '<tr>' + '<td><span class="skel"></span></td>'.repeat(8) + '</tr>';

function meter(val) {
  if (val == null || isNaN(val)) return '<span class="meter__val">—</span>';
  const v = Math.max(0, Math.min(100, Number(val)));
  const cls = v < 50 ? 'is-bad' : v < 75 ? 'is-low' : '';
  return `<span class="meter"><span class="meter__val">${fmt(val)}</span>` +
    `<span class="meter__track"><span class="meter__fill ${cls}" style="width:${v}%"></span></span></span>`;
}

function pintarTabla() {
  const tablaEl = $('tabla');
  if (!tablaEl) return;
  const fb = $('f-buscar');
  const terminos = fb && fb.value ? norm(fb.value).split(' ').filter(Boolean) : [];
  const filas = !terminos.length ? registros : registros.filter(r => {
    const hay = norm(textoRegistro(r));
    return terminos.every(t => hay.includes(t));
  });

  const cont = $('contador');
  if (cont) cont.textContent = `${filas.length} registro${filas.length === 1 ? '' : 's'}`;

  tablaEl.innerHTML = filas.map(r => {
    const zona = r.ubicacion.zona;
    const badge = `<span class="badge${zona === 'Rural' ? ' badge--rural' : ''}">${escapeHtml(zona)}</span>`;
    return `
      <tr>
        <td>${escapeHtml(r.anio)}</td>
        <td>${escapeHtml(r.ubicacion.administracion_zonal)}</td>
        <td>${badge}</td>
        <td class="num">${fmt(r.indicadores.toneladas_generadas_kg)}</td>
        <td class="num">${fmt(r.indicadores.denuncias_atendidas)}</td>
        <td class="num">${meter(r.indicadores.porcentaje_cumplimiento)}</td>
        <td class="num">${meter(r.indicadores.buenas_resenas)}</td>
        <td><button class="btn btn--ghost btn--sm" onclick="editar('${escapeHtml(r._id)}')">Editar</button>
            <button class="btn btn--danger btn--sm" onclick="eliminar('${escapeHtml(r._id)}')">Eliminar</button></td>
      </tr>`;
  }).join('') || '<tr class="vacio"><td colspan="8">No se encontraron registros con los filtros actuales</td></tr>';
}

async function cargarRegistros({ silencioso = false } = {}) {
  const tablaEl = $('tabla');
  if (!tablaEl) return;
  if (registrosCtl) registrosCtl.abort();
  registrosCtl = new AbortController();
  if (!silencioso) tablaEl.innerHTML = SKELETON.repeat(6);
  const p = params({ zonal: ($('f-zonal')||{}).value, anio: ($('f-anio')||{}).value, zona: ($('f-zona')||{}).value, q: ($('f-buscar')||{}).value });
  try {
    registros = await api('/api/registros?' + p, { signal: registrosCtl.signal });
    pintarTabla(silencioso);
  } catch (e) {
    if (e.name === 'AbortError') return;
    tablaEl.innerHTML = '<tr class="vacio"><td colspan="8">Error al cargar registros</td></tr>';
  }
}

/* ---------------- Gráficas + KPIs ---------------- */
function renderRanking(el, items) {
  if (!items.length) { el.innerHTML = '<p class="empty">Sin datos para los filtros seleccionados</p>'; return; }
  const max = Math.max(...items.map(i => i.value)) || 1;
  el.innerHTML = items.map(i => `
    <div class="rank">
      <div class="rank__top">
        <span class="rank__label" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</span>
        <span class="rank__value">${fmt(i.value)}</span>
      </div>
      <div class="rank__track"><div class="rank__fill" style="width:${(i.value / max * 100).toFixed(1)}%"></div></div>
    </div>`).join('');
}

function renderColumnas(el, items) {
  if (!items.length) { el.innerHTML = '<p class="empty">Sin datos para los filtros seleccionados</p>'; return; }
  const max = Math.max(...items.map(i => i.value)) || 1;
  el.innerHTML = `<div class="cols">` + items.map(i => `
    <div class="col">
      <span class="col__value">${fmt(i.value)}</span>
      <div class="col__bar"><div class="col__fill" style="height:${Math.max(3, i.value / max * 100).toFixed(1)}%"></div></div>
      <span class="col__label">${escapeHtml(i.label)}</span>
    </div>`).join('') + `</div>`;
}

function kpi(label, valor, icono, sub) {
  return `<div class="kpi">
      <div class="kpi__head">
        <span class="kpi__label">${escapeHtml(label)}</span>
        <span class="kpi__icon">${iconoSvg(icono)}</span>
      </div>
      <strong>${fmt(valor)}</strong>
      ${sub ? `<small>${escapeHtml(sub)}</small>` : ''}
    </div>`;
}

async function cargarStats() {
  if (statsCtl) statsCtl.abort();
  statsCtl = new AbortController();
  const p = params({ zonal: ($('f-zonal')||{}).value, anio: ($('f-anio')||{}).value, zona: ($('f-zona')||{}).value });
  try {
    const s = await api('/api/estadisticas?' + p, { signal: statsCtl.signal });
    const kg = s.porZonal.reduce((a, z) => a + (z.total_toneladas_kg || 0), 0);
    const den = s.porZonal.reduce((a, z) => a + (z.total_denuncias || 0), 0);
    const totalReg = s.porZonal.reduce((a, z) => a + z.registros, 0);
    const pond = clave => totalReg
      ? s.porZonal.reduce((a, z) => a + (z[clave] || 0) * z.registros, 0) / totalReg : null;

    const res = $('resumen'); if (res) {
      res.innerHTML =
        kpi('Registros', s.total, ICONOS.registros, 'según filtros activos') +
        kpi('Administraciones zonales', s.porZonal.length, ICONOS.zonales) +
        kpi('Total toneladas (kg)', kg, ICONOS.basura) +
        kpi('Total denuncias', den, ICONOS.denuncia) +
        kpi('Cumplimiento promedio', pond('cumplimiento_promedio'), ICONOS.check, 'promedio ponderado %') +
        kpi('Buenas reseñas promedio', pond('resenas_promedio'), ICONOS.estrella, 'promedio ponderado %');
    }

    const cz = $('chart-zonal'); if (cz) renderRanking(cz, s.porZonal.map(z => ({ label: z._id, value: z.total_toneladas_kg })));
    const ca = $('chart-anio'); if (ca) renderColumnas(ca, s.porAnio.map(a => ({ label: a._id, value: a.total_toneladas_kg })));

    const ts = $('tabla-stats'); if (ts) {
      ts.innerHTML = s.porZonal.map(z => `
        <tr><td>${escapeHtml(z._id)}</td><td class="num">${fmt(z.registros)}</td><td class="num">${fmt(z.total_toneladas_kg)}</td>
        <td class="num">${fmt(z.total_denuncias)}</td><td class="num">${meter(z.cumplimiento_promedio)}</td>
        <td class="num">${meter(z.resenas_promedio)}</td></tr>`).join('')
        || '<tr class="vacio"><td colspan="6">Sin datos</td></tr>';
      if (!$('tabla')) {
        const cont = $('contador');
        if (cont) cont.textContent = `${s.porZonal.length} zonal${s.porZonal.length === 1 ? '' : 'es'}`;
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    const res = $('resumen'); if (res) res.innerHTML = '';
    const cz = $('chart-zonal'); if (cz) cz.innerHTML = '<p class="empty">Error al cargar estadísticas</p>';
    const ca = $('chart-anio'); if (ca) ca.innerHTML = '<p class="empty">Error al cargar estadísticas</p>';
    const ts = $('tabla-stats'); if (ts) ts.innerHTML = '<tr class="vacio"><td colspan="6">Error al cargar estadísticas</td></tr>';
  }
}

/* ---------------- Formulario ---------------- */
function abrirForm(r) {
  $('form').reset();
  $('id').value = r?._id || '';
  $('modal-titulo').textContent = r ? 'Editar registro' : 'Nuevo registro';
  const zonal = r?.ubicacion?.administracion_zonal || '';
  llenarSelect($('zonal'), opciones.zonales, 'Seleccione una administración zonal', zonal);
  llenarSelect($('tipo'), opciones.tipos, 'Seleccione un tipo de recolección', r?.recoleccion?.tipo);
  llenarSelect($('frecuencia'), opciones.frecuencias, 'Seleccione una frecuencia', r?.recoleccion?.frecuencia);
  if (r) {
    $('fecha').value = String(r.fecha).slice(0, 10);
    $('zona').value = r.ubicacion.zona;
    $('kg').value = r.indicadores.toneladas_generadas_kg;
    $('denuncias').value = r.indicadores.denuncias_atendidas ?? '';
    $('cumplimiento').value = r.indicadores.porcentaje_cumplimiento ?? '';
    $('resenas').value = r.indicadores.buenas_resenas ?? '';
  }
  $('modal').showModal();
}

window.editar = async id => {
  try { abrirForm(await api('/api/registros/' + id)); }
  catch (err) { toast(err.message, 'error'); }
};

window.eliminar = async id => {
  const ok = await confirmar('Esta acción eliminará el registro de forma permanente. ¿Deseas continuar?',
    { titulo: 'Eliminar registro', texto: 'Eliminar' });
  if (!ok) return;
  try {
    await api('/api/registros/' + id, { method: 'DELETE' });
    toast('Registro eliminado correctamente');
    await actualizarTodo();
  } catch (err) { toast(err.message, 'error'); }
};

const formEl = $('form');
if (formEl) formEl.addEventListener('submit', async e => {
  e.preventDefault();
  const num = v => (v === '' ? undefined : Number(v));
  const fecha = $('fecha').value;
  const body = {
    fecha, anio: Number(fecha.slice(0, 4)), mes: Number(fecha.slice(5, 7)),
    trimestre: Math.ceil(Number(fecha.slice(5, 7)) / 3),
    ubicacion: { administracion_zonal: $('zonal').value, zona: $('zona').value },
    recoleccion: { tipo: $('tipo').value, frecuencia: $('frecuencia').value },
    indicadores: {
      toneladas_generadas_kg: num($('kg').value), denuncias_atendidas: num($('denuncias').value),
      porcentaje_cumplimiento: num($('cumplimiento').value), buenas_resenas: num($('resenas').value)
    }
  };
  const id = $('id').value;
  const btn = e.submitter || $('form').querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    await api(id ? '/api/registros/' + id : '/api/registros', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    $('modal').close();
    toast(id ? 'Registro actualizado' : 'Registro creado');
    await actualizarTodo();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
});

/* ---------------- Eventos ---------------- */
const btnNuevo = $('btn-nuevo');
if (btnNuevo) btnNuevo.onclick = () => abrirForm();
const btnCancelar = $('btn-cancelar');
if (btnCancelar) btnCancelar.onclick = () => $('modal').close();
['f-zonal', 'f-anio', 'f-zona'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('change', () => refrescarConFiltros());
});
const fBuscar = $('f-buscar');
if (fBuscar) fBuscar.addEventListener('input', pintarTabla);
const btnLimpiar = $('btn-limpiar');
if (btnLimpiar) btnLimpiar.addEventListener('click', () => {
  ['f-zonal', 'f-anio', 'f-zona'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  const fb = $('f-buscar'); if (fb) fb.value = '';
  refrescarConFiltros();
});

async function refrescarConFiltros() {
  await Promise.all([cargarRegistros(), cargarStats()]);
}

async function actualizarTodo() {
  await Promise.all([cargarFiltros(), cargarOpciones()]);
  await refrescarConFiltros();
}

/* ---------------- Tiempo real (SSE) ---------------- */
function conectarEventos() {
  if (!window.EventSource) return;
  let es;
  try { es = new EventSource('/api/eventos'); } catch (e) { return; }
  let t = null;
  es.onmessage = ev => {
    let data = {};
    try { data = JSON.parse(ev.data); } catch (e) {}
    if (data.origen && data.origen === CLIENT_ID) return;
    clearTimeout(t);
    t = setTimeout(() => actualizarTodo().catch(() => {}), 150);
  };
}

pintarAuth();

// La página de Registros (CRUD) es exclusiva de administradores @municipioquito.gob.ec
if (/registros\.html$/.test(location.pathname) && !esAdmin()) {
  location.replace('login.html?redir=' + encodeURIComponent('registros.html'));
} else {
  actualizarTodo()
    .then(conectarEventos)
    .catch(err => toast(err.message, 'error'));
}
