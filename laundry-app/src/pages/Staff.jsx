import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { peso } from '../utils.js'

const RATE = 35 // ₱ per kg, Wash-Dry-Fold
const ADDON = 20 // Downy Antibac

const STATUS_ACTIONS = [
  { id: 'Drying', label: 'Dryer 02', icon: 'wind' },
  { id: 'Folding', label: 'Folding', icon: 'layers' },
  { id: 'Ready', label: 'Mark Ready', icon: 'bell', ready: true },
]

export default function Staff() {
  const [lookup, setLookup] = useState('FS-1108')
  const [weight, setWeight] = useState(6.8)
  const [checked, setChecked] = useState(true)
  const [status, setStatus] = useState('Received')
  const [method, setMethod] = useState('cash')
  const [received, setReceived] = useState('300')
  const [saved, setSaved] = useState(false)

  const base = +(weight * RATE).toFixed(2)
  const total = base + ADDON
  const change = Math.max(0, (parseFloat(received) || 0) - total)

  const nudge = (d) => {
    setWeight((w) => Math.max(0.1, +(w + d).toFixed(1)))
    setSaved(false)
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Staff ribbon */}
      <div style={{ padding: '8px 16px 4px' }}>
        <div className="row between" style={{ padding: 8, borderRadius: 12, background: 'var(--surface-high)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="row gap8">
            <span className="round" style={{ position: 'relative', width: 40, height: 40, background: 'var(--primary-2)', color: '#fdfcff', fontSize: 12, fontWeight: 600 }}>
              MS
              <i style={{ position: 'absolute', right: 0, bottom: 0, width: 10, height: 10, borderRadius: 9999, background: 'var(--green)', boxShadow: '0 0 0 2px var(--surface-high)' }} />
            </span>
            <div>
              <div className="row gap6 t10">
                <span className="w7 cp up" style={{ letterSpacing: '.5px' }}>Staff Mode</span>
                <span className="dot" style={{ width: 4, height: 4, background: 'var(--line)' }} />
                <span className="row gap2 w6 cg"><Icon name="clock" size={10} />Shift Active</span>
              </div>
              <div className="t14 w6 cx">Maria Santos • Impalambong Branch</div>
            </div>
          </div>
          <button className="round cm" style={{ width: 32, height: 32, borderRadius: 8, background: '#fff' }} aria-label="Help">
            <Icon name="help" size={15} />
          </button>
        </div>
      </div>

      {/* Scanner */}
      <div style={{ padding: '8px 16px 0' }}>
        <div className="scanner">
          <div className="scanner__view">
            <div className="reticle">
              <span className="laser" />
              <span className="lens"><Icon name="droplet" size={26} /></span>
              <i /><i /><i /><i />
            </div>
            <div className="row between" style={{ position: 'absolute', left: 16, right: 16, top: 16 }}>
              <span className="glass row gap6 t10 w7" style={{ padding: '4px 10px', borderRadius: 9999 }}>
                <span className="dot" style={{ width: 6, height: 6, background: 'var(--red)' }} />Live Lens • Rear 12MP
              </span>
              <span className="row gap8">
                <button className="glass round" style={{ width: 32, height: 32 }} aria-label="Torch"><Icon name="zap" size={14} /></button>
                <button className="glass round" style={{ width: 32, height: 32 }} aria-label="Gallery"><Icon name="image" size={14} /></button>
              </span>
            </div>
            <div className="t10 w7" style={{ position: 'absolute', left: 0, right: 0, top: 194, textAlign: 'center', color: 'rgba(218,226,253,.9)', letterSpacing: '.25px' }}>
              Scanning Order QR Code or Drop-off Claim Stub...
            </div>
          </div>
          <form className="lookup" onSubmit={(e) => e.preventDefault()}>
            <label className="lookup__input">
              <Icon name="search" size={13} />
              <input value={lookup} onChange={(e) => setLookup(e.target.value)} aria-label="Order reference" />
            </label>
            <button className="lookup__btn" type="submit">Lookup <Icon name="arrow" size={11} /></button>
          </form>
        </div>
      </div>

      {/* Intake card */}
      <div style={{ padding: '16px 16px 0' }}>
        <div className="card stack gap16" style={{ position: 'relative' }}>
          <div className="banner row between" style={{ alignItems: 'flex-start' }}>
            <div className="row gap8">
              <span className="round" style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--primary-soft)', color: '#001d32', fontSize: 20, fontWeight: 700, boxShadow: 'var(--shadow-sm)' }}>KA</span>
              <div>
                <div className="row gap6" style={{ flexWrap: 'wrap' }}>
                  <h2 className="t20 w7 cx" style={{ margin: 0 }}>Kenneth Andrada</h2>
                  <span className="pill" style={{ background: 'rgba(123,194,255,.4)', color: '#004f7b' }}>Regular</span>
                </div>
                <div className="row gap4 t12 cm" style={{ paddingTop: 2 }}>
                  <Icon name="history" size={12} />12 past orders completed • Malaybalay Downtown
                </div>
              </div>
            </div>
            <div className="stack right" style={{ alignItems: 'flex-end', flex: 'none', paddingLeft: 6 }}>
              <span className="t10 w7 cm up">Ticket ref</span>
              <span className="t14 w7 cp" style={{ letterSpacing: '-.35px' }}>#FS-1108</span>
            </div>
          </div>

          <div className="row gap8" style={{ alignItems: 'stretch' }}>
            <div className="grow stack" style={{ padding: 8, borderRadius: 12, background: 'var(--surface)' }}>
              <span className="t10 w7 cm">Booked Estimate</span>
              <span className="t14 w7 cx" style={{ paddingTop: 2 }}>7.0 kg (~₱265.00)</span>
              <span className="t12 cm">Wash & Fold + Fabric Softener</span>
            </div>
            <div className="grow stack" style={{ padding: 8, borderRadius: 12, background: 'var(--surface)' }}>
              <span className="t10 w7 cm">Drop-off Speed</span>
              <span className="row gap4 t14 w7 cg" style={{ paddingTop: 2 }}><Icon name="zap" size={12} />Same-Day Ready</span>
              <span className="t12 cm">Target: 4:30 PM Today</span>
            </div>
          </div>

          {/* Scale */}
          <div className="scalebox">
            <div className="row between">
              <span className="row gap6 t14 w6 cx"><Icon name="scale" size={17} className="cp" />Digital Scale Certified Weight</span>
              <span className="pill tone-mint" style={{ flex: 'none' }}>
                <span className="dot" style={{ width: 5, height: 6, background: 'var(--green)' }} />Scale BLE Connected
              </span>
            </div>
            <p className="t12 cm">Place laundry basket on the smart scale tray, then fine-tune if needed.</p>
            <div className="scale-ctl">
              <button onClick={() => nudge(-0.1)} aria-label="Decrease by 0.1 kg">-0.1</button>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="w8 cx" style={{ fontSize: 36, lineHeight: '44px', letterSpacing: '-.9px' }}>{weight.toFixed(1)}</span>
                <span className="t14 w7 cm">KG</span>
              </span>
              <button onClick={() => nudge(0.1)} aria-label="Increase by 0.1 kg">+0.1</button>
            </div>
            <div className="row between" style={{ paddingTop: 4 }}>
              <span className="t12 cm">Certified Total Calculation:</span>
              <span className="stack" style={{ alignItems: 'flex-end' }}>
                <span className="t20 w8 cp">{peso(total)}</span>
                <span className="t10 w7 cm right">({peso(base)} base + ₱{ADDON} Downy Antibac)</span>
              </span>
            </div>
          </div>

          {/* Inspection */}
          <div className="stack gap4">
            <span className="row gap4 t12 w6 cx"><Icon name="shield" size={12} />Intake Garment Inspection & Locker</span>
            <label className="check-row">
              <span className="row gap8">
                <Icon name="shirt" size={16} className="cp" />
                <span>
                  <span className="t12 w6 cx" style={{ display: 'block' }}>Pre-existing fabric condition</span>
                  <span className="t12 cm">Denim jacket has worn collar bleach stain</span>
                </span>
              </span>
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            </label>
            <div className="row gap4" style={{ paddingTop: 4, alignItems: 'flex-start' }}>
              <label className="grow stack gap4">
                <span className="t10 w7 cm">Storage Locker</span>
                <select className="select" defaultValue="B-04">
                  <option value="B-04">Shelf B-04 (Quick access)</option>
                  <option value="A-02">Shelf A-02</option>
                  <option value="C-11">Shelf C-11</option>
                </select>
              </label>
              <label className="grow stack gap4">
                <span className="t10 w7 cm">Load Scent Add-on</span>
                <select className="select" defaultValue="downy">
                  <option value="downy">Downy Antibac (+₱20)</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>
          </div>

          {/* Status workflow */}
          <div className="stack gap4" style={{ paddingTop: 4 }}>
            <div className="row between">
              <span className="t12 w6 cx">Rapid Machine Assignment</span>
              <span className="pill" style={{ background: 'var(--surface-highest)', color: 'var(--muted)' }}>Current: {status}</span>
            </div>
            <div className="stack gap4" style={{ paddingTop: 4 }}>
              <button className="act-primary" onClick={() => setStatus('Washing')}>
                <span className="row gap8"><Icon name="refresh" size={15} />Start Wash Cycle (Drum 04)</span>
                <span className="pill" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}>Assign & Run</span>
              </button>
              <div className="act-grid">
                {STATUS_ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    className={'act' + (a.ready ? ' act--ready' : '') + (status === a.id ? ' is-current' : '')}
                    onClick={() => setStatus(a.id)}
                  >
                    <Icon name={a.icon} size={15} />{a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="stack gap8" style={{ padding: 16, borderRadius: 12, background: 'var(--surface-low)' }}>
            <span className="t12 w6 cx">Payment Settlement</span>
            <div className="pay-toggle">
              <button className={method === 'cash' ? 'is-active' : ''} onClick={() => setMethod('cash')}>
                <Icon name="cash" size={14} />Cash Tendered
              </button>
              <button className={method === 'gcash' ? 'is-active' : ''} onClick={() => setMethod('gcash')}>
                <Icon name="phoneMobile" size={12} />GCash / Maya
              </button>
            </div>
            <div className="amount">
              <label className="grow stack gap2">
                <span className="t10 w7 cm">Amount Received</span>
                <span className="row gap4">
                  <span className="t12 w7 cx">₱</span>
                  <input
                    inputMode="decimal"
                    value={received}
                    onChange={(e) => setReceived(e.target.value.replace(/[^0-9.]/g, ''))}
                    aria-label="Amount received"
                  />
                </span>
              </label>
              <span className="divider-v" />
              <span className="stack right" style={{ alignItems: 'flex-end' }}>
                <span className="t10 w7 cm">Customer Change</span>
                <span className="t20 w7 cg">{peso(change)}</span>
              </span>
            </div>
            <button className="btn-green" onClick={() => setSaved(true)}>
              <Icon name={saved ? 'check' : 'printer'} size={16} />
              {saved ? 'Intake Saved — Tag Printing' : 'Print Sticker Tag & Save Intake'}
              {!saved && <Icon name="arrow" size={12} />}
            </button>
          </div>
        </div>
      </div>

      {/* Floor load */}
      <div className="stack gap4" style={{ padding: '16px 16px 0' }}>
        <div className="row between">
          <span className="t12 w6 cx">Live Store Floor Load</span>
          <span className="t12 cm">5/8 Washers active</span>
        </div>
        <div className="row gap4" style={{ alignItems: 'stretch' }}>
          {[
            ['Drum 01', 'Idle', 'cg'],
            ['Drum 02', '24m', 'cp'],
            ['Drum 03', '18m', 'cp'],
          ].map(([n, v, c]) => (
            <div key={n} className="drum">
              <div className="t10 w7 cm">{n}</div>
              <div className={`t12 w7 ${c}`} style={{ paddingTop: 2 }}>{v}</div>
            </div>
          ))}
          <div className="drum is-target">
            <div className="t10 w7 cp">Drum 04</div>
            <div className="t12 w7 cp" style={{ paddingTop: 2 }}>{status === 'Washing' ? '45m' : 'Ready'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
