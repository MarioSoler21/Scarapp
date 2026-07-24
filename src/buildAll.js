const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { fillExcelTemplate, fillExcelTemplateMultiSheet } = require('./excelFill');
const { fillWordTemplate } = require('./wordFill');
const { buildFotoReport } = require('./fotoReport');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const DEFAULT_ACTIVIDADES = [
  'Conformación de rasante, perfilado de cunetas, afinamiento y compactación de calles',
  'Suministro, acarreo y colocación de material selecto',
  'Señalización y seguridad vial',
  'Acarreo de material de desperdicio',
];

function formatMoney(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toTitleCase(str) {
  return String(str || '')
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// Convierte a numero solo si es un numero valido; si no (ej. "[PENDIENTE]" o vacio), conserva el texto tal cual.
function numOr(val) {
  if (val === undefined || val === null || val === '') return val;
  const n = Number(val);
  return Number.isFinite(n) ? n : val;
}

// El numero de contrato completo llega desde un unico campo del formulario; el prefijo/sufijo
// se derivan aqui en el servidor para no depender de campos ocultos que el usuario no ve ni edita.
function splitNumeroContrato(numeroContrato) {
  const m = String(numeroContrato || '').match(/^(.*-)(\d{4,5}-\d{3,4}-\d{4})\s*$/);
  if (m) return { prefijo: m[1], sufijo: m[2] };
  return { prefijo: '', sufijo: numeroContrato || '' };
}

function buildCommonData(fields) {
  const periodo = `De ${fields.fecha_orden_inicio} al ${fields.fecha_finalizacion}`;
  const { prefijo, sufijo } = splitNumeroContrato(fields.numero_contrato);
  return {
    numero_contrato: fields.numero_contrato,
    numero_contrato_prefijo: prefijo || 'MSPS.GINF-COND.TER-',
    numero_contrato_sufijo: sufijo,
    nombre_proyecto: fields.nombre_proyecto,
    ubicacion: fields.ubicacion,
    contratista_nombre: fields.contratista_nombre,
    contratista_nombre_tc: toTitleCase(fields.contratista_nombre),
    empresa_nombre: fields.empresa_nombre,
    monto_contrato: numOr(fields.monto_contrato),
    monto_contrato_fmt: formatMoney(fields.monto_contrato),
    plazo_dias: numOr(fields.plazo_dias),
    total_metros: numOr(fields.total_metros),
    fecha_orden_inicio: fields.fecha_orden_inicio,
    fecha_finalizacion: fields.fecha_finalizacion,
    periodo_orden_inicio: periodo,
    periodo_ejecucion: periodo,

    gerente_infraestructura: fields.gerente_infraestructura,
    jefe_mantenimiento_vias: fields.jefe_mantenimiento_vias,
    director_infraestructura: fields.director_infraestructura,
    supervisor_nombre: fields.supervisor_nombre,

    centro_costo: fields.centro_costo,
    numero_reserva: fields.numero_reserva,
    codigo_reserva: fields.codigo_reserva,
    numero_memorando: fields.numero_memorando,

    fecha_memorando_tesoreria: fields.fecha_memorando_tesoreria,
    fecha_memo_avance: fields.fecha_memo_avance,
    fecha_acuerdo_pago: fields.fecha_acuerdo_pago,

    avance_fisico_pct: numOr(fields.avance_fisico_pct),

    descripcion_actividades: fields.descripcion_actividades,
    actividad_1: fields.actividad_1 || DEFAULT_ACTIVIDADES[0],
    actividad_2: fields.actividad_2 || DEFAULT_ACTIVIDADES[1],
    actividad_3: fields.actividad_3 || DEFAULT_ACTIVIDADES[2],
    actividad_4: fields.actividad_4 || DEFAULT_ACTIVIDADES[3],
  };
}

/**
 * Genera los 7 documentos del expediente en `outDir` y devuelve la ruta al .zip final.
 * `fields`: datos planos del formulario (ver buildCommonData).
 * `informes`: [{ numero, periodo, avance_fisico_pct, metros_ejecutados, dias_transcurridos, fotos:[{path}] }]
 */
async function generateExpediente(fields, informes, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const common = buildCommonData(fields);
  const sufijo = common.numero_contrato_sufijo || common.numero_contrato;

  const outputs = [];

  outputs.push(await fillExcelTemplate(
    path.join(TEMPLATES_DIR, 'ACUERDO_PAGO.xlsx'),
    common,
    path.join(outDir, `ACUERDO PAGO ${sufijo}.xlsx`),
  ));

  outputs.push(await fillExcelTemplate(
    path.join(TEMPLATES_DIR, 'FICHA_TECNICA.xlsx'),
    common,
    path.join(outDir, `FICHA TECNICA ${sufijo}.xlsx`),
  ));

  outputs.push(await fillExcelTemplate(
    path.join(TEMPLATES_DIR, 'SOLICITUD_FORMALIZACION.xlsx'),
    common,
    path.join(outDir, `SOLICITUD DE FORMALIZACION ${sufijo}.xlsx`),
  ));

  const perSheet = informes.map((inf) => ({
    numero_informe: inf.numero,
    periodo_informe: inf.periodo,
    avance_fisico_pct: numOr(inf.avance_fisico_pct),
    metros_ejecutados: numOr(inf.metros_ejecutados),
    dias_transcurridos: numOr(inf.dias_transcurridos),
    avance_tiempo_frac: inf.dias_transcurridos && common.plazo_dias
      ? Number((inf.dias_transcurridos / common.plazo_dias).toFixed(4))
      : '',
  }));
  outputs.push(await fillExcelTemplateMultiSheet(
    path.join(TEMPLATES_DIR, 'INFORMES_SEMANALES.xlsx'),
    common,
    perSheet,
    path.join(outDir, `INFORMES SEMANALES ${sufijo}.xlsx`),
  ));

  outputs.push(fillWordTemplate(
    path.join(TEMPLATES_DIR, 'MEMO_AVANCE_FISICO.docx'),
    common,
    path.join(outDir, `MEMO AVANCE FISICO ${sufijo}.docx`),
  ));

  outputs.push(fillWordTemplate(
    path.join(TEMPLATES_DIR, 'MEMORANDO_TESORERIA.docx'),
    common,
    path.join(outDir, `MEMORANDO TESORERIA ${sufijo}.docx`),
  ));

  outputs.push(await buildFotoReport(
    common,
    informes,
    path.join(outDir, `INFORME FOTOGRAFICO ${sufijo}.docx`),
  ));

  const zipPath = path.join(outDir, `Expediente ${sufijo}.zip`);
  await zipFiles(outputs, zipPath);

  return { files: outputs, zipPath };
}

function zipFiles(files, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);
    archive.pipe(output);
    files.forEach((f) => archive.file(f, { name: path.basename(f) }));
    archive.finalize();
  });
}

module.exports = { generateExpediente, buildCommonData };
