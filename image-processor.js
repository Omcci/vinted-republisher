/**
 * Module de traitement d'images pour Vinted Auto Republisher
 * Recadrage, rotation, bruit subtil et réduction de qualité (anti-doublon).
 */

class ImageProcessor {
  constructor() {
    this.canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
  }

  /**
   * Paramètres par défaut : "Embellissement Studio Pro" valorisant (anti-doublon sans dégradation).
   */
  static defaultSettings(overrides = {}) {
    return {
      enabled: true,
      mode: "enhance", // "enhance" (Studio Pro) ou "legacy"
      cropPercentage: 2, // 1.5% - 2% (doux, ne coupe pas le produit)
      brightnessBoost: 3, // +3% luminosité studio (élimine le voile terne)
      contrastBoost: 4, // +4% contraste valorisant (matières & couleurs nettes)
      vibranceBoost: 5, // +5% saturation/vivacité (couleurs éclatantes)
      sharpness: 22, // +22% piqué & netteté HD (coutures, logos, détails)
      rotationAngle: 0, // 0° par défaut (évite le flou d'échantillonnage)
      quality: 0.96, // 96% qualité JPEG (fini la compression visible)
      addNoise: false, // Pas de bruit destructeur
      noiseStrength: 0,
      brightnessJitter: 0,
      addWatermark: false,
      watermarkText: "",
      ...overrides,
    };
  }

  /**
   * Modifie et sublime une image selon les paramètres donnés.
   * @param {string} imageUrl - data URL ou URL
   * @param {Object} settings
   * @param {{ index?: number }} options - variance par photo
   * @returns {Promise<string>}
   */
  async modifyImage(imageUrl, settings = {}, options = {}) {
    const cfg = ImageProcessor.defaultSettings(settings || {});
    if (cfg.enabled === false) {
      return imageUrl;
    }

    const index = Number(options.index || 0);
    const image = await this.loadImage(imageUrl);

    // Mode rétro-compatible si l'utilisateur a explicitement forcé le bruit ou une rotation non nulle
    if (cfg.mode === "legacy" || cfg.addNoise === true || (cfg.rotationAngle && cfg.rotationAngle !== 0)) {
      const crop = Math.max(1, Number(cfg.cropPercentage || 0) + (index % 3) * 0.4);
      const rotation = Number(cfg.rotationAngle || 0) + ((index % 2 === 0 ? 1 : -1) * (0.15 + (index % 3) * 0.08));
      let processed = image;
      if (crop > 0) processed = this.cropImage(processed, crop);
      if (rotation !== 0) processed = this.rotateImage(processed, rotation);
      if (cfg.addNoise !== false) {
        processed = this.addSubtleNoise(processed, {
          strength: Number(cfg.noiseStrength || 6) + (index % 3),
          brightness: Number(cfg.brightnessJitter || 0.012) * (1 + (index % 3) * 0.2),
        });
      }
      const quality = Math.max(0.7, Math.min(0.98, Number(cfg.quality || 0.92)));
      return this.canvasToBase64(processed, quality);
    }

    // Mode "Studio Pro" valorisant par défaut :
    // 1. Micro-recadrage asymétrique subtil (1.5% à 2%)
    const cropPct = Math.max(0.8, Number(cfg.cropPercentage ?? 2) + (index % 3) * 0.2);
    let processed = this.smartCrop(image, cropPct, index);

    // 2. Éclairage Studio & Couleurs (+3% lumière, +4% contraste, +5% vibrance)
    const bBoost = Number(cfg.brightnessBoost ?? 3) + (index % 2) * 0.4;
    const cBoost = Number(cfg.contrastBoost ?? 4) + (index % 3) * 0.3;
    const sBoost = Number(cfg.vibranceBoost ?? 5) + (index % 2) * 0.4;
    processed = this.applyStudioLighting(processed, {
      brightness: bBoost,
      contrast: cBoost,
      saturation: sBoost,
    });

    // 3. Netteté HD (renforce le piqué des coutures, logos et matières)
    const sharpnessAmount = Number(cfg.sharpness ?? 22) / 100;
    if (sharpnessAmount > 0) {
      processed = this.applySharpen(processed, sharpnessAmount);
    }

    if (cfg.addWatermark && String(cfg.watermarkText || "").trim()) {
      processed = this.addWatermark(processed, String(cfg.watermarkText).trim());
    }

    // 4. Encodage haute fidélité (96% qualité sans artéfacts)
    const quality = Math.max(0.9, Math.min(0.98, Number(cfg.quality || 0.96)));
    return this.canvasToBase64(processed, quality);
  }

  /**
   * Recadrage asymétrique doux : décale subtilement le centre de l'image (1.5% - 2%)
   * pour modifier les blocs de calcul pHash / dHash sans couper le vêtement.
   */
  smartCrop(image, percentage = 2, index = 0) {
    const cropPct = Math.max(0.8, Math.min(5, percentage)) / 100;
    const offsetFactor = 0.15 + (index % 3) * 0.08;
    const cropLeft = Math.floor(image.width * cropPct * (1 + offsetFactor));
    const cropTop = Math.floor(image.height * cropPct * (1 - offsetFactor));
    const cropRight = Math.floor(image.width * cropPct * (1 - offsetFactor));
    const cropBottom = Math.floor(image.height * cropPct * (1 + offsetFactor));

    const newWidth = Math.max(8, image.width - (cropLeft + cropRight));
    const newHeight = Math.max(8, image.height - (cropTop + cropBottom));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = newWidth;
    canvas.height = newHeight;

    ctx.drawImage(
      image,
      cropLeft,
      cropTop,
      newWidth,
      newHeight,
      0,
      0,
      newWidth,
      newHeight
    );
    return canvas;
  }

  /**
   * Ajustement de luminosité, contraste et vibrance façon studio photo.
   * Valorise l'article (plus séduisant et attrayant) tout en décalant les seuils de gradient pHash.
   */
  applyStudioLighting(imageOrCanvas, { brightness = 3, contrast = 4, saturation = 5 } = {}) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = imageOrCanvas.width;
    canvas.height = imageOrCanvas.height;

    const b = Math.max(0.9, Math.min(1.18, 1 + brightness / 100));
    const c = Math.max(0.9, Math.min(1.22, 1 + contrast / 100));
    const s = Math.max(0.9, Math.min(1.25, 1 + saturation / 100));

    try {
      ctx.filter = `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)}) saturate(${s.toFixed(3)})`;
    } catch (_) {
      // Ignorer si filtre non supporté
    }
    ctx.drawImage(imageOrCanvas, 0, 0);
    ctx.filter = "none";
    return canvas;
  }

  /**
   * Masque de netteté HD (convolution 3x3) : renforce le piqué des textures textiles,
   * logos et matières. Fait paraître l'image plus nette tout en modifiant les fréquences spectrales.
   */
  applySharpen(canvas, amount = 0.22) {
    if (amount <= 0 || !canvas) return canvas;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    if (w < 6 || h < 6) return canvas;

    try {
      const srcData = ctx.getImageData(0, 0, w, h);
      const src = srcData.data;
      const dstData = ctx.createImageData(w, h);
      const dst = dstData.data;

      const k = Math.min(0.5, Math.max(0.05, amount));
      const center = 1 + 4 * k;

      // Copier la première et dernière ligne
      dst.set(src.subarray(0, w * 4), 0);
      dst.set(src.subarray((h - 1) * w * 4), (h - 1) * w * 4);

      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        const firstIdx = row * 4;
        dst[firstIdx] = src[firstIdx];
        dst[firstIdx + 1] = src[firstIdx + 1];
        dst[firstIdx + 2] = src[firstIdx + 2];
        dst[firstIdx + 3] = src[firstIdx + 3];

        for (let x = 1; x < w - 1; x++) {
          const idx = (row + x) * 4;
          const top = (row - w + x) * 4;
          const btm = (row + w + x) * 4;
          const lft = (row + x - 1) * 4;
          const rgt = (row + x + 1) * 4;

          for (let c = 0; c < 3; c++) {
            const val = src[idx + c] * center - (src[top + c] + src[btm + c] + src[lft + c] + src[rgt + c]) * k;
            dst[idx + c] = val < 0 ? 0 : val > 255 ? 255 : val;
          }
          dst[idx + 3] = src[idx + 3]; // Alpha
        }

        const lastIdx = (row + w - 1) * 4;
        dst[lastIdx] = src[lastIdx];
        dst[lastIdx + 1] = src[lastIdx + 1];
        dst[lastIdx + 2] = src[lastIdx + 2];
        dst[lastIdx + 3] = src[lastIdx + 3];
      }
      ctx.putImageData(dstData, 0, 0);
    } catch (_) {
      // Graceful fallback si restrictions de contexte canvas
    }
    return canvas;
  }

  loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // data: et blob: n'ont pas besoin de CORS; http(s) oui.
      if (!String(url || "").startsWith("data:") && !String(url || "").startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => resolve(img);
      img.onerror = () => {
        const img2 = new Image();
        img2.onload = () => resolve(img2);
        img2.onerror = () => reject(new Error("Impossible de charger l'image"));
        img2.src = url;
      };
      img.src = url;
    });
  }

  cropImage(image, percentage) {
    const cropAmount = percentage / 100;
    const cropPixels = Math.min(image.width, image.height) * cropAmount;
    const newWidth = Math.max(8, Math.floor(image.width - cropPixels * 2));
    const newHeight = Math.max(8, Math.floor(image.height - cropPixels * 2));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = newWidth;
    canvas.height = newHeight;
    ctx.drawImage(
      image,
      cropPixels,
      cropPixels,
      newWidth,
      newHeight,
      0,
      0,
      newWidth,
      newHeight
    );
    return canvas;
  }

  rotateImage(image, angle) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const radians = (angle * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const newWidth = Math.ceil(image.width * cos + image.height * sin);
    const newHeight = Math.ceil(image.width * sin + image.height * cos);
    canvas.width = newWidth;
    canvas.height = newHeight;
    ctx.translate(newWidth / 2, newHeight / 2);
    ctx.rotate(radians);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    return canvas;
  }

  /**
   * Bruit + micro-jitter luminosité : change le hash sans watermark visible.
   */
  addSubtleNoise(image, { strength = 6, brightness = 0.012 } = {}) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const brightMul = 1 + (Math.random() * 2 - 1) * brightness;

    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() * 2 - 1) * strength;
      data[i] = Math.max(0, Math.min(255, data[i] * brightMul + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * brightMul + n * 0.9));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * brightMul + n * 1.1));
    }

    // Micro-rectangle semi-transparent unique (coins) pour casser similarité visuelle IA.
    ctx.putImageData(imageData, 0, 0);
    const markSize = Math.max(2, Math.floor(Math.min(canvas.width, canvas.height) * 0.004));
    ctx.fillStyle = `rgba(${40 + Math.floor(Math.random() * 40)}, ${40 + Math.floor(Math.random() * 40)}, ${40 + Math.floor(Math.random() * 40)}, 0.18)`;
    ctx.fillRect(3 + Math.floor(Math.random() * 5), 3 + Math.floor(Math.random() * 5), markSize, markSize);
    return canvas;
  }

  addWatermark(image, text) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);
    ctx.font = `${Math.max(12, image.width / 20)}px Arial`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const x = image.width * 0.85;
    const y = image.height * 0.85;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    return canvas;
  }

  canvasToBase64(canvas, quality = 0.92) {
    // Ensure we always encode from a canvas (crop/rotate return canvas).
    if (canvas && canvas.toDataURL) {
      return canvas.toDataURL("image/jpeg", quality);
    }
    const tmp = document.createElement("canvas");
    const ctx = tmp.getContext("2d");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    ctx.drawImage(canvas, 0, 0);
    return tmp.toDataURL("image/jpeg", quality);
  }

  base64ToBlob(base64) {
    const parts = base64.split(",");
    const mime = parts[0].match(/:(.*?);/)[1];
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  }

  blobToFile(blob, filename) {
    return new File([blob], filename, { type: blob.type });
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = ImageProcessor;
} else {
  window.ImageProcessor = ImageProcessor;
}
