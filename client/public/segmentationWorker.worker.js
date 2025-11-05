/* eslint-disable no-undef */
/* eslint-disable no-restricted-globals */

/* 
 * Using TensorFlow.js and BodyPix under Apache License 2.0
 * Copyright 2022 Google LLC. See http://www.apache.org/licenses/LICENSE-2.0
 */

//console.log('[SegmentationWorker] Worker script started', { timestamp: Date.now() });

try {
  //console.log('[SegmentationWorker] Loading scripts');
  importScripts(
    'http://localhost:3000/tfjs/tf-core.min.js',
    'http://localhost:3000/tfjs/tf-converter.min.js',
    'http://localhost:3000/tfjs/tf-backend-webgl.min.js',
    'http://localhost:3000/tfjs/body-pix.min.js'
  );
  /*console.log('[SegmentationWorker] Scripts loaded', { 
    tfExists: typeof tf !== 'undefined', 
    bodyPixExists: typeof bodyPix !== 'undefined',
    tfVersion: tf?.version_core || 'unknown',
    tfConverterVersion: tf?.version_converter || 'unknown',
    tfBackendWebGLVersion: tf?.version_backend_webgl || 'unknown',
    bodyPixLoadExists: typeof bodyPix?.load === 'function'
  });*/
} catch (error) {
  console.error('[SegmentationWorker] Script loading failed', { error: error.message });
  self.postMessage({ type: 'error', data: 'Script loading failed: ' + error.message });
  throw error;
}

let net;
let lastLoggedFrameId = null;

self.onmessage = async (event) => {
  const { type, frameId } = event.data;

  // Log 'Received message' only every 10th frame
  if (!lastLoggedFrameId || parseInt(frameId) % 50 === 0) {
   // console.log('[SegmentationWorker] Received message', { type, frameId });
  }

  if (type === 'init') {
    try {
      //console.log('[SegmentationWorker] Initializing WebGL backend');
      await tf.setBackend('webgl');
      await tf.ready();
      //console.log('[SegmentationWorker] WebGL backend ready', { backend: tf.getBackend() });

      /*console.log('[SegmentationWorker] Loading BodyPix model', { 
        bodyPixExists: typeof bodyPix !== 'undefined',
        loadFunctionExists: typeof bodyPix?.load === 'function'
      });*/
      net = await bodyPix.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2,
      });
      //console.log('[SegmentationWorker] Model loaded');
      self.postMessage({ type: 'ready' });
    } catch (error) {
      //console.error('[SegmentationWorker] Init failed', { error: error.message, stack: error.stack });
      self.postMessage({ type: 'error', data: error.message });
    }
  } else if (type === 'segment') {
    // Log 'Processing segment message' every 10th frame
    if (!lastLoggedFrameId || parseInt(frameId) % 50 === 0) {
      /*console.log('[SegmentationWorker] Processing segment message', { 
        frameId,
        netExists: !!net,
        frameDataExists: !!event.data.data?.frame?.data,
        frameWidth: event.data.data?.frame?.width,
        frameHeight: event.data.data?.frame?.height,
        dataLength: event.data.data?.frame?.data?.length
      });*/
      lastLoggedFrameId = frameId;
    }

    if (!net) {
      console.error('[SegmentationWorker] Model not loaded');
      self.postMessage({ type: 'error', data: 'Model not loaded', frameId });
      return;
    }

    try {
      const imageData = new ImageData(
        new Uint8ClampedArray(event.data.data.frame.data),
        event.data.data.frame.width,
        event.data.data.frame.height
      );

      const startTime = performance.now();
      const segmentation = await net.segmentPerson(imageData, {
        internalResolution: 'medium',
        segmentationThreshold: 0.4,
        maxDetections: 1,
      });
      const endTime = performance.now();

      // Log 'Segmentation completed' only every 10th frame
      if (parseInt(frameId) % 50 === 0) {
        /*console.log('[SegmentationWorker] Segmentation completed', { 
          frameId, 
          segmentationExists: !!segmentation,
          segmentationWidth: segmentation?.width,
          segmentationHeight: segmentation?.height,
          personDetected: segmentation?.data?.some(value => value === 1),
          personPixelCount: segmentation?.data?.reduce((sum, val) => sum + (val === 1 ? 1 : 0), 0),
          durationMs: endTime - startTime
        });*/
      }

      self.postMessage({ type: 'segmented', segmentation, frameId });
    } catch (error) {
      console.error('[SegmentationWorker] Segmentation failed', { error: error.message, stack: error.stack });
      self.postMessage({ type: 'error', data: error.message, frameId });
    }
  }
};

console.log('[SegmentationWorker] Worker setup complete');