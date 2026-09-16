// Déclaration de la variable globale pour stocker les pièces (évite les erreurs de portée)
let toutesLesPieces = [];

document.addEventListener('DOMContentLoaded', () => {
    chargerFournisseurs();
    chargerPieces();
    chargerMouvements();

    // Gestion du formulaire d'ajout de fournisseur
    const formFournisseur = document.getElementById('fournisseur-form');
    if (formFournisseur) {
        formFournisseur.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nouveauFournisseur = {
                nom: document.getElementById('fournisseur-nom').value,
                contact: document.getElementById('fournisseur-contact').value
            };

            try {
                const res = await fetch('/api/fournisseurs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nouveauFournisseur)
                });

                if (res.ok) {
                    formFournisseur.reset();
                    chargerFournisseurs();
                    alert('Fournisseur ajouté avec succès !');
                } else {
                    const errData = await res.json();
                    alert('Erreur : ' + (errData.error || 'Impossible d\'ajouter le fournisseur'));
                }
            } catch (error) {
                console.error('Erreur réseau:', error);
            }
        });
    }

    // Gestion du formulaire d'ajout de pièce
    const formPiece = document.getElementById('piece-form');
    if (formPiece) {
        formPiece.addEventListener('submit', async (e) => {
            e.preventDefault();

            const nouvellePiece = {
                reference: document.getElementById('reference').value,
                nom: document.getElementById('nom').value,
                emplacement: document.getElementById('emplacement').value,
                quantite: parseInt(document.getElementById('quantite').value),
                seuil_alerte: parseInt(document.getElementById('seuil_alerte').value) || 2,
                fournisseur_id: document.getElementById('fournisseur_id').value || null
            };

            try {
                const res = await fetch('/api/pieces', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nouvellePiece)
                });

                if (res.ok) {
                    formPiece.reset();
                    chargerPieces();
                    chargerMouvements();
                } else {
                    const errData = await res.json();
                    alert('Erreur lors de l\'ajout de la pièce : ' + (errData.error || 'Référence déjà existante ou champ invalide'));
                }
            } catch (error) {
                console.error('Erreur réseau:', error);
            }
        });
    }

    // Recherche en temps réel
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const terme = e.target.value.toLowerCase();
            document.querySelectorAll('#pieces-list tr').forEach(ligne => {
                ligne.style.display = ligne.innerText.toLowerCase().includes(terme) ? '' : 'none';
            });
        });
    }
});

// Fonction de changement d'onglets robuste
function changerOnglet(nomOnglet) {
    const ongletPieces = document.getElementById('onglet-pieces');
    const ongletFournisseurs = document.getElementById('onglet-fournisseurs');
    const ongletTracabilite = document.getElementById('onglet-traçabilite');
    
    if (ongletPieces) ongletPieces.classList.remove('active');
    if (ongletFournisseurs) ongletFournisseurs.classList.remove('active');
    if (ongletTracabilite) ongletTracabilite.classList.remove('active');
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    if (nomOnglet === 'pieces') {
        if (ongletPieces) ongletPieces.classList.add('active');
        if (document.querySelectorAll('.tab-btn')[0]) document.querySelectorAll('.tab-btn')[0].classList.add('active');
    } else if (nomOnglet === 'fournisseurs') {
        if (ongletFournisseurs) ongletFournisseurs.classList.add('active');
        if (document.querySelectorAll('.tab-btn')[1]) document.querySelectorAll('.tab-btn')[1].classList.add('active');
    } else if (nomOnglet === 'traçabilite') {
        if (ongletTracabilite) ongletTracabilite.classList.add('active');
        if (document.querySelectorAll('.tab-btn')[2]) document.querySelectorAll('.tab-btn')[2].classList.add('active');
        chargerMouvements();
    }
}

// Charger les fournisseurs (Select + Tableau)
async function chargerFournisseurs() {
    try {
        const res = await fetch('/api/fournisseurs');
        const fournisseurs = await res.json();
        
        const select = document.getElementById('fournisseur_id');
        if (select) {
            select.innerHTML = '<option value="">-- Choisir un fournisseur --</option>';
            fournisseurs.forEach(f => {
                const option = document.createElement('option');
                option.value = f.id;
                option.textContent = f.nom;
                select.appendChild(option);
            });
        }

        const tbodyFournisseurs = document.getElementById('fournisseurs-list');
        if (tbodyFournisseurs) {
            tbodyFournisseurs.innerHTML = '';
            fournisseurs.forEach(f => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="Nom"><strong>${f.nom}</strong></td>
                    <td data-label="Contact">${f.contact || 'Aucun contact'}</td>
                `;
                tbodyFournisseurs.appendChild(tr);
            });
        }
    } catch (err) {
        console.error('Erreur chargement fournisseurs', err);
    }
}

// Charger les pièces dans le tableau
async function chargerPieces() {
    try {
        const res = await fetch('/api/pieces');
        const pieces = await res.json();
        
        // Tri alphabétique croissant par nom de pièce (A à Z) sécurisé
        pieces.sort((a, b) => {
            const nomA = a.nom ? a.nom.toLowerCase() : '';
            const nomB = b.nom ? b.nom.toLowerCase() : '';
            return nomA.localeCompare(nomB, 'fr', { sensitivity: 'base' });
        });

        toutesLesPieces = pieces; // Met à jour la variable globale proprement
        
        const tbody = document.getElementById('pieces-list');
        if (!tbody) return;
        tbody.innerHTML = '';

        pieces.forEach(piece => {
            const tr = document.createElement('tr');
            if (piece.quantite <= piece.seuil_alerte) {
                tr.classList.add('stock-alerte');
            }

            tr.innerHTML = `
                <td data-label="Référence"><strong>${piece.reference}</strong></td>
                <td data-label="Nom">${piece.nom}</td>
                <td data-label="Emplacement">${piece.emplacement || '-'}</td>
                <td data-label="Fournisseur">${piece.fournisseur_nom || 'Aucun'}</td>
                <td data-label="Quantité"><span id="qte-${piece.id}">${piece.quantite}</span></td>
                <td data-label="Actions">
                    <button class="btn-action" onclick="modifierQuantite(${piece.id}, ${piece.quantite}, -1)">-</button>
                    <button class="btn-action" onclick="modifierQuantite(${piece.id}, ${piece.quantite}, 1)">+</button>
                    <button class="btn-suppr" onclick="supprimerPiece(${piece.id})">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Erreur lors du chargement des pièces:", error);
    }
}

// Charger l'historique des mouvements
async function chargerMouvements() {
    try {
        const res = await fetch('/api/mouvements');
        const mouvements = await res.json();

        const tbody = document.getElementById('mouvements-list');
        if (!tbody) return;
        tbody.innerHTML = '';

        mouvements.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Date" style="color: #64748b; font-size: 13px;">${m.date}</td>
                <td data-label="Type"><strong>${m.type}</strong></td>
                <td data-label="Détails">${m.details}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Erreur chargement mouvements', err);
    }
}

// Modifier la quantité
async function modifierQuantite(id, qteActuelle, delta) {
    const nouvelleQte = qteActuelle + delta;
    if (nouvelleQte < 0) return;

    try {
        const res = await fetch(`/api/pieces/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantite: nouvelleQte })
        });

        if (res.ok) {
            chargerPieces();
            chargerMouvements();
        }
    } catch (err) {
        console.error('Erreur modification quantité', err);
    }
}

// Supprimer une pièce
async function supprimerPiece(id) {
    if (confirm('Voulez-vous vraiment supprimer cette pièce de l\'inventaire ?')) {
        try {
            const res = await fetch(`/api/pieces/${id}`, { method: 'DELETE' });
            if (res.ok) {
                chargerPieces();
                chargerMouvements();
            }
        } catch (err) {
            console.error('Erreur suppression pièce', err);
        }
    }
}

// --- GESTION DU TABLEAU DE BORD & MODALE ---

function ouvrirModalTableauDeBord() {
    // Sécurité au cas où la fonction fermerMenu n'existe pas dans le HTML
    if (typeof fermerMenu === 'function') {
        fermerMenu();
    }
    
    const modal = document.getElementById('modalTableauDeBord');
    if (modal) {
        modal.style.display = 'flex';
        chargerTableauDeBord(); 
    }
}

function fermerModalTableauDeBord() {
    const modal = document.getElementById('modalTableauDeBord');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function chargerTableauDeBord() {
    try {
        const [resPieces, resFournisseurs, resMouvements] = await Promise.all([
            fetch('/api/pieces').then(r => r.json()),
            fetch('/api/fournisseurs').then(r => r.json()),
            fetch('/api/mouvements').then(r => r.json()).catch(() => [])
        ]);

        // Mise à jour de la variable globale au passage
        toutesLesPieces = resPieces;

        // 1. Calculs des KPIs
        const totalReferences = resPieces.length;
        const stockFaible = resPieces.filter(p => p.quantite <= p.seuil_alerte && p.quantite > 0).length;
        const ruptures = resPieces.filter(p => p.quantite === 0).length;
        const totalFournisseurs = resFournisseurs.length;

        const aujourdHui = new Date().toISOString().split('T')[0];
        const mouvementsJour = resMouvements.filter(m => m.date && m.date.startsWith(aujourdHui)).length;

        // Affichage sécurisé des KPIs
        if (document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = totalReferences;
        if (document.getElementById('kpi-faible')) document.getElementById('kpi-faible').innerText = stockFaible;
        if (document.getElementById('kpi-ruptures')) document.getElementById('kpi-ruptures').innerText = ruptures;
        if (document.getElementById('kpi-fournisseurs')) document.getElementById('kpi-fournisseurs').innerText = totalFournisseurs;
        if (document.getElementById('kpi-mouvements')) document.getElementById('kpi-mouvements').innerText = mouvementsJour;

        // 2. Liste des pièces à réapprovisionner
        const piecesReappro = resPieces.filter(p => p.quantite <= p.seuil_alerte);
        const listeReapproDiv = document.getElementById('listeReappro');
        
        if (!listeReapproDiv) return;

        if (piecesReappro.length === 0) {
            listeReapproDiv.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding: 15px;">Aucune pièce en alerte. Tout est OK ! 👍</p>';
            return;
        }

        listeReapproDiv.innerHTML = piecesReappro.map(p => `
            <div class="reappro-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 0.9rem; cursor: pointer;" onclick="fermerModalTableauDeBord()">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="reappro-ref" style="font-weight: bold;">${p.reference}</span>
                    <span>${p.nom}</span>
                </div>
                <div style="font-weight: bold; color: ${p.quantite === 0 ? 'var(--danger)' : '#d97706'};">
                    Qté : ${p.quantite} / Seuil : ${p.seuil_alerte}
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error("Erreur chargement tableau de bord :", error);
    }
}