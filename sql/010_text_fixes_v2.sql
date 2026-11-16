-- 010: ტექსტების შესწორება (16.11.2026): მიწოდების ხაზი, Google-ის აღწერა, ნაბიჯები.
-- იცვლება მხოლოდ ის ტექსტი, რომელიც ჯერ ძველია (პანელიდან უკვე შეცვლილს არ ეხება). მეორედ გაშვება უსაფრთხოა.

update settings set value = jsonb_set(value, '{T,ka,deliveryV}', '"თბილისში მეორე დღეს, 7 ₾ · რეგიონებში 15 ₾"'::jsonb), updated_at = now()
where key = 'shop' and value#>>'{T,ka,deliveryV}' = 'თბილისში მეორე დღეს · 7 ₾. რეგიონებში · 15 ₾';
update settings set value = jsonb_set(value, '{T,ka,seoDesc}', '"ხის სათამაშოები ბავშვებისთვის: აწყობა, მუსიკალური სათამაშოები, როლური თამაში, ბიზიბორდები და მაგიდები. მიწოდება თბილისში მეორე დღეს."'::jsonb), updated_at = now()
where key = 'shop' and value#>>'{T,ka,seoDesc}' = 'ხის სათამაშოები ბავშვებისთვის: აწყობა, მუსიკა, როლური თამაში, დაფები და მაგიდები. მიწოდება თბილისში მეორე დღეს.';
update settings set value = jsonb_set(value, '{T,ka,heroAlt}', '"ბავშვი თამაშობს ხის საჭის ბიზიბორდზე"'::jsonb), updated_at = now()
where key = 'shop' and value#>>'{T,ka,heroAlt}' = 'ბავშვი თამაშობს ხის საჭიან დაფაზე';
update settings set value = jsonb_set(value, '{T,ka,s2}', '"გამოგვიგზავნე ტექსტი. გიპასუხებთ და დაგიდასტურებთ, რომ სათამაშო მარაგშია."'::jsonb), updated_at = now()
where key = 'shop' and value#>>'{T,ka,s2}' = 'გამოგვიგზავნე ტექსტი. გიპასუხებთ ფასით და მარაგის შესახებ.';
update settings set value = jsonb_set(value, '{T,en,deliveryV}', '"Next day in Tbilisi, 7 ₾ · Regions, 15 ₾"'::jsonb), updated_at = now()
where key = 'shop' and value#>>'{T,en,deliveryV}' = 'Next day in Tbilisi · 7 ₾. Regions · 15 ₾';
update settings set value = jsonb_set(value, '{T,en,seoDesc}', '"Wooden toys for children: building sets, music toys, pretend play, busy boards and tables. Next-day delivery in Tbilisi."'::jsonb), updated_at = now()
where key = 'shop' and value#>>'{T,en,seoDesc}' = 'Wooden toys for children: building, music, pretend play, boards and tables. Next-day delivery in Tbilisi.';
update settings set value = jsonb_set(value, '{T,en,heroAlt}', '"A child playing with a wooden steering wheel busy board"'::jsonb), updated_at = now()
where key = 'shop' and value#>>'{T,en,heroAlt}' = 'A child playing with a wooden steering board';
update settings set value = jsonb_set(value, '{T,en,s1}', '"Open a toy''s page and copy the order text."'::jsonb), updated_at = now()
where key = 'shop' and value#>>'{T,en,s1}' = 'Open a toy and copy the order text.';
update settings set value = jsonb_set(value, '{T,en,s2}', '"Send us the text. We''ll reply and confirm the toy is in stock."'::jsonb), updated_at = now()
where key = 'shop' and value#>>'{T,en,s2}' = 'Send us the text. We reply with the price and availability.';
update settings set value = jsonb_set(value, '{T,en,s3}', '"We deliver in Tbilisi the day after you order, for 7 ₾. Delivery to the regions is 15 ₾."'::jsonb), updated_at = now()
where key = 'shop' and value#>>'{T,en,s3}' = 'We deliver in Tbilisi the day after you order for 7 ₾. Delivery to the regions costs 15 ₾.';
