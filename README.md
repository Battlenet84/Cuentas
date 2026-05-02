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
   - Authentication > Providers > Anonymous sign-ins: ON
3. Abrir SQL Editor.
4. Ejecutar completo el archivo `supabase/schema.sql`.
5. Copiar Project URL.
6. Copiar Publishable key.
7. Completar `.env.local`.
8. Reiniciar `npm run dev`.

El SQL crea tablas con RLS activado y sin policies abiertas. El acceso anonimo pasa por RPC `SECURITY DEFINER` usando `share_token` y `auth.uid()`.

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
7. Verificar que aparece en el otro celular sin recargar.

## Tiempo real

Los grupos compartidos usan Supabase Realtime Broadcast.

La base emite un aviso al topic `group:<shareToken>` cuando cambian `groups`, `participants`, `expenses` o `settlement_cycles`.

El WebSocket no manda nombres, montos, participantes ni gastos. Solo manda:

- tabla
- operacion
- timestamp

Cuando la app recibe `group_changed`, recarga el grupo con `loadGroupByShareToken(shareToken)`. La fuente de verdad sigue siendo Supabase por RPC y `share_token`.

Si el canal no conecta, la app no se rompe. El boton "Actualizar" queda como fallback manual.

## Seguridad actual

Cualquier persona con el link puede unirse al grupo mientras el link sea valido. Esta version no tiene login real todavia.

No se usa `service_role` en frontend. No hay llaves secretas en el codigo.

## Identidad anonima y membresias

La app usa Supabase Anonymous Auth. Cada navegador, PWA o celular recibe un usuario anonimo propio.

- "Mis grupos" sale de `group_memberships` activas.
- El creador del grupo queda como `owner`.
- Al entrar por `/g/:shareToken`, la persona elige quien es en ese grupo o crea un participante nuevo.
- El owner puede revocar miembros.
- El owner puede regenerar el link de invitacion.
- Si alguien borra datos del navegador o reinstala la PWA, puede perder esa identidad anonima.

Esto no reemplaza login real. Es una identidad por dispositivo.

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
- Realtime Broadcast: `src/data/realtime.ts`
- Anonymous Auth: `src/data/auth.ts`
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
- Login real con email, Google u otro proveedor.
- Permisos por grupo.
- Canales privados.
- Presencia.
- Historial de cambios.
- Confirmacion de pagos.
- Invitaciones con roles.
- Transferir grupos entre dispositivos.
- Multiples owners.
- Aprobacion manual de miembros.
- Links de invitacion de un solo uso.
