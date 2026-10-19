// حل جذري لخطأ التشفير في بيئة السيرفر السحابي
const crypto = require('crypto');
if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = crypto.webcrypto || {
        getRandomValues: function(arr) {
            return crypto.randomFillSync(arr);
        }
    };
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");
const pino = require("pino");
const config = require("./config");

// سجل حفظ عدد الإنذارات لكل مشارك داخل المجموعات
const warnings = {};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_session");

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Bot WhatsApp"),
        syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    // استقبال الرسائل ومعالجة الأوامر باللغة العربية
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const remoteJid = m.key.remoteJid; // معرف المجموعة
        const senderJid = m.key.participant || remoteJid; // مرسل الرسالة
        const messageType = Object.keys(m.message)[0];
        
        // استخراج نص الرسالة
        const textMessage = messageType === "conversation" ? m.message.conversation :
                            messageType === "extendedTextMessage" ? m.message.extendedTextMessage.text : "";

        if (!textMessage) return;
        const cleanText = textMessage.trim().toLowerCase();

        // 1. الاستجابة بكلمة "بوت" باللغة العربية
        if (cleanText === "بوت") {
            await sock.sendMessage(remoteJid, { text: config.botGreetingMsg }, { quoted: m });
            return;
        }

        // 2. الاستجابة بعبارة "اونتي لينك" أو "حماية الروابط" باللغة العربية
        if (cleanText === "اونتي لينك" || cleanText === "حماية الروابط") {
            await sock.sendMessage(remoteJid, { text: config.antiLinkStatusMsg }, { quoted: m });
            return;
        }

        // 3. نظام رصد الروابط ومنعها (Anti-Link)
        const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi.test(textMessage);

        if (hasLink) {
            try {
                // حذف رسالة الرابط فوراً
                await sock.sendMessage(remoteJid, { delete: m.key });

                // تهيئة عداد الإنذارات للعضو
                if (!warnings[senderJid]) {
                    warnings[senderJid] = 0;
                }

                warnings[senderJid] += 1;

                if (warnings[senderJid] === 1) {
                    // المرة الأولى: مسح + منشن للرسالة المخالفة + تحذير أول
                    await sock.sendMessage(remoteJid, { 
                        text: `${config.firstWarningMsg}\n✍️ إشراف: ${config.ownerName} (${config.groupTitle})` 
                    }, { quoted: m });

                } else if (warnings[senderJid] >= config.maxWarnings) {
                    // المرة الثانية: مسح + منشن للرسالة + تحذير نهائي + طرد العضو
                    await sock.sendMessage(remoteJid, { 
                        text: `${config.secondWarningMsg}\n✍️ إشراف: ${config.ownerName} (${config.groupTitle})` 
                    }, { quoted: m });

                    // تنفيذ أمر طرد العضو من المجموعة نهائياً
                    await sock.groupParticipantsUpdate(remoteJid, [senderJid], "remove");
                    
                    // مسح العداد الخاص به بعد الطرد
                    delete warnings[senderJid];
                }

            } catch (error) {
                console.log("خطأ في معالجة الحماية أو طرد العضو:", error);
            }
        }
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("-----------------------------------------");
            console.log("امسح كود QR التالي عبر تطبيق WhatsApp:");
            console.log(qr);
            console.log("-----------------------------------------");
        }

        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("إعادة الاتصال بالسيرفر السحابي بسبب انقطاع الاتصال...");
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === "open") {
            console.log("تم اتصال البوت بنجاح تام مع واتساب!");
        }
    });
}

startBot();
