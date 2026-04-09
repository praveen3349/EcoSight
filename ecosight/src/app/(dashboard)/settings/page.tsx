"use client"
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Users as UsersIcon, Camera as CameraIcon, Bell, Shield, Trash2, Plus, AlertTriangle, UserPlus, SlidersHorizontal, Lock, Check, X } from "lucide-react"
import { useRole } from "@/lib/useRole"
import { motion, AnimatePresence } from "framer-motion"
import { getCameras, getUsers, createUser, deleteUser } from "@/lib/api"

type User = { id: string; first_name: string; last_name: string; email: string; role: string; created_at?: number }
type Camera = { id: string; name: string; ip: string; active: boolean }

function AddUserModal({ onClose, onAdd }: { onClose: () => void; onAdd: () => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('worker')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!firstName || !email || !password) return
    setLoading(true)
    try {
      await createUser({
        email, password, first_name: firstName, last_name: lastName, role
      })
      onAdd()
      onClose()
    } catch (e) {
      console.error(e)
      alert("Failed to create user. Ensure Clerk Secret Key is set.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold flex items-center gap-2"><UserPlus className="w-5 h-5 text-primary" /> Add New User</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1.5">First Name</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Last Name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Email Address</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com" type="email"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Temporary Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="********" type="password"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="admin">Administrator</option>
              <option value="worker">Field Worker</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={!firstName || !email || !password || loading}>
            <Check className="w-4 h-4 mr-2" /> {loading ? "Adding..." : "Add User"}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

function AddCameraModal({ onClose, onAdd }: { onClose: () => void; onAdd: (c: Camera) => void }) {
  const [name, setName] = useState('')
  const [ip, setIp] = useState('')

  const handleSubmit = () => {
    if (!name || !ip) return
    onAdd({ id: `cam-${Date.now()}`, name, ip, active: true })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold flex items-center gap-2"><CameraIcon className="w-5 h-5 text-primary" /> Add Camera</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">Camera Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Loading Bay Cam 1"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">IP Address / RTSP URL</label>
            <input value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.20 or rtsp://..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={!name || !ip}>
            <Check className="w-4 h-4 mr-2" /> Add Camera
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

export default function SettingsPage() {
  const { isAdmin } = useRole()
  const [users, setUsers] = useState<User[]>([])
  const [cameras, setCameras] = useState<Camera[]>([
    { id: 'cam-1', name: 'Main Sorter', ip: '192.168.1.10', active: true },
    { id: 'cam-2', name: 'Feeder Belt 1', ip: '192.168.1.11', active: true }
  ])
  const [thresholds, setThresholds] = useState({ binFull: 85, contaminationConfidence: 75, emailAlerts: true, smsAlerts: false })
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddCamera, setShowAddCamera] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(true)

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true)
      const data = await getUsers()
      setUsers(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Delete this user permanently from Clerk?")) return
    try {
      await deleteUser(id)
      fetchUsers()
    } catch (e) {
      console.error(e)
      alert("Failed to delete user.")
    }
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <AnimatePresence>
        {showAddUser && <AddUserModal onClose={() => setShowAddUser(false)} onAdd={fetchUsers} />}
        {showAddCamera && <AddCameraModal onClose={() => setShowAddCamera(false)} onAdd={c => setCameras(prev => [...prev, c])} />}
      </AnimatePresence>

      <div className="border-b border-border pb-6 flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <SlidersHorizontal className="w-7 h-7 text-primary" /> System Settings
          </h2>
          <p className="text-muted-foreground mt-2">Manage user access, hardware configuration, and detection thresholds.</p>
        </div>
        {!isAdmin && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg">
            <Lock className="w-4 h-4" /> View Only
          </div>
        )}
      </div>

      <Card className="shadow-sm border-border">
        <CardHeader className="bg-secondary/20 border-b border-border">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <UsersIcon className="w-5 h-5 text-primary" /> User Management
              </CardTitle>
              <CardDescription className="mt-1.5">Control organization access via Clerk integration.</CardDescription>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" className="gap-2 bg-background" onClick={() => setShowAddUser(true)}>
                <UserPlus className="w-4 h-4" /> Add User
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {loadingUsers ? (
              <div className="p-6 text-center text-muted-foreground">Loading users from Clerk...</div>
            ) : users.length === 0 ? (
              <div className="p-6 text-center text-amber-600 bg-amber-50">No users found. Please add a Clerk Secret Key to .env.</div>
            ) : users.map((user) => (
              <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 px-6 hover:bg-secondary/20 transition-colors">
                <div className="mb-3 sm:mb-0">
                  <p className="font-semibold text-sm">{user.first_name} {user.last_name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${user.role === 'admin'
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    }`}>
                    {user.role === 'admin' ? 'Admin' : 'Worker'}
                  </span>
                  {isAdmin && (
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Camera Management */}
      <Card className="shadow-sm border-border">
        <CardHeader className="bg-secondary/20 border-b border-border">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <CameraIcon className="w-5 h-5 text-primary" /> Hardware & Cameras
              </CardTitle>
              <CardDescription className="mt-1.5">Configure RTSP endpoints and toggle camera inference feeds.</CardDescription>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" className="gap-2 bg-background" onClick={() => setShowAddCamera(true)}>
                <Plus className="w-4 h-4" /> Add Camera
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {cameras.map((cam) => (
              <div key={cam.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 px-6 hover:bg-secondary/20 transition-colors">
                <div className="mb-3 sm:mb-0 flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cam.active ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-slate-400'}`} />
                  <div>
                    <p className="font-semibold text-sm">{cam.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{cam.ip}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{cam.active ? 'Online' : 'Offline'}</span>
                    <Switch
                      checked={cam.active}
                      disabled={!isAdmin}
                      onCheckedChange={(checked) => {
                        if (isAdmin) setCameras(cameras.map(c => c.id === cam.id ? { ...c, active: checked } : c))
                      }}
                    />
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setCameras(cameras.filter(c => c.id !== cam.id))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border">
        <CardHeader className="bg-secondary/20 border-b border-border">
          <CardTitle className="text-xl flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" /> Alert Thresholds
          </CardTitle>
          <CardDescription className="mt-1.5">Define global parameters for when the system triggers notifications.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-semibold text-sm">Bin Capacity Threshold</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">Triggers a &quot;full&quot; status when a bin exceeds this percentage.</p>
            </div>
            <div className="flex items-center gap-3">
              <input type="range" min="50" max="100"
                value={thresholds.binFull}
                disabled={!isAdmin}
                onChange={(e) => { if (isAdmin) setThresholds({ ...thresholds, binFull: parseInt(e.target.value) }) }}
                className={`w-32 accent-primary ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              />
              <div className="bg-secondary px-3 py-1 rounded-md border border-border min-w-[3.5rem] text-center font-bold text-sm">
                {thresholds.binFull}%
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border">
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Machine Verification Confidence
              </h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">Minimum AI confidence required to flag a contamination event.</p>
            </div>
            <div className="flex items-center gap-3">
              <input type="range" min="50" max="99"
                value={thresholds.contaminationConfidence}
                disabled={!isAdmin}
                onChange={(e) => { if (isAdmin) setThresholds({ ...thresholds, contaminationConfidence: parseInt(e.target.value) }) }}
                className={`w-32 accent-primary ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              />
              <div className="bg-secondary px-3 py-1 rounded-md border border-border min-w-[3.5rem] text-center font-bold text-sm">
                {thresholds.contaminationConfidence}%
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border">
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" /> Global SMS Dispatch
              </h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">Dispatch SMS texts to all Admins when critical events occur.</p>
            </div>
            <Switch
              className="data-[state=checked]:bg-destructive"
              checked={thresholds.smsAlerts}
              disabled={!isAdmin}
              onCheckedChange={(c) => { if (isAdmin) setThresholds({ ...thresholds, smsAlerts: c }) }}
            />
          </div>
        </CardContent>
        {isAdmin && (
          <CardFooter className="bg-secondary/10 border-t border-border p-4 flex justify-end">
            <Button className="font-semibold px-6 shadow-sm gap-2" onClick={handleSave}>
              {saved ? <><Check className="w-4 h-4" /> Saved!</> : 'Save Configuration'}
            </Button>
          </CardFooter>
        )}
        {!isAdmin && (
          <CardFooter className="bg-secondary/10 border-t border-border p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Lock className="w-4 h-4" /> Contact an Administrator to modify these settings.
            </p>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
