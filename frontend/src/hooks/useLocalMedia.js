import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Camera/microphone plus optional screen sharing.
 *
 * `stream` is the stream that should be published and recorded. While screen
 * sharing it contains the screen video track plus the microphone audio track,
 * so stopping the share restores the camera automatically.
 */
export default function useLocalMedia({ video = true, audio = true } = {}) {
  const [cameraStream, setCameraStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const mountedRef = useRef(true)

  const stream = useMemo(() => {
    if (!screenStream) return cameraStream
    const tracks = [...screenStream.getVideoTracks()]
    cameraStream?.getAudioTracks().forEach((track) => tracks.push(track))
    if (!tracks.length) return null
    return new MediaStream(tracks)
  }, [cameraStream, screenStream])

  const stopScreenShare = useCallback(() => {
    setScreenStream((current) => {
      current?.getTracks().forEach((track) => {
        track.onended = null
        track.stop()
      })
      return null
    })
  }, [])

  const stop = useCallback(() => {
    stopScreenShare()
    setCameraStream((current) => {
      current?.getTracks().forEach((track) => track.stop())
      return null
    })
    setStatus('idle')
  }, [stopScreenShare])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError('This browser does not expose camera and microphone access (getUserMedia). Use a modern browser over HTTPS or localhost.')
      return null
    }
    setStatus('requesting')
    setError('')
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: video
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user', frameRate: { ideal: 24, max: 30 } }
          : false,
        audio: audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
      })
      if (!mountedRef.current) {
        media.getTracks().forEach((track) => track.stop())
        return null
      }
      setCameraStream((current) => {
        current?.getTracks().forEach((track) => track.stop())
        return media
      })
      setStatus('ready')
      return media
    } catch (err) {
      const message =
        err?.name === 'NotAllowedError'
          ? 'Camera or microphone permission was denied. Allow access in your browser settings and try again.'
          : err?.name === 'NotFoundError'
            ? 'No camera or microphone was found on this device.'
            : err?.name === 'NotReadableError'
              ? 'The camera or microphone is already in use by another app.'
              : 'Camera and microphone could not be started.'
      setStatus('error')
      setError(message)
      return null
    }
  }, [video, audio])

  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatus('error')
      setError('Screen sharing is not available in this browser. Use a current version of Chrome, Edge, or Firefox.')
      return null
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      if (!mountedRef.current) {
        display.getTracks().forEach((track) => track.stop())
        return null
      }
      const videoTrack = display.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.onended = () => {
          if (mountedRef.current) setScreenStream(null)
        }
      }
      setScreenStream(display)
      setError('')
      return display
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setError('Screen sharing was cancelled or blocked by the browser.')
      } else {
        setError('Screen sharing could not be started.')
      }
      return null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      setCameraStream((current) => {
        current?.getTracks().forEach((track) => track.stop())
        return null
      })
      setScreenStream((current) => {
        current?.getTracks().forEach((track) => track.stop())
        return null
      })
    }
  }, [])

  const toggleVideo = useCallback(() => {
    const track = cameraStream?.getVideoTracks?.()[0]
    if (!track) return false
    track.enabled = !track.enabled
    return track.enabled
  }, [cameraStream])

  const toggleAudio = useCallback(() => {
    const track = cameraStream?.getAudioTracks?.()[0]
    if (!track) return false
    track.enabled = !track.enabled
    return track.enabled
  }, [cameraStream])

  return {
    stream,
    cameraStream,
    screenStream,
    sharingScreen: Boolean(screenStream),
    status,
    error,
    start,
    stop,
    startScreenShare,
    stopScreenShare,
    toggleVideo,
    toggleAudio,
  }
}
