import React from 'react';
import Modal from './Modal';

interface BackupAlertProps {
  show: boolean;
  onClose: () => void;
  onExport: () => Promise<void>;
}

const BackupAlert: React.FC<BackupAlertProps> = ({ show, onClose, onExport }) => {
  const handleExport = async () => {
    await onExport();
    onClose();
  };

  return (
    <Modal show={show} onClose={onClose} title="УВАГА: ПОТРІБЕН БЕКАП" size="modal-md">
      <div className="text-center">
        <div className="text-danger mb-3">
          <i className="fas fa-exclamation-circle fa-4x"></i>
        </div>
        <h5>Давно не було резервного копіювання!</h5>
        <button className="btn btn-danger btn-lg w-100 mt-3" onClick={handleExport}>
          <i className="fas fa-file-download me-2"></i>ЕКСПОРТ
        </button>
      </div>
    </Modal>
  );
};

export default BackupAlert;
