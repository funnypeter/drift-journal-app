import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

// The trip title sticks to the top while scrolling (DRIFT-003). Measure it and
// expose its height as --title-h so the desktop side column sticks below it.
export function useStickyTitle() {
  const titleRef = useRef<HTMLDivElement>(null)
  const [titleH, setTitleH] = useState(0)

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTitleH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const containerStyle = { '--title-h': `${titleH}px` } as CSSProperties
  return { titleRef, containerStyle }
}
