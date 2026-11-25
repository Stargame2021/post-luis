/**
 * Utilidades de validación y compresión ligera de imágenes de productos (cliente y servidor).
 */

export const MAX_PRODUCT_IMAGE_DATA_URL_LENGTH = 160_000; // ~115 KB máx. en base64
const ALLOWED_DATA_IMAGE_RE = /^data:image\/(webp|jpeg|jpg|png);base64,[A-Za-z0-9+/=]+$/i;
const ALLOWED_URL_RE = /^(https?:\/\/|\/)/i;

/**
 * Valida y normaliza una URL o Data URL comprimida de imagen de producto.
 * Lanza Error si el formato no es seguro o supera el límite ligero permitido.
 */
export function validateProductImageUrl(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  if (trimmed.length > MAX_PRODUCT_IMAGE_DATA_URL_LENGTH) {
    throw new Error(
      'La imagen del producto es demasiado pesada. Usa una imagen comprimida más ligera.'
    );
  }

  if (ALLOWED_DATA_IMAGE_RE.test(trimmed) || ALLOWED_URL_RE.test(trimmed)) {
    return trimmed;
  }

  throw new Error('Formato de imagen inválido. Solo se permiten imágenes WebP, JPEG o PNG.');
}

/**
 * Comprime y redimensiona un archivo de imagen en el navegador usando Canvas
 * (máximo 240x240px, formato WebP con fallback JPEG) para mantener el catálogo POS ultrarrápido.
 */
export async function compressImageFileToDataUrl(
  file: File,
  options?: { maxSize?: number; quality?: number }
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo seleccionado debe ser una imagen (PNG, JPG o WebP).');
  }

  const maxSize = options?.maxSize ?? 240;
  const quality = options?.quality ?? 0.74;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxSize / Math.max(img.width, img.height, 1));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('El navegador no soporta compresión de imágenes en Canvas.');
    }

    ctx.drawImage(img, 0, 0, width, height);

    let dataUrl = canvas.toDataURL('image/webp', quality);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    if (dataUrl.length > MAX_PRODUCT_IMAGE_DATA_URL_LENGTH) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.55);
    }

    return validateProductImageUrl(dataUrl) ?? '';
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
