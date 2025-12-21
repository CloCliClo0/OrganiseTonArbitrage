// Configuration
const API_BASE_URL = '/api'; 

// --- ETAT DE L'APPLICATION ---
let currentUser = null;
let allPresences = [];

// Constantes Rôles pour l'affichage
const ROLES = { ADMIN: 'admin', COACH: 'coach', JOUEUR: 'joueur' };

// Samedis 2026
const SATURDAYS_2026 = [
    '2026-01-24', '2026-01-31', '2026-02-07', '2026-02-14', '2026-02-21', '2026-02-28',
    '2026-03-07', '2026-03-14', '2026-03-21', '2026-03-28', '2026-04-04', '2026-04-11',
    '2026-04-18', '2026-04-25', '2026-05-02', '2026-05-09', '2026-05-16', '2026-05-23'
];

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
        this.initAuth();
        this.checkUrlParams();
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            const codeInput = document.getElementById('reg-code');
            if(codeInput) codeInput.value = code;
        }
    }

    nav(viewId) {
        document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(`view-${viewId}`);
        if(target) target.classList.add('active');
        
        if(viewId === 'calendar') this.renderCalendar();
        if(viewId === 'home') this.renderHome();
        if(viewId === 'profile') this.renderProfile();
        if(viewId === 'admin-matches') this.renderAdminInscriptions();
        if(viewId === 'admin-users' || viewId === 'admin-stats') this.renderAdminStats();

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

    async fetchData() {
        const presences = await apiCall('bookings.php?action=presences');
        
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
        
        const data = {
            nom: document.getElementById('reg-nom').value,
            prenom: document.getElementById('reg-prenom').value,
            email: document.getElementById('reg-email').value,
            age: document.getElementById('reg-age').value,
            tel: document.getElementById('reg-tel').value,
            cat: document.getElementById('reg-cat').value,
            password: document.getElementById('reg-password').value
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

    async handleAddMatch(e) {
        e.preventDefault();
        const data = {
            date: document.getElementById('match-date').value,
            time: document.getElementById('match-time').value,
            opponent: document.getElementById('match-opponent').value,
            location: document.getElementById('match-location').value,
            category: document.getElementById('match-category').value
        };

        showLoading(true);
        const res = await apiCall('matches.php', 'POST', data);
        
        if (res && res.success) {
            notify("Match ajouté !", "success");
            e.target.reset();
            await this.fetchData();
            this.nav('calendar');
        } else {
            notify("Erreur ajout match", "error");
        }
        showLoading(false);
    }

    async toggleBooking(matchId) {
        if(!currentUser) return;
        await this.fetchData(); 
        
        const myBooking = allBookings.find(b => b.matchId == matchId && b.userId == currentUser.id);

        if (myBooking) {
            if(!confirm("Annuler votre arbitrage pour ce match ?")) return;
            const res = await apiCall(`bookings.php?id=${myBooking.id}`, 'DELETE');
            if(res && res.success) notify("Réservation annulée", "info");
        } else {
            const res = await apiCall('bookings.php', 'POST', { matchId });
            if(res && res.success) {
                notify("Arbitrage réservé !", "success");
            } else {
                notify(res.message || "Impossible de réserver", "error");
            }
        }
        await this.fetchData();
        this.refreshCurrentView();
    }

    // Dans js/script.js, méthode renderAdminStats()

    async renderAdminStats() {
        // ... code d'affichage du chargement ...
        
        // C'est ici que l'appel se fait :
        const users = await apiCall('bookings.php?action=users');
        
        if (users) {
            // Si on reçoit des utilisateurs, on génère le HTML du tableau
            usersListEl.innerHTML = users.map(u => `
                <tr class="border-b border-gray-100">
                    <td class="px-4 py-2 font-medium">${u.nom} ${u.prenom}</td>
                    <td class="px-4 py-2 text-xs"><span class="bg-gray-200 px-2 py-1 rounded">${u.role}</span></td>
                    <td class="px-4 py-2 text-xs text-gray-500">${u.categorie}</td>
                </tr>
            `).join('');
        }
        // ... suite du code ...
    }

    async renderAdminInscriptions() {
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
        SATURDAYS_2026.forEach(date => {
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
                    SATURDAYS_2026.forEach(d => {
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

    async editMatch(id) {
        if (!currentUser || currentUser.role !== ROLES.ADMIN && currentUser.role !== ROLES.DIRIGEANT) { notify('Accès refusé', 'error'); return; }
        // Récupérer le match
        const match = allMatches.find(m => m.id == id);
        if (!match) { notify('Match introuvable', 'error'); return; }

        const date = prompt('Date (YYYY-MM-DD)', match.date) || match.date;
        const time = prompt('Heure (HH:MM)', match.time.slice(0,5)) || match.time;
        const opponent = prompt('Adversaire', match.opponent) || match.opponent;
        const location = prompt('Lieu (Domicile/Exterieur)', match.location) || match.location;
        const category = prompt('Catégorie', match.category) || match.category;

        const payload = { id, date, time, opponent, location, category };
        showLoading(true);
        const res = await apiCall('matches.php?action=update', 'POST', payload);
        showLoading(false);
        if (res && res.success) {
            notify('Match mis à jour', 'success');
            await this.fetchData();
            this.renderAdminInscriptions();
            this.renderCalendar();
        } else {
            notify(res?.message || 'Erreur mise à jour', 'error');
        }
    }

    async deleteMatch(id) {
        if (!currentUser || currentUser.role !== ROLES.ADMIN) { notify('Accès refusé', 'error'); return; }
        if (!confirm('Supprimer ce match ?')) return;
        showLoading(true);
        const res = await apiCall(`matches.php?id=${id}`, 'DELETE');
        showLoading(false);
        if (res && res.success) {
            notify('Match supprimé', 'success');
            await this.fetchData();
            this.renderAdminInscriptions();
            this.renderCalendar();
        } else {
            notify(res?.message || 'Erreur suppression', 'error');
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
        const list = document.getElementById('home-matches-list');
        const today = new Date();
        const nextMatches = allMatches.filter(m => new Date(m.date) >= today).slice(0, 3);

        if(nextMatches.length > 0) {
            document.getElementById('home-weekend-date').innerText = formatDate(nextMatches[0].date);
            list.innerHTML = nextMatches.map(m => this.getMatchHTML(m, true)).join('');
        } else {
            list.innerHTML = '<div class="p-6 text-center text-gray-500">Aucun match à venir.</div>';
        }
    }

    resetCalendarFilter() {
        document.getElementById('calendar-filter-date').value = '';
        this.renderCalendar();
    }

    // Remplacer l'ancienne méthode renderCalendar par celle-ci
    renderCalendar() {
        const tbody = document.getElementById('calendar-body');
        let html = '';

        SATURDAYS_2026.forEach(date => {
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
                    const selectOptions = SATURDAYS_2026.map(d => `<option value="${d}" ${d === p.date ? 'selected' : ''}>${formatDate(d)}</option>`).join('');
                    html += `<div class="mb-2">
                        <span class="text-sm">${p.user_nom} ${p.user_prenom}:</span>
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

    // --- NOUVELLE FONCTION A AJOUTER DANS LA CLASSE APP ---
    // Cette fonction gère l'ajout/suppression pour tout le week-end d'un coup
    async handleWeekendToggle(weekKey) {
        if (!currentUser) { notify('Veuillez vous connecter', 'error'); return; }

        const satDate = weekKey;
        const sunDT = new Date(new Date(satDate).setDate(new Date(satDate).getDate() + 1));
        const sunDate = sunDT.toISOString().slice(0, 10);

        // Vérifier si l'utilisateur a déjà des présences ce week-end
        const myPresences = (this.allPresences || []).filter(p => 
            p.user_id == currentUser.id && (p.date === satDate || p.date === sunDate)
        );

        if (myPresences.length > 0) {
            // CAS 1 : L'utilisateur est présent -> On ANNULE tout (Samedi et Dimanche)
            if (!confirm("Voulez-vous retirer votre présence pour ce week-end ?")) return;
            
            showLoading(true);
            let successCount = 0;
            
            // On supprime chaque entrée de présence trouvée
            for (const p of myPresences) {
                // On suppose que l'objet présence a un ID (p.id) récupéré depuis l'API bookings.php?action=presences
                // Si l'API ne renvoie pas l'ID de la réservation dans 'presences', il faudra ajuster l'API.
                // Fallback : essayer de trouver la réservation correspondante dans allBookings si p.id est manquant
                let bookingId = p.id; 
                if(!bookingId) {
                    const booking = allBookings.find(b => b.userId == currentUser.id && b.date == p.date);
                    if(booking) bookingId = booking.id;
                }

                if(bookingId) {
                    const res = await apiCall(`bookings.php?id=${bookingId}`, 'DELETE');
                    if (res && res.success) successCount++;
                }
            }
            showLoading(false);
            
            if (successCount > 0) notify("Présence annulée.", "info");
            else notify("Erreur lors de l'annulation.", "error");

        } else {
            // CAS 2 : L'utilisateur n'est pas là -> On AJOUTE pour TOUT le week-end
            
            // Vérification de sécurité "Max 2 personnes" côté client (doublon de renderCalendar mais nécessaire)
            const weekendAll = (this.allPresences || []).filter(p => p.date === satDate || p.date === sunDate);
            const distinctUsers = new Set(weekendAll.map(p => p.user_id));
            if (distinctUsers.size >= 2) {
                return notify("Ce week-end est déjà complet (2 personnes max).", "error");
            }

            if (!confirm("Confirmer votre présence pour le week-end complet (Samedi + Dimanche) ?")) return;

            showLoading(true);
            // On envoie les deux dates d'un coup
            const res = await apiCall('bookings.php', 'POST', { presenceDates: [satDate, sunDate] });
            showLoading(false);

            if (res && res.success) {
                notify("C'est noté ! Vous êtes présent ce week-end.", "success");
            } else {
                notify(res?.message || "Erreur lors de l'enregistrement", "error");
            }
        }

        // Rafraîchir les données
        await this.fetchData();
        this.renderCalendar();
    }

    toggleSelectAll(btn) {
        // Toggle the two day checkboxes if present
        const root = document.getElementById('weekend-modal-body');
        const sat = root.querySelector('[data-day="sat"]');
        const sun = root.querySelector('[data-day="sun"]');
        if (!sat && !sun) return;
        const allChecked = (sat ? sat.checked : true) && (sun ? sun.checked : true);
        if (sat) sat.checked = !allChecked;
        if (sun) sun.checked = !allChecked;
    }

    // Réserver tous les matchs d'une même date (samedi ou dimanche)
    async reserveDay(dateStr) {
        if (!currentUser) { notify('Veuillez vous connecter pour réserver', 'error'); return; }
        const matchesToBook = allMatches.filter(m => m.date === dateStr);
        if (matchesToBook.length === 0) { notify('Aucun match ce jour-là', 'error'); return; }

        if (!confirm(`Voulez-vous indiquer votre présence pour le ${formatDate(dateStr)} ?`)) return;
        showLoading(true);
        const res = await apiCall('bookings.php', 'POST', { presenceDate: dateStr });
        showLoading(false);

        if (!res) { notify('Erreur serveur', 'error'); return; }
        if (res.success) notify('Présence enregistrée', 'success');
        else notify(res.message || 'Erreur réservation', 'error');

        await this.fetchData();
        this.renderCalendar();
    }

    getMatchHTML(match, isSimple) {
        // Use presences (day-level) to compute status per match date
        const pres = (this.allPresences || []).filter(p => p.date === match.date);
        const isFull = pres.length >= 2;
        const isBookedByMe = pres.some(p => p.user_id == currentUser?.id || (p.prenom && (p.prenom + ' ' + p.nom) === (currentUser?.prenom + ' ' + currentUser?.nom)));
        const dateStr = formatDate(match.date);
        // On retire la réservation par match: on affiche uniquement l'état de présence
        let statusHTML = '';
        if (isBookedByMe) {
            statusHTML = `<span class="px-3 py-1 rounded text-xs font-bold bg-green-100 text-green-700 border border-green-200">Présent</span>`;
        } else if (isFull) {
            statusHTML = `<span class="px-3 py-1 rounded text-xs font-bold bg-gray-50 text-gray-400 border border-gray-200">Complet</span>`;
        } else {
            statusHTML = `<span class="px-3 py-1 rounded text-xs text-gray-600 border border-gray-100 bg-white">Disponible</span>`;
        }

        if(isSimple) {
            return `
            <div class="p-4 flex justify-between items-center hover:bg-gray-50 transition">
                <div>
                    <p class="font-bold text-gray-800">${match.location === 'Domicile' ? 'DOM' : 'EXT'} vs ${match.opponent}</p>
                    <p class="text-sm text-gray-500">${dateStr} à ${match.time} (${match.category})</p>
                </div>
                ${statusHTML}
            </div>`;
        }

        return `
        <tr class="hover:bg-gray-50 border-b border-gray-100 transition">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                <div class="font-semibold">${dateStr}</div>
                <div class="text-gray-500">${match.time}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap font-bold text-gray-900">
                vs ${match.opponent}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">${match.category}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                ${match.location === 'Domicile' ? '<span class="text-green-600 font-bold"><i class="fa-solid fa-house mr-1"></i>Dom.</span>' : '<span class="text-orange-500 font-bold"><i class="fa-solid fa-bus mr-1"></i>Ext.</span>'}
            </td>
            <td class="px-6 py-4 text-center text-sm">
                <div class="flex justify-center space-x-1">
                    ${(this.allPresences || []).filter(p => p.date === match.date).map(p => { const name = (p.prenom ? p.prenom + ' ' + p.nom : (p.userName || 'U')); return `<span title="${name}" class="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold border border-indigo-200 cursor-help">${name.charAt(0)}</span>`; }).join('')}
                    ${[...Array(Math.max(0, 2 - ((this.allPresences || []).filter(p => p.date === match.date).length)))] .map(() => `<span class="w-8 h-8 bg-gray-100 text-gray-300 rounded-full flex items-center justify-center border border-dashed border-gray-300"><i class="fa-solid fa-user"></i></span>`).join('')}
                </div>
            </td>
            <td class="px-6 py-4 text-right">
                ${statusHTML}
            </td>
        </tr>`;
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
        const role = prompt('Rôle (admin/dirigeant/joueur)', user.role) || user.role;
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
        allBookings.forEach(b => {
            counts[b.userName] = (counts[b.userName] || 0) + 1;
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