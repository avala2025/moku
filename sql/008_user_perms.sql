-- 008: თანამშრომლების უფლებები. თითოეულ თანამშრომელს აქვს უფლებების სია (მძიმით გამოყოფილი კოდები).
-- მეორედ გაშვება უსაფრთხოა: სვეტს მხოლოდ მაშინ ამატებს, თუ არ არის; უფლებებს მხოლოდ ცარიელ სიაზე წერს.
alter table users add column if not exists perms text not null default '';

-- არსებულ თანამშრომლებს თავისი როლის მზა ნაკრები ენიჭება (ადმინს ყველაფერი აქვს როლითვე, სია არ სჭირდება)
update users set perms = 'order_create,orders_all,stock_view' where role = 'sales' and perms = '';
update users set perms = 'courier' where role = 'courier' and perms = '';
