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
   - Authentication > URL Configuration > Redirect URLs:
     - `https://cuentas-five.vercel.app/reset-password`
     - `http://localhost:5173/reset-password`
3. Ejecutar completo `supabase/schema.sql` en SQL Editor.
4. Copiar Project URL y Publishable key.
5. Completar `.env.local`.
6. En Vercel, cargar las mismas variables y redeploy.

Anonymous Auth ya no es necesario para el flujo principal. Puede quedar apagado o sin uso.

## Recuperacion de contrasena

Desde la pantalla de Entrar, el usuario puede tocar "Olvide mi contrasena", ingresar su email y recibir un link de Supabase para restablecerla.

Supabase debe tener configuradas estas Redirect URLs:

```text
https://cuentas-five.vercel.app/reset-password
http://localhost:5173/reset-password
```

Al abrir el link, la app muestra `/reset-password`, pide nueva contrasena y confirmacion, y guarda el cambio con Supabase Auth.

Supabase usa email para enviar el link de recuperacion. En proyectos gratis o de desarrollo puede haber limites de envio; mas adelante conviene configurar SMTP propio.

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

El formulario valida que:
- la suma pagada coincida con el total;
- la suma de division manual coincida con el total;
- haya al menos una persona que pago;
- haya al menos una persona en la division.

En mobile los inputs de dinero se mantienen como texto mientras escribis, para no perder foco ni cerrar el teclado. Los importes formateados aparecen como ayuda fuera del input.

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

Cada deuda tambien permite copiar:
- alias del receptor, si existe;
- monto sin simbolo `$`, listo para pegar en banco o Mercado Pago.

Ese pago ajusta el balance actual y se sincroniza por realtime.

Si se cargo por error, se puede anular desde "Pagos registrados". La anulacion no borra el pago: completa `voided_at` y deja de afectar el balance.

Importante:
- "Saldar" registra un pago individual.
- "Cerrar periodo" archiva gastos y pagos ya saldados.
- Solo se puede cerrar cuando el saldo esta en cero.

## Resumen de saldos

En Resumen:
- "Total gastado" suma los gastos abiertos del periodo.
- "Pendiente por saldar" suma los settlements actuales.

Cuando se registra un pago con "Saldar", "Pendiente por saldar" baja. "Total gastado" no baja porque representa gasto del periodo, no deuda pendiente.

## Cerrar periodo

Cerrar periodo solo esta permitido si no queda nada pendiente por saldar. Si hay settlements, la UI bloquea el boton y la RPC tambien valida la regla.

Al cerrar:
- se crea un `settlement_cycle`;
- se asigna `settlement_cycle_id` a gastos abiertos;
- se asigna `settlement_cycle_id` a pagos individuales activos abiertos.

Los pagos anulados no se archivan como pagos activos ni afectan balances.

En Movimientos > Cierres, cada cierre muestra cantidad de gastos y pagos incluidos. El detalle abre una hoja con gastos, pagos y totales del periodo cerrado.

## Tiempo real

Supabase Realtime Broadcast solo avisa cambios al topic `group:<shareToken>`.

El WebSocket no manda gastos, nombres, montos ni participantes. La app recibe `group_changed` y recarga por RPC con `loadGroupByShareToken(shareToken)`.

## Actividad del grupo

La app registra actividad basica del grupo para dar transparencia sobre quien hizo cada cambio importante. Se ve en Movimientos > Actividad.

Acciones registradas:
- gastos creados, editados y eliminados;
- pagos registrados y anulados;
- cierres de periodo;
- participantes creados y editados;
- miembros revocados;
- miembros aprobados, rechazados y cambios de owner;
- link de invitacion regenerado.

Este registro ayuda a entender que paso en el grupo, pero no es una auditoria legal ni irreversible.

## Personas y ajustes

Personas esta separado en bloques:
- Mi identidad: muestra con que participante entraste y su alias.
- Participantes: personas del grupo, tengan o no usuario.
- Miembros con acceso: usuarios con membresia activa y rol `owner` o `member`.
- Solicitudes pendientes: visible para owners.
- Accesos revocados: visible para owners.
- Posibles duplicados: alerta si datos viejos tienen dos accesos activos para el mismo participante.

Ajustes queda solo para grupo, invitacion, periodo y cuenta. La administracion de miembros vive en Personas.

## Mi perfil y alias

Home incluye `Mi perfil`, con nombre predeterminado y alias predeterminado. Ese alias se usa para prellenar creacion de grupos y solicitudes de acceso.

Dentro de Ajustes, `Mis datos en este grupo` permite cambiar nombre y alias solo para ese grupo. El alias puede seguir el perfil global (`profile`) o quedar personalizado para ese grupo (`custom`). Los participantes editados desde Personas quedan como alias manual (`manual`).

## Invitaciones y roles

Los links de grupo ahora sirven para solicitar acceso, no para entrar directo. Si ya existe al menos un owner activo, una persona nueva queda `pending` hasta que un owner apruebe la solicitud. Si un grupo legacy no tiene ningun owner activo, el primer ingreso queda como owner activo para recuperar administracion.

Roles:
- `owner`: puede aprobar, rechazar, revocar, regenerar link, cerrar periodo y cambiar roles.
- `member`: puede usar el grupo cuando su membresia esta activa.

Puede haber multiples owners. La app y las RPC no permiten quitar ni revocar al ultimo owner activo.

## Detalle de gasto

En Movimientos, cada gasto tiene detalle con total, fecha, modo de pago, modo de division, pagadores, division y resultado de ese gasto (`pagado - adeudado`). Tambien permite editar o eliminar desde el detalle.

## Division por porcentaje

La division de gastos soporta:
- partes iguales;
- montos manuales;
- porcentaje.

El porcentaje se calcula en el formulario y se guarda en `expense_splits.amount_cents`; los balances siguen usando montos finales para no cambiar la logica contable. Para editar mejor, `expense_splits.percentage` conserva el porcentaje usado.

## Buscador y filtros

Movimientos incluye busqueda local y filtros por tipo, participante y fecha (`Hoy`, `Ultimos 7 dias`, `Este mes`). La actividad no aparece en `Todos`; se ve desde el filtro `Actividad`.

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
- Confirmacion de email.
- Porcentajes en divisiones.
- Revisar Cerrar periodo con pagos individuales y gastos flexibles.
- Transferir grupos entre usuarios.
- Links de invitacion de un solo uso.
