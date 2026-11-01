// Genera el Excel de una actividad con logos y firmas (usa ExcelJS)
window.ExcelAsistencia = (function () {
  function cargarExcelJS() {
    if (window.ExcelJS) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
      s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar ExcelJS"));
      document.head.append(s);
    });
  }
  async function imagen(ruta) {
    const r = await fetch(ruta); const b = await r.blob();
    const base64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(",")[1]); fr.readAsDataURL(b); });
    const dim = await new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.width, h: i.height }); i.src = URL.createObjectURL(b); });
    return { base64, ...dim };
  }

  async function generar(actividad, registros, aviso) {
    await cargarExcelJS();
    const [gob, inj] = await Promise.all([imagen("img/gobierno.png"), imagen("img/injuve-completo.png")]);
    const F = { name: "Arial" };
    const borde = { top: { style: "thin", color: { argb: "FFBFB4A0" } }, bottom: { style: "thin", color: { argb: "FFBFB4A0" } }, left: { style: "thin", color: { argb: "FFBFB4A0" } }, right: { style: "thin", color: { argb: "FFBFB4A0" } } };

    const wb = new ExcelJS.Workbook();
    wb.creator = "INJUVE Playa del Carmen";
    const ws = wb.addWorksheet("Asistencia", {
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .5, bottom: .5, header: .2, footer: .2 } },
      views: [{ state: "frozen", ySplit: 6, showGridLines: false }]
    });
    ws.columns = [{ width: 6 }, { width: 34 }, { width: 12 }, { width: 9 }, { width: 14 }, { width: 28 }, { width: 26 }, { width: 11 }, { width: 30 }];
    const anchoTotalPx = ws.columns.reduce((s, c) => s + c.width * 7.5, 0);

    // fila 1: logos
    ws.getRow(1).height = 62;
    const gH = 52, gW = gob.w * gH / gob.h;
    ws.addImage(wb.addImage({ base64: gob.base64, extension: "png" }), { tl: { col: 0.1, row: 0.15 }, ext: { width: gW, height: gH } });
    const iH = 62, iW = inj.w * iH / inj.h;
    // colócalo pegado al borde derecho
    let px = anchoTotalPx - iW - 8, col = 0, acum = 0;
    for (; col < ws.columns.length; col++) { const w = ws.columns[col].width * 7.5; if (acum + w > px) break; acum += w; }
    ws.addImage(wb.addImage({ base64: inj.base64, extension: "png" }), { tl: { col: col + (px - acum) / (ws.columns[col].width * 7.5), row: 0.08 }, ext: { width: iW, height: iH } });

    const titulo = (fila, texto, fuente) => {
      ws.mergeCells(fila, 1, fila, 9);
      const c = ws.getCell(fila, 1); c.value = texto; c.font = { ...F, ...fuente }; c.alignment = { horizontal: "center", vertical: "middle" };
    };
    titulo(2, "LISTA DE ASISTENCIA", { bold: true, size: 15 });
    titulo(3, actividad.nombre, { bold: true, size: 12 });
    titulo(4, "Fecha: " + App.fecha(actividad.fecha, true) + "   ·   Total de asistentes: " + registros.length, { size: 11, color: { argb: "FF555555" } });
    ws.getRow(2).height = 22;

    const enc = ws.getRow(6);
    ["Núm.", "Nombre completo", "Rango de edad", "Género", "Teléfono", "Correo electrónico", "Padre/madre o tutor", "Hora", "Firma"].forEach((h, i) => {
      const c = enc.getCell(i + 1); c.value = h;
      c.font = { ...F, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF397D44" } };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = borde;
    });
    enc.height = 28;
    ws.pageSetup.printTitlesRow = "6:6";

    registros.forEach((r, i) => {
      const fila = 7 + i, row = ws.getRow(fila);
      [i + 1, r.nombre, r.edad, r.genero, r.telefono || "", r.correo || "", r.tutor || "", App.hora(r.registrado), ""].forEach((v, j) => {
        const c = row.getCell(j + 1); c.value = v; c.font = { ...F, size: 11 }; c.border = borde;
        c.alignment = { vertical: "middle", horizontal: [0, 2, 3, 4, 7].includes(j) ? "center" : "left", wrapText: j === 6 || j === 1 };
        if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBF8F1" } };
      });
      row.getCell(5).numFmt = "@";
      row.height = 45;
      if (r.firma && r.firma.startsWith("data:image/png;base64,")) {
        const id = wb.addImage({ base64: r.firma.split(",")[1], extension: "png" });
        const ratio = (r.firma_w && r.firma_h) ? r.firma_w / r.firma_h : 3;
        let w = 200, h = w / ratio; if (h > 52) { h = 52; w = h * ratio; }
        ws.addImage(id, { tl: { col: 8.04, row: fila - 1 + 0.07 }, ext: { width: w, height: h }, editAs: "oneCell" });
      }
    });

    const fa = 7 + registros.length + 1;
    ws.mergeCells(fa, 1, fa, 9);
    const av = ws.getCell(fa, 1);
    av.value = "Aviso de privacidad: " + (aviso || "");
    av.font = { ...F, size: 8, italic: true, color: { argb: "FF666666" } }; av.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(fa).height = 42;

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const nombre = ("Asistencia " + actividad.nombre + " " + actividad.fecha).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_") + ".xlsx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = nombre;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return { generar };
})();
