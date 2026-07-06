# p1-scraper

Microservicio TypeScript independiente (ESM + tsx) que scrapea las entradas de **Fórmula 1**
publicadas por P1 Travel (`p1travel.com`) usando su API REST de checkout
(`checkout.p1travel.com/_TWBP/api/v2`) y persiste eventos, sectores y un snapshot
diario de precios en Supabase. Los precios son dinámicos, por eso corre 1×/día.

## Qué hace

1. Lista los eventos de F1 desde `p1travel.com` (paginando, dedupe por URL).
2. Resuelve el `EVENT_UUID` de cada evento desde su página de detalle.
3. Trae de la API `_TWBP/api/v2` el evento completo: metadata, venue, precios y todos los sectores
   (nombre, descripción, imagen del sector, precio base + supplement, features).
4. Persiste todo en Supabase de forma idempotente y guarda un histórico de precios.

## Cómo correr

```bash
npm install
npm run scrape:dry   # corrida de prueba (no escribe / modo dry-run)
npm run scrape       # corrida real
```

## Credenciales

Las credenciales **no viven en esta carpeta**. Se heredan de `../.env.local`
(la raíz del repo `hub`). `src/config.ts` carga ese archivo vía `dotenv` y valida que existan:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Si falta alguna, el proceso falla rápido al iniciar.

## Migraciones

El esquema SQL del scraper vive en `hub/supabase/migrations/`. Esas migraciones se aplican
**manualmente** vía el dashboard de Supabase o `supabase db push` — este servicio no corre migraciones.
