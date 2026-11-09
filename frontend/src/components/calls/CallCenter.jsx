import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  ShieldAlert,
  X,
} from 'lucide-react'
import {
  acceptCall,
  createCall,
  endCall,
  failCall,
  getActiveCalls,
  getCallById,
  getIceConfig,
  rejectCall,
} from '../../services/api'
import { getStoredAuth } from '../../context/authStore'
import { CALL_EVENT } from './requestCall'

function wsBase() {
  const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1'
  return apiBase.replace(/^http/, 'ws')
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function roleLabel(role) {
  if (role === 'ADMIN' || role === 'POLICE' || role === 'RESCUE') {
    return 'Control room'
  }
  if (role === 'AMBULANCE') return 'Ambulance crew'
  if (role === 'HOSPITAL') return 'Hospital'
  return 'Responder'
}

function sdpPayload(description) {
  return { type: description.type, sdp: description.sdp }
}

/**
 * Global voice-call widget. Mounted once per staff layout.
 *
 * Voice-only WebRTC. SDP/ICE is relayed through the existing `/ws/calls`
 * WebSocket; call state is persisted by the backend. Nothing is recorded.
 */
export default function CallCenter() {
  const [session, setSession] = useState(null)
  const [note, setNote] = useState(null)
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const sessionRef = useRef(null)
  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const streamRef = useRef(null)
  const pendingIceRef = useRef([])
  const connectedAtRef = useRef(null)
  const startingRef = useRef(false)
  const noteTimerRef = useRef(null)
  const audioRef = useRef(null)
  const messageHandlerRef = useRef(null)
  const startOutgoingRef = useRef(null)
  const cleanupRef = useRef(null)
  const connectionLostRef = useRef(null)

  const audioElement = (
    <audio ref={audioRef} autoPlay playsInline className="hidden" />
  )

  function applySession(next) {
    sessionRef.current = next
    setSession(next)
  }

  const showNote = useCallback((text, tone = 'info') => {
    setNote({ text, tone })
    clearTimeout(noteTimerRef.current)
    noteTimerRef.current = setTimeout(() => setNote(null), 7000)
  }, [])

  function sendSignal(type, callId, payload) {
    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify({ type, call_id: callId, payload }))
    return true
  }

  function cleanupPeer() {
    const pc = pcRef.current
    if (pc) {
      try {
        pc.onicecandidate = null
        pc.ontrack = null
        pc.onconnectionstatechange = null
        pc.close()
      } catch {
        /* already closed */
      }
    }
    pcRef.current = null

    const stream = streamRef.current
    if (stream) stream.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (audioRef.current) audioRef.current.srcObject = null
    pendingIceRef.current = []
    startingRef.current = false
    connectedAtRef.current = null
    setMuted(false)
    setSeconds(0)
  }
  cleanupRef.current = cleanupPeer

  async function ensurePeer() {
    if (pcRef.current) return pcRef.current
    let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]
    try {
      const config = await getIceConfig()
      if (config?.ice_servers?.length) iceServers = config.ice_servers
    } catch {
      /* fall back to a public STUN server; signaling can still work */
    }
    const pc = new RTCPeerConnection({ iceServers })
    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      const call = sessionRef.current?.call
      if (call) sendSignal('call.ice', call.id, { candidate: event.candidate })
    }
    pc.ontrack = (event) => {
      if (audioRef.current) audioRef.current.srcObject = event.streams[0]
    }
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return
      if (pc.connectionState === 'failed') {
        failCurrent('The voice connection failed. Check your network and try again.')
      }
    }
    pcRef.current = pc
    return pc
  }

  async function ensureLocalStream() {
    if (streamRef.current) return streamRef.current
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone access.')
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      })
      streamRef.current = stream
      return stream
    } catch (error) {
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        throw new Error(
          'Microphone permission was denied. Allow microphone access and try again.'
        )
      }
      throw new Error('Could not access your microphone.')
    }
  }

  async function attachLocalTracks(pc) {
    const stream = await ensureLocalStream()
    for (const track of stream.getAudioTracks()) {
      const alreadyAdded = pc
        .getSenders()
        .some((sender) => sender.track === track)
      if (!alreadyAdded) pc.addTrack(track, stream)
    }
    return stream
  }

  async function flushPendingIce(pc) {
    const queued = pendingIceRef.current
    pendingIceRef.current = []
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate)
      } catch {
        /* stale candidate */
      }
    }
  }

  async function failCurrent(reason) {
    const call = sessionRef.current?.call
    cleanupPeer()
    applySession(null)
    showNote(reason || 'The call failed.', 'error')
    if (call) {
      try {
        await failCall(call.id, 'webrtc_failed')
      } catch {
        /* the server may already have closed it */
      }
    }
  }

  async function startOffer() {
    const call = sessionRef.current?.call
    if (!call || startingRef.current) return
    startingRef.current = true
    try {
      const pc = await ensurePeer()
      await attachLocalTracks(pc)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const sent = sendSignal('call.offer', call.id, {
        sdp: sdpPayload(pc.localDescription),
      })
      if (!sent) throw new Error('The signaling connection is not ready.')
    } catch (error) {
      await failCurrent(
        error?.message || 'Could not start the voice connection.'
      )
    } finally {
      startingRef.current = false
    }
  }

  async function handleOffer(payload) {
    const call = sessionRef.current?.call
    if (!call || !payload?.sdp) return
    try {
      const pc = await ensurePeer()
      await attachLocalTracks(pc)
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      await flushPendingIce(pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignal('call.answer', call.id, {
        sdp: sdpPayload(pc.localDescription),
      })
    } catch (error) {
      await failCurrent(error?.message || 'Could not answer the call.')
    }
  }

  async function handleAnswer(payload) {
    const pc = pcRef.current
    if (!pc || !payload?.sdp) return
    try {
      if (!pc.remoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        await flushPendingIce(pc)
      }
    } catch {
      await failCurrent('Could not establish the voice connection.')
    }
  }

  async function handleIce(payload) {
    const candidate = payload?.candidate
    if (!candidate) return
    const pc = pcRef.current
    if (!pc || !pc.remoteDescription) {
      pendingIceRef.current.push(candidate)
      return
    }
    try {
      await pc.addIceCandidate(candidate)
    } catch {
      /* candidate may belong to a closed connection */
    }
  }

  function markConnected(updated) {
    const current = sessionRef.current
    if (!current) return
    if (!connectedAtRef.current) connectedAtRef.current = Date.now()
    const call = updated ? { ...current.call, ...updated } : current.call
    applySession({ ...current, call, status: 'CONNECTED' })
    if (current.direction === 'outgoing') startOffer()
  }

  async function startOutgoing(incidentId) {
    if (!incidentId) return
    if (sessionRef.current) {
      showNote('Finish the current call before starting another.', 'warn')
      return
    }
    try {
      const call = await createCall({ incident_id: incidentId })
      connectedAtRef.current = null
      setSeconds(0)
      applySession({ call, direction: 'outgoing', status: 'CALLING' })
    } catch (error) {
      showNote(
        error.response?.data?.detail || 'Could not start the call.',
        'error'
      )
    }
  }
  startOutgoingRef.current = startOutgoing

  async function handleInvite(payload) {
    if (sessionRef.current) return
    try {
      const call = await getCallById(payload.call_id)
      connectedAtRef.current = null
      setSeconds(0)
      applySession({ call, direction: 'incoming', status: 'RINGING' })
    } catch {
      /* call was cancelled before we could fetch it */
    }
  }

  async function acceptIncoming() {
    const call = sessionRef.current?.call
    if (!call) return
    try {
      const updated = await acceptCall(call.id)
      if (!sessionRef.current) return
      connectedAtRef.current = Date.now()
      applySession({
        ...sessionRef.current,
        call: { ...sessionRef.current.call, ...updated },
        status: 'CONNECTED',
      })
    } catch (error) {
      showNote(
        error.response?.data?.detail || 'Could not accept the call.',
        'error'
      )
      cleanupPeer()
      applySession(null)
    }
  }

  async function rejectIncoming() {
    const call = sessionRef.current?.call
    cleanupPeer()
    applySession(null)
    showNote('Call rejected.')
    if (call) {
      try {
        await rejectCall(call.id)
      } catch {
        /* already closed */
      }
    }
  }

  async function hangUp() {
    const call = sessionRef.current?.call
    cleanupPeer()
    applySession(null)
    showNote('Call ended.')
    if (call) {
      try {
        await endCall(call.id)
      } catch {
        /* already closed */
      }
    }
  }

  function toggleMute() {
    const stream = streamRef.current
    if (!stream) return
    const next = !muted
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setMuted(next)
  }

  function handleConnectionLost() {
    const current = sessionRef.current
    if (!current) return
    cleanupPeer()
    applySession(null)
    showNote(
      'The live connection was lost. The call has been closed.',
      'error'
    )
    try {
      if (current.status === 'CONNECTED') endCall(current.call.id)
      else failCall(current.call.id, 'signaling_disconnected')
    } catch {
      /* best effort */
    }
  }
  connectionLostRef.current = handleConnectionLost

  messageHandlerRef.current = (message) => {
    const call = sessionRef.current?.call
    const payload = message?.payload || {}
    switch (message?.type) {
      case 'call.invite':
        handleInvite(payload)
        break
      case 'call.accepted':
        if (call && payload.call_id === call.id) markConnected(payload)
        break
      case 'call.offer':
        if (call && payload.call_id === call.id) handleOffer(payload.payload)
        break
      case 'call.answer':
        if (call && payload.call_id === call.id) handleAnswer(payload.payload)
        break
      case 'call.ice':
        if (call && payload.call_id === call.id) handleIce(payload.payload)
        break
      case 'call.rejected':
        if (call && payload.call_id === call.id) {
          cleanupPeer()
          applySession(null)
          showNote('The call was rejected.', 'error')
        }
        break
      case 'call.ended':
        if (call && payload.call_id === call.id) {
          cleanupPeer()
          applySession(null)
          showNote('The call ended.')
        }
        break
      case 'call.failed':
        if (call && payload.call_id === call.id) {
          cleanupPeer()
          applySession(null)
          showNote('The call failed.', 'error')
        }
        break
      case 'call.peer_disconnected':
        if (call && payload.call_id === call.id) {
          cleanupPeer()
          applySession(null)
          showNote('The other participant disconnected.', 'error')
        }
        break
      default:
        break
    }
  }

  // Resume any call that was still active after a page reload.
  useEffect(() => {
    let cancelled = false
    getActiveCalls()
      .then((calls) => {
        if (cancelled || sessionRef.current || !calls?.length) return
        const auth = getStoredAuth()
        const call = calls[0]
        const outgoing = call.caller?.id === auth?.userId
        const status = call.status === 'CONNECTED' ? 'CONNECTED' : 'RINGING'
        if (call.status === 'CONNECTED') connectedAtRef.current = Date.now()
        applySession({
          call,
          direction: outgoing ? 'outgoing' : 'incoming',
          status,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Signaling socket (SDP/ICE relay + call notifications).
  useEffect(() => {
    let stopped = false
    let attempts = 0
    let reconnectTimer
    let pingTimer

    const connect = () => {
      const auth = getStoredAuth()
      if (!auth?.token) return
      const socket = new WebSocket(
        `${wsBase()}/ws/calls?token=${encodeURIComponent(auth.token)}`
      )
      wsRef.current = socket

      socket.onopen = () => {
        attempts = 0
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send('ping')
        }, 25000)
      }

      socket.onmessage = (event) => {
        try {
          messageHandlerRef.current?.(JSON.parse(event.data))
        } catch {
          /* ignore keepalives */
        }
      }

      socket.onclose = () => {
        clearInterval(pingTimer)
        if (wsRef.current === socket) wsRef.current = null
        if (stopped) return
        if (sessionRef.current) connectionLostRef.current?.()
        const delay = Math.min(1000 * 2 ** attempts, 15000)
        attempts += 1
        reconnectTimer = setTimeout(connect, delay)
      }

      socket.onerror = () => socket.close()
    }

    connect()

    return () => {
      stopped = true
      clearTimeout(reconnectTimer)
      clearInterval(pingTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  // Triggered by a page-level "Call responder / Call control room" button.
  useEffect(() => {
    const handler = (event) => {
      startOutgoingRef.current?.(event.detail?.incidentId)
    }
    window.addEventListener(CALL_EVENT, handler)
    return () => window.removeEventListener(CALL_EVENT, handler)
  }, [])

  // Live call duration.
  useEffect(() => {
    if (session?.status !== 'CONNECTED') return undefined
    const timer = setInterval(() => {
      setSeconds(
        Math.max(
          0,
          Math.floor((Date.now() - (connectedAtRef.current || Date.now())) / 1000)
        )
      )
    }, 1000)
    return () => clearInterval(timer)
  }, [session?.status])

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      clearTimeout(noteTimerRef.current)
    }
  }, [])

  const auth = getStoredAuth()
  const meId = auth?.userId
  const call = session?.call
  const isCaller = call?.caller?.id === meId
  const peer = call ? (isCaller ? call.receiver : call.caller) : null

  return (
    <>
      {audioElement}

      {session && (
        <div className="fixed inset-x-3 bottom-20 z-[60] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-80">
          <div className="overflow-hidden rounded-xl border border-navy-600 bg-navy-900 shadow-2xl shadow-black/60">
            <div className="flex items-center gap-2 border-b border-navy-800 bg-navy-950/70 px-3 py-2">
              <PhoneCall size={14} className="text-emerald-400" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Voice call
              </span>
              <span className="ml-auto rounded bg-navy-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                {call?.public_code || 'Incident'}
              </span>
            </div>

            <div className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                  <Phone size={18} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-100">
                    {peer?.full_name || 'Unknown participant'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {roleLabel(peer?.role)}
                  </div>
                </div>
                <div className="ml-auto text-right">
                  {session.status === 'CONNECTED' ? (
                    <div className="font-mono text-sm font-bold text-emerald-300">
                      {formatDuration(seconds)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                      <Loader2 size={11} className="animate-spin" />
                      {session.direction === 'outgoing' ? 'Calling…' : 'Ringing'}
                    </div>
                  )}
                  <div className="text-[10px] uppercase tracking-wide text-slate-600">
                    {session.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-center gap-2">
                {session.direction === 'incoming' &&
                session.status === 'RINGING' ? (
                  <>
                    <button
                      type="button"
                      onClick={acceptIncoming}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                    >
                      <Phone size={14} /> Accept
                    </button>
                    <button
                      type="button"
                      onClick={rejectIncoming}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500"
                    >
                      <PhoneOff size={14} /> Reject
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={toggleMute}
                      disabled={session.status !== 'CONNECTED'}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40 ${
                        muted
                          ? 'border-amber-600 bg-amber-500/10 text-amber-300'
                          : 'border-navy-600 text-slate-300 hover:bg-navy-800'
                      }`}
                      aria-pressed={muted}
                    >
                      {muted ? <MicOff size={14} /> : <Mic size={14} />}
                      {muted ? 'Unmute' : 'Mute'}
                    </button>
                    <button
                      type="button"
                      onClick={hangUp}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500"
                    >
                      <PhoneOff size={14} />
                      {session.status === 'CONNECTED' ? 'End call' : 'Cancel'}
                    </button>
                  </>
                )}
              </div>

              <p className="mt-2 text-center text-[10px] text-slate-600">
                Voice only · not recorded · {call?.room ? 'encrypted in browser' : 'WebRTC'}
              </p>
            </div>
          </div>
        </div>
      )}

      {note && (
        <div className="fixed inset-x-3 bottom-20 z-[61] sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-80">
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-xl shadow-black/50 ${
              note.tone === 'error'
                ? 'border-red-700/60 bg-red-950/95 text-red-200'
                : note.tone === 'warn'
                  ? 'border-amber-700/60 bg-amber-950/95 text-amber-200'
                  : 'border-navy-600 bg-navy-900/95 text-slate-200'
            }`}
          >
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">{note.text}</span>
            <button
              type="button"
              onClick={() => setNote(null)}
              aria-label="Dismiss notification"
              className="text-slate-500 hover:text-slate-200"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
