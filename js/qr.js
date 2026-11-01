// Dibuja una tarjeta con el QR de la actividad (para mostrar o imprimir)
window.TarjetaQR = (function () {
  let mascara = null;
  function cargarMascara() {
    if (mascara) return Promise.resolve(mascara);
    return new Promise(res => { const i = new Image(); i.onload = () => { mascara = i; res(i); }; i.onerror = () => res(null); i.src = "img/mascara.png"; });
  }
  function envolver(ctx, texto, maxAncho) {
    const palabras = texto.split(" "), lineas = []; let l = "";
    palabras.forEach(p => { const t = l ? l + " " + p : p; if (ctx.measureText(t).width > maxAncho && l) { lineas.push(l); l = p; } else l = t; });
    if (l) lineas.push(l);
    return lineas.slice(0, 2);
  }

  async function dibujar(canvas, url, actividad, fechaTxt) {
    const ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
    try { await document.fonts.ready; } catch (e) {}
    ctx.fillStyle = "#F7F1E5"; ctx.fillRect(0, 0, W, H);
    // franja naranja superior
    ctx.fillStyle = "#F4A121"; ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = "#397D44"; ctx.fillRect(0, H - 34, W, 34);

    const m = await cargarMascara();
    if (m) { const h = 150, w = m.width * h / m.height; ctx.drawImage(m, (W - w) / 2, 70, w, h); }

    ctx.fillStyle = "#2A2119"; ctx.textAlign = "center";
    ctx.font = "700 30px Manrope, sans-serif";
    ctx.fillText("ESCANEA PARA REGISTRAR TU ASISTENCIA", W / 2, 270);
    ctx.font = "700 60px 'Cormorant Garamond', Georgia, serif";
    const lineas = envolver(ctx, actividad, W - 120);
    lineas.forEach((t, i) => ctx.fillText(t, W / 2, 345 + i * 62));
    const yQR = 345 + lineas.length * 62 + 10;
    ctx.font = "500 28px Manrope, sans-serif"; ctx.fillStyle = "#776B5D";
    ctx.fillText(fechaTxt, W / 2, yQR);

    // QR
    const qr = qrcode(0, "M"); qr.addData(url); qr.make();
    const n = qr.getModuleCount(), lado = 560, celda = lado / (n + 8), x0 = (W - lado) / 2, y0 = yQR + 30;
    ctx.fillStyle = "#FFFFFF"; roundRect(ctx, x0, y0, lado, lado, 28); ctx.fill();
    ctx.fillStyle = "#2A2119";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect(Math.floor(x0 + (c + 4) * celda), Math.floor(y0 + (r + 4) * celda), Math.ceil(celda), Math.ceil(celda));

    ctx.font = "600 24px Manrope, sans-serif"; ctx.fillStyle = "#776B5D";
    ctx.fillText("Instituto de la Juventud · Gobierno de Playa del Carmen", W / 2, y0 + lado + 56);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  return { dibujar };
})();
