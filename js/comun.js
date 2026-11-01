// Utilidades compartidas por todas las páginas
(function () {
  const cfg = window.APP_CONFIG || {};
  const configurado = !!(cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("TU-PROYECTO") &&
                         cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("TU-ANON-KEY"));

  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];

  window.App = {
    configurado,
    sb: configurado ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null,
    EDADES: ["12 a 14", "15 a 17", "18 a 24", "25 a 29", "30+"],
    MENORES: ["12 a 14", "15 a 17"],
    GENEROS: [["M", "Mujer"], ["H", "Hombre"], ["O", "Otro / prefiero no decir"]],
    $: id => document.getElementById(id),

    fecha(iso, conDia) {
      if (!iso) return "";
      const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
      const txt = d + " de " + MESES[m - 1] + " de " + y;
      if (!conDia) return txt;
      const dia = DIAS[new Date(y, m - 1, d).getDay()];
      return dia.charAt(0).toUpperCase() + dia.slice(1) + " " + txt;
    },
    hora(iso) {
      try { return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }); }
      catch (e) { return ""; }
    },
    hoy() {
      const d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    },
    sumarDias(iso, n) {
      const [y, m, d] = iso.split("-").map(Number);
      const f = new Date(y, m - 1, d + n);
      return f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" + String(f.getDate()).padStart(2, "0");
    },
    correoValido: c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c),
    url(pagina) { return new URL(pagina, location.href).href; },

    toast(msg, ms) {
      let t = document.getElementById("toast");
      if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
      t.textContent = msg; t.classList.add("on");
      clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("on"), ms || 3200);
    },

    // Sesión del personal: devuelve el usuario si está autorizado, o null
    async personalActual() {
      if (!this.sb) return null;
      const { data } = await this.sb.auth.getSession();
      if (!data.session) return null;
      const { data: ok, error } = await this.sb.rpc("es_personal");
      if (error) throw error;
      if (!ok) { await this.sb.auth.signOut(); return null; }
      return data.session.user;
    },

    // Nombre y teléfono del usuario con sesión
    async miPerfil() {
      const { data, error } = await this.sb.rpc("mi_perfil");
      if (error) throw error;
      return (data && data[0]) || null;
    },
    perfilCompleto: p => !!(p && p.nombres && p.apellidos && p.telefono),
    soloDigitos: t => String(t || "").replace(/\D/g, ""),
    limpiarTexto: t => String(t || "").trim().replace(/\s+/g, " "),

    // Teléfono con espacios: 983 102 36 78
    formatoTel(t) {
      const d = String(t || "").replace(/\D/g, "").slice(0, 10);
      return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(" ");
    },
    // Aplica el formato mientras se escribe, sin mover el cursor de lugar
    mascaraTel(input) {
      input.setAttribute("maxlength", "13");
      input.setAttribute("inputmode", "numeric");
      input.addEventListener("input", () => {
        const pos = input.selectionStart || 0;
        const digitosAntes = input.value.slice(0, pos).replace(/\D/g, "").length;
        input.value = App.formatoTel(input.value);
        let i = 0, c = 0;
        while (i < input.value.length && c < digitosAntes) { if (/\d/.test(input.value[i])) c++; i++; }
        try { input.setSelectionRange(i, i); } catch (e) {}
      });
    },

    // Reglas de validación: devuelven el mensaje de error o "" si está bien
    reglas: {
      nombres(v) {
        v = App.limpiarTexto(v);
        if (!v) return "Escribe tu nombre o nombres.";
        if (/@/.test(v)) return "Aquí va tu nombre, no tu correo.";
        if (/\d/.test(v)) return "El nombre no puede llevar números.";
        if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòùÇç' .-]+$/.test(v)) return "Usa solo letras.";
        if (v.length < 2) return "El nombre es muy corto.";
        return "";
      },
      apellidos(v) {
        v = App.limpiarTexto(v);
        if (!v) return "Escribe tu apellido o apellidos.";
        const m = App.reglas.nombres(v);
        return m ? m.replace("tu nombre", "tu apellido").replace("El nombre", "El apellido") : "";
      },
      nombreCompleto(v) {
        v = App.limpiarTexto(v);
        if (!v) return "Escribe tu nombre completo.";
        if (/@/.test(v)) return "Aquí va tu nombre, no tu correo.";
        if (/\d/.test(v)) return "El nombre no puede llevar números.";
        if (v.length < 3) return "Escribe tu nombre completo.";
        return "";
      },
      telefono(v) {
        const d = App.soloDigitos(v);
        if (!d) return "Escribe tu teléfono.";
        return d.length === 10 ? "" : "Faltan " + (10 - d.length) + (10 - d.length === 1 ? " número." : " números.");
      },
      telefonoOpcional(v) { return App.soloDigitos(v) ? App.reglas.telefono(v) : ""; },
      correo(v) {
        v = String(v || "").trim();
        if (!v) return "Escribe tu correo.";
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Revisa el correo, parece incompleto.";
      },
      correoOpcional(v) { return String(v || "").trim() ? App.reglas.correo(v) : ""; },
      clave(v) { return String(v || "").length >= 8 ? "" : "Debe tener al menos 8 caracteres."; }
    },

    // Revisa un campo al salir de él y, después del primer error, mientras se escribe.
    // regla: función que recibe el valor y devuelve el mensaje de error.
    vigilar(input, regla) {
      const campo = input.closest(".campo") || input.parentElement;
      let aviso = campo.querySelector(".campo-error");
      if (!aviso) { aviso = document.createElement("small"); aviso.className = "campo-error"; aviso.hidden = true; campo.append(aviso); }
      let tocado = false;
      const revisar = () => {
        const m = regla(input.value);
        aviso.textContent = m; aviso.hidden = !m;
        input.classList.toggle("invalido", !!m);
        input.classList.toggle("valido", !m && input.value.trim() !== "");
        input.setAttribute("aria-invalid", m ? "true" : "false");
        return !m;
      };
      input.addEventListener("blur", () => { if (input.value.trim() !== "" || tocado) { tocado = true; revisar(); } });
      input.addEventListener("input", () => { if (tocado) revisar(); });
      input._revisar = () => { tocado = true; return revisar(); };
      input._limpiar = () => { tocado = false; aviso.hidden = true; input.classList.remove("invalido", "valido"); };
      return input;
    },
    // Revisa todos los campos; enfoca el primero con error. Devuelve true si todo está bien.
    revisarTodos(inputs) {
      let primero = null;
      inputs.forEach(i => { if (i._revisar && !i._revisar() && !primero) primero = i; });
      if (primero) primero.focus();
      return !primero;
    },

    // Deja constancia en el historial (inicio de sesión, descarga de Excel, cambio de contraseña)
    registrar(accion, actividadId) {
      return this.sb.rpc("registrar_accion", { p_accion: accion, p_aid: actividadId || null }).then(() => {}, () => {});
    },

    // Abre/cierra un modal (.velo)
    modal(id, abrir) {
      const v = document.getElementById(id);
      v.classList.toggle("on", abrir);
      if (abrir) {
        const f = v.querySelector("input, button");
        setTimeout(() => f && f.focus(), 120);
      }
    },

    // Traduce errores comunes de Supabase a mensajes claros
    mensajeError(err) {
      const m = (err && (err.message || err.error_description || "")) + "";
      if (/correo_no_autorizado|Database error saving new user/i.test(m)) return "Este correo no está autorizado. Pide a un administrador que lo agregue en Configuración.";
      if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
      if (/already registered|already been registered|User already/i.test(m)) return "Este correo ya tiene contraseña. Usa «Entrar» o «¿Olvidaste tu contraseña?».";
      if (/Password should be at least|at least 6|weak/i.test(m)) return "La contraseña debe tener al menos 8 caracteres.";
      if (/Email not confirmed/i.test(m)) return "Primero confirma tu correo con el enlace que te llegó.";
      if (/rate limit|too many/i.test(m)) return "Se hicieron demasiados intentos. Espera unos minutos e inténtalo otra vez.";
      if (/no_puedes_quitarte/.test(m)) return "No puedes quitarte a ti mismo.";
      if (/ultimo_admin/.test(m)) return "No se puede quitar al último administrador.";
      if (/correo_invalido/.test(m)) return "Escribe un correo válido.";
      if (/nombre_invalido/.test(m)) return "Revisa tu nombre: usa solo letras.";
      if (/apellido_invalido/.test(m)) return "Revisa tus apellidos: usa solo letras.";
      if (/telefono_invalido/.test(m)) return "El teléfono debe tener 10 dígitos.";
      if (/Failed to fetch|NetworkError|network/i.test(m)) return "No hay conexión con la base de datos. Revisa el internet.";
      return "Algo salió mal. Inténtalo otra vez.";
    }
  };
})();
