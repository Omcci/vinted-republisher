/**
 * Module de traitement d'images pour Vinted Auto Republisher
 * Recadrage, rotation, bruit subtil et réduction de qualité (anti-doublon).
 */

class ImageProcessor {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
  }

  /**
   * Paramètres par défaut (légères modifications toujours visibles au hash, discrètes à l'œil).
   */
  static defaultSettings(overrides = {}) {
    return {
      enabled: true,
      cropPercentage: 4,
      rotationAngle: 0.6,
      qualityReduction: 6,
      addWatermark: false,
      watermarkText: "",
      addNoise: true,
      noiseStrength: 6,
      brightnessJitter: 0.012,
      ...overrides,
    };
  }

  /**
   * Modifie une image selon les paramètres donnés.
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
    // Petite variance déterministe par index pour éviter 5 photos "identiques" entre elles.
    const crop = Math.max(1, Number(cfg.cropPercentage || 0) + (index % 3) * 0.4);
    const rotation =
      Number(cfg.rotationAngle || 0) + ((index % 2 === 0 ? 1 : -1) * (0.15 + (index % 3) * 0.08));
    const qualityCut = Math.max(0, Number(cfg.qualityReduction || 0) + (index % 2));

    console.log("[ImageProcessor] Modification", { crop, rotation, qualityCut, index });

    const image = await this.loadImage(imageUrl);
    let processed = image;

    if (crop > 0) {
      processed = this.cropImage(processed, crop);
    }
    if (rotation !== 0) {
      processed = this.rotateImage(processed, rotation);
    }
    if (cfg.addNoise !== false) {
      processed = this.addSubtleNoise(processed, {
        strength: Number(cfg.noiseStrength || 6) + (index % 3),
        brightness: Number(cfg.brightnessJitter || 0.012) * (1 + (index % 3) * 0.2),
      });
    }
    if (cfg.addWatermark && String(cfg.watermarkText || "").trim()) {
      processed = this.addWatermark(processed, String(cfg.watermarkText).trim());
    }

    const quality = Math.max(0.7, Math.min(0.98, (100 - qualityCut) / 100));
    return this.canvasToBase64(processed, quality);
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
