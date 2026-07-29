const path = require('path');
const { fillExcelTemplateMultiSheet } = require('./excelFill');

const CAPACITY = 4;
const ACTIVIDAD_ROWS = [21, 22, 23, 24, 25, 26];
const PLAN_ROWS = [28, 29, 30, 31, 32, 33];

/**
 * Genera hasta 4 archivos .xlsx independientes (Informe Semanal Sistemas No 1..4),
 * a diferencia de los demas tipos que usan un solo libro con varias hojas.
 */
async function buildSistemasInformes(templatePath, common, periodos, outDir, sufijo) {
  const usados = periodos.slice(0, CAPACITY);
  const files = [];

  for (let idx = 0; idx < usados.length; idx += 1) {
    const p = usados[idx];
    const diasTranscurridos = Number(p.dias_transcurridos);
    const avanceTiempoFrac = common.plazo_dias
      ? diasTranscurridos / Number(common.plazo_dias)
      : '';
    const avanceFisicoPct = p.avance_fisico_pct === '' || p.avance_fisico_pct === undefined
      ? ''
      : Number(p.avance_fisico_pct);

    const actividades = (p.actividades || []).filter((a) => a && String(a).trim() !== '');
    const plan = (p.plan || []).filter((a) => a && String(a).trim() !== '');

    const data = {
      numero_informe: p.numero,
      periodo_informe_corto: p.periodo_corto || '',
      dias_transcurridos_periodo: p.dias_transcurridos,
      avance_fisico_periodo_pct: avanceFisicoPct,
      avance_tiempo_periodo_frac: avanceTiempoFrac,
      _trimRowBlocks: [
        { rowNumbers: ACTIVIDAD_ROWS, keep: Math.max(1, Math.min(6, actividades.length)) },
        { rowNumbers: PLAN_ROWS, keep: Math.max(1, Math.min(6, plan.length)) },
      ],
    };
    ACTIVIDAD_ROWS.forEach((_, i) => {
      data[`actividad_periodo_${i + 1}`] = actividades[i] ?? '';
    });
    PLAN_ROWS.forEach((_, i) => {
      data[`plan_periodo_${i + 1}`] = plan[i] ?? '';
    });

    // eslint-disable-next-line no-await-in-loop
    const outPath = path.join(outDir, `INFORME SEMANAL SISTEMAS No ${p.numero} ${sufijo}.xlsx`);
    // eslint-disable-next-line no-await-in-loop
    await fillExcelTemplateMultiSheet(templatePath, common, [data], outPath, { keepSheets: 1 });
    files.push(outPath);
  }

  return files;
}

module.exports = { buildSistemasInformes };
