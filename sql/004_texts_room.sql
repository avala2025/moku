-- 004: მთავარი ტექსტი („ხე, რომელსაც ხელში თბილად იგრძნობ“), ოთახის სექციის სათამაშო პანელიდან ({name}),
-- საჭის დაფის მთავარი ფოტო თეთრ ფონზე, ფონის ფერები. იცვლება მხოლოდ ის, რაც ჯერ კიდევ საწყისია; მეორედ გაშვება უსაფრთხოა.

update settings set value = jsonb_set(value, '{T,ka,heroText}', to_jsonb('მოკუ აგროვებს ხის სათამაშოებს, რომლებსაც ბავშვი ხელით იკვლევს: ატრიალებს, აწყობს, აკაკუნებს. მშვიდი ფერები, ხე, რომელსაც ხელში თბილად იგრძნობ, და არცერთი ეკრანი.'::text))
where key = 'shop' and value#>>'{T,ka,heroText}' like '%ბუნებრივი მასალა, ეკრანის გარეშე%';

update settings set value = jsonb_set(value, '{T,en,heroText}', to_jsonb('Moku gathers wooden toys a child explores by hand: turning, building, tapping. Calm colours, wood that feels warm in the hand, and no screens.'::text))
where key = 'shop' and value#>>'{T,en,heroText}' like '%natural material, no screens%';

update settings set value = jsonb_set(value, '{T,ka,roomText}', to_jsonb(replace(value#>>'{T,ka,roomText}', 'სამზარეულო-ურიკა ჯერ', '{name} ჯერ')))
where key = 'shop' and value#>>'{T,ka,roomText}' like 'სამზარეულო-ურიკა ჯერ%';

update settings set value = jsonb_set(value, '{T,en,roomText}', to_jsonb(replace(value#>>'{T,en,roomText}', 'The Kitchen Walker first', '{name} first')))
where key = 'shop' and value#>>'{T,en,roomText}' like 'The Kitchen Walker first%';

update settings set value = jsonb_set(value, '{room}', '"walker"'::jsonb)
where key = 'shop' and value->'room' is null;

-- საჭის დაფა: პირველი ფოტო თეთრ ფონზე, როგორც სხვა სათამაშოებს
update settings s
set value = jsonb_set(s.value, '{products}', (
  select jsonb_agg(
    case when p->>'id' = 'driver' and p->'imgs' = '[["driver",0],["driver-2",1],["driver-3",0],["driver-4",0]]'::jsonb
         then jsonb_set(p, '{imgs}', '[["driver-2",1],["driver",0],["driver-3",0],["driver-4",0]]'::jsonb)
         when p->>'id' in ('switch','train') and p->>'tint' in ('--mist','--sage')
         then jsonb_set(p, '{tint}', '"--birch"'::jsonb)
         else p end
    order by ord)
  from jsonb_array_elements(s.value->'products') with ordinality as t(p, ord)
)), updated_at = now()
where s.key = 'shop' and jsonb_array_length(s.value->'products') > 0;
