let knowledgeBase = {};

async function loadKnowledgeBase() {
  try {
    document.getElementById("status").textContent = "📂 Loading knowledge base...";
    const response = await fetch("knowledgeBase.json");
    knowledgeBase = await response.json();
    document.getElementById("status").textContent = "✅ Knowledge base loaded.";
  } catch (err) {
    console.error("Failed to load knowledge base:", err);
    document.getElementById("status").textContent = "⚠️ Failed to load knowledge base!";
  }
}

loadKnowledgeBase();

document.getElementById('ingredientsInput').addEventListener('change', function(e){
  const preview = document.getElementById('ingredientsPreview');
  if(this.files && this.files[0]){
    const reader = new FileReader();
    reader.onload = function(event){
      preview.src = event.target.result;
      preview.style.display = 'block';
    }
    reader.readAsDataURL(this.files[0]);
  }
});

async function extractText(file) {
  if (!file) return "";
  const { data: { text } } = await Tesseract.recognize(file, 'eng');
  return text;
}

function generateReportHTML(detailedReport, ingText, counts, percentagesSummary, verdict, reason) {
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
          <h5>${item.ingredient.toUpperCase()} 
            <span class="tag ${item.category ? item.category.toLowerCase() : 'unknown'}">${item.category || "Unknown"}</span>
          </h5>
          <p><b>Reason:</b> ${item.reason || "N/A"}</p>
          <p><b>After Effects:</b> ${item.after_effects || "N/A"}</p>
          <p><b>After Taste:</b> ${item.after_taste || "N/A"}</p>
        </div>`;
    });
    html += `</div>`;
  }

  html += `<div class="summary-box">
             <h4>🧮 Overall Product Health: <b>${verdict}</b></h4>
             <p><b>Reason:</b> ${reason}</p>
             <ul style="margin:10px 0 0 0; padding-left:15px;">
               <li>Healthy: ${counts.Healthy} (${percentagesSummary.Healthy}%)</li>
               <li>Moderate: ${counts.Moderate} (${percentagesSummary.Moderate}%)</li>
               <li>Unhealthy: ${counts.Unhealthy} (${percentagesSummary.Unhealthy}%)</li>
               <li>Neutral: ${counts.Neutral} (${percentagesSummary.Neutral}%)</li>
               <li>Unknown: ${counts.Unknown} (${percentagesSummary.Unknown}%)</li>
             </ul>
           </div>`;
  return html;
}

async function analyzeIngredients() {
  const ingFile = document.getElementById("ingredientsInput").files[0];
  if (!ingFile) return alert("Please upload an ingredients image!");
  document.getElementById("status").textContent ="🔍 Extracting text...";
  
  const ingText = await extractText(ingFile);

  document.getElementById("status").textContent ="⚕️ Analyzing health...";
  let cleanedText = ingText.toLowerCase()
    .replace(/[\[\]\(\)\d\.\,\:\;\%]/g, " ")
    .replace(/\s+/g, " ");
  
  const ingWords = cleanedText.split(" ");
  let detailedReport = [];

  ingWords.forEach(word => {
    if (word.length < 3) return;
    if (!knowledgeBase || Object.keys(knowledgeBase).length === 0) return;
    const bestMatch = stringSimilarity.findBestMatch(word, Object.keys(knowledgeBase)).bestMatch;
    if (bestMatch.rating > 0.6) {
      let key = bestMatch.target;
      if (!detailedReport.some(r => r.ingredient === key))
        detailedReport.push({ ingredient: key, ...knowledgeBase[key] });
    }
  });

  if (detailedReport.length === 0)
    detailedReport.push({ message: "No recognizable ingredients found in database." });

  let counts = { Healthy:0, Moderate:0, Unhealthy:0, Neutral:0, Unknown:0 };
  detailedReport.forEach(item => {
    if (item.category && counts[item.category] !== undefined) counts[item.category]++;
  });

  let totalIngredients = Object.values(counts).reduce((a,b)=>a+b,0)||1;
  let percentagesSummary = {};
  for(let key in counts)
    percentagesSummary[key] = ((counts[key]/totalIngredients)*100).toFixed(1);

  let verdict = "Moderate", reason = "A balanced mix of ingredients.";
  if(counts.Unhealthy > counts.Healthy+counts.Moderate) {
    verdict="Unhealthy"; reason="Contains more unhealthy ingredients than healthy ones.";
  } else if (counts.Healthy>counts.Unhealthy) {
    verdict="Healthy"; reason="Contains more healthy ingredients than unhealthy ones.";
  }

  document.getElementById("result").innerHTML = generateReportHTML(detailedReport, ingText, counts, percentagesSummary, verdict, reason);
  document.getElementById("status").textContent = "✅ Done";
}
    