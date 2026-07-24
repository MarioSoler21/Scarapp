// Extrae los datos relevantes del texto del "Contrato de Obra Publica" (PDF de texto).

function clean(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function parseContrato(text) {
  const t = text.replace(/\r/g, '');
  const flat = clean(t);

  const errors = [];
  const data = {};

  // Numero de contrato: MSPS.GINF-COND.TER-00023-2403-2026 (formato flexible con . o -)
  const mNum = flat.match(/MSPS\.GINF-COND[.\-]TER-(\d{4,5}-\d{3,4}-\d{4})/i);
  if (mNum) {
    data.numero_contrato = `MSPS.GINF-COND.TER-${mNum[1]}`;
    data.numero_contrato_sufijo = mNum[1];
    data.numero_contrato_prefijo = 'MSPS.GINF-COND.TER-';
  } else {
    errors.push('No se encontro el numero de contrato (MSPS.GINF-COND.TER-...)');
  }

  // Nombre del proyecto: entre "CONTRATO DE OBRA PUBLICA / <numero>" y "Nosotros:"
  const mProy = flat.match(/\d{4}-\d{3,4}-\d{4}\s*Página\s*\d+\s*de\s*\d+\s*(.*?)\s*Nosotros:/i);
  if (mProy) {
    data.nombre_proyecto = clean(mProy[1]).replace(/\.\s*$/, '');
  } else {
    errors.push('No se encontro el nombre del proyecto antes de "Nosotros:"');
  }

  // Ubicacion (distrito / colonias) - dentro de UBICACION: "..." en la clausula PRIMERA
  const mUbi = flat.match(/UBICACION:\s*([A-ZÁÉÍÓÚÑ0-9:,\s\/.]+?)\s*;\s*de acuerdo/i);
  if (mUbi) {
    data.ubicacion = clean(mUbi[1]);
  } else {
    errors.push('No se encontro la UBICACION en la clausula PRIMERA');
  }

  // Alcalde
  const mAlcalde = flat.match(/Nosotros:\s*([A-ZÁÉÍÓÚÑ\s]+?),\s*hondureñ[oa]/);
  if (mAlcalde) data.alcalde_nombre = clean(mAlcalde[1]);

  // Contratista (persona natural) + empresa
  const mContratista = flat.match(/y el señor\s+([A-ZÁÉÍÓÚÑ\s]+?)\s*,\s*mayor de edad/i);
  if (mContratista) {
    data.contratista_nombre = clean(mContratista[1]);
    data.contratista_nombre_tc = toTitleCase(data.contratista_nombre);
  } else {
    errors.push('No se encontro el nombre del contratista ("y el señor ...")');
  }

  const mEmpresa = flat.match(/empresa mercantil denominada:\s*\(?\s*([A-ZÁÉÍÓÚÑ0-9\s.]+?)\s*\)\.?\s*constituida/i);
  if (mEmpresa) {
    data.empresa_nombre = clean(mEmpresa[1]);
  } else {
    errors.push('No se encontro el nombre de la empresa contratista');
  }

  // Monto del contrato: L.1,276,700.00
  const mMonto = flat.match(/CUARTA:\s*MONTO DEL CONTRATO[\s\S]*?\(L\.\s*([\d,]+\.\d{2})\)/i);
  if (mMonto) {
    data.monto_contrato = Number(mMonto[1].replace(/,/g, ''));
  } else {
    errors.push('No se encontro el monto del contrato (Clausula CUARTA)');
  }

  // Plazo en dias
  const mPlazo = flat.match(/SEGUNDA:\s*PLAZO[\s\S]*?TREINTA\s*\((\d+)\)\s*DIAS CALENDARIO/i)
    || flat.match(/plazo de ejecución del presente contrato será de[^(]*\((\d+)\)\s*DIAS CALENDARIO/i);
  if (mPlazo) {
    data.plazo_dias = Number(mPlazo[1]);
  } else {
    errors.push('No se encontro el plazo en dias (Clausula SEGUNDA)');
  }

  // Multa diaria %
  const mMulta = flat.match(/multa diaria equivalente al[^(]*\(([\d.]+)%\)/i);
  if (mMulta) data.multa_diaria_pct = Number(mMulta[1]);

  // Garantia de cumplimiento %
  const mGarantia = flat.match(/QUINCE POR CIENTO\s*\((\d+)%\)/i);
  if (mGarantia) data.garantia_pct = Number(mGarantia[1]);

  // Longitud aproximada en KM -> metros
  const mKm = flat.match(/LONG\.?\s*APROX\.?\s*(\d+)\s*KM/i);
  if (mKm) data.total_metros = Number(mKm[1]) * 1000;

  // Fecha de firma: "a los cuatro (04) dias del mes de mayo del año dos mil veintiseis (2026)"
  const mFirma = flat.match(/a los\s+\S+\s*\((\d{1,2})\)\s*días?\s*del mes de\s+([a-záéíóú]+)\s*del año[^(]*\((\d{4})\)/i);
  if (mFirma) {
    data.fecha_firma_contrato = `${mFirma[1]} de ${capitalize(mFirma[2])} de ${mFirma[3]}`;
  }

  return { data, errors };
}

function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1).toLowerCase() : str;
}

module.exports = { parseContrato };
