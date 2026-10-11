const assert = require("assert");
const ImageProcessor = require("../image-processor");

console.log("=== Test 1: Configuration par défaut ImageProcessor ===");
const defaults = ImageProcessor.defaultSettings();
assert.strictEqual(defaults.addNoise, false, "Le bruit destructeur doit être désactivé par défaut");
assert.strictEqual(defaults.rotationAngle, 0, "La rotation floue doit être à 0° par défaut");
assert.strictEqual(defaults.cropPercentage, 2, "Le recadrage doit être doux (2%)");
assert.strictEqual(defaults.quality, 0.96, "La qualité JPEG doit être haute fidélité (0.96)");
assert.ok(defaults.sharpness > 0, "La netteté HD doit être active");
assert.ok(defaults.brightnessBoost > 0, "La luminosité studio doit être positive");
assert.ok(defaults.contrastBoost > 0, "Le contraste valorisant doit être actif");
assert.ok(defaults.vibranceBoost > 0, "La vibrance/couleurs doit être active");
console.log("✓ Paramètres par défaut orientés embellissement Studio Pro validés !");

console.log("\n=== Test 2: Algorithme de convolution Sharpen ===");
const processor = new ImageProcessor();

// Mock canvas & ImageData pour tester applySharpen en environnement Node.js
const mockWidth = 20;
const mockHeight = 20;
const mockPixels = new Uint8ClampedArray(mockWidth * mockHeight * 4);
for (let i = 0; i < mockPixels.length; i += 4) {
  mockPixels[i] = 120; // R
  mockPixels[i + 1] = 120; // G
  mockPixels[i + 2] = 120; // B
  mockPixels[i + 3] = 255; // A
}
// Introduce an edge in the center
mockPixels[(10 * mockWidth + 10) * 4] = 200;

let putImageDataCalled = false;
const mockCanvas = {
  width: mockWidth,
  height: mockHeight,
  getContext: () => ({
    getImageData: () => ({ data: new Uint8ClampedArray(mockPixels) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (imgData) => {
      putImageDataCalled = true;
      assert.strictEqual(imgData.data.length, mockWidth * mockHeight * 4);
      // Verify edge pixel was sharpened (higher contrast with neighbors)
      assert.ok(imgData.data[(10 * mockWidth + 10) * 4] >= 200, "Le centre contrasté doit être accentué");
    },
  }),
};

processor.applySharpen(mockCanvas, 0.22);
assert.strictEqual(putImageDataCalled, true, "applySharpen doit exécuter la convolution correctement");
console.log("✓ Algorithme de netteté HD (convolution 3x3) validé !");

console.log("\n=== Test 3: Smart Crop asymétrique ===");
let drawImageArgs = null;
global.document = {
  createElement: (tag) => {
    if (tag === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (...args) => {
            drawImageArgs = args;
          },
        }),
      };
    }
    return {};
  },
};

const mockImg = { width: 1000, height: 1000 };
const croppedCanvas = processor.smartCrop(mockImg, 2, 0);
assert.ok(croppedCanvas.width > 950, "Le recadrage doit préserver > 95% de l'image");
assert.ok(croppedCanvas.height > 950, "Le recadrage doit préserver > 95% de l'image");
assert.ok(drawImageArgs !== null, "drawImage doit être appelé pour le recadrage");
console.log(`✓ Smart crop asymétrique validé : dimensions préservées (${croppedCanvas.width}x${croppedCanvas.height} sur 1000x1000) !`);

console.log("\n🎉 TOUS LES TESTS IMAGEPROCESSOR SONT VALIDES AVEC SUCCÈS !");
