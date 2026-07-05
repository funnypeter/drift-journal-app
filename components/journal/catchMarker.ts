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

export function makeCatchMarkerEl(species?: string, photoUrl?: string): HTMLDivElement {
  // Outer hit target — transparent ring around the visible marker so finger
  // taps within ~44px land on the element instead of falling through to the
  // map canvas below.
  //
  // IMPORTANT: do NOT set `transform` on this wrap element. Mapbox uses the
  // wrap's transform to position the marker (`translate3d(x, y, 0)`). Any
  // CSS transform we set here clobbers that and the marker teleports to
  // (0, 0) of the map container — i.e. the top-left corner. Hover/press
  // effects go on the INNER bubble instead.
  const wrap = document.createElement('div')
  wrap.style.cursor = 'pointer'
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'
  wrap.style.alignItems = 'center'
  wrap.style.padding = '10px'
  wrap.style.margin = '-10px'

  const bubble = document.createElement('div')
  bubble.style.background = '#1e4d43'
  bubble.style.borderRadius = '999px'
  bubble.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
  bubble.style.border = '2px solid white'
  bubble.style.display = 'flex'
  bubble.style.alignItems = 'center'
  bubble.style.justifyContent = 'center'
  bubble.style.transition = 'transform 120ms ease'
  bubble.style.transformOrigin = 'center'
  bubble.style.overflow = 'hidden'

  if (photoUrl) {
    // Catch photo → circular thumbnail marker instead of the fish icon.
    bubble.style.width = '40px'
    bubble.style.height = '40px'
    const img = document.createElement('img')
    img.src = photoUrl
    img.alt = species || ''
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.objectFit = 'cover'
    img.style.display = 'block'
    // If the thumbnail can't load, fall back to the fish icon.
    img.onerror = () => {
      bubble.style.width = ''
      bubble.style.height = ''
      bubble.style.padding = '5px 5px 3px'
      bubble.innerHTML = FISH_SVG
    }
    bubble.appendChild(img)
  } else {
    bubble.style.padding = '5px 5px 3px'
    bubble.innerHTML = FISH_SVG
  }

  const tail = document.createElement('div')
  tail.style.width = '0'
  tail.style.height = '0'
  tail.style.borderLeft = '6px solid transparent'
  tail.style.borderRight = '6px solid transparent'
  tail.style.borderTop = '8px solid #1e4d43'
  tail.style.marginTop = '-1px'

  // Hover/press effects on the inner bubble — never on the wrap.
  wrap.addEventListener('pointerenter', () => { bubble.style.transform = 'scale(1.15)' })
  wrap.addEventListener('pointerleave', () => { bubble.style.transform = 'scale(1)' })

  wrap.appendChild(bubble)
  wrap.appendChild(tail)
  if (species) wrap.title = species
  return wrap
}
