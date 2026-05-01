# Cuentas Claras

Web app para dividir gastos en grupos permanentes: cenas, viajes, casa compartida o juntadas. El MVP funciona sin backend ni login y persiste datos en `localStorage`.

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

## Preview de producción

```bash
npm run preview
```

## Tests

```bash
npm run test
```

## PWA

La base PWA está configurada con `public/manifest.webmanifest`, íconos PNG/SVG, `apple-touch-icon` y `public/sw.js`.

Para probar local:

1. Ejecutar `npm run build`.
2. Ejecutar `npm run preview`.
3. Abrir la URL del preview en Chrome.
4. Revisar Application > Manifest y Service Workers.
5. Usar la opción de instalar app si el navegador la ofrece.

## Deploy en Vercel

1. Subir el repositorio a GitHub, GitLab o Bitbucket.
2. Crear proyecto en Vercel.
3. Framework: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.

El archivo `vercel.json` deja preparada la app como SPA.

## Lógica de cálculo

La lógica pura está en `src/lib/calculations.ts`:

- `calculateBalances(group, participants, expenses)`
- `simplifySettlements(balances)`
- `getOpenExpenses(expenses)`

Los montos se manejan en centavos y se formatean en `src/lib/money.ts`.

## Persistencia

La capa de datos está en `src/data/storage.ts`. Los componentes no escriben directo en `localStorage`; reciben funciones desde `App.tsx` o usan funciones de storage a través del estado central.

## Navegación

- Home: `/`
- Detalle local del grupo: `/group/:groupId`

Al recargar una URL de grupo, la app reabre ese grupo si existe en el `localStorage` de ese dispositivo. Si no existe, vuelve al home y muestra un mensaje.

## Grupos compartidos

Cada grupo nuevo se crea con `shareToken`. Por ahora el botón "Copiar link del grupo" copia una URL local usable con `groupId` y deja el token incluido para la futura ruta compartida `/g/:shareToken` cuando se migre a Supabase.

## Preparado para backend/Supabase

- Tipos separados en `src/types.ts`.
- Storage aislado detrás de funciones de datos.
- IDs y fechas normalizados.
- `shareToken` ya existe en el modelo `Group`.
- Cálculos puros sin dependencia de React.
- Componentes reciben datos y callbacks, lo que permite reemplazar `localStorage` por API o Supabase más adelante.

## Pendiente

- Edición completa de gastos.
- Archivado de grupos.
- Exportar cierres.
- Sincronización multi-dispositivo.
- Backend y autenticación cuando el MVP lo necesite.
