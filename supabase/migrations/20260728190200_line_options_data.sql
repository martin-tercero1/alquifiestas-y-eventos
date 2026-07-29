-- Restore the option lists the importer collapsed, recovered from the cached
-- Odoo shop pages (see docs/data/recovered-variant-options.csv). Keyed by odoo_id, the
-- stable business id, so this is safe to re-run and never touches generated uuids.
update products set option_name = 'Color', option_values = array[
  'Celeste','Plateado','Rosado','Verde Oscuro','Lila','Morado','Azul','Fuscia',
  'Azul Satinado','Amarillo','Rojo','Rojo Vino','Aqua','Negro','Naranja','Blanco',
  'Verde Claro','Dorado','Navideño'
] where odoo_id = 7;   -- Mantel Cuadrado

update products set option_name = 'Patrón/Color', option_values = array[
  'Blanco Liso','Negro Liso','Crema Brocado','Blanco Brocado','Rosa Vieja','Azul','Verde','Rojo'
] where odoo_id = 35;  -- Mantel Redondo 10 personas

update products set option_name = 'Estilo', option_values = array['1','2','3']
  where odoo_id = 52;  -- Pinza de Ensalada

update products set option_name = 'Estilo', option_values = array['1','2','3','4','5']
  where odoo_id = 54;  -- Cucharas para Servir

update products set option_name = 'Forma', option_values = array['Cilindro','Cuadrado']
  where odoo_id = 63;  -- Floreros

update products set option_name = 'Forma', option_values = array['Redonda','Cuadrado']
  where odoo_id = 77;  -- Bandeja Antideslizante

-- Mantel Redondo's single variant kept one colour ('Blanco Liso') as its label.
-- Under the option-on-the-line model the colour is a line choice, not part of
-- the item's identity, so clear the label to the plain product.
update variants v set label = null
  from products p
 where v.product_id = p.id and p.odoo_id = 35 and v.label = 'Blanco Liso';
