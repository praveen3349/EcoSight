"use client"
import React, { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Search, Map as MapIcon, Grid as GridIcon, MapPin, Plus, Trash2, Check, X, RefreshCw } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useRole } from "@/lib/useRole"
import { getBins, createBin, deleteBin, emptyBin } from "@/lib/api"

type BinStatus = 'empty' | 'moderate' | 'full' | 'offline' | 'WARNING' | 'FULL' | 'NORMAL'
type Bin = {
  id: string; name: string; location: string; status: string;
  fill_percentage: number; 
  plastic_capacity: number;
  metal_capacity: number;
  glass_capacity: number;
  paper_capacity: number;
  bio_hazard_capacity: number;
  counters: {
    plastic: number;
    metal: number;
    glass: number;
    paper: number;
    bio_hazard: number;
  };
  last_emptied_at: string;
  updatedAt: string;
}

function AddBinModal({ onClose, onAdd }: { onClose: () => void; onAdd: () => void }) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name || !location) return
    setLoading(true)
    try {
      await createBin({
        name,
        location,
        plastic_capacity: 100,
        metal_capacity: 50,
        glass_capacity: 40,
        paper_capacity: 80,
        bio_hazard_capacity: 30
      })
      onAdd()
      onClose()
    } catch (e) {
      console.error(e)
      alert("Failed to create bin")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold">Add New Bin</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">Bin Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Gate 12 Recycling"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Location / Zone</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Zone 5"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={!name || !location || loading}>
            <Check className="w-4 h-4 mr-2" /> {loading ? "Adding..." : "Add Bin"}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

export default function BinsPage() {
  const { isAdmin } = useRole()
  const [view, setView] = useState<'grid' | 'map'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [bins, setBins] = useState<Bin[]>([])
  const [showAddBin, setShowAddBin] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchBins = async () => {
    try {
      const data = await getBins()
      setBins(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBins()
    const interval = setInterval(fetchBins, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this bin?")) return
    try {
      await deleteBin(id)
      fetchBins()
    } catch (e) {
      console.error(e)
      alert("Failed to delete bin")
    }
  }

  const handleEmpty = async (id: string) => {
    if (!confirm("Mark this bin as empty?")) return
    try {
      await emptyBin(id)
      fetchBins()
    } catch (e) {
      console.error(e)
      alert("Failed to empty bin")
    }
  }

  const filteredBins = useMemo(() => bins.filter(bin => {
    const matchesSearch = bin.name.toLowerCase().includes(searchQuery.toLowerCase()) || bin.location.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || bin.status?.toLowerCase() === statusFilter.toLowerCase()
    return matchesSearch && matchesStatus
  }), [bins, searchQuery, statusFilter])

  const statusColor = (s: string) => {
    const lc = s?.toLowerCase() || ''
    if (lc === 'normal' || lc === 'empty') return 'bg-green-500'
    if (lc === 'warning' || lc === 'moderate') return 'bg-yellow-500'
    if (lc === 'full') return 'bg-red-500'
    return 'bg-slate-400'
  }
  
  const statusBadge = (s: string) => {
    const lc = s?.toLowerCase() || ''
    if (lc === 'normal' || lc === 'empty') return 'text-green-600 border-green-500/40 bg-green-500/10'
    if (lc === 'warning' || lc === 'moderate') return 'text-yellow-600 border-yellow-500/40 bg-yellow-500/10'
    if (lc === 'full') return 'text-red-600 border-red-500/40 bg-red-500/10'
    return 'text-slate-500 border-slate-500/40 bg-slate-500/10'
  }

  return (
    <div className="h-full flex flex-col space-y-6 max-w-7xl mx-auto">
      <AnimatePresence>
        {showAddBin && <AddBinModal onClose={() => setShowAddBin(false)} onAdd={fetchBins} />}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Bins & Locations</h2>
          <p className="text-muted-foreground mt-1">Manage and monitor all deployed smart bins. {bins.length} total.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="icon" onClick={fetchBins} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <div className="flex bg-secondary p-1 rounded-lg">
            <button className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${view === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setView('grid')}>
              <GridIcon className="w-4 h-4" /> Grid
            </button>
            <button className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${view === 'map' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setView('map')}>
              <MapIcon className="w-4 h-4" /> Map
            </button>
          </div>
          {isAdmin && (
            <Button className="gap-2" onClick={() => setShowAddBin(true)}>
              <Plus className="w-4 h-4" /> Add Bin
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search bins by name or location..."
            className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'normal', 'warning', 'full', 'offline']).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {loading && bins.length === 0 ? (
        <div className="flex justify-center items-center h-32">Loading bins...</div>
      ) : view === 'grid' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {filteredBins.map((bin, i) => {
               const totalItems = Object.values(bin.counters || {}).reduce((a, b) => a + (b as number), 0) as number;
               return (
                <motion.div key={bin.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.04 }}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base font-semibold">{bin.name}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />{bin.location}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium border px-2 py-0.5 rounded-full capitalize ${statusBadge(bin.status)}`}>{bin.status?.toLowerCase() || 'unknown'}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-muted-foreground">Fill Level (est)</span>
                          <span className="font-semibold">{bin.fill_percentage || 0}%</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${(bin.fill_percentage||0) > 85 ? 'bg-red-500' : (bin.fill_percentage||0) > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(bin.fill_percentage || 0, 100)}%` }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-xs">
                        {['plastic', 'paper', 'metal', 'bio_hazard'].map(k => (
                          <div key={k} className="text-center bg-secondary/50 rounded-md p-1.5 overflow-hidden">
                            <div className="font-semibold">{bin.counters ? bin.counters[k as keyof typeof bin.counters] || 0 : 0}</div>
                            <div className="text-muted-foreground capitalize text-[10px] truncate">{k.replace("_", " ")}</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-xs text-muted-foreground">Updated {new Date(bin.updatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                        {isAdmin && (
                          <div className="flex gap-2">
                             <button onClick={() => handleEmpty(bin.id)}
                              className="text-xs font-medium text-muted-foreground hover:text-green-600 border border-border bg-card px-2 py-1 rounded transition-colors">
                              Empty Bin
                            </button>
                            <button onClick={() => handleDelete(bin.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors px-2 py-1" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            )}
          </AnimatePresence>
          {bins.length === 0 && <div className="text-muted-foreground py-8">No bins found.</div>}
        </div>
      )}

      {/* Map View */}
      {view === 'map' && (
        <Card className="flex-1">
          <CardContent className="p-4 h-[500px] relative">
            <div className="w-full h-full bg-secondary/30 rounded-xl border border-border relative overflow-hidden">
              <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                <defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="currentColor" strokeWidth="0.5"/></pattern></defs>
                <rect width="100%" height="100%" fill="url(#grid)"/>
              </svg>
              <div className="absolute top-3 left-3 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-md border border-border">Facility Floor Plan</div>
              {filteredBins.map((bin, i) => {
                const idNum = parseInt(bin.id.substring(bin.id.length - 4), 16) || i;
                const x = 10 + (idNum % 80);
                const y = 10 + ((idNum * 7) % 80);
                return (
                  <div key={bin.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                    style={{ left: `${x}%`, top: `${y}%` }}>
                    <div className={`w-4 h-4 rounded-full ${statusColor(bin.status)} shadow-lg border-2 border-background transition-transform group-hover:scale-150`} />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 pointer-events-none">
                      <div className="bg-card border border-border rounded-lg px-2 py-1.5 shadow-lg text-xs min-w-[120px]">
                        <p className="font-semibold">{bin.name}</p>
                        <p className="text-muted-foreground">{bin.location} · {bin.fill_percentage || 0}% full</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
