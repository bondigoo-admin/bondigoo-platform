import React from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';

const LinkButton = ({ to, icon: Icon, title }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
    >
      <Link to={to} className="link-button" title={title}>
        <Icon size={20} />
      </Link>
    </motion.div>
  );
};

LinkButton.propTypes = {
  to: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.string.isRequired
};

export default LinkButton;
