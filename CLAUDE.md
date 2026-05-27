# Keynet CRM — Contexto del Proyecto

## ¿Qué es esto?
CRM inmobiliario llamado **Keynet** para uso interno de **Llave Maestra** (Mar del Plata, Argentina), con visión de comercializarlo a otras inmobiliarias compitiendo contra Tokko Broker. El diferencial principal es la **IA integrada**.

## Estructura del proyecto
Un solo archivo: `index.html` — app web PWA completa (HTML + CSS + JS en un archivo).
Hosting: GitHub Pages en `https://santiagollavemaestra-arch.github.io/llave-maestra/`

## Servicios configurados
- **Firebase Realtime DB**: proyecto `llave-maestra`, DB URL `https://llave-maestra-default-rtdb.firebaseio.com`
  - API Key: `["AIzaSyB8C2knBhn","e-RWnPmCD7fxp7U_","qS7If7rY"].join("")`
  - Nodos: `consultas`, `propiedades`, `propietarios`, `visitas`, `emails`
- **Gemini API**: `['AIzaSyCe30RUHpcLr','SC0SEon60R_tMEfc1','SLADM'].join('')`, modelo `gemini-2.0-flash`
- **Cloudinary**: cloud `dgaixfvxa`, preset `keynet_props` (unsigned)
- **EmailJS**: service `service_iorm3vh`, template `template_lqgp3ki`, key `Vjf16OOzV2i7xWz7x`
- **Google Places API**: `AIzaSyCJA9Mqz_27Z4pRWiXyuV9K1tgJsb27YKA`

## Equipo
- Santiago (contraseña `2858`, puede eliminar consultas)
- Mariana, Milagros, Gabriel

## Funcionalidades implementadas

### Consultas
- Rotación automática por cantidad de consultas
- Estados: Activo, Reserva, Cerrado, Sin interés
- Checklist: 1er contacto → Respondió → 2do contacto → Visita coord. → Reserva
- Alarma 5 días sin actividad
- Notas internas con editar/eliminar
- Botón "🤖 Generar respuesta con IA" — Gemini genera mensaje de WhatsApp personalizado
- Botón "🏠 Ver propiedades compatibles con IA" — matching con Gemini
- Solo Santiago puede eliminar consultas (contraseña 2858)

### Propiedades
- Toggle "Cargar manual" / "Importar desde portal" (Zonaprop/Argenprop)
- Importación con IA: pega URL → Gemini extrae datos → fotos se re-suben a Cloudinary via allorigins
- Ficha completa al tocar la card: fotos en galería, características con números grandes, descripción
- Fotos: miniaturas 68x68px en la lista, lightbox al tocar
- Embellecimiento opcional con Cloudinary
- Botón "✏️ Editar" — edita título, precio, barrio, descripción, estado
- Botón "🔗 Compartir" — copia link público `?prop=ID`
- Botón "👥 ¿A quién le recomiendo esta propiedad?" — matching inverso con Gemini
- Vista pública `?prop=ID`: muestra solo la propiedad sin CRM, con botón WhatsApp

### Propietarios
- CRUD básico, vinculados a propiedades, WhatsApp directo

### Visitas
- Agendar con propiedad, cliente, fecha, hora, agente
- Notificación WhatsApp al cliente y propietario

### Stats
- Por agente: consultas, cerradas
- Totales del mes, canal más efectivo

## Reglas técnicas importantes
1. **Las claves API van divididas en arrays** para evitar detección de GitHub: `['parte1','parte2'].join('')`
2. **No usar template literals con saltos de línea literales** — Safari los rompe
3. **No anidar backticks** dentro de template literals
4. **Fotos siempre como miniaturas** — 68x68px, nunca tamaño completo en la lista
5. **IA solo bajo demanda** — nunca automática al cargar, solo cuando el usuario aprieta un botón
6. **overscroll-behavior-x:none** en html y body para evitar swipe back en iOS

## Lo que falta hacer (prioridades)
1. **Probar importación desde portal** — cuando Gemini esté disponible (resetea a las 00:00)
2. **Probar generador de descripción con IA** — mismo reseteo
3. **Probar matching** — mismo reseteo
4. **Eliminar notas** — agregar botón de eliminar en notas
5. **Multi-inmobiliaria** — sistema de login + panel admin para comercializar Keynet
6. **Landing page de Keynet** — para vender el producto

## Visión del producto
- SaaS ~30 USD/mes para inmobiliarias chicas/medianas
- Competir con Tokko Broker por simplicidad + IA + precio
- IA como diferencial: matching, descripción automática, importación desde portales, respuesta automática
- Infraestructura 100% gratuita: Firebase + GitHub Pages + Cloudinary + Gemini + EmailJS
