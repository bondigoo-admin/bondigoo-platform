import React, { useState, useEffect, useContext } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import ReactPlayer from 'react-player';
import { 
  PlusCircle, X, Edit2, Trash2, FileText, Video, DollarSign, 
  Package, Image as ImageIcon, Check, AlertCircle
} from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';

const s3Client = new S3Client({
  region: process.env.REACT_APP_AWS_REGION,
  credentials: {
    accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY,
  },
});

const PackageManager = ({ coachId }) => {
  const [packages, setPackages] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPackage, setCurrentPackage] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const { userRole } = useContext(AuthContext);

  PackageManager.propTypes = {
    coachId: PropTypes.string.isRequired,
  };
  

  useEffect(() => {
    fetchPackages();
  }, [coachId]);

  const fetchPackages = async () => {
    // In a real app, this would be an API call
    const mockPackages = [
      {
        id: '1',
        title: 'Career Advancement Bundle',
        description: 'Comprehensive career coaching package including resume review, interview prep, and networking strategies.',
        price: 299,
        image: 'https://example.com/career_advancement.jpg',
        files: [
          { name: 'Resume_Template.pdf', url: 'https://example.com/resume_template.pdf', type: 'application/pdf' },
          { name: 'Interview_Tips.mp4', url: 'https://example.com/interview_tips.mp4', type: 'video/mp4' },
          { name: 'Networking_Guide.pdf', url: 'https://example.com/networking_guide.pdf', type: 'application/pdf' },
        ],
      },
      {
        id: '2',
        title: 'Leadership Mastery Program',
        description: 'Develop essential leadership skills with this comprehensive program including video lessons and practical exercises.',
        price: 499,
        image: 'https://example.com/leadership_mastery.jpg',
        files: [
          { name: 'Leadership_Fundamentals.mp4', url: 'https://example.com/leadership_fundamentals.mp4', type: 'video/mp4' },
          { name: 'Team_Building_Strategies.pdf', url: 'https://example.com/team_building_strategies.pdf', type: 'application/pdf' },
          { name: 'Effective_Communication.mp4', url: 'https://example.com/effective_communication.mp4', type: 'video/mp4' },
        ],
      },
      {
        id: '3',
        title: 'Work-Life Balance Toolkit',
        description: 'Achieve better work-life balance with this toolkit including stress management techniques and time management strategies.',
        price: 199,
        image: 'https://example.com/work_life_balance.jpg',
        files: [
          { name: 'Stress_Management_Techniques.pdf', url: 'https://example.com/stress_management.pdf', type: 'application/pdf' },
          { name: 'Time_Management_Strategies.mp4', url: 'https://example.com/time_management.mp4', type: 'video/mp4' },
          { name: 'Mindfulness_Exercises.pdf', url: 'https://example.com/mindfulness_exercises.pdf', type: 'application/pdf' },
        ],
      },
    ];
    setPackages(mockPackages);
  };

  const handleFileUpload = async (file) => {
    const fileId = uuidv4();
    const fileExtension = file.name.split('.').pop();
    const key = `coach-${coachId}/package-files/${fileId}.${fileExtension}`;

    const params = {
      Bucket: process.env.REACT_APP_S3_BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: file.type,
    };

    try {
      await s3Client.send(new PutObjectCommand(params));
      const fileUrl = `https://${process.env.REACT_APP_S3_BUCKET_NAME}.s3.amazonaws.com/${key}`;
      return { name: file.name, url: fileUrl, type: file.type };
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  };

  const handleAddPackage = async (packageData) => {
    const newPackage = {
      id: uuidv4(),
      ...packageData,
      files: await Promise.all(packageData.files.map(handleFileUpload)),
    };
    setPackages([...packages, newPackage]);
    setIsModalOpen(false);
  };

  const handleEditPackage = async (packageData) => {
    const updatedPackage = {
      ...packageData,
      files: await Promise.all(packageData.files.map(file => 
        file instanceof File ? handleFileUpload(file) : file
      )),
    };
    setPackages(packages.map(pkg => pkg.id === updatedPackage.id ? updatedPackage : pkg));
    setIsModalOpen(false);
  };

  const handleDeletePackage = (packageId) => {
    setPackages(packages.filter(pkg => pkg.id !== packageId));
  };

  const openDetailModal = (pkg) => {
    setSelectedPackage(pkg);
    setIsDetailModalOpen(true);
  };

  const handlePurchase = (pkg) => {
    setSelectedPackage(pkg);
    setIsPaymentModalOpen(true);
  };

  const processPayment = (paymentDetails) => {
    // Placeholder for payment processing
    console.log('Processing payment:', paymentDetails);
    // Simulating a successful payment
    setTimeout(() => {
      alert('Payment processed successfully! You now have access to the package.');
      setIsPaymentModalOpen(false);
    }, 2000);
  };

  const isCoachOrAdmin = userRole === 'coach' || userRole === 'admin';

  return (
    <div className="package-manager">
      <h2 className="text-2xl font-bold mb-6">Coaching Packages</h2>
      {isCoachOrAdmin && (
        <motion.button
          className="btn btn-primary mb-6"
          onClick={() => {
            setCurrentPackage(null);
            setIsModalOpen(true);
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <PlusCircle className="mr-2" />
          Add New Package
        </motion.button>
      )}
      <div className="package-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {packages.map(pkg => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <PackageCard
                package={pkg}
                onEdit={() => {
                  setCurrentPackage(pkg);
                  setIsModalOpen(true);
                }}
                onDelete={() => handleDeletePackage(pkg.id)}
                onClick={() => openDetailModal(pkg)}
                isCoachOrAdmin={isCoachOrAdmin}
                onPurchase={() => handlePurchase(pkg)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {isModalOpen && (
        <PackageModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={currentPackage ? handleEditPackage : handleAddPackage}
          package={currentPackage}
        />
      )}
      {isDetailModalOpen && (
        <PackageDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          package={selectedPackage}
          isCoachOrAdmin={isCoachOrAdmin}
          onPurchase={handlePurchase}
        />
      )}
      {isPaymentModalOpen && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          onProcessPayment={processPayment}
          package={selectedPackage}
        />
      )}
    </div>
  );
};

const PackageCard = ({ package: pkg, onEdit, onDelete, onClick, isCoachOrAdmin, onPurchase }) => {
  return (
    <div className="package-card bg-white rounded-lg shadow-lg overflow-hidden cursor-pointer transform transition-all duration-300 hover:shadow-xl hover:-translate-y-1" onClick={onClick}>
      <img src={pkg.image} alt={pkg.title} className="package-image w-full h-48 object-cover" />
      <div className="package-content p-4">
        <h3 className="package-title text-xl font-semibold mb-2">{pkg.title}</h3>
        <p className="package-description text-gray-600 mb-4">{pkg.description}</p>
        <p className="package-price text-2xl font-bold text-green-600 mb-4">${pkg.price}</p>
        <div className="package-files flex flex-wrap gap-2 mb-4">
          {pkg.files.slice(0, 3).map((file, index) => (
            <div key={index} className="file-preview bg-gray-100 rounded-md p-2">
              {file.type.startsWith('image/') ? (
                <img src={file.url} alt={file.name} className="w-8 h-8 object-cover" />
              ) : file.type.startsWith('video/') ? (
                <Video size={24} className="text-blue-500" />
              ) : (
                <FileText size={24} className="text-gray-500" />
              )}
            </div>
          ))}
          {pkg.files.length > 3 && (
            <div className="file-preview bg-gray-100 rounded-md p-2">
              <span className="text-gray-600">+{pkg.files.length - 3}</span>
            </div>
          )}
        </div>
        {!isCoachOrAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPurchase();
            }}
            className="btn btn-primary w-full"
          >
            Purchase Package
          </button>
        )}
      </div>
      {isCoachOrAdmin && (
        <div className="package-actions absolute top-2 right-2 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="btn btn-icon btn-secondary"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="btn btn-icon btn-danger"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

PackageCard.propTypes = {
  package: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    price: PropTypes.number.isRequired,
    image: PropTypes.string.isRequired,
    files: PropTypes.arrayOf(PropTypes.shape({
      name: PropTypes.string.isRequired,
      url: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
    })).isRequired,
  }).isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onClick: PropTypes.func.isRequired,
  isCoachOrAdmin: PropTypes.bool.isRequired,
  onPurchase: PropTypes.func.isRequired,
};

const PackageModal = ({ isOpen, onClose, onSave, package: initialPackage }) => {
  const [packageData, setPackageData] = useState(initialPackage || {
    title: '',
    description: '',
    price: 0,
    image: '',
    files: [],
  });

  PackageModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    package: PropTypes.shape({
      id: PropTypes.string,
      title: PropTypes.string,
      description: PropTypes.string,
      price: PropTypes.number,
      image: PropTypes.string,
      files: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string,
        url: PropTypes.string,
        type: PropTypes.string,
      })),
    }),
  };
  

  useEffect(() => {
    if (initialPackage) {
      setPackageData(initialPackage);
    }
  }, [initialPackage]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPackageData({ ...packageData, [name]: value });
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setPackageData({ ...packageData, files: [...packageData.files, ...files] });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(packageData);
  };

  if (!isOpen) return null;

  return (
    <div className="modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-bold mb-4">
          {initialPackage ? 'Edit Package' : 'Create New Package'}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={packageData.title}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={packageData.description}
              onChange={handleInputChange}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              required
            ></textarea>
          </div>
          <div className="mb-4">
            <label htmlFor="price" className="block text-sm font-medium text-gray-700">
              Price
            </label>
            <input
              type="number"
              id="price"
              name="price"
              value={packageData.price}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="image" className="block text-sm font-medium text-gray-700">
              Package Image
            </label>
            <input
              type="file"
              id="image"
              name="image"
              accept="image/*"
              onChange={(e) => setPackageData({ ...packageData, image: e.target.files[0] })}
              className="mt-1 block w-full"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="files" className="block text-sm font-medium text-gray-700">
              Package Files
            </label>
            <input
              type="file"
              id="files"
              name="files"
              multiple
              onChange={handleFileChange}
              className="mt-1 block w-full"
            />
          </div>
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              {initialPackage ? 'Update Package' : 'Create Package'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PackageDetailModal = ({ isOpen, onClose, package: pkg, isCoachOrAdmin, onPurchase }) => {
  if (!isOpen || !pkg) return null;

  return (
    <div className="modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-bold mb-4">{pkg.title}</h3>
        <img src={pkg.image} alt={pkg.title} className="w-full h-64 object-cover rounded-lg mb-4" />
        <p className="text-gray-600 mb-4">{pkg.description}</p>
        <p className="text-2xl font-bold text-green-600 mb-4">${pkg.price}</p>
        <h4 className="text-xl font-semibold mb-2">Included Files:</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {pkg.files.map((file, index) => (
            <div key={index} className="file-item bg-gray-100 rounded-md p-4 flex items-center">
              {file.type.startsWith('image/') ? (
                <img src={file.url} alt={file.name} className="w-12 h-12 object-cover mr-4" />
              ) : file.type.startsWith('video/') ? (
                <Video size={32} className="text-blue-500 mr-4" />
              ) : (
                <FileText size={32} className="text-gray-500 mr-4" />
              )}
              <span className="text-sm text-gray-600">{file.name}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Close
          </button>
          {!isCoachOrAdmin && (
            <button
              onClick={() => {
                onClose();
                onPurchase();
              }}
              className="btn btn-primary"
            >
              Purchase Package
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

PackageDetailModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  package: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    price: PropTypes.number.isRequired,
    image: PropTypes.string.isRequired,
    files: PropTypes.arrayOf(PropTypes.shape({
      name: PropTypes.string.isRequired,
      url: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
    })).isRequired,
  }),
  isCoachOrAdmin: PropTypes.bool.isRequired,
  onPurchase: PropTypes.func.isRequired,
};


const PaymentModal = ({ isOpen, onClose, onProcessPayment, package: pkg }) => {
  const [paymentDetails, setPaymentDetails] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
  });

  PaymentModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onProcessPayment: PropTypes.func.isRequired,
    package: PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      price: PropTypes.number.isRequired,
    }).isRequired,
  };
  

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPaymentDetails({ ...paymentDetails, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onProcessPayment(paymentDetails);
  };

  if (!isOpen || !pkg) return null;

  return (
    <div className="modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-content bg-white rounded-lg p-8 max-w-md w-full">
        <h3 className="text-2xl font-bold mb-4">Payment for {pkg.title}</h3>
        <p className="text-xl font-semibold mb-4">Total: ${pkg.price}</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="cardNumber" className="block text-sm font-medium text-gray-700">
              Card Number
            </label>
            <input
              type="text"
              id="cardNumber"
              name="cardNumber"
              value={paymentDetails.cardNumber}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="expiryDate" className="block text-sm font-medium text-gray-700">
              Expiry Date
            </label>
            <input
              type="text"
              id="expiryDate"
              name="expiryDate"
              value={paymentDetails.expiryDate}
              onChange={handleInputChange}
              placeholder="MM/YY"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="cvv" className="block text-sm font-medium text-gray-700">
              CVV
            </label>
            <input
              type="text"
              id="cvv"
              name="cvv"
              value={paymentDetails.cvv}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              required
            />
          </div>
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              Process Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PackageManager;