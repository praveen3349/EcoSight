"use client"
import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, Filter, Calendar, Loader2, RefreshCw, ChevronLeft, ChevronRight, FileDown } from "lucide-react"
import { getAuditLog, getReports } from "@/lib/api"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend, Cell } from 'recharts'
import { motion, AnimatePresence } from "framer-motion"
import Papa from 'papaparse'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type EventRow = {
  id: string; waste_type: string; confidence: number; is_contamination: boolean
  is_liquid_contamination: boolean; camera_id?: string; session_id?: string
  frame_index?: number; estimated_volume_ml?: number; timestamp: string
}

const TYPE_BADGE: Record<string, string> = {
  Plastic: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  Metal: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  Glass: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
  Paper: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  "Bio-Hazard": "bg-red-500/10 text-red-600 border-red-500/30",
  Unknown: "bg-secondary text-muted-foreground border-border",
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<EventRow[]>([])
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('monthly')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [wasteType, setWasteType] = useState("All")
  const [date, setDate] = useState("")
  const [reports, setReports] = useState<any>(null)
  const [showExportModal, setShowExportModal] = useState<{open: boolean, type: 'csv'|'pdf'}>({open: false, type: 'csv'})
  const [exportStart, setExportStart] = useState("")
  const [exportEnd, setExportEnd] = useState("")
  const [exporting, setExporting] = useState(false)
  const PAGE_SIZE = 10

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAuditLog({ page, page_size: PAGE_SIZE, waste_type: wasteType, date })
      setRows(data.items || [])
      setTotal(data.total || 0)
    } catch {
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, wasteType, date])

  const loadReportData = useCallback(async () => {
    try {
      const rep = await getReports(timeframe)
      setReports(rep)
    } catch (e) {
      console.error(e)
    }
  }, [timeframe])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadReportData() }, [loadReportData])

  const filtered = search
    ? rows.filter(r =>
        r.waste_type?.toLowerCase().includes(search.toLowerCase()) ||
        r.id?.toLowerCase().includes(search.toLowerCase()) ||
        r.camera_id?.toLowerCase().includes(search.toLowerCase())
      )
    : rows

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const triggerExportCSV = () => setShowExportModal({ open: true, type: 'csv' });
  const triggerExportPDF = () => setShowExportModal({ open: true, type: 'pdf' });

  const handleExportConfirm = async () => {
    if (!exportStart || !exportEnd) {
        alert("Please select start and end dates.");
        return;
    }
    setExporting(true);
    
    try {
      const res = await getAuditLog({ page: 1, page_size: 100000, start_date: exportStart, end_date: exportEnd });
      const allData = res.items || [];
      if (!allData.length) {
         alert("No data found in date range.");
         setExporting(false);
         return;
      }
      
      if (showExportModal.type === 'csv') {
         const csvData = allData.map((r: any) => ({
           ID: r.id,
           Timestamp: new Date(r.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
           CameraOrSession: r.camera_id || r.session_id || "—",
           WasteType: r.waste_type,
           Confidence: `${(r.confidence * 100).toFixed(0)}%`,
           Weight: r.estimated_volume_ml ? `${r.estimated_volume_ml} g` : "—",
           Status: r.is_contamination ? (r.is_liquid_contamination ? "Liquid Contam" : "Contamination") : "Clean",
         }));
         const csv = Papa.unparse(csvData);
         const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
         const link = document.createElement("a");
         const url = URL.createObjectURL(blob);
         link.href = url;
         link.setAttribute("download", `ecosight_audit_log_${new Date().toISOString().slice(0,10)}.csv`);
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
      } else {
         const doc = new jsPDF() as any;
         doc.text(`EcoSight Audit Log (${exportStart} to ${exportEnd})`, 14, 15);
         const tableData = allData.map((r: any) => [
           r.id.slice(-8),
           new Date(r.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
           r.camera_id || r.session_id?.slice(-6) || "—",
           r.waste_type,
           `${(r.confidence * 100).toFixed(0)}%`,
           r.estimated_volume_ml ? `${r.estimated_volume_ml} g` : "—",
           r.is_contamination ? (r.is_liquid_contamination ? "Liquid" : "Contam") : "Clean",
         ]);
         autoTable(doc, {
           head: [["ID", "Timestamp", "Source", "Type", "Conf.", "Weight", "Status"]],
           body: tableData,
           startY: 20,
           theme: 'grid',
         });
         doc.save(`ecosight_audit_log_${new Date().toISOString().slice(0,10)}.pdf`);
      }
      
      setShowExportModal({ ...showExportModal, open: false });
    } catch (e) {
      console.error(e);
      alert("Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">System Audit Log & Reports</h2>
          <p className="text-muted-foreground mt-1">Review historical AI detections, alerts, and aggregate reports.</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search by type, camera, or ID…"
              className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto flex-wrap">
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input type="date" className="bg-background border border-border text-foreground rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={date} onChange={e => { setDate(e.target.value); setPage(1) }} />
            </div>
            <div className="relative">
              <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <select className="bg-background border border-border text-foreground rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                value={wasteType} onChange={e => { setWasteType(e.target.value); setPage(1) }}>
                <option value="All">All Types</option>
                <option value="Plastic">Plastic</option>
                <option value="Metal">Metal</option>
                <option value="Glass">Glass</option>
                <option value="Paper">Paper</option>
                <option value="Bio-Hazard">Bio-Hazard</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col shadow-sm">
        <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
          <CardTitle>Detection Events <span className="text-sm font-normal text-muted-foreground">({total.toLocaleString()} total)</span></CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 sticky top-0 backdrop-blur-md">
                  <tr>
                    <th className="px-5 py-4 font-medium">ID</th>
                    <th className="px-5 py-4 font-medium">Timestamp</th>
                    <th className="px-5 py-4 font-medium">Camera / Session</th>
                    <th className="px-5 py-4 font-medium">Waste Type</th>
                    <th className="px-5 py-4 font-medium">Confidence</th>
                    <th className="px-5 py-4 font-medium">Weight (g)</th>
                    <th className="px-5 py-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                      {total === 0 ? "No detection events yet. Upload a video to get started." : "No events match your filters."}
                    </td></tr>
                  ) : filtered.map(row => {
                    const isContam = row.is_contamination
                    return (
                      <tr key={row.id} className={`hover:bg-secondary/30 transition-colors ${isContam ? "bg-red-500/5" : ""}`}>
                        <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{row.id.slice(-8)}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-muted-foreground text-xs">
                          {new Date(row.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded">
                            {row.camera_id || row.session_id?.slice(-6) || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TYPE_BADGE[row.waste_type] || TYPE_BADGE.Unknown}`}>
                            {row.waste_type}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-semibold text-xs">
                          {(row.confidence * 100).toFixed(0)}%
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {row.estimated_volume_ml ? `${row.estimated_volume_ml} g` : "—"}
                        </td>
                        <td className="px-5 py-3">
                          {isContam ? (
                            <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              {row.is_liquid_contamination ? "Liquid Contamination" : "Contamination"}
                            </span>
                          ) : (
                            <span className="text-xs text-green-600">Clean</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground font-medium">Page {page} of {totalPages}</span>
              <div className="flex items-center gap-1.5">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="p-1.5 rounded border border-border disabled:opacity-40 hover:bg-secondary transition-colors text-foreground">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalPages > 5 && page > 3) {
                     pageNum = Math.min(page - 2 + i, totalPages - 4 + i);
                  }
                  return (
                    <button key={pageNum} onClick={() => setPage(pageNum)}
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded border flex items-center justify-center text-xs font-semibold transition-colors ${
                        page === pageNum 
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm' 
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}>
                      {pageNum}
                    </button>
                  )
                })}

                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  className="p-1.5 rounded border border-border disabled:opacity-40 hover:bg-secondary transition-colors text-foreground">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Embedded Reports Analytics Section */}
      <div className="mt-12 space-y-6 pt-10 border-t border-border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Analytics Report</h2>
            <p className="text-muted-foreground mt-1 text-base">System-wide performance and collection metrics.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={triggerExportCSV} className="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm font-medium px-5 py-2.5 rounded-lg text-sm transition-colors">
              <FileDown className="w-4 h-4" /> CSV
            </button>
            <button onClick={triggerExportPDF} className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm font-medium px-5 py-2.5 rounded-lg text-sm transition-colors">
              <FileDown className="w-4 h-4" /> PDF
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center bg-card p-1.5 rounded-xl border border-border shadow-sm">
          <div className="flex space-x-1">
            {(['daily', 'weekly', 'monthly'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-6 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                  timeframe === t 
                  ? 'bg-primary text-primary-foreground shadow-md' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="hidden sm:flex items-center text-sm text-muted-foreground font-medium px-4 gap-2">
            <Calendar className="w-4 h-4" /> 
            {(() => {
              const today = new Date();
              const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' };
              const endStr = today.toLocaleDateString('en-IN', opts);
              if (timeframe === 'daily') return `Today (${endStr})`;
              
              const start = new Date(today);
              if (timeframe === 'weekly') start.setDate(start.getDate() - 7);
              if (timeframe === 'monthly') start.setMonth(start.getMonth() - 1);
              return `${start.toLocaleDateString('en-IN', opts)} — ${endStr}`;
            })()}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div 
            key={timeframe}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="grid gap-6 md:grid-cols-2"
          >
            {/* Main Trend Area */}
            <Card className="col-span-1 md:col-span-2 shadow-sm border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">Overall Waste Generation Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full mt-4">
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={reports?.waste_trends || []} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPlastic" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorPaper" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorGlass" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tickFormatter={(v) => `${v}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }}/>
                      <Area type="monotone" dataKey="plastic" name="Plastic" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorPlastic)" />
                      <Area type="monotone" dataKey="paper" name="Paper" stroke="#3b82f6" fillOpacity={1} fill="url(#colorPaper)" />
                      <Area type="monotone" dataKey="glass" name="Glass" stroke="#06b6d4" fillOpacity={1} fill="url(#colorGlass)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Contamination Rate */}
            <Card className="shadow-sm border-border bg-card">
              <CardHeader>
                <CardTitle className="text-lg">Contamination Rate Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full mt-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={reports?.contamination_trend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                      <Tooltip cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 2 }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontFeatureSettings: '"tnum"' }} />
                      <Line type="monotone" dataKey="rate" name="Contamination %" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--card))" }} activeDot={{ r: 6, fill: "#ef4444" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Bin Usage Density */}
            <Card className="shadow-sm border-border bg-card">
              <CardHeader>
                <CardTitle className="text-lg">Network Bin Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full mt-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={reports?.bin_usage || []} layout="vertical" margin={{ top: 0, right: 30, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="bin" type="category" stroke="hsl(var(--foreground))" tickLine={false} axisLine={false} fontWeight={500} fontSize={12} />
                      <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                      <Bar dataKey="usage" name="Peak Capacity %" fill="hsl(var(--primary))" barSize={24} radius={[0, 4, 4, 0]}>
                        {(reports?.bin_usage || []).map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={(entry.usage || 0) > 85 ? '#ef4444' : (entry.usage || 0) > 50 ? 'hsl(var(--primary))' : '#10b981'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      {showExportModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card w-full max-w-md rounded-xl p-6 shadow-xl border border-border">
            <h3 className="text-xl font-bold mb-1">Export Data</h3>
            <p className="text-sm text-muted-foreground mb-6">Select the date range you would like to export.</p>
            
            <div className="space-y-4 mb-6">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">From Date</label>
                <input type="date" value={exportStart} onChange={e => setExportStart(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">To Date</label>
                <input type="date" value={exportEnd} onChange={e => setExportEnd(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>

            <div className="flex justify-end gap-3 font-medium">
              <button 
                onClick={() => setShowExportModal({ ...showExportModal, open: false })}
                className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-secondary transition-colors"
                disabled={exporting}
              >
                Cancel
              </button>
              <button 
                onClick={handleExportConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
                disabled={exporting}
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                Download {showExportModal.type.toUpperCase()}
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  )
}
