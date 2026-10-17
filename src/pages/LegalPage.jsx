import { back } from '../router.js';

// Legal texts shown in the app. Keep them in sync with what the app actually sends out:
// every new network service or permission must be listed in the privacy policy.
const UPDATED = '17 octobre 2026';
const REPO = 'https://github.com/Cobbrou/Allure';

const Ext = ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;

const DOCS = {
  privacy: {
    title: 'Confidentialité',
    body: (
      <>
        <h2>Politique de confidentialité</h2>
        <p className="muted">Dernière mise à jour : {UPDATED}</p>
        <p>
          Allure n'a ni compte en ligne, ni serveur, ni publicité, ni outil de mesure d'audience.
          Tes activités restent sur ton téléphone : personne, pas même nous, n'y a accès.
        </p>
        <h3>Données stockées sur ton téléphone</h3>
        <ul>
          <li>Activités : traces GPS, temps, altitude, fréquence cardiaque et puissance.</li>
          <li>Réglages : nom affiché, unités, fréquence cardiaque, objectifs, équipement.</li>
          <li>Zones de confidentialité et contacts d'urgence que tu saisis.</li>
          <li>Segments, itinéraires et cartes téléchargées pour une utilisation hors ligne.</li>
        </ul>
        <h3>Autorisations</h3>
        <ul>
          <li><b>Localisation</b> : seulement pendant un enregistrement, y compris écran éteint
            (une notification reste affichée tant que l'enregistrement tourne), et pour proposer
            des boucles autour de toi.</li>
          <li><b>Bluetooth</b> : pour lire une ceinture cardio que tu choisis. Les mesures restent sur le téléphone.</li>
          <li><b>Health Connect</b> (Android) : lecture des séances d'exercice, de leur trace GPS et de
            la fréquence cardiaque, seulement quand tu lances un import. Allure n'écrit rien dans
            Health Connect et ces données restent sur le téléphone.</li>
        </ul>
        <h3>Services externes</h3>
        <p>Certaines fonctions interrogent des services tiers. Ils reçoivent ton adresse IP et les informations listées :</p>
        <ul>
          <li><b>CARTO</b> (fond de carte) : la zone de carte affichée.</li>
          <li><b>Amazon Web Services</b> (relief de la vue 3D) : la zone affichée en 3D.</li>
          <li><b>BRouter</b> (brouter.de, tracé d'itinéraires et boucles suggérées) : les points de passage de l'itinéraire.</li>
          <li><b>Google Fonts</b> (police de caractères) : une requête au démarrage.</li>
        </ul>
        <p>Aucune activité, aucun nom et aucune donnée de santé ne leur est envoyé.</p>
        <h3>Partage</h3>
        <p>
          Rien ne quitte ton téléphone sans action de ta part : export GPX, image de partage,
          sauvegarde ou SMS d'alerte vers tes contacts d'urgence passent par l'application que
          tu choisis. Les zones de confidentialité masquent le départ et l'arrivée des images partagées.
        </p>
        <h3>Tes droits</h3>
        <p>
          Tu peux exporter toutes tes données (Paramètres → Mes données → Sauvegarder) et les
          supprimer à tout moment (Supprimer mes données, ou désinstaller l'app).
        </p>
        <h3>Contact</h3>
        <p>Pour toute question : <Ext href={`${REPO}/issues`}>ouvre un ticket sur GitHub</Ext>.</p>
      </>
    ),
  },
  terms: {
    title: 'Conditions',
    body: (
      <>
        <h2>Conditions d'utilisation</h2>
        <p className="muted">Dernière mise à jour : {UPDATED}</p>
        <p>
          Allure est un logiciel libre, fourni gratuitement « en l'état », sans garantie d'aucune
          sorte, selon la licence GNU GPL version 3 ou ultérieure.
        </p>
        <h3>Ta sécurité</h3>
        <ul>
          <li>Pratique ton sport à tes propres risques et selon ta condition physique. En cas de doute, demande l'avis d'un médecin.</li>
          <li>Respecte le code de la route et les règles des lieux que tu traverses. Ne manipule pas ton téléphone en roulant.</li>
          <li>Les itinéraires et cartes viennent de données collaboratives : ils peuvent être faux ou dangereux. Fie-toi au terrain et à la signalisation.</li>
          <li>L'alerte d'immobilité et le SOS ne remplacent pas les services d'urgence (112). Ils dépendent de ta batterie, du réseau et de l'envoi du SMS.</li>
        </ul>
        <h3>Mesures</h3>
        <p>
          Distances, allures, fréquence cardiaque, prédictions et indicateurs d'entraînement sont
          des estimations. Ils ne constituent pas un avis médical.
        </p>
        <h3>Tes données</h3>
        <p>
          Elles t'appartiennent et restent sur ton téléphone. Pense à faire des sauvegardes :
          désinstaller l'app ou perdre ton téléphone les efface.
        </p>
      </>
    ),
  },
  licenses: {
    title: 'Licences',
    body: (
      <>
        <h2>Licences et crédits</h2>
        <p>
          Allure © 2026 Cobbrou, logiciel libre sous licence <Ext href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL v3 ou ultérieure</Ext>.
          Le <Ext href={REPO}>code source</Ext> est public.
        </p>
        <h3>Données</h3>
        <ul>
          <li>Données cartographiques © <Ext href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</Ext> (ODbL).</li>
          <li>Fond de carte © <Ext href="https://carto.com/attributions">CARTO</Ext>.</li>
          <li>Relief : <Ext href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</Ext> (Mapzen, AWS Open Data), d'après SRTM, GMTED, ETOPO1 et d'autres sources.</li>
          <li>Itinéraires calculés par <Ext href="https://brouter.de">BRouter</Ext>.</li>
        </ul>
        <h3>Logiciels</h3>
        <ul>
          <li>React et React DOM : MIT</li>
          <li>MapLibre GL JS : BSD-3-Clause</li>
          <li>Recharts : MIT</li>
          <li>Capacitor et ses plugins : MIT</li>
          <li>Capacitor Background Geolocation : MIT</li>
          <li>Garmin FIT SDK : licence du protocole FIT</li>
          <li>Police Inter : SIL Open Font License 1.1</li>
        </ul>
        <p className="muted">
          Allure est un projet indépendant, sans lien avec Strava, Garmin ni aucune autre
          entreprise de sport connecté.
        </p>
      </>
    ),
  },
};

export default function LegalPage({ id }) {
  const doc = DOCS[id] ?? DOCS.privacy;
  return (
    <>
      <header className="topbar">
        <a className="back" href="#/settings" aria-label="Retour" onClick={(e) => { e.preventDefault(); back('/settings'); }}>‹</a>
        <h1>{doc.title}</h1>
        <span className="back" aria-hidden="true" />
      </header>
      <main className="detail">
        <article className="card legal">{doc.body}</article>
      </main>
    </>
  );
}
