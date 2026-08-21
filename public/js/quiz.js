const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const userData = JSON.parse(localStorage.getItem('user') || '{}');
if (userData.name) {
    document.getElementById('user-name').textContent = userData.name;
    document.getElementById('user-company').textContent = userData.company || '';
    document.getElementById('user-avatar').textContent = userData.name[0].toUpperCase();
}

// Plan gating
const plan = userData.plan || 'free';
const isPremium = ['business_trial', 'business', 'enterprise_trial', 'enterprise'].includes(plan);
const premiumModules = ['devices', 'data', 'incident'];

const moduleConfig = {
    phishing:  { title: 'Phishing Awareness',  icon: '🎣', difficulty: 'Beginner',     count: 10 },
    passwords: { title: 'Password Security',    icon: '🔑', difficulty: 'Beginner',     count: 8  },
    social:    { title: 'Social Engineering',   icon: '🧠', difficulty: 'Intermediate', count: 12 },
    devices:   { title: 'Device Security',      icon: '💻', difficulty: 'Intermediate', count: 10 },
    data:      { title: 'Data Protection',      icon: '🗄️', difficulty: 'Advanced',     count: 15 },
    incident:  { title: 'Incident Response',    icon: '🚨', difficulty: 'Advanced',     count: 12 }
};

const descriptions = {
    phishing:  'Learn to identify phishing emails and MPESA scams',
    passwords: 'Best practices for creating and managing passwords',
    social:    'Recognize manipulation tactics used by attackers',
    devices:   'Keeping your work devices and data safe',
    data:      'Handling sensitive company and customer data',
    incident:  'What to do when a security incident occurs'
};

let currentModule = null;
let questions = [];
let currentIndex = 0;
let score = 0;
let weakAreas = [];
let answered = false;

const params = new URLSearchParams(window.location.search);
const catParam = params.get('cat');

if (catParam && premiumModules.includes(catParam) && !isPremium) {
    document.getElementById('intro-screen').innerHTML = `
        <div class="quiz-intro">
            <div class="quiz-intro-icon">🔒</div>
            <h1>Premium Module</h1>
            <p>This module is available on Business and Enterprise plans.</p>
            <a href="/pricing" class="btn-primary large" style="display:inline-block;margin-top:16px">Upgrade to Unlock →</a>
            <a href="/dashboard" class="back-link">← Back to Dashboard</a>
        </div>
    `;
} else if (catParam && moduleConfig[catParam]) {
    currentModule = catParam;
    const cfg = moduleConfig[catParam];
    document.getElementById('intro-icon').textContent = cfg.icon;
    document.getElementById('intro-title').textContent = cfg.title;
    document.getElementById('intro-desc').textContent = descriptions[catParam];
    document.getElementById('intro-count').textContent = cfg.count;
    document.getElementById('intro-diff').textContent = cfg.difficulty;
} else {
    currentModule = 'phishing';
    const cfg = moduleConfig['phishing'];
    document.getElementById('intro-icon').textContent = cfg.icon;
    document.getElementById('intro-title').textContent = cfg.title;
    document.getElementById('intro-desc').textContent = descriptions['phishing'];
    document.getElementById('intro-count').textContent = cfg.count;
    document.getElementById('intro-diff').textContent = cfg.difficulty;
}

function shuffleQuestions(qs) {
    return qs.sort(() => Math.random() - 0.5).map(q => {
        const opts = q.options || q.choices || [];
        const correctText = opts[q.correct ?? q.correctIndex ?? q.answer];
        const shuffled = [...opts].sort(() => Math.random() - 0.5);
        return { ...q, options: shuffled, correct: shuffled.indexOf(correctText) };
    });
}

async function startQuiz() {
    document.getElementById('intro-screen').style.display = 'none';
    document.getElementById('quiz-screen').style.display = 'block';

    const cfg = moduleConfig[currentModule];
    document.getElementById('category-label').textContent = cfg.title;

    try {
        const res = await fetch(`/api/quiz/ai-questions/${currentModule}?count=${cfg.count}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            questions = shuffleQuestions(data.questions);
        } else {
            throw new Error('AI unavailable');
        }
    } catch (e) {
        console.warn('Falling back to local questions:', e.message);
        if (typeof questionBank !== 'undefined' && questionBank[currentModule]) {
            questions = shuffleQuestions(questionBank[currentModule].questions);
        } else {
            alert('Could not load questions. Please try again.');
            window.location.href = '/dashboard';
            return;
        }
    }

    // Check for saved progress
    const saved = JSON.parse(localStorage.getItem(`quiz_progress_${currentModule}`) || 'null');
    if (saved && saved.questions && saved.currentIndex > 0) {
        questions = saved.questions;
        currentIndex = saved.currentIndex;
        score = saved.score;
        weakAreas = saved.weakAreas || [];
    } else {
        currentIndex = 0;
        score = 0;
        weakAreas = [];
    }
    showQuestion();
}

function showQuestion() {
    // Save progress
    localStorage.setItem(`quiz_progress_${currentModule}`, JSON.stringify({
        questions, currentIndex, score, weakAreas
    }));
    answered = false;
    const q = questions[currentIndex];
    const total = questions.length;

    document.getElementById('question-counter').textContent = `Question ${currentIndex + 1} of ${total}`;
    document.getElementById('q-number').textContent = String(currentIndex + 1).padStart(2, '0');
    document.getElementById('question-text').textContent = q.question;
    document.getElementById('progress-fill').style.width = `${(currentIndex / total) * 100}%`;
    document.getElementById('feedback').style.display = 'none';
    document.getElementById('next-btn').style.display = 'none';

    const grid = document.getElementById('options-grid');
    grid.innerHTML = '';
    const opts = q.options || q.choices || [];
    opts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;
        btn.onclick = () => selectAnswer(i, btn);
        grid.appendChild(btn);
    });
}

function selectAnswer(index, btn) {
    if (answered) return;
    answered = true;

    const q = questions[currentIndex];
    const correct = q.correct ?? q.correctIndex ?? q.answer;
    const isCorrect = index === correct;

    const allBtns = document.querySelectorAll('.option-btn');
    allBtns.forEach((b, i) => {
        b.disabled = true;
        if (i === correct) b.classList.add('correct');
        else if (i === index && !isCorrect) b.classList.add('wrong');
    });

    if (isCorrect) {
        score++;
    } else {
        weakAreas.push(q.topic || q.category || currentModule);
    }

    const feedback = document.getElementById('feedback');
    feedback.style.display = 'flex';
    feedback.className = `feedback ${isCorrect ? 'correct' : 'wrong'}`;
    document.getElementById('feedback-icon').textContent = isCorrect ? '✅' : '❌';
    document.getElementById('feedback-title').textContent = isCorrect ? 'Correct!' : 'Incorrect';
    document.getElementById('feedback-explanation').textContent = q.explanation || '';

    const nextBtn = document.getElementById('next-btn');
    nextBtn.style.display = 'block';
    nextBtn.textContent = currentIndex + 1 >= questions.length ? 'See Results →' : 'Next Question →';
}

function nextQuestion() {
    currentIndex++;
    if (currentIndex >= questions.length) {
        showResults();
    } else {
        showQuestion();
    }
}

async function showResults() {
    localStorage.removeItem(`quiz_progress_${currentModule}`);
    document.getElementById('quiz-screen').style.display = 'none';
    document.getElementById('results-screen').style.display = 'block';

    const total = questions.length;
    const pct = Math.round((score / total) * 100);

    document.getElementById('final-score').textContent = score;
    document.getElementById('results-screen').querySelector('.score-label').textContent = `/ ${total}`;
    document.getElementById('score-percentage').textContent = `${pct}%`;

    let icon = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '📚';
    let title = pct >= 80 ? 'Excellent Work!' : pct >= 60 ? 'Good Effort!' : 'Keep Practicing!';
    document.getElementById('results-icon').textContent = icon;
    document.getElementById('results-title').textContent = title;

    const aiText = document.getElementById('ai-text');
    const uniqueWeak = [...new Set(weakAreas)];

    if (pct >= 80) {
        aiText.textContent = 'Great job! You have a strong understanding of this topic. Try a more advanced module next.';
    } else if (pct >= 60) {
        aiText.textContent = 'Good attempt! Review the questions you missed and retake to reinforce your knowledge.';
    } else {
        aiText.textContent = 'This topic needs more attention. Review the explanations and retake the quiz to improve.';
    }

    // Show weak areas and training button
    const breakdown = document.getElementById('results-breakdown');
    if (uniqueWeak.length > 0 && breakdown) {
        breakdown.innerHTML = `
            <div style="background:rgba(255,107,107,0.1);border:1px solid rgba(255,107,107,0.3);border-radius:12px;padding:20px;margin:16px 0;text-align:left">
                <h3 style="color:#ff6b6b;margin-bottom:12px">⚠️ Weak Areas Identified</h3>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
                    ${uniqueWeak.map(w => `<span style="background:rgba(255,107,107,0.2);color:#ff6b6b;padding:4px 12px;border-radius:20px;font-size:13px">${w}</span>`).join('')}
                </div>
                <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Don't worry — ShieldIQ will generate a personalised training lesson to help you improve on these topics.</p>
                <button onclick="startTraining()" style="background:#00D4FF;color:#000;border:none;padding:12px 24px;border-radius:8px;font-weight:700;cursor:pointer;width:100%">
                    📚 Start Training on Weak Areas →
                </button>
            </div>
        `;
        // Save weak areas for training page
        localStorage.setItem('training_weak_areas', JSON.stringify(uniqueWeak));
        localStorage.setItem('training_module', currentModule);
    }

    try {
        await fetch('/api/quiz/result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                category: currentModule,
                score: pct,
                total,
                correct: score,
                weakAreas: [...new Set(weakAreas)]
            })
        });
    } catch (e) {
        console.error('Could not save result:', e.message);
    }
}

function startTraining() {
    window.location.href = `/training?module=${currentModule}`;
}

function retakeQuiz() {
    document.getElementById('results-screen').style.display = 'none';
    document.getElementById('intro-screen').style.display = 'block';
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}