// Extrae los datos relevantes del texto de la "Orden de Inicio" (PDF de texto).

function clean(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function parseOrdenInicio(text) {
  const flat = clean(text);
  const errors = [];
  const data = {};

  const mInicio = flat.match(/FECHA DE INICIO:\s*([A-ZÁÉÍÓÚÑ]+\s+\d{1,2}\s+DE\s+[A-ZÁÉÍÓÚÑ]+\s+DE\s+\d{4})/i);
  if (mInicio) {
    data.fecha_orden_inicio = clean(mInicio[1]);
  } else {
    errors.push('No se encontro la FECHA DE INICIO en la Orden de Inicio');
  }

  const mFin = flat.match(/FINALIZACION DE LA OBRA:\s*([A-ZÁÉÍÓÚÑ]+\s+\d{1,2}\s+DE\s+[A-ZÁÉÍÓÚÑ]+\s+DE\s+\d{4})/i);
  if (mFin) {
    data.fecha_finalizacion = clean(mFin[1]);
  } else {
    errors.push('No se encontro la FINALIZACION DE LA OBRA en la Orden de Inicio');
  }

  const mPlazo = flat.match(/TIEMPO DE DURACIÓN:\s*(\d+)\s*DIAS CALENDARIO/i);
  if (mPlazo) data.plazo_dias = Number(mPlazo[1]);

  const mNum = flat.match(/expediente No\.\s*MSPS\.GINF-COND[.\-]TER-(\d{4,5}-\d{3,4}-\d{4})/i);
  if (mNum) {
    data.numero_contrato = `MSPS.GINF-COND.TER-${mNum[1]}`;
    data.numero_contrato_sufijo = mNum[1];
  }

  const mDepto = flat.match(/a través del Departamento de\s+([A-ZÁÉÍÓÚÑ\s]+?),?\s*hasta su finalización/i);
  if (mDepto) data.depto_supervision = clean(mDepto[1]);

  // Firmante: "MSc. Luis Antonio Beltran Aleman \n Gerente de Infraestructura"
  const mGerente = flat.match(/Atentamente,\s*(?:MSc\.|Msc\.|Ms\.)\s*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]+?)\s*Gerente de Infraestructura/i);
  if (mGerente) {
    data.gerente_infraestructura = clean(mGerente[1]).toUpperCase();
  } else {
    errors.push('No se encontro el nombre del Gerente de Infraestructura que firma la Orden de Inicio');
  }

  const mFechaEmision = flat.match(/San Pedro Sula,\s*Cortes,\s*(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4})/i);
  if (mFechaEmision) data.fecha_emision_orden = clean(mFechaEmision[1]);

  const mContratista = flat.match(/Señor \(a\) \(res\):\s*([A-ZÁÉÍÓÚÑ\s]+?)\s*REPRESENTANTE LEGAL/i);
  if (mContratista) data.contratista_nombre = clean(mContratista[1]);

  const mEmpresa = flat.match(/REPRESENTANTE LEGAL\s*([A-ZÁÉÍÓÚÑ0-9\s]+?)\s*Por medio de la presente/i);
  if (mEmpresa) data.empresa_nombre = clean(mEmpresa[1]);

  return { data, errors };
}

module.exports = { parseOrdenInicio };
