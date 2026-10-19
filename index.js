const crypto = require("crypto");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");
const pino = require("pino");

// سجل حفظ عدد الإنذارات لكل مشارك داخل المجموعات //
const warnings = {};

// بيانات المالك والاسم المخصص الذي يظهر في كل رسائل البوت //
const OWNER_JID = "212630207190@s.whatsapp.net";
const PHONE_NUMBER = "212630207190";
const MY_NAME = "أمين مؤسس مجموعات عالم السلوكة";

async function startBot() {
    // إدارة جلسة الاتصال والحفظ في ملفات محلية //
    const { state, saveCreds } = await useMultiFileAuthState("auth_session");

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS(MY_NAME),
        syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // إذا ظهر كود الاستجابة السريعة، سيتم طباعته في السجلات لتمسحه بهاتفك //
        if (qr) {
            console.log("-----------------------------------------");
            console.log("امسح كود QR التالي عبر تطبيق WhatsApp في هاتفك:");
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
