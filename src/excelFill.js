const ExcelJS = require('exceljs');

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function resolveToken(data, key) {
  if (Object.prototype.hasOwnProperty.call(data, key)) {
    const v = data[key];
    // undefined/null indica un dato que debio resolverse en el servidor y no llego:
    // se deja visible en vez de blanquear en silencio.
    return v === undefined || v === null ? `[${key}?]` : String(v);
  }
  return `{{${key}}}`; // deja visible si falta el dato, para detectarlo facil
}

function replaceInString(str, data) {
  return str.replace(TOKEN_RE, (_, key) => resolveToken(data, key));
}

// Si la celda es EXACTAMENTE un solo token (ej "{{monto_contrato}}") y el valor
// resuelto es numerico, se conserva como numero (para que Excel lo trate como celda numerica).
function isSoleNumericToken(str, data) {
  const m = str.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/);
  if (!m) return null;
  const v = data[m[1]];
  if (typeof v === 'number') return v;
  return null;
}

function fillCellValue(value, data) {
  if (value == null) return value;

  if (typeof value === 'string') {
    if (!value.includes('{{')) return value;
    const numeric = isSoleNumericToken(value, data);
    if (numeric !== null) return numeric;
    return replaceInString(value, data);
  }

  // Rich text: { richText: [{text, font}, ...] }
  if (typeof value === 'object' && Array.isArray(value.richText)) {
    return {
      richText: value.richText.map((run) => ({
        ...run,
        text: typeof run.text === 'string' ? replaceInString(run.text, data) : run.text,
      })),
    };
  }

  return value;
}

/**
 * Carga una plantilla .xlsx, reemplaza los tokens {{clave}} en todas las celdas
 * de todas las hojas usando `data`, y la guarda en `outPath`.
 * Los estilos, imagenes y merges originales se preservan intactos porque solo
 * se toca la propiedad `value` de cada celda.
 */
async function fillExcelTemplate(templatePath, data, outPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const newVal = fillCellValue(cell.value, data);
        if (newVal !== cell.value) {
          cell.value = newVal;
        }
      });
    });
  });

  await workbook.xlsx.writeFile(outPath);
  return outPath;
}

/**
 * Igual que fillExcelTemplate, pero permite usar un conjunto de datos distinto
 * por cada hoja (en el orden en que aparecen en el libro). Cada hoja recibe
 * `commonData` combinado con `perSheetData[i]`.
 */
async function fillExcelTemplateMultiSheet(templatePath, commonData, perSheetData, outPath, opts = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const sheets = workbook.worksheets;
  sheets.forEach((sheet, i) => {
    const data = { ...commonData, ...(perSheetData[i] || {}) };
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const newVal = fillCellValue(cell.value, data);
        if (newVal !== cell.value) {
          cell.value = newVal;
        }
      });
    });

    // Bloques de filas de "capacidad fija" dentro de esta hoja (ej. hasta 6 filas
    // de actividades ya construidas en la plantilla): se recortan a lo realmente usado.
    // Se procesan de abajo hacia arriba: recortar un bloque de mas arriba primero
    // correria las filas de los bloques siguientes e invalidaria sus numeros de fila.
    const blocks = [...(data._trimRowBlocks || [])]
      .sort((a, b) => Math.max(...b.rowNumbers) - Math.max(...a.rowNumbers));
    blocks.forEach(({ rowNumbers, keep }) => {
      trimListRows(sheet, rowNumbers, keep);
    });
  });

  // Plantillas de "capacidad fija" (mas hojas de las que este proyecto necesita):
  // se descartan las hojas sobrantes despues de llenar, en vez de generarlas vacias.
  if (opts.keepSheets != null) {
    const names = sheets.map((s) => s.name);
    trimSheets(workbook, names, opts.keepSheets);
  }

  await workbook.xlsx.writeFile(outPath);
  return outPath;
}

/**
 * Elimina filas sobrantes de un bloque de "capacidad fija" (ej. hasta 6 filas de
 * actividades ya construidas en la plantilla). Se borra de abajo hacia arriba para
 * que los numeros de fila restantes no se corran durante el proceso.
 * `rowNumbers` debe venir ordenado ascendente y representar TODAS las filas del bloque.
 */
function trimListRows(sheet, rowNumbers, keepCount) {
  const toRemove = rowNumbers.slice(keepCount).sort((a, b) => b - a);
  toRemove.forEach((r) => sheet.spliceRows(r, 1));
}

/** Elimina hojas sobrantes de un libro con "capacidad fija" de hojas (ej. hasta 8 periodos). */
function trimSheets(workbook, sheetNames, keepCount) {
  sheetNames.slice(keepCount).forEach((name) => workbook.removeWorksheet(name));
}

/** Inserta una imagen en una hoja de exceljs, anclada debajo de una celda dada (ej "B31"). */
function addImageBelowCell(workbook, sheet, imagePath, extension, anchorCellRef, widthPx, heightPx) {
  const imageId = workbook.addImage({ filename: imagePath, extension });
  const col = sheet.getColumn(anchorCellRef.col).number - 1;
  const row = anchorCellRef.row - 1;
  sheet.addImage(imageId, {
    tl: { col, row },
    ext: { width: widthPx, height: heightPx },
  });
}

module.exports = {
  fillExcelTemplate, fillExcelTemplateMultiSheet, addImageBelowCell, trimListRows, trimSheets,
};
