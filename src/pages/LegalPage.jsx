import { getLang, t } from '../lib/i18n.js';
import { back } from '../router.js';

// Legal texts shown in the app. Keep them in sync with what the app actually sends out:
// every new network service or permission must be listed in the privacy policy, in both
// languages (FR and EN below say the same thing), and its host in the CSP (vite.config.js).
const UPDATED = { fr: '22 octobre 2026', en: '22 October 2026' };
const REPO = 'https://github.com/Cobbrou/Allure';

const Ext = ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;

const FR = {
  privacy: {
    title: 'Confidentialité',
    body: (
      <>
        <h2>Politique de confidentialité</h2>
        <p className="muted">Dernière mise à jour : {UPDATED.fr}</p>
        <p>
          Allure n'a ni compte en ligne, ni serveur, ni publicité, ni outil de mesure d'audience.
          Tes activités restent sur ton téléphone : personne, pas même nous, n'y a accès.
        </p>
        <h3>Données stockées sur ton téléphone</h3>
        <ul>
          <li>Activités : traces GPS, temps, altitude, fréquence cardiaque et puissance.</li>
          <li>Réglages : nom affiché, langue, unités, fréquence cardiaque, objectifs, équipement.</li>
          <li>Zones de confidentialité et contacts d'urgence que tu saisis.</li>
          <li>Segments, itinéraires et cartes téléchargées pour une utilisation hors ligne.</li>
        </ul>
        <h3>Autorisations</h3>
        <ul>
          <li><b>Localisation</b> : pendant un enregistrement, y compris écran éteint (une
            notification reste affichée tant que l'enregistrement tourne). Quand l'app est ouverte,
            aussi pour te situer sur la carte (onglet Cartes, écran d'enregistrement, tracé
            d'itinéraire), proposer des boucles autour de toi et placer une zone de confidentialité
            à ta position. Ta dernière position connue est gardée sur le téléphone pour centrer la
            carte. Jamais en arrière-plan hors enregistrement.</li>
          <li><b>Bluetooth</b> : pour lire une ceinture cardio, un capteur de cadence ou de puissance que tu choisis. Les mesures restent sur le téléphone.</li>
          <li><b>Health Connect</b> (Android) : lecture des séances d'exercice, de leur trace GPS et de
            la fréquence cardiaque, seulement quand tu lances un import ; et, si tu l'autorises, la
            fréquence cardiaque au repos mesurée par ta montre (30 derniers jours) pour régler tes
            zones cardio. Allure n'écrit rien dans Health Connect et ces données restent sur le téléphone.</li>
        </ul>
        <h3>Services externes</h3>
        <p>Certaines fonctions interrogent des services tiers. Ils reçoivent ton adresse IP et les informations listées :</p>
        <ul>
          <li><b>CARTO</b> (fond de carte) : la zone de carte affichée.</li>
          <li><b>Amazon Web Services</b> (relief) : la zone affichée en 3D ; et, à la fin de chaque
            enregistrement ou quand tu corriges l'altitude d'une activité, les tuiles de relief
            (environ 10 km de côté) couvertes par sa trace, pour corriger son altitude.</li>
          <li><b>BRouter</b> (brouter.de, tracé d'itinéraires et boucles suggérées) : les points de passage de l'itinéraire.</li>
          <li><b>Open-Meteo</b> (météo, quand tu l'ajoutes à une activité ou consultes la chaleur prévue d'une séance) :
            une position arrondie à environ 10 km et la date.</li>
        </ul>
        <p>Ni ton nom, ni tes données de santé, ni tes traces ne leur sont envoyés : seulement les zones et points listés.</p>
        <h3>Partage</h3>
        <p>
          Rien ne quitte ton téléphone sans action de ta part : export GPX, image de partage,
          sauvegarde ou SMS d'alerte vers tes contacts d'urgence passent par l'application que
          tu choisis. Les zones de confidentialité masquent le départ et l'arrivée des images et
          fichiers GPX partagés. Les données de l'app sont exclues de la sauvegarde automatique
          d'Android (Google Drive) : seule ta propre sauvegarde les copie.
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
        <p className="muted">Dernière mise à jour : {UPDATED.fr}</p>
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
        <h3>Plans d'entraînement</h3>
        <p>
          Les plans sont des conseils généraux, calculés à partir de ton historique et de règles
          publiées. Ils ne tiennent pas compte de ton état de santé : en cas de douleur, de malaise
          ou de maladie, arrête-toi et consulte un professionnel de santé.
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
          <li>Météo : <Ext href="https://open-meteo.com">Open-Meteo</Ext> (CC BY 4.0).</li>
        </ul>
        <h3>Logiciels</h3>
        <ul>
          <li>React et React DOM : MIT</li>
          <li>MapLibre GL JS : BSD-3-Clause</li>
          <li>Recharts : MIT</li>
          <li>Police Inter : SIL Open Font License 1.1</li>
          <li>Capacitor et ses plugins : MIT</li>
          <li>Capacitor Background Geolocation : MIT</li>
          <li>Capacitor Health : MIT</li>
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

const EN = {
  privacy: {
    title: 'Privacy',
    body: (
      <>
        <h2>Privacy policy</h2>
        <p className="muted">Last updated: {UPDATED.en}</p>
        <p>
          Allure has no online account, no server, no ads and no analytics.
          Your activities stay on your phone: nobody, not even us, can access them.
        </p>
        <h3>Data stored on your phone</h3>
        <ul>
          <li>Activities: GPS tracks, times, elevation, heart rate and power.</li>
          <li>Settings: display name, language, units, heart rate, goals, gear.</li>
          <li>Privacy zones and emergency contacts you enter.</li>
          <li>Segments, routes and maps downloaded for offline use.</li>
        </ul>
        <h3>Permissions</h3>
        <ul>
          <li><b>Location</b>: while recording, including with the screen off (a notification
            stays visible as long as the recording runs). While the app is open, also to show
            where you are on the map (Maps tab, record screen, route builder), suggest loops
            around you and place a privacy zone at your position. Your last known position is
            kept on the phone to centre the map. Never in the background outside a recording.</li>
          <li><b>Bluetooth</b>: to read a heart rate strap, cadence sensor or power meter you pick. Readings stay on the phone.</li>
          <li><b>Health Connect</b> (Android): reads exercise sessions, their GPS track and
            heart rate, only when you start an import; and, if you allow it, the resting heart
            rate your watch measured (last 30 days) to set your heart rate zones. Allure writes
            nothing to Health Connect and this data stays on the phone.</li>
        </ul>
        <h3>External services</h3>
        <p>Some features query third-party services. They receive your IP address and the information listed:</p>
        <ul>
          <li><b>CARTO</b> (basemap): the map area shown.</li>
          <li><b>Amazon Web Services</b> (relief): the area shown in 3D; and, at the end of each
            recording or when you correct an activity's elevation, the relief tiles (about 10 km
            across) its track covers, to correct its elevation.</li>
          <li><b>BRouter</b> (brouter.de, route drawing and suggested loops): the route's waypoints.</li>
          <li><b>Open-Meteo</b> (weather, when you add it to an activity or check a session's forecast heat): a
            position rounded to about 10 km, and the date.</li>
        </ul>
        <p>Your name, health data and tracks are never sent to them: only the areas and points listed.</p>
        <h3>Sharing</h3>
        <p>
          Nothing leaves your phone without you acting: GPX export, share image, backup or
          alert SMS to your emergency contacts go through the app you choose. Privacy zones
          hide the start and finish of shared images and GPX files. The app's data is left out
          of Android's automatic backup (Google Drive): only your own backup copies it.
        </p>
        <h3>Your rights</h3>
        <p>
          You can export all your data (Settings → My data → Back up) and delete it at any
          time (Delete my data, or uninstall the app).
        </p>
        <h3>Contact</h3>
        <p>Any question: <Ext href={`${REPO}/issues`}>open an issue on GitHub</Ext>.</p>
      </>
    ),
  },
  terms: {
    title: 'Terms',
    body: (
      <>
        <h2>Terms of use</h2>
        <p className="muted">Last updated: {UPDATED.en}</p>
        <p>
          Allure is free software, provided at no cost "as is", without warranty of any kind,
          under the GNU GPL version 3 or later.
        </p>
        <h3>Your safety</h3>
        <ul>
          <li>Practise your sport at your own risk and within your fitness. If in doubt, ask a doctor.</li>
          <li>Follow traffic rules and the rules of the places you cross. Don't handle your phone while riding.</li>
          <li>Routes and maps come from collaborative data: they can be wrong or dangerous. Trust the terrain and the signs.</li>
          <li>The stillness alert and SOS don't replace emergency services (112). They depend on your battery, the network and the SMS being sent.</li>
        </ul>
        <h3>Measurements</h3>
        <p>
          Distances, paces, heart rate, predictions and training metrics are estimates. They
          are not medical advice.
        </p>
        <h3>Training plans</h3>
        <p>
          Plans are general guidance, computed from your history and published rules. They don't
          take your health into account: if you feel pain, unwell or ill, stop and see a health
          professional.
        </p>
        <h3>Your data</h3>
        <p>
          It belongs to you and stays on your phone. Remember to back it up: uninstalling the
          app or losing your phone erases it.
        </p>
      </>
    ),
  },
  licenses: {
    title: 'Licenses',
    body: (
      <>
        <h2>Licenses and credits</h2>
        <p>
          Allure © 2026 Cobbrou, free software under the <Ext href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL v3 or later</Ext>.
          The <Ext href={REPO}>source code</Ext> is public.
        </p>
        <h3>Data</h3>
        <ul>
          <li>Map data © <Ext href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</Ext> (ODbL).</li>
          <li>Basemap © <Ext href="https://carto.com/attributions">CARTO</Ext>.</li>
          <li>Relief: <Ext href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</Ext> (Mapzen, AWS Open Data), from SRTM, GMTED, ETOPO1 and other sources.</li>
          <li>Routes computed by <Ext href="https://brouter.de">BRouter</Ext>.</li>
          <li>Weather: <Ext href="https://open-meteo.com">Open-Meteo</Ext> (CC BY 4.0).</li>
        </ul>
        <h3>Software</h3>
        <ul>
          <li>React and React DOM: MIT</li>
          <li>MapLibre GL JS: BSD-3-Clause</li>
          <li>Recharts: MIT</li>
          <li>Inter typeface: SIL Open Font License 1.1</li>
          <li>Capacitor and its plugins: MIT</li>
          <li>Capacitor Background Geolocation: MIT</li>
          <li>Capacitor Health: MIT</li>
          <li>Garmin FIT SDK: FIT protocol license</li>
          <li>Inter typeface: SIL Open Font License 1.1</li>
        </ul>
        <p className="muted">
          Allure is an independent project, not affiliated with Strava, Garmin or any other
          connected sports company.
        </p>
      </>
    ),
  },
};

export default function LegalPage({ id }) {
  const docs = getLang() === 'en' ? EN : FR;
  const doc = docs[id] ?? docs.privacy;
  return (
    <>
      <header className="topbar">
        <a className="back" href="#/settings" aria-label={t('Retour')} onClick={(e) => { e.preventDefault(); back('/settings'); }}>‹</a>
        <h1>{doc.title}</h1>
        <span className="back" aria-hidden="true" />
      </header>
      <main className="detail">
        <article className="card legal">{doc.body}</article>
      </main>
    </>
  );
}
