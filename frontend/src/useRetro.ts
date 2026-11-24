import { useCallback, useEffect, useRef, useState } from 'react'
import type { Command, RetroView, ServerMessage } from './api'

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'gone'

type Pending = { resolve: () => void; reject: (e: Error) => void }

const HEARTBEAT_MS = 30_000

/**
 * Live connection to a retro. Reconnects with backoff; the server sends the full
 * current view on every connect, so nothing needs replaying.
 */
export function useRetro(retroId: string) {
  const [view, setView] = useState<RetroView | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const socket = useRef<WebSocket | null>(null)
  const pending = useRef(new Map<string, Pending>())

  useEffect(() => {
    let stopped = false
    let attempt = 0
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let retry: ReturnType<typeof setTimeout> | undefined

    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/api/retros/${retroId}/ws`)
      socket.current = ws

      ws.onopen = () => {
        attempt = 0
        setStatus('open')
        heartbeat = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), HEARTBEAT_MS)
      }
      ws.onmessage = (event) => {
        if (event.data === 'pong') return
        const msg = JSON.parse(event.data) as ServerMessage
        if (msg.type === 'view') return setView(msg.view)
        const p = pending.current.get(msg.requestId)
        pending.current.delete(msg.requestId)
        if (msg.type === 'ack') p?.resolve()
        else {
          setError(msg.reason)
          p?.reject(new Error(msg.reason))
        }
      }
      ws.onclose = (event) => {
        clearInterval(heartbeat)
        for (const p of pending.current.values()) p.reject(new Error('connection lost'))
        pending.current.clear()
        if (stopped) return
        if (event.code === 4404) return setStatus('gone')
        setStatus('reconnecting')
        retry = setTimeout(open, Math.min(10_000, 500 * 2 ** attempt++))
      }
    }

    open()
    // Reconnect promptly when a sleeping laptop wakes up.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && socket.current?.readyState === WebSocket.CLOSED) {
        clearTimeout(retry)
        open()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearTimeout(retry)
      clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', onVisible)
      socket.current?.close()
    }
  }, [retroId])

  const send = useCallback((command: Command) => {
    const ws = socket.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('Not connected. Retrying…')
      return Promise.reject(new Error('not connected'))
    }
    const requestId = crypto.randomUUID()
    const done = new Promise<void>((resolve, reject) => pending.current.set(requestId, { resolve, reject }))
    ws.send(JSON.stringify({ requestId, command }))
    // Rejections are surfaced through `error`; callers may still await or ignore.
    done.catch(() => {})
    return done
  }, [])

  return { view, status, error, clearError: () => setError(null), send }
}
