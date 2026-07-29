-- Ranking, not just matching.
--
-- The first cut matched the right rows and ordered them uselessly: searching
-- "manteleria" put *Bambalina* above *Mantel Cuadrado*, because both live in
-- the Mantelería category and a category hit scored the same as a name hit.
-- Searching "mesa 10" never surfaced "Mesas Redonda para 10 personas" at all,
-- because containing both typed words earned nothing over a fuzzy near-miss.
--
-- So the score is layered, strongest signal first:
--
--   +1.00  every word she typed appears in the product name
--   +sim   how close the typed text is to the product name (catches typos)
--   +0.25  every word appears once the category is included too
--   +0.15  the category itself matches
--
-- What she typed is almost always the name of a thing. The category is how
-- she finds a thing she cannot name.

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
    -- A typo still has to look like the name. Below this, "cubiculos" starts
    -- returning "Cuchara para Postre" and she stops trusting the box.
    or s.name_sim >= 0.5
    or s.cat_sim >= 0.6
  order by
    case when (select n from needle) = '' then 0 else 1 end,
    case when (select n from needle) = '' then s.category_display_order else 0 end,
    score desc,
    s.product_name,
    s.variant_label nulls first
  limit greatest(1, least(limit_n, 100));
$$;

grant execute on function search_variants(text, int) to authenticated;
