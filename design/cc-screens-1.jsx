// Cuentas Claras — Screens
// All screens render inside a fixed mobile viewport (390 × 844, iPhone-ish).
// Each screen exports a single component into window.

const { useState: useS } = React;

// ——— Phone shell (no full iOS chrome — just the canvas) ———
const Phone = ({ children, statusBar = true, label }) => (
  <div className="cc-app" style={{
    width: 390, height: 844,
    background: 'var(--cc-bg)',
    overflow: 'hidden',
    position: 'relative',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--cc-font-sans)',
  }}>
    {statusBar && <StatusBar/>}
    {children}
  </div>
);

const StatusBar = () => (
  <div style={{
    height: 44, padding: '0 24px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 15, fontWeight: 600, color: 'var(--cc-ink)',
    flexShrink: 0,
  }}>
    <span>9:41</span>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: 0.85 }}>
      {/* signal */}
      <svg width="18" height="11" viewBox="0 0 18 11"><g fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="0.5"/><rect x="5" y="5" width="3" height="6" rx="0.5"/><rect x="10" y="2" width="3" height="9" rx="0.5"/><rect x="15" y="0" width="3" height="11" rx="0.5"/></g></svg>
      {/* wifi */}
      <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><path d="M8 0C5 0 2.3 1 0 3l1.4 1.4A8.5 8.5 0 0 1 8 2c2.5 0 4.7.9 6.6 2.4L16 3A11.5 11.5 0 0 0 8 0zm0 4c-1.8 0-3.4.6-4.6 1.6l1.4 1.4A4.5 4.5 0 0 1 8 6c1.2 0 2.3.4 3.2 1.1l1.4-1.5C11.4 4.6 9.7 4 8 4zm0 4a2.5 2.5 0 0 0-1.8.7L8 11l1.8-1.8A2.5 2.5 0 0 0 8 8z"/></svg>
      {/* battery */}
      <svg width="26" height="12" viewBox="0 0 26 12"><rect x="0.5" y="0.5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="19" height="8" rx="1.5" fill="currentColor"/><rect x="23" y="4" width="2" height="4" rx="1" fill="currentColor" opacity="0.4"/></svg>
    </div>
  </div>
);

// ——— Group header (used inside group screens) ———
const GroupHeader = ({ name = 'Asado del finde', sub, onBack, right }) => (
  <div style={{
    padding: '8px 16px 12px',
    display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
  }}>
    {onBack && (
      <button onClick={onBack} style={{
        width: 36, height: 36, borderRadius: 12, border: 0,
        background: 'var(--cc-surface)',
        boxShadow: 'inset 0 0 0 1px var(--cc-line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'var(--cc-ink)',
      }}><Icon name="chevron-l" size={18}/></button>
    )}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="serif" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{name}</div>
      {sub && <div style={{ fontSize: 13, color: 'var(--cc-ink-3)', marginTop: 2 }}>{sub}</div>}
    </div>
    {right}
  </div>
);

// ——— Sticky bottom CTA bar ———
const BottomBar = ({ children }) => (
  <div className="cc-bottombar" style={{
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingBottom: 22,
  }}>
    {children}
  </div>
);

// ============================================================
// 1. LOGIN / CREAR CUENTA
// ============================================================
const ScreenLogin = () => {
  const [tab, setTab] = useS('login');
  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', overflow: 'auto' }}>
        {/* Logo + claim */}
        <div style={{ marginTop: 32, marginBottom: 28 }}>
          <Logo/>
          <div className="serif" style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.025em', marginTop: 18 }}>
            {tab === 'login' ? 'Bienvenido' : 'Creá tu cuenta'}
          </div>
          <div style={{ fontSize: 15, color: 'var(--cc-ink-2)', marginTop: 6, lineHeight: 1.4 }}>
            Dividí gastos de grupos sin vueltas.
          </div>
        </div>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[{ value: 'login', label: 'Entrar' }, { value: 'signup', label: 'Crear cuenta' }]}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
          {tab === 'signup' && (
            <Field label="Tu nombre">
              <Input placeholder="Flor"/>
            </Field>
          )}
          <Field label="Email">
            <Input placeholder="vos@mail.com" type="email"/>
          </Field>
          <Field label="Contraseña" helper={tab === 'signup' ? 'Mínimo 8 caracteres.' : undefined}>
            <Input placeholder="••••••••" type="password"/>
          </Field>
          {tab === 'signup' && (
            <Field label="Alias de pago" helper="Lo vas a poder cambiar por grupo si usás otro medio.">
              <Input placeholder="flor.mp · opcional"/>
            </Field>
          )}
        </div>

        <div style={{ flex: 1 }}/>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24, paddingBottom: 24 }}>
          <Button block>{tab === 'login' ? 'Entrar' : 'Crear cuenta'}</Button>
          {tab === 'login' && (
            <Button variant="ghost" block>Olvidé mi contraseña</Button>
          )}
          <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', textAlign: 'center', marginTop: 4 }}>
            Al continuar aceptás los términos y la política de privacidad.
          </div>
        </div>
      </div>
    </Phone>
  );
};

const Logo = ({ size = 'md' }) => {
  const s = size === 'sm' ? 28 : 36;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: s, height: s, borderRadius: 10,
        background: 'var(--cc-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <div style={{
          width: s * 0.45, height: s * 0.45, borderRadius: '50%',
          border: '2.5px solid var(--cc-ink-on)',
          borderRightColor: 'transparent',
          transform: 'rotate(-45deg)',
        }}/>
      </div>
      <div style={{
        fontSize: 13, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--cc-ink-2)',
      }}>Cuentas Claras</div>
    </div>
  );
};

// ============================================================
// 2. RECUPERAR CONTRASEÑA
// ============================================================
const ScreenRecover = () => (
  <Phone>
    <div style={{ padding: '8px 16px 0' }}>
      <button style={{
        width: 36, height: 36, borderRadius: 12, border: 0,
        background: 'var(--cc-surface)',
        boxShadow: 'inset 0 0 0 1px var(--cc-line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}><Icon name="chevron-l" size={18}/></button>
    </div>
    <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
      <div className="serif" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.02em', marginTop: 8 }}>
        Recuperar contraseña
      </div>
      <div style={{ fontSize: 15, color: 'var(--cc-ink-2)', marginTop: 8, lineHeight: 1.45 }}>
        Te mandamos un link para recuperarla. Fijate también en spam si no llega.
      </div>
      <div style={{ marginTop: 24 }}>
        <Field label="Email de tu cuenta">
          <Input placeholder="vos@mail.com" type="email"/>
        </Field>
      </div>

      <div style={{ marginTop: 24 }}>
        <Banner tone="positive" title="Te enviamos un link">
          Revisá <b>vos@mail.com</b>. El link vence en 30 minutos.
        </Banner>
      </div>

      <div style={{ flex: 1 }}/>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 24 }}>
        <Button block>Enviar link</Button>
        <Button variant="ghost" block>Volver a entrar</Button>
      </div>
    </div>
  </Phone>
);

// ============================================================
// 3. HOME
// ============================================================
const SAMPLE_GROUPS = [
  { name: 'Asado del finde', members: 5, you: 'pendiente', amount: -8400, currency: 'ARS', last: 'Cargado hace 2 horas' },
  { name: 'Casa Palermo', members: 3, you: 'positivo', amount: 12500, currency: 'ARS', last: 'Movimiento ayer' },
  { name: 'Bariloche · Julio', members: 6, you: 'saldado', amount: 0, currency: 'USD', last: 'Cerrado hace 3 días' },
  { name: 'Cumple Tomi', members: 4, you: 'pendiente', amount: -4200, currency: 'ARS', last: 'Movimiento el martes' },
];

const ScreenHome = () => (
  <Phone>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '8px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo size="sm"/>
        <button style={{
          width: 40, height: 40, borderRadius: '50%',
          border: 0, background: 'var(--cc-surface)',
          boxShadow: 'inset 0 0 0 1px var(--cc-line)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Avatar name="Flor" size={32}/>
        </button>
      </div>

      <div style={{ padding: '0 20px' }}>
        <div className="serif" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.025em' }}>Hola, Flor</div>
        <div style={{ fontSize: 15, color: 'var(--cc-ink-2)', marginTop: 4 }}>Tenés <b>3 grupos</b> activos · 1 con saldo a favor.</div>
      </div>

      {/* Profile card */}
      <div style={{ padding: '20px 16px 0' }}>
        <div className="cc-card" style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'center' }}>
          <Avatar name="Flor" size={48}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Flor</div>
            <div style={{ fontSize: 13, color: 'var(--cc-ink-3)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
              <Icon name="wallet" size={13}/> flor.mp
            </div>
          </div>
          <Button variant="secondary" size="sm">Editar</Button>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <SectionH action={
          <button style={{ background: 'transparent', border: 0, color: 'var(--cc-primary)', fontWeight: 500, fontSize: 13, cursor: 'pointer', padding: 0 }}>
            + Crear grupo
          </button>
        }>Mis grupos</SectionH>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px 0' }}>
          {SAMPLE_GROUPS.map(g => <GroupCard key={g.name} g={g}/>)}
        </div>
      </div>

      <div style={{ padding: '24px 16px 8px' }}>
        <button style={{
          width: '100%', padding: '14px 16px',
          background: 'transparent',
          border: '1.5px dashed var(--cc-line-strong)',
          borderRadius: 'var(--cc-r-lg)',
          color: 'var(--cc-ink-2)',
          fontSize: 14, fontWeight: 500, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Icon name="plus" size={16}/> Crear nuevo grupo
        </button>
      </div>

      <div style={{ padding: '16px 20px', textAlign: 'center' }}>
        <button style={{ background: 'transparent', border: 0, color: 'var(--cc-ink-3)', fontSize: 13, cursor: 'pointer' }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  </Phone>
);

const GroupCard = ({ g }) => {
  const tone = g.you === 'positivo' ? 'positive' : g.you === 'pendiente' ? 'negative' : 'neutral';
  const stateLabel = g.you === 'positivo' ? `Te deben ${fmt(g.amount, g.currency)}` :
                     g.you === 'pendiente' ? `Debés ${fmt(Math.abs(g.amount), g.currency)}` :
                     'Saldado';
  return (
    <div className="cc-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'var(--cc-surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--cc-ink-2)', flexShrink: 0,
      }}>
        <Icon name="users" size={20}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{g.name}</div>
        <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>{g.members} personas</span>
          <span>·</span>
          <span>{g.last}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <Badge tone={tone}>{stateLabel}</Badge>
      </div>
    </div>
  );
};

// ============================================================
// 4. CREAR GRUPO
// ============================================================
const ScreenCreate = () => (
  <Phone>
    <GroupHeader name="Nuevo grupo" sub="Cargá los datos básicos." onBack={() => {}}/>
    <div style={{ flex: 1, padding: '8px 20px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Field label="Nombre del grupo" helper="Ej: Cena viernes, Viaje, Casa compartida.">
        <Input placeholder="Cena viernes"/>
      </Field>
      <Field label="Tu nombre en este grupo">
        <Input defaultValue="Flor"/>
      </Field>
      <Field label="Alias de pago en este grupo" helper="Podés cambiar tu alias por grupo si usás otro medio de pago.">
        <Input placeholder="Ej: flor.mp"/>
      </Field>

      <div style={{ marginTop: 8 }}>
        <Banner tone="info">
          Vas a poder invitar al resto con un link cuando termines de crearlo.
        </Banner>
      </div>
    </div>
    <BottomBar>
      <Button block>Crear grupo</Button>
    </BottomBar>
  </Phone>
);

// ============================================================
// 5. RESUMEN (Detalle de grupo)
// ============================================================
const ScreenResumen = () => (
  <Phone>
    <GroupHeader name="Asado del finde" sub="5 personas · creado hace 4 días"
      onBack={() => {}}
      right={
        <button style={{
          height: 36, padding: '0 12px', borderRadius: 999,
          background: 'var(--cc-surface)', border: 0,
          boxShadow: 'inset 0 0 0 1px var(--cc-line)',
          fontSize: 13, fontWeight: 500, color: 'var(--cc-ink-2)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}><Icon name="link" size={14}/> Invitar</button>
      }/>

    <div style={{ padding: '0 16px' }}>
      <Tabs value="resumen" onChange={() => {}} options={[
        { value: 'resumen', label: 'Resumen' },
        { value: 'movs', label: 'Movimientos' },
        { value: 'personas', label: 'Personas' },
        { value: 'ajustes', label: 'Ajustes' },
      ]}/>
    </div>

    <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px' }}>
      {/* Hero metric */}
      <div className="cc-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div className="cc-section-h">Tu balance</div>
          <Badge tone="negative">Debés</Badge>
        </div>
        <div className="num" style={{ fontSize: 42, fontWeight: 600, letterSpacing: '-0.03em', marginTop: 6, color: 'var(--cc-negative)' }}>
          − $ 8.400,00
        </div>
        <div style={{ fontSize: 13, color: 'var(--cc-ink-3)', marginTop: 2 }}>
          en 1 deuda · ARS
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button style={miniMetric}><div style={miniMetricLabel}>Total gastado</div><div className="num" style={miniMetricValue}>$ 150.300</div></button>
          <button style={miniMetric}><div style={miniMetricLabel}>Pendiente</div><div className="num" style={miniMetricValue}>$ 75.150</div></button>
          <button style={miniMetric}><div style={miniMetricLabel}>Movimientos</div><div className="num" style={miniMetricValue}>12</div></button>
        </div>
      </div>

      {/* Para saldar */}
      <div style={{ marginTop: 22, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
        <span className="cc-section-h">Para saldar · ARS</span>
        <button style={{ background: 'transparent', border: 0, fontSize: 12, color: 'var(--cc-primary)', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="copy" size={12}/> Copiar resumen
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <DebtCard from="Tú" to="Flor" amount={8400} alias="flor.mp" highlight/>
        <DebtCard from="Ruso" to="Flor" amount={37575} alias="flor.mp"/>
        <DebtCard from="Santi" to="Tomi" amount={19425} alias="tomi.mp"/>
      </div>

      {/* USD section */}
      <div style={{ marginTop: 22, marginBottom: 8, padding: '0 4px' }}>
        <span className="cc-section-h">Para saldar · USD</span>
      </div>
      <div className="cc-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cc-positive-soft)', color: '#3D5226', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={16}/>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Todo saldado en USD</div>
          <div style={{ fontSize: 12, color: 'var(--cc-ink-3)' }}>Última deuda saldada el 28/04</div>
        </div>
      </div>
    </div>

    <BottomBar>
      <Button block leftIcon="plus">Agregar gasto</Button>
    </BottomBar>
  </Phone>
);

const miniMetric = {
  flex: 1, background: 'transparent', border: 0,
  padding: 10, borderRadius: 12,
  textAlign: 'left', cursor: 'pointer',
  background: 'var(--cc-surface-2)',
};
const miniMetricLabel = { fontSize: 11, color: 'var(--cc-ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 };
const miniMetricValue = { fontSize: 15, fontWeight: 600, marginTop: 2, color: 'var(--cc-ink)' };

const DebtCard = ({ from, to, amount, alias, highlight }) => (
  <div style={{
    background: highlight ? 'var(--cc-primary-soft)' : 'var(--cc-surface)',
    border: highlight ? '1px solid #E8C2AE' : '1px solid var(--cc-line)',
    borderRadius: 16,
    padding: 14,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Avatar name={from} size={32}/>
      <Icon name="arrow-r" size={14} color="var(--cc-ink-3)"/>
      <Avatar name={to} size={32}/>
      <div style={{ flex: 1 }}/>
      <div className="num" style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: highlight ? 'var(--cc-primary-ink)' : 'var(--cc-ink)' }}>
        {fmt(amount, 'ARS').replace('−','')}
      </div>
    </div>
    <div style={{ fontSize: 13, marginTop: 8, color: highlight ? 'var(--cc-primary-ink)' : 'var(--cc-ink-2)' }}>
      <b>{from === 'Tú' ? 'Le pagás' : `${from} le paga`}</b> a <b>{to}</b>
    </div>
    <div style={{ fontSize: 12, color: highlight ? 'var(--cc-primary-ink)' : 'var(--cc-ink-3)', marginTop: 2, opacity: 0.85 }}>
      Alias: {alias}
    </div>
    <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
      <DebtAction icon="copy">Alias</DebtAction>
      <DebtAction icon="copy">Monto</DebtAction>
      <DebtAction icon="wallet">Mercado Pago</DebtAction>
      <button style={{
        marginLeft: 'auto',
        height: 32, padding: '0 14px', borderRadius: 8,
        background: highlight ? 'var(--cc-primary)' : 'var(--cc-ink)',
        color: 'var(--cc-ink-on)', border: 0,
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>Saldar</button>
    </div>
  </div>
);
const DebtAction = ({ icon, children }) => (
  <button style={{
    height: 32, padding: '0 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(60,40,20,0.08)',
    fontSize: 12, fontWeight: 500, color: 'var(--cc-ink-2)',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 5,
  }}>
    <Icon name={icon} size={12}/>{children}
  </button>
);

// ============================================================
// 6. AGREGAR GASTO (bottom sheet)
// ============================================================
const ScreenAddExpense = () => {
  const [paidBy, setPaidBy] = useS('one');
  const [splitMode, setSplitMode] = useS('equal');
  return (
    <Phone>
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(31,27,22,0.45)' }}/>

      {/* Sheet */}
      <div className="cc-sheet" style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        maxHeight: '88%', overflow: 'auto',
        paddingBottom: 110,
      }}>
        <div className="cc-sheet-handle"/>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
          <div>
            <div className="serif cc-sheet-title">Nuevo gasto</div>
            <div className="cc-sheet-sub" style={{ marginTop: 2 }}>Asado del finde · ARS</div>
          </div>
          <button style={closeBtn}><Icon name="x" size={16}/></button>
        </div>

        {/* Section: datos */}
        <SheetSection title="Datos">
          <Field label="¿Qué fue?">
            <Input placeholder="Supermercado, cena, nafta…"/>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Moneda">
              <Select defaultValue="ARS">
                <option>ARS</option><option>USD</option><option>EUR</option>
              </Select>
            </Field>
            <Field label="Fecha">
              <Input defaultValue="Hoy · 5 may"/>
            </Field>
          </div>
          <Field label="Total">
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                fontSize: 20, fontWeight: 500, color: 'var(--cc-ink-3)',
                fontVariantNumeric: 'tabular-nums', pointerEvents: 'none', zIndex: 1,
              }}>$</span>
              <Input amount placeholder="0,00" style={{ paddingLeft: 38 }}/>
            </div>
          </Field>
        </SheetSection>

        {/* Section: pagó */}
        <SheetSection title="¿Quién pagó?">
          <Segmented
            value={paidBy} onChange={setPaidBy}
            options={[{ value: 'one', label: 'Una persona' }, { value: 'many', label: 'Varias' }]}
          />
          {paidBy === 'one' ? (
            <Field label="Pagó">
              <Select defaultValue="Flor">
                <option>Flor</option><option>Tomi</option><option>Ruso</option><option>Santi</option><option>Sasa</option>
              </Select>
            </Field>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PayerRow name="Flor" amount="6.000,00"/>
              <PayerRow name="Tomi" amount="6.500,00"/>
              <PayerRow name="Ruso" amount=""/>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 6px', color: 'var(--cc-ink-3)' }}>
                <span>Pagado: <b style={{ color: 'var(--cc-ink)' }} className="num">$ 12.500</b> de $ 12.500</span>
                <Badge tone="positive">OK</Badge>
              </div>
            </div>
          )}
        </SheetSection>

        {/* Section: división */}
        <SheetSection title="¿Cómo se divide?">
          <Segmented
            value={splitMode} onChange={setSplitMode}
            options={[
              { value: 'equal', label: 'Partes iguales' },
              { value: 'manual', label: 'Montos' },
              { value: 'percent', label: '%' },
            ]}/>

          {splitMode === 'equal' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                <span style={{ fontSize: 13, color: 'var(--cc-ink-3)' }}>5 personas seleccionadas</span>
                <button style={ghostLink}>Deseleccionar todo</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {['Flor','Tomi','Ruso','Santi','Sasa'].map(n => <SplitRowEqual key={n} name={n} share="2.500,00"/>)}
              </div>
            </>
          )}

          {splitMode === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[['Flor','3.000,00'],['Tomi','3.000,00'],['Ruso','3.000,00'],['Santi','3.500,00'],['Sasa','']].map(([n,v]) => (
                <PayerRow key={n} name={n} amount={v}/>
              ))}
              <AssignmentMeter label="Asignado" current="$ 12.500" target="$ 12.500" status="ok"/>
            </div>
          )}

          {splitMode === 'percent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[['Flor','25'],['Tomi','25'],['Ruso','20'],['Santi','10'],['Sasa','']].map(([n,v]) => (
                <PercentRow key={n} name={n} pct={v}/>
              ))}
              <AssignmentMeter label="Asignado" current="80%" target="100%" extra="≈ $ 10.000 de $ 12.500" status="warn"/>
            </div>
          )}
        </SheetSection>

        {/* Validation summary */}
        <div className="cc-card" style={{ background: 'var(--cc-surface-2)', border: 0, marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cc-ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Resumen</div>
          <div style={{ fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
            <div><span style={{ color: 'var(--cc-ink-3)' }}>Total</span> · <b className="num">$ 12.500,00</b> ARS</div>
            <div><span style={{ color: 'var(--cc-ink-3)' }}>Pagaron</span> · <b>Flor</b></div>
            <div><span style={{ color: 'var(--cc-ink-3)' }}>Se divide</span> · partes iguales entre 5</div>
          </div>
        </div>
      </div>

      <BottomBar>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" style={{ flex: '0 0 100px' }}>Cancelar</Button>
          <Button block>Guardar gasto</Button>
        </div>
      </BottomBar>
    </Phone>
  );
};

const closeBtn = {
  width: 32, height: 32, borderRadius: 999,
  background: 'var(--cc-surface-2)', border: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'var(--cc-ink-2)', flexShrink: 0,
};

const SheetSection = ({ title, children }) => (
  <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cc-ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
    {children}
  </div>
);

const PayerRow = ({ name, amount }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--cc-surface)', border: '1px solid var(--cc-line)',
    borderRadius: 12, padding: '8px 12px',
  }}>
    <Avatar name={name} size={28}/>
    <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{name}</div>
    <div style={{ width: 110, position: 'relative' }}>
      <input className="cc-input num" placeholder="0,00" defaultValue={amount}
        style={{ height: 36, fontSize: 14, paddingLeft: 26, textAlign: 'right' }}/>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--cc-ink-3)' }}>$</span>
    </div>
  </div>
);
const PercentRow = ({ name, pct }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--cc-surface)', border: '1px solid var(--cc-line)',
    borderRadius: 12, padding: '8px 12px',
  }}>
    <Avatar name={name} size={28}/>
    <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{name}</div>
    <div style={{ width: 88, position: 'relative' }}>
      <input className="cc-input num" placeholder="0" defaultValue={pct}
        style={{ height: 36, fontSize: 14, paddingRight: 28, textAlign: 'right' }}/>
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--cc-ink-3)' }}>%</span>
    </div>
  </div>
);
const SplitRowEqual = ({ name, share }) => (
  <label style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px', borderRadius: 12,
    background: 'var(--cc-surface)', border: '1px solid var(--cc-line)',
    cursor: 'pointer',
  }}>
    <div style={{
      width: 22, height: 22, borderRadius: 7,
      background: 'var(--cc-primary)', color: 'var(--cc-ink-on)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}><Icon name="check" size={14}/></div>
    <Avatar name={name} size={28}/>
    <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{name}</span>
    <span className="num" style={{ fontSize: 13, color: 'var(--cc-ink-2)' }}>$ {share}</span>
  </label>
);
const ghostLink = {
  background: 'transparent', border: 0, color: 'var(--cc-primary)',
  fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: 0,
};
const AssignmentMeter = ({ label, current, target, extra, status }) => {
  const tone = status === 'ok' ? 'positive' : status === 'warn' ? 'warning' : 'negative';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 6px' }}>
      <div>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--cc-ink-3)' }}>{label}: </span>
          <b className="num">{current}</b> <span style={{ color: 'var(--cc-ink-3)' }}>de {target}</span>
        </div>
        {extra && <div style={{ fontSize: 12, color: 'var(--cc-ink-3)', marginTop: 2 }}>{extra}</div>}
      </div>
      <Badge tone={tone}>{status === 'ok' ? 'OK' : status === 'warn' ? `Faltan` : 'Te pasaste'}</Badge>
    </div>
  );
};

Object.assign(window, {
  Phone, StatusBar, GroupHeader, BottomBar, Logo, GroupCard, DebtCard,
  ScreenLogin, ScreenRecover, ScreenHome, ScreenCreate, ScreenResumen, ScreenAddExpense,
  SheetSection, PayerRow, PercentRow, SplitRowEqual, AssignmentMeter, miniMetric, miniMetricLabel, miniMetricValue,
});
