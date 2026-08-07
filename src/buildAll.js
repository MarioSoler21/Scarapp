const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { fillExcelTemplate, fillExcelTemplateMultiSheet } = require('./excelFill');
const { fillWordTemplate } = require('./wordFill');
const { buildFotoReport } = require('./fotoReport');
const { buildComplexInformeSemanal } = require('./complexInforme');
const { buildSistemasInformes } = require('./sistemasInforme');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// Carpeta de plantillas (Ficha Tecnica / Informes Semanales) por tipo de estimacion.
// "sello_de_juntas" comparte formato con "bacheo_hidraulico" (mismo tipo de reparacion de pavimento).
const TYPE_DIR = {
  terraceria: 'terraceria',
  bacheo_asfaltico: 'bacheo_asfaltico',
  bacheo_hidraulico: 'bacheo_hidraulico',
  sello_de_juntas: 'bacheo_hidraulico',
  pavimentacion_menores: 'pavimentacion_menores',
  sistemas: 'sistemas',
};
const COMPLEX_TYPES = new Set(['bacheo_asfaltico', 'bacheo_hidraulico', 'sello_de_juntas', 'pavimentacion_menores']);
const MAX_ORDENES_CAMBIO = 4;

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

// fields.ordenes_cambio: [{ label, monto }, ...] (opcional; usado por Pavimentacion Menores y Sistemas).
function buildOrdenesCambioData(fields) {
  const ordenes = Array.isArray(fields.ordenes_cambio) ? fields.ordenes_cambio : [];
  const montoBase = Number(fields.monto_contrato) || 0;
  const data = {};
  let total = montoBase;
  for (let i = 0; i < MAX_ORDENES_CAMBIO; i += 1) {
    const oc = ordenes[i];
    const monto = oc ? Number(oc.monto) || 0 : '';
    data[`oc_label_${i + 1}`] = oc ? (oc.label || '') : '';
    data[`oc_monto_${i + 1}`] = monto;
    if (oc) total += monto;
  }
  data.monto_total_pagar = total;
  data._ordenesCambioCount = ordenes.filter((o) => o && (o.label || o.monto)).length;
  return data;
}

function buildCommonData(fields) {
  const periodo = `De ${fields.fecha_orden_inicio} al ${fields.fecha_finalizacion}`;
  const { prefijo, sufijo } = splitNumeroContrato(fields.numero_contrato);
  const avanceFisicoPct = numOr(fields.avance_fisico_pct);
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
    supervisor_cargo: fields.supervisor_cargo || 'SUPERVISOR',
    contratista_cargo: fields.contratista_cargo || 'representante legal',

    centro_costo: fields.centro_costo,
    numero_reserva: fields.numero_reserva,
    codigo_reserva: fields.codigo_reserva,
    numero_memorando: fields.numero_memorando,

    fecha_memorando_tesoreria: fields.fecha_memorando_tesoreria,
    fecha_memo_avance: fields.fecha_memo_avance,
    fecha_acuerdo_pago: fields.fecha_acuerdo_pago,

    avance_fisico_pct: avanceFisicoPct,
    avance_fisico_frac: typeof avanceFisicoPct === 'number' ? avanceFisicoPct / 100 : '',

    descripcion_actividades: fields.descripcion_actividades,
    actividad_1: fields.actividad_1 || DEFAULT_ACTIVIDADES[0],
    actividad_2: fields.actividad_2 || DEFAULT_ACTIVIDADES[1],
    actividad_3: fields.actividad_3 || DEFAULT_ACTIVIDADES[2],
    actividad_4: fields.actividad_4 || DEFAULT_ACTIVIDADES[3],

    ...buildOrdenesCambioData(fields),
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
  const tipoDir = TYPE_DIR[fields.tipo_estimacion] || 'terraceria';

  const outputs = [];

  outputs.push(await fillExcelTemplate(
    path.join(TEMPLATES_DIR, 'ACUERDO_PAGO.xlsx'),
    common,
    path.join(outDir, `ACUERDO PAGO ${sufijo}.xlsx`),
  ));

  outputs.push(await fillExcelTemplate(
    path.join(TEMPLATES_DIR, tipoDir, 'FICHA_TECNICA.xlsx'),
    common,
    path.join(outDir, `FICHA TECNICA ${sufijo}.xlsx`),
  ));

  outputs.push(await fillExcelTemplate(
    path.join(TEMPLATES_DIR, 'SOLICITUD_FORMALIZACION.xlsx'),
    common,
    path.join(outDir, `SOLICITUD DE FORMALIZACION ${sufijo}.xlsx`),
  ));

  if (COMPLEX_TYPES.has(fields.tipo_estimacion)) {
    outputs.push(await buildComplexInformeSemanal(
      path.join(TEMPLATES_DIR, tipoDir, 'INFORMES_SEMANALES.xlsx'),
      common,
      informes,
      path.join(outDir, `INFORMES SEMANALES ${sufijo}.xlsx`),
    ));
  } else if (fields.tipo_estimacion === 'sistemas') {
    const sistemasFiles = await buildSistemasInformes(
      path.join(TEMPLATES_DIR, tipoDir, 'INFORME_SEMANAL.xlsx'),
      common,
      informes,
      outDir,
      sufijo,
    );
    outputs.push(...sistemasFiles);
  } else {
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
      path.join(TEMPLATES_DIR, tipoDir, 'INFORMES_SEMANALES.xlsx'),
      common,
      perSheet,
      path.join(outDir, `INFORMES SEMANALES ${sufijo}.xlsx`),
    ));
  }

  outputs.push(fillWordTemplate(
    path.join(TEMPLATES_DIR, 'MEMO_AVANCE_FISICO.docx'),
    common,
    path.join(outDir, `MEMO AVANCE FISICO ${sufijo}.docx`),
  ));

  // El Memo de Tesoreria ya no se usa en el expediente de Terraceria (se sigue
  // generando para los demas tipos de estimacion).
  if (fields.tipo_estimacion !== 'terraceria') {
    outputs.push(fillWordTemplate(
      path.join(TEMPLATES_DIR, 'MEMORANDO_TESORERIA.docx'),
      common,
      path.join(outDir, `MEMORANDO TESORERIA ${sufijo}.docx`),
    ));
  }

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
