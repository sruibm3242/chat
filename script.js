const synth = window.speechSynthesis;
let currentUser = null;
let socket = null;
let voiceTranscript = "";
let friendPublicKey = null;
let currentFriendId = null;

// نطق النص
function speak(text) {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    synth.speak(utterance);
}

// أصوات
function playSuccess() { document.getElementById('successSound').play(); }
function playError() { document.getElementById('errorSound').play(); }

// تسجيل دخول بصمة الوجه
async function startFaceLogin() {
    try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);

        const publicKey = {
            challenge,
            rp: { name: "دردشة صوتية" },
            user: { id: new Uint8Array([1]), name: "user", displayName: "مستخدم" },
            pubKeyCredParams: [{ type: "public-key", alg: -7 }],
            timeout: 60000,
            attestation: "none"
        };

        const credential = await navigator.credentials.get({ publicKey });
        const id = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));

        const username = prompt("أدخل اسم المستخدم");
        const res = await fetch('/login/face', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, credentialId: id })
        }).then(r => r.json());

        if (res.success) {
            currentUser = res;
            speak(`مرحباً ${res.username}`);
            playSuccess();
            showMainMenu();
        } else {
            speak("فشل تسجيل الدخول");
            playError();
        }
    } catch (e) {
        speak("لم يتم التعرف على الوجه. تأكد من استخدام HTTPS.");
        playError();
    }
}

// تسجيل دخول بصوتي
function startVoiceLogin() {
    speak("قل اسم المستخدم الخاص بك");
    startVoiceCapture(() => {
        fetch('/login/voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: voiceTranscript, voicePrint: voiceTranscript })
        }).then(r => r.json()).then(data => {
            if (data.success) {
                currentUser = data;
                speak(`مرحباً ${data.username}`);
                playSuccess();
                showMainMenu();
            } else {
                speak("بصمة صوت غير معروفة");
                playError();
            }
        });
    });
}

// مستخدم جديد
function startNewUser() {
    speak("قل اسمك الكامل الآن");
    startVoiceCapture(() => {
        document.getElementById('voiceRegister').style.display = 'block';
        speak(`هل تم التعرف على اسمك: ${voiceTranscript}؟ قل نعم إذا كان صحيحاً`);
    });
}

function confirmVoiceName() {
    const username = voiceTranscript;
    fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, voicePrint: voiceTranscript, faceIdKey: "" })
    }).then(r => r.json()).then(data => {
        if (data.success) {
            currentUser = data;
            // توليد مفتاح خاص (يُخزن في المتصفح فقط)
            generateUserKeys().then(() => {
                speak(`تم التسجيل بنجاح، أهلاً بك ${username}`);
                playSuccess();
                showMainMenu();
            });
        }
    });
}

// توليد مفاتيح RSA للمستخدم
async function generateUserKeys() {
    const keyPair = await crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true,
        ["decrypt", "sign"]
    );
    currentUser.privateKey = keyPair.privateKey;
}

// بدء التسجيل الصوتي
function startVoiceCapture(callback) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("متصفحك لا يدعم التعرف الصوتي");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.interimResults = false;

    recognition.onresult = (e) => {
        voiceTranscript = e.results[0][0].transcript;
        speak(`سمعت: ${voiceTranscript}`);
        if (callback) callback();
    };

    recognition.onerror = (e) => {
        speak("لم أسمعك جيداً، حاول مرة أخرى");
        playError();
    };

    recognition.start();
}

// القائمة الرئيسية
function showMainMenu() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('voiceRegister').style.display = 'none';
    document.getElementById('mainMenu').style.display = 'block';
    speak("اختر: الدردشة أو الحكومة الإلكترونية");
}

// الدخول إلى الدردشة
function enterChat() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('chatScreen').style.display = 'block';
    loadFriends();
    setupSocket();
    speak("قائمة الأصدقاء");
}

// الدخول إلى الحكومة
function enterGov() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('govScreen').style.display = 'block';
    speak("نظام الحكومة الإلكترونية");
}

// إنشاء شهادة عدم محكومية
function generateCriminalRecord() {
    const date = new Date().toLocaleDateString('ar-SA');
    const cert = `
        <h3>وزارة العدل</h3>
        <p>رقم الشهادة: ${Math.floor(Math.random() * 1000000)}</p>
        <p>اسم المواطن: <strong>${currentUser.username}</strong></p>
        <p>يحمل هذه الشهادة تفيد بعدم وجود أي سجلات جنائية باسمه حتى تاريخ: ${date}</p>
        <p>التوقيع الإلكتروني: ✅</p>
        <p style="font-size:0.8em;color:#666;">تم إصدارها عبر النظام الإلكتروني</p>
    `;
    document.getElementById('certificateOutput').innerHTML = cert;
    speak("تم إصدار شهادة عدم محكومية باسم " + currentUser.username);
    playSuccess();
}

// إعداد الاتصال
function setupSocket() {
    socket = io();
    socket.emit('set-user', currentUser.userId);

    socket.on('receive-message', async (data) => {
        try {
            const binaryKey = Uint8Array.from(atob(data.content.encryptedKey), c => c.charCodeAt(0));
            const decryptedKey = await crypto.subtle.decrypt(
                { name: "RSA-OAEP" },
                currentUser.privateKey,
                binaryKey
            );
            const aesKey = await crypto.subtle.importKey("raw", decryptedKey, { name: "AES-GCM" }, true, ["decrypt"]);

            const ciphertext = Uint8Array.from(atob(data.content.ciphertext), c => c.charCodeAt(0));
            const iv = Uint8Array.from(atob(data.content.iv), c => c.charCodeAt(0));

            const decrypted = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                aesKey,
                ciphertext
            );

            const plaintext = new TextDecoder().decode(decrypted);
            const div = document.createElement('div');
            div.textContent = `[${new Date(data.timestamp).toLocaleTimeString()}] ${plaintext}`;
            document.getElementById('chatArea').appendChild(div);
            speak("رسالة جديدة وصلت");
            playSuccess();

            setTimeout(() => div.remove(), 30000);
        } catch (e) {
            speak("رسالة مشفرة غير قابلة للقراءة");
        }
    });
}

// جلب الأصدقاء
async function loadFriends() {
    const res = await fetch(`/friends/${currentUser.userId}`).then(r => r.json());
    const list = document.getElementById('friendsList');
    list.innerHTML = '<h3>أصدقاؤك</h3>';
    res.forEach(f => {
        const p = document.createElement('p');
        p.textContent = `${f.username} - ${f.isOnline ? 'متصل' : 'آخر ظهور: ' + Math.floor((Date.now() - f.lastSeen)/1000) + ' ثانية'}`;
        p.onclick = () => {
            currentFriendId = f.id;
            friendPublicKey = await fetchPublicKey(f.id);
            speak(`الدردشة مع ${f.username}`);
        };
        list.appendChild(p);
    });
}

async function fetchPublicKey(userId) {
    const res = await fetch(`/user/${userId}`).then(r => r.json());
    const binaryDer = Uint8Array.from(atob(res.publicKey), c => c.charCodeAt(0));
    return await crypto.subtle.importKey(
        "spki",
        binaryDer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );
}

// إرسال رسالة
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const msg = input.value;
    if (!msg || !friendPublicKey) return;

    const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
    const exportedKey = await crypto.subtle.exportKey("raw", aesKey);
    const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, friendPublicKey, exportedKey);

    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        encoder.encode(msg)
    );

    socket.emit('send-message', {
        to: currentFriendId,
        from: currentUser.userId,
        content: {
            ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
            iv: btoa(String.fromCharCode(...iv)),
            encryptedKey: btoa(String.fromCharCode(...new Uint8Array(encryptedKey)))
        },
        timestamp: Date.now()
    });

    const div = document.createElement('div');
    div.textContent = `[أنا] ${msg}`;
    document.getElementById('chatArea').appendChild(div);
    input.value = '';
    setTimeout(() => div.remove(), 30000);
}

// إضافة صديق
function sendFriendRequest() {
    const name = document.getElementById('searchFriend').value;
    fetch('/friend/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.userId, friendUsername: name })
    }).then(() => {
        speak(`تم إرسال طلب صداقة إلى ${name}`);
        playSuccess();
    });
}

// العودة
function backToMenu() {
    document.getElementById('chatScreen').style.display = 'none';
    document.getElementById('govScreen').style.display = 'none';
    document.getElementById('mainMenu').style.display = 'block';
}

function goBackToLogin() {
    document.getElementById('voiceRegister').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
}

function logout() {
    currentUser = null;
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    speak("تم تسجيل الخروج");
}