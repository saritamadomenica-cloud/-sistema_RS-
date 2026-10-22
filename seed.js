// Carga los datos de PRO_FINAL (carpeta /datos) en MongoDB.
// Uso: npm run seed   (borra y vuelve a cargar las colecciones)
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Registro } = require('./modelos');

async function cargarDatos({ forzar = false } = {}) {
  const total = await Registro.countDocuments();
  if (total > 0 && !forzar) return { omitido: true, total };

  const registros = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', 'registros.json'), 'utf8'));

  await Registro.deleteMany({});
  await Registro.insertMany(registros.map(r => ({ ...r, fecha: new Date(r.fecha) })));
  return { omitido: false, total: registros.length };
}

module.exports = { cargarDatos };

if (require.main === module) {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sistema_residuos';
  mongoose.connect(uri)
    .then(() => cargarDatos({ forzar: true }))
    .then(r => { console.log(`Cargados ${r.total} registros en ${uri}`); return mongoose.disconnect(); })
    .catch(e => { console.error('Error:', e.message); process.exit(1); });
}
