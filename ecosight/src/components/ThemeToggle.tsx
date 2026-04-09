"use client"

import * as React from "react"
import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return (
     <button className="p-2 rounded-full hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors w-9 h-9 opacity-50 flex items-center justify-center">
        <Monitor className="h-5 w-5" />
     </button>
  )

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  return (
    <button 
      onClick={toggleTheme}
      className="p-2 rounded-full hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-all w-9 h-9 flex items-center justify-center relative"
      aria-label="Toggle theme"
    >
      {theme === 'light' && <Sun className="h-5 w-5" />}
      {theme === 'dark' && <Moon className="h-5 w-5" />}
      {theme === 'system' && <Monitor className="h-5 w-5" />}
    </button>
  )
}
