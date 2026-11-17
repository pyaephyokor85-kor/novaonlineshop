// Browser-only processing; no file leaves the device until optimization succeeds.
export function fitWithin(width, height, limit) {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('Invalid image dimensions.');
  const scale = Math.min(1, limit / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export async function prepareProfileImage(blob, { doc = globalThis.document, urls = globalThis.URL } = {}) {
  const objectUrl = urls.createObjectURL(blob);
  const img = doc.createElement('img');
  try {
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('ပုံဖတ်မရပါ။ JPG / PNG / WebP ပုံတစ်ပုံ ပြန်ရွေးပါ။'));
      img.src = objectUrl;
    });
    // PNG/WebP retain transparency through PNG output. Never crop or upscale.
    const mime = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const canvas = doc.createElement('canvas');
    try {
      for (const limit of [1080, 900, 720, 512]) {
        const size = fitWithin(img.naturalWidth, img.naturalHeight, limit);
        canvas.width = size.width; canvas.height = size.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('ဒီ Browser မှာ ပုံချုံ့မရပါ။ JPG ပုံငယ်ကို ရွေးပေးပါ။');
        context.drawImage(img, 0, 0, size.width, size.height);
        /** @type {Promise<Blob | null>} */
        const encoded = new Promise(resolve => canvas.toBlob(resolve, mime, 0.82));
        const result = await encoded;
        if (!result) throw new Error('ပုံချုံ့မရပါ။ ပုံအသစ် ပြန်ရွေးပါ။');
        if (result.size <= 1024 * 1024) return { blob: result, ...size };
      }
      throw new Error('ပုံဖိုင်က ကြီးနေသေးပါတယ်။ JPG ပုံငယ်ကို ပြန်ရွေးပါ။');
    } finally { canvas.width = 0; canvas.height = 0; }
  } finally { img.onload = null; img.onerror = null; urls.revokeObjectURL(objectUrl); }
}
