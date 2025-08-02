/**
 * Module de traitement d'images pour éviter la détection de doublons par Vinted
 * Techniques utilisées : recadrage, watermark, rotation, compression
 */

class ImageProcessor {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.init();
    }

    init() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    /**
     * Traite une image selon les paramètres fournis
     * @param {string} imageUrl - URL de l'image à traiter
     * @param {Object} settings - Paramètres de traitement
     * @returns {Promise<Blob>} - Image traitée
     */
    async processImage(imageUrl, settings = {}) {
        const {
            cropPercentage = 5,
            addWatermark = true,
            watermarkText = '',
            rotationAngle = 0.5,
            qualityReduction = 5
        } = settings;

        try {
            // Charger l'image
            const img = await this.loadImage(imageUrl);

            // Calculer les nouvelles dimensions avec le recadrage
            const cropAmount = cropPercentage / 100;
            const newWidth = Math.floor(img.width * (1 - cropAmount));
            const newHeight = Math.floor(img.height * (1 - cropAmount));

            // Configurer le canvas
            this.canvas.width = newWidth;
            this.canvas.height = newHeight;

            // Nettoyer le canvas
            this.ctx.clearRect(0, 0, newWidth, newHeight);

            // Appliquer la rotation si nécessaire
            if (rotationAngle !== 0) {
                this.ctx.save();
                this.ctx.translate(newWidth / 2, newHeight / 2);
                this.ctx.rotate((rotationAngle * Math.PI) / 180);
                this.ctx.translate(-newWidth / 2, -newHeight / 2);
            }

            // Dessiner l'image recadrée
            const cropX = Math.floor(img.width * cropAmount / 2);
            const cropY = Math.floor(img.height * cropAmount / 2);
            const cropWidth = img.width - (cropX * 2);
            const cropHeight = img.height - (cropY * 2);

            this.ctx.drawImage(
                img,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, newWidth, newHeight
            );

            // Restaurer le contexte si rotation appliquée
            if (rotationAngle !== 0) {
                this.ctx.restore();
            }

            // Ajouter un watermark si demandé
            if (addWatermark) {
                await this.addWatermark(watermarkText, newWidth, newHeight);
            }

            // Ajouter du bruit invisible pour changer le hash
            this.addInvisibleNoise();

            // Convertir en blob avec compression
            const quality = (100 - qualityReduction) / 100;
            return new Promise((resolve) => {
                this.canvas.toBlob(resolve, 'image/jpeg', quality);
            });

        } catch (error) {
            console.error('Erreur lors du traitement de l\'image:', error);
            throw error;
        }
    }

    /**
     * Charge une image depuis une URL
     * @param {string} url - URL de l'image
     * @returns {Promise<HTMLImageElement>} - Image chargée
     */
    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Impossible de charger l\'image'));

            // Si l'URL est relative, la convertir en URL complète
            if (url.startsWith('//')) {
                url = 'https:' + url;
            } else if (url.startsWith('/')) {
                url = window.location.origin + url;
            }

            img.src = url;
        });
    }

    /**
     * Ajoute un watermark à l'image
     * @param {string} text - Texte du watermark
     * @param {number} width - Largeur de l'image
     * @param {number} height - Hauteur de l'image
     */
    async addWatermark(text, width, height) {
        // Si pas de texte spécifié, utiliser un watermark invisible
        if (!text || text.trim() === '') {
            return this.addInvisibleWatermark(width, height);
        }

        // Sauvegarder le contexte
        this.ctx.save();

        // Configuration du texte
        const fontSize = Math.max(12, Math.min(width, height) * 0.03);
        this.ctx.font = `${fontSize}px Arial`;
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Rotation pour le watermark en diagonal
        this.ctx.translate(width / 2, height / 2);
        this.ctx.rotate(-Math.PI / 6);

        // Dessiner le texte
        this.ctx.fillText(text, 0, 0);

        // Restaurer le contexte
        this.ctx.restore();
    }

    /**
     * Ajoute un watermark invisible (pixels transparents)
     * @param {number} width - Largeur de l'image
     * @param {number} height - Hauteur de l'image
     */
    addInvisibleWatermark(width, height) {
        // Ajouter quelques pixels transparents dans les coins
        const positions = [
            [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
            [width / 2, 0], [0, height / 2], [width - 1, height / 2], [width / 2, height - 1]
        ];

        positions.forEach(([x, y]) => {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
            this.ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
        });
    }

    /**
     * Ajoute du bruit invisible pour changer le hash de l'image
     */
    addInvisibleNoise() {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;

        // Modifier légèrement quelques pixels de manière imperceptible
        for (let i = 0; i < data.length; i += 4000) { // Tous les 1000 pixels environ
            if (i + 3 < data.length) {
                // Modifier très légèrement la valeur rouge (±1)
                const variation = Math.random() > 0.5 ? 1 : -1;
                data[i] = Math.max(0, Math.min(255, data[i] + variation));
            }
        }

        this.ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Convertit un Blob en File avec un nouveau nom
     * @param {Blob} blob - Blob à convertir
     * @param {string} originalName - Nom original du fichier
     * @returns {File} - Nouveau fichier
     */
    blobToFile(blob, originalName) {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const extension = originalName.split('.').pop() || 'jpg';
        const baseName = originalName.replace(/\.[^/.]+$/, '');
        const newName = `${baseName}_${timestamp}_${randomSuffix}.${extension}`;

        return new File([blob], newName, {
            type: blob.type,
            lastModified: timestamp
        });
    }

    /**
     * Traite plusieurs images en lot
     * @param {Array} imageUrls - URLs des images à traiter
     * @param {Object} settings - Paramètres de traitement
     * @param {Function} progressCallback - Callback de progression
     * @returns {Promise<Array>} - Images traitées
     */
    async processBatch(imageUrls, settings, progressCallback) {
        const results = [];

        for (let i = 0; i < imageUrls.length; i++) {
            try {
                const processedBlob = await this.processImage(imageUrls[i], settings);
                const file = this.blobToFile(processedBlob, `image_${i + 1}.jpg`);
                results.push(file);

                if (progressCallback) {
                    progressCallback(i + 1, imageUrls.length);
                }
            } catch (error) {
                console.error(`Erreur lors du traitement de l'image ${i + 1}:`, error);
                results.push(null);
            }
        }

        return results;
    }

    /**
     * Génère un aperçu de l'image traitée
     * @param {string} imageUrl - URL de l'image
     * @param {Object} settings - Paramètres de traitement
     * @returns {Promise<string>} - Data URL de l'aperçu
     */
    async generatePreview(imageUrl, settings) {
        try {
            await this.processImage(imageUrl, settings);
            return this.canvas.toDataURL('image/jpeg', 0.8);
        } catch (error) {
            console.error('Erreur lors de la génération de l\'aperçu:', error);
            throw error;
        }
    }

    /**
     * Nettoie les ressources
     */
    destroy() {
        if (this.canvas) {
            this.canvas.remove();
            this.canvas = null;
            this.ctx = null;
        }
    }
}

// Export pour utilisation dans d'autres scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageProcessor;
} else {
    window.ImageProcessor = ImageProcessor;
}