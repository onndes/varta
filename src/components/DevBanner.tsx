// src/components/DevBanner.tsx
import React from 'react';

interface DevBannerProps {
  onClose: () => void;
}

/**
 * A dismissible warning banner shown to users of pre-release builds.
 * It can be hidden here and re-enabled in Settings → Interface.
 */
const DevBanner: React.FC<DevBannerProps> = ({ onClose }) => (
  <div className="dev-banner no-print" role="alert">
    <i className="fas fa-triangle-exclamation dev-banner__icon"></i>
    <div className="dev-banner__text">
      <strong>Додаток у стадії розробки.</strong> Функціонал ще не пройшов повноцінне бойове
      тестування — рекомендую перші тижні перевіряти справедливість та правильність згенерованого
      графіка. Якщо виявите баг або некоректну поведінку генерації або функціоналу — будь
      ласка, напишіть на{' '}
      <a href="mailto:vladvyljotnikov@gmail.com" className="dev-banner__link">
        vladvyljotnikov@gmail.com
      </a>
      . Після закриття вона з’явиться знову наступного дня, а в{' '}
      <strong>Налаштуваннях → Інтерфейс</strong> її можна призупинити на 15 діб.
    </div>
    <button
      type="button"
      className="btn-close dev-banner__close"
      onClick={onClose}
      aria-label="Приховати плашку до завтра"
      title="Приховати до завтра"
    />
  </div>
);

export default DevBanner;
