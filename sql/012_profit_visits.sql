-- 012: მოგება-ზარალი და საიტის სტატისტიკა (17.11.2026). მხოლოდ ადმინისთვის.
-- მეორედ გაშვება უსაფრთხოა: არაფერს შლის და არაფერს აორმაგებს.

-- თვითღირებულება თითო სათამაშოზე (ერთი ცალის): შესყიდვა + ტრანსპორტი/განბაჟება + შეფუთვა
create table if not exists costs (
  product_id text primary key,
  buy        numeric(12,2) not null default 0,
  ship       numeric(12,2) not null default 0,
  pack       numeric(12,2) not null default 0,
  updated    timestamptz
);

-- გაყიდვის მომენტის თვითღირებულება (რომ ფასის შეცვლამ ძველი თვეები არ შეცვალოს)
alter table order_items add column if not exists cost numeric(12,2);

-- ხელფასის პირობები, ისტორიით: თვიური ფიქსირებული + თითო ჩაბარებულზე + % საკუთარი გაყიდვებიდან.
-- user_id ცარიელია, თუ თანამშრომელი სისტემაში არ შედის (მაშინ name).
create table if not exists pay (
  id           serial primary key,
  user_id      integer,
  name         text not null default '',
  fixed        numeric(12,2) not null default 0,
  per_delivery numeric(12,2) not null default 0,
  commission   numeric(6,2) not null default 0,
  from_month   text not null,
  to_month     text not null default '',
  created      timestamptz not null default now()
);

-- ხარჯები: ერთჯერადი (day = თარიღი) ან ყოველთვიური (day = საწყისი თვე, to_month = ბოლო თვე)
create table if not exists expenses (
  id        serial primary key,
  kind      text not null default 'once',
  day       text not null,
  to_month  text not null default '',
  category  text not null,
  amount    numeric(12,2) not null,
  note      text not null default '',
  user_id   integer,
  created   timestamptz not null default now()
);

-- საიტის ვიზიტები: უსახელოდ (არც IP, არც cookie). sid = ერთი ვიზიტის შემთხვევითი კოდი.
create table if not exists hits (
  id     serial primary key,
  at     timestamptz not null default now(),
  day    text not null,
  hr     integer not null default 0,
  sid    text not null,
  kind   text not null,
  path   text not null default '',
  pid    text not null default '',
  label  text not null default '',
  lang   text not null default '',
  dev    text not null default '',
  os     text not null default '',
  src    text not null default '',
  camp   text not null default '',
  ret    integer not null default 0,
  secs   integer not null default 0,
  depth  integer not null default 0
);
create index if not exists hits_day_idx on hits (day);

alter table costs    enable row level security;
alter table pay      enable row level security;
alter table expenses enable row level security;
alter table hits     enable row level security;
