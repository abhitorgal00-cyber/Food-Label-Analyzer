let knowledgeBase = {};
let lookupMap = {};
let cropper = null;

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

// Preview uploaded image & initialize cropper
document.getElementById('ingredientsInput').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;

  const preview = document.getElementById('ingredientsPreview');
  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result;
    preview.style.display = 'block';

    if (cropper) cropper.destroy();

    cropper = new Cropper(preview, {
      aspectRatio: NaN,
      viewMode: 1,
      autoCropArea: 1,
      background: true,
      movable: true,
      zoomable: true,
      rotatable: true,
      scalable: true,
    });
  };
  reader.readAsDataURL(file);
});

// Cropper controls
document.getElementById("rotateLeft").addEventListener("click", () => { if(cropper) cropper.rotate(-45); });
document.getElementById("rotateRight").addEventListener("click", () => { if(cropper) cropper.rotate(45); });
document.getElementById("zoomIn").addEventListener("click", () => { if(cropper) cropper.zoom(0.1); });
document.getElementById("zoomOut").addEventListener("click", () => { if(cropper) cropper.zoom(-0.1); });
document.getElementById("cropImage").addEventListener("click", () => {
  if(!cropper) return alert("No image loaded!");
  const canvas = cropper.getCroppedCanvas();
  canvas.toBlob(blob => {
    const preview = document.getElementById('ingredientsPreview');
    preview.src = URL.createObjectURL(blob);
    cropper.destroy();
    cropper = new Cropper(preview, {
      aspectRatio: NaN,
      viewMode: 1,
      autoCropArea: 1,
      background: true,
      movable: true,
      zoomable: true,
      rotatable: true,
      scalable: true,
    });
  }, "image/jpeg", 0.95);
});

// Image preprocessing
async function preprocessImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.95);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Nanonets OCR
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

// Tesseract fallback
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

// Generate report HTML
function generateReportHTML(detailedReport, ingText, counts, percentagesSummary, verdict, reason) {
  let html = `<h4>📖 Ingredients Extracted:</h4><p>${ingText || "No ingredients detected."}</p>`;
  html += `<h4>🧾 Detailed Ingredient Report:</h4>`;
  
  if(detailedReport.message) html += `<p>${detailedReport.message}</p>`;
  else {
    html += `<div class="ingredient-report">`;
    detailedReport.forEach(item => {
      html += `<div class="ingredient-card" style="border:1px solid #ddd; border-radius:10px; padding:10px; margin-bottom:10px; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,0.05);">
<h5>${item.ingredient.toUpperCase()} <span class="tag ${item.category ? item.category.toLowerCase() : 'unknown'}" style="padding:2px 6px; border-radius:6px; font-size:12px; background:${{
        Healthy:'#4caf50',Moderate:'#ffc107',Unhealthy:'#f44336',Neutral:'#757575',Unknown:'#9e9e9e'
      }[item.category] || '#9e9e9e'}; color:#fff;">${item.category || "Unknown"}</span></h5>
<p><b>Synonyms:</b> ${(item.synonyms && item.synonyms.length)
        ? item.synonyms.map(s => s.toLowerCase() === item.matchedSynonym?.toLowerCase() ? `<b>${s}</b>` : s).join(", ")
        : "None"}</p>
<p><b>Reason:</b> ${item.reason || "N/A"}</p>
<p><b>After Effects:</b> ${item.after_effects || "N/A"}</p>
<p><b>After Taste:</b> ${item.after_taste || "N/A"}</p>
</div>`;
    });
    html += `</div>`;
  }

  // Modern summary box with colored bars
  html += `<div class="summary-box" style="border:1px solid #ddd; border-radius:12px; padding:15px; margin-top:20px; background:#f9f9f9; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
<h4 style="margin-bottom:12px;">🧮 Overall Product Health: <b>${verdict}</b></h4>`;

  const colors = { Healthy:'#4caf50', Moderate:'#ffc107', Unhealthy:'#f44336', Neutral:'#757575', Unknown:'#9e9e9e' };

  for(let cat of ["Healthy","Moderate","Unhealthy","Neutral","Unknown"]) {
    html += `
    <div style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; font-weight:500; margin-bottom:4px; color:${colors[cat]}">
        <span>${cat}</span>
        <span>${counts[cat]} (${percentagesSummary[cat]}%)</span>
      </div>
      <div style="background:#e0e0e0; border-radius:12px; height:16px; width:100%; overflow:hidden;">
        <div style="background:${colors[cat]}; width:${percentagesSummary[cat]}%; height:100%; border-radius:12px; transition: width 0.5s;"></div>
      </div>
    </div>`;
  }

  html += `<p style="margin-top:12px; font-weight:500;"><b>Reason:</b> ${reason}</p></div>`;

  return html;
}

// Analyze ingredients
async function analyzeIngredients() {
  if(!cropper) return alert("Upload and crop image first!");
  cropper.getCroppedCanvas().toBlob(async blob => {
    const NANONETS_MODEL_ID = "YOUR_MODEL_ID"; 
    const NANONETS_API_KEY = "YOUR_API_KEY";  

    document.getElementById("status").textContent = "⚕️ Extracting text...";
    const ingText = await extractText(blob, NANONETS_MODEL_ID, NANONETS_API_KEY);
    if(!ingText.trim()) {
      document.getElementById("status").textContent = "⚠️ OCR failed. Try a clearer image.";
      return;
    }

    document.getElementById("status").textContent = "⚕️ Analyzing ingredients...";
    const cleanedText = ingText.toLowerCase().replace(/[\[\]\(\)\d\.\:\%]/g," ").replace(/\s+/g," ");
    const ingWords = cleanedText.split(/[,;\s]/).map(w => w.trim()).filter(Boolean);

    let detailedReport=[], unknownIngredients=[];
    const kbKeys = Object.keys(lookupMap);

    ingWords.forEach(word => {
      if(word.length<2) return;
      const normalized = word.trim().toLowerCase();
      if(lookupMap[normalized]) {
        const key = lookupMap[normalized];
        if(!detailedReport.some(r=>r.ingredient===key))
          detailedReport.push({ingredient:key,matchedSynonym:word,synonyms:knowledgeBase[key].synonyms||[],...knowledgeBase[key]});
      } else {
        const best = stringSimilarity.findBestMatch(normalized,kbKeys).bestMatch;
        if(best.rating>0.6){
          const key = lookupMap[best.target];
          if(!detailedReport.some(r=>r.ingredient===key))
            detailedReport.push({ingredient:key,matchedSynonym:word,synonyms:knowledgeBase[key].synonyms||[],...knowledgeBase[key]});
        } else {
          if(!unknownIngredients.includes(word)) unknownIngredients.push(word);
        }
      }
    });

    // If no known ingredients, show unknown list immediately
    if(detailedReport.length === 0) {
      let unknownHTML = `<h4>📖 Ingredients Extracted:</h4><p>${ingText || "No ingredients detected."}</p>`;
      unknownHTML += `<h4>🧾 Ingredient Report:</h4><p>Unknown ingredients detected:</p>`;
      unknownHTML += `<ul>${unknownIngredients.map(i=>`<li style="color:#f44336; font-weight:500;">${i}</li>`).join('')}</ul>`;
      unknownHTML += `<div class="summary-box" style="border:1px solid #ddd; border-radius:12px; padding:15px; margin-top:20px; background:#f9f9f9; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
<h4 style="margin-bottom:12px;">🧮 Overall Product Health: <b>Unknown</b></h4>
<p style="margin-top:12px; font-weight:500;"><b>Reason:</b> No known ingredients found in the database.</p></div>`;

      document.getElementById("result").innerHTML = unknownHTML;
      document.getElementById("status").textContent = "⚠️ No known ingredients found";
      return;
    }

    // Proceed with normal analysis if some ingredients matched
    let counts={Healthy:0,Moderate:0,Unhealthy:0,Neutral:0,Unknown:0};
    detailedReport.forEach(item=>{ if(item.category && counts[item.category]!==undefined) counts[item.category]++; });
    let totalIngredients = Object.values(counts).reduce((a,b)=>a+b,0)||1;
    let percentagesSummary = {};
    for(let key in counts) percentagesSummary[key]=((counts[key]/totalIngredients)*100).toFixed(1);

    let verdict="Moderate", reason="A balanced mix of ingredients.";
    if(counts.Unhealthy>counts.Healthy+counts.Moderate) { verdict="Unhealthy"; reason="Contains more unhealthy ingredients than healthy ones."; }
    else if(counts.Healthy>counts.Unhealthy) { verdict="Healthy"; reason="Contains more healthy ingredients than unhealthy ones."; }

    document.getElementById("result").innerHTML = generateReportHTML(detailedReport, ingText, counts, percentagesSummary, verdict, reason);
    document.getElementById("status").textContent = "✅ Done";
  }, "image/jpeg", 0.95);
}

document.getElementById("analyzeBtn").addEventListener("click", analyzeIngredients);
