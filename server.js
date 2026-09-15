const express = require('express');
const { createClient } = require('@libsql/client');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connexion à Turso (en production sur Render) ou SQLite local (sur ton PC)
const db = createClient({
    url: process.env.TURSO_DATABASE_URL || 'file:inventaire.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
});

// Création des tables au démarrage de manière asynchrone
async function initDb() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS fournisseurs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT UNIQUE,
                contact TEXT
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS pieces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference TEXT UNIQUE,
                nom TEXT,
                emplacement TEXT,
                quantite INTEGER,
                seuil_alerte INTEGER,
                fournisseur_id INTEGER,
                FOREIGN KEY(fournisseur_id) REFERENCES fournisseurs(id)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS mouvements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                type TEXT,
                details TEXT
            )
        `);
        console.log("Connecté et tables initialisées avec succès !");
    } catch (err) {
        console.error("Erreur d'initialisation de la BDD :", err.message);
    }
}

initDb();

// Fonction utilitaire pour enregistrer un mouvement
async function enregistrerMouvement(type, details) {
    try {
        const date = new Date().toLocaleString('fr-FR');
        await db.execute({
            sql: `INSERT INTO mouvements (date, type, details) VALUES (?, ?, ?)`,
            args: [date, type, details]
        });
    } catch (err) {
        console.error("Erreur enregistrement mouvement:", err.message);
    }
}

// --- FOURNISSEURS ---
app.get('/api/fournisseurs', async (req, res) => {
    try {
        const result = await db.execute(`SELECT * FROM fournisseurs`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fournisseurs', async (req, res) => {
    const { nom, contact } = req.body;
    try {
        const result = await db.execute({
            sql: `INSERT INTO fournisseurs (nom, contact) VALUES (?, ?)`,
            args: [nom, contact]
        });
        await enregistrerMouvement('FOURNISSEUR', `Ajout du fournisseur : ${nom}`);
        res.json({ id: Number(result.lastInsertRowid), nom, contact });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- PIÈCES ---
app.get('/api/pieces', async (req, res) => {
    try {
        const query = `
            SELECT pieces.*, fournisseurs.nom as fournisseur_nom 
            FROM pieces 
            LEFT JOIN fournisseurs ON pieces.fournisseur_id = fournisseurs.id
        `;
        const result = await db.execute(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/pieces', async (req, res) => {
    const { reference, nom, emplacement, quantite, seuil_alerte, fournisseur_id } = req.body;
    try {
        const query = `INSERT INTO pieces (reference, nom, emplacement, quantite, seuil_alerte, fournisseur_id) VALUES (?, ?, ?, ?, ?, ?)`;
        const result = await db.execute({
            sql: query,
            args: [reference, nom, emplacement, quantite, seuil_alerte, fournisseur_id || null]
        });
        
        await enregistrerMouvement('AJOUT', `Ajout de la pièce [${reference}] ${nom} (Qté initiale: ${quantite})`);
        res.json({ id: Number(result.lastInsertRowid) });
    } catch (err) {
        console.error("ERREUR SQL:", err.message);
        res.status(400).json({ error: err.message });
    }
});

app.patch('/api/pieces/:id', async (req, res) => {
    const { quantite } = req.body;
    const id = req.params.id;

    try {
        // Récupérer le nom et la référence avant modification pour l'historique
        const pieceResult = await db.execute({
            sql: `SELECT reference, nom FROM pieces WHERE id = ?`,
            args: [id]
        });

        if (pieceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Pièce introuvable' });
        }

        const piece = pieceResult.rows[0];

        await db.execute({
            sql: `UPDATE pieces SET quantite = ? WHERE id = ?`,
            args: [quantite, id]
        });

        await enregistrerMouvement('STOCK', `Mise à jour du stock de [${piece.reference}] ${piece.nom} -> Nouvelle quantité : ${quantite}`);
        res.json({ message: 'Quantité mise à jour' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/pieces/:id', async (req, res) => {
    const id = req.params.id;

    try {
        const pieceResult = await db.execute({
            sql: `SELECT reference, nom FROM pieces WHERE id = ?`,
            args: [id]
        });

        if (pieceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Pièce introuvable' });
        }

        const piece = pieceResult.rows[0];

        await db.execute({
            sql: `DELETE FROM pieces WHERE id = ?`,
            args: [id]
        });

        await enregistrerMouvement('SUPPRESSION', `Suppression de la pièce [${piece.reference}] ${piece.nom}`);
        res.json({ message: 'Pièce supprimée' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- MOUVEMENTS (TRAÇABILITÉ) ---
app.get('/api/mouvements', async (req, res) => {
    try {
        const result = await db.execute(`SELECT * FROM mouvements ORDER BY id DESC LIMIT 50`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- EXPORT PDF AMÉLIORÉ ---
app.get('/api/export/pdf', async (req, res) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=inventaire_atelier.pdf');
    
    doc.pipe(res);

    // En-tête du document
    doc.fontSize(22).fillColor('#1e293b').text('ATELIER MÉCA - ÉTAT DU STOCK', { align: 'center' });
    doc.fontSize(10).fillColor('#64748b').text(`Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, { align: 'center' });
    doc.moveDown(1.5);

    try {
        const query = `
            SELECT pieces.*, fournisseurs.nom as fournisseur_nom 
            FROM pieces 
            LEFT JOIN fournisseurs ON pieces.fournisseur_id = fournisseurs.id
            ORDER BY pieces.reference ASC
        `;
        const result = await db.execute(query);
        const rows = result.rows;

        // En-têtes du tableau
        const startX = 40;
        let startY = doc.y;
        const colWidths = [75, 130, 80, 95, 55, 80];

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
            if (startY > 750) {
                doc.addPage();
                startY = 40;
                dessinerEntetesTableau(startY);
                startY += 25;
            }

            if (index % 2 === 0) {
                doc.rect(startX, startY - 3, 515, 18).fill('#f8fafc');
                doc.fillColor('#1e293b');
            }

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
    } catch (err) {
        doc.fontSize(12).fillColor('red').text('Erreur lors du chargement des données.');
        doc.end();
    }
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});