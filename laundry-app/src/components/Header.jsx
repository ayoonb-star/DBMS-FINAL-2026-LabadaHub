import Icon from './Icon.jsx'

export default function Header() {
  return (
    <header className="header">
      <div className="header__brand">
        <div className="header__logo">
          <Icon name="droplet" size={18} />
        </div>
        <div>
          <div className="header__name">Fresh Stream Laundry</div>
          <div className="header__loc">
            <Icon name="pin" size={10} />
            Impalambong, Malaybalay City
          </div>
        </div>
      </div>
      <button className="header__avatar" aria-label="Account">
        <Icon name="user" size={14} />
      </button>
    </header>
  )
}
