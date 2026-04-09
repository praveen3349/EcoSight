"use client"
import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { UserButton, useUser } from "@clerk/nextjs"
import { LayoutDashboard, Video, Trash2, Activity, PieChart, Settings, Leaf, Bell, Shield, HardHat, Menu, X } from "lucide-react"
import { ThemeToggle } from "@/components/ThemeToggle"
import { useRole } from "@/lib/useRole"
import { useState, useEffect } from "react"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { role, isAdmin, isLoaded } = useRole()
  const { user } = useUser()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Redirect if no role assigned yet
  useEffect(() => {
    if (isLoaded && user && !user.publicMetadata?.role) {
      router.push("/select-role")
    }
  }, [isLoaded, user, router])

  const allNavItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, adminOnly: false },
    { name: "Live Feed", href: "/live-feed", icon: Video, adminOnly: false },
    { name: "Bins & Locations", href: "/bins", icon: Trash2, adminOnly: false },
    { name: "Audit Log & Reports", href: "/audit-log", icon: Activity, adminOnly: false },
    { name: "Settings", href: "/settings", icon: Settings, adminOnly: true },
  ]

  const navItems = allNavItems.filter(item => !item.adminOnly || isAdmin)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-30 w-64 border-r border-border bg-card flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-border gap-3">
          <div className="bg-primary/10 p-1.5 rounded-lg text-primary">
            <Leaf className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-lg tracking-tight">EcoSight</span>
          </div>
          <button className="md:hidden text-muted-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Role Badge */}
        <div className="px-4 pt-4 pb-2">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
            isAdmin ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-600'
          }`}>
            {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <HardHat className="w-3.5 h-3.5" />}
            {isAdmin ? "Administrator" : "Field Worker"}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link key={item.name} href={item.href} onClick={() => setSidebarOpen(false)}>
                <div className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}>
                  <item.icon className="w-4 h-4 mr-3 flex-shrink-0" />
                  {item.name}
                </div>
              </Link>
            )
          })}
        </nav>

        {/* Bottom user info */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-2">
            <UserButton />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user?.firstName || user?.emailAddresses[0]?.emailAddress}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.emailAddresses[0]?.emailAddress}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Navbar */}
        <header className="h-16 border-b border-border bg-background/80 backdrop-blur-sm flex items-center justify-between px-4 md:px-6 z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 rounded-lg hover:bg-secondary text-muted-foreground"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-base font-semibold md:hidden">EcoSight</h2>
          </div>
          <div className="flex items-center gap-3">

            <ThemeToggle />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
