\set ON_ERROR_STOP on
EXPLAIN (ANALYZE, BUFFERS)
SELECT id,status,total_price,created_at FROM orders
WHERE user_id = md5('req3-buyer-17')::uuid
ORDER BY created_at DESC LIMIT 20;
