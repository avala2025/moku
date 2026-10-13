-- 002: თანამშრომლები, მარაგი, შეკვეთები, შეკვეთის სათამაშოები, წერილების ჟურნალი
-- მეორედ გაშვება უსაფრთხოა: არაფერს შლის და არაფერს აორმაგებს.

create table if not exists users (
  id      serial primary key,
  name    text not null,
  email   text not null unique,
  pass    text not null,
  role    text not null check (role in ('admin', 'sales', 'courier')),
  active  boolean not null default true,
  created timestamptz not null default now()
);

-- რამდენი ცალი მივიღეთ თითო სათამაშოზე (product_id = სათამაშოს კოდი საიტზე, მაგ. toolbox)
create table if not exists stock (
  product_id text primary key,
  stock_in   integer not null default 0 check (stock_in >= 0)
);

create table if not exists orders (
  id            serial primary key,
  created       timestamptz not null default now(),
  created_by    integer not null references users(id),
  customer      text not null,
  phone         text not null,
  email         text not null default '',
  address       text not null default '',
  zone          text not null default 'tbilisi',
  fee           integer not null default 0,
  note          text not null default '',
  delivery_date text not null,
  courier_id    integer references users(id),
  status        text not null default 'new'
                check (status in ('new', 'assigned', 'picked', 'problem', 'delivered', 'returned', 'cancelled')),
  picked_at     timestamptz,
  done_at       timestamptz,
  courier_note  text not null default ''
);
create index if not exists orders_courier_idx on orders (courier_id, status);
create index if not exists orders_created_by_idx on orders (created_by);

create table if not exists order_items (
  id         serial primary key,
  order_id   integer not null references orders(id) on delete cascade,
  product_id text not null,
  name       text not null,
  qty        integer not null check (qty > 0),
  price      integer not null check (price >= 0)
);
create index if not exists order_items_order_idx on order_items (order_id);

create table if not exists emails (
  id       serial primary key,
  order_id integer,
  kind     text not null,
  to_addr  text not null default '',
  subject  text not null,
  status   text not null,
  error    text not null default '',
  created  timestamptz not null default now()
);

-- Supabase-ის საჯარო API-დან ყველა ცხრილი დაკეტილია; საიტი ბაზას პირდაპირ უკავშირდება და ამას არ ეხება
alter table users       enable row level security;
alter table stock       enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;
alter table emails      enable row level security;
