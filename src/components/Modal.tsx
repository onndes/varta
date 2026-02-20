import React, { useEffect } from 'react';

interface ModalProps {
  show: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'modal-sm' | 'modal-lg' | 'modal-xl' | 'modal-md';
  centered?: boolean;
}

let openModalCount = 0;
let savedBodyOverflow = '';
let savedHtmlOverflow = '';
let savedBodyPaddingRight = '';

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
    if (!show) return;

    if (openModalCount === 0) {
      savedBodyOverflow = document.body.style.overflow;
      savedHtmlOverflow = document.documentElement.style.overflow;
      savedBodyPaddingRight = document.body.style.paddingRight;

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
    }
    openModalCount++;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('keydown', handleEsc);
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = savedBodyOverflow;
        document.documentElement.style.overflow = savedHtmlOverflow;
        document.body.style.paddingRight = savedBodyPaddingRight;
        document.body.classList.remove('modal-open-fixed');
        document.documentElement.classList.remove('modal-open-fixed');
      }
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
