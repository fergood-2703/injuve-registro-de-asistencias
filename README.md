# INJUVE · Registro de asistencia

Aplicación web para registrar la asistencia a las actividades del Instituto de la Juventud de Playa del Carmen. Sustituye la lista de papel: los asistentes llenan sus datos y firman desde una tableta o desde su celular escaneando un QR, y el personal descarga la lista en Excel con las firmas.

## Funciones

- **Registro con firma digital** desde tableta o celular, sin necesidad de cuenta.
- **QR por actividad**: solo acepta registros mientras la actividad está abierta.
- **Panel del personal**: crear, abrir y cerrar actividades; ver la lista; eliminar duplicados.
- **Excel** con logos institucionales, datos de los asistentes y sus firmas.
- **Administradores**: alta por correo autorizado con nombre y teléfono, perfil editable y recuperación de contraseña.
- **Historial** de movimientos (general y por actividad): inicios de sesión, actividades, registros eliminados, descargas de Excel y cambios de configuración. No se puede editar ni borrar.
- **Borrado automático** opcional de datos personales (semanal o mensual), conservando estadísticas.
- Consentimiento de padre, madre o tutor para menores de edad.
- Instalable como app en la tableta (PWA).

## Tecnologías

- HTML, CSS y JavaScript sin framework ni paso de compilación.
- [Supabase](https://supabase.com) para autenticación y base de datos (PostgreSQL con Row Level Security).
- [ExcelJS](https://github.com/exceljs/exceljs) para generar el Excel y [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) para los QR.
- Despliegue en [Netlify](https://www.netlify.com).

## Estructura

```
├── index.html              Acceso del personal y menú principal
├── registro.html           Formulario público (?c=CÓDIGO)
├── panel.html              Actividades y configuración
├── nueva-contrasena.html   Restablecer contraseña
├── css/                    base, inicio, registro, panel
├── js/
│   ├── config.js           URL y anon key de Supabase
│   ├── comun.js            Cliente de Supabase y utilidades
│   ├── inicio.js
│   ├── registro.js
│   ├── firma.js            Recuadro de firma (canvas)
│   ├── gracias.js          Pantallas de confirmación
│   ├── panel.js
│   ├── excel.js
│   ├── qr.js
│   └── nueva-contrasena.js
├── img/                    Logos e íconos
├── supabase/
│   ├── 1-esquema.sql             Tablas, funciones, políticas e historial
│   └── 2-limpieza-automatica.sql Tarea programada del borrado automático
├── manifest.webmanifest
└── netlify.toml
```

## Configuración

### 1. Supabase

1. Crear un proyecto y ejecutar `supabase/1-esquema.sql` en **SQL Editor**.
2. Autorizar el primer correo de administrador:
   ```sql
   insert into public.personal (email) values ('correo@ejemplo.com');
   ```
3. En **Authentication → Sign In / Providers → Email**:
   - *Allow new users to sign up*: activado (lo usa «Es mi primera vez»; la base de datos rechaza correos no autorizados).
   - *Confirm email*: desactivado (recomendado).
4. En **Authentication → URL Configuration**:
   - *Site URL*: la URL del sitio en Netlify.
   - *Redirect URLs*: `https://<sitio>.netlify.app/**` y, para desarrollo, `http://127.0.0.1:5500/**`.
5. Borrado automático (opcional): activar la extensión **pg_cron** y ejecutar `supabase/2-limpieza-automatica.sql`.

### 2. Conexión

Copiar la **Project URL** y la **anon key** (Project Settings → API) en `js/config.js`.
La anon key es pública por diseño; los permisos los controlan las políticas de la base de datos. No usar nunca la `service_role` key en el frontend.

### 3. Desarrollo local

Abrir la carpeta con cualquier servidor estático, por ejemplo la extensión **Live Server** de VS Code.

### 4. Despliegue

Conectar el repositorio en Netlify (*Import an existing project*) o arrastrar la carpeta en *Deploy manually*. No requiere comando de build.

## Uso

1. Entrar al sitio. La primera vez, cada administrador usa **Es mi primera vez** para crear su cuenta con nombre, teléfono y contraseña. Desde **Mi perfil** (su nombre en el encabezado) puede editar su nombre, teléfono y contraseña; el correo no se puede cambiar.
2. En **Panel → Nueva actividad**, crear la actividad. Queda abierta y se muestra su QR.
3. Desde el menú, **Registrar asistentes** abre el formulario en la tableta. Para salir: mantener presionado el logo 3 segundos e ingresar la contraseña.
4. Al terminar, **Cerrar registro** y **Descargar Excel**.

### Tableta

- Instalar como app: *Agregar a la pantalla principal* (Chrome) o *Agregar a inicio* (Safari).
- Recomendado: fijar la pantalla (Android: *Fijar aplicación*; iPad: *Acceso guiado*).

### Recuperar acceso

- **¿Olvidaste tu contraseña?** envía un enlace por correo.
- Si el correo no llega, otro administrador puede quitar y volver a autorizar la cuenta desde Configuración.

## Seguridad

- El formulario público solo puede **insertar** registros en una actividad abierta; no puede leer, modificar ni borrar.
- Solo los correos en la tabla `personal` pueden crear cuenta y acceder al panel.
- No se puede quitar al último administrador ni a uno mismo.
- El historial lo escribe la base de datos (triggers); desde la página solo se puede consultar.
- Actualizar el esquema: volver a ejecutar `supabase/1-esquema.sql` completo; no borra datos.
