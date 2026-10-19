// 1. تهيئة بيئة التشفير لتفادي أخطاء السيرفر
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

// إعدادات اسمك واسم المجموعة الخاص بك
const ownerName = "أمين";
const groupTitle = "عالم السلوكة";

// سجل حفظ الإنذارات لكل مشارك
const warnings = {};

async function startBot() {
    // إدارة جلسة الحساب لتجنب إعادة مسح QR في كل مرة
    const { state, saveCreds } = await useMultiFileAuthState("auth_session");

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Bot WhatsApp"),
        syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    // 3. الاستماع للرسائل الواردة ومعالجة الأوامر بدقة
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

        // الأمر الأول: كلمة "بوت" فقط ودون أقواس
        if (cleanText === "بوت") {
            const replyMsg = `مرحباً بك! أنا بوت حماية المجموعة الخاص بـ ${ownerName} مؤسس مجموعة ${groupTitle}.\nأنا هنا لخدمتكم والحفاظ على نظام المجموعة.`;
            await sock.sendMessage(remoteJid, { text: replyMsg }, { quoted: m });
            return;
        }

        // الأمر الثاني: عبارة "ممنوع الروابط" فقط ودون أقواس
        if (cleanText === "ممنوع الروابط") {
            const statusMsg = `⚙️ **نظام الحماية مفعل:**\nيُمنع منعاً باتاً نشر الروابط داخل المجموعة.\n- الإنذار الأول: حذف الرسالة وتوجيه تنبيه.\n- الإنذار الثاني: الطرد النهائي من المجموعة.\n✍️ تحت إشراف: ${ownerName}`;
            await sock.sendMessage(remoteJid, { text: statusMsg }, { quoted: m });
            return;
        }

        // 4. نظام رصد الروابط المخالفة وتطبيق الحماية
        const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi.test(textMessage);

        if (hasLink) {
            try {
                // حذف رسالة الرابط فوراً
                await sock.sendMessage(remoteJid, { delete: m.key });

                if (!warnings[senderJid]) {
                    warnings[senderJid] = 0;
                }
                warnings[senderJid] += 1;

                if (warnings[senderJid] === 1) {
                    const warn1 = `⚠️ **تنبيه أول:** يمنع نشر الروابط في مجموعة ${groupTitle}.\nعند نشر رابط آخر سيتم طردك تلقائياً!\n✍️ إشراف: ${ownerName}`;
                    await sock.sendMessage(remoteJid, { text: warn1 }, { quoted: m });
                } else if (warnings[senderJid] >= 2) {
                    const warn2 = `🚫 **تنبيه ثاني وطرد:** لقد تجاوزت الحد المسموح لنشر الروابط.\nتم طردك من المجموعة.\n✍️ إشراف: ${ownerName}`;
                    await sock.sendMessage(remoteJid, { text: warn2 }, { quoted: m });

                    // طرد العضو المخالف من المجموعة
                    await sock.groupParticipantsUpdate(remoteJid, [senderJid], "remove");
                    delete warnings[senderJid];
                }
            } catch (error) {
                console.log("خطأ برمجي في تطبيق الحماية:", error);
            }
        }
    });

    // 5. إدارة الاتصال وعرض رمز الـ QR بصرياً في السجلات
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("\n=========================================");
            console.log("امسح كود QR التالي عبر تطبيق WhatsApp:");
            console.log("=========================================\n");
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

// تشغيل البرنامج
startBot();
