/** Groups tab: clubs and events. Both need accounts and a backend (roadmap phase 4). */
export default function GroupsPage() {
  return (
    <>
      <header className="topbar"><h1>Groupes</h1></header>
      <main className="detail">
        <h2 className="section-title">Clubs</h2>
        <Soon title="Rejoindre un club" text="Retrouve ton club, son fil d'activités et ses classements" />
        <Soon title="Créer un club" text="Rassemble tes partenaires d'entraînement" />
        <h2 className="section-title">Événements</h2>
        <Soon title="Sorties de groupe" text="Organise une sortie ou rejoins celles de tes clubs" />
        <Soon title="Challenges" text="Défie tes amis sur la distance, le dénivelé ou la régularité" />
      </main>
    </>
  );
}

// ponytail: static placeholders until clubs and events ship (roadmap phase 4).
function Soon({ title, text }) {
  return (
    <div className="card link-card">
      <span><b>{title}</b><span className="muted">{text}</span></span>
      <span className="pill">Bientôt</span>
    </div>
  );
}
