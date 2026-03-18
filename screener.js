pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function handleDrop(event) {
  event.preventDefault();
  const files = event.dataTransfer.files;
  document.getElementById('resume-files').files = files;
  showFiles({ files });
}

function showFiles(input) {
  const list = document.getElementById('file-list');
  const files = Array.from(input.files);
  list.innerHTML = files.map(f =>
    '<div style="margin-top:8px;">✅ ' + f.name + '</div>'
  ).join('');
}

async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(function(item) { return item.str; }).join(' ') + '\n';
  }
  return text;
}

async function screenSingleResume(apiKey, jd, resumeText, fileName) {
  const prompt = 'You are an expert HR analyst. Analyze this resume against the job description.\n\nJOB DESCRIPTION:\n' + jd + '\n\nRESUME (' + fileName + '):\n' + resumeText + '\n\nRespond ONLY in this exact JSON format, no other text:\n{\n  "match_percent": <number 0-100>,\n  "verdict": "<HIRE or MAYBE or NO HIRE>",\n  "matched_skills": ["skill1", "skill2", "skill3"],\n  "missing_skills": ["skill1", "skill2", "skill3"],\n  "summary": "<2-3 sentence assessment of this candidate>"\n}';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.content[0].text;
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

function getClass(verdict) {
  if (verdict === 'HIRE') return 'hire';
  if (verdict === 'NO HIRE') return 'nohire';
  return 'maybe';
}

async function screenResumes() {
  const apiKey = document.getElementById('api-key').value.trim();
  const jd = document.getElementById('jd').value.trim();
  const files = document.getElementById('resume-files').files;

  if (!apiKey) { alert('Please enter your API key!'); return; }
  if (!jd) { alert('Please paste a job description!'); return; }
  if (files.length === 0) { alert('Please upload at least one resume!'); return; }

  const btn = document.querySelector('.btn');
  btn.disabled = true;
  btn.textContent = 'Screening...';

  document.getElementById('results').style.display = 'block';
  document.getElementById('result-cards').innerHTML =
    '<div class="loading"><div class="spinner"></div><p>Analyzing ' + files.length + ' resume(s) with Claude AI...</p></div>';
  document.getElementById('summary-body').innerHTML = '';

  const results = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const resumeText = await extractTextFromPDF(file);
      const result = await screenSingleResume(apiKey, jd, resumeText, file.name);
      results.push(Object.assign({ name: file.name }, result));
    } catch (err) {
      results.push({
        name: file.name,
        match_percent: 0,
        verdict: 'ERROR',
        matched_skills: [],
        missing_skills: [],
        summary: 'Could not process this file: ' + err.message
      });
    }
  }

  document.getElementById('result-cards').innerHTML = results.map(function(r) {
    const cls = getClass(r.verdict);
    return '<div class="result-card ' + cls + '">' +
      '<div class="result-header">' +
      '<div class="result-name">📄 ' + r.name + '</div>' +
      '<div class="score-badge">' + r.match_percent + '%</div>' +
      '</div>' +
      '<span class="verdict">' + r.verdict + '</span>' +
      '<div class="section-title">Summary</div>' +
      '<div class="summary-text">' + r.summary + '</div>' +
      '<div class="section-title">Matched Skills</div>' +
      '<div class="skills-row">' +
      r.matched_skills.map(function(s) { return '<span class="skill-tag skill-match">✓ ' + s + '</span>'; }).join('') +
      '</div>' +
      '<div class="section-title">Missing Skills</div>' +
      '<div class="skills-row">' +
      r.missing_skills.map(function(s) { return '<span class="skill-tag skill-miss">✗ ' + s + '</span>'; }).join('') +
      '</div>' +
      '</div>';
  }).join('');

  document.getElementById('summary-body').innerHTML = results.map(function(r) {
    return '<tr>' +
      '<td>' + r.name + '</td>' +
      '<td><strong>' + r.match_percent + '%</strong></td>' +
      '<td>' + r.verdict + '</td>' +
      '<td>' + (r.missing_skills[0] || '-') + '</td>' +
      '</tr>';
  }).join('');

  btn.disabled = false;
  btn.textContent = 'Screen Resumes with AI';
}
