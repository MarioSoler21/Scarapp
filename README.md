# Generador de Expedientes — Gerencia de Infraestructura

Herramienta interna para armar automáticamente el expediente administrativo de un proyecto vial (7 documentos) a partir de dos PDF: el **Contrato de Obra Pública** y la **Orden de Inicio**.

## En qué consiste (resumen para presentación)

```mermaid
flowchart LR
    A([Se suben los<br/>2 documentos del proyecto]) --> B([El sistema completa<br/>los datos automáticamente])
    B --> C([Se revisan y<br/>completan los datos])
    C --> D([El sistema genera<br/>el expediente completo])
    D --> E([Se descarga listo<br/>para entregar])
```

Antes esto se hacía llenando 7 documentos uno por uno a mano. Ahora, con solo dos PDF, la herramienta arma todo el expediente en minutos.

## Cómo funciona (detalle técnico)

```mermaid
flowchart TD
    A[Usuario sube<br/>Contrato + Orden de Inicio en PDF] --> B["POST /api/parse"]
    B --> C[pdf-parse extrae el texto]
    C --> D["parseContrato.js /<br/>parseOrdenInicio.js<br/>(extraen datos con regex)"]
    D --> E[Calcula 3 periodos de<br/>informes semanales]
    E --> F[Formulario pre-llenado<br/>en el navegador]

    F --> G[Usuario revisa, completa<br/>datos faltantes y sube fotos]
    G --> H["POST /api/generate"]
    H --> I[buildAll.js arma<br/>los datos comunes]

    I --> J1[excelFill.js<br/>rellena plantillas .xlsx]
    I --> J2[wordFill.js<br/>rellena plantillas .docx]
    I --> J3[fotoReport.js<br/>arma informe fotografico]

    J1 --> K[archiver comprime<br/>todo en un .zip]
    J2 --> K
    J3 --> K
    K --> L[Descarga automatica<br/>del expediente completo]
```

## Documentos generados

1. Acuerdo de Pago (Excel)
2. Ficha Técnica (Excel)
3. Solicitud de Formalización (Excel)
4. Informes Semanales — 3 periodos, una hoja cada uno (Excel)
5. Memo de Avance Físico (Word)
6. Memorando a Tesorería (Word)
7. Informe Fotográfico con las fotos de avance (Word)

Todos se entregan comprimidos en un único `.zip`.

## Stack técnico

- **Backend:** Node.js + Express (`server.js`)
- **Lectura de PDF:** `pdf-parse`
- **Plantillas Excel:** `exceljs`
- **Plantillas Word:** `docxtemplater` + `docx`
- **Compresión:** `archiver`
- **Frontend:** HTML/CSS/JS plano, sin framework (`public/`)

## Correr en local

```bash
npm install
npm start
```

Sirve en `http://localhost:4173`.
