const questionBank = {
    phishing: {
        title: "Phishing Awareness",
        icon: "🎣",
        difficulty: "Beginner",
        questions: [
            {
                question: "You receive an email from 'Safaricom' asking you to click a link to verify your MPESA account or it will be suspended. What should you do?",
                options: [
                    "Click the link immediately to avoid suspension",
                    "Call the official Safaricom line to verify before doing anything",
                    "Reply to the email with your account details",
                    "Forward it to your colleagues to warn them"
                ],
                correct: 1,
                explanation: "Always verify through official channels. Legitimate companies never threaten account suspension via email links."
            },
            {
                question: "Which of these email addresses is most likely a phishing attempt pretending to be your bank?",
                options: [
                    "support@kcbgroup.com",
                    "security@kcb-alerts-kenya.net",
                    "noreply@kcbgroup.com",
                    "info@kcbgroup.com"
                ],
                correct: 1,
                explanation: "The domain 'kcb-alerts-kenya.net' is not KCB's official domain. Attackers use similar-looking domains to trick victims."
            },
            {
                question: "An email claims you've won a prize and asks for your ID number and phone number to claim it. What is this?",
                options: [
                    "A legitimate promotion",
                    "A phishing/social engineering attack",
                    "A government notification",
                    "A bank offer"
                ],
                correct: 1,
                explanation: "This is a classic phishing tactic. Legitimate competitions don't ask for sensitive personal information via email."
            },
            {
                question: "What is the safest way to visit your bank's website?",
                options: [
                    "Click the link in an email from your bank",
                    "Search on Google and click the first result",
                    "Type the official URL directly in the browser",
                    "Use a link shared by a colleague on WhatsApp"
                ],
                correct: 2,
                explanation: "Always type the URL directly. Search results and links can lead to fake sites designed to steal your credentials."
            },
            {
                question: "You get an urgent WhatsApp message from your 'CEO' asking you to buy gift cards and send the codes. What do you do?",
                options: [
                    "Buy the cards immediately since it's urgent",
                    "Call your CEO directly on their known number to verify",
                    "Send the request to finance department",
                    "Reply on WhatsApp asking for more details"
                ],
                correct: 1,
                explanation: "This is CEO fraud — a common social engineering attack. Always verify unusual requests through a separate, trusted channel."
            },
            {
                question: "A website's URL starts with 'http://' instead of 'https://'. What does this mean?",
                options: [
                    "The site is more modern",
                    "The connection is not encrypted and data can be intercepted",
                    "The site loads faster",
                    "Nothing significant"
                ],
                correct: 1,
                explanation: "HTTPS means the connection is encrypted. HTTP sites transmit data in plain text which attackers can intercept."
            },
            {
                question: "You receive an email with an attachment called 'Salary_Review_2026.exe'. What should you do?",
                options: [
                    "Open it — it could be your salary review",
                    "Never open .exe files from email — report it to IT",
                    "Open it only if you know the sender",
                    "Save it and open later"
                ],
                correct: 1,
                explanation: ".exe files are executable programs. Opening unknown executables can install malware on your device."
            },
            {
                question: "Which sign indicates an email might be a phishing attempt?",
                options: [
                    "The email uses your full name",
                    "Urgent language threatening consequences if you don't act immediately",
                    "The email has the company logo",
                    "The email was sent during business hours"
                ],
                correct: 1,
                explanation: "Urgency and fear are key phishing tactics used to make victims act without thinking. Legitimate organizations give you time."
            },
            {
                question: "Your colleague shares a link via email to a 'shared document'. The URL looks strange. What do you do?",
                options: [
                    "Click it since it's from a colleague",
                    "Call or message your colleague directly to confirm they sent it",
                    "Open it in incognito mode",
                    "Forward it to your manager"
                ],
                correct: 1,
                explanation: "Colleague accounts can be compromised. Always verify unusual links through a separate communication channel."
            },
            {
                question: "What is spear phishing?",
                options: [
                    "Phishing that targets many random people",
                    "Targeted phishing using personal information about the victim",
                    "Phishing via SMS only",
                    "Phishing using fake websites"
                ],
                correct: 1,
                explanation: "Spear phishing is highly targeted, using personal details to make attacks more convincing. It's more dangerous than generic phishing."
            }
        ]
    },
    passwords: {
        title: "Password Security",
        icon: "🔑",
        difficulty: "Beginner",
        questions: [
            {
                question: "Which of these is the strongest password?",
                options: [
                    "Password123",
                    "John1990Nairobi",
                    "Tr@ff1c!L1ght$Blue42",
                    "qwerty12345"
                ],
                correct: 2,
                explanation: "Strong passwords combine uppercase, lowercase, numbers and symbols with no predictable patterns or personal info."
            },
            {
                question: "You use the same password for your email, bank and work accounts. Why is this dangerous?",
                options: [
                    "It's not dangerous — it's convenient",
                    "If one account is breached, all accounts are compromised",
                    "It makes passwords easier to guess",
                    "It slows down your computer"
                ],
                correct: 1,
                explanation: "Password reuse means one data breach can expose all your accounts. Use unique passwords for each account."
            },
            {
                question: "What is a password manager?",
                options: [
                    "A person who manages company passwords",
                    "A tool that securely stores and generates strong passwords",
                    "A feature that saves passwords in your browser only",
                    "A government password system"
                ],
                correct: 1,
                explanation: "Password managers like Bitwarden generate and store unique strong passwords for all your accounts securely."
            },
            {
                question: "How often should you change your password?",
                options: [
                    "Every week",
                    "Never — strong passwords don't need changing",
                    "When there's evidence of compromise or breach",
                    "Every day"
                ],
                correct: 2,
                explanation: "Modern guidance says change passwords when compromised, not on a fixed schedule. Frequent changes often lead to weaker passwords."
            },
            {
                question: "Someone calls claiming to be IT support and asks for your password to fix an issue. What do you do?",
                options: [
                    "Give it — they're IT support",
                    "Never share your password with anyone, including IT",
                    "Give only half the password",
                    "Change it after the call"
                ],
                correct: 1,
                explanation: "Legitimate IT staff never need your password. This is a social engineering attack called pretexting."
            },
            {
                question: "What is two-factor authentication (2FA)?",
                options: [
                    "Having two different passwords",
                    "A second verification step beyond your password",
                    "Logging in from two devices",
                    "Changing your password twice"
                ],
                correct: 1,
                explanation: "2FA adds a second layer — like an SMS code or authenticator app — making accounts much harder to breach even if passwords are stolen."
            },
            {
                question: "Your company requires a minimum 8 character password. You choose 'Nairobi1'. Is this sufficient?",
                options: [
                    "Yes — it meets the requirements",
                    "No — it meets length but uses predictable personal info",
                    "Yes — it has a number and capital letter",
                    "No — it needs more numbers"
                ],
                correct: 1,
                explanation: "Meeting minimum requirements doesn't mean secure. Predictable words like city names are easily guessed by attackers."
            },
            {
                question: "What should you do if you suspect your work account has been compromised?",
                options: [
                    "Wait and monitor",
                    "Change password and immediately report to IT security",
                    "Tell a colleague",
                    "Create a new account"
                ],
                correct: 1,
                explanation: "Immediate reporting and password change limits damage. Every minute of delay gives attackers more access."
            }
        ]
    },
    social: {
        title: "Social Engineering",
        icon: "🧠",
        difficulty: "Intermediate",
        questions: [
            {
                question: "What is social engineering in cybersecurity?",
                options: [
                    "Building social media platforms",
                    "Manipulating people psychologically to gain unauthorized access",
                    "Engineering better social networks",
                    "Hacking social media accounts"
                ],
                correct: 1,
                explanation: "Social engineering exploits human psychology rather than technical vulnerabilities. It's often the easiest attack vector."
            },
            {
                question: "A stranger tailgates you into the office building by walking closely behind you. This is called?",
                options: [
                    "Networking",
                    "Tailgating — a physical social engineering attack",
                    "Trespassing only",
                    "Normal office behavior"
                ],
                correct: 1,
                explanation: "Tailgating bypasses physical security. Always ensure visitors are properly signed in and don't let strangers follow you in."
            },
            {
                question: "Someone calls pretending to be from the tax authority demanding immediate payment or face arrest. This is?",
                options: [
                    "A legitimate government call",
                    "Vishing — voice phishing using fear and urgency",
                    "A courtesy reminder",
                    "An automated system"
                ],
                correct: 1,
                explanation: "Vishing uses phone calls. Government agencies communicate officially and never demand immediate payment under threat of arrest."
            },
            {
                question: "You find a USB drive in the office parking lot. What should you do?",
                options: [
                    "Plug it in to see what's on it",
                    "Take it to IT security without plugging it in",
                    "Keep it as it might be useful",
                    "Give it to a colleague"
                ],
                correct: 1,
                explanation: "USB baiting is a real attack. Dropped USB drives often contain malware that installs automatically when plugged in."
            },
            {
                question: "An attacker creates a fake scenario to extract information from you. This technique is called?",
                options: [
                    "Hacking",
                    "Pretexting",
                    "Phishing",
                    "Malware"
                ],
                correct: 1,
                explanation: "Pretexting involves creating a fabricated scenario — like pretending to be IT support — to manipulate victims into revealing information."
            },
            {
                question: "Why do attackers create urgency in their social engineering attacks?",
                options: [
                    "To save the victim's time",
                    "To prevent victims from thinking critically about the request",
                    "Because they are in a hurry",
                    "To seem more professional"
                ],
                correct: 1,
                explanation: "Urgency bypasses rational thinking. When people panic, they skip verification steps and make poor security decisions."
            },
            {
                question: "A new 'IT technician' visits your office and asks to access your computer. You should?",
                options: [
                    "Allow access — they're IT",
                    "Verify their identity with your IT department before granting access",
                    "Leave them to work",
                    "Give them your password"
                ],
                correct: 1,
                explanation: "Impersonation of IT staff is a common attack. Always verify credentials through official channels before granting system access."
            },
            {
                question: "What is quid pro quo in social engineering?",
                options: [
                    "Exchanging business cards",
                    "Offering something (like IT help) in exchange for information or access",
                    "A type of phishing email",
                    "A password attack"
                ],
                correct: 1,
                explanation: "Quid pro quo attacks offer a service in exchange for credentials or access. 'Let me fix your computer issue — just give me your login.'"
            },
            {
                question: "How can you protect yourself from social engineering attacks?",
                options: [
                    "Trust everyone who seems professional",
                    "Always verify identities, question unusual requests, and report suspicious contact",
                    "Only talk to people you know",
                    "Use a strong password"
                ],
                correct: 1,
                explanation: "Verification, healthy skepticism and reporting are your best defenses. Social engineering targets trust — don't give it blindly."
            },
            {
                question: "An email offers you a job with double your current salary and asks for your CV and ID. You haven't applied anywhere. This is likely?",
                options: [
                    "A genuine job offer",
                    "A social engineering attack to harvest personal information",
                    "A government recruitment",
                    "A mistake"
                ],
                correct: 1,
                explanation: "Unsolicited job offers collecting personal documents are information harvesting attacks. Verify through the company's official website."
            },
            {
                question: "What makes humans vulnerable to social engineering?",
                options: [
                    "Using computers",
                    "Natural tendencies like trust, helpfulness, and fear of authority",
                    "Having email accounts",
                    "Working in offices"
                ],
                correct: 1,
                explanation: "Attackers exploit human nature — our desire to be helpful, respect for authority, and fear of consequences. Awareness is the defense."
            },
            {
                question: "Your friend on social media asks you to send them money urgently saying they're stranded. You should?",
                options: [
                    "Send immediately — they're a friend",
                    "Call them directly on their known number to verify before sending",
                    "Send half the amount",
                    "Ignore it"
                ],
                correct: 1,
                explanation: "Social media accounts can be hacked. Always verify through a direct phone call using a number you already have saved."
            }
        ]
    },
    devices: {
        title: "Device Security",
        icon: "💻",
        difficulty: "Intermediate",
        questions: [
            {
                question: "You leave your work laptop unattended in a cafe while getting coffee. What's the risk?",
                options: [
                    "No risk if it's just a few minutes",
                    "Physical theft or unauthorized access to company data",
                    "The battery might drain",
                    "Someone might use your WiFi"
                ],
                correct: 1,
                explanation: "Never leave devices unattended in public. Physical access to a device can bypass many security controls."
            },
            {
                question: "What should you do when leaving your workstation during office hours?",
                options: [
                    "Nothing — you'll be back soon",
                    "Lock your screen (Windows+L or Ctrl+Cmd+Q)",
                    "Close all windows",
                    "Log out completely"
                ],
                correct: 1,
                explanation: "Always lock your screen when stepping away. An unlocked workstation is an open door to your company's systems."
            },
            {
                question: "You connect to free public WiFi at a hotel to check work emails. What's the risk?",
                options: [
                    "Slow internet speeds",
                    "Attackers can intercept your data through man-in-the-middle attacks",
                    "Higher mobile data costs",
                    "No risk if the WiFi has a password"
                ],
                correct: 1,
                explanation: "Public WiFi is unsafe for sensitive work. Use your company VPN or mobile hotspot for work activities."
            },
            {
                question: "What does 'keep your software updated' protect you from?",
                options: [
                    "Slow computer performance",
                    "Known vulnerabilities that attackers exploit in outdated software",
                    "Storage issues",
                    "Internet connectivity problems"
                ],
                correct: 1,
                explanation: "Updates patch security vulnerabilities. Unpatched systems are prime targets — many major breaches exploit known, fixable vulnerabilities."
            },
            {
                question: "You receive a pop-up saying your computer is infected and to call a number immediately. You should?",
                options: [
                    "Call the number right away",
                    "Close the browser, run a real antivirus scan, report to IT",
                    "Click the pop-up to remove the virus",
                    "Restart your computer and call"
                ],
                correct: 1,
                explanation: "This is scareware/tech support fraud. Legitimate security software doesn't ask you to call phone numbers through browser pop-ups."
            },
            {
                question: "What is full disk encryption and why does it matter?",
                options: [
                    "Making files smaller",
                    "Encrypting all data so it's unreadable if the device is stolen",
                    "Backing up your hard drive",
                    "Speeding up your computer"
                ],
                correct: 1,
                explanation: "Full disk encryption protects data even if your device is physically stolen. Without the key, data is meaningless to attackers."
            },
            {
                question: "A personal USB drive from home — is it safe to use on your work computer?",
                options: [
                    "Yes — it's your personal drive",
                    "No — personal drives can carry malware that infects corporate networks",
                    "Yes — if you have antivirus",
                    "Only if the files are documents"
                ],
                correct: 1,
                explanation: "Personal devices can harbor malware unknowingly. Many corporate breaches start with infected USB drives crossing the personal/work boundary."
            },
            {
                question: "What should you do before disposing of or returning a work device?",
                options: [
                    "Delete your personal files",
                    "Ensure IT department performs a certified data wipe",
                    "Format the drive yourself",
                    "Remove the battery"
                ],
                correct: 1,
                explanation: "Standard deletion doesn't erase data — it can be recovered. Only certified wiping or physical destruction guarantees data is gone."
            },
            {
                question: "Your phone asks for a PIN, password or biometric to unlock. Should you enable this?",
                options: [
                    "No — it's inconvenient",
                    "Yes — it prevents unauthorized access to your data if lost or stolen",
                    "Only on work phones",
                    "Only if you have sensitive apps"
                ],
                correct: 1,
                explanation: "Screen locks are your first line of defense. A lost unlocked phone exposes all your apps, email, contacts and more."
            },
            {
                question: "What is the safest way to dispose of printed documents containing sensitive information?",
                options: [
                    "Throw in the regular trash",
                    "Shred them using a cross-cut shredder",
                    "Tear them by hand",
                    "Burn them at home"
                ],
                correct: 1,
                explanation: "Dumpster diving is a real attack. Cross-cut shredding makes document reconstruction practically impossible."
            }
        ]
    },
    data: {
        title: "Data Protection",
        icon: "🗄️",
        difficulty: "Advanced",
        questions: [
            {
                question: "What is personal data under data protection laws?",
                options: [
                    "Only government ID numbers",
                    "Any information that can identify a living individual",
                    "Only financial information",
                    "Only medical records"
                ],
                correct: 1,
                explanation: "Personal data includes names, emails, phone numbers, location data, IP addresses and more — anything that can identify someone."
            },
            {
                question: "A customer asks you to delete their personal data from your systems. What should you do?",
                options: [
                    "Ignore it — data is needed for business",
                    "Process the request in accordance with data protection policy",
                    "Ask them to fill a form and delay",
                    "Delete only what they can see"
                ],
                correct: 1,
                explanation: "The right to erasure (right to be forgotten) is a legal requirement in many jurisdictions. Handle deletion requests properly and promptly."
            },
            {
                question: "You accidentally send customer data to the wrong email address. What do you do first?",
                options: [
                    "Hope they don't notice",
                    "Immediately report it to your data protection officer or management",
                    "Ask the recipient to delete it",
                    "Send a follow-up apology"
                ],
                correct: 1,
                explanation: "Data breaches must be reported internally immediately. Many laws require notification within 72 hours. Delay makes things worse."
            },
            {
                question: "What is the principle of data minimization?",
                options: [
                    "Storing data in the smallest files",
                    "Collecting only the data you actually need for a specific purpose",
                    "Deleting old data",
                    "Using compressed storage"
                ],
                correct: 1,
                explanation: "Collect only what you need. Excess data creates unnecessary risk — every piece of data you hold is a liability if breached."
            },
            {
                question: "You want to share customer data with a third party vendor. What must happen first?",
                options: [
                    "Just share it — it's for business",
                    "Ensure a data processing agreement is in place and customers are informed",
                    "Get verbal approval from your manager",
                    "Anonymize the names only"
                ],
                correct: 1,
                explanation: "Third-party data sharing requires proper legal agreements and often customer consent. Unauthorized sharing can lead to massive fines."
            },
            {
                question: "What is a data breach?",
                options: [
                    "A slow internet connection",
                    "Any unauthorized access, disclosure or loss of personal data",
                    "Deleting company files",
                    "A software crash"
                ],
                correct: 1,
                explanation: "Data breaches include hacking, accidental disclosure, lost devices and insider threats — any unintended exposure of protected data."
            },
            {
                question: "Customer payment card data should be stored:",
                options: [
                    "In a spreadsheet for easy access",
                    "Never stored unnecessarily — use tokenization or payment processors",
                    "In an encrypted email",
                    "In a password-protected Word document"
                ],
                correct: 1,
                explanation: "Payment card data has strict PCI-DSS requirements. Most businesses should use payment processors rather than storing raw card data."
            },
            {
                question: "What does 'need to know' mean in data access?",
                options: [
                    "Everyone in the company should access all data",
                    "Only people who need data for their specific job should access it",
                    "Managers should know everything",
                    "IT should have access to all data"
                ],
                correct: 1,
                explanation: "Least privilege / need-to-know limits data exposure. If someone doesn't need data for their role, they shouldn't have access to it."
            },
            {
                question: "How should you handle confidential documents when working from home?",
                options: [
                    "Print them for convenience",
                    "Follow company policy — use secure connections, don't print unnecessarily",
                    "Share via personal email if easier",
                    "Work in a public cafe"
                ],
                correct: 1,
                explanation: "Remote work extends your security perimeter. Company data handled at home must follow the same — or stricter — security practices."
            },
            {
                question: "What is anonymization in data protection?",
                options: [
                    "Changing names to aliases",
                    "Irreversibly removing all identifying information so individuals cannot be identified",
                    "Encrypting data",
                    "Hiding data from search engines"
                ],
                correct: 1,
                explanation: "True anonymization means data can never be re-linked to an individual. Pseudonymization still carries risk — only true anonymization removes protection requirements."
            },
            {
                question: "An employee leaves the company. What should happen to their data access?",
                options: [
                    "Access can remain for a month in case they return",
                    "All access should be revoked immediately on their last day",
                    "Their manager inherits their credentials",
                    "Access is removed after 30 days"
                ],
                correct: 1,
                explanation: "Immediate access revocation on departure is critical. Former employees retaining access is a common cause of insider breaches."
            },
            {
                question: "What is the purpose of a privacy policy?",
                options: [
                    "Legal requirement with no practical use",
                    "To inform users how their data is collected, used and protected",
                    "To prevent employees from sharing company info",
                    "To block data access requests"
                ],
                correct: 1,
                explanation: "Privacy policies build trust and fulfill legal obligations. Users have a right to know how their data is handled."
            },
            {
                question: "You notice a colleague accessing customer data they don't need for their role. What do you do?",
                options: [
                    "Ignore it — not your business",
                    "Report it to your manager or data protection officer",
                    "Tell the colleague to stop",
                    "Document it yourself"
                ],
                correct: 1,
                explanation: "Unauthorized data access is a potential breach regardless of intent. Reporting protects customers and the company from insider threats."
            },
            {
                question: "What is pseudonymization?",
                options: [
                    "Using fake names for marketing",
                    "Replacing identifying info with artificial identifiers while keeping data useful",
                    "Deleting sensitive fields",
                    "Encrypting entire databases"
                ],
                correct: 1,
                explanation: "Pseudonymization reduces risk while keeping data useful for analysis. Unlike anonymization, it can be reversed with the right key."
            },
            {
                question: "A colleague asks you to share a customer's contact details over WhatsApp. You should?",
                options: [
                    "Share it — it's a colleague",
                    "Decline and use approved, secure company communication channels only",
                    "Share only the phone number",
                    "Send via personal email instead"
                ],
                correct: 1,
                explanation: "Personal messaging apps are not approved for sharing customer data. Always use company-approved, secure channels for sensitive information."
            }
        ]
    },
    incident: {
        title: "Incident Response",
        icon: "🚨",
        difficulty: "Advanced",
        questions: [
            {
                question: "What is a cybersecurity incident?",
                options: [
                    "Any computer malfunction",
                    "Any event that threatens the confidentiality, integrity or availability of data",
                    "A slow internet connection",
                    "A software update"
                ],
                correct: 1,
                explanation: "Incidents include breaches, malware infections, unauthorized access, and service disruptions — any threat to your security posture."
            },
            {
                question: "You notice your computer is running unusually slow and sending lots of network traffic. First step?",
                options: [
                    "Restart the computer",
                    "Disconnect from the network and immediately report to IT security",
                    "Run more programs to test",
                    "Wait to see if it resolves"
                ],
                correct: 1,
                explanation: "Unusual behavior may indicate malware. Disconnecting limits spread. Report immediately — every minute of delay can mean more damage."
            },
            {
                question: "During a ransomware attack, files on your computer get encrypted. What should you NOT do?",
                options: [
                    "Disconnect from the network",
                    "Pay the ransom immediately",
                    "Report to IT immediately",
                    "Preserve evidence"
                ],
                correct: 1,
                explanation: "Paying ransom doesn't guarantee file recovery and funds criminal operations. Follow your incident response plan instead."
            },
            {
                question: "What is the first priority when responding to a security incident?",
                options: [
                    "Find out who caused it",
                    "Contain the incident to prevent further damage",
                    "Notify the press",
                    "Restore systems immediately"
                ],
                correct: 1,
                explanation: "Containment first — stop the bleeding. Attribution and recovery come after you've limited the damage."
            },
            {
                question: "Why is preserving evidence important during an incident?",
                options: [
                    "It's not important — fix the problem first",
                    "For forensic investigation, legal proceedings and understanding what happened",
                    "To show management",
                    "For insurance purposes only"
                ],
                correct: 1,
                explanation: "Evidence preservation enables forensics, potential prosecution and understanding attack vectors to prevent recurrence."
            },
            {
                question: "You receive a ransom note saying attackers have your company's data. Who do you contact first?",
                options: [
                    "The media",
                    "Your IT security team and management immediately",
                    "The attackers to negotiate",
                    "Your personal lawyer"
                ],
                correct: 1,
                explanation: "Follow your incident response chain of command. Internal teams coordinate the response including legal, communications and technical response."
            },
            {
                question: "What is an incident response plan?",
                options: [
                    "A plan to prevent all incidents",
                    "A documented procedure for detecting, responding to and recovering from incidents",
                    "An insurance policy",
                    "A list of security tools"
                ],
                correct: 1,
                explanation: "An IRP defines roles, procedures and communication during incidents. Organizations without one waste critical time figuring out who does what."
            },
            {
                question: "After an incident is resolved, what should always happen?",
                options: [
                    "Move on and forget about it",
                    "Conduct a post-incident review to learn and improve defenses",
                    "Fire the person responsible",
                    "Change all passwords"
                ],
                correct: 1,
                explanation: "Post-incident reviews (lessons learned) turn incidents into improvements. Understanding what happened prevents recurrence."
            },
            {
                question: "A colleague accidentally deletes important company data. This is?",
                options: [
                    "Not a security incident — just a mistake",
                    "A security incident requiring reporting and potential data recovery",
                    "An HR issue only",
                    "Not important if backups exist"
                ],
                correct: 1,
                explanation: "Accidental data loss is an incident. Even with backups, it should be reported, documented and investigated to prevent recurrence."
            },
            {
                question: "What does 'time to detect' mean in incident response metrics?",
                options: [
                    "How long it takes to fix an incident",
                    "How long between an incident occurring and your team discovering it",
                    "How long the incident lasted",
                    "The time of day the incident happened"
                ],
                correct: 1,
                explanation: "Time to detect is critical — attackers average months in systems before detection. Faster detection means less damage and data loss."
            },
            {
                question: "You accidentally click a suspicious link. What should you do immediately?",
                options: [
                    "Close the browser and continue working",
                    "Disconnect from internet, don't enter any credentials, report to IT",
                    "Run a quick antivirus scan",
                    "Tell a colleague"
                ],
                correct: 1,
                explanation: "Immediate disconnection and reporting limits damage. Don't enter any credentials on pages that loaded after the click."
            },
            {
                question: "What is business continuity planning in relation to incidents?",
                options: [
                    "Keeping the business profitable",
                    "Ensuring critical operations continue or recover quickly during and after incidents",
                    "Planning for office renovations",
                    "Employee training programs"
                ],
                correct: 1,
                explanation: "BCP ensures your organization can operate through disruptions. Incidents without continuity plans can halt operations for days or weeks."
            }
        ]
    }
};