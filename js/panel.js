// Panel del personal: actividades, historial, configuración y perfil
(function () {
  const { $, sb } = App;
  let yo = null, perfil = null, acts = [], sel = null, regs = [], config = {};
  let borradoModo = "nunca";

  // Texto de cada movimiento del historial y su grupo (para filtros y colores)
  const ACCIONES = {
    inicio_sesion:       ["sesiones",    h => "inició sesión"],
    actividad_creada:    ["actividades", h => "creó la actividad " + act(h)],
    registro_abierto:    ["actividades", h => "abrió el registro de " + act(h)],
    registro_cerrado:    ["actividades", h => "cerró el registro de " + act(h)],
    actividad_eliminada: ["actividades", h => "eliminó la actividad " + act(h)],
    datos_limpiados:     ["actividades", h => "limpió los datos personales de " + act(h) + (h.detalle ? " (" + h.detalle + ")" : "")],
    registro_eliminado:  ["registros",   h => "eliminó el registro de " + fuerte(h.detalle) + " en " + act(h)],
    excel_descargado:    ["excel",       h => "descargó el Excel de " + act(h)],
    cuenta_creada:       ["cuentas",      h => "creó su cuenta"],
    perfil_actualizado:  ["cuentas",      h => "actualizó su perfil"],
    contrasena_cambiada: ["cuentas",      h => "cambió su contraseña"],
    admin_autorizado:    ["cuentas",      h => "autorizó a " + fuerte(h.detalle)],
    admin_quitado:       ["cuentas",      h => "quitó a " + fuerte(h.detalle)],
    aviso_actualizado:   ["config",      h => "actualizó el aviso de privacidad"],
    borrado_cambiado:    ["config",      h => "cambió el borrado automático a " + fuerte(h.detalle)]
  };
  const GRUPOS = {};
  Object.keys(ACCIONES).forEach(k => { const g = ACCIONES[k][0]; (GRUPOS[g] = GRUPOS[g] || []).push(k); });
  const fuerte = t => "<b>" + escapar(t || "") + "</b>";
  const act = h => "«" + escapar(h.actividad_nombre || "actividad") + "»";

  // Utilidades
  function msg(id, txt, tipo) { const e = $(id); e.textContent = txt || ""; e.hidden = !txt; if (tipo) e.className = "alerta " + tipo; }
  function confirmar(titulo, texto, boton) {
    return new Promise(res => {
      $("confTitulo").textContent = titulo; $("confTexto").textContent = texto; $("confSi").textContent = boton;
      const fin = v => { App.modal("mConf", false); $("confSi").onclick = $("confNo").onclick = null; res(v); };
      $("confSi").onclick = () => fin(true); $("confNo").onclick = () => fin(false);
      App.modal("mConf", true);
    });
  }
  const contar = a => (a.registros && a.registros[0] && a.registros[0].count) || 0;
  const enlaceRegistro = a => App.url("registro.html?c=" + encodeURIComponent(a.codigo));

  // Pestañas
  function ruta() {
    const h = location.hash.replace("#", "");
    const vista = { configuracion: "vCfg", historial: "vHist", perfil: "vPerfil" }[h] || "vAct";
    ["vAct", "vHist", "vCfg", "vPerfil"].forEach(v => $(v).hidden = v !== vista);
    $("tabAct").setAttribute("aria-current", vista === "vAct" ? "page" : "false");
    $("tabHist").setAttribute("aria-current", vista === "vHist" ? "page" : "false");
    $("tabCfg").setAttribute("aria-current", vista === "vCfg" ? "page" : "false");
    $("tabPerfil").setAttribute("aria-current", vista === "vPerfil" ? "page" : "false");
    if (vista === "vCfg") cargarConfiguracion();
    if (vista === "vHist") iniciarHistorial();
    if (vista === "vPerfil") pintarPerfil();
    if (h === "crear") setTimeout(() => { $("nNombre").focus(); $("nNombre").scrollIntoView({ block: "center" }); }, 200);
  }
  window.addEventListener("hashchange", ruta);

  // Actividades
  async function cargarActs() {
    const { data, error } = await sb.from("actividades").select("*, registros(count)")
      .order("fecha", { ascending: false }).order("creada", { ascending: false });
    if (error) { $("lista").innerHTML = '<div class="vacio">No se pudieron cargar las actividades.</div>'; return; }
    acts = data || [];
    if (!sel || !acts.find(a => a.id === sel)) { const ab = acts.find(a => a.abierta); sel = ab ? ab.id : (acts[0] && acts[0].id) || null; }
    pintarLista();
    if (!$("vCfg").hidden && config.id) pintarBorrado();
    await cargarRegs();
  }

  function pintarLista() {
    const el = $("lista"); el.innerHTML = "";
    if (!acts.length) { el.innerHTML = '<div class="vacio"><b>Todavía no hay actividades</b>Crea la primera arriba; quedará abierta para registro.</div>'; return; }
    acts.forEach(a => {
      const row = document.createElement("div"); row.className = "act" + (a.id === sel ? " sel" : "");
      const nm = document.createElement("button"); nm.type = "button"; nm.className = "nm";
      const b = document.createElement("b"); b.textContent = a.nombre;
      const s = document.createElement("span"); s.textContent = App.fecha(a.fecha, true);
      nm.append(b, s);
      if (a.creada_por_nombre || a.creada_por) {
        const por = document.createElement("span"); por.className = "por";
        por.textContent = "Creada por " + (a.creada_por_nombre || a.creada_por);
        nm.append(por);
      } nm.onclick = () => { sel = a.id; pintarLista(); cargarRegs(); };
      const pill = document.createElement("span");
      pill.className = "pill " + (a.limpiada ? "limpia" : a.abierta ? "abierta" : "cerrada");
      pill.textContent = a.limpiada ? "Datos limpiados" : a.abierta ? "Abierta" : "Cerrada";
      const n = a.limpiada ? (a.total || 0) : contar(a);
      const c = document.createElement("span"); c.className = "cuenta"; c.textContent = n + (n === 1 ? " asistente" : " asistentes");
      row.append(nm, pill, c);
      if (!a.limpiada) {
        const t = document.createElement("button"); t.type = "button"; t.className = "btn sm " + (a.abierta ? "linea" : "naranja");
        t.textContent = a.abierta ? "Cerrar registro" : "Abrir registro";
        t.onclick = () => cambiarAbierta(a, !a.abierta);
        row.append(t);
      }
      const del = document.createElement("button"); del.type = "button"; del.className = "btn sm peligro"; del.textContent = "Eliminar";
      del.onclick = async () => {
        if (!await confirmar("¿Eliminar «" + a.nombre + "»?", "Se borrará la actividad con sus " + n + " registros y firmas. Esto no se puede deshacer.", "Sí, eliminar")) return;
        const { error } = await sb.from("actividades").delete().eq("id", a.id);
        if (error) return App.toast("No se pudo eliminar la actividad.");
        App.toast("Actividad eliminada."); if (sel === a.id) sel = null; cargarActs();
      };
      row.append(del);
      el.append(row);
    });
  }

  async function cambiarAbierta(a, abrir) {
    let r = await sb.from("actividades").update({ abierta: false }).eq("abierta", true);
    if (!r.error && abrir) r = await sb.from("actividades").update({ abierta: true }).eq("id", a.id);
    if (r.error) return App.toast("No se pudo cambiar el registro. Inténtalo otra vez.");
    App.toast(abrir ? "Registro abierto: " + a.nombre : "Registro cerrado.");
    sel = a.id; cargarActs();
  }

  $("fNueva").addEventListener("submit", async e => {
    e.preventDefault(); msg("nErr", "");
    const nombre = $("nNombre").value.trim(), fecha = $("nFecha").value;
    if (nombre.length < 2) return msg("nErr", "Escribe el nombre de la actividad.");
    if (!fecha) return msg("nErr", "Elige la fecha.");
    $("nBtn").disabled = true;
    await sb.from("actividades").update({ abierta: false }).eq("abierta", true);
    const { data, error } = await sb.from("actividades").insert({ nombre, fecha, abierta: true }).select("*").single();
    $("nBtn").disabled = false;
    if (error) return msg("nErr", "No se pudo crear la actividad. Revisa la conexión e inténtalo otra vez.");
    $("nNombre").value = ""; sel = data.id;
    if (location.hash === "#crear") history.replaceState(null, "", "#actividades");
    App.toast("Actividad creada y abierta para registro.");
    await cargarActs();
    abrirQR(data);
  });

  async function cargarRegs() {
    const a = acts.find(x => x.id === sel);
    $("detalle").hidden = !a; if (!a) return;
    $("dTitulo").textContent = a.nombre;
    $("dQr").hidden = a.limpiada; $("dExcel").hidden = a.limpiada;
    cargarHistorialActividad(a.id);
    if (a.limpiada) {
      $("dTabla").hidden = true; $("dEstad").hidden = false;
      $("dSub").textContent = App.fecha(a.fecha, true) + " · " + (a.total || 0) + " asistentes";
      msg("dMsg", "Los datos personales de esta actividad ya se limpiaron. Solo quedan las estadísticas.", "warn");
      const g = a.por_genero || {}, ed = a.por_edad || {};
      const li = o => Object.keys(o).map(k => "<li>" + k + ": " + o[k] + "</li>").join("") || "<li>—</li>";
      $("dEstad").innerHTML =
        '<div class="caja"><small>Asistentes</small><b>' + (a.total || 0) + '</b></div>' +
        '<div class="caja"><small>Por género</small><ul>' + li({ Mujeres: g.M || 0, Hombres: g.H || 0, Otro: g.O || 0 }) + '</ul></div>' +
        '<div class="caja"><small>Por edad</small><ul>' + li(ed) + '</ul></div>';
      return;
    }
    $("dTabla").hidden = false; $("dEstad").hidden = true; msg("dMsg", "");
    const { data, error } = await sb.from("registros").select("*").eq("actividad_id", a.id).order("registrado");
    if (error) return msg("dMsg", "No se pudo cargar la lista de asistentes.", "err");
    regs = data || [];
    $("dSub").textContent = App.fecha(a.fecha, true) + " · " + regs.length + (regs.length === 1 ? " asistente" : " asistentes") + (a.abierta ? " · registro abierto" : "");
    const tb = $("dFilas"); tb.innerHTML = "";
    if (!regs.length) { tb.innerHTML = '<tr><td colspan="9" class="vacio">Aún no hay registros en esta actividad.</td></tr>'; return; }
    regs.forEach((r, i) => {
      const tr = document.createElement("tr");
      [i + 1, r.nombre + (r.tutor ? " (tutor: " + r.tutor + ")" : ""), r.edad, r.genero, r.telefono || "—", r.correo || "—", App.hora(r.registrado)]
        .forEach((v, j) => { const td = document.createElement("td"); td.textContent = v; if (j === 0) td.className = "n"; tr.append(td); });
      const tf = document.createElement("td");
      if (r.firma) { const im = document.createElement("img"); im.src = r.firma; im.alt = "Firma de " + r.nombre; tf.append(im); }
      const td = document.createElement("td");
      const b = document.createElement("button"); b.type = "button"; b.className = "btn sm peligro"; b.textContent = "Eliminar";
      b.onclick = async () => {
        if (!await confirmar("¿Eliminar este registro?", "Se borrará el registro de " + r.nombre + " con su firma.", "Sí, eliminar")) return;
        const { error } = await sb.from("registros").delete().eq("id", r.id);
        if (error) return App.toast("No se pudo eliminar el registro.");
        App.toast("Registro eliminado."); cargarActs();
      };
      td.append(b); tr.append(tf, td); tb.append(tr);
    });
  }
  $("dActualizar").addEventListener("click", cargarActs);
  $("dExcel").addEventListener("click", async () => {
    const a = acts.find(x => x.id === sel); if (!a) return;
    const b = $("dExcel"); b.disabled = true; b.textContent = "Preparando…";
    try {
      if (!config.aviso) { const { data } = await sb.from("config").select("*").eq("id", 1).single(); config = data || {}; }
      await ExcelAsistencia.generar(a, regs, config.aviso);
      await App.registrar("excel_descargado", a.id);
      App.toast("Excel descargado.");
      cargarHistorialActividad(a.id);
    } catch (e) { App.toast("No se pudo generar el Excel. Revisa la conexión e inténtalo otra vez."); }
    b.disabled = false; b.textContent = "Descargar Excel";
  });

  // QR
  let qrActual = null;
  async function abrirQR(a) {
    qrActual = a;
    const url = enlaceRegistro(a);
    $("qrTitulo").textContent = a.abierta ? "QR de «" + a.nombre + "»" : "QR de «" + a.nombre + "» (cerrada)";
    $("qrEnlace").value = url;
    App.modal("mQr", true);
    await TarjetaQR.dibujar($("qrLienzo"), url, a.nombre, App.fecha(a.fecha, true));
  }
  $("dQr").addEventListener("click", () => { const a = acts.find(x => x.id === sel); if (a) abrirQR(a); });
  $("qrCerrar").addEventListener("click", () => App.modal("mQr", false));
  $("qrCopiar").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("qrEnlace").value); App.toast("Enlace copiado."); }
    catch (e) { $("qrEnlace").select(); App.toast("Selecciona el enlace y cópialo."); }
  });
  $("qrDescargar").addEventListener("click", () => {
    $("qrLienzo").toBlob(b => {
      const u = URL.createObjectURL(b), a = document.createElement("a");
      a.href = u; a.download = ("QR " + qrActual.nombre).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "_") + ".png";
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    }, "image/png");
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { App.modal("mQr", false); } });

  // Configuración
  async function cargarConfiguracion() {
    const [cfg] = await Promise.all([sb.from("config").select("*").eq("id", 1).single(), cargarAdmins()]);
    if (cfg.data) {
      config = cfg.data;
      $("aviso").value = config.aviso || "";
      borradoModo = config.borrado || "nunca";
      $("todo").checked = !!config.borrar_todo;
      pintarBorrado();
    }
  }

  // Administradores
  const COLORES = ["var(--verde)", "var(--naranja-osc)", "var(--rojo)", "var(--tinta)"];
  async function cargarAdmins() {
    const { data, error } = await sb.rpc("lista_personal");
    const el = $("admins");
    if (error) { el.innerHTML = '<div class="vacio">No se pudo cargar la lista.</div>'; return; }
    el.innerHTML = "";
    const total = data.length;
    data.forEach((p, i) => {
      const esYo = p.email.toLowerCase() === yo.email.toLowerCase();
      const row = document.createElement("div"); row.className = "adm";
      const av = document.createElement("span"); av.className = "av"; av.style.background = COLORES[i % COLORES.length];
      av.textContent = (p.nombre || p.email)[0].toUpperCase();
      const info = document.createElement("div"); info.className = "info";
      const b = document.createElement("b"); b.textContent = p.nombre || "Sin nombre todavía";
      const s = document.createElement("small");
      s.textContent = [p.email, p.telefono ? formatoTel(p.telefono) : null].filter(Boolean).join(" · ");
      const s2 = document.createElement("small");
      s2.textContent = (p.tiene_cuenta ? "Cuenta creada" : "Aún no crea su cuenta") + (p.autorizado_por ? " · autorizado por " + p.autorizado_por : "");
      info.append(b, s, s2);
      const pill = document.createElement("span"); pill.className = "pill " + (esYo ? "yo" : p.tiene_cuenta ? "ok" : "pend");
      pill.textContent = esYo ? "Tú" : p.tiene_cuenta ? "Activo" : "Pendiente";
      row.append(av, info, pill);
      if (!esYo && total > 1) {
        const q = document.createElement("button"); q.type = "button"; q.className = "btn sm suave"; q.textContent = "Quitar";
        q.onclick = async () => {
          if (!await confirmar("¿Quitar a " + (p.nombre || p.email) + "?", "Ya no podrá entrar al inicio ni al panel. Si después lo vuelves a autorizar, tendrá que crear una contraseña nueva.", "Sí, quitar")) return;
          const { error } = await sb.rpc("quitar_personal", { correo: p.email });
          if (error) return App.toast(App.mensajeError(error));
          App.toast("Administrador quitado."); cargarAdmins();
        };
        row.append(q);
      }
      el.append(row);
    });
  }
  $("fAdmin").addEventListener("submit", async e => {
    e.preventDefault();
    const c = $("aCorreo").value.trim().toLowerCase();
    if (!App.correoValido(c)) return msg("aMsg", "Escribe un correo válido.", "err");
    $("aBtn").disabled = true;
    const { error } = await sb.rpc("agregar_personal", { correo: c });
    $("aBtn").disabled = false;
    if (error) return msg("aMsg", App.mensajeError(error), "err");
    $("aCorreo").value = "";
    msg("aMsg", "Listo. Avísale a " + c + " que entre a la página y toque «Es mi primera vez».", "ok");
    cargarAdmins();
  });

  // Aviso
  $("avisoBtn").addEventListener("click", async () => {
    const t = $("aviso").value.trim();
    if (t.length < 20) return App.toast("El aviso de privacidad es muy corto.");
    const { error } = await sb.from("config").update({ aviso: t }).eq("id", 1);
    if (error) return App.toast("No se pudo guardar el aviso.");
    config.aviso = t; App.toast("Aviso de privacidad guardado.");
  });

  // Borrado automático
  function pintarBorrado() {
    document.querySelectorAll("#segmento button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === borradoModo));
    const todo = $("todo").checked, nunca = borradoModo === "nunca";
    $("antesDespues").hidden = nunca; $("todoCampo").hidden = nunca; $("proxima").hidden = nunca;
    if (nunca) { $("explica").innerHTML = "Los registros <b>se guardan para siempre</b>, con nombres, teléfonos y firmas. Solo se borran si alguien los elimina a mano."; return; }
    const dias = borradoModo === "semana" ? 7 : 30;
    const per = borradoModo === "semana" ? "más de 7 días" : "más de 30 días";
    $("explica").innerHTML = todo
      ? "Cuando una actividad cerrada tenga <b>" + per + "</b>, se borra <b>por completo</b>: los datos de las personas y también la actividad con sus números."
      : "Cuando una actividad cerrada tenga <b>" + per + "</b>, se borran los <b>datos personales</b> (nombre, teléfono, correo y firma). Se conserva <b>cuántas personas fueron</b>, con su rango de edad y género, para sus informes.";
    $("despues").innerHTML = todo
      ? '<div class="tachado">Todo: la actividad desaparece del panel</div>'
      : '<div><b>Total de asistentes</b></div><div>Cuántas mujeres, hombres y otro</div><div>Cuántos por rango de edad</div><div class="tachado">nombres, teléfonos, correos y firmas</div>';
    // qué actividades se limpiarían y cuándo
    const hoy = App.hoy();
    const pend = acts.filter(a => !a.limpiada && !a.abierta).map(a => ({ a, dia: App.sumarDias(a.fecha, dias + 1) })).sort((x, y) => x.dia.localeCompare(y.dia));
    const pronto = pend.slice(0, 4);
    $("proxima").innerHTML = pronto.length
      ? "<b>🗓️ Próximas limpiezas (si guardas este cambio)</b><ul>" + pronto.map(p => "<li>" + escapar(p.a.nombre) + " — " + (p.dia <= hoy ? "esta noche" : App.fecha(p.dia, true)) + "</li>").join("") + "</ul><span>Descarga sus Excel antes si los necesitas completos.</span>"
      : "🗓️ Por ahora no hay actividades cerradas por limpiar.";
  }
  function escapar(t) { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
  document.querySelectorAll("#segmento button").forEach(b => b.addEventListener("click", () => { borradoModo = b.dataset.v; pintarBorrado(); }));
  $("todo").addEventListener("change", pintarBorrado);
  $("borradoBtn").addEventListener("click", async () => {
    const { error } = await sb.from("config").update({ borrado: borradoModo, borrar_todo: $("todo").checked }).eq("id", 1);
    if (error) return App.toast("No se pudo guardar.");
    App.toast(borradoModo === "nunca" ? "Guardado: los registros se conservan siempre." : "Guardado: borrado automático " + (borradoModo === "semana" ? "cada semana." : "cada mes."));
  });

  // Mi perfil
  function formatoTel(t) { const d = App.soloDigitos(t); return d.length === 10 ? d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6) : d; }
  function pintarEncabezado() { $("sesionTxt").textContent = "Conectado como " + perfil.nombre + " (" + yo.email + ")."; }
  function pintarPerfil() {
    $("pfNombre").value = perfil.nombre || ""; $("pfTel").value = formatoTel(perfil.telefono); $("pfCorreo").value = yo.email;
    msg("pfMsg", "");
  }
  $("pfTel").addEventListener("input", e => { e.target.value = e.target.value.replace(/[^\d ]/g, ""); });
  $("fPerfil").addEventListener("submit", async e => {
    e.preventDefault();
    const nombre = $("pfNombre").value.trim().replace(/\s+/g, " "), tel = App.soloDigitos($("pfTel").value);
    const errNombre = App.validarNombre(nombre);
    if (errNombre) return msg("pfMsg", errNombre, "err");
    if (tel.length !== 10) return msg("pfMsg", "El teléfono debe tener 10 dígitos.", "err");
    if (nombre === perfil.nombre && tel === perfil.telefono) return msg("pfMsg", "No hay cambios por guardar.", "warn");
    $("pfBtn").disabled = true;
    const { error } = await sb.rpc("actualizar_perfil", { p_nombre: nombre, p_telefono: tel });
    $("pfBtn").disabled = false;
    if (error) return msg("pfMsg", App.mensajeError(error), "err");
    perfil.nombre = nombre; perfil.telefono = tel;
    pintarEncabezado();
    msg("pfMsg", "Datos guardados.", "ok");
  });

  $("fClave").addEventListener("submit", async e => {
    e.preventDefault();
    const c1 = $("c1").value, c2 = $("c2").value;
    if (c1.length < 8) return msg("cMsg", "La contraseña debe tener al menos 8 caracteres.", "err");
    if (c1 !== c2) return msg("cMsg", "Las contraseñas no coinciden.", "err");
    $("cBtn").disabled = true;
    const { error } = await sb.auth.updateUser({ password: c1 });
    $("cBtn").disabled = false;
    if (error) return msg("cMsg", App.mensajeError(error), "err");
    $("c1").value = $("c2").value = "";
    App.registrar("contrasena_cambiada");
    msg("cMsg", "Contraseña cambiada.", "ok");
  });

  // Historial
  const POR_PAGINA = 40;
  let histPagina = 0, histListo = false;

  function filaMovimiento(h, conActividad) {
    const def = ACCIONES[h.accion] || ["config", () => h.accion];
    const li = document.createElement("li"); li.className = "mov " + def[0];
    const p = document.createElement("span"); p.className = "pto";
    const t = document.createElement("div"); t.className = "txt";
    t.innerHTML = fuerte(h.actor_nombre) + " " + def[1](h);
    if (h.actor_email && h.actor_email !== h.actor_nombre) {
      const sm = document.createElement("small"); sm.textContent = h.actor_email; t.append(sm);
    }
    const opciones = conActividad ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" };
    const tm = document.createElement("time"); tm.dateTime = h.fecha;
    tm.textContent = new Date(h.fecha).toLocaleDateString("es-MX", opciones) + " · " + App.hora(h.fecha);
    li.append(p, t, tm);
    return li;
  }

  async function cargarHistorialActividad(id) {
    const el = $("dHist");
    const { data, error } = await sb.from("historial").select("*").eq("actividad_id", id).order("fecha", { ascending: true }).order("id", { ascending: true });
    el.innerHTML = "";
    if (error) { el.innerHTML = '<li class="vacio">No se pudo cargar el historial.</li>'; return; }
    if (!data.length) { el.innerHTML = '<li class="vacio">Sin movimientos todavía.</li>'; return; }
    data.forEach(h => el.append(filaMovimiento(h, true)));
  }

  async function iniciarHistorial() {
    if (!histListo) {
      histListo = true;
      const { data } = await sb.rpc("lista_personal");
      const sp = $("hPersona");
      (data || []).forEach(p => { const o = document.createElement("option"); o.value = p.email; o.textContent = p.nombre || p.email; sp.append(o); });
      const os = document.createElement("option"); os.value = "__sistema"; os.textContent = "Sistema"; sp.append(os);
      ["hPersona", "hTipo", "hActividad", "hDesde", "hHasta"].forEach(id => $(id).addEventListener("change", () => cargarHistorial(true)));
    }
    const sa = $("hActividad"), actual = sa.value;
    sa.innerHTML = '<option value="">Todas</option>';
    acts.forEach(a => { const o = document.createElement("option"); o.value = a.id; o.textContent = a.nombre + " · " + App.fecha(a.fecha); sa.append(o); });
    sa.value = actual;
    cargarHistorial(true);
  }

  async function cargarHistorial(reiniciar) {
    if (reiniciar) { histPagina = 0; $("hLista").innerHTML = '<li class="vacio">Cargando…</li>'; }
    let q = sb.from("historial").select("*").order("fecha", { ascending: false }).order("id", { ascending: false });
    const persona = $("hPersona").value, tipo = $("hTipo").value, actId = $("hActividad").value;
    if (persona === "__sistema") q = q.is("actor_email", null);
    else if (persona) q = q.eq("actor_email", persona);
    if (tipo) q = q.in("accion", GRUPOS[tipo]);
    if (actId) q = q.eq("actividad_id", actId);
    if ($("hDesde").value) q = q.gte("fecha", new Date($("hDesde").value + "T00:00:00").toISOString());
    if ($("hHasta").value) q = q.lt("fecha", new Date(App.sumarDias($("hHasta").value, 1) + "T00:00:00").toISOString());
    const desde = histPagina * POR_PAGINA;
    const { data, error } = await q.range(desde, desde + POR_PAGINA);
    const el = $("hLista");
    if (reiniciar) el.innerHTML = "";
    if (error) { el.innerHTML = '<li class="vacio">No se pudo cargar el historial.</li>'; return; }
    if (reiniciar && !data.length) el.innerHTML = '<li class="vacio">No hay movimientos con estos filtros.</li>';
    data.slice(0, POR_PAGINA).forEach(h => el.append(filaMovimiento(h, false)));
    $("hMas").hidden = data.length <= POR_PAGINA;
  }
  $("hMas").addEventListener("click", () => { histPagina++; cargarHistorial(false); });
  $("hLimpiar").addEventListener("click", () => { $("fFiltros").reset(); cargarHistorial(true); });

  $("salir").addEventListener("click", async () => { await sb.auth.signOut(); location.href = "index.html"; });

  // Arranque
  (async function () {
    if (!App.configurado) { document.body.innerHTML = '<p style="padding:40px;text-align:center">Falta configurar la conexión con la base de datos en js/config.js.</p>'; return; }
    try { yo = await App.personalActual(); } catch (e) { yo = null; }
    if (!yo) { location.replace("index.html"); return; }
    try { perfil = await App.miPerfil(); } catch (e) { perfil = null; }
    if (!App.perfilCompleto(perfil)) { location.replace("index.html"); return; }
    $("app").hidden = false;
    pintarEncabezado();
    $("nFecha").value = App.hoy();
    await cargarActs();
    ruta();
  })();
})();
