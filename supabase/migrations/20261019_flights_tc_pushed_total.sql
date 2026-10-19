alter table flights add column if not exists tc_pushed_total integer;
comment on column flights.tc_pushed_total is 'Total del cupo la última vez que se cargó en TC. En una edición, a TC se le suma sólo la diferencia de total; las ventas las descuenta TC sola (2026-10-19).';
update flights f set tc_pushed_total = mi.quantity from modalities m join modality_inventories mi on mi.modality_id = m.id where m.flight_id = f.id and f.tc_transport_id is not null and f.tc_pushed_total is null;
select count(*) from flights where tc_pushed_total is not null;
