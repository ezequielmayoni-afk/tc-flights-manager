# TC Flights Manager

Web app para gestión de vuelos de TravelCompositor.

## Setup

### 1. Crear proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) y crear un nuevo proyecto
2. Copiar las credenciales del proyecto (Settings > API):
   - Project URL
   - anon public key
   - service_role key

### 2. Configurar variables de entorno

Editar el archivo `.env.local` con tus credenciales:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key

TC_API_BASE_URL=https://online.travelcompositor.com/resources
TC_USERNAME=tu-usuario
TC_PASSWORD=tu-password
TC_MICROSITE_ID=tu-microsite
TC_SUPPLIER_ID=tu-supplier-id
```

### 3. Ejecutar el schema de base de datos

1. Ir a Supabase > SQL Editor
2. Copiar y ejecutar el contenido de `supabase/migrations/001_initial_schema.sql`

### 4. Configurar Auth en Supabase

1. Ir a Authentication > Providers
2. Habilitar Email provider
3. (Opcional) Deshabilitar "Confirm email" para desarrollo

### 5. Instalar dependencias y ejecutar

```bash
npm install
npm run dev
```

La app estará disponible en http://localhost:3000

## Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/           # Páginas de login/register
│   ├── (dashboard)/      # Dashboard y funcionalidades principales
│   └── api/              # API routes
├── components/
│   ├── ui/               # Componentes shadcn
│   └── layout/           # Sidebar, Header
├── lib/
│   └── supabase/         # Cliente Supabase
└── types/
    └── database.ts       # Tipos de la DB
```

## Próximos pasos

- [ ] Formulario de creación de vuelos
- [ ] Importación de Excel
- [ ] Sincronización con TravelCompositor
- [ ] Gestión de modalidades
