const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Registro } = require('./modelos');
const { cargarDatos } = require('./seed');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sistema_residuos';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const h = fn => (req, res) => fn(req, res).catch(e => {
  const codigo = e.name === 'ValidationError' || e.name === 'CastError' ? 400 : 500;
  res.status(codigo).json({ error: e.message });
});

// --- Autenticación de administradores ---
// Solo cuentas @municipioquito.gob.ec pueden iniciar sesión y usar el CRUD.
// La contraseña se configura con la variable de entorno ADMIN_PASSWORD.
const DOMINIO_ADMIN = '@municipioquito.gob.ec';
const PASSWORD_ADMIN = process.env.ADMIN_PASSWORD || 'admin123';
const SESION_VIDA_MS = 8 * 60 * 60 * 1000; // 8 horas
const sesiones = new Map();

setInterval(() => {
  const ahora = Date.now();
  for (const [tok, s] of sesiones) if (s.expira < ahora) sesiones.delete(tok);
}, 10 * 60 * 1000).unref();

function tokenDe(req) {
  const auth = req.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

function sesionValida(token) {
  const s = token && sesiones.get(token);
  if (!s) return null;
  if (s.expira < Date.now()) { sesiones.delete(token); return null; }
  return s;
}

function requerirAdmin(req, res, next) {
  if (!sesionValida(tokenDe(req))) {
    return res.status(401).json({ error: 'Acceso restringido: inicie sesión con una cuenta administrativa' });
  }
  next();
}

app.post('/api/login', h(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email.endsWith(DOMINIO_ADMIN)) {
    return res.status(401).json({ error: `Solo cuentas administrativas ${DOMINIO_ADMIN} pueden iniciar sesión` });
  }
  if (password !== PASSWORD_ADMIN) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sesiones.set(token, { email, expira: Date.now() + SESION_VIDA_MS });
  res.json({ token, email });
}));

app.post('/api/logout', (req, res) => {
  const t = tokenDe(req);
  if (t) sesiones.delete(t);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const s = sesionValida(tokenDe(req));
  s ? res.json({ email: s.email }) : res.status(401).json({ error: 'No autenticado' });
});

// --- Notificaciones en tiempo real (SSE) ---
const sseClientes = new Set();

function emitirCambio(req) {
  const origen = req.get('X-Client-Id') || '';
  const payload = `data: ${JSON.stringify({ origen, ts: Date.now() })}\n\n`;
  for (const res of sseClientes) {
    try { res.write(payload); } catch (e) { sseClientes.delete(res); }
  }
}

app.get('/api/eventos', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write(': conectado\n\n');
  sseClientes.add(res);
  const keep = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (e) { clearInterval(keep); sseClientes.delete(res); }
  }, 25000);
  req.on('close', () => { clearInterval(keep); sseClientes.delete(res); });
});

// Fusión profunda para que un PUT no borre los campos anidados que el formulario no envía.
const esObjeto = v => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
function fusionar(destino, fuente) {
  for (const [k, v] of Object.entries(fuente)) {
    if (k === '_id' || k === '__v' || k === 'createdAt' || k === 'updatedAt') continue;
    if (esObjeto(v) && esObjeto(destino[k])) fusionar(destino[k], v);
    else destino[k] = v;
  }
}

// Listado con filtros opcionales
app.get('/api/registros', h(async (req, res) => {
  const { zonal, anio, zona } = req.query;
  const f = {};
  if (typeof zonal === 'string' && zonal) f['ubicacion.administracion_zonal'] = zonal;
  if (typeof anio === 'string' && anio.trim() !== '') {
    const na = Number(anio);
    if (!Number.isFinite(na) || !Number.isInteger(na)) return res.status(400).json({ error: 'anio inválido' });
    f.anio = na;
  }
  if (typeof zona === 'string' && (zona === 'Urbana' || zona === 'Rural')) {
    f['ubicacion.zona'] = zona;
  }
  res.json(await Registro.find(f).sort({ anio: 1, 'ubicacion.administracion_zonal': 1 }));
}));

app.get('/api/registros/:id', h(async (req, res) => {
  const r = await Registro.findById(req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'No encontrado' });
}));

app.post('/api/registros', requerirAdmin, h(async (req, res) => {
  const creado = await Registro.create(req.body);
  emitirCambio(req);
  res.status(201).json(creado);
}));

app.put('/api/registros/:id', requerirAdmin, h(async (req, res) => {
  const r = await Registro.findById(req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  fusionar(r, req.body);
  await r.save();
  emitirCambio(req);
  res.json(r);
}));

app.delete('/api/registros/:id', requerirAdmin, h(async (req, res) => {
  const r = await Registro.findByIdAndDelete(req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  emitirCambio(req);
  res.json({ ok: true });
}));

// Valores para llenar los filtros y formularios
app.get('/api/filtros', h(async (req, res) => {
  const [zonales, anios] = await Promise.all([
    Registro.distinct('ubicacion.administracion_zonal'),
    Registro.distinct('anio')
  ]);
  res.json({
    zonales: (zonales.filter(v => v != null && v !== '')).sort((a, b) => a.localeCompare(b)),
    anios: (anios.filter(v => v != null).sort((a, b) => Number(a) - Number(b)))
  });
}));

app.get('/api/opciones', h(async (req, res) => {
  const [zonales, tipos, frecuencias] = await Promise.all([
    Registro.distinct('ubicacion.administracion_zonal'),
    Registro.distinct('recoleccion.tipo'),
    Registro.distinct('recoleccion.frecuencia')
  ]);
  res.json({
    zonales: (zonales.filter(v => v != null && v !== '')).sort((a, b) => a.localeCompare(b)),
    tipos: (tipos.filter(v => v != null && v !== '')).sort((a, b) => a.localeCompare(b)),
    frecuencias: (frecuencias.filter(v => v != null && v !== '')).sort((a, b) => a.localeCompare(b))
  });
}));

// Estadísticas por administración zonal (pipeline de agregación)
app.get('/api/estadisticas', h(async (req, res) => {
  const { zonal, anio, zona } = req.query;
  const match = {};
  if (typeof zonal === 'string' && zonal) match['ubicacion.administracion_zonal'] = zonal;
  if (typeof anio === 'string' && anio.trim() !== '') {
    const na = Number(anio);
    if (!Number.isFinite(na) || !Number.isInteger(na)) return res.status(400).json({ error: 'anio inválido' });
    match.anio = na;
  }
  if (typeof zona === 'string' && (zona === 'Urbana' || zona === 'Rural')) match['ubicacion.zona'] = zona;

  const [porZonal, porAnio] = await Promise.all([
    Registro.aggregate([
      { $match: match },
      { $group: {
          _id: '$ubicacion.administracion_zonal',
          registros: { $sum: 1 },
          total_toneladas_kg: { $sum: '$indicadores.toneladas_generadas_kg' },
          total_denuncias: { $sum: '$indicadores.denuncias_atendidas' },
          cumplimiento_promedio: { $avg: '$indicadores.porcentaje_cumplimiento' },
          resenas_promedio: { $avg: '$indicadores.buenas_resenas' } } },
      { $sort: { total_toneladas_kg: -1 } }
    ]),
    Registro.aggregate([
      { $match: match },
      { $group: { _id: '$anio', total_toneladas_kg: { $sum: '$indicadores.toneladas_generadas_kg' },
                  total_denuncias: { $sum: '$indicadores.denuncias_atendidas' },
                  toneladas_mensuales: { $avg: '$indicadores.toneladas_mensuales' },
                  cumplimiento: { $avg: '$indicadores.porcentaje_cumplimiento' } } },
      { $sort: { _id: 1 } }
    ])
  ]);
  res.json({ porZonal, porAnio, total: await Registro.countDocuments(match) });
}));

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB conectado:', MONGO_URI);
    const r = await cargarDatos();
    console.log(r.omitido ? `Datos existentes (${r.total} registros)` : `Datos iniciales cargados (${r.total} registros)`);
    app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
  })
  .catch(e => { console.error('No se pudo conectar a MongoDB:', e.message); process.exit(1); });
