#!/bin/sh
# Copia fresca de Supabase cloud al Supabase autoalojado (/opt/supabase). Se usa en el ensayo y en el corte.
# Pisa TODO el esquema public de la copia local y los usuarios de login. Nunca escribe en Supabase cloud.
# Uso: CLOUD_PW=... sh resync-from-cloud.sh        (CLOUD_PW = contraseña del rol hub_migrator)
set -eu
REF=phzqsjxouqttpcnqxxuq
HOST=aws-0-us-west-2.pooler.supabase.com
TS=$(date -u +%Y%m%dT%H%MZ)
OUT=/opt/backups/supabase/$TS
mkdir -p "$OUT"
C="host=$HOST port=5432 user=hub_migrator.$REF dbname=postgres sslmode=require"
T0=$(date +%s)
echo "1/5 volcado de Supabase cloud → $OUT"
docker run --rm -e PGPASSWORD="$CLOUD_PW" -v "$OUT":/out postgres:17 sh -c "pg_dump '$C' --schema=public --no-owner --no-privileges -Fc -f /out/public.dump && pg_dump '$C' --data-only --schema=auth --table=auth.users --table=auth.identities --no-owner -Fc -f /out/auth_users.dump"
cd /opt/supabase
PGPW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
P="docker exec -e PGPASSWORD=$PGPW supabase-db"
PI="docker exec -i -e PGPASSWORD=$PGPW supabase-db"
docker cp "$OUT/public.dump" supabase-db:/tmp/public.dump
docker cp "$OUT/auth_users.dump" supabase-db:/tmp/auth_users.dump
echo "2/5 vaciar la copia local (public + usuarios)"
$PI psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q <<SQL
drop trigger if exists on_auth_user_created on auth.users;
drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on sequences to postgres, anon, authenticated, service_role;
truncate auth.identities, auth.sessions, auth.refresh_tokens, auth.mfa_factors, auth.one_time_tokens cascade;
delete from auth.users;
SQL
echo "3/5 restaurar usuarios y public"
$P pg_restore -h 127.0.0.1 -U supabase_admin -d postgres --data-only --disable-triggers /tmp/auth_users.dump
$P pg_restore -h 127.0.0.1 -U postgres -d postgres --no-owner --no-privileges -j 2 /tmp/public.dump || true
echo "4/5 lo que vive fuera de public: FKs a auth.users, trigger de perfiles, Realtime"
$PI psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q <<SQL
do \$\$ begin
  if not exists (select 1 from pg_constraint where conname='flights_created_by_fkey') then alter table only public.flights add constraint flights_created_by_fkey foreign key (created_by) references auth.users(id); end if;
  if not exists (select 1 from pg_constraint where conname='profiles_id_fkey') then alter table only public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade; end if;
  if not exists (select 1 from pg_constraint where conname='system_logs_user_id_fkey') then alter table only public.system_logs add constraint system_logs_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null; end if;
end \$\$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
alter publication supabase_realtime set table public.flights, public.packages;
-- Red de seguridad: los mismos permisos que da Supabase sobre public (por si el volcado trae objetos de otro dueño).
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
SQL
docker exec supabase-db rm -f /tmp/public.dump /tmp/auth_users.dump
echo "   reinicio de Realtime y recarga del caché de la API (las tablas cambiaron de OID)"
$P psql -h 127.0.0.1 -U supabase_admin -d postgres -qc "notify pgrst, 'reload schema'"
docker compose restart realtime rest >/dev/null 2>&1
echo "5/5 conteos (grants debe dar lo mismo que en cloud)"
$P psql -h 127.0.0.1 -U postgres -d postgres -Atc "select 'tablas', count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE' union all select 'usuarios', count(*) from auth.users union all select 'packages', count(*) from public.packages union all select 'grants', count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')"
echo "listo en $(( $(date +%s) - T0 )) s"
