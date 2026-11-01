-- Esquema de la base de datos (Supabase / PostgreSQL)
-- Ejecutar completo en SQL Editor. Se puede volver a correr sin perder datos.

-- ---------------------------------------------------------------------
-- 1) Personal autorizado
-- ---------------------------------------------------------------------
create table if not exists public.personal (
  email    text primary key,
  agregado timestamptz not null default now()
);
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

-- Solo se pueden crear cuentas con correos autorizados
create or replace function public.validar_alta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.personal where lower(email) = lower(new.email)) then
    raise exception 'correo_no_autorizado';
  end if;
  return new;
end;
$$;
drop trigger if exists validar_alta on auth.users;
create trigger validar_alta before insert on auth.users
  for each row execute function public.validar_alta();

-- Lista de administradores y si ya crearon su cuenta
create or replace function public.lista_personal()
returns table (email text, agregado timestamptz, tiene_cuenta boolean)
language sql stable security definer set search_path = public, auth as $$
  select p.email, p.agregado,
         exists (select 1 from auth.users u where lower(u.email) = lower(p.email))
  from public.personal p
  where public.es_personal()
  order by p.agregado;
$$;

-- Autoriza un correo nuevo
create or replace function public.agregar_personal(correo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_personal() then raise exception 'no_autorizado'; end if;
  if correo !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'correo_invalido'; end if;
  insert into public.personal (email) values (lower(trim(correo))) on conflict do nothing;
end;
$$;

-- Quita a un administrador y borra su cuenta
create or replace function public.quitar_personal(correo text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.es_personal() then raise exception 'no_autorizado'; end if;
  if lower(correo) = lower(auth.jwt() ->> 'email') then raise exception 'no_puedes_quitarte'; end if;
  if (select count(*) from public.personal) <= 1 then raise exception 'ultimo_admin'; end if;
  delete from public.personal where lower(email) = lower(correo);
  delete from auth.users where lower(email) = lower(correo);
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Configuración (una sola fila)
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

-- ---------------------------------------------------------------------
-- 3) Actividades
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
create unique index if not exists una_actividad_abierta on public.actividades (abierta) where abierta;
alter table public.actividades enable row level security;

drop policy if exists act_personal on public.actividades;
create policy act_personal on public.actividades for all to authenticated
  using (public.es_personal()) with check (public.es_personal());

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
-- 4) Registros de asistentes
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

-- ---------------------------------------------------------------------
-- 5) Borrado automático
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
-- 6) Primer administrador (descomentar y cambiar el correo)
-- ---------------------------------------------------------------------
-- insert into public.personal (email) values ('tu-correo@ejemplo.com');
