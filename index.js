const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");
const pino = require("pino");

// سجل حفظ عدد الإنذارات لكل مشارك داخل المجموعات
const warnings = {};

// بيانات المالك والاسم المخصص الذي يظهر في كل رسائل البوت
const OWNER_JID = "212630207190@s.whatsapp.net";
const PHONE_NUMBER = "212630207190";
const MY_NAME = "أمين مؤسس مجموعات عالم السلوكة";

async function startBot() {
    // 1. إدارة جلسة الاتصال والحفظ
    const { state, saveCreds } = await useMultiFileAuthState("auth_session");
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS(MY_NAME),
        syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    let pairingCodeRequested = false;

    // 2. متابعة حالة الاتصال واستخراج كود الربط
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (!sock.authState.creds.registered && !pairingCodeRequested) {
            pairingCodeRequested = true;
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(PHONE_NUMBER);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    console.log(`\n===================================\n🔑 CODE DE COUPLAGE : ${code}\n===================================\n`);
                } catch (err) {
                    console.error("خطأ أثناء طلب كود الربط:", err.message);
                    pairingCodeRequested = false;
                }
            }, 3000);
        }

        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("إعادة الاتصال بالسيرفر السحابي...");
                startBot();
            }
        } else if (connection === "open") {
            console.log(`\n✅ البوت متصل بنجاح باسم: ${MY_NAME}\n`);
            try {
                await sock.updateProfileName(MY_NAME);
            } catch (e) {
                console.log("تحديث اسم الملف الشخصي يتم عند التشغيل.");
            }
        }
    });

    // 3. الاستماع للرسائل وتطبيق نظام حظر الروابط لحماية المجموعة
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return; 
        
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            
            const from = msg.key.remoteJid;
            const sender = msg.key.participant || msg.participant || from;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim().toLowerCase();
            const isGroup = from.endsWith("@g.us");

            // الرد على أمر .bot
            if (text === ".bot") {
                await sock.sendMessage(from, { 
                    text: `مرحباً! أنا البوت الخاص بـ (${MY_NAME}) وأعمل بكفاءة لتنفيذ نظام الحماية.` 
                });
                continue;
            }

            // الرد على أمر نظام الحظر (بالإنجليزية فقط)
            if (text === ".antilink") {
                await sock.sendMessage(from, { 
                    text: `نظام حظر الروابط لحماية المجموعة مفعل ومُدار بواسطة (${MY_NAME}).` 
                });
                continue;
            }

            if (!isGroup) continue;

            // فحص الروابط وكشفها لحظرها
            const hasLink = /https?:\/\/|www\.|\b(com|net|org|me|info|io|xyz|tk|ml|ga|cf|gq)\b|chat\.whatsapp\.com/i.test(text);

            if (isGroup && hasLink) {
                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const participants = groupMetadata.participants || [];
                    
                    const senderObj = participants.find(p => p.id === sender);
                    const isAdmin = senderObj && (senderObj.admin === 'admin' || senderObj.admin === 'superadmin');
                    const isOwner = (sender === OWNER_JID);

                    // استثناء المالك والأدمن
                    if (isOwner || isAdmin) continue; 

                    if (!warnings[from]) warnings[from] = {};
                    if (!warnings[from][sender]) warnings[from][sender] = 0;
                    warnings[from][sender] += 1;

                    // حذف رسالة الرابط المحظور فوراً
                    await sock.sendMessage(from, { delete: msg.key });

                    // الإنذار الأول (مع التنبيه الصارم باللغة المطلوبة)
                    if (warnings[from][sender] === 1) {
                        await sock.sendMessage(from, { 
                            text: `تنبيه من طرف (${MY_NAME})!\n@${sender.split("@")[0]} ممنوع إرسال الروابط حفاظاً على أمن وحماية المجموعة. في المرة الجاية غادي نخرجك ماعاودش إلا بقيتي إلا بغيتي تبقى في المجموعة (إنذار حظر 1/2).`,
                            mentions: [sender]
                        });
                    } 
                    // الإنذار الثاني والطرد النهائي
                    else if (warnings[from][sender] >= 2) {
                        await sock.sendMessage(from, { 
                            text: `تم حظر وإزالة العضو @${sender.split("@")[0]} بأوامر من (${MY_NAME}) بسبب تكرار إرسال الروابط ومخالفة قوانين حماية المجموعة!`,
                            mentions: [sender]
                        });
                        await sock.groupParticipantsUpdate(from, [sender], "remove");
                        warnings[from][sender] = 0;
                    }
                } catch (error) {
                    console.error("خطأ أثناء معالجة حظر الرابط:", error);
                }
                continue;
            }
        }
    });
}

startBot();
