import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { peso } from '../utils.js'

const SERVICES = [
  {
    id: 'wdf', name: 'Wash-Dry-Fold', rate: 35, unit: 'kg',
    desc: 'Everyday clothes, towels & gym wear • Min. 5 kg',
    badges: [
      { icon: 'clock', text: '3-4 hrs turnaround', tone: 'blue' },
      { icon: 'leaf', text: 'Eco Suds', tone: 'mint' },
    ],
  },
  {
    id: 'bed', name: 'Bedding & Heavy Care', rate: 65, unit: 'kg',
    desc: 'Comforters, thick duvets, blankets & pillowcases',
    badges: [{ icon: 'flame', text: 'Thermal sanitization', tone: 'neutral' }],
  },
  {
    id: 'dry', name: 'Premium Dry Clean & Press', rate: 120, unit: 'item',
    desc: 'Barong, suits, gowns, coats & delicates',
    badges: [{ icon: 'droplet', text: 'Gentle solvent care', tone: 'neutral' }],
  },
  {
    id: 'iron', name: 'Steam Ironing & Crisp Fold', rate: 25, unit: 'kg',
    desc: 'Uniforms, office polos, pants & folded neatly',
    badges: [],
  },
]

const ADDONS = [
  { id: 'downy', name: 'Downy Antibac', price: 20 },
  { id: 'bleach', name: 'Color-Safe Bleach', price: 25 },
  { id: 'soap', name: 'Hypoallergenic Soap', price: 30 },
]

const DATES = [
  { id: 'd0', label: 'Today', date: 'Nov 12' },
  { id: 'd1', label: 'Tomorrow', date: 'Nov 13' },
  { id: 'd2', label: 'Thursday', date: 'Nov 14' },
]

const SLOTS = [
  { id: 's1', time: '08:00 AM - 10:00 AM', note: 'Recommended for noon pickup', left: 6, tone: 'ok' },
  { id: 's2', time: '10:00 AM - 12:00 PM', note: 'High demand intake', left: 2, tone: 'few' },
  { id: 's3', time: '01:00 PM - 03:00 PM', note: 'Maximum capacity reached', left: 0, tone: 'full' },
  { id: 's4', time: '03:00 PM - 05:00 PM', note: 'Evening drop cycle', left: 5, tone: 'ok' },
]

const DOT = { ok: 'var(--green)', few: 'var(--amber)', full: 'var(--red)' }

export default function Book({ go }) {
  const [serviceId, setServiceId] = useState('wdf')
  const [qty, setQty] = useState(7)
  const [addons, setAddons] = useState(['downy'])
  const [dateId, setDateId] = useState('d0')
  const [slotId, setSlotId] = useState('s1')
  const [notes, setNotes] = useState('')

  const service = SERVICES.find((s) => s.id === serviceId)
  const isKg = service.unit === 'kg'
  const step = isKg ? 0.5 : 1

  const { base, addonTotal, total } = useMemo(() => {
    const base = qty * service.rate
    const addonTotal = ADDONS.filter((a) => addons.includes(a.id)).reduce((s, a) => s + a.price, 0)
    return { base, addonTotal, total: base + addonTotal }
  }, [qty, service, addons])

  const toggleAddon = (id) =>
    setAddons((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const addonNames = ADDONS.filter((a) => addons.includes(a.id)).map((a) => a.name).join(', ')

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      {/* Branch status */}
      <div className="status-pill">
        <div className="row gap8">
          <div className="round status-pill__icon">
            <Icon name="store" size={13} />
            <span className="status-pill__live" />
          </div>
          <div>
            <div className="t12 w6 cx">Impalambong Main Branch</div>
            <div className="t12 w5 cg">Open Now • Closes 7:00 PM</div>
          </div>
        </div>
        <span className="pill tone-white w4">Fast Turnaround</span>
      </div>

      {/* Promo banner */}
      <div className="promo">
        <span className="promo__blob" style={{ width: 112, height: 112, right: -16, bottom: -24, background: 'rgba(123,194,255,.2)' }} />
        <span className="promo__blob" style={{ width: 48, height: 48, right: 32, top: 4, background: 'rgba(255,255,255,.15)' }} />
        <div className="row gap16" style={{ position: 'relative' }}>
          <div className="promo__icon"><Icon name="sparkle" size={26} /></div>
          <div>
            <div className="row gap6">
              <span className="pill tone-mint up" style={{ padding: '2px 6px' }}>Promo</span>
              <span className="t10 w7" style={{ color: 'var(--primary-soft)' }}>Student & New Drop Perks</span>
            </div>
            <div className="t20 w7" style={{ lineHeight: '25px', paddingTop: 2 }}>10% OFF Wash-Dry-Fold</div>
            <div className="t12" style={{ color: 'rgba(253,252,255,.9)', paddingTop: 2 }}>
              Applies automatically on Mondays & Wednesdays
            </div>
          </div>
        </div>
      </div>

      {/* Services */}
      <section className="stack gap8">
        <div className="row between">
          <h2 className="t20 w7 cx" style={{ margin: 0 }}>Select Care Service</h2>
          <span className="row gap2 t10 w7 cp"><Icon name="check" size={11} />Standard pricing</span>
        </div>
        <div className="stack" style={{ gap: 10 }} role="radiogroup" aria-label="Care service">
          {SERVICES.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={serviceId === s.id}
              className={'service' + (serviceId === s.id ? ' is-selected' : '')}
              onClick={() => {
                setServiceId(s.id)
                setQty(s.unit === 'kg' ? 7 : 2)
              }}
            >
              <span className="radio"><Icon name="check" size={10} strokeWidth={3} /></span>
              <div className="grow stack gap2">
                <div className="row between">
                  <span className="t14 w6 cx">{s.name}</span>
                  <span>
                    <span className="t14 w7 cp">₱{s.rate} </span>
                    <span className="t12 cm">/ {s.unit}</span>
                  </span>
                </div>
                <div className="t12 cm">{s.desc}</div>
                {s.badges.length > 0 && (
                  <div className="row gap8" style={{ paddingTop: 6, flexWrap: 'wrap' }}>
                    {s.badges.map((b) => (
                      <span key={b.text} className={`tag tone-${b.tone}`}>
                        <Icon name={b.icon} size={10} />{b.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Estimated load */}
      <section className="card card--sm stack gap16">
        <div className="row between">
          <div className="stack gap2">
            <h2 className="t20 w7 cx" style={{ margin: 0 }}>Estimated Load</h2>
            <span className="t12 cm">Adjust approx. weight (verified on scale)</span>
          </div>
          <span className="pill" style={{ background: '#cce5ff', color: 'var(--primary)', fontSize: 12, fontWeight: 600, padding: '4px 10px' }}>
            <Icon name="scale" size={13} />Final at drop
          </span>
        </div>

        <div className="stepper row between">
          <button className="stepper__btn" aria-label="Decrease" onClick={() => setQty((q) => Math.max(step, +(q - step).toFixed(1)))}>
            <Icon name="minus" size={12} strokeWidth={3} />
          </button>
          <div className="stack" style={{ alignItems: 'center' }}>
            <span className="t28 w8 cp" style={{ letterSpacing: '-0.7px' }}>{qty.toFixed(1)}</span>
            <span className="t10 w7 cm">{isKg ? 'KILOGRAMS (KG)' : 'ITEMS'}</span>
          </div>
          <button className="stepper__btn stepper__btn--primary" aria-label="Increase" onClick={() => setQty((q) => +(q + step).toFixed(1))}>
            <Icon name="plus" size={12} strokeWidth={3} />
          </button>
        </div>

        <div className="presets">
          {(isKg ? [5, 7, 10, 15] : [1, 2, 4, 6]).map((n) => (
            <button key={n} className={'preset' + (qty === n ? ' is-active' : '')} onClick={() => setQty(n)}>
              {n} {isKg ? 'kg' : n === 1 ? 'item' : 'items'}
            </button>
          ))}
        </div>

        <div className="stack gap8" style={{ paddingTop: 6 }}>
          <span className="t12 w6 cx">Enhance Wash Formula</span>
          <div className="stack gap8" style={{ alignItems: 'flex-start' }}>
            {ADDONS.map((a) => (
              <button key={a.id} className={'chip' + (addons.includes(a.id) ? ' is-active' : '')} onClick={() => toggleAddon(a.id)} aria-pressed={addons.includes(a.id)}>
                <Icon name={addons.includes(a.id) ? 'check' : 'plus'} size={12} strokeWidth={2.5} />
                {a.name} <small>+₱{a.price}</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Schedule */}
      <section className="card card--sm stack gap16">
        <div className="row between">
          <div className="stack gap2">
            <h2 className="t20 w7 cx" style={{ margin: 0 }}>Drop-off Schedule</h2>
            <span className="t12 cm">Live machine capacity monitoring</span>
          </div>
          <span className="round cp" style={{ width: 32, height: 32, background: 'rgba(205,229,255,.5)' }}>
            <Icon name="calendar" size={15} />
          </span>
        </div>
        <div className="row gap8" style={{ alignItems: 'stretch' }}>
          {DATES.map((d) => (
            <button key={d.id} className={'datepill' + (dateId === d.id ? ' is-active' : '')} onClick={() => setDateId(d.id)}>
              <small>{d.label}</small>
              <span>{d.date}</span>
            </button>
          ))}
        </div>
        <div className="stack gap8">
          <span className="t10 w7 cm up">Available intake windows</span>
          {SLOTS.map((s) => {
            const full = s.tone === 'full'
            const selected = slotId === s.id
            return (
              <button
                key={s.id}
                disabled={full}
                className={'slot' + (selected ? ' is-selected' : '') + (full ? ' is-full' : '')}
                onClick={() => setSlotId(s.id)}
              >
                <span className="row gap8">
                  <span className="dot" style={{ background: DOT[s.tone] }} />
                  <span className="stack">
                    <span className="slot__time t14 w6 cx">{s.time}</span>
                    <span className={'t12 ' + (full ? 'cr' : 'cm')}>{s.note}</span>
                  </span>
                </span>
                <span className="row gap6">
                  <span className={'pill w5 ' + (full ? 'tone-red' : s.tone === 'few' ? 'tone-amber' : 'tone-mint')} style={{ padding: '2px 8px' }}>
                    {full ? 'Fully Booked' : `${s.left} slots left`}
                  </span>
                  {!full && <span className="slot__radio"><Icon name="check" size={10} strokeWidth={3} /></span>}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Notes */}
      <section className="card card--sm stack gap4">
        <div className="row between">
          <h2 className="t20 w7 cx" style={{ margin: 0 }}>Special Wash Notes</h2>
          <span className="t10 w7 cm">Optional</span>
        </div>
        <textarea
          className="field"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g., Separate white shirts, use cold water for floral blouse, light lavender scent..."
        />
        <div className="row gap4" style={{ paddingTop: 10 }}>
          <Icon name="shield" size={11} className="cm" />
          <span className="t11 cm">Tags with instructions are verified in-person at intake scan.</span>
        </div>
      </section>

      {/* Summary */}
      <section className="card stack gap8" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="row between" style={{ paddingBottom: 8 }}>
          <h2 className="t20 w7 cx" style={{ margin: 0 }}>Estimated Total</h2>
          <span className="pill tone-neutral">Ticket Preview</span>
        </div>
        <div className="stack gap6">
          <div className="row between t12">
            <span className="cm">{service.name} ({qty.toFixed(1)} {service.unit} × ₱{service.rate})</span>
            <span className="w6 cx">{peso(base)}</span>
          </div>
          {addons.length > 0 && (
            <div className="row between t12">
              <span className="cm">Add-ons ({addonNames})</span>
              <span className="w6 cx">{peso(addonTotal)}</span>
            </div>
          )}
          <div className="row between t10 w7 cg" style={{ paddingTop: 4 }}>
            <span className="row gap4"><Icon name="ticket" size={11} />Promo applied</span>
            <span>Free Eco-bag fold</span>
          </div>
        </div>
        <div className="row between" style={{ paddingTop: 15 }}>
          <div className="stack">
            <span className="t10 w7 cm up">Pay at branch</span>
            <span className="t28 w8 cp">{peso(total)}</span>
          </div>
          <span className="tag tone-mint w5" style={{ color: 'var(--green)', alignSelf: 'flex-start', marginTop: 14 }}>₱0 Prepayment</span>
        </div>
        <p className="t12 co" style={{ lineHeight: '19.5px' }}>
          * Final payable is calculated after precision scale weighing and inspection during counter drop-off.
        </p>
        <button className="cta" onClick={() => go('orders')}>
          Confirm Booking & Get QR Stub <Icon name="arrow" size={15} />
        </button>
        <div className="row center gap12 t11 cm" style={{ paddingTop: 4 }}>
          <span className="row gap4"><Icon name="zap" size={11} />Instant slot lock</span>
          <span>•</span>
          <span className="row gap4"><Icon name="clock" size={11} />No waiting in queue</span>
        </div>
      </section>
    </div>
  )
}
