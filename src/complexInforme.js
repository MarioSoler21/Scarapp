const { fillExcelTemplateMultiSheet } = require('./excelFill');

const CAPACITY = 8;
const ACTIVIDAD_ROWS = [26, 27, 28, 29, 30, 31];
const PLAN_ROWS = [37, 38, 39, 40, 41, 42];

/**
 * Genera el libro de Informes Semanales (formato "complejo": bacheo asfaltico,
 * bacheo hidraulico, sello de juntas, pavimentacion menores). Hasta 8 hojas de
 * periodo, cada una con hasta 6 actividades y 6 items de plan para el siguiente
 * periodo; lo no usado se recorta.
 */
async function buildComplexInformeSemanal(templatePath, common, periodos, outPath) {
  const usados = periodos.slice(0, CAPACITY);

  const perSheetData = usados.map((p) => {
    const metrosEjecutados = Number(p.metros_ejecutados);
    const totalMetros = Number(common.total_metros);
    const avanceFisicoFrac = totalMetros > 0 && Number.isFinite(metrosEjecutados)
      ? metrosEjecutados / totalMetros
      : '';
    const avanceTiempoPct = common.plazo_dias
      ? Math.round((Number(p.dias_transcurridos) / Number(common.plazo_dias)) * 100)
      : '';

    const actividades = (p.actividades || []).filter((a) => a && String(a).trim() !== '');
    const plan = (p.plan || []).filter((a) => a && String(a).trim() !== '');

    const data = {
      numero_informe: p.numero,
      periodo_informe: p.periodo || '',
      dias_transcurridos_periodo: p.dias_transcurridos,
      metros_ejecutados: p.metros_ejecutados,
      avance_fisico_periodo_frac: avanceFisicoFrac,
      avance_tiempo_periodo_pct: avanceTiempoPct,
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
    return data;
  });

  return fillExcelTemplateMultiSheet(templatePath, common, perSheetData, outPath, { keepSheets: usados.length });
}

module.exports = { buildComplexInformeSemanal };
