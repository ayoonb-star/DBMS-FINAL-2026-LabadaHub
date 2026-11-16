import { useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import BottomNav from './components/BottomNav.jsx'
import Book from './pages/Book.jsx'
import Orders from './pages/Orders.jsx'
import Staff from './pages/Staff.jsx'
import Admin from './pages/Admin.jsx'

const TABS = [
  { id: 'book', label: 'Book / Home', icon: 'home' },
  { id: 'orders', label: 'My Orders', icon: 'clock', badge: true },
  { id: 'staff', label: 'Staff Intake', icon: 'qr' },
  { id: 'admin', label: 'Admin Stats', icon: 'chart' },
]

const PAGES = { book: Book, orders: Orders, staff: Staff, admin: Admin }

export default function App() {
  const [tab, setTab] = useState('book')
  const Page = PAGES[tab]

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tab])

  return (
    <div className="app">
      <Header />
      <main className="main">
        <Page go={setTab} />
      </main>
      <BottomNav tabs={TABS} active={tab} onChange={setTab} />
    </div>
  )
}
