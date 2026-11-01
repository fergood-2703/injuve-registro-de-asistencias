-- Esquema de la base de datos (Supabase / PostgreSQL)
-- Ejecutar completo en SQL Editor. Se puede volver a correr sin perder datos.

-- ---------------------------------------------------------------------
-- 1) Personal autorizado
-- ---------------------------------------------------------------------
create table if not exists public.personal (
  email    text primary key,
  agregado timestamptz not null default now()
);
alter table public.personal add column if not exists nombre text;      -- nombre completo (nombres + apellidos)
alter table public.personal add column if not exists nombres text;
alter table public.personal add column if not exists apellidos text;
alter table public.personal add column if not exists telefono text;
alter table public.personal add column if not exists autorizado_por text;
-- Cuentas anteriores: separa el nombre completo en nombres y apellidos
update public.personal
set nombres = split_part(nombre, ' ', 1),
    apellidos = nullif(trim(substr(nombre, length(split_part(nombre, ' ', 1)) + 1)), '')
where nombres is null and nombre is not null;
alter table public.personal enable row level security;
-- Sin políticas: solo se accede con las funciones de abajo.

-- true si el usuario con sesión está en la tabla personal
create or replace function public.es_personal()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.personal
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------
-- 2) Historial de movimientos
--    Solo se escribe desde la base de datos (triggers y funciones).
--    Nadie puede editarlo ni borrarlo desde la página.
-- ---------------------------------------------------------------------
create table if not exists public.historial (
  id bigserial primary key,
  fecha timestamptz not null default now(),
  actor_email text,
  actor_nombre text not null,
  accion text not null,
  actividad_id uuid,          -- sin llave foránea: se conserva aunque se elimine la actividad
  actividad_nombre text,
  detalle text
);
create index if not exists historial_fecha on public.historial (fecha desc);
create index if not exists historial_actividad on public.historial (actividad_id, fecha);
alter table public.historial enable row level security;

drop policy if exists historial_leer on public.historial;
create policy historial_leer on public.historial for select to authenticated using (public.es_personal());

-- Guarda un movimiento a nombre de quien tiene la sesión (o "Sistema" si no hay sesión)
create or replace function public._evento(p_accion text, p_aid uuid, p_anom text, p_det text)
returns void language plpgsql security definer set search_path = public as $$
declare
  e text := auth.jwt() ->> 'email';
  n text;
begin
  if e is not null then
    select nombre into n from public.personal where lower(email) = lower(e);
  end if;
  insert into public.historial (actor_email, actor_nombre, accion, actividad_id, actividad_nombre, detalle)
  values (e, coalesce(nullif(n, ''), e, 'Sistema'), p_accion, p_aid, p_anom, p_det);
end;
$$;
revoke execute on function public._evento(text, uuid, text, text) from public, anon, authenticated;

-- Movimientos que registra la página: inicio de sesión, descarga de Excel y cambio de contraseña
create or replace function public.registrar_accion(p_accion text, p_aid uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare anom text;
begin
  if not public.es_personal() then raise exception 'no_autorizado'; end if;
  if p_accion not in ('inicio_sesion', 'excel_descargado', 'contrasena_cambiada') then
    raise exception 'accion_invalida';
  end if;
  if p_aid is not null then select nombre into anom from public.actividades where id = p_aid; end if;
  perform public._evento(p_accion, p_aid, anom, null);
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Cuentas y perfiles
-- ---------------------------------------------------------------------

-- Nombres y apellidos: solo letras, espacios, apóstrofo, punto y guion
create or replace function public.nombre_valido(t text)
returns boolean language sql immutable as $$
  select char_length(trim(coalesce(t, ''))) >= 2
     and trim(t) ~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòùÇç'' .-]+$';
$$;

-- Solo se pueden crear cuentas con correos autorizados.
-- Nombres, apellidos y teléfono llegan en los metadatos del registro.
create or replace function public.validar_alta()
returns trigger language plpgsql security definer set search_path = public as $$
declare ns text; ap text; t text;
begin
  if not exists (select 1 from public.personal where lower(email) = lower(new.email)) then
    raise exception 'correo_no_autorizado';
  end if;
  ns := nullif(trim(new.raw_user_meta_data ->> 'nombres'), '');
  ap := nullif(trim(new.raw_user_meta_data ->> 'apellidos'), '');
  if not public.nombre_valido(ns) or not public.nombre_valido(ap) then ns := null; ap := null; end if;  -- se pedirán en "Completa tu perfil"
  t := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'telefono', ''), '\D', '', 'g'), '');
  if t !~ '^[0-9]{10}$' then t := null; end if;
  update public.personal
  set nombres = coalesce(ns, nombres), apellidos = coalesce(ap, apellidos),
      nombre = coalesce(ns || ' ' || ap, nombre), telefono = coalesce(t, telefono)
  where lower(email) = lower(new.email);
  insert into public.historial (actor_email, actor_nombre, accion, detalle)
  values (lower(new.email), coalesce(ns || ' ' || ap, lower(new.email)), 'cuenta_creada', null);
  return new;
end;
$$;
drop trigger if exists validar_alta on auth.users;
create trigger validar_alta before insert on auth.users
  for each row execute function public.validar_alta();

-- Perfil del usuario con sesión
drop function if exists public.mi_perfil();
create function public.mi_perfil()
returns table (email text, nombre text, nombres text, apellidos text, telefono text)
language sql stable security definer set search_path = public as $$
  select p.email, p.nombre, p.nombres, p.apellidos, p.telefono from public.personal p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

drop function if exists public.actualizar_perfil(text, text);
create or replace function public.actualizar_perfil(p_nombres text, p_apellidos text, p_telefono text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ns text := regexp_replace(trim(p_nombres), '\s+', ' ', 'g');
  ap text := regexp_replace(trim(p_apellidos), '\s+', ' ', 'g');
  t text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
begin
  if not public.es_personal() then raise exception 'no_autorizado'; end if;
  if not public.nombre_valido(ns) then raise exception 'nombre_invalido'; end if;
  if not public.nombre_valido(ap) then raise exception 'apellido_invalido'; end if;
  if t !~ '^[0-9]{10}$' then raise exception 'telefono_invalido'; end if;
  update public.personal set nombres = ns, apellidos = ap, nombre = ns || ' ' || ap, telefono = t
  where lower(email) = lower(auth.jwt() ->> 'email');
  perform public._evento('perfil_actualizado', null, null, null);
end;
$$;
-- Lista de administradores
drop function if exists public.lista_personal();
create function public.lista_personal()
returns table (email text, nombre text, telefono text, agregado timestamptz, tiene_cuenta boolean, autorizado_por text)
language sql stable security definer set search_path = public, auth as $$
  select p.email, p.nombre, p.telefono, p.agregado,
         exists (select 1 from auth.users u where lower(u.email) = lower(p.email)),
         coalesce(a.nombre, p.autorizado_por)
  from public.personal p
  left join public.personal a on lower(a.email) = lower(p.autorizado_por)
  where public.es_personal()
  order by p.agregado;
$$;

-- Autoriza un correo nuevo
create or replace function public.agregar_personal(correo text)
returns void language plpgsql security definer set search_path = public as $$
declare c text := lower(trim(correo));
begin
  if not public.es_personal() then raise exception 'no_autorizado'; end if;
  if c !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'correo_invalido'; end if;
  if exists (select 1 from public.personal where lower(email) = c) then return; end if;
  insert into public.personal (email, autorizado_por) values (c, lower(auth.jwt() ->> 'email'));
  perform public._evento('admin_autorizado', null, null, c);
end;
$$;

-- Quita a un administrador y borra su cuenta
create or replace function public.quitar_personal(correo text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare quien text;
begin
  if not public.es_personal() then raise exception 'no_autorizado'; end if;
  if lower(correo) = lower(auth.jwt() ->> 'email') then raise exception 'no_puedes_quitarte'; end if;
  if (select count(*) from public.personal) <= 1 then raise exception 'ultimo_admin'; end if;
  select coalesce(nullif(nombre, '') || ' (' || email || ')', email) into quien
  from public.personal where lower(email) = lower(correo);
  if quien is null then return; end if;
  delete from public.personal where lower(email) = lower(correo);
  delete from auth.users where lower(email) = lower(correo);
  perform public._evento('admin_quitado', null, null, quien);
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Configuración (una sola fila)
-- ---------------------------------------------------------------------
create table if not exists public.config (
  id int primary key default 1 check (id = 1),
  aviso text not null default 'El Instituto de la Juventud del municipio de Playa del Carmen es responsable del tratamiento de los datos personales que nos proporciones, los cuales serán protegidos conforme a la ley de protección de datos personales de Quintana Roo y demás normatividad aplicable.',
  borrado text not null default 'nunca' check (borrado in ('nunca', 'semana', 'mes')),
  borrar_todo boolean not null default false
);
insert into public.config (id) values (1) on conflict (id) do nothing;
alter table public.config enable row level security;

drop policy if exists config_leer on public.config;
create policy config_leer on public.config for select to anon, authenticated using (true);
drop policy if exists config_editar on public.config;
create policy config_editar on public.config for update to authenticated
  using (public.es_personal()) with check (public.es_personal());

create or replace function public.historial_config()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.aviso is distinct from old.aviso then
    perform public._evento('aviso_actualizado', null, null, null);
  end if;
  if new.borrado is distinct from old.borrado or new.borrar_todo is distinct from old.borrar_todo then
    perform public._evento('borrado_cambiado', null, null,
      case new.borrado when 'nunca' then 'Nunca' when 'semana' then 'Cada semana' else 'Cada mes' end ||
      case when new.borrar_todo and new.borrado <> 'nunca' then ' (borrando también estadísticas)' else '' end);
  end if;
  return new;
end;
$$;
drop trigger if exists historial_config on public.config;
create trigger historial_config after update on public.config
  for each row execute function public.historial_config();

-- ---------------------------------------------------------------------
-- 5) Actividades
-- ---------------------------------------------------------------------
create table if not exists public.actividades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 200),
  fecha date not null,
  abierta boolean not null default false,
  codigo text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  creada timestamptz not null default now(),
  -- estadísticas que se conservan después del borrado automático
  limpiada boolean not null default false,
  total int,
  por_genero jsonb,
  por_edad jsonb
);
alter table public.actividades add column if not exists creada_por text;
alter table public.actividades add column if not exists creada_por_nombre text;
create unique index if not exists una_actividad_abierta on public.actividades (abierta) where abierta;
alter table public.actividades enable row level security;

drop policy if exists act_personal on public.actividades;
create policy act_personal on public.actividades for all to authenticated
  using (public.es_personal()) with check (public.es_personal());

-- Guarda quién creó la actividad (no se puede falsear desde la página)
create or replace function public.actividad_autor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.creada_por := lower(auth.jwt() ->> 'email');
  select nombre into new.creada_por_nombre from public.personal where lower(email) = new.creada_por;
  return new;
end;
$$;
drop trigger if exists actividad_autor on public.actividades;
create trigger actividad_autor before insert on public.actividades
  for each row execute function public.actividad_autor();

create or replace function public.historial_actividades()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public._evento('actividad_creada', new.id, new.nombre, null);
    if new.abierta then perform public._evento('registro_abierto', new.id, new.nombre, null); end if;
  elsif tg_op = 'UPDATE' then
    if new.abierta and not old.abierta then perform public._evento('registro_abierto', new.id, new.nombre, null); end if;
    if old.abierta and not new.abierta then perform public._evento('registro_cerrado', new.id, new.nombre, null); end if;
    if new.limpiada and not old.limpiada then perform public._evento('datos_limpiados', new.id, new.nombre, new.total || ' asistentes'); end if;
  elsif tg_op = 'DELETE' then
    perform public._evento('actividad_eliminada', old.id, old.nombre, null);
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists historial_actividades on public.actividades;
create trigger historial_actividades after insert or update or delete on public.actividades
  for each row execute function public.historial_actividades();

-- El formulario público busca la actividad por el código del QR
create or replace function public.actividad_publica(c text)
returns table (id uuid, nombre text, fecha date)
language sql stable security definer set search_path = public as $$
  select a.id, a.nombre, a.fecha from public.actividades a
  where a.codigo = c and a.abierta and not a.limpiada
  limit 1;
$$;
grant execute on function public.actividad_publica(text) to anon, authenticated;

create or replace function public.actividad_abierta(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.actividades where id = aid and abierta and not limpiada);
$$;

-- ---------------------------------------------------------------------
-- 6) Registros de asistentes
-- ---------------------------------------------------------------------
create table if not exists public.registros (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 3 and 200),
  edad text not null check (edad in ('12 a 14','15 a 17','18 a 24','25 a 29','30+')),
  genero text not null check (genero in ('M','H','O')),
  telefono text not null default '' check (telefono ~ '^([0-9]{10})?$'),
  correo text not null default '' check (char_length(correo) <= 200),
  menor boolean not null default false,
  tutor text not null default '' check (char_length(tutor) <= 200),
  firma text not null check (firma like 'data:image/png;base64,%' and char_length(firma) < 400000),
  firma_w int,
  firma_h int,
  aviso_aceptado boolean not null check (aviso_aceptado),
  registrado timestamptz not null default now(),
  check (not menor or char_length(tutor) >= 3)
);
create index if not exists registros_actividad on public.registros (actividad_id, registrado);
alter table public.registros enable row level security;

-- El público solo puede insertar en una actividad abierta; leer y borrar es solo para personal.
drop policy if exists reg_insert on public.registros;
create policy reg_insert on public.registros for insert to anon, authenticated
  with check (public.actividad_abierta(actividad_id));
drop policy if exists reg_select on public.registros;
create policy reg_select on public.registros for select to authenticated using (public.es_personal());
drop policy if exists reg_delete on public.registros;
create policy reg_delete on public.registros for delete to authenticated using (public.es_personal());

-- Registra cuando un administrador elimina un registro.
-- No se registra cuando se borran por eliminar la actividad o por la limpieza automática.
create or replace function public.historial_registros()
returns trigger language plpgsql security definer set search_path = public as $$
declare anom text; limpia boolean;
begin
  if auth.jwt() ->> 'email' is null then return old; end if;
  select nombre, limpiada into anom, limpia from public.actividades where id = old.actividad_id;
  if not found or limpia then return old; end if;
  perform public._evento('registro_eliminado', old.actividad_id, anom, old.nombre);
  return old;
end;
$$;
drop trigger if exists historial_registros on public.registros;
create trigger historial_registros after delete on public.registros
  for each row execute function public.historial_registros();

-- ---------------------------------------------------------------------
-- 7) Borrado automático
--    Limpia actividades cerradas con más de 7 o 30 días según la configuración.
--    Conserva el total y el conteo por género y edad, salvo que borrar_todo sea true.
-- ---------------------------------------------------------------------
create or replace function public.limpiar_registros()
returns int language plpgsql security definer set search_path = public as $$
declare
  cfg record; dias int; a record; n int := 0;
begin
  select * into cfg from public.config where id = 1;
  if cfg.borrado = 'nunca' then return 0; end if;
  dias := case cfg.borrado when 'semana' then 7 else 30 end;

  for a in
    select * from public.actividades
    where not limpiada and not abierta and fecha < current_date - dias
  loop
    if cfg.borrar_todo then
      delete from public.actividades where id = a.id;
    else
      update public.actividades set
        limpiada = true,
        total = (select count(*) from public.registros where actividad_id = a.id),
        por_genero = (select coalesce(jsonb_object_agg(genero, c), '{}'::jsonb)
                      from (select genero, count(*) c from public.registros where actividad_id = a.id group by genero) s),
        por_edad = (select coalesce(jsonb_object_agg(edad, c), '{}'::jsonb)
                    from (select edad, count(*) c from public.registros where actividad_id = a.id group by edad) s)
      where id = a.id;
      delete from public.registros where actividad_id = a.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.limpiar_registros() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8) Primer administrador (descomentar y cambiar el correo)
-- ---------------------------------------------------------------------
-- insert into public.personal (email) values ('tu-correo@ejemplo.com');
