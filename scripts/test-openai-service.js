/**
 * test-openai-service.js - Tests unitaires pour openai-service.js
 */

const assert = require("assert");
const {
  OPENAI_DEFAULT_MODEL,
  testOpenAiApiKey,
  callOpenAiListingReformulation,
} = require("../openai-service.js");

async function runTests() {
  console.log("=== Test 1: Configuration par défaut ===");
  assert.strictEqual(OPENAI_DEFAULT_MODEL, "gpt-4o-mini");
  console.log("✓ Modèle par défaut = gpt-4o-mini");

  console.log("\n=== Test 2: Validation locale des clés API ===");
  const emptyRes = await testOpenAiApiKey("");
  assert.strictEqual(emptyRes.ok, false);
  assert(emptyRes.error.includes("renseigner"));

  const invalidFormatRes = await testOpenAiApiKey("invalid-key-format");
  assert.strictEqual(invalidFormatRes.ok, false);
  assert(invalidFormatRes.error.includes("sk-"));
  console.log("✓ Validation format de clé OK (rejet des clés invalides avant requête HTTP)");

  console.log("\n=== Test 3: Simulation de reformulation OpenAI (Mock) ===");
  const originalFetch = global.fetch;

  // Mock fetch réussie
  global.fetch = async (url, options) => {
    assert(url.includes("api.openai.com/v1/chat/completions"));
    assert(options.headers.Authorization === "Bearer sk-test-key-mock");

    const parsedBody = JSON.parse(options.body);
    assert.strictEqual(parsedBody.model, "gpt-4o-mini");
    assert.strictEqual(parsedBody.response_format?.type, "json_object");

    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: "gpt-4o-mini",
        usage: { prompt_tokens: 120, completion_tokens: 85, total_tokens: 205 },
        choices: [
          {
            message: {
              content: JSON.stringify({
                titles: [
                  "✨ **Peluche Chien Shiba Inu** Mameshiba Japon Amuse",
                  "Mameshiba Sankyodai Chien Peluche Import Japon"
                ],
                descriptions: [
                  "✨ Superbe peluche Mameshiba importée du Japon.\n\n- **État** : Neuf sans étiquette\n- **Marque** : Amuse\n\n📦 Expédition soignée sous 24h.",
                  "Peluche Chien Shiba Inu Amuse authentique.\n\n- Condition : Neuf sans étiquette\n\nN'hésitez pas si vous avez des questions !"
                ]
              }),
            },
          },
        ],
      }),
    };
  };

  try {
    const outcome = await callOpenAiListingReformulation({
      apiKey: "sk-test-key-mock",
      model: "gpt-4o-mini",
      title: "Peluche Chien Shiba Inu Endormi Mameshiba Sankyodai Amuse - Import Japon",
      description: "Peluche en parfait état, très douce, import direct Japon.",
      item: {
        brand: "Amuse japan",
        condition: "Neuf sans étiquette",
        price: "12.00",
      },
    });

    assert(Array.isArray(outcome.titles));
    assert.strictEqual(outcome.titles.length, 2);
    // Vérification : aucun markdown ** ni émoji dans le titre
    assert(!outcome.titles[0].includes("**"), "Le titre ne doit pas contenir de markdown **");
    assert(!outcome.titles[0].includes("✨"), "Le titre ne doit pas contenir d'émoji ✨");
    assert(outcome.titles[0].includes("Peluche Chien Shiba Inu"));

    assert(Array.isArray(outcome.descriptions));
    assert.strictEqual(outcome.descriptions.length, 2);
    // Vérification : aucun markdown ** ni émoji dans la description
    assert(!outcome.descriptions[0].includes("**"), "La description ne doit pas contenir de markdown **");
    assert(!outcome.descriptions[0].includes("📦"), "La description ne doit pas contenir d'émoji 📦");
    assert(!outcome.descriptions[0].includes("✨"), "La description ne doit pas contenir d'émoji ✨");
    assert(outcome.descriptions[0].includes("- État : Neuf sans étiquette"));
    console.log("✓ Nettoyage anti-markdown et anti-émoji validé avec succès (aucun astérisque, aucun émoji).");
    console.log("  - Titres nettoyés :", outcome.titles);
    console.log("  - Description 1 nettoyée :\n", outcome.descriptions[0]);
  } finally {
    global.fetch = originalFetch;
  }


  console.log("\n=== Test 4: Gestion d'erreur OpenAI (Mock HTTP 401) ===");
  global.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({
      error: { message: "Incorrect API key provided" }
    }),
  });

  try {
    let threw = false;
    try {
      await callOpenAiListingReformulation({
        apiKey: "sk-bad-key",
        title: "Test",
        description: "Test",
      });
    } catch (e) {
      threw = true;
      assert(e.message.includes("Incorrect API key"));
      console.log("✓ Exception levée correctement :", e.message);
    }
    assert(threw, "L'erreur aurait dû être levée");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("\n🎉 TOUS LES TESTS DU SERVICE OPENAI SONT VALIDES !");
}

runTests().catch((err) => {
  console.error("❌ Échec test:", err);
  process.exit(1);
});
