// Build a Mapbox custom marker element for a catch pin. Used by
// LocationMiniMap and FullMap on the trip detail page. The DOM element
// includes the click target + tooltip text, the marker is anchored at
// the bottom so the pin tip sits on the coordinate.

const FISH_SVG = `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" width="22" height="22"
     fill="white" stroke="#0e2a26" stroke-width="1.2" stroke-linejoin="round">
  <!-- body -->
  <path d="M5 16
           C 8 9, 18 9, 23 16
           C 18 23, 8 23, 5 16 Z"/>
  <!-- tail -->
  <path d="M23 16 L29 11 L27 16 L29 21 Z"/>
  <!-- eye -->
  <circle cx="10" cy="15" r="1.2" fill="#0e2a26" stroke="none"/>
</svg>`

export function makeCatchMarkerEl(species?: string): HTMLDivElement {
  // Outer hit target — transparent ring around the visible marker so finger
  // taps within ~44px land on the element instead of falling through to the
  // map canvas below. Without this, a slightly-off tap was hitting the
  // map's wrap and triggering the mini-map's "expand" gesture.
  const wrap = document.createElement('div')
  wrap.style.cursor = 'pointer'
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'
  wrap.style.alignItems = 'center'
  wrap.style.padding = '10px'
  wrap.style.margin = '-10px'
  wrap.style.transition = 'transform 120ms ease'
  wrap.addEventListener('pointerenter', () => { wrap.style.transform = 'scale(1.15)' })
  wrap.addEventListener('pointerleave', () => { wrap.style.transform = 'scale(1)' })

  const bubble = document.createElement('div')
  bubble.style.background = '#1e4d43'
  bubble.style.borderRadius = '999px'
  bubble.style.padding = '5px 5px 3px'
  bubble.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
  bubble.style.border = '2px solid white'
  bubble.style.display = 'flex'
  bubble.style.alignItems = 'center'
  bubble.style.justifyContent = 'center'
  bubble.innerHTML = FISH_SVG

  const tail = document.createElement('div')
  tail.style.width = '0'
  tail.style.height = '0'
  tail.style.borderLeft = '6px solid transparent'
  tail.style.borderRight = '6px solid transparent'
  tail.style.borderTop = '8px solid #1e4d43'
  tail.style.marginTop = '-1px'

  wrap.appendChild(bubble)
  wrap.appendChild(tail)
  if (species) wrap.title = species
  return wrap
}
