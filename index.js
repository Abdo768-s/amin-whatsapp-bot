const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

// جدول مؤقت لحفظ عدد الإنذارات ديال كل عضو
const warnings = new Map();

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            // التأكد باللي الرسالة جاية من جروب ومشي شات خاص
            const fromGroup = msg.key.remoteJid.endsWith('@g.us');
            if (!fromGroup || msg.key.fromMe) continue;

            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
            
            // تعبير نمطي (Regex) للبحث عن الروابط فقط
            const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(chat\.whatsapp\.com\/[^\s]+)/gi;

            if (linkRegex.test(text)) {
                const groupJid = msg.key.remoteJid;
                const senderJid = msg.key.participant;

                try {
                    // 1. مسح الرسالة اللي فيها الرابط ديركت
                    await sock.sendMessage(groupJid, { delete: msg.key });

                    // 2. تتبع الإنذارات
                    let currentWarnings = warnings.get(senderJid) || 0;
                    currentWarnings += 1;
                    warnings.set(senderJid, currentWarnings);

                    if (currentWarnings === 1) {
                        // الإنذار الأول
                        await sock.sendMessage(groupJid, { 
                            text: `⚠️ السلام عليكم @${senderJid.split('@')[0]}، ممنوع تحط الروابط فمجموعة "عالم السلوك". هادا **الإنذار الأول** ديالك من طرف المؤسس أمين.`,
                            mentions: [senderJid]
                        });
                    } 
                    else if (currentWarnings >= 2) {
                        // الإنذار الثاني والطرد
                        await sock.sendMessage(groupJid, { 
                            text: `🚫 @${senderJid.split('@')[0]}، هادا **الإنذار الثاني** والأخير! بما أنك عاودتي حطيتي رابط، بقوانين مجموعة "عالم السلوك" والمؤسس أمين، بالسلامة عليك راك مطرود.`,
                            mentions: [senderJid]
                        });
                        
                        // طرد العضو من القروب
                        await sock.groupParticipantsUpdate(groupJid, [senderJid], "remove");
                        
                        // مسح سجل الإنذارات ديال العضو
                        warnings.delete(senderJid);
                    }

                } catch (error) {
                    console.error("خطأ (تأكد أن البوت مشرف/Admin في المجموعة):", error);
                }
            }
        }
    });
}

connectToWhatsApp();
