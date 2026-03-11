// src/components/schedule/scheduleTableUtils.ts — helpers for schedule table components
import type { ScheduleEntry, DecisionLog, DecisionLogSection } from '../../types';

/** Build a static DecisionLog for manual/swap/replace/history/import entries. */
export const buildStaticLog = (entry: ScheduleEntry): DecisionLog | undefined => {
  if (entry.type === 'auto' && entry.decisionLog) return entry.decisionLog;

  const sections: DecisionLogSection[] = [];
  let userText = '';

  switch (entry.type) {
    case 'manual':
      userText = 'Призначено вручну — це рішення прийняв адміністратор, не система.';
      sections.push({ icon: '✋', title: 'Ручне призначення', items: [userText] });
      break;
    case 'swap':
      userText = 'Цей наряд отримано в результаті обміну нарядами між бійцями.';
      sections.push({
        icon: '🔄',
        title: 'Обмін нарядами',
        items: [
          userText,
          'Після обміну наряди помінялися місцями.',
          'Це рішення прийняв адміністратор, не система.',
        ],
      });
      break;
    case 'replace':
      userText = 'Цей боєць замінив попереднього чергового на цю дату.';
      sections.push({
        icon: '🔄',
        title: 'Заміна чергового',
        items: [userText, 'Попередній черговий був замінений адміністратором.'],
      });
      break;
    case 'history':
      userText = 'Перенесено з попереднього розкладу.';
      sections.push({
        icon: '📜',
        title: 'Перенесено з архіву',
        items: [userText, 'Система не розраховувала це призначення автоматично.'],
      });
      break;
    case 'import':
      userText = 'Завантажено з зовнішнього файлу.';
      sections.push({
        icon: '📥',
        title: 'Імпортовано',
        items: [userText, 'Система не розраховувала це призначення автоматично.'],
      });
      break;
    default:
      return undefined;
  }

  return { userText, sections, debug: {} as DecisionLog['debug'] };
};
