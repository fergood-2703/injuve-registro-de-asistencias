// Formulario público de registro (se abre con el QR o desde el inicio en la tableta)
(function () {
  const { $, sb, EDADES, MENORES, GENEROS } = App;
  const params = new URLSearchParams(location.search);
  const codigo = (params.get("c") || "").trim();
  const firma = crearFirma($("lienzo"), $("guia"));
  let actividad = null;

  // Opciones de edad y género
  function opciones(el, name, items) {
    items.forEach(([v, l]) => {
      const lab = document.createElement("label"); lab.className = "opcion";
      const inp = document.createElement("input"); inp.type = "radio"; inp.name = name; inp.value = v;
      const sp = document.createElement("span"); sp.textContent = l;
      lab.append(inp, sp); el.append(lab);
    });
  }
  opciones($("edades"), "edad", EDADES.map(e => [e, e]));
  opciones($("generos"), "genero", GENEROS);
  const elegido = n => (document.querySelector('input[name="' + n + '"]:checked') || {}).value || "";
  document.querySelectorAll('input[name="edad"]').forEach(i =>
    i.addEventListener("change", () => { $("menor").hidden = !MENORES.includes(elegido("edad")); }));

  // Pantallas
  function estado(titulo, texto, reintentar) {
    $("vista").hidden = true; $("pEstado").hidden = false;
    $("pTitulo").textContent = titulo; $("pTexto").textContent = texto;
    $("pReintentar").hidden = !reintentar;
  }
  function mostrarFormulario() {
    $("pEstado").hidden = true; $("vista").hidden = false;
    $("actNombre").textContent = actividad.nombre;
    $("actFecha").textContent = App.fecha(actividad.fecha, true);
    document.title = actividad.nombre + " · Registro INJUVE";
    requestAnimationFrame(firma.ajustar);
  }

  async function cargar() {
    if (!App.configurado) return estado("Registro no disponible", "Falta configurar la conexión con la base de datos.");
    if (!codigo) return estado("Escanea el código QR", "Para registrarte, escanea el código QR de la actividad con la cámara de tu celular.");
    const [act, cfg] = await Promise.all([
      sb.rpc("actividad_publica", { c: codigo }),
      sb.from("config").select("aviso").eq("id", 1).maybeSingle()
    ]);
    if (act.error) return estado("Sin conexión", "No se pudo conectar con la lista. Revisa el internet e inténtalo otra vez.", true);
    actividad = (act.data && act.data[0]) || null;
    if (cfg.data) $("avisoTxt").textContent = cfg.data.aviso;
    if (!actividad) return estado("Este registro ya está cerrado", "La actividad de este código QR ya no recibe registros. Si crees que es un error, avisa al personal de INJUVE.", true);
    mostrarFormulario();
  }
  $("pReintentar").addEventListener("click", () => { estado("Cargando…", "Conectando con la lista de asistencia."); cargar(); });

  // Envío
  function error(t) {
    const e = $("error"); e.textContent = t; e.hidden = !t;
    if (t) e.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  $("tel").addEventListener("input", e => { e.target.value = e.target.value.replace(/[^\d ]/g, ""); });
  $("borrarFirma").addEventListener("click", () => firma.borrar());

  $("form").addEventListener("submit", async e => {
    e.preventDefault(); error("");
    const nombre = $("nombre").value.trim().replace(/\s+/g, " ");
    const edad = elegido("edad"), genero = elegido("genero");
    const telefono = $("tel").value.replace(/\D/g, ""), correo = $("correo").value.trim();
    const menor = MENORES.includes(edad), tutor = $("tutor").value.trim();

    if (nombre.length < 3) return error("Escribe tu nombre completo.");
    if (!edad) return error("Elige tu rango de edad.");
    if (!genero) return error("Elige una opción de género.");
    if (telefono && telefono.length !== 10) return error("El teléfono debe tener 10 dígitos, o déjalo vacío.");
    if (correo && !App.correoValido(correo)) return error("Revisa el correo electrónico, o déjalo vacío.");
    if (menor && tutor.length < 3) return error("Escribe el nombre del padre, madre o tutor.");
    if (menor && !$("tutorOk").checked) return error("Falta la autorización del padre, madre o tutor.");
    if (!firma.tieneFirma()) return error("Falta tu firma en el recuadro.");
    if (!$("avisoOk").checked) return error("Para registrarte, acepta el aviso de privacidad.");

    const f = firma.exportar();
    const btn = $("enviar"); btn.disabled = true; btn.textContent = "Guardando…";
    // Sin .select(): el público puede insertar pero no leer registros
    const { error: err } = await sb.from("registros").insert({
      actividad_id: actividad.id, nombre, edad, genero, telefono, correo,
      menor, tutor: menor ? tutor : "", firma: f.data, firma_w: f.w, firma_h: f.h, aviso_aceptado: true
    });
    btn.disabled = false; btn.textContent = "Registrar mi asistencia →";
    if (err) {
      if (err.code === "42501") return estado("Este registro ya está cerrado", "La actividad se cerró mientras llenabas el formulario. Avisa al personal de INJUVE.", true);
      return error("No se pudo guardar. Revisa la conexión a internet e inténtalo otra vez.");
    }
    const nombreActividad = actividad.nombre;
    limpiar();
    window.scrollTo({ top: 0 });
    Gracias.mostrar(nombre, nombreActividad, siguiente);
  });

  function limpiar() { $("form").reset(); $("menor").hidden = true; firma.borrar(); error(""); }
  async function siguiente() {
    // Revisa que la actividad siga abierta antes de la siguiente persona
    const { data } = await sb.rpc("actividad_publica", { c: codigo });
    if (data && data[0]) { actividad = data[0]; mostrarFormulario(); setTimeout(() => $("nombre").focus({ preventScroll: true }), 100); }
    else if (data) estado("Este registro ya está cerrado", "La actividad ya no recibe registros.", true);
  }

  // Salir del modo registro (presionar el logo 3 s + contraseña)
  const ins = $("insignia");
  let presion = null;
  function soltar() { clearTimeout(presion); ins.classList.remove("presionando"); }
  ins.addEventListener("pointerdown", e => {
    e.preventDefault(); soltar();
    ins.classList.add("presionando");
    presion = setTimeout(() => { soltar(); abrirSalida(); }, 3000);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(t => ins.addEventListener(t, soltar));
  ins.addEventListener("contextmenu", e => e.preventDefault());

  let correoSesion = null;
  async function abrirSalida() {
    const { data } = await sb.auth.getSession();
    correoSesion = data.session ? data.session.user.email : null;
    $("sCorreoCampo").hidden = !!correoSesion;
    $("sClave").value = ""; $("sErr").hidden = true;
    App.modal("salida", true);
    setTimeout(() => (correoSesion ? $("sClave") : $("sCorreo")).focus(), 150);
  }
  $("sCancelar").addEventListener("click", () => App.modal("salida", false));
  $("fSalida").addEventListener("submit", async e => {
    e.preventDefault();
    const correo = correoSesion || $("sCorreo").value.trim(), clave = $("sClave").value;
    const err = $("sErr"); err.hidden = true;
    if (!correo || !clave) { err.textContent = "Escribe " + (correoSesion ? "la contraseña." : "el correo y la contraseña."); err.hidden = false; return; }
    $("sBtn").disabled = true;
    const { error: e1 } = await sb.auth.signInWithPassword({ email: correo, password: clave });
    if (e1) { $("sBtn").disabled = false; err.textContent = App.mensajeError(e1); err.hidden = false; return; }
    const { data: ok } = await sb.rpc("es_personal");
    $("sBtn").disabled = false;
    if (!ok) { await sb.auth.signOut(); err.textContent = "Esta cuenta no es del personal autorizado."; err.hidden = false; return; }
    location.href = "index.html";
  });

  cargar();
})();
