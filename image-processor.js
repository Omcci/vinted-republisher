/**
 * Module de traitement d'images pour Vinted Auto Republisher
 * Gère le recadrage, rotation, watermark et réduction de qualité
 */

class ImageProcessor {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    /**
     * Modifie une image selon les paramètres donnés
     * @param {string} imageUrl - URL de l'image à modifier
     * @param {Object} settings - Paramètres de modification
     * @returns {Promise<string>} - URL de l'image modifiée (base64)
     */
    async modifyImage(imageUrl, settings) {
        console.log('[ImageProcessor] Début modification image:', settings);

        try {
            // Charger l'image
            const image = await this.loadImage(imageUrl);

            // Appliquer les modifications
            let processedImage = image;

            // 1. Recadrage
            if (settings.cropPercentage && settings.cropPercentage > 0) {
                processedImage = this.cropImage(processedImage, settings.cropPercentage);
            }

            // 2. Rotation
            if (settings.rotationAngle && settings.rotationAngle !== 0) {
                processedImage = this.rotateImage(processedImage, settings.rotationAngle);
            }

            // 3. Watermark
            if (settings.addWatermark && settings.watermarkText) {
                processedImage = this.addWatermark(processedImage, settings.watermarkText);
            }

            // 4. Réduction de qualité
            const quality = settings.qualityReduction ? (100 - settings.qualityReduction) / 100 : 0.95;

            // Convertir en base64
            const result = this.canvasToBase64(processedImage, quality);

            console.log('[ImageProcessor] Image modifiée avec succès');
            return result;

        } catch (error) {
            console.error('[ImageProcessor] Erreur modification image:', error);
            throw error;
        }
    }

    /**
     * Charge une image depuis une URL
     * @param {string} url - URL de l'image
     * @returns {Promise<HTMLImageElement>}
     */
    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous'; // Pour éviter les erreurs CORS

            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn('[ImageProcessor] Erreur CORS, tentative sans crossOrigin');
                // Retenter sans crossOrigin
                const img2 = new Image();
                img2.onload = () => resolve(img2);
                img2.onerror = () => reject(new Error('Impossible de charger l\'image'));
                img2.src = url;
            };

            img.src = url;
        });
    }

    /**
     * Recadre une image
     * @param {HTMLImageElement} image - Image à recadrer
     * @param {number} percentage - Pourcentage de recadrage (0-100)
     * @returns {HTMLCanvasElement}
     */
    cropImage(image, percentage) {
        const cropAmount = percentage / 100;
        const cropPixels = Math.min(image.width, image.height) * cropAmount;

        // Calculer les nouvelles dimensions
        const newWidth = image.width - (cropPixels * 2);
        const newHeight = image.height - (cropPixels * 2);

        // Créer un nouveau canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = newWidth;
        canvas.height = newHeight;

        // Dessiner l'image recadrée
        ctx.drawImage(
            image,
            cropPixels, cropPixels, newWidth, newHeight, // Source
            0, 0, newWidth, newHeight // Destination
        );

        return canvas;
    }

    /**
     * Fait pivoter une image
     * @param {HTMLImageElement|HTMLCanvasElement} image - Image à faire pivoter
     * @param {number} angle - Angle en degrés
     * @returns {HTMLCanvasElement}
     */
    rotateImage(image, angle) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Convertir en radians
        const radians = (angle * Math.PI) / 180;

        // Calculer les nouvelles dimensions
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));

        const newWidth = image.width * cos + image.height * sin;
        const newHeight = image.width * sin + image.height * cos;

        canvas.width = newWidth;
        canvas.height = newHeight;

        // Centrer l'image
        ctx.translate(newWidth / 2, newHeight / 2);
        ctx.rotate(radians);
        ctx.drawImage(image, -image.width / 2, -image.height / 2);

        return canvas;
    }

    /**
     * Ajoute un watermark à une image
     * @param {HTMLImageElement|HTMLCanvasElement} image - Image de base
     * @param {string} text - Texte du watermark
     * @returns {HTMLCanvasElement}
     */
    addWatermark(image, text) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = image.width;
        canvas.height = image.height;

        // Dessiner l'image de base
        ctx.drawImage(image, 0, 0);

        // Configurer le style du watermark
        ctx.font = `${Math.max(12, image.width / 20)}px Arial`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; // Blanc semi-transparent
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'; // Contour noir
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Position du watermark (coin inférieur droit)
        const x = image.width * 0.85;
        const y = image.height * 0.85;

        // Dessiner le contour
        ctx.strokeText(text, x, y);
        // Dessiner le texte
        ctx.fillText(text, x, y);

        return canvas;
    }

    /**
     * Convertit un canvas en base64
     * @param {HTMLCanvasElement} canvas - Canvas à convertir
     * @param {number} quality - Qualité (0-1)
     * @returns {string} - URL base64
     */
    canvasToBase64(canvas, quality = 0.95) {
        return canvas.toDataURL('image/jpeg', quality);
    }

    /**
     * Convertit une URL base64 en Blob
     * @param {string} base64 - URL base64
     * @returns {Blob}
     */
    base64ToBlob(base64) {
        const parts = base64.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);

        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }

        return new Blob([u8arr], { type: mime });
    }

    /**
     * Crée un File à partir d'un Blob
     * @param {Blob} blob - Blob à convertir
     * @param {string} filename - Nom du fichier
     * @returns {File}
     */
    blobToFile(blob, filename) {
        return new File([blob], filename, { type: blob.type });
    }
}

// Exporter la classe
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageProcessor;
} else {
    window.ImageProcessor = ImageProcessor;
}