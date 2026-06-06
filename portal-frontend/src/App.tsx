import { useEffect, useRef, useState } from 'react'

type DisplayType = 'IMAGE_ONLY' | 'QR_CODE' | 'TEXT_INFO' | 'SERVICE_REQUEST'

interface MenuItem {
  id: string
  name: string
  subtitle?: string
  icon: string
  color: string
  displayType: DisplayType
  displayContent: string
  bgImage?: string
}

const mockChannels = [
  { id: 1, name: 'BBC News', number: 1, color: 'bg-[#b80000]', bgImage: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&q=80' },
  { id: 2, name: 'CNN', number: 2, color: 'bg-[#cc0000]', bgImage: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&q=80' },
  { id: 3, name: 'HBO', number: 3, color: 'bg-[#3b0066]', bgImage: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80' },
  { id: 4, name: 'Discovery', number: 4, color: 'bg-[#003366]', bgImage: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80' },
]

const mockApps = [
  { id: 1, name: 'Netflix', icon: 'N', color: 'bg-[#e50914]', bgImage: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800&q=80' },
  { id: 2, name: 'YouTube', icon: '▶', color: 'bg-[#ff0000]', bgImage: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&q=80' },
  { id: 3, name: 'Prime Video', icon: 'prime', color: 'bg-[#00a8e1]', bgImage: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=800&q=80' },
  { id: 4, name: 'Disney+', icon: 'D+', color: 'bg-[#113ccf]', bgImage: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=800&q=80' },
]

const diningMenu: MenuItem[] = [
  { id: 'd1', name: 'In-Room Dining', subtitle: 'Available 24 hours', icon: '🍽️', color: 'bg-gradient-to-br from-[#1a2a4a] to-[#2a3a6a]', displayType: 'QR_CODE', displayContent: 'https://menu.hotel.com/room-dining', bgImage: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80' },
  { id: 'd2', name: 'Breakfast Buffet', subtitle: '06:30 – 10:30', icon: '🥐', color: 'bg-gradient-to-br from-[#2a1a0a] to-[#4a3020]', displayType: 'TEXT_INFO', displayContent: JSON.stringify({ hours: '06:30 – 10:30 (Mon-Fri) / 11:00 (Sat-Sun)', price: 'THB 850 net per person', highlight: 'Live Egg Station · Thai Classics' }), bgImage: 'https://images.unsplash.com/photo-1525648199074-cee30ba79a4a?w=800&q=80' },
  { id: 'd3', name: 'Happy Hour', subtitle: '17:00 – 20:00', icon: '🍹', color: 'bg-gradient-to-br from-[#2a0a1a] to-[#6a2040]', displayType: 'IMAGE_ONLY', displayContent: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80', bgImage: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80' },
]

const servicesMenu: MenuItem[] = [
  { id: 's1', name: 'Ice Bath & Sauna', subtitle: 'Health declaration', icon: '🧊', color: 'bg-gradient-to-br from-[#0a1a2a] to-[#1a3a5a]', displayType: 'QR_CODE', displayContent: 'https://forms.hotel.com/health-declaration', bgImage: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&q=80' },
  { id: 's2', name: 'Spa & Massage', subtitle: '09:00 – 22:00', icon: '💆', color: 'bg-gradient-to-br from-[#2a0a2a] to-[#5a1a5a]', displayType: 'TEXT_INFO', displayContent: JSON.stringify({ hours: '09:00 – 22:00 daily', info: 'Please book at least 2 hours in advance.', contact: 'Ext. 400' }), bgImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAF-aIMfFv76ec15VeoP1t0xAPslNC4VRwzaB1fxkn1gQuAHwFUeR3ka5AMQp8IpwjiDBGqweNRfuiANbgx8424vaO4RHYTJWfaC0vxCxH952I5Zp2UsURb8HoDKOywbxvvHUKk25cgorTkIQ_izB4sDZgpZuSwqwxTgFjbNxi_4evWs_LPd4DCMf9dCOEMfRZnZE69ZOx0DKFfmgffXeFtDlEXDfiLFEvtbNCnq9PXJKbKHwjjPmi33LCfomTq4AbAof77XXloSFa-' },
  { id: 's3', name: 'Housekeeping', subtitle: 'Interactive Request', icon: '🛎️', color: 'bg-gradient-to-br from-[#1a1a2a] to-[#3a3a5a]', displayType: 'SERVICE_REQUEST', displayContent: JSON.stringify([{ id: 'h1', name: 'Fresh Towel', icon: 'dry_cleaning' }, { id: 'h2', name: 'Soap / Shower Gel', icon: 'soap' }, { id: 'h3', name: 'Bottle of Water', icon: 'water_drop' }, { id: 'h4', name: 'Extra Pillow', icon: 'bed' }]), bgImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAOxAntdvCTb7s4bxohBjPgYAALYXfBheMHcdVpAV4IHCC9LBk5ai1ieB_JB94Rt-deDZtvETzbFt6dIzlFeCbbFZ5bCKL1pTuO95YHc7NUNBt8_fgkiAmPlxGVWQ3OAhoULqHA6-lAtYSElRtm0tJIaS_a2o3ocHmoUDMs4j2vsrC9K2FuNNn8jUvvd1MUhPc7aLfgq_-Fe3PEbLPEbeUCkcjgKbASvU5oo3V4iilNvxicXMRALa7HwYJKsK5XN8PRJ-5sB0CjJU0E' },
]

const guideMenu: MenuItem[] = [
  { id: 'g1', name: 'EmQuartier & Emporium', subtitle: 'Shopping', icon: '🛍️', color: 'bg-gradient-to-br from-[#1a0a3a] to-[#3a1a6a]', displayType: 'IMAGE_ONLY', displayContent: 'https://images.unsplash.com/photo-1582035974465-b1ab1ccfdfd5?w=1200&q=80', bgImage: 'https://images.unsplash.com/photo-1582035974465-b1ab1ccfdfd5?w=800&q=80' },
  { id: 'g2', name: 'Benchasiri Park', subtitle: 'Nature', icon: '🌳', color: 'bg-gradient-to-br from-[#0a2a0a] to-[#1a5a1a]', displayType: 'IMAGE_ONLY', displayContent: 'https://images.unsplash.com/photo-1542202652-32a2491b29a2?w=1200&q=80', bgImage: 'https://images.unsplash.com/photo-1542202652-32a2491b29a2?w=800&q=80' },
  { id: 'g3', name: 'BTS Phrom Phong', subtitle: 'Transit', icon: '🚊', color: 'bg-gradient-to-br from-[#1a2a0a] to-[#3a5a10]', displayType: 'TEXT_INFO', displayContent: JSON.stringify({ distance: '450 meters (approx 6 min walk)', hours: '05:30 – 00:00 daily', fare: 'Asok/Nana: 25 THB · Siam: 35 THB' }), bgImage: 'https://images.unsplash.com/photo-1542202652-32a2491b29a2?w=800&q=80' },
]

function App() {
  const [time, setTime] = useState(new Date())
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  
  // State for Service Request Form
  const [formQuantities, setFormQuantities] = useState<Record<string, number>>({})
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  // Auto-dismiss success message after 3 seconds
  useEffect(() => {
    if (showSuccess) {
      const timeout = setTimeout(() => {
        setShowSuccess(false)
        setSelectedItem(null)
        setFormQuantities({})
      }, 3000)
      return () => clearTimeout(timeout)
    }
  }, [showSuccess])

  // D-Pad Refs
  const navRef = useRef<(HTMLButtonElement | null)[]>([])
  const subMenuRefs = useRef<(HTMLButtonElement | null)[]>([])
  const formRefs = useRef<(HTMLDivElement | HTMLButtonElement | null)[]>([])

  useEffect(() => {
    subMenuRefs.current = []
    formRefs.current = []
    if (selectedItem) {
      setTimeout(() => formRefs.current[0]?.focus(), 50)
    } else if (activeMenu) {
      setTimeout(() => subMenuRefs.current[0]?.focus(), 50)
    } else {
      setTimeout(() => navRef.current[0]?.focus(), 50)
    }
  }, [activeMenu, selectedItem])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement

      // Close Modals / Menus on Escape or Back
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 4) {
        if (selectedItem) {
          setSelectedItem(null)
          setShowSuccess(false)
          e.preventDefault()
          return
        }
        if (activeMenu) {
          setActiveMenu(null)
          e.preventDefault()
          return
        }
      }

      if (e.key === 'Enter') {
        activeElement.click()
        e.preventDefault()
        return
      }

      // MODAL NAVIGATION (For Service Request Form)
      if (selectedItem?.displayType === 'SERVICE_REQUEST') {
        const currentIndex = formRefs.current.indexOf(activeElement as any)
        if (currentIndex === -1) return

        if (e.key === 'ArrowDown') {
          const nextIndex = Math.min(currentIndex + 1, formRefs.current.length - 1)
          formRefs.current[nextIndex]?.focus()
          e.preventDefault()
        } else if (e.key === 'ArrowUp') {
          const prevIndex = Math.max(currentIndex - 1, 0)
          formRefs.current[prevIndex]?.focus()
          e.preventDefault()
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          // If we are focused on a form item (not the submit/cancel buttons)
          const itemId = activeElement.getAttribute('data-item-id')
          if (itemId) {
            setFormQuantities(prev => {
              const current = prev[itemId] || 0
              const diff = e.key === 'ArrowRight' ? 1 : -1
              return { ...prev, [itemId]: Math.max(0, current + diff) }
            })
            e.preventDefault()
          } else {
            // Horizontal navigation for buttons
            if (e.key === 'ArrowRight') {
               const nextIndex = Math.min(currentIndex + 1, formRefs.current.length - 1)
               formRefs.current[nextIndex]?.focus()
            } else {
               const prevIndex = Math.max(currentIndex - 1, 0)
               formRefs.current[prevIndex]?.focus()
            }
            e.preventDefault()
          }
        }
        return
      }

      // MODAL NAVIGATION (For simple dismiss)
      if (selectedItem) {
         if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            formRefs.current[0]?.focus()
            e.preventDefault()
         }
         return
      }

      // MAIN NAV & SUB NAV
      if (!activeMenu) {
        const currentIndex = navRef.current.indexOf(activeElement as any)
        if (currentIndex === -1) return

        if (e.key === 'ArrowRight') {
          const nextIndex = (currentIndex + 1) % navRef.current.length
          navRef.current[nextIndex]?.focus()
          e.preventDefault()
        } else if (e.key === 'ArrowLeft') {
          const prevIndex = (currentIndex - 1 + navRef.current.length) % navRef.current.length
          navRef.current[prevIndex]?.focus()
          e.preventDefault()
        }
      } else {
        const currentIndex = subMenuRefs.current.indexOf(activeElement as any)
        if (currentIndex === -1) return

        const firstTop = subMenuRefs.current[0]?.getBoundingClientRect().top ?? 0
        let cols = 1
        for (let i = 1; i < subMenuRefs.current.length; i++) {
          const top = subMenuRefs.current[i]?.getBoundingClientRect().top ?? 0
          if (top > firstTop) break
          cols++
        }

        if (e.key === 'ArrowRight') {
          const next = Math.min(currentIndex + 1, subMenuRefs.current.length - 1)
          subMenuRefs.current[next]?.focus()
          e.preventDefault()
        } else if (e.key === 'ArrowLeft') {
          const prev = Math.max(currentIndex - 1, 0)
          subMenuRefs.current[prev]?.focus()
          e.preventDefault()
        } else if (e.key === 'ArrowDown') {
          const next = currentIndex + cols
          if (next < subMenuRefs.current.length) subMenuRefs.current[next]?.focus()
          e.preventDefault()
        } else if (e.key === 'ArrowUp') {
          const prev = currentIndex - cols
          if (prev >= 0) subMenuRefs.current[prev]?.focus()
          e.preventDefault()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeMenu, selectedItem])

  const renderModalContent = () => {
    if (!selectedItem) return null

    switch (selectedItem.displayType) {
      case 'IMAGE_ONLY':
        return (
          <div className="relative w-[80vw] max-h-[85vh] rounded-[20px] overflow-hidden shadow-2xl bg-surface">
            <img loading="lazy" src={selectedItem.displayContent} alt={selectedItem.name} className="w-full h-[75vh] object-cover block" />
            <div className="absolute bottom-0 left-0 right-0 p-[3vh_3vw] bg-gradient-to-t from-black/90 to-transparent">
              <h3 className="font-display-lg text-[3vw] text-white leading-none">{selectedItem.name}</h3>
              <p className="text-on-surface-variant text-[1.2vw] mt-[1vh]">{selectedItem.subtitle}</p>
            </div>
            <button
              ref={el => formRefs.current[0] = el}
              onClick={() => setSelectedItem(null)}
              className="absolute top-[2vh] right-[2vw] w-[3.5vw] h-[3.5vw] rounded-full border border-white/20 bg-black/50 flex items-center justify-center text-white focus:bg-white/20 focus:border-secondary focus:text-secondary outline-none transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.6vw' }}>close</span>
            </button>
          </div>
        )
      
      case 'QR_CODE':
        return (
          <div className="relative flex w-[82vw] rounded-[20px] overflow-hidden shadow-2xl bg-surface">
             <button
              ref={el => formRefs.current[0] = el}
              onClick={() => setSelectedItem(null)}
              className="absolute top-[2vh] right-[2vw] z-50 w-[3.5vw] h-[3.5vw] rounded-full border border-white/20 bg-black/50 flex items-center justify-center text-white focus:bg-white/20 focus:border-secondary focus:text-secondary outline-none transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.6vw' }}>close</span>
            </button>
            <div className="flex-1 relative min-h-[65vh]">
              <img loading="lazy" src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80" alt={selectedItem.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-tr from-black/70 to-black/30 flex flex-col justify-end p-[3vh_3vw]">
                <h3 className="font-display-lg text-[3vw] text-white leading-none mb-[1vh]">{selectedItem.name}</h3>
                <p className="text-white/80 text-[1.2vw]">{selectedItem.subtitle}</p>
              </div>
            </div>
            <div className="w-[26vw] bg-surface2 flex flex-col items-center justify-center p-[4vh_3vw] gap-[2.5vh] border-l border-white/10">
              <div className="w-[14vw] h-[14vw] bg-white rounded-2xl flex items-center justify-center p-[1vw] shadow-[0_8px_32px_rgba(201,168,76,0.2)]">
                {/* Fallback mock QR image */}
                <img loading="lazy" src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(selectedItem.displayContent)}&bgcolor=ffffff`} alt="QR" className="w-full h-full" />
              </div>
              <div className="text-center">
                <strong className="block text-secondary text-[1.4vw] mb-[0.5vh]">📱 Scan with Phone</strong>
                <span className="text-on-surface-variant text-[1.1vw] leading-relaxed">Point your smartphone camera at the QR code to open on your device.</span>
              </div>
              <div className="bg-white/5 px-[1vw] py-[0.6vh] rounded-lg border border-white/10 text-on-surface-variant text-[0.85vw] break-all text-center w-full">
                {selectedItem.displayContent.replace('https://', '')}
              </div>
            </div>
          </div>
        )
      
      case 'TEXT_INFO':
        const infoData = JSON.parse(selectedItem.displayContent)
        return (
          <div className="w-[55vw] rounded-[20px] bg-surface overflow-hidden shadow-2xl relative">
             <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-[2vh] right-[2vw] z-50 w-[3.5vw] h-[3.5vw] rounded-full border border-white/20 bg-black/50 flex items-center justify-center text-white focus:bg-white/20 focus:border-secondary focus:text-secondary outline-none transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.6vw' }}>close</span>
            </button>
            <div className="p-[3vh_3vw] bg-surface2 border-b border-white/10 flex items-center gap-[1.5vw]">
              <div className={`w-[5vw] h-[5vw] rounded-2xl flex items-center justify-center ${selectedItem.color} text-[2.2vw] shadow-lg`}>
                {selectedItem.icon}
              </div>
              <div>
                <h3 className="font-display-lg text-[2.5vw] text-white leading-none">{selectedItem.name}</h3>
                <p className="text-on-surface-variant text-[1vw] mt-[0.5vh] uppercase tracking-wider">{activeMenu} · Information</p>
              </div>
            </div>
            <div className="p-[3vh_3vw] flex flex-col gap-[1.5vh]">
              {Object.entries(infoData).map(([key, val], idx) => (
                <div key={key} className={`flex gap-[1.5vw] py-[1vh] ${idx !== Object.keys(infoData).length - 1 ? 'border-b border-white/5' : ''}`}>
                  <span className="material-symbols-outlined text-secondary text-[1.5vw] mt-[0.2vh]">info</span>
                  <div>
                    <div className="text-on-surface-variant text-[0.9vw] uppercase tracking-widest mb-[0.4vh]">{key}</div>
                    <div className="text-white text-[1.2vw] leading-relaxed whitespace-pre-wrap">{val as string}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-[2vh_3vw] bg-surface2 flex justify-end">
               <button
                 ref={el => formRefs.current[0] = el}
                 onClick={() => setSelectedItem(null)}
                 className="px-[2vw] py-[1.2vh] rounded-lg border border-white/10 bg-white/5 text-white font-semibold text-[1.1vw] focus:bg-white/10 focus:border-secondary focus:text-secondary outline-none transition-colors"
               >
                 Close
               </button>
            </div>
          </div>
        )
      
      case 'SERVICE_REQUEST':
        if (showSuccess) {
          return (
            <div className="w-[40vw] rounded-[24px] bg-surface overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 relative text-center p-[6vh_3vw] animate-in zoom-in-95 duration-300">
              <div className="w-[8vw] h-[8vw] bg-[#4ade80]/20 text-[#4ade80] rounded-full flex items-center justify-center mx-auto mb-[3vh] shadow-[0_0_30px_rgba(74,222,128,0.2)]">
                <span className="material-symbols-outlined" style={{ fontSize: '4vw' }}>check_circle</span>
              </div>
              <h3 className="font-display-lg text-[2.5vw] text-white mb-[1vh]">Request Received!</h3>
              <p className="text-on-surface-variant text-[1.2vw] mb-[4vh] leading-relaxed">
                Our housekeeping team has been notified and will be with you shortly.
              </p>
              <button
                ref={el => formRefs.current[0] = el}
                onClick={() => {
                  setShowSuccess(false);
                  setSelectedItem(null);
                  setFormQuantities({});
                }}
                className="px-[3vw] py-[1.5vh] rounded-xl bg-white/10 text-white font-bold text-[1.2vw] hover:bg-white/20 focus:bg-white/20 focus:border-secondary outline-none border-2 border-transparent transition-all glow-focus"
              >
                Close
              </button>
            </div>
          )
        }

        const formItems = JSON.parse(selectedItem.displayContent) as any[]
        return (
          <div className="w-[50vw] rounded-[20px] bg-surface overflow-hidden shadow-2xl relative">
            <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-[2vh] right-[2vw] z-50 w-[3.5vw] h-[3.5vw] rounded-full border border-white/20 bg-black/50 flex items-center justify-center text-white focus:bg-white/20 focus:border-secondary focus:text-secondary outline-none transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.6vw' }}>close</span>
            </button>
            <div className="p-[3vh_3vw] bg-surface2 border-b border-white/10 flex items-center gap-[1.5vw]">
              <div className={`w-[5vw] h-[5vw] rounded-2xl flex items-center justify-center ${selectedItem.color} text-[2.2vw] shadow-lg`}>
                {selectedItem.icon}
              </div>
              <div>
                <h3 className="font-display-lg text-[2.5vw] text-white leading-none">{selectedItem.name}</h3>
                <p className="text-on-surface-variant text-[1vw] mt-[0.5vh] uppercase tracking-wider">Select items and quantity</p>
              </div>
            </div>
            <div className="p-[3vh_3vw] flex flex-col gap-[1.5vh]">
              {formItems.map((item, idx) => {
                const qty = formQuantities[item.id] || 0
                return (
                  <div
                    key={item.id}
                    tabIndex={0}
                    data-item-id={item.id}
                    ref={el => formRefs.current[idx] = el}
                    className="flex justify-between items-center p-[1.5vh_1.5vw] bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:border-secondary focus:scale-[1.02] outline-none transition-all cursor-pointer"
                    onClick={() => {
                       setFormQuantities(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }))
                    }}
                  >
                    <div className="flex items-center gap-[1vw] text-[1.2vw] font-medium text-white">
                      <span className="material-symbols-outlined text-[1.8vw] text-on-surface-variant">{item.icon}</span>
                      {item.name}
                    </div>
                    <div className="flex items-center gap-[1vw] bg-black/30 p-[0.5vh_1vw] rounded-lg">
                      <span className="text-secondary text-[1.5vw] opacity-50">◀</span>
                      <span className="text-[1.2vw] font-bold w-[2vw] text-center text-white">{qty}</span>
                      <span className="text-secondary text-[1.5vw]">▶</span>
                    </div>
                  </div>
                )
              })}
              <div className="text-center mt-[2vh] text-[1vw] text-on-surface-variant">
                Use <strong className="text-secondary">UP/DOWN</strong> to select item, <strong className="text-secondary">LEFT/RIGHT</strong> to adjust quantity.
              </div>
            </div>
            <div className="p-[2vh_3vw] bg-surface2 border-t border-white/10 flex justify-end gap-[1vw]">
               <button
                 ref={el => formRefs.current[formItems.length] = el}
                 onClick={() => setSelectedItem(null)}
                 className="px-[2vw] py-[1.2vh] rounded-lg border border-white/10 bg-transparent text-white font-semibold text-[1.1vw] focus:bg-white/10 focus:border-secondary focus:text-secondary outline-none transition-colors"
               >
                 Cancel
               </button>
               <button
                 ref={el => formRefs.current[formItems.length + 1] = el}
                 onClick={async () => {
                    const requested = Object.entries(formQuantities).filter(([_, q]) => q > 0).map(([id, quantity]) => {
                      const itemDef = formItems.find(i => i.id === id);
                      return { id, name: itemDef?.name, quantity };
                    })
                    
                    if (requested.length === 0) return alert("Please select at least one item.")
                    
                    try {
                      const backendUrl = `http://${window.location.hostname}:3000/api/v1/requests`;
                      const response = await fetch(backendUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          hotelId: 'hotel-1',
                          roomId: 'room-402',
                          requestType: 'HOUSEKEEPING',
                          items: requested
                        })
                      })
                      
                      if (response.ok) {
                        setShowSuccess(true)
                      } else {
                        alert("Failed to submit request. Please call the front desk.")
                      }
                    } catch (e) {
                      console.error("Error submitting request:", e)
                      alert("Network error. Please try again.")
                    }
                 }}
                 className="flex items-center gap-[0.5vw] px-[2vw] py-[1.2vh] rounded-lg bg-secondary text-on-secondary font-bold text-[1.1vw] focus:ring-4 focus:ring-secondary/50 outline-none transition-all hover:bg-opacity-90"
               >
                 <span className="material-symbols-outlined">send</span> Submit
               </button>
            </div>
          </div>
        )
    }
  }

  const renderSubMenuHorizontalCards = (items: MenuItem[]) => {
    return items.map((item, idx) => {
        const typeStyles = 
            item.displayType === 'QR_CODE' ? 'text-[#63b3ed] border-[#63b3ed]' :
            item.displayType === 'IMAGE_ONLY' ? 'text-[#9a75ff] border-[#9a75ff]' :
            item.displayType === 'TEXT_INFO' ? 'text-secondary border-secondary' :
            'text-[#ed8936] border-[#ed8936]';
            
        const iconName = 
            item.displayType === 'QR_CODE' ? 'qr_code' :
            item.displayType === 'IMAGE_ONLY' ? 'image' :
            item.displayType === 'TEXT_INFO' ? 'info' : 'checklist';

        return (
          <button
            key={item.id}
            ref={el => { if (el) subMenuRefs.current[idx] = el }}
            onClick={() => setSelectedItem(item)}
            className="flex-shrink-0 w-[24vw] h-[35vh] rounded-[24px] overflow-hidden relative group border-2 border-transparent transition-all duration-300 hover:scale-[1.02] glow-focus outline-none"
          >
            <img loading="lazy" className="absolute inset-0 w-full h-full object-cover transform-gpu transition-transform duration-1000 group-hover:scale-110" src={item.bgImage} alt={item.name} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 flex flex-col justify-between p-[1.5vw] text-left">
              <div>
                <span className={`inline-block px-[0.8vw] py-[0.4vh] text-[0.7vw] font-bold rounded-full tracking-widest flex items-center gap-1 w-fit border bg-black/50 backdrop-blur-md ${typeStyles}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1vw' }}>{iconName}</span> {item.displayType.replace('_', ' ')}
                </span>
              </div>
              <div className="transform translate-y-[1vh] group-hover:translate-y-0 transition-transform duration-300">
                <h3 className="font-display-lg text-[2.5vw] leading-tight mb-[0.5vh] text-white drop-shadow-lg">{item.name}</h3>
                {item.subtitle && <p className="text-on-surface-variant text-[1vw] line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">{item.subtitle}</p>}
              </div>
            </div>
          </button>
        )
    })
  }

  return (
    <div className="font-body-md text-on-surface">
      {/* Background Cinematic Image */}
      <div className="fixed inset-0 z-0">
        <img loading="lazy"
          className="w-full h-full object-cover brightness-50"
          alt="Luxury hotel lobby at dusk"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuBadzX1Hksx5KpAd-y7mNgAJQq5yX0iyEm-05BlctuNE4J5qiuP3b8Cp3wSS5aRm0ZHHgzm5jan-uOr9j_nitsJQgzCLgIaQhWpIY3_jOwcZbAuwWpRTy-NrmSX5MwlrNwCcQjFkxljO0efYgJWeWvekGIyo7Dy1fHhh1CzFf8tEwtOe1sg3GvgoK12nXyhVXsaIqhCxz1lfyoULuplmtg2U-X1itrAoov3W-UsX_N2ud3EXM8e6Sww2rAKqhESXrjsne6M8IuxNUfy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-surface/40"></div>
      </div>

      <main className="fixed inset-0 w-full h-full flex flex-col z-10 overflow-hidden">
        
        {/* Safe Area Container */}
        <div className="flex flex-col flex-1 px-[4vw] py-[3vh]">
           {/* Top App Bar */}
           <header
             className="flex justify-between items-start transition-opacity duration-500"
             style={{ opacity: activeMenu ? 0 : 1 }}
           >
             <div className="flex flex-col gap-[0.5vh]">
               <div className="flex items-baseline gap-[1.5vw] mb-[0.5vh]">
                 <h1 className="font-display-lg text-[3.5vw] text-secondary tracking-widest leading-none">LUXE</h1>
                 <p className="font-label-sm text-[0.9vw] text-secondary tracking-[0.2em] uppercase opacity-70">Concierge</p>
               </div>
               <div className="flex items-center gap-[2vw]">
                 <span className="flex items-center gap-[0.5vw] text-on-surface-variant text-[1.2vw]">
                   <span className="material-symbols-outlined text-secondary" style={{ fontSize: '1.8vw' }}>wb_sunny</span>
                   72°F Sunny
                 </span>
                 <span className="w-[0.4vw] h-[0.4vw] rounded-full bg-outline-variant"></span>
                 <span className="flex items-center gap-[0.5vw] text-on-surface-variant text-[1.2vw]">
                   <span className="material-symbols-outlined text-secondary" style={{ fontSize: '1.8vw' }}>schedule</span>
                   {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                 </span>
               </div>
             </div>

             <div className="flex items-center gap-[2vw]">
               <div className="text-right">
                 <p className="font-label-sm text-[0.9vw] text-secondary uppercase tracking-widest">Premium Member</p>
                 <p className="font-label-lg text-[1.2vw] text-on-surface">Mr. Sterling — Room 402</p>
               </div>
               <div className="rounded-full border-2 border-secondary p-[0.3vw] overflow-hidden" style={{ width: '5vw', height: '5vw' }}>
                 <img loading="lazy" alt="Guest Profile" className="w-full h-full object-cover rounded-full" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDuubPlQwwuYX6AlLyI0Q_YgqixiMEmfRgebSRKezie5wH6IQ3mtxiF8vgbOf_i1maoE0rGm7Gb5i3uPjB-D53Kmcip-HiEbrpGAXCKW9LlYRL7WtsqiSPHrnEVWvk-2B5tucfNUaN3ZAAzPXmlN9ad-yUzWFjKXhK2iN5kmwEqNHRnnJve88naJZFmNSQOjFxpCF9U1lT2mMqDECkqnOTMeGi9lRCkoLR1p-DVyaZt8AuPtZjhqq76b71Td8_ZwAdvZrk4IqRCaXQY" />
               </div>
             </div>
           </header>

           {/* Central Welcome Message */}
           <div
             className="flex-1 flex flex-col items-center justify-center text-center transition-opacity duration-500 mt-[5vh]"
             style={{ opacity: activeMenu ? 0 : 1 }}
           >
             <h2 className="font-display-lg text-[6vw] text-white mb-[1.5vh] tracking-widest leading-none drop-shadow-2xl">WELCOME</h2>
             <p className="font-body-lg text-[1.6vw] text-on-surface-variant max-w-[50vw] drop-shadow-md">
               Experience unparalleled luxury tailored specifically for your stay, Mr. Sterling.
             </p>
           </div>
        </div>

        {/* ─── SCROLLING ANNOUNCEMENT TICKER (MARQUEE) ─── */}
        <div 
          className="w-full bg-black/40 backdrop-blur-sm border-t border-b border-white/5 overflow-hidden flex items-center transition-opacity duration-500"
          style={{ height: '6vh', opacity: activeMenu ? 0 : 1 }}
        >
          <div className="animate-marquee font-label-lg text-white font-semibold drop-shadow-md" style={{ fontSize: '1.4vw' }}>
            Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today. ❄️ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Join our special Happy Hour at the Bar from 5 PM to 7 PM. 🍸
          </div>
        </div>

        {/* Horizontal Bottom Navigation Bar */}
        <div
          className="flex items-center justify-center gap-[1.5vw] py-[2vh] overflow-x-auto no-scrollbar transition-opacity duration-500 bg-gradient-to-t from-black/60 to-transparent"
          style={{ opacity: activeMenu ? 0 : 1 }}
        >
          {[
            { id: 'Channel TV', icon: 'tv', label: 'Channel TV' },
            { id: 'Entertainment', icon: 'styler', label: 'Entertainment' },
            { id: 'Services', icon: 'room_service', label: 'Services' },
            { id: 'Dining', icon: 'restaurant', label: 'Dining' },
            { divider: true },
            { id: 'Messages', icon: 'mail', label: 'Messages' },
            { id: 'Local Guide', icon: 'explore', label: 'Local Guide', badge: 'NEW' }
          ].map((item, index) => {
            if (item.divider) {
              return <div key={`divider-${index}`} className="w-px bg-white/20 mx-[0.5vw]" style={{ height: '6vh' }}></div>
            }

            const refIndex = index > 4 ? index - 1 : index

            return (
              <button
                key={item.id}
                tabIndex={activeMenu ? -1 : 0}
                ref={(el) => { if (el && !activeMenu) navRef.current[refIndex] = el }}
                onClick={() => setActiveMenu(item.id!)}
                className="nav-item-glow group relative flex flex-col items-center gap-[0.8vh] transition-all duration-300 rounded-xl hover:bg-white/10 focus:bg-white/10"
                style={{ padding: '1.5vh 2vw', minWidth: '9vw' }}
              >
                <div
                  className={`flex items-center justify-center rounded-full border border-white/20 group-hover:border-secondary group-hover:text-secondary group-focus:border-secondary group-focus:text-secondary transition-colors ${item.id === 'Local Guide' ? 'border-secondary text-secondary' : 'text-white'}`}
                  style={{ width: '5vw', height: '5vw' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '2.2vw' }}>{item.icon}</span>
                </div>
                <span
                  className={`font-label-lg transition-colors whitespace-nowrap ${item.id === 'Local Guide' ? 'text-secondary' : 'text-white group-hover:text-secondary group-focus:text-secondary'}`}
                  style={{ fontSize: '1.1vw' }}
                >
                  {item.label}
                </span>
                {item.badge && (
                   <div className="absolute top-[1vh] right-[1vw] bg-secondary text-black font-bold rounded-md px-[0.4vw] py-[0.1vh]" style={{ fontSize: '0.7vw', letterSpacing: '0.05em' }}>
                      {item.badge}
                   </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer Help Prompt */}
        <footer
          className="flex justify-between items-center border-t border-white/10 transition-opacity duration-500 bg-black/50 backdrop-blur-sm"
          style={{ opacity: activeMenu ? 0 : 1, padding: '1.5vh 4vw' }}
        >
          <div className="flex items-center gap-[1vw]">
            <div className="flex items-center justify-center rounded-full bg-secondary/10 text-secondary border border-secondary/20" style={{ width: '2.5vw', height: '2.5vw' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.2vw' }}>info</span>
            </div>
            <p className="font-body-md text-on-surface-variant" style={{ fontSize: '1.1vw' }}>
              Use the <span className="text-secondary font-bold">Directional Keys</span> to explore and <span className="text-secondary font-bold">OK</span> to select.
            </p>
          </div>
          <div className="flex gap-[1vw]">
            <div className="flex items-center gap-[0.5vw] bg-white/5 rounded-full border border-white/10" style={{ padding: '0.8vh 1.5vw' }}>
              <span className="rounded-full bg-[#ff4b4b] animate-pulse" style={{ width: '0.6vw', height: '0.6vw' }}></span>
              <span className="font-label-sm" style={{ fontSize: '1vw' }}>Emergency</span>
            </div>
            <div className="flex items-center gap-[0.5vw] bg-secondary rounded-full text-on-secondary shadow-lg font-bold" style={{ padding: '0.8vh 1.5vw' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.2vw' }}>support_agent</span>
              <span className="font-label-sm" style={{ fontSize: '1vw' }}>Assistance</span>
            </div>
          </div>
        </footer>

        {/* ── Sub-menu Overlay ── */}
        {activeMenu && (
          <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-md flex flex-col transition-all duration-300" style={{ padding: '6vh 4vw' }}>
            
            <button
              onClick={() => setActiveMenu(null)}
              className="w-fit flex items-center gap-[0.8vw] bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 hover:border-secondary hover:text-secondary transition-all mb-[3vh] outline-none focus:border-secondary focus:text-secondary"
              style={{ padding: '1vh 1.5vw' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.6vw' }}>arrow_back</span>
              <span className="font-label-lg" style={{ fontSize: '1.2vw' }}>Back</span>
            </button>

            {['Services', 'Dining', 'Local Guide'].includes(activeMenu) ? (
              // --- HORIZONTAL LAYOUT ---
              <div className="flex flex-col flex-1 min-h-0">
                <div className="mb-[4vh] flex-none">
                  <h2 className="font-display-lg text-[4vw] mb-4 text-white leading-tight">
                    {activeMenu === 'Services' ? 'Hotel Services' : activeMenu}
                  </h2>
                  <div className="w-[6vw] h-1 bg-secondary mb-[2vh]"></div>
                  <p className="text-[1.4vw] text-outline leading-relaxed max-w-[60%]">
                    {activeMenu === 'Services' ? 'Curated experiences designed for your absolute comfort. From world-class spa treatments to hospitality services.' : 
                     activeMenu === 'Dining' ? 'Explore our signature dining options, from in-room delivery to Michelin-starred restaurants.' :
                     'Discover the best local attractions, shopping, and transit options around the hotel.'}
                  </p>
                </div>
                <div className="flex gap-[2vw] overflow-x-auto no-scrollbar pb-[5vh] items-stretch flex-1">
                  {activeMenu === 'Dining' && renderSubMenuHorizontalCards(diningMenu)}
                  {activeMenu === 'Services' && renderSubMenuHorizontalCards(servicesMenu)}
                  {activeMenu === 'Local Guide' && renderSubMenuHorizontalCards(guideMenu)}
                </div>
              </div>
            ) : (
              // --- VERTICAL LAYOUT ---
              <div className="flex flex-1 min-h-0 gap-[4vw]">
                <div className="w-[35%] flex flex-col justify-center pr-[2vw] pb-[10vh]">
                  <h2 className="font-display-lg text-[4vw] mb-4 text-white leading-tight">{activeMenu}</h2>
                  <div className="w-[6vw] h-1 bg-secondary mb-[2vh]"></div>
                  <p className="text-[1.4vw] text-outline leading-relaxed">
                     Select an option to view details or press BACK to return to the home screen.
                  </p>
                </div>

                <div className="w-[65%] flex flex-col gap-[2vh] overflow-y-auto no-scrollbar pb-[10vh] items-center px-[1vw]">
                  {/* Legacy menus not fully populated yet */}
                  {activeMenu === 'Channel TV' && mockChannels.map((ch, idx) => (
                    <button
                      key={ch.id}
                      ref={el => { if (el) subMenuRefs.current[idx] = el }}
                      onClick={() => {}}
                      className="flex-shrink-0 w-full h-[22vh] rounded-2xl overflow-hidden relative group border-2 border-transparent transition-all duration-300 hover:scale-[1.01] glow-focus outline-none"
                    >
                      <img loading="lazy" className="absolute inset-0 w-full h-full object-cover transform-gpu transition-transform duration-1000 group-hover:scale-105" src={ch.bgImage} />
                      <div className="absolute inset-0 bg-gradient-overlay-x flex items-center p-[2vw] text-left gap-[2vw]">
                        <div className={`w-[8vw] h-[8vw] ${ch.color} rounded-xl flex items-center justify-center text-white font-bold text-[2vw] shadow-2xl flex-shrink-0`}>{ch.name.substring(0,3).toUpperCase()}</div>
                        <div className="flex-1">
                          <span className="inline-block px-[1vw] py-[0.5vh] bg-secondary text-black text-[0.8vw] font-bold rounded-full mb-[1vh] tracking-widest flex items-center gap-1 w-fit"><span className="material-symbols-outlined" style={{fontSize:'1vw'}}>tv</span> CH {ch.number < 10 ? '0'+ch.number : ch.number}</span>
                          <h3 className="font-display-lg text-[2.5vw] leading-tight mb-[0.5vh] text-white">{ch.name}</h3>
                        </div>
                      </div>
                    </button>
                  ))}
                  
                  {activeMenu === 'Entertainment' && mockApps.map((app, idx) => (
                    <button
                      key={app.id}
                      ref={el => { if (el) subMenuRefs.current[idx] = el }}
                      onClick={() => {}}
                      className="flex-shrink-0 w-full h-[22vh] rounded-2xl overflow-hidden relative group border-2 border-transparent transition-all duration-300 hover:scale-[1.01] glow-focus outline-none"
                    >
                      <img loading="lazy" className="absolute inset-0 w-full h-full object-cover transform-gpu transition-transform duration-1000 group-hover:scale-105" src={app.bgImage} />
                      <div className="absolute inset-0 bg-gradient-overlay-x flex items-center p-[2vw] text-left gap-[2vw]">
                        <div className={`w-[8vw] h-[8vw] ${app.color} rounded-2xl flex items-center justify-center text-white font-bold text-[3vw] shadow-2xl flex-shrink-0`}>{app.icon}</div>
                        <div className="flex-1">
                           <h3 className="font-display-lg text-[2.5vw] leading-tight mb-[0.5vh] text-white">{app.name}</h3>
                        </div>
                      </div>
                    </button>
                  ))}

                  {(activeMenu === 'Messages' || activeMenu === 'Settings') && (
                    <div className="w-full h-full flex flex-col items-center justify-center opacity-50" style={{ padding: '15vh 0' }}>
                      <span className="material-symbols-outlined text-secondary" style={{ fontSize: '6vw', marginBottom: '2vh' }}>construction</span>
                      <h3 className="font-display-lg text-white" style={{ fontSize: '3vw', marginBottom: '1vh' }}>Under Construction</h3>
                      <button ref={el => subMenuRefs.current[0] = el} onClick={() => setActiveMenu(null)} className="rounded-full bg-white/10 px-[2vw] py-[1vh] mt-[2vh] focus:border-secondary focus:bg-white/20 outline-none border border-transparent">Go Back</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Modal Overlay ── */}
        {selectedItem && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-300">
             {renderModalContent()}
          </div>
        )}

      </main>
    </div>
  )
}

export default App
