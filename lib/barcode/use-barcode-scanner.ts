"use client"

import { useEffect, useRef } from "react"

/**
 * USB/Bluetooth barcode scanners typically emit characters quickly then Enter.
 * Fires onScan when Enter is pressed after a rapid burst of input.
 */
export function useBarcodeScanner(options: {
  enabled?: boolean
  onScan: (code: string) => void
  minLength?: number
  maxGapMs?: number
}) {
  const buffer = useRef("")
  const lastKeyAt = useRef(0)
  const onScanRef = useRef(options.onScan)

  useEffect(() => {
    onScanRef.current = options.onScan
  }, [options.onScan])

  useEffect(() => {
    if (options.enabled === false) return
    const minLength = options.minLength ?? 3
    const maxGapMs = options.maxGapMs ?? 80

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }

      const now = Date.now()
      if (now - lastKeyAt.current > maxGapMs) {
        buffer.current = ""
      }
      lastKeyAt.current = now

      if (event.key === "Enter") {
        const code = buffer.current.trim()
        buffer.current = ""
        if (code.length >= minLength) {
          event.preventDefault()
          onScanRef.current(code)
        }
        return
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        buffer.current += event.key
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [options.enabled, options.minLength, options.maxGapMs])
}
