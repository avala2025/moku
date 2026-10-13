-- 003: სათამაშოების სახელები ფასების სიიდან (ხელსაწყოების ყუთი, მუსიკალური მაგიდა...) და ინგლისური შესატყვისები.
-- სახელი იცვლება მხოლოდ მაშინ, თუ ჯერ კიდევ ძველია. პანელიდან უკვე შეცვლილ სახელს არ ეხება,
-- ამიტომ მეორედ გაშვება არაფერს აფუჭებს.

update settings s
set value = jsonb_set(s.value, '{products}', (
    select jsonb_agg(
      case p->>'id'
      when 'toolbox' then jsonb_set(jsonb_set(p,
        '{ka,0}', case when p#>>'{ka,0}' = 'ოსტატის ყუთი' then to_jsonb('ხელსაწყოების ყუთი'::text) else coalesce(p#>'{ka,0}', '""'::jsonb) end),
        '{en,0}', case when p#>>'{en,0}' = 'Maker''s Toolbox' then to_jsonb('Wooden Tool Box'::text) else coalesce(p#>'{en,0}', '""'::jsonb) end)
      when 'music' then jsonb_set(jsonb_set(p,
        '{ka,0}', case when p#>>'{ka,0}' = 'პატარა ორკესტრი' then to_jsonb('მუსიკალური მაგიდა'::text) else coalesce(p#>'{ka,0}', '""'::jsonb) end),
        '{en,0}', case when p#>>'{en,0}' = 'Little Orchestra' then to_jsonb('Music Table'::text) else coalesce(p#>'{en,0}', '""'::jsonb) end)
      when 'train' then jsonb_set(jsonb_set(p,
        '{ka,0}', case when p#>>'{ka,0}' = 'მთის რკინიგზა' then to_jsonb('რკინიგზა'::text) else coalesce(p#>'{ka,0}', '""'::jsonb) end),
        '{en,0}', case when p#>>'{en,0}' = 'Mountain Railway' then to_jsonb('Wooden Railway'::text) else coalesce(p#>'{en,0}', '""'::jsonb) end)
      when 'walker' then jsonb_set(jsonb_set(p,
        '{ka,0}', case when p#>>'{ka,0}' = 'პატარა შეფის ურიკა' then to_jsonb('სამზარეულო-ურიკა'::text) else coalesce(p#>'{ka,0}', '""'::jsonb) end),
        '{en,0}', case when p#>>'{en,0}' = 'Little Chef Walker' then to_jsonb('Kitchen Walker'::text) else coalesce(p#>'{en,0}', '""'::jsonb) end)
      when 'switch' then jsonb_set(jsonb_set(p,
        '{ka,0}', case when p#>>'{ka,0}' = 'ჩამრთველების დაფა' then to_jsonb('ჩამრთველების დაფა'::text) else coalesce(p#>'{ka,0}', '""'::jsonb) end),
        '{en,0}', case when p#>>'{en,0}' = 'Switch Board' then to_jsonb('Switch Board'::text) else coalesce(p#>'{en,0}', '""'::jsonb) end)
      when 'vanity' then jsonb_set(jsonb_set(p,
        '{ka,0}', case when p#>>'{ka,0}' = 'სარკის მაგიდა' then to_jsonb('სატუალეტო მაგიდა'::text) else coalesce(p#>'{ka,0}', '""'::jsonb) end),
        '{en,0}', case when p#>>'{en,0}' = 'Vanity Table' then to_jsonb('Vanity Table'::text) else coalesce(p#>'{en,0}', '""'::jsonb) end)
      when 'vet' then jsonb_set(jsonb_set(p,
        '{ka,0}', case when p#>>'{ka,0}' = 'პატარა ვეტერინარი' then to_jsonb('ვეტერინარის ნაკრები'::text) else coalesce(p#>'{ka,0}', '""'::jsonb) end),
        '{en,0}', case when p#>>'{en,0}' = 'Little Vet' then to_jsonb('Vet Set'::text) else coalesce(p#>'{en,0}', '""'::jsonb) end)
      when 'table' then jsonb_set(jsonb_set(p,
        '{ka,0}', case when p#>>'{ka,0}' = 'აღმოჩენების მაგიდა' then to_jsonb('აქტივობების მაგიდა'::text) else coalesce(p#>'{ka,0}', '""'::jsonb) end),
        '{en,0}', case when p#>>'{en,0}' = 'Discovery Table' then to_jsonb('Activity Table'::text) else coalesce(p#>'{en,0}', '""'::jsonb) end)
      when 'tap' then jsonb_set(jsonb_set(p,
        '{ka,0}', case when p#>>'{ka,0}' = 'ჩაქუჩი და ქსილოფონი' then to_jsonb('ჩაქუჩი/თევზაობის თამაში'::text) else coalesce(p#>'{ka,0}', '""'::jsonb) end),
        '{en,0}', case when p#>>'{en,0}' = 'Tap & Tune' then to_jsonb('Hammer & Fishing Game'::text) else coalesce(p#>'{en,0}', '""'::jsonb) end)
      when 'driver' then jsonb_set(jsonb_set(p,
        '{ka,0}', case when p#>>'{ka,0}' = 'პატარა მძღოლი' then to_jsonb('საჭის დაფა'::text) else coalesce(p#>'{ka,0}', '""'::jsonb) end),
        '{en,0}', case when p#>>'{en,0}' = 'Little Driver' then to_jsonb('Steering Wheel Board'::text) else coalesce(p#>'{en,0}', '""'::jsonb) end)
      else p end
      order by ord)
    from jsonb_array_elements(s.value->'products') with ordinality as t(p, ord)
  )),
  updated_at = now()
where s.key = 'shop' and jsonb_array_length(s.value->'products') > 0;

-- ოთახის სექციის ტექსტში ურიკის სახელი
update settings
set value = jsonb_set(value, '{T,ka,roomText}', to_jsonb(replace(value#>>'{T,ka,roomText}', 'პატარა შეფის ურიკა', 'სამზარეულო-ურიკა')))
where key = 'shop' and value#>>'{T,ka,roomText}' like '%პატარა შეფის ურიკა%';

update settings
set value = jsonb_set(value, '{T,en,roomText}', to_jsonb(replace(value#>>'{T,en,roomText}', 'The Little Chef Walker', 'The Kitchen Walker')))
where key = 'shop' and value#>>'{T,en,roomText}' like '%The Little Chef Walker%';
