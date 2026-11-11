DO $seed$
DECLARE stock_table regclass; count_rows bigint;
BEGIN
  SELECT (format('%I.%I',c.table_schema,c.table_name))::regclass INTO STRICT stock_table
  FROM information_schema.columns c JOIN information_schema.tables t
  USING (table_schema,table_name)
  WHERE c.table_schema='public' AND t.table_type='BASE TABLE'
  AND c.column_name IN ('product_id','available') GROUP BY c.table_schema,c.table_name
  HAVING count(*)=2;
  EXECUTE format('INSERT INTO %s (product_id,available)
    SELECT (''beef0003-0000-4000-8000-'' || lpad(n::text,12,''0''))::uuid,100+n%%50
    FROM generate_series(1,10000) n ON CONFLICT (product_id) DO NOTHING',stock_table);
  EXECUTE format('SELECT count(*) FROM %s s JOIN generate_series(1,10000) n
    ON s.product_id=(''beef0003-0000-4000-8000-'' || lpad(n::text,12,''0''))::uuid',stock_table) INTO count_rows;
  RAISE NOTICE 'seeded_stock_rows = % in %', count_rows,stock_table;
END $seed$;
