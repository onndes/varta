import React from 'react';

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
  if (!show) return null;
  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
      tabIndex={-1}
    >
      <div className={`modal-dialog ${size} ${centered ? 'modal-dialog-centered' : ''}`}>
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
