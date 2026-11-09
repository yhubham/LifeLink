import { useEffect, useRef, useState } from 'react'
import { getStoredToken } from '../context/authStore'

function wsBase() {
  const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1'
  return apiBase.replace(/^http/, 'ws')
}

/**
 * Subscribe to a LifeLink realtime channel.
 *
 * @param {string|null} channel  e.g. "admin", "ambulance", "hospital", "incidents/<id>"
 * @param {(message: {type: string, payload: object, at: string}) => void} onEvent
 * @returns {boolean} whether the socket is currently connected
 */
export function useRealtime(channel, onEvent, options = {}) {
  const [connected, setConnected] = useState(false)
  const handlerRef = useRef(onEvent)
  const { token: tokenOverride = null, path = null } = options

  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!channel) return undefined
    const token = tokenOverride || getStoredToken()
    if (!token) return undefined

    let socket
    let reconnectTimer
    let pingTimer
    let stopped = false
    let attempts = 0

    const connect = () => {
      socket = new WebSocket(
        `${wsBase()}/ws/${path || channel}?token=${encodeURIComponent(token)}`
      )

      socket.onopen = () => {
        attempts = 0
        setConnected(true)
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send('ping')
        }, 25000)
      }

      socket.onmessage = (event) => {
        try {
          handlerRef.current?.(JSON.parse(event.data))
        } catch {
          /* ignore non-JSON keepalives */
        }
      }

      socket.onclose = () => {
        setConnected(false)
        clearInterval(pingTimer)
        if (stopped) return
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
      socket?.close()
    }
  }, [channel, tokenOverride, path])

  return connected
}

export default useRealtime
