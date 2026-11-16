import { useState } from 'react'
import Icon from '../components/Icon.jsx'

const INITIAL_SLOTS = [
  { id: 'a', time: '08:00 AM – 10:00 AM', used: 6, cap: 6 },
  { id: 'b', time: '10:00 AM – 12:00 PM', used: 4, cap: 6 },
  { id: 'c', time: '01:00 PM – 03:00 PM', used: 6, cap: 6 },
  { id: 'd', time: '03:00 PM – 05:00 PM', used: 2, cap: 6 },
]

function slotState({ used, cap }) {
  if (used >= cap) return { label: `${used}/${cap} Full (Closed)`, badge: 'rgba(255,218,214,.6)', color: 'var(--red)', bar: 'var(--red)', weight: 700 }
  if (used / cap > 0.5) return { label: `${used}/${cap} Slots (Healthy)`, badge: 'rgba(205,229,255,.5)', color: 'var(--teal)', bar: 'var(--teal)', weight: 600 }
  return { label: `${used}/${cap} Slots (Open)`, badge: 'rgba(133,248,196,.6)', color: 'var(--green)', bar: 'var(--green)', weight: 600 }
}

const SERVICES = [
  { name: 'Wash, Dry & Fold', kg: 238, pct: 62, color: 'var(--primary)', text: 'var(--primary)' },
  { name: 'Heavy Comforters & Linens', kg: 92, pct: 24, color: 'var(--sky)', text: 'var(--teal)' },
  { name: 'Dry Cleaning & Uniforms', kg: 54, pct: 14, color: 'var(--green-2)', text: 'var(--green)' },
]

const FEED = [
  { who: 'Maria Santos', init: 'MS', bg: 'var(--primary-soft)', fg: '#001d32', ago: '2m ago', pre: 'Moved ', ref: 'Order #FS-1108', post: ' to Washer Drum 04 (Delicate cycle)' },
  { who: 'Joshua Estrada', init: 'JE', bg: 'var(--mint)', fg: '#002114', ago: '14m ago', pre: 'Completed ', ref: 'Order #FS-1102', post: ' • Scanned pickup QR and released to customer' },
  { who: 'Kenneth Aquino', init: 'KA', bg: 'var(--surface-high)', fg: 'var(--text)', ago: '25m ago', pre: 'Pre-booked drop-off for customer via front counter (3:00 PM slot)', ref: '', post: '' },
]

const TOOLS = [
  { icon: 'download', label: ['Export Sales', '(PDF/Excel)'], bg: 'rgba(0,97,148,.1)', fg: 'var(--primary)' },
  { icon: 'sliders', label: ['Adjust Rates', '(₱ per kg)'], bg: 'var(--primary-soft)', fg: 'var(--primary)' },
  { icon: 'database', label: ['Backup Store', 'Database'], bg: 'var(--mint)', fg: 'var(--green)' },
]

export default function Admin() {
  const [slots, setSlots] = useState(INITIAL_SLOTS)
  const [expanded, setExpanded] = useState(false)

  const expandPeak = () => {
    // Add 2 slots to the full afternoon window.
    setSlots((s) => s.map((x) => (x.id === 'c' ? { ...x, cap: x.cap + 2 } : x)))
    setExpanded(true)
  }

  return (
    <div>
      {/* Live status banner */}
      <div style={{ padding: '16px 16px 4px' }}>
        <div className="card card--12 stack gap8" style={{ position: 'relative', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', right: -24, bottom: -24, width: 96, height: 96, borderRadius: 9999, background: 'rgba(205,229,255,.3)', filter: 'blur(24px)' }} />
          <div className="row between" style={{ position: 'relative' }}>
            <span className="row gap6">
              <span className="dot" style={{ background: 'var(--green)' }} />
              <span className="t10 w7 cg up" style={{ letterSpacing: '.25px' }}>Shop Live • Operational</span>
            </span>
            <span className="pill" style={{ background: 'var(--surface-low)', color: 'var(--muted)' }}>Nov 12, 2027</span>
          </div>
          <div style={{ position: 'relative' }}>
            <h1 className="t20 w7 cx" style={{ margin: 0, letterSpacing: '-.5px' }}>Operations Dashboard</h1>
            <div className="row gap4 t12 cm" style={{ paddingTop: 2 }}>
              <Icon name="store" size={12} />Fresh Stream • Impalambong, Malaybalay City
            </div>
          </div>
          <div className="row between" style={{ padding: 8, borderRadius: 8, background: 'var(--surface-low)', position: 'relative', marginTop: 4 }}>
            <div className="row gap8">
              <span className="round cp" style={{ width: 28, height: 28, background: 'rgba(0,97,148,.1)' }}><Icon name="washer" size={14} /></span>
              <div>
                <div className="t10 w6 cx">Active Drums</div>
                <div className="t12 cm">8 of 12 Washers Running</div>
              </div>
            </div>
            <div className="row gap4" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 130 }}>
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className="dot dot--8" style={{ background: i < 8 ? 'var(--green)' : 'var(--line)' }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ padding: '4px 16px' }}>
        <div className="metric-grid">
          <div className="metric" style={{ overflow: 'hidden' }}>
            <div className="row between">
              <span className="t10 w6 cm up">Today's Revenue</span>
              <span className="round metric__icon" style={{ background: 'var(--mint)', color: 'var(--green)' }}><Icon name="cash" size={13} /></span>
            </div>
            <div style={{ padding: '8px 0' }}>
              <div className="t24 w8 cp tight">₱14,850</div>
              <div className="row gap4">
                <Icon name="trend" size={13} className="cg" />
                <span className="t10 w7 cg">+18.4%</span>
                <span className="t12 cm">vs yesterday</span>
              </div>
            </div>
            <svg viewBox="0 0 140 20" width="100%" height="20" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 16 C14 14 24 17 40 12 S66 11 82 9 S112 8 126 5 L140 3" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>

          <div className="metric stack gap8">
            <div className="row between">
              <span className="t10 w6 cm up">Volume Handled</span>
              <span className="round metric__icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Icon name="scale" size={12} /></span>
            </div>
            <div style={{ padding: '8px 0' }}>
              <div><span className="t24 w8 cx tight">384 </span><span className="t14 cm">kg</span></div>
              <div className="row gap4 t10 w5 cm"><Icon name="package" size={12} />42 orders logged</div>
            </div>
            <div className="seg">
              <i style={{ width: '65%', background: 'var(--primary)' }} />
              <i style={{ width: '25%', background: 'var(--sky)' }} />
              <i style={{ width: '10%', background: 'var(--green)' }} />
            </div>
          </div>

          <div className="metric">
            <div className="row between">
              <span className="t10 w6 cm up">In Progress</span>
              <span className="round metric__icon" style={{ background: 'var(--surface-high)', color: 'var(--muted)' }}><Icon name="refresh" size={12} /></span>
            </div>
            <div style={{ padding: '6px 0' }}>
              <span className="t24 w8 cx tight">16 </span><span className="t14 cm">baskets</span>
            </div>
            <div className="stack gap4">
              {[
                ['var(--teal)', '4 Washing', 'Drum 01-04', 'var(--teal)', 600],
                ['var(--primary-2)', '6 Drying', 'Hot Air', 'var(--text)', 600],
                ['var(--green)', '6 Folding', 'Ready Soon', 'var(--green)', 600],
              ].map(([dot, l, r, rc]) => (
                <div key={l} className="row between t11">
                  <span className="row gap4 cm"><span className="dot" style={{ width: 6, height: 6, background: dot }} />{l}</span>
                  <span className="w6" style={{ color: rc }}>{r}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="metric stack" style={{ gap: 6 }}>
            <div className="row between">
              <span className="t10 w6 cm up">Ready to Claim</span>
              <span className="round metric__icon" style={{ background: 'var(--mint)', color: 'var(--green)' }}><Icon name="check" size={12} strokeWidth={3} /></span>
            </div>
            <div style={{ padding: '6px 0' }}>
              <span className="t24 w8 cg tight">8 </span><span className="t14 cm">orders</span>
            </div>
            <div className="row gap8" style={{ padding: 8, borderRadius: 8, background: 'var(--surface-low)' }}>
              <Icon name="package" size={15} className="cp" />
              <div style={{ minWidth: 0 }}>
                <div className="t10 w7 cx">Counter Shelf A-C</div>
                <div className="t12 cm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>SMS Sent • Awaiting Pick</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slot capacity */}
      <div style={{ padding: '4px 16px' }}>
        <div className="card card--12 stack gap8">
          <div className="row between">
            <div>
              <div className="row gap6 t14 w7 cx"><Icon name="clock" size={14} className="cp" />Drop-Off Slot Capacity</div>
              <div className="t12 cm">Default limit: 6 customer drop-offs / hour</div>
            </div>
            <span className="pill" style={{ background: 'var(--surface)', color: 'var(--primary)', textAlign: 'center' }}>Anti-<br />Congestion</span>
          </div>
          <div className="stack" style={{ gap: 10, paddingTop: 4 }}>
            {slots.map((s) => {
              const st = slotState(s)
              return (
                <div key={s.id} className="stack gap4">
                  <div className="row between">
                    <span className="t12 w6 cx">{s.time}</span>
                    <span className="pill" style={{ background: st.badge, color: st.color, fontWeight: st.weight }}>{st.label}</span>
                  </div>
                  <div className="bar" role="progressbar" aria-valuenow={s.used} aria-valuemax={s.cap} aria-label={s.time}>
                    <i style={{ width: `${Math.min(100, (s.used / s.cap) * 100)}%`, background: st.bar }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ paddingTop: 8 }}>
            <button className="expand-btn" onClick={expandPeak} disabled={expanded}>
              <Icon name={expanded ? 'check' : 'plus'} size={15} />
              {expanded ? 'Afternoon peak expanded (+2 slots)' : 'Expand 2 slots for afternoon peak'}
            </button>
          </div>
        </div>
      </div>

      {/* Load breakdown */}
      <div style={{ padding: '4px 16px' }}>
        <div className="card card--12 stack gap8">
          <div className="row between">
            <span className="t14 w7 cx">Load Breakdown by Service</span>
            <span className="t12 w5 cm">384 kg total</span>
          </div>
          <div className="seg seg--12">
            {SERVICES.map((s) => <i key={s.name} style={{ width: `${s.pct}%`, background: s.color }} />)}
          </div>
          <div className="stack gap8" style={{ paddingTop: 4 }}>
            {SERVICES.map((s) => (
              <div key={s.name} className="row between">
                <span className="row gap8 t14 w5 cx"><span className="dot" style={{ width: 12, height: 12, background: s.color }} />{s.name}</span>
                <span className="row gap8">
                  <span className="t10 w6 cm">{s.kg} kg</span>
                  <span className="t12 w7" style={{ color: s.text }}>{s.pct}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live floor log */}
      <div style={{ padding: '4px 16px' }}>
        <div className="card card--12 stack gap8">
          <div className="row between">
            <span className="row gap6 t14 w7 cx"><Icon name="history" size={15} className="cp" />Live Floor Log</span>
            <span className="row gap2 t10 w6 cp"><span className="dot dot--8" style={{ background: 'var(--primary)' }} />Realtime</span>
          </div>
          <div className="stack gap12">
            {FEED.map((f) => (
              <div key={f.who} className="row gap12" style={{ alignItems: 'flex-start' }}>
                <span className="round feed-avatar" style={{ background: f.bg, color: f.fg, marginTop: 2 }}>{f.init}</span>
                <div className="grow">
                  <div className="row between">
                    <span className="t12 w6 cx">{f.who}</span>
                    <span className="t12 cm">{f.ago}</span>
                  </div>
                  <div className="t12 cm">
                    {f.pre}{f.ref && <span className="w6 cp">{f.ref}</span>}{f.post}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick tools */}
      <div className="stack gap4" style={{ padding: '4px 16px 24px' }}>
        <span className="t10 w7 cm up" style={{ padding: '0 4px' }}>Quick Management</span>
        <div className="row gap8" style={{ alignItems: 'stretch' }}>
          {TOOLS.map((t) => (
            <button key={t.icon} className="tool">
              <span className="round" style={{ background: t.bg, color: t.fg }}><Icon name={t.icon} size={15} /></span>
              <span>{t.label[0]}<br />{t.label[1]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
