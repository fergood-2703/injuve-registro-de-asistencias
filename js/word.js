// Llena el formato oficial "Lista de asistencia" (plantillas/lista-asistencia.docx)
// con los registros de una actividad: 25 personas por hoja, firma como imagen y totales por hoja.
// Usa JSZip. Trabaja directo sobre el XML de Word para no alterar el diseño del formato.
(function (global) {
  const POR_HOJA = 25;
  const EDADES = ["12 a 14", "15 a 17", "18 a 24", "25 a 29", "30+"];
  const GENEROS = ["M", "H", "O"]; // "O" (otro / prefiero no decir) va en la columna NB

  // Filas del formato: 0 título, 1 fecha/actividad, 2-3 encabezados, 4-28 renglones, 29 total, 30 aviso
  const F_DATOS = 1, F_PRIMERA = 4, F_TOTAL = 29;

  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Parte un bloque XML en sus hijos <etiqueta>…</etiqueta> (sin anidación del mismo tipo)
  function partes(xml, tag) {
    const re = new RegExp("<" + tag + "[ >][\\s\\S]*?</" + tag + ">", "g");
    return xml.match(re) || [];
  }

  // Escribe contenido dentro de una celda vacía, con el mismo estilo de letra que trae la celda
  function llenar(tc, contenido) {
    const rpr = (tc.match(/<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)[\s\S]*?<\/w:pPr>/) || [])[1] || "";
    const i = tc.lastIndexOf("</w:p>");
    return tc.slice(0, i) + "<w:r>" + rpr + contenido + "</w:r>" + tc.slice(i);
  }
  const texto = (tc, t) => (t === "" || t == null) ? tc : llenar(tc, '<w:t xml:space="preserve">' + esc(t) + "</w:t>");

  // Texto un poco más chico y sin cortes de línea (para que el teléfono quepa en un renglón)
  const chico = (tc, t) => !t ? tc : llenar(tc.replace(/<w:sz w:val="15"\/><w:szCs w:val="15"\/>/g, '<w:sz w:val="14"/><w:szCs w:val="14"/>'),
    '<w:t xml:space="preserve">' + esc(t).replace(/ /g, "\u00A0") + "</w:t>");

  // Una fila del formato trae el nombre alineado a la izquierda; se centra como las demás
  const centrar = tc => /<w:jc /.test(tc) ? tc : tc.replace("<w:pPr>", '<w:pPr><w:jc w:val="center"/>');

  function fila(tr, celdas) {
    const tcs = partes(tr, "w:tc");
    let out = tr.slice(0, tr.indexOf(tcs[0]));
    tcs.forEach((tc, i) => { out += celdas[i] ? celdas[i](tc) : tc; });
    return out + "</w:tr>";
  }

  // Imagen de la firma dentro de la celda (alto fijo para no deformar el renglón)
  function dibujo(rid, n, w, h) {
    const alto = 160000, ancho = Math.min(950000, Math.round(alto * (w && h ? w / h : 3)));
    return '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + ancho + '" cy="' + alto + '"/>' +
      '<wp:docPr id="' + (1000 + n) + '" name="Firma ' + n + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + (1000 + n) + '" name="firma' + n + '.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + ancho + '" cy="' + alto + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      "</a:graphicData></a:graphic></wp:inline></w:drawing>";
  }

  function fechaLarga(f) {
    if (!f) return "";
    const d = new Date(String(f).length <= 10 ? f + "T12:00:00" : f);
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  }

  // plantilla: ArrayBuffer/Uint8Array del .docx; actividad: {nombre, fecha}; registros: en orden de llegada
  async function construir(JSZip, plantilla, actividad, registros) {
    const zip = await JSZip.loadAsync(plantilla);
    let doc = await zip.file("word/document.xml").async("string");
    let rels = await zip.file("word/_rels/document.xml.rels").async("string");
    let tipos = await zip.file("[Content_Types].xml").async("string");

    // Los identificadores internos de párrafo no pueden repetirse al copiar la tabla
    doc = doc.replace(/ w14:(paraId|textId)="[^"]*"/g, "");

    const ini = doc.indexOf("<w:tbl>"), fin = doc.indexOf("</w:tbl>") + 8;
    const tabla = doc.slice(ini, fin);
    const filas = partes(tabla, "w:tr");
    const cabeza = tabla.slice(0, tabla.indexOf(filas[0]));
    const finalDoc = doc.slice(fin).replace(/^<w:p [^>]*\/>|^<w:p\/>/, "");

    const hojas = Math.max(1, Math.ceil(registros.length / POR_HOJA));
    let cuerpo = "", n = 0;
    for (let h = 0; h < hojas; h++) {
      const grupo = registros.slice(h * POR_HOJA, (h + 1) * POR_HOJA);
      const tot = { e: EDADES.map(() => 0), g: GENEROS.map(() => 0) };
      let t = cabeza;
      filas.forEach((tr, i) => {
        if (i === F_DATOS) {
          t += fila(tr, { 1: c => texto(c, fechaLarga(actividad.fecha)), 4: c => texto(c, actividad.nombre) });
        } else if (i >= F_PRIMERA && i < F_PRIMERA + POR_HOJA) {
          const k = i - F_PRIMERA, r = grupo[k], num = h * POR_HOJA + k + 1;
          tr = tr.replace(/<w:t>\d+<\/w:t>/, "<w:t>" + num + "</w:t>");
          if (!r) { t += tr; return; }
          const ce = EDADES.indexOf(r.edad), cg = GENEROS.indexOf(r.genero);
          if (ce >= 0) tot.e[ce]++;
          if (cg >= 0) tot.g[cg]++;
          const celdas = { 1: c => texto(centrar(c), r.nombre), 10: c => chico(c, r.telefono ? App_tel(r.telefono) : ""), 11: c => texto(c, r.correo || "") };
          if (ce >= 0) celdas[2 + ce] = c => texto(c, "X");
          if (cg >= 0) celdas[7 + cg] = c => texto(c, "X");
          if (r.firma && r.firma.startsWith("data:image/png;base64,")) {
            n++;
            const rid = "rIdFirma" + n;
            zip.file("word/media/firma" + n + ".png", r.firma.split(",")[1], { base64: true });
            rels = rels.replace("</Relationships>", '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/firma' + n + '.png"/></Relationships>');
            const d = dibujo(rid, n, r.firma_w, r.firma_h);
            celdas[12] = c => llenar(c, d);
          }
          t += fila(tr, celdas);
        } else if (i === F_TOTAL) {
          const celdas = {};
          tot.e.forEach((v, j) => { celdas[1 + j] = c => texto(c, String(v)); });
          tot.g.forEach((v, j) => { celdas[6 + j] = c => texto(c, String(v)); });
          t += fila(tr, celdas);
        } else t += tr;
      });
      t += "</w:tbl>";
      // Cada tabla flota sobre la página del párrafo que la sigue; ese párrafo abre hoja nueva
      cuerpo += t + '<w:p><w:pPr>' + (h ? "<w:pageBreakBefore/>" : "") + '<w:spacing w:before="0" w:after="0" w:line="14" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>';
    }

    doc = doc.slice(0, ini) + cuerpo + finalDoc;
    if (!/xmlns:wp=/.test(doc)) doc = doc.replace("<w:document ", '<w:document xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ');
    if (!/Extension="png"/.test(tipos)) tipos = tipos.replace("<Default ", '<Default Extension="png" ContentType="image/png"/><Default ');

    zip.file("word/document.xml", doc);
    zip.file("word/_rels/document.xml.rels", rels);
    zip.file("[Content_Types].xml", tipos);
    return zip;
  }

  function App_tel(t) {
    const d = String(t).replace(/\D/g, "");
    return d.length === 10 ? d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6, 8) + " " + d.slice(8) : t;
  }

  // En el navegador: descarga el Word de la actividad
  function cargarJSZip() {
    if (global.JSZip) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar JSZip"));
      document.head.append(s);
    });
  }

  async function generar(actividad, registros) {
    await cargarJSZip();
    const resp = await fetch("plantillas/lista-asistencia.docx");
    if (!resp.ok) throw new Error("plantilla");
    const zip = await construir(global.JSZip, await resp.arrayBuffer(), actividad, registros);
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Lista de asistencia - " + actividad.nombre.replace(/[\\/:*?"<>|]/g, "") + ".docx";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const api = { construir, generar };
  if (typeof module !== "undefined") module.exports = api; else global.WordAsistencia = api;
})(typeof window !== "undefined" ? window : globalThis);
