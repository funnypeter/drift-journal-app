import { useCallback, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

// The trip title sticks to the top while scrolling (DRIFT-003). Measure it and
// expose its height as --title-h so the desktop side column sticks below it.
// A callback ref (not a mount effect) so the observer follows the node React
// actually keeps, e.g. after a hydration mismatch re-creates it.
export function useStickyTitle() {
  const [titleH, setTitleH] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)

  const titleRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    setTitleH(el.offsetHeight)
    observer.current = new ResizeObserver(() => setTitleH(el.offsetHeight))
    observer.current.observe(el)
  }, [])

  const containerStyle = { '--title-h': `${titleH}px` } as CSSProperties
  return { titleRef, containerStyle }
}
