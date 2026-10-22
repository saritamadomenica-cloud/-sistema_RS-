const mongoose = require('mongoose');
const { Schema } = mongoose;

// Documento anidado: cada registro agrupa ubicación, recolección, indicadores y clasificación.
const registroSchema = new Schema({
  fecha: { type: Date, required: true },
  anio: { type: Number, required: true },
  trimestre: Number,
  mes: Number,
  periodo_datos: String,
  ubicacion: {
    provincia: { type: String, default: 'Pichincha' },
    canton: { type: String, default: 'Quito' },
    administracion_zonal: { type: String, required: true },
    zona: { type: String, enum: ['Urbana', 'Rural'], required: true },
    coordenadas: { lat: Number, lng: Number }
  },
  recoleccion: { tipo: String, frecuencia: String },
  indicadores: {
    toneladas_generadas_kg: { type: Number, required: true, min: 0 },
    toneladas_mensuales: Number,
    denuncias_atendidas: { type: Number, min: 0 },
    denuncias_mensuales: Number,
    porcentaje_cumplimiento: { type: Number, min: 0, max: 100 },
    buenas_resenas: { type: Number, min: 0, max: 100 }
  },
  clasificacion: {
    categoria_toneladas: { type: String, enum: ['Bajo', 'Medio', 'Alto'] },
    nivel_cumplimiento: String
  },
  fin_de_semana: { type: Boolean, default: false }
}, { collection: 'registros', timestamps: true });

registroSchema.index({ anio: 1, 'ubicacion.administracion_zonal': 1 });

module.exports = {
  Registro: mongoose.model('Registro', registroSchema)
};
