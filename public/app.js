const stepUpload = document.getElementById('step-upload');
const stepReview = document.getElementById('step-review');
const uploadStatus = document.getElementById('upload-status');
const generateStatus = document.getElementById('generate-status');
const errorsBox = document.getElementById('errors-box');
const informesContainer = document.getElementById('informes-container');

let currentInformes = [];

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

function renderInformes(informes) {
  currentInformes = informes;
  informesContainer.innerHTML = '';
  informes.forEach((inf) => {
    const block = document.createElement('div');
    block.className = 'informe-block';
    block.dataset.numero = inf.numero;
    block.innerHTML = `
      <h3>Informe de actividades No. ${inf.numero}</h3>
      <div class="grid-2">
        <div class="field full">
          <label>Periodo</label>
          <input data-inf="periodo" value="${inf.periodo || ''}" />
        </div>
        <div class="field">
          <label>Avance físico (%)</label>
          <input data-inf="avance_fisico_pct" type="number" placeholder="[PENDIENTE]" />
        </div>
        <div class="field">
          <label>Metros ejecutados (m)</label>
          <input data-inf="metros_ejecutados" type="number" placeholder="[PENDIENTE]" />
        </div>
        <div class="field full">
          <label>Fotografías del periodo</label>
          <input data-inf="fotos" type="file" accept="image/*" multiple />
        </div>
      </div>
    `;
    informesContainer.appendChild(block);
  });
}

document.getElementById('form-upload').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData();
  form.append('contrato', document.getElementById('contrato').files[0]);
  form.append('ordenInicio', document.getElementById('ordenInicio').files[0]);

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
    renderInformes(data.informes);

    stepUpload.hidden = true;
    stepReview.hidden = false;
    uploadStatus.hidden = true;
  } catch (err) {
    showStatus(uploadStatus, err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById('btn-back').addEventListener('click', () => {
  stepReview.hidden = true;
  stepUpload.hidden = false;
});

document.getElementById('form-review').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fields = collectReviewFields();

  const informes = currentInformes.map((inf) => {
    const block = informesContainer.querySelector(`.informe-block[data-numero="${inf.numero}"]`);
    return {
      numero: inf.numero,
      periodo: block.querySelector('[data-inf="periodo"]').value,
      avance_fisico_pct: block.querySelector('[data-inf="avance_fisico_pct"]').value || '[PENDIENTE]',
      metros_ejecutados: block.querySelector('[data-inf="metros_ejecutados"]').value || '[PENDIENTE]',
      dias_transcurridos: inf.dias_transcurridos,
    };
  });

  const form = new FormData();
  form.append('payload', JSON.stringify({ fields, informes }));
  currentInformes.forEach((inf) => {
    const block = informesContainer.querySelector(`.informe-block[data-numero="${inf.numero}"]`);
    const fileInput = block.querySelector('[data-inf="fotos"]');
    Array.from(fileInput.files).forEach((file) => {
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
