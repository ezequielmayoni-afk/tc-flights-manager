-- Landings personalizadas de TC (/es/landing/{id}/{slug}) en los sitemaps de HUB (archivo "landings").
alter table seo_sitemap_entries drop constraint if exists seo_sitemap_entries_kind_check;
alter table seo_sitemap_entries add constraint seo_sitemap_entries_kind_check check (kind = any (array['hotel'::text,'package'::text,'theme'::text,'landing'::text]));
