document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentType = 'given'; // 'given' or 'received'
    let currentStep = 1;
    const totalSteps = 4;
    let records = JSON.parse(localStorage.getItem('giftRecords')) || [];

    // Elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const steps = document.querySelectorAll('.step');
    const progressBar = document.getElementById('progress-bar');
    
    // Inputs
    const inputName = document.getElementById('friend-name');
    const inputItem = document.getElementById('gift-item');
    const inputPrice = document.getElementById('gift-price');
    const inputDate = document.getElementById('gift-date');
    const summaryPreview = document.getElementById('summary-preview');
    
    // History
    const historyList = document.getElementById('history-list');
    const totalAmountBadge = document.getElementById('total-amount');

    // Init Date
    inputDate.value = new Date().toISOString().split('T')[0];

    // Render initial history
    renderHistory();

    // Tab Logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentType = btn.dataset.type;
            
            // Update UI Colors
            if(currentType === 'received') {
                progressBar.style.backgroundColor = 'var(--color-secondary)';
                document.getElementById('step1-desc').textContent = 'だれからもらった？';
                document.querySelector('.step[data-step="2"] .step-desc').textContent = 'どんなものをもらった？';
            } else {
                progressBar.style.backgroundColor = 'var(--color-primary)';
                document.getElementById('step1-desc').textContent = 'だれへのプレゼント？';
                document.querySelector('.step[data-step="2"] .step-desc').textContent = 'どんなものをプレゼントした？';
            }
            
            resetForm();
            renderHistory();
        });
    });

    // Step Navigation
    window.nextStep = () => {
        // Validation
        if (currentStep === 1 && !inputName.value.trim()) {
            shakeInput(inputName);
            return;
        }
        if (currentStep === 2 && !inputItem.value.trim()) {
            shakeInput(inputItem);
            return;
        }
        if (currentStep === 3 && !inputPrice.value.trim()) {
            shakeInput(inputPrice);
            return;
        }

        if (currentStep < totalSteps) {
            currentStep++;
            updateSteps();
        }
        
        if (currentStep === 4) {
            updateSummaryPreview();
        }
    };

    window.prevStep = () => {
        if (currentStep > 1) {
            currentStep--;
            updateSteps();
        }
    };

    function updateSteps() {
        steps.forEach(step => {
            step.classList.remove('active');
            if (parseInt(step.dataset.step) === currentStep) {
                step.classList.add('active');
            }
        });
        progressBar.style.width = `${(currentStep / totalSteps) * 100}%`;
        
        // Focus logic
        setTimeout(() => {
            if (currentStep === 1) inputName.focus();
            if (currentStep === 2) inputItem.focus();
            if (currentStep === 3) inputPrice.focus();
        }, 50);
    }

    function shakeInput(input) {
        input.style.animation = 'shake 0.4s';
        setTimeout(() => input.style.animation = '', 400);
    }
    
    // Add CSS for shake dynamically
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
        }
    `;
    document.head.appendChild(style);

    function updateSummaryPreview() {
        const actionText = currentType === 'given' ? 'あげる！' : 'もらった！';
        const price = inputPrice.value ? parseInt(inputPrice.value).toLocaleString() : '0';
        
        if (currentType === 'received') {
            summaryPreview.innerHTML = `
                <div style="font-size:1.1rem">👤 <strong>${escapeHTML(inputName.value)}</strong> から</div>
                <div style="font-size:1.1rem">🎁 <strong>${escapeHTML(inputItem.value)}</strong> を</div>
                <div style="font-size:1.1rem">💰 <strong>¥${price}</strong> で</div>
                <div style="margin-top:0.5rem; text-align:center; font-size:1.3rem; color:var(--color-secondary);">
                    ${actionText}
                </div>
            `;
        } else {
            summaryPreview.innerHTML = `
                <div style="font-size:1.1rem">👤 <strong>${escapeHTML(inputName.value)}</strong> に</div>
                <div style="font-size:1.1rem">🎁 <strong>${escapeHTML(inputItem.value)}</strong> を</div>
                <div style="font-size:1.1rem">💰 <strong>¥${price}</strong> で</div>
                <div style="margin-top:0.5rem; text-align:center; font-size:1.3rem; color:var(--color-accent1);">
                    ${actionText}
                </div>
            `;
        }
    }

    // Form Submission
    document.getElementById('gift-form').addEventListener('submit', (e) => {
        e.preventDefault();

        const newRecord = {
            id: Date.now().toString(),
            type: currentType,
            friendName: inputName.value,
            giftItem: inputItem.value,
            price: parseInt(inputPrice.value, 10) || 0,
            date: inputDate.value
        };

        records.push(newRecord);
        localStorage.setItem('giftRecords', JSON.stringify(records));
        
        // Confetti!
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#FF9F43', '#00D2D3', '#FF6B6B', '#FECA57']
            });
        }

        resetForm();
        renderHistory();
    });

    window.deleteRecord = (id) => {
        if(confirm('ほんとにけす？')) {
            records = records.filter(record => record.id !== id);
            localStorage.setItem('giftRecords', JSON.stringify(records));
            renderHistory();
        }
    };

    function resetForm() {
        inputName.value = '';
        inputItem.value = '';
        inputPrice.value = '';
        currentStep = 1;
        updateSteps();
    }

    function renderHistory() {
        const filteredRecords = records.filter(r => r.type === currentType);
        filteredRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

        const total = filteredRecords.reduce((sum, record) => sum + record.price, 0);
        totalAmountBadge.textContent = `ごうけい: ¥${total.toLocaleString()}`;
        
        if (currentType === 'received') {
            totalAmountBadge.style.backgroundColor = 'var(--color-secondary)';
        } else {
            totalAmountBadge.style.backgroundColor = 'var(--color-primary)';
        }

        if (filteredRecords.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-ghost" style="font-size: 4rem; margin-bottom: 1rem; color: #dfe6e9;"></i>
                    <p>まだなにもないよ！</p>
                </div>
            `;
            return;
        }

        historyList.innerHTML = filteredRecords.map((record, index) => {
            const relationText = record.type === 'given' ? 'へ' : 'から';
            return `
            <div class="record-card ${record.type}" style="animation-delay: ${index * 0.1}s">
                <div class="record-info">
                    <h3>${escapeHTML(record.friendName)} <span style="font-size:0.9rem; color:#636e72;">さん${relationText}</span></h3>
                    <div class="record-meta">
                        <span>🎁 ${escapeHTML(record.giftItem)}</span>
                        <span>📅 ${formatDate(record.date)}</span>
                    </div>
                </div>
                <div class="record-price">
                    ¥${record.price.toLocaleString()}
                    <button type="button" class="delete-btn" onclick="deleteRecord('${record.id}')" title="けす">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const d = new Date(dateString);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }
    
    // Add "Enter" key behavior to move to next step easily
    document.querySelectorAll('.step input').forEach(input => {
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (currentStep < totalSteps) {
                    nextStep();
                } else {
                    document.getElementById('gift-form').dispatchEvent(new Event('submit'));
                }
            }
        });
    });
});
