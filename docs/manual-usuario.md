# Manual de Usuario - TC Flights Manager

Sistema interno de gestion de vuelos, paquetes y marketing para **Si, Viajo**.

---

## Indice

1. [Inicio de Sesion](#1-inicio-de-sesion)
2. [Dashboard](#2-dashboard)
3. [Vuelos](#3-vuelos)
4. [Paquetes](#4-paquetes)
5. [Comercial](#5-comercial)
6. [Diseno](#6-diseno)
7. [Marketing](#7-marketing)
8. [SEO](#8-seo)
9. [Recotizacion Manual](#9-recotizacion-manual)
10. [Reservas](#10-reservas)
11. [Rendimiento del Equipo](#11-rendimiento-del-equipo)
12. [Gestion de Usuarios](#12-gestion-de-usuarios)
13. [Logs de Sincronizacion](#13-logs-de-sincronizacion)
14. [AI Debug y Configuracion](#14-ai-debug-y-configuracion)

---

## 1. Inicio de Sesion

**Ruta:** `/login`

- Ingresa tu **email** y **contrasena** asignados por el administrador.
- Si no tenes cuenta, pedi al administrador que te cree una desde la seccion de Usuarios.

---

## 2. Dashboard

**Ruta:** `/dashboard`

Pagina principal al iniciar sesion. Muestra un resumen general con estadisticas del sistema: paquetes activos, vuelos, reservas, etc.

---

## 3. Vuelos

### 3.1 Lista de Vuelos

**Ruta:** `/flights`

Tabla con todos los vuelos cargados en el sistema.

**Columnas visibles:**
- Nombre del vuelo
- Aerolinea
- Ruta (segmentos)
- Fechas (inicio/fin)
- Precios (adulto, menor, infante - ida y vuelta)
- Estado de sincronizacion con TravelCompositor
- Proveedor
- Equipaje e inventario (asientos vendidos/disponibles)

**Acciones:**
- **Importar** — Trae vuelos desde TravelCompositor automaticamente
- **Nuevo vuelo** — Crea un vuelo manualmente

### 3.2 Importar Vuelos

**Ruta:** `/flights/import`

Importa vuelos directamente desde TravelCompositor. El sistema trae los datos y los sincroniza.

### 3.3 Crear / Editar Vuelo

**Ruta:** `/flights/new` o `/flights/{id}`

Formulario completo para crear o editar un vuelo:
- Aerolinea y tipo de transporte
- Precios por pasajero (adulto/menor/infante)
- Tasas
- Fechas y dias operativos
- Segmentos (aeropuerto salida/llegada, horarios)
- Equipaje, clase de cabina, inventario
- Reglas de cancelacion

---

## 4. Paquetes

### 4.1 Lista de Paquetes

**Ruta:** `/packages`

Vista principal de todos los paquetes importados desde TravelCompositor.

**Estadisticas en la parte superior:**
- Total de paquetes
- Paquetes activos
- Paquetes monitoreados
- Paquetes que necesitan recotizacion manual

**Columnas de la tabla:**
- ID del paquete (TC)
- Titulo e imagen
- Fechas de salida
- Precio original vs. precio actual
- Variacion de precio (%)
- Pasajeros (adultos/menores)
- Noches
- Servicios incluidos (vuelos, hoteles, transfers, autos, entradas, tours)
- Estado (activo, enviado a diseno, enviado a marketing)
- Costos (aereo, terrestre, fee agencia)
- Info de vuelo (aerolinea, numeros de vuelo)
- Monitoreo (precio objetivo, estado de recotizacion)
- Destinos y hoteles

**Acciones:**
- **Importar Paquetes** — Trae paquetes desde TravelCompositor

---

## 5. Comercial

**Ruta:** `/packages/comercial`

Cotizador rapido de paquetes para el equipo comercial.

**Tarjetas de resumen:**
- Total de paquetes
- Con cupos disponibles
- Pocos cupos (1-5 asientos)
- Sin cupos

**Funcionalidades:**
- Filtra por **destino** y **proveedor**
- Ve paquetes activos con disponibilidad real de asientos
- Cada paquete muestra: precio, hotel, transporte, destino, asientos vendidos y restantes

---

## 6. Diseno

**Ruta:** `/packages/design`

Gestion del pipeline de diseno de creativos publicitarios.

**Estadisticas:**
- Paquetes enviados a diseno
- Pendientes
- Completados

**Tabla:**
- Paquetes marcados para diseno
- Titulo, fechas, precio
- Estado de completitud del diseno
- Deadline
- Cantidad de creativos generados
- Si los creativos necesitan actualizacion (ej: cambio de precio)

**Panel de solicitudes:**
- Solicitudes pendientes/en progreso
- Info del paquete, motivo, prioridad, quien solicito, variantes pedidas

**Generador IA (boton por paquete):**
1. Selecciona una variante (V1 a V5)
2. Click en **"Generar Imagen 1:1"**
3. Revisa la imagen generada
4. Si no te gusta: **"Regenerar 1:1"**
5. Si te gusta: **"Crear 9:16"** (version vertical para Stories)
6. Ambas imagenes quedan guardadas en Google Drive

---

## 7. Marketing

### 7.1 Panel Principal

**Ruta:** `/packages/marketing`

Gestion de anuncios de Meta Ads para los paquetes.

**Alertas automaticas:**
- Paquetes que necesitan actualizar creativos (cambio de precio)
- Paquetes proximos a vencer (menos de 15 dias)

**Estadisticas:**
- Total de paquetes en marketing
- Total de anuncios
- Paquetes sin anuncios
- Con copy generado
- Campanas activas
- Que necesitan actualizacion
- Gasto total en ads ($)
- Total de leads

**Tabla:**
- Estado de marketing por paquete
- Cantidad de anuncios
- Gasto y leads
- Fecha de vencimiento
- Si necesita actualizar creativos

**Acciones:**
- **Prompt IA** — Genera textos publicitarios automaticamente
- **Notificaciones** — Configura alertas de Slack
- **Analytics** — Ve metricas de rendimiento

### 7.2 Analytics

**Ruta:** `/packages/marketing/analytics`

Dos pestanas:
- **Metricas** — Rendimiento de anuncios en Meta Ads (impresiones, clicks, CTR, CPC, etc.)
- **Analisis IA** — Recomendaciones automaticas generadas por inteligencia artificial

### 7.3 Configuracion de Notificaciones

**Ruta:** `/packages/marketing/settings`

Configura las notificaciones de Slack para el equipo:

**Configuracion de Slack:**
- Activar/desactivar notificaciones
- URL del webhook
- Boton para probar conexion
- Canal de diseno y canal de marketing

**Tipos de notificacion (activar/desactivar cada una):**
- Cambio de precio
- Solicitud de creativo (avisa a Diseno)
- Creativo completado (avisa a Marketing)
- Anuncio con bajo rendimiento
- Recotizacion manual necesaria
- Nuevo paquete importado

**Umbrales:**
- Cambio minimo de precio (%) para notificar
- CTR minimo (%) — alerta si esta por debajo
- CPL maximo ($) — alerta si lo supera

---

## 8. SEO

**Ruta:** `/packages/seo`

Gestion de SEO para los paquetes.

**Estadisticas:**
- Total de paquetes activos
- Con SEO generado
- Pendientes de SEO
- En el sitemap
- Subidos a TravelCompositor

**Tabla:**
- Titulo SEO, descripcion, keywords
- Meta titulo y meta descripcion
- Texto alternativo de imagen
- Si esta en el sitemap
- Estado de SEO
- Fecha de generacion
- Si fue subido a TravelCompositor

---

## 9. Recotizacion Manual

**Ruta:** `/packages/requote`

Paquetes que necesitan recotizacion manual porque el precio cambio significativamente.

**Indicador:** Cantidad de paquetes pendientes de recotizacion.

**Tabla:**
- ID del paquete
- Titulo
- Rango de fechas
- Precio actual vs. precio objetivo
- Precio de recotizacion
- Variacion (%)
- Costos aereo/terrestre
- Cantidad de pasajeros
- Info de vuelo y hotel

---

## 10. Reservas

**Ruta:** `/reservations`

Ventas recibidas desde TravelCompositor.

**Tarjetas de resumen:**
- Total de reservas (confirmadas/canceladas)
- Total de pasajeros en reservas activas
- Monto total facturado
- Tasa de cancelacion (%)

**Tabla (50 por pagina):**
- Referencia de reserva
- Proveedor
- Vuelo asociado
- Estado (Confirmada / Modificada / Cancelada)
- Pasajeros (adultos/menores/infantes + total)
- Monto
- Fecha de viaje
- Fecha de reserva

**Filtros:**
- Buscar por referencia
- Filtrar por estado
- Filtrar por rango de fechas

**Acciones:**
- **Actualizar** — Refresca los datos
- **Cancelar reserva** — Boton rojo (X) con confirmacion. Los asientos vuelven al inventario.
- **Ver detalle** — Click en la fila para ver toda la info

---

## 11. Rendimiento del Equipo

**Ruta:** `/rendimiento`

Metricas de rendimiento del equipo por area.

**Metricas de Recotizacion Manual:**
- Total de notificaciones enviadas
- Tiempo promedio de respuesta (horas)
- Detalle por paquete: titulo, fecha de notificacion, fecha de completado, tiempo de respuesta

**Metricas de Diseno:**
- Total de solicitudes de creativos
- Completadas
- Tiempo promedio de respuesta
- Detalle: paquete, motivo, prioridad, asignado a, estado, fechas, tiempo de respuesta

**Metricas de Marketing:**
- Total de paquetes enviados a marketing
- Completados
- Tiempo promedio de respuesta
- Detalle: paquete, destinos, precio, estado, fechas, tiempo de respuesta

Se puede filtrar por rango de fechas.

---

## 12. Gestion de Usuarios

**Ruta:** `/users` (solo administradores)

**Tabla:**
- Nombre completo
- Email
- Rol (Admin, Marketing, Producto, Diseno, Ventas)
- Fecha de registro

**Acciones:**
- **Crear usuario** — Email, contrasena, nombre completo, rol
- **Editar usuario** — Cambiar nombre y rol (no podes cambiar tu propio rol)
- **Eliminar usuario** — Con confirmacion (no podes eliminarte a vos mismo)

**Roles disponibles:**
| Rol | Descripcion |
|-----|-------------|
| Admin | Acceso completo al sistema |
| Marketing | Gestion de campanas y anuncios |
| Producto | Gestion de paquetes y vuelos |
| Diseno | Creacion de creativos |
| Ventas | Acceso comercial y reservas |

---

## 13. Logs de Sincronizacion

**Ruta:** `/logs`

Registro de todas las sincronizaciones con TravelCompositor.

**Tabla (50 por pagina):**
- Fecha y hora
- Estado (OK / Error)
- Tipo de entidad (Vuelo / Modalidad / Inventario)
- Accion (Crear / Actualizar / Eliminar)
- Mensaje de error (si hubo)
- ID de la entidad
- Direccion (Push a TC / Pull desde TC)

**Filtros:**
- Buscar en mensajes de error
- Filtrar por estado (todos/exito/error)
- Filtrar por tipo de entidad

**Acciones:**
- **Actualizar** — Refresca la lista
- **Limpiar (+30 dias)** — Elimina logs de mas de 30 dias (con confirmacion)
- **Ver detalle** — Click en la fila para ver: error completo, request y response JSON

---

## 14. AI Debug y Configuracion

**Ruta:** `/ai-debug`

Panel de configuracion y depuracion del sistema de generacion de imagenes con IA.

### Pestana: Historial

Tabla con todas las generaciones de imagenes hechas por la IA.

**Columnas:**
- Fecha
- Estado (exito/error/generando)
- ID del paquete
- Variante (V1-V5)
- Aspect ratio
- Duracion
- Error (si hubo)

**Detalle por generacion (click):**
- Mensaje de error
- Link a la imagen generada (Google Drive)
- Modelo usado
- Duracion
- Assets utilizados
- Datos del paquete (JSON)
- Prompt completo enviado a Gemini

**Filtros:** Estado y variante.

### Pestana: Assets de Marca

Configuracion de los elementos visuales que usa la IA:

- **System Instruction** — Instrucciones generales para Gemini (manual de marca + analisis de estilo). Se edita como texto. Muestra cantidad de caracteres.
- **Logo** — Subir/ver/eliminar el logo de la marca (formato Base64 PNG). Muestra tamano del archivo.
- **Imagenes de Referencia (6 slots)** — Subir/ver/eliminar hasta 6 imagenes que Gemini usa como referencia de estilo. Cada slot muestra tamano o "vacio".

### Pestana: Variantes de Prompt

Las 5 variantes de enfoque publicitario:

| Variante | Nombre | Enfoque |
|----------|--------|---------|
| V1 | Precio/Oferta | Urgencia, oferta |
| V2 | Experiencia | Emocional, aspiracional |
| V3 | Destino | El lugar como protagonista |
| V4 | Conveniencia | Todo resuelto, cero estres |
| V5 | Escasez | Ultimos lugares, decision inmediata |

**Por cada variante podes ver:**
- Focus y direccion visual
- Frases hook de ejemplo
- Instrucciones de prompt para Gemini

**Acciones:**
- **Agregar variante** — Nombre, focus, descripcion, direccion visual, frases hook, prompt, activo/inactivo
- **Editar variante** — Modificar cualquier campo
- **Eliminar variante** — Con confirmacion

---

## Flujo de Trabajo Recomendado

```
1. Importar vuelos (/flights/import)
         |
2. Importar paquetes (/packages)
         |
3. Revisar paquetes y marcar para diseno
         |
4. Generar creativos con IA (/packages/design)
   - Elegir variante
   - Generar 1:1 → revisar → generar 9:16
         |
5. Marcar paquete para marketing
         |
6. Crear anuncios en Meta Ads (/packages/marketing)
         |
7. Monitorear rendimiento (/packages/marketing/analytics)
         |
8. Gestionar reservas (/reservations)
         |
9. Recotizar si cambian precios (/packages/requote)
```

---

*Documento generado para el equipo de Si, Viajo.*
