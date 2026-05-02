# Cuentas Claras

Web app para dividir gastos en grupos permanentes. La app usa Supabase Auth con email y contraseña, memberships por grupo y Supabase Realtime Broadcast para sincronizar cambios.

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

## Usuarios y participantes

Usuario:
- Tiene email y contraseña.
- Puede iniciar sesión desde cualquier dispositivo.
- Recupera “Mis grupos” por memberships activas.

Participante:
- Representa a una persona dentro de un grupo.
- Puede existir sin usuario.
- Sirve para cargar gastos de gente que no usa la app.

Al crear un grupo se pide nombre del grupo y “Tu nombre en este grupo”. Eso crea el participante owner y la membership owner.

## Grupos e invitaciones

- Ruta compartida: `/g/:shareToken`.
- Cualquier persona con el link puede solicitar unirse, pero debe tener cuenta.
- Si no tiene sesión, primero ve la pantalla de Entrar / Crear cuenta y luego sigue en el link.
- Al unirse, elige un participante disponible o crea uno nuevo.
- No puede elegir un participante ya asociado a otro usuario activo.
- El owner puede revocar miembros.
- El owner puede regenerar el link. Links anteriores dejan de servir para nuevos ingresos.

## Diagnóstico antes de índices únicos

Si el schema falla al crear índices por datos viejos duplicados, diagnosticar:

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

No borrar datos automáticamente. Revocar o limpiar duplicados de prueba antes de crear índices.

## Tiempo real

Supabase Realtime Broadcast solo avisa cambios al topic `group:<shareToken>`.

El WebSocket no manda gastos, nombres, montos ni participantes. La app recibe `group_changed` y recarga por RPC con `loadGroupByShareToken(shareToken)`.

## Seguridad actual

No se usa `service_role` en frontend. No hay secrets en el código. RLS queda activo y la app opera por RPC `SECURITY DEFINER` con validaciones internas.

## Mejoras futuras

- Google login.
- Magic links.
- Recuperación de contraseña.
- Confirmación de email.
- Transferir grupos entre usuarios.
- Múltiples owners.
- Aprobación manual de miembros.
- Links de invitación de un solo uso.
