-- Landing F1 SiViajo: tablas de órdenes del checkout + columna de descripción en
-- español para los tickets (poblada por el scraper). Idempotente.

-- Descripción traducida al español (fallback a description en la landing).
alter table public.p1_tickets
  add column if not exists description_es text;

-- Órdenes del checkout público.
create table if not exists public.f1_orders (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  buyer_name text not null,
  buyer_email text not null,
  buyer_doc text,
  buyer_phone text,
  currency text not null default 'EUR',
  total numeric not null default 0,
  mp_preference_id text,
  mp_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_f1_orders_status on public.f1_orders(status);
create index if not exists idx_f1_orders_created on public.f1_orders(created_at desc);

-- Ítems de cada orden (snapshot de precio/sector al momento de comprar).
create table if not exists public.f1_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.f1_orders(id) on delete cascade,
  event_id uuid,
  event_name text,
  category_id uuid,
  sector_name text,
  unit_price numeric not null default 0,
  qty integer not null default 1,
  currency text not null default 'EUR'
);

create index if not exists idx_f1_order_items_order on public.f1_order_items(order_id);
