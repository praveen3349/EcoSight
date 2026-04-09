"use client"
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { AlertCircle, Trash2, Activity, ArrowUpRight, ArrowDownRight, Camera, Loader2, RefreshCw, X } from "lucide-react"
import { motion } from "framer-motion"
import { getDashboardStats, resolveAlert } from "@/lib/api"

const PIE_COLORS: Record<string, string> = {
  Plastic: "hsl(var(--primary))",
  Paper: "#3b82f6",
  Glass: "#06b6d4",
  Metal: "#8b5cf6",
  "Bio-Hazard": "#ef4444",
  Unknown: "#9ca3af",
}

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const loadStats = async () => {
    try {
      const data = await getDashboardStats()
      setStats(data)
    } catch {
      // Use fallback mock data when backend isn't connected
      setStats({
        total_detections_today: 0,
        contamination_rate_pct: 0,
        active_cameras: 0,
        total_cameras: 0,
        active_alerts: 0,
        bins_normal: 0,
        bins_warning: 0,
        bins_critical: 0,
        detection_timeline: [
          { time: "08:00", detections: 0 },
          { time: "09:00", detections: 0 },
          { time: "10:00", detections: 0 },
          { time: "11:00", detections: 0 },
          { time: "12:00", detections: 0 },
          { time: "13:00", detections: 0 },
          { time: "14:00", detections: 0 },
        ],
        waste_distribution: [],
        bin_fill_levels: [],
        recent_alerts: [],
      })
    } finally {
      setLoading(false)
      setLastRefresh(new Date())
    }
  }

  const handleResolveAlert = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await resolveAlert(id)
      setStats((prev: any) => ({
        ...prev,
        active_alerts: Math.max(0, prev.active_alerts - 1),
        recent_alerts: prev.recent_alerts.filter((a: any) => a.id !== id)
      }))
    } catch {
      console.error("Failed to dismiss alert")
    }
  }

  useEffect(() => { loadStats() }, [])
  useEffect(() => {
    const interval = setInterval(loadStats, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  )

  const kpis = [
    {
      title: "Total Waste Detected",
      value: stats.total_detections_today.toLocaleString(),
      suffix: " items",
      icon: Trash2,
      change: null,
      sub: "Today",
    },
    {
      title: "Contamination Rate",
      value: `${stats.contamination_rate_pct}%`,
      icon: AlertCircle,
      change: null,
      sub: "Of all detections today",
      alert: stats.contamination_rate_pct > 15,
    },
    {
      title: "Active Monitors",
      value: "1",
      suffix: `/1`,
      icon: Camera,
      change: null,
      sub: `100% Uptime`,
    },
    {
      title: "Active Alerts",
      value: stats.active_alerts,
      icon: Activity,
      change: null,
      sub: `${stats.bins_warning} warning · ${stats.bins_critical} critical bins`,
      alert: stats.active_alerts > 0,
    },
  ]

  const pieData = stats.waste_distribution.map((d: any) => ({
    ...d,
    color: PIE_COLORS[d.name] || "#9ca3af",
  }))

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Overview</h2>
          <p className="text-muted-foreground mt-1">Real-time telemetry and waste intelligence.</p>
        </div>
        <button onClick={loadStats} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
          {lastRefresh.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className={kpi.alert ? "border-destructive/40 bg-destructive/5" : ""}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                <kpi.icon className={`h-4 w-4 ${kpi.alert ? "text-destructive" : "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {kpi.value}<span className="text-sm font-normal text-muted-foreground">{kpi.suffix}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <div className="space-y-6 md:col-span-5">
          {/* Detection Timeline */}
          <Card>
            <CardHeader><CardTitle>Detection Volume (Last 7 Hours)</CardTitle></CardHeader>
            <CardContent className="pl-2">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.detection_timeline} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                    <Line type="monotone" dataKey="detections" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--primary))" }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Waste Distribution Pie */}
            <Card>
              <CardHeader><CardTitle>Waste Distribution</CardTitle></CardHeader>
              <CardContent className="flex justify-center">
                <div className="h-[220px] w-full">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value">
                          {pieData.map((entry: any, index: number) => <Cell key={index} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No detections yet today</div>
                  )}
                </div>
                {pieData.length > 0 && (
                  <div className="flex flex-col justify-center gap-1.5 ml-2">
                    {pieData.map((d: any) => (
                      <div key={d.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-muted-foreground">{d.name}</span>
                        <span className="font-semibold ml-auto">{d.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bin Fill Levels */}
            <Card>
              <CardHeader><CardTitle>Bin Fill Levels</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  {stats.bin_fill_levels.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.bin_fill_levels} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="bin" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                        <Bar dataKey="fill" radius={[4, 4, 0, 0]}>
                          {stats.bin_fill_levels.map((entry: any, i: number) => (
                            <Cell key={i} fill={entry.fill > 85 ? "hsl(var(--destructive))" : entry.fill > 60 ? "#f59e0b" : "hsl(var(--primary))"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No bins configured yet</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Alerts Panel */}
        <div className="md:col-span-2">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                Live Alerts
                <Badge variant="outline" className="font-normal text-xs">{stats.active_alerts} Active</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-3 overflow-auto max-h-[500px]">
              {stats.recent_alerts.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  All clear — no active alerts
                </div>
              ) : stats.recent_alerts.map((alert: any) => (
                <div key={alert.id} className="group relative pr-10 p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors">
                  <div className={`absolute top-0 left-0 w-1 h-full rounded-l-lg ${alert.type === "critical" ? "bg-destructive" : alert.type === "warning" ? "bg-amber-500" : "bg-blue-500"}`} />
                  <div className="pl-2 space-y-1">
                    <p className="text-sm font-medium leading-snug">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">{alert.time}</p>
                  </div>
                  <button onClick={(e) => handleResolveAlert(alert.id, e)} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-secondary rounded-md text-muted-foreground transition-all">
                    <X className="w-4 h-4 cursor-pointer" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
