create extension if not exists pgcrypto;

create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  location text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null unique,
  category text not null default 'General',
  unit text not null default 'units',
  reorder_level numeric not null default 10 check (reorder_level >= 0),
  created_at timestamptz not null default now()
);

create table if not exists operations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  type text not null check (type in ('receipt','delivery','transfer','adjustment')),
  status text not null default 'ready' check (status in ('ready','done','canceled')),
  source_warehouse_id uuid references warehouses(id),
  destination_warehouse_id uuid references warehouses(id),
  partner text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  validated_at timestamptz
);

create table if not exists operation_lines (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references operations(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric not null check (quantity > 0),
  counted_quantity numeric
);

create table if not exists stock_balances (
  product_id uuid not null references products(id),
  warehouse_id uuid not null references warehouses(id),
  quantity numeric not null default 0 check (quantity >= 0),
  primary key (product_id, warehouse_id)
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references operations(id),
  product_id uuid not null references products(id),
  warehouse_id uuid not null references warehouses(id),
  delta numeric not null,
  created_at timestamptz not null default now()
);

insert into warehouses (name, code, location) values
 ('Main Warehouse', 'WH-MAIN', 'North District'),
 ('Production Floor', 'WH-PROD', 'Factory Building'),
 ('East Outlet', 'WH-EAST', 'East District')
on conflict (code) do nothing;

insert into products (name, sku, category, unit, reorder_level) values
 ('Steel Rods', 'STL-001', 'Raw Materials', 'kg', 40),
 ('Ergonomic Chair', 'CHR-104', 'Furniture', 'pcs', 20),
 ('Oak Timber', 'TIM-220', 'Raw Materials', 'boards', 35),
 ('Hex Bolt M8', 'BLT-008', 'Hardware', 'pcs', 100),
 ('Standing Desk', 'DSK-310', 'Furniture', 'pcs', 12),
 ('Matte Black Paint', 'PNT-055', 'Finishing', 'litres', 15)
on conflict (sku) do nothing;

insert into stock_balances (product_id, warehouse_id, quantity)
select p.id, w.id, stock.quantity
from (values
 ('STL-001','WH-MAIN',128::numeric), ('STL-001','WH-PROD',32::numeric),
 ('CHR-104','WH-MAIN',18::numeric), ('CHR-104','WH-EAST',7::numeric),
 ('TIM-220','WH-MAIN',54::numeric), ('TIM-220','WH-PROD',16::numeric),
 ('BLT-008','WH-MAIN',240::numeric), ('BLT-008','WH-PROD',80::numeric),
 ('DSK-310','WH-MAIN',8::numeric), ('PNT-055','WH-MAIN',0::numeric), ('PNT-055','WH-EAST',4::numeric)
) as stock(sku, warehouse_code, quantity)
join products p on p.sku = stock.sku
join warehouses w on w.code = stock.warehouse_code
on conflict (product_id, warehouse_id) do nothing;

-- The Express API uses the service-role key and enforces operation validation.
-- For multi-user production deployments, replace it with authenticated RLS-backed access.
