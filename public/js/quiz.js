const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

// User info
const userData = JSON.parse(localStorage.getItem('user') || '{}');
if (userData.name) {
    document.getElementById('user-name').textContent = userData.name;
    document.getElementById('user-company').textContent = userData.company || '';
    document.getElementById('user-avatar').textContent = userData.name[0].toUpperCase();
}

// Module config
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

// State
let currentModule = null;
let questions = [];
let currentIndex = 0;
let score = 0;
let weakAreas = [];
let answered = false;

// Read module from URL param
const params = new URLSearchParams(window.location.search);
const catParam = params.get('cat');
if (catParam && moduleConfig[catParam]) {
    currentModule = catParam;
    const cfg = moduleConfig[catParam];
    document.getElementById('intro-icon').textContent = cfg.icon;
    document.getElementById('intro-title').textContent = cfg.title;
    document.getElementById('intro-desc').textContent = descriptions[catParam];
    document.getElementById('intro-count').textContent = cfg.count;
    document.getElementById('intro-diff').textContent = cfg.difficulty;
} else {
    currentModule = 'phishing';
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

    currentIndex = 0;
    score = 0;
    weakAreas = [];
    showQuestion();
}

function showQuestion() {
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
    if (pct >= 80) {
        aiText.textContent = 'Great job! You have a strong understanding of this topic. Try a more advanced module next.';
    } else if (pct >= 60) {
        aiText.textContent = 'Good attempt! Review the questions you missed and retake to reinforce your knowledge.';
    } else {
        aiText.textContent = 'This topic needs more attention. Review the explanations and retake the quiz to improve.';
    }

    try {
        await fetch('/api/quiz/result', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
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

function retakeQuiz() {
    document.getElementById('results-screen').style.display = 'none';
    document.getElementById('intro-screen').style.display = 'block';
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}