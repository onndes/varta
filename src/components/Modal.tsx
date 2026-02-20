import React, { useEffect } from 'react';

interface ModalProps {
  show: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'modal-sm' | 'modal-lg' | 'modal-xl' | 'modal-md';
  centered?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  show,
  onClose,
  title,
  children,
  size = 'modal-lg',
  centered = true,
}) => {
  // Prevent body scroll when modal is open
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyPaddingRight = document.body.style.paddingRight;

    if (show) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      const bodyComputedPaddingRight = parseFloat(
        window.getComputedStyle(document.body).paddingRight || '0'
      );

      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${bodyComputedPaddingRight + scrollbarWidth}px`;
      }
      document.body.classList.add('modal-open-fixed');
      document.documentElement.classList.add('modal-open-fixed');

      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleEsc);
      return () => {
        document.body.style.overflow = prevBodyOverflow;
        document.documentElement.style.overflow = prevHtmlOverflow;
        document.body.style.paddingRight = prevBodyPaddingRight;
        document.body.classList.remove('modal-open-fixed');
        document.documentElement.classList.remove('modal-open-fixed');
        document.removeEventListener('keydown', handleEsc);
      };
    } else {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.paddingRight = prevBodyPaddingRight;
      document.body.classList.remove('modal-open-fixed');
      document.documentElement.classList.remove('modal-open-fixed');
    }
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.paddingRight = prevBodyPaddingRight;
      document.body.classList.remove('modal-open-fixed');
      document.documentElement.classList.remove('modal-open-fixed');
    };
  }, [show, onClose]);

  if (!show) return null;
  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
      tabIndex={-1}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-dialog modal-dialog-scrollable codex-modal-dialog ${size} ${centered ? 'modal-dialog-centered' : ''}`}
      >
        <div className="modal-content shadow border-0">
          <div className="modal-header bg-light py-2">
            <h5 className="modal-title fw-bold fs-6">{title}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
