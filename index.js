// 1. تهيئة التشفير لبيئة التشغيل السحابية والفيزيائية لتفادي أخطاء النظام
const crypto = require('crypto');
if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = crypto.webcrypto || {
        getRandomValues: function(buffer) {
            return crypto.randomFillSync(buffer);
        }
    };
}

// 2. استدعاء المكتبات البرمجية الأساسية
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const config = require("./config");

// سجل تخزين عدد الإنذارات لكل مستخدم داخل المجموعات
const warnings = {};

async function startBot() {
    // إنشاء وحفظ جلسة الاتصال لتجنب مسح الرمز كل مرة
    const { state, saveCreds } = await useMultiFileAuthState("auth_session");

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Bot WhatsApp"),
        syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    // 3. الاستماع للرسائل الواردة ومعالجة الأوامر ونظام الحماية
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const remoteJid = m.key.remoteJid;
        const senderJid = m.key.participant || remoteJid;
        const messageType = Object.keys(m.message)[0];
        
        // استخراج نص الرسالة بدقة
        const textMessage = messageType === "conversation" ? m.message.conversation :
                            messageType === "extendedTextMessage" ? m.message.extendedTextMessage.text : "";

        if (!textMessage) return;
        const cleanText = textMessage.trim().toLowerCase();

        // أمر الرد الترحيبي: بوت
        if (cleanText === "بوت") {
            await sock.sendMessage(remoteJid, { text: config.botGreetingMsg }, { quoted: m });
            return;
        }

        // أمر حالة الحماية: اونتي لينك
        if (cleanText === "اونتي لينك" || cleanText === "حماية الروابط") {
            await sock.sendMessage(remoteJid, { text: config.antiLinkStatusMsg }, { quoted: m });
            return;
        }

        // 4. فحص الروابط (Anti-Link) وتطبيق نظام الإنذارين
        const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi.test(textMessage);

        if (hasLink) {
            try {
                // حذف رسالة الرابط المخالفة فوراً
                await sock.sendMessage(remoteJid, { delete: m.key });

                if (!warnings[senderJid]) {
                    warnings[senderJid] = 0;
                }
                warnings[senderJid] += 1;

                if (warnings[senderJid] === 1) {
                    // الإنذار الأول مع عمل اقتباس (منشن) لرسالة العضو
                    await sock.sendMessage(remoteJid, { 
                        text: `${config.firstWarningMsg}\n✍️ إشراف: ${config.ownerName} (${config.groupTitle})` 
                    }, { quoted: m });
                } else if (warnings[senderJid] >= config.maxWarnings) {
                    // الإنذار الثاني وتنفيد الطرد النهائي
                    await sock.sendMessage(remoteJid, { 
                        text: `${config.secondWarningMsg}\n✍️ إشراف: ${config.ownerName} (${config.groupTitle})` 
                    }, { quoted: m });

                    // أمر طرد العضو من المجموعة
                    await sock.groupParticipantsUpdate(remoteJid, [senderJid], "remove");
                    delete warnings[senderJid];
                }
            } catch (error) {
                console.log("خطأ تقني في معالجة الحماية أو الطرد:", error);
            }
        }
    });

    // 5. مراقبة حالة الاتصال وعرض كود الـ QR بصرياً
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("\n=========================================");
            console.log("امسح كود QR التالي عبر تطبيق WhatsApp:");
            console.log("=========================================\n");
            // رسم الكود في السجلات بمربعات واضحة
            qrcode.generate(qr, { small: true });
        }

        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("إعادة الاتصال بالسيرفر...");
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === "open") {
            console.log("✅ تم اتصال البوت بنجاح تام مع واتساب!");
        }
    });
}

// بدء تشغيل البرنامج
startBot();
