# Cuentas Claras

Web app para dividir gastos en grupos permanentes. Usa React, TypeScript, Vite, Tailwind, Supabase Auth con email y contrasena, memberships por grupo y Supabase Realtime Broadcast.

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

No subir `.env.local`.

## Configurar Supabase

1. Crear proyecto en Supabase.
2. Verificar:
   - Enable Data API: ON
   - Automatically expose new tables and functions: OFF
   - Enable automatic RLS: ON
   - Authentication > Providers > Email: ON
   - Authentication > Providers > Email > Confirm email: OFF
3. Ejecutar completo `supabase/schema.sql` en SQL Editor.
4. Copiar Project URL y Publishable key.
5. Completar `.env.local`.
6. En Vercel, cargar las mismas variables y redeploy.

Anonymous Auth ya no es necesario para el flujo principal. Puede quedar apagado o sin uso.

## Usuarios, perfiles y participantes

Usuario:
- Tiene email y contrasena.
- Puede iniciar sesion desde cualquier dispositivo.
- Recupera "Mis grupos" por memberships activas.
- Tiene perfil con nombre y alias de pago opcional.

Participante:
- Representa a una persona dentro de un grupo.
- Puede existir sin usuario.
- Tiene alias propio dentro del grupo.
- Sirve para cargar gastos de gente que no usa la app.

Al crear cuenta se pide nombre y alias de pago opcional. Ese perfil prellena "Tu nombre en este grupo" y el alias del participante al crear o entrar a un grupo. El alias que se muestra para transferir es el alias del participante receptor.

## Grupos e invitaciones

- Ruta compartida: `/g/:shareToken`.
- Cualquier persona con el link puede solicitar unirse, pero debe tener cuenta.
- Si no tiene sesion, primero ve Entrar / Crear cuenta y luego sigue en el link.
- Al unirse, elige un participante disponible o crea uno nuevo.
- No puede elegir un participante ya asociado a otro usuario activo.
- El owner puede revocar miembros.
- El owner puede regenerar el link. Links anteriores dejan de servir para nuevos ingresos.

## Gastos flexibles

Los gastos soportan:
- una persona que paga;
- varias personas que pagan;
- division en partes iguales;
- division manual por monto.

La fuente nueva de verdad esta en:
- `expense_payers`
- `expense_splits`

Las columnas viejas `paid_by_participant_id` y `split_participant_ids` quedan por compatibilidad. El schema incluye backfill: por cada gasto viejo crea un payer con el pagador original y splits igualitarios entre los participantes guardados. Si el total no divide exacto, reparte centavos restantes de forma deterministica.

Para verificar si quedaron gastos viejos sin backfill:

```sql
select e.id, e.title
from public.expenses e
left join public.expense_payers ep on ep.expense_id = e.id
left join public.expense_splits es on es.expense_id = e.id
where ep.id is null or es.id is null;
```

Si devuelve filas, ejecutar `supabase/schema.sql` completo de nuevo. El archivo incluye el backfill.

Porcentajes quedan para mas adelante.

## Saldar deuda individual

Cada linea de "Para saldar" tiene boton "Saldar". Eso registra un pago real en `settlement_payments` usando los datos del settlement calculado: quien debe, quien recibe y monto.

Ese pago ajusta el balance actual y se sincroniza por realtime. No hay anulacion de pagos todavia; la tabla ya tiene `voided_at` preparado.

Importante:
- "Saldar" registra un pago individual.
- "Cerrar periodo" archiva/ordena periodos.
- Cerrar periodo no fue modificado en esta iteracion y sera revisado despues para contemplar pagos individuales y nuevas estructuras de gasto.

## Tiempo real

Supabase Realtime Broadcast solo avisa cambios al topic `group:<shareToken>`.

El WebSocket no manda gastos, nombres, montos ni participantes. La app recibe `group_changed` y recarga por RPC con `loadGroupByShareToken(shareToken)`.

## Diagnostico antes de indices unicos

Si el schema falla al crear indices por datos viejos duplicados, diagnosticar:

```sql
select group_id, auth_user_id, count(*)
from public.group_memberships
where status = 'active'
group by group_id, auth_user_id
having count(*) > 1;

select group_id, participant_id, count(*)
from public.group_memberships
where status = 'active'
  and participant_id is not null
group by group_id, participant_id
having count(*) > 1;
```

No borrar datos automaticamente. Revocar o limpiar duplicados de prueba antes de crear indices.

## Seguridad actual

No se usa `service_role` en frontend. No hay secrets en el codigo. RLS queda activo y la app opera por RPC `SECURITY DEFINER` con validaciones internas.

## Mejoras futuras

- Google login.
- Magic links.
- Recuperacion de contrasena.
- Confirmacion de email.
- Porcentajes en divisiones.
- Anular pagos registrados.
- Revisar Cerrar periodo con pagos individuales y gastos flexibles.
- Transferir grupos entre usuarios.
- Multiples owners.
- Aprobacion manual de miembros.
- Links de invitacion de un solo uso.
