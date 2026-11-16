import Icon from './Icon.jsx'

export default function BottomNav({ tabs, active, onChange }) {
  return (
    <nav className="nav">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={'nav__link' + (active === t.id ? ' is-active' : '')}
          onClick={() => onChange(t.id)}
        >
          <Icon name={t.icon} size={18} />
          <span>{t.label}</span>
          {t.badge && <i className="nav__dot" />}
        </button>
      ))}
    </nav>
  )
}
