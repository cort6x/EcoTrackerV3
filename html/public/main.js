const API_URL = 'http://localhost:3000/api';

// фасад
class EcoApiFacade {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    get token() {
        return localStorage.getItem('authToken');
    }

    set token(value) {
        if (value) localStorage.setItem('authToken', value);
        else localStorage.removeItem('authToken');
    }

    async _request(endpoint, method = 'GET', body = null) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

        const config = { method, headers };
        if (body) config.body = JSON.stringify(body);

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, config);
            if (response.status === 204) return { ok: true, status: 204, data: null };
            
            const data = await response.json().catch(() => ({})); 
            return { ok: response.ok, status: response.status, data };
        } catch (error) {
            console.error('API Error:', error);
            return { ok: false, status: 0, data: { message: 'Ошибка сети или сервера.' } };
        }
    }

    async login(username, password) {
        return this._request('/login', 'POST', { username, password });
    }
    async register(username, email, password) {
        return this._request('/register', 'POST', { username, email, password });
    }
    async getUser() {
        return this._request('/user');
    }

    async getActions() {
        return this._request('/actions');
    }
    async createRecord(actionId, quantity, date) {
        return this._request('/record', 'POST', { action_id: actionId, quantity, record_date: date });
    }
    async getRecords() {
        return this._request('/records');
    }
    async getReport(startDate, endDate) {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        const query = params.toString() ? `?${params.toString()}` : '';
        return this._request(`/report${query}`);
    }

    async addAction(actionData) {
        return this._request('/admin/actions', 'POST', actionData);
    }

    async updateCoefficient(actionId, coefficientId, value) {
        return this._request(`/admin/actions/${actionId}`, 'PUT', {
            coefficient_id: Number(coefficientId),
            coefficient_value: Number(value)
        });
    }

    async searchUsers(query) {
        return this._request(`/admin/users/search?query=${encodeURIComponent(query)}`);
    }
    async toggleBlockUser(userId, currentStatus) {
       
        const newStatus = currentStatus === 1 ? 0 : 1; 
        return this._request(`/admin/users/${userId}/block`, 'PUT', { is_blocked: newStatus });
    }
    async toggleUserRole(userId, currentIsAdmin) {
        const newStatus = currentIsAdmin === 1 ? 0 : 1;
        return this._request(`/admin/users/${userId}/role`, 'PUT', { is_admin: newStatus });
    }

    async mlHealth()         { return this._request('/ml/health',    'GET'); }
    async mlAutoData()       { return this._request('/ml/auto-data', 'GET'); }
    async mlPredict(payload) { return this._request('/ml/predict',   'POST', payload); }

    async getProfileStats()                    { return this._request('/profile/stats', 'GET'); }
    async changePassword(currentPassword, newPassword) {
        return this._request('/profile/change-password', 'POST', { currentPassword, newPassword });
    }
    async getAdminStats()                      { return this._request('/admin/stats', 'GET'); }
    async getAdminActivity(limit=50)           { return this._request(`/admin/activity?limit=${limit}`, 'GET'); }
    async getAllUsers()                         { return this._request('/admin/users', 'GET'); }
    async deleteUser(userId)                   { return this._request(`/admin/users/${userId}`, 'DELETE'); }
    async deleteAction(actionId)               { return this._request(`/admin/actions/${actionId}`, 'DELETE'); }
    async exportRecords()                      { return this._request('/admin/export', 'GET'); }
    async getLeaderboard(limit = 50) { return this._request(`/leaderboard?limit=${limit}`, 'GET'); }
    async getUserRating()             { return this._request('/rating', 'GET'); }
}

// состояние

class AppState {
    constructor(context) {
        this.context = context;
        this.elements = context.elements;
    }

    enter() {
        this.resetUI();
        this.activate();
    }

    resetUI() {
        this.elements.authView.classList.add('hidden');
        this.elements.dashboardView.classList.add('hidden');
        this.elements.userInfo.classList.add('hidden');
    }

    activate() { /* Переопределяется */ }
}

class LoginState extends AppState {
    activate() {
        this.elements.authView.classList.remove('hidden');
        this.elements.authTitle.textContent = 'Вход в систему';
        this.elements.loginForm.classList.remove('hidden');
        this.elements.registerForm.classList.add('hidden');
        this.elements.toggleAuthViewButton.textContent = 'Нет аккаунта? Зарегистрируйтесь!';
    }
}

class RegisterState extends AppState {
    activate() {
        this.elements.authView.classList.remove('hidden');
        this.elements.authTitle.textContent = 'Регистрация';
        this.elements.loginForm.classList.add('hidden');
        this.elements.registerForm.classList.remove('hidden');
        this.elements.toggleAuthViewButton.textContent = 'Уже есть аккаунт? Войдите!';
    }
}

class DashboardState extends AppState {
    activate() {
        this.elements.dashboardView.classList.remove('hidden');
        this.elements.userInfo.classList.remove('hidden');
        
        const user = this.context.currentUser;
        if (user) {
            const welcomeText = user.isAdmin === 1 
                ? `Добро пожаловать, ${user.username}!` 
                : `Добро пожаловать, ${user.username}!`;
            document.getElementById('welcome-message').textContent = welcomeText;
                        this.context.showWelcomeBanner(user);
            

            if (user.isAdmin === 1) {
                this.elements.adminTab.classList.remove('hidden');
            } else {
                this.elements.adminTab.classList.add('hidden');
            }
        }

        this.context.loadActions();
        this.context.loadRecordsAndReport();
        this.context.switchTab('record');
    }
}

class AppContext {
    constructor() {
        this.api = new EcoApiFacade(API_URL);
        this.currentUser = null;
        this.chartInstance = null;
        this.actionsList = [];
        this.currentTab = 'record';

        this.elements = {
            app: document.getElementById('app'),
            authView: document.getElementById('auth-view'),
            dashboardView: document.getElementById('dashboard-view'),
            authTitle: document.getElementById('auth-title'),
            loginForm: document.getElementById('login-form'),
            registerForm: document.getElementById('register-form'),
            toggleAuthViewButton: document.getElementById('toggle-auth-view'),
            userInfo: document.getElementById('user-info'),
            logoutButton: document.getElementById('logout-button'),
            messageBox: document.getElementById('message-box'),

            tabRecord: document.getElementById('tab-record'),
            tabReport: document.getElementById('tab-report'),
            tabMethodology: document.getElementById('tab-methodology'),
            adminPanel: document.getElementById('admin-panel'),
            adminTab: document.getElementById('admin-tab'),
            tabML: document.getElementById('tab-ml'),
            tabProfile: document.getElementById('tab-profile'),
            tabRating: document.getElementById('tab-rating'),
         
            recordForm: document.getElementById('record-form'),
            actionsSelect: document.getElementById('action-id'),
            quantityUnit: document.getElementById('quantity-unit'),
            actionDescription: document.getElementById('action-description'),
            recordsList: document.getElementById('records-list'),
            reportStartDate: document.getElementById('report-start-date'),
            reportEndDate: document.getElementById('report-end-date'),
            applyReportFilterButton: document.getElementById('apply-report-filter'),
       
            adminActionsList: document.getElementById('admin-actions-list'),
            adminAddActionForm: document.getElementById('admin-add-action-form'),
            userSearchResults: document.getElementById('admin-user-search-results'),
            adminUserSearchForm: document.getElementById('admin-user-search-form'),
            editModal: document.getElementById('edit-modal'),
            editCoefficientForm: document.getElementById('admin-edit-coefficient-form'),
            modalCloseBtn: document.getElementById('modal-close')
        };

        this.states = {
            login: new LoginState(this),
            register: new RegisterState(this),
            dashboard: new DashboardState(this)
        };
        this.currentState = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.applyTheme();
        document.getElementById('record-date').valueAsDate = new Date();
        this.checkAuthStatus();
    }

    changeState(stateName) {
        if (this.states[stateName]) {
            this.currentState = this.states[stateName];
            this.currentState.enter();
        }
    }

    async checkAuthStatus() {
        if (!this.api.token) {
            this.changeState('login');
            return;
        }

        const res = await this.api.getUser();
        if (res.ok) {
            if (res.data.isBlocked === 1) {
                this.logout('Ваш аккаунт заблокирован.');
            } else {
                this.currentUser = res.data;
                this.changeState('dashboard');
            }
        } else {
            this.logout(res.status === 403 ? 'Доступ запрещен.' : null);
        }
    }

    logout(message = null) {
        this.api.token = null;
        this.currentUser = null;
        this.elements.adminTab.classList.add('hidden');
        this.elements.tabMethodology.classList.add('hidden');
        this.elements.adminPanel.classList.add('hidden');
        
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
        
        this.changeState('login');
        if (message) this.showMessage(message, 'error');
    }

    showMessage(message, type = 'success') {
        const box = this.elements.messageBox;
        box.textContent = message;
        const _bg = type === 'success' ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#ef4444,#dc2626)';
        box.style.cssText = `top:1.25rem;right:1.25rem;z-index:200;position:fixed;padding:0.875rem 1.25rem;border-radius:0.875rem;box-shadow:0 8px 24px rgba(0,0,0,0.14);color:#fff;font-weight:600;font-size:0.9rem;min-width:260px;background:${_bg};`;
        box.classList.remove('alert-hidden');
        setTimeout(() => box.classList.add('alert-hidden'), 5000);
    }
    toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('eco_theme', isDark ? 'dark' : 'light');
        document.getElementById('theme-icon-moon').style.display = isDark ? 'none' : '';
        document.getElementById('theme-icon-sun').style.display = isDark ? '' : 'none';
    }

    applyTheme() {
        const saved = localStorage.getItem('eco_theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = saved ? saved === 'dark' : prefersDark;
        if (isDark) {
            document.documentElement.classList.add('dark');
            const moon = document.getElementById('theme-icon-moon');
            const sun = document.getElementById('theme-icon-sun');
            if (moon) moon.style.display = 'none';
            if (sun) sun.style.display = '';
        }
    }
    showWelcomeBanner(user) {
        const key = `eco_welcomed_${user.userId}`;
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');

        const banner = document.createElement('div');
        banner.className = 'welcome-banner';
        banner.innerHTML = `
            <div class="welcome-banner-inner">
                <div class="welcome-banner-left">
                    <div class="welcome-banner-emoji">🌿</div>
                    <div>
                        <div class="welcome-banner-title">Добро пожаловать, ${user.username}!</div>
                        <div class="welcome-banner-sub">Начните с добавления первой записи — выберите действие и укажите количество.</div>
                    </div>
                </div>
                <div class="welcome-banner-steps">
                    <div class="wb-step"><span class="wb-num">1</span> Выберите действие</div>
                    <div class="wb-step"><span class="wb-num">2</span> Укажите количество</div>
                    <div class="wb-step"><span class="wb-num">3</span> Нажмите «Сохранить»</div>
                </div>
                <button class="welcome-banner-close" onclick="this.closest('.welcome-banner').remove()">✕</button>
            </div>`;
        const dash = document.getElementById('dashboard-view');
        dash.insertBefore(banner, dash.firstChild);
    }

    switchTab(tabName) {
        this.currentTab = tabName;
        ['tabRecord', 'tabReport', 'tabMethodology', 'adminPanel', 'tabML', 'tabProfile', 'tabRating'].forEach(k => {
            if(this.elements[k]) this.elements[k].classList.add('hidden');
        });
        
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));

        const contentId = tabName === 'admin' ? 'admin-panel' : `tab-${tabName}`;
        const content = document.getElementById(contentId);
        if (content) content.classList.remove('hidden');

        const btn = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
        if (btn) btn.classList.add('active');

        if (tabName === 'admin') {
            this.loadActions(true);
            this.switchAdminPane('overview');
            this.loadAdminOverview();
            this.setupAdminSubnav();
        }
        if (tabName === 'ml') { this.checkMLHealth(); this.quizInit(); }
        if (tabName === 'profile') { this.loadProfileTab(); }
        if (tabName === 'rating') { this.loadRatingTab(); }
    }

    async loadActions(isAdminView = false) {
        const res = await this.api.getActions();
        if (res.ok) {
            this.actionsList = res.data;
            this.populateActionsSelect(res.data);
            if (isAdminView) this.renderAdminActionsList(res.data);
        } else {
            this.showMessage('Ошибка загрузки действий', 'error');
        }
    }

    populateActionsSelect(actions) {
        const select = this.elements.actionsSelect;
        select.innerHTML = '<option value="">Выберите действие...</option>';
        actions.forEach(action => {
            const option = document.createElement('option');
            option.value = action.id;
            option.textContent = `${action.name} (${action.category})`;
            option.dataset.unit = action.unit_of_measure;
            option.dataset.description = action.description;
            select.appendChild(option);
        });
    }

    async loadRecordsAndReport() {
        const startDate = this.elements.reportStartDate.value;
        const endDate = this.elements.reportEndDate.value;

        try {
            const [reportRes, recordsRes] = await Promise.all([
                this.api.getReport(startDate, endDate),
                this.api.getRecords()
            ]);

            if (reportRes.ok) this.renderReport(reportRes.data);
            if (recordsRes.ok) this.renderRecordsList(recordsRes.data);
        } catch (e) {
            console.error(e);
            this.showMessage('Ошибка загрузки данных', 'error');
        }
    }

    renderRecordsList(records) {
        const list = this.elements.recordsList;
        list.innerHTML = '';

        if (!records.length) {
            list.innerHTML = `<div class="empty-state">
                <div class="empty-state-icon">🌱</div>
                <div class="empty-state-title">Записей пока нет</div>
                <div class="empty-state-sub">Начните отслеживать свой экологический след — добавьте первую запись</div>
                <button class="empty-state-btn" onclick="app.switchTab('record')">+ Добавить запись</button>
            </div>`;
            return;
        }

        records.forEach(r => {
            const actionName = r.action_name ?? r.actionname ?? '—';
            const unit = r.unit_of_measure ?? r.unitofmeasure ?? '';
            const date = r.record_date ?? r.recorddate ?? '';
            const emissionUnit = r.emission_unit ?? r.emissionunit ?? 'kg CO2e';

            const coeff = Number(r.coefficient_value ?? r.coefficientvalue ?? 0);
            const qty = Number(r.quantity ?? 0);
            const contribution = Number(r.contribution ?? (qty * coeff));

            const div = document.createElement('div');
            div.className = 'record-item';
            div.innerHTML = `
            <div class="record-dot"></div>
            <div style="flex:1;">
                <p class="record-action-name">${actionName}</p>
                <p class="record-meta">${qty} ${unit} &bull; ${date}</p>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <p class="record-value">−${contribution.toFixed(2)}</p>
                <p style="font-size:0.72rem;color:#5a8a70;">${emissionUnit}</p>
            </div>
            `;
            list.appendChild(div);
        });
    }


    renderReport(report) {
        const totalEl = document.getElementById('total-contribution');
        const unitEl = document.getElementById('contribution-unit');
        const chartCanvas = document.getElementById('contribution-chart');
        const noDataMsg = document.getElementById('no-data-msg');
        const treeEl = document.getElementById('tree-equivalent');

        if (report.total_contribution > 0) {
            totalEl.textContent = report.total_contribution.toFixed(2);
            unitEl.textContent = report.unit;
            if(treeEl) treeEl.textContent = Math.floor(report.total_contribution / 22).toString(); // Пример расчета
            
            chartCanvas.classList.remove('hidden');
            noDataMsg.classList.add('hidden');

            if (this.chartInstance) this.chartInstance.destroy();
            
            this.chartInstance = new Chart(chartCanvas, {
                type: 'doughnut',
                data: {
                    labels: report.details_by_category.map(d => d.category),
                    datasets: [{
                        data: report.details_by_category.map(d => d.contribution),
                        backgroundColor: ['#22c55e', '#14b8a6', '#86efac', '#4ade80', '#0d9488', '#a3e635']
                    }]
                },
                options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#2d6645', font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 }, boxWidth: 12, padding: 10 } } } }
            });
        } else {
            totalEl.textContent = '0.00';
            unitEl.textContent = 'kg CO2e';
            if(treeEl) treeEl.textContent = '0';
            if (this.chartInstance) this.chartInstance.destroy();
            chartCanvas.classList.add('hidden');
            noDataMsg.classList.remove('hidden');
        }
    }

    renderAdminActionsList(actions) {
        const list = document.getElementById('admin-actions-list');
        if (!list) return;
        list.innerHTML = '';
        if (!actions.length) {
            list.innerHTML = `<div class="empty-state" style="padding:1.25rem">
                <div class="empty-state-icon">📋</div>
                <div class="empty-state-title">Нет действий</div>
                <div class="empty-state-sub">Добавьте первое действие через форму выше</div>
            </div>`;
            return;
        }
        actions.forEach(action => {
            const div = document.createElement('div');
            div.className = 'admin-row';
            div.innerHTML = `
                <div style="flex:1;min-width:0;">
                    <p style="font-weight:600;color:#1a3a28;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${action.name} <span style="font-size:0.75rem;color:#5a8a70;">(${action.category})</span></p>
                    <p style="font-size:0.8125rem;color:#2d6645;">Коэф: <span style="font-weight:700;color:#0d9488;">${action.coefficient_value}</span> ${action.emission_unit} / ${action.unit_of_measure}</p>
                </div>
                <button 
                    data-action-id="${action.id}"
                    data-action-name="${action.name}"
                    data-coefficient-id="${action.coefficient_id}"
                    data-coefficient-value="${action.coefficient_value}"
                    class="admin-edit-action"
                    style="padding:0.4rem 0.875rem;font-size:0.8rem;border-radius:0.5rem;cursor:pointer;border:1.5px solid rgba(22,163,74,0.25);background:rgba(22,163,74,0.10);color:#16a34a;font-weight:600;flex-shrink:0;font-family:inherit;"
                >Изменить</button>
            `;
            list.appendChild(div);
        });
    }

    renderUsersTable(users, container) {
        const el = container || document.getElementById('admin-user-search-results');
        if (!el) return;
        if (!users || users.length === 0) {
            el.innerHTML = `<div class="empty-state" style="padding:1.25rem">
                <div class="empty-state-icon">👤</div>
                <div class="empty-state-title">Пользователи не найдены</div>
                <div class="empty-state-sub">Попробуйте другой запрос</div>
            </div>`;
            return;
        }
        const badge = document.getElementById('admin-users-count');
        if (badge) badge.textContent = users.length;
        const rows = users.map(u => {
            const roleBadge = u.is_admin
                ? '<span class="ut-admin">Admin</span>'
                : '<span class="ut-user">User</span>';
            const statusBadge = u.is_blocked
                ? '<span class="ut-blocked">Заблокирован</span>'
                : '<span class="ut-active">Активен</span>';
            const blockTxt = u.is_blocked ? 'Разблокировать' : 'Заблокировать';
            const blockCls = u.is_blocked ? 'tbl-btn tbl-btn-unblock' : 'tbl-btn tbl-btn-block';
            const roleTxt  = u.is_admin   ? 'Сделать User'   : 'Сделать Admin';
            return `<tr>
                <td data-label="Имя"><span style="font-weight:700;color:var(--c-text);">${u.username}</span></td>
                <td data-label="Email" style="color:var(--c-text-muted);font-size:0.78rem;">${u.email || '—'}</td>
                <td data-label="Роль">${roleBadge}</td>
                <td data-label="Статус">${statusBadge}</td>
                <td data-label="Рег." style="white-space:nowrap;font-size:0.72rem;color:var(--c-text-muted);">${u.registration_date ? u.registration_date.slice(0,10) : '—'}</td>
                <td data-label="Действия" style="white-space:nowrap;">
                  <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                    <button class="tbl-btn ${blockCls}" data-id="${u.id}" data-action="block" data-val="${u.is_blocked}">${blockTxt}</button>
                    <button class="tbl-btn tbl-btn-role" data-id="${u.id}" data-action="role" data-val="${u.is_admin}">${roleTxt}</button>
                    <button class="tbl-btn tbl-btn-delete" data-id="${u.id}" data-action="delete">Удалить</button>
                  </div>
                </td>
            </tr>`;
        }).join('');
        el.innerHTML = `<table class="admin-table">
            <thead><tr>
              <th>Имя</th><th>Email</th><th>Роль</th><th>Статус</th><th>Рег.</th><th>Действия</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    renderUserSearchResults(users) {
        const list = this.elements.userSearchResults;
        if (!users.length) {
            list.innerHTML = `<div class="empty-state" style="padding:1.25rem">
                <div class="empty-state-icon">🔍</div>
                <div class="empty-state-title">Ничего не найдено</div>
                <div class="empty-state-sub">Попробуйте другое имя или email</div>
            </div>`;
            return;
        }
        list.innerHTML = users.map(u => {
            const isSelf = u.id === this.currentUser.userId;
            const blockTxt = u.is_blocked ? 'Разблокировать' : 'Заблокировать';
            const blockSt = u.is_blocked
                ? 'background:rgba(234,179,8,0.15);color:#b45309;border:1.5px solid rgba(234,179,8,0.30);'
                : 'background:rgba(239,68,68,0.12);color:#dc2626;border:1.5px solid rgba(239,68,68,0.25);';
            const roleTxt = u.is_admin ? 'Сделать User' : 'Сделать Admin';
            const roleSt = 'background:rgba(34,197,94,0.12);color:#16a34a;border:1.5px solid rgba(34,197,94,0.25);';
            return `
            <div class="admin-row" style="flex-wrap:wrap;gap:0.75rem;">
                <div style="flex:1;min-width:160px;">
                    <p style="font-weight:700;color:#1a3a28;">${u.username} ${isSelf ? '<span style=&quot;font-size:0.75rem;color:#5a8a70;&quot;>(Вы)</span>' : ''}</p>
                    <p style="font-size:0.8125rem;color:#5a8a70;">${u.email} &bull; ID: ${u.id}</p>
                    <p style="font-size:0.75rem;margin-top:0.2rem;">
                        <span style="font-weight:600;color:${u.is_admin ? '#0d9488' : '#5a8a70'};">${u.is_admin ? 'Admin' : 'User'}</span>
                        &bull;
                        <span style="font-weight:600;color:${u.is_blocked ? '#dc2626' : '#16a34a'};">${u.is_blocked ? 'Blocked' : 'Active'}</span>
                    </p>
                </div>
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
                    ${!isSelf ? `
                    <button data-id="${u.id}" data-action="block" data-val="${u.is_blocked}" class="admin-user-act" style="${blockSt}padding:0.4rem 0.875rem;font-size:0.8rem;border-radius:0.5rem;cursor:pointer;font-weight:600;font-family:inherit;">${blockTxt}</button>
                    <button data-id="${u.id}" data-action="role" data-val="${u.is_admin}" class="admin-user-act" style="${roleSt}padding:0.4rem 0.875rem;font-size:0.8rem;border-radius:0.5rem;cursor:pointer;font-weight:600;font-family:inherit;">${roleTxt}</button>
                    ` : '<span style=&quot;font-size:0.75rem;color:#94c4a8;&quot;>Действия недоступны</span>'}
                </div>
            </div>`;
        }).join('');
    }

    bindEvents() {
        this.elements.loginForm.addEventListener('submit', (e) => this.handleAuth(e, 'login'));
        this.elements.registerForm.addEventListener('submit', (e) => this.handleAuth(e, 'register'));
        this.elements.toggleAuthViewButton.addEventListener('click', () => {
            const isLogin = !this.elements.loginForm.classList.contains('hidden');
            this.changeState(isLogin ? 'register' : 'login');
        });
        this.elements.logoutButton.addEventListener('click', () => this.logout('Вы вышли из системы.'));

        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab));
        });

        this.elements.actionsSelect.addEventListener('change', () => this.handleActionChange());
        this.elements.recordForm.addEventListener('submit', (e) => this.handleRecordSubmit(e));

        this.elements.applyReportFilterButton.addEventListener('click', () => this.loadRecordsAndReport());

        if (this.elements.adminAddActionForm) {
            this.elements.adminAddActionForm.addEventListener('submit', (e) => this.handleAdminAddAction(e));
        }

        if (this.elements.modalCloseBtn) {
            this.elements.modalCloseBtn.addEventListener('click', () => this.elements.editModal.classList.add('hidden'));
        }
        if (this.elements.editCoefficientForm) {
            this.elements.editCoefficientForm.addEventListener('submit', (e) => this.handleAdminEditCoefficient(e));
        }

        this.elements.adminActionsList.addEventListener('click', (e) => {
            const btn = e.target.closest('.admin-edit-action');
            if (btn) this.openEditModal(btn.dataset);
        });

        if (this.elements.adminUserSearchForm) {
            this.elements.adminUserSearchForm.addEventListener('submit', (e) => this.handleUserSearch(e));
        }
        if (this.elements.userSearchResults) {
            this.elements.userSearchResults.addEventListener('click', (e) => this.handleUserActionDelegation(e));
        }
        const mlForm = document.getElementById('ml-predict-form');
        if (mlForm) mlForm.addEventListener('submit', (e) => this.handleMLPredict(e));

        const cpForm = document.getElementById('change-password-form');
        if (cpForm) cpForm.addEventListener('submit', (e) => this.handleChangePassword(e));

        const cpNew = document.getElementById('cp-new');
        if (cpNew) cpNew.addEventListener('input', () => this.updatePasswordStrength());
    }

    async handleAuth(e, type) {
        e.preventDefault();
        const f = e.target;
        const _btn = f.querySelector('button[type="submit"]');
        const _orig = _btn ? _btn.innerHTML : '';
        if (_btn) { _btn.disabled = true; _btn.innerHTML = type === 'login' ? '⏳&nbsp;Вхожу...' : '⏳&nbsp;Регистрирую...'; }

        const res = type === 'login'
            ? await this.api.login(f['login-username'].value, f['login-password'].value)
            : await this.api.register(f['register-username'].value, f['register-email'].value, f['register-password'].value);
        if (_btn) { _btn.disabled = false; _btn.innerHTML = _orig; }

        if (res.ok) {
            this.showMessage(res.data.message, 'success');
            if (type === 'login') {
                this.api.token = res.data.token;
                this.checkAuthStatus();
            } else {
                this.changeState('login');
            }
        } else {
            this.showMessage(res.data.message || 'Ошибка', 'error');
        }
    }

    handleActionChange() {
        const opt = this.elements.actionsSelect.selectedOptions[0];
        if (opt && opt.value) {
            this.elements.quantityUnit.textContent = `Ед. изм.: ${opt.dataset.unit}`;
            this.elements.actionDescription.textContent = opt.dataset.description;
        } else {
            this.elements.quantityUnit.textContent = 'Ед. изм.: -';
            this.elements.actionDescription.textContent = '';
        }
    }
    _showSuccessAnimation() {
        const el = document.createElement('div');
        el.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);
            font-size:4rem;z-index:9999;pointer-events:none;animation:popBig .6s cubic-bezier(.16,1,.3,1) forwards;`;
        el.textContent = '🌿';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 700);
    }

    async handleRecordSubmit(e) {
        e.preventDefault();
        const actionId = this.elements.actionsSelect.value;
        const qty = document.getElementById('quantity').value;
        const date = document.getElementById('record-date').value;

        if (!actionId || qty <= 0) return this.showMessage('Проверьте данные', 'error');

        const btn = e.target.querySelector('button[type="submit"]');
        const origText = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Сохраняю...'; }

        const res = await this.api.createRecord(actionId, qty, date);
        if (btn) { btn.disabled = false; btn.innerHTML = origText; }
        if (res.ok) {
            this.showMessage('✅ ' + res.data.message, 'success');
            this._showSuccessAnimation();
            this.elements.recordForm.reset();
            this.elements.quantityUnit.textContent = 'Ед. изм.: -';
            this.elements.actionDescription.textContent = '';
            document.getElementById('record-date').valueAsDate = new Date();
            this.loadRecordsAndReport();
        } 
        if (res.data && res.data.newAchievements && res.data.newAchievements.length > 0) {
            res.data.newAchievements.forEach(ach => {
                setTimeout(() => this.showAchievementToast(ach), 600);
            });
        }
        else {
            this.showMessage(res.data.message, 'error');
        }
    }

    async handleAdminAddAction(e) {
        e.preventDefault();
        const f = e.target;
        const _btn = f.querySelector('button[type="submit"]');
        const _orig = _btn ? _btn.innerHTML : '';
        if (_btn) { _btn.disabled = true; _btn.innerHTML = '⏳'; }
        const data = {
            name: f['add-name'].value,
            description: f['add-description'].value,
            category: f['add-category'].value,
            unit_of_measure: f['add-unit-of-measure'].value,
            coefficient_value: parseFloat(f['add-coefficient-value'].value),
            emission_unit: f['add-emission-unit'].value || 'kg CO2e'
        };

        const res = await this.api.addAction(data);
        if (_btn) { _btn.disabled = false; _btn.innerHTML = _orig; }
        if (res.ok) {
            this.showMessage('Действие добавлено', 'success');
            f.reset();
            this.loadActions(true);
        } else {
            this.showMessage(res.data.message, 'error');
        }
    }

    openEditModal(data) {
        document.getElementById('modal-action-name').textContent = `Действие: ${data.actionName}`;
        document.getElementById('modal-action-id').value = data.actionId;
        document.getElementById('modal-coefficient-id').value = data.coefficientId;
        document.getElementById('modal-coefficient-value').value = data.coefficientValue;
        this.elements.editModal.classList.remove('hidden');
    }

    async handleAdminEditCoefficient(e) {
        e.preventDefault();
        const aId = document.getElementById('modal-action-id').value;
        const cId = document.getElementById('modal-coefficient-id').value;
        const val = parseFloat(document.getElementById('modal-coefficient-value').value);

        const res = await this.api.updateCoefficient(aId, cId, val);
        if (res.ok) {
            this.showMessage('Коэффициент обновлен', 'success');
            this.elements.editModal.classList.add('hidden');
            this.loadActions(true);
        } else {
            this.showMessage(res.data.message, 'error');
        }
    }

    async handleUserSearch(e) {
        e.preventDefault();
        const q = document.getElementById('user-search-query').value;
        if (q.length < 2) return this.showMessage('Минимум 2 символа', 'error');

        const res = await this.api.searchUsers(q);
        if (res.ok) {
            this.renderUserSearchResults(res.data);
        } else {
            this.showMessage(res.data.message, 'error');
        }
    }



    // ─── ADMIN PANEL METHODS ──────────────────────────────────

    switchAdminPane(name) {
        document.querySelectorAll('.admin-pane').forEach(p => p.classList.add('hidden'));
        document.querySelectorAll('.admin-subnav-btn').forEach(b => b.classList.remove('active'));
        const pane = document.getElementById('admin-pane-' + name);
        if (pane) pane.classList.remove('hidden');
        document.querySelectorAll(`[data-admin-tab="${name}"]`).forEach(b => b.classList.add('active'));
    }

    setupAdminSubnav() {
        document.querySelectorAll('.admin-subnav-btn').forEach(btn => {
            btn.onclick = () => {
                const t = btn.dataset.adminTab;
                if (!t) return;
                this.switchAdminPane(t);
                if (t === 'activity') this.loadAdminActivity();
                if (t === 'users')    this.loadAllUsers();
                if (t === 'actions')  this.loadActions(true);
            };
        });
        const exportBtn = document.getElementById('admin-export-btn');
        if (exportBtn) exportBtn.onclick = () => this.handleAdminExport();

        const loadAllBtn = document.getElementById('admin-users-load-all');
        if (loadAllBtn) loadAllBtn.onclick = () => this.loadAllUsers();

        const searchBtn = document.getElementById('admin-user-search-btn');
        if (searchBtn) searchBtn.onclick = () => {
            const q = document.getElementById('user-search-query')?.value?.trim();
            if (q) this.handleUserSearch({ preventDefault: () => {}, target: { querySelector: () => ({ value: q }) } });
        };

        const actLimit = document.getElementById('activity-limit');
        if (actLimit) actLimit.onchange = () => this.loadAdminActivity();

        // Wire up users table delegation
        const usersWrap = document.getElementById('admin-user-search-results');
        if (usersWrap) usersWrap.addEventListener('click', e => this.handleUserActionDelegation(e));

        // Wire up actions list delegation for delete
        const actList = document.getElementById('admin-actions-list');
        if (actList) actList.addEventListener('click', e => {
            const delBtn = e.target.closest('.admin-delete-action');
            if (delBtn) this.handleDeleteAction(parseInt(delBtn.dataset.actionId));
        });
    }

    async loadAdminOverview() {
        try {
            const [statsRes, actRes] = await Promise.all([
                this.api.getAdminStats(),
                this.api.getAdminActivity(5)
            ]);
            if (statsRes.ok) this.renderAdminKPIs(statsRes.data);
            if (actRes.ok)   this.renderOverviewActivity(actRes.data);
        } catch (e) {}
    }

    renderAdminKPIs(d) {
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('kpi-total-users',   d.totalUsers?.cnt ?? '—');
        set('kpi-total-records', d.totalRecords?.cnt ?? '—');
        set('kpi-total-co2',     d.totalCo2?.total != null ? parseFloat(d.totalCo2.total).toFixed(1) : '0');
        set('kpi-active-today',  d.activeToday?.cnt ?? '0');
        set('kpi-top-action',    d.topAction?.name ?? '—');
        set('kpi-top-user',      d.topUser?.username ?? '—');
        const newW = d.newUsersWeek?.cnt;
        if (newW != null) set('kpi-new-users-week', '+' + newW + ' за неделю');
        const actW = d.activeWeek?.cnt;
        if (actW != null) set('kpi-active-week', actW + ' за неделю');
        const badge = document.getElementById('admin-users-count');
        if (badge) badge.textContent = d.totalUsers?.cnt ?? '—';
    }

    renderOverviewActivity(rows) {
        const el = document.getElementById('admin-overview-activity');
        if (!el) return;
        if (!rows || rows.length === 0) { el.innerHTML = '<p style="color:var(--c-text-muted);font-size:0.82rem;padding:0.5rem 0;">Нет данных.</p>'; return; }
        el.innerHTML = rows.map(r => this._activityRowHTML(r)).join('');
    }

    _activityRowHTML(r) {
        const co2 = r.contribution != null ? parseFloat(r.contribution).toFixed(2) + ' кг' : '';
        return `<div class="activity-row">
            <div class="activity-dot"></div>
            <span class="activity-user">${r.username}</span>
            <span class="activity-action">${r.action_name}: ${r.quantity} ${r.unit_of_measure}</span>
            <span class="activity-cat">${r.category}</span>
            <span class="activity-co2">${co2}</span>
            <span class="activity-date">${r.record_date || ''}</span>
        </div>`;
    }

    async loadAdminActivity() {
        const limit = parseInt(document.getElementById('activity-limit')?.value) || 50;
        const el = document.getElementById('admin-activity-list');
        if (!el) return;
        el.innerHTML = '<p style="color:var(--c-text-muted);font-size:0.82rem;padding:0.5rem 0;">Загрузка...</p>';
        const res = await this.api.getAdminActivity(limit);
        if (res.ok && res.data.length > 0) {
            el.innerHTML = res.data.map(r => this._activityRowHTML(r)).join('');
        } else {
            el.innerHTML = '<p style="color:var(--c-text-muted);font-size:0.82rem;padding:0.5rem 0;">Нет данных.</p>';
        }
    }

    async loadAllUsers() {
        const el = document.getElementById('admin-user-search-results');
        if (!el) return;
        el.innerHTML = '<p style="color:var(--c-text-muted);font-size:0.82rem;">Загрузка...</p>';
        const res = await this.api.getAllUsers();
        if (res.ok) this.renderUsersTable(res.data, el);
    }

    async handleDeleteUser(userId) {
        if (!confirm('Удалить пользователя? Все его записи также будут удалены.')) return;
        const res = await this.api.deleteUser(userId);
        if (res.ok) {
            this.showMessage('Пользователь удалён.', 'success');
            this.loadAllUsers();
        } else {
            this.showMessage(res.data?.message || 'Ошибка удаления.', 'error');
        }
    }

    async handleDeleteAction(actionId) {
        if (!confirm('Удалить действие? Все связанные записи также будут удалены.')) return;
        const res = await this.api.deleteAction(actionId);
        if (res.ok) {
            this.showMessage('Действие удалено.', 'success');
            this.loadActions(true);
        } else {
            this.showMessage(res.data?.message || 'Ошибка удаления.', 'error');
        }
    }

    async handleAdminExport() {
        const btn = document.getElementById('admin-export-btn');
        if (btn) { btn.textContent = 'Загрузка...'; btn.disabled = true; }
        try {
            const res = await fetch('/api/admin/export', {
                headers: { Authorization: 'Bearer ' + this.api.token }
            });
            if (!res.ok) throw new Error('Ошибка сервера');
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = 'ecotracker-export.csv'; a.click();
            URL.revokeObjectURL(url);
            this.showMessage('Экспорт успешно загружен.', 'success');
        } catch (e) {
            this.showMessage('Ошибка экспорта.', 'error');
        } finally {
            if (btn) { btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Экспорт CSV'; btn.disabled = false; }
        }
    }

    // ─── PROFILE METHODS ──────────────────────────────────────

    async loadProfileTab() {
        // Fill user info (already in this.currentUser from login)
        const user = this.currentUser;
        if (user) {
            const initials = (user.username || '?').slice(0, 2).toUpperCase();
            const el = id => document.getElementById(id);
            if (el('profile-avatar'))   el('profile-avatar').textContent = initials;
            if (el('profile-username')) el('profile-username').textContent = user.username;
            if (el('profile-email'))    el('profile-email').textContent = user.email || '';
            if (el('profile-role-badge')) {
                el('profile-role-badge').textContent = user.isAdmin ? 'Администратор' : 'Пользователь';
                el('profile-role-badge').style.background = user.isAdmin
                    ? 'rgba(139,92,246,0.12)' : 'rgba(34,197,94,0.12)';
                el('profile-role-badge').style.color = user.isAdmin ? '#818cf8' : 'var(--c-green-7)';
            }
            if (el('profile-session-info')) {
                el('profile-session-info').textContent = 'Активна сейчас • ' + (navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Браузер');
            }
        }
        // Load stats
        try {
            const res = await this.api.getProfileStats();
            if (res.ok) this.renderProfileStats(res.data, user);
        } catch (e) {}
    }

    renderProfileStats(data, user) {
        const el = id => document.getElementById(id);
        const tr = data.totalRecords;
        const co2 = data.totalCo2;
        const topCat = data.topCategory;
        const topAct = data.topAction;
        const l30 = data.last30;

        const totalCo2Val = co2 && co2.total ? co2.total.toFixed(1) : '0';
        const totalRec = tr && tr.cnt ? tr.cnt : 0;
        const l30cnt   = l30 && l30.cnt ? l30.cnt : 0;

        if (el('profile-total-co2'))    el('profile-total-co2').textContent  = totalCo2Val;
        if (el('stat-total-records'))   el('stat-total-records').textContent = totalRec;
        if (el('stat-last30'))          el('stat-last30').textContent        = l30cnt;
        if (el('stat-top-cat'))         el('stat-top-cat').textContent       = topCat && topCat.category ? topCat.category : '—';
        if (el('stat-top-action'))      el('stat-top-action').textContent    = topAct && topAct.name ? topAct.name : '—';

        // Registration date
        if (user && el('profile-since')) {
            if (tr && tr.first_date) {
                const first = new Date(tr.first_date);
                el('profile-since').textContent = 'Первая запись: ' + first.toLocaleDateString('ru-RU', {day:'numeric',month:'long',year:'numeric'});
            }
        }
    }

    updatePasswordStrength() {
        const pwd = document.getElementById('cp-new')?.value || '';
        const wrap = document.getElementById('cp-strength-bar-wrap');
        const fill = document.getElementById('cp-strength-fill');
        const label = document.getElementById('cp-strength-label');
        if (!wrap || !fill || !label) return;

        if (pwd.length === 0) { wrap.classList.add('hidden'); return; }
        wrap.classList.remove('hidden');

        let score = 0;
        if (pwd.length >= 6) score++;
        if (pwd.length >= 10) score++;
        if (/[A-Z]/.test(pwd)) score++;
        if (/[0-9]/.test(pwd)) score++;
        if (/[^A-Za-z0-9]/.test(pwd)) score++;

        const levels = [
            { label: 'Очень слабый', color: '#ef4444', width: '15%' },
            { label: 'Слабый',       color: '#f97316', width: '30%' },
            { label: 'Средний',      color: '#f59e0b', width: '55%' },
            { label: 'Хороший',      color: '#22c55e', width: '78%' },
            { label: 'Отличный',     color: '#14b8a6', width: '100%' },
        ];
        const lvl = levels[Math.min(score, 4)];
        fill.style.width      = lvl.width;
        fill.style.background = lvl.color;
        label.textContent     = lvl.label;
        label.style.color     = lvl.color;
    }

    async handleChangePassword(e) {
        e.preventDefault();
        const current  = document.getElementById('cp-current')?.value;
        const newPass  = document.getElementById('cp-new')?.value;
        const confirm  = document.getElementById('cp-confirm')?.value;
        const btn = e.target.querySelector('button[type="submit"]');

        if (newPass !== confirm) {
            this.showMessage('Пароли не совпадают', 'error'); return;
        }

        btn.disabled = true; btn.textContent = 'Сохраняем...';
        const res = await this.api.changePassword(current, newPass);
        btn.disabled = false; btn.textContent = 'Сохранить пароль';

        if (res.ok) {
            this.showMessage(res.data.message || 'Пароль изменён!', 'success');
            e.target.reset();
            document.getElementById('cp-strength-bar-wrap')?.classList.add('hidden');
        } else {
            this.showMessage(res.data?.message || 'Ошибка смены пароля', 'error');
        }
    }

    // ─── ML METHODS ───────────────────────────────────────────

    // ─── ML / QUIZ ──────────────────────────────────────────────

    // ─── ML / QUIZ ──────────────────────────────────────────────

    async checkMLHealth() {
        const badge = document.getElementById('ml-status-badge');
        if (!badge) return;
        try {
            const res = await this.api.mlHealth();
            if (res.ok && res.data.status === 'healthy') badge.style.display = 'inline-flex';
        } catch (e) {}
    }

    _getQuizSteps() {
        return [
            {
                id: 'transport',
                question: 'Как вы обычно добираетесь на работу или учёбу?',
                hint: 'Выберите основной способ передвижения каждый день',
                type: 'options', layout: 'grid-2',
                options: [
                    { emoji: '🚶', label: 'Пешком или велосипед',      sub: 'Меньше 5 км',               value: { transportation_km: 3,  carbon_footprint_kg: 0.1 } },
                    { emoji: '🚌', label: 'Общественный транспорт',     sub: 'Автобус, метро, трамвай',   value: { transportation_km: 15, carbon_footprint_kg: 1.5 } },
                    { emoji: '🚗', label: 'Личный автомобиль',          sub: 'Каждый день за рулём',      value: { transportation_km: 30, carbon_footprint_kg: 5.5 } },
                    { emoji: '🏠', label: 'Работаю дома',               sub: 'Удалёнка / свой бизнес',    value: { transportation_km: 1,  carbon_footprint_kg: 0.2 } },
                ]
            },
            {
                id: 'diet',
                question: 'Что чаще всего на вашей тарелке?',
                hint: 'Еда — один из главных источников углеродного следа',
                type: 'options', layout: 'grid-2',
                options: [
                    { emoji: '🥩', label: 'Мясо каждый день',       sub: 'Говядина, свинина — основа рациона', value: { carbon_bonus: 3.5, consumption_level: 3 } },
                    { emoji: '🍗', label: 'Птица и рыба',            sub: 'Красное мясо — редко',               value: { carbon_bonus: 1.8, consumption_level: 2 } },
                    { emoji: '🥗', label: 'Смешанный рацион',        sub: 'Много овощей, немного мяса',         value: { carbon_bonus: 0.9, consumption_level: 2 } },
                    { emoji: '🌱', label: 'Вегетарианец / веган',    sub: 'Без мяса или продуктов животных',    value: { carbon_bonus: 0.3, consumption_level: 1 } },
                ]
            },
            {
                id: 'waste',
                question: 'Как вы обращаетесь с мусором?',
                hint: 'Правильная утилизация снижает выбросы метана на свалках',
                type: 'options', layout: 'grid-2',
                options: [
                    { emoji: '🗑️', label: 'Всё в один пакет',         sub: 'Не сортирую',                    value: { recycling_rate_percent: 5,  waste_generated_kg: 1.5  } },
                    { emoji: '♻️', label: 'Сортирую бумагу/пластик',  sub: 'Раздельный сбор иногда',         value: { recycling_rate_percent: 35, waste_generated_kg: 1.0  } },
                    { emoji: '🌿', label: 'Активно перерабатываю',     sub: 'Сдаю большинство отходов',       value: { recycling_rate_percent: 65, waste_generated_kg: 0.6  } },
                    { emoji: '🏆', label: 'Zero waste подход',         sub: 'Минимум отходов вообще',          value: { recycling_rate_percent: 85, waste_generated_kg: 0.25 } },
                ]
            },
            {
                id: 'energy',
                question: 'Какая энергия питает ваш дом?',
                hint: 'Источник электричества сильно влияет на углеродный след',
                type: 'options', layout: 'grid-2',
                options: [
                    { emoji: '⚡', label: 'Обычная сеть',            sub: 'Стандартное электричество',         value: { renewable_energy_percent: 10 } },
                    { emoji: '💡', label: 'Энергосберегающий',       sub: 'LED лампы, экономлю активно',       value: { renewable_energy_percent: 20 } },
                    { emoji: '☀️', label: 'Частично солнечная',      sub: 'Есть солнечные панели',             value: { renewable_energy_percent: 55 } },
                    { emoji: '🌍', label: 'Зелёная энергия',         sub: '100% возобновляемые источники',     value: { renewable_energy_percent: 90 } },
                ]
            },
            {
                id: 'water',
                question: 'Как вы используете воду каждый день?',
                hint: 'Нагрев воды — до 20% домашнего потребления энергии',
                type: 'options', layout: 'grid-2',
                options: [
                    { emoji: '🚿', label: 'Быстрый душ до 5 мин',    sub: 'Стараюсь экономить',                value: { water_usage_liters: 80  } },
                    { emoji: '🛁', label: 'Душ 10–15 минут',          sub: 'Стандартное потребление',           value: { water_usage_liters: 160 } },
                    { emoji: '🛀', label: 'Ванна каждый день',        sub: 'Или душ больше 15 минут',           value: { water_usage_liters: 260 } },
                    { emoji: '💧', label: 'Счётчики и экономия',      sub: 'Собираю дождевую воду и т.д.',      value: { water_usage_liters: 55  } },
                ]
            },
            {
                id: 'shopping',
                question: 'Как часто вы покупаете новые вещи?',
                hint: 'Производство товаров — значительная часть глобальных выбросов',
                type: 'options', layout: 'grid-2',
                options: [
                    { emoji: '🛍️', label: 'Каждую неделю',        sub: 'Онлайн-заказы, шопинг',              value: { consumption_level: 3 } },
                    { emoji: '📦', label: 'Раз в месяц',           sub: 'Когда нужно что-то новое',           value: { consumption_level: 2 } },
                    { emoji: '👕', label: 'Раз в сезон',           sub: 'Покупаю только необходимое',         value: { consumption_level: 2 } },
                    { emoji: '♻️', label: 'Секонд-хенд / обмен',  sub: 'Б/у вещи, ремонт, шэринг',          value: { consumption_level: 1 } },
                ]
            },
            {
                id: 'nature',
                question: 'Сколько времени вы проводите на природе?',
                hint: 'Связь с природой формирует более осознанное отношение к экологии',
                type: 'options', layout: 'grid-2',
                options: [
                    { emoji: '🌳', label: 'Каждый день',                sub: 'Парк, лес, велопрогулки',       value: { eco_activities_bonus: 8 } },
                    { emoji: '🌿', label: 'Несколько раз в неделю',     sub: 'Регулярные прогулки',           value: { eco_activities_bonus: 4 } },
                    { emoji: '🏙️', label: 'По выходным',               sub: 'В основном в городе',           value: { eco_activities_bonus: 2 } },
                    { emoji: '😔', label: 'Редко',                      sub: 'Почти не выхожу на природу',    value: { eco_activities_bonus: 0 } },
                ]
            },
            {
                id: 'awareness',
                question: 'Насколько вы следите за своим экологическим влиянием?',
                hint: 'Последний шаг — ваш общий уровень экологической осознанности',
                type: 'slider',
                min: 0, max: 100, step: 5, defaultValue: 40,
                labels: ['Не думаю об этом', 'Иногда', 'Активно слежу'],
                format: (v) => v <= 20 ? '😕 Только начинаю' : v <= 50 ? '🙂 Стараюсь' : v <= 75 ? '😊 Осознанный' : '🌱 Эко-активист',
                valueKey: 'awareness'
            }
        ];
    }

    loadMLAutoData() {
        this.api.mlAutoData().then(res => {
            if (res.ok) this._autoData = res.data;
        }).catch(() => {});
    }

    quizInit() {
        this._quizStep = 0;
        this._quizAnswers = {};
        this._autoData = null;
        this.loadMLAutoData();
        this._renderQuizStep();
    }

    _renderQuizStep() {
        const steps = this._getQuizSteps();
        const total = steps.length;
        const i = this._quizStep;
        const step = steps[i];

        const pct = Math.round((i / total) * 100);
        document.getElementById('quiz-progress-bar').style.width = pct + '%';
        document.getElementById('quiz-step-label').textContent = `Шаг ${i + 1} из ${total}`;
        document.getElementById('quiz-pct-label').textContent = pct + '%';

        const dotsEl = document.getElementById('quiz-dots');
        if (dotsEl) {
            dotsEl.innerHTML = steps.map((_, idx) =>
                `<div class="quiz-dot ${idx < i ? 'done' : idx === i ? 'active' : ''}"></div>`
            ).join('');
        }

        const backBtn = document.getElementById('quiz-back-btn');
        const nextBtn = document.getElementById('quiz-next-btn');
        backBtn.style.display = i > 0 ? 'block' : 'none';

        const isLast = i === total - 1;
        nextBtn.textContent = isLast ? 'Получить результат 🌿' : 'Далее →';
        nextBtn.disabled = !(this._quizAnswers[step.id] !== undefined);

        const container = document.getElementById('quiz-steps-container');
        let html = `<div class="quiz-step">
            <div class="quiz-question">${step.question}</div>
            <div class="quiz-hint">${step.hint}</div>`;

        if (step.type === 'options') {
            html += `<div class="quiz-options ${step.layout || 'grid-2'}">`;
            step.options.forEach((opt, idx) => {
                const sel = this._quizAnswers[step.id] === idx ? 'selected' : '';
                html += `<div class="quiz-option ${sel}" onclick="app.quizSelect('${step.id}', ${idx})">
                    <div class="quiz-option-emoji">${opt.emoji}</div>
                    <div class="quiz-option-body">
                        <div class="quiz-option-label">${opt.label}</div>
                        ${opt.sub ? `<div class="quiz-option-sub">${opt.sub}</div>` : ''}
                    </div>
                </div>`;
            });
            html += `</div>`;
        } else if (step.type === 'slider') {
            const val = this._quizAnswers[step.id] !== undefined ? this._quizAnswers[step.id] : step.defaultValue;
            const pctSlider = Math.round(((val - step.min) / (step.max - step.min)) * 100);
            html += `<div class="quiz-slider-wrap">
                <div class="quiz-slider-value" id="quiz-slider-val">${step.format(val)}</div>
                <input type="range" class="quiz-slider" id="quiz-slider-input"
                    min="${step.min}" max="${step.max}" step="${step.step}" value="${val}"
                    style="--pct:${pctSlider}%"
                    oninput="app.quizSliderMove(this, '${step.id}')">
                <div class="quiz-slider-labels">
                    ${step.labels.map(l => `<span>${l}</span>`).join('')}
                </div>
            </div>`;
            this._quizAnswers[step.id] = val;
        }

        html += `</div>`;
        container.innerHTML = html;

        if (step.type === 'slider') nextBtn.disabled = false;
    }

    quizSelect(stepId, optionIdx) {
        this._quizAnswers[stepId] = optionIdx;
        document.getElementById('quiz-next-btn').disabled = false;
        document.querySelectorAll('.quiz-option').forEach((el, i) => {
            el.classList.toggle('selected', i === optionIdx);
        });
    }

    quizSliderMove(input, stepId) {
        const step = this._getQuizSteps().find(s => s.id === stepId);
        if (!step) return;
        const val = parseInt(input.value);
        this._quizAnswers[stepId] = val;
        const pct = Math.round(((val - step.min) / (step.max - step.min)) * 100);
        input.style.setProperty('--pct', pct + '%');
        const valEl = document.getElementById('quiz-slider-val');
        if (valEl) valEl.textContent = step.format(val);
        document.getElementById('quiz-next-btn').disabled = false;
    }

    quizBack() {
        if (this._quizStep > 0) { this._quizStep--; this._renderQuizStep(); }
    }

    quizNext() {
        const steps = this._getQuizSteps();
        if (this._quizStep < steps.length - 1) { this._quizStep++; this._renderQuizStep(); }
        else { this._quizSubmit(); }
    }

    _buildPayload() {
        const steps = this._getQuizSteps();
        let payload = {
            carbon_footprint_kg: 0, water_usage_liters: 160, waste_generated_kg: 1.0,
            transportation_km: 15,  renewable_energy_percent: 10, eco_activities_count: 0,
            daily_temperature_celsius: 15, recycling_rate_percent: 20,
            consumption_level: 2, eco_score: 50,
        };

        steps.forEach(step => {
            const answer = this._quizAnswers[step.id];
            if (step.type === 'options' && answer !== undefined) {
                const opt = step.options[answer];
                Object.entries(opt.value).forEach(([k, v]) => {
                    if (k === 'carbon_bonus')        payload.carbon_footprint_kg += v;
                    else if (k === 'eco_activities_bonus') payload.eco_activities_count += v;
                    else payload[k] = v;
                });
            } else if (step.type === 'slider' && answer !== undefined) {
                payload.awareness = answer;
            }
        });

        if (this._autoData) {
            const d = this._autoData;
            if (d.carbon_footprint_kg > 0) payload.carbon_footprint_kg = (payload.carbon_footprint_kg + d.carbon_footprint_kg) / 2;
            if (d.eco_activities_count > 0) payload.eco_activities_count += d.eco_activities_count;
            if (d.waste_generated_kg > 0)   payload.waste_generated_kg   = d.waste_generated_kg;
            if (d.transportation_km > 0)    payload.transportation_km    = d.transportation_km;
        }

        const r = payload.recycling_rate_percent, re = payload.renewable_energy_percent;
        const act = payload.eco_activities_count,  co2 = payload.carbon_footprint_kg;
        const waste = payload.waste_generated_kg,   awareness = this._quizAnswers['awareness'] || 40;
        const raw = 5 + r*0.28 + re*0.28 + Math.min(act*1.5,24) - Math.min(co2*0.8,20) - Math.min(waste*2,15) + awareness*0.1;
        payload.eco_score = Math.min(100, Math.max(0, Math.round(raw * 10) / 10));

        return payload;
    }

    async _quizSubmit() {
        const nextBtn = document.getElementById('quiz-next-btn');
        const backBtn = document.getElementById('quiz-back-btn');
        nextBtn.disabled = true;
        nextBtn.textContent = '🔍 Анализирую...';
        backBtn.style.display = 'none';

        document.getElementById('quiz-steps-container').innerHTML = `
            <div style="text-align:center;padding:2.5rem;color:var(--c-text-muted);">
                <div style="font-size:2.5rem;margin-bottom:0.75rem;animation:bounceIn .5s ease;">🧠</div>
                <div style="font-size:1rem;font-weight:600;color:var(--c-green-7);">AI анализирует ваши ответы...</div>
            </div>`;
        document.getElementById('quiz-progress-wrap').style.display = 'none';
        document.getElementById('quiz-nav').style.display = 'none';

        const payload = this._buildPayload();
        try {
            const res = await this.api.mlPredict(payload);
            if (res.ok) this._renderQuizResult(res.data, payload);
            else this._renderQuizResultFallback(payload);
        } catch (e) {
            this._renderQuizResultFallback(payload);
        }
    }

    _renderQuizResult(data, payload) {
        const container = document.getElementById('quiz-steps-container');
        const cat = data.category;
        const conf = (data.confidence * 100).toFixed(0);
        const emoji  = { Poor: '🔴', Average: '🟡', Good: '🟢', Excellent: '⭐' };
        const catRu  = { Poor: 'Начинающий', Average: 'Развивающийся', Good: 'Осознанный', Excellent: 'Эко-чемпион' };
        const color  = { Poor: '#ef4444', Average: '#f59e0b', Good: '#14b8a6', Excellent: '#22c55e' };
        const advice = {
            Poor:      'Ваш экологический след пока высокий. Это отличная точка для начала! Даже небольшие изменения — сортировка мусора или реже ездить на авто — дадут заметный результат.',
            Average:   'Вы на правильном пути! Есть хороший потенциал для роста. Попробуйте увеличить долю возобновляемой энергии и активнее перерабатывать отходы.',
            Good:      'Отличный результат! Вы уже делаете много полезного для планеты. Поделитесь своим опытом с друзьями и семьёй.',
            Excellent: 'Вы настоящий эко-чемпион! Ваш образ жизни — пример для окружающих. Продолжайте вдохновлять других!'
        };
        const tips = {
            Poor:      [['🚌','Пересядьте на общественный транспорт хотя бы 2 дня в неделю'],['♻️','Начните с разделения бумаги и пластика'],['💡','Замените лампочки на LED'],['🛒','Делайте список покупок, чтобы меньше выбрасывать еды']],
            Average:   [['☀️','Рассмотрите «зелёный» тариф у вашего поставщика энергии'],['🌿','Попробуйте один вегетарианский день в неделю'],['🚴','Велосипед или пешком — для коротких маршрутов'],['🏷️','Покупайте б/у вещи: мебель, одежду, технику']],
            Good:      [['🌱','Посадите дерево или участвуйте в субботниках'],['📱','Расскажите друзьям про EcoTracker'],['🔋','Рассмотрите электромобиль или гибрид'],['🧴','Перейдите на многоразовую упаковку и тару']],
            Excellent: [['🎓','Станьте эко-амбасадором в своей компании или школе'],['☀️','Если есть возможность — установите солнечные панели'],['🌍','Участвуйте в экологических организациях'],['💚','Компенсируйте оставшийся след через посадку деревьев']]
        };

        const tipCards = (tips[cat] || tips['Average']).map(([icon, text]) =>
            `<div class="quiz-tip-card"><div class="quiz-tip-icon">${icon}</div><div class="quiz-tip-text">${text}</div></div>`
        ).join('');

        const bars = Object.entries(data.probabilities || {}).sort((a,b) => b[1]-a[1]).map(([k,v]) => {
            const pct = (v*100).toFixed(0);
            return `<div style="margin:.35rem 0;">
                <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--c-text-muted);margin-bottom:.2rem;">
                    <span>${emoji[k]||''} ${catRu[k]||k}</span><span style="font-weight:700;">${pct}%</span>
                </div>
                <div style="height:6px;background:rgba(22,163,74,0.1);border-radius:999px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:${color[k]||'#22c55e'};border-radius:999px;"></div>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = `<div class="quiz-step">
            <div class="quiz-result-hero">
                <div class="quiz-result-emoji">${emoji[cat]||'🌿'}</div>
                <div class="quiz-result-cat">${catRu[cat]||cat}</div>
                <div class="quiz-result-conf">AI уверен на <b style="color:var(--c-green-6);">${conf}%</b> · Эко-балл: <b style="color:var(--c-green-6);">${payload.eco_score}</b>/100</div>
                <div class="quiz-advice-box">${advice[cat]||''}</div>
            </div>
            <div class="quiz-tips-grid">${tipCards}</div>
            <div style="background:rgba(0,0,0,0.03);border-radius:var(--radius-md);padding:.875rem 1rem;margin-bottom:1rem;">
                <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--c-text-muted);margin-bottom:.6rem;">Вероятности по категориям</div>
                ${bars}
            </div>
            <div style="text-align:center;">
                <button class="quiz-restart-btn" onclick="app.quizInit()">↩ Пройти ещё раз</button>
            </div>
        </div>`;
    }

    _renderQuizResultFallback(payload) {
        const score = payload.eco_score;
        const cat = score >= 70 ? 'Excellent' : score >= 45 ? 'Good' : score >= 25 ? 'Average' : 'Poor';
        this._renderQuizResult({
            category: cat, confidence: 0.72,
            probabilities: { Poor: 0.1, Average: 0.2, Good: 0.35, Excellent: 0.35 }
        }, payload);
    }

    async handleUserActionDelegation(e) {
        const delBtn = e.target.closest('[data-action="delete"]');
        if (delBtn) { await this.handleDeleteUser(parseInt(delBtn.dataset.id)); return; }

        const btn = e.target.closest('.admin-user-act');
        if (!btn) return;

        const uid = btn.dataset.id;
        const action = btn.dataset.action;
        const currentVal = parseInt(btn.dataset.val);

        btn.disabled = true;
        let res;

        if (action === 'block') res = await this.api.toggleBlockUser(uid, currentVal);
        else if (action === 'role') res = await this.api.toggleUserRole(uid, currentVal);

        if (res && res.ok) {
            this.showMessage(res.data.message, 'success');
            this.elements.adminUserSearchForm.dispatchEvent(new Event('submit'));
        } else {
            this.showMessage(res?.data?.message || 'Ошибка', 'error');
            btn.disabled = false;
        }
    }
    async showAchievementToast(ach) {
        const toast = document.createElement('div');
        toast.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;z-index:999;
            background:linear-gradient(135deg,#166534,#0d9488);color:#fff;
            padding:1rem 1.25rem;border-radius:1rem;box-shadow:0 8px 32px rgba(0,0,0,0.18);
            display:flex;align-items:center;gap:.75rem;max-width:320px;
            animation:fadeUp .4s cubic-bezier(.16,1,.3,1) both;`;
        toast.innerHTML = `
            <div style="font-size:2rem;line-height:1;">${ach.icon}</div>
            <div>
                <div style="font-weight:700;font-size:.95rem;">Новое достижение!</div>
                <div style="font-weight:600;font-size:.85rem;opacity:.9;">${ach.name}</div>
                <div style="font-size:.75rem;opacity:.75;">+${ach.points_reward} очков</div>
            </div>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }

    async loadRatingTab() {
        const tab = document.getElementById('tab-rating');
        if (!tab) return;
        tab.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--c-text-muted);">Загрузка...</div>';

        const [ratingRes, boardRes] = await Promise.all([
            this.api.getUserRating(),
            this.api.getLeaderboard(50)
        ]);

        if (!ratingRes.ok) { tab.innerHTML = '<p>Ошибка загрузки</p>'; return; }

        const { rank, points, achievements, allAchievements } = ratingRes.data;
        const board = boardRes.ok ? boardRes.data : [];
        const myId = this.currentUser.userId;

        const achMap = new Map((achievements || []).map(a => [a.code, a]));

        const boardRows = board.map((u, i) => {
            const isMe = u.id === myId;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
            return `<tr style="${isMe ? 'background:rgba(34,197,94,0.10);font-weight:700;' : ''}">
                <td style="text-align:center;font-size:1.1rem;">${medal}</td>
                <td>${u.username}${isMe ? ' <span style="font-size:.7rem;background:rgba(34,197,94,.2);color:#16a34a;padding:.1rem .4rem;border-radius:999px;">Вы</span>' : ''}</td>
                <td style="text-align:right;font-weight:700;color:#0d9488;">${u.total_points}</td>
                <td style="text-align:right;color:var(--c-text-muted);font-size:.85rem;">${parseFloat(u.total_co2||0).toFixed(1)} кг</td>
                <td style="text-align:right;color:var(--c-text-muted);font-size:.85rem;">${u.total_records}</td>
            </tr>`;
        }).join('');

        const achHTML = (allAchievements || []).map(a => {
            const earned = achMap.has(a.code);
            return `<div style="display:flex;align-items:center;gap:.75rem;padding:.75rem;border-radius:.75rem;
                background:${earned ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.03)'};
                border:1px solid ${earned ? 'rgba(34,197,94,0.2)' : 'rgba(0,0,0,0.07)'};
                opacity:${earned ? '1' : '0.45'};">
                <div style="font-size:1.6rem;line-height:1;">${a.icon}</div>
                <div style="flex:1;">
                    <div style="font-weight:700;font-size:.875rem;color:var(--c-text);">${a.name}</div>
                    <div style="font-size:.78rem;color:var(--c-text-muted);">${a.description}</div>
                </div>
                <div style="font-size:.78rem;font-weight:700;color:#0d9488;">+${a.points_reward} pts</div>
                ${earned ? `<div style="font-size:.7rem;color:#16a34a;">✓</div>` : ''}
            </div>`;
        }).join('');

        tab.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem;">
                <div class="glass-card" style="padding:1.25rem;text-align:center;">
                    <div style="font-size:2rem;font-weight:800;color:#0d9488;">${points}</div>
                    <div style="font-size:.8rem;color:var(--c-text-muted);margin-top:.25rem;">Очков</div>
                </div>
                <div class="glass-card" style="padding:1.25rem;text-align:center;">
                    <div style="font-size:2rem;font-weight:800;color:#16a34a;">${rank ? '#'+rank : '—'}</div>
                    <div style="font-size:.8rem;color:var(--c-text-muted);margin-top:.25rem;">Место</div>
                </div>
                <div class="glass-card" style="padding:1.25rem;text-align:center;">
                    <div style="font-size:2rem;font-weight:800;color:#166534;">${(achievements||[]).length}</div>
                    <div style="font-size:.8rem;color:var(--c-text-muted);margin-top:.25rem;">Достижений</div>
                </div>
            </div>

            <div class="glass-card" style="padding:1.25rem;margin-bottom:1.5rem;">
                <h3 style="font-size:1.1rem;font-weight:700;color:var(--c-text);margin-bottom:1rem;">🏆 Рейтинг игроков</h3>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:.875rem;">
                        <thead>
                            <tr style="color:var(--c-text-muted);font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;">
                                <th style="padding:.5rem;text-align:center;">#</th>
                                <th style="padding:.5rem;text-align:left;">Игрок</th>
                                <th style="padding:.5rem;text-align:right;">Очки</th>
                                <th style="padding:.5rem;text-align:right;">CO₂</th>
                                <th style="padding:.5rem;text-align:right;">Записей</th>
                            </tr>
                        </thead>
                        <tbody>${boardRows}</tbody>
                    </table>
                </div>
            </div>

            <div class="glass-card" style="padding:1.25rem;">
                <h3 style="font-size:1.1rem;font-weight:700;color:var(--c-text);margin-bottom:1rem;">🎖️ Достижения</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;">
                    ${achHTML}
                </div>
            </div>`;
    }
}

const app = new AppContext();

// ─── Decorative floating leaves ─────────────────────────────
(function initFloatingLeaves(){
  const root = document.getElementById('floating-leaves');
  if (!root) return;
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  function leafSVG(hueShift){
    return `<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="leafGrad-${hueShift}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${130 + hueShift} 62% 72%)" />
          <stop offset="60%" stop-color="hsl(${145 + hueShift} 58% 52%)" />
          <stop offset="100%" stop-color="hsl(${168 + hueShift} 64% 46%)" />
        </linearGradient>
      </defs>
      <path d="M12 1C7 6 3 10 3 17c0 7 4.5 12 9 14 4.5-2 9-7 9-14 0-7-4-11-9-16Z" fill="url(#leafGrad-${hueShift})" opacity="0.9"/>
      <path d="M12 3c1 8 .7 15-1 24" stroke="rgba(255,255,255,.55)" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M11.5 10c-2.4 1.4-4 3.2-5 5.6M12 14c2.7 1.2 4.2 3 5.2 5.3" stroke="rgba(255,255,255,.38)" stroke-width="0.9" stroke-linecap="round"/>
    </svg>`;
  }

  function buildLeaves(){
    root.innerHTML = '';
    const width = window.innerWidth;
    const count = width < 480 ? 6 : width < 900 ? 10 : 16;
    for(let i=0;i<count;i++){
      const leaf = document.createElement('div');
      const size = (Math.random() * 22 + (width < 640 ? 12 : 16)).toFixed(0) + 'px';
      const startX = Math.round(Math.random() * width) + 'px';
      const drift = Math.round((Math.random() - 0.5) * 120) + 'px';
      const driftEnd = Math.round((Math.random() - 0.5) * 180) + 'px';
      const duration = (Math.random() * 10 + (width < 640 ? 12 : 15)).toFixed(1) + 's';
      const delay = (-Math.random() * 20).toFixed(1) + 's';
      const scale = (Math.random() * 0.65 + 0.75).toFixed(2);
      const opacity = (Math.random() * 0.18 + (width < 640 ? 0.12 : 0.18)).toFixed(2);
      const hueShift = Math.round(Math.random() * 18 - 9);
      leaf.className = 'floating-leaf';
      leaf.style.setProperty('--leaf-size', size);
      leaf.style.setProperty('--leaf-start-x', startX);
      leaf.style.setProperty('--leaf-drift', drift);
      leaf.style.setProperty('--leaf-drift-end', driftEnd);
      leaf.style.setProperty('--leaf-duration', duration);
      leaf.style.setProperty('--leaf-scale', scale);
      leaf.style.setProperty('--leaf-opacity', opacity);
      leaf.style.animationDelay = delay;
      leaf.innerHTML = leafSVG(hueShift);
      root.appendChild(leaf);
    }
  }

  let t;
  buildLeaves();
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(buildLeaves, 180);
  });
})();
