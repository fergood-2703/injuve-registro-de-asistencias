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
    perfilCompleto: p => !!(p && p.nombre && p.telefono),
    // Devuelve un mensaje si el nombre no es válido (vacío, con @ o con números)
    validarNombre(n) {
      if (/@/.test(n)) return "En «Nombre completo» escribe tu nombre, no tu correo.";
      if (/\d/.test(n)) return "El nombre no puede llevar números.";
      if (n.length < 3 || !/\s/.test(n)) return "Escribe tu nombre completo (nombre y apellido).";
      return "";
    },
    soloDigitos: t => String(t || "").replace(/\D/g, ""),

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
      if (/nombre_invalido/.test(m)) return "Escribe tu nombre completo.";
      if (/telefono_invalido/.test(m)) return "El teléfono debe tener 10 dígitos.";
      if (/Failed to fetch|NetworkError|network/i.test(m)) return "No hay conexión con la base de datos. Revisa el internet.";
      return "Algo salió mal. Inténtalo otra vez.";
    }
  };
})();
