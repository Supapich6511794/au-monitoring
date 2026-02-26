'use client'

import { 
  X,
  Sliders,
  LayoutGrid,
  Lightbulb,
  Clock,
  CreditCard,
  Users,
  Store,
  Code2,
  Brain,
  Server,
  Container,
  HardDrive,
  Shield,
  Activity,
  ChevronRight,
  Star,
  ExternalLink,
  Folder,
  Download,
  Files,
  Laptop,
  Home,
  Database,
  Lock,
  EyeOff
} from 'lucide-react'
import { cn } from './utils'
import { useAuth } from '@/hooks/useAuth'
import { usePageVisibility } from '@/contexts/PageVisibilityContext'
import { Portal } from './Portal'

interface SidebarItem {
  icon: React.ReactNode
  label: string
  hasChevron?: boolean
  hasStar?: boolean
  isActive?: boolean
  href?: string
  adminOnly?: boolean
}

interface GCPSidebarProps {
  isOpen: boolean
  onClose: () => void
  activeItem?: string
  onItemClick?: (label: string) => void
  onNavigate?: (url: string, label: string) => void
}

export function GCPSidebar({ isOpen, onClose, activeItem = 'Course Monitoring', onItemClick, onNavigate }: GCPSidebarProps) {
  const { user } = useAuth()
  const { hiddenPages, fullyHiddenPages, isAdmin } = usePageVisibility()
  
  // Navigation URLs for all pages
  const pageUrls: Record<string, string> = {
    'Home Page': '/home',
    'Project Overview': '/project-overview',
    'Documentation': '/documentation',
    'TQF Master 2.0 Desktop': '/tqf-desktop',
    'Course Monitoring': '/course-monitoring',
    'Course Planner': '/course-planner',
    'TQF Master 2.0': '/tqf-master',
    'Registration Simulator': '/registration-simulator',
    'APIs & Services': '/apis-services',
    'Admin Panel': '/admin-panel',
  }

  const topItems: SidebarItem[] = [
    { icon: <Home className="w-5 h-5" />, label: 'Home Page', hasChevron: true, href: pageUrls['Home Page'] },
    { icon: <Laptop className="w-5 h-5" />, label: 'Project Overview', hasChevron: true, href: pageUrls['Project Overview'] },
    { icon: <Files className="w-5 h-5" />, label: 'Documentation', hasChevron: true, href: pageUrls['Documentation'] },
    { icon: <Download className="w-5 h-5" />, label: 'TQF Master 2.0 Desktop', hasChevron: true, href: pageUrls['TQF Master 2.0 Desktop'] },
  ]

  const productItems: SidebarItem[] = [
    { icon: <Brain className="w-5 h-5" />, label: 'Course Monitoring', hasChevron: true, href: pageUrls['Course Monitoring'] },
    { icon: <Folder className="w-5 h-5" />, label: 'TQF Master 2.0', hasChevron: true, href: pageUrls['TQF Master 2.0'] },
    { icon: <Brain className="w-5 h-5" />, label: 'Course Planner', hasChevron: true, href: pageUrls['Course Planner'], adminOnly: true },
    { icon: <Database className="w-5 h-5" />, label: 'Registration Simulator', hasChevron: true, href: pageUrls['Registration Simulator'], adminOnly: true },
    { icon: <Code2 className="w-5 h-5" />, label: 'APIs & Services', hasChevron: true, href: pageUrls['APIs & Services'], adminOnly: true },
    { icon: <Users className="w-5 h-5" />, label: 'Admin Panel', hasChevron: true, href: pageUrls['Admin Panel'], adminOnly: true },
  ]

  // Show all items but mark admin-only ones
  const filteredTopItems = topItems
  const filteredProductItems = productItems

  const handleItemClick = (item: SidebarItem) => {
    // If item has external URL and it's not the current active item, navigate
    if (item.href && item.label !== activeItem) {
      onNavigate?.(item.href, item.label)
      onClose()
      return
    }
    onItemClick?.(item.label)
  }

  return (
    <><Portal>
      {/* Backdrop */}
     
      <div 
        className={cn(
          "fixed inset-0 bg-black/20 z-[60] transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed top-0 left-0 h-full w-[280px] bg-white border-r border-[#e0e0e0] z-[70] flex flex-col font-['Inter',_'Roboto',_sans-serif]",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e0e0e0]">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-red-600 tracking-tight">AU</span>
            <span className="text-xl font-light text-gray-700">Monitoring</span>
          </div>
          <div className="w-9" /> {/* Spacer for centering */}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Top navigation */}
          <nav className="py-2">
            {filteredTopItems.map((item) => {
              const isHidden = hiddenPages.has(item.label)
              const isFullyHidden = fullyHiddenPages.has(item.label)
              // Fully hidden = hide from everyone including admin
              if (isFullyHidden) return null
              // Regular hidden = hide from non-admins only
              if (isHidden && !isAdmin) return null
              
              return (
                <button
                  key={item.label}
                  onClick={() => handleItemClick(item)}
                  className={cn(
                    "w-full flex items-center gap-4 px-6 py-3 hover:bg-gray-100 transition-colors text-left",
                    activeItem === item.label && "bg-blue-50",
                    isHidden && "opacity-60"
                  )}
                >
                  <span className="text-gray-600">{item.icon}</span>
                  <span className="flex-1 text-sm text-gray-700">{item.label}</span>
                  {isHidden && isAdmin && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-orange-100 text-orange-600 rounded flex items-center gap-1">
                      <EyeOff className="w-3 h-3" />
                      Hidden
                    </span>
                  )}
                  {item.hasChevron && <ChevronRight className="w-4 h-4 text-gray-400" />}
                </button>
              )
            })}
          </nav>

          <div className="border-t border-[#e0e0e0] mx-4" />

          {/* Favorite products section */}
          <div className="py-4 px-6">

          </div>

          {/* Products section */}
          <div className="pb-4">
            <h3 className="text-sm font-medium text-gray-800 px-6 mb-2">Feature</h3>
            <nav>
              {filteredProductItems.map((item) => {
                const isHidden = hiddenPages.has(item.label)
                const isFullyHidden = fullyHiddenPages.has(item.label)
                // Fully hidden = hide from everyone including admin
                if (isFullyHidden) return null
                // Regular hidden = hide from non-admins only
                if (isHidden && !isAdmin) return null
                
                return (
                  <button
                    key={item.label}
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      "w-full flex items-center gap-4 px-6 py-3 hover:bg-gray-100 transition-colors text-left",
                      item.label === activeItem && "bg-[#e8f0fe] border-l-4 border-blue-500",
                      isHidden && "opacity-60"
                    )}
                  >
                    <span className={cn(
                      "text-gray-600",
                      item.label === activeItem && "text-blue-600"
                    )}>
                      {item.icon}
                    </span>
                    <span className={cn(
                      "flex-1 text-sm",
                      item.label === activeItem ? "text-blue-600 font-medium" : "text-gray-700"
                    )}>
                      {item.label}
                    </span>
                    {isHidden && isAdmin && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-orange-100 text-orange-600 rounded flex items-center gap-1">
                        <EyeOff className="w-3 h-3" />
                        Hidden
                      </span>
                    )}
                    {item.adminOnly && !isHidden && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-600 rounded">
                        Admin
                      </span>
                    )}
                    {item.hasStar && (
                      <Star className="w-4 h-4 text-gray-300 hover:text-yellow-400 transition-colors" />
                    )}
                    {item.hasChevron && <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>
                )
              }) }
            </nav>
          </div>
        </div>

      </aside>
      </Portal>
    </>
  )
}
