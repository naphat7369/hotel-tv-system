import { NavLink } from "react-router-dom"
import { LayoutDashboard, Tv, MonitorPlay, Users, X, Activity, Smartphone } from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "../ui/Button"
import { ThemeToggle } from "../ui/ThemeToggle"

interface SidebarProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const navItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
  { name: "Channel Mgmt", path: "/channels", icon: Tv },
  { name: "App Mgmt", path: "/apps", icon: Smartphone },
  { name: "Device Management", path: "/mdm", icon: Smartphone },
  { name: "Broadcast Marquee", path: "/broadcast", icon: Activity },
  { name: "Guest Services", path: "/services", icon: Users },
  { name: "Guest Requests", path: "/requests", icon: Activity },
  { name: "Screen Designer", path: "/screens", icon: LayoutDashboard },
]

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-outline-variant bg-surface-container-lowest transition-transform duration-300 ease-in-out lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-outline-variant">
          <span className="font-bold text-lg tracking-tight text-on-surface">
            FleetControl
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-5 w-5 stroke-[1.5]" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-3">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)} // Close mobile menu on click
                className={({ isActive }) =>
                  cn(
                    "group flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary border-l-4 border-primary rounded-l-none"
                      : "border-l-4 border-transparent text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface rounded-l-none"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon 
                      className={cn(
                        "mr-3 h-[20px] w-[20px] flex-shrink-0 stroke-[1.5]",
                        isActive ? "text-primary" : "text-outline group-hover:text-on-surface"
                      )} 
                      aria-hidden="true" 
                    />
                    {item.name}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        
        {/* System Health Widget at Bottom */}
        <div className="p-4 mt-auto">
          <div className="rounded-lg bg-surface-container p-4 border border-outline-variant">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/10">
                <Activity className="h-5 w-5 text-green-500 stroke-[1.5]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-on-surface">System Health</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">All systems operational</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
