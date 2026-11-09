import { NavLink } from 'react-router-dom'

export default function MobileNav({ items, activeClass = 'text-red-400' }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-navy-800 bg-navy-950/95 backdrop-blur md:hidden">
      {items.map(([to, label, Icon]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium ${
              isActive ? activeClass : 'text-slate-500'
            }`
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
