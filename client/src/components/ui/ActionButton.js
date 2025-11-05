import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';

const ActionButton = ({ 
  icon, 
  label,
  onClick, 
  disabled = false, 
  className = '',
  alwaysShowTooltip = false // New prop to force tooltip visibility
}) => {
  return (
    <div className="action-button-wrapper">
      <motion.button
        className={`action-button ${className}`}
        onClick={onClick}
        disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.1 }}
        whileTap={{ scale: disabled ? 1 : 0.95 }}
      >
        <span className="action-button-content">
          {icon}
        </span>
      </motion.button>
      {label && (
        <span className={`action-tooltip ${alwaysShowTooltip ? 'always-visible' : ''}`}>
          {label}
        </span>
      )}
    </div>
  );
};

ActionButton.propTypes = {
  icon: PropTypes.node.isRequired,
  label: PropTypes.string,
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  alwaysShowTooltip: PropTypes.bool // New prop type
};

export default ActionButton;