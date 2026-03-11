import React, { useState } from 'react';
import Modal from './Modal';
import { InfoModalContent } from './InfoModalContent';

/** Sidebar button that opens the help/about modal. */
const InfoButton: React.FC = () => {
  const [show, setShow] = useState(false);

  return (
    <>
      <button className="app-sidebar__item" onClick={() => setShow(true)} title="Про систему">
        <i className="fas fa-info-circle app-sidebar__icon"></i>
        <span className="app-sidebar__label">Довідка</span>
      </button>

      <Modal show={show} onClose={() => setShow(false)} title="Про систему ВАРТА" size="modal-lg">
        <InfoModalContent />
      </Modal>
    </>
  );
};

export default InfoButton;
