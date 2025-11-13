import * as bodyPix from '@tensorflow-models/body-pix';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import { logger } from '../utils/logger';
import { applyWebGLBlur } from './webglBlur.js';


// Constants for background modes
export const BACKGROUND_MODES = {
  NONE: 'none',
  BLUR: 'blur',
  CUSTOM: 'custom',
  DEBUG: 'debug',
};

// Constants for background processing status
export const BACKGROUND_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  APPLYING: 'applying',
  APPLIED: 'applied',
  ERROR: 'error'
};

// Default configuration values
export const DEFAULT_BLUR_LEVEL = 10;
export const MAX_FILE_SIZE_MB = 5;
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_READY_CHECK_INTERVAL = 100;

// Detect hardware capabilities for adaptive settings
export const detectHardwareCapabilities = () => {
  const capabilities = {
    isLowPower: false,
    maxCanvasSize: 640,
    targetFps: 15, // Reduce default FPS
    segmentationQuality: 'medium'
  };
  
  // Check for mobile devices
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    capabilities.isLowPower = true;
    capabilities.maxCanvasSize = 320; // Even smaller for mobile
    capabilities.targetFps = 10;
    capabilities.segmentationQuality = 'low';
  }
  
  return capabilities;
};

export const HARDWARE_CAPABILITIES = detectHardwareCapabilities();

// Update SEGMENTATION_CONFIG to use these settings
export const SEGMENTATION_CONFIG = {
  internalResolution: HARDWARE_CAPABILITIES.segmentationQuality,
  segmentationThreshold: 0.4,
  maxDetections: 1
};

// Initialize TensorFlow.js backend once
const initializeTensorFlow = async () => {
  try {
    await tf.setBackend('webgl');
    await tf.ready();
    window.tf = tf; // Expose to global scope for worker
    window.bodyPix = bodyPix; // Expose to global scope for worker
    logger.info('[BackgroundEffectUtility] TensorFlow.js initialized');
  } catch (error) {
    logger.error('[BackgroundEffectUtility] Failed to initialize TensorFlow.js', { error: error.message });
  }
};
// Initialize TensorFlow when this module is loaded
initializeTensorFlow();

// Class to manage BodyPix model lifecycle
class BodyPixModelManager {
  constructor() {
    this.model = null;
    this.isLoading = false;
    this.lastSegmentation = null;
    this.lastSegmentationTime = 0;
    this.segmentationHistory = []; 
    this.segmentationHistoryMaxLength = 3;
    this.frameTimeHistory = [];
    this.lastFrameTime = 0;
    this.maxFrameTimeHistoryLength = 30;
    this.adaptiveQualityEnabled = true;
  }

  async loadModel() {
    if (this.model || this.isLoading) return this.model;
    
    try {
      this.isLoading = true;
      
      // Check for cached model URL
      const cachedModelUrl = localStorage.getItem('bodypix-model-url');
      
      // Use a more optimized model configuration for real-time processing
      this.model = await bodyPix.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: HARDWARE_CAPABILITIES.isLowPower ? 0.5 : 0.75,
        quantBytes: 2,
        modelUrl: cachedModelUrl || undefined
      });
      
      // Cache model URL for faster loading next time
      if (!cachedModelUrl && this.model.modelUrl) {
        localStorage.setItem('bodypix-model-url', this.model.modelUrl);
      }
      
      logger.info('[BackgroundEffectUtility] BodyPix model loaded successfully');
      this.isLoading = false;
      return this.model;
    } catch (error) {
      logger.error('[BackgroundEffectUtility] Failed to load BodyPix model', { error: error.message });
      this.isLoading = false;
      throw error;
    }
  }

  async segmentPerson(video) {
    const net = await this.loadModel();
    if (!net) throw new Error('BodyPix model not loaded');
  
    // Optimized config for maximum precision
    const config = {
      internalResolution: 'high',
      segmentationThreshold: 0.4,
      maxDetections: 1,
      scoreThreshold: 0.3
    };
  
    const segmentation = await net.segmentPerson(video, config);
    return segmentation;
  }

  smoothSegmentations() {
    if (this.segmentationHistory.length < 2) return this.segmentationHistory[0];
    
    const currentSegmentation = this.segmentationHistory[this.segmentationHistory.length - 1];
    const smoothedSegmentation = {
      ...currentSegmentation,
      data: new Uint8Array(currentSegmentation.data)
    };
    
    const weights = this.segmentationHistory.length >= 3 ? [0.7, 0.2, 0.1] : [0.8, 0.2];
    
    for (let i = 0; i < smoothedSegmentation.data.length; i++) {
      let weightedSum = 0;
      let totalWeight = 0;
      
      for (let j = 0; j < Math.min(weights.length, this.segmentationHistory.length); j++) {
        const historyIndex = this.segmentationHistory.length - 1 - j;
        if (historyIndex >= 0 && this.segmentationHistory[historyIndex].data.length > i) {
          weightedSum += this.segmentationHistory[historyIndex].data[i] * weights[j];
          totalWeight += weights[j];
        }
      }
      
      const normalizedValue = weightedSum / totalWeight;
      smoothedSegmentation.data[i] = normalizedValue > 0.4 ? 1 : 0;
    }
    
    return smoothedSegmentation;
  }

  updateAdaptiveQuality() {
    if (this.frameTimeHistory.length < 10) return;
    
    const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
    
    if (avgFrameTime > 50 && !HARDWARE_CAPABILITIES.isLowPower) {
      HARDWARE_CAPABILITIES.isLowPower = true;
      HARDWARE_CAPABILITIES.maxCanvasSize = 480;
      HARDWARE_CAPABILITIES.targetFps = 15;
      HARDWARE_CAPABILITIES.segmentationQuality = 'low';
      
      logger.info('[BackgroundEffectUtility] Downgraded to low power mode due to performance', { avgFrameTime });
    }
  }

  disposeModel() {
    if (this.model) {
      try {
        this.model.dispose();
        logger.info('[BackgroundEffectUtility] BodyPix model disposed');
      } catch (err) {
        logger.error('[BackgroundEffectUtility] Error disposing BodyPix model', { error: err.message });
      }
      this.model = null;
      this.lastSegmentation = null;
      this.lastSegmentationTime = 0;
      this.segmentationHistory = [];
    }
  }
}

// Create a singleton instance of the model manager
export const bodyPixManager = new BodyPixModelManager();

/**
 * Checks if a video element is ready for processing
 * @param {HTMLVideoElement} videoElement - The video element to check
 * @returns {boolean} - Whether the video is ready
 */
export const checkVideoReady = (videoElement) => {
  if (!videoElement) return false;
  
  return videoElement.readyState >= 2 && 
         videoElement.videoWidth > 10 && 
         videoElement.videoHeight > 10 &&
         !videoElement.paused;
};

/**
 * Ensures a video element is ready for processing
 * @param {HTMLVideoElement} videoEl - The video element to prepare
 * @param {MediaStream} stream - The media stream to attach
 * @returns {Promise<boolean>} - Resolves when video is ready or times out
 */
export const ensureVideoReady = (videoEl, stream) => {
  return new Promise((resolve, reject) => {
    if (!videoEl || !stream) {
      logger.error('[BackgroundEffectUtility] Missing video element or stream', { videoEl: !!videoEl, stream: !!stream });
      reject(new Error('Missing video element or stream'));
      return;
    }

    if (videoEl.srcObject !== stream) {
      logger.info('[BackgroundEffectUtility] Setting video srcObject', { streamId: stream.id });
      videoEl.srcObject = stream;
    }

    // [UPDATED] Enforce > 10 dimensions
    if (videoEl.readyState >= 2 && videoEl.videoWidth > 10 && videoEl.videoHeight > 10) {
      logger.info('[BackgroundEffectUtility] Video already ready', { readyState: videoEl.readyState, width: videoEl.videoWidth, height: videoEl.videoHeight });
      resolve(true);
      return;
    }

    let isResolved = false;
    let videoReadyTimeout;

    const handleReady = () => {
      if (isResolved) return;
      if (videoEl.readyState >= 2 && videoEl.videoWidth > 10 && videoEl.videoHeight > 10) {
        isResolved = true;
        clearTimeout(videoReadyTimeout);
        videoEl.removeEventListener('loadeddata', handleReady);
        videoEl.removeEventListener('canplay', handleReady);
        logger.info('[BackgroundEffectUtility] Video successfully readied', {
          videoWidth: videoEl.videoWidth,
          videoHeight: videoEl.videoHeight,
          readyState: videoEl.readyState,
        });
        resolve(true);
      }
    };

    videoReadyTimeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        videoEl.removeEventListener('loadeddata', handleReady);
        videoEl.removeEventListener('canplay', handleReady);
        logger.warn('[BackgroundEffectUtility] Video ready timeout - continuing with best effort', {
          readyState: videoEl.readyState,
          videoWidth: videoEl.videoWidth,
          videoHeight: videoEl.videoHeight,
        });
        resolve(false);
      }
    }, 3000);

    videoEl.addEventListener('loadeddata', handleReady);
    videoEl.addEventListener('canplay', handleReady);

    if (videoEl.paused) {
      setTimeout(() => {
        logger.info('[BackgroundEffectUtility] Attempting to play video');
        videoEl.play().catch((err) => {
          logger.warn('[BackgroundEffectUtility] Initial play failed, continuing anyway', { error: err.message });
          if (!isResolved) handleReady();
        });
      }, 100); // Delay to ensure srcObject is set
    } else {
      handleReady();
    }
  });
};

/**
 * Compress image for upload or processing
 * @param {File} file - Image file to compress
 * @returns {Promise<string>} - Data URL of compressed image
 */
export const compressImage = (file) => {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const maxDimension = 1280;
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height *= maxDimension / width;
          width = maxDimension;
        } else if (height > maxDimension) {
          width *= maxDimension / height;
          height = maxDimension;
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
    };
    reader.readAsDataURL(file);
  });
};

/**
 * Apply box blur to a binary mask to create a soft transition
 * @param {Uint8Array} maskData - Binary mask data (0 or 1)
 * @param {number} width - Width of the mask
 * @param {number} height - Height of the mask
 * @param {number} radius - Blur radius
 * @param {number} passes - Number of blur passes for Gaussian approximation
 * @returns {Float32Array} Blurred mask with values between 0 and 1
 */

/**
 * Helper function to get canvas context with retries
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {number} attempts - Number of retry attempts
 * @param {number} delay - Delay between retries in ms
 * @returns {Promise<CanvasRenderingContext2D>} The canvas context
 */
async function getCanvasContext(canvas, attempts = 5, delay = 100) {
  for (let i = 0; i < attempts; i++) {
    try {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        return context;
      }
      logger.warn('[BackgroundProcessor] Canvas context not available, retrying', { attempt: i + 1 });
    } catch (error) {
      logger.error('[BackgroundProcessor] Error getting canvas context', { error: error.message, attempt: i + 1 });
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error('Failed to get canvas context after multiple attempts');
}

/**
 * Background effect processor class
 * Manages applying background effects to video streams
 */
export class BackgroundProcessor {
  constructor() {
    // Core video and canvas refs
    this.videoElement = null;
    this.hiddenCanvas = null;
    this.outputCanvas = null;
    this.hiddenContext = null;
    this.outputContext = null;
    this.bufferCanvas = null;
    this.bufferContext = null;
    
    // Current state
    this.backgroundSettings = {
      mode: BACKGROUND_MODES.NONE,
      customBackground: null,
      blurLevel: DEFAULT_BLUR_LEVEL
    };
    this.originalStream = null;
    this.processedStream = null;
    
    // Processing state
    this.animationFrameId = null;
    this.processingLock = false;
    this.backgroundImage = null;
    this.debouncedBlurLevel = DEFAULT_BLUR_LEVEL;
    this.stableBlurLevel = DEFAULT_BLUR_LEVEL;
    this.blurLevelTimeout = null;
    
    // Callbacks
    this.onStatusChange = null;
    this.onStreamChange = null;
  
    this.frameTimeHistory = [];
    this.maxFrameTimeHistoryLength = 30;
    this.lastFrameTime = 0;
    this.adaptiveQualityEnabled = true;
  
    // Web Worker for segmentation
    this.worker = null;
    this.pendingFrames = new Map();
    
    this.setupWorker(); // Initialize worker once
    
    // Default onStatusChange to handle strings
    this.onStatusChange = this.onStatusChange || ((status) => logger.debug('[BackgroundProcessor] Status changed', status));
  }

  setupBufferCanvas() {
    if (!this.bufferCanvas) {
      this.bufferCanvas = document.createElement('canvas');
      this.bufferCanvas.width = this.outputCanvas.width || 640;
      this.bufferCanvas.height = this.outputCanvas.height || 480;
      this.bufferContext = this.bufferCanvas.getContext('2d', { willReadFrequently: true });
      logger.info('[BackgroundProcessor] Buffer canvas initialized', {
        width: this.bufferCanvas.width,
        height: this.bufferCanvas.height,
      });
    }
  }

  /** 
   * Set up the Web Worker for segmentation
   */
  async setupWorker() {
    if (this.workerSetupPromise) {
      return this.workerSetupPromise; // Wait for ongoing setup
    }
    this.workerSetupPromise = (async () => {
      try {
        if (this.worker && this.worker.ready) {
          logger.info('[BackgroundProcessor] Worker already active and ready, skipping setup');
          return;
        }
        if (this.worker) {
          logger.warn('[BackgroundProcessor] Terminating old worker instance');
          this.worker.terminate();
          await new Promise(resolve => setTimeout(resolve, 200)); // Increase delay to 200ms
          this.worker = null;
        }
        logger.info('[BackgroundProcessor] Creating new worker', { timestamp: Date.now() });
        this.worker = new Worker('/segmentationWorker.worker.js', { name: 'segmentationWorker' });
        this.worker.ready = false;
  
        return new Promise((resolve) => {
          this.worker.onmessage = (event) => {
            if (event.data.type === 'ready') {
              logger.info('[BackgroundProcessor] Worker ready');
              this.worker.ready = true;
              this.worker.onmessage = this.handleWorkerMessage.bind(this);
              resolve();
            } else if (event.data.type === 'error') {
              logger.error('[BackgroundProcessor] Worker init error', { error: event.data.data });
              resolve();
            }
          };
          this.worker.postMessage({ type: 'init' });
        });
      } catch (error) {
        logger.error('[BackgroundProcessor] Failed to setup worker', { error: error.message });
        this.onStatusChange({ status: BACKGROUND_STATUS.ERROR, error: error.message });
        setTimeout(() => this.setupWorker(), 1000);
      } finally {
        this.workerSetupPromise = null; // Clear the lock
      }
    })();
    return this.workerSetupPromise;
  }

  /**
   * Handle messages from the Web Worker
   * @param {MessageEvent} event - The message event from the worker
   */
  handleWorkerMessage(event) {
    const { type, segmentation, frameId, error } = event.data;
    logger.info('[BackgroundProcessor] Received message from worker', { 
      type, 
      frameId, 
      hasSegmentation: !!segmentation, 
      error: error || null,
      pendingFramesCount: this.pendingFrames.size 
    });
  
    if (type === 'ready') {
      logger.info('[BackgroundProcessor] Worker is ready', { timestamp: Date.now() });
      this.worker.ready = true; // Add readiness flag
      this.onStatusChange({ status: BACKGROUND_STATUS.IDLE, error: null });
    } else if (type === 'segmented' && frameId && segmentation) {
      if (this.pendingFrames.has(frameId)) {
        logger.info('[BackgroundProcessor] Processing segmentation for frame', { 
          frameId, 
          width: segmentation.width, 
          height: segmentation.height 
        });
        this.processSegmentation(segmentation);
        this.pendingFrames.delete(frameId);
      } else {
        logger.warn('[BackgroundProcessor] Frame ID not in pending frames', { frameId });
      }
    } else if (type === 'error') {
      logger.error('[BackgroundProcessor] Worker error', { 
        error, 
        stack: event.data.stack || 'No stack provided' 
      });
      this.onStatusChange({ status: BACKGROUND_STATUS.ERROR, error });
    } else {
      logger.warn('[BackgroundProcessor] Unknown message type received', { type });
    }
  }

  /**
   * Process segmentation data from the worker
   * @param {Object} segmentation - Segmentation data from the worker
   */
  processSegmentation(segmentation) {
    if (!segmentation || !this.hiddenContext || !this.outputContext || !this.bufferContext) {
      logger.warn('[BackgroundProcessor] Cannot process segmentation - missing resources', {
        hasSegmentation: !!segmentation,
        hasHiddenContext: !!this.hiddenContext,
        hasOutputContext: !!this.outputContext,
        hasBufferContext: !!this.bufferContext
      });
      return;
    }
  
    const { width, height, data } = segmentation;
    if (width !== this.hiddenCanvas.width || height !== this.hiddenCanvas.height) {
      logger.warn('[BackgroundProcessor] Segmentation dimensions mismatch', { 
        segWidth: width, 
        segHeight: height, 
        canvasWidth: this.hiddenCanvas.width, 
        canvasHeight: this.hiddenCanvas.height 
      });
      return;
    }
  
    logger.info('[BackgroundProcessor] Processing segmentation', { 
      width, 
      height, 
      dataLength: data.length,
      personPixelCount: data.reduce((sum, val) => sum + (val === 1 ? 1 : 0), 0),
      backgroundPixelCount: data.reduce((sum, val) => sum + (val === 0 ? 1 : 0), 0)
    });
  
    // Clear canvases
    this.bufferContext.clearRect(0, 0, width, height);
    this.outputContext.clearRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);
  
    // Create mask canvas
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskContext = maskCanvas.getContext('2d');
    const maskImageData = maskContext.createImageData(width, height);
    for (let i = 0; i < data.length; i++) {
      const offset = i * 4;
      maskImageData.data[offset + 3] = data[i] === 1 ? 255 : 0;
    }
    maskContext.putImageData(maskImageData, 0, 0);
  
    // Create person canvas
    const personCanvas = document.createElement('canvas');
    personCanvas.width = width;
    personCanvas.height = height;
    const personContext = personCanvas.getContext('2d');
    personContext.drawImage(this.hiddenCanvas, 0, 0, width, height);
    personContext.globalCompositeOperation = 'destination-in';
    personContext.drawImage(maskCanvas, 0, 0);
    personContext.globalCompositeOperation = 'source-over';
  
    // Apply background effect
    if (this.backgroundSettings.mode === BACKGROUND_MODES.BLUR) {
      logger.info('[BackgroundProcessor] Applying blur effect', { blurLevel: this.stableBlurLevel });
      this.bufferContext.filter = `blur(${this.stableBlurLevel}px)`;
      this.bufferContext.drawImage(this.hiddenCanvas, 0, 0, width, height);
      this.bufferContext.filter = 'none';
      this.bufferContext.drawImage(personCanvas, 0, 0);
    } else if (this.backgroundSettings.mode === BACKGROUND_MODES.CUSTOM && this.backgroundImage) {
      logger.info('[BackgroundProcessor] Applying custom background', { 
        imageWidth: this.backgroundImage.width, 
        imageHeight: this.backgroundImage.height 
      });
      this.bufferContext.drawImage(this.backgroundImage, 0, 0, width, height);
      this.bufferContext.drawImage(personCanvas, 0, 0);
    } else {
      this.bufferContext.drawImage(this.hiddenCanvas, 0, 0, width, height);
    }
  
    // Render to output canvas
    this.outputContext.drawImage(this.bufferCanvas, 0, 0);
    logger.info('[BackgroundProcessor] Rendered to output canvas', { timestamp: Date.now() });
  
    // Cleanup
    maskCanvas.width = 0;
    personCanvas.width = 0;
  }

  setupDoubleBuffer() {
    if (!this.bufferCanvas) {
      this.bufferCanvas = document.createElement('canvas');
      this.bufferCanvas.width = this.outputCanvas.width || 640;
      this.bufferCanvas.height = this.outputCanvas.height || 480;
      this.bufferContext = this.bufferCanvas.getContext('2d', { willReadFrequently: true });
    } else {
      this.bufferCanvas.width = this.outputCanvas.width;
      this.bufferCanvas.height = this.outputCanvas.height;
    }
  }

  startAnimation() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    const animate = async () => {
      try {
        if (this.videoElement && this.hiddenContext) {
          this.hiddenContext.drawImage(
            this.videoElement, 
            0, 0, 
            this.hiddenCanvas.width, 
            this.hiddenCanvas.height
          );
          
          if (this.backgroundSettings.mode === BACKGROUND_MODES.BLUR) {
            // Apply blur effect (existing code remains unchanged)
          } else if (this.backgroundSettings.mode === BACKGROUND_MODES.CUSTOM) {
            // Apply custom background (existing code remains unchanged)
          }
        }
      } catch (err) {
        console.error('[BackgroundProcessor] Animation error:', err);
      }
      
      this.animationFrameId = requestAnimationFrame(animate);
    };
    
    this.animationFrameId = requestAnimationFrame(animate);
    logger.info('[BackgroundProcessor] Animation loop started explicitly');
  }

  updateAdaptiveQuality() {
    if (this.frameTimeHistory.length < 10) return;
    
    const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
    
    if (avgFrameTime > 50 && !HARDWARE_CAPABILITIES.isLowPower) {
      HARDWARE_CAPABILITIES.isLowPower = true;
      HARDWARE_CAPABILITIES.maxCanvasSize = 480;
      HARDWARE_CAPABILITIES.targetFps = 15;
      HARDWARE_CAPABILITIES.segmentationQuality = 'low';
      
      logger.info('[BackgroundEffectUtility] Downgraded to low power mode due to performance', { avgFrameTime });
      this.updateCanvasDimensions();
    }
  }  

  /**
   * Initialize the processor with required elements
   * @param {Object} config - Configuration object
   * @returns {Promise<void>}
   */
  async initialize(config) {
    const { videoElement, hiddenCanvas, outputCanvas, originalStream, onStatusChange, onStreamChange } = config;
  
    this.videoElement = videoElement;
    this.hiddenCanvas = hiddenCanvas;
    this.outputCanvas = outputCanvas;
    this.originalStream = originalStream;
    this.onStatusChange = onStatusChange || ((status) => logger.debug('[BackgroundProcessor] Status changed', status));
    this.onStreamChange = onStreamChange || ((stream) => logger.debug('[BackgroundProcessor] Stream changed', { hasStream: !!stream }));
  
    if (!this.videoElement || !this.hiddenCanvas || !this.outputCanvas) {
      throw new Error('Missing required elements');
    }
  
    try {
      // Set initial canvas dimensions to match segmentation resolution
      this.hiddenCanvas.width = 640;
      this.hiddenCanvas.height = 360; // Changed from 480 to match segmentation resolution
      this.outputCanvas.width = 640;
      this.outputCanvas.height = 360; // Changed from 480 to match segmentation resolution
  
      this.hiddenContext = await getCanvasContext(this.hiddenCanvas);
      this.outputContext = await getCanvasContext(this.outputCanvas);
  
      this.hiddenContext.clearRect(0, 0, this.hiddenCanvas.width, this.hiddenCanvas.height);
      this.outputContext.clearRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);
  
      logger.info('[BackgroundEffectUtility] Canvas contexts successfully initialized', {
        hiddenCanvasReady: !!this.hiddenContext,
        outputCanvasReady: !!this.outputContext
      });
    } catch (err) {
      logger.error('[BackgroundEffectUtility] Failed to initialize canvases', { error: err.message });
      throw err;
    }
  
    if (this.backgroundSettings.mode === BACKGROUND_MODES.NONE) {
      this.processedStream = originalStream;
      this.onStreamChange(originalStream);
    }
  
    logger.info('[BackgroundProcessor] Initialized with original stream', {
      streamId: originalStream?.id,
      videoTracks: originalStream?.getVideoTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState })),
      audioTracks: originalStream?.getAudioTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState })),
    });
  
    // Ensure the worker is set up only if not already active
    if (!this.worker || !this.worker.ready) {
      await this.setupWorker();
    }
  
    return bodyPixManager.loadModel();
  }

  /**
   * Update canvas dimensions based on video
   */
  updateCanvasDimensions() {
    if (!this.videoElement || !this.hiddenCanvas || !this.outputCanvas) {
      logger.warn('[BackgroundEffectUtility] Cannot update canvas dimensions, missing elements');
      return;
    }
  
    const videoWidth = this.videoElement.videoWidth || 640;
    const videoHeight = this.videoElement.videoHeight || 480;
  
    let targetWidth = 640;
    let targetHeight = 360;
  
    if (this.backgroundSettings.mode !== BACKGROUND_MODES.NONE) {
      // Lower resolution for background effects
      targetWidth = 640;
      targetHeight = 360;
    } else {
      // Original resolution when no effect is applied
      targetWidth = videoWidth;
      targetHeight = videoHeight;
    }
  
    this.hiddenCanvas.width = targetWidth;
    this.hiddenCanvas.height = targetHeight;
    this.outputCanvas.width = targetWidth;
    this.outputCanvas.height = targetHeight;
  
    if (this.bufferCanvas) {
      this.bufferCanvas.width = targetWidth;
      this.bufferCanvas.height = targetHeight;
    }
  
    // Clear canvases to prevent artifacts
    if (this.hiddenContext) this.hiddenContext.clearRect(0, 0, targetWidth, targetHeight);
    if (this.outputContext) this.outputContext.clearRect(0, 0, targetWidth, targetHeight);
    if (this.bufferContext) this.bufferContext.clearRect(0, 0, targetWidth, targetHeight);
  
    logger.info('[BackgroundEffectUtility] Canvas dimensions updated', {
      width: targetWidth,
      height: targetHeight,
      mode: this.backgroundSettings.mode
    });
  }

  /**
   * Update background settings
   * @param {Object} newSettings - New background settings
   * @returns {Promise<void>}
   */
  async updateSettings(newSettings) {
    this.cleanup();
  
    // Check if blurLevel is changing
    const previousBlurLevel = this.backgroundSettings.blurLevel;
    this.backgroundSettings = {
      ...this.backgroundSettings,
      ...newSettings
    };
  
    // Update blur level if it has changed
    if (this.backgroundSettings.blurLevel !== previousBlurLevel) {
      this.updateBlurLevel(this.backgroundSettings.blurLevel);
    }
  
    this.updateCanvasDimensions(); // Ensure canvas size adjusts to new mode
  
    if (this.backgroundSettings.mode === BACKGROUND_MODES.NONE && this.originalStream) {
      if (this.processedStream) {
        this.processedStream.getVideoTracks().forEach(track => {
          if (!this.originalStream.getVideoTracks().includes(track)) {
            track.stop();
          }
        });
        this.processedStream = null;
      }
  
      this.onStreamChange(this.originalStream);
      this.onStatusChange('Idle');
      return Promise.resolve();
    }
  
    // Ensure the worker is set up and ready before applying the background effect
    if (!this.worker || !this.worker.ready) {
      await this.setupWorker();
    }
  
    return this.applyBackgroundEffect();
  }

  /**
   * Update blur level with debouncing
   * @param {number} newBlurLevel - New blur level value
   */
  updateBlurLevel(newBlurLevel) {
    logger.info('[BackgroundEffectUtility] Updating blur level', { 
      previous: this.backgroundSettings.blurLevel,
      new: newBlurLevel
    });
  
    this.backgroundSettings.blurLevel = newBlurLevel;
    this.debouncedBlurLevel = newBlurLevel;
  
    if (this.blurLevelTimeout) {
      clearTimeout(this.blurLevelTimeout);
    }
  
    this.blurLevelTimeout = setTimeout(() => {
      this.stableBlurLevel = newBlurLevel;
      logger.info('[BackgroundProcessor] Stable blur level updated', { blurLevel: this.stableBlurLevel });
    }, 300); // 300ms debounce
  }

  applyEdgeFeathering(segmentation, blurRadius = 2, passes = 2) {
    if (!segmentation || !segmentation.data) {
      logger.warn('[BackgroundEffectUtility] Cannot apply edge feathering - invalid segmentation');
      return null;
    }
  
    const width = segmentation.width || this.outputCanvas.width;
    const height = segmentation.height || this.outputCanvas.height;
  
    if (width <= 0 || height <= 0 || segmentation.data.length !== width * height) {
      logger.warn('[BackgroundEffectUtility] Invalid dimensions for edge feathering', {
        width,
        height,
        dataLength: segmentation.data.length,
        expected: width * height
      });
      return null;
    }
  
    logger.info('[BackgroundEffectUtility] Applying WebGL blur', { width, height, blurRadius });
  
    // Create temporary canvas for the mask
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskContext = maskCanvas.getContext('2d');
    const maskImageData = maskContext.createImageData(width, height);
  
    // Convert segmentation data to image data
    for (let i = 0; i < segmentation.data.length; i++) {
      const value = segmentation.data[i] * 255;
      maskImageData.data[i * 4] = value;
      maskImageData.data[i * 4 + 1] = value;
      maskImageData.data[i * 4 + 2] = value;
      maskImageData.data[i * 4 + 3] = 255;
    }
    maskContext.putImageData(maskImageData, 0, 0);
  
    // Apply WebGL blur (single pass is sufficient with shader)
    const blurredCanvas = applyWebGLBlur(maskCanvas, blurRadius);
  
    // Extract blurred data
    const blurredContext = blurredCanvas.getContext('2d');
    const blurredImageData = blurredContext.getImageData(0, 0, width, height);
    const blurredMask = new Float32Array(width * height);
  
    for (let i = 0; i < width * height; i++) {
      blurredMask[i] = blurredImageData.data[i * 4] / 255; // Normalize to 0-1
    }
  
    return {
      width,
      height,
      data: blurredMask
    };
  }

  debugSegmentation(segmentation) {
    if (!segmentation || !segmentation.data || !this.outputCanvas || !this.outputContext) {
      return;
    }
    
    const imageData = this.outputContext.createImageData(
      this.outputCanvas.width, 
      this.outputCanvas.height
    );
    
    for (let i = 0; i < segmentation.data.length; i++) {
      const offset = i * 4;
      if (segmentation.data[i] === 1) {
        imageData.data[offset] = 255;
        imageData.data[offset + 1] = 0;
        imageData.data[offset + 2] = 0;
        imageData.data[offset + 3] = 128;
      } else {
        imageData.data[offset] = 0;
        imageData.data[offset + 1] = 0;
        imageData.data[offset + 2] = 0;
        imageData.data[offset + 3] = 0;
      }
    }
    
    this.outputContext.drawImage(
      this.videoElement, 
      0, 0, 
      this.outputCanvas.width, 
      this.outputCanvas.height
    );
    
    this.outputContext.putImageData(imageData, 0, 0);
    
    logger.info('[BackgroundEffectUtility] Debug visualization enabled');
  }

  /**
   * Main method to apply background effect
   * @returns {Promise<void>}
   */
  async applyBackgroundEffect() {
    // Check and initialize canvas contexts if missing
    if (!this.hiddenContext || !this.outputContext) {
      logger.warn('[BackgroundEffectUtility] Missing canvas contexts, attempting to reinitialize');
      try {
        if (this.hiddenCanvas && !this.hiddenContext) {
          this.hiddenContext = this.hiddenCanvas.getContext('2d', { willReadFrequently: true });
        }
        if (this.outputCanvas && !this.outputContext) {
          this.outputContext = this.outputCanvas.getContext('2d', { willReadFrequently: true });
        }
        if (!this.hiddenContext || !this.outputContext) {
          this.onStatusChange({ status: BACKGROUND_STATUS.ERROR, error: 'Failed to initialize canvas contexts' });
          return Promise.resolve();
        }
      } catch (err) {
        logger.error('[BackgroundEffectUtility] Context reinitialization failed', { error: err.message });
        this.onStatusChange({ status: BACKGROUND_STATUS.ERROR, error: 'Failed to initialize canvas contexts' });
        return Promise.resolve();
      }
    }
  
    // Safety timeout to prevent hanging
    const safetyTimeoutId = setTimeout(() => {
      this.onStatusChange({ status: BACKGROUND_STATUS.IDLE, error: null });
      this.processingLock = false;
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }, 5000);
  
    // Cancel any existing animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  
    // Skip if already processing
    if (this.processingLock) {
      clearTimeout(safetyTimeoutId);
      return Promise.resolve();
    }
  
    this.processingLock = true;
  
    try {
      // Validate required resources
      if (!this.videoElement || !this.hiddenCanvas || !this.outputCanvas || !this.originalStream) {
        logger.warn('[BackgroundEffectUtility] Resources unavailable, skipping background effect', {
          hasVideo: !!this.videoElement,
          hasHiddenCanvas: !!this.hiddenCanvas,
          hasOutputCanvas: !!this.outputCanvas,
          hasStream: !!this.originalStream,
        });
        this.onStatusChange({ status: BACKGROUND_STATUS.ERROR, error: 'Missing required resources' });
        this.processingLock = false;
        clearTimeout(safetyTimeoutId);
        return Promise.resolve();
      }
  
      // Handle no-effect mode
      if (this.backgroundSettings.mode === BACKGROUND_MODES.NONE) {
        this.processedStream = this.originalStream;
        this.onStreamChange(this.originalStream);
        this.onStatusChange({ status: BACKGROUND_STATUS.IDLE, error: null });
        this.processingLock = false;
        clearTimeout(safetyTimeoutId);
        return Promise.resolve();
      }
  
      this.onStatusChange({ status: BACKGROUND_STATUS.APPLYING, error: null });
  
      // Ensure video is ready
      try {
        await ensureVideoReady(this.videoElement, this.originalStream);
        logger.info('[BackgroundEffectUtility] Video ready for background processing', {
          videoWidth: this.videoElement.videoWidth,
          videoHeight: this.videoElement.videoHeight,
          readyState: this.videoElement.readyState,
        });
      } catch (videoErr) {
        logger.error('[BackgroundEffectUtility] Failed to ready video element', { error: videoErr.message });
      }
  
      // Use updateCanvasDimensions to set canvas sizes (assuming this method exists)
      this.updateCanvasDimensions();
  
      // Initialize buffer canvas for double buffering
      if (!this.bufferCanvas) {
        this.bufferCanvas = document.createElement('canvas');
        this.bufferCanvas.width = this.outputCanvas.width;
        this.bufferCanvas.height = this.outputCanvas.height;
        this.bufferContext = this.bufferCanvas.getContext('2d', { willReadFrequently: true });
        logger.info('[BackgroundProcessor] Buffer canvas initialized', {
          width: this.bufferCanvas.width,
          height: this.bufferCanvas.height,
        });
      } else {
        this.bufferCanvas.width = this.outputCanvas.width;
        this.bufferCanvas.height = this.outputCanvas.height;
      }
  
      // Clear all canvases
      this.hiddenContext.clearRect(0, 0, this.hiddenCanvas.width, this.hiddenCanvas.height);
      this.outputContext.clearRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);
      this.bufferContext.clearRect(0, 0, this.bufferCanvas.width, this.bufferCanvas.height);
  
      logger.info('[BackgroundEffectUtility] Applying background effect', {
        canvasWidth: this.hiddenCanvas.width,
        canvasHeight: this.hiddenCanvas.height,
        mode: this.backgroundSettings.mode,
      });
  
      // Load custom background image if needed
      if (this.backgroundSettings.mode === BACKGROUND_MODES.CUSTOM && this.backgroundSettings.customBackground) {
        if (!this.backgroundImage) {
          try {
            this.onStatusChange({ status: BACKGROUND_STATUS.LOADING, error: null });
            const response = await fetch(this.backgroundSettings.customBackground, { mode: 'cors' });
            if (!response.ok) throw new Error('Failed to fetch background image');
            const blob = await response.blob();
            const objectURL = URL.createObjectURL(blob);
            this.backgroundImage = new Image();
            this.backgroundImage.src = objectURL;
            await new Promise((resolve, reject) => {
              this.backgroundImage.onload = () => {
                logger.info('[BackgroundEffectUtility] Custom background image loaded', {
                  url: this.backgroundSettings.customBackground,
                });
                resolve();
              };
              this.backgroundImage.onerror = () => {
                URL.revokeObjectURL(objectURL);
                reject(new Error('Failed to load background image'));
              };
            });
          } catch (error) {
            logger.error('[BackgroundEffectUtility] Failed to load custom background', { error: error.message });
            this.onStatusChange({ status: BACKGROUND_STATUS.ERROR, error: 'Failed to load background image' });
            this.processingLock = false;
            clearTimeout(safetyTimeoutId);
            return Promise.resolve();
          }
        }
      }
  
      // Local references for animation
      const video = this.videoElement;
      const hiddenCanvas = this.hiddenCanvas;
      const outputCanvas = this.outputCanvas;
      const hiddenContext = this.hiddenContext;
      const outputContext = this.outputContext;
      const bufferContext = this.bufferContext;
      const backgroundMode = this.backgroundSettings.mode;
      const backgroundImage = this.backgroundImage;
  
      let lastFrameSent = performance.now();
      const targetFps = HARDWARE_CAPABILITIES.targetFps || 15;
      const frameInterval = 1000 / targetFps; // e.g., 66.67ms for 15 FPS
  
      // Animation loop
      const animate = async () => {
        if (!video || !video.videoWidth || !hiddenContext || !outputContext || !bufferContext) {
          logger.error('[BackgroundEffectUtility] Animation error - missing required elements', {
            hasVideo: !!video,
            videoWidth: video?.videoWidth,
            hasHiddenContext: !!hiddenContext,
            hasOutputContext: !!outputContext,
            hasBufferContext: !!bufferContext,
          });
          if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
          }
          return;
        }
    
        try {
          hiddenContext.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
    
          if (backgroundMode !== BACKGROUND_MODES.NONE) {
            const now = performance.now();
            if (now - lastFrameSent >= frameInterval && this.pendingFrames.size < 5) {
              if (this.worker && this.worker.ready) {
                const imageData = hiddenContext.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height);
                const frame = {
                  data: imageData.data.buffer,
                  width: imageData.width,
                  height: imageData.height,
                };
                const frameId = Date.now().toString();
                this.pendingFrames.set(frameId, true);
                logger.info('[BackgroundProcessor] Sending frame to worker', { 
                  frameId, 
                  width: frame.width, 
                  height: frame.height,
                  pendingFramesCount: this.pendingFrames.size,
                  timeSinceLastFrame: now - lastFrameSent
                });
                logger.info('[BackgroundProcessor] Pending frames status', { 
                  pendingFramesCount: this.pendingFrames.size,
                  timestamp: Date.now()
                });
                this.worker.postMessage(
                  { type: 'segment', data: { frame }, frameId },
                  [frame.data]
                );
                lastFrameSent = now;
              } else {
                logger.warn('[BackgroundProcessor] Worker not ready, skipping frame');
              }
            }
          } else {
            outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
            outputContext.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height);
          }
    
          if (this.backgroundSettings.mode === backgroundMode) {
            this.animationFrameId = requestAnimationFrame(animate);
          }
        } catch (error) {
          logger.error('[BackgroundProcessor] Animation error', { error: error.message, stack: error.stack });
        }
      };
    
      this.animationFrameId = requestAnimationFrame(animate);
      this.onStatusChange({ status: BACKGROUND_STATUS.APPLIED, error: null });
    } catch (error) {
      logger.error('[BackgroundEffectUtility] Background effect application failed', {
        error: error.message,
        stack: error.stack,
      });
      this.onStatusChange({ status: BACKGROUND_STATUS.ERROR, error: error.message || 'Background effect error' });
      this.processingLock = false;
    }
  
    clearTimeout(safetyTimeoutId);
    return Promise.resolve();
  }

  ensureProcessedStream() {
    if (!this.processedStream && this.originalStream) {
      try {
        const targetFps = HARDWARE_CAPABILITIES.targetFps;
        logger.info('[BackgroundEffectUtility] Creating processed stream with target FPS', { targetFps });
        
        const newStream = this.outputCanvas.captureStream(targetFps);
        
        const audioTracks = this.originalStream.getAudioTracks();
        audioTracks.forEach(track => {
          try {
            newStream.addTrack(track);
          } catch (trackErr) {
            logger.error('[BackgroundEffectUtility] Error adding audio track', { error: trackErr.message });
          }
        });
        
        this.processedStream = newStream;
        logger.info('[BackgroundProcessor] Processed stream created', {
          streamId: newStream.id,
          videoTracks: newStream.getVideoTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState })),
          audioTracks: newStream.getAudioTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState })),
        });
        this.onStreamChange(newStream);
      } catch (err) {
        logger.error('[BackgroundEffectUtility] Failed to create processed stream', { error: err.message });
      }
    }
  }

  /**
   * Clean up resources and stop processing
   */
  cleanup() {
    if (this.blurLevelTimeout) {
      clearTimeout(this.blurLevelTimeout);
      this.blurLevelTimeout = null;
    }
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.hiddenCanvas && this.hiddenContext) {
      try {
        this.hiddenContext.clearRect(0, 0, this.hiddenCanvas.width, this.hiddenCanvas.height);
      } catch (err) {
        logger.error('[BackgroundEffectUtility] Error clearing hidden canvas', { error: err.message });
      }
    }
    
    if (this.outputCanvas && this.outputContext) {
      try {
        this.outputContext.clearRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);
      } catch (err) {
        logger.error('[BackgroundEffectUtility] Error clearing output canvas', { error: err.message });
      }
    }
    
    this.processingLock = false;
    
    if (this.backgroundImage && this.backgroundImage.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.backgroundImage.src);
      this.backgroundImage = null;
    }
    
    this.pendingFrames.clear();
  }

  /**
   * Dispose and clean up all resources
   */
  dispose() {
    this.cleanup();
    
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      logger.info('[BackgroundProcessor] Web Worker terminated');
    }
    
    this.hiddenContext = null;
    this.outputContext = null;
    this.videoElement = null;
    this.hiddenCanvas = null;
    this.outputCanvas = null;
    this.backgroundImage = null;
    this.processedStream = null;
    this.originalStream = null;
  }

  /**
   * Get the current stream (processed or original)
   * @returns {MediaStream} The current stream
   */
  getCurrentStream() {
    return this.processedStream || this.originalStream;
  }
}

/**
 * Create a background processor instance
 * @returns {BackgroundProcessor} A new background processor instance
 */
export const createBackgroundProcessor = () => {
  return new BackgroundProcessor();
};

/**
 * Hook up a background effect to a video conference
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Background processor controller
 */
export const setupBackgroundEffect = async (config) => {
  if (HARDWARE_CAPABILITIES.isLowPower) {
    HARDWARE_CAPABILITIES.maxCanvasSize = 320;
    HARDWARE_CAPABILITIES.targetFps = 10;
    SEGMENTATION_CONFIG.internalResolution = 'low';
    SEGMENTATION_CONFIG.segmentationThreshold = 0.5;
  }
  const { 
    videoElement, 
    hiddenCanvas,
    outputCanvas,
    stream, 
    backgroundSettings = { mode: BACKGROUND_MODES.NONE, blurLevel: DEFAULT_BLUR_LEVEL },
    onStreamChange = (stream) => logger.debug('[BackgroundEffect] Stream changed', { hasStream: !!stream }),
    onStatusChange = (status) => logger.debug('[BackgroundEffect] Status changed', status)
  } = config;
  
  if (!videoElement || !hiddenCanvas || !outputCanvas) {
    throw new Error('Missing required elements for background effect');
  }
  
  const processor = createBackgroundProcessor();
  
  await processor.initialize({
    videoElement,
    hiddenCanvas,
    outputCanvas,
    originalStream: stream,
    onStatusChange,
    onStreamChange
  });
  
  await processor.updateSettings(backgroundSettings);

  logger.info('[BackgroundEffectUtility] setupBackgroundEffect completed', {
    streamId: stream?.id,
    backgroundSettings,
    processedStreamId: processor.getCurrentStream()?.id,
    videoReady: videoElement?.readyState >= 2,
  });
  
  return {
    processor,
    updateSettings: (newSettings) => processor.updateSettings(newSettings),
    updateBlurLevel: (level) => processor.updateBlurLevel(level),
    getCurrentStream: () => processor.getCurrentStream(),
    cleanup: () => processor.dispose()
  };
};