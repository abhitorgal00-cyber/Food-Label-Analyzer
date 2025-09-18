let knowledgeBase = {};
let lookupMap = {}; // synonym → main key

async function loadKnowledgeBase() {
  try {
    document.getElementById("status").textContent = "📂 Loading knowledge base...";
    const response = await fetch("knowledgeBase.json");
    knowledgeBase = await response.json();

    // 🔥 Build lookupMap for synonyms
    lookupMap = {};
    for (const [key, val] of Object.entries(knowledgeBase)) {
      lookupMap[key.toLowerCase()] = key;
      if (val.synonyms) {
        val.synonyms.forEach(syn => {
          lookupMap[syn.toLowerCase()] = key;
        });
      }
    }

    document.getElementById("status").textContent = "✅ Knowledge base loaded.";
  } catch (err) {
    console.error("Failed to load knowledge base:", err);
    document.getElementById("status").textContent = "⚠️ Failed to load knowledge base!";
  }
}

loadKnowledgeBase();

// Preview uploaded image
document.getElementById('ingredientsInput').addEventListener('change', function (e) {
  const preview = document.getElementById('ingredientsPreview');
  if (this.files && this.files[0]) {
    const reader = new FileReader();
    reader.onload = function (event) {
      preview.src = event.target.result;
      preview.style.display = 'block';
      if (document.getElementById("autoAnalyze").checked) {
        analyzeIngredients();
      }
    }
    reader.readAsDataURL(this.files[0]);
  }
});

async function extractText(file) {
  if (!file) return "";
  const { data: { text } } = await Tesseract.recognize(file, 'eng');
  return text;
}

function generateReportHTML(detailedReport, ingText, counts, percentagesSummary, verdict, reason, unknownIngredients) {
  let html = `<h4>📖 Ingredients Extracted:</h4>
                <p>${ingText || "No ingredients detected."}</p>
                <h4>🧾 Detailed Ingredient Report:</h4>`;

  if (detailedReport.message) {
    html += `<p>${detailedReport.message}</p>`;
  } else {
    html += `<div class="ingredient-report">`;
    detailedReport.forEach(item => {
      html += `
          <div class="ingredient-card">
  <h5>
    ${item.ingredient.toUpperCase()} 
    <span class="tag ${item.category ? item.category.toLowerCase() : 'unknown'}">
      ${item.category || "Unknown"}
    </span>
  </h5>

  <p><b>Synonyms:</b> ${(item.synonyms && item.synonyms.length)
          ? item.synonyms.map(s =>
            s.toLowerCase() === item.matchedSynonym?.toLowerCase()
              ? `<b>${s}</b>`
              : s
          ).join(", ")
          : "None"
        }</p>
  <p><b>Reason:</b> ${item.reason || "N/A"}</p>
  <p><b>After Effects:</b> ${item.after_effects || "N/A"}</p>
  <p><b>After Taste:</b> ${item.after_taste || "N/A"}</p>
</div>
`;
    });
    html += `</div>`;
  }

  // 🚨 Show unknown ingredients
  if (unknownIngredients.length > 0) {
    html += ``;
  }

  html += `<div class="summary-box" style="border:1px solid #ddd; border-radius:10px; padding:15px; margin-top:15px; background:#fafafa; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
  <h4 style="margin-bottom:8px;">🧮 Overall Product Health: <b>${verdict}</b></h4>
  <p style="margin-bottom:12px;"><b>Reason:</b> ${reason}</p>

  <!-- Ingredient Breakdown with Bars -->
  <div style="margin:12px 0 0 0;">
    <div style="margin-bottom:12px;">
      <p style="margin:0 0 4px 0; color:#4caf50;"><b>Healthy:</b> ${counts.Healthy} (${percentagesSummary.Healthy}%)</p>
      <div style="background:#e0e0e0; border-radius:20px; height:16px; width:100%; overflow:hidden;">
        <div style="background:#4caf50; height:100%; width:${percentagesSummary.Healthy}%; transition:width 0.6s; border-radius:20px;"></div>
      </div>
    </div>

    <div style="margin-bottom:12px;">
      <p style="margin:0 0 4px 0; color:#ffc107;"><b>Moderate:</b> ${counts.Moderate} (${percentagesSummary.Moderate}%)</p>
      <div style="background:#e0e0e0; border-radius:20px; height:16px; width:100%; overflow:hidden;">
        <div style="background:#ffc107; height:100%; width:${percentagesSummary.Moderate}%; transition:width 0.6s; border-radius:20px;"></div>
      </div>
    </div>

    <div style="margin-bottom:12px;">
      <p style="margin:0 0 4px 0; color:#f44336;"><b>Unhealthy:</b> ${counts.Unhealthy} (${percentagesSummary.Unhealthy}%)</p>
      <div style="background:#e0e0e0; border-radius:20px; height:16px; width:100%; overflow:hidden;">
        <div style="background:#f44336; height:100%; width:${percentagesSummary.Unhealthy}%; transition:width 0.6s; border-radius:20px;"></div>
      </div>
    </div>

    <div style="margin-bottom:12px;">
      <p style="margin:0 0 4px 0; color:#757575;"><b>Neutral:</b> ${counts.Neutral} (${percentagesSummary.Neutral}%)</p>
      <div style="background:#e0e0e0; border-radius:20px; height:16px; width:100%; overflow:hidden;">
        <div style="background:#757575; height:100%; width:${percentagesSummary.Neutral}%; transition:width 0.6s; border-radius:20px;"></div>
      </div>
    </div>

    <div style="margin-bottom:0;">
      <p style="margin:0 0 4px 0; color:#9e9e9e;"><b>Unknown:</b> ${counts.Unknown} (${percentagesSummary.Unknown}%)</p>
      <div style="background:#e0e0e0; border-radius:20px; height:16px; width:100%; overflow:hidden;">
        <div style="background:#9e9e9e; height:100%; width:${percentagesSummary.Unknown}%; transition:width 0.6s; border-radius:20px;"></div>
      </div>
    </div>
  </div>
</div>

`;
  return html;
}

async function analyzeIngredients() {
  const ingFile = document.getElementById("ingredientsInput").files[0];
  if (!ingFile) return alert("Please upload an ingredients image!");
  document.getElementById("status").textContent = "🔍 Extracting text...";

  // ⚡ For now, hardcoded example
  const ingText = await extractText(ingFile);



  document.getElementById("status").textContent = "⚕️ Analyzing health...";
  let cleanedText = ingText.toLowerCase()
    .replace(/[\[\]\(\)\d\.\:\%]/g, " ")
    .replace(/\s+/g, " ");

  const ingWords = cleanedText.split(/[,;\s]/).map(w => w.trim()).filter(Boolean);
  let detailedReport = [];
  let unknownIngredients = [];

  ingWords.forEach(word => {
    if (word.length < 2) return;
    const normalized = word.trim().toLowerCase();

    // ✅ Direct synonym/ingredient match
    if (lookupMap[normalized]) {
      const key = lookupMap[normalized];
      if (!detailedReport.some(r => r.ingredient === key)) {
        detailedReport.push({
          ingredient: key,
          matchedSynonym: word,   // keep original matched synonym
          synonyms: knowledgeBase[key].synonyms || [],
          ...knowledgeBase[key]
        });
      }
      return;
    }

    // ✅ Fallback: string similarity if no synonym match
    const bestMatch = stringSimilarity.findBestMatch(normalized, Object.keys(lookupMap)).bestMatch;
    if (bestMatch.rating > 0.6) {
      const key = lookupMap[bestMatch.target];
      if (!detailedReport.some(r => r.ingredient === key)) {
        detailedReport.push({
          ingredient: key,
          matchedSynonym: word,
          synonyms: knowledgeBase[key].synonyms || [],
          ...knowledgeBase[key]
        });
      }
    } else {
      // 🚨 Unknown ingredient
      if (!unknownIngredients.includes(word)) unknownIngredients.push(word);
    }
  });

  if (detailedReport.length === 0)
    detailedReport.push({ message: "No recognizable ingredients found in database." });

  let counts = { Healthy: 0, Moderate: 0, Unhealthy: 0, Neutral: 0, Unknown: 0 };
  detailedReport.forEach(item => {
    if (item.category && counts[item.category] !== undefined) counts[item.category]++;
  });

  let totalIngredients = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  let percentagesSummary = {};
  for (let key in counts)
    percentagesSummary[key] = ((counts[key] / totalIngredients) * 100).toFixed(1);

  let verdict = "Moderate", reason = "A balanced mix of ingredients.";
  if (counts.Unhealthy > counts.Healthy + counts.Moderate) {
    verdict = "Unhealthy"; reason = "Contains more unhealthy ingredients than healthy ones.";
  } else if (counts.Healthy > counts.Unhealthy) {
    verdict = "Healthy"; reason = "Contains more healthy ingredients than unhealthy ones.";
  }

  document.getElementById("result").innerHTML = generateReportHTML(detailedReport, ingText, counts, percentagesSummary, verdict, reason, unknownIngredients);
  document.getElementById("status").textContent = "✅ Done";
}

document.getElementById("analyzeBtn").addEventListener("click", analyzeIngredients);
