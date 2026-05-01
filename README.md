# Cuentas Claras

Web app para dividir gastos en grupos permanentes: cenas, viajes, casa compartida o juntadas. La persistencia principal es Supabase para que varias personas puedan ver y editar el mismo grupo desde distintos celulares.

Esta version no tiene login todavia.

## Instalar

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Preview de produccion

```bash
npm run preview
```

## Tests

```bash
npm run test
```

## Variables de entorno

Crear `.env.local`:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

No subir `.env.local` al repo. `.env.example` queda como plantilla.

Si faltan estas variables, la app muestra un aviso y funciona en modo local con `localStorage`. Ese modo sirve para desarrollo, pero no permite compartir grupos entre celulares.

## Configurar Supabase

1. Crear proyecto en Supabase.
2. Verificar:
   - Enable Data API: ON
   - Automatically expose new tables and functions: OFF
   - Enable automatic RLS: ON
3. Abrir SQL Editor.
4. Ejecutar completo el archivo `supabase/schema.sql`.
5. Copiar Project URL.
6. Copiar Publishable key.
7. Completar `.env.local`.
8. Reiniciar `npm run dev`.

El SQL crea tablas con RLS activado y sin policies abiertas. El acceso anonimo pasa por RPC `SECURITY DEFINER` usando `share_token`.

## Vercel

En Vercel, agregar:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Ruta:

`Project Settings > Environment Variables`

Despues redeploy.

Build command:

```bash
npm run build
```

Output directory:

```bash
dist
```

## Probar grupo compartido

1. Correr la app con variables Supabase configuradas.
2. Crear un grupo.
3. Entrar al grupo y tocar "Copiar link del grupo".
4. Abrir ese link en otro celular o navegador: `/g/:shareToken`.
5. Agregar participantes.
6. Cargar un gasto desde un celular.
7. Recargar el grupo en el otro celular.
8. Verificar que aparece el gasto.

No hay realtime todavia. Para ver cambios hechos por otra persona, recargar la pagina.

## Seguridad actual

Cualquier persona con el link puede ver y editar los gastos del grupo. Esta version no tiene login todavia.

No se usa `service_role` en frontend. No hay llaves secretas en el codigo.

## Navegacion

- Home: `/`
- Grupo compartido: `/g/:shareToken`
- Grupo local legado: `/group/:groupId`

Cuando Supabase esta configurado, los grupos nuevos redirigen a `/g/:shareToken`.

## Logica de calculo

La logica pura esta en `src/lib/calculations.ts`:

- `calculateBalances(group, participants, expenses)`
- `simplifySettlements(balances)`
- `getOpenExpenses(expenses)`

Los montos se guardan como centavos y se formatean en `src/lib/money.ts`.

## Persistencia

- Supabase: `src/data/supabaseStorage.ts`
- Fallback local: `src/data/storage.ts`
- Cliente Supabase: `src/lib/supabase.ts`
- SQL: `supabase/schema.sql`

La UI no escribe directo en `localStorage` ni llama tablas Supabase directamente.

## PWA

La base PWA esta configurada con:

- `public/manifest.webmanifest`
- `public/sw.js`
- iconos PNG/SVG
- `apple-touch-icon`

Para probar:

1. `npm run build`
2. `npm run preview`
3. Abrir Chrome DevTools > Application.
4. Revisar Manifest y Service Worker.
5. Instalar desde el navegador si aparece la opcion.

## Mejoras futuras

- Login.
- Permisos por grupo.
- Realtime.
- Historial de cambios.
- Confirmacion de pagos.
- Invitaciones con roles.
