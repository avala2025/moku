-- 001: საიტის პარამეტრების ცხრილი (ტექსტები, ფასდაკლება, კონტაქტები და ა.შ. მომავალში აქ ინახება)
-- მეორედ გაშვება უსაფრთხოა: არაფერს შლის და არაფერს აორმაგებს.

create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Supabase-ის საჯარო API-დან ცხრილი დაკეტილია; საიტი ბაზას პირდაპირ უკავშირდება და ამას არ ეხება
alter table settings enable row level security;

insert into settings (key, value)
values ('site_name', '"MOKU"')
on conflict (key) do nothing;
