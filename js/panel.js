// Panel del personal: actividades, lista, QR, Excel y configuración
(function () {
  const { $, sb } = App;
  let yo = null, acts = [], sel = null, regs = [], config = {};
  let borradoModo = "nunca";

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
    const cfg = h === "configuracion";
    $("vAct").hidden = cfg; $("vCfg").hidden = !cfg;
    $("tabAct").setAttribute("aria-current", cfg ? "false" : "page");
    $("tabCfg").setAttribute("aria-current", cfg ? "page" : "false");
    if (cfg) cargarConfiguracion();
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
      nm.append(b, s); nm.onclick = () => { sel = a.id; pintarLista(); cargarRegs(); };
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
      App.toast("Excel descargado.");
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
      a.href = u; a.download = ("QR " + qrActual.nombre).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_") + ".png";
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
      const av = document.createElement("span"); av.className = "av"; av.style.background = COLORES[i % COLORES.length]; av.textContent = p.email[0].toUpperCase();
      const info = document.createElement("div"); info.className = "info";
      const b = document.createElement("b"); b.textContent = p.email;
      const s = document.createElement("small"); s.textContent = p.tiene_cuenta ? "Ya tiene contraseña" : "Autorizado · aún no crea su contraseña";
      info.append(b, s);
      const pill = document.createElement("span"); pill.className = "pill " + (esYo ? "yo" : p.tiene_cuenta ? "ok" : "pend");
      pill.textContent = esYo ? "Tú" : p.tiene_cuenta ? "Activo" : "Pendiente";
      row.append(av, info, pill);
      if (!esYo && total > 1) {
        const q = document.createElement("button"); q.type = "button"; q.className = "btn sm suave"; q.textContent = "Quitar";
        q.onclick = async () => {
          if (!await confirmar("¿Quitar a " + p.email + "?", "Ya no podrá entrar al inicio ni al panel. Si después lo vuelves a autorizar, tendrá que crear una contraseña nueva.", "Sí, quitar")) return;
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

  // Mi cuenta
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
    msg("cMsg", "Contraseña cambiada.", "ok");
  });

  $("salir").addEventListener("click", async () => { await sb.auth.signOut(); location.href = "index.html"; });

  // Arranque
  (async function () {
    if (!App.configurado) { document.body.innerHTML = '<p style="padding:40px;text-align:center">Falta configurar la conexión con la base de datos en js/config.js.</p>'; return; }
    try { yo = await App.personalActual(); } catch (e) { yo = null; }
    if (!yo) { location.replace("index.html"); return; }
    $("app").hidden = false;
    $("quien").textContent = yo.email; $("miCorreo").textContent = yo.email;
    $("nFecha").value = App.hoy();
    ruta();
    await cargarActs();
  })();
})();
