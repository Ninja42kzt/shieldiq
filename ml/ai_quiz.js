const https = require('https');

const MODULE_TOPICS = {
    phishing: {
        title: 'Phishing Awareness',
        context: 'email phishing, MPESA fraud, WhatsApp scams, CEO fraud, fake Safaricom/KCB/Equity messages, suspicious links, spoofed domains'
    },
    passwords: {
        title: 'Password Security',
        context: 'strong passwords, password managers, two-factor authentication, brute force attacks, credential stuffing, reusing passwords'
    },
    social: {
        title: 'Social Engineering',
        context: 'pretexting, baiting, tailgating, impersonation, vishing (voice phishing), manipulation tactics, trust exploitation'
    },
    devices: {
        title: 'Device Security',
        context: 'screen locks, software updates, USB threats, public WiFi risks, MDM, lost/stolen devices, Bluetooth security'
    },
    data: {
        title: 'Data Protection',
        context: 'GDPR/Kenya Data Protection Act, sensitive data handling, encryption, data classification, secure deletion, cloud storage risks'
    },
    incident: {
        title: 'Incident Response',
        context: 'reporting incidents, containment steps, ransomware response, breach notification, business continuity, evidence preservation'
    }
};

// Fetch latest threats from CISA RSS feed
async function fetchCISAThreats() {
    return new Promise((resolve) => {
        const options = {
            hostname: 'www.cisa.gov',
            path: '/sites/default/files/feeds/known_exploited_vulnerabilities.json',
            method: 'GET',
            headers: { 'User-Agent': 'ShieldIQ/1.0' }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    // Get 5 most recent vulnerabilities
                    const recent = (data.vulnerabilities || [])
                        .slice(0, 5)
                        .map(v => `${v.vendorProject} ${v.product}: ${v.shortDescription}`)
                        .join('; ');
                    resolve(recent || '');
                } catch {
                    resolve('');
                }
            });
        });

        req.on('error', () => resolve(''));
        req.setTimeout(5000, () => { req.destroy(); resolve(''); });
        req.end();
    });
}

// Call Groq API
async function callGroq(prompt) {
    const data = JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
            {
                role: 'system',
                content: `You are a cybersecurity trainer creating quiz questions for East African business employees. 
Always create practical, real-world scenarios relevant to Kenya and East Africa (mention MPESA, Safaricom, KCB, Equity Bank, M-Pesa, etc. where relevant).
Respond ONLY with a valid JSON array. No explanation, no markdown, no code blocks. Just the raw JSON array.`
            },
            { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
    });

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (parsed.error) return reject(new Error(parsed.error.message));
                    const content = parsed.choices?.[0]?.message?.content || '[]';
                    // Strip any accidental markdown fences
                    const clean = content.replace(/```json|```/g, '').trim();
                    resolve(JSON.parse(clean));
                } catch (err) {
                    reject(new Error(`Groq parse error: ${err.message}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Groq timeout')); });
        req.write(data);
        req.end();
    });
}

// Generate questions for a module
async function generateQuestions(module, count = 5) {
    const topic = MODULE_TOPICS[module];
    if (!topic) throw new Error(`Unknown module: ${module}`);

    // Fetch live threat context
    const threats = await fetchCISAThreats();
    const threatContext = threats
        ? `\nRecent real-world threats for context (use these to inspire realistic scenarios): ${threats}`
        : '';

    const prompt = `Generate exactly ${count} multiple-choice cybersecurity quiz questions about: ${topic.title}
Topics to cover: ${topic.context}${threatContext}

Rules:
- Each question must have exactly 4 options
- "correct" is the index (0-3) of the correct answer
- Questions should be practical scenarios, not theory
- Make them relevant to East African/Kenyan business context where possible
- Explanations should be educational and clear
- Vary difficulty from easy to medium

Return ONLY this JSON array format:
[
  {
    "question": "scenario-based question here",
    "options": ["option A", "option B", "option C", "option D"],
    "correct": 1,
    "explanation": "why this answer is correct"
  }
]`;

    const questions = await callGroq(prompt);

    // Validate structure
    if (!Array.isArray(questions)) throw new Error('Invalid response format from AI');

    return questions
        .filter(q =>
            q.question &&
            Array.isArray(q.options) &&
            q.options.length === 4 &&
            typeof q.correct === 'number' &&
            q.explanation
        )
        .slice(0, count);
}

module.exports = { generateQuestions, MODULE_TOPICS };
