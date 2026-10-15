-- 007: ტექსტის წვრილი შესწორებები. მეორედ გაშვება არაფერს ცვლის.
-- ნაბიჯი 3-ის ტექსტში "ღირს" ორჯერ მეორდებოდა
update settings set value = jsonb_set(value, '{T,ka,s3}', '"თბილისში მოგიტანთ შეკვეთის მეორე დღეს, მიწოდება 7 ₾. რეგიონებში მიწოდება 15 ₾."')
where key = 'shop' and value->'T'->'ka'->>'s3' = 'თბილისში მოგიტანთ შეკვეთის მეორე დღეს, მიწოდება 7 ₾ ღირს. რეგიონებში მიწოდება 15 ₾ ღირს.';
-- ინგლისური მრგვალი ბეჭდის ბოლოს ზედმეტი ხარვეზი
update settings set value = jsonb_set(value, '{T,en,seal}', '"Wooden toys · Moku · Wooden toys · Moku ·"')
where key = 'shop' and value->'T'->'en'->>'seal' = 'Wooden toys · Moku · Wooden toys · Moku · ';
