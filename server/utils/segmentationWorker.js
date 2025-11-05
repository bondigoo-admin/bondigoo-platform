/* eslint-disable no-undef */
/* eslint-disable no-restricted-globals */

importScripts('https://unpkg.com/@tensorflow/tfjs-core/dist/tf-core.min.js');
importScripts('https://unpkg.com/@tensorflow/tfjs-backend-webgl/dist/tf-backend-webgl.min.js');
importScripts('https://unpkg.com/@tensorflow-models/body-pix/dist/body-pix.min.js');

let model = null;

self.onmessage = async (e) => {
  const { type, data } = e.data;
  if (type === 'init') {
    try {
      await tf.setBackend('webgl');
      model = await bodyPix.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2,
      });
      self.postMessage({ type: 'ready' });
      console.info('[SegmentationWorker] Model initialized successfully');
    } catch (error) {
      console.error('[SegmentationWorker] Model initialization failed:', error);
      self.postMessage({ type: 'error', error: error.message });
    }
  } else if (type === 'segment' && model) {
    try {
      const { videoData, width, height, frameId } = data;
      const segmentation = await model.segmentPerson(
        { data: new Uint8ClampedArray(videoData), width, height },
        { internalResolution: 'medium', segmentationThreshold: 0.5, maxDetections: 1 }
      );
      self.postMessage({ type: 'segmented', segmentation, frameId }, [segmentation.data.buffer]);
      console.info('[SegmentationWorker] Segmentation completed', { frameId, width, height });
    } catch (error) {
      console.error('[SegmentationWorker] Segmentation failed:', error);
      self.postMessage({ type: 'error', error: error.message });
    }
  }
};