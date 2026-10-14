-- 006: ჩამრთველების დაფა (switch) იცვლება მაგნიტოფონის დაფით (radio), იმავე ადგილზე. ფასი 90 ₾ (ფასდაკლებამდე).
-- მეორედ გაშვება არაფერს ცვლის: მუშაობს მხოლოდ მაშინ, თუ switch ჯერ კიდევ არის და radio ჯერ არ არის.
update settings s
set value = jsonb_set(s.value, '{products}', (
      select jsonb_agg(
               case when e.elem->>'id' = 'switch' then
                 '{"id":"radio","cat":"boards","tint":"--birch","imgs":[["radio",0],["radio-2",0]],
                   "ka":["მაგნიტოფონის დაფა","ძველი მაგნიტოფონის მსგავსი ხის დაფა: ჩამრთველები, ღილაკები, სახელურები, ნათურები, ხმის ჩამწერი, 5 სიმღერა გადასართავად, მძივების ლაბირინთი და დახატული პიანინოს კლავიშები. აქვს ტარების სახელური.","ხე; ნათურები და ღილაკები",""],
                   "en":["Tape Recorder Busy Board","A wooden board styled like an old tape recorder: switches, buttons, knobs, lights, a voice recorder, 5 songs to switch between, a bead maze and printed piano keys. Has a carrying handle.","Wood; lights and buttons",""],
                   "old":90,"hidden":false}'::jsonb
               else e.elem end
               order by e.ord)
      from jsonb_array_elements(s.value->'products') with ordinality as e(elem, ord)
    )),
    updated_at = now()
where s.key = 'shop'
  and exists (select 1 from jsonb_array_elements(s.value->'products') x where x->>'id' = 'switch')
  and not exists (select 1 from jsonb_array_elements(s.value->'products') x where x->>'id' = 'radio');

-- ოთახის ფოტოდ თუ switch იყო არჩეული, გადავიდეს radio-ზე
update settings set value = jsonb_set(value, '{room}', '"radio"')
where key = 'shop' and value->>'room' = 'switch';
