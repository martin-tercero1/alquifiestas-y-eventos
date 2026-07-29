-- With an empty search box the panel lists the catalog as a starting point,
-- ordered by `category_display_order`. That is the display order of the
-- product's OWN category — which for a product filed under a subcategory is
-- the subcategory's order, not the business's. The first thing she saw was
-- Copas, when the business lives on Sillas and Mesas.
--
-- Ordering has to follow the TOP-LEVEL category, which is what the display
-- order was actually assigned against.
--
-- The new column is appended rather than slotted in beside its siblings:
-- `create or replace view` can add columns at the end but cannot reorder them,
-- and dropping the view would take the function that reads it along with it.

create or replace view staff_catalog as
select
  v.id                 as variant_id,
  p.id                 as product_id,
  p.slug               as product_slug,
  p.name               as product_name,
  v.label              as variant_label,
  v.price_per_day,
  v.price_source,
  v.total_quantity,
  v.quantity_source,
  v.published,
  c.id                 as category_id,
  c.name               as category_name,
  c.display_order      as category_display_order,
  coalesce(parent.name, c.name) as top_category_name,
  sq.storage_path      as photo_square,
  p.internal_note,
  coalesce(parent.display_order, c.display_order) as top_category_display_order
from variants v
join products p     on p.id = v.product_id
join categories c   on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
left join product_photos sq on sq.product_id = p.id and sq.crop = 'square';

revoke all on staff_catalog from anon, authenticated;
grant select on staff_catalog to authenticated;

create or replace function search_variants(q text default '', limit_n int default 30)
returns table (
  variant_id     uuid,
  product_id     uuid,
  product_name   text,
  variant_label  text,
  category_name  text,
  price_per_day  numeric,
  price_source   text,
  total_quantity int,
  published      boolean,
  photo_square   text,
  score          real
)
language sql stable
set search_path = public, extensions
as $$
  with needle as (
    select search_normalize(coalesce(q, '')) as n
  ),
  terms as (
    select array_remove(string_to_array((select n from needle), ' '), '') as parts
  ),
  candidates as (
    select
      sc.*,
      search_normalize(sc.product_name || ' ' || coalesce(sc.variant_label, '')) as hay_name,
      search_normalize(sc.category_name) as hay_cat
    from staff_catalog sc
  ),
  scored as (
    select
      c.*,
      (select bool_and(c.hay_name like '%' || part || '%')
         from unnest((select parts from terms)) part) as tokens_in_name,
      (select bool_and((c.hay_name || ' ' || c.hay_cat) like '%' || part || '%')
         from unnest((select parts from terms)) part) as tokens_anywhere,
      greatest(
        extensions.similarity((select n from needle), c.hay_name),
        extensions.word_similarity((select n from needle), c.hay_name)
      ) as name_sim,
      extensions.word_similarity((select n from needle), c.hay_cat) as cat_sim
    from candidates c
  )
  select
    s.variant_id, s.product_id, s.product_name, s.variant_label, s.category_name,
    s.price_per_day, s.price_source, s.total_quantity, s.published, s.photo_square,
    (
      case when s.tokens_in_name then 1.0 else 0 end
      + s.name_sim
      + case when s.tokens_anywhere and not s.tokens_in_name then 0.25 else 0 end
      + s.cat_sim * 0.15
    )::real as score
  from scored s
  where
    (select n from needle) = ''
    or s.tokens_anywhere
    or s.name_sim >= 0.5
    or s.cat_sim >= 0.6
  order by
    case when (select n from needle) = '' then 0 else 1 end,
    -- Blank box: business priority — Sillas, Mesas, Mantelería first.
    case when (select n from needle) = '' then s.top_category_display_order else 0 end,
    case when (select n from needle) = '' then s.category_display_order else 0 end,
    score desc,
    s.product_name,
    s.variant_label nulls first
  limit greatest(1, least(limit_n, 100));
$$;

grant execute on function search_variants(text, int) to authenticated;
