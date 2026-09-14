const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./inventaire.db', (err) => {
    if (err) console.error('Erreur de connexion à la BDD', err.message);
    else console.log('Connecté à la base de données SQLite.');
});

// Création des tables (Fournisseurs, Pièces, Mouvements)
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS fournisseurs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT UNIQUE,
        contact TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS pieces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference TEXT UNIQUE,
        nom TEXT,
        emplacement TEXT,
        quantite INTEGER,
        seuil_alerte INTEGER,
        fournisseur_id INTEGER,
        FOREIGN KEY(fournisseur_id) REFERENCES fournisseurs(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS mouvements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        type TEXT,
        details TEXT
    )`);
});

// Fonction utilitaire pour enregistrer un mouvement
function enregistrerMouvement(type, details) {
    const date = new Date().toLocaleString('fr-FR');
    db.run(`INSERT INTO mouvements (date, type, details) VALUES (?, ?, ?)`, [date, type, details]);
}

// --- FOURNISSEURS ---
app.get('/api/fournisseurs', (req, res) => {
    db.all(`SELECT * FROM fournisseurs`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/fournisseurs', (req, res) => {
    const { nom, contact } = req.body;
    db.run(`INSERT INTO fournisseurs (nom, contact) VALUES (?, ?)`, [nom, contact], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        enregistrerMouvement('FOURNISSEUR', `Ajout du fournisseur : ${nom}`);
        res.json({ id: this.lastID, nom, contact });
    });
});

// --- PIÈCES ---
app.get('/api/pieces', (req, res) => {
    const query = `
        SELECT pieces.*, fournisseurs.nom as fournisseur_nom 
        FROM pieces 
        LEFT JOIN fournisseurs ON pieces.fournisseur_id = fournisseurs.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/pieces', (req, res) => {
    const { reference, nom, emplacement, quantite, seuil_alerte, fournisseur_id } = req.body;
    const query = `INSERT INTO pieces (reference, nom, emplacement, quantite, seuil_alerte, fournisseur_id) VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.run(query, [reference, nom, emplacement, quantite, seuil_alerte, fournisseur_id || null], function(err) {
        if (err) {
            console.error("ERREUR SQL:", err.message);
            return res.status(400).json({ error: err.message });
        }
        enregistrerMouvement('AJOUT', `Ajout de la pièce [${reference}] ${nom} (Qté initiale: ${quantite})`);
        res.json({ id: this.lastID });
    });
});

app.patch('/api/pieces/:id', (req, res) => {
    const { quantite } = req.body;
    const id = req.params.id;

    // Récupérer le nom et la référence avant modification pour l'historique
    db.get(`SELECT reference, nom FROM pieces WHERE id = ?`, [id], (err, piece) => {
        if (err || !piece) return res.status(404).json({ error: 'Pièce introuvable' });

        db.run(`UPDATE pieces SET quantite = ? WHERE id = ?`, [quantite, id], function(err) {
            if (err) return res.status(400).json({ error: err.message });
            enregistrerMouvement('STOCK', `Mise à jour du stock de [${piece.reference}] ${piece.nom} -> Nouvelle quantité : ${quantite}`);
            res.json({ message: 'Quantité mise à jour' });
        });
    });
});

app.delete('/api/pieces/:id', (req, res) => {
    const id = req.params.id;

    db.get(`SELECT reference, nom FROM pieces WHERE id = ?`, [id], (err, piece) => {
        if (err || !piece) return res.status(404).json({ error: 'Pièce introuvable' });

        db.run(`DELETE FROM pieces WHERE id = ?`, [id], function(err) {
            if (err) return res.status(400).json({ error: err.message });
            enregistrerMouvement('SUPPRESSION', `Suppression de la pièce [${piece.reference}] ${piece.nom}`);
            res.json({ message: 'Pièce supprimée' });
        });
    });
});

// --- MOUVEMENTS (TRAÇABILITÉ) ---
app.get('/api/mouvements', (req, res) => {
    db.all(`SELECT * FROM mouvements ORDER BY id DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- EXPORT PDF AMÉLIORÉ ---
app.get('/api/export/pdf', (req, res) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=inventaire_atelier.pdf');
    
    doc.pipe(res);

    // En-tête du document
    doc.fontSize(22).fillColor('#1e293b').text('ATELIER MÉCA - ÉTAT DU STOCK', { align: 'center' });
    doc.fontSize(10).fillColor('#64748b').text(`Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, { align: 'center' });
    doc.moveDown(1.5);

    const query = `
        SELECT pieces.*, fournisseurs.nom as fournisseur_nom 
        FROM pieces 
        LEFT JOIN fournisseurs ON pieces.fournisseur_id = fournisseurs.id
        ORDER BY pieces.reference ASC
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            doc.fontSize(12).fillColor('red').text('Erreur lors du chargement des données.');
            doc.end();
            return;
        }

        // En-têtes du tableau
        const startX = 40;
        let startY = doc.y;
        const colWidths = [75, 130, 80, 95, 55, 80]; // Largeurs des colonnes

        function dessinerEntetesTableau(y) {
            doc.rect(startX, y, 515, 20).fill('#f1f5f9');
            doc.fontSize(9).fillColor('#334155').font('Helvetica-Bold');
            doc.text('Référence', startX + 5, y + 6, { width: colWidths[0] });
            doc.text('Nom', startX + colWidths[0] + 5, y + 6, { width: colWidths[1] });
            doc.text('Emplacement', startX + colWidths[0] + colWidths[1] + 5, y + 6, { width: colWidths[2] });
            doc.text('Fournisseur', startX + colWidths[0] + colWidths[1] + colWidths[2] + 5, y + 6, { width: colWidths[3] });
            doc.text('Qté', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 5, y + 6, { width: colWidths[4], align: 'right' });
            doc.text('Alerte', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + 5, y + 6, { width: colWidths[5], align: 'right' });
            doc.font('Helvetica');
        }

        dessinerEntetesTableau(startY);
        startY += 25;

        // Lignes du tableau
        doc.fontSize(9).fillColor('#1e293b');
        rows.forEach((p, index) => {
            // S'il ne reste plus assez de place sur la page, on crée une nouvelle page
            if (startY > 750) {
                doc.addPage();
                startY = 40;
                dessinerEntetesTableau(startY);
                startY += 25;
            }

            // Alternance de couleur de fond pour les lignes (effet zébré)
            if (index % 2 === 0) {
                doc.rect(startX, startY - 3, 515, 18).fill('#f8fafc');
                doc.fillColor('#1e293b');
            }

            // Si le stock est bas, on met un fond rouge léger ou le texte en rouge
            if (p.quantite <= p.seuil_alerte) {
                doc.fillColor('#b91c1c').font('Helvetica-Bold');
            }

            doc.text(p.reference, startX + 5, startY, { width: colWidths[0] });
            doc.text(p.nom, startX + colWidths[0] + 5, startY, { width: colWidths[1] });
            doc.text(p.emplacement || '-', startX + colWidths[0] + colWidths[1] + 5, startY, { width: colWidths[2] });
            doc.text(p.fournisseur_nom || 'Aucun', startX + colWidths[0] + colWidths[1] + colWidths[2] + 5, startY, { width: colWidths[3] });
            doc.text(String(p.quantite), startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 5, startY, { width: colWidths[4], align: 'right' });
            doc.text(String(p.seuil_alerte), startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + 5, startY, { width: colWidths[5], align: 'right' });

            doc.fillColor('#1e293b').font('Helvetica');
            startY += 18;
        });

        doc.end();
    });
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});