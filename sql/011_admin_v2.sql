-- 011: ადმინის მე-2 ვერსია (17.11.2026)
-- თანამშრომლები: თანამდებობა, ბოლო შესვლა, „ყველგან გამოსვლა“; ცვლილებების ჟურნალი; მარაგის მოძრაობა (პარტიები, კორექცია);
-- უფლებების ახალი, დეტალური სია. მეორედ გაშვება უსაფრთხოა.

alter table users add column if not exists title text not null default '';
alter table users add column if not exists last_login timestamptz;
alter table users add column if not exists session_ver integer not null default 0;

-- ვინ, როდის, რა შეცვალა
create table if not exists audit (
  id        serial primary key,
  at        timestamptz not null default now(),
  user_id   integer,
  user_name text not null default '',
  action    text not null,
  detail    text not null default '',
  order_id  integer
);
create index if not exists audit_order_idx on audit (order_id);

-- მარაგის მოძრაობა: მიღებული პარტია (+), კორექცია (+/-: დაზიანდა, დაიკარგა, დათვლა)
create table if not exists stock_moves (
  id         serial primary key,
  at         timestamptz not null default now(),
  product_id text not null,
  qty        integer not null,
  kind       text not null,
  note       text not null default '',
  user_id    integer
);

alter table audit       enable row level security;
alter table stock_moves enable row level security;

-- ძველი უფლებები → ახალი: „საიტის რედაქტირება“ ოთხად იყოფა, „კურიერის დანიშვნა და გაუქმება“ ორად,
-- „მარაგის შეცვლა“ მოიცავს პარტიის მიღებასაც და ფინანსების ნახვასაც (როგორც აქამდე ხედავდა)
update users set perms = replace(perms, 'site_edit', 'site_texts,site_products,site_prices,site_contact') where (',' || perms || ',') like '%,site_edit,%';
update users set perms = perms || ',orders_cancel' where (',' || perms || ',') like '%,orders_assign,%' and (',' || perms || ',') not like '%,orders_cancel,%';
update users set perms = perms || ',stock_receive,finance_view' where (',' || perms || ',') like '%,stock_edit,%' and (',' || perms || ',') not like '%,stock_receive,%';
