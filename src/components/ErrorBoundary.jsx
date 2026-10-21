import { t } from '../lib/i18n.js';
import { Component } from 'react';

/** Catches render crashes so one broken page doesn't blank the app. Key it by route to reset on navigation. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="empty" role="alert">
        <div className="drop-icon">⚠</div>
        <h2>{t('Oups, cet écran a planté')}</h2>
        <p>{String(this.state.error.message || this.state.error)}</p>
        <div className="row">
          <a className="button ghost" href="#/">{t("Retour à l'accueil")}</a>
          <button onClick={() => location.reload()}>{t('Recharger')}</button>
        </div>
      </main>
    );
  }
}
