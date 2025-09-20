let knowledgeBase = {};
let lookupMap = {};

// Load knowledge base
async function loadKnowledgeBase() {
  try {
    document.getElementById("status").textContent = "📂 Loading knowledge base...";
    const response = await fetch("knowledgeBase.json");
    knowledgeBase = await response.json();
    lookupMap = {};
    for (const [key, val] of Object.entries(knowledgeBase)) {
      lookupMap[key.toLowerCase()] = key;
      if (val.synonyms) val.synonyms.forEach(syn => lookupMap[syn.toLowerCase()] = key);
    }
    document.getElementById("status").textContent = "✅ Knowledge base loaded.";
  } catch (err) {
    console.error("Failed to load knowledge base:", err);
    document.getElementById("status").textContent = "⚠️ Failed to load knowledge base!";
  }
}
loadKnowledgeBase();

// Preview uploaded image
document.getElementById('ingredientsInput').addEventListener('change', function () {
  const preview = document.getElementById('ingredientsPreview');
  if (this.files && this.files[0]) {
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = 'block';
      if (document.getElementById("autoAnalyze").checked) analyzeIngredients();
    };
    reader.readAsDataURL(this.files[0]);
  }
});

// Image preprocessing
async function preprocessImage(file, maxWidth = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.9);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Nanonets OCR API
async function extractTextWithNanonets(file, modelId, apiKey) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model_id", modelId);
  try {
    document.getElementById("status").textContent = "🔍 Nanonets OCR in progress...";
    const res = await fetch(`https://app.nanonets.com/api/v2/OCR/Model/${modelId}/LabelFile/`, {
      method: "POST",
      headers: { "Authorization": `Basic ${btoa(apiKey + ":")}` },
      body: formData
    });
    const data = await res.json();
    if (data.message === "Success" && data.result) {
      return data.result[0].prediction.map(p => p.value).join(" ");
    }
    return "";
  } catch (err) {
    console.error("Nanonets OCR error:", err);
    return "";
  }
}

// Tesseract.js fallback
async function extractTextWithTesseract(file) {
  try {
    document.getElementById("status").textContent = "🔍 Tesseract OCR in progress...";
    const { data: { text } } = await Tesseract.recognize(file, "eng");
    return text;
  } catch (err) {
    console.error("Tesseract error:", err);
    return "";
  }
}

// Unified OCR with fallback
async function extractText(file, modelId, apiKey) {
  const processedFile = await preprocessImage(file);
  let text = await extractTextWithNanonets(processedFile, modelId, apiKey);
  if (!text.trim()) {
    document.getElementById("status").textContent = "⚠️ Nanonets failed, using Tesseract fallback...";
    const tesseractPromise = extractTextWithTesseract(processedFile);
    const timeoutPromise = new Promise(res => setTimeout(() => res(""), 20000));
    text = await Promise.race([tesseractPromise, timeoutPromise]);
  }
  return text;
}

// Generate report
function generateReportHTML(detailedReport, ingText, counts, percentagesSummary, verdict, reason) {
  let html = `<h4>📖 Ingredients Extracted:</h4><p>${ingText || "No ingredients detected."}</p>`;
  html += `<h4>🧾 Detailed Ingredient Report:</h4>`;
  if (detailedReport.message) html += `<p>${detailedReport.message}</p>`;
  else {
    html += `<div class="ingredient-report">`;
    detailedReport.forEach(item => {
      html += `<div class="ingredient-card">
<h5>${item.ingredient.toUpperCase()} <span class="tag ${item.category ? item.category.toLowerCase() : 'unknown'}">${item.category || "Unknown"}</span></h5>
<p><b>Synonyms:</b> ${(item.synonyms && item.synonyms.length)
        ? item.synonyms.map(s => s.toLowerCase() === item.matchedSynonym?.toLowerCase() ? `<b>${s}</b>` : s).join(", ")
        : "None"
      }</p>
<p><b>Reason:</b> ${item.reason || "N/A"}</p>
<p><b>After Effects:</b> ${item.after_effects || "N/A"}</p>
<p><b>After Taste:</b> ${item.after_taste || "N/A"}</p>
</div>`;
    });
    html += `</div>`;
  }

  html += `<div class="summary-box" style="border:1px solid #ddd; border-radius:10px; padding:15px; margin-top:15px; background:#fafafa;">
<h4 style="margin-bottom:8px;">🧮 Overall Product Health: <b>${verdict}</b></h4>
<div style="margin:12px 0 0 0;">`;
  for (let cat of ["Healthy","Moderate","Unhealthy","Neutral","Unknown"]) {
    html += `<div style="margin-bottom:12px;">
      <p style="margin:0 0 4px 0; color:${{Healthy:'#4caf50',Moderate:'#ffc107',Unhealthy:'#f44336',Neutral:'#757575',Unknown:'#9e9e9e'}[cat]};">
        <b>${cat}:</b> ${counts[cat]} (${percentagesSummary[cat]}%)
      </p>
      <div style="background:#e0e0e0; border-radius:20px; height:16px; width:100%; overflow:hidden;">
        <div style="background:${{Healthy:'#4caf50',Moderate:'#ffc107',Unhealthy:'#f44336',Neutral:'#757575',Unknown:'#9e9e9e'}[cat]}; height:100%; width:${percentagesSummary[cat]}%; transition:width 0.6s; border-radius:20px;"></div>
      </div>
    </div>`;
  }
  html += `</div></div>`;
  return html;
}

// Analyze ingredients
async function analyzeIngredients() {
  const ingFile = document.getElementById("ingredientsInput").files[0];
  if (!ingFile) return alert("Please upload an ingredients image!");

  const NANONETS_MODEL_ID = "YOUR_MODEL_ID"; // Replace with your model ID
  const NANONETS_API_KEY = "YOUR_API_KEY";   // Replace with your Nanonets API key

  document.getElementById("status").textContent = "⚕️ Extracting text...";
  const ingText = await extractText(ingFile, NANONETS_MODEL_ID, NANONETS_API_KEY);
  if (!ingText.trim()) {
    document.getElementById("status").textContent = "⚠️ OCR failed. Try a clearer image.";
    return;
  }

  document.getElementById("status").textContent = "⚕️ Analyzing ingredients...";
  const cleanedText = ingText.toLowerCase().replace(/[\[\]\(\)\d\.\:\%]/g, " ").replace(/\s+/g, " ");
  const ingWords = cleanedText.split(/[,;\s]/).map(w => w.trim()).filter(Boolean);

  let detailedReport = [], unknownIngredients = [];
  const kbKeys = Object.keys(lookupMap);

  ingWords.forEach(word => {
    if (word.length < 2) return;
    const normalized = word.trim().toLowerCase();
    if (lookupMap[normalized]) {
      const key = lookupMap[normalized];
      if (!detailedReport.some(r => r.ingredient === key))
        detailedReport.push({ ingredient: key, matchedSynonym: word, synonyms: knowledgeBase[key].synonyms || [], ...knowledgeBase[key] });
      return;
    }
    const best = stringSimilarity.findBestMatch(normalized, kbKeys).bestMatch;
    if (best.rating > 0.6) {
      const key = lookupMap[best.target];
      if (!detailedReport.some(r => r.ingredient === key))
        detailedReport.push({ ingredient: key, matchedSynonym: word, synonyms: knowledgeBase[key].synonyms || [], ...knowledgeBase[key] });
    } else {
      if (!unknownIngredients.includes(word)) unknownIngredients.push(word);
    }
  });

  if (!detailedReport.length) detailedReport.push({ message: "No recognizable ingredients found in database." });

  let counts = { Healthy: 0, Moderate: 0, Unhealthy: 0, Neutral: 0, Unknown: 0 };
  detailedReport.forEach(item => { if (item.category && counts[item.category] !== undefined) counts[item.category]++; });
  let totalIngredients = Object.values(counts).reduce((a,b)=>a+b,0) || 1;
  let percentagesSummary = {};
  for (let key in counts) percentagesSummary[key] = ((counts[key]/totalIngredients)*100).toFixed(1);

  let verdict = "Moderate", reason = "A balanced mix of ingredients.";
  if (counts.Unhealthy > counts.Healthy + counts.Moderate) { verdict = "Unhealthy"; reason = "Contains more unhealthy ingredients than healthy ones."; }
  else if (counts.Healthy > counts.Unhealthy) { verdict = "Healthy"; reason = "Contains more healthy ingredients than unhealthy ones."; }

  document.getElementById("result").innerHTML = generateReportHTML(detailedReport, ingText, counts, percentagesSummary, verdict, reason);
  document.getElementById("status").textContent = "✅ Done";
}

document.getElementById("analyzeBtn").addEventListener("click", analyzeIngredients);
