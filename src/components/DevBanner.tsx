// src/components/DevBanner.tsx
import React from 'react';

interface DevBannerProps {
  onClose: () => void;
}

/**
 * A dismissible warning banner shown to users of pre-release builds.
 * Closing it calls onClose which persists the preference to the DB.
 * The banner can be re-enabled via Settings → Interface.
 */
const DevBanner: React.FC<DevBannerProps> = ({ onClose }) => (
  <div className="dev-banner no-print" role="alert">
    <i className="fas fa-triangle-exclamation dev-banner__icon"></i>
    <div className="dev-banner__text">
      <strong>Додаток у стадії розробки.</strong> Функціонал ще не пройшов повноцінне бойове
      тестування — рекомендуємо перші тижні перевіряти справедливість та правильність згенерованого
      графіка вручну. Якщо виявите баг або некоректну поведінку генерації або функціоналу — будь ласка, напишіть на{' '}
      <a href="mailto:vladvyljotnikov@gmail.com" className="dev-banner__link">
        vladvyljotnikov@gmail.com
      </a>
      .
    </div>
    <button
      type="button"
      className="btn-close dev-banner__close"
      onClick={onClose}
      aria-label="Закрити"
      title="Приховати (можна увімкнути в Налаштуваннях → Інтерфейс)"
    />
  </div>
);

export default DevBanner;
