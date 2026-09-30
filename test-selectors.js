const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log("🧪 Running Vinted Form Engine mock test with full chrome environment...");

// Simple Mock DOM nodes representation
class MockElement {
  constructor(tagName, attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = attrs.id || '';
    this.className = attrs.className || '';
    this.value = attrs.value || '';
    this.textContent = attrs.textContent || '';
    this.attrs = attrs;
    this.children = [];
    this.parentElement = null;
    this._valueTracker = {
      setValue: (val) => { this._lastTrackerValue = val; }
    };
    this.events = [];
    this.focused = false;
    this.clicked = false;
    this.style = {};
    this.isConnected = true;
  }

  getAttribute(name) {
    return this.attrs[name] !== undefined ? this.attrs[name] : null;
  }

  setAttribute(name, val) {
    this.attrs[name] = val;
  }

  hasAttribute(name) {
    return this.attrs[name] !== undefined;
  }

  dispatchEvent(event) {
    this.events.push(event);
  }

  focus() {
    if (global.currentlyFocused) {
      global.currentlyFocused.focused = false;
    }
    this.focused = true;
    global.currentlyFocused = this;
  }

  click() {
    this.clicked = true;
    if (this.attrs && this.attrs['data-package-size-option']) {
      this.attrs['aria-checked'] = 'true';
    }
    if (this.attrs && this.attrs['data-size-cell']) {
      this.attrs['aria-selected'] = 'true';
      if (typeof committedSizeInput !== 'undefined') {
        committedSizeInput.value = this.textContent || 'S / 36 / 8';
      }
    }
  }

  scrollIntoView() {}

  querySelector(selector) {
    return querySelectorMock(this, selector);
  }

  querySelectorAll(selector) {
    return querySelectorAllMock(this, selector);
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesMock(current, selector)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter(c => c !== child);
    child.parentElement = null;
    return child;
  }

  matches(selector) {
    return matchesMock(this, selector);
  }

  getBoundingClientRect() {
    return { width: 100, height: 100, top: 0, left: 0 };
  }
}

function matchesMock(el, selector) {
  const parts = selector.split(',').map(s => s.trim());
  for (const part of parts) {
    if (part === 'div' && el.tagName === 'DIV') return true;
    if (part === 'li' && el.tagName === 'LI') return true;
    if (part === 'button' && el.tagName === 'BUTTON') return true;
    if (part === 'input' && el.tagName === 'INPUT') return true;
    if (part === 'textarea' && el.tagName === 'TEXTAREA') return true;
    if (part === 'span' && el.tagName === 'SPAN') return true;
    if (part === 'label' && el.tagName === 'LABEL') return true;
    if (part === 'p' && el.tagName === 'P') return true;
    
    if (part.startsWith('input[')) {
      const matchName = part.match(/name\*?="([^"]+)"/);
      if (matchName && el.attrs && (el.attrs.name || '').includes(matchName[1])) return true;
      const matchId = part.match(/id\*?="([^"]+)"/);
      if (matchId && (el.id || '').includes(matchId[1])) return true;
    }
    if (part.startsWith('textarea[')) {
      const matchName = part.match(/name\*?="([^"]+)"/);
      if (matchName && el.attrs && (el.attrs.name || '').includes(matchName[1])) return true;
    }
    if (part.startsWith('.')) {
      const cls = part.substring(1);
      if (el.className && el.className.split(/\s+/).includes(cls)) return true;
    }
    if (part.startsWith('#')) {
      if (el.id === part.substring(1)) return true;
    }
    if (part === 'input:not([type=\'file\']):not([type=\'hidden\'])' && el.tagName === 'INPUT') {
      if (el.attrs && el.attrs.type !== 'file' && el.attrs.type !== 'hidden') return true;
    }
    if (part === '[role=\'combobox\']' && el.attrs && el.attrs.role === 'combobox') return true;
    if (part === '[role=\'button\']' && el.attrs && el.attrs.role === 'button') return true;
    if (part === '[role=\'option\']' && el.attrs && el.attrs.role === 'option') return true;
    if (part === '[role=\'listbox\']' && el.attrs && el.attrs.role === 'listbox') return true;
    if (part === '[role=\'radio\']' && el.attrs && el.attrs.role === 'radio') return true;
  }
  return false;
}

function querySelectorMock(root, selector) {
  const all = querySelectorAllMock(root, selector);
  return all.length > 0 ? all[0] : null;
}

function querySelectorAllMock(root, selector) {
  const list = [];
  function traverse(node) {
    if (node !== root && matchesMock(node, selector)) {
      list.push(node);
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }
  traverse(root);
  return list;
}

// Construct DOM helpers
function appendChild(parent, child) {
  parent.children.push(child);
  child.parentElement = parent;
  return child;
}

// Mock chrome extension environment
const chromeMock = {
  runtime: {
    getURL: (path) => `chrome-extension://${path}`,
    sendMessage: () => Promise.resolve({ success: true }),
    onMessage: {
      addListener: () => {}
    }
  },
  storage: {
    local: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve({}),
      remove: () => Promise.resolve({})
    }
  }
};

// Global execution context
const sandbox = {
  window: {
    location: { href: 'https://www.vinted.fr/items/new' },
    VINTED_FIELD_SPECS: {},
    VINTED_CATEGORY_PROFILES: {},
    addEventListener: () => {},
    postMessage: () => {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
  },
  chrome: chromeMock,
  console: {
    log: (...args) => console.log("[Sandbox Log]", ...args),
    error: (...args) => console.error("[Sandbox Error]", ...args),
    warn: (...args) => console.warn("[Sandbox Warn]", ...args)
  },
  Event: class {
    constructor(type) { this.type = type; }
  },
  KeyboardEvent: class {
    constructor(type, detail) { this.type = type; this.detail = detail; }
  },
  PointerEvent: class {
    constructor(type) { this.type = type; }
  },
  MouseEvent: class {
    constructor(type) { this.type = type; }
  },
  setTimeout: () => {}, // Disable setTimeouts in sandbox to prevent auto-start triggers
  clearTimeout: clearTimeout,
  document: {
    body: new MockElement('body'),
    head: new MockElement('head'),
    documentElement: new MockElement('html'),
    getElementById(id) {
      return querySelectorMock(this.body, '#' + id);
    },
    querySelector(selector) {
      return querySelectorMock(this.body, selector);
    },
    querySelectorAll(selector) {
      return querySelectorAllMock(this.body, selector);
    },
    dispatchEvent(event) {},
    addEventListener: () => {},
    createElement(tag) {
      return new MockElement(tag);
    }
  },
  Image: class {
    constructor() {
      setTimeout(() => { if (this.onload) this.onload(); }, 5);
    }
  },
  Node: {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3
  },
  NodeFilter: {
    SHOW_ELEMENT: 1,
    SHOW_TEXT: 4
  }
};

// Bind standard DOM references
sandbox.Event = class Event { constructor(type, opts = {}) { this.type = type; this.bubbles = opts.bubbles || false; } };
sandbox.FocusEvent = class FocusEvent extends sandbox.Event {};
sandbox.InputEvent = class InputEvent extends sandbox.Event {};
sandbox.KeyboardEvent = class KeyboardEvent extends sandbox.Event {};
sandbox.MouseEvent = class MouseEvent extends sandbox.Event {};
sandbox.window.Event = sandbox.Event;
sandbox.window.FocusEvent = sandbox.FocusEvent;
sandbox.window.InputEvent = sandbox.InputEvent;
sandbox.window.KeyboardEvent = sandbox.KeyboardEvent;
sandbox.window.MouseEvent = sandbox.MouseEvent;
sandbox.HTMLInputElement = class HTMLInputElement extends MockElement {};
sandbox.HTMLTextAreaElement = class HTMLTextAreaElement extends MockElement {};
sandbox.window.HTMLInputElement = sandbox.HTMLInputElement;
sandbox.window.HTMLTextAreaElement = sandbox.HTMLTextAreaElement;
sandbox.window.document = sandbox.document;
sandbox.window.window = sandbox.window;
sandbox.window.chrome = chromeMock;
sandbox.document.defaultView = sandbox.window;

// Define simple TreeWalker mock for getVisibleText
sandbox.document.createTreeWalker = function(root) {
  let index = -1;
  const nodes = [];
  function traverse(node) {
    if (node.nodeType === 3 || node.nodeType === 1) {
      nodes.push(node);
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }
  traverse(root);
  return {
    nextNode() {
      index++;
      if (index < nodes.length) {
        this.currentNode = nodes[index];
        return true;
      }
      return false;
    },
    currentNode: null
  };
};

// Load file contents
const matrixCode = fs.readFileSync(path.join(__dirname, 'vinted-field-matrix.js'), 'utf8');
const schemaStoreCode = fs.readFileSync(path.join(__dirname, 'vinted-schema-store.js'), 'utf8');
const schemaDiscoveryCode = fs.readFileSync(path.join(__dirname, 'vinted-schema-discovery.js'), 'utf8');
const engineCode = fs.readFileSync(path.join(__dirname, 'vinted-form-engine.js'), 'utf8');
const contentCode = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');

vm.createContext(sandbox);

// Execute matrix code to populate window properties
vm.runInContext(matrixCode, sandbox);
vm.runInContext(schemaStoreCode, sandbox);
vm.runInContext(schemaDiscoveryCode, sandbox);

// Execute entire content.js code
vm.runInContext(contentCode, sandbox);

// Execute engine code
vm.runInContext(engineCode, sandbox);

// Let's build a mock Vinted Form DOM Structure
const form = sandbox.document.body;

// 1. Title input
const titleInput = new MockElement('input', { name: 'title', value: '' });
titleInput.nodeType = 1;
appendChild(form, titleInput);

// 2. Description textarea
const descInput = new MockElement('textarea', { name: 'description', value: '' });
descInput.nodeType = 1;
appendChild(form, descInput);

// 3. Price input
const priceInput = new MockElement('input', { name: 'price', value: '' });
priceInput.nodeType = 1;
appendChild(form, priceInput);

// Cookie/consent surface that must never be treated as a Vinted form input.
const consentDialog = new MockElement('div', { id: 'onetrust-pc-sdk', role: 'dialog', className: 'ot-sdk-container' });
consentDialog.nodeType = 1;
appendChild(form, consentDialog);
const consentCheckbox = new MockElement('input', { id: 'ot-group-id-C0002', type: 'checkbox', className: 'category-switch-handler' });
consentCheckbox.nodeType = 1;
appendChild(consentDialog, consentCheckbox);

// 4. Category row container
const categoryRow = new MockElement('div', { className: 'web_ui__Cell__cell' });
categoryRow.nodeType = 1;
appendChild(form, categoryRow);
const categoryLabel = new MockElement('span', { textContent: 'Catégorie' });
categoryLabel.nodeType = 1;
appendChild(categoryRow, categoryLabel);
// text node
const catLabelText = { nodeType: 3, textContent: 'Catégorie', parentElement: categoryLabel };
appendChild(categoryLabel, catLabelText);

const categoryInput = new MockElement('input', { id: 'catalog-search-input', type: 'text', role: 'combobox' });
categoryInput.nodeType = 1;
appendChild(categoryRow, categoryInput);
const committedCatalogInput = new MockElement('input', { id: 'catalog', value: '' });
committedCatalogInput.nodeType = 1;
appendChild(categoryRow, committedCatalogInput);

// 5. Brand row container
const brandRow = new MockElement('div', { className: 'web_ui__Cell__cell' });
brandRow.nodeType = 1;
appendChild(form, brandRow);
const brandLabel = new MockElement('span', { textContent: 'Marque' });
brandLabel.nodeType = 1;
appendChild(brandRow, brandLabel);
// text node
const brandLabelText = { nodeType: 3, textContent: 'Marque', parentElement: brandLabel };
appendChild(brandLabel, brandLabelText);

const brandInput = new MockElement('input', { id: 'brand-search-input', type: 'text', role: 'combobox' });
brandInput.nodeType = 1;
appendChild(brandRow, brandInput);
const committedBrandInput = new MockElement('input', { id: 'brand', value: '' });
committedBrandInput.nodeType = 1;
appendChild(brandRow, committedBrandInput);

// 6. Size row with an option where only the inner Vinted cell validates selection.
const sizeRow = new MockElement('div', { className: 'web_ui__Cell__cell' });
sizeRow.nodeType = 1;
appendChild(form, sizeRow);
const sizeLabel = new MockElement('span', { textContent: 'Taille' });
sizeLabel.nodeType = 1;
appendChild(sizeRow, sizeLabel);
const sizeLabelText = { nodeType: 3, textContent: 'Taille', parentElement: sizeLabel };
appendChild(sizeLabel, sizeLabelText);
const sizeOption = new MockElement('li', { textContent: 'S / 36 / 8' });
sizeOption.nodeType = 1;
appendChild(sizeRow, sizeOption);
const sizeCell = new MockElement('div', {
  id: 'size-123',
  role: 'button',
  textContent: 'S / 36 / 8',
  'aria-selected': 'false',
  'data-size-cell': 'true'
});
sizeCell.nodeType = 1;
appendChild(sizeOption, sizeCell);
const sizeText = { nodeType: 3, textContent: 'S / 36 / 8', parentElement: sizeCell };
appendChild(sizeCell, sizeText);
const committedSizeInput = new MockElement('input', { id: 'size', value: '' });
committedSizeInput.nodeType = 1;
appendChild(sizeRow, committedSizeInput);

// 7. Shipping/package size row
const packageRow = new MockElement('div', { className: 'web_ui__Cell__cell', textContent: 'Envoi Petit Recommandé Convient pour un article léger.' });
packageRow.nodeType = 1;
appendChild(form, packageRow);
const packageLabel = new MockElement('span', { textContent: 'Envoi' });
packageLabel.nodeType = 1;
appendChild(packageRow, packageLabel);
const packageLabelText = { nodeType: 3, textContent: 'Envoi', parentElement: packageLabel };
appendChild(packageLabel, packageLabelText);
const packageOption = new MockElement('div', {
  role: 'radio',
  textContent: 'Petit Recommandé Convient pour un article léger.',
  'aria-checked': 'false',
  'data-package-size-option': '1'
});
packageOption.nodeType = 1;
appendChild(packageRow, packageOption);
const packageOptionText = { nodeType: 3, textContent: 'Petit Recommandé Convient pour un article léger.', parentElement: packageOption };
appendChild(packageOption, packageOptionText);

// Define dropdown mock behavior: when input has text, we spawn a dropdown listbox
let listboxNode = null;
const runIntervals = () => {
  console.log(`[Test][runIntervals] categoryInput.focused: ${categoryInput.focused}, categoryInput.value: "${categoryInput.value}", brandInput.focused: ${brandInput.focused}, brandInput.value: "${brandInput.value}", listboxNode: ${!!listboxNode}`);
  // Category dropdown emulation
  if (categoryInput.focused && categoryInput.value && !categoryInput._listboxSpawned) {
    categoryInput._listboxSpawned = true;
    listboxNode = new MockElement('div', { id: 'category-options-listbox', role: 'listbox' });
    listboxNode.nodeType = 1;
    appendChild(form, listboxNode);
    categoryInput.setAttribute('aria-controls', 'category-options-listbox');
    categoryInput.setAttribute('aria-expanded', 'true');
    
    const wrongOption = new MockElement('li', { role: 'option', textContent: 'Robes Enfants > Vêtements pour filles > Robes' });
    wrongOption.nodeType = 1;
    appendChild(listboxNode, wrongOption);
    const wrongTarget = new MockElement('span', { textContent: 'Robes' });
    wrongTarget.nodeType = 1;
    appendChild(wrongOption, wrongTarget);
    const wrongText = { nodeType: 3, textContent: 'Robes', parentElement: wrongTarget };
    appendChild(wrongTarget, wrongText);

    const wrongSubcategory = new MockElement('li', { role: 'option', textContent: 'Robes chics Femmes > Vêtements > Robes' });
    wrongSubcategory.nodeType = 1;
    appendChild(listboxNode, wrongSubcategory);
    const wrongSubHeading = new MockElement('div', { className: 'web_ui__Cell__heading', textContent: 'Robes chics' });
    wrongSubHeading.nodeType = 1;
    appendChild(wrongSubcategory, wrongSubHeading);
    const wrongSubBody = new MockElement('div', { className: 'web_ui__Cell__body', textContent: 'Femmes > Vêtements > Robes' });
    wrongSubBody.nodeType = 1;
    appendChild(wrongSubcategory, wrongSubBody);

    const option = new MockElement('li', { role: 'option', textContent: 'Robes Femmes > Vêtements > Robes' });
    option.nodeType = 1;
    appendChild(listboxNode, option);
    const optionHeading = new MockElement('div', { className: 'web_ui__Cell__heading', textContent: 'Robes' });
    optionHeading.nodeType = 1;
    appendChild(option, optionHeading);
    const optionBody = new MockElement('div', { className: 'web_ui__Cell__body', textContent: 'Femmes > Vêtements > Robes' });
    optionBody.nodeType = 1;
    appendChild(option, optionBody);
    const optionButton = new MockElement('button', { textContent: 'Robes', 'data-select-target': 'true' });
    optionButton.nodeType = 1;
    appendChild(option, optionButton);
    const optionText = { nodeType: 3, textContent: 'Robes', parentElement: optionButton };
    appendChild(optionButton, optionText);
  }
  // Brand dropdown emulation
  if (brandInput.focused && brandInput.value && !brandInput._listboxSpawned) {
    brandInput._listboxSpawned = true;
    listboxNode = new MockElement('div', { id: 'brand-options-listbox', role: 'listbox' });
    listboxNode.nodeType = 1;
    appendChild(form, listboxNode);
    brandInput.setAttribute('aria-controls', 'brand-options-listbox');
    brandInput.setAttribute('aria-expanded', 'true');
    
    const option = new MockElement('li', { role: 'option', textContent: 'Zara' });
    option.nodeType = 1;
    appendChild(listboxNode, option);
    const optionText = { nodeType: 3, textContent: 'Zara', parentElement: option };
    appendChild(option, optionText);
  }

  // Click handler simulation
  if (listboxNode) {
    const findClickedNode = (node) => {
      if (!node) return null;
      if (node.clicked) return node;
      for (const child of node.children || []) {
        const clicked = findClickedNode(child);
        if (clicked) return clicked;
      }
      return null;
    };
    for (const child of listboxNode.children) {
      const clickedNode = findClickedNode(child);
      if (clickedNode) {
        console.log(`[Test] Click detected on option: ${child.textContent}, clickedNode=${clickedNode.tagName}, categoryInput.focused: ${categoryInput.focused}, brandInput.focused: ${brandInput.focused}`);
        if (categoryInput.focused && clickedNode.getAttribute && clickedNode.getAttribute('data-select-target') !== 'true') {
          console.log("[Test] Ignoring category click because target descendant was not selected");
          continue;
        }
        if (categoryInput.focused) {
          committedCatalogInput.value = 'Robes';
          categoryInput.value = 'Robes';
          console.log("[Test] Committed category:", categoryInput.value);
        } else if (brandInput.focused) {
          committedBrandInput.value = child.textContent;
          brandInput.value = child.textContent;
          console.log("[Test] Committed brand:", child.textContent);
        }
        // Remove listbox
        listboxNode.parentElement.children = listboxNode.parentElement.children.filter(c => c !== listboxNode);
        listboxNode = null;
        if (categoryInput.focused) {
          categoryInput.setAttribute('aria-expanded', 'false');
        } else if (brandInput.focused) {
          brandInput.setAttribute('aria-expanded', 'false');
        }
        break;
      }
    }
  }
};

// Emulate interval cycles sequentially during async execution of the form engine
const originalSleep = sandbox.sleep;
sandbox.sleep = async (ms) => {
  runIntervals();
  return new Promise(r => setTimeout(r, 10));
};
sandbox.closeOpenDropdown = async () => {
  if (listboxNode) {
    console.log("[Test] Mock closeOpenDropdown called - removing listboxNode");
    if (listboxNode.parentElement) {
      listboxNode.parentElement.children = listboxNode.parentElement.children.filter(c => c !== listboxNode);
    }
    listboxNode = null;
  }
};
sandbox.appendOverlayLog = (level, message) => {
  console.log(`[OverlayLog][${level.toUpperCase()}] ${message}`);
};

// Draft data to fill
const mockDraft = {
  catalogId: 1904,
  catalogBranchTitles: ["Femmes", "Vêtements", "Robes"],
  title: "Superbe Robe Zara",
  description: "Portée quelques fois, excellent état.",
  price: "15.00",
  category: "Robes",
  brand: "Zara",
  brandId: 14,
  condition: "Très bon état",
  size: "S / 36 / 8",
  sizeId: 123,
  colors: ["Noir"],
  packageSizeId: 1
};

// Run automation in sandbox
sandbox.window.vintedRunFormMatrixAutomation(mockDraft, { strict: true })
  .then(async res => {
    console.log("Form Engine run outcome:", res);
    
    // Validate assertions
    assert.strictEqual(titleInput.value, "Superbe Robe Zara", "Title not set correctly");
    assert.strictEqual(descInput.value, "Portée quelques fois, excellent état.", "Description not set correctly");
    assert.ok(priceInput.value === "15" || priceInput.value === "15.00", `Price not set correctly: ${priceInput.value}`);
    assert.strictEqual(categoryInput.value, "Robes", "Category option was not selected/clicked");
    assert.strictEqual(brandInput.value, "Zara", "Brand option was not selected/clicked");
    assert.strictEqual(sizeCell.getAttribute('aria-selected'), 'true', "Size inner cell should be selected");
    assert.strictEqual(consentCheckbox.focused, false, "Consent checkbox must not be focused");
    assert.strictEqual(consentCheckbox.clicked, false, "Consent checkbox must not be clicked");
    assert.strictEqual(packageOption.getAttribute('aria-checked'), 'true', "Package size option should be selected");
    assert.strictEqual(res.catalogId, "1904", "Catalog id should be returned in automation outcome");
    assert.strictEqual(res.schemaSource, "dom-discovery", "Post-category DOM schema should be discovered");
    const savedSchema = await sandbox.window.vintedGetSchemaForCatalogId("1904");
    assert.ok(savedSchema, "Discovered schema should be retrievable from schema store");
    assert.ok(savedSchema.fields.category, "Saved schema should include category field");
    assert.ok(savedSchema.fields.brand, "Saved schema should include brand field");
    
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
  });
