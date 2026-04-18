function decodeError(file: File) {
  return new Error(
    `Could not decode image (${file.type || 'unknown type'}). Try a different photo.`
  )
}

function isHeic(file: File): boolean {
  const t = (file.type || '').toLowerCase()
  if (t === 'image/heic' || t === 'image/heif') return true
  const name = (file.name || '').toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif')
}

export async function ensureJpegIfHeic(file: File): Promise<File> {
  if (!isHeic(file)) return file
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
  const blob = Array.isArray(out) ? out[0] : out
  const newName = (file.name || 'photo').replace(/\.(heic|heif)$/i, '.jpg')
  return new File([blob], newName.endsWith('.jpg') ? newName : `${newName}.jpg`, { type: 'image/jpeg' })
}

export async function compressForIdentify(file: File, maxDim = 1200, quality = 0.7): Promise<{ base64: string; mimeType: string }> {
  const source = await ensureJpegIfHeic(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(source)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(decodeError(source))
    }
    img.src = url
  })
}

export async function compressForUpload(file: File, maxDim = 1600, quality = 0.8): Promise<File> {
  const source = await ensureJpegIfHeic(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(source)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width <= maxDim && height <= maxDim && source.size < 3 * 1024 * 1024) {
        resolve(source)
        return
      }
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('Image compression failed'))
          return
        }
        resolve(new File([blob], source.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
      }, 'image/jpeg', quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(decodeError(source))
    }
    img.src = url
  })
}
