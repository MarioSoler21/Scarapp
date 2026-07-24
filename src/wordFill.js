const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

/**
 * Carga una plantilla .docx con tokens {{clave}}, los reemplaza usando `data`
 * y guarda el resultado en `outPath`. El formato original (fuentes, tamanos,
 * negritas, logos) se preserva porque docxtemplater solo sustituye el texto
 * dentro de cada "run" existente.
 */
function fillWordTemplate(templatePath, data, outPath) {
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: (part) => `[${part.value}?]`,
  });

  doc.render(data);

  const buf = doc.getZip().generate({ type: 'nodebuffer' });
  fs.writeFileSync(outPath, buf);
  return outPath;
}

module.exports = { fillWordTemplate };
