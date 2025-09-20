 let knowledgeBase = {};
    let lookupMap = {}; // synonym → main key

    // Load knowledge base
    async function loadKnowledgeBase() {
      try {
        document.getElementById("status").textContent = "📂 Loading knowledge base...";
        const response = await fetch("knowledgeBase.json");
        knowledgeBase = await response.json();

        lookupMap = {};
        for (const [key, val] of Object.entries(knowledgeBase)) {
          lookupMap[key.toLowerCase()] = key;
          if (val.synonyms) val.synonyms.forEach(syn => {
            lookupMap[syn.toLowerCase()] = key;
          });
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

    // --- IMAGE PREPROCESSING ---
    async function preprocessImageFile(file, targetWidth = 1600) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.max(1, targetWidth / img.width);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(img, 0, 0, w, h);

          let imageData = ctx.getImageData(0, 0, w, h);
          let d = imageData.data;

          let sum = 0;
          for (let i = 0; i < d.length; i += 4) {
            const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            d[i] = d[i + 1] = d[i + 2] = gray;
            sum += gray;
          }
          const mean = sum / (w * h);
          const thresh = Math.max(120, mean * 0.9);
          for (let i = 0; i < d.length; i += 4) {
            const val = d[i] < thresh ? 0 : 255;
            d[i] = d[i + 1] = d[i + 2] = val;
          }
          ctx.putImageData(imageData, 0, 0);

          canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.95);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }

    function blobToDataURL(blob) {
      return new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(blob);
      });
    }

    // --- OCR API CALL ---
    async function extractTextAPI(file) {
      try {
        document.getElementById("status").textContent = "🧰 Preprocessing image...";
        const processedBlob = await preprocessImageFile(file, 1600);
        const dataURL = await blobToDataURL(processedBlob);

        const formData = new FormData();
        formData.append("base64Image", dataURL);
        formData.append("apikey", "K87702728388957"); // replace with your OCR.Space API key
        formData.append("language", "eng");
        formData.append("isOverlayRequired", "false");
        formData.append("scale", "true");
        formData.append("OCREngine", "2");
        formData.append("detectOrientation", "true");

        document.getElementById("status").textContent = "🔍 OCR in progress...";

        const res = await fetch("https://api.ocr.space/parse/image", {
          method: "POST",
          body: formData
        });
        const data = await res.json();
        if (data && data.ParsedResults && data.ParsedResults[0]) {
          return data.ParsedResults[0].ParsedText || "";
        } else {
          return "";
        }
      } catch (err) {
        console.error("OCR API error:", err);
        return "";
      }
    }

    // --- REPORT HTML GENERATOR (unchanged) ---
    function generateReportHTML(detailedReport, ingText, counts, percentagesSummary, verdict, reason, unknownIngredients) {
      let html = `<h4>📖 Ingredients Extracted:</h4>
                  <p>${ingText || "No ingredients detected."}</p>
                  <h4>🧾 Detailed Ingredient Report:</h4>`;

      if (detailedReport.message) {
        html += `<p>${detailedReport.message}</p>`;
      } else {
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
  <p style="margin-bottom:12px;"><b>Reason:</b> ${reason}</p>
  <div style="margin:12px 0 0 0;">
    ${["Healthy","Moderate","Unhealthy","Neutral","Unknown"].map(cat => `
      <div style="margin-bottom:12px;">
        <p style="margin:0 0 4px 0; color:${{Healthy:'#4caf50',Moderate:'#ffc107',Unhealthy:'#f44336',Neutral:'#757575',Unknown:'#9e9e9e'}[cat]};">
          <b>${cat}:</b> ${counts[cat]} (${percentagesSummary[cat]}%)
        </p>
        <div style="background:#e0e0e0; border-radius:20px; height:16px; width:100%; overflow:hidden;">
          <div style="background:${{Healthy:'#4caf50',Moderate:'#ffc107',Unhealthy:'#f44336',Neutral:'#757575',Unknown:'#9e9e9e'}[cat]}; height:100%; width:${percentagesSummary[cat]}%; transition:width 0.6s; border-radius:20px;"></div>
        </div>
      </div>`).join("")}
  </div>
  </div>`;

      return html;
    }

    // --- ANALYSIS ---
    async function analyzeIngredients() {
      const ingFile = document.getElementById("ingredientsInput").files[0];
      if (!ingFile) return alert("Please upload an ingredients image!");

      const ingText = await extractTextAPI(ingFile);
      if (!ingText) {
        document.getElementById("status").textContent = "⚠️ OCR failed. Try a clearer image.";
        return;
      }

      document.getElementById("status").textContent = "⚕️ Analyzing ingredients...";

      // Improved extraction: look for 'Ingredients:' section
      const raw = (ingText || "").trim();
      let lower = raw.toLowerCase();
      let ingredientSection = "";
      const m = lower.match(/ingredients?[:\-\s]*([\s\S]+)/i);
      if (m) ingredientSection = m[1];
      else ingredientSection = lower;

      const lines = ingredientSection.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let candidateLines = lines.filter(l => /,|;/.test(l));
      if (!candidateLines.length) candidateLines = lines.slice(0, 3);
      const candidateText = candidateLines.join(' ');

      const rawItems = candidateText.split(/,|;/).map(s =>
        s.replace(/\([^)]*\)/g, '')
         .replace(/\d+%?/g, '')
         .replace(/\bcontains\b|\bmay contain\b/gi, '')
         .replace(/[^a-zA-Z\s\-\&]/g, '')
         .trim()
      ).filter(Boolean);

      let detailedReport = [];
      let unknownIngredients = [];
      const kbKeys = Object.keys(lookupMap);

      rawItems.forEach(it => {
        const normalized = it.toLowerCase();
        if (lookupMap[normalized]) {
          const key = lookupMap[normalized];
          if (!detailedReport.some(r => r.ingredient === key)) {
            detailedReport.push({ ingredient: key, matchedSynonym: it, synonyms: knowledgeBase[key].synonyms || [], ...knowledgeBase[key] });
          }
          return;
        }
        const direct = kbKeys.find(k => k === normalized || k.includes(normalized) || normalized.includes(k));
        if (direct) {
          const key = lookupMap[direct];
          if (!detailedReport.some(r => r.ingredient === key)) {
            detailedReport.push({ ingredient: key, matchedSynonym: it, synonyms: knowledgeBase[key].synonyms || [], ...knowledgeBase[key] });
          }
          return;
        }
        const best = stringSimilarity.findBestMatch(normalized, kbKeys).bestMatch;
        if (best.rating > 0.7) {
          const key = lookupMap[best.target];
          if (!detailedReport.some(r => r.ingredient === key)) {
            detailedReport.push({ ingredient: key, matchedSynonym: it, synonyms: knowledgeBase[key].synonyms || [], ...knowledgeBase[key] });
          }
        } else {
          if (!unknownIngredients.includes(it)) unknownIngredients.push(it);
        }
      });

      if (detailedReport.length === 0)
        detailedReport.push({ message: "No recognizable ingredients found in database." });

      let counts = { Healthy: 0, Moderate: 0, Unhealthy: 0, Neutral: 0, Unknown: 0 };
      detailedReport.forEach(item => { if (item.category && counts[item.category] !== undefined) counts[item.category]++; });

      let totalIngredients = Object.values(counts).reduce((a,b)=>a+b,0) || 1;
      let percentagesSummary = {};
      for (let key in counts) percentagesSummary[key] = ((counts[key]/totalIngredients)*100).toFixed(1);

      let verdict = "Moderate", reason = "A balanced mix of ingredients.";
      if (counts.Unhealthy > counts.Healthy + counts.Moderate) { verdict = "Unhealthy"; reason = "Contains more unhealthy ingredients than healthy ones."; }
      else if (counts.Healthy > counts.Unhealthy) { verdict = "Healthy"; reason = "Contains more healthy ingredients than unhealthy ones."; }

      document.getElementById("result").innerHTML = generateReportHTML(detailedReport, ingText, counts, percentagesSummary, verdict, reason, unknownIngredients);
      document.getElementById("status").textContent = "✅ Done";
    }

    document.getElementById("analyzeBtn").addEventListener("click", analyzeIngredients);
