const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');

const { parseContrato } = require('./src/parseContrato');
const { parseOrdenInicio } = require('./src/parseOrdenInicio');
const { splitPeriods, parseSpanishDate, formatSpanishDate } = require('./src/dateUtils');
const { generateExpediente } = require('./src/buildAll');

const app = express();
const PORT = process.env.PORT || 4173;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const PENDIENTE = '[PENDIENTE]';

const parseUpload = multer({ storage: multer.memoryStorage() });
const generateUpload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

// -----------------------------------------------------------------
// POST /api/parse  -> sube Contrato + Orden de Inicio, devuelve datos pre-llenados
// -----------------------------------------------------------------
app.post(
  '/api/parse',
  parseUpload.fields([{ name: 'contrato', maxCount: 1 }, { name: 'ordenInicio', maxCount: 1 }]),
  async (req, res) => {
    try {
      const contratoFile = req.files?.contrato?.[0];
      const ordenFile = req.files?.ordenInicio?.[0];
      if (!contratoFile || !ordenFile) {
        return res.status(400).json({ error: 'Debes subir ambos PDF: Contrato y Orden de Inicio.' });
      }

      const contratoText = (await pdf(contratoFile.buffer)).text;
      const ordenText = (await pdf(ordenFile.buffer)).text;

      const contratoRes = parseContrato(contratoText);
      const ordenRes = parseOrdenInicio(ordenText);

      const errors = [...contratoRes.errors, ...ordenRes.errors];

      const fields = {
        ...contratoRes.data,
        ...ordenRes.data, // la Orden de Inicio manda si hay choque (fechas, numero de contrato)
      };

      const start = parseSpanishDate(fields.fecha_orden_inicio);
      const end = parseSpanishDate(fields.fecha_finalizacion);
      const periods = start && end ? splitPeriods(start, end, 3) : [];

      const informes = [1, 2, 3].map((n) => ({
        numero: n,
        periodo: periods[n - 1] ? periods[n - 1].label : PENDIENTE,
        dias_transcurridos: periods[n - 1] ? periods[n - 1].diasTranscurridos : '',
        avance_fisico_pct: '',
        metros_ejecutados: '',
      }));

      const prefill = {
        ...fields,
        jefe_mantenimiento_vias: fields.jefe_mantenimiento_vias || 'DENIS SANTIAGO GOMEZ RIVERA',
        director_infraestructura: fields.director_infraestructura || 'FREDY ORLANDO TABORA GONZALES',
        supervisor_nombre: fields.supervisor_nombre || '',
        centro_costo: PENDIENTE,
        numero_reserva: PENDIENTE,
        codigo_reserva: PENDIENTE,
        numero_memorando: PENDIENTE,
        fecha_memorando_tesoreria: PENDIENTE,
        fecha_memo_avance: PENDIENTE,
        fecha_acuerdo_pago: PENDIENTE,
        avance_fisico_pct: 100,
        descripcion_actividades: `Mantenimiento por seguimiento de temporada de la red vial no pavimentada, procediendo a realizar los trabajos de conformación de rasante, perfilado de cunetas, afinamiento y compactación de calles, suministro, acarreo y colocación de material selecto, seguridad y señalización del proyecto y limpieza de desalojo de desperdicios, en ${fields.ubicacion || PENDIENTE}.`,
        actividad_1: 'Conformación de rasante, perfilado de cunetas, afinamiento y compactación de calles',
        actividad_2: 'Suministro, acarreo y colocación de material selecto',
        actividad_3: 'Señalización y seguridad vial',
        actividad_4: 'Acarreo de material de desperdicio',
      };

      res.json({ fields: prefill, informes, errors });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'No se pudo procesar los PDF: ' + e.message });
    }
  },
);

// -----------------------------------------------------------------
// POST /api/generate -> genera y descarga el expediente completo (.zip)
// -----------------------------------------------------------------
app.post(
  '/api/generate',
  generateUpload.any(),
  async (req, res) => {
    const sessionId = crypto.randomUUID();
    const outDir = path.join(OUTPUT_DIR, sessionId);
    try {
      const payload = JSON.parse(req.body.payload);
      const { fields, informes } = payload;

      const filesByField = {};
      (req.files || []).forEach((f) => {
        filesByField[f.fieldname] = filesByField[f.fieldname] || [];
        filesByField[f.fieldname].push(f);
      });

      const informesConFotos = informes.map((inf) => ({
        ...inf,
        fotos: (filesByField[`fotos_${inf.numero}`] || []).map((f) => ({ path: f.path })),
      }));

      const { zipPath } = await generateExpediente(fields, informesConFotos, outDir);

      res.download(zipPath, path.basename(zipPath), (err) => {
        // limpieza best-effort despues de enviar la descarga
        setTimeout(() => fs.rm(outDir, { recursive: true, force: true }, () => {}), 5000);
        (req.files || []).forEach((f) => fs.rm(f.path, { force: true }, () => {}));
        if (err) console.error('Error enviando el zip:', err);
      });
    } catch (e) {
      console.error(e);
      fs.rm(outDir, { recursive: true, force: true }, () => {});
      res.status(500).json({ error: 'No se pudo generar el expediente: ' + e.message });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Generador de expedientes escuchando en http://localhost:${PORT}`);
});
