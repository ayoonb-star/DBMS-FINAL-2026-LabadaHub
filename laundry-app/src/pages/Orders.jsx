import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import Qr from '../components/Qr.jsx'

const STAGES = [
  { title: '1. Order Placed & Slot Reserved', time: '08:30 AM', desc: 'Confirmed via Customer Mobile App', icon: 'check' },
  { title: '2. Received at Impalambong Shop', time: '09:10 AM', desc: 'Weighed: 6.8 kg by Staff Maria • Bin #14', icon: 'check' },
  { title: '3. Washing Cycle (Active)', time: '09:25 AM', desc: 'Eco-detergent infusion + Downy Antibac softening', icon: 'washer' },
  { title: '4. Moisture Extraction & Heated Tumble', desc: 'Gentle spin & warm fluff drying cycle', icon: 'wind' },
  { title: '5. Steam Press & Crisp Folding', desc: 'Standard garment alignment and boutique wrap', icon: 'layers' },
  { title: '6. Hygiene & Cleanliness Check', desc: 'Lint removal and fragrant seal verification', icon: 'clipboard' },
  { title: '7. Stored & Ready for Claim', desc: 'Placed in Pickup Bay Rack 2B', icon: 'package' },
  { title: '8. Picked Up & Completed', desc: 'Staff scans QR code and releases bundle', icon: 'shield' },
]
const ACTIVE = 2 // zero-based index of the current stage

export default function Orders() {
  const [sms, setSms] = useState(true)
  const [spinning, setSpinning] = useState(false)

  const refresh = () => {
    setSpinning(true)
    setTimeout(() => setSpinning(false), 700)
  }

  return (
    <div className="page">
      {/* Active order hero */}
      <section className="card card--12 hero">
        <span className="hero__glow" />
        <div className="row between" style={{ alignItems: 'flex-start', paddingBottom: 8 }}>
          <div>
            <div className="row gap4">
              <span className="t24 w7 cp" style={{ letterSpacing: '-0.6px' }}>#FS-2027-1108</span>
              <span className="pill tone-blue"><Icon name="zap" size={11} />Priority</span>
            </div>
            <div className="t12 cm" style={{ paddingTop: 2 }}>Kenneth Andrada • Impalambong, Malaybalay City</div>
          </div>
          <button
            className="round cp"
            style={{ width: 36, height: 36, background: 'var(--surface-low)' }}
            onClick={refresh}
            aria-label="Refresh order status"
          >
            <Icon
              name="refresh"
              size={13}
              style={spinning ? { animation: 'spin .7s linear' } : undefined}
            />
          </button>
        </div>

        <div className="wash-box stack gap8">
          <div className="row between">
            <div className="row gap8">
              <span className="round" style={{ position: 'relative', width: 36, height: 36, background: 'var(--amber-soft)', color: '#b45309' }}>
                <Icon name="washer" size={17} />
                <i className="dot--8" style={{ position: 'absolute', top: 4, right: 4, borderRadius: 9999, width: 8, height: 8, background: 'var(--amber)' }} />
              </span>
              <div>
                <div className="t12 w6" style={{ color: '#78350f' }}>In Progress: Washing & Sanitizing</div>
                <div className="t12" style={{ color: '#92400e' }}>Commercial Drum 04 • 42°C Thermal Deep Clean</div>
              </div>
            </div>
            <div className="stack right" style={{ alignItems: 'flex-end', flex: 'none', paddingLeft: 6 }}>
              <span className="t10 w7 up" style={{ color: '#b45309' }}>Est. completion</span>
              <span className="t14 w7" style={{ color: '#451a03' }}>2:30 PM</span>
              <span className="t14 w7" style={{ color: '#451a03' }}>Today</span>
            </div>
          </div>
          <div className="meter" role="progressbar" aria-valuenow={60} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: '60%' }} />
          </div>
          <div className="row between t10 w5" style={{ color: 'rgba(146,64,14,.8)' }}>
            <span>Elapsed: 28 mins</span>
            <span>Remaining: ~44 mins</span>
          </div>
        </div>
      </section>

      {/* Journey */}
      <section className="card card--12">
        <div className="row between" style={{ paddingBottom: 16 }}>
          <div className="row gap4">
            <Icon name="activity" size={18} className="cp" />
            <h2 className="t20 w7 cx" style={{ margin: 0 }}>Laundry Journey</h2>
          </div>
          <span className="pill tone-neutral" style={{ padding: '2px 10px' }}>Step {ACTIVE + 1} of {STAGES.length}</span>
        </div>

        <ol className="timeline" style={{ listStyle: 'none', margin: 0 }}>
          <span className="timeline__track" />
          <span className="timeline__done" style={{ height: `calc((100% - 40px) * ${ACTIVE / (STAGES.length - 1)})` }} />
          {STAGES.map((s, i) => {
            const state = i < ACTIVE ? 'done' : i === ACTIVE ? 'active' : 'upcoming'
            return (
              <li key={s.title} className={`stage is-${state}`}>
                <span className="stage__dot"><Icon name={s.icon} size={state === 'upcoming' ? 12 : 11} strokeWidth={state === 'done' ? 3 : 2} /></span>
                <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <span className={'t12 ' + (state === 'active' ? 'w7 cp' : 'w6 cx')}>{s.title}</span>
                  {s.time && (
                    state === 'active'
                      ? <span className="t10 w7 cp" style={{ background: 'rgba(0,97,148,.1)', padding: '2px 6px', borderRadius: 4, flex: 'none' }}>{s.time}</span>
                      : <span className="t12 cm" style={{ flex: 'none' }}>{s.time}</span>
                  )}
                </div>
                <div className="t12 cm">{s.desc}</div>
              </li>
            )
          })}
        </ol>
      </section>

      {/* Claim stub */}
      <section className="card card--12 stub">
        <div className="row between" style={{ paddingBottom: 8, alignItems: 'flex-start' }}>
          <div className="row gap4" style={{ alignItems: 'flex-start' }}>
            <Icon name="ticket" size={18} className="cp" style={{ marginTop: 4 }} />
            <div>
              <h3 className="t20 w7 cx" style={{ margin: 0, lineHeight: '25px' }}>Digital Claim Stub</h3>
              <div className="t12 cm">Tap to brighten display for quick counter checkout</div>
            </div>
          </div>
          <span className="t10 w7 cg" style={{ background: 'rgba(0,133,93,.15)', padding: '4px 8px', borderRadius: 4, flex: 'none' }}>
            VERIFIED<br />STUB
          </span>
        </div>

        <div style={{ padding: '8px 0' }}>
          <div className="qrcard">
            <span className="qrcard__box"><Qr size={176} /></span>
            <div className="stack" style={{ alignItems: 'center', paddingTop: 8, gap: 2 }}>
              <span className="mono w7 cp" style={{ fontSize: 20, lineHeight: '28px', letterSpacing: 1 }}>FS-CLAIM-1108</span>
              <span className="t12 cm" style={{ textAlign: 'center' }}>Show this QR Code to Staff at Impalambong Branch</span>
            </div>
          </div>
        </div>

        <div className="ticket">
          <div className="ticket__row">
            <span className="t12 cm">Verified Scale Weight</span>
            <span><span className="t14 w7 cx">6.80 kg </span><span className="t11 w7 cg">(Maria S.)</span></span>
          </div>
          <div className="ticket__row">
            <span className="t12 cm">Service Type</span>
            <span className="t14 w6 cx">Wash-Dry-Fold + Downy Antibac</span>
          </div>
          <div className="ticket__row">
            <span className="t12 cm">Assigned Laundry Tag</span>
            <span className="t14 w7 cp">Blue Basket #14</span>
          </div>
          <div className="ticket__row">
            <span className="t12 cm">Total Amount</span>
            <span className="row gap6">
              <span className="t20 w7 cx">₱258.00</span>
              <span className="pill" style={{ background: '#d1fae5', color: '#065f46', fontSize: 11, padding: '2px 8px 2px 6px' }}>
                <Icon name="check" size={11} strokeWidth={3} />Paid
              </span>
            </span>
          </div>
          <div className="t11 cm right" style={{ paddingTop: 2 }}>
            GCash Ref: <span className="mono cx">GC-994821</span> • 08:31 AM
          </div>
        </div>
      </section>

      {/* Actions */}
      <section className="stack gap8">
        <button className="btn-primary" onClick={() => window.print()}>
          <Icon name="download" size={13} />Download Official Digital Receipt (PDF)
        </button>
        <div className="row gap8">
          <button className="btn-soft" style={{ flex: 'none', padding: '0 28px' }} onClick={() => setSms((v) => !v)} aria-pressed={sms}>
            <Icon name="bell" size={15} />SMS Alerts: {sms ? 'ON' : 'OFF'}
          </button>
          <a className="btn-soft" href="tel:+639000000000" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
            <Icon name="phone" size={13} />Call Impalambong
          </a>
        </div>
        <div className="row gap8" style={{ background: '#fff', padding: 8, borderRadius: 8 }}>
          <span className="round cp" style={{ width: 32, height: 32, background: 'var(--primary-soft)' }}>
            <Icon name="droplet" size={15} />
          </span>
          <div>
            <div className="t10 w6 cx">Cared by Fresh Stream Malaybalay</div>
            <div className="t12 cm">Triple-filtered rainwater sanitized with eco-friendly natural enzymes.</div>
          </div>
        </div>
      </section>
    </div>
  )
}
