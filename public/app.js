document.addEventListener('DOMContentLoaded', () => {
    chargerFournisseurs();
    chargerPieces();
    chargerMouvements();

    // Gestion du formulaire d'ajout de fournisseur
    const formFournisseur = document.getElementById('fournisseur-form');
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

    // Gestion du formulaire d'ajout de pièce
    const formPiece = document.getElementById('piece-form');
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

    // Recherche en temps réel
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', (e) => {
        const terme = e.target.value.toLowerCase();
        document.querySelectorAll('#pieces-list tr').forEach(ligne => {
            ligne.style.display = ligne.innerText.toLowerCase().includes(terme) ? '' : 'none';
        });
    });
});

// Fonction de changement d'onglets robuste
function changerOnglet(nomOnglet) {
    document.getElementById('onglet-pieces').classList.remove('active');
    document.getElementById('onglet-fournisseurs').classList.remove('active');
    document.getElementById('onglet-traçabilite').classList.remove('active');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    if (nomOnglet === 'pieces') {
        document.getElementById('onglet-pieces').classList.add('active');
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
    } else if (nomOnglet === 'fournisseurs') {
        document.getElementById('onglet-fournisseurs').classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
    } else if (nomOnglet === 'traçabilite') {
        document.getElementById('onglet-traçabilite').classList.add('active');
        document.querySelectorAll('.tab-btn')[2].classList.add('active');
        chargerMouvements(); // Recharge l'historique à l'ouverture de l'onglet
    }
}

// Charger les fournisseurs (Select + Tableau)
async function chargerFournisseurs() {
    try {
        const res = await fetch('/api/fournisseurs');
        const fournisseurs = await res.json();
        
        const select = document.getElementById('fournisseur_id');
        select.innerHTML = '<option value="">-- Choisir un fournisseur --</option>';

        const tbodyFournisseurs = document.getElementById('fournisseurs-list');
        tbodyFournisseurs.innerHTML = '';

        fournisseurs.forEach(f => {
            const option = document.createElement('option');
            option.value = f.id;
            option.textContent = f.nom;
            select.appendChild(option);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Nom"><strong>${f.nom}</strong></td>
                <td data-label="Contact">${f.contact || 'Aucun contact'}</td>
            `;
            tbodyFournisseurs.appendChild(tr);
        });
    } catch (err) {
        console.error('Erreur chargement fournisseurs', err);
    }
}

// Charger les pièces dans le tableau
async function chargerPieces() {
    try {
        const res = await fetch('/api/pieces');
        const pieces = await res.json();
        
        const tbody = document.getElementById('pieces-list');
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
    } catch (err) {
        console.error('Erreur chargement pièces', err);
    }
}

// Charger l'historique des mouvements
async function chargerMouvements() {
    try {
        const res = await fetch('/api/mouvements');
        const mouvements = await res.json();

        const tbody = document.getElementById('mouvements-list');
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