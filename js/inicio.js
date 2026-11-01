// Inicio: acceso del personal y menú principal
(function () {
  const { $, sb } = App;
  let actividadAbierta = null;
  let refresco = null;

  // Anillo tipo calendario
  function dibujarAnillo(svg) {
    const NS = "http://www.w3.org/2000/svg";
    const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    svg.append(el("circle", { class: "punteado", cx: 200, cy: 200, r: 196 }));
    svg.append(el("circle", { class: "trazo", cx: 200, cy: 200, r: 186, transform: "rotate(-90 200 200)" }));
    const g = el("g", { class: "marcas" });
    for (let i = 0; i < 72; i++) {
      const a = i * 5 * Math.PI / 180, grande = i % 6 === 0, r1 = grande ? 164 : 170, r2 = 178;
      g.append(el("line", { x1: 200 + r1 * Math.sin(a), y1: 200 - r1 * Math.cos(a), x2: 200 + r2 * Math.sin(a), y2: 200 - r2 * Math.cos(a), class: grande ? "g" : "" }));
    }
    svg.append(g);
    const p = el("g", { class: "puntos" });
    [[200, 14], [386, 200], [200, 386], [14, 200]].forEach(([x, y]) => p.append(el("circle", { cx: x, cy: y, r: 5 })));
    svg.append(p);
  }
  document.querySelectorAll(".anillo").forEach(dibujarAnillo);

  // Escenas con animación de entrada
  function mostrarEscena(id) {
    ["escenaAcceso", "escenaPerfil", "escenaInicio", "escenaError"].forEach(x => { $(x).hidden = x !== id; $(x).classList.remove("entrar"); });
    const esc = $(id);
    void esc.offsetWidth;
    esc.classList.add("entrar");
    esc.querySelectorAll(".anim").forEach(e => {
      e.classList.remove("listo");
      e.addEventListener("animationend", function fin(ev) { if (ev.target === e) { e.classList.add("listo"); e.removeEventListener("animationend", fin); } });
    });
    const an = esc.querySelector(".anillo");
    if (an) { an.style.animation = ""; an.style.transform = ""; an.addEventListener("animationend", function fin(ev) { if (ev.target === an) { an.style.animation = "none"; an.removeEventListener("animationend", fin); } }); }
  }
  function errorGeneral(txt) { $("errTxt").textContent = txt; mostrarEscena("escenaError"); }

  // Acceso
  function modo(m) {
    $("fEntrar").hidden = m !== "entrar"; $("fPrimera").hidden = m !== "primera"; $("fOlvido").hidden = m !== "olvido";
    ["eErr", "eOk", "pErr", "pOk", "oErr", "oOk"].forEach(x => $(x).hidden = true);
    const correo = $("eCorreo").value || $("pCorreo").value || $("oCorreo").value;
    if (correo) { $("eCorreo").value = $("pCorreo").value = $("oCorreo").value = correo; }
    const f = { entrar: "fEntrar", primera: "fPrimera", olvido: "fOlvido" }[m];
    $(f).classList.add("listo");
    setTimeout(() => $(f).querySelector("input").focus(), 50);
  }
  document.querySelectorAll("[data-modo]").forEach(b => b.addEventListener("click", () => modo(b.dataset.modo)));
  function msg(id, txt) { $(id).textContent = txt; $(id).hidden = !txt; }
  function ocupado(btn, si, txt) { btn.disabled = si; if (txt) btn.textContent = txt; }

  $("fEntrar").addEventListener("submit", async e => {
    e.preventDefault(); msg("eErr", "");
    const correo = $("eCorreo").value.trim(), clave = $("eClave").value;
    if (!App.correoValido(correo)) return msg("eErr", "Escribe tu correo.");
    if (!clave) return msg("eErr", "Escribe tu contraseña.");
    ocupado($("eBtn"), true, "Entrando…");
    const { error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
    ocupado($("eBtn"), false, "Entrar");
    if (error) return msg("eErr", App.mensajeError(error));
    $("eClave").value = "";
    App.registrar("inicio_sesion");
    arrancar();
  });

  $("fPrimera").addEventListener("submit", async e => {
    e.preventDefault(); msg("pErr", ""); msg("pOk", "");
    const nombre = $("pNombre").value.trim().replace(/\s+/g, " "), tel = App.soloDigitos($("pTel").value);
    const correo = $("pCorreo").value.trim(), c1 = $("pClave").value, c2 = $("pClave2").value;
    const errNombre = App.validarNombre(nombre);
    if (errNombre) return msg("pErr", errNombre);
    if (tel.length !== 10) return msg("pErr", "El teléfono debe tener 10 dígitos.");
    if (!App.correoValido(correo)) return msg("pErr", "Escribe tu correo autorizado.");
    if (c1.length < 8) return msg("pErr", "La contraseña debe tener al menos 8 caracteres.");
    if (c1 !== c2) return msg("pErr", "Las contraseñas no coinciden.");
    ocupado($("pBtn"), true, "Creando…");
    const { data, error } = await sb.auth.signUp({
      email: correo, password: c1,
      options: { emailRedirectTo: App.url("index.html"), data: { nombre, telefono: tel } }
    });
    ocupado($("pBtn"), false, "Crear mi cuenta");
    if (error) return msg("pErr", App.mensajeError(error));
    // Supabase no da error si el correo ya existía: en ese caso "identities" viene vacío
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
      return msg("pErr", "Este correo ya tiene contraseña. Usa «Entrar» o «¿Olvidaste tu contraseña?».");
    // Cuenta creada: se bloquea el formulario y se regresa a "Entrar"
    $("fPrimera").querySelectorAll("input, button").forEach(el => el.disabled = true);
    $("pClave").value = $("pClave2").value = "";
    if (data.session) { arrancar(); return; }
    msg("pOk", "¡Cuenta creada! Te llevamos a «Entrar»…");
    setTimeout(() => {
      $("fPrimera").querySelectorAll("input, button").forEach(el => el.disabled = false);
      $("fPrimera").reset();
      $("eCorreo").value = correo;
      modo("entrar");
      msg("eOk", "Te mandamos un correo para confirmar tu cuenta. Ábrelo y después entra aquí con tu contraseña.");
      $("eClave").focus();
    }, 2500);
  });

  $("fOlvido").addEventListener("submit", async e => {
    e.preventDefault(); msg("oErr", ""); msg("oOk", "");
    const correo = $("oCorreo").value.trim();
    if (!App.correoValido(correo)) return msg("oErr", "Escribe tu correo.");
    ocupado($("oBtn"), true, "Enviando…");
    const { error } = await sb.auth.resetPasswordForEmail(correo, { redirectTo: App.url("nueva-contrasena.html") });
    ocupado($("oBtn"), false, "Enviar enlace");
    if (error) return msg("oErr", App.mensajeError(error));
    msg("oOk", "Si el correo está registrado, en unos minutos te llegará el enlace. Revisa también la carpeta de spam.");
  });

  // Completar perfil
  $("cTel").addEventListener("input", e => { e.target.value = e.target.value.replace(/[^\d ]/g, ""); });
  $("pTel").addEventListener("input", e => { e.target.value = e.target.value.replace(/[^\d ]/g, ""); });
  $("fPerfil").addEventListener("submit", async e => {
    e.preventDefault(); msg("cErr", "");
    const nombre = $("cNombre").value.trim().replace(/\s+/g, " "), tel = App.soloDigitos($("cTel").value);
    const errNombre = App.validarNombre(nombre);
    if (errNombre) return msg("cErr", errNombre);
    if (tel.length !== 10) return msg("cErr", "El teléfono debe tener 10 dígitos.");
    ocupado($("cBtn"), true, "Guardando…");
    const { error } = await sb.rpc("actualizar_perfil", { p_nombre: nombre, p_telefono: tel });
    ocupado($("cBtn"), false, "Guardar y continuar");
    if (error) return msg("cErr", App.mensajeError(error));
    arrancar();
  });
  $("cSalir").addEventListener("click", async () => { await sb.auth.signOut(); mostrarEscena("escenaAcceso"); modo("entrar"); });

  // Menú
  async function cargarEstado() {
    const inicioMes = App.hoy().slice(0, 8) + "01";
    const [abierta, mes] = await Promise.all([
      sb.from("actividades").select("id, nombre, codigo, registros(count)").eq("abierta", true).maybeSingle(),
      sb.from("actividades").select("id", { count: "exact", head: true }).gte("fecha", inicioMes)
    ]);
    if (abierta.error) { $("estRegTxt").textContent = "No se pudo revisar"; return; }
    actividadAbierta = abierta.data;
    const est = $("estReg");
    if (actividadAbierta) {
      const n = (actividadAbierta.registros && actividadAbierta.registros[0] && actividadAbierta.registros[0].count) || 0;
      est.classList.remove("apagado");
      $("estRegTxt").textContent = "Abierta: " + actividadAbierta.nombre + " · " + n + (n === 1 ? " registro" : " registrados");
    } else {
      est.classList.add("apagado");
      $("estRegTxt").textContent = "Sin actividad abierta";
    }
    const m = mes.count || 0;
    $("estPanelTxt").textContent = m + (m === 1 ? " actividad este mes" : " actividades este mes");
  }

  const anillo = $("anilloInicio"), mascara = $("mascaraInicio");
  $("opRegistro").addEventListener("pointerenter", () => { anillo.style.animation = "none"; anillo.style.transform = "rotate(-25deg)"; });
  $("opPanel").addEventListener("pointerenter", () => { anillo.style.animation = "none"; anillo.style.transform = "rotate(25deg)"; });
  [$("opRegistro"), $("opPanel")].forEach(b => b.addEventListener("pointerleave", () => { anillo.style.transform = "rotate(0deg)"; }));

  function irA(color, texto, destino, desde) {
    const c = $("cortina"), r = (desde || mascara).getBoundingClientRect();
    c.style.setProperty("--x", (r.left + r.width / 2) + "px");
    c.style.setProperty("--y", (r.top + r.height / 2) + "px");
    c.className = "cortina " + color; $("cortinaTxt").textContent = texto;
    anillo.style.animation = "none"; anillo.style.transform = color === "naranja" ? "rotate(-180deg)" : "rotate(180deg)";
    mascara.style.transform = "scale(1.08)";
    requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add("on")));
    const espera = matchMedia("(prefers-reduced-motion: reduce)").matches ? 50 : 1100;
    setTimeout(() => { location.href = destino; }, espera);
  }

  $("opRegistro").addEventListener("click", async () => {
    await cargarEstado();
    if (actividadAbierta) return irA("naranja", "Abriendo registro…", "registro.html?c=" + encodeURIComponent(actividadAbierta.codigo) + "&modo=tableta");
    mascara.animate([{ transform: "rotate(0)" }, { transform: "rotate(-6deg)" }, { transform: "rotate(5deg)" }, { transform: "rotate(-3deg)" }, { transform: "rotate(0)" }], { duration: 600, easing: "ease-out" });
    anillo.style.animation = "none"; anillo.style.transform = "rotate(-8deg)"; setTimeout(() => anillo.style.transform = "rotate(0deg)", 250);
    setTimeout(() => App.modal("sinActividad", true), 350);
  });
  $("opPanel").addEventListener("click", () => irA("verde", "Entrando al panel…", "panel.html"));
  $("saCerrar").addEventListener("click", () => App.modal("sinActividad", false));
  $("sinActividad").addEventListener("click", e => { if (e.target.id === "sinActividad") App.modal("sinActividad", false); });
  $("saIr").addEventListener("click", () => { App.modal("sinActividad", false); irA("verde", "Entrando al panel…", "panel.html#crear", $("saIr")); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") App.modal("sinActividad", false); });


  // Arranque
  async function arrancar() {
    if (!App.configurado) return errorGeneral("Falta configurar la conexión con la base de datos en js/config.js.");
    const { data } = await sb.auth.getSession();
    const teniaSesion = !!data.session;
    let usuario;
    try { usuario = await App.personalActual(); }
    catch (e) { return errorGeneral("No hay conexión con la base de datos. Revisa el internet y recarga la página."); }
    if (!usuario) {
      mostrarEscena("escenaAcceso"); modo("entrar");
      if (teniaSesion) msg("eErr", "Tu cuenta ya no está autorizada. Pide a un administrador que agregue tu correo en Configuración.");
      return;
    }
    let perfil = null;
    try { perfil = await App.miPerfil(); } catch (e) {}
    if (!App.perfilCompleto(perfil)) {
      $("cCorreo").textContent = usuario.email;
      if (perfil) { $("cNombre").value = perfil.nombre || ""; $("cTel").value = perfil.telefono || ""; }
      mostrarEscena("escenaPerfil");
      return;
    }
    $("quien").textContent = perfil.nombre.split(" ")[0];
    mostrarEscena("escenaInicio");
    cargarEstado();
    clearInterval(refresco); refresco = setInterval(cargarEstado, 30000);
  }

  // Al volver con el botón "atrás" del navegador, quita la cortina
  window.addEventListener("pageshow", e => { if (e.persisted) { $("cortina").classList.remove("on"); mascara.style.transform = ""; anillo.style.transform = ""; cargarEstado(); } });

  arrancar();
})();
