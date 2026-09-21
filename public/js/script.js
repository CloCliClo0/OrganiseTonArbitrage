// Configuration
const API_BASE_URL = '/api'; 

// --- ETAT DE L'APPLICATION ---
let currentUser = null;
let allPresences = [];

// Constantes Rôles pour l'affichage
const ROLES = { ADMIN: 'admin', COACH: 'coach', JOUEUR: 'joueur' };

// Jours ouverts à l'inscription (chargés depuis /api/dates.php, gérés par l'admin)
let sessionDates = [];

// Catégories de joueurs (chargées depuis /api/categories.php, gérées par l'admin)
let categories = [];

// --- UTILITAIRES ---
const showLoading = (show) => document.getElementById('loading').classList.toggle('hidden', !show);


const notify = (msg, type = 'info') => {
    const area = document.getElementById('notification-area');
    const el = document.createElement('div');
    const colors = type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-green-500' : 'bg-blue-500');
    el.className = `${colors} text-white px-4 py-3 rounded shadow-lg mb-2 text-sm flex justify-between items-center animate-pulse`;
    el.innerHTML = `<span>${msg}</span> <button onclick="this.parentElement.remove()">&times;</button>`;
    area.appendChild(el);
    setTimeout(() => el.remove(), 4000);
};

const formatDate = (dateStr) => {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    return new Date(dateStr).toLocaleDateString('fr-FR', options);
};

// Helper pour les appels API
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
    if (body) options.body = JSON.stringify(body);
    
    try {
        const res = await fetch(`${API_BASE_URL}/${endpoint}`, options);
        // If server returned non-JSON (or empty), handle gracefully
        const text = await res.text();
        if (!text) return null;
        try {
            const data = JSON.parse(text);
            if (!res.ok) return data; // return error obj to caller for handling
            return data;
        } catch (e) {
            console.error('Invalid JSON from API:', text);
            return null;
        }
    } catch (e) {
        console.error("API Error:", e);
        return null;
    }
}

// --- CLASSE PRINCIPALE ---
class App {
    constructor() {
        this.checkUrlParams();
        this.fetchPublicData(); // samedis + catégories : nécessaires même sans être connecté (formulaire d'inscription)
        this.initAuth();
    }

    // Construit la grille de samedis (regroupés par mois) à partir de sessionDates,
    // + compteur live et limite de 2 max (désactive les autres cases une fois 2 cochées)
    renderInscriptionForm() {
        const grid = document.getElementById('insc-grid');
        const counter = document.getElementById('insc-counter');
        const submitBtn = document.getElementById('insc-submit');
        if (!grid || !counter || !submitBtn) return;

        if (!sessionDates || sessionDates.length === 0) {
            grid.innerHTML = '<p class="col-span-full text-sm text-gray-500 italic">Aucun jour ouvert à l\'inscription pour le moment.</p>';
            counter.textContent = '0 / 2 sélectionné';
            submitBtn.disabled = true;
            return;
        }

        const chipClass = 'insc-chip flex items-center justify-center text-center rounded-lg border border-gray-200 px-2 py-2.5 text-sm font-medium text-gray-700 cursor-pointer select-none transition-colors hover:border-blue-400 hover:bg-blue-50 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-600 has-[:checked]:text-white has-[:checked]:shadow-md has-[:disabled]:opacity-40 has-[:disabled]:cursor-not-allowed has-[:disabled]:hover:border-gray-200 has-[:disabled]:hover:bg-transparent';

        let lastMonthKey = '';
        let html = '';
        sessionDates.forEach(date => {
            const d = new Date(`${date}T00:00:00`);
            const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
            if (monthKey !== lastMonthKey) {
                let monthLabel = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                monthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
                html += `<p class="col-span-full text-xs font-bold text-blue-900 uppercase tracking-wide${lastMonthKey ? ' mt-2' : ''}">${monthLabel}</p>`;
                lastMonthKey = monthKey;
            }
            const dayLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
            html += `<label class="${chipClass}"><input type="checkbox" class="sr-only" value="${date}">${dayLabel}</label>`;
        });
        grid.innerHTML = html;

        const update = () => {
            const checkboxes = Array.from(grid.querySelectorAll('input[type="checkbox"]'));
            const checkedCount = checkboxes.filter(cb => cb.checked).length;
            counter.textContent = `${checkedCount} / 2 sélectionné${checkedCount > 1 ? 's' : ''}`;
            counter.classList.toggle('bg-gray-100', checkedCount === 0);
            counter.classList.toggle('text-gray-500', checkedCount === 0);
            counter.classList.toggle('bg-blue-100', checkedCount > 0);
            counter.classList.toggle('text-blue-700', checkedCount > 0);

            checkboxes.forEach(cb => { cb.disabled = checkedCount >= 2 && !cb.checked; });
            submitBtn.disabled = checkedCount === 0;
        };

        // onchange (et non addEventListener) : évite d'empiler des handlers à chaque re-rendu de la vue
        grid.onchange = update;
        update();
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            const codeInput = document.getElementById('reg-code');
            if(codeInput) codeInput.value = code;
        }
        // Catégorie préremplie via un lien d'invitation (?cat=...) ; appliquée dès que
        // les catégories sont chargées, car le <select> est rempli dynamiquement (async)
        this.pendingCategory = urlParams.get('cat') || null;
    }

    // Remplit dynamiquement le <select> "Catégorie" du formulaire d'inscription
    renderRegisterCategories() {
        const select = document.getElementById('reg-cat');
        if (!select) return;

        if (!categories || categories.length === 0) {
            select.innerHTML = '<option value="">Aucune catégorie disponible</option>';
            return;
        }
        select.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
        if (this.pendingCategory && categories.includes(this.pendingCategory)) {
            select.value = this.pendingCategory;
        }
    }

    nav(viewId) {
        document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(`view-${viewId}`);
        if(target) target.classList.add('active');
        
        if(viewId === 'calendar') this.renderCalendar();
        if(viewId === 'home') this.renderHome();
        if(viewId === 'profile') this.renderProfile();
        if(viewId === 'register') this.renderRegisterCategories();
        if(viewId === 'inscription') this.renderInscriptionForm();
        if(viewId === 'admin-matches') this.renderAdminInscriptions();
        if(viewId === 'admin-users' || viewId === 'admin-stats') this.renderAdminStats();
        if(viewId === 'admin-invites') this.renderAdminInvites();
        if(viewId === 'admin-categories') this.renderAdminCategories();

        document.getElementById('mobile-menu').classList.add('hidden');
    }

    buildNav() {
        const navContainer = document.getElementById('nav-links');
        const mobileNavContainer = document.getElementById('mobile-nav-links');
        let links = [];

        if (!currentUser) {
            links = [
                { id: 'login', label: 'Connexion', icon: 'fa-sign-in-alt' },
                { id: 'register', label: 'Inscription', icon: 'fa-user-plus' }
            ];
        } else {
            links = [
                { id: 'home', label: 'Accueil', icon: 'fa-home' },
                { id: 'calendar', label: 'Calendrier', icon: 'fa-calendar-alt' },
                { id: 'inscription', label: 'Inscription', icon: 'fa-calendar-check' },
                { id: 'profile', label: 'Mon compte', icon: 'fa-user' }
            ];

            if (currentUser && (currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.COACH)) {
                links.push({ id: 'admin-matches', label: 'Gestion Inscriptions', icon: 'fa-edit' });
            }
            if (currentUser && currentUser.role === ROLES.ADMIN) {
                links.push({ id: 'admin-invites', label: 'Codes invitation', icon: 'fa-key' });
                links.push({ id: 'admin-categories', label: 'Catégories', icon: 'fa-tags' });
            }
        }

        const html = links.map(l => 
            `<a href="#" onclick="window.app.nav('${l.id}')" class="px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 flex items-center">
                <i class="fa-solid ${l.icon} mr-2"></i>${l.label}
            </a>`
        ).join('');
        
        navContainer.innerHTML = html;
        mobileNavContainer.innerHTML = html.replace(/text-sm/g, 'text-base text-white');
    }

    async initAuth() {
        showLoading(true);
        const res = await apiCall('auth.php?action=me');
        if (res && res.success && res.user) {
            currentUser = res.user;
            this.fetchData(); 
            this.nav('home');
        } else {
            currentUser = null;
            this.nav('login');
        }
        showLoading(false);
        this.buildNav();
    }

    // Données publiques (pas besoin d'être connecté) : samedis ouverts + catégories.
    // Chargées dès le démarrage de l'app car le formulaire d'inscription (anonyme) en a besoin.
    async fetchPublicData() {
        const [dates, cats] = await Promise.all([
            apiCall('dates.php'),
            apiCall('categories.php'),
        ]);
        sessionDates = Array.isArray(dates) ? dates : [];
        categories = Array.isArray(cats) ? cats : [];
        this.renderRegisterCategories();
    }

    async fetchData() {
        const [presences] = await Promise.all([
            apiCall('bookings.php?action=presences'),
            this.fetchPublicData(),
        ]);

        // presences: ensure array; if API returned error object, show notification and fallback to []
        if (Array.isArray(presences)) {
            allPresences = presences;
        } else if (presences && typeof presences === 'object' && presences.message) {
            allPresences = [];
            console.warn('API presences error:', presences);
            notify(presences.message || 'Erreur récupération présences', 'error');
        } else {
            allPresences = [];
        }

        sessionDates = Array.isArray(dates) ? dates : [];
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        showLoading(true);
        const res = await apiCall('auth.php?action=login', 'POST', { email, password });
        showLoading(false);

        if (res && res.success) {
            currentUser = res.user;
            notify("Connexion réussie !", "success");
            this.fetchData();
            this.nav('home');
            this.buildNav();
        } else {
            notify(res ? res.message : "Erreur connexion", "error");
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const codeInput = document.getElementById('reg-code');
        const data = {
            nom: document.getElementById('reg-nom').value,
            prenom: document.getElementById('reg-prenom').value,
            email: document.getElementById('reg-email').value,
            age: document.getElementById('reg-age').value,
            tel: document.getElementById('reg-tel').value,
            cat: document.getElementById('reg-cat').value,
            password: document.getElementById('reg-password').value,
            code: codeInput ? codeInput.value.trim() : ''
        };

        showLoading(true);
        const res = await apiCall('auth.php?action=register', 'POST', data);
        showLoading(false);

        if (res && res.success) {
            // Auto-login after registration
            notify("Compte créé ! Connexion en cours...", "success");
            showLoading(true);
            const loginRes = await apiCall('auth.php?action=login', 'POST', { email: data.email, password: data.password });
            showLoading(false);
            if (loginRes && loginRes.success) {
                currentUser = loginRes.user;
                notify('Connecté', 'success');
                await this.fetchData();
                this.nav('inscription');
                this.buildNav();
            } else {
                notify('Inscription OK. Veuillez vous connecter.', 'info');
                this.nav('login');
            }
        } else {
            notify(res ? res.message : "Erreur inscription", "error");
        }
    }

    async handleInscription(e) {
        e.preventDefault();
        
        // Récupérer les samedis sélectionnés
        const selectedSaturdays = Array.from(document.querySelectorAll('#view-inscription input[type="checkbox"]:checked')).map(cb => cb.value);
        if (selectedSaturdays.length === 0 || selectedSaturdays.length > 2) {
            notify("Sélectionnez 1 ou 2 samedis.", "error");
            return;
        }

        const data = {
            presenceDates: selectedSaturdays,
            commentaire: document.getElementById('insc-commentaire').value
        };

        showLoading(true);
        const res = await apiCall('bookings.php', 'POST', data);
        showLoading(false);

        if (res && res.success) {
            notify("Inscription réussie !", "success");
            await this.fetchData();
            this.nav('calendar');
        } else {
            notify(res ? res.message : "Erreur inscription", "error");
        }
    }

    async logout() {
        await apiCall('auth.php?action=logout');
        currentUser = null;
        notify("Déconnecté", "info");
        this.nav('login');
        this.buildNav();
    }

    async renderAdminInscriptions() {
        this.renderSessionDatesAdmin();

        const container = document.getElementById('admin-inscriptions-list');
        container.innerHTML = '<p class="text-gray-500">Chargement...</p>';

        // Since presences are already fetched in fetchData, use allPresences
        if (!allPresences || allPresences.length === 0) {
            container.innerHTML = '<p class="text-gray-500">Aucune inscription.</p>';
            return;
        }

        // Group by date
        const grouped = {};
        allPresences.forEach(p => {
            if (!grouped[p.date]) grouped[p.date] = [];
            grouped[p.date].push(p);
        });

        let html = '';
        sessionDates.forEach(date => {
            const presences = grouped[date] || [];
            html += `<div class="bg-white p-4 rounded-lg border border-gray-200">
                <h4 class="font-bold text-lg mb-2">${formatDate(date)}</h4>`;
            if (presences.length === 0) {
                html += '<p class="text-gray-500">Aucun inscrit</p>';
            } else {
                html += '<ul class="space-y-2">';
                presences.forEach(p => {
                    html += `<li class="flex justify-between items-center">
                        <span>${p.nom} ${p.prenom}</span>
                        <div>
                            <select class="mr-2 p-1 border rounded" data-presence-id="${p.id}">`;
                    sessionDates.forEach(d => {
                        html += `<option value="${d}" ${d === p.date ? 'selected' : ''}>${formatDate(d)}</option>`;
                    });
                    html += `</select>
                            <button class="bg-blue-500 text-white px-2 py-1 rounded mr-2 text-xs" onclick="window.app.updatePresence(this)">Modifier</button>
                            <button class="bg-red-500 text-white px-2 py-1 rounded text-xs" onclick="window.app.deletePresence('${p.id}')">Supprimer</button>
                        </div>
                    </li>`;
                });
                html += '</ul>';
            }
            html += '</div>';
        });

        container.innerHTML = html;
    }

    // Carte "Gérer les samedis" (liste + ajout/suppression, admin uniquement pour les actions)
    renderSessionDatesAdmin() {
        const container = document.getElementById('admin-dates-manage');
        if (!container) return;
        const isAdmin = currentUser && currentUser.role === ROLES.ADMIN;

        const badges = (sessionDates || []).map(date => `
            <span class="inline-flex items-center gap-2 bg-blue-50 text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full border border-blue-100">
                ${formatDate(date)}
                ${isAdmin ? `<button type="button" onclick="window.app.deleteSessionDate('${date}')" class="text-blue-400 hover:text-red-600" title="Supprimer"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </span>
        `).join('');

        container.innerHTML = `
            <div class="flex flex-wrap gap-2 mb-4">${badges || '<p class="text-sm text-gray-500 italic">Aucun jour ouvert à l\'inscription.</p>'}</div>
            ${isAdmin ? `
            <div class="flex flex-wrap items-end gap-2">
                <div>
                    <label class="block text-xs font-bold uppercase text-gray-600 mb-1">Ajouter un jour</label>
                    <input type="date" id="new-session-date" class="p-2 border rounded">
                </div>
                <button type="button" onclick="window.app.addSessionDate()" class="bg-blue-600 text-white font-bold px-4 py-2 rounded hover:bg-blue-700 transition">
                    <i class="fa-solid fa-plus mr-1"></i>Ajouter
                </button>
            </div>` : ''}
        `;
    }

    async addSessionDate() {
        const input = document.getElementById('new-session-date');
        const date = input ? input.value : '';
        if (!date) { notify('Choisissez une date', 'error'); return; }

        showLoading(true);
        const res = await apiCall('dates.php', 'POST', { date });
        showLoading(false);

        if (res && res.success) {
            notify('Jour ajouté', 'success');
            input.value = '';
            await this.fetchData();
            this.renderAdminInscriptions();
            this.renderCalendar();
        } else {
            notify(res ? res.message : 'Erreur', 'error');
        }
    }

    deleteSessionDate(date) {
        if (!confirm(`Supprimer le ${formatDate(date)} de la liste des jours d'inscription ?`)) return;
        this.deleteSessionDateConfirmed(date);
    }

    async deleteSessionDateConfirmed(date) {
        showLoading(true);
        const res = await apiCall(`dates.php?date=${encodeURIComponent(date)}`, 'DELETE');
        showLoading(false);

        if (res && res.success) {
            notify('Jour supprimé', 'success');
            await this.fetchData();
            this.renderAdminInscriptions();
            this.renderCalendar();
        } else {
            notify(res ? res.message : 'Erreur', 'error');
        }
    }

    // Page admin "Codes d'invitation" : construit les liens ?code=... à partir des codes fixes du .env
    async renderAdminInvites() {
        const adminInput = document.getElementById('invite-link-admin');
        const coachInput = document.getElementById('invite-link-coach');
        if (!adminInput || !coachInput) return;

        adminInput.value = 'Chargement...';
        coachInput.value = 'Chargement...';

        const res = await apiCall('auth.php?action=invite-codes');
        if (!res || !res.success) {
            adminInput.value = '';
            coachInput.value = '';
            notify(res ? res.message : 'Erreur récupération des codes', 'error');
            return;
        }

        const base = `${location.origin}${location.pathname}`;
        this.setInviteLink('invite-link-admin', res.codeAdmin ? `${base}?code=${encodeURIComponent(res.codeAdmin)}` : null, 'CODE_ADMIN');
        this.setInviteLink('invite-link-coach', res.codeCoach ? `${base}?code=${encodeURIComponent(res.codeCoach)}` : null, 'CODE_COACH');

        this.renderInviteCategoryLinks();
    }

    // Liens par catégorie (?cat=...), affichés dans la page "Codes d'invitation"
    renderInviteCategoryLinks() {
        const container = document.getElementById('invite-links-categories');
        if (!container) return;

        if (!categories || categories.length === 0) {
            container.innerHTML = '<p class="text-gray-500 italic col-span-full">Aucune catégorie pour le moment. Ajoutez-en depuis la page "Catégories".</p>';
            return;
        }

        const base = `${location.origin}${location.pathname}`;
        container.innerHTML = categories.map((cat, i) => {
            const url = `${base}?cat=${encodeURIComponent(cat)}`;
            const inputId = `invite-link-cat-${i}`;
            return `
            <div class="bg-white p-6 rounded-xl shadow-md">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                        <i class="fa-solid fa-tag"></i>
                    </div>
                    <h3 class="font-bold text-lg">${cat}</h3>
                </div>
                <div class="flex gap-2">
                    <input id="${inputId}" type="text" readonly class="flex-1 p-2 border rounded bg-gray-50 text-sm" value="${url}">
                    <button type="button" onclick="window.app.copyInviteLink('${inputId}')" class="bg-green-600 text-white px-3 rounded hover:bg-green-700 transition" title="Copier">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    // Met à jour un champ lien + désactive son bouton copier si le code correspondant
    // n'est pas configuré côté serveur (au lieu de laisser copier un texte inutile)
    setInviteLink(inputId, url, envVarName) {
        const input = document.getElementById(inputId);
        const button = document.getElementById(inputId.replace('invite-link-', 'invite-copy-'));
        if (!input) return;

        if (url) {
            input.value = url;
            input.classList.remove('text-red-600', 'italic');
            if (button) { button.disabled = false; button.classList.remove('opacity-40', 'cursor-not-allowed'); }
        } else {
            input.value = `Non configuré : ajoutez ${envVarName} dans le .env du serveur`;
            input.classList.add('text-red-600', 'italic');
            if (button) { button.disabled = true; button.classList.add('opacity-40', 'cursor-not-allowed'); }
        }
    }

    copyInviteLink(inputId) {
        const input = document.getElementById(inputId);
        if (input) this.copyText(input.value);
    }

    copyText(text) {
        if (!text) return;
        const onOk = () => notify('Lien copié', 'success');
        const onFail = () => notify('Copie automatique impossible, sélectionnez le texte manuellement', 'error');

        // navigator.clipboard n'existe que dans un contexte sécurisé (HTTPS/localhost) :
        // en HTTP simple, il est undefined et l'appel planterait silencieusement sans repli.
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(onOk).catch(() => {
                if (!this.legacyCopy(text)) onFail();
            });
        } else if (this.legacyCopy(text)) {
            onOk();
        } else {
            onFail();
        }
    }

    // Repli pour les navigateurs/contextes sans Clipboard API (ex: site servi en HTTP)
    legacyCopy(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e) {
            return false;
        }
    }

    // Page admin "Catégories" : liste + lien d'inscription (?cat=...) à copier pour chacune
    renderAdminCategories() {
        const container = document.getElementById('admin-categories-list');
        if (!container) return;

        if (!categories || categories.length === 0) {
            container.innerHTML = '<p class="text-gray-500 italic">Aucune catégorie.</p>';
            return;
        }

        const base = `${location.origin}${location.pathname}`;
        container.innerHTML = categories.map(cat => {
            const url = `${base}?cat=${encodeURIComponent(cat)}`;
            return `
            <div class="bg-white p-4 rounded-lg border border-gray-200 flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <p class="font-bold text-gray-800">${cat}</p>
                    <p class="text-xs text-gray-500 truncate">${url}</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button type="button" onclick="window.app.copyText('${url}')" class="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 transition whitespace-nowrap">
                        <i class="fa-solid fa-copy mr-1"></i>Copier le lien
                    </button>
                    <button type="button" onclick="window.app.deleteCategory('${cat}')" class="text-gray-400 hover:text-red-600" title="Supprimer">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    async addCategory() {
        const input = document.getElementById('new-category-name');
        const name = input ? input.value.trim() : '';
        if (!name) { notify('Entrez un nom de catégorie', 'error'); return; }

        showLoading(true);
        const res = await apiCall('categories.php', 'POST', { name });
        showLoading(false);

        if (res && res.success) {
            notify('Catégorie ajoutée', 'success');
            input.value = '';
            await this.fetchPublicData();
            this.renderAdminCategories();
        } else {
            notify(res ? res.message : 'Erreur', 'error');
        }
    }

    deleteCategory(name) {
        if (!confirm(`Supprimer la catégorie "${name}" ?`)) return;
        this.deleteCategoryConfirmed(name);
    }

    async deleteCategoryConfirmed(name) {
        showLoading(true);
        const res = await apiCall(`categories.php?name=${encodeURIComponent(name)}`, 'DELETE');
        showLoading(false);

        if (res && res.success) {
            notify('Catégorie supprimée', 'success');
            await this.fetchPublicData();
            this.renderAdminCategories();
        } else {
            notify(res ? res.message : 'Erreur', 'error');
        }
    }

    refreshCurrentView() {
        const activeSection = document.querySelector('.page-section.active');
        if(activeSection) {
            if(activeSection.id === 'view-home') this.renderHome();
            if(activeSection.id === 'view-calendar') this.renderCalendar();
            if(activeSection.id === 'view-profile') this.renderProfile();
            if(activeSection.id === 'view-admin-matches') this.renderAdminInscriptions();
        }
    }

    renderHome() {
        const list = document.getElementById('home-presences-list');
        if (!list) return;
        const today = new Date().toISOString().slice(0, 10);
        const mine = (allPresences || [])
            .filter(p => currentUser && p.user_id == currentUser.id && p.date >= today)
            .sort((a, b) => a.date.localeCompare(b.date));

        if (mine.length === 0) {
            list.innerHTML = `<p class="text-gray-500 italic">Aucune présence à venir. <a href="#" onclick="window.app.nav('inscription')" class="text-blue-600 hover:underline">Inscrivez-vous</a>.</p>`;
        } else {
            list.innerHTML = mine.map(p => `
                <div class="flex justify-between items-center bg-blue-50 border border-blue-100 rounded-lg px-4 py-2">
                    <span class="font-semibold text-blue-900">${formatDate(p.date)}</span>
                    <span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">Inscrit</span>
                </div>
            `).join('');
        }
    }

    // Remplacer l'ancienne méthode renderCalendar par celle-ci
    renderCalendar() {
        const tbody = document.getElementById('calendar-body');
        let html = '';

        sessionDates.forEach(date => {
            const presencesForDate = allPresences.filter(p => p.date === date);
            const isAdmin = currentUser && (currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.COACH);

            html += `<tr class="border-b">
                <td class="px-6 py-3">${formatDate(date)}</td>
                <td class="px-6 py-3">`;

            if (presencesForDate.length === 0) {
                html += 'Aucun inscrit';
            } else {
                html += presencesForDate.map(p => p.nom + ' ' + p.prenom).join(', ');
            }

            html += `</td>
                <td class="px-6 py-3 text-right">`;

            if (isAdmin) {
                presencesForDate.forEach(p => {
                    const selectOptions = sessionDates.map(d => `<option value="${d}" ${d === p.date ? 'selected' : ''}>${formatDate(d)}</option>`).join('');
                    html += `<div class="mb-2">
                        <span class="text-sm">${p.nom} ${p.prenom}:</span>
                        <select class="mr-2 p-1 border rounded" data-presence-id="${p.id}">${selectOptions}</select>
                        <button class="bg-blue-500 text-white px-2 py-1 rounded mr-2 text-xs" onclick="window.app.updatePresence(this)">Modifier</button>
                        <button class="bg-red-500 text-white px-2 py-1 rounded text-xs" onclick="window.app.deletePresence('${p.id}')">Supprimer</button>
                    </div>`;
                });
            }

            html += `</td></tr>`;
        });

        tbody.innerHTML = html;
    }


    renderProfile() {
        if(!currentUser) return;
        document.getElementById('profile-name').innerText = `${currentUser.prenom} ${currentUser.nom}`;
        document.getElementById('profile-role').innerText = currentUser.role.toUpperCase();
        document.getElementById('profile-email').innerText = currentUser.email;
        document.getElementById('profile-tel').innerText = currentUser.telephone;
        document.getElementById('profile-age').innerText = currentUser.age;

        const myPresences = allPresences.filter(p => p.user_id == currentUser.id);
        const container = document.getElementById('profile-bookings-list');
        
        if (myPresences.length === 0) {
            container.innerHTML = '<p class="text-gray-500 italic">Aucun samedi inscrit pour le moment.</p>';
        } else {
            container.innerHTML = myPresences.map(p => {
                return `
                <div class="bg-blue-50 p-4 rounded-lg border border-blue-100 flex justify-between items-center">
                    <div>
                        <p class="font-bold text-blue-900">${formatDate(p.date)}</p>
                    </div>
                </div>`;
            }).join('');
        }
    }

    editEmail() {
        const newEmail = prompt('Nouvelle adresse e-mail:', currentUser.email);
        if (newEmail && newEmail !== currentUser.email) {
            this.updateUser({ email: newEmail });
        }
    }

    editPhone() {
        const newPhone = prompt('Nouveau numéro de téléphone:', currentUser.telephone);
        if (newPhone && newPhone !== currentUser.telephone) {
            this.updateUser({ telephone: newPhone });
        }
    }

    editAge() {
        const newAge = prompt('Nouvel âge:', currentUser.age);
        if (newAge && newAge != currentUser.age) {
            this.updateUser({ age: newAge });
        }
    }

    async updateUser(updates) {
        showLoading(true);
        const res = await apiCall('bookings.php', 'POST', { action: 'updateUser', userId: currentUser.id, ...updates });
        showLoading(false);
        if (res && res.success) {
            Object.assign(currentUser, updates);
            this.renderProfile();
            notify('Informations mises à jour', 'success');
        } else {
            notify(res ? res.message : 'Erreur', 'error');
        }
    }

    updatePresence(btn) {
        const select = btn.previousElementSibling;
        const newDate = select.value;
        const presenceId = select.getAttribute('data-presence-id');
        this.updatePresenceDate(presenceId, newDate);
    }

    async updatePresenceDate(presenceId, newDate) {
        showLoading(true);
        const res = await apiCall('bookings.php', 'POST', { action: 'updatePresence', presenceId, date: newDate });
        showLoading(false);
        if (res && res.success) {
            await this.fetchData();
            this.renderCalendar();
            notify('Présence mise à jour', 'success');
        } else {
            notify(res ? res.message : 'Erreur', 'error');
        }
    }

    deletePresence(presenceId) {
        if (!confirm("Confirmez-vous l'annulation de cette présence ?")) return;
        this.deletePresenceById(presenceId);
    }

    async deletePresenceById(presenceId) {
        showLoading(true);
        const res = await apiCall(`bookings.php?id=${presenceId}&type=presence`, 'DELETE');
        showLoading(false);
        if (res && res.success) {
            await this.fetchData();
            this.renderCalendar();
            notify('Inscription supprimée', 'success');
        } else {
            notify(res ? res.message : 'Erreur', 'error');
        }
    }

    async editUser(userId) {
        if (!currentUser || currentUser.role !== ROLES.ADMIN) { notify('Accès refusé', 'error'); return; }
        const user = (this.adminUsers || []).find(u => u.id == userId);
        if (!user) { notify('Utilisateur introuvable', 'error'); return; }

        // Demander les champs à modifier (utilisation de prompt simple pour rapidité)
        const nom = prompt('Nom', user.nom) || user.nom;
        const prenom = prompt('Prénom', user.prenom) || user.prenom;
        const email = prompt('Email', user.email) || user.email;
        const age = prompt('Age', user.age || '') || user.age;
        const telephone = prompt('Téléphone', user.telephone || '') || user.telephone;
        const role = prompt('Rôle (admin/coach/joueur)', user.role) || user.role;
        const categorie = prompt('Catégories (séparées par des virgules)', user.categorie || '') || user.categorie || '';
        const status = prompt('Status (active/inactive)', user.status || 'active') || user.status || 'active';

        const payload = { id: userId, nom, prenom, email, age, telephone, role, categorie, status };
        showLoading(true);
        const res = await apiCall('bookings.php?action=update_user', 'POST', payload);
        showLoading(false);
        if (res && res.success) {
            notify('Profil mis à jour', 'success');
            await this.renderAdminStats();
        } else {
            notify(res?.message || 'Erreur mise à jour', 'error');
        }
    }

    async renderAdminStats() {
        const usersListEl = document.getElementById('admin-users-list');
        usersListEl.innerHTML = '<tr><td colspan="6" class="p-4">Chargement...</td></tr>';

        const users = await apiCall('bookings.php?action=users');
        this.adminUsers = users || [];

        if (users && users.length) {
            usersListEl.innerHTML = users.map(u => `
                <tr class="border-b border-gray-100">
                    <td class="px-4 py-2 font-medium">${u.nom} ${u.prenom}</td>
                    <td class="px-4 py-2 text-sm">${u.email}</td>
                    <td class="px-4 py-2 text-xs"><span class="bg-gray-200 px-2 py-1 rounded">${u.role}</span></td>
                    <td class="px-4 py-2 text-xs text-gray-500">${u.categorie || ''}</td>
                    <td class="px-4 py-2 text-sm">${u.status || 'active'}</td>
                    <td class="px-4 py-2 text-right">
                        <button onclick="window.app.editUser(${u.id})" class="bg-yellow-400 text-white px-3 py-1 rounded text-sm">Éditer</button>
                    </td>
                </tr>
            `).join('');
        } else {
            usersListEl.innerHTML = '<tr><td colspan="6" class="p-4 text-gray-500">Aucun utilisateur trouvé.</td></tr>';
        }

        const statsEl = document.getElementById('admin-stats-content');
        const counts = {};
        (allPresences || []).forEach(p => {
            const name = `${p.prenom} ${p.nom}`;
            counts[name] = (counts[name] || 0) + 1;
        });

        if (Object.keys(counts).length === 0) {
            statsEl.innerHTML = "Aucune donnée.";
        } else {
            const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
            statsEl.innerHTML = `<ul class="space-y-2">
                ${sorted.map(([name, count]) => `
                    <li class="flex justify-between items-center border-b border-gray-100 pb-1">
                        <span>${name}</span>
                        <span class="font-bold text-blue-600">${count} arbitrages</span>
                    </li>
                `).join('')}
            </ul>`;
        }
    }
}

window.app = new App();