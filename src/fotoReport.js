const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size');
const {
  patchDocument, PatchType, Paragraph, TextRun, ImageRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} = require('docx');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'INFORME_FOTOGRAFICO.docx');

// Ancho de contenido de la pagina original (carta, margenes 1701 twips = ~1.18in por lado): ~6.14in a 96dpi.
// Se reparte en 2 columnas (4 fotos por pagina, cuadricula 2x2), con un pequeno margen entre columnas.
const PHOTO_WIDTH_PX = 280;
// Alto reservado para un espacio "en blanco" cuando no hay foto para ese puesto (por fila de la
// cuadricula), para que el documento se vea igual de ocupado que el ejemplo aunque falte una imagen.
const BLANK_SLOT_HEIGHT_TWIPS = 4600;
const PHOTOS_PER_PAGE = 4;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = {
  top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
};

function scaledSize(filePath) {
  try {
    const dims = sizeOf(fs.readFileSync(filePath));
    const ratio = dims.height / dims.width;
    return { width: PHOTO_WIDTH_PX, height: Math.round(PHOTO_WIDTH_PX * ratio) };
  } catch (e) {
    return { width: PHOTO_WIDTH_PX, height: Math.round(PHOTO_WIDTH_PX * 0.75) };
  }
}

const VALID_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'];

function imageParagraph(fotoPath) {
  const { width, height } = scaledSize(fotoPath);
  const ext = path.extname(fotoPath).replace('.', '').toLowerCase();
  const type = VALID_TYPES.includes(ext) ? ext : 'png';
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        data: fs.readFileSync(fotoPath),
        transformation: { width, height },
        type,
      }),
    ],
  });
}

function blankSlotParagraph() {
  // Parrafo vacio con espacio reservado, para mantener la misma diagramacion
  // del ejemplo (4 fotos por pagina) incluso cuando falta una fotografia.
  return new Paragraph({ spacing: { after: BLANK_SLOT_HEIGHT_TWIPS } });
}

function photoCell(foto) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    children: [foto ? imageParagraph(foto.path) : blankSlotParagraph()],
  });
}

// Arma una cuadricula 2x2 (4 fotos por pagina) a partir de hasta 4 fotos; los espacios
// sin foto quedan en blanco para no romper la diagramacion de la pagina.
function photoGridTable(fotosChunk) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({ children: [photoCell(fotosChunk[0]), photoCell(fotosChunk[1])] }),
      new TableRow({ children: [photoCell(fotosChunk[2]), photoCell(fotosChunk[3])] }),
    ],
  });
}

/**
 * Genera el Informe Fotografico parcheando la plantilla original (mismo encabezado,
 * pie de firma y diseno), insertando las fotos de cada informe semanal en una
 * cuadricula de 4 fotos por pagina (2x2).
 * `informes`: [{ numero, periodo, fotos: [{ path }] }, ...]
 */
async function buildFotoReport(data, informes, outPath) {
  const fotosChildren = [];

  informes.forEach((informe, idx) => {
    const fotos = informe.fotos || [];
    const pageCount = Math.max(1, Math.ceil(fotos.length / PHOTOS_PER_PAGE));

    for (let p = 0; p < pageCount; p += 1) {
      if (p > 0) {
        fotosChildren.push(new Paragraph({ children: [], pageBreakBefore: true }));
      }
      const chunk = fotos.slice(p * PHOTOS_PER_PAGE, p * PHOTOS_PER_PAGE + PHOTOS_PER_PAGE);
      fotosChildren.push(photoGridTable(chunk));
    }

    const isLastInforme = idx === informes.length - 1;
    if (!isLastInforme) {
      fotosChildren.push(new Paragraph({ children: [], pageBreakBefore: true }));
    }
  });

  const buffer = await patchDocument({
    outputType: 'nodebuffer',
    data: fs.readFileSync(TEMPLATE_PATH),
    patches: {
      nombre_proyecto: {
        type: PatchType.PARAGRAPH,
        children: [new TextRun(data.nombre_proyecto || '')],
      },
      jefe_mantenimiento_vias: {
        type: PatchType.PARAGRAPH,
        children: [new TextRun(data.jefe_mantenimiento_vias || '')],
      },
      contratista_nombre: {
        type: PatchType.PARAGRAPH,
        children: [new TextRun(data.contratista_nombre || '')],
      },
      empresa_nombre: {
        type: PatchType.PARAGRAPH,
        children: [new TextRun(data.empresa_nombre || '')],
      },
      FOTOS: {
        type: PatchType.DOCUMENT,
        children: fotosChildren,
      },
    },
  });

  fs.writeFileSync(outPath, buffer);
  return outPath;
}

module.exports = { buildFotoReport };
