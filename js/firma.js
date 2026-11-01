// Recuadro de firma con el dedo, lápiz o mouse (sin librerías)
window.crearFirma = function (canvas, placeholder) {
  const ctx = canvas.getContext("2d");
  let dibujando = false, tinta = false, ultimo = null, caja = null, dpr = 1;

  function ajustar() {
    if (tinta) return; // no borrar una firma ya hecha al girar la tableta
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#10233F"; ctx.fillStyle = "#10233F";
  }
  function punto(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function crecer(p) {
    if (!caja) caja = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    else { caja.x0 = Math.min(caja.x0, p.x); caja.y0 = Math.min(caja.y0, p.y); caja.x1 = Math.max(caja.x1, p.x); caja.y1 = Math.max(caja.y1, p.y); }
  }
  function setTinta(v) { tinta = v; if (placeholder) placeholder.hidden = v; }

  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    if (!canvas.width) ajustar();
    canvas.setPointerCapture(e.pointerId);
    dibujando = true; ultimo = punto(e); crecer(ultimo);
    ctx.beginPath(); ctx.arc(ultimo.x, ultimo.y, 1.2, 0, Math.PI * 2); ctx.fill();
    setTinta(true);
  });
  canvas.addEventListener("pointermove", e => {
    if (!dibujando) return;
    e.preventDefault();
    const eventos = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of eventos) {
      const p = punto(ev);
      ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y);
      ctx.quadraticCurveTo(ultimo.x, ultimo.y, (ultimo.x + p.x) / 2, (ultimo.y + p.y) / 2);
      ctx.lineTo(p.x, p.y); ctx.stroke();
      ultimo = p; crecer(p);
    }
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => canvas.addEventListener(t, () => { dibujando = false; }));
  window.addEventListener("resize", ajustar);

  return {
    ajustar,
    tieneFirma: () => tinta && !!caja,
    borrar() {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
      caja = null; setTinta(false); ajustar();
    },
    // Recorta la firma, la reduce y la devuelve como PNG en base64
    exportar() {
      const pad = 8;
      const x0 = Math.max(0, caja.x0 - pad), y0 = Math.max(0, caja.y0 - pad);
      const x1 = Math.min(canvas.width / dpr, caja.x1 + pad), y1 = Math.min(canvas.height / dpr, caja.y1 + pad);
      const w = x1 - x0, h = y1 - y0, s = Math.min(1, 480 / w, 170 / h) * 1.5;
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(w * s)); out.height = Math.max(1, Math.round(h * s));
      const o = out.getContext("2d");
      o.fillStyle = "#FFFFFF"; o.fillRect(0, 0, out.width, out.height);
      o.drawImage(canvas, x0 * dpr, y0 * dpr, w * dpr, h * dpr, 0, 0, out.width, out.height);
      return { data: out.toDataURL("image/png"), w: out.width, h: out.height };
    }
  };
};
