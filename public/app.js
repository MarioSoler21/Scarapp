const stepTipo = document.getElementById('step-tipo');
const stepUpload = document.getElementById('step-upload');
const stepReview = document.getElementById('step-review');
const uploadStatus = document.getElementById('upload-status');
const generateStatus = document.getElementById('generate-status');
const errorsBox = document.getElementById('errors-box');
const informesContainer = document.getElementById('informes-container');
const stepIndicator1 = document.getElementById('step-indicator-1');
const stepIndicator2 = document.getElementById('step-indicator-2');
const stepIndicator3 = document.getElementById('step-indicator-3');
const ordenesCambioFieldset = document.getElementById('ordenes-cambio-fieldset');
const ordenesCambioContainer = document.getElementById('ordenes-cambio-container');

const COMPLEX_TYPES = ['bacheo_asfaltico', 'bacheo_hidraulico', 'sello_de_juntas', 'pavimentacion_menores'];
const ORDENES_CAMBIO_TYPES = ['pavimentacion_menores', 'sistemas'];

let currentInformes = [];
let currentTipo = null;
// numero de informe -> File[] seleccionados hasta ahora (se acumulan entre selecciones,
// no se reemplazan, porque un <input type="file"> nativo pierde la seleccion anterior
// cada vez que se abre el picker de nuevo).
let fotosByInforme = new Map();

function fotoKey(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function renderFotosList(block, numero) {
  const list = block.querySelector('[data-fotos-list]');
  const fotos = fotosByInforme.get(numero) || [];
  list.innerHTML = '';
  fotos.forEach((file, idx) => {
    const row = document.createElement('div');
    row.className = 'dyn-row foto-row';
    row.innerHTML = `
      <span class="foto-name">${file.name}</span>
      <button type="button" class="btn-remove-item" aria-label="Quitar foto">&times;</button>
    `;
    row.querySelector('.btn-remove-item').addEventListener('click', () => {
      fotos.splice(idx, 1);
      renderFotosList(block, numero);
    });
    list.appendChild(row);
  });
  const countEl = block.querySelector('[data-fotos-count]');
  if (countEl) countEl.textContent = fotos.length ? `${fotos.length} foto(s) seleccionada(s)` : '';
}

function setActiveStep(step) {
  stepIndicator1.classList.toggle('active', step === 1);
  stepIndicator2.classList.toggle('active', step === 2);
  stepIndicator3.classList.toggle('active', step === 3);
}

document.querySelectorAll('.tipo-card:not(.is-disabled)').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.tipo-card').forEach((c) => c.classList.remove('is-selected'));
    card.classList.add('is-selected');
    currentTipo = card.dataset.tipo;

    stepTipo.hidden = true;
    stepUpload.hidden = false;
    setActiveStep(2);
  });
});

document.getElementById('btn-change-tipo').addEventListener('click', () => {
  stepUpload.hidden = true;
  stepTipo.hidden = false;
  setActiveStep(1);
});

function showStatus(el, message, isError) {
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('error', !!isError);
}

function fillReviewForm(fields) {
  document.querySelectorAll('#form-review [data-k]').forEach((input) => {
    const key = input.dataset.k;
    if (fields[key] !== undefined && fields[key] !== null) {
      input.value = fields[key];
    }
  });
}

function collectReviewFields() {
  const fields = {};
  document.querySelectorAll('#form-review [data-k]').forEach((input) => {
    fields[input.dataset.k] = input.value;
  });
  return fields;
}

// --- Listas dinamicas (actividades / plan siguiente periodo / ordenes de cambio) ---

function addDynRow(container, value) {
  const row = document.createElement('div');
  row.className = 'dyn-row';
  row.innerHTML = `
    <input type="text" value="${value ? String(value).replace(/"/g, '&quot;') : ''}" />
    <button type="button" class="btn-remove-item" aria-label="Quitar">&times;</button>
  `;
  row.querySelector('.btn-remove-item').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function readDynRows(container) {
  return Array.from(container.querySelectorAll('input[type="text"]'))
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function addOcRow(label, monto) {
  const row = document.createElement('div');
  row.className = 'dyn-row';
  row.innerHTML = `
    <input type="text" data-oc="label" placeholder="Ej. Orden de cambio positiva #1" value="${label ? String(label).replace(/"/g, '&quot;') : ''}" />
    <input type="number" step="0.01" class="oc-monto" data-oc="monto" placeholder="Monto (Lps.)" value="${monto !== undefined ? monto : ''}" />
    <button type="button" class="btn-remove-item" aria-label="Quitar">&times;</button>
  `;
  row.querySelector('.btn-remove-item').addEventListener('click', () => row.remove());
  ordenesCambioContainer.appendChild(row);
}

document.getElementById('btn-add-oc').addEventListener('click', () => addOcRow());

function readOrdenesCambio() {
  return Array.from(ordenesCambioContainer.querySelectorAll('.dyn-row')).map((row) => ({
    label: row.querySelector('[data-oc="label"]').value.trim(),
    monto: Number(row.querySelector('[data-oc="monto"]').value) || 0,
  })).filter((oc) => oc.label || oc.monto);
}

function updateOrdenesCambioVisibility() {
  ordenesCambioFieldset.hidden = !ORDENES_CAMBIO_TYPES.includes(currentTipo);
}

function updateMemoTesoreriaVisibility() {
  const hide = currentTipo === 'terraceria';
  document.querySelectorAll('.field-memo-tesoreria').forEach((el) => {
    el.hidden = hide;
  });
}

// --- Informes semanales (varian segun el tipo de estimacion) ---

function renderInformes(informes, plazoDias) {
  currentInformes = informes;
  informesContainer.innerHTML = '';
  fotosByInforme = new Map(informes.map((inf) => [inf.numero, []]));
  const isComplex = COMPLEX_TYPES.includes(currentTipo);
  const isSistemas = currentTipo === 'sistemas';
  const showAvanceFisico = !isComplex; // terraceria y sistemas capturan avance fisico directo
  const showMetros = isComplex; // el grupo complejo calcula el avance a partir de metros/area ejecutada
  const showListas = isComplex || isSistemas;

  informes.forEach((inf) => {
    const block = document.createElement('div');
    block.className = 'informe-block';
    block.dataset.numero = inf.numero;

    let fieldsHtml = `
        <div class="field full">
          <label>Periodo</label>
          <input data-inf="periodo" value="${inf.periodo || ''}" />
        </div>`;
    if (showAvanceFisico) {
      fieldsHtml += `
        <div class="field">
          <label>Avance físico (%)</label>
          <input data-inf="avance_fisico_pct" type="number" placeholder="[PENDIENTE]" />
        </div>`;
    }
    if (showMetros) {
      fieldsHtml += `
        <div class="field">
          <label>${isComplex ? 'Área / metros ejecutados' : 'Metros ejecutados (m)'}</label>
          <input data-inf="metros_ejecutados" type="number" placeholder="[PENDIENTE]" />
        </div>`;
    }
    fieldsHtml += `
        <div class="field full">
          <label>Fotografías del periodo</label>
          <input data-inf="fotos" type="file" accept="image/*" multiple />
          <div class="dyn-list foto-list" data-fotos-list></div>
          <span class="hint-inline" data-fotos-count></span>
        </div>`;

    const plazoBadge = inf.dias_transcurridos && plazoDias
      ? ` <span class="plazo-badge">(${inf.dias_transcurridos}/${plazoDias} días)</span>`
      : '';
    block.innerHTML = `
      <h3>Informe de actividades No. ${inf.numero}${plazoBadge}</h3>
      <div class="grid-2">${fieldsHtml}</div>
    `;

    const fotosInput = block.querySelector('[data-inf="fotos"]');
    fotosInput.addEventListener('change', () => {
      const existing = fotosByInforme.get(inf.numero) || [];
      const seen = new Set(existing.map(fotoKey));
      Array.from(fotosInput.files).forEach((file) => {
        const key = fotoKey(file);
        if (!seen.has(key)) {
          existing.push(file);
          seen.add(key);
        }
      });
      fotosByInforme.set(inf.numero, existing);
      renderFotosList(block, inf.numero);
      fotosInput.value = ''; // permite re-seleccionar la misma carpeta sin perder lo ya agregado
    });

    if (showListas) {
      const actWrap = document.createElement('div');
      actWrap.className = 'field full';
      actWrap.innerHTML = `
        <label>Actividades realizadas en este periodo</label>
        <div class="dyn-list" data-list="actividades"></div>
        <button type="button" class="btn-secondary btn-add-item" data-add="actividades">+ Agregar actividad</button>
      `;
      block.appendChild(actWrap);

      const planWrap = document.createElement('div');
      planWrap.className = 'field full';
      planWrap.innerHTML = `
        <label>Programa de actividades — próximo periodo</label>
        <div class="dyn-list" data-list="plan"></div>
        <button type="button" class="btn-secondary btn-add-item" data-add="plan">+ Agregar actividad planificada</button>
      `;
      block.appendChild(planWrap);

      addDynRow(actWrap.querySelector('[data-list="actividades"]'));
      addDynRow(planWrap.querySelector('[data-list="plan"]'));

      block.querySelectorAll('[data-add]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const list = block.querySelector(`[data-list="${btn.dataset.add}"]`);
          addDynRow(list);
        });
      });
    }

    informesContainer.appendChild(block);
  });
}

document.getElementById('form-upload').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData();
  form.append('contrato', document.getElementById('contrato').files[0]);
  form.append('ordenInicio', document.getElementById('ordenInicio').files[0]);
  form.append('tipoEstimacion', currentTipo || 'terraceria');

  showStatus(uploadStatus, 'Procesando PDF…', false);
  const submitBtn = e.target.querySelector('button');
  submitBtn.disabled = true;

  try {
    const resp = await fetch('/api/parse', { method: 'POST', body: form });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error desconocido');

    if (data.errors && data.errors.length) {
      errorsBox.hidden = false;
      errorsBox.innerHTML = '<strong>No se pudieron extraer estos datos automáticamente (complétalos manualmente):</strong><ul>'
        + data.errors.map((er) => `<li>${er}</li>`).join('') + '</ul>';
    } else {
      errorsBox.hidden = true;
    }

    fillReviewForm(data.fields);
    renderInformes(data.informes, data.fields.plazo_dias);
    updateOrdenesCambioVisibility();
    updateMemoTesoreriaVisibility();
    ordenesCambioContainer.innerHTML = '';

    stepUpload.hidden = true;
    stepReview.hidden = false;
    uploadStatus.hidden = true;
    setActiveStep(3);
  } catch (err) {
    showStatus(uploadStatus, err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById('btn-back').addEventListener('click', () => {
  stepReview.hidden = true;
  stepUpload.hidden = false;
  setActiveStep(2);
});

document.getElementById('form-review').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fields = collectReviewFields();
  fields.tipo_estimacion = currentTipo;
  fields.ordenes_cambio = readOrdenesCambio();

  const isComplex = COMPLEX_TYPES.includes(currentTipo);
  const isSistemas = currentTipo === 'sistemas';
  const showListas = isComplex || isSistemas;

  const informes = currentInformes.map((inf) => {
    const block = informesContainer.querySelector(`.informe-block[data-numero="${inf.numero}"]`);
    const avanceInput = block.querySelector('[data-inf="avance_fisico_pct"]');
    const metrosInput = block.querySelector('[data-inf="metros_ejecutados"]');
    const entry = {
      numero: inf.numero,
      periodo: block.querySelector('[data-inf="periodo"]').value,
      periodo_corto: inf.periodo_corto,
      avance_fisico_pct: avanceInput ? (avanceInput.value || '[PENDIENTE]') : '',
      metros_ejecutados: metrosInput ? (metrosInput.value || '[PENDIENTE]') : '',
      dias_transcurridos: inf.dias_transcurridos,
    };
    if (showListas) {
      entry.actividades = readDynRows(block.querySelector('[data-list="actividades"]'));
      entry.plan = readDynRows(block.querySelector('[data-list="plan"]'));
    }
    return entry;
  });

  const form = new FormData();
  form.append('payload', JSON.stringify({ fields, informes }));
  currentInformes.forEach((inf) => {
    (fotosByInforme.get(inf.numero) || []).forEach((file) => {
      form.append(`fotos_${inf.numero}`, file);
    });
  });

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  showStatus(generateStatus, 'Generando expediente…', false);

  try {
    const resp = await fetch('/api/generate', { method: 'POST', body: form });
    if (!resp.ok) {
      const data = await resp.json();
      throw new Error(data.error || 'Error desconocido');
    }
    const blob = await resp.blob();
    const disposition = resp.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : 'expediente.zip';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showStatus(generateStatus, 'Expediente generado y descargado correctamente.', false);
  } catch (err) {
    showStatus(generateStatus, err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
});
