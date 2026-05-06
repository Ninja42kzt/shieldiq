const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const userData = JSON.parse(localStorage.getItem('user') || '{}');
document.getElementById('user-name').textContent = userData.name || 'User';
document.getElementById('user-company').textContent = userData.company || 'Company';
document.getElementById('user-avatar').textContent = (userData.name || 'U')[0].toUpperCase();

const params = new URLSearchParams(window.location.search);
const category = params.get('cat') || 'phishing';
const categoryData = questionBank[category];

let currentQuestion = 0;
let score = 0;
let answers = [];
let questions = [];
let weakAreas = []; // ← fixed: track missed questions

function initIntro() {
    if (!categoryData) { window.location.href = '/dashboard'; return; }
    document.getElementById('intro-icon').textContent = categoryData.icon;
    document.getElementById('intro-title').textContent = categoryData.title;
    document.getElementById('intro-count').textContent = categoryData.questions.length;
    document.getElementById('intro-diff').textContent = categoryData.difficulty;
    document.getElementById('category-label').textContent = categoryData.title;
    document.getElementById('question-counter').textContent = `Question 1 of ${categoryData.questions.length}`;
}

function startQuiz() {
    questions = [...categoryData.questions];
    weakAreas = [];
    document.getElementById('intro-screen').style.display = 'none';
    document.getElementById('quiz-screen').style.display = 'block';
    loadQuestion();
}

function loadQuestion() {
    const q = questions[currentQuestion];
    const total = questions.length;
    const progress = (currentQuestion / total) * 100;
    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('question-counter').textContent = `Question ${currentQuestion + 1} of ${total}`;
    document.getElementById('q-number').textContent = String(currentQuestion + 1).padStart(2, '0');
    document.getElementById('question-text').textContent = q.question;
    document.getElementById('feedback').style.display = 'none';
    document.getElementById('next-btn').style.display = 'none';

    const grid = document.getElementById('options-grid');
    grid.innerHTML = '';
    q.options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = option;
        btn.onclick = () => selectAnswer(index, btn);
        grid.appendChild(btn);
    });
}

function selectAnswer(selectedIndex, btn) {
    const q = questions[currentQuestion];
    const allBtns = document.querySelectorAll('.option-btn');
    const isCorrect = selectedIndex === q.correct;

    allBtns.forEach(b => { b.classList.add('disabled'); b.onclick = null; });
    allBtns[q.correct].classList.add('correct');
    if (!isCorrect) {
        btn.classList.add('wrong');
        // Track weak area: use question topic or the question itself (trimmed)
        const weakLabel = q.topic || q.question.substring(0, 60);
        weakAreas.push(weakLabel);
    }

    answers.push({ question: q.question, correct: isCorrect, category });
    if (isCorrect) score++;

    const feedback = document.getElementById('feedback');
    feedback.className = 'feedback ' + (isCorrect ? 'correct-feedback' : 'wrong-feedback');
    document.getElementById('feedback-icon').textContent = isCorrect ? '✅' : '❌';
    document.getElementById('feedback-title').textContent = isCorrect ? 'Correct!' : 'Incorrect';
    document.getElementById('feedback-explanation').textContent = q.explanation;
    feedback.style.display = 'flex';

    const nextBtn = document.getElementById('next-btn');
    nextBtn.style.display = 'block';
    nextBtn.textContent = currentQuestion + 1 < questions.length ? 'Next Question →' : 'See Results →';
}

function nextQuestion() {
    currentQuestion++;
    if (currentQuestion < questions.length) {
        loadQuestion();
    } else {
        showResults();
    }
}

function showResults() {
    document.getElementById('quiz-screen').style.display = 'none';
    document.getElementById('results-screen').style.display = 'flex';

    const total = questions.length;
    const percentage = Math.round((score / total) * 100);

    document.getElementById('final-score').textContent = score;
    document.getElementById('score-percentage').textContent = percentage + '%';

    let icon, title;
    if (percentage >= 80) { icon = '🏆'; title = 'Excellent Work!'; }
    else if (percentage >= 60) { icon = '👍'; title = 'Good Job!'; }
    else { icon = '📚'; title = 'Keep Learning!'; }
    document.getElementById('results-icon').textContent = icon;
    document.getElementById('results-title').textContent = title;

    let aiText;
    if (percentage >= 80) {
        aiText = `Great performance on ${categoryData.title}! Our AI suggests moving to a more advanced module to continue building your skills.`;
    } else if (percentage >= 60) {
        aiText = `Good effort on ${categoryData.title}. Our AI has identified some weak areas — reviewing the questions you missed will strengthen your understanding.`;
    } else {
        aiText = `Our AI recommends revisiting ${categoryData.title} fundamentals. Focus on the questions you missed and retake the quiz to improve your score.`;
    }
    document.getElementById('ai-text').textContent = aiText;

    document.getElementById('results-breakdown').innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:12px">
            <span style="color:var(--text-muted)">Module</span>
            <span style="color:var(--text-muted)">Score</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center">
            <span>${categoryData.icon} ${categoryData.title}</span>
            <span style="color:${percentage >= 60 ? '#34c759' : '#ff6b6b'}; font-weight:700">${score}/${total} (${percentage}%)</span>
        </div>
        ${weakAreas.length > 0 ? `
        <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--glass-border)">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px">AREAS TO REVIEW</div>
            ${weakAreas.slice(0,3).map(a => `<div style="font-size:13px; color:#ff9f0a; margin-bottom:4px">⚠ ${a}</div>`).join('')}
        </div>` : ''}
    `;

    saveResult(percentage);
}

async function saveResult(percentage) {
    try {
        await fetch('/api/quiz/result', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                category,
                score: percentage,
                total: questions.length,
                correct: score,
                weakAreas: weakAreas // ← now sent to backend
            })
        });
    } catch (err) {
        console.error('Could not save result:', err);
    }
}

function retakeQuiz() {
    currentQuestion = 0;
    score = 0;
    answers = [];
    weakAreas = [];
    document.getElementById('results-screen').style.display = 'none';
    document.getElementById('quiz-screen').style.display = 'block';
    loadQuestion();
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

initIntro();