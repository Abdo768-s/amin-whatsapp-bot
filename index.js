// حل نهائي ومضمون لمشكلة التشفير في السيرفر السحابي
const crypto = require('crypto');
if (!global.crypto) {
    global.crypto = {
        subtle: crypto.webcrypto ? crypto.webcrypto.subtle : undefined,
        getRandomValues: function(arr) {
            return crypto.randomFillSync(arr);
        }
    };
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");
const pino = require("pino");
const config = require("./config");

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

    // استقبال الرسائل والأوامر
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const remoteJid = m.key.remoteJid;
        const senderJid = m.key.participant || remoteJid;
        const messageType = Object.keys(m.message)[0];
        
        const textMessage = messageType === "conversation" ? m.message.conversation :
                            messageType === "extendedTextMessage" ? m.message.extendedTextMessage.text : "";

        if (!textMessage) return;
        const cleanText = textMessage.trim().toLowerCase();

        // 1. أمر بوت
        if (cleanText === "بوت") {
            await sock.sendMessage(remoteJid, { text: config.botGreetingMsg }, { quoted: m });
            return;
        }

        // 2. أمر اونتي لينك
        if (cleanText === "اونتي لينك" || cleanText === "حماية الروابط") {
            await sock.sendMessage(remoteJid, { text: config.antiLinkStatusMsg }, { quoted: m });
            return;
        }

        // 3. نظام منع الروابط
        const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi.test(textMessage);

        if (hasLink) {
            try {
                await sock.sendMessage(remoteJid, { delete: m.key });

                if (!warnings[senderJid]) {
                    warnings[senderJid] = 0;
                }
                warnings[senderJid] += 1;

                if (warnings[senderJid] === 1) {
                    await sock.sendMessage(remoteJid, { 
                        text: `${config.firstWarningMsg}\n✍️ إشراف: ${config.ownerName} (${config.groupTitle})` 
                    }, { quoted: m });
                } else if (warnings[senderJid] >= config.maxWarnings) {
                    await sock.sendMessage(remoteJid, { 
                        text: `${config.secondWarningMsg}\n✍️ إشراف: ${config.ownerName} (${config.groupTitle})` 
                    }, { quoted: m });

                    await sock.groupParticipantsUpdate(remoteJid, [senderJid], "remove");
                    delete warnings[senderJid];
                }
            } catch (error) {
                console.log("خطأ في معالجة الحماية:", error);
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
            console.log("إعادة الاتصال بالسيرفر السحابي...");
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === "open") {
            console.log("تم اتصال البوت بنجاح تام مع واتساب!");
        }
    });
}

startBot();
