// Session briefings (M7): why a plan session is there and what to focus on, from templates
// per session type, with the session's own numbers. Week notes for lighter and taper weeks.

import { fmtDuration, fmtLength } from './format.js';
import { t } from './i18n.js';
import { GOALS, PROGRAMS } from './plan.js';

const amount = (s) => (s.type === 'time' ? fmtDuration(s.value) : fmtLength(s.value));

/** { why, focus, note? } of a plan session. */
export function briefing(s, plan) {
  const work = s.steps.filter((x) => x.kind === 'work');
  const reps = work.length, first = work[0];
  const goal = GOALS[plan.goal.kind]?.label ?? PROGRAMS[plan.goal.kind]?.label;
  const effortOnly = s.steps.every((x) => !x.target?.pace);
  const out = {
    easy: {
      why: t('Le footing construit ton endurance de base et fait récupérer des séances dures.'),
      focus: reps > 1
        ? t('Reste à l’aise, tu dois pouvoir parler. Finis par les lignes droites : rapides mais relâchées, pas un sprint.')
        : t('Reste à l’aise, tu dois pouvoir parler. Trop lent n’existe pas en footing.'),
    },
    walkRun: {
      why: t('Alterner course et marche habitue ton corps à l’impact en douceur : {n} × {run} de course aujourd’hui.', { n: reps, run: amount(first) }),
      focus: t('Cours assez lentement pour parler, marche d’un bon pas. Si c’est trop dur, refais la semaine précédente.'),
    },
    long: {
      why: t('La sortie longue ({dist}) développe l’endurance et apprend à ton corps à durer.', { dist: fmtLength(s.distance) }),
      focus: reps > 1
        ? t('Pars lentement, bois et mange régulièrement. Les {dist} de la fin à allure marathon : l’allure du jour J sur des jambes fatiguées.', { dist: fmtLength(work.at(-1).value) })
        : t('Pars lentement et garde une allure facile jusqu’au bout. Bois et mange régulièrement au-delà d’une heure.'),
    },
    hills: {
      why: t('Les côtes renforcent la foulée, sans l’impact de la vitesse sur le plat : {n} × {work}.', { n: reps, work: amount(first) }),
      focus: t('Monte fort mais régulier, buste droit, bras actifs. Redescends en trottinant pour récupérer.'),
    },
    fartlek: {
      why: t('Le fartlek fait travailler la vitesse en jouant : {n} × {work} rapides.', { n: reps, work: amount(first) }),
      focus: t('Accélère sans te mettre dans le rouge, puis récupère en trottinant. La régularité compte plus que la vitesse.'),
    },
    tempo: {
      why: t('Le seuil repousse le moment où la fatigue s’accumule : {n} × {work}.', { n: reps, work: amount(first) }),
      focus: t('Effort « confortablement dur » : tu peux dire quelques mots, pas une phrase. Ne pars pas trop vite.'),
    },
    intervals: {
      why: t('Le fractionné développe ta VO2max, le plafond de ton moteur : {n} × {work}.', { n: reps, work: amount(first) }),
      focus: t('Tiens la même allure sur chaque répétition : la dernière doit ressembler à la première.'),
    },
    racePace: {
      why: t('Ces {n} × {work} t’habituent à l’allure de ton objectif ({goal}).', { n: reps, work: amount(first), goal }),
      focus: t('Cherche l’allure juste, ni plus vite ni plus lent : c’est elle que tu tiendras le jour J.'),
    },
    race: {
      why: t('Le jour J : tout le plan mène ici.'),
      focus: t('Pars à l’allure prévue, même si tu te sens pousser des ailes. Accélère seulement dans le dernier quart.'),
    },
  }[s.type];
  if (effortOnly && s.type !== 'race') out.focus += ` ${t('Fie-toi à l’effort perçu plutôt qu’à la montre.')}`;
  const week = plan.weeks[s.week - 1];
  if (week?.kind === 'recovery') out.note = t('Semaine allégée : ton corps assimile le travail des semaines passées.');
  else if (week?.phase === 'taper') out.note = t('Affûtage : moins de volume, un peu d’intensité. La fraîcheur arrive, ne rattrape rien.');
  return out;
}
