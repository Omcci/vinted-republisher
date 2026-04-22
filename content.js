// content.js - Combined Scraper & Automator + page-bridge for automation engine

// Inject page-context automation engine (listens to window.postMessage)
function injectAutomationEngine() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("automation-engine-fresh.js");
  script.onload = function () {
    console.log("[Content] ✅ automation-engine-fresh.js injected");
    this.remove();
  };
  script.onerror = function () {
    console.error("[Content] ❌ Failed to inject automation-engine-fresh.js");
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

injectAutomationEngine();

// Relay results emitted by the page-context engine to background
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.action !== "VINTED_AUTOMATION_RESULTS") return;

  chrome.runtime
    .sendMessage({
      action: "VINTED_AUTOMATION_RESULTS",
      results: event.data.results,
      settings: event.data.settings,
    })
    .catch((error) =>
      console.error("[Content] ❌ Failed to relay automation results:", error)
    );
});

// --- UTILS: React Event Dispatcher ---
const triggerReactChange = (element, value) => {
  const lastValue = element.value;
  element.value = value;
  const event = new Event("input", { bubbles: true });
  // React 16+ hack to trigger value setter
  const tracker = element._valueTracker;
  if (tracker) {
    tracker.setValue(lastValue);
  }
  element.dispatchEvent(event);
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

// --- STEP 1: SCRAPING ---
async function scrapeProduct() {
  console.log("📦 Scraping product...");

  const getText = (sel) => document.querySelector(sel)?.innerText?.trim() || "";
  const getVal = (sel) => document.querySelector(sel)?.value || "";

  const product = {
    title: getText('h1[data-testid="item-title"], [class*="title"]'),
    description: getText('[data-testid="item-description"], .item-description'),
    price: getText('[data-testid="item-price"], .item-price'),
    brand: getText('[itemprop="brand"]'),
    condition: getText('[itemprop="itemCondition"]'),
    images: [],
  };

  // Download and Process Images
  const imgElements = document.querySelectorAll(
    '.item-photos img, [data-testid="item-photo"] img'
  );
  const processor = new ImageProcessor(); // Assumes image-processor.js is loaded

  for (let img of imgElements) {
    // Get High Res URL
    let src = img.src
      .replace("/thumb/", "/original/")
      .replace("/medium/", "/original/");

    try {
      // Download as Blob
      const response = await fetch(src);
      const blob = await response.blob();

      // Convert to Data URL for processing
      const reader = new FileReader();
      const dataUrl = await new Promise((r) => {
        reader.onload = () => r(reader.result);
        reader.readAsDataURL(blob);
      });

      // MODIFY IMAGE (Anti-Detection)
      const modifiedDataUrl = await processor.modifyImage(dataUrl, {
        cropPercentage: 3,
        rotationAngle: 0.5,
        qualityReduction: 5,
        addWatermark: true,
        watermarkText: " ", // Invisible noise
      });

      product.images.push(modifiedDataUrl);
      console.log("✅ Image processed");
    } catch (e) {
      console.error("Failed to process image", e);
    }
  }

  return product;
}

// --- STEP 2: DELETION ---
async function deleteProduct() {
  console.log("🗑️ Starting deletion...");
  // 1. Click Menu
  const menuBtn = document.querySelector(
    '[data-testid="item-actions-overflow-button"]'
  );
  if (menuBtn) menuBtn.click();
  await new Promise((r) => setTimeout(r, 500));

  // 2. Click Delete
  const deleteBtn = Array.from(document.querySelectorAll("button")).find(
    (b) =>
      b.textContent.includes("Supprimer") || b.textContent.includes("Delete")
  );
  if (deleteBtn) deleteBtn.click();
  await new Promise((r) => setTimeout(r, 1000));

  // 3. Confirm
  const confirmBtn = document.querySelector(
    '[data-testid="confirm-action-button"]'
  );
  if (confirmBtn) {
    confirmBtn.click();
    return true;
  }
  return false;
}

// --- STEP 3: PUBLISHING (Form Filling) ---
async function fillForm(data) {
  console.log("📝 Filling form...", data);

  // 1. Upload Images (Complex part)
  const fileInput = document.querySelector('input[type="file"]');
  if (fileInput && data.images.length > 0) {
    const dataTransfer = new DataTransfer();

    for (let i = 0; i < data.images.length; i++) {
      const res = await fetch(data.images[i]);
      const blob = await res.blob();
      const file = new File([blob], `img_${Date.now()}_${i}.jpg`, {
        type: "image/jpeg",
      });
      dataTransfer.items.add(file);
    }

    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 3000)); // Wait for upload
  }

  // 2. Fill Text Fields
  const titleInput = document.querySelector('#title, [name="title"]');
  if (titleInput) triggerReactChange(titleInput, data.title);

  const descInput = document.querySelector(
    '#description, [name="description"]'
  );
  if (descInput) triggerReactChange(descInput, data.description);

  const priceInput = document.querySelector('#price, [name="price"]');
  if (priceInput)
    triggerReactChange(priceInput, data.price.replace(/[^0-9.,]/g, ""));

  console.log("✅ Form filled");
}

// --- MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "SCAN_ITEMS") {
    const run = async () => {
      if (window.vinted && typeof window.vinted.scanPage === "function") {
        return window.vinted.scanPage();
      }
      // Fallback: attempt lightweight list extraction
      const links = Array.from(document.querySelectorAll('a[href*="/items/"]'));
      const unique = new Map();
      for (const link of links) {
        const match = link.href.match(/\/items\/(\d+)/);
        if (!match) continue;
        const itemId = match[1];
        if (unique.has(itemId)) continue;
        const card = link.closest("article, li, div");
        const title = (card?.querySelector("h3, h4, [data-testid*='title']")?.textContent || `Article #${itemId}`).trim();
        const price = (card?.querySelector("[data-testid*='price'], .price")?.textContent || "N/A").trim();
        const image = card?.querySelector("img")?.src || null;
        unique.set(itemId, {
          id: itemId,
          title,
          price,
          image,
          isDraft: false,
          url: `https://www.vinted.fr/items/${itemId}`,
        });
      }
      return Array.from(unique.values());
    };
    run()
      .then((items) => sendResponse(items))
      .catch((err) => {
        console.error("[Content] Scan error:", err);
        sendResponse([]);
      });
    return true;
  }

  if (req.action === "VINTED_AUTOMATION_START") {
    window.postMessage(
      {
        action: "VINTED_AUTOMATION_START",
        itemId: req.itemId,
        settings: req.settings || {},
      },
      "*"
    );
    sendResponse({ success: true });
    return true;
  }

  if (req.action === "SCRAPE") {
    scrapeProduct().then((data) => sendResponse(data));
    return true;
  }
  if (req.action === "DELETE") {
    deleteProduct().then((success) => sendResponse({ success }));
    return true;
  }
  if (req.action === "FILL") {
    fillForm(req.data).then(() => sendResponse({ success: true }));
    return true;
  }
});
