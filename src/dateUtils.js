const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Convierte "LUNES 11 DE MAYO DE 2026" o "11 de mayo de 2026" a un Date (UTC, sin horas). */
function parseSpanishDate(str) {
  if (!str) return null;
  const m = str
    .toLowerCase()
    .match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  if (!m) return null;
  const day = Number(m[1]);
  const monthName = m[2].normalize('NFD').replace(/[̀-ͯ]/g, '');
  const monthIdx = MESES.findIndex((mes) => mes === monthName);
  if (monthIdx === -1) return null;
  return new Date(Date.UTC(Number(m[3]), monthIdx, day));
}

function formatSpanishDate(date) {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mes = MESES[date.getUTCMonth()];
  return `${dd} de ${capitalize(mes)} de ${date.getUTCFullYear()}`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function diffDays(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Divide el rango [start, end] en `n` periodos consecutivos de tamano similar.
 * Devuelve [{ from, to, label, diasTranscurridos }].
 */
function splitPeriods(start, end, n) {
  if (!start || !end) return [];
  const totalDays = diffDays(start, end);
  const out = [];
  let cursor = start;
  for (let i = 0; i < n; i += 1) {
    const isLast = i === n - 1;
    const chunk = Math.round(totalDays / n);
    const to = isLast ? end : addDays(cursor, chunk);
    out.push({
      from: cursor,
      to,
      label: `Del ${formatSpanishDate(cursor)} al ${formatSpanishDate(to)}`,
      // +1 porque el dia de inicio cuenta como dia 1 (asi lo maneja la plantilla original)
      diasTranscurridos: diffDays(start, to) + 1,
    });
    cursor = to;
  }
  return out;
}

module.exports = {
  parseSpanishDate, formatSpanishDate, splitPeriods, diffDays, addDays,
};
