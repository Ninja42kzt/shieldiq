const https = require('https');

const MODULE_TOPICS = {
    phishing: {
        title: 'Phishing Awareness',
        context: 'email phishing, MPESA fraud, WhatsApp scams, CEO fraud, fake Safaricom/KCB/Equity messages, suspicious links, spoofed domains',
        subtopics: ['Identifying Spoofed Emails', 'MPESA Fraud', 'Suspicious Links', 'CEO Fraud', 'Fake Bank Messages', 'WhatsApp Scams']
    },
    passwords: {
        title: 'Password Security',
        context: 'strong passwords, password managers, two-factor authentication, brute force attacks, credential stuffing, reusing passwords',
        subtopics: ['Strong Password Creation', 'Password Managers', '2FA/MFA', 'Brute Force Attacks', 'Credential Stuffing', 'Password Reuse']
    },
    social: {
        title: 'Social Engineering',
        context: 'pretexting, baiting, tailgating, impersonation, vishing (voice phishing), manipulation tactics, trust exploitation',
        subtopics: ['Pretexting', 'Baiting', 'Tailgating', 'Impersonation', 'Vishing', 'Manipulation Tactics']
    },
    devices: {
        title: 'Device Security',
        context: 'screen locks, software updates, USB threats, public WiFi risks, MDM, lost/stolen devices, Bluetooth security',
        subtopics: ['Screen Locks', 'Software Updates', 'USB Threats', 'Public WiFi', 'Lost Devices', 'Bluetooth Security']
    },
    data: {
        title: 'Data Protection',
        context: 'GDPR/Kenya Data Protection Act, sensitive data handling, encryption, data classification, secure deletion, cloud storage risks',
        subtopics: ['Kenya Data Protection Act', 'Data Classification', 'Encryption', 'Secure Deletion', 'Cloud Storage', 'Data Sharing']
    },
    incident: {
        title: 'Incident Response',
        context: 'reporting incidents, containment steps, ransomware response, breach notification, business continuity, evidence preservation',
        subtopics: ['Incident Reporting', 'Containment', 'Ransomware Response', 'Breach Notification', 'Evidence Preservation', 'Business Continuity']
    }
};

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
                    const recent = (data.vulnerabilities || [])
                        .slice(0, 5)
                        .map(v => `${v.vendorProject} ${v.product}: ${v.shortDescription}`)
                        .join('; ');
                    resolve(recent || '');
                } catch { resolve(''); }
            });
        });
        req.on('error', () => resolve(''));
        req.setTimeout(5000, () => { req.destroy(); resolve(''); });
        req.end();
    });
}

async function callGroq(prompt) {
    const data = JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
            {
                role: 'system',
                content: `You are a cybersecurity trainer creating quiz questions for East African business employees.
Always create practical, real-world scenarios relevant to Kenya and East Africa (mention MPESA, Safaricom, KCB, Equity Bank where relevant).
Respond ONLY with a valid JSON array. No explanation, no markdown, no code blocks. Just the raw JSON array.`
            },
            { role: 'user', content: prompt }
        ],
        temperature: 0.9,
        max_tokens: 6000
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

async function generateQuestions(module, count = 5, weakAreas = []) {
    const topic = MODULE_TOPICS[module];
    if (!topic) throw new Error(`Unknown module: ${module}`);

    const threats = await fetchCISAThreats();
    const threatContext = threats ? `\nRecent real-world threats for context: ${threats}` : '';

    const weakAreaContext = weakAreas.length > 0
        ? `\nIMPORTANT: The user has struggled with: ${weakAreas.join(', ')}. Focus at least half the questions on these weak areas.`
        : '';

    const prompt = `Generate exactly ${count} multiple-choice cybersecurity quiz questions about: ${topic.title}
Topics to cover: ${topic.context}${threatContext}${weakAreaContext}

STRICT RULES:
- Each question MUST have exactly 4 answer options
- The 4 options must be CLEARLY DIFFERENT — no two options should be similar or overlap
- Never use "All of the above" or "None of the above"
- "correct" is the index (0-3) of the correct answer
- "topic" must be one of: ${topic.subtopics.join(', ')}
- Questions must be practical real-world scenarios, not theory
- Make scenarios relevant to Kenya/East Africa where possible
- "explanation" must be a DETAILED teaching paragraph (3-4 sentences) that:
  1. Explains WHY the correct answer is right
  2. Explains WHY the wrong options are incorrect
  3. Teaches the user what to do in this situation in real life
- Vary difficulty: mix easy, medium and hard questions
- Make each question completely unique

Return ONLY this JSON array:
[
  {
    "question": "real-world scenario question",
    "options": ["clearly different option A", "clearly different option B", "clearly different option C", "clearly different option D"],
    "correct": 2,
    "topic": "specific subtopic from the list above",
    "explanation": "Detailed 3-4 sentence teaching explanation covering why the correct answer is right, why others are wrong, and real-life guidance."
  }
]`;

    const questions = await callGroq(prompt);
    if (!Array.isArray(questions)) throw new Error('Invalid response format from AI');

    return questions
        .filter(q =>
            q.question &&
            Array.isArray(q.options) &&
            q.options.length === 4 &&
            typeof q.correct === 'number' &&
            q.explanation &&
            q.topic
        )
        .slice(0, count);
}

async function generateTrainingContent(module, weakAreas) {
    const topic = MODULE_TOPICS[module];
    if (!topic) throw new Error(`Unknown module: ${module}`);

    const prompt = `A cybersecurity trainee just failed quiz questions on these topics: ${weakAreas.join(', ')}
Module: ${topic.title}

Create a short, practical training lesson to teach them these concepts. Format as JSON:
{
  "lessons": [
    {
      "topic": "topic name",
      "title": "lesson title",
      "content": "2-3 paragraph explanation with real East African examples",
      "tips": ["practical tip 1", "practical tip 2", "practical tip 3"],
      "redFlag": "one key warning sign to watch out for"
    }
  ]
}

Make it conversational, practical, and relevant to Kenya/East Africa. Return ONLY valid JSON.`;

    const data = JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
            { role: 'system', content: 'You are a cybersecurity trainer. Return only valid JSON, no markdown.' },
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
                    const raw = parsed.choices?.[0]?.message?.content || '{}';
                    const clean = raw.replace(/```json|```/g, '').trim();
                    resolve(JSON.parse(clean));
                } catch (err) {
                    reject(new Error(`Training content parse error: ${err.message}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(data);
        req.end();
    });
}

module.exports = { generateQuestions, generateTrainingContent, MODULE_TOPICS };
