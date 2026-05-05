// Cuentas Claras — Screens part 2
// Movimientos, Detalle de gasto, Personas, Ajustes, Detalle de cierre, Empty states

const { useState: useS2 } = React;

// ============================================================
// 7. MOVIMIENTOS
// ============================================================
const ScreenMovimientos = () => {
  const [filter, setFilter] = useS2('todos');
  return (
    <Phone>
      <GroupHeader name="Asado del finde" sub="5 personas" onBack={() => {}}/>
      <div style={{ padding: '0 16px' }}>
        <Tabs value="movs" onChange={() => {}} options={[
          { value: 'resumen', label: 'Resumen' },
          { value: 'movs', label: 'Movimientos' },
          { value: 'personas', label: 'Personas' },
          { value: 'ajustes', label: 'Ajustes' },
        ]}/>
      </div>

      <div style={{ padding: '14px 16px 8px' }}>
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={16} className="" />
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--cc-ink-3)' }}>
            <Icon name="search" size={16}/>
          </span>
          <input className="cc-input" placeholder="Buscar movimiento" style={{ paddingLeft: 40, height: 44 }}/>
        </div>
        <div style={{ display: 'flex', gap: 6, overflow: 'auto', padding: '12px 0 4px', margin: '0 -2px' }}>
          {['Todos', 'Gastos', 'Pagos', 'Cierres', 'Actividad'].map((l, i) => (
            <Chip key={l} active={filter === l.toLowerCase()} onClick={() => setFilter(l.toLowerCase())}>{l}</Chip>
          ))}
          <button className="cc-chip" style={{ background: 'transparent' }}><Icon name="filter" size={13}/> Filtros</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 100px' }}>
        <DayLabel>Hoy · 5 may</DayLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MovCard kind="expense" title="Sushi" by="Pagó Flor" amount={12500} when="14:32"/>
          <MovCard kind="payment" title="Saldó deuda" by="Tomi le pagó a Flor" amount={6000} when="13:10"/>
        </div>

        <DayLabel>Ayer · 4 may</DayLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MovCard kind="expense" title="Almuerzo" by="Pagó Tomi · Partes iguales" amount={57000} when="13:45"/>
          <MovCard kind="activity" title="Ruso se unió al grupo" by="Aprobado por Flor" when="12:02"/>
        </div>

        <DayLabel>3 may</DayLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MovCard kind="expense" title="Carne y carbón" by="Pagó Flor · 5 personas" amount={32400} when="19:20"/>
          <MovCard kind="payment" title="Pago anulado" by="Saldo de Ruso a Flor" amount={4000} when="18:00" voided/>
          <MovCard kind="closure" title="Cierre del período" by="3 personas · ARS · USD" when="11:00"/>
        </div>
      </div>

      <BottomBar>
        <Button block leftIcon="plus">Agregar gasto</Button>
      </BottomBar>
    </Phone>
  );
};

const DayLabel = ({ children }) => (
  <div style={{
    fontSize: 12, fontWeight: 600, color: 'var(--cc-ink-3)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    margin: '14px 4px 8px',
  }}>{children}</div>
);

const MovCard = ({ kind, title, by, amount, when, voided }) => {
  const palette = {
    expense:  { bg: 'var(--cc-surface)',       icon: 'receipt',  ring: 'var(--cc-line)',     iconBg: 'var(--cc-surface-2)', iconFg: 'var(--cc-ink-2)' },
    payment:  { bg: 'var(--cc-surface)',       icon: 'arrow-r',  ring: 'var(--cc-line)',     iconBg: 'var(--cc-positive-soft)', iconFg: '#3D5226' },
    closure:  { bg: 'var(--cc-surface)',       icon: 'lock-closed', ring: 'var(--cc-line)',  iconBg: 'var(--cc-info-soft)', iconFg: '#234B61' },
    activity: { bg: 'transparent',             icon: 'dot',      ring: 'transparent',        iconBg: 'var(--cc-surface-2)', iconFg: 'var(--cc-ink-3)' },
  }[kind];
  return (
    <div style={{
      background: palette.bg,
      border: `1px solid ${palette.ring}`,
      borderRadius: 14,
      padding: kind === 'activity' ? '10px 12px' : 12,
      display: 'flex', alignItems: 'center', gap: 12,
      opacity: voided ? 0.55 : 1,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: palette.iconBg, color: palette.iconFg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon name={palette.icon} size={16}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, textDecoration: voided ? 'line-through' : undefined }}>{title}</div>
          {voided && <Badge tone="negative">Anulado</Badge>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', marginTop: 2 }}>{by} · {when}</div>
      </div>
      {amount != null && (
        <div className="num" style={{
          fontSize: 14, fontWeight: 600,
          color: kind === 'payment' ? '#3D5226' : 'var(--cc-ink)',
          textDecoration: voided ? 'line-through' : undefined,
        }}>
          {kind === 'payment' ? '+' : ''}{fmt(amount, 'ARS').replace('−','')}
        </div>
      )}
    </div>
  );
};

// ============================================================
// 8. DETALLE DE GASTO (sheet)
// ============================================================
const ScreenExpenseDetail = () => (
  <Phone>
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(31,27,22,0.45)' }}/>
    <div className="cc-sheet" style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      maxHeight: '90%', overflow: 'auto', paddingBottom: 110,
    }}>
      <div className="cc-sheet-handle"/>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <Badge tone="neutral">Gasto · 4 may, 13:45</Badge>
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 8 }}>Almuerzo</div>
          <div className="num" style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.025em', marginTop: 4 }}>$ 57.000,00</div>
          <div style={{ fontSize: 13, color: 'var(--cc-ink-3)', marginTop: 2 }}>ARS · partes iguales</div>
        </div>
        <button style={closeBtn}><Icon name="x" size={16}/></button>
      </div>

      {/* Pagaron */}
      <div style={{ marginTop: 22 }}>
        <div className="cc-section-h" style={{ marginBottom: 8 }}>Pagó</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--cc-surface)', borderRadius: 14, border: '1px solid var(--cc-line)' }}>
          <Avatar name="Tomi" size={36}/>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Tomi</div>
          <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>$ 57.000,00</div>
        </div>
      </div>

      {/* División */}
      <div style={{ marginTop: 18 }}>
        <div className="cc-section-h" style={{ marginBottom: 8 }}>Se divide entre</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {['Flor','Tomi','Ruso','Santi','Sasa'].map(n => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--cc-surface)', borderRadius: 12, border: '1px solid var(--cc-line)' }}>
              <Avatar name={n} size={28}/>
              <div style={{ flex: 1, fontSize: 14 }}>{n}</div>
              <div className="num" style={{ fontSize: 13, color: 'var(--cc-ink-2)' }}>$ 11.400,00</div>
              <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', minWidth: 36, textAlign: 'right' }}>20%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Resultado */}
      <div style={{ marginTop: 18 }}>
        <div className="cc-section-h" style={{ marginBottom: 8 }}>Resultado</div>
        <div className="cc-card" style={{ padding: 12 }}>
          <ResultRow name="Tomi" delta={45600}/>
          <div className="cc-divider" style={{ margin: '8px 0' }}/>
          {['Flor','Ruso','Santi','Sasa'].map(n => <ResultRow key={n} name={n} delta={-11400}/>)}
        </div>
      </div>

      {/* Actividad */}
      <div style={{ marginTop: 18 }}>
        <div className="cc-section-h" style={{ marginBottom: 8 }}>Actividad</div>
        <div style={{ fontSize: 13, color: 'var(--cc-ink-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>· <b>Tomi</b> cargó este gasto · ayer 13:45</div>
          <div>· <b>Flor</b> editó la división · ayer 14:02</div>
        </div>
      </div>
    </div>

    <BottomBar>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="danger" leftIcon="trash">Eliminar</Button>
        <Button variant="secondary" leftIcon="edit" block>Editar</Button>
      </div>
    </BottomBar>
  </Phone>
);

const ResultRow = ({ name, delta }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
    <Avatar name={name} size={24}/>
    <div style={{ flex: 1, fontSize: 13 }}>{name} queda</div>
    <div className="num" style={{
      fontSize: 14, fontWeight: 600,
      color: delta > 0 ? '#3D5226' : 'var(--cc-negative)',
    }}>
      {delta > 0 ? '+' : '−'} ${' '}
      {Math.abs(delta).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
    </div>
  </div>
);

// ============================================================
// 9. PERSONAS
// ============================================================
const ScreenPersonas = () => (
  <Phone>
    <GroupHeader name="Asado del finde" sub="5 personas" onBack={() => {}}/>
    <div style={{ padding: '0 16px' }}>
      <Tabs value="personas" onChange={() => {}} options={[
        { value: 'resumen', label: 'Resumen' },
        { value: 'movs', label: 'Movimientos' },
        { value: 'personas', label: 'Personas' },
        { value: 'ajustes', label: 'Ajustes' },
      ]}/>
    </div>

    <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 100px' }}>
      {/* Mi identidad */}
      <SettingsBlock title="Mi identidad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
          <Avatar name="Flor" size={44}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Entraste como Flor</div>
            <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', marginTop: 2 }}>Alias: flor.mp</div>
          </div>
          <Button variant="secondary" size="sm">Cambiar</Button>
        </div>
      </SettingsBlock>

      {/* Participantes */}
      <SettingsBlock
        title="Participantes"
        action={<Badge tone="neutral">5</Badge>}
        sub="Pueden existir aunque no tengan usuario."
      >
        <PersonRow name="Flor" tag="Vos" status="active" alias="flor.mp"/>
        <PersonRow name="Tomi" status="active" alias="tomi.mp"/>
        <PersonRow name="Ruso" status="active" alias="—"/>
        <PersonRow name="Santi" status="active" alias="santi.mp"/>
        <PersonRow name="Sasa" status="inactive" alias="—"/>

        <div style={{ padding: 12, borderTop: '1px solid var(--cc-line)' }}>
          <Button variant="ghost" leftIcon="plus" size="sm" block>Agregar participante</Button>
        </div>
      </SettingsBlock>

      {/* Miembros con acceso */}
      <SettingsBlock title="Miembros con acceso">
        <AccessRow name="Flor" role="owner" last="hoy 09:14" you/>
        <AccessRow name="Tomi" role="member" last="ayer 22:08"/>
        <AccessRow name="Ruso" role="member" last="hace 3 días"/>
      </SettingsBlock>

      {/* Solicitudes */}
      <SettingsBlock title="Solicitudes pendientes" action={<Badge tone="warning">1</Badge>}>
        <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name="Pau" size={36}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Pau</div>
            <div style={{ fontSize: 12, color: 'var(--cc-ink-3)' }}>pau@mail.com · pidió acceso hoy</div>
          </div>
          <Button size="sm" variant="secondary">Rechazar</Button>
          <Button size="sm">Aprobar</Button>
        </div>
      </SettingsBlock>

      {/* Posibles duplicados */}
      <SettingsBlock title="Posibles duplicados" sub="Detectamos nombres parecidos.">
        <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex' }}>
            <Avatar name="Tomi" size={32}/>
            <div style={{ marginLeft: -10 }}><Avatar name="Tomas" size={32}/></div>
          </div>
          <div style={{ flex: 1, fontSize: 13 }}>
            <b>Tomi</b> y <b>Tomas</b> · ¿Son la misma persona?
          </div>
          <Button size="sm" variant="ghost">Revisar</Button>
        </div>
      </SettingsBlock>
    </div>

    <BottomBar>
      <Button block leftIcon="plus">Agregar gasto</Button>
    </BottomBar>
  </Phone>
);

const SettingsBlock = ({ title, sub, action, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 8 }}>
      <div>
        <div className="cc-section-h">{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
    <div style={{ background: 'var(--cc-surface)', border: '1px solid var(--cc-line)', borderRadius: 16, overflow: 'hidden' }}>
      {children}
    </div>
  </div>
);

const PersonRow = ({ name, tag, alias, status }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderTop: '1px solid var(--cc-line)' }}>
    <Avatar name={name} size={36}/>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
        {tag && <Badge tone="info">{tag}</Badge>}
        {status === 'inactive' && <Badge tone="neutral">Inactivo</Badge>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', marginTop: 2 }}>Alias: {alias}</div>
    </div>
    <button style={moreBtn}><Icon name="more" size={16}/></button>
  </div>
);
const moreBtn = {
  width: 32, height: 32, borderRadius: 10, border: 0,
  background: 'transparent', color: 'var(--cc-ink-3)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const AccessRow = ({ name, role, last, you }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderTop: '1px solid var(--cc-line)' }}>
    <Avatar name={name} size={36}/>
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
        <Badge tone={role === 'owner' ? 'warning' : 'neutral'}>{role}</Badge>
        {you && <Badge tone="info">Vos</Badge>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', marginTop: 2 }}>Último acceso · {last}</div>
    </div>
    <button style={moreBtn}><Icon name="more" size={16}/></button>
  </div>
);

// ============================================================
// 10. AJUSTES
// ============================================================
const ScreenAjustes = () => (
  <Phone>
    <GroupHeader name="Asado del finde" sub="5 personas" onBack={() => {}}/>
    <div style={{ padding: '0 16px' }}>
      <Tabs value="ajustes" onChange={() => {}} options={[
        { value: 'resumen', label: 'Resumen' },
        { value: 'movs', label: 'Movimientos' },
        { value: 'personas', label: 'Personas' },
        { value: 'ajustes', label: 'Ajustes' },
      ]}/>
    </div>

    <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 100px' }}>
      <SettingsBlock title="Mis datos en este grupo">
        <RowItem label="Nombre" value="Flor" trailing={<Icon name="chevron-r" size={14} color="var(--cc-ink-3)"/>}/>
        <RowItem label="Alias" value="flor.mp" trailing={<Icon name="chevron-r" size={14} color="var(--cc-ink-3)"/>}/>
        <RowItem label="Usar alias predeterminado" trailing={<Toggle on/>}/>
      </SettingsBlock>

      <SettingsBlock title="Acceso al grupo">
        <div style={{ padding: 14, borderBottom: '1px solid var(--cc-line)' }}>
          <div style={{ fontSize: 13, color: 'var(--cc-ink-2)', marginBottom: 8 }}>
            Compartí el link y aprobá quién entra.
          </div>
          <div style={{
            background: 'var(--cc-surface-2)', borderRadius: 12, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12, fontFamily: 'var(--cc-font-mono)', color: 'var(--cc-ink-2)',
          }}>
            <Icon name="link" size={14}/>
            <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>cuentas.cc/g/asadofin-7e2k9</div>
            <button style={{ background: 'transparent', border: 0, color: 'var(--cc-primary)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Copiar</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button variant="secondary" size="sm">Regenerar link</Button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', marginTop: 10 }}>
            Las personas con este link deberán solicitar acceso. Las solicitudes se aprueban desde Personas.
          </div>
        </div>
      </SettingsBlock>

      <SettingsBlock title="Gestión del período">
        <div style={{ padding: 14 }}>
          <Banner tone="warning" title="No podés cerrar todavía">
            Tenés <b>3 deudas</b> sin saldar en ARS. Saldá todo para cerrar el período.
          </Banner>
          <div style={{ marginTop: 12 }}>
            <Button block disabled>Cerrar período</Button>
          </div>
        </div>
      </SettingsBlock>

      <SettingsBlock title="Cuenta">
        <RowItem label="Cerrar sesión" tone="danger" trailing={<Icon name="logout" size={14} color="var(--cc-negative)"/>}/>
        <RowItem label="Volver a Mis grupos" trailing={<Icon name="chevron-r" size={14} color="var(--cc-ink-3)"/>}/>
      </SettingsBlock>
    </div>
  </Phone>
);

const RowItem = ({ label, value, trailing, tone }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px',
    borderTop: '1px solid var(--cc-line)',
    cursor: 'pointer',
  }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: tone === 'danger' ? 'var(--cc-negative)' : 'var(--cc-ink)' }}>{label}</div>
      {value && <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', marginTop: 2 }}>{value}</div>}
    </div>
    {trailing}
  </div>
);

const Toggle = ({ on }) => (
  <div style={{
    width: 44, height: 26, borderRadius: 999,
    background: on ? 'var(--cc-primary)' : 'var(--cc-line-strong)',
    position: 'relative', transition: 'background 0.15s',
  }}>
    <div style={{
      position: 'absolute', top: 3, left: on ? 21 : 3,
      width: 20, height: 20, borderRadius: '50%',
      background: 'white',
      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      transition: 'left 0.15s',
    }}/>
  </div>
);

// ============================================================
// 11. DETALLE DE CIERRE
// ============================================================
const ScreenCierre = () => (
  <Phone>
    <GroupHeader name="Cierre · 30 abr" sub="Asado del finde" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 24px' }}>
      <div className="cc-card" style={{ padding: 16 }}>
        <Badge tone="info">ARS</Badge>
        <div className="num" style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.025em', marginTop: 6 }}>$ 287.500,00</div>
        <div style={{ fontSize: 13, color: 'var(--cc-ink-3)', marginTop: 2 }}>Total gastado en el período</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
          <StatTile label="Gastos" value="14"/>
          <StatTile label="Pagos" value="5"/>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="cc-section-h" style={{ marginBottom: 8 }}>Highlights</div>
        <div className="cc-card" style={{ padding: 0, overflow: 'hidden' }}>
          <HighlightRow name="Flor" label="Pagó más" amount="$ 102.300,00" tone="info"/>
          <HighlightRow name="Ruso" label="Consumió más" amount="$ 78.500,00" tone="warning"/>
          <HighlightRow name="—" label="Gasto más alto" amount="$ 57.000 · Almuerzo" tone="neutral" last/>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="cc-section-h" style={{ marginBottom: 8 }}>USD</div>
        <div className="cc-card" style={{ padding: 14 }}>
          <div className="num" style={{ fontSize: 20, fontWeight: 600 }}>US$ 240,00</div>
          <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', marginTop: 2 }}>3 gastos · 1 pago</div>
          <Button variant="ghost" size="sm" rightIcon="chevron-r" style={{ marginTop: 8 }}>Ver detalle USD</Button>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="cc-section-h" style={{ marginBottom: 8 }}>Pagos incluidos</div>
        <div className="cc-card" style={{ padding: 0, overflow: 'hidden' }}>
          {[['Tomi','Flor',6000],['Ruso','Flor',12500],['Santi','Tomi',4500]].map(([f,t,a],i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderTop: i ? '1px solid var(--cc-line)' : 0 }}>
              <Avatar name={f} size={28}/>
              <Icon name="arrow-r" size={12} color="var(--cc-ink-3)"/>
              <Avatar name={t} size={28}/>
              <div style={{ flex: 1, fontSize: 13 }}><b>{f}</b> a <b>{t}</b></div>
              <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(a, 'ARS').replace('−','')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </Phone>
);

const StatTile = ({ label, value }) => (
  <div style={{ background: 'var(--cc-surface-2)', borderRadius: 12, padding: 12 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--cc-ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{value}</div>
  </div>
);

const HighlightRow = ({ name, label, amount, tone, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: last ? 0 : '1px solid var(--cc-line)' }}>
    {name !== '—' ? <Avatar name={name} size={32}/> : (
      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--cc-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cc-ink-3)' }}>
        <Icon name="receipt" size={14}/>
      </div>
    )}
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 1 }}>{name !== '—' ? name : amount}</div>
    </div>
    {name !== '—' && <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{amount}</div>}
  </div>
);

// ============================================================
// 12. EMPTY / ERROR STATES
// ============================================================
const ScreenEmpties = () => (
  <Phone>
    <div style={{ padding: '8px 20px' }}>
      <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Estados</div>
      <div style={{ fontSize: 13, color: 'var(--cc-ink-3)' }}>Vacíos, errores y casos límite.</div>
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <EmptyTile>
        <Empty icon="users" title="Todavía no tenés grupos"
          body="Creá uno para empezar a dividir gastos: cena, viaje, casa compartida."
          action={<Button leftIcon="plus">Crear grupo</Button>}/>
      </EmptyTile>

      <EmptyTile>
        <Empty icon="receipt" title="Sin gastos todavía"
          body="Cargá el primer gasto y empezamos a calcular cómo se divide."
          action={<Button>Agregar gasto</Button>}/>
      </EmptyTile>

      <EmptyTile>
        <Empty icon="check" title="Todo saldado"
          body="No hay deudas pendientes. Buen momento para cerrar el período."
          action={<Button variant="secondary">Cerrar período</Button>}/>
      </EmptyTile>

      <EmptyTile>
        <Empty icon="search" title="Sin resultados"
          body="Probá con otro término o sacá los filtros."/>
      </EmptyTile>

      <EmptyTile>
        <Empty icon="history" title="Sin actividad reciente"
          body="Cuando alguien cargue un gasto o salde una deuda, lo vas a ver acá."/>
      </EmptyTile>

      <EmptyTile>
        <Empty icon="users" title="Sin solicitudes"
          body="Cuando alguien pida acceso al grupo, lo vamos a mostrar acá."/>
      </EmptyTile>

      <EmptyTile>
        <div style={{ padding: 16 }}>
          <Banner tone="error" title="No pudimos sincronizar">
            Revisá tu conexión y volvé a intentar. Tus cambios locales se guardaron.
          </Banner>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="secondary" block>Reintentar</Button>
            <Button block>Trabajar offline</Button>
          </div>
        </div>
      </EmptyTile>

      <EmptyTile>
        <div style={{ padding: 16 }}>
          <Banner tone="error" title="Link inválido o vencido">
            Pedile a un owner del grupo que vuelva a generar el link de invitación.
          </Banner>
        </div>
      </EmptyTile>

      <EmptyTile>
        <div style={{ padding: 16 }}>
          <Banner tone="warning" title="Acceso pendiente">
            Tu solicitud está en revisión. Te avisamos cuando un owner la apruebe.
          </Banner>
        </div>
      </EmptyTile>

      <EmptyTile>
        <div style={{ padding: 16 }}>
          <Banner tone="error" title="Acceso revocado">
            Un owner removió tu acceso a este grupo. Si pensás que fue un error, escribile.
          </Banner>
        </div>
      </EmptyTile>
    </div>
  </Phone>
);

const EmptyTile = ({ children }) => (
  <div style={{ background: 'var(--cc-surface)', border: '1px solid var(--cc-line)', borderRadius: 16, overflow: 'hidden' }}>
    {children}
  </div>
);

Object.assign(window, {
  ScreenMovimientos, ScreenExpenseDetail, ScreenPersonas, ScreenAjustes, ScreenCierre, ScreenEmpties,
  DayLabel, MovCard, ResultRow, SettingsBlock, PersonRow, AccessRow, RowItem, Toggle,
  StatTile, HighlightRow, EmptyTile,
});
