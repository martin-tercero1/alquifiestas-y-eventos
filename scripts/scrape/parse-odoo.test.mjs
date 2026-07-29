/**
 * Tests for the Odoo page parsing.
 *
 *   npm run scrape:test
 *
 * The decimal separator is the reason this file exists. Reading `1.500,00` as
 * 1.5 would corrupt every four-digit price in a way no downstream check would
 * catch, so it is asserted explicitly and from both directions.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseLocalizedNumber,
  parsePriceText,
  extractMicrodata,
  extractRenderedPrice,
  extractPricingTable,
  extractTemplateId,
  extractAttributes,
  extractDescription,
  combinations,
  foldKey,
  stripHtml,
} from "./parse-odoo.mjs";

// ---------------------------------------------------------------------------
// The decimal separator
// ---------------------------------------------------------------------------

test("four-digit price: period is thousands, comma is decimals", () => {
  // The case the whole script turns on.
  assert.equal(parseLocalizedNumber("1.500,00").value, 1500);
  assert.notEqual(parseLocalizedNumber("1.500,00").value, 1.5);

  assert.equal(parsePriceText("1.500,00 C$ por 24 Horas").value, 1500);
  assert.equal(parsePriceText("1.500,00 C$ por 24 Horas").currency, "C$");
});

test("five-digit price keeps every thousands group", () => {
  assert.equal(parseLocalizedNumber("12.500,50").value, 12500.5);
  assert.equal(parseLocalizedNumber("1.234.567,89").value, 1234567.89);
});

test("two- and three-digit prices, the common case", () => {
  assert.equal(parseLocalizedNumber("73,00").value, 73);
  assert.equal(parseLocalizedNumber("200,00").value, 200);
  assert.equal(parseLocalizedNumber("30,00").value, 30);
  assert.equal(parseLocalizedNumber("7,50").value, 7.5);
});

test("machine format from the microdata, which uses a period", () => {
  assert.equal(parseLocalizedNumber("73.0").value, 73);
  assert.equal(parseLocalizedNumber("1500.0").value, 1500);
  assert.equal(parseLocalizedNumber("200").value, 200);
});

test("a lone period before three digits is a thousands group, not a decimal", () => {
  assert.equal(parseLocalizedNumber("1.500").value, 1500);
});

test("a lone comma before three digits is flagged rather than guessed", () => {
  const result = parseLocalizedNumber("1,500");
  assert.equal(result.ambiguous, true);
});

test("unparseable input returns null instead of NaN", () => {
  assert.equal(parseLocalizedNumber("").value, null);
  assert.equal(parseLocalizedNumber("Consultar").value, null);
  assert.equal(parseLocalizedNumber(null).value, null);
  assert.equal(parsePriceText("Precio a convenir").value, null);
});

test("non-breaking space between number and symbol", () => {
  assert.equal(parsePriceText("1.500,00 C$").value, 1500);
});

// ---------------------------------------------------------------------------
// Page extraction, against the real markup this shop emits
// ---------------------------------------------------------------------------

const PAGE = `
<div id="product_details" class="col-lg-6 mt-md-4">
  <h1 itemprop="name">Cilindros</h1>
  <form action="/shop/cart/update" method="POST">
    <div class="js_product js_main_product mb-3">
      <div itemprop="offers" itemscope="itemscope" class="product_price">
        <h3>
          <input type="hidden" name="is_rental" value="True"/>
          <span class="oe_price o_renting_price text-nowrap" data-oe-type="monetary"><span class="oe_currency_value">1.500,00</span> C$</span>
          <span itemprop="price" style="display:none;">1500.0</span>
          <span itemprop="priceCurrency" style="display:none;">NIO</span>
          <span>por</span>
          <span itemprop="rental_duration">24</span>
          <span itemprop="rental_unit">Horas</span>
        </h3>
      </div>
      <input type="hidden" class="product_id" name="product_id" value="208"/>
      <input type="hidden" class="product_template_id" name="product_template_id" value="95"/>
      <ul class="list-unstyled js_add_cart_variants mb-0 flex-column" data-attribute_exclusions="{}">
        <li data-attribute_id="7" data-attribute_name="Tama&#241;o" data-attribute_display_type="select" class="variant_attribute ">
          <strong class="attribute_name">Tama&#241;o</strong>
          <select data-attribute_id="7" class="form-select js_variant_change always " name="ptal-23">
            <option value="87" data-attribute-value-id="26" data-value_id="87" data-value_name="Pequeno(a)" selected="True"><span>Pequeno(a)</span></option>
            <option value="89" data-attribute-value-id="22" data-value_id="89" data-value_name="Grande"><span>Grande</span></option>
            <option value="88" data-attribute-value-id="23" data-value_id="88" data-value_name="Mediano"><span>Mediano</span></option>
          </select>
        </li>
      </ul>
    </div>
  </form>
  <table id="oe_wsale_rental_pricing_table" class="o_not_editable table ">
    <tbody>
      <tr><td class=" ps-0">24 Horas</td><td class=" pe-0 text-muted text-end">1.500,00 C$</td></tr>
    </tbody>
  </table>
  <div itemprop="description" class="oe_structure mt16" id="product_full_description"><p>Cilindros de metal para <b>decoraci&#243;n</b>.</p></div>
  <div class="oe_structure"></div>
</div>
`;

test("microdata is read in machine format", () => {
  const micro = extractMicrodata(PAGE);
  assert.equal(micro.price, 1500);
  assert.equal(micro.currency, "NIO");
  assert.equal(micro.duration, 24);
  assert.equal(micro.unit, "Horas");
});

test("rendered price agrees with the microdata, currency symbol included", () => {
  const rendered = extractRenderedPrice(PAGE);
  assert.equal(rendered.value, 1500);
  assert.equal(rendered.currency, "C$");
});

test("rental pricing table", () => {
  assert.deepEqual(extractPricingTable(PAGE), [["24 Horas", "1.500,00 C$"]]);
});

test("template id", () => {
  assert.equal(extractTemplateId(PAGE), 95);
});

test("variant selector, entities decoded and default marked", () => {
  const attributes = extractAttributes(PAGE);
  assert.equal(attributes.length, 1);
  assert.equal(attributes[0].name, "Tamaño");
  assert.deepEqual(
    attributes[0].options.map((o) => [o.ptav, o.label]),
    [[87, "Pequeno(a)"], [89, "Grande"], [88, "Mediano"]],
  );
  assert.equal(attributes[0].options.find((o) => o.selected).label, "Pequeno(a)");
});

test("a product with no variants yields no attributes", () => {
  assert.deepEqual(extractAttributes("<div>sin variantes</div>"), []);
});

test("description is plain text", () => {
  assert.equal(extractDescription(PAGE), "Cilindros de metal para decoración.");
});

test("an empty description container reads as empty, not as whitespace", () => {
  const empty = '<div itemprop="description" id="product_full_description"></div><div>';
  assert.equal(extractDescription(empty), "");
});

test("combinations across two attributes", () => {
  const attributes = [
    { name: "Tamaño", options: [{ ptav: 1, label: "Grande" }, { ptav: 2, label: "Mediano" }] },
    { name: "Color", options: [{ ptav: 8, label: "Blanco" }, { ptav: 9, label: "Rojo" }] },
  ];
  const combos = combinations(attributes);
  assert.equal(combos.length, 4);
  assert.deepEqual(combos[0].map((o) => o.ptav), [1, 8]);
  assert.deepEqual(combos[3].map((o) => o.ptav), [2, 9]);
});

test("a single attribute still produces one combination per option", () => {
  assert.equal(combinations([{ options: [{ ptav: 1 }, { ptav: 2 }, { ptav: 3 }] }]).length, 3);
});

test("fold matches the accent-stripped CSV against the live page", () => {
  // The export lost the accents the shop still has; the merge key has to
  // survive that or every accented product falls out of the run.
  assert.equal(foldKey("Cubículos de Hierro"), foldKey("Cubiculos de Hierro"));
  assert.equal(foldKey("Cilindros (Pequeño)"), foldKey("Cilindros (Pequeno)"));
  assert.equal(foldKey("Silla  Tiffany"), "silla tiffany");
  assert.notEqual(foldKey("Mesa Redonda"), foldKey("Mesa Cuadrada"));
});

test("stripHtml drops scripts rather than inlining their source", () => {
  assert.equal(stripHtml("<p>Hola</p><script>var x = 1;</script>"), "Hola");
});
