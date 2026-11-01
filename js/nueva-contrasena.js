// Restablecer contraseña desde el enlace del correo
(function () {
  const { $, sb } = App;
  function listo(ok) {
    $("c1").disabled = $("c2").disabled = $("btn").disabled = !ok;
    $("sub").textContent = ok ? "Escribe tu contraseña nueva." : "Este enlace ya no es válido o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».";
    if (ok) $("c1").focus();
  }
  if (!App.configurado) { $("sub").textContent = "Falta configurar la conexión con la base de datos."; return; }
  let resuelto = false;
  sb.auth.onAuthStateChange((ev, ses) => { if ((ev === "PASSWORD_RECOVERY" || ev === "SIGNED_IN") && ses && !resuelto) { resuelto = true; listo(true); } });
  setTimeout(async () => { if (resuelto) return; const { data } = await sb.auth.getSession(); resuelto = true; listo(!!data.session); }, 2500);

  $("f").addEventListener("submit", async e => {
    e.preventDefault(); $("err").hidden = true;
    const c1 = $("c1").value, c2 = $("c2").value;
    const err = t => { $("err").textContent = t; $("err").hidden = false; };
    if (c1.length < 8) return err("La contraseña debe tener al menos 8 caracteres.");
    if (c1 !== c2) return err("Las contraseñas no coinciden.");
    $("btn").disabled = true;
    const { error } = await sb.auth.updateUser({ password: c1 });
    if (error) { $("btn").disabled = false; return err(App.mensajeError(error)); }
    $("ok").textContent = "¡Listo! Tu contraseña se cambió. Te llevamos al inicio…"; $("ok").hidden = false;
    setTimeout(() => location.href = "index.html", 1800);
  });
})();
