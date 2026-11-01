import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Browser Web Speech API wrapper. It never pretends to work in browsers that do
 * not expose SpeechRecognition; callers should show a manual-caption fallback.
 */
export default function useSpeechRecognition({ language = 'en', onInterim, onFinal, onError } = {}) {
  const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
  const supported = Boolean(Recognition)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef(null)
  const wantedRef = useRef(false)
  const restartTimerRef = useRef(null)
  const callbacksRef = useRef({ onInterim, onFinal, onError })

  useEffect(() => {
    callbacksRef.current = { onInterim, onFinal, onError }
  }, [onInterim, onFinal, onError])

  const buildRecognition = useCallback(() => {
    if (!Recognition) return null
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language || 'en-IN'
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setListening(true)
      setError('')
    }

    recognition.onresult = (event) => {
      let interim = ''
      let finalText = ''
      let confidence = null
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript || ''
        if (result.isFinal) {
          finalText += `${transcript} `
          if (typeof result[0]?.confidence === 'number') confidence = result[0].confidence
        } else {
          interim += transcript
        }
      }
      if (interim.trim()) callbacksRef.current.onInterim?.(interim.trim())
      if (finalText.trim()) callbacksRef.current.onFinal?.(finalText.trim(), confidence)
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      let message = 'Speech recognition stopped unexpectedly.'
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        message = 'Microphone permission was denied. Allow microphone access or type captions manually.'
        wantedRef.current = false
      } else if (event.error === 'network') {
        message = 'Browser speech recognition needs a network connection. You can still type captions manually.'
      } else if (event.error === 'audio-capture') {
        message = 'No working microphone was found. Check your device or type captions manually.'
      }
      setError(message)
      callbacksRef.current.onError?.(message)
    }

    recognition.onend = () => {
      setListening(false)
      if (wantedRef.current) {
        window.clearTimeout(restartTimerRef.current)
        restartTimerRef.current = window.setTimeout(() => {
          if (!wantedRef.current) return
          try {
            recognition.start()
          } catch {
            /* Chrome throws if a start is already pending; the next end event retries. */
          }
        }, 350)
      }
    }

    return recognition
  }, [Recognition, language])

  const start = useCallback(() => {
    if (!Recognition) {
      const message = 'Live speech recognition is not available in this browser. Use Chrome or Edge, or type captions manually.'
      setError(message)
      callbacksRef.current.onError?.(message)
      return false
    }
    wantedRef.current = true
    if (!recognitionRef.current) recognitionRef.current = buildRecognition()
    try {
      recognitionRef.current.start()
      return true
    } catch {
      return false
    }
  }, [Recognition, buildRecognition])

  const stop = useCallback(() => {
    wantedRef.current = false
    window.clearTimeout(restartTimerRef.current)
    try {
      recognitionRef.current?.stop()
    } catch {
      /* already stopped */
    }
    setListening(false)
  }, [])

  useEffect(() => () => {
    wantedRef.current = false
    window.clearTimeout(restartTimerRef.current)
    try {
      recognitionRef.current?.abort()
    } catch {
      /* ignore */
    }
  }, [])

  return { supported, listening, error, start, stop }
}
