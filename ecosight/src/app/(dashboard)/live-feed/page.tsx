"use client"

import React, {
  useState, useEffect, useRef, useCallback
} from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { motion, AnimatePresence } from "framer-motion"
import {
  Camera, CameraOff, Upload, Video, Scan, Activity,
  AlertTriangle, ShieldCheck, Loader2, Play, X,
  FileVideo, Eye, CheckCircle2, RefreshCw,
  Trash2, Recycle, Layers, Zap, FlaskConical,
  User, TrendingUp
} from "lucide-react"
import { getBins, uploadVideo, getWsUrl, getSessions, getResultVideoUrl, getWebcamWsUrl } from "@/lib/api"

// ── Types ─────────────────────────────────────────────────────────────────────
type BinOption = { id: string; name: string; location: string }

type DetectionEvent = {
  type: "detection" | "human"
  label: string
  risk: "low" | "high" | "warning"
  confidence: number
  track_id?: number
  is_contamination?: boolean
  is_liquid?: boolean
  timestamp: string
}

type ClassCounts = {
  Plastic: number; Metal: number; Glass: number
  Paper: number; "Bio-Hazard": number; Unknown: number
}

type BinInfo = { name: string; fill: number }

type WebcamState = "idle" | "requesting" | "active" | "error"

type Session = {
  id: string; filename: string
  status: "queued" | "processing" | "completed" | "failed"
  progress_pct: number; processed_frames: number; total_frames: number
  detections_count: number; contamination_count: number; face_blurs_count: number
  error_message?: string
  summary?: { class_counts: Record<string, number>; total_items: number; contamination_count: number }
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CLASS_META: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  Plastic:     { color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30",     icon: Recycle },
  Metal:       { color: "text-orange-500",  bg: "bg-orange-500/10  border-orange-500/30",      icon: Layers },
  Glass:       { color: "text-cyan-400",    bg: "bg-cyan-400/10    border-cyan-400/30",         icon: FlaskConical },
  Paper:       { color: "text-blue-400",    bg: "bg-blue-400/10    border-blue-400/30",         icon: FileVideo },
  "Bio-Hazard":{ color: "text-red-500",     bg: "bg-red-500/10     border-red-500/30",          icon: AlertTriangle },
  Unknown:     { color: "text-zinc-400",    bg: "bg-zinc-500/10    border-zinc-500/30",         icon: Scan },
}

const EMPTY_COUNTS: ClassCounts = {
  Plastic: 0, Metal: 0, Glass: 0, Paper: 0, "Bio-Hazard": 0, Unknown: 0
}

// ── Webcam hook ───────────────────────────────────────────────────────────────
function useWebcam() {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const [state, setState] = useState<WebcamState>("idle")
  const [error, setError] = useState("")
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string>("")

  const loadDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const cams = all.filter(d => d.kind === "videoinput")
      setDevices(cams)
      if (cams.length && !activeDeviceId) setActiveDeviceId(cams[0].deviceId)
    } catch {}
  }, [activeDeviceId])

  useEffect(() => { loadDevices() }, [loadDevices])

  const start = useCallback(async (deviceId?: string) => {
    setState("requesting")
    setError("")
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
        },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setState("active")
      await loadDevices()
    } catch (e: any) {
      setError(e.message || "Camera access denied")
      setState("error")
    }
  }, [loadDevices])

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setState("idle")
  }, [])

  const switchDevice = useCallback(async (deviceId: string) => {
    setActiveDeviceId(deviceId)
    await start(deviceId)
  }, [start])

  return { videoRef, state, error, devices, activeDeviceId, setActiveDeviceId, start, stop, switchDevice }
}

// ── Frame sender hook: captures frames from webcam → WS → gets back annotated frame ──
function useWebcamDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  webcamState: WebcamState,
  enabled: boolean,
  onResult: (result: {
    frame: string
    detections: DetectionEvent[]
    counts: ClassCounts
    contamination_count: number
    face_blur_count: number
    fps: number
    bin_info?: BinInfo
  }) => void,
  binId: string
) {
  const wsRef        = useRef<WebSocket | null>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const loopRef      = useRef<number | null>(null)
  const pendingRef   = useRef(false)
  const [connected, setConnected] = useState(false)

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return
    const url = getWebcamWsUrl()
    const ws  = new WebSocket(url)
    wsRef.current = ws

    ws.onopen  = () => setConnected(true)
    ws.onclose = () => { setConnected(false); pendingRef.current = false }
    ws.onerror = () => { setConnected(false); pendingRef.current = false }

    ws.onmessage = (e) => {
      pendingRef.current = false
      try {
        const data = JSON.parse(e.data)
        if (data.error) return
        onResult({
          frame: data.frame,
          detections: (data.detections || []).map((d: any) => ({
            ...d, timestamp: new Date().toLocaleTimeString(),
          })),
          counts: data.counts || EMPTY_COUNTS,
          contamination_count: data.contamination_count || 0,
          face_blur_count: data.face_blur_count || 0,
          fps: data.fps || 0,
          bin_info: data.bin_info,
        })
      } catch {}
    }
  }, [onResult])

  const disconnect = useCallback(() => {
    if (loopRef.current) cancelAnimationFrame(loopRef.current)
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    pendingRef.current = false
  }, [])

  // Main capture loop
  useEffect(() => {
    if (!enabled || webcamState !== "active") {
      disconnect()
      return
    }
    connect()

    const canvas = canvasRef.current!
    const ctx    = canvas.getContext("2d")!

    const sendFrame = () => {
      const video = videoRef.current
      if (
        video && !video.paused && !video.ended &&
        wsRef.current?.readyState === WebSocket.OPEN &&
        !pendingRef.current
      ) {
        canvas.width  = 1280
        canvas.height = 720
        ctx.drawImage(video, 0, 0, 1280, 720)
        const b64 = canvas.toDataURL("image/jpeg", 0.95).split(",")[1]
        wsRef.current.send(JSON.stringify({ frame: b64, bin_id: binId }))
        pendingRef.current = true
      }
      loopRef.current = requestAnimationFrame(sendFrame)
    }

    loopRef.current = requestAnimationFrame(sendFrame)
    return () => {
      if (loopRef.current) cancelAnimationFrame(loopRef.current)
    }
  }, [enabled, webcamState, connect, disconnect, videoRef, binId])

  return { canvasRef, connected }
}

// ── Detection Log Panel ───────────────────────────────────────────────────────
function DetectionLogPanel({
  events,
  counts,
  contaminationCount,
  faceBlurCount,
  fps,
  connected,
}: {
  events: DetectionEvent[]
  counts: ClassCounts
  contaminationCount: number
  faceBlurCount: number
  fps: number
  connected: boolean
}) {
  const totalItems = Object.entries(counts)
    .filter(([k]) => k !== "Unknown")
    .reduce((s, [, v]) => s + v, 0)

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="p-3 border-b border-border bg-muted/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${connected ? "text-green-500 animate-pulse" : "text-muted-foreground"}`} />
          <span className="text-sm font-semibold">Live Detections</span>
        </div>
        <div className="flex items-center gap-2">
          {connected && fps > 0 && (
            <span className="text-xs font-mono bg-green-500/10 text-green-600 border border-green-500/20 px-1.5 py-0.5 rounded">
              {fps} FPS
            </span>
          )}
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-zinc-400"}`} />
        </div>
      </div>

      {/* Class count grid */}
      <div className="p-3 border-b border-border grid grid-cols-2 gap-1.5">
        {Object.entries(CLASS_META).filter(([k]) => k !== "Unknown").map(([cls, meta]) => {
          const cnt = counts[cls as keyof ClassCounts] || 0
          const Icon = meta.icon
          return (
            <div key={cls} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border ${meta.bg}`}>
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${meta.color}`} />
              <div className="min-w-0">
                <p className={`text-xs font-bold ${meta.color}`}>{cnt}</p>
                <p className="text-[10px] text-muted-foreground truncate">{cls}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary badges */}
      <div className="px-3 py-2 border-b border-border flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-xs bg-secondary rounded-lg px-2.5 py-1.5">
          <TrendingUp className="w-3 h-3 text-primary" />
          <span className="font-semibold">{totalItems}</span>
          <span className="text-muted-foreground">items</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="w-3 h-3 text-red-500" />
          <span className="font-semibold text-red-500">{contaminationCount}</span>
          <span className="text-muted-foreground">contam.</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs bg-secondary rounded-lg px-2.5 py-1.5">
          <User className="w-3 h-3 text-muted-foreground" />
          <span className="font-semibold">{faceBlurCount}</span>
          <span className="text-muted-foreground">blurred</span>
        </div>
      </div>

      {/* Event scroll list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {events.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs mt-8 space-y-2">
            <Scan className="w-7 h-7 mx-auto opacity-25" />
            <p>Waiting for detections…</p>
            <p className="opacity-60">{connected ? "Scanning frames" : "Enable webcam to start"}</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {events.slice(0, 40).map((ev, i) => {
              const meta = CLASS_META[ev.label] || CLASS_META.Unknown
              const Icon = meta.icon
              return (
                <motion.div
                  key={`${ev.timestamp}-${i}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex gap-2.5 text-xs"
                >
                  <div className={`mt-0.5 p-1 rounded-md flex-shrink-0 ${meta.bg}`}>
                    {ev.risk === "high" ? (
                      <AlertTriangle className={`w-3 h-3 ${meta.color}`} />
                    ) : ev.type === "human" ? (
                      <User className="w-3 h-3 text-amber-500" />
                    ) : (
                      <Icon className={`w-3 h-3 ${meta.color}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold ${ev.risk === "high" ? "text-red-500" : "text-foreground"}`}>
                        {ev.label}
                        {ev.track_id !== undefined && (
                          <span className="text-muted-foreground font-normal"> #{ev.track_id}</span>
                        )}
                      </span>
                      {ev.is_contamination && (
                        <span className="text-[9px] bg-red-500/15 text-red-500 border border-red-500/30 px-1 py-0.5 rounded font-semibold">
                          {ev.is_liquid ? "LIQUID" : "CONTAM"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground">
                      <span>{(ev.confidence * 100).toFixed(0)}% conf</span>
                      <span>·</span>
                      <span>{ev.timestamp}</span>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

// ── Annotated frame overlay canvas ────────────────────────────────────────────
function AnnotatedOverlay({ frameSrc }: { frameSrc: string }) {
  const imgRef = useRef<HTMLImageElement>(null)
  return frameSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={`data:image/jpeg;base64,${frameSrc}`}
      alt="annotated"
      className="absolute inset-0 w-full h-full object-cover"
      draggable={false}
    />
  ) : null
}

// ── Upload Panel ──────────────────────────────────────────────────────────────
function UploadPanel({ bins, onSessionStarted }: {
  bins: BinOption[]
  onSessionStarted: (r: { session_id: string }) => void
}) {
  const [file, setFile]       = useState<File | null>(null)
  const [binId, setBinId]     = useState("")
  const [pct, setPct]         = useState(0)
  const [uploading, setUpl]   = useState(false)
  const [drag, setDrag]       = useState(false)
  const inputRef              = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!f.type.startsWith("video/") && !f.type.startsWith("image/") && !/\.(mp4|avi|mov|mkv|webm|jpg|jpeg|png)$/i.test(f.name)) {
      alert("Please upload a video or photo file in standard format (mp4, avi, jpg, png, etc)")
      return
    }
    setFile(f)
  }

  const handleUpload = async () => {
    if (!file || !binId) return
    setUpl(true); setPct(0)
    try {
      const result = await uploadVideo(file, binId, undefined, setPct)
      onSessionStarted(result)
      setFile(null); setBinId(""); setPct(0)
    } catch (e: any) {
      alert(`Upload failed: ${e.message}`)
    } finally {
      setUpl(false)
    }
  }

  return (
    <Card className="border border-dashed border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" /> Upload Video & Photo for Offline Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          onDrop={(e) => { e.preventDefault(); setDrag(false); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]) }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onClick={() => !file && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${drag ? "border-primary bg-primary/5" : file ? "border-green-500/50 bg-green-500/5" : "border-border hover:border-primary/40 hover:bg-secondary/20"}`}
        >
          <input ref={inputRef} type="file" accept="video/*,image/*,.mp4,.avi,.mov,.mkv,.webm,.jpg,.jpeg,.png" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileVideo className="w-7 h-7 text-green-500 flex-shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-sm font-medium truncate max-w-[180px]">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button className="ml-auto text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); setFile(null) }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <Video className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Drop or click to browse</p>
              <p className="text-xs text-muted-foreground">Video & Image formats (MP4, AVI, JPG, PNG) · Max 500 MB</p>
            </div>
          )}
        </div>
        <select value={binId} onChange={(e) => setBinId(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Select bin to assign *</option>
          {bins.map(b => <option key={b.id} value={b.id}>{b.name} — {b.location}</option>)}
        </select>
        {uploading && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Uploading…</span><span>{pct}%</span></div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        <Button className="w-full gap-2 text-sm" disabled={!file || !binId || uploading} onClick={handleUpload}>
          {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading…</> : <><Play className="w-3.5 h-3.5" />Start AI Detection</>}
        </Button>
      </CardContent>
    </Card>
  )
}

// ── Session Card ──────────────────────────────────────────────────────────────
function SessionCard({ session, onView }: { session: Session; onView: (session: Session) => void }) {
  const done   = session.status === "completed"
  const failed = session.status === "failed"
  const busy   = !done && !failed
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="border border-border rounded-xl p-3.5 bg-card space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate">{session.filename}</p>
          <p className="text-[10px] text-muted-foreground">{new Date(session.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
        </div>
        {done   ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
        : failed ? <X className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        :          <Loader2 className="w-4 h-4 text-amber-500 animate-spin flex-shrink-0 mt-0.5" />}
      </div>
      {busy && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{session.processed_frames}/{session.total_frames} frames</span>
            <span>{Math.round(session.progress_pct)}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${session.progress_pct}%` }} />
          </div>
        </div>
      )}
      {done && session.summary && (
        <div className="grid grid-cols-3 gap-1.5">
          <div className="text-center bg-secondary/50 rounded-lg py-1.5"><p className="text-sm font-bold">{session.summary.total_items}</p><p className="text-[9px] text-muted-foreground">Items</p></div>
          <div className="text-center bg-red-500/10 border border-red-500/20 rounded-lg py-1.5"><p className="text-sm font-bold text-red-500">{session.contamination_count}</p><p className="text-[9px] text-muted-foreground">Contam.</p></div>
          <div className="text-center bg-secondary/50 rounded-lg py-1.5"><p className="text-sm font-bold">{session.face_blurs_count}</p><p className="text-[9px] text-muted-foreground">Blurred</p></div>
        </div>
      )}
      {done && session.summary?.class_counts && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(session.summary.class_counts).filter(([, v]) => v > 0).map(([cls, cnt]) => {
            const meta = CLASS_META[cls] || CLASS_META.Unknown
            return (
              <span key={cls} className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${meta.bg} ${meta.color}`}>
                {cls}: {cnt}
              </span>
            )
          })}
        </div>
      )}
      {failed && session.error_message && (
        <p className="text-[10px] text-destructive bg-destructive/10 rounded px-2 py-1">{session.error_message}</p>
      )}
      {done && (
        <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs h-7" onClick={() => onView(session)}>
          <Eye className="w-3 h-3" /> View Result
        </Button>
      )}
    </motion.div>
  )
}

// ── Result Modal ──────────────────────────────────────────────────────────────
function ResultModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const url = getResultVideoUrl(session.id)
  const isImage = /\.(jpg|jpeg|png)$/i.test(session.filename)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-bold flex items-center gap-2"><FileVideo className="w-5 h-5 text-primary" />Annotated Detection Result</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">
          {isImage ? (
            <img src={url} alt="Detection Result" className="w-full rounded-xl bg-black object-contain max-h-[70vh]" />
          ) : (
            <video src={url} controls autoPlay className="w-full rounded-xl bg-black aspect-video" />
          )}
          <div className="flex justify-end mt-3">
            <a href={url} download={isImage ? `${session.id}_result.jpg` : `${session.id}_result.webm`} className="text-sm text-primary hover:underline">Download file</a>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function LiveFeedPage() {
  // Webcam
  const webcam = useWebcam()
  const [mlEnabled, setMlEnabled] = useState(false)
  const [liveBinId, setLiveBinId] = useState("")

  // Detection state
  const [annotatedFrame, setAnnotatedFrame] = useState("")
  const [events, setEvents]                 = useState<DetectionEvent[]>([])
  const [counts, setCounts]                 = useState<ClassCounts>(EMPTY_COUNTS)
  const [contamCount, setContamCount]       = useState(0)
  const [faceBlurCount, setFaceBlurCount]   = useState(0)
  const [livefps, setLiveFps]               = useState(0)
  const [binInfo, setBinInfo]               = useState<BinInfo | null>(null)

  // Reset counts when ML is turned off or webcam stops
  const resetDetection = () => {
    setAnnotatedFrame(""); setEvents([]); setCounts(EMPTY_COUNTS)
    setContamCount(0); setFaceBlurCount(0); setLiveFps(0); setBinInfo(null)
  }

  const handleDetectionResult = useCallback((result: {
    frame: string; detections: DetectionEvent[]
    counts: ClassCounts; contamination_count: number
    face_blur_count: number; fps: number; bin_info?: BinInfo
  }) => {
    setAnnotatedFrame(result.frame)
    setCounts(result.counts)
    setContamCount(result.contamination_count)
    setFaceBlurCount(result.face_blur_count)
    setLiveFps(result.fps)
    if (result.bin_info) setBinInfo(result.bin_info)
    if (result.detections.length > 0) {
      setEvents(prev => [...result.detections, ...prev].slice(0, 60))
    }
  }, [])

  const { canvasRef: captureCanvas, connected: wsConnected } = useWebcamDetection(
    webcam.videoRef,
    webcam.state,
    mlEnabled,
    handleDetectionResult,
    liveBinId
  )

  // Video upload
  const [bins, setBins]             = useState<BinOption[]>([])
  const [sessions, setSessions]     = useState<Session[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [resultSession, setResultSession] = useState<Session | null>(null)
  const wsRefs                      = useRef<Record<string, WebSocket>>({})

  useEffect(() => {
    getBins().then((d: any[]) => setBins(d.map(b => ({ id: b.id, name: b.name, location: b.location })))).catch(() => {})
    getSessions().then((d: Session[]) => setSessions(d.slice(0, 6))).catch(() => {})
  }, [])

  const subscribeSession = useCallback((id: string) => {
    if (wsRefs.current[id]) return
    const ws = new WebSocket(getWsUrl(id))
    wsRefs.current[id] = ws
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setSessions(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))
        if (data.status === "completed" || data.status === "failed") {
          ws.close(); delete wsRefs.current[id]
        }
      } catch {}
    }
  }, [])

  useEffect(() => {
    sessions.forEach(s => {
      if (s.status === "processing" || s.status === "queued") subscribeSession(s.id)
    })
  }, [sessions, subscribeSession])

  useEffect(() => () => { Object.values(wsRefs.current).forEach(ws => ws.close()) }, [])

  const handleSessionStarted = (r: { session_id: string }) => {
    const ns: Session = {
      id: r.session_id, filename: "Queued…", status: "queued", progress_pct: 0,
      processed_frames: 0, total_frames: 0, detections_count: 0,
      contamination_count: 0, face_blurs_count: 0, created_at: new Date().toISOString(),
    }
    setSessions(prev => [ns, ...prev.slice(0, 5)])
    subscribeSession(r.session_id)
    setShowUpload(false)
  }

  const handleStartWebcam = () => webcam.start(webcam.activeDeviceId)
  const handleStopWebcam  = () => { webcam.stop(); resetDetection() }

  const isCamActive = webcam.state === "active"

  return (
    <div className="flex flex-col space-y-4 max-w-screen-2xl mx-auto pb-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Live Feed</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Webcam AI detection · Video upload analysis
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Device selector */}
          {webcam.devices.length > 1 && (
            <select
              value={webcam.activeDeviceId}
              onChange={e => isCamActive ? webcam.switchDevice(e.target.value) : webcam.setActiveDeviceId(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {webcam.devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          )}

          {/* ML toggle */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${mlEnabled ? "bg-primary/5 border-primary/30" : "bg-card border-border"}`}>
            <Scan className={`w-4 h-4 ${mlEnabled ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-sm font-medium">AI Detection</span>
            <Switch
              checked={mlEnabled}
              disabled={!isCamActive}
              onCheckedChange={v => { setMlEnabled(v); if (!v) resetDetection() }}
            />
          </div>

          {/* Live Bin Selector */}
          <select value={liveBinId} onChange={(e) => setLiveBinId(e.target.value)}
            disabled={!isCamActive}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            <option value="">Select Bin (Optional)</option>
            {bins.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          {/* Camera toggle */}
          {!isCamActive ? (
            <Button onClick={handleStartWebcam} disabled={webcam.state === "requesting"} className="gap-2">
              {webcam.state === "requesting"
                ? <><Loader2 className="w-4 h-4 animate-spin" />Requesting…</>
                : <><Camera className="w-4 h-4" />Start Webcam</>}
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleStopWebcam} className="gap-2">
              <CameraOff className="w-4 h-4" /> Stop Webcam
            </Button>
          )}

          {/* Upload toggle */}
          <Button variant={showUpload ? "secondary" : "outline"} onClick={() => setShowUpload(v => !v)} className="gap-2">
            <Upload className="w-4 h-4" />
            {showUpload ? "Hide Upload" : "Upload Video"}
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {webcam.state === "error" && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span><strong>Camera error:</strong> {webcam.error}</span>
          <button className="ml-auto underline text-xs" onClick={handleStartWebcam}>Retry</button>
        </div>
      )}

      {/* Upload panel */}
      <AnimatePresence>
        {showUpload && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <UploadPanel bins={bins} onSessionStarted={handleSessionStarted} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main grid: video feed left, detections right */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">

        {/* Left: Camera feeds */}
        <div className="xl:col-span-3 space-y-4">

          {/* Primary webcam feed */}
          <Card className="overflow-hidden border-2 border-border shadow-md">
            <CardContent className="p-0">
              <div className="relative bg-zinc-950 aspect-video rounded-lg overflow-hidden">

                {/* Raw video element (hidden when ML is on — replaced by annotated frame) */}
                <video
                  ref={webcam.videoRef}
                  autoPlay playsInline muted
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity ${mlEnabled && annotatedFrame ? "opacity-0" : "opacity-100"}`}
                />

                {/* Annotated frame overlay from backend */}
                {mlEnabled && annotatedFrame && (
                  <AnnotatedOverlay frameSrc={annotatedFrame} />
                )}

                {/* Hidden capture canvas */}
                <canvas ref={captureCanvas} className="hidden" />

                {/* Idle state */}
                {webcam.state === "idle" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-zinc-500">
                    <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <Camera className="w-12 h-12 opacity-40" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-zinc-300">Webcam Not Started</p>
                      <p className="text-sm text-zinc-500 mt-1">Click "Start Webcam" to begin live detection</p>
                    </div>
                    <Button onClick={handleStartWebcam} className="gap-2 mt-2">
                      <Camera className="w-4 h-4" /> Start Webcam
                    </Button>
                  </div>
                )}

                {/* Loading state */}
                {webcam.state === "requesting" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400">
                    <Loader2 className="w-10 h-10 animate-spin" />
                    <p className="text-sm">Requesting camera access…</p>
                  </div>
                )}

                {/* Active — top HUD */}
                {isCamActive && (
                  <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex items-start justify-between pointer-events-none">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold bg-green-500/90 text-white px-2 py-0.5 rounded-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
                      </span>
                      {mlEnabled && (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${wsConnected ? "bg-primary/90 text-white border-primary" : "bg-amber-500/80 text-white border-amber-400"}`}>
                          {wsConnected ? `AI ON · ${livefps > 0 ? livefps + " FPS" : "…"}` : "AI CONNECTING…"}
                        </span>
                      )}
                      {binInfo && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md border bg-indigo-500/80 text-white border-indigo-400">
                          {binInfo.name} · {Math.round(binInfo.fill)}% Full
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {mlEnabled && counts && Object.entries(counts)
                        .filter(([k, v]) => k !== "Unknown" && v > 0)
                        .slice(0, 3)
                        .map(([cls, cnt]) => {
                          const meta = CLASS_META[cls] || CLASS_META.Unknown
                          return (
                            <span key={cls} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${meta.bg} ${meta.color}`}>
                              {cls} {cnt}
                            </span>
                          )
                        })
                      }
                    </div>
                  </div>
                )}

                {/* Active — bottom HUD */}
                {isCamActive && mlEnabled && contamCount > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-end pointer-events-none">
                    <div className="flex items-center gap-2 text-red-400 text-xs font-semibold">
                      <AlertTriangle className="w-4 h-4 animate-pulse" />
                      {contamCount} contamination event{contamCount !== 1 ? "s" : ""} detected
                    </div>
                  </div>
                )}

              </div>
            </CardContent>
          </Card>

          {/* Offline sessions */}
          {sessions.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileVideo className="w-4 h-4 text-primary" /> Video & Photo Processing Sessions
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence>
                  {sessions.map(s => (
                    <SessionCard key={s.id} session={s} onView={setResultSession} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* Right: Detection panel */}
        <div className="xl:col-span-1 border border-border bg-card rounded-xl flex flex-col shadow-sm min-h-[520px] overflow-hidden">
          <DetectionLogPanel
            events={events}
            counts={counts}
            contaminationCount={contamCount}
            faceBlurCount={faceBlurCount}
            fps={livefps}
            connected={wsConnected}
          />
        </div>

      </div>

      {/* Result Modal */}
      <AnimatePresence>
        {resultSession && (
          <ResultModal session={resultSession} onClose={() => setResultSession(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

