const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size');
const {
  patchDocument, PatchType, Paragraph, TextRun, ImageRun, AlignmentType,
} = require('docx');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'INFORME_FOTOGRAFICO.docx');

// Ancho de contenido de la pagina original (carta, margenes 1701 twips = ~1.18in por lado): ~6.14in a 96dpi.
const PHOTO_WIDTH_PX = 590;
// Alto reservado para un espacio "en blanco" cuando no hay foto para ese puesto,
// para que el documento se vea igual de ocupado que el ejemplo aunque falte una imagen.
const BLANK_SLOT_HEIGHT_TWIPS = 4600;

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
  // del ejemplo (2 fotos por pagina) incluso cuando falta una fotografia.
  return new Paragraph({ spacing: { after: BLANK_SLOT_HEIGHT_TWIPS } });
}

/**
 * Genera el Informe Fotografico parcheando la plantilla original (mismo encabezado,
 * pie de firma y diseno), insertando las fotos de cada informe semanal, 2 por pagina.
 * `informes`: [{ numero, periodo, fotos: [{ path }] }, ...]
 */
async function buildFotoReport(data, informes, outPath) {
  const fotosChildren = [];

  informes.forEach((informe, idx) => {
    const fotos = informe.fotos || [];
    const slotCount = Math.max(2, Math.ceil(fotos.length / 2) * 2);

    for (let i = 0; i < slotCount; i += 1) {
      fotosChildren.push(fotos[i] ? imageParagraph(fotos[i].path) : blankSlotParagraph());
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
