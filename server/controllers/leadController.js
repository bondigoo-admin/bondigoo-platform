const Lead = require('../models/Lead');
const { validationResult } = require('express-validator');
const cloudinary = require('../utils/cloudinaryConfig');

exports.createLead = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, type, ...applicationData } = req.body;

  try {
    if (await Lead.findOne({ email })) {
      return res.status(200).json({ msg: 'Email already registered. We will keep you updated!' });
    }

    const leadPayload = { email, type, ipAddress: req.ip };

    if (type === 'coach' && Object.keys(applicationData).length > 0) {
      Object.assign(leadPayload, applicationData);

      if (req.files && req.files.length > 0) {
        // Map each file to an upload promise
        const uploadPromises = req.files.map(async (file) => {
          // Convert the buffer to a base64 Data URI
          const b64 = Buffer.from(file.buffer).toString("base64");
          const dataURI = `data:${file.mimetype};base64,${b64}`;
          
          // Upload the file to Cloudinary
          const result = await cloudinary.uploader.upload(dataURI, {
            upload_preset: 'coach_applications',
            resource_type: 'auto',
            type: 'private'
          });

          // Return the necessary information for the database
          return {
            url: result.secure_url,
            publicId: result.public_id,
            originalFilename: file.originalname,
            resourceType: result.resource_type
          };
        });

        // Wait for all uploads to complete
        const uploadedDocuments = await Promise.all(uploadPromises);
        leadPayload.uploadedDocuments = uploadedDocuments;
      }
    }

    await new Lead(leadPayload).save();
    res.status(201).json({ msg: 'Thank you! You have been added to our launch list.' });
  } catch (err) {
    console.error('Error in createLead:', err.message);
    res.status(500).send('Server Error');
  }
};