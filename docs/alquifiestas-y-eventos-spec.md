# Alquifiestas y Eventos — Especificación del Proyecto

**Fecha:** Julio 2026
**Autor:** Martin Tercero (desarrollador, hijo de los dueños)
**Objetivo del documento:** servir de punto de partida técnico y funcional para construir el nuevo sitio web + plataforma administrativa con Claude Code, reemplazando la operación actual en Odoo.

---

## 1. Contexto del negocio

Alquifiestas y Eventos es un negocio familiar de alquiler de artículos para fiestas y eventos (sillas, mesas, mantelería, cristalería, decoración) ubicado en San Marcos, Carazo, Nicaragua, con más de 20 años operando.

- El negocio es propiedad y operación de los padres de Martin, quienes **no tienen formación técnica** y históricamente llevaron todo en papel.
- La presencia digital actual (sitio web, tienda en línea sobre Odoo) fue construida y es mantenida por Martin.
- Se usó Odoo (con su plugin de alquiler) durante ~1 año. No dio los resultados esperados: demasiadas funcionalidades para lo que necesitan, poco intuitivo especialmente desde celular, que es el dispositivo principal de la madre (a veces computadora o tablet).
- Hoy usan **2 números de WhatsApp**:
  - Uno personal, en el celular de la madre, para atención ocasional al cliente.
  - Uno usado solo como API dentro de la integración de WhatsApp de Odoo, para enviar facturas por *template messages*.
- **La madre es quien recibe a la mayoría de los clientes en físico** y a veces prefiere hacer la proforma/factura en papel en vez de usar el sistema.
- La entrega de artículos es **siempre a solicitud del cliente, opcional y con costo adicional cotizado caso por caso** (no hay tarifa fija ni por zona) — normalmente el cliente recoge.
- Los pagos son en efectivo o transferencia bancaria; **no se maneja pago en línea** (poco común en Nicaragua).

## 2. Objetivos del proyecto

1. Reemplazar Odoo con un sistema propio, mucho más simple e intuitivo, especialmente desde celular.
2. Mantener y mejorar el sitio público de catálogo/marketing, con capacidad de generar landing pages para campañas de publicidad.
3. Dar a los padres una herramienta de uso diario para atender clientes en físico (el caso de uso principal hoy).
4. Habilitar, en paralelo y sin fricción para el negocio actual, que clientes puedan armar sus propios pedidos en línea — sabiendo que su adopción será gradual (post-campañas de redes/publicidad pagada) y que convivirá con la atención física por mucho tiempo.
5. Todo con herramientas y hosting gratuitos o de costo mínimo, dado que es un negocio pequeño.

## 3. Usuarios y roles

| Rol | Quién | Necesidad principal |
|---|---|---|
| Cliente público | Cualquier visitante | Ver catálogo, cotizar, armar solicitud de reserva |
| Staff / Administración | Padres de Martin (principalmente la madre) | Crear proformas/facturas rápido, ver pedidos, gestionar inventario |
| Desarrollador/Admin técnico | Martin | Mantenimiento, reportes, configuración |

**Nota de diseño:** dado que Odoo falló por exceso de funciones, el panel de staff debe limitarse a pantallas mínimas de uso diario. Todo lo demás (reportes avanzados, configuración) debe quedar secundario o accesible solo por Martin.

## 4. Alcance — Sitio público

- Página principal (home) con catálogo por categorías: Sillas, Mesas, Mantelería, Cristalería, Decoración, Caballo Bayo, etc. (mismas categorías que tienen hoy en Odoo).
- Ficha de artículo: foto, precio por día, atributos relevantes (color, material, tamaño).
- **Landing pages independientes**, generables por campaña de publicidad (ej. para una promo de quinceaños o temporada de graduaciones), reutilizando el mismo sistema de contenido/catálogo.
- Formulario de **"Solicitar reserva"**:
  - Selección de artículos + cantidades
  - Fecha(s) del evento
  - Validación de disponibilidad real contra el calendario de reservas (ver sección 6)
  - Elección: **recoger en el local** (sin costo) o **solicitar entrega** (costo a confirmar después por el negocio)
  - Elección de forma de pago: efectivo o transferencia — si transferencia, mostrar los datos de cuenta a depositar
  - El pedido entra como **solicitud pendiente**, nunca como compra confirmada automáticamente

## 5. Alcance — Panel administrativo (staff)

Pantallas mínimas, pensadas mobile-first:

1. **Nueva proforma/pedido** (uso más frecuente — atención en físico): elegir cliente (o crear uno rápido), artículos + cantidades, fecha del evento, entrega o recoge, depósito de garantía (**campo opcional**), forma de pago.
2. **Pedidos / solicitudes**: bandeja de solicitudes pendientes (venidas del sitio web) para confirmar, ajustar (agregar costo de entrega cotizado, agregar depósito) o rechazar; lista de pedidos confirmados y su estado (reservado → entregado → devuelto → facturado).
3. **Calendario de disponibilidad**: qué artículos salen y regresan cada día, para evitar dobles reservas y planear logística.
4. **Inventario**: alta/edición de artículos, cantidades totales, precio, fotos, categoría y atributos.
5. **Clientes**: ficha simple (nombre, teléfono, historial de pedidos).
6. Reportes básicos (secundario, no es pantalla principal): ingresos del mes, artículos más rentados, saldos pendientes de clientes.

### Flujo completo de un pedido

1. Cliente arma pedido en el sitio (o el staff lo crea en persona) → se valida disponibilidad por fecha.
2. Se define recoge o entrega (si entrega: dirección, costo pendiente de cotizar y confirmar).
3. Se define forma de pago (efectivo o transferencia).
4. Pedido queda como **solicitud pendiente**.
5. Staff revisa, confirma disponibilidad real, agrega costo de entrega si aplica, agrega depósito de garantía si aplica, aplica descuento si decide → se convierte en **proforma**.
6. Se registra anticipo si el cliente deja uno (frecuentemente 50% para apartar la fecha).
7. Al confirmarse el pago total → se genera **factura** (ver sección 9 sobre su carácter fiscal).
8. Al devolverse los artículos, el staff marca la recepción, registra faltantes o daños si los hubo, y se cierra el pedido liberando el depósito de garantía si todo está en orden.

## 6. Lógica central: periodo de alquiler y disponibilidad

Este es el punto más crítico del sistema y donde un enfoque de "stock" simple (como en una tienda normal) falla. No basta con saber cuántas sillas hay en bodega — hay que saber cuántas **ya están comprometidas y aún no han regresado**.

### Precio

- La unidad base de alquiler es de **24 horas**.
- Alquileres de varios días existen y se cobran de forma lineal: `precio de 24 horas × cantidad de días`.
- **El descuento es siempre una decisión manual del staff, nunca una regla automática.** Debe poder aplicarse a una línea individual o al total del pedido, en monto fijo o en porcentaje, y guardarse como campo propio para que los reportes puedan comparar precio de lista contra lo realmente cobrado.

### Tres fechas, no dos

El periodo que se cobra y el periodo en que el artículo está fuera de bodega **no son lo mismo** y deben modelarse por separado:

| Fecha | Qué es |
|---|---|
| Fecha de retiro | Cuándo el cliente se lleva los artículos. El reloj de cobro arranca aquí. |
| Fecha de devolución pactada | Cuándo se acordó que regresarían. |
| Fecha de devolución real | Cuándo efectivamente regresaron y se marcaron como recibidos. |

- **Retiro anticipado (opcional):** a veces la madre acuerda con ciertos clientes que retiren antes de la fecha del evento, por comodidad del cliente. En ese caso el artículo queda comprometido desde ese día aunque no se cobre ese periodo extra. El sistema debe permitir registrar esto explícitamente.
- **La disponibilidad se libera con la devolución real, no con la pactada.** Mientras un pedido no se marque como recibido, sus artículos siguen comprometidos y no aparecen disponibles para nadie más. Esto es intencional: protege contra sobreventa cuando un cliente se atrasa.

### Devoluciones parciales

Ocurre rara vez, pero ocurre: el cliente regresa parte del pedido y el resto después. El sistema debe permitir marcar recepción parcial (ej. 80 de 100 sillas), liberando disponibilidad proporcionalmente y dejando el pedido abierto con el saldo pendiente de regresar.

### Mora por devolución tardía

- **Nunca se calcula ni se cobra automáticamente.** El sistema solo **avisa** que un pedido está vencido.
- La decisión es de la madre y es relativa: si se pasan unas horas normalmente no se cobra; si se pasan un día completo casi siempre sí. El monto puede ser un porcentaje de la factura o su totalidad.
- El sistema debe ofrecer registrar un cargo por mora con monto libre, no sugerir uno.

### Faltantes y daños

Al marcar la devolución, el staff debe poder registrar artículos faltantes o dañados. Eso genera un cargo que se descuenta del depósito de garantía (si hubo) o queda como saldo pendiente del cliente. Si un artículo se destruye, debe poder darse de baja del inventario total para que no siga apareciendo como disponible.

### La validación advierte, no bloquea

Si el staff intenta crear un pedido que excede la disponibilidad calculada, el sistema debe mostrar una advertencia clara pero **permitir continuar**. La madre a veces consigue artículos prestados de otro negocio o sabe que algo va a regresar antes de lo registrado. Un bloqueo duro haría que dejen de usar el sistema, que es exactamente lo que pasó con Odoo.

## 7. Notificaciones vía WhatsApp

Aprovechar el número que ya funciona como API en la integración actual (usado hoy para enviar facturas por template):

- Confirmación automática cuando se confirma una solicitud/proforma.
- Recordatorio antes de la fecha del evento.
- Aviso de pago recibido / factura generada.

Esto reduce la carga sobre el número personal de la madre, que puede seguir usándose para atención directa cuando haga falta.

## 8. Fase 2 (no incluida en el primer lanzamiento)

### Escaneo de proforma/factura en papel → pedido en sistema
Función exclusiva para el staff, pensada para cuando la madre prefiere anotar en papel. Funcionamiento propuesto:

1. Se toma una foto de la hoja escrita a mano.
2. El sistema extrae automáticamente (usando un modelo con visión) cliente, artículos, cantidades y fecha, y **pre-llena** el formulario de "nueva proforma".
3. **La madre revisa y confirma/corrige antes de guardar** — el reconocimiento de letra manuscrita nunca es 100% exacto, así que esto asiste la captura, no la reemplaza.

Se deja como fase 2 porque no es indispensable para operar el día uno, y conviene validar primero el flujo digital básico.

## 9. Pagos y anticipos

- Formas de pago: **efectivo o transferencia bancaria**, elegidas por el cliente. Si es transferencia, se le muestran los datos de la(s) cuenta(s) a depositar.
- **Anticipo opcional:** algunos clientes dejan un adelanto para apartar la fecha, frecuentemente el 50%. No es obligatorio ni universal, así que el sistema debe soportar pagos parciales y mostrar el saldo pendiente, no asumir pago único.
- Un pedido puede acumular varios registros de pago (anticipo, saldo, cargo por mora, cargo por daños), cada uno con su fecha, monto y forma de pago.

## 10. Documento fiscal (factura)

**Decisión para el MVP: el sistema genera un comprobante interno, no un documento fiscal.**

El contexto es el siguiente. En Nicaragua las facturas preimpresas deben elaborarse en imprentas autorizadas por la DGI, bajo la Ley de Pie de Imprenta Fiscal y su disposición técnica de registro de imprentas. Existe además una figura de emisión de facturas por medios electrónicos, pero **requiere solicitar autorización previa ante la DGI** para el sistema de facturación computarizado, indicando datos del contribuyente, del proveedor del sistema y la fecha de inicio de uso. También existe el SACFI (Sistema de autorización de comprobantes fiscales e imprentas) creado en 2017, y una normativa de facturación electrónica publicada a finales de 2020 que aún estaba en desarrollo.

Consecuencias prácticas para este proyecto:

- Los padres ya tienen **facturas membretadas físicas**, que siguen siendo el documento fiscal válido. El sistema no las reemplaza en esta etapa.
- El comprobante que genere el sistema es para el cliente y para el control interno del negocio, no para efectos fiscales.
- **Puente recomendado:** incluir en el pedido un campo opcional "número de factura física", donde la madre anota el número de la membretada que emitió a mano. Así el registro digital y el documento fiscal quedan enlazados sin obligar a nadie a cambiar de proceso.
- Las proformas del sistema tampoco tienen valor fiscal, lo cual es consistente con la normativa: la factura proforma explícitamente no tiene valor para efectos de impuestos ni trámites.
- Si más adelante quieren que el sistema emita facturas fiscales, hay que hacer el trámite de autorización ante la DGI. Conviene dejar el modelo de datos preparado (numeración consecutiva, campos de RUC del negocio y del cliente, desglose de impuestos, y regla de que un documento emitido se anula pero no se borra ni se reescribe) aunque no se use todavía.

> **Nota:** esto es un resumen del contexto regulatorio, no asesoría fiscal. Antes de decidir cualquier cosa con implicaciones tributarias conviene confirmarlo con un contador nicaragüense, sobre todo para saber bajo qué régimen está inscrito el negocio (el régimen simplificado o de cuota fija tiene requisitos distintos al régimen general).

## 11. Decisiones técnicas

- **Sin CMS separado.** El catálogo de artículos se maneja con una pantalla propia de "Inventario" dentro de la misma aplicación, porque está atado a la lógica de disponibilidad por fecha (sección 6) — un CMS genérico (Strapi, Directus, etc.) obligaría a mantener dos sistemas sincronizados sin quitar la necesidad de programar esa lógica de todas formas.
- **Stack sugerido, 100% con capas gratuitas:**
  - Next.js, desplegado en Vercel (ya conectado).
  - Base de datos Postgres gratuita (Neon o Supabase).
  - Imágenes en Vercel Blob o Cloudinary (tier gratuito).
  - Integración WhatsApp Business API (la misma que ya usan).

## 12. Migración desde Odoo

Decisión: **arrancar de cero en cuanto a pedidos e historial**, para no arrastrar la estructura de un sistema que no funcionó. Se rescata únicamente lo que es barato de traer y sí aporta valor:

- **Catálogo de artículos** (nombre, categoría, precio, foto) — ya está bien armado en Odoo, se puede exportar/fetch en vez de recrear a mano.
- **Lista simple de clientes** (nombre + teléfono, sin historial de pedidos) — útil para no perder contactos.

## 13. Explícitamente fuera de alcance (por ahora)

- Pago en línea (no es común en Nicaragua; todo pago es efectivo o transferencia, coordinado después de la solicitud).
- Costo de entrega automático/calculado (siempre se cotiza manualmente con el transportista).
- Cálculo automático de mora por devolución tardía (siempre es decisión manual).
- Descuentos automáticos o por reglas (siempre manuales).
- Emisión de facturas fiscales (requiere autorización previa ante la DGI; se mantienen las membretadas físicas).
- Migración de historial de pedidos de Odoo.

## 14. Próximos pasos sugeridos

1. Definir estructura exacta de datos de artículos (campos, atributos) basada en lo que ya existe en Odoo.
2. Modelar el pedido con las tres fechas (retiro, devolución pactada, devolución real) y soporte de recepción parcial desde el inicio — es lo más caro de agregar después.
3. Diseñar las pantallas del panel administrativo priorizando "Nueva proforma" como la más usada.
4. Construir la validación de disponibilidad por fecha (en modo advertencia, no bloqueo) como pieza central antes que cualquier otra función.
5. Definir plantillas de mensajes de WhatsApp (confirmación, recordatorio, pago recibido).
6. Confirmar con un contador el régimen tributario del negocio antes de decidir si vale la pena solicitar autorización de facturación ante la DGI.
7. Dejar el escaneo de facturas en papel para una segunda iteración, una vez el flujo digital básico esté validado en uso real.
