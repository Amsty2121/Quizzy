const quizTitleEl = document.getElementById('quizTitle');
const quizSubtitleEl = document.getElementById('quizSubtitle');
const appBrandEl = document.getElementById('appBrand');
const totalQuestionsEl = document.getElementById('totalQuestions');
const quizEl = document.getElementById('quiz');
const pagerTopEl = document.getElementById('pagerTop');
const pagerBottomEl = document.getElementById('pagerBottom');
const countEl = document.getElementById('questionCount');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const chooseQuizBtn = document.getElementById('chooseQuizBtn');
const answeredCountEl = document.getElementById('answeredCount');
const correctCountEl = document.getElementById('correctCount');
const wrongCountEl = document.getElementById('wrongCount');
const quizModalEl = document.getElementById('quizModal');
const quizFileListEl = document.getElementById('quizFileList');
const loadSelectedQuizBtn = document.getElementById('loadSelectedQuizBtn');
const manualTxtInput = document.getElementById('manualTxtInput');
const quizModalHint = document.getElementById('quizModalHint');

const DEFAULT_META = {
  title: 'Alege quizul',
  subtitle: 'Alege batch-ul de întrebări, parcurge-le în ordine cu paginare, marchează variantele, apoi verifică fiecare întrebare separat.',
  brand: 'SMALL QUIZ APP by Dimcik with Love'
};

let availableQuizFiles = normalizeInitialFiles(window.QUIZ_FILES);
let activeMeta = { ...DEFAULT_META };
let sortedQuestions = [];
let currentPage = 0;
let checkedState = new Map();

function normalizeInitialFiles(files) {
  const list = Array.isArray(files) ? files.filter(item => item && item.file) : [];

  return list.map((item, index) => ({
    id: `path-${index}`,
    title: item.title || item.file || `Quiz ${index + 1}`,
    file: item.file,
    source: 'path',
    questionsCount: item.questionsCount || null
  }));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showModal() {
  renderQuizFileList();
  quizModalEl.classList.add('show');
}

function hideModal() {
  quizModalEl.classList.remove('show');
}

function setModalMessage(message, isError = false) {
  quizModalHint.innerHTML = escapeHtml(message);
  quizModalHint.style.color = isError ? '#b42318' : '';
}

function renderQuizFileList() {
  if (!availableQuizFiles.length) {
    quizFileListEl.innerHTML = '<div class="empty">Nu am găsit fișiere .txt. Adaugă documente în quiz-list.txt sau alege manual un fișier.</div>';
    return;
  }

  quizFileListEl.innerHTML = availableQuizFiles.map((item, index) => {
    const checked = index === 0 ? 'checked' : '';
    const sourceLabel = item.source === 'content' ? 'încărcat manual' : item.file;
    const countLabel = item.questionsCount ? ` · ${item.questionsCount} întrebări detectate` : '';
    return `
      <label class="quiz-file-item">
        <input type="radio" name="quizFile" value="${escapeHtml(item.id)}" ${checked} />
        <span>
          <span class="quiz-file-name">${escapeHtml(item.title)}</span>
          <span class="quiz-file-meta">${escapeHtml(sourceLabel)}${escapeHtml(countLabel)}</span>
        </span>
      </label>
    `;
  }).join('');
}

function getSelectedQuizFile() {
  const selected = quizFileListEl.querySelector('input[name="quizFile"]:checked');
  if (!selected) return availableQuizFiles[0] || null;
  return availableQuizFiles.find(item => item.id === selected.value) || null;
}

function evaluateQuizText(text, fallbackTitle = 'Quiz') {
  const sandbox = {};
  const runner = new Function('window', `${text}\n;return { meta: window.QUIZ_META, questions: window.QUIZ_QUESTIONS };`);
  const result = runner(sandbox);
  const meta = result.meta || { title: fallbackTitle };
  const questions = Array.isArray(result.questions) ? result.questions : [];
  return { meta, questions };
}

function prepareLoadedQuiz(meta, questions) {
  activeMeta = { ...DEFAULT_META, title: meta?.title || DEFAULT_META.title };
  sortedQuestions = [...questions].sort((a, b) => Number(a.id) - Number(b.id));
  checkedState.clear();
  currentPage = 0;
  applyQuizMeta();
  renderQuiz();
  hideModal();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadQuizFromScript(path) {
  return new Promise((resolve, reject) => {
    delete window.QUIZ_META;
    delete window.QUIZ_QUESTIONS;

    const script = document.createElement('script');
    const separator = path.includes('?') ? '&' : '?';
    script.src = `${path}${separator}v=${Date.now()}`;
    script.onload = () => {
      const meta = window.QUIZ_META || { title: path };
      const questions = Array.isArray(window.QUIZ_QUESTIONS) ? window.QUIZ_QUESTIONS : [];
      script.remove();
      resolve({ meta, questions });
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Nu pot încărca fișierul ${path}. Verifică dacă există lângă index.html sau alege-l manual.`));
    };
    document.head.appendChild(script);
  });
}

async function loadSelectedQuiz() {
  const selected = getSelectedQuizFile();
  if (!selected) {
    setModalMessage('Nu este selectat niciun fișier.', true);
    return;
  }

  try {
    setModalMessage('Se încarcă quizul...');
    let loaded;
    if (selected.source === 'content') {
      loaded = evaluateQuizText(selected.content, selected.title);
    } else {
      loaded = await loadQuizFromScript(selected.file);
    }

    loaded.meta = { title: selected.title || loaded.meta?.title || selected.file || 'Quiz' };

    if (!loaded.questions.length) {
      throw new Error('Fișierul selectat nu conține window.QUIZ_QUESTIONS sau lista este goală.');
    }

    prepareLoadedQuiz(loaded.meta, loaded.questions);
  } catch (error) {
    setModalMessage(error.message || 'Nu am putut încărca quizul.', true);
  }
}

async function addTxtFilesFromFileList(files) {
  const txtFiles = [...files].filter(file => file.name.toLowerCase().endsWith('.txt'));
  if (!txtFiles.length) {
    setModalMessage('Nu am găsit fișiere .txt în selecția ta.', true);
    return;
  }

  const loadedItems = [];
  for (const file of txtFiles) {
    try {
      const content = await file.text();
      const parsed = evaluateQuizText(content, file.name);
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) continue;
      loadedItems.push({
        id: `content-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: parsed.meta?.title || file.name.replace(/\.txt$/i, ''),
        file: file.name,
        source: 'content',
        content,
        questionsCount: parsed.questions.length
      });
    } catch (_) {
      // ignorăm fișierele txt care nu au structura quizului
    }
  }

  if (!loadedItems.length) {
    setModalMessage('Fișierele .txt alese nu au structura corectă: trebuie să conțină window.QUIZ_QUESTIONS.', true);
    return;
  }

  availableQuizFiles = loadedItems;
  renderQuizFileList();
  setModalMessage(`Am găsit ${loadedItems.length} fișier(e) de quiz. Alege unul și apasă „Deschide quizul selectat”.`);
}

function applyQuizMeta() {
  const title = activeMeta.title || DEFAULT_META.title;
  const subtitle = DEFAULT_META.subtitle;
  const brand = DEFAULT_META.brand;

  if (quizTitleEl) quizTitleEl.textContent = title;
  if (quizSubtitleEl) quizSubtitleEl.textContent = subtitle;
  if (appBrandEl) {
    const parts = String(brand).split(/\s+by\s+/i);
    if (parts.length >= 2) {
      appBrandEl.innerHTML = `<span class="brand-main">${escapeHtml(parts[0].trim())}</span><span class="brand-love">by ${escapeHtml(parts.slice(1).join(' by ').trim())}</span>`;
    } else {
      appBrandEl.textContent = brand;
    }
  }
  if (totalQuestionsEl) totalQuestionsEl.textContent = sortedQuestions.length;
  document.title = `${title} | Quiz`;
}

function getBatchSize() {
  return Number(countEl.value || 60);
}

function getTotalPages() {
  return Math.max(1, Math.ceil(sortedQuestions.length / getBatchSize()));
}

function getCurrentQuestions() {
  const size = getBatchSize();
  const start = currentPage * size;
  return sortedQuestions.slice(start, start + size);
}

function getQuestionLabel(q) {
  const type = q.type === 'CS' ? 'CS' : (q.type === 'CM' ? 'CM' : 'Răspuns');
  const source = q.sourceNumber ? `#${q.sourceNumber}` : `#${q.id}`;
  const page = q.page ? ` · pag. ${q.page}` : '';
  return `${type} · ${source}${page}`;
}

function renderQuiz() {
  checkedState.clear();
  updateScore();

  if (!sortedQuestions.length) {
    const message = '<div class="empty">Alege un document .txt pentru a începe quizul.</div>';
    quizEl.innerHTML = message;
    pagerTopEl.innerHTML = '';
    pagerBottomEl.innerHTML = '';
    return;
  }

  const currentQuestions = getCurrentQuestions();
  const cards = currentQuestions.map((q, index) => renderQuestionCard(q, index)).join('');
  quizEl.innerHTML = cards || '<div class="empty">Nu sunt întrebări pentru pagina selectată.</div>';
  renderPagers();
}

function renderPagers() {
  const size = getBatchSize();
  const startNo = currentPage * size + 1;
  const endNo = Math.min((currentPage + 1) * size, sortedQuestions.length);
  const totalPages = getTotalPages();
  const html = `
    <button class="secondary" data-action="prevPage" ${currentPage === 0 ? 'disabled' : ''}>← Înapoi</button>
    <div class="pager-center">
      <span class="pager-range">Întrebările ${startNo}–${endNo}</span>
      <span class="pager-page">Pagina ${currentPage + 1} din ${totalPages}</span>
    </div>
    <button class="secondary" data-action="nextPage" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Următoarele →</button>
  `;
  pagerTopEl.innerHTML = html;
  pagerBottomEl.innerHTML = html;
}

function renderQuestionCard(q, index) {
  const hasOptions = Array.isArray(q.options) && q.options.length > 0;
  const inputType = q.type === 'CS' ? 'radio' : 'checkbox';
  const inputName = `q-${q.id}`;
  const visibleNo = currentPage * getBatchSize() + index + 1;

  if (!hasOptions) {
    return `
      <article class="question-card" data-id="${q.id}">
        <div class="question-head">
          <h2 class="question-title">${visibleNo}. ${escapeHtml(q.question)}</h2>
          <span class="badge">${escapeHtml(getQuestionLabel(q))}</span>
        </div>
        <div class="card-actions">
          <button class="check-btn" data-action="showAnswer">Afișează răspunsul</button>
        </div>
        <div class="feedback" aria-live="polite"></div>
      </article>
    `;
  }

  return `
    <article class="question-card" data-id="${q.id}">
      <div class="question-head">
        <h2 class="question-title">${visibleNo}. ${escapeHtml(q.question)}</h2>
        <span class="badge">${escapeHtml(getQuestionLabel(q))}</span>
      </div>
      <div class="options">
        ${q.options.map(opt => `
          <label class="option" data-letter="${escapeHtml(opt.letter)}">
            <input type="${inputType}" name="${inputName}" value="${escapeHtml(opt.letter)}" />
            <span class="letter">${escapeHtml(String(opt.letter).toUpperCase())})</span>
            <span>${escapeHtml(opt.text)}</span>
          </label>
        `).join('')}
      </div>
      <div class="card-actions">
        <button class="check-btn" data-action="check">Verifică întrebarea</button>
        <button class="clear-btn" data-action="clear">Curăță selecția</button>
      </div>
      <div class="feedback" aria-live="polite"></div>
    </article>
  `;
}

function selectedLetters(card) {
  return [...card.querySelectorAll('input:checked')].map(input => input.value);
}

function arraysEqualAsSets(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every(x => setB.has(x));
}

function findQuestionByCard(card) {
  const id = Number(card.dataset.id);
  return sortedQuestions.find(item => Number(item.id) === id);
}

function checkQuestion(card) {
  const q = findQuestionByCard(card);
  if (!q) return;
  const correct = q.options.filter(o => o.correct).map(o => o.letter);
  const selected = selectedLetters(card);
  const isPerfect = arraysEqualAsSets(selected, correct);

  card.querySelectorAll('.option').forEach(optionEl => {
    const letter = optionEl.dataset.letter;
    const input = optionEl.querySelector('input');
    optionEl.classList.remove('correct', 'wrong', 'missed');

    if (correct.includes(letter)) optionEl.classList.add('correct');
    if (input.checked && !correct.includes(letter)) optionEl.classList.add('wrong');
    if (!input.checked && correct.includes(letter)) optionEl.classList.add('missed');
  });

  const feedback = card.querySelector('.feedback');
  feedback.className = `feedback show ${isPerfect ? 'good' : 'bad'}`;
  feedback.innerHTML = `<strong>${isPerfect ? 'Răspuns complet corect.' : 'Mai verifică variantele marcate.'}</strong><br>${escapeHtml(q.explanation || buildDefaultExplanation(q))}`;
  checkedState.set(Number(q.id), isPerfect);
  updateScore();
}

function buildDefaultExplanation(q) {
  const correct = (q.options || []).filter(o => o.correct).map(o => String(o.letter).toLowerCase());
  if (!correct.length) return 'Nu este setată nicio variantă corectă în questions.txt.';
  if (q.type === 'CS') return `Corectă este varianta ${correct.join(', ')}.`;
  return `Corecte sunt variantele ${correct.join(', ')}.`;
}

function showAnswer(card) {
  const q = findQuestionByCard(card);
  if (!q) return;
  const feedback = card.querySelector('.feedback');
  feedback.className = 'feedback show good';
  feedback.innerHTML = `<strong>Răspuns:</strong><br>${escapeHtml(q.answer || q.explanation || buildDefaultExplanation(q))}`;
  checkedState.set(Number(q.id), true);
  updateScore();
}

function clearQuestion(card) {
  card.querySelectorAll('input').forEach(input => input.checked = false);
  card.querySelectorAll('.option').forEach(option => option.classList.remove('correct', 'wrong', 'missed'));
  const feedback = card.querySelector('.feedback');
  feedback.className = 'feedback';
  feedback.textContent = '';
  checkedState.delete(Number(card.dataset.id));
  updateScore();
}

function updateScore() {
  const values = [...checkedState.values()];
  const correct = values.filter(Boolean).length;
  answeredCountEl.textContent = values.length;
  correctCountEl.textContent = correct;
  wrongCountEl.textContent = values.length - correct;
}

function startQuiz() {
  currentPage = 0;
  renderQuiz();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToPage(page) {
  currentPage = Math.min(Math.max(page, 0), getTotalPages() - 1);
  renderQuiz();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handlePageButton(event) {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.action === 'prevPage') goToPage(currentPage - 1);
  if (button.dataset.action === 'nextPage') goToPage(currentPage + 1);
}

pagerTopEl.addEventListener('click', handlePageButton);
pagerBottomEl.addEventListener('click', handlePageButton);

quizEl.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;

  const card = event.target.closest('.question-card');
  if (!card) return;
  if (button.dataset.action === 'check') checkQuestion(card);
  if (button.dataset.action === 'clear') clearQuestion(card);
  if (button.dataset.action === 'showAnswer') showAnswer(card);
});

startBtn.addEventListener('click', startQuiz);
countEl.addEventListener('change', startQuiz);
resetBtn.addEventListener('click', () => document.querySelectorAll('.question-card').forEach(clearQuestion));
chooseQuizBtn.addEventListener('click', showModal);
loadSelectedQuizBtn.addEventListener('click', loadSelectedQuiz);
manualTxtInput.addEventListener('change', event => addTxtFilesFromFileList(event.target.files));

applyQuizMeta();
renderQuiz();
showModal();
