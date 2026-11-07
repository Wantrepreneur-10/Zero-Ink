-- Sample menu for a demo restaurant account. Replace the email, and the prices with real ones.
insert into menu_items (merchant_id, name, price, category)
select u.id, m.name, m.price, m.cat
from auth.users u,
(values ('Masala Dosa',12,'Dosa'),('Plain Dosa',10,'Dosa'),('Mysore Masala Dosa',13,'Dosa'),
        ('Idli',7,'Tiffin'),('Medu Vada',7,'Tiffin'),('Samosa',6,'Starters'),
        ('Butter Naan',4,'Breads'),('Garlic Naan',4.5,'Breads'),
        ('Chicken Biryani',16,'Biryani'),('Mutton Biryani',18,'Biryani'),
        ('Paneer Butter Masala',15,'Curries'),('Chicken Tikka Masala',16,'Curries'),
        ('Mango Lassi',5,'Drinks'),('Masala Chai',3,'Drinks'),('Filter Coffee',3.5,'Drinks'),
        ('Gulab Jamun',5,'Desserts')) as m(name, price, cat)
where u.email = 'restaurant@test.com'
  and not exists (select 1 from menu_items mi where mi.merchant_id = u.id);
