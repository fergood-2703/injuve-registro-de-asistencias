// Tres pantallas de "Gracias" (naranja, verde y roja) que salen al azar
window.Gracias = (function () {
  const COLORES = ["naranja", "verde", "rojo"];
  const TITULOS = [n => "¡Gracias, " + n + "!", n => "¡Listo, " + n + "!", n => "¡Qué gusto tenerte aquí, " + n + "!"];
  const SEGUNDOS = 8;
  let ultimo = null, timer = null, alTerminar = null;
  const $ = id => document.getElementById(id);

  function arte(color) {
    if (color === "naranja") {
      let h = '<div class="medalla"><img src="img/mascara.png" alt=""></div>';
      const cols = ["#397D44", "#A13B2D", "#F7F1E5", "#2A2119"];
      for (let i = 0; i < 22; i++) {
        const a = i / 22 * Math.PI * 2 + (Math.random() - .5) * .4, d = 150 + Math.random() * 130;
        h += '<svg class="confeti" viewBox="0 0 18 18" style="--dx:' + (Math.cos(a) * d).toFixed(0) + 'px;--dy:' + (Math.sin(a) * d).toFixed(0) +
             'px;--r:' + (Math.random() * 540 - 270).toFixed(0) + 'deg"><path d="M2 16V2h14v10H7V7h5" fill="none" stroke="' + cols[i % 4] + '" stroke-width="3"/></svg>';
      }
      return h;
    }
    if (color === "verde") {
      let t = "";
      for (let i = 0; i < 48; i++) {
        const a = i * 7.5 * Math.PI / 180, g = i % 6 === 0, r1 = g ? 98 : 104, r2 = 112;
        t += '<line style="--i:' + i + '" x1="' + (120 + r1 * Math.sin(a)).toFixed(1) + '" y1="' + (120 - r1 * Math.cos(a)).toFixed(1) +
             '" x2="' + (120 + r2 * Math.sin(a)).toFixed(1) + '" y2="' + (120 - r2 * Math.cos(a)).toFixed(1) + '"/>';
      }
      return '<svg width="240" height="240" viewBox="0 0 240 240"><circle class="aro" cx="120" cy="120" r="105"/><g class="rayas">' + t +
             '</g><circle class="disco" cx="120" cy="120" r="76"/><path class="palomita" d="M86 122l24 24 46-50"/></svg>';
    }
    return '<div class="circulos"><b></b><b></b><i></i><i></i><i></i><i></i><i></i></div>';
  }

  function cerrar() {
    clearInterval(timer);
    $("gracias").classList.remove("on", "play");
    const fn = alTerminar; alTerminar = null;
    if (fn) fn();
  }

  function mostrar(nombreCompleto, actividad, terminar) {
    const nombre = (nombreCompleto || "").trim().split(/\s+/)[0] || "";
    const opciones = COLORES.filter(c => c !== ultimo);
    const color = opciones[Math.floor(Math.random() * opciones.length)];
    ultimo = color; alTerminar = terminar;

    const g = $("gracias");
    g.className = "gracias " + color;
    const greca = "greca" + (color === "naranja" ? "" : " w");
    $("gA").className = greca + " g-arriba"; $("gB").className = greca + " g-abajo";
    $("arte").innerHTML = arte(color);
    $("gTitulo").textContent = nombre ? TITULOS[Math.floor(Math.random() * TITULOS.length)](nombre) : "¡Gracias!";
    $("gTexto").textContent = "Tu asistencia a «" + actividad + "» quedó registrada.";
    void g.offsetWidth;
    g.classList.add("on", "play");

    let quedan = SEGUNDOS;
    const valor = $("gValor"), num = $("gNum");
    num.textContent = quedan;
    valor.style.transition = "none"; valor.style.strokeDashoffset = 0; void valor.getBoundingClientRect();
    valor.style.transition = "stroke-dashoffset " + SEGUNDOS + "s linear"; valor.style.strokeDashoffset = 138.2;
    clearInterval(timer);
    timer = setInterval(() => { quedan--; num.textContent = Math.max(0, quedan); if (quedan <= 0) cerrar(); }, 1000);
    setTimeout(() => $("otra").focus({ preventScroll: true }), 400);
  }

  document.addEventListener("DOMContentLoaded", () => { $("otra").addEventListener("click", cerrar); });
  return { mostrar };
})();
