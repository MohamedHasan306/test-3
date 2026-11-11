BEGIN;
CREATE TEMP TABLE perf_catalog ON COMMIT DROP AS
SELECT n, ('beef0003-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid AS id,
       (10 + n % 500)::numeric AS price FROM generate_series(1,10000) AS n;
INSERT INTO products(id,name,category,price)
SELECT id, 'Perf product ' || n,'perf-' || (n % 20),price FROM perf_catalog
ON CONFLICT (id) DO NOTHING;
INSERT INTO users(id,name,email,password_hash)
SELECT md5('req3-buyer-' || n)::uuid,'Benchmark ' || n,
       'req3-buyer-' || n || '@example.invalid','!' FROM generate_series(0,499) AS n
ON CONFLICT (id) DO NOTHING;
INSERT INTO orders(id,user_id,status,total_price,created_at)
SELECT md5('req3-order-' || s)::uuid,md5('req3-buyer-' || (s % 500))::uuid,
       'delivered',p.price,timestamp '2026-01-01' + s * interval '1 minute'
FROM generate_series(1,200000) s JOIN perf_catalog p ON p.n=1+(s-1)%10000
ON CONFLICT (id) DO NOTHING;
INSERT INTO order_items(id,order_id,product_id,quantity,unit_price)
SELECT md5('req3-line-' || s)::uuid,md5('req3-order-' || s)::uuid,p.id,1,p.price
FROM generate_series(1,200000) s JOIN perf_catalog p ON p.n=1+(s-1)%10000
ON CONFLICT (id) DO NOTHING;
COMMIT;
ANALYZE products;
ANALYZE orders;
ANALYZE order_items;
SELECT count(*) AS seeded_products FROM products p JOIN generate_series(1,10000) n
ON p.id=('beef0003-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
SELECT count(*) AS seeded_orders FROM orders o JOIN generate_series(1,200000) n
ON o.id=md5('req3-order-' || n)::uuid;
