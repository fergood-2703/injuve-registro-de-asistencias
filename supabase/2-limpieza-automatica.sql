-- Programa la limpieza diaria a las 08:00 UTC (3:00 a. m. en Cancún).
-- Requiere la extensión pg_cron (Database > Extensions).

select cron.unschedule('limpieza-asistencia')
where exists (select 1 from cron.job where jobname = 'limpieza-asistencia');

select cron.schedule(
  'limpieza-asistencia',
  '0 8 * * *',
  $$select public.limpiar_registros()$$
);
